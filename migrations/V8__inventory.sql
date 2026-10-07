-- V8__inventory.sql: Inventory, Categories, Units, Items, Warehouses, Stock Transactions, Transfers, Counts, and Valuation Schema

CREATE SCHEMA IF NOT EXISTS inventory;

-- 1. Ensure COGS Account (5001) in accounting.accounts
DO $$
DECLARE
  v_comp_id UUID;
  v_exp_parent UUID;
BEGIN
  SELECT id INTO v_comp_id FROM core.companies LIMIT 1;
  SELECT id INTO v_exp_parent FROM accounting.accounts WHERE code = '5' LIMIT 1;

  IF v_comp_id IS NOT NULL AND v_exp_parent IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM accounting.accounts WHERE code = '5001') THEN
      INSERT INTO accounting.accounts (company_id, parent_id, code, name, account_type_id, level, is_group, normal_balance)
      VALUES (v_comp_id, v_exp_parent, '5001', 'تكلفة المبيعات (COGS)', 'EXPENSE', 2, FALSE, 'DEBIT');
    END IF;
  END IF;
END $$;

-- 2. Inventory Categories (Tree Hierarchy)
CREATE TABLE IF NOT EXISTS inventory.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES inventory.categories(id) ON DELETE SET NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_category_code UNIQUE (company_id, code)
);

-- 3. Units of Measure
CREATE TABLE IF NOT EXISTS inventory.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  symbol VARCHAR(20),
  base_unit_id UUID REFERENCES inventory.units(id),
  conversion_factor NUMERIC(18, 6) NOT NULL DEFAULT 1.000000,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_unit_code UNIQUE (company_id, code)
);

-- 4. Warehouses
CREATE TABLE IF NOT EXISTS inventory.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  inventory_account_id UUID REFERENCES accounting.accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_warehouse_code UNIQUE (company_id, code)
);

-- 5. Warehouse Locations (Aisle / Shelf / Bin)
CREATE TABLE IF NOT EXISTS inventory.warehouse_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES inventory.warehouses(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_warehouse_location_code UNIQUE (warehouse_id, code)
);

-- 6. Items Master (Stock & Non-Stock Items)
CREATE TABLE IF NOT EXISTS inventory.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  sku VARCHAR(50) NOT NULL,
  barcode VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES inventory.categories(id),
  unit_id UUID REFERENCES inventory.units(id),
  purchase_price NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (purchase_price >= 0),
  sale_price NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (sale_price >= 0),
  minimum_stock NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (minimum_stock >= 0),
  reorder_point NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (reorder_point >= 0),
  inventory_account_id UUID REFERENCES accounting.accounts(id),
  cogs_account_id UUID REFERENCES accounting.accounts(id),
  sales_account_id UUID REFERENCES accounting.accounts(id),
  is_stock_item BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_item_sku UNIQUE (company_id, sku)
);

-- 7. Stock Transactions (The Single Source of Truth for Inventory Ledger)
CREATE TABLE IF NOT EXISTS inventory.stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES core.branches(id),
  transaction_number VARCHAR(50) NOT NULL,
  transaction_type VARCHAR(50) NOT NULL CHECK (
    transaction_type IN (
      'OPENING', 
      'PURCHASE_RECEIPT', 
      'SALES_ISSUE', 
      'TRANSFER_IN', 
      'TRANSFER_OUT', 
      'ADJUSTMENT_IN', 
      'ADJUSTMENT_OUT', 
      'RETURN_IN', 
      'RETURN_OUT', 
      'STOCK_COUNT_ADJUSTMENT'
    )
  ),
  transaction_date DATE NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES inventory.warehouses(id),
  reference_type VARCHAR(50),
  reference_id UUID,
  journal_entry_id UUID REFERENCES accounting.journal_entries(id),
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'VOIDED')),
  notes TEXT,
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  posted_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_stock_tx_number UNIQUE (company_id, transaction_number)
);

