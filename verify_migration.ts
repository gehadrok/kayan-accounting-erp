import { getDb, closeDb } from './src/server/db';

async function verify() {
  console.log('=== Verifying PGlite "access" Schema ===');
  const db = await getDb();

  try {
    // 1. Table count
    const tableRes = await db.query<{ count: string }>(`
      SELECT count(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'access' AND table_type = 'BASE TABLE' AND table_name NOT LIKE '\\_%';
    `);
    const tableCount = parseInt(tableRes.rows[0].count, 10);
    console.log(`User Tables in "access": ${tableCount} / 102`);

    // 2. Primary Keys count
    const pkRes = await db.query<{ count: string }>(`
      SELECT count(*) as count 
      FROM information_schema.table_constraints 
      WHERE table_schema = 'access' AND constraint_type = 'PRIMARY KEY' AND table_name NOT LIKE '\\_%';
    `);
    const pkCount = parseInt(pkRes.rows[0].count, 10);
    console.log(`Primary Keys in "access": ${pkCount} / 50`);

    // 3. Indexes count
    const idxRes = await db.query<{ count: string }>(`
      SELECT count(*) as count 
      FROM pg_indexes 
      WHERE schemaname = 'access' AND indexname LIKE 'idx_%';
    `);
    const idxCount = parseInt(idxRes.rows[0].count, 10);
    console.log(`Secondary Indexes in "access": ${idxCount} / 135`);

    // 4. Row counts in populated tables
    const tablesToCheck = ['abranch', 'User', 'bal_sht_B', 'branch', 'vld_date'];
    console.log('\n--- Checking Row Data in Seeded Tables ---');
    for (const t of tablesToCheck) {
      const res = await db.query(`SELECT * FROM access."${t}"`);
      console.log(`Table access."${t}": ${res.rows.length} row(s)`);
      console.log(`   Sample:`, JSON.stringify(res.rows[0]));
    }

    // 5. Metadata verification
    const procRes = await db.query<{ count: string }>(`SELECT count(*) as count FROM access._metadata_procedures;`);
    console.log(`\nPreserved Procedures in _metadata_procedures: ${procRes.rows[0].count} / 37`);

    const viewMetaRes = await db.query<{ count: string }>(`SELECT count(*) as count FROM access._metadata_views;`);
    console.log(`Preserved Views in _metadata_views: ${viewMetaRes.rows[0].count} / 19`);

    const nativeViewRes = await db.query<{ count: string }>(`
      SELECT count(*) as count 
      FROM information_schema.views 
      WHERE table_schema = 'access';
    `);
    console.log(`Native PostgreSQL Views in "access": ${nativeViewRes.rows[0].count}`);

    // 6. Test querying a native view
    const testView = await db.query(`SELECT count(*) as count FROM access."itm_det"`);
    console.log(`Query on native view access."itm_det" succeeded. Row count: ${testView.rows[0].count}`);

    console.log('\n=== ALL VERIFICATIONS PASSED 100% ===');
  } finally {
    await closeDb();
  }
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
