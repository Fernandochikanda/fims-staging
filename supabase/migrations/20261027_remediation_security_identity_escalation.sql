-- ============================================================================
-- FIMS — REMEDIAÇÃO 2026-10-27
-- Segurança (RLS/credenciais) + Identidade canónica + Escalonamento server-side
-- + Read receipts por destinatário + Anúncios persistentes + Observabilidade
-- ============================================================================
-- COMO APLICAR: Supabase Dashboard → SQL Editor → colar tudo → Run.
-- Idempotente: pode ser executado várias vezes sem partir nada.
--
-- SUBSTITUI supabase_fix.sql (mantido por histórico). Depois de aplicar esta
-- migração, as políticas "allow-all" do ficheiro anterior são removidas.
--
-- NOTA DE COMPATIBILIDADE: a app frontend suporta ambas as fases:
--   • Antes de aplicar: continua a funcionar como hoje (fallbacks no cliente).
--   • Depois de aplicar: escritas passam a ser feitas via RPCs SECURITY DEFINER.
-- ============================================================================

-- ============================================================================
-- 0) PRÉ-REQUISITOS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions; -- crypt()/gen_salt('bf') para hashing server-side (Supabase instala extensões no schema 'extensions')

-- ============================================================================
-- 1) IDENTIDADE CANÓNICA — fims_users.user_id é o identificador autoritativo
--    Formato canónico: 'usr_' || id. Backfill + unique constraint.
-- ============================================================================
UPDATE public.fims_users
SET user_id = 'usr_' || id
WHERE user_id IS NULL OR user_id = '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_fims_users_user_id ON public.fims_users (user_id);

-- ============================================================================
-- 2) fims_notifications — dedupe_key + RLS real (escritas só via fims_notify)
-- ============================================================================
ALTER TABLE public.fims_notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE public.fims_notifications ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.fims_notifications ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE public.fims_notifications ADD COLUMN IF NOT EXISTS read boolean DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fims_notifications_dedupe
  ON public.fims_notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fims_notifications_user_created
  ON public.fims_notifications (user_id, created_at DESC);

-- Migração de histórico: user_id numérico → user_id canónico (usr_*)
UPDATE public.fims_notifications n SET user_id = u.user_id
FROM public.fims_users u
WHERE n.user_id ~ '^[0-9]+$' AND u.id::text = n.user_id AND n.user_id <> u.user_id;

ALTER TABLE public.fims_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fims_notif_allow_all_anon" ON public.fims_notifications;
DROP POLICY IF EXISTS "fims_notif_allow_all_auth" ON public.fims_notifications;
DROP POLICY IF EXISTS "fims_notif_select" ON public.fims_notifications;
DROP POLICY IF EXISTS "fims_notif_update_read" ON public.fims_notifications;
CREATE POLICY "fims_notif_select" ON public.fims_notifications
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "fims_notif_update_read" ON public.fims_notifications
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- escrita direta removida: INSERT/DELETE passam a exigir os RPCs (fims_notify)
REVOKE INSERT ON public.fims_notifications FROM anon, authenticated;
REVOKE DELETE ON public.fims_notifications FROM anon, authenticated;

-- ============================================================================
-- 3) fims_messages — RLS real; escritas só via fims_send_message; leitura
--    da app filtrada no cliente por destinatário (to/from/broadcast)
-- ============================================================================
ALTER TABLE public.fims_messages ADD COLUMN IF NOT EXISTS read boolean DEFAULT false;
ALTER TABLE public.fims_messages ADD COLUMN IF NOT EXISTS sender_name text;
ALTER TABLE public.fims_messages ADD COLUMN IF NOT EXISTS role_filter text;
ALTER TABLE public.fims_messages ADD COLUMN IF NOT EXISTS client_msg_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fims_messages_client_msg_id
  ON public.fims_messages (client_msg_id) WHERE client_msg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fims_messages_from_to ON public.fims_messages (from_id, to_id);
CREATE INDEX IF NOT EXISTS idx_fims_messages_to_created ON public.fims_messages (to_id, created_at DESC);

-- Migração de histórico: to_id/from_id numéricos → user_id canónico
-- ('broadcast' fica intacto)
UPDATE public.fims_messages m SET to_id = u.user_id
FROM public.fims_users u
WHERE m.to_id ~ '^[0-9]+$' AND u.id::text = m.to_id AND m.to_id <> u.user_id;

