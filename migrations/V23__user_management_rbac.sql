-- V23__user_management_rbac.sql
--
-- The Users Management screen (and its write APIs) are guarded by the
-- project's existing RBAC tables (security.user_roles -> security.roles ->
-- security.role_permissions -> security.permissions) instead of a parallel
-- permission model — the same pattern V21 used for 'settings.company.manage'.
--
-- Safety properties (same as V21):
--   * Purely additive: permission row + role grant only. No existing row is
--     updated, deleted or reinterpreted.
--   * Scoped to SUPER_ADMIN: only the administrator role receives the grant.
--   * Idempotent: guarded SELECTs + ON CONFLICT DO NOTHING, so re-running is
--     a no-op.

DO $$
DECLARE
  v_perm_id UUID;
  v_role_id UUID;
BEGIN
  SELECT id INTO v_perm_id FROM security.permissions WHERE code = 'settings.users.manage' LIMIT 1;
  IF v_perm_id IS NULL THEN
    INSERT INTO security.permissions (code, name, module, description)
    VALUES (
      'settings.users.manage',
      'إدارة المستخدمين والأدوار',
      'SETTINGS',
      'إنشاء حسابات المستخدمين وتعديلها وتفعيلها وإعادة تعيين كلمات المرور وإسناد الأدوار'
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
