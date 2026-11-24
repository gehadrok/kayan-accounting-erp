/**
 * KAYAN ERP — pgAdmin Bridge Server
 * ==================================
 * يعرض قاعدة بيانات PGlite المدمجة عبر منفذ TCP باستخدام بروتوكول PostgreSQL wire protocol،
 * ताकि pgAdmin يمكن أن يتصل بقاعدة البيانات ويعرض الجداول والبيانات.
 *
 * يعمل هذا الخادم داخل نفس عملية Node.js ويشارك نفس مثيل PGlite مع الخادم الرئيسي.
 *
 * منفذ الاستماع: 5433 (يمكن تغييره عبر متغير PGADMIN_BRIDGE_PORT)
 */

import { createServer as createNetServer, type Socket } from 'node:net';
import { getDb } from './db.ts';

/* ------------------------------------------------------------------ */
/* PostgreSQL Wire Protocol — 최소 ما يحتاجه pgAdmin */
/* ------------------------------------------------------------------ */

const READY_FOR_QUERY = Buffer.from([0x5a, 0x00, 0x00, 0x00, 0x49]); // 'Z' + 'I'

function int32BE(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n, 0);
  return b;
}

function int16BE(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeInt16BE(n, 0);
  return b;
}

function paramStatus(key: string, value: string): Buffer {
  const payload = Buffer.from(`${key}\0${value}\0`, 'utf-8');
  const len = int32BE(4 + payload.length + 1);
  return Buffer.concat([Buffer.from([0x53]), len, payload]); // 'S'
}

function rowDescription(fields: Array<{ name: string; typeOid: number }>): Buffer {
  let payload = int16BE(fields.length);
  for (const f of fields) {
    const nameBuf = Buffer.from(f.name, 'utf-8');
    payload = Buffer.concat([
      payload,
      nameBuf,
      int16BE(0), // table oid
      int32BE(0), // table attribute number
      int32BE(f.typeOid), // data type oid
      int16BE(-1), // type size
      int16BE(-1), // type modifier
      int32BE(-1), // format (text)
    ]);
  }
  const len = int32BE(4 + payload.length + 1);
  return Buffer.concat([Buffer.from([0x54]), len, payload]); // 'T'
}

function dataRow(values: Array<Buffer | null>): Buffer {
  let payload = int16BE(values.length);
  for (const v of values) {
    if (v === null) {
      payload = Buffer.concat([payload, int32BE(-1)]);
    } else {
      payload = Buffer.concat([payload, int32BE(v.length), v]);
    }
  }
  const len = int32BE(4 + payload.length + 1);
  return Buffer.concat([Buffer.from([0x44]), len, payload]); // 'D'
}

function commandComplete(tag: string): Buffer {
  const payload = Buffer.from(tag, 'utf-8');
  const len = int32BE(4 + payload.length + 1);
  return Buffer.concat([Buffer.from([0x43]), len, payload]); // 'C'
}

function errorResponse(message: string): Buffer {
  const fields = Buffer.concat([
    Buffer.from([0x53, ...Buffer.from('ERROR', 'utf-8'), 0]),
    Buffer.from([0x4d, ...Buffer.from(message, 'utf-8'), 0]),
    Buffer.from([0]),
  ]);
  const len = int32BE(4 + fields.length + 1);
  return Buffer.concat([Buffer.from([0x45]), len, fields]); // 'E'
}

const OID_TEXT = 25;
const OID_INT4 = 23;
const OID_INT8 = 20;
const OID_VARCHAR = 1043;
const OID_UUID = 2950;
const OID_TIMESTAMP = 1114;
const OID_DATE = 1082;
const OID_NUMERIC = 1700;
const OID_BOOL = 16;

/* ------------------------------------------------------------------ */
/* إدارة الخادم */
/* ------------------------------------------------------------------ */

let bridgeServer: ReturnType<typeof createNetServer> | null = null;
let isListening = false;

