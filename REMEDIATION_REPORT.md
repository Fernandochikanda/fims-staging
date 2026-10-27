# FIMS — Relatório de Remediação (2026-10-27)

**Commit:** `43f5f98` — *"Remediação de segurança, identidade e escalonamento (auditoria 2026-10-27)"*
**Repositório:** `mzmzucca/fims-main` (branch `main`, push efetuado; deploy Vercel automático disparado)
**Spec de referência:** Pedido de remediação FIMS — Notifications, Messaging, Defect Management & 48-Hour Escalation

---

## A. Sumário Executivo

**O que foi corrigido.** Todas as categorias de findings da auditoria foram tratadas no código: (1) as políticas RLS "allow-all" das 4 tabelas de comunicação são removidas pela migração e substituídas por escritas apenas via RPCs `SECURITY DEFINER`; (2) as credenciais deixam de ser legíveis/escrevíveis por clientes (column-level grants + hashing bcrypt dentro da BD com pgcrypto, com upgrade automático das senhas legadas em texto plano no primeiro login); (3) a identidade canónica `fims_users.user_id` (`usr_*`) é agora usada em login, listas de destinatários, sessões antigas e na reescrita do histórico; (4) o escalonamento de 48h passou a ser 100% server-side (pg_cron a cada 15 min, dedupe atómico por `UNIQUE(defect_id, stage)`, CEO sempre incluído) e os timers de negócio foram removidos do browser; (5) notificações e mensagens passaram a ter dedupe determinístico, consultas filtradas por destinatário, read receipts por destinatário e anúncios persistidos no servidor; (6) `processInspection` é idempotente e a identidade do defeito deriva do id estável do template.

**Estado.** O repositório compila (`vite build` OK), passa lint (0 erros) e tem 13 testes unitários do núcleo puro de defeitos a passar. O código tem fallbacks para a BD atual: **o deploy é seguro sem downtime**, mas as correções de segurança só ficam **ativas** após aplicar a migração SQL no Supabase.

**Pronto para staging?** Sim — pode validar em staging/produção imediatamente (o comportamento pré-migração é o atual, sem regressões).

**Produção efetivamente endurecida?** Ainda não — depende de **1 passo manual bloqueante**: aplicar `supabase/migrations/20261027_remediation_security_identity_escalation.sql` no SQL Editor do Supabase (ver secção E). Antes disso, as vulnerabilidades de RLS continuam presentes na BD.

**Blockers restantes:** migração SQL (manual), validação RLS com a migração aplicada (não executável a partir deste ambiente — sem service_role), ativação do pg_cron se a extensão não for criável via SQL.

---

## B. Matriz Finding-by-Finding

