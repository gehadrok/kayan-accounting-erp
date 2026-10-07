-- V5__seed.sql: Initial Seed Data for Kayan Accounting ERP
DO $$
DECLARE
  v_currency_id UUID;
  v_company_id UUID;
  v_branch_id UUID;
  v_admin_id UUID;
  v_role_admin_id UUID;
  v_fy_id UUID;
  v_p1_id UUID; v_p2_id UUID; v_p3_id UUID; v_p4_id UUID;
  v_p5_id UUID; v_p6_id UUID; v_p7_id UUID; v_p8_id UUID;
  v_p9_id UUID; v_p10_id UUID; v_p11_id UUID; v_p12_id UUID;
  
  -- Accounts
  v_acc_assets UUID;
  v_acc_curr_assets UUID;
  v_acc_cash UUID;
  v_acc_banks UUID;
  v_acc_receivables UUID;
  v_acc_inventory UUID;
  
  v_acc_liab UUID;
  v_acc_curr_liab UUID;
  v_acc_payables UUID;
  
  v_acc_equity UUID;
  v_acc_capital UUID;
  v_acc_retained UUID;
  
  v_acc_revenue UUID;
  v_acc_sales UUID;
  
  v_acc_expenses UUID;
  v_acc_salaries UUID;
  v_acc_rents UUID;
  v_acc_operations UUID;
