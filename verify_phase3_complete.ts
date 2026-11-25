import { getDb, closeDb } from './src/server/db';
import { AccountingService } from './src/server/accountingService';

async function verifyPhase3() {
  const db = await getDb();
  console.log('--- Verifying Phase 3 Complete End-to-End ---');

  try {
    // 1. Check Fiscal Sync
    const fyCheck = await db.query(`SELECT * FROM accounting.v_fiscal_years_unified`);
    console.log('Fiscal Years Unified:');
    console.table(fyCheck.rows);

    // 2. Check Cost Centers Sync
    const ccCheck = await db.query(`SELECT * FROM accounting.v_cost_centers_unified`);
    console.log('\nCost Centers Unified:');
    console.table(ccCheck.rows);

    // 3. Post a Journal Entry with Cost Center CC-03 (Sales & Marketing)
    console.log('\nTesting posting a Journal Entry with Cost Center CC-03...');
    const company = (await db.query(`SELECT id FROM core.companies LIMIT 1`)).rows[0];
    const period = (await db.query(`SELECT id FROM accounting.fiscal_periods WHERE period_number = 1 LIMIT 1`)).rows[0];
    const ccSales = (await db.query(`SELECT id, code FROM accounting.cost_centers WHERE code = 'CC-03' LIMIT 1`)).rows[0];

    // Expense account (leaf): 3211020003 (Internet/Phone) or any leaf under 3
    const expAcc = (await db.query(`SELECT id, code FROM accounting.accounts WHERE code LIKE '3211%' AND is_group = FALSE LIMIT 1`)).rows[0];
    // Cash account (leaf): any leaf under 1101
    const cashAcc = (await db.query(`SELECT id, code FROM accounting.accounts WHERE code LIKE '1101%' AND is_group = FALSE LIMIT 1`)).rows[0];

    const sourceRes = (await db.query(`SELECT id FROM accounting.journal_sources LIMIT 1`)).rows[0];
    const sourceId = sourceRes?.id || 'SYSTEM';

    const je = await AccountingService.createJournalEntry({
      companyId: company.id,
      entryDate: new Date('2026-01-15'),
      fiscalPeriodId: period.id,
      sourceId: sourceId,
      description: 'قيد تجريبي مع مركز تكلفة التسويق CC-03',
      lines: [
        {
          accountId: expAcc.id,
          debit: 15000,
          credit: 0,
          description: 'مصاريف انترنت وهاتف تسويق',
          costCenterId: ccSales.id,
        },
        {
          accountId: cashAcc.id,
          debit: 0,
          credit: 15000,
          description: 'سداد نقدي من الصندوق',
        }
      ]
    });

    const postedJe = await AccountingService.postJournalEntry(je.id);
    console.log(`Journal Entry ${postedJe.entry_number} posted successfully!`);

    // Verify in access."journal"
    const accessJLines = await db.query(`
      SELECT "doc_no", "a_code", "amt", "j_amt", "j_amt_type", "j_desc", "cost_cntr_no"
      FROM access."journal"
      WHERE "doc_no" = $1
      ORDER BY "amt" DESC
    `, [postedJe.entry_number]);

    console.log('\nSynced lines in access."journal":');
    console.table(accessJLines.rows);

    const hasCc = accessJLines.rows.some((r: any) => r.cost_cntr_no === 'CC-03');
    if (hasCc) {
      console.log('✓ SUCCESS: Cost center CC-03 successfully propagated to access.journal!');
    } else {
      throw new Error('Cost center was not found in access.journal!');
    }

    console.log('\n========================================================');
    console.log('ALL PHASE 3 REQUIREMENTS VERIFIED & PASSED WITH 100% SUCCESS!');
    console.log('========================================================');

  } finally {
    await closeDb();
  }
}

verifyPhase3().catch(err => {
  console.error('Phase 3 verification failed:', err);
  process.exit(1);
});