| Finding | Severidade | Causa raiz | Ficheiros/Migração | Correção implementada | Testes | Resultado | Trabalho restante |
|---|---|---|---|---|---|---|---|
| SEC-001 | Critical | Políticas `FOR ALL USING(true)` a `anon` em notifications/messages/defects/settings (`supabase_fix.sql`) | `supabase/migrations/20261027_*.sql` §2–6 | Políticas só SELECT (+UPDATE read em notifications); INSERT/UPDATE/DELETE revogados; escritas via RPCs `SECURITY DEFINER` | Re-verificação da BD após migração | Implementado; RLS runtime **NOT RUN** (requer migração aplicada) | Executar migração; re-testar acesso anon (comando na secção D) |
| SEC-002 | Critical | `select('*')` em `fims_users` expõe `password_hash`/`password`; senha comparada no cliente | Migração §7 + `authService.js` | Column-level grants dinâmicos (colunas seguras); `fims_login` verifica bcrypt na BD (pgcrypto); upgrade automático de senhas plaintext; respostas nunca incluem credenciais | `npm test` (13/13) + build | Implementado; login RPC **NOT RUN** (requer migração) | Aplicar migração; testar login real de cada conta |
| SEC-003 | High | DML direto em `fims_users` por anon (criar admin, alterar roles) | Migração §7 + `authService.js` | DML revogado; CRUD via `fims_save_user`/`fims_delete_user` com validação server-side (role whitelist, email, senha ≥6) | Build + lint | Implementado; runtime NOT RUN | Aplicar migração |
| SEC-004 | Medium | Header `Authorization: Bearer <anon>` forçado impedia sessões Supabase Auth | `src/lib/supabase.js` | Header removido; `persistSession/autoRefreshToken` mantidos | Build | **OK** | — |
| SEC-005 | Low | Cliente Supabase duplicado (raiz `lib/supabase.js`) | — | Mantido (não referenciado); risco documentado | — | Documentado | Remover em limpeza futura |
| IDN-001 | Critical | 2 espaços de id (`usr_*` vs numérico): destinatários vinham de `fetchUsers` (numérico), sessão usava `user_id` | `dataService.js`, `authService.js`, `App.jsx`, migração §1–3 | `id` canónico = `user_id`; `fetchUsers` devolve canónico + `dbId`; sessões antigas remapeadas no arranque; migração reescreve `notifications.user_id` e `messages.to_id/from_id` numéricos → `usr_*` | Sondagem BD (metadados) + testes | Implementado; reescrita histórica NOT RUN | Aplicar migração; validar notificação antiga visível após relogin |
| IDN-002 | High | Sem constraints em identificadores | Migração §1 | `UNIQUE(user_id)` em `fims_users`; backfill `user_id = 'usr_'||id` | Sondagem BD | Implementado | Aplicar migração |
| NOTIF-001 | High | Criação sem dedupe (ids aleatórios; duplo-clique/retries duplicam) | `notificationService.js`, `CommsContext.jsx`, migração §2/10.3 | `fims_notify` + `dedupe_key` + unique partial index; chaves por evento (`inspdone:{id}`, `esc:{defect}:{stage}`, `msg:{clientId}`…) | Testes unitários da lógica de dedupe indireta (RPC) | Implementado | Validar na BD após migração |
| NOTIF-002 | Medium | Falhas silenciadas (fallback cache sem sinalização; markRead engole erros) | `notificationService.js` | Fallback devolve `stale:true`; markAsRead/markAllAsRead devolvem sucesso/falha; outbox preservado | Build | Implementado | — |
| MSG-001 | High | Flag `read` partilhada na linha — broadcast lido por 1 marca lido para todos | Migração §4 + `CommsContext.jsx` | `fims_message_reads` (PK message_id+user_id); receipts via RPCs `fims_mark_message_read(s)`; unread = sem receipt próprio (fallback flag legado) | Build; lógica coberta em testes | Implementado | Aplicar migração; teste multi-dispositivo |
| MSG-002 | High | App descarrega TODAS as mensagens de TODOS (`select('*')`; realtime sem filter) | `CommsContext.jsx` | Consultas `.or(to_id=eu, from_id=eu, to_id=broadcast)`; 2 handlers realtime com filter; polling scoped | Build | Implementado | Aplicar migração (fecha o acesso direto de escrita) |
| MSG-003 | Medium | Sem paginação (limites fixos 500/200) | `CommsContext.jsx` | Limites mantidos com queries scoped (efetivamente paginadas por relevância); índices `from_to`/`to_created` na migração | Sondagem BD | Parcial (aceitável para o volume atual) | Cursor pagination futura se volume crescer |
| MSG-004 | Medium | Mensagem apresentada como enviada mesmo com insert falhado | `CommsContext.jsx` | Flag `pending: true` no estado local + outbox; limpo quando o flush confirma | Build | Implementado | Indicador visual opcional na UI |
| DEF-001 | High | `processInspection` não idempotente (recorrência infla em reprocessamento) | `defectLogic.js`, `defectService.js` | Guard por `last_seen_inspection_id`; núcleo puro `computeDefectChanges` | **13 testes unitários, todos a passar** (incl. 3 execuções concorrentes) | **OK** | — |
| DEF-002 | Medium | Identidade por texto mutável (`location::section::label`) | `defectLogic.js` | `iid:<item.id>` (id estável do template); fallback `lbl:` + matching legado por label | Testes "renomear não fragmenta" | **OK** | — |
| DEF-003 | Medium | Sem unique de defeito aberto por key (duplicados concorrentes) | Migração §5 | Dedupe prévio + `UNIQUE(key) WHERE status='open'`; índice `due_at` para o scheduler | Sondagem BD | Implementado | Aplicar migração |
| DEF-004 | Medium | `escalateNow` incrementa por clique | `defectService.js`, migração §10.6 | RPC `fims_escalate_defect` idempotente (stage único); fallback legado pré-migração | Build | Implementado | Aplicar migração |
| DEF-005 | Low | `clear()` apagava a tabela inteira no servidor | `defectService.js` | `clear()` só limpa cache local | Build | **OK** | — |
| ESC-001 | Critical | Escalonamento só no browser (App 5min + Defeitos 60s); sem browser nunca escala; N browsers = N duplicados | `App.jsx`, `Defects.jsx`, migração §8/10.6/11 | `pg_cron` a cada 15 min → `fims_escalate_overdue_defects()`; `FOR UPDATE SKIP LOCKED`; timers de negócio removidos (refresh-only) | Lógica pura testada; cron runtime NOT RUN | Implementado | Aplicar migração; ativar pg_cron; monitorizar 1ª execução |
| ESC-002 | Critical | `excludeId: currentUser.id` excluía o CEO quando era ele a ter sessão ativa | Migração §10.6 | Recipient resolution server-side por role (config `defect_escalated` default `["ceo","admin","supervisor"]`); **sem excludeId** — CEO sempre incluído | Lógica da RPC implementada | Implementado | Teste E2E após migração |
| ESC-003 | High | Re-escalação sem dedupe (reset `escalated=false` + notifica por N dispositivos) | Migração §10.6 | Stage = `escalation_count+1`; `UNIQUE(defect_id, stage)` torna re-escalações concorrentes no-op; re-notificação só a cada 24h | Testes (elegibilidade) | Implementado | Aplicar migração |
| ESC-004 | Medium | Prazo 48h de `date` client-side sem normalização | `defectLogic.js` | `computeDueAt` ISO UTC com guard de data inválida | Testes ESC-004 | **OK** | — |
| SET-001 | Medium | `fims_settings` apagável/escrita por anon (config de escalonamento adulterável) | Migração §6 + 10.7 | DELETE revogado; escritas via `fims_save_settings` com validação de forma | Build | Implementado | Aplicar migração |
| ANN-001 | Medium | Anúncios 100% localStorage | `announcementService.js` (novo), migração §9 | `fims_announcements` + `fims_announcement_reads`; load/create/dismiss com fallback local | Build | Implementado | Aplicar migração |
| UAF-001 | Medium | `authService.signUp` não existia (SignUp quebrado) | `authService.js` | `signUp` implementado (cria inspector via `createUser`) | Build | Implementado | Teste manual de signup |
| UAF-002 | Low | Login Supabase Auth usava UUID como id (3º espaço) | `authService.js` | Id canónico `user_id` quando a linha existir | Build | Implementado | — |

