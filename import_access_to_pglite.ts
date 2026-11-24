import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from './src/server/db';

interface ColumnInfo {
  Name: string;
  Type: number;
  DefinedSize: number;
  Precision: number;
  NumericScale: number;
  Attributes: number;
}

interface IndexInfo {
  Name: string;
  Unique: boolean;
  Columns: string[];
}

interface TableInfo {
  Name: string;
  Columns: ColumnInfo[];
  PrimaryKey: string[];
  Indexes: IndexInfo[];
}

interface ExportData {
  Source: string;
  Tables: TableInfo[];
  Data: Record<string, Record<string, any>[]>;
  Views: { Name: string; CommandText: string }[];
  Procedures: { Name: string; CommandText: string }[];
}

function mapType(col: ColumnInfo): string {
  switch (col.Type) {
    case 2: // adSmallInt
    case 17: // adUnsignedTinyInt
      return 'SMALLINT';
    case 3: // adInteger
      return 'INTEGER';
    case 4: // adSingle
      return 'REAL';
    case 5: // adDouble
      return 'DOUBLE PRECISION';
    case 6: // adCurrency
      return 'NUMERIC(19,4)';
    case 7: // adDate
      return 'TIMESTAMP';
    case 11: // adBoolean
      return 'BOOLEAN DEFAULT FALSE';
    case 131:
    case 139: // adNumeric
      return 'NUMERIC';
    case 205:
    case 204:
    case 128: // adBinary, adLongVarBinary
      return 'BYTEA';
    case 201:
    case 203: // adLongVarChar, adLongVarWChar (Memo)
      return 'TEXT';
    case 202:
    case 200:
    case 129:
    case 130:
      if (col.DefinedSize && col.DefinedSize > 0 && col.DefinedSize <= 1000) {
        return `VARCHAR(${col.DefinedSize})`;
      }
      return 'TEXT';
    default:
      return 'TEXT';
  }
}

function truncateIdent(name: string, maxLen = 63): string {
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen);
}

