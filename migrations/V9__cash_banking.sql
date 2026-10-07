-- V9__cash_banking.sql: Cash Boxes, Bank Accounts, Unified Transactions Ledger, Transfers, Bank Reconciliation, and Cash Counts
CREATE SCHEMA IF NOT EXISTS banking;

-- 1. Auxiliary Accounts in Chart of Accounts
DO $$
DECLARE
  v_comp_id UUID;
  v_exp_parent UUID;
  v_rev_parent UUID;
BEGIN
  SELECT id INTO v_comp_id FROM core.companies LIMIT 1;
  SELECT id INTO v_exp_parent FROM accounting.accounts WHERE code = '5' LIMIT 1;
  SELECT id INTO v_rev_parent FROM accounting.accounts WHERE code = '4' LIMIT 1;

  IF v_comp_id IS NOT NULL THEN
    -- Account 5302: عمولات ومصروفات بنكية
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '5302') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_exp_parent, '5302', 'عمولات ومصروفات بنكية', 'EXPENSE', 2, FALSE, 'DEBIT');
    END IF;

    -- Account 5303: عجز الصندوق والخزينة (مصروف خسائر عجز الصندوق)
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '5303') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_exp_parent, '5303', 'خسائر وعجز الصندوق والخزينة', 'EXPENSE', 2, FALSE, 'DEBIT');
    END IF;

    -- Account 4102: أرباح وفائض الصندوق (إيرادات متنوعة)
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '4102') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_rev_parent, '4102', 'فائض وأرباح تسوية الصندوق', 'REVENUE', 2, FALSE, 'CREDIT');
    END IF;
  END IF;
END $$;

-- 2. Cash Accounts (الخزائن والصناديق النقدية)
CREATE TABLE IF NOT EXISTS banking.cash_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'MAIN' CHECK (type IN ('MAIN', 'SALES', 'PETTY_CASH', 'BRANCH', 'CUSTOM')),
  currency_id UUID REFERENCES core.currencies(id),
  gl_account_id UUID REFERENCES accounting.accounts(id),
  opening_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_cash_account_code UNIQUE (company_id, code)
);

-- 3. Bank Accounts (حسابات البنوك)
CREATE TABLE IF NOT EXISTS banking.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  code VARCHAR(50) NOT NULL,
  bank_name VARCHAR(255) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  account_number VARCHAR(100) NOT NULL,
  iban VARCHAR(100),
  swift_bic VARCHAR(50),
  branch_name VARCHAR(150),
  currency_id UUID REFERENCES core.currencies(id),
  gl_account_id UUID REFERENCES accounting.accounts(id),
  opening_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_bank_account_code UNIQUE (company_id, code)
);

-- 4. Unified Cash & Bank Transactions Ledger (Single Source of Truth)
CREATE TABLE IF NOT EXISTS banking.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  transaction_number VARCHAR(50) NOT NULL,
  transaction_date DATE NOT NULL,
  account_category VARCHAR(20) NOT NULL CHECK (account_category IN ('CASH', 'BANK')),
  cash_account_id UUID REFERENCES banking.cash_accounts(id),
  bank_account_id UUID REFERENCES banking.bank_accounts(id),
  transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN (
    'OPENING',
    'RECEIPT',
    'PAYMENT',
    'CASH_DEPOSIT',
    'CASH_WITHDRAWAL',
    'CASH_TRANSFER_IN',
    'CASH_TRANSFER_OUT',
    'BANK_TRANSFER_IN',
    'BANK_TRANSFER_OUT',
    'BANK_CHARGE',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT'
  )),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('INFLOW', 'OUTFLOW')),
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  currency_id UUID REFERENCES core.currencies(id),
  reference_type VARCHAR(50),
  reference_id UUID,
  reference_number VARCHAR(100),
  payee_or_payer VARCHAR(255),
  description TEXT NOT NULL,
  journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  is_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
  reconciled_at TIMESTAMPTZ,
  reconciliation_id UUID,
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_bank_transaction_number UNIQUE (company_id, transaction_number),
  CONSTRAINT chk_account_target CHECK (
    (account_category = 'CASH' AND cash_account_id IS NOT NULL) OR
    (account_category = 'BANK' AND bank_account_id IS NOT NULL)
  )
);

