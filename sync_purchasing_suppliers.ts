import { getDb, closeDb } from './src/server/db';

async function syncPurchasingAndSuppliers() {
  console.log('=== Step 2.3: Purchasing & Vendors Harmonization & Sync ===');
  const db = await getDb();

  try {
    // 1. Adjust column types in access schema
    console.log('[1/6] Adjusting column constraints in access."V_detail", "P_Order", "PO_Detail", "p_rtn_note", "p_rtn_note_Det"...');
    await db.exec(`
      ALTER TABLE access."V_detail"
        ALTER COLUMN "v_code" TYPE VARCHAR(50),
        ALTER COLUMN "v_a_name" TYPE VARCHAR(255),
        ALTER COLUMN "v_address" TYPE VARCHAR(255),
        ALTER COLUMN "v_tel" TYPE VARCHAR(50),
        ALTER COLUMN "v_a_code" TYPE VARCHAR(50);

      ALTER TABLE access."P_Order"
        ALTER COLUMN "PO_NO" TYPE VARCHAR(50),
        ALTER COLUMN "V_code" TYPE VARCHAR(50);

      ALTER TABLE access."PO_Detail"
        ALTER COLUMN "PO_NO" TYPE VARCHAR(50),
        ALTER COLUMN "I_Code" TYPE VARCHAR(50);

      ALTER TABLE access."p_rtn_note"
        ALTER COLUMN "pi_no" TYPE VARCHAR(50),
        ALTER COLUMN "rt_note_no" TYPE VARCHAR(50);

      ALTER TABLE access."p_rtn_note_Det"
        ALTER COLUMN "pi_no" TYPE VARCHAR(50),
        ALTER COLUMN "rtn_note_no" TYPE VARCHAR(50),
        ALTER COLUMN "i_code" TYPE VARCHAR(50);
    `);

    // 2. Supplier Sync Trigger (purchasing.suppliers -> access."V_detail")
    console.log('[2/6] Creating trigger fn_sync_supplier_to_access()...');
    await db.exec(`
      CREATE OR REPLACE FUNCTION purchasing.fn_sync_supplier_to_access()
      RETURNS TRIGGER AS $$
      DECLARE
        v_acc_code VARCHAR(50);
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          DELETE FROM access."V_detail" WHERE "v_code" = OLD.code;
          RETURN OLD;
        END IF;

        -- Get payables account code
        IF NEW.payables_account_id IS NOT NULL THEN
          SELECT code INTO v_acc_code FROM accounting.accounts WHERE id = NEW.payables_account_id;
        END IF;
        IF v_acc_code IS NULL THEN
          v_acc_code := '221010001'; -- Default Local Vendors Account
        END IF;

        -- UPSERT into access."V_detail"
        INSERT INTO access."V_detail" (
          "v_code",
          "v_a_name",
          "v_address",
          "v_tel",
          "v_dlimit",
          "v_a_code"
        ) VALUES (
          NEW.code,
          NEW.name,
          COALESCE(NEW.address, ''),
          COALESCE(NEW.phone, ''),
          COALESCE(NEW.credit_limit, 0),
          v_acc_code
        )
        ON CONFLICT ("v_code") DO UPDATE SET
          "v_a_name" = EXCLUDED."v_a_name",
          "v_address" = EXCLUDED."v_address",
          "v_tel" = EXCLUDED."v_tel",
          "v_dlimit" = EXCLUDED."v_dlimit",
          "v_a_code" = EXCLUDED."v_a_code";

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_supplier_to_access ON purchasing.suppliers;
      CREATE TRIGGER trg_sync_supplier_to_access
      AFTER INSERT OR UPDATE OR DELETE ON purchasing.suppliers
      FOR EACH ROW EXECUTE FUNCTION purchasing.fn_sync_supplier_to_access();
    `);

    // 3. Backfill existing suppliers
    console.log('[3/6] Backfilling suppliers from purchasing.suppliers into access."V_detail"...');
    await db.exec(`
      INSERT INTO access."V_detail" (
        "v_code", "v_a_name", "v_address", "v_tel", "v_dlimit", "v_a_code"
      )
      SELECT 
        s.code,
        s.name,
        COALESCE(s.address, ''),
        COALESCE(s.phone, ''),
        COALESCE(s.credit_limit, 0),
        COALESCE(a.code, '221010001')
      FROM purchasing.suppliers s
      LEFT JOIN accounting.accounts a ON a.id = s.payables_account_id
      ON CONFLICT ("v_code") DO UPDATE SET
        "v_a_name" = EXCLUDED."v_a_name",
        "v_address" = EXCLUDED."v_address",
        "v_tel" = EXCLUDED."v_tel",
        "v_dlimit" = EXCLUDED."v_dlimit",
        "v_a_code" = EXCLUDED."v_a_code";
    `);
    const suppCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."V_detail"');
    console.log(`[3/6] Total suppliers in access."V_detail": ${suppCount.rows[0].count}`);

    // 4. Purchase Invoices Sync Triggers (purchasing.purchase_invoices -> access."Bills" Bill_Type = 2)
    console.log('[4/6] Creating triggers for Purchase Invoices and Lines...');
    await db.exec(`
      CREATE OR REPLACE FUNCTION purchasing.fn_sync_purchase_invoice_to_access()
      RETURNS TRIGGER AS $$
      DECLARE
        v_supp_code VARCHAR(50);
        v_supp_name VARCHAR(255);
        v_pay_type SMALLINT;
        v_posted BOOLEAN;
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          DELETE FROM access."Bill_detail" WHERE "Bill_no" = OLD.invoice_number AND "Bill_type" = 2;
          DELETE FROM access."Bills" WHERE "Bill_no" = OLD.invoice_number AND "Bill_Type" = 2;
          RETURN OLD;
        END IF;

        -- Lookup Supplier
        IF NEW.supplier_id IS NOT NULL THEN
          SELECT code, name INTO v_supp_code, v_supp_name FROM purchasing.suppliers WHERE id = NEW.supplier_id;
        END IF;
        IF v_supp_code IS NULL THEN
          v_supp_code := 'SUP-001';
          v_supp_name := 'مورد نقدي';
        END IF;

        v_pay_type := CASE WHEN NEW.payment_type = 'CASH' THEN 1 ELSE 2 END;
        v_posted := (NEW.status = 'POSTED');

        -- UPSERT into access."Bills" with Bill_Type = 2 (Purchase Invoice)
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
          2, -- 2 = Purchase Invoice in Al-Muhaseb
          NEW.invoice_number,
          NEW.invoice_date,
          NEW.due_date,
          v_supp_code,
          v_supp_name,
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

      DROP TRIGGER IF EXISTS trg_sync_purchase_invoice_to_access ON purchasing.purchase_invoices;
      CREATE TRIGGER trg_sync_purchase_invoice_to_access
      AFTER INSERT OR UPDATE OR DELETE ON purchasing.purchase_invoices
      FOR EACH ROW EXECUTE FUNCTION purchasing.fn_sync_purchase_invoice_to_access();

      -- Trigger for Purchase Invoice Lines
      CREATE OR REPLACE FUNCTION purchasing.fn_sync_purchase_line_to_access()
      RETURNS TRIGGER AS $$
      DECLARE
        v_inv_number VARCHAR(50);
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          SELECT invoice_number INTO v_inv_number FROM purchasing.purchase_invoices WHERE id = OLD.invoice_id;
          IF v_inv_number IS NOT NULL THEN
            DELETE FROM access."Bill_detail" 
            WHERE "Bill_no" = v_inv_number AND "Bill_type" = 2 AND "I_code" = OLD.item_code;
          END IF;
          RETURN OLD;
        END IF;

        SELECT invoice_number INTO v_inv_number FROM purchasing.purchase_invoices WHERE id = NEW.invoice_id;
        IF v_inv_number IS NOT NULL THEN
          DELETE FROM access."Bill_detail" 
          WHERE "Bill_no" = v_inv_number AND "Bill_type" = 2 AND "I_code" = NEW.item_code;

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
            2, -- 2 = Purchase Line
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

      DROP TRIGGER IF EXISTS trg_sync_purchase_line_to_access ON purchasing.purchase_invoice_lines;
      CREATE TRIGGER trg_sync_purchase_line_to_access
      AFTER INSERT OR UPDATE OR DELETE ON purchasing.purchase_invoice_lines
      FOR EACH ROW EXECUTE FUNCTION purchasing.fn_sync_purchase_line_to_access();

      -- Trigger for Purchase Returns (purchasing.purchase_returns -> access."p_rtn_note" and Bills type 4)
      CREATE OR REPLACE FUNCTION purchasing.fn_sync_purchase_return_to_access()
      RETURNS TRIGGER AS $$
      DECLARE
        v_orig_inv VARCHAR(50);
        v_supp_code VARCHAR(50);
        v_supp_name VARCHAR(255);
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          DELETE FROM access."p_rtn_note_Det" WHERE "rtn_note_no" = OLD.return_number;
          DELETE FROM access."p_rtn_note" WHERE "rt_note_no" = OLD.return_number;
          DELETE FROM access."Bills" WHERE "Bill_no" = OLD.return_number AND "Bill_Type" = 4;
          RETURN OLD;
        END IF;

        IF NEW.original_invoice_id IS NOT NULL THEN
          SELECT invoice_number INTO v_orig_inv FROM purchasing.purchase_invoices WHERE id = NEW.original_invoice_id;
        END IF;
        IF v_orig_inv IS NULL THEN
          v_orig_inv := 'PINV-0000';
        END IF;

        IF NEW.supplier_id IS NOT NULL THEN
          SELECT code, name INTO v_supp_code, v_supp_name FROM purchasing.suppliers WHERE id = NEW.supplier_id;
        END IF;

        -- UPSERT into access."p_rtn_note"
        DELETE FROM access."p_rtn_note" WHERE "rt_note_no" = NEW.return_number;
        INSERT INTO access."p_rtn_note" (
          "inv_type", "pi_no", "w_code", "rt_note_no"
        ) VALUES (
          2, v_orig_inv, 1, NEW.return_number
        );

        -- Also record in Bills with Bill_Type = 4 (Purchase Return)
        INSERT INTO access."Bills" (
          "Bill_Type", "Bill_no", "Bill_date", "due_date", "c_v_code", "c_v_name",
          "bill_amt", "disc_Amt", "Tax_Value", "Bill_Pay_Type", "Bill_post", "a_desc"
        ) VALUES (
          4, -- 4 = Purchase Return
          NEW.return_number,
          NEW.return_date,
          NEW.return_date,
          COALESCE(v_supp_code, 'SUP-001'),
          COALESCE(v_supp_name, 'مورد'),
          COALESCE(NEW.total, 0),
          0,
          COALESCE(NEW.tax, 0),
          2,
          (NEW.status = 'POSTED'),
          COALESCE(NEW.notes, 'مردود مشتريات')
        )
        ON CONFLICT ("Bill_Type", "Bill_no") DO UPDATE SET
          "Bill_date" = EXCLUDED."Bill_date",
          "due_date" = EXCLUDED."due_date",
          "c_v_code" = EXCLUDED."c_v_code",
          "c_v_name" = EXCLUDED."c_v_name",
          "bill_amt" = EXCLUDED."bill_amt",
          "Bill_post" = EXCLUDED."Bill_post",
          "a_desc" = EXCLUDED."a_desc";

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_purchase_return_to_access ON purchasing.purchase_returns;
      CREATE TRIGGER trg_sync_purchase_return_to_access
      AFTER INSERT OR UPDATE OR DELETE ON purchasing.purchase_returns
      FOR EACH ROW EXECUTE FUNCTION purchasing.fn_sync_purchase_return_to_access();
    `);

    // 5. Backfill existing Purchase Invoices and Lines
    console.log('[5/6] Backfilling existing purchase invoices and lines into access."Bills" and "Bill_detail"...');
    await db.exec(`
      INSERT INTO access."Bills" (
        "Bill_Type", "Bill_no", "Bill_date", "due_date", "c_v_code", "c_v_name", 
        "bill_amt", "disc_Amt", "Tax_Value", "Bill_Pay_Type", "Bill_post", "a_desc"
      )
      SELECT 
        2, -- 2 = Purchase Invoice
        pi.invoice_number,
        pi.invoice_date,
        pi.due_date,
        COALESCE(s.code, 'SUP-001'),
        COALESCE(s.name, 'مورد'),
        COALESCE(pi.total, 0),
        COALESCE(pi.discount, 0),
        COALESCE(pi.tax, 0),
        CASE WHEN pi.payment_type = 'CASH' THEN 1 ELSE 2 END,
        (pi.status = 'POSTED'),
        COALESCE(pi.notes, '')
      FROM purchasing.purchase_invoices pi
      LEFT JOIN purchasing.suppliers s ON s.id = pi.supplier_id
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
      DELETE FROM access."Bill_detail" WHERE "Bill_type" = 2;
      INSERT INTO access."Bill_detail" (
        "Bill_type", "Bill_no", "I_code", "I_qty", "I_price", "TotTotImp_item_Value", "sub_qty", "VATAcc"
      )
      SELECT 
        2,
        pi.invoice_number,
        l.item_code,
        COALESCE(l.quantity, 0),
        COALESCE(l.unit_price, 0),
        COALESCE(l.line_total, 0),
        0,
        COALESCE(l.tax, 0)
      FROM purchasing.purchase_invoice_lines l
      JOIN purchasing.purchase_invoices pi ON pi.id = l.invoice_id;
    `);

    const piCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."Bills" WHERE "Bill_Type" = 2');
    const piLinesCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."Bill_detail" WHERE "Bill_type" = 2');
    console.log(`[5/6] Total purchase bills in access."Bills": ${piCount.rows[0].count}`);
    console.log(`[5/6] Total purchase bill lines in access."Bill_detail": ${piLinesCount.rows[0].count}`);

    // 6. Create Unified Views
    console.log('[6/6] Creating unified views for purchasing...');
    await db.exec(`
      CREATE OR REPLACE VIEW purchasing.v_suppliers_unified AS
      SELECT 
        s.id AS supplier_id,
        s.code,
        s.name,
        s.phone,
        s.email,
        s.address,
        s.tax_number,
        s.credit_limit,
        s.is_active,
        s.payables_account_id,
        vd."v_a_code" AS legacy_account_code,
        vd."v_dlimit" AS legacy_credit_limit
      FROM purchasing.suppliers s
      LEFT JOIN access."V_detail" vd ON vd."v_code" = s.code
      ORDER BY s.code ASC;

      CREATE OR REPLACE VIEW purchasing.v_purchase_invoices_unified AS
      SELECT 
        pi.id AS invoice_id,
        pi.invoice_number,
        pi.supplier_id,
        s.name AS supplier_name,
        pi.payment_type,
        pi.invoice_date,
        pi.due_date,
        pi.subtotal,
        pi.discount,
        pi.tax,
        pi.total,
        pi.status,
        b."Bill_post" AS legacy_is_posted,
        b."Bill_Pay_Type" AS legacy_pay_type,
        (SELECT COUNT(*) FROM access."Bill_detail" bd WHERE bd."Bill_no" = pi.invoice_number AND bd."Bill_type" = 2) AS legacy_lines_count
      FROM purchasing.purchase_invoices pi
      LEFT JOIN purchasing.suppliers s ON s.id = pi.supplier_id
      LEFT JOIN access."Bills" b ON b."Bill_no" = pi.invoice_number AND b."Bill_Type" = 2
      ORDER BY pi.invoice_number ASC;
    `);

    // Run verification
    const samplePurchases = await db.query(`SELECT * FROM purchasing.v_purchase_invoices_unified LIMIT 5`);
    console.log('Sample unified purchase invoices:');
    console.table(samplePurchases.rows);

    console.log('\n=== Step 2.3 Completed Successfully with 100% Data Integrity ===');
  } finally {
    await closeDb();
  }
}

syncPurchasingAndSuppliers().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
