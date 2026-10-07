-- V10__fixed_assets_expenses.sql: Fixed Assets, Depreciation Engine, Maintenance, Disposals, Expense Management, Accruals, and Prepaid Schedules
CREATE SCHEMA IF NOT EXISTS assets;
CREATE SCHEMA IF NOT EXISTS expenses;

-- 1. Chart of Accounts Setup for Fixed Assets & Expenses & Prepaids
DO $$
DECLARE
  v_comp_id UUID;
  v_assets_root UUID;
  v_curr_assets UUID;
  v_curr_liab UUID;
  v_rev_root UUID;
  v_exp_root UUID;
  v_fixed_assets_group UUID;
  v_acc_depr_group UUID;
  v_op_exp UUID;
BEGIN
  SELECT id INTO v_comp_id FROM core.companies LIMIT 1;
  SELECT id INTO v_assets_root FROM accounting.accounts WHERE code = '1' LIMIT 1;
  SELECT id INTO v_curr_assets FROM accounting.accounts WHERE code = '11' LIMIT 1;
  SELECT id INTO v_curr_liab FROM accounting.accounts WHERE code = '21' LIMIT 1;
  SELECT id INTO v_rev_root FROM accounting.accounts WHERE code = '4' LIMIT 1;
  SELECT id INTO v_exp_root FROM accounting.accounts WHERE code = '5' LIMIT 1;
  SELECT id INTO v_op_exp FROM accounting.accounts WHERE code = '53' LIMIT 1;

  IF v_comp_id IS NOT NULL THEN
    -- Account 12: الأصول الثابتة (Group)
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '12') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_assets_root, '12', 'الأصول الثابتة والممتلكات', 'ASSET', 2, TRUE, 'DEBIT')
      RETURNING id INTO v_fixed_assets_group;
    ELSE
      SELECT id INTO v_fixed_assets_group FROM accounting.accounts WHERE code = '12' LIMIT 1;
    END IF;

    -- Sub-accounts under Fixed Assets (1201 to 1209)
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1201') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_fixed_assets_group, '1201', 'أراضي وعقارات', 'ASSET', 3, FALSE, 'DEBIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1202') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_fixed_assets_group, '1202', 'مباني وإنشاءات', 'ASSET', 3, FALSE, 'DEBIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1203') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_fixed_assets_group, '1203', 'سيارات ووسائل نقل', 'ASSET', 3, FALSE, 'DEBIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1204') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_fixed_assets_group, '1204', 'أجهزة حاسوب وتجهيزات تقنية', 'ASSET', 3, FALSE, 'DEBIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1205') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_fixed_assets_group, '1205', 'أثاث وتجهيزات مكتبية', 'ASSET', 3, FALSE, 'DEBIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1206') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_fixed_assets_group, '1206', 'آلات ومعدات تشغيلية', 'ASSET', 3, FALSE, 'DEBIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1209') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_fixed_assets_group, '1209', 'مشروعات وأصول تحت التنفيذ (CIP)', 'ASSET', 3, FALSE, 'DEBIT');
    END IF;

    -- Account 129: مجمع الإهلاك (Contra Asset - Normal Credit)
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1290') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_fixed_assets_group, '1290', 'مجمع إهلاك الأصول الثابتة العام', 'ASSET', 3, FALSE, 'CREDIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1292') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_fixed_assets_group, '1292', 'مجمع إهلاك المباني والإنشاءات', 'ASSET', 3, FALSE, 'CREDIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1293') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_fixed_assets_group, '1293', 'مجمع إهلاك السيارات ووسائل النقل', 'ASSET', 3, FALSE, 'CREDIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1294') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_fixed_assets_group, '1294', 'مجمع إهلاك أجهزة الحاسوب والتقنية', 'ASSET', 3, FALSE, 'CREDIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1295') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_fixed_assets_group, '1295', 'مجمع إهلاك الأثاث والتجهيزات المكتبية', 'ASSET', 3, FALSE, 'CREDIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1296') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_fixed_assets_group, '1296', 'مجمع إهلاك الآلات والمعدات', 'ASSET', 3, FALSE, 'CREDIT');
    END IF;

    -- Account 1106: مصروفات مدفوعة مقدماً (Prepaid Expenses)
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1106') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_curr_assets, '1106', 'مصروفات مدفوعة مقدماً', 'ASSET', 3, FALSE, 'DEBIT');
    END IF;

    -- Account 2106: مصروفات مستحقة الدفع (Accrued Expenses)
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '2106') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_curr_liab, '2106', 'مصروفات مستحقة الدفع', 'LIABILITY', 3, FALSE, 'CREDIT');
    END IF;

    -- Account 5301: مصروف إهلاك الأصول الثابتة
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '5301') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_exp_root, '5301', 'مصروف إهلاك الأصول الثابتة', 'EXPENSE', 2, FALSE, 'DEBIT');
    END IF;

    -- Account 4103: أرباح بيع واستبعاد أصول ثابتة
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '4103') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_rev_root, '4103', 'أرباح بيع والتخلص من أصول ثابتة', 'REVENUE', 2, FALSE, 'CREDIT');
    END IF;

    -- Account 5309: خسائر بيع واستبعاد أصول ثابتة
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '5309') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_exp_root, '5309', 'خسائر بيع والتخلص من أصول ثابتة', 'EXPENSE', 2, FALSE, 'DEBIT');
    END IF;

    -- Operating Expense Accounts (5304, 5305, 5306, 5307, 5308)
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '5304') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_exp_root, '5304', 'مصروفات كهرباء ومياه وطاقة', 'EXPENSE', 2, FALSE, 'DEBIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '5305') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_exp_root, '5305', 'مصروفات اتصالات وإنترنت', 'EXPENSE', 2, FALSE, 'DEBIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '5306') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_exp_root, '5306', 'مصروفات صيانة وإصلاحات', 'EXPENSE', 2, FALSE, 'DEBIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '5307') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_exp_root, '5307', 'مصروفات تأمين', 'EXPENSE', 2, FALSE, 'DEBIT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '5308') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_exp_root, '5308', 'مصروفات تسويق ودعاية وإعلان', 'EXPENSE', 2, FALSE, 'DEBIT');
    END IF;

    -- 2. Seed Default Cost Centers
    INSERT INTO accounting.cost_centers (company_id, code, name, is_active)
    VALUES 
    (v_comp_id, 'CC-01', 'الإدارة العامة والمكتب التنفيذي', TRUE),
    (v_comp_id, 'CC-02', 'إدارة العمليات والتشغيل', TRUE),
    (v_comp_id, 'CC-03', 'المبيعات والتسويق', TRUE),
    (v_comp_id, 'CC-04', 'تقنية المعلومات والدعم الفني', TRUE)
    ON CONFLICT (company_id, code) DO NOTHING;

  END IF;
