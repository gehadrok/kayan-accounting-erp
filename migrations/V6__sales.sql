-- V6__sales.sql: Sales, Customers, Invoices, Receipts, and Allocations Schema
CREATE SCHEMA IF NOT EXISTS sales;

-- 1. Customers
CREATE TABLE IF NOT EXISTS sales.customers (
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
  receivables_account_id UUID REFERENCES accounting.accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_customer_code UNIQUE (company_id, code)
);

-- 2. Customer Addresses
CREATE TABLE IF NOT EXISTS sales.customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES sales.customers(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sales Invoices
CREATE TABLE IF NOT EXISTS sales.sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  invoice_number VARCHAR(50) NOT NULL,
  customer_id UUID NOT NULL REFERENCES sales.customers(id),
  payment_type VARCHAR(20) NOT NULL DEFAULT 'CREDIT' CHECK (payment_type IN ('CASH', 'CREDIT')),
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
  CONSTRAINT uq_company_invoice_number UNIQUE (company_id, invoice_number)
);

-- 4. Sales Invoice Lines
CREATE TABLE IF NOT EXISTS sales.sales_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES sales.sales_invoices(id) ON DELETE CASCADE,
  item_code VARCHAR(50),
  description TEXT NOT NULL,
  quantity NUMERIC(18, 4) NOT NULL DEFAULT 1.0000 CHECK (quantity > 0),
  unit_price NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (unit_price >= 0),
  discount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (discount >= 0),
  tax NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (tax >= 0),
  line_total NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  line_number INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Receipts (سندات القبض)
CREATE TABLE IF NOT EXISTS sales.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  receipt_number VARCHAR(50) NOT NULL,
  customer_id UUID NOT NULL REFERENCES sales.customers(id),
  payment_method VARCHAR(20) NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'BANK')),
  target_account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  receipt_date DATE NOT NULL,
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
  CONSTRAINT uq_company_receipt_number UNIQUE (company_id, receipt_number)
);

-- 6. Receipt Allocations (تخصيص سند القبض على فواتير)
CREATE TABLE IF NOT EXISTS sales.receipt_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES sales.receipts(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES sales.sales_invoices(id) ON DELETE CASCADE,
  allocated_amount NUMERIC(18, 4) NOT NULL CHECK (allocated_amount > 0),
  allocated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_receipt_invoice_alloc UNIQUE (receipt_id, invoice_id)
);

-- Seed initial demo customers matching dashboard context
DO $$
DECLARE
  v_comp_id UUID;
  v_rec_acc_id UUID;
BEGIN
  SELECT id INTO v_comp_id FROM core.companies LIMIT 1;
  SELECT id INTO v_rec_acc_id FROM accounting.accounts WHERE code = '1103' LIMIT 1;

  IF v_comp_id IS NOT NULL AND v_rec_acc_id IS NOT NULL THEN
    INSERT INTO sales.customers (company_id, code, name, phone, email, address, credit_limit, payment_terms_days, receivables_account_id)
    VALUES 
    (v_comp_id, 'CUST-001', 'شركة النور للتجارة', '+967-770112233', 'alnoor@example.com', 'صنعاء - شارع الزبيري', 150000000, 30, v_rec_acc_id),
    (v_comp_id, 'CUST-002', 'مؤسسة الأمل للتوزيع', '+967-771223344', 'alamal@example.com', 'عدن - المنصورة', 50000000, 45, v_rec_acc_id),
    (v_comp_id, 'CUST-003', 'عميل نقدي', '+967-772334455', 'cash@kayan-erp.com', 'الفرع الرئيسي', 0, 0, v_rec_acc_id)
    ON CONFLICT (company_id, code) DO NOTHING;
  END IF;
END $$;
