-- V21__company_identity.sql (PHASE 10.0)
-- Bilingual company identity for the Settings screen, the application shell and
-- the shared print/report header.
--
-- 1. core.companies gains the fields the existing table is missing. The table
--    ALREADY has name / legal_name / tax_number / address / phone / email /
--    logo (V1), so those are reused as the ARABIC side and never renamed —
--    renaming would break every existing query and seeded row. Only genuinely
--    new columns are added.
--
-- 2. security.permissions gains 'settings.company.manage', granted to the
--    SUPER_ADMIN role, so the company-settings write endpoints are guarded by
--    the project's existing RBAC tables (security.user_roles +
--    security.role_permissions) instead of a parallel permission system.
--
-- Safety properties:
--   * Purely additive: ADD COLUMN IF NOT EXISTS / guarded constraint adds only.
--     No existing row is updated, deleted or reinterpreted.
--   * Re-running this file is harmless (every statement is guarded).
--   * `logo` already existed and was unused; it now stores the STORED FILE
--     NAME only (never a client path, never an absolute path).

-- ------------------------------------------------------------------
-- 1. Bilingual company identity columns
-- ------------------------------------------------------------------
-- English side. `name` / `address` remain the authoritative Arabic values.
ALTER TABLE core.companies
  ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);

-- Legal English name, falls back to `legal_name` (Arabic) when empty.
ALTER TABLE core.companies
  ADD COLUMN IF NOT EXISTS legal_name_en VARCHAR(255);

-- English address, falls back to `address` (Arabic) when empty.
ALTER TABLE core.companies
  ADD COLUMN IF NOT EXISTS address_en TEXT;

-- Independent English contact block. NULL = "reuse the shared value", which is
-- what keeps a single-language company from having to retype its phone/e-mail.
ALTER TABLE core.companies
  ADD COLUMN IF NOT EXISTS phone_en VARCHAR(50);

ALTER TABLE core.companies
  ADD COLUMN IF NOT EXISTS email_en VARCHAR(100);

-- Shared, language-neutral identity extras.
ALTER TABLE core.companies
  ADD COLUMN IF NOT EXISTS website VARCHAR(255);

ALTER TABLE core.companies
  ADD COLUMN IF NOT EXISTS commercial_registration VARCHAR(100);

-- Guard rails matching the style already used in V19: lengths only, no value
-- rewriting. Keeps a broken client from storing unbounded text.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_companies_name_en_len'
  ) THEN
    ALTER TABLE core.companies
      ADD CONSTRAINT chk_companies_name_en_len
      CHECK (name_en IS NULL OR char_length(name_en) <= 255);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_companies_commercial_reg_len'
  ) THEN
    ALTER TABLE core.companies
      ADD CONSTRAINT chk_companies_commercial_reg_len
      CHECK (commercial_registration IS NULL OR char_length(commercial_registration) <= 100);
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 2. RBAC permission for company-settings writes
-- ------------------------------------------------------------------
DO $$
DECLARE
  v_perm_id UUID;
  v_role_id UUID;
BEGIN
  SELECT id INTO v_perm_id FROM security.permissions WHERE code = 'settings.company.manage' LIMIT 1;
  IF v_perm_id IS NULL THEN
    INSERT INTO security.permissions (code, name, module, description)
    VALUES (
      'settings.company.manage',
      'إدارة إعدادات الشركة والشعار',
      'SETTINGS',
      'تعديل بيانات الشركة الثنائية اللغة ورفع أو إزالة شعارها'
    )
    RETURNING id INTO v_perm_id;
  END IF;

  SELECT id INTO v_role_id FROM security.roles WHERE name = 'SUPER_ADMIN' LIMIT 1;
  IF v_role_id IS NOT NULL AND v_perm_id IS NOT NULL THEN
    INSERT INTO security.role_permissions (role_id, permission_id)
    VALUES (v_role_id, v_perm_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;