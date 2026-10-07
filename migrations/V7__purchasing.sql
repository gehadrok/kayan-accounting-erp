-- V7__purchasing.sql: Suppliers, Purchase Invoices, Supplier Payments, Taxes, and Purchasing Accounting

-- 1. Configurable Taxes in accounting
CREATE TABLE IF NOT EXISTS accounting.tax_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_tax_code UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS accounting.tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_code_id UUID NOT NULL REFERENCES accounting.tax_codes(id) ON DELETE CASCADE,
  rate_percentage NUMERIC(8, 4) NOT NULL DEFAULT 0.0000,
  valid_from DATE NOT NULL DEFAULT '2026-01-01',
  valid_to DATE,
  sales_tax_account_id UUID REFERENCES accounting.accounts(id),
  purchase_tax_account_id UUID REFERENCES accounting.accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure accounts for Purchases & Tax exist in chart of accounts
DO $$
DECLARE
  v_comp_id UUID;
  v_exp_parent UUID;
  v_assets_curr UUID;
  v_liab_curr UUID;
  v_tax_code_id UUID;
  v_tax_in_acc UUID;
  v_tax_out_acc UUID;
BEGIN
  SELECT id INTO v_comp_id FROM core.companies LIMIT 1;
  SELECT id INTO v_exp_parent FROM accounting.accounts WHERE code = '5' LIMIT 1;
  SELECT id INTO v_assets_curr FROM accounting.accounts WHERE code = '11' LIMIT 1;
  SELECT id INTO v_liab_curr FROM accounting.accounts WHERE code = '21' LIMIT 1;

  IF v_comp_id IS NOT NULL THEN
    -- Account 54: مشتريات وتكاليف البضائع
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '54') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_exp_parent, '54', 'مشتريات بضائع وتكاليف الشراء', 'EXPENSE', 2, FALSE, 'DEBIT');
    END IF;

    -- Account 1105: ضريبة القيمة المضافة على المشتريات (مدخلات)
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '1105') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_assets_curr, '1105', 'ضريبة القيمة المضافة على المشتريات (مدخلات)', 'ASSET', 3, FALSE, 'DEBIT')
      RETURNING id INTO v_tax_in_acc;
    ELSE
      SELECT id INTO v_tax_in_acc FROM accounting.accounts WHERE code = '1105' LIMIT 1;
    END IF;

    -- Account 2105: ضريبة القيمة المضافة على المبيعات (مخرجات)
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '2105') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_liab_curr, '2105', 'ضريبة القيمة المضافة على المبيعات (مخرجات)', 'LIABILITY', 3, FALSE, 'CREDIT')
      RETURNING id INTO v_tax_out_acc;
    ELSE
      SELECT id INTO v_tax_out_acc FROM accounting.accounts WHERE code = '2105' LIMIT 1;
    END IF;

    -- Seed Default Standard Tax Codes (0%, 5%, 15%)
    IF NOT EXISTS (SELECT 1 FROM accounting.tax_codes WHERE code = 'VAT-0') THEN
      INSERT INTO accounting.tax_codes (company_id, code, name, description)
      VALUES (v_comp_id, 'VAT-0', 'ضريبة صفرية (0%)', 'معفاة أو خاضعة للنسبة الصفرية')
      RETURNING id INTO v_tax_code_id;
      INSERT INTO accounting.tax_rates (tax_code_id, rate_percentage, sales_tax_account_id, purchase_tax_account_id)
      VALUES (v_tax_code_id, 0.0000, v_tax_out_acc, v_tax_in_acc);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounting.tax_codes WHERE code = 'VAT-5') THEN
      INSERT INTO accounting.tax_codes (company_id, code, name, description)
      VALUES (v_comp_id, 'VAT-5', 'ضريبة قياسية أساسية (5%)', 'النسبة القياسية العامة للضرائب')
      RETURNING id INTO v_tax_code_id;
      INSERT INTO accounting.tax_rates (tax_code_id, rate_percentage, sales_tax_account_id, purchase_tax_account_id)
      VALUES (v_tax_code_id, 5.0000, v_tax_out_acc, v_tax_in_acc);
    END IF;
  END IF;
END $$;

-- 2. Purchasing Schema
CREATE SCHEMA IF NOT EXISTS purchasing;

