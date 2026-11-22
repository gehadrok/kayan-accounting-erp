-- V28__audit_public_writes.sql
--
-- PHASE 10.6.3 — audit WITH CHECK for unscoped server writes.
--
-- V26 bound both audit tables (audit.audit_logs and core.settings_audit) to
-- the request session actor: a row may only be written when its user_id
-- equals kayan.user_id. That binding is correct for scoped API requests, but
-- two other legitimate write paths have NO session actor at all:
--
--   * POST /auth/login (a public path — the middleware never sets kayan.*)
--   * boot/seed code and service-layer calls that run without a request
--
-- Since V26 every such audit insert was rejected by WITH CHECK and silently
-- dropped by logAudit's catch — login events and boot-time audit vanished.
--
-- The fix relaxes ONLY the write side: when the request has no session actor
-- (kayan.user_id empty/unset), the server may write the row it computed.
-- READS keep the exact same strict owner binding as V26. This remains safe:
-- audit rows are written exclusively by server code under the kayan_api
-- role, and a request that DOES carry a session actor keeps the strict
-- user_id binding.

DO $$
BEGIN
  -- audit.audit_logs ------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'audit' AND c.relname = 'audit_logs') THEN
    DROP POLICY IF EXISTS user_data_scope ON audit.audit_logs;
    EXECUTE $policy$
      CREATE POLICY user_data_scope ON audit.audit_logs
      FOR ALL
      USING (security.current_scope_row_allowed(NULL::UUID, NULL::UUID, user_id))
      WITH CHECK (
        security.current_scope_row_allowed(NULL::UUID, NULL::UUID, user_id)
        OR NULLIF(current_setting('kayan.user_id', TRUE), '') IS NULL
      )
    $policy$;
  END IF;

  -- core.settings_audit ----------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'core' AND c.relname = 'settings_audit') THEN
    DROP POLICY IF EXISTS user_data_scope ON core.settings_audit;
    EXECUTE $policy$
      CREATE POLICY user_data_scope ON core.settings_audit
      FOR ALL
      USING (security.current_scope_row_allowed(NULL::UUID, NULL::UUID, user_id))
      WITH CHECK (
        security.current_scope_row_allowed(NULL::UUID, NULL::UUID, user_id)
        OR NULLIF(current_setting('kayan.user_id', TRUE), '') IS NULL
      )
    $policy$;
  END IF;
END $$;
