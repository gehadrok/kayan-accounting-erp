import { getDb } from '../db.ts';
import type { Request, Response } from 'express';

/**
 * GET /api/reports/trial-balance
 * Returns the trial balance grouped by account, with totals and balance check.
 * Response shape expected by TrialBalancePage.tsx:
 *  { accounts: [...], totalDebit, totalCredit, isBalanced }
 */
export async function getTrialBalance(req: Request, res: Response) {
  try {
    const db = await getDb();

    const result = await db.query<{
      account_code: string;
      account_name: string;
      level: number;
      debit_balance: string;
      credit_balance: string;
      net_balance: string;
    }>(`
      SELECT
        a."Acc_No"            AS account_code,
        a."Acc_Name"          AS account_name,
        COALESCE(a."Acc_level", 
          LENGTH(a."Acc_No") - LENGTH(REPLACE(a."Acc_No", '.', '')) + 1
        )                     AS level,
        COALESCE(SUM(CASE WHEN j."Debit"  > 0 THEN j."Debit"  ELSE 0 END), 0) AS debit_balance,
        COALESCE(SUM(CASE WHEN j."Credit" > 0 THEN j."Credit" ELSE 0 END), 0) AS credit_balance,
        COALESCE(SUM(j."Debit" - j."Credit"), 0)                              AS net_balance
      FROM access."Account" a
      LEFT JOIN access."journal" j ON j."Acc_No" = a."Acc_No"
      GROUP BY a."Acc_No", a."Acc_Name", a."Acc_level"
      HAVING COALESCE(SUM(j."Debit"), 0) != 0 OR COALESCE(SUM(j."Credit"), 0) != 0
      ORDER BY a."Acc_No";
    `);

    // Map to shape expected by the React component
    const accounts = result.rows.map((row) => ({
      accountCode: row.account_code,
      accountName: row.account_name,
      level: Number(row.level) || 1,
      debit: row.debit_balance,
      credit: row.credit_balance,
      balance: row.net_balance,
    }));

    const totalDebit  = accounts.reduce((sum, a) => sum + parseFloat(a.debit  || '0'), 0);
    const totalCredit = accounts.reduce((sum, a) => sum + parseFloat(a.credit || '0'), 0);
    const diff = Math.abs(totalDebit - totalCredit);
    const isBalanced = diff < 0.01;

    res.json({ accounts, totalDebit, totalCredit, isBalanced });
  } catch (err) {
    console.error('[TrialBalance] Error:', err);
    res.status(500).json({ error: 'فشل استخراج ميزان المراجعة.' });
  }
}