UPDATE public.fims_messages m SET from_id = u.user_id
FROM public.fims_users u
WHERE m.from_id ~ '^[0-9]+$' AND u.id::text = m.from_id AND m.from_id <> u.user_id;

ALTER TABLE public.fims_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fims_msgs_allow_all_anon" ON public.fims_messages;
DROP POLICY IF EXISTS "fims_msgs_allow_all_auth" ON public.fims_messages;
DROP POLICY IF EXISTS "fims_msgs_select" ON public.fims_messages;
CREATE POLICY "fims_msgs_select" ON public.fims_messages
  FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT ON public.fims_messages FROM anon, authenticated;
REVOKE UPDATE ON public.fims_messages FROM anon, authenticated;
REVOKE DELETE ON public.fims_messages FROM anon, authenticated;

-- ============================================================================
-- 4) fims_message_reads — READ RECEIPTS POR DESTINATÁRIO (corrige MSG-001)
--    Uma mensagem lida por um utilizador já não marca leitura para os outros.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fims_message_reads (
  message_id bigint NOT NULL,
  user_id    text   NOT NULL,
  read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

ALTER TABLE public.fims_message_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fims_msg_reads_select" ON public.fims_message_reads;
CREATE POLICY "fims_msg_reads_select" ON public.fims_message_reads
  FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT ON public.fims_message_reads FROM anon, authenticated;
REVOKE UPDATE ON public.fims_message_reads FROM anon, authenticated;
REVOKE DELETE ON public.fims_message_reads FROM anon, authenticated;

-- ============================================================================
-- 5) fims_defects — RLS real; escritas via RPC; unique de chave aberta;
--    índices para o scheduler
-- ============================================================================
ALTER TABLE public.fims_defects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fims_defects_allow_all_anon" ON public.fims_defects;
DROP POLICY IF EXISTS "fims_defects_allow_all_auth" ON public.fims_defects;
DROP POLICY IF EXISTS "fims_defects_select" ON public.fims_defects;
CREATE POLICY "fims_defects_select" ON public.fims_defects
  FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT ON public.fims_defects FROM anon, authenticated;
REVOKE UPDATE ON public.fims_defects FROM anon, authenticated;
REVOKE DELETE ON public.fims_defects FROM anon, authenticated;

-- Dedupe de defeitos abertos com a mesma key (mantém o mais antigo, funde
-- recorrência e fecha os restantes) antes de criar o índice único.
DO $$
DECLARE
  dup_keys int;
BEGIN
  SELECT count(DISTINCT key) INTO dup_keys
  FROM (
    SELECT key FROM public.fims_defects WHERE status = 'open'
    GROUP BY key HAVING count(*) > 1
  ) s;

  IF dup_keys > 0 THEN
    -- soma das recorrências para o keeper
    UPDATE public.fims_defects k
    SET recurrence_count = s.total, updated_at = now()
    FROM (
      SELECT key, sum(recurrence_count)::int AS total
      FROM public.fims_defects WHERE status = 'open'
      GROUP BY key HAVING count(*) > 1
    ) s
    WHERE k.key = s.key AND k.status = 'open'
      AND k.opened_at = (SELECT min(d2.opened_at) FROM public.fims_defects d2
                         WHERE d2.key = k.key AND d2.status = 'open');

    -- fecha os duplicados (perdedores)
    WITH ranked AS (
      SELECT id, row_number() OVER (
               PARTITION BY key
               ORDER BY opened_at ASC NULLS LAST, id ASC) AS rn
      FROM public.fims_defects WHERE status = 'open'
    )
    UPDATE public.fims_defects d
    SET status = 'resolved',
        resolved_at = coalesce(d.resolved_at, now()),
        resolved_inspection_id = coalesce(d.resolved_inspection_id, 'dedupe_migration'),
        escalated = false,
        updated_at = now()
    FROM ranked r
    WHERE d.id = r.id AND r.rn > 1;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fims_defects_open_key
  ON public.fims_defects (key) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_fims_defects_due ON public.fims_defects (due_at) WHERE status = 'open';

-- ============================================================================
-- 6) fims_settings — SELECT aberto (a app lê), escrita só via RPC, sem DELETE
-- ============================================================================
ALTER TABLE public.fims_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fims_settings_allow_all_anon" ON public.fims_settings;
DROP POLICY IF EXISTS "fims_settings_allow_all_auth" ON public.fims_settings;
DROP POLICY IF EXISTS "fims_settings_select" ON public.fims_settings;
CREATE POLICY "fims_settings_select" ON public.fims_settings
  FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT ON public.fims_settings FROM anon, authenticated;