-- 8. Stock Transaction Lines
CREATE TABLE IF NOT EXISTS inventory.stock_transaction_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES inventory.stock_transactions(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory.items(id),
  unit_id UUID REFERENCES inventory.units(id),
  quantity NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (unit_cost >= 0),
  total_cost NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (total_cost >= 0),
  location_id UUID REFERENCES inventory.warehouse_locations(id),
  batch_id VARCHAR(100),
  serial_number VARCHAR(100),
  line_number INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Stock Transfers (Inter-Warehouse Movements)
CREATE TABLE IF NOT EXISTS inventory.stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  transfer_number VARCHAR(50) NOT NULL,
  from_warehouse_id UUID NOT NULL REFERENCES inventory.warehouses(id),
  to_warehouse_id UUID NOT NULL REFERENCES inventory.warehouses(id),
  transfer_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  out_transaction_id UUID REFERENCES inventory.stock_transactions(id),
  in_transaction_id UUID REFERENCES inventory.stock_transactions(id),
  notes TEXT,
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  CONSTRAINT uq_company_transfer_number UNIQUE (company_id, transfer_number),
  CONSTRAINT chk_different_warehouses CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE TABLE IF NOT EXISTS inventory.stock_transfer_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES inventory.stock_transfers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory.items(id),
  quantity NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  line_number INT NOT NULL
);

-- 10. Physical Stock Counts (الجرد الفعلي الدوري والمفاجئ)
CREATE TABLE IF NOT EXISTS inventory.stock_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  count_number VARCHAR(50) NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES inventory.warehouses(id),
  count_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'APPROVED', 'CANCELLED')),
  adjustment_transaction_id UUID REFERENCES inventory.stock_transactions(id),
  notes TEXT,
  approved_by UUID REFERENCES security.users(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES security.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_stock_count_number UNIQUE (company_id, count_number)
);

CREATE TABLE IF NOT EXISTS inventory.stock_count_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES inventory.stock_counts(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory.items(id),
  system_quantity NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  counted_quantity NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  difference_quantity NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  unit_cost NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total_difference_cost NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  line_number INT NOT NULL,
  notes TEXT
);

-- 11. Initial Seeding of Categories, Units, Warehouses & Items
DO $$
DECLARE
  v_comp_id UUID;
  v_branch_id UUID;
  v_inv_acc UUID;
  v_cogs_acc UUID;
  v_sales_acc UUID;
  v_cat_food UUID;
  v_cat_tech UUID;
  v_unit_pcs UUID;
  v_unit_box UUID;
  v_unit_kg UUID;
  v_wh_main UUID;
  v_wh_branch UUID;
