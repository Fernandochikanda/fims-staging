-- ============================================================================
-- FIMS — CORREÇÃO DE NOTIFICAÇÕES, MENSAGENS E DEFEITOS (ESCALONAMENTO)
-- ============================================================================
-- Contexto: a aplicação FIMS autentica com a chave anon (não usa Supabase Auth
-- para sessões), pelo que as tabelas de comunicação precisam de políticas RLS
-- permissivas para `anon` + `authenticated` — igual ao que já acontece com
-- fims_inspections / fims_users.
--
-- COMO USAR: Supabase Dashboard → SQL Editor → colar tudo → Run.
-- É idempotente: pode ser executado várias vezes sem partir nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) fims_notifications — desbloquear anon (cause: 401 permission denied)
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fims_notifications TO anon, authenticated;

DROP POLICY IF EXISTS "fims_notif_allow_all_anon" ON public.fims_notifications;
DROP POLICY IF EXISTS "fims_notif_allow_all_auth" ON public.fims_notifications;
CREATE POLICY "fims_notif_allow_all_anon" ON public.fims_notifications
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "fims_notif_allow_all_auth" ON public.fims_notifications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Coluna updated_at (opcional, não obrigatória à app)
ALTER TABLE public.fims_notifications
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- 2) fims_messages — grants (a tabela existe, mas a app nunca a usou)
--    Schema real: id bigint identity, from_id, to_id, text, created_at
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fims_messages TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.fims_messages_id_seq TO anon, authenticated;

DROP POLICY IF EXISTS "fims_msgs_allow_all_anon" ON public.fims_messages;
DROP POLICY IF EXISTS "fims_msgs_allow_all_auth" ON public.fims_messages;
CREATE POLICY "fims_msgs_allow_all_anon" ON public.fims_messages
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "fims_msgs_allow_all_auth" ON public.fims_messages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Colunas extra usadas pela app (leitura sincronizada, nome do remetente,
-- filtro de role em broadcasts e id do cliente para evitar duplicados)
ALTER TABLE public.fims_messages ADD COLUMN IF NOT EXISTS read boolean DEFAULT false;
ALTER TABLE public.fims_messages ADD COLUMN IF NOT EXISTS sender_name text;
ALTER TABLE public.fims_messages ADD COLUMN IF NOT EXISTS role_filter text;
ALTER TABLE public.fims_messages ADD COLUMN IF NOT EXISTS client_msg_id text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fims_messages_client_msg_id
  ON public.fims_messages (client_msg_id) WHERE client_msg_id IS NOT NULL;

-- Índices para conversas e não-lidas
CREATE INDEX IF NOT EXISTS idx_fims_messages_from_to ON public.fims_messages (from_id, to_id);
CREATE INDEX IF NOT EXISTS idx_fims_messages_to_created ON public.fims_messages (to_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3) fims_defects — CRIAR (não existe) — escalonamento de defeitos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fims_defects (
  id                     text PRIMARY KEY,
  key                    text NOT NULL,              -- location::section::item
  location_id            text,
  location_name          text,
  section_id             text,
  section_name           text,
  item_label             text,
  score                  int,
  opened_at              timestamptz,
  opened_inspection_id   text,
  due_at                 timestamptz,
  status                 text DEFAULT 'open',        -- open | resolved
  recurrence_count       int DEFAULT 1,
  last_seen_at           timestamptz,
  last_seen_inspection_id text,
  last_score             int,
  escalated              boolean DEFAULT false,
  escalated_at           timestamptz,
  escalation_count       int DEFAULT 0,
  last_escalated_at      timestamptz,
  resolved_at            timestamptz,
  resolved_inspection_id text,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fims_defects TO anon, authenticated;

DROP POLICY IF EXISTS "fims_defects_allow_all_anon" ON public.fims_defects;
DROP POLICY IF EXISTS "fims_defects_allow_all_auth" ON public.fims_defects;
CREATE POLICY "fims_defects_allow_all_anon" ON public.fims_defects
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "fims_defects_allow_all_auth" ON public.fims_defects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_fims_defects_status ON public.fims_defects (status);
CREATE INDEX IF NOT EXISTS idx_fims_defects_key ON public.fims_defects (key);
CREATE INDEX IF NOT EXISTS idx_fims_defects_location ON public.fims_defects (location_id);

-- ----------------------------------------------------------------------------
-- 4) fims_settings — configuração de notificações (partilhada entre dispositivos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fims_settings (
  id         text PRIMARY KEY,          -- 'notification_settings'
  value      jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fims_settings TO anon, authenticated;

DROP POLICY IF EXISTS "fims_settings_allow_all_anon" ON public.fims_settings;
DROP POLICY IF EXISTS "fims_settings_allow_all_auth" ON public.fims_settings;
CREATE POLICY "fims_settings_allow_all_anon" ON public.fims_settings
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "fims_settings_allow_all_auth" ON public.fims_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 5) REALTIME — adicionar as tabelas à publicação supabase_realtime
--    (sem isto, os clientes não recebem INSERT em tempo real)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'fims_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fims_notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'fims_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fims_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'fims_defects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fims_defects;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6) Verificação rápida (deve devolver as 3 tabelas)
-- ----------------------------------------------------------------------------
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('fims_notifications', 'fims_messages', 'fims_defects');
