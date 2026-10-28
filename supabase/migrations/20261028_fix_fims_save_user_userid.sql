-- ============================================================================
-- HOTFIX 2026-10-28 — fims_save_user: violação NOT NULL em fims_users.user_id
-- ============================================================================
-- SINTOMA (produção):
--   Ao criar um utilizador novo (Gestão > Novo Utilizador):
--   "null value in column \"user_id\" of relation \"fims_users\"
--    violates not-null constraint" (SQLSTATE 23502)
--
-- CAUSA RAIZ:
--   A versão de fims_save_user em produção não tem o bloco
--   EXCEPTION WHEN not_null_violation do fallback. O INSERT de criação
--   omite user_id (estratégia "inserir sem user_id e backfill"), que
--   pressupunha a coluna nullable. Como fims_users.user_id é NOT NULL,
--   toda a criação falha após o hash bcrypt ser calculado.
--
-- CORREÇÃO:
--   Gerar o user_id SEMPRE antes do INSERT (formato 'usr_' || uuid hex),
--   garantidamente único e compatível com a coluna NOT NULL. Remove a
--   dependência de exceções. Bónus: violação de email duplicado devolve
--   mensagem amigável em vez do erro cru do Postgres.
--
-- NOTAS:
--   • Compatível com os formatos user_id existentes ('user_<ts>' legado
--     e 'usr_<n>') — user_id é chave de texto única, sem FKs.
--   • Mantém: validações, mensagens, hash bcrypt server-side (pgcrypto),
--     branch de edição, retorno sem password/password_hash.
--   • gen_random_uuid() é nativo (PG13+); extensions também está no
--     search_path como fileira de segurança.
--   • IDEMPOTENTE: seguro para correr mais que uma vez.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fims_save_user(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $body$
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
  -- ------------------------------------------------------------------
  -- Validações (idênticas às versões anteriores)
  -- ------------------------------------------------------------------
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
    -- ----------------------------------------------------------------
    -- EDIÇÃO: atualiza pelo user_id existente
    -- ----------------------------------------------------------------
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
    -- ----------------------------------------------------------------
    -- CRIAÇÃO: user_id gerado SEMPRE antes do INSERT.
    -- Corrige o 23502 (user_id NOT NULL) — sem recurso a EXCEPTION.
    -- ----------------------------------------------------------------
    IF v_hash IS NULL THEN
      RETURN jsonb_build_object('error', 'Senha obrigatória para novos utilizadores');
    END IF;

    v_user_id := 'usr_' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO public.fims_users (user_id, name, email, password_hash, role, active, avatar)
    VALUES (v_user_id, v_name, v_email, v_hash, v_role, v_active, v_avatar)
    RETURNING id INTO v_id;
  END IF;

  SELECT to_jsonb(u) - 'password' - 'password_hash'
  INTO v_out
  FROM public.fims_users u WHERE u.id = v_id;

  RETURN jsonb_build_object('user', v_out);

EXCEPTION WHEN unique_violation THEN
  -- Email duplicado (uq_fims_users_email) ou user_id duplicado — mensagem clara
  RETURN jsonb_build_object('error', 'Já existe um utilizador com este email');
END
$body$;

-- Reafirmar grant (idempotente)
GRANT EXECUTE ON FUNCTION public.fims_save_user(jsonb) TO anon, authenticated;
