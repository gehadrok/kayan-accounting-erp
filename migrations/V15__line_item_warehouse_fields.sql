-- V15__line_item_warehouse_fields.sql
-- Add item_id and warehouse_id foreign keys to invoice and return lines

ALTER TABLE sales.sales_invoice_lines ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES inventory.items(id);
ALTER TABLE sales.sales_invoice_lines ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES inventory.warehouses(id);

ALTER TABLE purchasing.purchase_invoice_lines ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES inventory.items(id);
ALTER TABLE purchasing.purchase_invoice_lines ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES inventory.warehouses(id);

ALTER TABLE sales.sales_return_lines ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES inventory.items(id);
ALTER TABLE sales.sales_return_lines ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES inventory.warehouses(id);

ALTER TABLE purchasing.purchase_return_lines ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES inventory.items(id);
ALTER TABLE purchasing.purchase_return_lines ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES inventory.warehouses(id);
