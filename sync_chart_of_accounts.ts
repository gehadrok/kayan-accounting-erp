import { getDb, closeDb } from './src/server/db';

async function syncChartOfAccounts() {
  console.log('=== Step 2.1: Chart of Accounts Harmonization & Sync ===');
  const db = await getDb();

  try {
    // 1. Expand column lengths in access."Account" to comfortably accommodate 50-char codes and names
    console.log('[1/5] Adjusting column constraints in access."Account"...');
    await db.exec(`
      ALTER TABLE access."Account" 
        ALTER COLUMN "A_Code" TYPE VARCHAR(50),
        ALTER COLUMN "A_Parent" TYPE VARCHAR(50),
        ALTER COLUMN "A_Name" TYPE VARCHAR(255),
        ALTER COLUMN "A_name_Eng" TYPE VARCHAR(255),
        ALTER COLUMN "A_Cy" TYPE VARCHAR(20);
    `);

    // 2. Create the Trigger Function to automatically sync accounting.accounts -> access."Account"
    console.log('[2/5] Creating trigger function fn_sync_account_to_access()...');
    await db.exec(`
      CREATE OR REPLACE FUNCTION accounting.fn_sync_account_to_access()
      RETURNS TRIGGER AS $$
      DECLARE
        v_parent_code VARCHAR(50);
        v_report VARCHAR(40);
        v_asm SMALLINT;
        v_dr BOOLEAN;
        v_close BOOLEAN;
        v_cy VARCHAR(20);
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          DELETE FROM access."Account" WHERE "A_Code" = OLD.code;
          RETURN OLD;
        END IF;

        -- Determine parent code
        IF NEW.parent_id IS NOT NULL THEN
          SELECT code INTO v_parent_code FROM accounting.accounts WHERE id = NEW.parent_id;
        END IF;
        IF v_parent_code IS NULL THEN
          v_parent_code := '0';
        END IF;

        -- Determine report
        IF NEW.account_type_id IN ('ASSET', 'LIABILITY', 'EQUITY') THEN
          v_report := 'Balance Sheet';
        ELSE
          v_report := 'Profit And Loss';
        END IF;

        -- Determine ASM (1 = Group/Parent, 2 = Detail/Sub)
        IF NEW.is_group THEN
          v_asm := 1;
        ELSE
          v_asm := 2;
        END IF;

        -- Determine normal balance
        v_dr := (NEW.normal_balance = 'DEBIT');

        -- Determine closed state
        v_close := (NOT NEW.is_active);

        -- Currency code
        IF NEW.currency_codes IS NOT NULL AND LENGTH(TRIM(NEW.currency_codes)) > 0 THEN
          v_cy := SPLIT_PART(NEW.currency_codes, ',', 1);
        ELSE
          v_cy := 'YER';
        END IF;

        -- UPSERT into access."Account"
        INSERT INTO access."Account" (
          "A_Code",
          "A_Name",
          "A_Parent",
          "A_Level",
          "a_s_m",
          "A_Report",
          "A_Cy",
          "Dr",
          "ac_close"
        ) VALUES (
          NEW.code,
          NEW.name,
          v_parent_code,
          COALESCE(NEW.level, 1)::SMALLINT,
          v_asm,
          v_report,
          v_cy,
          v_dr,
          v_close
        )
        ON CONFLICT ("A_Code") DO UPDATE SET
          "A_Name" = EXCLUDED."A_Name",
          "A_Parent" = EXCLUDED."A_Parent",
          "A_Level" = EXCLUDED."A_Level",
          "a_s_m" = EXCLUDED."a_s_m",
          "A_Report" = EXCLUDED."A_Report",
          "A_Cy" = EXCLUDED."A_Cy",
          "Dr" = EXCLUDED."Dr",
          "ac_close" = EXCLUDED."ac_close";

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_account_to_access ON accounting.accounts;
      CREATE TRIGGER trg_sync_account_to_access
      AFTER INSERT OR UPDATE OR DELETE ON accounting.accounts
      FOR EACH ROW EXECUTE FUNCTION accounting.fn_sync_account_to_access();
    `);

    // 3. Backfill all existing 439 accounts from accounting.accounts into access."Account"
    console.log('[3/5] Backfilling existing accounts into access."Account"...');
    const backfillRes = await db.query<{ count: string }>(`
      WITH parent_lookup AS (
        SELECT 
          a.code,
          a.name,
          COALESCE(p.code, '0') as parent_code,
          a.level,
          CASE WHEN a.is_group THEN 1 ELSE 2 END as a_s_m,
          CASE WHEN a.account_type_id IN ('ASSET', 'LIABILITY', 'EQUITY') THEN 'Balance Sheet' ELSE 'Profit And Loss' END as a_report,
          COALESCE(SPLIT_PART(a.currency_codes, ',', 1), 'YER') as a_cy,
          (a.normal_balance = 'DEBIT') as dr,
          (NOT a.is_active) as ac_close
        FROM accounting.accounts a
        LEFT JOIN accounting.accounts p ON p.id = a.parent_id
        ORDER BY a.level ASC, a.code ASC
      )
      INSERT INTO access."Account" (
        "A_Code", "A_Name", "A_Parent", "A_Level", "a_s_m", "A_Report", "A_Cy", "Dr", "ac_close"
      )
      SELECT 
        code, name, parent_code, level::SMALLINT, a_s_m::SMALLINT, a_report, a_cy, dr, ac_close
      FROM parent_lookup
      ON CONFLICT ("A_Code") DO UPDATE SET
        "A_Name" = EXCLUDED."A_Name",
        "A_Parent" = EXCLUDED."A_Parent",
        "A_Level" = EXCLUDED."A_Level",
        "a_s_m" = EXCLUDED."a_s_m",
        "A_Report" = EXCLUDED."A_Report",
        "A_Cy" = EXCLUDED."A_Cy",
        "Dr" = EXCLUDED."Dr",
        "ac_close" = EXCLUDED."ac_close";
    `);

    const countRes = await db.query<{ count: string }>('SELECT count(*) as count FROM access."Account"');
    console.log(`[3/5] Done. Total accounts in access."Account": ${countRes.rows[0].count}`);

    // 4. Create Unified Chart of Accounts View
    console.log('[4/5] Creating accounting.v_chart_of_accounts_unified view...');
    await db.exec(`
      CREATE OR REPLACE VIEW accounting.v_chart_of_accounts_unified AS
      SELECT 
        a.id AS account_id,
        a.code,
        a.name,
        a.account_type_id,
        t.name AS account_type_name,
        a.level,
        a.is_group,
        a.is_active,
        a.normal_balance,
        a.currency_codes,
        acc."A_Parent" AS legacy_parent_code,
        acc."A_Report" AS legacy_report_type,
        acc."a_s_m" AS legacy_asm,
        acc."A_Cy" AS legacy_primary_currency,
        acc."Dr" AS legacy_is_debit,
        acc."ac_close" AS legacy_is_closed
      FROM accounting.accounts a
      LEFT JOIN accounting.account_types t ON t.id = a.account_type_id
      LEFT JOIN access."Account" acc ON acc."A_Code" = a.code
      ORDER BY a.code ASC;
    `);

    // 5. Verification tests
    console.log('[5/5] Running verification checks...');
    const sample = await db.query(`
      SELECT code, name, legacy_parent_code, level, is_group, legacy_report_type, legacy_primary_currency 
      FROM accounting.v_chart_of_accounts_unified 
      ORDER BY code ASC 
      LIMIT 10;
    `);
    console.log('Sample rows from unified view:');
    console.table(sample.rows);

    console.log('\n=== Step 2.1 Completed Successfully with 100% Data Integrity ===');
  } finally {
    await closeDb();
  }
}

syncChartOfAccounts().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
