-- V26__user_data_scopes.sql
--
-- Additive user/company/branch authorization scopes and database row security.
-- Existing users intentionally receive NO scope grants. The actual SUPER_ADMIN
-- role receives the new permission catalog entries; permissions do not grant
-- data scope.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'core.branches'::regclass
      AND conname = 'uq_company_branch_identity'
  ) THEN
    ALTER TABLE core.branches
      ADD CONSTRAINT uq_company_branch_identity UNIQUE (company_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS security.user_company_scopes (
  user_id UUID NOT NULL REFERENCES security.users(id),
  company_id UUID NOT NULL REFERENCES core.companies(id),
  granted_by UUID REFERENCES security.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE IF NOT EXISTS security.user_branch_scopes (
  user_id UUID NOT NULL REFERENCES security.users(id),
  company_id UUID NOT NULL REFERENCES core.companies(id),
  branch_id UUID NOT NULL,
  granted_by UUID REFERENCES security.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, company_id, branch_id),
  CONSTRAINT fk_user_branch_scope_company_branch
    FOREIGN KEY (company_id, branch_id)
    REFERENCES core.branches(company_id, id)
);

CREATE INDEX IF NOT EXISTS idx_user_branch_scopes_branch
  ON security.user_branch_scopes (branch_id, company_id);

CREATE OR REPLACE FUNCTION security.user_can_access_company(p_user_id UUID, p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, security
AS $$
  SELECT p_user_id IS NOT NULL
     AND p_company_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM security.user_company_scopes ucs
       WHERE ucs.user_id = p_user_id AND ucs.company_id = p_company_id
     )
$$;

CREATE OR REPLACE FUNCTION security.user_can_access_branch(
  p_user_id UUID,
  p_company_id UUID,
  p_branch_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, security, core
AS $$
  SELECT p_user_id IS NOT NULL
     AND p_company_id IS NOT NULL
     AND p_branch_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM security.user_branch_scopes ubs
       JOIN core.branches b
         ON b.id = ubs.branch_id AND b.company_id = ubs.company_id
       WHERE ubs.user_id = p_user_id
         AND ubs.company_id = p_company_id
         AND ubs.branch_id = p_branch_id
         AND b.is_active = TRUE
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
  v_branch_id UUID := NULLIF(current_setting('kayan.branch_id', TRUE), '')::UUID;
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
       AND v_branch_id = p_branch_id
       AND security.user_can_access_branch(v_user_id, v_row_company_id, p_branch_id);
  END IF;

  RETURN p_company_id IS NOT NULL
     AND v_company_id = p_company_id
     AND security.user_can_access_company(v_user_id, p_company_id);
END
$$;

CREATE OR REPLACE FUNCTION security.current_company_allowed(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, security
AS $$
  SELECT p_company_id = NULLIF(current_setting('kayan.company_id', TRUE), '')::UUID
     AND security.user_can_access_company(
       NULLIF(current_setting('kayan.user_id', TRUE), '')::UUID,
       p_company_id
     )
$$;

CREATE OR REPLACE FUNCTION security.current_branch_allowed(p_company_id UUID, p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, security
AS $$
  SELECT p_company_id = NULLIF(current_setting('kayan.company_id', TRUE), '')::UUID
     AND p_branch_id = NULLIF(current_setting('kayan.branch_id', TRUE), '')::UUID
     AND security.user_can_access_branch(
       NULLIF(current_setting('kayan.user_id', TRUE), '')::UUID,
       p_company_id,
       p_branch_id
     )
$$;

CREATE OR REPLACE FUNCTION security.current_scope_context_valid(
  p_user_id UUID,
  p_company_id UUID,
  p_branch_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, security, core
AS $$
  SELECT p_user_id IS NOT NULL
     AND p_company_id IS NOT NULL
     AND p_user_id = NULLIF(current_setting('kayan.user_id', TRUE), '')::UUID
     AND p_company_id = NULLIF(current_setting('kayan.company_id', TRUE), '')::UUID
     AND (
       (p_branch_id IS NULL AND security.user_can_access_company(p_user_id, p_company_id))
       OR (
         p_branch_id = NULLIF(current_setting('kayan.branch_id', TRUE), '')::UUID
         AND security.user_can_access_branch(p_user_id, p_company_id, p_branch_id)
       )
     )
$$;

CREATE OR REPLACE FUNCTION security.scope_policy_expression(
  p_relation OID,
  p_alias TEXT,
  p_seen OID[] DEFAULT ARRAY[]::OID[]
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, security
AS $$
DECLARE
  v_schema TEXT;
  v_table TEXT;
  v_has_company BOOLEAN;
  v_has_branch BOOLEAN;
  v_has_user BOOLEAN;
  v_company_ref TEXT;
  v_branch_ref TEXT;
  v_user_ref TEXT;
  v_terms TEXT[] := ARRAY[]::TEXT[];
  v_fk RECORD;
  v_parent_expression TEXT;
  v_parent_alias TEXT;
  v_join TEXT;
  v_optional_fk BOOLEAN;
  v_null_guard TEXT;
BEGIN
  IF p_relation = ANY(p_seen) THEN
    RETURN 'FALSE';
  END IF;

  SELECT n.nspname, c.relname,
         BOOL_OR(a.attname = 'company_id'),
         BOOL_OR(a.attname = 'branch_id'),
         BOOL_OR(a.attname = 'user_id')
    INTO v_schema, v_table, v_has_company, v_has_branch, v_has_user
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attribute a
    ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE c.oid = p_relation
  GROUP BY n.nspname, c.relname;

  IF v_schema IS NULL THEN
    RETURN 'FALSE';
  END IF;

  IF v_schema = 'core' AND v_table = 'companies' THEN
    RETURN format(
      'security.current_company_allowed(%s)',
      CASE WHEN p_alias IS NULL THEN '"id"' ELSE format('%I.id', p_alias) END
    );
  END IF;

  IF v_schema = 'core' AND v_table = 'branches' THEN
    RETURN format(
      'security.current_branch_allowed(%s, %s)',
      CASE WHEN p_alias IS NULL THEN '"company_id"' ELSE format('%I.company_id', p_alias) END,
      CASE WHEN p_alias IS NULL THEN '"id"' ELSE format('%I.id', p_alias) END
    );
  END IF;

  v_company_ref := CASE WHEN p_alias IS NULL THEN '"company_id"' ELSE format('%I.company_id', p_alias) END;
  v_branch_ref := CASE WHEN p_alias IS NULL THEN '"branch_id"' ELSE format('%I.branch_id', p_alias) END;
  v_user_ref := CASE WHEN p_alias IS NULL THEN '"user_id"' ELSE format('%I.user_id', p_alias) END;

  IF COALESCE(v_has_company, FALSE) OR COALESCE(v_has_branch, FALSE) THEN
    IF COALESCE(v_has_user, FALSE) THEN
      RETURN format(
        'security.current_scope_row_allowed(%s, %s, %s)',
        CASE WHEN v_has_company THEN v_company_ref ELSE 'NULL::UUID' END,
        CASE WHEN v_has_branch THEN v_branch_ref ELSE 'NULL::UUID' END,
        v_user_ref
      );
    END IF;
    RETURN format(
      'security.current_scope_row_allowed(%s, %s)',
      CASE WHEN v_has_company THEN v_company_ref ELSE 'NULL::UUID' END,
      CASE WHEN v_has_branch THEN v_branch_ref ELSE 'NULL::UUID' END
    );
  END IF;

  FOR v_fk IN
    SELECT con.oid, con.confrelid, parent_ns.nspname AS parent_schema,
           parent.relname AS parent_table
    FROM pg_constraint con
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE con.conrelid = p_relation AND con.contype = 'f'
    ORDER BY con.oid
  LOOP
    v_parent_alias := format('scope_parent_%s', cardinality(p_seen) + 1);
    v_parent_expression := security.scope_policy_expression(
      v_fk.confrelid,
      v_parent_alias,
      p_seen || p_relation
    );
    IF v_parent_expression = 'FALSE' THEN
      CONTINUE;
    END IF;

    SELECT string_agg(
      format(
        '%I.%I = %s',
        v_parent_alias,
        parent_attr.attname,
        CASE WHEN p_alias IS NULL THEN format('%I', child_attr.attname)
             ELSE format('%I.%I', p_alias, child_attr.attname)
        END
      ),
      ' AND ' ORDER BY key_pair.ord
    ), bool_and(NOT child_attr.attnotnull),
       string_agg(
         format('%s IS NULL',
           CASE WHEN p_alias IS NULL THEN format('%I', child_attr.attname)
                ELSE format('%I.%I', p_alias, child_attr.attname)
           END
         ),
         ' AND ' ORDER BY key_pair.ord
       )
    INTO v_join, v_optional_fk, v_null_guard
    FROM pg_constraint con
    CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY
      AS key_pair(child_attnum, parent_attnum, ord)
    JOIN pg_attribute child_attr
      ON child_attr.attrelid = con.conrelid AND child_attr.attnum = key_pair.child_attnum
    JOIN pg_attribute parent_attr
      ON parent_attr.attrelid = con.confrelid AND parent_attr.attnum = key_pair.parent_attnum
    WHERE con.oid = v_fk.oid;

    IF v_optional_fk THEN
      v_terms := array_append(v_terms, format(
        '((%s) OR EXISTS (SELECT 1 FROM %I.%I AS %I WHERE %s AND (%s)))',
        v_null_guard,
        v_fk.parent_schema,
        v_fk.parent_table,
        v_parent_alias,
        v_join,
        v_parent_expression
      ));
    ELSE
      v_terms := array_append(v_terms, format(
        'EXISTS (SELECT 1 FROM %I.%I AS %I WHERE %s AND (%s))',
        v_fk.parent_schema,
        v_fk.parent_table,
        v_parent_alias,
        v_join,
        v_parent_expression
      ));
    END IF;
  END LOOP;

  IF cardinality(v_terms) = 0 THEN
    RETURN 'FALSE';
  END IF;
  RETURN '(' || array_to_string(v_terms, ' AND ') || ')';
END
$$;

DO $$
DECLARE
  v_table RECORD;
  v_expression TEXT;
  v_policy_name TEXT;
BEGIN
  FOR v_table IN
    SELECT c.oid, n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname IN ('core', 'accounting', 'sales', 'purchasing', 'inventory', 'banking', 'assets', 'expenses', 'audit')
    ORDER BY n.nspname, c.relname
  LOOP
    IF v_table.nspname = 'core' AND v_table.relname = 'settings_audit' THEN
      v_expression := 'security.current_scope_row_allowed(NULL::UUID, NULL::UUID, user_id)';
    ELSIF v_table.nspname = 'audit' AND v_table.relname = 'audit_logs' THEN
      v_expression := 'security.current_scope_row_allowed(NULL::UUID, NULL::UUID, user_id)';
    ELSE
      v_expression := security.scope_policy_expression(v_table.oid, NULL);
    END IF;

    IF v_expression = 'FALSE' THEN
      CONTINUE;
    END IF;

    v_policy_name := 'user_data_scope';
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', v_table.nspname, v_table.relname);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', v_table.nspname, v_table.relname);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', v_policy_name, v_table.nspname, v_table.relname);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR ALL USING (%s) WITH CHECK (%s)',
      v_policy_name, v_table.nspname, v_table.relname, v_expression, v_expression
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION security.list_user_access_scopes(p_user_id UUID)
RETURNS TABLE(company_id UUID, company_name TEXT, branch_id UUID, branch_name TEXT, scope_type TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, security, core
AS $$
  SELECT c.id, c.name::TEXT, NULL::UUID, NULL::TEXT, 'COMPANY'::TEXT
  FROM security.user_company_scopes ucs
  JOIN core.companies c ON c.id = ucs.company_id
  WHERE ucs.user_id = p_user_id
  UNION ALL
  SELECT c.id, c.name::TEXT, b.id, b.name::TEXT, 'BRANCH'::TEXT
  FROM security.user_branch_scopes ubs
  JOIN core.companies c ON c.id = ubs.company_id
  JOIN core.branches b ON b.id = ubs.branch_id AND b.company_id = ubs.company_id
  WHERE ubs.user_id = p_user_id AND b.is_active = TRUE
$$;

CREATE OR REPLACE FUNCTION security.list_access_scope_catalog()
RETURNS TABLE(company_id UUID, company_name TEXT, branch_id UUID, branch_name TEXT, branch_active BOOLEAN)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core
AS $$
  SELECT c.id, c.name::TEXT, b.id, b.name::TEXT, b.is_active
  FROM core.companies c
  LEFT JOIN core.branches b ON b.company_id = c.id
  ORDER BY c.name, b.name
$$;

CREATE OR REPLACE FUNCTION security.list_company_access_catalog()
RETURNS TABLE(company_id UUID, company_name TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core
AS $$
  SELECT c.id, c.name::TEXT
  FROM core.companies c
  ORDER BY c.name
$$;

REVOKE ALL ON FUNCTION security.scope_policy_expression(OID, TEXT, OID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.user_can_access_company(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.user_can_access_branch(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.current_scope_row_allowed(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.current_company_allowed(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.current_branch_allowed(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.current_scope_context_valid(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.list_user_access_scopes(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.list_access_scope_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION security.list_company_access_catalog() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kayan_api') THEN
    CREATE ROLE kayan_api NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA core, security, accounting, sales, purchasing, inventory, banking, assets, expenses, audit TO kayan_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core, security, accounting, sales, purchasing, inventory, banking, assets, expenses, audit TO kayan_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core, security, accounting, sales, purchasing, inventory, banking, assets, expenses, audit TO kayan_api;
GRANT EXECUTE ON FUNCTION security.user_can_access_company(UUID, UUID) TO kayan_api;
GRANT EXECUTE ON FUNCTION security.user_can_access_branch(UUID, UUID, UUID) TO kayan_api;
GRANT EXECUTE ON FUNCTION security.current_scope_row_allowed(UUID, UUID, UUID) TO kayan_api;
GRANT EXECUTE ON FUNCTION security.current_company_allowed(UUID) TO kayan_api;
GRANT EXECUTE ON FUNCTION security.current_branch_allowed(UUID, UUID) TO kayan_api;
GRANT EXECUTE ON FUNCTION security.current_scope_context_valid(UUID, UUID, UUID) TO kayan_api;
GRANT EXECUTE ON FUNCTION security.list_user_access_scopes(UUID) TO kayan_api;
GRANT EXECUTE ON FUNCTION security.list_access_scope_catalog() TO kayan_api;
GRANT EXECUTE ON FUNCTION security.list_company_access_catalog() TO kayan_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA core, security, accounting, sales, purchasing, inventory, banking, assets, expenses, audit
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kayan_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA core, security, accounting, sales, purchasing, inventory, banking, assets, expenses, audit
  GRANT USAGE, SELECT ON SEQUENCES TO kayan_api;

DO $$
DECLARE
  v_permission TEXT[];
  v_permission_id UUID;
  v_admin_role_id UUID;
  v_permissions TEXT[][] := ARRAY[
    ARRAY['accounting.manage', 'إدارة دليل الحسابات', 'ACCOUNTING', 'إنشاء وتعديل الحسابات'],
    ARRAY['sales.view', 'عرض بيانات المبيعات', 'SALES', 'قراءة العملاء وفواتير المبيعات والقبض'],
    ARRAY['sales.customers.manage', 'إدارة العملاء', 'SALES', 'إنشاء وتعديل بيانات العملاء'],
    ARRAY['purchasing.view', 'عرض بيانات المشتريات', 'PURCHASING', 'قراءة الموردين وفواتير المشتريات والصرف'],
    ARRAY['purchasing.suppliers.manage', 'إدارة الموردين', 'PURCHASING', 'إنشاء وتعديل بيانات الموردين'],
    ARRAY['banking.view', 'عرض الحسابات البنكية والنقدية', 'BANKING', 'قراءة الحسابات والحركات البنكية والنقدية'],
    ARRAY['assets.view', 'عرض الأصول الثابتة', 'ASSETS', 'قراءة الأصول والإهلاك'],
    ARRAY['expenses.view', 'عرض المصروفات', 'EXPENSES', 'قراءة المصروفات والمستحقات'],
    ARRAY['settings.company.view', 'عرض بيانات الشركة', 'SETTINGS', 'قراءة ملف الشركة'],
    ARRAY['settings.branches.view', 'عرض الفروع المصرح بها', 'SETTINGS', 'قراءة الفروع الداخلة في نطاق المستخدم'],
    ARRAY['settings.branches.manage', 'إدارة الفروع ونطاقات الوصول', 'SETTINGS', 'إدارة إسناد الشركات والفروع للمستخدمين'],
    ARRAY['system.settings.view', 'عرض إعدادات النظام', 'SETTINGS', 'قراءة إعدادات النظام والصحة'],
    ARRAY['system.status.view', 'عرض حالة النظام', 'SYSTEM', 'قراءة حالة تشغيل النظام'],
    ARRAY['dashboard.view', 'عرض لوحة المعلومات', 'REPORTS', 'قراءة مؤشرات لوحة المعلومات'],
    ARRAY['taxes.view', 'عرض الأكواد الضريبية', 'ACCOUNTING', 'قراءة أكواد الضرائب'],
    ARRAY['taxes.manage', 'إدارة الأكواد الضريبية', 'ACCOUNTING', 'تعديل أكواد الضرائب']
  ];
BEGIN
  FOREACH v_permission SLICE 1 IN ARRAY v_permissions
  LOOP
    INSERT INTO security.permissions (code, name, module, description)
    VALUES (v_permission[1], v_permission[2], v_permission[3], v_permission[4])
    ON CONFLICT (code) DO NOTHING;
  END LOOP;

  SELECT id INTO v_admin_role_id FROM security.roles WHERE name = 'SUPER_ADMIN' LIMIT 1;
  IF v_admin_role_id IS NOT NULL THEN
    FOREACH v_permission SLICE 1 IN ARRAY v_permissions
    LOOP
      SELECT id INTO v_permission_id
      FROM security.permissions
      WHERE code = v_permission[1];
      INSERT INTO security.role_permissions (role_id, permission_id)
      VALUES (v_admin_role_id, v_permission_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$;
