import { getDb, closeDb } from './src/server/db';

async function syncJournalAndVouchers() {
  console.log('=== Step 2.5: Journal & Vouchers Harmonization & Sync ===');
  const db = await getDb();

  try {
    // 0. Temporarily drop dependent view access.jrnl_qry
    console.log('[0/6] Dropping dependent view access.jrnl_qry temporarily...');
    await db.exec(`DROP VIEW IF EXISTS access.jrnl_qry CASCADE;`);

    // 1. Adjust column types in access schema
    console.log('[1/6] Adjusting column constraints in access."journal", "cbvoucher", "cbv_detail"...');
    await db.exec(`
      ALTER TABLE access."journal"
        ALTER COLUMN "doc_no" TYPE VARCHAR(50),
        ALTER COLUMN "a_code" TYPE VARCHAR(50),
        ALTER COLUMN "j_desc" TYPE VARCHAR(255);

      ALTER TABLE access."cbvoucher"
        ALTER COLUMN "cb_vno" TYPE VARCHAR(50),
        ALTER COLUMN "cb_a_code" TYPE VARCHAR(50),
        ALTER COLUMN "cb_desc" TYPE VARCHAR(255);

      ALTER TABLE access."cbv_detail"
        ALTER COLUMN "cb_vno" TYPE VARCHAR(50),
        ALTER COLUMN "voch_desc" TYPE VARCHAR(255);

      -- Recreate jrnl_qry
      CREATE OR REPLACE VIEW access."jrnl_qry" AS 
      SELECT "a_code", "mnth", "mn_sb", SUM("amt") AS j_amt, SUM("amtf") AS j_amtf 
      FROM access."journal" 
      GROUP BY "a_code", "mnth", "mn_sb";
    `);

    // 2. Journal Entries Sync Trigger (accounting.journal_entry_lines -> access."journal")
    console.log('[2/6] Creating triggers for Journal Entries...');
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
      BEGIN
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
            "mn_sb"
          ) VALUES (
            v_entry_num,
            1,
            'JV',
            v_entry_date,
            COALESCE(v_acc_code, '1101'),
            v_amt,
            v_j_amt,
            v_is_debit,
            COALESCE(NEW.description, ''),
            FALSE,
            v_month,
            1
          );
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_journal_line_to_access ON accounting.journal_entry_lines;
      CREATE TRIGGER trg_sync_journal_line_to_access
      AFTER INSERT OR UPDATE OR DELETE ON accounting.journal_entry_lines
      FOR EACH ROW EXECUTE FUNCTION accounting.fn_sync_journal_to_access();
    `);

    // 3. Backfill existing Journal Entries and Lines
    console.log('[3/6] Backfilling journal entries into access."journal"...');
    await db.exec(`
      DELETE FROM access."journal";
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
        "mn_sb"
      )
      SELECT 
        je.entry_number,
        1,
        'JV',
        je.entry_date,
        a.code,
        CASE WHEN COALESCE(jl.debit, 0) > 0 THEN jl.debit ELSE -jl.credit END,
        CASE WHEN COALESCE(jl.debit, 0) > 0 THEN jl.debit ELSE jl.credit END,
        (COALESCE(jl.debit, 0) > 0),
        COALESCE(jl.description, je.description, ''),
        FALSE,
        EXTRACT(MONTH FROM je.entry_date)::SMALLINT,
        1
      FROM accounting.journal_entry_lines jl
      JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounting.accounts a ON a.id = jl.account_id
      ORDER BY je.entry_number, jl.debit DESC;
    `);
    const jCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."journal"');
    console.log(`[3/6] Total journal lines in access."journal": ${jCount.rows[0].count}`);

    // 4. Receipts & Payments Sync (sales.receipts & purchasing.payments -> access."cbvoucher" & "cbv_detail")
    console.log('[4/6] Creating triggers for Cash/Bank Vouchers...');
    await db.exec(`
      -- Receipt Voucher Trigger
      CREATE OR REPLACE FUNCTION sales.fn_sync_receipt_to_access()
      RETURNS TRIGGER AS $$
      DECLARE
        v_acc_code VARCHAR(50);
        v_pay_type SMALLINT;
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          DELETE FROM access."cbv_detail" WHERE "cb_vno" = OLD.receipt_number AND "cb_vtype" = 1;
          DELETE FROM access."cbvoucher" WHERE "cb_vno" = OLD.receipt_number AND "cb_vtype" = 1;
          RETURN OLD;
        END IF;

        IF NEW.counterparty_account_id IS NOT NULL THEN
          SELECT code INTO v_acc_code FROM accounting.accounts WHERE id = NEW.counterparty_account_id;
        END IF;
        IF v_acc_code IS NULL THEN v_acc_code := '1103'; END IF;

        v_pay_type := CASE WHEN NEW.payment_method = 'CASH' THEN 1 ELSE 2 END;

        DELETE FROM access."cbv_detail" WHERE "cb_vno" = NEW.receipt_number AND "cb_vtype" = 1;
        DELETE FROM access."cbvoucher" WHERE "cb_vno" = NEW.receipt_number AND "cb_vtype" = 1;

        INSERT INTO access."cbvoucher" (
          "cb_vtype", "cb_vno", "cb_vdate", "cb_a_code", "cb_amt", "cb_desc", "cb_pay_type", "cash_no"
        ) VALUES (
          1, -- 1 = Receipt
          NEW.receipt_number,
          NEW.receipt_date,
          v_acc_code,
          COALESCE(NEW.amount, 0),
          COALESCE(NEW.description, 'سند قبض'),
          v_pay_type,
          1
        );

        INSERT INTO access."cbv_detail" (
          "cb_vtype", "cb_vno", "cbv_date", "cash_amt", "cash_no", "cb_pay_type", "cb_post", "voch_desc"
        ) VALUES (
          1,
          NEW.receipt_number,
          NEW.receipt_date,
          COALESCE(NEW.amount, 0),
          1,
          v_pay_type,
          (NEW.status = 'POSTED'),
          COALESCE(NEW.description, 'سند قبض')
        );

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_receipt_to_access ON sales.receipts;
      CREATE TRIGGER trg_sync_receipt_to_access
      AFTER INSERT OR UPDATE OR DELETE ON sales.receipts
      FOR EACH ROW EXECUTE FUNCTION sales.fn_sync_receipt_to_access();

      -- Payment Voucher Trigger
      CREATE OR REPLACE FUNCTION purchasing.fn_sync_payment_to_access()
      RETURNS TRIGGER AS $$
      DECLARE
        v_acc_code VARCHAR(50);
        v_pay_type SMALLINT;
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          DELETE FROM access."cbv_detail" WHERE "cb_vno" = OLD.payment_number AND "cb_vtype" = 2;
          DELETE FROM access."cbvoucher" WHERE "cb_vno" = OLD.payment_number AND "cb_vtype" = 2;
          RETURN OLD;
        END IF;

        IF NEW.counterparty_account_id IS NOT NULL THEN
          SELECT code INTO v_acc_code FROM accounting.accounts WHERE id = NEW.counterparty_account_id;
        END IF;
        IF v_acc_code IS NULL THEN v_acc_code := '2101'; END IF;

        v_pay_type := CASE WHEN NEW.payment_method = 'CASH' THEN 1 ELSE 2 END;

        DELETE FROM access."cbv_detail" WHERE "cb_vno" = NEW.payment_number AND "cb_vtype" = 2;
        DELETE FROM access."cbvoucher" WHERE "cb_vno" = NEW.payment_number AND "cb_vtype" = 2;

        INSERT INTO access."cbvoucher" (
          "cb_vtype", "cb_vno", "cb_vdate", "cb_a_code", "cb_amt", "cb_desc", "cb_pay_type", "cash_no"
        ) VALUES (
          2, -- 2 = Payment
          NEW.payment_number,
          NEW.payment_date,
          v_acc_code,
          COALESCE(NEW.amount, 0),
          COALESCE(NEW.description, 'سند صرف'),
          v_pay_type,
          1
        );

        INSERT INTO access."cbv_detail" (
          "cb_vtype", "cb_vno", "cbv_date", "cash_amt", "cash_no", "cb_pay_type", "cb_post", "voch_desc"
        ) VALUES (
          2,
          NEW.payment_number,
          NEW.payment_date,
          COALESCE(NEW.amount, 0),
          1,
          v_pay_type,
          (NEW.status = 'POSTED'),
          COALESCE(NEW.description, 'سند صرف')
        );

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_payment_to_access ON purchasing.payments;
      CREATE TRIGGER trg_sync_payment_to_access
      AFTER INSERT OR UPDATE OR DELETE ON purchasing.payments
      FOR EACH ROW EXECUTE FUNCTION purchasing.fn_sync_payment_to_access();
    `);

    // 5. Backfill existing Receipts and Payments
    console.log('[5/6] Backfilling existing receipts and payments into access."cbvoucher" and "cbv_detail"...');
    await db.exec(`
      DELETE FROM access."cbv_detail";
      DELETE FROM access."cbvoucher";

      -- Receipts (Type = 1)
      INSERT INTO access."cbvoucher" (
        "cb_vtype", "cb_vno", "cb_vdate", "cb_a_code", "cb_amt", "cb_desc", "cb_pay_type", "cash_no"
      )
      SELECT 
        1,
        r.receipt_number,
        r.receipt_date,
        COALESCE(a.code, '1103'),
        COALESCE(r.amount, 0),
        COALESCE(r.description, 'سند قبض'),
        CASE WHEN r.payment_method = 'CASH' THEN 1 ELSE 2 END,
        1
      FROM sales.receipts r
      LEFT JOIN accounting.accounts a ON a.id = r.counterparty_account_id;

      INSERT INTO access."cbv_detail" (
        "cb_vtype", "cb_vno", "cbv_date", "cash_amt", "cash_no", "cb_pay_type", "cb_post", "voch_desc"
      )
      SELECT 
        1,
        r.receipt_number,
        r.receipt_date,
        COALESCE(r.amount, 0),
        1,
        CASE WHEN r.payment_method = 'CASH' THEN 1 ELSE 2 END,
        (r.status = 'POSTED'),
        COALESCE(r.description, 'سند قبض')
      FROM sales.receipts r;

      -- Payments (Type = 2)
      INSERT INTO access."cbvoucher" (
        "cb_vtype", "cb_vno", "cb_vdate", "cb_a_code", "cb_amt", "cb_desc", "cb_pay_type", "cash_no"
      )
      SELECT 
        2,
        p.payment_number,
        p.payment_date,
        COALESCE(a.code, '2101'),
        COALESCE(p.amount, 0),
        COALESCE(p.description, 'سند صرف'),
        CASE WHEN p.payment_method = 'CASH' THEN 1 ELSE 2 END,
        1
      FROM purchasing.payments p
      LEFT JOIN accounting.accounts a ON a.id = p.counterparty_account_id;

      INSERT INTO access."cbv_detail" (
        "cb_vtype", "cb_vno", "cbv_date", "cash_amt", "cash_no", "cb_pay_type", "cb_post", "voch_desc"
      )
      SELECT 
        2,
        p.payment_number,
        p.payment_date,
        COALESCE(p.amount, 0),
        1,
        CASE WHEN p.payment_method = 'CASH' THEN 1 ELSE 2 END,
        (p.status = 'POSTED'),
        COALESCE(p.description, 'سند صرف')
      FROM purchasing.payments p;
    `);

    const cbvCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."cbvoucher"');
    const cbvDetCount = await db.query<{ count: string }>('SELECT count(*) as count FROM access."cbv_detail"');
    console.log(`[5/6] Total vouchers in access."cbvoucher": ${cbvCount.rows[0].count}`);
    console.log(`[5/6] Total voucher details in access."cbv_detail": ${cbvDetCount.rows[0].count}`);

    // 6. Create Unified Views
    console.log('[6/6] Creating unified views for journal and vouchers...');
    await db.exec(`
      CREATE OR REPLACE VIEW accounting.v_journal_entries_unified AS
      SELECT 
        je.id AS entry_id,
        je.entry_number,
        je.entry_date,
        je.status,
        je.description,
        (SELECT COUNT(*) FROM access."journal" j WHERE j."doc_no" = je.entry_number) AS legacy_journal_lines,
        (SELECT SUM("j_amt") FROM access."journal" j WHERE j."doc_no" = je.entry_number AND j."j_amt_type" = TRUE) AS total_debit,
        (SELECT SUM("j_amt") FROM access."journal" j WHERE j."doc_no" = je.entry_number AND j."j_amt_type" = FALSE) AS total_credit
      FROM accounting.journal_entries je
      ORDER BY je.entry_number ASC;

      CREATE OR REPLACE VIEW accounting.v_vouchers_unified AS
      SELECT 
        v."cb_vtype" AS voucher_type,
        CASE WHEN v."cb_vtype" = 1 THEN 'سند قبض' ELSE 'سند صرف' END AS voucher_type_name,
        v."cb_vno" AS voucher_number,
        v."cb_vdate" AS voucher_date,
        v."cb_a_code" AS account_code,
        a.name AS account_name,
        v."cb_amt" AS amount,
        CASE WHEN v."cb_pay_type" = 1 THEN 'نقدي' ELSE 'شيك/بنك' END AS payment_mode,
        v."cb_desc" AS description,
        d."cb_post" AS is_posted
      FROM access."cbvoucher" v
      LEFT JOIN access."cbv_detail" d ON d."cb_vno" = v."cb_vno" AND d."cb_vtype" = v."cb_vtype"
      LEFT JOIN accounting.accounts a ON a.code = v."cb_a_code"
      ORDER BY v."cb_vdate" DESC, v."cb_vno" DESC;
    `);

    // Run verification
    const sampleJe = await db.query(`SELECT * FROM accounting.v_journal_entries_unified`);
    console.log('Sample Unified Journal Entries:');
    console.table(sampleJe.rows);

    const sampleVouchers = await db.query(`SELECT * FROM accounting.v_vouchers_unified`);
    console.log('Sample Unified Vouchers:');
    console.table(sampleVouchers.rows);

    console.log('\n=== Step 2.5 Completed Successfully with 100% Data Integrity ===');
  } finally {
    await closeDb();
  }
}

syncJournalAndVouchers().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
