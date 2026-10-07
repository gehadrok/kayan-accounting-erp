import assert from 'node:assert';
import { getDb } from './db.ts';
import { SalesService } from './salesService.ts';
import { PurchasingService } from './purchasingService.ts';
import { InventoryService } from './inventoryService.ts';

async function runItemSelectionIntegrationTest() {
  console.log('--- STARTING FORENSIC ITEM SELECTION & LINE INTEGRATION AUDIT ---');
  const db = await getDb();

  // 1. Fetch real active item from database
  const itemsRes = await db.query<any>('SELECT * FROM inventory.items WHERE is_active = true LIMIT 3');
  assert(itemsRes.rows.length >= 2, 'Must have at least 2 items in database');
  const item1 = itemsRes.rows[0];
  const item2 = itemsRes.rows[1];

  // Fetch real active customer
  const custRes = await db.query<any>('SELECT * FROM sales.customers WHERE is_active = true LIMIT 1');
  assert(custRes.rows.length > 0, 'Must have at least 1 customer');
  const customer = custRes.rows[0];

  // Fetch real active warehouse
  const whRes = await db.query<any>('SELECT * FROM inventory.warehouses WHERE is_active = true LIMIT 2');
  assert(whRes.rows.length > 0, 'Must have at least 1 warehouse');
  const wh1 = whRes.rows[0];
  const wh2 = whRes.rows[1] || wh1;

  console.log(`[TEST SETUP] Using Item 1: "${item1.name}" (ID: ${item1.id}, SKU: ${item1.sku})`);
  console.log(`[TEST SETUP] Using Item 2: "${item2.name}" (ID: ${item2.id}, SKU: ${item2.sku})`);
  console.log(`[TEST SETUP] Using Customer: "${customer.name}" (ID: ${customer.id})`);
  console.log(`[TEST SETUP] Using Warehouse 1: "${wh1.name}" (ID: ${wh1.id})`);

  // 2. Simulate User selecting Item 1 and Item 2 in Sales Invoice Lines
  const createdInv = await SalesService.createInvoice({
    customerId: customer.id,
    paymentType: 'CREDIT',
    invoiceDate: '2026-03-25',
    dueDate: '2026-04-25',
    notes: 'اختبار تكامل اختيار الصنف وترحيل الـ UUID وسطر الفاتورة',
    lines: [
      {
        itemId: item1.id,
        warehouseId: wh1.id,
        itemCode: item1.sku,
        description: item1.name,
        quantity: 2,
        unitPrice: 1500,
        discount: 100,
        tax: 435, // (2 * 1500 - 100) * 0.15 = 435
      },
      {
        itemId: item2.id,
        warehouseId: wh2.id,
        itemCode: item2.sku,
        description: item2.name,
        quantity: 5,
        unitPrice: 800,
        discount: 0,
        tax: 600, // 5 * 800 * 0.15 = 600
      }
    ]
  });

  console.log(`[PASS] Sales Invoice Created: ID ${createdInv.id}, Number: ${createdInv.invoice_number}`);
  assert(createdInv.id, 'Invoice ID must be defined');

  // 3. Database Forensic Verification of Line Items
  const dbLines = await db.query<any>(`
    SELECT * FROM sales.sales_invoice_lines 
    WHERE invoice_id = $1 
    ORDER BY line_number ASC
  `, [createdInv.id]);

  assert.strictEqual(dbLines.rows.length, 2, 'Database must contain exactly 2 lines');

  // Verify Line 1
  const line1 = dbLines.rows[0];
  console.log('[FORENSIC LINE 1 DB CHECK]', {
    id: line1.id,
    item_id: line1.item_id,
    expected_item_id: item1.id,
    warehouse_id: line1.warehouse_id,
    item_code: line1.item_code,
    quantity: line1.quantity,
    unit_price: line1.unit_price,
    line_total: line1.line_total
  });
  assert.strictEqual(line1.item_id, item1.id, 'Line 1 item_id in database MUST match Item 1 UUID');
  assert.strictEqual(line1.warehouse_id, wh1.id, 'Line 1 warehouse_id in database MUST match Warehouse 1 UUID');
  assert.strictEqual(Number(line1.quantity), 2, 'Line 1 quantity must be 2');
  assert.strictEqual(Number(line1.unit_price), 1500, 'Line 1 unit_price must be 1500');

  // Verify Line 2
  const line2 = dbLines.rows[1];
  console.log('[FORENSIC LINE 2 DB CHECK]', {
    id: line2.id,
    item_id: line2.item_id,
    expected_item_id: item2.id,
    warehouse_id: line2.warehouse_id,
    item_code: line2.item_code,
    quantity: line2.quantity,
    unit_price: line2.unit_price,
    line_total: line2.line_total
  });
  assert.strictEqual(line2.item_id, item2.id, 'Line 2 item_id in database MUST match Item 2 UUID');
  assert.strictEqual(line2.warehouse_id, wh2.id, 'Line 2 warehouse_id in database MUST match Warehouse 2 UUID');
  assert.strictEqual(Number(line2.quantity), 5, 'Line 2 quantity must be 5');
  assert.strictEqual(Number(line2.unit_price), 800, 'Line 2 unit_price must be 800');

  // 4. Test Service Reload / getInvoiceById (Simulating UI page reload)
  const fetchedInv = await SalesService.getInvoiceById(createdInv.id);
  assert.strictEqual(fetchedInv.lines?.length, 2, 'Fetched invoice must return 2 lines');
  assert.strictEqual(fetchedInv.lines[0].itemId, item1.id, 'Fetched Line 1 itemId must be populated');
  assert.strictEqual(fetchedInv.lines[0].itemName, item1.name, 'Fetched Line 1 itemName must match');
  assert.strictEqual(fetchedInv.lines[1].itemId, item2.id, 'Fetched Line 2 itemId must be populated');
  assert.strictEqual(fetchedInv.lines[1].itemName, item2.name, 'Fetched Line 2 itemName must match');

  console.log('--- ALL ITEM SELECTION INTEGRATION TESTS PASSED 100% ---');
  process.exit(0);
}

runItemSelectionIntegrationTest().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
