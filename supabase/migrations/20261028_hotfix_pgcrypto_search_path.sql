-- ============================================================================
-- HOTFIX 2026-10-28 — pgcrypto fora do search_path → login quebrado
-- ============================================================================
-- SINTOMA: "Email ou senha incorretos" em TODOS os logins, mesmo com a senha
--          correta; criação de utilizadores (Team) também falha.
--
-- CAUSA RAIZ (provada por diagnóstico):
--   A migração 20261027 criou as funções com "SET search_path = public", mas no
--   Supabase o pgcrypto é instalado no schema "extensions". Assim, crypt() e
--   gen_salt() NÃO são encontradas em runtime:
--     • fims_login: exceção engolida por "EXCEPTION WHEN OTHERS" → devolve
--       "Email ou senha incorretos" para qualquer senha (incl. a correta).
--     • fims_save_user: erro cru 42883 "function gen_salt(unknown, integer)
--       does not exist".
--
-- CORREÇÃO: garantir pgcrypto no schema extensions e recriar as duas funções
-- com "SET search_path = public, extensions". CREATE OR REPLACE preserva os
-- GRANTs já existentes (anon/authenticated) — nenhuma permissão muda.
--
-- APLICAR: Supabase Dashboard → SQL Editor → colar e Run (idempotente).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- fims_login — corpo idêntico à migração 20261027; apenas o search_path muda
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fims_login(p_email text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
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
-- fims_save_user — corpo idêntico à migração 20261027; apenas o search_path muda
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fims_save_user(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
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

-- Reafirmar grants (idempotente; CREATE OR REPLACE já os preserva)
GRANT EXECUTE ON FUNCTION public.fims_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fims_save_user(jsonb) TO anon, authenticated;