-- 5. Cash & Bank Transfers (التحويلات النقدية والبنكية والإيداعات والسحوبات)
CREATE TABLE IF NOT EXISTS banking.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  transfer_number VARCHAR(50) NOT NULL,
  transfer_date DATE NOT NULL,
  transfer_type VARCHAR(50) NOT NULL CHECK (transfer_type IN ('CASH_TO_CASH', 'BANK_TO_BANK', 'CASH_TO_BANK', 'BANK_TO_CASH')),
  from_category VARCHAR(20) NOT NULL CHECK (from_category IN ('CASH', 'BANK')),
  from_cash_account_id UUID REFERENCES banking.cash_accounts(id),
  from_bank_account_id UUID REFERENCES banking.bank_accounts(id),
  to_category VARCHAR(20) NOT NULL CHECK (to_category IN ('CASH', 'BANK')),
  to_cash_account_id UUID REFERENCES banking.cash_accounts(id),
  to_bank_account_id UUID REFERENCES banking.bank_accounts(id),
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  fee_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (fee_amount >= 0),
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'VOIDED')),
  outflow_transaction_id UUID REFERENCES banking.transactions(id),
  inflow_transaction_id UUID REFERENCES banking.transactions(id),
  fee_transaction_id UUID REFERENCES banking.transactions(id),
  journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_transfer_number UNIQUE (company_id, transfer_number)
);

-- 6. Bank Statements (كشوف الحسابات البنكية)
CREATE TABLE IF NOT EXISTS banking.bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES banking.bank_accounts(id) ON DELETE CASCADE,
  statement_number VARCHAR(100) NOT NULL,
  statement_date DATE NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  opening_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  closing_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total_deposits NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total_withdrawals NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RECONCILED', 'LOCKED')),
  notes TEXT,
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_bank_statement_num UNIQUE (bank_account_id, statement_number)
);

-- 7. Bank Statement Lines (أسطر كشف الحساب البنكي)
CREATE TABLE IF NOT EXISTS banking.bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES banking.bank_statements(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  transaction_date DATE NOT NULL,
  reference_number VARCHAR(100),
  description TEXT NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('DEPOSIT', 'WITHDRAWAL')),
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  balance_after NUMERIC(18, 4),
  is_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
  matched_transaction_id UUID REFERENCES banking.transactions(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Bank Reconciliation Sessions (جلسات التسوية البنكية)
CREATE TABLE IF NOT EXISTS banking.bank_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES banking.bank_accounts(id),
  statement_id UUID REFERENCES banking.bank_statements(id),
  reconciliation_number VARCHAR(50) NOT NULL,
  reconciliation_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  statement_closing_balance NUMERIC(18, 4) NOT NULL,
  gl_book_balance NUMERIC(18, 4) NOT NULL,
  unreconciled_deposits NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  unreconciled_withdrawals NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  adjusted_bank_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  difference NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETED', 'LOCKED')),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_bank_reconciliation_num UNIQUE (company_id, reconciliation_number)
);

-- 9. Cash Counts (جرد الصندوق الفعلي وتسوية الفروقات)
CREATE TABLE IF NOT EXISTS banking.cash_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  cash_account_id UUID NOT NULL REFERENCES banking.cash_accounts(id),
  count_number VARCHAR(50) NOT NULL,
  count_date DATE NOT NULL,
  counted_by_name VARCHAR(150) NOT NULL,
  book_balance NUMERIC(18, 4) NOT NULL,
  actual_balance NUMERIC(18, 4) NOT NULL,
  discrepancy NUMERIC(18, 4) NOT NULL, -- actual - book
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'VOIDED')),
  adjustment_transaction_id UUID REFERENCES banking.transactions(id),
  adjustment_journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  notes TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES security.users(id),
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_cash_count_num UNIQUE (company_id, count_number)
);

-- 10. Cash Count Denominations (تفاصيل الفئات النقدية أثناء الجرد)
CREATE TABLE IF NOT EXISTS banking.cash_count_denominations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_count_id UUID NOT NULL REFERENCES banking.cash_counts(id) ON DELETE CASCADE,
  denomination_value NUMERIC(18, 4) NOT NULL,
  count_units INT NOT NULL DEFAULT 0 CHECK (count_units >= 0),
  subtotal NUMERIC(18, 4) NOT NULL DEFAULT 0.0000
);

-- 11. Seed Initial Cash Boxes and Bank Accounts
DO $$
DECLARE
  v_comp_id UUID;
  v_branch_id UUID;
  v_currency_id UUID;
  v_cash_gl_id UUID;
  v_bank_gl_id UUID;
  v_cash1_id UUID;
  v_bank1_id UUID;