export function startPgAdminBridge(port: number = 5433): void {
  if (isListening) {
    console.log(`[pgAdmin Bridge] بالفعل يعمل على المنفذ ${port}`);
    return;
  }

  bridgeServer = createNetServer((socket: Socket) => {
    console.log('[pgAdmin Bridge] عميل جديد اتصل');
    let buffer = Buffer.alloc(0);

    const send = (data: Buffer) => socket.write(data);

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 5) {
        const msgType = buffer[0];
        const msgLen = buffer.readInt32BE(1);

        if (buffer.length < 1 + msgLen) break;

        const msgBody = buffer.subarray(5, 1 + msgLen);
        buffer = buffer.subarray(1 + msgLen);

        try {
          if (msgType === 0x00) {
            // StartupMessage
            send(paramStatus('server_version', '15.0 (PGlite)'));
            send(paramStatus('server_encoding', 'UTF8'));
            send(paramStatus('client_encoding', 'UTF8'));
            send(paramStatus('DateStyle', 'ISO, MDY'));
            send(paramStatus('integer_datetimes', 'on'));
            send(paramStatus('standard_conforming_strings', 'on'));
            send(READY_FOR_QUERY);
            console.log('[pgAdmin Bridge] StartupMessage — تم الاستقبال والإجابة');
          } else if (msgType === 0x51) {
            // Query
            const nullTerm = msgBody.indexOf(0);
            const end = nullTerm === -1 ? msgBody.length : nullTerm;
            const query = msgBody.subarray(0, end).toString('utf-8');
            console.log(`[pgAdmin Bridge] استعلام: ${query.substring(0, 120)}`);
            handleQuery(socket, query, send);
          } else if (msgType === 0x58) {
            // Terminate
            console.log('[pgAdmin Bridge] العميل أنهى الاتصال');
            socket.end();
            return;
          } else {
            console.log(`[pgAdmin Bridge] رسالة من النوع ${msgType} — تم تجاهلها`);
          }
        } catch (err: any) {
          console.error('[pgAdmin Bridge] خطأ:', err.message);
          send(errorResponse(err.message));
          send(READY_FOR_QUERY);
        }
      }
    });

    socket.on('error', () => {
      // تجاهل أخطاء socket الصامتة
    });

    socket.on('close', () => {
      console.log('[pgAdmin Bridge] العميل قطع الاتصال');
    });
  });

  bridgeServer.listen(port, '127.0.0.1', () => {
    isListening = true;
    console.log(`[pgAdmin Bridge] يعمل على 127.0.0.1:${port}`);
    console.log(`[pgAdmin Bridge] إعدادات pgAdmin:`);
    console.log(`   Host: 127.0.0.1`);
    console.log(`   Port: ${port}`);
    console.log(`   Database: postgres`);
    console.log(`   Username: kayan_erp`);
    console.log(`   Password: (فارغ)`);
  });

  bridgeServer.on('error', (err: any) => {
    console.error(`[pgAdmin Bridge] فشل على المنفذ ${port}:`, err.message);
    isListening = false;
  });
}

export function stopPgAdminBridge(): void {
  if (bridgeServer) {
    bridgeServer.close();
    bridgeServer = null;
    isListening = false;
    console.log('[pgAdmin Bridge] تم الإيقاف');
  }
}

/* ------------------------------------------------------------------ */
/* معالج الاستعلامات */
/* ------------------------------------------------------------------ */

async function handleQuery(socket: Socket, query: string, send: (data: Buffer) => void): Promise<void> {
  const db = await getDb();

  try {
    const trimmed = query.trim();
    const upper = trimmed.toUpperCase();

    if (upper.startsWith('SELECT')) {
      const result = await db.query<any>(query);
      const rows = result.rows || [];

      const fields = result.fields || [];
      if (fields.length > 0) {
        send(rowDescription(fields.map((f: any) => ({ name: f.name, typeOid: f.dataTypeID || OID_TEXT }))));
      } else if (rows.length > 0) {
        const firstRow = rows[0];
        const fieldNames = Object.keys(firstRow);
        send(rowDescription(fieldNames.map((name) => ({ name, typeOid: inferOid(firstRow[name]) }))));
      }

      for (const row of rows) {
        const fieldNames = Object.keys(row);
        const values = fieldNames.map((name) => encodeValue(row[name]));
        send(dataRow(values));
      }

      send(commandComplete(`SELECT ${rows.length}`));
      send(READY_FOR_QUERY);
    } else if (upper.startsWith('INSERT') || upper.startsWith('UPDATE') || upper.startsWith('DELETE')) {
      const result = await db.query<any>(query);
      send(commandComplete(`${upper.split(' ')[0]} ${result.rowCount ?? 0}`));
      send(READY_FOR_QUERY);
    } else {
      const result = await db.query<any>(query);
      if (result.rows && result.rows.length > 0) {
        const firstRow = result.rows[0];
        const fieldNames = Object.keys(firstRow);
        send(rowDescription(fieldNames.map((name) => ({ name, typeOid: inferOid(firstRow[name]) }))));
        for (const row of result.rows) {
          const values = fieldNames.map((name) => encodeValue(row[name]));
          send(dataRow(values));
        }
        send(commandComplete(`SELECT ${result.rows.length}`));
      } else {
        send(commandComplete('SELECT 0'));
      }
      send(READY_FOR_QUERY);
    }
  } catch (err: any) {
    console.error('[pgAdmin Bridge] خطأ:', err.message);
    send(errorResponse(err.message));
    send(READY_FOR_QUERY);
  }
}

/* ------------------------------------------------------------------ */
/* أدوات مساعدة */
/* ------------------------------------------------------------------ */

function inferOid(value: any): number {
  if (value === null || value === undefined) return OID_TEXT;
  if (typeof value === 'boolean') return OID_BOOL;
  if (typeof value === 'number') return Number.isInteger(value) ? OID_INT4 : OID_NUMERIC;
  if (value instanceof Date) return OID_TIMESTAMP;
  if (typeof value === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return OID_UUID;
    return OID_TEXT;
  }
  return OID_TEXT;
}

function encodeValue(value: any): Buffer | null {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf-8');
  if (typeof value === 'number') return Buffer.from(String(value), 'utf-8');
  if (typeof value === 'boolean') return Buffer.from(value ? 't' : 'f', 'utf-8');
  if (value instanceof Date) return Buffer.from(value.toISOString(), 'utf-8');
  return Buffer.from(String(value), 'utf-8');
}
