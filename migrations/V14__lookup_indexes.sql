-- V14__lookup_indexes.sql: Performance indexes for Universal Master Data Lookup Engine
CREATE INDEX IF NOT EXISTS idx_items_sku_barcode_name ON inventory.items (sku, barcode, name);
CREATE INDEX IF NOT EXISTS idx_customers_code_name_phone ON sales.customers (code, name, phone);
CREATE INDEX IF NOT EXISTS idx_suppliers_code_name_phone ON purchasing.suppliers (code, name, phone);
CREATE INDEX IF NOT EXISTS idx_accounts_code_name ON accounting.accounts (code, name);
CREATE INDEX IF NOT EXISTS idx_warehouses_code_name ON inventory.warehouses (code, name);
CREATE INDEX IF NOT EXISTS idx_cash_code_name ON banking.cash_accounts (code, name);
CREATE INDEX IF NOT EXISTS idx_bank_acc_num_name ON banking.bank_accounts (account_number, bank_name);