END $$;

-- 2. Asset Categories (فئات الأصول الثابتة)
CREATE TABLE IF NOT EXISTS assets.asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  useful_life_months INT NOT NULL DEFAULT 60 CHECK (useful_life_months > 0),
  depreciation_method VARCHAR(50) NOT NULL DEFAULT 'STRAIGHT_LINE' CHECK (depreciation_method IN ('STRAIGHT_LINE', 'NONE')),
  asset_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  accumulated_depreciation_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  depreciation_expense_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  disposal_gain_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  disposal_loss_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_asset_cat_code UNIQUE (company_id, code)
);

-- 3. Fixed Assets Master (سجل الأصول الثابتة)
CREATE TABLE IF NOT EXISTS assets.fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  cost_center_id UUID REFERENCES accounting.cost_centers(id),
  asset_code VARCHAR(50) NOT NULL,
  asset_name VARCHAR(255) NOT NULL,
  category_id UUID NOT NULL REFERENCES assets.asset_categories(id),
  acquisition_date DATE NOT NULL,
  capitalization_date DATE,
  acquisition_cost NUMERIC(18, 4) NOT NULL CHECK (acquisition_cost > 0),
  salvage_value NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (salvage_value >= 0),
  useful_life_months INT NOT NULL CHECK (useful_life_months > 0),
  depreciation_method VARCHAR(50) NOT NULL DEFAULT 'STRAIGHT_LINE',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'UNDER_CONSTRUCTION', 'FULLY_DEPRECIATED', 'DISPOSED', 'SOLD', 'RETIRED')),
  serial_number VARCHAR(100),
  location VARCHAR(255),
  supplier_id UUID REFERENCES purchasing.suppliers(id),
  purchase_invoice_id UUID REFERENCES purchasing.purchase_invoices(id),
  acquisition_journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  asset_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  accumulated_depreciation_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  depreciation_expense_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  notes TEXT,
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_asset_code UNIQUE (company_id, asset_code)
);