BEGIN
  -- 1. Base Currency
  INSERT INTO core.currencies (code, name, symbol, decimal_places, is_base, is_active)
  VALUES ('YER', 'ريال يمني', 'ر.ي', 2, TRUE, TRUE)
  RETURNING id INTO v_currency_id;

  -- 2. Company
  INSERT INTO core.companies (name, legal_name, tax_number, currency_id, address, phone, email)
  VALUES ('شركة كيان سوفت للأنظمة', 'شركة كيان سوفت للأنظمة والبرمجيات المحدودة', 'TAX-8849201', v_currency_id, 'الضالع - جحاف - المجمع التجاري', '+967-771234567', 'info@kayan-erp.com')
  RETURNING id INTO v_company_id;

  -- 3. Branch
  INSERT INTO core.branches (company_id, name, code, address, is_active)
  VALUES (v_company_id, 'الفرع الرئيسي - الضالع - جحاف', 'MAIN-01', 'الشارع العام - مبنى كيان', TRUE)
  RETURNING id INTO v_branch_id;

  -- 4. Admin User (Password is 'admin123' bcrypt hash)
  INSERT INTO security.users (username, password_hash, full_name, email, is_active)
  VALUES ('admin', '$2a$10$wE9q34KspL1.fB197iZ5x.c8y4tAOmcI4cT0061e3PzE01Qj5n63i', 'جهاد الصليحي', 'admin@kayan-erp.com', TRUE)
  RETURNING id INTO v_admin_id;

  -- 5. Roles
  INSERT INTO security.roles (name, description)
  VALUES ('SUPER_ADMIN', 'مدير النظام الشامل مع صلاحيات كاملة')
  RETURNING id INTO v_role_admin_id;

  INSERT INTO security.user_roles (user_id, role_id)
  VALUES (v_admin_id, v_role_admin_id);

  -- 6. Account Types
  INSERT INTO accounting.account_types (id, name, normal_balance, category) VALUES
  ('ASSET', 'الأصول', 'DEBIT', 'ASSET'),
  ('LIABILITY', 'الالتزامات والخصوم', 'CREDIT', 'LIABILITY'),
  ('EQUITY', 'حقوق الملكية ورأس المال', 'CREDIT', 'EQUITY'),
  ('REVENUE', 'الإيرادات والمبيعات', 'CREDIT', 'REVENUE'),
  ('EXPENSE', 'المصروفات والتكاليف', 'DEBIT', 'EXPENSE');

  -- 7. Journal Sources
  INSERT INTO accounting.journal_sources (id, name, description) VALUES
  ('GL', 'قيد يومية عام', 'قيود تسوية وتعديلات محاسبية يدوية'),
  ('SALES', 'فواتير المبيعات', 'قيود ناتجة عن دورة المبيعات'),
  ('PURCHASES', 'فواتير المشتريات', 'قيود ناتجة عن دورة المشتريات'),
  ('RECEIPTS', 'سندات القبض', 'حركات توريد نقدي وبنكي'),
  ('PAYMENTS', 'سندات الصرف', 'حركات صرف نقدي وشيكات'),
  ('SYSTEM', 'قيود النظام الآلية', 'قيود الإهلاك وإقفال الفترات');

  -- 8. Chart of Accounts Tree
  -- Level 1: Assets
  INSERT INTO accounting.accounts (company_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, '1', 'الأصول', 'ASSET', 1, TRUE, 'DEBIT')
  RETURNING id INTO v_acc_assets;

  -- Level 2: Current Assets
  INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, v_acc_assets, '11', 'الأصول المتداولة', 'ASSET', 2, TRUE, 'DEBIT')
  RETURNING id INTO v_acc_curr_assets;

  -- Level 3: Detail accounts
  INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, v_acc_curr_assets, '1101', 'الصندوق والخزينة', 'ASSET', 3, FALSE, 'DEBIT')
  RETURNING id INTO v_acc_cash;

  INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, v_acc_curr_assets, '1102', 'حسابات البنوك', 'ASSET', 3, FALSE, 'DEBIT')
  RETURNING id INTO v_acc_banks;

  INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, v_acc_curr_assets, '1103', 'العملاء والمدينون', 'ASSET', 3, FALSE, 'DEBIT')
  RETURNING id INTO v_acc_receivables;

  INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, v_acc_curr_assets, '1104', 'المخزون السلعي', 'ASSET', 3, FALSE, 'DEBIT')
  RETURNING id INTO v_acc_inventory;

  -- Level 1: Liabilities
  INSERT INTO accounting.accounts (company_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, '2', 'الالتزامات والخصوم', 'LIABILITY', 1, TRUE, 'CREDIT')
  RETURNING id INTO v_acc_liab;

  INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, v_acc_liab, '21', 'الالتزامات المتداولة', 'LIABILITY', 2, TRUE, 'CREDIT')
  RETURNING id INTO v_acc_curr_liab;

  INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, v_acc_curr_liab, '2101', 'الموردون والدائنون', 'LIABILITY', 3, FALSE, 'CREDIT')
  RETURNING id INTO v_acc_payables;

  -- Level 1: Equity
  INSERT INTO accounting.accounts (company_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, '3', 'حقوق الملكية', 'EQUITY', 1, TRUE, 'CREDIT')
  RETURNING id INTO v_acc_equity;

  INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, v_acc_equity, '31', 'رأس المال المدفوع', 'EQUITY', 2, FALSE, 'CREDIT')
  RETURNING id INTO v_acc_capital;

  INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, v_acc_equity, '32', 'الأرباح المبقاة', 'EQUITY', 2, FALSE, 'CREDIT')
  RETURNING id INTO v_acc_retained;

  -- Level 1: Revenue
  INSERT INTO accounting.accounts (company_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, '4', 'الإيرادات والمبيعات', 'REVENUE', 1, TRUE, 'CREDIT')
  RETURNING id INTO v_acc_revenue;

  INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, v_acc_revenue, '41', 'إيرادات المبيعات', 'REVENUE', 2, FALSE, 'CREDIT')
  RETURNING id INTO v_acc_sales;

  -- Level 1: Expenses
  INSERT INTO accounting.accounts (company_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, '5', 'المصروفات', 'EXPENSE', 1, TRUE, 'DEBIT')
  RETURNING id INTO v_acc_expenses;

  INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, v_acc_expenses, '51', 'الرواتب والأجور', 'EXPENSE', 2, FALSE, 'DEBIT')
  RETURNING id INTO v_acc_salaries;

  INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, v_acc_expenses, '52', 'الإيجارات', 'EXPENSE', 2, FALSE, 'DEBIT')
  RETURNING id INTO v_acc_rents;

  INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
  VALUES (v_company_id, v_acc_expenses, '53', 'المصروفات التشغيلية', 'EXPENSE', 2, FALSE, 'DEBIT')
  RETURNING id INTO v_acc_operations;

  -- 9. Fiscal Year 2026
  INSERT INTO accounting.fiscal_years (company_id, year_name, start_date, end_date, is_closed)
  VALUES (v_company_id, 'السنة المالية 2026', '2026-01-01', '2026-12-31', FALSE)
  RETURNING id INTO v_fy_id;

  -- 10. 12 Fiscal Periods (Period 1 to 10 are OPEN, 11-12 OPEN)
  INSERT INTO accounting.fiscal_periods (fiscal_year_id, period_number, name, start_date, end_date, status) VALUES
  (v_fy_id, 1, 'يناير 2026', '2026-01-01', '2026-01-31', 'CLOSED'),
  (v_fy_id, 2, 'فبراير 2026', '2026-02-01', '2026-02-28', 'CLOSED'),
  (v_fy_id, 3, 'مارس 2026', '2026-03-01', '2026-03-31', 'CLOSED'),
  (v_fy_id, 4, 'أبريل 2026', '2026-04-01', '2026-04-30', 'CLOSED'),
  (v_fy_id, 5, 'مايو 2026', '2026-05-01', '2026-05-31', 'CLOSED'),
  (v_fy_id, 6, 'يونيو 2026', '2026-06-01', '2026-06-30', 'CLOSED'),
  (v_fy_id, 7, 'يوليو 2026', '2026-07-01', '2026-07-31', 'CLOSED'),
  (v_fy_id, 8, 'أغسطس 2026', '2026-08-01', '2026-08-31', 'CLOSED'),
  (v_fy_id, 9, 'سبتمبر 2026', '2026-09-01', '2026-09-30', 'CLOSED'),
  (v_fy_id, 10, 'أكتوبر 2026', '2026-10-01', '2026-10-31', 'OPEN'),
  (v_fy_id, 11, 'نوفمبر 2026', '2026-11-01', '2026-11-30', 'OPEN'),
  (v_fy_id, 12, 'ديسمبر 2026', '2026-12-01', '2026-12-31', 'OPEN');

END $$;
