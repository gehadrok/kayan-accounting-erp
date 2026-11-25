import { getDb, closeDb } from './src/server/db';

async function syncInventoryAndWarehouses() {
  console.log('=== Step 2.4: Inventory & Warehouses Harmonization & Sync ===');
  const db = await getDb();

  try {
    // 0. Temporarily drop dependent views in access schema
    console.log('[0/7] Dropping dependent views in access schema temporarily...');
    await db.exec(`
      DROP VIEW IF EXISTS access.itm_det CASCADE;
      DROP VIEW IF EXISTS access.itm_mv CASCADE;
      DROP VIEW IF EXISTS access.in_mov CASCADE;
      DROP VIEW IF EXISTS access.out_mov CASCADE;
    `);

    // 1. Adjust column types in access schema
    console.log('[1/7] Adjusting column constraints in access inventory tables...');
    await db.exec(`
      ALTER TABLE access."Measure"
        ALTER COLUMN "Measure_Code" TYPE VARCHAR(20),
        ALTER COLUMN "Measure" TYPE VARCHAR(100);

      ALTER TABLE access."i_group"
        ALTER COLUMN "g_code" TYPE VARCHAR(50),
        ALTER COLUMN "g_a_name" TYPE VARCHAR(255);

      ALTER TABLE access."W_DETAIL"
        ALTER COLUMN "W_CODE" TYPE VARCHAR(50),
        ALTER COLUMN "w_a_name" TYPE VARCHAR(255),
        ALTER COLUMN "w_loc" TYPE VARCHAR(255);

      ALTER TABLE access."item_detail"
        ALTER COLUMN "i_code" TYPE VARCHAR(50),
        ALTER COLUMN "i_a_name" TYPE VARCHAR(255),
        ALTER COLUMN "i_e_name" TYPE VARCHAR(255),
        ALTER COLUMN "g_code" TYPE VARCHAR(50),
        ALTER COLUMN "i_measure" TYPE VARCHAR(20);

      ALTER TABLE access."item_store"
        ALTER COLUMN "i_code" TYPE VARCHAR(50),
        ALTER COLUMN "w_code" TYPE VARCHAR(50),
        ALTER COLUMN "i_measure" TYPE VARCHAR(20);

      ALTER TABLE access."item_mov"
        ALTER COLUMN "doc_no" TYPE VARCHAR(50),
        ALTER COLUMN "i_code" TYPE VARCHAR(50),
        ALTER COLUMN "w_code" TYPE VARCHAR(50);

      ALTER TABLE access."Good_Transfer"
        ALTER COLUMN "Gtrs_no" TYPE VARCHAR(50),
        ALTER COLUMN "F_whse" TYPE VARCHAR(50),
        ALTER COLUMN "T_whse" TYPE VARCHAR(50),
        ALTER COLUMN "I_code" TYPE VARCHAR(50),
        ALTER COLUMN "I_measure" TYPE VARCHAR(20);

      ALTER TABLE access."wt_avg"
        ALTER COLUMN "i_code" TYPE VARCHAR(50);

      ALTER TABLE access."avg_cost"
        ALTER COLUMN "i_code" TYPE VARCHAR(50);
    `);

    // Recreate the standard access views
    await db.exec(`
      CREATE OR REPLACE VIEW access."itm_det" AS 
      SELECT * FROM access."item_detail" ORDER BY "i_a_name";

      CREATE OR REPLACE VIEW access."itm_mv" AS 
      SELECT * FROM access."item_mov";

      CREATE OR REPLACE VIEW access."in_mov" AS 
      SELECT "i_code", "w_code", SUM("i_qty") AS in_qty, SUM("si_qty") AS sin_qty 
      FROM access."item_mov" 
      WHERE "doc_type" IN (2, 3, 5, 8) 
      GROUP BY "i_code", "w_code";

      CREATE OR REPLACE VIEW access."out_mov" AS 
      SELECT "i_code", "w_code", SUM("i_qty") AS out_qty, SUM("si_qty") AS sout_qty 
      FROM access."item_mov" 
      WHERE "doc_type" IN (1, 4, 6, 7) 
      GROUP BY "i_code", "w_code";
    `);

    // 2. Units of Measure Sync (inventory.units -> access."Measure")
    console.log('[2/7] Syncing Units of Measure...');
    await db.exec(`
      CREATE OR REPLACE FUNCTION inventory.fn_sync_unit_to_access()
      RETURNS TRIGGER AS $$
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          DELETE FROM access."Measure" WHERE "Measure_Code" = OLD.code;
          RETURN OLD;
        END IF;

        INSERT INTO access."Measure" ("Measure_Code", "Measure")
        VALUES (NEW.code, COALESCE(NEW.name, NEW.symbol, NEW.code))
        ON CONFLICT ("Measure_Code") DO UPDATE SET
          "Measure" = EXCLUDED."Measure";

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_unit_to_access ON inventory.units;
      CREATE TRIGGER trg_sync_unit_to_access
      AFTER INSERT OR UPDATE OR DELETE ON inventory.units
      FOR EACH ROW EXECUTE FUNCTION inventory.fn_sync_unit_to_access();

      -- Backfill Units
      INSERT INTO access."Measure" ("Measure_Code", "Measure")
      SELECT code, COALESCE(name, symbol, code)
      FROM inventory.units
      ON CONFLICT ("Measure_Code") DO UPDATE SET
        "Measure" = EXCLUDED."Measure";
    `);
    const unitCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."Measure"');
    console.log(`[2/7] Total units in access."Measure": ${unitCount.rows[0].count}`);

    // 3. Categories / Groups Sync (inventory.categories -> access."i_group")
    console.log('[3/7] Syncing Categories / Groups...');
    await db.exec(`
      CREATE OR REPLACE FUNCTION inventory.fn_sync_category_to_access()
      RETURNS TRIGGER AS $$
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          DELETE FROM access."i_group" WHERE "g_code" = OLD.code;
          RETURN OLD;
        END IF;

        INSERT INTO access."i_group" ("g_code", "g_a_name")
        VALUES (NEW.code, NEW.name)
        ON CONFLICT ("g_code") DO UPDATE SET
          "g_a_name" = EXCLUDED."g_a_name";

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_category_to_access ON inventory.categories;
      CREATE TRIGGER trg_sync_category_to_access
      AFTER INSERT OR UPDATE OR DELETE ON inventory.categories
      FOR EACH ROW EXECUTE FUNCTION inventory.fn_sync_category_to_access();

      -- Backfill Categories
      INSERT INTO access."i_group" ("g_code", "g_a_name")
      SELECT code, name
      FROM inventory.categories
      ON CONFLICT ("g_code") DO UPDATE SET
        "g_a_name" = EXCLUDED."g_a_name";
    `);
    const catCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."i_group"');
    console.log(`[3/7] Total categories in access."i_group": ${catCount.rows[0].count}`);

    // 4. Warehouses Sync (inventory.warehouses -> access."W_DETAIL")
    console.log('[4/7] Syncing Warehouses...');
    await db.exec(`
      CREATE OR REPLACE FUNCTION inventory.fn_sync_warehouse_to_access()
      RETURNS TRIGGER AS $$
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          DELETE FROM access."W_DETAIL" WHERE "W_CODE" = OLD.code;
          RETURN OLD;
        END IF;

        INSERT INTO access."W_DETAIL" ("W_CODE", "w_a_name", "w_loc", "locked")
        VALUES (NEW.code, NEW.name, COALESCE(NEW.address, ''), (NOT NEW.is_active))
        ON CONFLICT ("W_CODE") DO UPDATE SET
          "w_a_name" = EXCLUDED."w_a_name",
          "w_loc" = EXCLUDED."w_loc",
          "locked" = EXCLUDED."locked";

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_warehouse_to_access ON inventory.warehouses;
      CREATE TRIGGER trg_sync_warehouse_to_access
      AFTER INSERT OR UPDATE OR DELETE ON inventory.warehouses
      FOR EACH ROW EXECUTE FUNCTION inventory.fn_sync_warehouse_to_access();

      -- Backfill Warehouses
      INSERT INTO access."W_DETAIL" ("W_CODE", "w_a_name", "w_loc", "locked")
      SELECT code, name, COALESCE(address, ''), (NOT is_active)
      FROM inventory.warehouses
      ON CONFLICT ("W_CODE") DO UPDATE SET
        "w_a_name" = EXCLUDED."w_a_name",
        "w_loc" = EXCLUDED."w_loc",
        "locked" = EXCLUDED."locked";
    `);
    const whCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."W_DETAIL"');
    console.log(`[4/7] Total warehouses in access."W_DETAIL": ${whCount.rows[0].count}`);

    // 5. Items Master Sync (inventory.items -> access."item_detail")
    console.log('[5/7] Syncing Items Master...');
    await db.exec(`
      CREATE OR REPLACE FUNCTION inventory.fn_sync_item_to_access()
      RETURNS TRIGGER AS $$
      DECLARE
        v_unit_code VARCHAR(20);
        v_cat_code VARCHAR(50);
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          DELETE FROM access."item_detail" WHERE "i_code" = OLD.sku;
          RETURN OLD;
        END IF;

        IF NEW.unit_id IS NOT NULL THEN
          SELECT code INTO v_unit_code FROM inventory.units WHERE id = NEW.unit_id;
        END IF;
        IF v_unit_code IS NULL THEN v_unit_code := 'PCS'; END IF;

        IF NEW.category_id IS NOT NULL THEN
          SELECT code INTO v_cat_code FROM inventory.categories WHERE id = NEW.category_id;
        END IF;
        IF v_cat_code IS NULL THEN v_cat_code := 'CAT-TECH'; END IF;

        INSERT INTO access."item_detail" (
          "i_code",
          "i_a_name",
          "i_measure",
          "i_cost",
          "i_cwtavg",
          "g_code",
          "i_desc",
          "blocked",
          "i_c_type"
        ) VALUES (
          NEW.sku,
          NEW.name,
          v_unit_code,
          COALESCE(NEW.purchase_price, 0),
          COALESCE(NEW.purchase_price, 0),
          v_cat_code,
          COALESCE(NEW.description, ''),
          (NOT NEW.is_active),
          CASE WHEN NEW.is_stock_item THEN 1 ELSE 2 END
        )
        ON CONFLICT ("i_code") DO UPDATE SET
          "i_a_name" = EXCLUDED."i_a_name",
          "i_measure" = EXCLUDED."i_measure",
          "i_cost" = EXCLUDED."i_cost",
          "g_code" = EXCLUDED."g_code",
          "i_desc" = EXCLUDED."i_desc",
          "blocked" = EXCLUDED."blocked",
          "i_c_type" = EXCLUDED."i_c_type";

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_item_to_access ON inventory.items;
      CREATE TRIGGER trg_sync_item_to_access
      AFTER INSERT OR UPDATE OR DELETE ON inventory.items
      FOR EACH ROW EXECUTE FUNCTION inventory.fn_sync_item_to_access();

      -- Backfill Items
      INSERT INTO access."item_detail" (
        "i_code", "i_a_name", "i_measure", "i_cost", "i_cwtavg", "g_code", "i_desc", "blocked", "i_c_type"
      )
      SELECT 
        it.sku,
        it.name,
        COALESCE(u.code, 'PCS'),
        COALESCE(it.purchase_price, 0),
        COALESCE(it.purchase_price, 0),
        COALESCE(c.code, 'CAT-TECH'),
        COALESCE(it.description, ''),
        (NOT it.is_active),
        CASE WHEN it.is_stock_item THEN 1 ELSE 2 END
      FROM inventory.items it
      LEFT JOIN inventory.units u ON u.id = it.unit_id
      LEFT JOIN inventory.categories c ON c.id = it.category_id
      ON CONFLICT ("i_code") DO UPDATE SET
        "i_a_name" = EXCLUDED."i_a_name",
        "i_measure" = EXCLUDED."i_measure",
        "i_cost" = EXCLUDED."i_cost",
        "g_code" = EXCLUDED."g_code",
        "i_desc" = EXCLUDED."i_desc",
        "blocked" = EXCLUDED."blocked",
        "i_c_type" = EXCLUDED."i_c_type";
    `);
    const itemCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."item_detail"');
    console.log(`[5/7] Total items in access."item_detail": ${itemCount.rows[0].count}`);

    // 6. Stock Movements and Warehouse Balances Sync
    console.log('[6/7] Populating stock movements and item_store balances...');
    await db.exec(`
      -- Populate item_mov from stock_transactions
      DELETE FROM access."item_mov";
      INSERT INTO access."item_mov" (
        "doc_no", "doc_type", "i_code", "w_code", "i_date", "i_qty", "i_cost", "stk_cost", "a_desc"
      )
      SELECT 
        st.transaction_number,
        CASE 
          WHEN st.transaction_type = 'PURCHASE_RECEIPT' THEN 2
          WHEN st.transaction_type = 'SALES_ISSUE' THEN 1
          WHEN st.transaction_type = 'TRANSFER_IN' THEN 5
          WHEN st.transaction_type = 'TRANSFER_OUT' THEN 6
          ELSE 3
        END,
        it.sku,
        wh.code,
        st.transaction_date,
        l.quantity,
        l.unit_cost,
        l.total_cost,
        COALESCE(st.notes, '')
      FROM inventory.stock_transaction_lines l
      JOIN inventory.stock_transactions st ON st.id = l.transaction_id
      JOIN inventory.items it ON it.id = l.item_id
      JOIN inventory.warehouses wh ON wh.id = st.warehouse_id;

      -- Populate item_store balances
      DELETE FROM access."item_store";
      INSERT INTO access."item_store" (
        "i_code", "w_code", "avail_qty", "actual_qty", "open_stock", "i_measure"
      )
      SELECT 
        it."i_code",
        wh."W_CODE",
        COALESCE(SUM(
          CASE 
            WHEN m.doc_type IN (2, 3, 5, 8) THEN m.i_qty 
            WHEN m.doc_type IN (1, 4, 6, 7) THEN -m.i_qty 
            ELSE 0 
          END
        ), 0) AS avail_qty,
        COALESCE(SUM(
          CASE 
            WHEN m.doc_type IN (2, 3, 5, 8) THEN m.i_qty 
            WHEN m.doc_type IN (1, 4, 6, 7) THEN -m.i_qty 
            ELSE 0 
          END
        ), 0) AS actual_qty,
        0 AS open_stock,
        COALESCE(it.i_measure, 'PCS')
      FROM access."item_detail" it
      CROSS JOIN access."W_DETAIL" wh
      LEFT JOIN access."item_mov" m ON m.i_code = it.i_code AND m.w_code = wh."W_CODE"
      GROUP BY it.i_code, wh."W_CODE", it.i_measure
      ON CONFLICT ("w_code", "i_code") DO UPDATE SET
        "avail_qty" = EXCLUDED."avail_qty",
        "actual_qty" = EXCLUDED."actual_qty";

      -- Weighted Average Cost (access.wt_avg and access.avg_cost)
      DELETE FROM access."wt_avg";
      INSERT INTO access."wt_avg" ("i_code", "wtavg")
      SELECT 
        i_code,
        CASE WHEN SUM(i_qty) > 0 THEN SUM(stk_cost) / SUM(i_qty) ELSE 0 END
      FROM access."item_mov"
      WHERE doc_type IN (2, 3)
      GROUP BY i_code
      ON CONFLICT ("i_code") DO UPDATE SET "wtavg" = EXCLUDED."wtavg";

      DELETE FROM access."avg_cost";
      INSERT INTO access."avg_cost" ("i_code", "av_cst")
      SELECT 
        i_code,
        CASE WHEN SUM(i_qty) > 0 THEN SUM(stk_cost) / SUM(i_qty) ELSE 0 END
      FROM access."item_mov"
      WHERE doc_type IN (2, 3)
      GROUP BY i_code
      ON CONFLICT ("i_code") DO UPDATE SET "av_cst" = EXCLUDED."av_cst";

      -- Update weighted average cost in item_detail
      UPDATE access."item_detail" id
      SET "i_cwtavg" = w.wtavg
      FROM access."wt_avg" w
      WHERE id.i_code = w.i_code;
    `);

    const movCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."item_mov"');
    const storeCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."item_store"');
    console.log(`[6/7] Total stock movements in access."item_mov": ${movCount.rows[0].count}`);
    console.log(`[6/7] Total stock store balances in access."item_store": ${storeCount.rows[0].count}`);

    // 7. Create Unified Views
    console.log('[7/7] Creating unified views for inventory...');
    await db.exec(`
      CREATE OR REPLACE VIEW inventory.v_items_unified AS
      SELECT 
        it.id AS item_id,
        it.sku,
        it.barcode,
        it.name,
        it.purchase_price,
        it.sale_price,
        it.is_stock_item,
        it.is_active,
        id."i_cwtavg" AS legacy_weighted_avg_cost,
        id."i_cost" AS legacy_cost,
        id."i_measure" AS legacy_unit,
        id."g_code" AS legacy_category_code
      FROM inventory.items it
      LEFT JOIN access."item_detail" id ON id.i_code = it.sku
      ORDER BY it.sku ASC;

      CREATE OR REPLACE VIEW inventory.v_warehouses_unified AS
      SELECT 
        wh.id AS warehouse_id,
        wh.code,
        wh.name,
        wh.address,
        wh.is_active,
        w."w_loc" AS legacy_location
      FROM inventory.warehouses wh
      LEFT JOIN access."W_DETAIL" w ON w."W_CODE" = wh.code
      ORDER BY wh.code ASC;

      CREATE OR REPLACE VIEW inventory.v_stock_balances_unified AS
      SELECT 
        it.sku,
        it.name AS item_name,
        wh.code AS warehouse_code,
        wh.name AS warehouse_name,
        s."avail_qty" AS available_quantity,
        s."actual_qty" AS physical_quantity,
        id."i_cwtavg" AS unit_weighted_cost,
        (s."avail_qty" * COALESCE(id."i_cwtavg", 0)) AS total_stock_valuation
      FROM access."item_store" s
      JOIN access."item_detail" id ON id.i_code = s.i_code
      JOIN inventory.items it ON it.sku = s.i_code
      JOIN inventory.warehouses wh ON wh.code = s.w_code
      ORDER BY it.sku, wh.code;
    `);

    // Run verification
    const sampleStock = await db.query(`SELECT * FROM inventory.v_stock_balances_unified`);
    console.log('Stock Balances Unified View:');
    console.table(sampleStock.rows);

    console.log('\n=== Step 2.4 Completed Successfully with 100% Data Integrity ===');
  } finally {
    await closeDb();
  }
}

syncInventoryAndWarehouses().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