-- 4. Depreciation Entries & Schedule (Single Source of Truth for Depreciation)
CREATE TABLE IF NOT EXISTS assets.depreciation_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets.fixed_assets(id) ON DELETE CASCADE,
  fiscal_period_id UUID NOT NULL REFERENCES accounting.fiscal_periods(id),
  entry_number VARCHAR(50) NOT NULL,
  period_date DATE NOT NULL,
  period_month_index INT NOT NULL,
  opening_nbv NUMERIC(18, 4) NOT NULL,
  depreciation_amount NUMERIC(18, 4) NOT NULL CHECK (depreciation_amount >= 0),
  accumulated_depreciation_after NUMERIC(18, 4) NOT NULL,
  closing_nbv NUMERIC(18, 4) NOT NULL,
  is_posted BOOLEAN NOT NULL DEFAULT FALSE,
  posted_at TIMESTAMPTZ,
  journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_asset_period_depreciation UNIQUE (asset_id, fiscal_period_id)
);

-- 5. Asset Transfers (سجل نقل الأصول بين الفروع والمراكز)
CREATE TABLE IF NOT EXISTS assets.asset_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets.fixed_assets(id) ON DELETE CASCADE,
  transfer_number VARCHAR(50) NOT NULL,
  transfer_date DATE NOT NULL,
  from_branch_id UUID REFERENCES core.branches(id),
  to_branch_id UUID REFERENCES core.branches(id),
  from_cost_center_id UUID REFERENCES accounting.cost_centers(id),
  to_cost_center_id UUID REFERENCES accounting.cost_centers(id),
  from_location VARCHAR(255),
  to_location VARCHAR(255),
  reason TEXT NOT NULL,
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Asset Maintenance & Capital Improvements (صيانة وتحسينات الأصول)
CREATE TABLE IF NOT EXISTS assets.maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets.fixed_assets(id) ON DELETE CASCADE,
  maintenance_number VARCHAR(50) NOT NULL,
  maintenance_date DATE NOT NULL,
  maintenance_type VARCHAR(30) NOT NULL DEFAULT 'EXPENSE' CHECK (maintenance_type IN ('EXPENSE', 'CAPITAL_IMPROVEMENT')),
  vendor_name VARCHAR(255),
  supplier_id UUID REFERENCES purchasing.suppliers(id),
  description TEXT NOT NULL,
  cost NUMERIC(18, 4) NOT NULL CHECK (cost > 0),
  expense_account_id UUID REFERENCES accounting.accounts(id),
  payment_method VARCHAR(20) NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'BANK', 'AP')),
  cash_account_id UUID REFERENCES banking.cash_accounts(id),
  bank_account_id UUID REFERENCES banking.bank_accounts(id),
  journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Asset Disposals & Sales (التخلص وبيع الأصول)
CREATE TABLE IF NOT EXISTS assets.disposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets.fixed_assets(id) ON DELETE CASCADE,
  disposal_number VARCHAR(50) NOT NULL,
  disposal_date DATE NOT NULL,
  disposal_type VARCHAR(30) NOT NULL CHECK (disposal_type IN ('SALE', 'SCRAP', 'RETIREMENT', 'LOSS')),
  cost_at_disposal NUMERIC(18, 4) NOT NULL,
  accumulated_depreciation_at_disposal NUMERIC(18, 4) NOT NULL,
  nbv_at_disposal NUMERIC(18, 4) NOT NULL,
  proceeds NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (proceeds >= 0),
  gain_loss_amount NUMERIC(18, 4) NOT NULL,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'BANK' CHECK (payment_method IN ('CASH', 'BANK', 'RECEIVABLE', 'NONE')),
  cash_account_id UUID REFERENCES banking.cash_accounts(id),
  bank_account_id UUID REFERENCES banking.bank_accounts(id),
  customer_id UUID REFERENCES sales.customers(id),
  journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  notes TEXT,
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Expense Categories (تصنيفات المصروفات)
CREATE TABLE IF NOT EXISTS expenses.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  gl_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  default_tax_code_id UUID REFERENCES accounting.tax_codes(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_expense_cat_code UNIQUE (company_id, code)
);