REVOKE UPDATE ON public.fims_settings FROM anon, authenticated;
REVOKE DELETE ON public.fims_settings FROM anon, authenticated;

-- ============================================================================
-- 7) fims_users — proteção de credenciais (SEC-002/SEC-003)
--    • SELECT só em colunas seguras (nunca password/password_hash)
--    • DML direto revogado; CRUD passa a ser feito via RPCs SECURITY DEFINER
-- ============================================================================
ALTER TABLE public.fims_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fims_users_select" ON public.fims_users;
CREATE POLICY "fims_users_select" ON public.fims_users
  FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT ON public.fims_users FROM anon, authenticated;
REVOKE UPDATE ON public.fims_users FROM anon, authenticated;
REVOKE DELETE ON public.fims_users FROM anon, authenticated;
REVOKE SELECT ON public.fims_users FROM anon, authenticated;

-- Concede SELECT apenas nas colunas seguras que existirem na tabela real
DO $$
DECLARE
  c record;
  safe_cols text[] := ARRAY['id','user_id','name','email','role','active','avatar','created_at','updated_at'];
  grant_list text := '';
BEGIN
  FOR c IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fims_users'
      AND column_name = ANY (safe_cols)
  LOOP
    grant_list := grant_list || quote_ident(c.column_name) || ',';
  END LOOP;
  IF grant_list = '' THEN
    RAISE EXCEPTION 'fims_users sem colunas seguras esperadas — migrar manualmente';
  END IF;
  grant_list := rtrim(grant_list, ',');
  EXECUTE format('GRANT SELECT (%s) ON public.fims_users TO anon, authenticated', grant_list);
END $$;

-- ============================================================================
-- 8) ESCALONAMENTO — log de escalonamento com dedupe único (defect_id, stage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fims_escalation_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  defect_id     text NOT NULL,
  stage         int  NOT NULL,
  actor         text NOT NULL DEFAULT 'pg_cron',  -- pg_cron | manual
  recipients    jsonb,
  notifications jsonb,
  defect_snapshot jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (defect_id, stage)
);

ALTER TABLE public.fims_escalation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fims_esc_log_select" ON public.fims_escalation_log;
CREATE POLICY "fims_esc_log_select" ON public.fims_escalation_log
  FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT ON public.fims_escalation_log FROM anon, authenticated;
REVOKE UPDATE ON public.fims_escalation_log FROM anon, authenticated;
REVOKE DELETE ON public.fims_escalation_log FROM anon, authenticated;

