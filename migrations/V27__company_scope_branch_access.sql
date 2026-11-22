-- V27__company_scope_branch_access.sql
--
-- PHASE 10.6 — RLS read/write semantics for COMPANY-scoped sessions.
--
-- V26 implemented row-level authorization, but two of its scope helpers treat
-- a session without a `kayan.branch_id` as unauthorized for BRANCH rows:
--
--   * security.current_branch_allowed     -> the policy expression on core.branches
--   * security.current_scope_row_allowed  -> the policy expression on every
--     table carrying a branch_id column
--
-- A user granted the COMPANY scope (the generic "whole company" grant) runs
-- with kayan.branch_id = '' in the request session, so they could not read a
-- single branch row: the branches management screen came back empty, branch
-- lookups returned nothing, and branch-labelled documents stayed invisible —
-- while the very same user read every company-wide row without a problem.
--
-- The fix widens ONLY the COMPANY branch of the rule: a session that has
-- company-level access to the row's company is now allowed to read and write
-- that company's branch rows and branch-scoped documents. BRANCH-scope
-- sessions keep exactly the V26 semantics (exact branch match, active branches
-- only). No policy is recreated — both policies call these SECURITY DEFINER
-- helpers by reference, so replacing the functions updates every policy that
-- uses them.

CREATE OR REPLACE FUNCTION security.current_branch_allowed(p_company_id UUID, p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, security
AS $$
  SELECT
    (
      p_branch_id IS NOT NULL
      AND p_branch_id = NULLIF(current_setting('kayan.branch_id', TRUE), '')::UUID
      AND security.user_can_access_branch(
        NULLIF(current_setting('kayan.user_id', TRUE), '')::UUID,
        p_company_id,
        p_branch_id
      )
    )
    OR
    (
      p_company_id IS NOT NULL
      AND p_company_id = NULLIF(current_setting('kayan.company_id', TRUE), '')::UUID
      AND NULLIF(current_setting('kayan.branch_id', TRUE), '')::UUID IS NULL
      AND security.user_can_access_company(
        NULLIF(current_setting('kayan.user_id', TRUE), '')::UUID,
        p_company_id
      )
    )
$$;

CREATE OR REPLACE FUNCTION security.current_scope_row_allowed(
  p_company_id UUID,
  p_branch_id UUID,
  p_owner_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, security, core
AS $$
DECLARE
  v_user_id UUID := NULLIF(current_setting('kayan.user_id', TRUE), '')::UUID;
  v_company_id UUID := NULLIF(current_setting('kayan.company_id', TRUE), '')::UUID;
  v_row_company_id UUID := p_company_id;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_owner_user_id IS NOT NULL AND p_company_id IS NULL AND p_branch_id IS NULL THEN
    RETURN p_owner_user_id = v_user_id;
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT b.company_id INTO v_row_company_id
    FROM core.branches b
    WHERE b.id = p_branch_id;
    RETURN v_row_company_id IS NOT NULL
       AND (p_company_id IS NULL OR p_company_id = v_row_company_id)
       AND v_company_id = v_row_company_id
       AND security.current_branch_allowed(v_row_company_id, p_branch_id);
  END IF;

  RETURN p_company_id IS NOT NULL
     AND v_company_id = p_company_id
     AND security.user_can_access_company(v_user_id, p_company_id);
END
$$;

REVOKE ALL ON FUNCTION security.current_branch_allowed(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.current_scope_row_allowed(UUID, UUID, UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kayan_api') THEN
    GRANT EXECUTE ON FUNCTION security.current_branch_allowed(UUID, UUID) TO kayan_api;
    GRANT EXECUTE ON FUNCTION security.current_scope_row_allowed(UUID, UUID, UUID) TO kayan_api;
  END IF;
END $$;