-- 9. Expense Transactions (حركات وفواتير المصروفات)
CREATE TABLE IF NOT EXISTS expenses.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  cost_center_id UUID REFERENCES accounting.cost_centers(id),
  expense_number VARCHAR(50) NOT NULL,
  expense_date DATE NOT NULL,
  category_id UUID NOT NULL REFERENCES expenses.expense_categories(id),
  supplier_id UUID REFERENCES purchasing.suppliers(id),
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  tax_code_id UUID REFERENCES accounting.tax_codes(id),
  tax_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total_amount NUMERIC(18, 4) NOT NULL CHECK (total_amount > 0),
  payment_type VARCHAR(20) NOT NULL DEFAULT 'CASH' CHECK (payment_type IN ('CASH', 'BANK', 'AP')),
  cash_account_id UUID REFERENCES banking.cash_accounts(id),
  bank_account_id UUID REFERENCES banking.bank_accounts(id),
  payment_account_id UUID REFERENCES accounting.accounts(id),
  description TEXT NOT NULL,
  reference VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'REVERSED')),
  approved_by UUID REFERENCES security.users(id),
  approved_at TIMESTAMPTZ,
  posted_by UUID REFERENCES security.users(id),
  posted_at TIMESTAMPTZ,
  journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  reversal_journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_expense_num UNIQUE (company_id, expense_number)
);

-- 10. Accrued Expenses (المصروفات المستحقة)
CREATE TABLE IF NOT EXISTS expenses.accruals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  cost_center_id UUID REFERENCES accounting.cost_centers(id),
  accrual_number VARCHAR(50) NOT NULL,
  accrual_date DATE NOT NULL,
  category_id UUID NOT NULL REFERENCES expenses.expense_categories(id),
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  expense_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  accrued_payable_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'PAID', 'REVERSED')),
  accrual_journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  payment_date DATE,
  payment_type VARCHAR(20) CHECK (payment_type IN ('CASH', 'BANK')),
  cash_account_id UUID REFERENCES banking.cash_accounts(id),
  bank_account_id UUID REFERENCES banking.bank_accounts(id),
  payment_journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_accrual_num UNIQUE (company_id, accrual_number)
);

-- 11. Prepaid Expense Schedules & Monthly Amortizations (المصروفات المدفوعة مقدماً وجدولة الإطفاء)
CREATE TABLE IF NOT EXISTS expenses.prepaid_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  cost_center_id UUID REFERENCES accounting.cost_centers(id),
  schedule_number VARCHAR(50) NOT NULL,
  payment_date DATE NOT NULL,
  total_amount NUMERIC(18, 4) NOT NULL CHECK (total_amount > 0),
  duration_months INT NOT NULL CHECK (duration_months > 0),
  monthly_amount NUMERIC(18, 4) NOT NULL CHECK (monthly_amount > 0),
  prepaid_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  expense_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('CASH', 'BANK')),
  cash_account_id UUID REFERENCES banking.cash_accounts(id),
  bank_account_id UUID REFERENCES banking.bank_accounts(id),
  payment_journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  description TEXT NOT NULL,
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_prepaid_schedule_num UNIQUE (company_id, schedule_number)
);

CREATE TABLE IF NOT EXISTS expenses.prepaid_amortizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES expenses.prepaid_schedules(id) ON DELETE CASCADE,
  fiscal_period_id UUID NOT NULL REFERENCES accounting.fiscal_periods(id),
  period_date DATE NOT NULL,
  month_index INT NOT NULL,
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  is_posted BOOLEAN NOT NULL DEFAULT FALSE,
  posted_at TIMESTAMPTZ,
  journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_schedule_period_amortization UNIQUE (schedule_id, fiscal_period_id)
);