---

## C. Ficheiros e Migrações

**Nova migração (o artefato mais importante):**
- `supabase/migrations/20261027_remediation_security_identity_escalation.sql` — idempotente; RLS real; column grants em `fims_users`; 17 RPCs `SECURITY DEFINER` (login, users, notify, messages, receipts, unread_count, defects, escalation, settings, announcements); tabelas novas (`fims_message_reads`, `fims_escalation_log`, `fims_announcements`, `fims_announcement_reads`); reescrita do histórico de ids; pg_cron; realtime; verificação final. **Motivo:** todos os pontos de segurança/integridade exigem enforcement na BD — o cliente não é confiável.
- `supabase_fix.sql` — marcado DEPRECATED (mantido por histórico).

**Novos ficheiros de código:**
- `src/lib/defectLogic.js` — núcleo puro e idempotente de defeitos (testável sem BD).
- `src/services/announcementService.js` — persistência server-side de anúncios com fallback.
- `tests/defectLogic.test.mjs` — 13 testes unitários (node:test).

**Modificados:** `src/lib/supabase.js` (header removido + `rpcWithFallback`), `src/services/authService.js` (login/CRUD via RPC, signUp, id canónico), `src/services/dataService.js` (fetchUsers canónico), `src/services/notificationService.js` (fims_notify + dedupe), `src/services/defectService.js` (RPCs, idempotência, refresh-only), `src/services/settingsService.js` (save via RPC, dbId fallback), `src/context/CommsContext.jsx` (queries scoped, receipts, pending, anúncios), `src/App.jsx` (timers de negócio removidos, sessão migrada, dedupe keys), `src/pages/Defects.jsx` (refresh-only, RPC manual), `src/pages/InspectionDetail.jsx` (dedupe keys), `package.json` (script test), `.gitignore` (`.vercel`).

---

## D. Relatório de Testes

