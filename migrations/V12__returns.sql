-- V12__returns.sql: Sales Returns and Purchase Returns Schema

CREATE TABLE IF NOT EXISTS sales.sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  return_number VARCHAR(50) NOT NULL,
  customer_id UUID NOT NULL REFERENCES sales.customers(id),
  original_invoice_id UUID REFERENCES sales.sales_invoices(id),
  return_date DATE NOT NULL,
  subtotal NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  tax NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'VOIDED')),
  journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  notes TEXT,
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_sales_return_number UNIQUE (company_id, return_number)
);

CREATE TABLE IF NOT EXISTS sales.sales_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES sales.sales_returns(id) ON DELETE CASCADE,
  item_code VARCHAR(50),
  description TEXT NOT NULL,
  quantity NUMERIC(18, 4) NOT NULL DEFAULT 1.0000 CHECK (quantity > 0),
  unit_price NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (unit_price >= 0),
  tax NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (tax >= 0),
  line_total NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  line_number INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchasing.purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  return_number VARCHAR(50) NOT NULL,
  supplier_id UUID NOT NULL REFERENCES purchasing.suppliers(id),
  original_invoice_id UUID REFERENCES purchasing.purchase_invoices(id),
  return_date DATE NOT NULL,
  subtotal NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  tax NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'VOIDED')),
  journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  notes TEXT,
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_purchase_return_number UNIQUE (company_id, return_number)
);

CREATE TABLE IF NOT EXISTS purchasing.purchase_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES purchasing.purchase_returns(id) ON DELETE CASCADE,
  item_code VARCHAR(50),
  description TEXT NOT NULL,
  quantity NUMERIC(18, 4) NOT NULL DEFAULT 1.0000 CHECK (quantity > 0),
  unit_price NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (unit_price >= 0),
  tax NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (tax >= 0),
  line_total NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  line_number INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
