-- V3__accounting.sql: Core Accounting & Double-Entry Ledger Schema
CREATE SCHEMA IF NOT EXISTS accounting;

-- 1. Account Types (Assets, Liabilities, Equity, Revenue, Expenses)
CREATE TABLE IF NOT EXISTS accounting.account_types (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  normal_balance VARCHAR(10) NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
  category VARCHAR(50) NOT NULL CHECK (category IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Cost Centers
CREATE TABLE IF NOT EXISTS accounting.cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_cost_center UNIQUE (company_id, code)
);

-- 3. Chart of Accounts (Tree Hierarchy)
CREATE TABLE IF NOT EXISTS accounting.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES accounting.accounts(id),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  account_type_id VARCHAR(50) NOT NULL REFERENCES accounting.account_types(id),
  level INT NOT NULL DEFAULT 1,
  is_group BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  normal_balance VARCHAR(10) NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_account_code UNIQUE (company_id, code)
);

-- 4. Fiscal Years
CREATE TABLE IF NOT EXISTS accounting.fiscal_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  year_name VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_fiscal_year UNIQUE (company_id, year_name)
);

-- 5. Fiscal Periods
CREATE TABLE IF NOT EXISTS accounting.fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id UUID NOT NULL REFERENCES accounting.fiscal_years(id) ON DELETE CASCADE,
  period_number INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'LOCKED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_fiscal_year_period UNIQUE (fiscal_year_id, period_number)
);

-- 6. Journal Sources (GL, SALES, PURCHASES, RECEIPTS, PAYMENTS, SYSTEM)
CREATE TABLE IF NOT EXISTS accounting.journal_sources (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT
);

-- 7. Journal Entries (Master Header)
CREATE TABLE IF NOT EXISTS accounting.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  entry_number VARCHAR(50) NOT NULL,
  entry_date DATE NOT NULL,
  fiscal_period_id UUID NOT NULL REFERENCES accounting.fiscal_periods(id),
  source_id VARCHAR(50) NOT NULL REFERENCES accounting.journal_sources(id),
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED')),
  posted_at TIMESTAMPTZ,
  posted_by UUID REFERENCES security.users(id),
  reversed_entry_id UUID REFERENCES accounting.journal_entries(id),
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_entry_number UNIQUE (company_id, entry_number)
);

-- 8. Journal Entry Lines (Detail Ledger Lines)
CREATE TABLE IF NOT EXISTS accounting.journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES accounting.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounting.accounts(id),
  cost_center_id UUID REFERENCES accounting.cost_centers(id),
  description TEXT,
  debit NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (debit >= 0),
  credit NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (credit >= 0),
  line_number INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_line_amount CHECK (debit > 0 OR credit > 0)
);