BEGIN
  SELECT id INTO v_comp_id FROM core.companies LIMIT 1;
  SELECT id INTO v_branch_id FROM core.branches LIMIT 1;
  SELECT id INTO v_inv_acc FROM accounting.accounts WHERE code = '1104' LIMIT 1;
  SELECT id INTO v_cogs_acc FROM accounting.accounts WHERE code = '5001' LIMIT 1;
  SELECT id INTO v_sales_acc FROM accounting.accounts WHERE code = '41' LIMIT 1;

  IF v_comp_id IS NOT NULL THEN
    -- Categories
    INSERT INTO inventory.categories (company_id, code, name, description)
    VALUES (v_comp_id, 'CAT-TECH', 'أجهزة ومعدات تقنية', 'حواسيب وخوادم وملحقات شبكية')
    ON CONFLICT (company_id, code) DO NOTHING
    RETURNING id INTO v_cat_tech;

    INSERT INTO inventory.categories (company_id, code, name, description)
    VALUES (v_comp_id, 'CAT-FOOD', 'مواد أساسية وتوزيع', 'سلع وبضائع تجارية استهلاكية')
    ON CONFLICT (company_id, code) DO NOTHING
    RETURNING id INTO v_cat_food;

    IF v_cat_tech IS NULL THEN SELECT id INTO v_cat_tech FROM inventory.categories WHERE code = 'CAT-TECH' LIMIT 1; END IF;
    IF v_cat_food IS NULL THEN SELECT id INTO v_cat_food FROM inventory.categories WHERE code = 'CAT-FOOD' LIMIT 1; END IF;

    -- Units
    INSERT INTO inventory.units (company_id, code, name, symbol, conversion_factor)
    VALUES (v_comp_id, 'PCS', 'قطعة', 'حبة', 1.000000)
    ON CONFLICT (company_id, code) DO NOTHING
    RETURNING id INTO v_unit_pcs;

    IF v_unit_pcs IS NULL THEN SELECT id INTO v_unit_pcs FROM inventory.units WHERE code = 'PCS' LIMIT 1; END IF;

    INSERT INTO inventory.units (company_id, code, name, symbol, base_unit_id, conversion_factor)
    VALUES (v_comp_id, 'BOX', 'كرتون (12 حبة)', 'كرتون', v_unit_pcs, 12.000000)
    ON CONFLICT (company_id, code) DO NOTHING
    RETURNING id INTO v_unit_box;

    INSERT INTO inventory.units (company_id, code, name, symbol, conversion_factor)
    VALUES (v_comp_id, 'KG', 'كيلوغرام', 'كجم', 1.000000)
    ON CONFLICT (company_id, code) DO NOTHING
    RETURNING id INTO v_unit_kg;

    -- Warehouses
    INSERT INTO inventory.warehouses (company_id, branch_id, code, name, address, inventory_account_id)
    VALUES (v_comp_id, v_branch_id, 'WH-01', 'المستودع المركزي الرئيسي', 'الضالع - المجمع التجاري', v_inv_acc)
    ON CONFLICT (company_id, code) DO NOTHING
    RETURNING id INTO v_wh_main;

    INSERT INTO inventory.warehouses (company_id, branch_id, code, name, address, inventory_account_id)
    VALUES (v_comp_id, v_branch_id, 'WH-02', 'مستودع التوزيع ونقاط البيع', 'فرع عدن - خور مكسر', v_inv_acc)
    ON CONFLICT (company_id, code) DO NOTHING
    RETURNING id INTO v_wh_branch;

    IF v_wh_main IS NULL THEN SELECT id INTO v_wh_main FROM inventory.warehouses WHERE code = 'WH-01' LIMIT 1; END IF;
    IF v_wh_branch IS NULL THEN SELECT id INTO v_wh_branch FROM inventory.warehouses WHERE code = 'WH-02' LIMIT 1; END IF;

    -- Locations
    INSERT INTO inventory.warehouse_locations (warehouse_id, code, name)
    VALUES 
      (v_wh_main, 'SEC-A', 'قسم الأجهزة والخوادم'),
      (v_wh_main, 'SEC-B', 'قسم الملحقات وقطع الغيار')
    ON CONFLICT (warehouse_id, code) DO NOTHING;

    -- Items
    INSERT INTO inventory.items (
      company_id, sku, barcode, name, description, category_id, unit_id, 
      purchase_price, sale_price, minimum_stock, reorder_point, 
      inventory_account_id, cogs_account_id, sales_account_id
    )
    VALUES 
    (
      v_comp_id, 'SKU-SRV-01', '6281001001', 'خادم سحابي كيان Enterprise Pro', 
      'سيرفر إدارة قواعد البيانات والأنظمة السحابية', v_cat_tech, v_unit_pcs, 
      100000, 150000, 5, 10, v_inv_acc, v_cogs_acc, v_sales_acc
    ),
    (
      v_comp_id, 'SKU-POS-02', '6281001002', 'جهاز نقطة بيع POS الذكي متكامل', 
      'شاشة لمس مع طابعة فواتير وقارئ باركود', v_cat_tech, v_unit_pcs, 
      45000, 70000, 10, 20, v_inv_acc, v_cogs_acc, v_sales_acc
    ),
    (
      v_comp_id, 'SKU-RTR-03', '6281001003', 'راوتر ألياف ضوئية وشبكات Gigabit', 
      'موزع شبكة عالي السرعة للشركات', v_cat_tech, v_unit_pcs, 
      12000, 18500, 15, 25, v_inv_acc, v_cogs_acc, v_sales_acc
    )
    ON CONFLICT (company_id, sku) DO NOTHING;

  END IF;
END $$;