async function run() {
  console.log('--- Starting Access to PGlite Database Migration ---');
  const exportPath = path.resolve(process.cwd(), 'access_export.json');
  if (!fs.existsSync(exportPath)) {
    throw new Error(`Export file not found at ${exportPath}`);
  }

  const raw = fs.readFileSync(exportPath, 'utf8').replace(/^\uFEFF/, '');
  const data: ExportData = JSON.parse(raw);

  const db = await getDb();
  console.log('[PGlite] Connected to persistent database.');

  try {
    // 1. Recreate schema 'access'
    console.log('[Migration] Recreating schema "access"...');
    await db.exec(`
      DROP SCHEMA IF EXISTS access CASCADE;
      CREATE SCHEMA access;
    `);

    // 2. Create tables and primary keys
    console.log(`[Migration] Creating ${data.Tables.length} tables...`);
    let pkCount = 0;
    for (const tbl of data.Tables) {
      const colDefs: string[] = [];
      for (const col of tbl.Columns) {
        const typeStr = mapType(col);
        colDefs.push(`"${col.Name}" ${typeStr}`);
      }

      if (tbl.PrimaryKey && tbl.PrimaryKey.length > 0) {
        const pkName = truncateIdent(`pk_${tbl.Name}`);
        const pkCols = tbl.PrimaryKey.map(c => `"${c}"`).join(', ');
        colDefs.push(`CONSTRAINT "${pkName}" PRIMARY KEY (${pkCols})`);
        pkCount++;
      }

      const createSql = `CREATE TABLE access."${tbl.Name}" (\n  ${colDefs.join(',\n  ')}\n);`;
      await db.exec(createSql);
    }
    console.log(`[Migration] Created all ${data.Tables.length} tables with ${pkCount} Primary Keys.`);

    // 3. Create secondary indexes
    console.log('[Migration] Creating secondary indexes...');
    let indexCount = 0;
    for (const tbl of data.Tables) {
      for (const idx of tbl.Indexes) {
        // Skip index if columns is empty
        if (!idx.Columns || idx.Columns.length === 0) continue;
        const unique = idx.Unique ? 'UNIQUE ' : '';
        const idxName = truncateIdent(`idx_${tbl.Name}_${idx.Name}`);
        const cols = idx.Columns.map(c => `"${c}"`).join(', ');
        const idxSql = `CREATE ${unique}INDEX IF NOT EXISTS "${idxName}" ON access."${tbl.Name}" (${cols});`;
        try {
          await db.exec(idxSql);
          indexCount++;
        } catch (idxErr: any) {
          console.warn(`[Index Warning] Could not create index ${idxName} on ${tbl.Name}:`, idxErr.message);
        }
      }
    }
    console.log(`[Migration] Created ${indexCount} secondary indexes.`);

    // 4. Insert data rows
    console.log('[Migration] Inserting data records...');
    let totalRowsInserted = 0;
    for (const [tblName, rows] of Object.entries(data.Data)) {
      if (!rows || rows.length === 0) continue;
      console.log(`  Inserting ${rows.length} rows into access."${tblName}"...`);
      for (const row of rows) {
        const cols = Object.keys(row);
        const colList = cols.map(c => `"${c}"`).join(', ');
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const values = cols.map(c => row[c]);

        await db.query(
          `INSERT INTO access."${tblName}" (${colList}) VALUES (${placeholders});`,
          values
        );
        totalRowsInserted++;
      }
    }
    console.log(`[Migration] Successfully inserted ${totalRowsInserted} rows across tables.`);

    // 5. Store Metadata for Procedures and Views
    console.log('[Migration] Storing Procedures & Views metadata...');
    await db.exec(`
      CREATE TABLE access._metadata_procedures (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        sql_text TEXT NOT NULL
      );

      CREATE TABLE access._metadata_views (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        sql_text TEXT NOT NULL
      );
    `);

    for (const proc of data.Procedures) {
      await db.query(
        `INSERT INTO access._metadata_procedures (name, sql_text) VALUES ($1, $2);`,
        [proc.Name, proc.CommandText]
      );
    }
    console.log(`[Migration] Saved ${data.Procedures.length} procedure queries in access._metadata_procedures.`);

    for (const v of data.Views) {
      await db.query(
        `INSERT INTO access._metadata_views (name, sql_text) VALUES ($1, $2);`,
        [v.Name, v.CommandText]
      );
    }
    console.log(`[Migration] Saved ${data.Views.length} views in access._metadata_views.`);

    // 6. Attempt creating standard views in PostgreSQL
    console.log('[Migration] Creating native PostgreSQL views where compatible...');
    const nativeViews: { name: string; sql: string }[] = [
      {
        name: 'itm_det',
        sql: `CREATE OR REPLACE VIEW access."itm_det" AS SELECT * FROM access."item_detail" ORDER BY "i_a_name";`
      },
      {
        name: 'itm_mv',
        sql: `CREATE OR REPLACE VIEW access."itm_mv" AS SELECT * FROM access."item_mov";`
      },
      {
        name: 'in_mov',
        sql: `CREATE OR REPLACE VIEW access."in_mov" AS SELECT "i_code", "w_code", SUM("i_qty") AS in_qty, SUM("si_qty") AS sin_qty FROM access."item_mov" WHERE "doc_type" IN (2, 3, 5, 8) GROUP BY "i_code", "w_code";`
      },
      {
        name: 'out_mov',
        sql: `CREATE OR REPLACE VIEW access."out_mov" AS SELECT "i_code", "w_code", SUM("i_qty") AS out_qty, SUM("si_qty") AS sout_qty FROM access."item_mov" WHERE "doc_type" IN (1, 4, 6, 7) GROUP BY "i_code", "w_code";`
      },
      {
        name: 'max_jv',
        sql: `CREATE OR REPLACE VIEW access."max_jv" AS SELECT MAX("j_doc_no") AS new_no FROM access."journal_v";`
      },
      {
        name: 'jrnl_qry',
        sql: `CREATE OR REPLACE VIEW access."jrnl_qry" AS SELECT "a_code", "mnth", "mn_sb", SUM("amt") AS j_amt, SUM("amtf") AS j_amtf FROM access."journal" GROUP BY "a_code", "mnth", "mn_sb";`
      }
    ];

    let createdViewsCount = 0;
    for (const nv of nativeViews) {
      try {
        await db.exec(nv.sql);
        createdViewsCount++;
      } catch (err: any) {
        console.warn(`[View Warning] Could not create native view ${nv.name}:`, err.message);
      }
    }
    console.log(`[Migration] Successfully created ${createdViewsCount} native views in schema access.`);

    console.log('--- Migration Completed Successfully! ---');
  } finally {
    await closeDb();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
