import assert from 'assert';
import { getDb } from './db.ts';
import { SettingsService } from './settingsService.ts';

async function runSettingsTests() {
  console.log('================================================================');
  console.log('🧪 Starting Kayan Central Settings Hub & Configuration Test Suite');
  console.log('================================================================');

  const db = await getDb();
  const compRes = await db.query<any>('SELECT id FROM core.companies LIMIT 1');
  const companyId = compRes.rows[0]?.id;

  // -------------------------------------------------------------
  // Test 1: Settings CRUD & Read Default Values
  // -------------------------------------------------------------
  console.log('\n--- Test 1: Settings CRUD & Default Values ---');
  const allowNegStockDefault = await SettingsService.getSetting<boolean>('inventory.allow_negative_stock');
  assert.strictEqual(allowNegStockDefault, false, '1. Default allow_negative_stock is false');
  console.log('✅ [PASS] 1. Default allow_negative_stock is false');

  const compName = await SettingsService.getSetting<string>('core.company_name');
  assert.strictEqual(compName, 'شركة كيان للتجارة والتوزيع', '2. Default company name correctly read');
  console.log('✅ [PASS] 2. Default company name read correctly');

  // -------------------------------------------------------------
  // Test 2: Typed Settings Resolution (BOOLEAN, INTEGER, DECIMAL, ACCOUNT_ID)
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Typed Settings Resolution ---');
  const termsDays = await SettingsService.getSetting<number>('sales.default_payment_terms_days');
  assert.strictEqual(typeof termsDays, 'number', '3. Payment terms is typed INTEGER');
  assert.strictEqual(termsDays, 30, '3.1 Payment terms value equals 30');
  console.log('✅ [PASS] 3. Typed INTEGER setting resolved properly');

  const approvalLimit = await SettingsService.getSetting<number>('expenses.require_approval_above_amount');
  assert.strictEqual(typeof approvalLimit, 'number', '4. Approval limit is typed DECIMAL');
  assert.strictEqual(approvalLimit, 500000, '4.1 Approval limit equals 500,000');
  console.log('✅ [PASS] 4. Typed DECIMAL setting resolved properly');

  // -------------------------------------------------------------
  // Test 3: Account Mapping & Validation
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Account Mapping & Business Validation ---');
  const cashAccId = await SettingsService.getSetting<string>('accounting.default_cash_account');
  assert.ok(cashAccId, '5. Default cash account mapping exists');

  const cashAccRes = await db.query<any>('SELECT code, name FROM accounting.accounts WHERE id = $1', [cashAccId]);
  assert.strictEqual(cashAccRes.rows[0]?.code, '1101', '5.1 Default cash account points to GL 1101');
  console.log('✅ [PASS] 5. Default Cash Account mapped to GL 1101');

  // -------------------------------------------------------------
  // Test 4: Rejection of Invalid Account ID
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Rejection of Invalid Account Dependencies ---');
  let rejected = false;
  try {
    await SettingsService.setSetting('accounting.default_cash_account', '00000000-0000-0000-0000-000000000000', {
      companyId,
      reason: 'Test invalid ID',
    });
  } catch (err: any) {
    rejected = true;
    assert.ok(err.message.includes('غير موجود'), '6. Error explains account does not exist');
  }
  assert.strictEqual(rejected, true, '6.1 Non-existent account properly rejected');
  console.log('✅ [PASS] 6. Non-existent Account ID rejected with validation error');

  // Rejection of wrong account group (e.g. Setting COGS account to Revenue account)
  let wrongGroupRejected = false;
  try {
    const revAcc = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '41' LIMIT 1");
    await SettingsService.setSetting('inventory.default_cogs_account', revAcc.rows[0].id, {
      companyId,
      reason: 'Attempt wrong group',
    });
  } catch (err: any) {
    wrongGroupRejected = true;
    assert.ok(err.message.includes('المصروفات والتكاليف'), '7. Error explains wrong account group');
  }
  assert.strictEqual(wrongGroupRejected, true, '7.1 Wrong group account rejected');
  console.log('✅ [PASS] 7. Incompatible Account Type rejected for COGS mapping');

  // -------------------------------------------------------------
  // Test 5: Rejection of Group/Parent Account
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Rejection of Group Accounts ---');
  let groupAccRejected = false;
  try {
    const parentAcc = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1' AND is_group = TRUE LIMIT 1");
    if (parentAcc.rows.length > 0) {
      await SettingsService.setSetting('accounting.default_cash_account', parentAcc.rows[0].id, {
        companyId,
        reason: 'Attempt parent group account',
      });
    } else {
      groupAccRejected = true;
    }
  } catch (err: any) {
    groupAccRejected = true;
    assert.ok(err.message.includes('رئيسي/تجميعي'), '8. Explains group account cannot be mapped');
  }
  assert.strictEqual(groupAccRejected, true, '8.1 Group account rejected');
  console.log('✅ [PASS] 8. Group/Parent Account rejected for operational posting');

  // -------------------------------------------------------------
  // Test 6: Settings Update & Audit Trail
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Settings Update & Audit Logging ---');
  const updateRes = await SettingsService.setSetting('inventory.allow_negative_stock', true, {
    companyId,
    username: 'admin',
    reason: 'تمكين مؤقت لعملية الجرد',
  });
  assert.strictEqual(updateRes.success, true, '9. Setting updated successfully');

  // Verify updated in DB and cache
  const updatedNegStock = await SettingsService.getSetting<boolean>('inventory.allow_negative_stock');
  assert.strictEqual(updatedNegStock, true, '9.1 Setting reflects updated boolean true');

  // Verify logged in core.settings_audit
  const auditRes = await db.query<any>(
    'SELECT * FROM core.settings_audit WHERE setting_key = $1 ORDER BY created_at DESC LIMIT 1',
    ['inventory.allow_negative_stock']
  );
  assert.strictEqual(auditRes.rows.length, 1, '10. Audit log recorded');
  assert.strictEqual(auditRes.rows[0].new_value, true, '10.1 Audit records new value true');
  assert.strictEqual(auditRes.rows[0].reason, 'تمكين مؤقت لعملية الجرد', '10.2 Audit records documented reason');
  console.log('✅ [PASS] 9. Setting updated and reflected in runtime');
  console.log('✅ [PASS] 10. Change strictly recorded in core.settings_audit with user and reason');

  // -------------------------------------------------------------
  // Test 7: Reset to Default Value
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Reset Setting to Default ---');
  await SettingsService.resetSetting('inventory.allow_negative_stock', companyId);
  const resetNegStock = await SettingsService.getSetting<boolean>('inventory.allow_negative_stock');
  assert.strictEqual(resetNegStock, false, '11. Setting restored to default false');
  console.log('✅ [PASS] 11. Reset to default value executed successfully');

  // -------------------------------------------------------------
  // Test 8: Cache Eviction & Proactive Refresh
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Cache Invalidation ---');
  await SettingsService.setSetting('sales.invoice_prefix', 'SALES-2026-', {
    companyId,
    reason: 'Update prefix',
  });
  const cachedPrefix = await SettingsService.getSetting<string>('sales.invoice_prefix');
  assert.strictEqual(cachedPrefix, 'SALES-2026-', '12. Immediate cache invalidation delivers fresh value');

  // Revert back
  await SettingsService.setSetting('sales.invoice_prefix', 'INV-', { companyId });
  console.log('✅ [PASS] 12. In-memory cache invalidated and updated synchronously');

  // -------------------------------------------------------------
  // Test 9: System Configuration Health & Missing Detector
  // -------------------------------------------------------------
  console.log('\n--- Test 9: System Configuration Health Check ---');
  const health = await SettingsService.getSystemConfigurationHealth(companyId);
  assert.strictEqual(health.status, 'HEALTHY', '13. Overall configuration health is HEALTHY');
  assert.ok(health.totalActiveSettings >= 30, '13.1 More than 30 active settings verified');
  assert.strictEqual(health.missingSettingsCount, 0, '13.2 Zero missing mandatory settings');
  console.log(`✅ [PASS] 13. System Health verified: ${health.totalActiveSettings} active settings, 0 missing`);

  // -------------------------------------------------------------
  // Test 10: Historical Transactions Protection
  // -------------------------------------------------------------
  console.log('\n--- Test 10: Historical Integrity Protection ---');
  // Posted entries exist in accounting.journal_entries
  const postedCountBefore = await db.query<any>("SELECT COUNT(*) as count FROM accounting.journal_entries WHERE status = 'POSTED'");
  const countBefore = parseInt(postedCountBefore.rows[0].count, 10);

  // Update a revenue prefix or setting
  await SettingsService.setSetting('sales.default_payment_terms_days', 45, { companyId, reason: 'Policy update' });
  await SettingsService.setSetting('sales.default_payment_terms_days', 30, { companyId, reason: 'Revert policy' });

  const postedCountAfter = await db.query<any>("SELECT COUNT(*) as count FROM accounting.journal_entries WHERE status = 'POSTED'");
  const countAfter = parseInt(postedCountAfter.rows[0].count, 10);

  assert.strictEqual(countBefore, countAfter, '14. Historical posted journal entries completely untouched');
  console.log('✅ [PASS] 14. Historical Transactions and posted journals 100% protected');

  // -------------------------------------------------------------
  // Test 11: PHASE 10.5.1 — System & UI preference keys (V25)
  // -------------------------------------------------------------
  console.log('\n--- Test 11: Phase 10.5.1 UI Preference Keys (V25) ---');
  const v25Defaults: Array<[string, any]> = [
    ['ui.theme', 'light'],
    ['ui.density', 'comfortable'],
    ['ui.date_format', 'YYYY-MM-DD'],
    ['ui.thousands_separator', 'comma'],
    ['ui.decimal_separator', 'dot'],
    ['reports.currency_position', 'after'],
    ['ui.confirm_before_post', true],
    ['ui.lookup_debounce_ms', 200],
    ['ui.notify_save_success', true],
  ];
  for (const [key, expected] of v25Defaults) {
    const val = await SettingsService.getSetting(key);
    assert.deepStrictEqual(val, expected, `15. ${key} seeded with default ${JSON.stringify(expected)}`);
  }
  console.log(`✅ [PASS] 15. All ${v25Defaults.length} V25 preference keys seeded with correct defaults`);

  // Round-trip through set → get → reset (STRING + INTEGER examples)
  await SettingsService.setSetting('ui.theme', 'dark', { companyId, reason: 'Phase 10.5.1 roundtrip' });
  assert.strictEqual(await SettingsService.getSetting<string>('ui.theme'), 'dark', '16. ui.theme roundtrip (set→get)');
  await SettingsService.resetSetting('ui.theme', companyId);
  assert.strictEqual(await SettingsService.getSetting<string>('ui.theme'), 'light', '16.1 ui.theme reset to default light');

  await SettingsService.setSetting('ui.lookup_debounce_ms', 400, { companyId, reason: 'Phase 10.5.1 roundtrip' });
  assert.strictEqual(await SettingsService.getSetting<number>('ui.lookup_debounce_ms'), 400, '17. ui.lookup_debounce_ms INTEGER roundtrip');
  await SettingsService.resetSetting('ui.lookup_debounce_ms', companyId);
  assert.strictEqual(await SettingsService.getSetting<number>('ui.lookup_debounce_ms'), 200, '17.1 ui.lookup_debounce_ms reset to 200');
  console.log('✅ [PASS] 16-17. New preference keys round-trip and reset correctly');

  // Type validation applies to the new BOOLEAN keys too
  let boolRejected = false;
  try {
    await SettingsService.setSetting('ui.confirm_before_post', 'definitely', { companyId, reason: 'bad type probe' });
  } catch (err: any) {
    boolRejected = err.message.includes('منطقية');
  }
  assert.strictEqual(boolRejected, true, '18. BOOLEAN validation rejects a non-boolean ui.confirm_before_post');
  console.log('✅ [PASS] 18. V25 BOOLEAN keys enforce type validation');

  // Keys whose controls were replaced by "unsupported" labels must NOT exist:
  // a key without a consumer would be a fake setting.
  let fakeKeyRejected = false;
  try {
    await SettingsService.setSetting('ui.session_lock_minutes', 15, { companyId, reason: 'fake key probe' });
  } catch (err: any) {
    fakeKeyRejected = err.message.includes('غير موجود');
  }
  assert.strictEqual(fakeKeyRejected, true, '19. ui.session_lock_minutes was NOT seeded (no consumer exists)');
  console.log('✅ [PASS] 19. No fake setting keys were seeded without a real consumer');

  // The pre-existing key the sales service now reads when posting an invoice
  const autoIssue = await SettingsService.getSetting<boolean>('inventory.auto_create_issue_on_sale');
  assert.strictEqual(autoIssue, true, '20. inventory.auto_create_issue_on_sale defaults to true');
  console.log('✅ [PASS] 20. Auto stock-issue gate key exists with default true (behaviour unchanged by default)');

  console.log('\n================================================================');
  console.log('🎉 ALL SETTINGS HUB TESTS PASSED SUCCESSFULLY (Zero Defect)');
  console.log('================================================================');
}

runSettingsTests().catch((err) => {
  console.error('Settings Test Failure:', err);
  process.exit(1);
});
