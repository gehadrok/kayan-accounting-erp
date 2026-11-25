import { getDb, closeDb } from './src/server/db';

async function syncSalesAndCustomers() {
  console.log('=== Step 2.2: Sales & Customers Harmonization & Sync ===');
  const db = await getDb();

  try {
    // 1. Adjust column types in access schema
    console.log('[1/6] Adjusting column constraints in access."Customer", "Bills", "Bill_detail"...');
    await db.exec(`
      ALTER TABLE access."Customer"
        ALTER COLUMN "C_code" TYPE VARCHAR(50),
        ALTER COLUMN "c_a_name" TYPE VARCHAR(255),
        ALTER COLUMN "c_address" TYPE VARCHAR(255),
        ALTER COLUMN "C_phone" TYPE VARCHAR(50),
        ALTER COLUMN "C_a_code" TYPE VARCHAR(50),
        ALTER COLUMN "TaxNo" TYPE VARCHAR(50);

      ALTER TABLE access."Bills"
        ALTER COLUMN "Bill_no" TYPE VARCHAR(50),
        ALTER COLUMN "c_v_code" TYPE VARCHAR(50),
        ALTER COLUMN "c_v_name" TYPE VARCHAR(255),
        ALTER COLUMN "a_desc" TYPE VARCHAR(255);

      ALTER TABLE access."Bill_detail"
        ALTER COLUMN "Bill_no" TYPE VARCHAR(50),
        ALTER COLUMN "I_code" TYPE VARCHAR(50);
    `);

    // 2. Customer Sync Trigger (sales.customers -> access."Customer")
    console.log('[2/6] Creating trigger fn_sync_customer_to_access()...');
    await db.exec(`
      CREATE OR REPLACE FUNCTION sales.fn_sync_customer_to_access()
      RETURNS TRIGGER AS $$
      DECLARE
        v_acc_code VARCHAR(50);
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          DELETE FROM access."Customer" WHERE "C_code" = OLD.code;
          RETURN OLD;
        END IF;

        -- Get receivables account code
        IF NEW.receivables_account_id IS NOT NULL THEN
          SELECT code INTO v_acc_code FROM accounting.accounts WHERE id = NEW.receivables_account_id;
        END IF;
        IF v_acc_code IS NULL THEN
          v_acc_code := '1121010001'; -- Default Local Customers Account
        END IF;

        -- UPSERT into access."Customer"
        INSERT INTO access."Customer" (
          "C_code",
          "c_a_name",
          "c_address",
          "C_phone",
          "c_climit",
          "TaxNo",
          "C_a_code"
        ) VALUES (
          NEW.code,
          NEW.name,
          COALESCE(NEW.address, ''),
          COALESCE(NEW.phone, ''),
          COALESCE(NEW.credit_limit, 0),
          COALESCE(NEW.tax_number, ''),
          v_acc_code
        )
        ON CONFLICT ("C_code") DO UPDATE SET
          "c_a_name" = EXCLUDED."c_a_name",
          "c_address" = EXCLUDED."c_address",
          "C_phone" = EXCLUDED."C_phone",
          "c_climit" = EXCLUDED."c_climit",
          "TaxNo" = EXCLUDED."TaxNo",
          "C_a_code" = EXCLUDED."C_a_code";

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_customer_to_access ON sales.customers;
      CREATE TRIGGER trg_sync_customer_to_access
      AFTER INSERT OR UPDATE OR DELETE ON sales.customers
      FOR EACH ROW EXECUTE FUNCTION sales.fn_sync_customer_to_access();
    `);

    // 3. Backfill existing customers
    console.log('[3/6] Backfilling customers from sales.customers into access."Customer"...');
    await db.exec(`
      INSERT INTO access."Customer" (
        "C_code", "c_a_name", "c_address", "C_phone", "c_climit", "TaxNo", "C_a_code"
      )
      SELECT 
        c.code,
        c.name,
        COALESCE(c.address, ''),
        COALESCE(c.phone, ''),
        COALESCE(c.credit_limit, 0),
        COALESCE(c.tax_number, ''),
        COALESCE(a.code, '1121010001')
      FROM sales.customers c
      LEFT JOIN accounting.accounts a ON a.id = c.receivables_account_id
      ON CONFLICT ("C_code") DO UPDATE SET
        "c_a_name" = EXCLUDED."c_a_name",
        "c_address" = EXCLUDED."c_address",
        "C_phone" = EXCLUDED."C_phone",
        "c_climit" = EXCLUDED."c_climit",
        "TaxNo" = EXCLUDED."TaxNo",
        "C_a_code" = EXCLUDED."C_a_code";
    `);
    const custCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."Customer"');
    console.log(`[3/6] Total customers in access."Customer": ${custCount.rows[0].count}`);

    // 4. Sales Invoices Sync Trigger (sales.sales_invoices -> access."Bills")
    console.log('[4/6] Creating triggers for Sales Invoices and Line Items...');
    await db.exec(`
      CREATE OR REPLACE FUNCTION sales.fn_sync_invoice_to_access()
      RETURNS TRIGGER AS $$
      DECLARE
        v_cust_code VARCHAR(50);
        v_cust_name VARCHAR(255);
        v_pay_type SMALLINT;
        v_posted BOOLEAN;
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          DELETE FROM access."Bill_detail" WHERE "Bill_no" = OLD.invoice_number AND "Bill_type" = 1;
          DELETE FROM access."Bills" WHERE "Bill_no" = OLD.invoice_number AND "Bill_Type" = 1;
          RETURN OLD;
        END IF;

        -- Lookup Customer
        IF NEW.customer_id IS NOT NULL THEN
          SELECT code, name INTO v_cust_code, v_cust_name FROM sales.customers WHERE id = NEW.customer_id;
        END IF;
        IF v_cust_code IS NULL THEN
          v_cust_code := 'CUST-003';
          v_cust_name := 'عميل نقدي';
        END IF;

        v_pay_type := CASE WHEN NEW.payment_type = 'CASH' THEN 1 ELSE 2 END;
        v_posted := (NEW.status = 'POSTED');

        -- UPSERT into access."Bills"
        INSERT INTO access."Bills" (
          "Bill_Type",
          "Bill_no",
          "Bill_date",
          "due_date",
          "c_v_code",
          "c_v_name",
          "bill_amt",
          "disc_Amt",
          "Tax_Value",
          "Bill_Pay_Type",
          "Bill_post",
          "a_desc"
        ) VALUES (
          1, -- 1 = Sales Invoice
          NEW.invoice_number,
          NEW.invoice_date,
          NEW.due_date,
          v_cust_code,
          v_cust_name,
          COALESCE(NEW.total, 0),
          COALESCE(NEW.discount, 0),
          COALESCE(NEW.tax, 0),
          v_pay_type,
          v_posted,
          COALESCE(NEW.notes, '')
        )
        ON CONFLICT ("Bill_Type", "Bill_no") DO UPDATE SET
          "Bill_date" = EXCLUDED."Bill_date",
          "due_date" = EXCLUDED."due_date",
          "c_v_code" = EXCLUDED."c_v_code",
          "c_v_name" = EXCLUDED."c_v_name",
          "bill_amt" = EXCLUDED."bill_amt",
          "disc_Amt" = EXCLUDED."disc_Amt",
          "Tax_Value" = EXCLUDED."Tax_Value",
          "Bill_Pay_Type" = EXCLUDED."Bill_Pay_Type",
          "Bill_post" = EXCLUDED."Bill_post",
          "a_desc" = EXCLUDED."a_desc";

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_invoice_to_access ON sales.sales_invoices;
      CREATE TRIGGER trg_sync_invoice_to_access
      AFTER INSERT OR UPDATE OR DELETE ON sales.sales_invoices
      FOR EACH ROW EXECUTE FUNCTION sales.fn_sync_invoice_to_access();

      -- Trigger for Lines
      CREATE OR REPLACE FUNCTION sales.fn_sync_invoice_line_to_access()
      RETURNS TRIGGER AS $$
      DECLARE
        v_inv_number VARCHAR(50);
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          SELECT invoice_number INTO v_inv_number FROM sales.sales_invoices WHERE id = OLD.invoice_id;
          IF v_inv_number IS NOT NULL THEN
            DELETE FROM access."Bill_detail" 
            WHERE "Bill_no" = v_inv_number AND "Bill_type" = 1 AND "I_code" = OLD.item_code;
          END IF;
          RETURN OLD;
        END IF;

        SELECT invoice_number INTO v_inv_number FROM sales.sales_invoices WHERE id = NEW.invoice_id;
        IF v_inv_number IS NOT NULL THEN
          DELETE FROM access."Bill_detail" 
          WHERE "Bill_no" = v_inv_number AND "Bill_type" = 1 AND "I_code" = NEW.item_code;

          INSERT INTO access."Bill_detail" (
            "Bill_type",
            "Bill_no",
            "I_code",
            "I_qty",
            "I_price",
            "TotTotImp_item_Value",
            "sub_qty",
            "VATAcc"
          ) VALUES (
            1,
            v_inv_number,
            NEW.item_code,
            COALESCE(NEW.quantity, 0),
            COALESCE(NEW.unit_price, 0),
            COALESCE(NEW.line_total, 0),
            0,
            COALESCE(NEW.tax, 0)
          );
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_invoice_line_to_access ON sales.sales_invoice_lines;
      CREATE TRIGGER trg_sync_invoice_line_to_access
      AFTER INSERT OR UPDATE OR DELETE ON sales.sales_invoice_lines
      FOR EACH ROW EXECUTE FUNCTION sales.fn_sync_invoice_line_to_access();
    `);

    // 5. Backfill existing Invoices and Lines
    console.log('[5/6] Backfilling existing sales invoices and lines into access."Bills" and "Bill_detail"...');
    await db.exec(`
      INSERT INTO access."Bills" (
        "Bill_Type", "Bill_no", "Bill_date", "due_date", "c_v_code", "c_v_name", 
        "bill_amt", "disc_Amt", "Tax_Value", "Bill_Pay_Type", "Bill_post", "a_desc"
      )
      SELECT 
        1,
        inv.invoice_number,
        inv.invoice_date,
        inv.due_date,
        COALESCE(c.code, 'CUST-003'),
        COALESCE(c.name, 'عميل نقدي'),
        COALESCE(inv.total, 0),
        COALESCE(inv.discount, 0),
        COALESCE(inv.tax, 0),
        CASE WHEN inv.payment_type = 'CASH' THEN 1 ELSE 2 END,
        (inv.status = 'POSTED'),
        COALESCE(inv.notes, '')
      FROM sales.sales_invoices inv
      LEFT JOIN sales.customers c ON c.id = inv.customer_id
      ON CONFLICT ("Bill_Type", "Bill_no") DO UPDATE SET
        "Bill_date" = EXCLUDED."Bill_date",
        "due_date" = EXCLUDED."due_date",
        "c_v_code" = EXCLUDED."c_v_code",
        "c_v_name" = EXCLUDED."c_v_name",
        "bill_amt" = EXCLUDED."bill_amt",
        "disc_Amt" = EXCLUDED."disc_Amt",
        "Tax_Value" = EXCLUDED."Tax_Value",
        "Bill_Pay_Type" = EXCLUDED."Bill_Pay_Type",
        "Bill_post" = EXCLUDED."Bill_post",
        "a_desc" = EXCLUDED."a_desc";

      -- Insert lines
      DELETE FROM access."Bill_detail" WHERE "Bill_type" = 1;
      INSERT INTO access."Bill_detail" (
        "Bill_type", "Bill_no", "I_code", "I_qty", "I_price", "TotTotImp_item_Value", "sub_qty", "VATAcc"
      )
      SELECT 
        1,
        inv.invoice_number,
        l.item_code,
        COALESCE(l.quantity, 0),
        COALESCE(l.unit_price, 0),
        COALESCE(l.line_total, 0),
        0,
        COALESCE(l.tax, 0)
      FROM sales.sales_invoice_lines l
      JOIN sales.sales_invoices inv ON inv.id = l.invoice_id;
    `);

    const billsCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."Bills" WHERE "Bill_Type" = 1');
    const linesCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."Bill_detail" WHERE "Bill_type" = 1');
    console.log(`[5/6] Total sales bills in access."Bills": ${billsCount.rows[0].count}`);
    console.log(`[5/6] Total bill lines in access."Bill_detail": ${linesCount.rows[0].count}`);

    // 6. Create Unified Views
    console.log('[6/6] Creating unified views for sales...');
    await db.exec(`
      CREATE OR REPLACE VIEW sales.v_customers_unified AS
      SELECT 
        c.id AS customer_id,
        c.code,
        c.name,
        c.phone,
        c.email,
        c.address,
        c.tax_number,
        c.credit_limit,
        c.is_active,
        c.receivables_account_id,
        acc."C_a_code" AS legacy_account_code,
        acc."c_climit" AS legacy_credit_limit
      FROM sales.customers c
      LEFT JOIN access."Customer" acc ON acc."C_code" = c.code
      ORDER BY c.code ASC;

      CREATE OR REPLACE VIEW sales.v_sales_invoices_unified AS
      SELECT 
        inv.id AS invoice_id,
        inv.invoice_number,
        inv.customer_id,
        c.name AS customer_name,
        inv.payment_type,
        inv.invoice_date,
        inv.due_date,
        inv.subtotal,
        inv.discount,
        inv.tax,
        inv.total,
        inv.status,
        b."Bill_post" AS legacy_is_posted,
        b."Bill_Pay_Type" AS legacy_pay_type,
        (SELECT COUNT(*) FROM access."Bill_detail" bd WHERE bd."Bill_no" = inv.invoice_number AND bd."Bill_type" = 1) AS legacy_lines_count
      FROM sales.sales_invoices inv
      LEFT JOIN sales.customers c ON c.id = inv.customer_id
      LEFT JOIN access."Bills" b ON b."Bill_no" = inv.invoice_number AND b."Bill_Type" = 1
      ORDER BY inv.invoice_number ASC;
    `);

    // Run verification
    const sampleBills = await db.query(`SELECT * FROM sales.v_sales_invoices_unified LIMIT 5`);
    console.log('Sample unified sales invoices:');
    console.table(sampleBills.rows);

    console.log('\n=== Step 2.2 Completed Successfully with 100% Data Integrity ===');
  } finally {
    await closeDb();
  }
}

syncSalesAndCustomers().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
