-- V24__permission_catalog.sql
--
-- The RBAC system shipped with a single role and two permissions, while the
-- Roles screen (and the report registry, which already declares codes like
-- 'reports.sales.view') needs a real permission catalog to assign. This
-- migration seeds the catalog every module of the application actually has:
--
--   ACCOUNTING / SALES / PURCHASING / INVENTORY / BANKING / ASSETS /
--   EXPENSES / REPORTS / SETTINGS / SYSTEM
--
-- Codes follow the '<area>.<action>' convention already used by the two
-- enforced settings permissions and by the report registry, so the catalog
-- is truthful: 'reports.*' codes are exactly the ones reportRegistry.ts
-- declares, and 'settings.*' are the two enforced write guards.
--
-- Safety properties (same as V21/V23):
--   * Purely additive: INSERT ... ON CONFLICT (code) DO NOTHING. No existing
--     row is updated, deleted or reinterpreted.
--   * SUPER_ADMIN receives every catalog permission, preserving the current
--     "administrator can do everything" behaviour while making it explicit.
--   * Idempotent: re-running is a no-op.

DO $$
DECLARE
  v_role_id UUID;
  -- code, arabic name, module, arabic description
  v_catalog TEXT[][] := ARRAY[
    -- SETTINGS (the two enforced guards; re-declared so the catalog is complete)
    ARRAY['settings.company.manage', 'إدارة إعدادات الشركة', 'SETTINGS', 'تعديل هوية الشركة والشعار والبيانات الرسمية'],
    ARRAY['settings.users.manage', 'إدارة المستخدمين والأدوار', 'SETTINGS', 'إنشاء حسابات المستخدمين وتعديلها وإسناد الأدوار وإعادة تعيين كلمات المرور'],
    ARRAY['system.settings.manage', 'إعدادات النظام العامة', 'SETTINGS', 'تعديل الإعدادات العامة وربط الحسابات وقواعد العمل'],
    ARRAY['system.audit.view', 'عرض سجل التدقيق', 'SYSTEM', 'عرض سجل التدقيق والتتبع الأمني'],
    -- REPORTS (codes already declared by src/services/reportRegistry.ts)
    ARRAY['reports.view', 'عرض التقارير', 'REPORTS', 'فتح مركز التقارير وعرض أي تقرير مسموح'],
    ARRAY['reports.financial.view', 'التقارير المالية', 'REPORTS', 'القوائم المالية ودفتر الأستاذ والميزان والأستاذ العام'],
    ARRAY['reports.sales.view', 'تقارير المبيعات والعملاء', 'REPORTS', 'كشوفات العملاء وملخص المبيعات وأعمار الديون'],
    ARRAY['reports.purchases.view', 'تقارير المشتريات والموردين', 'REPORTS', 'كشوفات الموردين وملخص المشتريات وأعمار الدائنين'],
    ARRAY['reports.inventory.view', 'تقارير المخزون', 'REPORTS', 'تقييم المخزون وحركات الأصناف والمستودعات'],
    ARRAY['reports.audit.view', 'تقارير التدقيق', 'REPORTS', 'تقارير المطابقة والسلامة المالية'],
    ARRAY['reports.export', 'تصدير وطباعة التقارير', 'REPORTS', 'التصدير إلى PDF وExcel وCSV والطباعة'],
    -- ACCOUNTING
    ARRAY['accounting.view', 'عرض الحسابات والقيود', 'ACCOUNTING', 'عرض شجرة الحسابات ودفتر اليومية'],
    ARRAY['accounting.create', 'تسجيل القيود اليومية', 'ACCOUNTING', 'إنشاء قيود اليومية اليدوية'],
    ARRAY['accounting.post', 'ترحيل القيود والإقفال', 'ACCOUNTING', 'ترحيل القيود وإقفال الفترات المالية'],
    -- SALES
    ARRAY['sales.invoices.create', 'إنشاء فواتير المبيعات', 'SALES', 'إنشاء فواتير البيع وعروض الأسعار'],
    ARRAY['sales.invoices.post', 'ترحيل فواتير المبيعات', 'SALES', 'ترحيل الفواتير وتوليد القيود والمخزون'],
    ARRAY['sales.receipts.manage', 'سندات القبض والتحصيل', 'SALES', 'تسجيل سندات القبض وتحصيل الدفعات'],
    ARRAY['sales.returns.manage', 'مردودات المبيعات', 'SALES', 'تسجيل مردودات المبيعات والإشعارات الدائنة'],
    -- PURCHASING
    ARRAY['purchasing.invoices.create', 'إنشاء فواتير المشتريات', 'PURCHASING', 'إنشاء فواتير الشراء وأوامر التوريد'],
    ARRAY['purchasing.invoices.post', 'ترحيل فواتير المشتريات', 'PURCHASING', 'ترحيل الفواتير وتوليد القيود والاستلام'],
    ARRAY['purchasing.payments.manage', 'سندات الصرف والسداد', 'PURCHASING', 'تسجيل سندات الصرف وسداد الموردين'],
    ARRAY['purchasing.returns.manage', 'مردودات المشتريات', 'PURCHASING', 'تسجيل مردودات المشتريات والإشعارات المدينة'],
    -- INVENTORY
    ARRAY['inventory.view', 'عرض المخزون', 'INVENTORY', 'عرض الأصناف والأرصدة وحركات المستودعات'],
    ARRAY['inventory.manage', 'حركات المخزون', 'INVENTORY', 'الصرف والاستلام والتحويلات بين المستودعات'],
    ARRAY['inventory.count_approve', 'اعتماد الجرد والتسويات', 'INVENTORY', 'اعتماد محاضر الجرد وتوليد تسويات المخزون'],
    -- BANKING
    ARRAY['banking.view', 'عرض الحسابات البنكية', 'BANKING', 'عرض الحسابات والكشوف والأرصدة البنكية'],
    ARRAY['banking.manage', 'العمليات البنكية', 'BANKING', 'التحويلات والتسويات البنكية وتسوية النقدية'],
    -- ASSETS
    ARRAY['assets.manage', 'إدارة الأصول الثابتة', 'ASSETS', 'سجل الأصول والإهلاك والاستبعاد'],
    -- EXPENSES
    ARRAY['expenses.manage', 'تسجيل المصروفات', 'EXPENSES', 'تسجيل المصروفات والمستحقات والمقدمات'],
    ARRAY['expenses.approve', 'اعتماد المصروفات', 'EXPENSES', 'اعتماد المصروفات فوق سقف الصلاحية']
  ];
  v_row TEXT[];
BEGIN
  FOREACH v_row SLICE 1 IN ARRAY v_catalog
  LOOP
    INSERT INTO security.permissions (code, name, module, description)
    VALUES (v_row[1], v_row[2], v_row[3], v_row[4])
    ON CONFLICT (code) DO NOTHING;
  END LOOP;

  SELECT id INTO v_role_id FROM security.roles WHERE name = 'SUPER_ADMIN' LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO security.role_permissions (role_id, permission_id)
    SELECT v_role_id, p.id FROM security.permissions p
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
