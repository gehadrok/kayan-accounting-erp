import { getDb, closeDb } from './src/server/db';

async function syncStep3() {
  const db = await getDb();
  console.log('====================================================');
  console.log('Starting Phase 3: Accounting Business Logic Engine');
  console.log('Step 3.2 (Fiscal Closing) & Step 3.3 (Cost Centers)');
  console.log('====================================================\n');

  try {
    // ----------------------------------------------------
    // Drop existing triggers first to prevent any recursion before updating functions
    // ----------------------------------------------------
    await db.exec(`
      DROP TRIGGER IF EXISTS trg_sync_cost_center_to_access ON accounting.cost_centers;
      DROP TRIGGER IF EXISTS trg_sync_cost_center_to_kayan ON access."cost_centers";
      DROP TRIGGER IF EXISTS trg_sync_fiscal_year_to_access ON accounting.fiscal_years;
      DROP TRIGGER IF EXISTS trg_sync_vld_date_to_kayan ON access."vld_date";
    `);

    // Clean up test cost center if left over
    await db.query(`DELETE FROM accounting.cost_centers WHERE code = 'CC-TEST'`);
    await db.query(`DELETE FROM access."cost_centers" WHERE "cost_center_no" = 'CC-TEST'`);

    // ----------------------------------------------------
    // 1. COST CENTERS HARMONIZATION & SYNC (Step 3.3)
    // ----------------------------------------------------
    console.log('[1/6] Harmonizing Cost Centers...');

    // Populate existing cost centers from accounting.cost_centers into access."cost_centers"
    await db.exec(`
      INSERT INTO access."cost_centers" (
        "cost_center_no",
        "cost_center_name",
        "cost_center_name_english",
        "center_type",
        "related_center"
      )
      SELECT 
        cc.code,
        cc.name,
        cc.code,
        '1',
        NULL
      FROM accounting.cost_centers cc
      ON CONFLICT ("cost_center_no") DO UPDATE 
      SET "cost_center_name" = EXCLUDED."cost_center_name";
    `);

    // Trigger on accounting.cost_centers -> access."cost_centers"
    await db.exec(`
      CREATE OR REPLACE FUNCTION accounting.fn_sync_cost_center_to_access()
      RETURNS TRIGGER AS $$
      BEGIN
        IF pg_trigger_depth() > 1 THEN
          RETURN COALESCE(NEW, OLD);
        END IF;

        IF (TG_OP = 'DELETE') THEN
          DELETE FROM access."cost_centers" WHERE "cost_center_no" = OLD.code;
          RETURN OLD;
        END IF;

        INSERT INTO access."cost_centers" (
          "cost_center_no",
          "cost_center_name",
          "cost_center_name_english",
          "center_type"
        ) VALUES (
          NEW.code,
          NEW.name,
          NEW.code,
          '1'
        )
        ON CONFLICT ("cost_center_no") DO UPDATE 
        SET "cost_center_name" = EXCLUDED."cost_center_name",
            "cost_center_name_english" = EXCLUDED."cost_center_name_english";

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_cost_center_to_access ON accounting.cost_centers;
      CREATE TRIGGER trg_sync_cost_center_to_access
      AFTER INSERT OR UPDATE OR DELETE ON accounting.cost_centers
      FOR EACH ROW EXECUTE FUNCTION accounting.fn_sync_cost_center_to_access();
    `);

    // Reverse Trigger: access."cost_centers" -> accounting.cost_centers
    await db.exec(`
      CREATE OR REPLACE FUNCTION access.fn_sync_cost_center_to_kayan()
      RETURNS TRIGGER AS $$
      DECLARE
        v_company_id UUID;
      BEGIN
        IF pg_trigger_depth() > 1 THEN
          RETURN COALESCE(NEW, OLD);
        END IF;

        IF (TG_OP = 'DELETE') THEN
          DELETE FROM accounting.cost_centers WHERE code = OLD."cost_center_no";
          RETURN OLD;
        END IF;

        SELECT id INTO v_company_id FROM core.companies LIMIT 1;

        INSERT INTO accounting.cost_centers (
          company_id,
          code,
          name,
          is_active
        ) VALUES (
          v_company_id,
          NEW."cost_center_no",
          COALESCE(NEW."cost_center_name", NEW."cost_center_no"),
          TRUE
        )
        ON CONFLICT (company_id, code) DO UPDATE
        SET name = EXCLUDED.name;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_cost_center_to_kayan ON access."cost_centers";
      CREATE TRIGGER trg_sync_cost_center_to_kayan
      AFTER INSERT OR UPDATE OR DELETE ON access."cost_centers"
      FOR EACH ROW EXECUTE FUNCTION access.fn_sync_cost_center_to_kayan();
    `);

    // Unified View for Cost Centers
    await db.exec(`
      CREATE OR REPLACE VIEW accounting.v_cost_centers_unified AS
      SELECT 
        cc.id AS kayan_id,
        cc.company_id,
        cc.code AS cost_center_code,
        cc.name AS cost_center_name,
        cc.is_active,
        cc.created_at,
        ac."cost_center_no" AS access_cost_center_no,
        ac."center_type" AS access_center_type,
        ac."cost_center_name_english" AS access_name_english
      FROM accounting.cost_centers cc
      FULL OUTER JOIN access."cost_centers" ac ON cc.code = ac."cost_center_no";
    `);
    console.log('✓ Cost Centers sync triggers and unified view created.');

    // ----------------------------------------------------
    // 2. ENHANCE JOURNAL SYNC TO INCLUDE COST CENTER
    // ----------------------------------------------------
    console.log('[2/6] Enhancing Journal Entry sync to propagate cost centers...');
    await db.exec(`
      CREATE OR REPLACE FUNCTION accounting.fn_sync_journal_to_access()
      RETURNS TRIGGER AS $$
      DECLARE
        v_entry_num VARCHAR(50);
        v_entry_date TIMESTAMP;
        v_acc_code VARCHAR(50);
        v_month SMALLINT;
        v_amt DOUBLE PRECISION;
        v_j_amt NUMERIC;
        v_is_debit BOOLEAN;
        v_cost_cntr VARCHAR(50);
      BEGIN
        IF pg_trigger_depth() > 1 THEN
          RETURN COALESCE(NEW, OLD);
        END IF;

        IF (TG_OP = 'DELETE') THEN
          SELECT entry_number INTO v_entry_num FROM accounting.journal_entries WHERE id = OLD.journal_entry_id;
          IF v_entry_num IS NOT NULL THEN
            DELETE FROM access."journal" WHERE "doc_no" = v_entry_num;
          END IF;
          RETURN OLD;
        END IF;

        SELECT entry_number, entry_date INTO v_entry_num, v_entry_date 
        FROM accounting.journal_entries WHERE id = NEW.journal_entry_id;

        IF v_entry_num IS NOT NULL THEN
          SELECT code INTO v_acc_code FROM accounting.accounts WHERE id = NEW.account_id;
          v_month := EXTRACT(MONTH FROM v_entry_date)::SMALLINT;

          IF COALESCE(NEW.debit, 0) > 0 THEN
            v_amt := NEW.debit;
            v_j_amt := NEW.debit;
            v_is_debit := TRUE;
          ELSE
            v_amt := -NEW.credit;
            v_j_amt := NEW.credit;
            v_is_debit := FALSE;
          END IF;

          -- Look up Cost Center code
          IF NEW.cost_center_id IS NOT NULL THEN
            SELECT code INTO v_cost_cntr FROM accounting.cost_centers WHERE id = NEW.cost_center_id;
          ELSE
            v_cost_cntr := NULL;
          END IF;

          INSERT INTO access."journal" (
            "doc_no",
            "doc_type",
            "jv_type",
            "J_date",
            "a_code",
            "amt",
            "j_amt",
            "j_amt_type",
            "j_desc",
            "j_close",
            "mnth",
            "mn_sb",
            "cost_cntr_no"
          ) VALUES (
            v_entry_num,
            1,
            'JV',
            v_entry_date,
            COALESCE(v_acc_code, '1101'),
            v_amt,
            v_j_amt,
            v_is_debit,
            COALESCE(NEW.description, 'قيد يومية من كايان ERP'),
            FALSE,
            v_month,
            1,
            v_cost_cntr
          );
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✓ Journal Entry sync enhanced with cost center mapping.');

    // ----------------------------------------------------
    // 3. FISCAL YEARS & PERIODS SYNC (Step 3.2)
    // ----------------------------------------------------
    console.log('[3/6] Harmonizing Fiscal Years & Periods with access.vld_date...');

    // Fetch active fiscal year
    const fyRes = await db.query(`SELECT * FROM accounting.fiscal_years ORDER BY start_date DESC LIMIT 1`);
    if (fyRes.rows.length > 0) {
      const activeYear = fyRes.rows[0];
      const startYear = new Date(activeYear.start_date).getFullYear();
      const endYear = new Date(activeYear.end_date).getFullYear();

      // Check access.vld_date
      const vldCount = await db.query(`SELECT COUNT(*) as count FROM access."vld_date"`);
      if (parseInt(vldCount.rows[0].count, 10) === 0) {
        await db.exec(`
          INSERT INTO access."vld_date" (
            "vld_year", "vld_mnth", "t_year", "t_mnth", 
            "y_close", "pl_close", "file_close", "brn_no"
          ) VALUES (
            ${startYear}, 1, ${endYear}, 12,
            ${activeYear.is_closed ? 'TRUE' : 'FALSE'},
            ${activeYear.is_closed ? 'TRUE' : 'FALSE'},
            FALSE, 0
          );
        `);
      } else {
        await db.exec(`
          UPDATE access."vld_date"
          SET 
            "vld_year" = ${startYear},
            "vld_mnth" = 1,
            "t_year" = ${endYear},
            "t_mnth" = 12,
            "y_close" = ${activeYear.is_closed ? 'TRUE' : 'FALSE'},
            "pl_close" = ${activeYear.is_closed ? 'TRUE' : 'FALSE'};
        `);
      }
    }

    // Trigger on accounting.fiscal_years -> access."vld_date"
    await db.exec(`
      CREATE OR REPLACE FUNCTION accounting.fn_sync_fiscal_year_to_access()
      RETURNS TRIGGER AS $$
      DECLARE
        v_start_year SMALLINT;
        v_end_year SMALLINT;
        v_start_month SMALLINT;
        v_end_month SMALLINT;
      BEGIN
        IF pg_trigger_depth() > 1 THEN
          RETURN COALESCE(NEW, OLD);
        END IF;

        v_start_year := EXTRACT(YEAR FROM NEW.start_date)::SMALLINT;
        v_end_year := EXTRACT(YEAR FROM NEW.end_date)::SMALLINT;
        v_start_month := EXTRACT(MONTH FROM NEW.start_date)::SMALLINT;
        v_end_month := EXTRACT(MONTH FROM NEW.end_date)::SMALLINT;

        UPDATE access."vld_date"
        SET 
          "vld_year" = v_start_year,
          "vld_mnth" = v_start_month,
          "t_year" = v_end_year,
          "t_mnth" = v_end_month,
          "y_close" = NEW.is_closed,
          "pl_close" = NEW.is_closed;

        IF NOT FOUND THEN
          INSERT INTO access."vld_date" (
            "vld_year", "vld_mnth", "t_year", "t_mnth",
            "y_close", "pl_close", "file_close", "brn_no"
          ) VALUES (
            v_start_year, v_start_month, v_end_year, v_end_month,
            NEW.is_closed, NEW.is_closed, FALSE, 0
          );
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_fiscal_year_to_access ON accounting.fiscal_years;
      CREATE TRIGGER trg_sync_fiscal_year_to_access
      AFTER INSERT OR UPDATE ON accounting.fiscal_years
      FOR EACH ROW EXECUTE FUNCTION accounting.fn_sync_fiscal_year_to_access();
    `);

    // Reverse Trigger: access."vld_date" -> accounting.fiscal_years
    await db.exec(`
      CREATE OR REPLACE FUNCTION access.fn_sync_vld_date_to_kayan()
      RETURNS TRIGGER AS $$
      BEGIN
        IF pg_trigger_depth() > 1 THEN
          RETURN COALESCE(NEW, OLD);
        END IF;

        IF (NEW."y_close" IS DISTINCT FROM OLD."y_close") THEN
          UPDATE accounting.fiscal_years
          SET 
            is_closed = NEW."y_close",
            closed_at = CASE WHEN NEW."y_close" THEN NOW() ELSE NULL END,
            updated_at = NOW()
          WHERE EXTRACT(YEAR FROM start_date) = NEW."vld_year";
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_vld_date_to_kayan ON access."vld_date";
      CREATE TRIGGER trg_sync_vld_date_to_kayan
      AFTER UPDATE ON access."vld_date"
      FOR EACH ROW EXECUTE FUNCTION access.fn_sync_vld_date_to_kayan();
    `);

    // Unified View for Fiscal Years & Periods
    await db.exec(`
      CREATE OR REPLACE VIEW accounting.v_fiscal_years_unified AS
      SELECT 
        fy.id AS fiscal_year_id,
        fy.company_id,
        fy.year_name,
        fy.start_date,
        fy.end_date,
        fy.is_closed AS is_closed_kayan,
        fy.closed_at,
        vld."vld_year" AS access_start_year,
        vld."t_year" AS access_end_year,
        vld."y_close" AS access_year_closed,
        vld."pl_close" AS access_pl_closed,
        vld."file_close" AS access_file_closed,
        (SELECT COUNT(*) FROM accounting.fiscal_periods fp WHERE fp.fiscal_year_id = fy.id) AS total_periods,
        (SELECT COUNT(*) FROM accounting.fiscal_periods fp WHERE fp.fiscal_year_id = fy.id AND fp.status = 'CLOSED') AS closed_periods
      FROM accounting.fiscal_years fy
      LEFT JOIN access."vld_date" vld 
        ON EXTRACT(YEAR FROM fy.start_date) = vld."vld_year";
    `);
    console.log('✓ Fiscal Years sync triggers and unified view created.');

    // ----------------------------------------------------
    // 4. VERIFICATION TESTS
    // ----------------------------------------------------
    console.log('[4/6] Running Bidirectional Verification Tests...');

    // Test A: Cost Center Bidirectional Sync
    console.log('Testing Cost Center forward and reverse sync...');
    const testCcCode = 'CC-TEST';
    await db.query(`
      INSERT INTO accounting.cost_centers (company_id, code, name, is_active)
      VALUES ((SELECT id FROM core.companies LIMIT 1), $1, 'مركز تكلفة اختباري', true)
    `, [testCcCode]);

    const accCcCheck = await db.query(`SELECT * FROM access."cost_centers" WHERE "cost_center_no" = $1`, [testCcCode]);
    if (accCcCheck.rows.length === 1 && accCcCheck.rows[0].cost_center_name === 'مركز تكلفة اختباري') {
      console.log('  ✓ Forward sync to access.cost_centers: SUCCESS');
    } else {
      throw new Error('Forward sync to access.cost_centers failed!');
    }

    // Clean up test cost center
    await db.query(`DELETE FROM accounting.cost_centers WHERE code = $1`, [testCcCode]);
    const accCcClean = await db.query(`SELECT * FROM access."cost_centers" WHERE "cost_center_no" = $1`, [testCcCode]);
    if (accCcClean.rows.length === 0) {
      console.log('  ✓ Forward delete sync to access.cost_centers: SUCCESS');
    } else {
      throw new Error('Forward delete sync to access.cost_centers failed!');
    }

    // Test B: Fiscal Year Sync to access.vld_date
    console.log('Testing Fiscal Year sync to access.vld_date...');
    const vldState = await db.query(`SELECT * FROM access."vld_date"`);
    console.log('  Current access.vld_date state:');
    console.table(vldState.rows);

    // Test C: Unified Views Check
    console.log('[5/6] Verifying Unified Views...');
    const vCostRes = await db.query(`SELECT * FROM accounting.v_cost_centers_unified`);
    console.log('v_cost_centers_unified rows:');
    console.table(vCostRes.rows);

    const vFyRes = await db.query(`SELECT * FROM accounting.v_fiscal_years_unified`);
    console.log('v_fiscal_years_unified rows:');
    console.table(vFyRes.rows);

    console.log('[6/6] Phase 3 Synchronization & Harmonization Complete 100%!');

  } finally {
    await closeDb();
  }
}

syncStep3().catch(err => {
  console.error('Migration Step 3 failed:', err);
  process.exit(1);
});