-- 12. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_fixed_assets_code ON assets.fixed_assets(asset_code);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_cat ON assets.fixed_assets(category_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON assets.fixed_assets(status);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_acq_date ON assets.fixed_assets(acquisition_date);
CREATE INDEX IF NOT EXISTS idx_depr_asset_period ON assets.depreciation_entries(asset_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_depr_period_date ON assets.depreciation_entries(period_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses.transactions(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_cat ON expenses.transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses.transactions(status);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier ON expenses.transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_expenses_cc ON expenses.transactions(cost_center_id);

-- 13. Seed Initial Asset Categories and Expense Categories
DO $$
DECLARE
  v_comp_id UUID;
  v_land_acc UUID; v_bld_acc UUID; v_veh_acc UUID; v_comp_acc UUID; v_furn_acc UUID; v_mach_acc UUID;
  v_depr_exp UUID; v_disp_gain UUID; v_disp_loss UUID;
  v_acc_bld UUID; v_acc_veh UUID; v_acc_comp UUID; v_acc_furn UUID; v_acc_mach UUID; v_acc_gen UUID;
  v_util_acc UUID; v_tel_acc UUID; v_maint_acc UUID; v_ins_acc UUID; v_mkt_acc UUID;
  v_vat0 UUID;
BEGIN
  SELECT id INTO v_comp_id FROM core.companies LIMIT 1;
  IF v_comp_id IS NOT NULL THEN
    -- Accounts
    SELECT id INTO v_land_acc FROM accounting.accounts WHERE code = '1201' LIMIT 1;
    SELECT id INTO v_bld_acc FROM accounting.accounts WHERE code = '1202' LIMIT 1;
    SELECT id INTO v_veh_acc FROM accounting.accounts WHERE code = '1203' LIMIT 1;
    SELECT id INTO v_comp_acc FROM accounting.accounts WHERE code = '1204' LIMIT 1;
    SELECT id INTO v_furn_acc FROM accounting.accounts WHERE code = '1205' LIMIT 1;
    SELECT id INTO v_mach_acc FROM accounting.accounts WHERE code = '1206' LIMIT 1;
    
    SELECT id INTO v_acc_gen FROM accounting.accounts WHERE code = '1290' LIMIT 1;
    SELECT id INTO v_acc_bld FROM accounting.accounts WHERE code = '1292' LIMIT 1;
    SELECT id INTO v_acc_veh FROM accounting.accounts WHERE code = '1293' LIMIT 1;
    SELECT id INTO v_acc_comp FROM accounting.accounts WHERE code = '1294' LIMIT 1;
    SELECT id INTO v_acc_furn FROM accounting.accounts WHERE code = '1295' LIMIT 1;
    SELECT id INTO v_acc_mach FROM accounting.accounts WHERE code = '1296' LIMIT 1;

    SELECT id INTO v_depr_exp FROM accounting.accounts WHERE code = '5301' LIMIT 1;
    SELECT id INTO v_disp_gain FROM accounting.accounts WHERE code = '4103' LIMIT 1;
    SELECT id INTO v_disp_loss FROM accounting.accounts WHERE code = '5309' LIMIT 1;

    SELECT id INTO v_util_acc FROM accounting.accounts WHERE code = '5304' LIMIT 1;
    SELECT id INTO v_tel_acc FROM accounting.accounts WHERE code = '5305' LIMIT 1;
    SELECT id INTO v_maint_acc FROM accounting.accounts WHERE code = '5306' LIMIT 1;
    SELECT id INTO v_ins_acc FROM accounting.accounts WHERE code = '5307' LIMIT 1;
    SELECT id INTO v_mkt_acc FROM accounting.accounts WHERE code = '5308' LIMIT 1;

    SELECT id INTO v_vat0 FROM accounting.tax_codes WHERE code = 'VAT-0' LIMIT 1;

    -- Seed Asset Categories
    -- 1. أراضي (No depreciation)
    INSERT INTO assets.asset_categories (company_id, code, name, useful_life_months, depreciation_method, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, disposal_gain_account_id, disposal_loss_account_id)
    VALUES (v_comp_id, 'CAT-LAND', 'الأراضي والعقارات', 1200, 'NONE', v_land_acc, v_acc_gen, v_depr_exp, v_disp_gain, v_disp_loss)
    ON CONFLICT (company_id, code) DO NOTHING;

    -- 2. مباني وإنشاءات (240 months = 20 years)
    INSERT INTO assets.asset_categories (company_id, code, name, useful_life_months, depreciation_method, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, disposal_gain_account_id, disposal_loss_account_id)
    VALUES (v_comp_id, 'CAT-BLD', 'المباني والمنشآت', 240, 'STRAIGHT_LINE', v_bld_acc, COALESCE(v_acc_bld, v_acc_gen), v_depr_exp, v_disp_gain, v_disp_loss)
    ON CONFLICT (company_id, code) DO NOTHING;

    -- 3. سيارات ووسائل نقل (60 months = 5 years)
    INSERT INTO assets.asset_categories (company_id, code, name, useful_life_months, depreciation_method, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, disposal_gain_account_id, disposal_loss_account_id)
    VALUES (v_comp_id, 'CAT-VEH', 'السيارات ووسائل النقل', 60, 'STRAIGHT_LINE', v_veh_acc, COALESCE(v_acc_veh, v_acc_gen), v_depr_exp, v_disp_gain, v_disp_loss)
    ON CONFLICT (company_id, code) DO NOTHING;

    -- 4. أجهزة حاسوب وتقنية (36 months = 3 years)
    INSERT INTO assets.asset_categories (company_id, code, name, useful_life_months, depreciation_method, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, disposal_gain_account_id, disposal_loss_account_id)
    VALUES (v_comp_id, 'CAT-COMP', 'أجهزة الحاسوب والمعدات الرقمية', 36, 'STRAIGHT_LINE', v_comp_acc, COALESCE(v_acc_comp, v_acc_gen), v_depr_exp, v_disp_gain, v_disp_loss)
    ON CONFLICT (company_id, code) DO NOTHING;

    -- 5. أثاث وتجهيزات مكتبية (48 months = 4 years)
    INSERT INTO assets.asset_categories (company_id, code, name, useful_life_months, depreciation_method, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, disposal_gain_account_id, disposal_loss_account_id)
    VALUES (v_comp_id, 'CAT-FURN', 'الأثاث والمفروشات المكتبية', 48, 'STRAIGHT_LINE', v_furn_acc, COALESCE(v_acc_furn, v_acc_gen), v_depr_exp, v_disp_gain, v_disp_loss)
    ON CONFLICT (company_id, code) DO NOTHING;

    -- 6. آلات ومعدات تشغيلية (120 months = 10 years)
    INSERT INTO assets.asset_categories (company_id, code, name, useful_life_months, depreciation_method, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, disposal_gain_account_id, disposal_loss_account_id)
    VALUES (v_comp_id, 'CAT-MACH', 'الآلات والمعدات التشغيلية', 120, 'STRAIGHT_LINE', v_mach_acc, COALESCE(v_acc_mach, v_acc_gen), v_depr_exp, v_disp_gain, v_disp_loss)
    ON CONFLICT (company_id, code) DO NOTHING;

    -- Seed Expense Categories
    INSERT INTO expenses.expense_categories (company_id, code, name, gl_account_id, default_tax_code_id)
    VALUES 
    (v_comp_id, 'EXP-UTIL', 'كهرباء ومياه وطاقة', COALESCE(v_util_acc, v_depr_exp), v_vat0),
    (v_comp_id, 'EXP-TEL', 'اتصالات وإنترنت وهاتف', COALESCE(v_tel_acc, v_depr_exp), v_vat0),
    (v_comp_id, 'EXP-MAINT', 'صيانة وإصلاحات وتشغيل', COALESCE(v_maint_acc, v_depr_exp), v_vat0),
    (v_comp_id, 'EXP-INS', 'تأمين ورخص واشتراكات', COALESCE(v_ins_acc, v_depr_exp), v_vat0),
    (v_comp_id, 'EXP-MKT', 'دعاية وتسويق وترويج', COALESCE(v_mkt_acc, v_depr_exp), v_vat0)
    ON CONFLICT (company_id, code) DO NOTHING;

  END IF;
END $$;
