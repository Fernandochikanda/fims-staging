-- ============================================================================
-- Fix: GRANT permissions on fims_message_reads and fims_announcement_reads
-- ============================================================================
-- These tables were created by the remediation migration but missing GRANT
-- statements, causing 401 "permission denied for table" errors when the
-- app tries to load read receipts.
--
-- Run this in: Supabase SQL Editor (both Production + Test projects)
-- ============================================================================

-- Message read receipts
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fims_message_reads TO anon, authenticated;

-- Announcement read receipts
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fims_announcement_reads TO anon, authenticated;

-- Also grant on any other tables that might be missing permissions.
-- Check all tables in the public schema for missing grants:
-- SELECT tablename, has tablepriv 
-- FROM pg_tables t
-- LEFT JOIN (
--   SELECT grantee, table_name as tablename, string_agg(table_name, ', ') as has
--   FROM information_schema.role_table_grants
--   WHERE grantee IN ('anon', 'authenticated')
--   GROUP BY grantee, table_name
-- ) g ON g.tablename = t.tablename
-- WHERE t.schemaname = 'public' AND g.has IS NULL;
