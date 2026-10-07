import { getDb } from './db.ts';

async function test() {
  const db = await getDb();
  const q = '%النور%';
  const limit = 25;
  const qRes = await db.query(`
    SELECT 
      c.id, 
      c.code, 
      c.name, 
      c.phone, 
      c.tax_number as "taxNumber",
      COALESCE((
        SELECT SUM(inv.total - inv.paid_amount)
        FROM sales.sales_invoices inv
        WHERE inv.customer_id = c.id AND inv.status = 'POSTED' AND inv.payment_type = 'CREDIT'
      ), 0) as "balance", 
      c.credit_limit as "creditLimit" 
    FROM sales.customers c 
    WHERE (c.code ILIKE $1 OR c.name ILIKE $1 OR c.phone ILIKE $1) AND c.is_active = true 
    ORDER BY c.name LIMIT $2
  `, [q, limit]);
  console.log('Result count for النور:', qRes.rows.length);
  console.log('Results:', qRes.rows);

  const allRes = await db.query(`
    SELECT 
      c.id, 
      c.code, 
      c.name, 
      c.phone, 
      c.tax_number as "taxNumber",
      COALESCE((
        SELECT SUM(inv.total - inv.paid_amount)
        FROM sales.sales_invoices inv
        WHERE inv.customer_id = c.id AND inv.status = 'POSTED' AND inv.payment_type = 'CREDIT'
      ), 0) as "balance", 
      c.credit_limit as "creditLimit" 
    FROM sales.customers c 
    WHERE (c.code ILIKE $1 OR c.name ILIKE $1 OR c.phone ILIKE $1) AND c.is_active = true 
    ORDER BY c.name LIMIT $2
  `, ['%%', limit]);
  console.log('Result count for empty query (all):', allRes.rows.length);
  console.log('All customers:', allRes.rows);
}

test().catch(console.error);