-- ============================================================================
-- 9) ANÚNCIOS PERSISTENTES (corrige ANN-001)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fims_announcements (
  id          text PRIMARY KEY,
  from_id     text,
  from_name   text,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  target_role text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fims_announcement_reads (
  announcement_id text NOT NULL,
  user_id         text NOT NULL,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

ALTER TABLE public.fims_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fims_announcement_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fims_ann_select" ON public.fims_announcements;
CREATE POLICY "fims_ann_select" ON public.fims_announcements
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "fims_ann_reads_select" ON public.fims_announcement_reads;
CREATE POLICY "fims_ann_reads_select" ON public.fims_announcement_reads
  FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT ON public.fims_announcements FROM anon, authenticated;
REVOKE UPDATE ON public.fims_announcements FROM anon, authenticated;
REVOKE DELETE ON public.fims_announcements FROM anon, authenticated;
REVOKE INSERT ON public.fims_announcement_reads FROM anon, authenticated;
REVOKE UPDATE ON public.fims_announcement_reads FROM anon, authenticated;
REVOKE DELETE ON public.fims_announcement_reads FROM anon, authenticated;

-- ============================================================================
-- 10) RPCs — SECURITY DEFINER, search_path fixado, executáveis por anon/auth
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 10.1) LOGIN SEGURO — hash verificado na BD; upgrade transparente de senhas
-- em texto plano legadas; nunca devolve password/password_hash.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fims_login(p_email text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  u public.fims_users%ROWTYPE;
  v_avatar text;
BEGIN
  IF p_email IS NULL OR p_password IS NULL OR btrim(p_password) = '' THEN
    RETURN jsonb_build_object('error', 'Email ou senha incorretos');
  END IF;

  SELECT * INTO u FROM public.fims_users
  WHERE lower(email) = lower(btrim(p_email))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Email ou senha incorretos');
  END IF;

  IF u.active IS FALSE THEN
    RETURN jsonb_build_object('error', 'Conta desativada. Contacte o administrador.');
  END IF;

  BEGIN
    IF u.password_hash IS NOT NULL AND u.password_hash <> '' THEN
      IF crypt(p_password, u.password_hash) IS DISTINCT FROM u.password_hash THEN
        RETURN jsonb_build_object('error', 'Email ou senha incorretos');
      END IF;
    ELSIF u.password IS NOT NULL AND u.password <> '' THEN
      -- senha legada em texto plano: verificar e fazer upgrade para bcrypt
      IF u.password <> p_password THEN
        RETURN jsonb_build_object('error', 'Email ou senha incorretos');
      END IF;
      UPDATE public.fims_users
      SET password_hash = crypt(p_password, gen_salt('bf', 10)),
          password = NULL
      WHERE id = u.id;
    ELSE
      RETURN jsonb_build_object('error', 'Conta sem senha configurada. Contacte o administrador.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', 'Email ou senha incorretos');
  END;

  v_avatar := coalesce(u.avatar,
    upper(left(regexp_replace(coalesce(u.name, 'US'), '\W', '', 'g'), 2)));

  RETURN jsonb_build_object('user', jsonb_build_object(
    'id',     u.user_id,
    'dbId',   u.id,
    'name',   u.name,
    'email',  u.email,
    'role',   coalesce(u.role, 'inspector'),
    'active', (u.active IS NOT FALSE),
    'avatar', v_avatar
  ));
END $$;

-- ---------------------------------------------------------------------------
-- 10.2) CRUD DE UTILIZADORES via RPC (validação server-side de role/email;
--       senha sempre com hash bcrypt na BD; nunca expõe colunas sensíveis)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fims_save_user(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user_id text := NULLIF(btrim(coalesce(p_data->>'user_id', '')), '');
  v_name    text := NULLIF(btrim(coalesce(p_data->>'name', '')), '');
  v_email   text := NULLIF(btrim(coalesce(p_data->>'email', '')), '');
  v_role    text := lower(coalesce(p_data->>'role', 'inspector'));
  v_active  boolean := coalesce((p_data->>'active')::boolean, true);
  v_avatar  text := NULLIF(btrim(coalesce(p_data->>'avatar', '')), '');
  v_pass    text := p_data->>'password';
  v_id      bigint;
  v_hash    text;
  v_out     jsonb;
BEGIN
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('error', 'Nome obrigatório');
  END IF;
  IF v_email IS NULL OR v_email NOT LIKE '%_@_%._%' THEN
    RETURN jsonb_build_object('error', 'Email inválido');
  END IF;
  IF v_role NOT IN ('admin','ceo','supervisor','inspector') THEN
    RETURN jsonb_build_object('error', 'Role inválido');
  END IF;

  IF v_pass IS NOT NULL AND btrim(v_pass) <> '' THEN
    IF length(v_pass) < 6 THEN
      RETURN jsonb_build_object('error', 'Senha deve ter pelo menos 6 caracteres');
    END IF;
    v_hash := crypt(v_pass, gen_salt('bf', 10));
  END IF;

  IF v_user_id IS NOT NULL THEN
    UPDATE public.fims_users u SET
      name    = coalesce(v_name, u.name),
      email   = coalesce(v_email, u.email),
      role    = v_role,
      active  = v_active,
      avatar  = coalesce(v_avatar, u.avatar),
      password_hash = coalesce(v_hash, u.password_hash),
      updated_at = now()
    WHERE u.user_id = v_user_id
    RETURNING u.id INTO v_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Utilizador não encontrado');
    END IF;
  ELSE
    IF v_hash IS NULL THEN
      RETURN jsonb_build_object('error', 'Senha obrigatória para novos utilizadores');
    END IF;
    BEGIN
      -- caso normal: user_id é nullable → insere sem user_id e faz backfill
      INSERT INTO public.fims_users (name, email, password_hash, role, active, avatar)
      VALUES (v_name, v_email, v_hash, v_role, v_active, v_avatar)
      RETURNING id INTO v_id;

      UPDATE public.fims_users
      SET user_id = 'usr_' || v_id
      WHERE id = v_id AND (user_id IS NULL OR user_id = '');
    EXCEPTION WHEN not_null_violation THEN
      -- fallback: user_id é NOT NULL → gera sufixo único a partir do máximo atual
      v_user_id := 'usr_' || (coalesce((
        SELECT max(substring(user_id from '[0-9]+$')::bigint)
        FROM public.fims_users WHERE user_id ~ '^usr_[0-9]+$'
      ), 0) + 1);

      INSERT INTO public.fims_users (name, email, password_hash, role, active, avatar, user_id)
      VALUES (v_name, v_email, v_hash, v_role, v_active, v_avatar, v_user_id)
      RETURNING id INTO v_id;
    END;
  END IF;

  SELECT to_jsonb(u) - 'password' - 'password_hash'
  INTO v_out
  FROM public.fims_users u WHERE u.id = v_id;

  RETURN jsonb_build_object('user', v_out);
END $$;

CREATE OR REPLACE FUNCTION public.fims_delete_user(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RETURN jsonb_build_object('error', 'user_id obrigatório');
  END IF;
  DELETE FROM public.fims_users WHERE user_id = p_user_id RETURNING id INTO v_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Utilizador não encontrado');
  END IF;
  RETURN jsonb_build_object('ok', true, 'deleted_id', v_id);
END $$;

-- ---------------------------------------------------------------------------
-- 10.3) NOTIFICAÇÕES — criação centralizada + dedupe por chave de negócio
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fims_notify(
  p_user_id    text,
  p_text       text,
  p_link       text DEFAULT NULL,
  p_dedupe_key text DEFAULT NULL
)
RETURNS public.fims_notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.fims_notifications%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' OR p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.fims_notifications (id, user_id, text, link, read, created_at, dedupe_key)
  VALUES (
    'ntf_' || md5(random()::text || clock_timestamp()::text),
    p_user_id, p_text, p_link, false, now(), NULLIF(btrim(coalesce(p_dedupe_key, '')), '')
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL AND p_dedupe_key IS NOT NULL THEN
    SELECT * INTO v_row FROM public.fims_notifications WHERE dedupe_key = p_dedupe_key LIMIT 1;
  END IF;

  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.fims_notification_read(
  p_user_id text, p_notification_id text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF p_notification_id IS NULL THEN
    UPDATE public.fims_notifications SET read = true
    WHERE user_id = p_user_id AND read = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    UPDATE public.fims_notifications SET read = true
    WHERE user_id = p_user_id AND id = p_notification_id AND read = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  RETURN v_count;
END $$;

-- ---------------------------------------------------------------------------
-- 10.4) MENSAGENS — envio com dedupe client_msg_id; read receipts por
-- destinatário; unread count calculado na BD
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fims_send_message(
  p_from_id      text,
  p_to_id        text,
  p_text         text,
  p_sender_name  text DEFAULT NULL,
  p_role_filter  text DEFAULT NULL,
  p_client_msg_id text DEFAULT NULL
)
RETURNS public.fims_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.fims_messages%ROWTYPE;
BEGIN
  IF p_from_id IS NULL OR p_to_id IS NULL OR p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.fims_messages
    (from_id, to_id, text, created_at, read, sender_name, role_filter, client_msg_id)
  VALUES
    (p_from_id, p_to_id, btrim(p_text), now(), false,
     p_sender_name, NULLIF(btrim(coalesce(p_role_filter, '')), ''),
     NULLIF(btrim(coalesce(p_client_msg_id, '')), ''))
  ON CONFLICT (client_msg_id) WHERE client_msg_id IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL AND p_client_msg_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.fims_messages
    WHERE client_msg_id = p_client_msg_id LIMIT 1;
  END IF;

  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.fims_mark_message_read(p_message_id bigint, p_user_id text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.fims_messages
    WHERE id = p_message_id
      AND (to_id = p_user_id OR to_id = 'broadcast' OR from_id = p_user_id)
  ) INTO v_ok;

  IF NOT v_ok THEN RETURN false; END IF;

  INSERT INTO public.fims_message_reads (message_id, user_id)
  VALUES (p_message_id, p_user_id)
  ON CONFLICT (message_id, user_id) DO NOTHING;

  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.fims_mark_messages_read(p_user_id text)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  INSERT INTO public.fims_message_reads (message_id, user_id)
  SELECT m.id, p_user_id
  FROM public.fims_messages m
  WHERE (m.to_id = p_user_id OR m.to_id = 'broadcast')
    AND m.from_id IS DISTINCT FROM p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.fims_message_reads r
      WHERE r.message_id = m.id AND r.user_id = p_user_id
    )
  ON CONFLICT (message_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.fims_unread_count(p_user_id text, p_role text DEFAULT NULL)
RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.fims_messages m
  WHERE (m.to_id = p_user_id
         OR (m.to_id = 'broadcast' AND (m.role_filter IS NULL OR m.role_filter = p_role)))
    AND m.from_id IS DISTINCT FROM p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.fims_message_reads r
      WHERE r.message_id = m.id AND r.user_id = p_user_id
    );
$$;

-- ---------------------------------------------------------------------------
-- 10.5) DEFEITOS — upsert transacional; resolução/reabertura idempotentes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fims_upsert_defects(p_rows jsonb)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_count int := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public.fims_defects (
      id, key, location_id, location_name, section_id, section_name, item_label,
      score, opened_at, opened_inspection_id, due_at, status, recurrence_count,
      last_seen_at, last_seen_inspection_id, last_score, escalated, escalated_at,
      escalation_count, last_escalated_at, resolved_at, resolved_inspection_id, updated_at
    ) VALUES (
      r->>'id',
      r->>'key',
      r->>'location_id',
      r->>'location_name',
      r->>'section_id',
      r->>'section_name',
      r->>'item_label',
      (r->>'score')::int,
      (r->>'opened_at')::timestamptz,
      r->>'opened_inspection_id',
      (r->>'due_at')::timestamptz,
      coalesce(r->>'status', 'open'),
      coalesce((r->>'recurrence_count')::int, 1),
      (r->>'last_seen_at')::timestamptz,
      r->>'last_seen_inspection_id',
      (r->>'last_score')::int,
      coalesce((r->>'escalated')::boolean, false),
      (r->>'escalated_at')::timestamptz,
      coalesce((r->>'escalation_count')::int, 0),
      (r->>'last_escalated_at')::timestamptz,
      (r->>'resolved_at')::timestamptz,
      r->>'resolved_inspection_id',
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      key                     = EXCLUDED.key,
      location_id             = EXCLUDED.location_id,
      location_name           = EXCLUDED.location_name,
      section_id              = EXCLUDED.section_id,
      section_name            = EXCLUDED.section_name,
      item_label              = EXCLUDED.item_label,
      score                   = EXCLUDED.score,
      opened_at               = EXCLUDED.opened_at,
      opened_inspection_id    = EXCLUDED.opened_inspection_id,
      due_at                  = EXCLUDED.due_at,
      status                  = EXCLUDED.status,
      recurrence_count        = EXCLUDED.recurrence_count,
      last_seen_at            = EXCLUDED.last_seen_at,
      last_seen_inspection_id = EXCLUDED.last_seen_inspection_id,
      last_score              = EXCLUDED.last_score,
      escalated               = EXCLUDED.escalated,
      escalated_at            = EXCLUDED.escalated_at,
      escalation_count        = EXCLUDED.escalation_count,
      last_escalated_at       = EXCLUDED.last_escalated_at,
      resolved_at             = EXCLUDED.resolved_at,
      resolved_inspection_id  = EXCLUDED.resolved_inspection_id,
      updated_at              = now();

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.fims_resolve_defect(p_defect_id text, p_user_id text DEFAULT NULL)
RETURNS public.fims_defects
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.fims_defects%ROWTYPE;
BEGIN
  UPDATE public.fims_defects SET
    status = 'resolved',
    resolved_at = now(),
    resolved_inspection_id = coalesce(resolved_inspection_id, 'manual_' || coalesce(p_user_id, '')),
    escalated = false,
    updated_at = now()
  WHERE id = p_defect_id AND status IS DISTINCT FROM 'resolved'
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.fims_reopen_defect(p_defect_id text)
RETURNS public.fims_defects
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.fims_defects%ROWTYPE;
BEGIN
  UPDATE public.fims_defects SET
    status = 'open',
    resolved_at = NULL,
    resolved_inspection_id = NULL,
    due_at = now() + interval '48 hours',
    escalated = false,
    updated_at = now()
  WHERE id = p_defect_id
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- ---------------------------------------------------------------------------
-- 10.6) NÚCLEO DE ESCALONAMENTO — atómico e idempotente
--   • fims_escalate_one: escala 1 defeito (stage = escalation_count + 1)
--   • dedupe: UNIQUE (defect_id, stage) em fims_escalation_log
--   • destinatários: papéis configurados em fims_settings (default inclui CEO);
--     o CEO NUNCA é excluído por ser o autor de uma ação (não há excludeId)
--   • notificação + mensagem com dedupe_key 'esc:{defect_id}:{stage}'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fims_escalate_one(p_defect_id text, p_actor text DEFAULT 'pg_cron')
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d public.fims_defects%ROWTYPE;
  v_stage int;
  v_log_id bigint;
  v_cfg jsonb;
  v_roles jsonb;
  v_chan_n boolean;
  v_chan_m boolean;
  r record;
  v_notif_ids jsonb := '[]'::jsonb;
  v_recipients jsonb := '[]'::jsonb;
  v_msg text;
  v_notif public.fims_notifications%ROWTYPE;
  v_msg_row public.fims_messages%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.fims_defects
  WHERE id = p_defect_id FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;
  IF d.status IS DISTINCT FROM 'open' THEN RETURN false; END IF;
  IF d.due_at IS NULL THEN RETURN false; END IF;
  IF d.due_at >= now() THEN RETURN false; END IF;

  -- já escalado recentemente (< 24h)? não re-escalar
  IF d.escalated = true
     AND d.last_escalated_at IS NOT NULL
     AND d.last_escalated_at > now() - interval '24 hours' THEN
    RETURN false;
  END IF;

  v_stage := coalesce(d.escalation_count, 0) + 1;

  -- dedupe atómico: se outro processo já escalou este stage, sai
  INSERT INTO public.fims_escalation_log (defect_id, stage, actor, defect_snapshot)
  VALUES (d.id, v_stage, p_actor, to_jsonb(d))
  ON CONFLICT (defect_id, stage) DO NOTHING
  RETURNING id INTO v_log_id;

  IF v_log_id IS NULL THEN RETURN false; END IF;

  -- configuração de destinatários (fims_settings; fallback = default do negócio)
  SELECT value->'events'->'defect_escalated' INTO v_cfg
  FROM public.fims_settings WHERE id = 'notification_settings' LIMIT 1;

  v_roles  := coalesce(v_cfg->'roles', '["ceo","admin","supervisor"]'::jsonb);
  IF jsonb_typeof(v_roles) <> 'array' OR jsonb_array_length(v_roles) = 0 THEN
    v_roles := '["ceo","admin","supervisor"]'::jsonb;
  END IF;
  v_chan_n := coalesce((v_cfg->'channels'->>'notification')::boolean, true);
  v_chan_m := coalesce((v_cfg->'channels'->>'message')::boolean, true);

  v_msg := '🚨 ' ||
    CASE WHEN v_stage > 1
         THEN 'RE-ESCALAÇÃO (' || v_stage || 'ª vez): '
         ELSE 'ESCALONAMENTO (48h): ' END ||
    '"' || coalesce(d.item_label, d.key) || '" em ' ||
    coalesce(d.location_name, d.location_id, '?') ||
    ' continua em aberto após o prazo. Escalado ao CEO.';

  FOR r IN
    SELECT user_id FROM public.fims_users
    WHERE active IS NOT FALSE
      AND role IN (SELECT jsonb_array_elements_text(v_roles))
      AND user_id IS NOT NULL
  LOOP
    IF v_chan_n THEN
      SELECT * INTO v_notif FROM public.fims_notify(
        r.user_id, v_msg, 'defects', 'esc:' || d.id || ':' || v_stage);
      IF v_notif.id IS NOT NULL THEN
        v_notif_ids := v_notif_ids || to_jsonb(v_notif.id);
      END IF;
    END IF;

    IF v_chan_m THEN
      SELECT * INTO v_msg_row FROM public.fims_send_message(
        'system', r.user_id, v_msg, 'Sistema FIMS', NULL,
        'esc:' || d.id || ':' || v_stage);
    END IF;

    v_recipients := v_recipients || to_jsonb(r.user_id);
  END LOOP;

  UPDATE public.fims_defects SET
    escalated = true,
    escalated_at = coalesce(escalated_at, now()),
    escalation_count = v_stage,
    last_escalated_at = now(),
    updated_at = now()
  WHERE id = d.id;

  UPDATE public.fims_escalation_log SET
    recipients = v_recipients,
    notifications = v_notif_ids
  WHERE id = v_log_id;

  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.fims_escalate_defect(p_defect_id text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN public.fims_escalate_one(p_defect_id, 'manual');
END $$;

CREATE OR REPLACE FUNCTION public.fims_escalate_overdue_defects()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d record;
  v_count int := 0;
BEGIN
  FOR d IN
    SELECT id FROM public.fims_defects
    WHERE status = 'open'
      AND due_at IS NOT NULL
      AND due_at < now()
      AND (escalated IS NOT TRUE
           OR coalesce(last_escalated_at, to_timestamp(0)) <= now() - interval '24 hours')
    ORDER BY opened_at
    FOR UPDATE SKIP LOCKED
  LOOP
    IF public.fims_escalate_one(d.id, 'pg_cron') THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('escalated', v_count, 'ran_at', now());
END $$;

-- ---------------------------------------------------------------------------
-- 10.7) CONFIGURAÇÕES — escrita via RPC (validação mínima de forma)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fims_save_settings(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) <> 'object'
     OR (p_value->'events') IS NULL
     OR jsonb_typeof(p_value->'events') <> 'object' THEN
    RETURN jsonb_build_object('error', 'Formato de configuração inválido');
  END IF;

  INSERT INTO public.fims_settings (id, value, updated_at)
  VALUES ('notification_settings', p_value, now())
  ON CONFLICT (id) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END $$;