BEGIN
  SELECT id INTO v_comp_id FROM core.companies LIMIT 1;
  SELECT id INTO v_branch_id FROM core.branches LIMIT 1;
  SELECT id INTO v_currency_id FROM core.currencies WHERE is_base = TRUE LIMIT 1;
  SELECT id INTO v_cash_gl_id FROM accounting.accounts WHERE code = '1101' LIMIT 1;
  SELECT id INTO v_bank_gl_id FROM accounting.accounts WHERE code = '1102' LIMIT 1;

  IF v_comp_id IS NOT NULL THEN
    -- Cash Boxes
    INSERT INTO banking.cash_accounts (company_id, branch_id, code, name, type, currency_id, gl_account_id, opening_balance, notes)
    VALUES 
    (v_comp_id, v_branch_id, 'CASH-01', 'الخزينة الرئيسية (الإدارة العامة)', 'MAIN', v_currency_id, v_cash_gl_id, 2500000.0000, 'الخزينة المركزية للإيداع والصرف اليومي')
    RETURNING id INTO v_cash1_id;

    INSERT INTO banking.cash_accounts (company_id, branch_id, code, name, type, currency_id, gl_account_id, opening_balance, notes)
    VALUES 
    (v_comp_id, v_branch_id, 'CASH-02', 'صندوق مبيعات المعرض والفرع', 'SALES', v_currency_id, v_cash_gl_id, 300000.0000, 'صندوق كاشير نقاط البيع والمبيعات المباشرة'),
    (v_comp_id, v_branch_id, 'CASH-03', 'صندوق العهد والمصروفات النثرية', 'PETTY_CASH', v_currency_id, v_cash_gl_id, 150000.0000, 'صندوق العهدة التشغيلية للمصروفات اليومية الصغيرة')
    ON CONFLICT (company_id, code) DO NOTHING;

    -- Bank Accounts
    INSERT INTO banking.bank_accounts (company_id, branch_id, code, bank_name, account_name, account_number, iban, swift_bic, branch_name, currency_id, gl_account_id, opening_balance, notes)
    VALUES 
    (v_comp_id, v_branch_id, 'BANK-01', 'بنك التضامن الإسلامي الدولي', 'شركة كيان سوفت - الحساب الجاري', '1020304050', 'YE45TADH0000001020304050', 'TADHYESA', 'فرع الزبيري - صنعاء', v_currency_id, v_bank_gl_id, 12500000.0000, 'الحساب البنكي الرئيسي للعمليات التشغيلية والتحويلات')
    RETURNING id INTO v_bank1_id;

    INSERT INTO banking.bank_accounts (company_id, branch_id, code, bank_name, account_name, account_number, iban, swift_bic, branch_name, currency_id, gl_account_id, opening_balance, notes)
    VALUES 
    (v_comp_id, v_branch_id, 'BANK-02', 'بنك الكريمي للتمويل الأصغر الإسلامي', 'شركة كيان سوفت - كريمي أعمال', '300400500', 'YE72KURM0000000300400500', 'KURMYESA', 'فرع المنصورة - عدن', v_currency_id, v_bank_gl_id, 4800000.0000, 'حساب تحصيل مبيعات الفروع ومدفوعات الموردين الإلكترونية'),
    (v_comp_id, v_branch_id, 'BANK-03', 'البنك الأهلي اليمني', 'شركة كيان سوفت - الاعتمادات', '501234', 'YE21NBYE0000000000501234', 'NBYEYESA', 'الفرع الرئيسي - كريتر', v_currency_id, v_bank_gl_id, 8000000.0000, 'حساب خاص بخطابات الضمان والاعتمادات المستندية')
    ON CONFLICT (company_id, code) DO NOTHING;

    -- Seed Opening Ledger Transactions for Initial Balances
    IF v_cash1_id IS NOT NULL THEN
      INSERT INTO banking.transactions (
        company_id, branch_id, transaction_number, transaction_date, account_category, cash_account_id,
        transaction_type, direction, amount, currency_id, reference_type, description, is_reconciled
      ) VALUES (
        v_comp_id, v_branch_id, 'TXN-INIT-CASH-01', '2026-01-01', 'CASH', v_cash1_id,
        'OPENING', 'INFLOW', 2500000.0000, v_currency_id, 'OPENING', 'رصيد افتتاحي - الخزينة الرئيسية', TRUE
      ) ON CONFLICT (company_id, transaction_number) DO NOTHING;
    END IF;

    IF v_bank1_id IS NOT NULL THEN
      INSERT INTO banking.transactions (
        company_id, branch_id, transaction_number, transaction_date, account_category, bank_account_id,
        transaction_type, direction, amount, currency_id, reference_type, description, is_reconciled
      ) VALUES (
        v_comp_id, v_branch_id, 'TXN-INIT-BANK-01', '2026-01-01', 'BANK', v_bank1_id,
        'OPENING', 'INFLOW', 12500000.0000, v_currency_id, 'OPENING', 'رصيد افتتاحي - بنك التضامن الإسلامي الدولي', TRUE
      ) ON CONFLICT (company_id, transaction_number) DO NOTHING;
    END IF;

  END IF;
END $$;