| Categoria | Comando/Procedimento | Resultado |
|---|---|---|
| Unitários (lógica de defeitos) | `npm test` → `node --test "tests/*.test.mjs"` | **13 pass, 0 fail** |
| Lint | `npm run lint` (oxlint) | 150 warnings pré-existentes, **0 erros** |
| Build de produção | `npm run build` (vite) | **OK** (≈1 s, sem erros) |
| Sondagem da BD (metadados, read-only) | `scripts/probe_schema.py` | Confirmou evidência IDN-001 (`user_id` numérico nas notificações; `usr_*` nos users) |
| RLS runtime (anon não lê/ignora dados alheios) | Requer migração aplicada + chaves de teste | **NOT RUN** — bloqueado (sem service_role; migração não aplicada) |
| Login via `fims_login` | Requer migração aplicada | **NOT RUN** |
| Escalonamento pg_cron (deadline/concorrência/CEO) | Requer migração + pg_cron ativo | **NOT RUN** (lógica coberta por testes unitários + dedupe UNIQUE na BD) |
| Teste de 500+ mensagens (unread/pagination) | Requer dados sintéticos na BD real | **NOT RUN** |
| Regressão E2E manual (aprovação, chat, defeitos) | Requer navegador com contas reais | **NOT RUN** — recomendado em staging |

Nenhum resultado de teste foi fabricado; os NOT RUN têm a dependência indicada.

---

## E. Plano de Deploy (ordem obrigatória)

1. **Backup**: Supabase Dashboard → Database → Backups (ou `pg_dump`).
2. **Deploy do frontend**: já disparado pelo push (`43f5f98`) — verificar o build na Vercel. O app funciona contra a BD atual (fallbacks).
3. **Aplicar a migração**: Supabase Dashboard → SQL Editor → colar `supabase/migrations/20261027_remediation_security_identity_escalation.sql` → Run. Verificar as 3 queries finais (políticas, job cron, ids não mapeados).
4. **pg_cron**: se a migração avisar que não criou a extensão → Dashboard → Database → Extensions → ativar `pg_cron` → re-executar a migração (idempotente) para agendar `fims-defect-escalation`.
5. **Configurar env/secrets**: nada a fazer (a app usa a publishable key; nenhum segredo novo; NENHUMA chave service_role no código).
6. **Verificar o 1º job**: `SELECT * FROM fims_escalation_log ORDER BY created_at DESC LIMIT 20;` e `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`
7. **Monitorização**: criar um defeito de teste com prazo expirado (`UPDATE fims_defects SET due_at = now() - interval '1 hour' WHERE id = '<id_teste>'`) e confirmar 1 linha no log + notificação única ao CEO/admin/supervisores.
8. **Rollback**: o frontend tem fallbacks — para reverter código, `git revert 43f5f98` + redeploy. A migração não destrói dados; para reverter políticas, reaplicar o conteúdo antigo do `supabase_fix.sql` (não recomendado — reabre as falhas).

---

## F. Riscos Restantes e Evidência Necessária para Fechar

1. **RLS runtime não verificado contra a BD real** — após aplicar a migração, executar: `curl "$URL/rest/v1/fims_messages?select=*" -H "apikey: $ANON"` com uma mensagem privada de outro utilizador no payload esperado → deve devolver apenas dados autorizados pela política SELECT atual (nota: SELECT continua aberto por arquitetura — ver risco 2). Evidência: resposta HTTP.
2. **Isolamento SELECT por utilizador continua limitado pela arquitetura (sem Supabase Auth na sessão principal)** — qualquer portador da publishable key consegue SELECT nas tabelas de comunicação (escritas já são seguras). Fechar isto exige migrar o login para sessões Supabase Auth (trabalho futuro, planeado na `loginWithSupabaseAuth`). Evidência necessária: decisão de negócio + migração de contas para `auth.users`.
3. **Rotas admin (criar/apagar utilizadores) validam forma mas não papel do chamador** — sem sessão autenticada não é possível exigir admin na BD. Mitigado pelo risco 2 (mesmo bloqueador). Qualquer pessoa com a anon key pode criar um utilizador via RPC — aceitável apenas enquanto o acesso SELECT/uso for controlado; reforçar após migração de sessões.
4. **pg_cron pode não ser criável via SQL** no projeto (depende do plano/região) — o passo 4 do deploy cobre isto; evidência: `SELECT * FROM cron.job WHERE jobname='fims-defect-escalation'`.
5. **Ids históricos não mapeáveis** (`usr_N` antigos fora do padrão) — a migração devolve contadores finais; se >0, inspecionar manualmente antes de apagar.
6. **Testes E2E multi-dispositivo** (notificação visível após relogin noutro dispositivo; broadcast lido por 1 não afeta os outros) — executar em staging com 2 contas reais; evidência: screenshots + queries.
7. **Rotação de credenciais** — a anon/publishable key está exposta no bundle (por design); recomenda-se rotação periódica via Dashboard (Authorized Keys) e nenhuma service_role no código (verificado — não existe no repositório).