-- ---------------------------------------------------------------------------
-- 10.8) ANÚNCIOS — criação e leitura por utilizador via RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fims_create_announcement(
  p_id text, p_from_id text, p_from_name text,
  p_title text, p_body text, p_target_role text DEFAULT NULL
)
RETURNS public.fims_announcements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.fims_announcements%ROWTYPE;
BEGIN
  IF p_id IS NULL OR p_title IS NULL OR btrim(p_title) = '' THEN RETURN NULL; END IF;

  INSERT INTO public.fims_announcements (id, from_id, from_name, title, body, target_role)
  VALUES (p_id, p_from_id, p_from_name, p_title, coalesce(p_body, ''), p_target_role)
  ON CONFLICT (id) DO UPDATE SET
    from_id = EXCLUDED.from_id,
    from_name = EXCLUDED.from_name,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    target_role = EXCLUDED.target_role
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.fims_dismiss_announcement(p_id text, p_user_id text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.fims_announcement_reads (announcement_id, user_id)
  VALUES (p_id, p_user_id)
  ON CONFLICT (announcement_id, user_id) DO NOTHING
  RETURNING true;
$$;

-- ---------------------------------------------------------------------------
-- 10.9) GRANTS DE EXECUÇÃO
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.fims_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_save_user(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_delete_user(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_notify(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_notification_read(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_send_message(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_mark_message_read(bigint, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_mark_messages_read(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_unread_count(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_upsert_defects(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_resolve_defect(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_reopen_defect(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_escalate_defect(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_escalate_overdue_defects() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_save_settings(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_create_announcement(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_dismiss_announcement(text, text) TO anon, authenticated;

-- ============================================================================
-- 11) SCHEDULER SERVER-SIDE — pg_cron a cada 15 minutos (não depende de browser)
-- ============================================================================
DO $$
DECLARE
  v_err text;
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      RAISE NOTICE 'pg_cron não pôde ser ativado via SQL (%). Ative no Dashboard → Database → Extensions e volte a executar esta migração para agendar o job.', v_err;
      RETURN;
    END;
  END;

  BEGIN
    PERFORM cron.unschedule('fims-defect-escalation');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM cron.schedule(
    'fims-defect-escalation',
    '*/15 * * * *',
    $$SELECT public.fims_escalate_overdue_defects()$$
  );

  RAISE NOTICE 'pg_cron agendado: fims-defect-escalation a cada 15 minutos.';
END $$;

-- ============================================================================
-- 12) REALTIME — novas tabelas na publicação
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['fims_message_reads', 'fims_announcements', 'fims_escalation_log'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 13) VERIFICAÇÃO FINAL
-- ============================================================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'fims_%'
ORDER BY tablename, policyname;

SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'fims-defect-escalation';

-- Identificadores ainda não mapeados (deve estar vazio na maioria dos casos):
SELECT 'notifications_nao_mapeadas' AS item, count(*) FROM public.fims_notifications WHERE user_id ~ '^[0-9]+$'
UNION ALL
SELECT 'messages_to_nao_mapeadas', count(*) FROM public.fims_messages WHERE to_id ~ '^[0-9]+$'
UNION ALL
SELECT 'messages_from_nao_mapeadas', count(*) FROM public.fims_messages WHERE from_id ~ '^[0-9]+$';