-- 3. Suppliers (الموردون والدائنون)
CREATE TABLE IF NOT EXISTS purchasing.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(150),
  address TEXT,
  tax_number VARCHAR(100),
  credit_limit NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  payment_terms_days INT NOT NULL DEFAULT 30,
  payables_account_id UUID REFERENCES accounting.accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_supplier_code UNIQUE (company_id, code)
);

-- 4. Supplier Addresses
CREATE TABLE IF NOT EXISTS purchasing.supplier_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES purchasing.suppliers(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Purchase Invoices (فواتير المشتريات)
CREATE TABLE IF NOT EXISTS purchasing.purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  invoice_number VARCHAR(50) NOT NULL,
  supplier_id UUID NOT NULL REFERENCES purchasing.suppliers(id),
  payment_type VARCHAR(20) NOT NULL DEFAULT 'CREDIT' CHECK (payment_type IN ('CASH', 'CREDIT')),
  posting_type VARCHAR(30) NOT NULL DEFAULT 'EXPENSE' CHECK (posting_type IN ('EXPENSE', 'INVENTORY')),
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  currency_id UUID REFERENCES core.currencies(id),
  subtotal NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  discount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  tax NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  paid_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'VOIDED')),
  journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  notes TEXT,
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_purchase_invoice_number UNIQUE (company_id, invoice_number)
);

-- 6. Purchase Invoice Lines
CREATE TABLE IF NOT EXISTS purchasing.purchase_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES purchasing.purchase_invoices(id) ON DELETE CASCADE,
  item_code VARCHAR(50),
  description TEXT NOT NULL,
  quantity NUMERIC(18, 4) NOT NULL DEFAULT 1.0000 CHECK (quantity > 0),
  unit_price NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (unit_price >= 0),
  discount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (discount >= 0),
  tax NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (tax >= 0),
  tax_code_id UUID REFERENCES accounting.tax_codes(id),
  line_total NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  line_number INT NOT NULL,
  expense_account_id UUID REFERENCES accounting.accounts(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Supplier Payments (سندات الصرف للموردين)
CREATE TABLE IF NOT EXISTS purchasing.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  payment_number VARCHAR(50) NOT NULL,
  supplier_id UUID NOT NULL REFERENCES purchasing.suppliers(id),
  payment_method VARCHAR(20) NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'BANK')),
  source_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  payment_date DATE NOT NULL,
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  allocated_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  unallocated_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  reference_number VARCHAR(100),
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'VOIDED')),
  journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_payment_number UNIQUE (company_id, payment_number)
);

-- 8. Payment Allocations (تخصيص سند الصرف على فواتير المشتريات)
CREATE TABLE IF NOT EXISTS purchasing.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES purchasing.payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES purchasing.purchase_invoices(id) ON DELETE CASCADE,
  allocated_amount NUMERIC(18, 4) NOT NULL CHECK (allocated_amount > 0),
  allocated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_payment_invoice_alloc UNIQUE (payment_id, invoice_id)
);

-- Seed initial suppliers
DO $$
DECLARE
  v_comp_id UUID;
  v_pay_acc_id UUID;
BEGIN
  SELECT id INTO v_comp_id FROM core.companies LIMIT 1;
  SELECT id INTO v_pay_acc_id FROM accounting.accounts WHERE code = '2101' LIMIT 1;

  IF v_comp_id IS NOT NULL AND v_pay_acc_id IS NOT NULL THEN
    INSERT INTO purchasing.suppliers (company_id, code, name, phone, email, address, tax_number, credit_limit, payment_terms_days, payables_account_id)
    VALUES 
    (v_comp_id, 'SUP-001', 'شركة الأمل للتوريدات والتكنولوجيا', '+967-772211001', 'supplier.alamal@example.com', 'صنعاء - شارع حدة', 'TAX-SUP-901', 200000000, 30, v_pay_acc_id),
    (v_comp_id, 'SUP-002', 'مؤسسة الجزيرة للمعدات والحلول السحابية', '+967-773322112', 'aljazeera.tech@example.com', 'عدن - المعلا', 'TAX-SUP-902', 150000000, 45, v_pay_acc_id),
    (v_comp_id, 'SUP-003', 'شركة البحر الأحمر للتجارة والاستيراد', '+967-774433223', 'redsea.import@example.com', 'الحديدة - شارع الميناء', 'TAX-SUP-903', 100000000, 60, v_pay_acc_id)
    ON CONFLICT (company_id, code) DO NOTHING;
  END IF;
END $$;
