-- V11__reporting_period_closing.sql: Financial Reporting Optimization & Period Closing Workflow
ALTER TABLE accounting.fiscal_periods
  DROP CONSTRAINT IF EXISTS fiscal_periods_status_check;

ALTER TABLE accounting.fiscal_periods
  ADD CONSTRAINT fiscal_periods_status_check 
  CHECK (status IN ('OPEN', 'REVIEW', 'READY_TO_CLOSE', 'CLOSED', 'LOCKED'));

ALTER TABLE accounting.fiscal_periods
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES security.users(id),
  ADD COLUMN IF NOT EXISTS closing_notes TEXT,
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES security.users(id),
  ADD COLUMN IF NOT EXISTS reopen_reason TEXT;

ALTER TABLE accounting.fiscal_years
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES security.users(id),
  ADD COLUMN IF NOT EXISTS closing_journal_entry_id UUID REFERENCES accounting.journal_entries(id);

-- Performance Indexes for Real-Time Financial Aggregations & Reporting
CREATE INDEX IF NOT EXISTS idx_je_entry_date ON accounting.journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_je_fiscal_period ON accounting.journal_entries(fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_je_status ON accounting.journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_je_company_branch ON accounting.journal_entries(company_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_jel_account_id ON accounting.journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_jel_cost_center ON accounting.journal_entry_lines(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_jel_je_id ON accounting.journal_entry_lines(journal_entry_id);

-- Ensure Tax Accounts 1105 and 2105 exist if not already present
DO $$
DECLARE
  v_comp_id UUID;
  v_acc_curr_assets UUID;
  v_acc_curr_liab UUID;
  v_acc_equity UUID;
  v_acc_expenses UUID;
BEGIN
  SELECT id INTO v_comp_id FROM core.companies LIMIT 1;
  SELECT id INTO v_acc_curr_assets FROM accounting.accounts WHERE code = '11' LIMIT 1;
  SELECT id INTO v_acc_curr_liab FROM accounting.accounts WHERE code = '21' LIMIT 1;
  SELECT id INTO v_acc_equity FROM accounting.accounts WHERE code = '3' LIMIT 1;
  SELECT id INTO v_acc_expenses FROM accounting.accounts WHERE code = '5' LIMIT 1;

  IF v_comp_id IS NOT NULL THEN
    -- COGS account 5101 if not existing
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '5101') AND v_acc_expenses IS NOT NULL THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_acc_expenses, '5101', 'تكلفة البضاعة المباعة (COGS)', 'EXPENSE', 2, FALSE, 'DEBIT');
    END IF;

    -- Retained Earnings 32 if not existing
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '32') AND v_acc_equity IS NOT NULL THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_acc_equity, '32', 'الأرباح المبقاة والمحتجزة', 'EQUITY', 2, FALSE, 'CREDIT');
    END IF;
  END IF;
END $$;
