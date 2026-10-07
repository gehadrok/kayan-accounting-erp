-- V13__central_settings.sql: Central Settings Hub Schema and Master Configuration Seeding

-- 1. Upgrade core.settings table with enterprise configuration metadata
ALTER TABLE core.settings 
  ADD COLUMN IF NOT EXISTS value_type VARCHAR(50) NOT NULL DEFAULT 'STRING',
  ADD COLUMN IF NOT EXISTS module VARCHAR(50) NOT NULL DEFAULT 'CORE',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS default_value JSONB,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_editable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES core.branches(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES security.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES security.users(id);

-- 2. Audit Trail for Settings Changes
CREATE TABLE IF NOT EXISTS core.settings_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(100) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  user_id UUID REFERENCES security.users(id),
  username VARCHAR(100),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Seed Default Master Configurations
DO $$
DECLARE
  v_comp_id UUID;
  v_curr_id UUID;
  v_acc_cash UUID;
  v_acc_bank UUID;
  v_acc_ar UUID;
  v_acc_ap UUID;
  v_acc_inv UUID;
  v_acc_cogs UUID;
  v_acc_rev UUID;
  v_acc_rev_ret UUID;
  v_acc_tax_in UUID;
  v_acc_tax_out UUID;
  v_acc_ast UUID;
  v_acc_ast_cip UUID;
  v_acc_ast_acc UUID;
  v_acc_ast_depr UUID;
  v_acc_ast_gain UUID;
  v_acc_ast_loss UUID;
  v_acc_exp_pur UUID;
  v_acc_exp_short UUID;
  v_acc_exp_fees UUID;
  v_acc_accrued UUID;
  v_acc_prepaid UUID;
  v_acc_retained UUID;
BEGIN
  SELECT id INTO v_comp_id FROM core.companies LIMIT 1;
  SELECT id INTO v_curr_id FROM core.currencies WHERE code = 'YER' LIMIT 1;
  IF v_curr_id IS NULL THEN SELECT id INTO v_curr_id FROM core.currencies LIMIT 1; END IF;

  -- Look up existing accounts by code
  SELECT id INTO v_acc_cash FROM accounting.accounts WHERE code = '1101' LIMIT 1;
  SELECT id INTO v_acc_bank FROM accounting.accounts WHERE code = '1102' LIMIT 1;
  SELECT id INTO v_acc_ar FROM accounting.accounts WHERE code = '1103' LIMIT 1;
  SELECT id INTO v_acc_inv FROM accounting.accounts WHERE code = '1104' LIMIT 1;
  SELECT id INTO v_acc_tax_in FROM accounting.accounts WHERE code = '1105' LIMIT 1;
  SELECT id INTO v_acc_prepaid FROM accounting.accounts WHERE code = '1106' LIMIT 1;
  
  SELECT id INTO v_acc_ast FROM accounting.accounts WHERE code = '1201' LIMIT 1;
  SELECT id INTO v_acc_ast_cip FROM accounting.accounts WHERE code = '1202' LIMIT 1;
  SELECT id INTO v_acc_ast_acc FROM accounting.accounts WHERE code = '1290' LIMIT 1;

  SELECT id INTO v_acc_ap FROM accounting.accounts WHERE code = '2101' LIMIT 1;
  SELECT id INTO v_acc_tax_out FROM accounting.accounts WHERE code = '2105' LIMIT 1;
  SELECT id INTO v_acc_accrued FROM accounting.accounts WHERE code = '2106' LIMIT 1;

  SELECT id INTO v_acc_retained FROM accounting.accounts WHERE code IN ('3102', '31') LIMIT 1;

  SELECT id INTO v_acc_rev FROM accounting.accounts WHERE code = '41' LIMIT 1;
  SELECT id INTO v_acc_rev_ret FROM accounting.accounts WHERE code IN ('4102', '41') LIMIT 1;
  SELECT id INTO v_acc_ast_gain FROM accounting.accounts WHERE code = '4103' LIMIT 1;

  SELECT id INTO v_acc_cogs FROM accounting.accounts WHERE code IN ('5001', '5101') LIMIT 1;
  SELECT id INTO v_acc_ast_depr FROM accounting.accounts WHERE code = '5301' LIMIT 1;
  SELECT id INTO v_acc_exp_fees FROM accounting.accounts WHERE code = '5302' LIMIT 1;
  SELECT id INTO v_acc_exp_short FROM accounting.accounts WHERE code = '5303' LIMIT 1;
  SELECT id INTO v_acc_ast_loss FROM accounting.accounts WHERE code = '5309' LIMIT 1;
  SELECT id INTO v_acc_exp_pur FROM accounting.accounts WHERE code = '54' LIMIT 1;

  IF v_comp_id IS NOT NULL THEN
    -- A. المؤسسة (CORE)
    INSERT INTO core.settings (company_id, key, value, default_value, value_type, module, description, is_system, is_editable, scope)
    VALUES
      (v_comp_id, 'core.company_name', to_jsonb('شركة كيان للتجارة والتوزيع'::text), to_jsonb('شركة كيان للتجارة والتوزيع'::text), 'STRING', 'CORE', 'الاسم الرسمي للمنشأة في الفواتير والتقارير', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'core.base_currency', to_jsonb(v_curr_id::text), to_jsonb(v_curr_id::text), 'CURRENCY_ID', 'CORE', 'العملة الأساسية لدفاتر المحاسبة والتقارير (ريال يمني)', TRUE, FALSE, 'COMPANY'),
      (v_comp_id, 'core.tax_number', to_jsonb('TR-7711990'::text), to_jsonb('TR-7711990'::text), 'STRING', 'CORE', 'الرقم الضريبي الرسمي المعتمد للمنشأة', FALSE, TRUE, 'COMPANY')
    ON CONFLICT (company_id, key) DO UPDATE 
    SET value_type = EXCLUDED.value_type, module = EXCLUDED.module, description = EXCLUDED.description;

    -- B. المحاسبة (ACCOUNTING)
    INSERT INTO core.settings (company_id, key, value, default_value, value_type, module, description, is_system, is_editable, scope)
    VALUES
      (v_comp_id, 'accounting.auto_post_drafts', to_jsonb(false), to_jsonb(false), 'BOOLEAN', 'ACCOUNTING', 'الترحيل التلقائي لقيود اليومية بدون مراجعة مسودة', FALSE, TRUE, 'COMPANY'),
      (v_comp_id, 'accounting.allow_backdated_entries', to_jsonb(true), to_jsonb(true), 'BOOLEAN', 'ACCOUNTING', 'السماح بتسجيل قيود بتاريخ سابق ضمن الفترات المفتوحة', FALSE, TRUE, 'COMPANY'),
      (v_comp_id, 'accounting.default_cash_account', to_jsonb(v_acc_cash::text), to_jsonb(v_acc_cash::text), 'ACCOUNT_ID', 'ACCOUNTING', 'حساب الصندوق الرئيسي الافتراضي (1101)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'accounting.default_bank_account', to_jsonb(v_acc_bank::text), to_jsonb(v_acc_bank::text), 'ACCOUNT_ID', 'ACCOUNTING', 'حساب البنك الرئيسي الافتراضي (1102)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'accounting.default_retained_earnings_account', to_jsonb(v_acc_retained::text), to_jsonb(v_acc_retained::text), 'ACCOUNT_ID', 'ACCOUNTING', 'حساب الأرباح المحتجزة لإقفال السنوات (3102)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'accounting.closing_check_strict', to_jsonb(true), to_jsonb(true), 'BOOLEAN', 'ACCOUNTING', 'فرض تدقيق ميزان المراجعة والمسودات قبل إقفال الفترة', TRUE, TRUE, 'COMPANY')
    ON CONFLICT (company_id, key) DO UPDATE 
    SET value_type = EXCLUDED.value_type, module = EXCLUDED.module, description = EXCLUDED.description;

    -- C. المبيعات (SALES)
    INSERT INTO core.settings (company_id, key, value, default_value, value_type, module, description, is_system, is_editable, scope)
    VALUES
      (v_comp_id, 'sales.invoice_prefix', to_jsonb('INV-'::text), to_jsonb('INV-'::text), 'STRING', 'SALES', 'بادئة الترقيم التسلسلي لفواتير المبيعات', FALSE, TRUE, 'COMPANY'),
      (v_comp_id, 'sales.default_revenue_account', to_jsonb(v_acc_rev::text), to_jsonb(v_acc_rev::text), 'ACCOUNT_ID', 'SALES', 'حساب إيرادات المبيعات الافتراضي (41)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'sales.default_sales_return_account', to_jsonb(COALESCE(v_acc_rev_ret, v_acc_rev)::text), to_jsonb(COALESCE(v_acc_rev_ret, v_acc_rev)::text), 'ACCOUNT_ID', 'SALES', 'حساب مردودات المبيعات الافتراضي (4102)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'sales.default_ar_account', to_jsonb(v_acc_ar::text), to_jsonb(v_acc_ar::text), 'ACCOUNT_ID', 'SALES', 'حساب مراقبة ذمم العملاء الافتراضي (1103)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'sales.default_output_tax_account', to_jsonb(v_acc_tax_out::text), to_jsonb(v_acc_tax_out::text), 'ACCOUNT_ID', 'SALES', 'حساب ضريبة القيمة المضافة على المبيعات (2105)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'sales.enforce_credit_limit', to_jsonb(true), to_jsonb(true), 'BOOLEAN', 'SALES', 'منع إصدار فواتير آجلة في حال تجاوز سقف الائتمان', FALSE, TRUE, 'COMPANY'),
      (v_comp_id, 'sales.default_payment_terms_days', to_jsonb(30), to_jsonb(30), 'INTEGER', 'SALES', 'فترة استحقاق الفواتير الآجلة بالايام الافتراضية', FALSE, TRUE, 'COMPANY')
    ON CONFLICT (company_id, key) DO UPDATE 
    SET value_type = EXCLUDED.value_type, module = EXCLUDED.module, description = EXCLUDED.description;

    -- D. المشتريات (PURCHASING)
    INSERT INTO core.settings (company_id, key, value, default_value, value_type, module, description, is_system, is_editable, scope)
    VALUES
      (v_comp_id, 'purchasing.invoice_prefix', to_jsonb('PINV-'::text), to_jsonb('PINV-'::text), 'STRING', 'PURCHASING', 'بادئة الترقيم التسلسلي لفواتير الشراء', FALSE, TRUE, 'COMPANY'),
      (v_comp_id, 'purchasing.default_expense_account', to_jsonb(COALESCE(v_acc_exp_pur, v_acc_cogs)::text), to_jsonb(COALESCE(v_acc_exp_pur, v_acc_cogs)::text), 'ACCOUNT_ID', 'PURCHASING', 'حساب مشتريات وتكاليف البضائع (54)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'purchasing.default_ap_account', to_jsonb(v_acc_ap::text), to_jsonb(v_acc_ap::text), 'ACCOUNT_ID', 'PURCHASING', 'حساب مراقبة ذمم الموردين الافتراضي (2101)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'purchasing.default_input_tax_account', to_jsonb(v_acc_tax_in::text), to_jsonb(v_acc_tax_in::text), 'ACCOUNT_ID', 'PURCHASING', 'حساب ضريبة المدخلات على المشتريات (1105)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'purchasing.default_payment_terms_days', to_jsonb(30), to_jsonb(30), 'INTEGER', 'PURCHASING', 'فترة سداد الموردين الافتراضية بالايام', FALSE, TRUE, 'COMPANY')
    ON CONFLICT (company_id, key) DO UPDATE 
    SET value_type = EXCLUDED.value_type, module = EXCLUDED.module, description = EXCLUDED.description;

    -- E. المخزون (INVENTORY)
    INSERT INTO core.settings (company_id, key, value, default_value, value_type, module, description, is_system, is_editable, scope)
    VALUES
      (v_comp_id, 'inventory.valuation_method', to_jsonb('WAC'::text), to_jsonb('WAC'::text), 'STRING', 'INVENTORY', 'طريقة تقييم المخزون المعتمدة (متوسط التكلفة المرجح WAC)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'inventory.allow_negative_stock', to_jsonb(false), to_jsonb(false), 'BOOLEAN', 'INVENTORY', 'السماح بصرف الأصناف برصيد سالب (افتراضياً ممنوع لمنع تشوه التكلفة)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'inventory.default_inventory_account', to_jsonb(v_acc_inv::text), to_jsonb(v_acc_inv::text), 'ACCOUNT_ID', 'INVENTORY', 'حساب مراقبة المخزون السلعي التام (1104)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'inventory.default_cogs_account', to_jsonb(v_acc_cogs::text), to_jsonb(v_acc_cogs::text), 'ACCOUNT_ID', 'INVENTORY', 'حساب تكلفة البضاعة المباعة COGS (5001)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'inventory.auto_create_issue_on_sale', to_jsonb(true), to_jsonb(true), 'BOOLEAN', 'INVENTORY', 'توليد حركة صرف مخزني وقيد تكلفة آلياً عند ترحيل فاتورة البيع', FALSE, TRUE, 'COMPANY'),
      (v_comp_id, 'inventory.reorder_notification_threshold', to_jsonb(10), to_jsonb(10), 'INTEGER', 'INVENTORY', 'حد التنبيه الافتراضي لإعادة طلب الأصناف', FALSE, TRUE, 'COMPANY')
    ON CONFLICT (company_id, key) DO UPDATE 
    SET value_type = EXCLUDED.value_type, module = EXCLUDED.module, description = EXCLUDED.description;

    -- F. الخزينة والبنوك (CASH & BANKING)
    INSERT INTO core.settings (company_id, key, value, default_value, value_type, module, description, is_system, is_editable, scope)
    VALUES
      (v_comp_id, 'cash.default_cash_account', to_jsonb(v_acc_cash::text), to_jsonb(v_acc_cash::text), 'ACCOUNT_ID', 'CASH', 'حساب الصندوق الافتراضي للعمليات النقدية (1101)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'cash.shortage_expense_account', to_jsonb(COALESCE(v_acc_exp_short, v_acc_exp_fees)::text), to_jsonb(COALESCE(v_acc_exp_short, v_acc_exp_fees)::text), 'ACCOUNT_ID', 'CASH', 'حساب عجز الصندوق الناتج عن الجرد الفعلي (5303)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'cash.overage_revenue_account', to_jsonb(COALESCE(v_acc_ast_gain, v_acc_rev)::text), to_jsonb(COALESCE(v_acc_ast_gain, v_acc_rev)::text), 'ACCOUNT_ID', 'CASH', 'حساب فائض الصندوق الناتج عن الجرد الفعلي (4103)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'banking.default_bank_account', to_jsonb(v_acc_bank::text), to_jsonb(v_acc_bank::text), 'ACCOUNT_ID', 'BANKING', 'حساب البنك الافتراضي للعمليات البنكية (1102)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'banking.bank_charges_account', to_jsonb(COALESCE(v_acc_exp_fees, v_acc_cogs)::text), to_jsonb(COALESCE(v_acc_exp_fees, v_acc_cogs)::text), 'ACCOUNT_ID', 'BANKING', 'حساب العمولات والمصاريف البنكية (5302)', TRUE, TRUE, 'COMPANY')
    ON CONFLICT (company_id, key) DO UPDATE 
    SET value_type = EXCLUDED.value_type, module = EXCLUDED.module, description = EXCLUDED.description;

    -- G. الأصول الثابتة (ASSETS)
    INSERT INTO core.settings (company_id, key, value, default_value, value_type, module, description, is_system, is_editable, scope)
    VALUES
      (v_comp_id, 'assets.default_depreciation_method', to_jsonb('STRAIGHT_LINE'::text), to_jsonb('STRAIGHT_LINE'::text), 'STRING', 'ASSETS', 'طريقة الإهلاك الافتراضية (القسط الثابت)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'assets.default_fixed_asset_account', to_jsonb(v_acc_ast::text), to_jsonb(v_acc_ast::text), 'ACCOUNT_ID', 'ASSETS', 'حساب تكلفة الأصول الثابتة (1201)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'assets.default_cip_account', to_jsonb(COALESCE(v_acc_ast_cip, v_acc_ast)::text), to_jsonb(COALESCE(v_acc_ast_cip, v_acc_ast)::text), 'ACCOUNT_ID', 'ASSETS', 'حساب أصول تحت التنفيذ والإنشاء (1202)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'assets.default_accumulated_depreciation_account', to_jsonb(v_acc_ast_acc::text), to_jsonb(v_acc_ast_acc::text), 'ACCOUNT_ID', 'ASSETS', 'حساب مجمع إهلاك الأصول الثابتة (1290)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'assets.default_depreciation_expense_account', to_jsonb(COALESCE(v_acc_ast_depr, v_acc_cogs)::text), to_jsonb(COALESCE(v_acc_ast_depr, v_acc_cogs)::text), 'ACCOUNT_ID', 'ASSETS', 'حساب مصروف إهلاك الأصول السنوي (5301)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'assets.default_disposal_gain_account', to_jsonb(COALESCE(v_acc_ast_gain, v_acc_rev)::text), to_jsonb(COALESCE(v_acc_ast_gain, v_acc_rev)::text), 'ACCOUNT_ID', 'ASSETS', 'حساب أرباح استبعاد وبيع الأصول (4103)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'assets.default_disposal_loss_account', to_jsonb(COALESCE(v_acc_ast_loss, v_acc_exp_fees)::text), to_jsonb(COALESCE(v_acc_ast_loss, v_acc_exp_fees)::text), 'ACCOUNT_ID', 'ASSETS', 'حساب خسائر استبعاد وبيع الأصول (5309)', TRUE, TRUE, 'COMPANY')
    ON CONFLICT (company_id, key) DO UPDATE 
    SET value_type = EXCLUDED.value_type, module = EXCLUDED.module, description = EXCLUDED.description;

    -- H. المصروفات (EXPENSES)
    INSERT INTO core.settings (company_id, key, value, default_value, value_type, module, description, is_system, is_editable, scope)
    VALUES
      (v_comp_id, 'expenses.require_approval_above_amount', to_jsonb(500000), to_jsonb(500000), 'DECIMAL', 'EXPENSES', 'سقف المصروف الذي يتطلب اعتماداً إدارياً قبل الصرف', FALSE, TRUE, 'COMPANY'),
      (v_comp_id, 'expenses.default_accrued_account', to_jsonb(v_acc_accrued::text), to_jsonb(v_acc_accrued::text), 'ACCOUNT_ID', 'EXPENSES', 'حساب المصروفات المستحقة (2106)', TRUE, TRUE, 'COMPANY'),
      (v_comp_id, 'expenses.default_prepaid_account', to_jsonb(v_acc_prepaid::text), to_jsonb(v_acc_prepaid::text), 'ACCOUNT_ID', 'EXPENSES', 'حساب المصروفات المدفوعة مقدماً (1106)', TRUE, TRUE, 'COMPANY')
    ON CONFLICT (company_id, key) DO UPDATE 
    SET value_type = EXCLUDED.value_type, module = EXCLUDED.module, description = EXCLUDED.description;

    -- I. الضرائب (TAX)
    INSERT INTO core.settings (company_id, key, value, default_value, value_type, module, description, is_system, is_editable, scope)
    VALUES
      (v_comp_id, 'tax.is_tax_enabled', to_jsonb(true), to_jsonb(true), 'BOOLEAN', 'TAX', 'تفعيل حساب ضريبة القيمة المضافة في الفواتير', FALSE, TRUE, 'COMPANY'),
      (v_comp_id, 'tax.default_tax_code', to_jsonb('VAT-0'::text), to_jsonb('VAT-0'::text), 'STRING', 'TAX', 'رمز الضريبة الافتراضي المطبق على العمليات', FALSE, TRUE, 'COMPANY')
    ON CONFLICT (company_id, key) DO UPDATE 
    SET value_type = EXCLUDED.value_type, module = EXCLUDED.module, description = EXCLUDED.description;

    -- J. التقارير والواجهة (REPORTS & UI)
    INSERT INTO core.settings (company_id, key, value, default_value, value_type, module, description, is_system, is_editable, scope)
    VALUES
      (v_comp_id, 'reports.currency_symbol', to_jsonb('YER'::text), to_jsonb('YER'::text), 'STRING', 'REPORTS', 'رمز العملة المعروض في كشوف الحسابات والقوائم', FALSE, TRUE, 'COMPANY'),
      (v_comp_id, 'reports.decimal_places', to_jsonb(2), to_jsonb(2), 'INTEGER', 'REPORTS', 'عدد المنازل العشرية في العمليات والمبالغ', FALSE, TRUE, 'COMPANY'),
      (v_comp_id, 'reports.show_zero_balance_accounts', to_jsonb(false), to_jsonb(false), 'BOOLEAN', 'REPORTS', 'إظهار الحسابات ذات الرصيد الصفري في ميزان المراجعة والأستاذ', FALSE, TRUE, 'COMPANY'),
      (v_comp_id, 'ui.language', to_jsonb('ar'::text), to_jsonb('ar'::text), 'STRING', 'UI', 'لغة واجهة النظام الافتراضية', FALSE, TRUE, 'USER'),
      (v_comp_id, 'ui.direction', to_jsonb('rtl'::text), to_jsonb('rtl'::text), 'STRING', 'UI', 'اتجاه الشاشة (RTL من اليمين لليسار)', FALSE, TRUE, 'USER')
    ON CONFLICT (company_id, key) DO UPDATE 
    SET value_type = EXCLUDED.value_type, module = EXCLUDED.module, description = EXCLUDED.description;

  END IF;
END $$;
