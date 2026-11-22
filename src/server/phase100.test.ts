import fs from 'fs';
import { getDb } from './db.ts';
import { CompanyService, sniffImageType, MAX_LOGO_BYTES, COMPANY_LOGO_DIR } from './companyService.ts';
import express from 'express';
import { apiRouter } from './routes.ts';
import { issueSessionToken, verifySessionToken, extractBearerToken } from './sessionTokens.ts';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * PHASE 10.0 — company identity, logo upload and bilingual report header.
 *
 * Isolated: runs against an in-memory PGlite database created fresh by db.ts.
 * No production data is touched. Logo files are written under a temp folder and
 * removed at the end of the suite.
 *
 * Covers the required cases:
 *   1. company profile save + retrieve
 *   2. logo upload / replace / remove
 *   3. unsafe or unsupported files rejected
 *   4. settings writes rejected without the right permission
 *   5. reports read identity from the single central source
 *   6. AR left / logo centre / EN right order is fixed
 *   7. the logo does not move when name lengths differ
 *   8. the header never collides with the report title or content
 *   9. existing invoice/report printing still works
 *  10. no accounting / purchasing / sales / inventory regression
 */
async function runPhase100Tests() {
  console.log('========================================================');
  console.log('🏢  PHASE 10.0 — Company Identity, Logo & Report Header');
  console.log('========================================================');

  const db = await getDb();
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName}: ${detail || ''}`);
      process.exitCode = 1;
    }
  }

  const S = Date.now().toString().slice(-6);

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = await new Promise<any>((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  let adminId = '';
  // The seeded `admin` id is resolved once, up front, so both the token
  // factories and the credential tests can reference it regardless of order.
  let seededAdminId = '';
  const adminToken = () => issueSessionToken(adminId, 'admin');
  let weakToken = '';
  // Body markers consumed by sendJson, which turns them into a real
  // Authorization header. Using a unique symbol keeps them clearly distinct
  // from any legitimate payload field.
  const TOKEN = 'AUTH_TOKEN';
  const WEAK_TOKEN = 'WEAK_AUTH_TOKEN';

  const getJson = async (p: string) => {
    const r = await fetch(`${base}/api${p}`);
    return { status: r.status, body: await r.json().catch(() => null) as any };
  };
  const sendJson = async (method: string, p: string, body: any, headers: Record<string, string> = {}) => {
    // Body markers are resolved into a REAL signed bearer token header, which
    // is the only identity the write endpoints accept.
    const resolved: any = { ...(body || {}) };
    let token = '';
    if (resolved.TOKEN !== undefined) { token = adminToken(); delete resolved.TOKEN; }
    if (resolved.WEAK_TOKEN !== undefined) { token = weakToken; delete resolved.WEAK_TOKEN; }
    const r = await fetch(`${base}/api${p}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: JSON.stringify(resolved),
    });
    return { status: r.status, body: await r.json().catch(() => null) as any };
  };

  // ---- tiny valid image fixtures built from real magic bytes ----
  const PNG_BYTES = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 0x00),
  ]);
  const JPEG_BYTES = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from('JFIF\0', 'ascii'),
    Buffer.alloc(64, 0x00),
  ]);
  const WEBP_BYTES = Buffer.concat([
    Buffer.from('RIFF', 'ascii'), Buffer.from([0x40, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'ascii'), Buffer.alloc(64, 0x00),
  ]);

  try {
    // =========================================================
    console.log('\n--- 0b. the seeded admin credential actually works end to end ---');
    // =========================================================
    // Regression guard for PHASE 10.0.1: the seed comment documents
    // "Password is 'admin123'", but the shipped hash did not verify against it,
    // leaving the account with no usable credential and locking every
    // permission-guarded write. V22 repairs it; this test proves the REAL
    // login path works, not just that a token can be minted internally.
    const adminRow = (await db.query<any>(
      "SELECT id, username, password_hash FROM security.users WHERE username = 'admin' LIMIT 1"
    )).rows[0];
    assert(!!adminRow, '0b. the seeded admin account exists');
    seededAdminId = adminRow.id;

    const bcrypt = (await import('bcryptjs')).default;
    assert(await bcrypt.compare('admin123', adminRow.password_hash),
      '0b. the documented password admin123 verifies against the stored hash');

    const loginRes = await sendJson('POST', '/auth/login', { username: 'admin', password: 'admin123' }, {});
    assert(loginRes.status === 200, '0c. POST /auth/login succeeds with the seeded credential',
      `${loginRes.status} ${JSON.stringify(loginRes.body?.error)}`);
    assert(!!loginRes.body?.token, '0d. login issues a session token');
    assert(verifySessionToken(loginRes.body?.token)?.sub === seededAdminId, '0e. the issued token is bound to admin',
      `token sub=${verifySessionToken(loginRes.body?.token)?.sub} adminId=${seededAdminId}`);

    // The real login token must authorize a real write — the exact chain the
    // Company Settings screen performs.
    const viaLogin = await fetch(`${base}/api/company/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginRes.body.token}` },
      body: JSON.stringify({ website: 'www.kayan.test' }),
    });
    assert(viaLogin.status === 200, '0f. a token obtained by logging in can save the profile', String(viaLogin.status));
    assert((await getJson('/company/profile')).body.website === 'www.kayan.test', '0g. that write persisted');

    const badLogin = await sendJson('POST', '/auth/login', { username: 'admin', password: 'wrong-password' }, {});
    assert(badLogin.status === 401, '0h. a wrong password is rejected', String(badLogin.status));
    assert(!badLogin.body?.token, '0i. a failed login issues no token');

    // =========================================================
    console.log('\n--- 1. profile save + retrieve ---');
    // =========================================================
    const admin = (await db.query<any>('SELECT id FROM security.users WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1')).rows[0];
    adminId = admin.id;

    const before = (await getJson('/company/profile')).body;
    assert(before && !!before.nameAr, '1. profile is readable through the central endpoint', JSON.stringify(before?.error));

    const saved = await sendJson('PUT', '/company/profile', {
      nameAr: `شركة كيان للتجارة ${S}`,
      legalNameAr: 'شركة كيان سوفت للأنظمة والبرمجيات',
      addressAr: 'الضالع - جحاف - المجمع التجاري',
      phone: '+967-771234567',
      email: 'info@kayan.test',
      taxNumber: 'TAX-3004521098',
      nameEn: 'Kayan Trading Group',
      legalNameEn: 'Kayan Soft Trading LLC',
      addressEn: 'Dhalae - Juhaf Commercial Complex',
      phoneEn: '+967-771234567',
      emailEn: 'info@kayan.test',
      website: 'www.kayan.test',
      commercialRegistration: '104523',
      TOKEN,
    });
    assert(saved.status === 200, '1b. profile saved with a permitted user', JSON.stringify(saved.body));

    const after = (await getJson('/company/profile')).body;
    assert(after.nameAr === `شركة كيان للتجارة ${S}`, '1c. Arabic name round-trips', String(after.nameAr));
    assert(after.nameEn === 'Kayan Trading Group', '1d. English name round-trips', String(after.nameEn));
    assert(after.addressEn === 'Dhalae - Juhaf Commercial Complex', '1e. English address round-trips', String(after.addressEn));
    assert(after.taxNumber === 'TAX-3004521098', '1f. tax number round-trips', String(after.taxNumber));
    assert(after.commercialRegistration === '104523', '1g. commercial registration round-trips', String(after.commercialRegistration));
    assert(after.website === 'www.kayan.test', '1h. website round-trips', String(after.website));

    const dbRow = (await db.query<any>('SELECT * FROM core.companies LIMIT 1')).rows[0];
    assert(dbRow.name === after.nameAr, '1i. database is the single source of truth', 'db != api');

    const noAr = await sendJson('PUT', '/company/profile', { nameAr: '   ', TOKEN });
    assert(noAr.status === 400, '1j. empty Arabic name is rejected', String(noAr.status));
    const badEmail = await sendJson('PUT', '/company/profile', { nameAr: 'شركة', email: 'not-an-email', TOKEN });
    assert(badEmail.status === 400, '1k. invalid email is rejected', String(badEmail.status));

    // =========================================================
    console.log('\n--- 2. logo upload / replace / remove ---');
    // =========================================================
    const up1 = await sendJson('POST', '/company/logo', { data: PNG_BYTES.toString('base64'), TOKEN });
    assert(up1.status === 200, '2. PNG logo uploaded', JSON.stringify(up1.body?.error));
    const logo1 = up1.body?.profile?.logoFileName;
    assert(!!logo1 && logo1.endsWith('.png'), '2b. stored name is generated server-side (.png)', String(logo1));
    assert(logo1 && !logo1.includes('png.png'), '2c. the client file name never reaches storage', String(logo1));

    const p1 = (await getJson('/company/profile')).body;
    assert(p1.logoUrl === `/api/company/logo/${logo1}`, '2d. public logo URL is served by the API', String(p1.logoUrl));
    const served = await fetch(`${base}${p1.logoUrl}`);
    assert(served.status === 200, '2e. logo is retrievable through the public route', String(served.status));
    assert(served.headers.get('content-type') === 'image/png', '2f. logo served with the right MIME type', String(served.headers.get('content-type')));
    assert(fs.existsSync(path.join(COMPANY_LOGO_DIR, logo1)), '2g. logo persisted to durable storage', 'file missing');

    // replace
    const up2 = await sendJson('POST', '/company/logo', { data: WEBP_BYTES.toString('base64'), TOKEN });
    assert(up2.status === 200, '2h. logo replaced (WebP)', JSON.stringify(up2.body?.error));
    const logo2 = up2.body?.profile?.logoFileName;
    assert(logo2 !== logo1, '2i. replacement produced a NEW stored file', String(logo2));
    assert(logo2 && logo2.endsWith('.webp'), '2j. extension follows the detected content, not the client', String(logo2));
    assert(!fs.existsSync(path.join(COMPANY_LOGO_DIR, logo1)), '2k. superseded file was cleaned up (no orphans)', 'old file still present');

    // profile save must NOT drop the logo
    await sendJson('PUT', '/company/profile', { nameAr: `شركة كيان للتجارة ${S}`, TOKEN });
    assert((await getJson('/company/profile')).body.logoFileName === logo2, '2l. saving the profile never drops the logo', 'logo lost');

    // remove
    const rm = await sendJson('DELETE', '/company/logo', { TOKEN });
    assert(rm.status === 200, '2m. logo removed', JSON.stringify(rm.body?.error));
    const p2 = (await getJson('/company/profile')).body;
    assert(p2.logoUrl === null, '2n. no logo URL once removed', String(p2.logoUrl));
    assert(!fs.existsSync(path.join(COMPANY_LOGO_DIR, logo2)), '2o. removing deleted the file from storage', 'file still present');
    assert(p2.nameAr === `شركة كيان للتجارة ${S}`, '2p. removing the logo preserved the company data', String(p2.nameAr));

    // =========================================================
    console.log('\n--- 3. unsafe / unsupported uploads rejected ---');
    // A PNG renamed to .exe with an executable header
    const MZ = Buffer.concat([Buffer.from('MZ\0\0\0\0\0\0\0\0', 'ascii'), Buffer.alloc(64, 0x90)]);
    const exe = await sendJson('POST', '/company/logo', { data: MZ.toString('base64'), TOKEN });
    assert(exe.status === 400, '3. renamed executable is rejected', String(exe.status));
    assert(/غير مدعومة|غير آمنة/.test(exe.body?.error || ''), '3b. rejection message is explicit', String(exe.body?.error));

    const html = Buffer.from('<html><script>alert(1)</script></html>', 'utf-8');
    const h = await sendJson('POST', '/company/logo', { data: html.toString('base64'), TOKEN });
    assert(h.status === 400, '3c. HTML/script payload rejected', String(h.status));

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf-8');
    const s = await sendJson('POST', '/company/logo', { data: svg.toString('base64'), TOKEN });
    assert(s.status === 400, '3d. SVG rejected (executable XML)', String(s.status));

    const oversize = Buffer.concat([PNG_BYTES, Buffer.alloc(MAX_LOGO_BYTES + 1024, 0)]);
    const big = await sendJson('POST', '/company/logo', { data: oversize.toString('base64'), TOKEN });
    // Two independent size defences: express.json()'s own body limit rejects
    // very large payloads first (413), and the service rejects anything over
    // the 2 MB logo cap by inspecting the decoded bytes (400).
    assert(big.status === 400 || big.status === 413, '3e. oversized upload rejected', String(big.status));
    let svcSizeErr = '';
    try {
      await CompanyService.saveLogo(oversize.toString('base64'), admin.id);
    } catch (e: any) { svcSizeErr = e.message; }
    assert(/2 ميجابايت/.test(svcSizeErr), '3f. service-level size rejection message is explicit', String(svcSizeErr));

    const empty = await sendJson('POST', '/company/logo', { data: '', TOKEN });
    assert(empty.status === 400, '3g. empty upload rejected', String(empty.status));

    // a data: URL prefix must not bypass the content check
    const dataUrl = await sendJson('POST', '/company/logo', { data: `data:image/png;base64,${MZ.toString('base64')}`, TOKEN });
    assert(dataUrl.status === 400, '3h. data: URL wrapper cannot smuggle a bad payload', String(dataUrl.status));

    assert((await getJson('/company/profile')).body.logoUrl === null, '3i. no rejected upload ever stored a logo', 'logo leaked');

    // content sniffing unit checks
    assert(sniffImageType(PNG_BYTES) === 'png', '3j. sniffer identifies PNG');
    assert(sniffImageType(JPEG_BYTES) === 'jpeg', '3k. sniffer identifies JPEG');
    assert(sniffImageType(WEBP_BYTES) === 'webp', '3l. sniffer identifies WebP');
    assert(sniffImageType(MZ) === null, '3m. sniffer rejects a PE executable');
    assert(sniffImageType(Buffer.from('GIF89a')) === null, '3n. sniffer rejects an unlisted format');

    // =========================================================
    console.log('\n--- 4. permission enforcement ---');
    // =========================================================
    const noUser = await sendJson('PUT', '/company/profile', { nameAr: 'اختراق' });
    assert(noUser.status === 401, '4. write without an identified user is rejected', String(noUser.status));

    const weakUser = await db.query<any>(
      `INSERT INTO security.users (username, password_hash, full_name, email, is_active)
       VALUES ($1, 'x', $2, $3, TRUE) RETURNING id`,
      [`weak_${S}`, `مستخدم بلا صلاحيات ${S}`, `weak_${S}@kayan.test`]
    );
    const weakId = weakUser.rows[0].id;
    // A VALID signed token for a real, active user who simply lacks the
    // permission — this proves the RBAC check, not merely token validity.
    weakToken = issueSessionToken(weakId, `weak_${S}`);

    const denied = await sendJson('PUT', '/company/profile', { nameAr: 'محاولة غير مصرح بها', WEAK_TOKEN });
    assert(denied.status === 403, '4b. write without settings.company.manage is rejected', String(denied.status));

    const deniedLogo = await sendJson('POST', '/company/logo', { data: PNG_BYTES.toString('base64'), WEAK_TOKEN });
    assert(deniedLogo.status === 403, '4c. logo upload without permission is rejected', String(deniedLogo.status));

    const deniedDel = await sendJson('DELETE', '/company/logo', { WEAK_TOKEN });
    assert(deniedDel.status === 403, '4d. logo removal without permission is rejected', String(deniedDel.status));

    const nameUnchanged = (await getJson('/company/profile')).body.nameAr;
    assert(nameUnchanged === `شركة كيان للتجارة ${S}`, '4e. denied writes changed nothing', String(nameUnchanged));
    assert((await getJson('/company/profile')).body.logoUrl === null, '4f. denied uploads stored nothing', 'logo leaked');

    const readOk = await getJson('/company/profile');
    assert(readOk.status === 200, '4g. READ stays available without the manage permission', String(readOk.status));

    const ghost = await sendJson('PUT', '/company/profile', { nameAr: 'س', userId: '00000000-0000-0000-0000-000000000000' });
    assert(ghost.status === 401, '4h. unknown user is rejected', String(ghost.status));

    // =========================================================
    console.log('\n--- 5. central source used by reports ---');
    // =========================================================
    const restored = await sendJson('PUT', '/company/profile', {
      nameAr: `شركة كيان للتجارة ${S}`,
      nameEn: 'Kayan Trading Group',
      addressAr: 'الضالع - جحاف',
      addressEn: 'Dhalae - Juhaf',
      taxNumber: 'TAX-3004521098',
      commercialRegistration: '104523',
      TOKEN,
    });
    assert(restored.status === 200, '5. identity re-saved for report rendering', JSON.stringify(restored.body?.error));

    const upFinal = await sendJson('POST', '/company/logo', { data: PNG_BYTES.toString('base64'), TOKEN });
    const finalLogo = (await getJson('/company/profile')).body.logoUrl;
    assert(!!finalLogo && upFinal.status === 200, '5b. logo present for report rendering', String(finalLogo));

    const reportPage = await fetch(`${base}/api/settings/branches`);
    assert(reportPage.status === 200, '5c. existing company/branches endpoint still works', String(reportPage.status));

    // =========================================================
    console.log('\n--- 6/7/8. header layout contract (AR left, logo centre, EN right) ---');
    // =========================================================
    const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const headerSrc = readFileSync(path.join(here, 'components', 'company', 'ReportHeader.tsx'), 'utf-8');
    const printCss = readFileSync(path.join(here, 'company-print.css'), 'utf-8');

    // order is declared explicitly in the grid
    const arCol = headerSrc.indexOf('className="kayan-rh-col kayan-rh-ar"');
    const enCol = headerSrc.indexOf('className="kayan-rh-col kayan-rh-en"');
    assert(arCol > -1 && enCol > -1, '6. header renders both language columns');
    // Declared order is no longer the contract; the rendered grid placement is.
    // (Kept as a smoke check that both columns are actually emitted.)
    assert(arCol > -1 && enCol > -1, '6b. header emits both language columns');

    // the logo is centred on the PAGE, not on the leftover space
    assert(printCss.includes('left: 50%'), '7. logo is anchored at 50% of the page width');
    assert(printCss.includes('transform: translateX(-50%)'), '7b. logo is centred by its own width, not by the text gap');
    assert(/position:\s*relative/.test(printCss), '7c. header establishes a full-width positioning context');
    // PHASE 10.0.2 — the layout was corrected by explicit user instruction:
    // Arabic belongs at the FAR RIGHT, English at the FAR LEFT, logo centred.
    // (This supersedes the original brief, which had specified the mirror.)
    // Source order in the JSX is no longer meaningful — what matters is which
    // GRID COLUMN each side occupies, so that is what is asserted.
    assert(printCss.includes('.kayan-rh-ar') && printCss.includes('grid-column: 3'),
      '7d. Arabic occupies the right-hand grid column (FAR RIGHT)');
    assert(printCss.includes('.kayan-rh-en') && printCss.includes('grid-column: 1'),
      '7e. English occupies the left-hand grid column (FAR LEFT)');
    assert(/\.kayan-rh-ar\s*\{[^}]*text-align:\s*right/s.test(printCss),
      '7f. Arabic text is flush to the right edge');
    assert(/\.kayan-rh-en\s*\{[^}]*text-align:\s*left/s.test(printCss),
      '7g. English text is flush to the left edge');

    // The standalone print/PDF window must not drift from the in-app header.
    const expCss = readFileSync(path.join(here, 'services', 'reportExportService.ts'), 'utf-8');
    assert(/\.rh-ar\s*\{[^}]*grid-column:\s*3/s.test(expCss),
      '7h. print/PDF header puts Arabic on the right, same as in-app');
    assert(/\.rh-en\s*\{[^}]*grid-column:\s*1/s.test(expCss),
      '7i. print/PDF header puts English on the left, same as in-app');
    assert(/\.header\s*\{[^}]*direction:\s*ltr/s.test(expCss),
      '7j. print/PDF header pins the grid to LTR so RTL cannot swap the columns');

    // PHASE 10.0.1 — the page is dir="rtl". In an RTL context a grid's column 1
    // renders on the RIGHT, which would physically SWAP the two languages and
    // let them overlap. The grid must therefore be pinned to LTR while each
    // column keeps its own text direction. This is the fix for a real defect
    // found by looking at a rendered screenshot.
    assert(/\.kayan-rh-grid\s*\{[^}]*direction:\s*ltr/s.test(printCss),
      '7h. grid container is pinned LTR so column order is physical, not logical');
    assert(/\.kayan-rh-ar\s*\{[^}]*direction:\s*rtl/s.test(printCss),
      '7i. the Arabic column restores direction:rtl for its own text');
    assert(/\.kayan-rh-en\s*\{[^}]*direction:\s*ltr/s.test(printCss),
      '7j. the English column keeps direction:ltr');

    // a FIXED middle track means long names cannot push the logo around
    assert(/grid-template-columns:\s*1fr\s+var\(--kayan-rh-gap[^)]*\)\s+1fr/.test(printCss),
      '7f. middle track is a fixed reserved gap, so name length cannot move the logo');
    assert(printCss.includes('min-width: 0'), '7g. columns can shrink instead of overflowing');
    assert(printCss.includes('overflow-wrap: anywhere'), '7h. long names wrap rather than collide');

    // no overlap with the title / content
    assert(headerSrc.includes('kayan-rh-title'), '8. report title is rendered under the header');
    assert(printCss.includes('page-break-inside: avoid') || printCss.includes('break-inside: avoid'),
      '8b. header is never split across printed pages');
    assert(/margin-bottom:\s*8pt/.test(printCss), '8c. header keeps clearance from the report content when printed');
    assert(printCss.includes('.kayan-rh-gap'), '8d. a reserved centre gap exists even with no logo');

    // when no logo is stored the slot is empty — never a fabricated logo
    assert(/logoUrl \|\| null/.test(headerSrc), '8e. no logo renders an empty slot, not a placeholder image');

    // upload UI never prints
    assert(printCss.includes('display: none !important'), '8f. no-print rule is enforced for upload controls');

    // every required report page imports the shared component
    const reportPages = [
      'pages/SalesInvoices.tsx', 'pages/PurchaseInvoices.tsx', 'pages/Receipts.tsx',
      'pages/SupplierPayments.tsx', 'pages/CustomerStatement.tsx', 'pages/PurchasingReports.tsx',
      'pages/ReportViewer.tsx', 'pages/FinancialReports.tsx', 'pages/InventoryItems.tsx',
      'pages/TrialBalance.tsx', 'pages/GeneralLedger.tsx',
    ];
    for (const rel of reportPages) {
      const src = readFileSync(path.join(here, rel), 'utf-8');
      assert(src.includes('ReportHeader'), `8g. ${rel} uses the shared ReportHeader`);
    }

    // the standalone print service carries the same contract
    assert(expCss.includes('rh-ar') && expCss.includes('rh-en'), '8h. PDF print window keeps the AR/EN columns');
    assert(expCss.includes('left: 50%'), '8i. PDF print window centres the logo on the page too');
    assert(!expCss.includes('شركة كيان للتجارة والتوزيع'), '8j. the hardcoded company name is gone from the PDF header');

    // =========================================================
    console.log('\n--- 0/10.0.1. save endpoint: exact route + method, real persistence ---');
    // =========================================================
    // The documented endpoint is PUT /api/company/profile. Prove the exact
    // method/path the settings screen uses, and that the data really persists.
    const full: any = {
      nameAr: `مجموعة كيان العالمية ${S}`,
      legalNameAr: 'كيان سوفت المحدودة',
      addressAr: 'صنعاء - شارع الستين',
      phone: '+967-700000001',
      email: 'ar@kayan.test',
      taxNumber: 'TAX-777',
      nameEn: 'Kayan Global Group',
      legalNameEn: 'Kayan Soft LLC',
      addressEn: 'Sanaa - Al Siten Street',
      phoneEn: '+967-700000002',
      emailEn: 'en@kayan.test',
      website: 'www.kayan-global.test',
      commercialRegistration: 'CR-998',
    };
    const fullRes = await sendJson('PUT', '/company/profile', { ...full, TOKEN: true });
    assert(fullRes.status === 200, '0. PUT /api/company/profile accepts the full payload', JSON.stringify(fullRes.body?.error));

    const persisted = (await getJson('/company/profile')).body;
    for (const k of ['nameAr', 'legalNameAr', 'addressAr', 'phone', 'email', 'taxNumber', 'nameEn', 'legalNameEn', 'addressEn', 'phoneEn', 'emailEn', 'website', 'commercialRegistration']) {
      assert(persisted[k] === (full as any)[k], `0.${k} persisted exactly`, `${persisted[k]} != ${(full as any)[k]}`);
    }

    // A partial save must NOT wipe the fields it did not mention.
    const partial = await sendJson('PUT', '/company/profile', { addressEn: 'Aden - Khormaksar', TOKEN: true });
    assert(partial.status === 200, '0b. partial save accepted', JSON.stringify(partial.body?.error));
    const afterPartial = (await getJson('/company/profile')).body;
    assert(afterPartial.addressEn === 'Aden - Khormaksar', '0c. the changed field was written', String(afterPartial.addressEn));
    assert(afterPartial.nameAr === full.nameAr, '0d. omitted Arabic name was NOT wiped', String(afterPartial.nameAr));
    assert(afterPartial.nameEn === full.nameEn, '0e. omitted English name was NOT wiped', String(afterPartial.nameEn));
    assert(afterPartial.taxNumber === full.taxNumber, '0f. omitted tax number was NOT wiped', String(afterPartial.taxNumber));
    assert(afterPartial.commercialRegistration === full.commercialRegistration, '0g. omitted commercial registration was NOT wiped', String(afterPartial.commercialRegistration));

    // An explicit empty string still clears a field.
    const cleared = await sendJson('PUT', '/company/profile', { website: '', TOKEN: true });
    assert(cleared.status === 200 && (await getJson('/company/profile')).body.website === null,
      '0h. an explicitly cleared field is emptied', 'field not cleared');

    // An explicit null is honoured too.
    const nulled = await sendJson('PUT', '/company/profile', { taxNumber: null, TOKEN: true });
    assert(nulled.status === 200 && (await getJson('/company/profile')).body.taxNumber === null,
      '0i. an explicit null clears the field', 'field not cleared');
    await sendJson('PUT', '/company/profile', { taxNumber: full.taxNumber, TOKEN: true });

    // The wrong method on the same path must NOT be a silent success.
    const wrongMethod = await sendJson('POST', '/company/profile', { ...full, TOKEN: true });
    assert(wrongMethod.status === 404, '0j. POST on the save path is not accepted (no duplicate/alternate API)', String(wrongMethod.status));
    const wrongPath = await sendJson('PUT', '/company', { ...full, TOKEN: true });
    assert(wrongPath.status === 404, '0k. no alternate PUT path was silently introduced', String(wrongPath.status));

    // =========================================================
    console.log('\n--- 4b. identity must be proven by a SIGNED token, not a browser claim ---');
    // =========================================================
    const spoofBody = await sendJson('PUT', '/company/profile', { nameAr: 'اختراق', userId: admin.id });
    assert(spoofBody.status === 401, '4i. a body userId alone is NOT accepted as identity', String(spoofBody.status));
    const spoofHeader = await fetch(`${base}/api/company/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-user-id': admin.id },
      body: JSON.stringify({ nameAr: 'اختراق' }),
    });
    assert(spoofHeader.status === 401, '4j. an x-user-id header alone is NOT accepted as identity', String(spoofHeader.status));
    assert((await getJson('/company/profile')).body.nameAr === full.nameAr, '4k. spoofed identity changed nothing', 'data changed');

    const forged = await sendJson('PUT', '/company/profile', { nameAr: 'اختراق', TOKEN: true },
      { Authorization: `Bearer ${adminToken().split('.')[0]}.forgedsignature` });
    assert(forged.status === 401, '4l. a forged signature is rejected', String(forged.status));

    // Re-encode a MODIFIED payload (different `sub`) while keeping the original
    // signature — the classic privilege-escalation attempt. The signature no
    // longer matches the body, so verification must fail.
    const tampered = (() => {
      const t = adminToken();
      const [body, signature] = t.split('.');
      const decode = (s: string) =>
        Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4), 'base64').toString('utf-8');
      const payload = JSON.parse(decode(body));
      payload.sub = '00000000-0000-0000-0000-000000000000';
      const reencoded = Buffer.from(JSON.stringify(payload), 'utf-8')
        .toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      // body changed, signature untouched -> must NOT verify
      return `${reencoded}.${signature}`;
    })();
    assert(tampered !== adminToken(), '4m-pre. the tampered token really differs from the valid one');
    assert(verifySessionToken(tampered) === null, '4m-pre. tampered payload fails local verification');
    const tamperedRes = await sendJson('PUT', '/company/profile', { nameAr: 'اختراق', TOKEN: true },
      { Authorization: `Bearer ${tampered}` });
    assert(tamperedRes.status === 401, '4m. a tampered payload is rejected', String(tamperedRes.status));

    const garbage = await sendJson('PUT', '/company/profile', { nameAr: 'اختراق', TOKEN: true },
      { Authorization: 'Bearer not-a-token' });
    assert(garbage.status === 401, '4n. a malformed token is rejected', String(garbage.status));

    assert((await getJson('/company/profile')).body.nameAr === full.nameAr, '4o. no forged request altered the profile', 'data changed');

    // Deactivating the user must invalidate an otherwise-valid token.
    const deactUser = await db.query<any>(
      `INSERT INTO security.users (username, password_hash, full_name, email, is_active)
       VALUES ($1, 'x', $2, $3, TRUE) RETURNING id`,
      [`inactive_${S}`, `معطل ${S}`, `inactive_${S}@kayan.test`]
    );
    const inactiveToken = issueSessionToken(deactUser.rows[0].id, `inactive_${S}`);
    await db.query('UPDATE security.users SET is_active = FALSE WHERE id = $1', [deactUser.rows[0].id]);
    const afterDeact = await sendJson('PUT', '/company/profile', { nameAr: 'اختراق', TOKEN: true },
      { Authorization: `Bearer ${inactiveToken}` });
    assert(afterDeact.status === 401, '4p. a token for a deactivated user is rejected', String(afterDeact.status));

    // Token primitives
    const good = adminToken();
    assert(verifySessionToken(good)?.sub === admin.id, '4q. a valid token verifies');
    assert(verifySessionToken(`${good}x`) === null, '4r. a tampered token fails verification');
    assert(verifySessionToken('') === null && verifySessionToken(null) === null, '4s. empty token fails verification');
    assert(extractBearerToken('Bearer abc') === 'abc', '4t. bearer extraction works');
    assert(extractBearerToken('bearer abc') === 'abc', '4u. bearer extraction is scheme-insensitive');
    assert(extractBearerToken('Basic abc') === null, '4v. a non-bearer scheme is rejected');

    // =========================================================
    console.log('\n--- 9. existing printing still works ---');
    // =========================================================
    const noLogo = await sendJson('DELETE', '/company/logo', { TOKEN });
    assert(noLogo.status === 200, '9. logo can be removed again', JSON.stringify(noLogo.body?.error));

    const { PurchasingService } = await import('./purchasingService.ts');
    const { SalesService } = await import('./salesService.ts');
    const { InventoryService } = await import('./inventoryService.ts');

    const sup = await PurchasingService.createSupplier({ code: `SUP-P100-${S}`, name: `مورد ${S}`, creditLimit: 1e9 });
    const cus = await SalesService.createCustomer({ code: `CUS-P100-${S}`, name: `عميل ${S}`, creditLimit: 1e9 });
    const item = await InventoryService.createItem({ sku: `SKU-P100-${S}`, name: `صنف ${S}`, purchasePrice: 5000, salePrice: 9000 });
    const inv = await PurchasingService.createInvoice({
      supplierId: sup.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: '2026-11-10',
      lines: [{ itemId: item.id, itemCode: item.sku, description: item.name, quantity: 10, unitPrice: 5000, discount: 0, tax: 0 }],
    });
    await PurchasingService.postPurchaseInvoice(inv.id);
    const stockAfter = await InventoryService.getItemStock(item.id);
    assert(Math.abs(stockAfter.currentStock - 10) < 0.01, '9b. purchase receipt still posts stock', String(stockAfter.currentStock));

    const sinv = await SalesService.createInvoice({
      customerId: cus.id, paymentType: 'CREDIT', invoiceDate: '2026-11-11',
      lines: [{ itemId: item.id, itemCode: item.sku, description: item.name, quantity: 2, unitPrice: 9000, discount: 0, tax: 0 }],
    });
    await SalesService.postSalesInvoice(sinv.id);
    const stockFinal = await InventoryService.getItemStock(item.id);
    assert(Math.abs(stockFinal.currentStock - 8) < 0.01, '9c. sale still issues stock', String(stockFinal.currentStock));

    const invList = await getJson('/purchasing/invoices?limit=5');
    assert(invList.status === 200 && Array.isArray(invList.body), '9d. purchase invoice listing still responds', String(invList.status));
    const invDetail = await getJson(`/purchasing/invoices/${inv.id}`);
    assert(invDetail.status === 200, '9e. purchase invoice detail (print source) still responds', String(invDetail.status));
    const sDetail = await getJson(`/sales/invoices/${sinv.id}`);
    assert(sDetail.status === 200, '9f. sales invoice detail (print source) still responds', String(sDetail.status));

    // =========================================================
    console.log('\n--- 10. no accounting regression ---');
    // =========================================================
    const invFull = await PurchasingService.getInvoiceById(inv.id);
    const je = (await db.query<any>(`
      SELECT (SELECT COALESCE(SUM(debit),0) FROM accounting.journal_entry_lines WHERE journal_entry_id = je.id) AS dr,
             (SELECT COALESCE(SUM(credit),0) FROM accounting.journal_entry_lines WHERE journal_entry_id = je.id) AS cr
      FROM accounting.journal_entries je WHERE je.id = $1`, [invFull.journal_entry_id])).rows[0];
    assert(Math.abs(parseFloat(je.dr) - parseFloat(je.cr)) < 0.01, '10. purchase journal still balanced', JSON.stringify(je));

    const rec = await InventoryService.getInventoryReconciliation();
    assert(rec.status === 'RECONCILED', `10b. inventory still reconciles (diff ${rec.difference})`, rec.status);
  } finally {
    server.close();
    // clean up any logo file this suite created
    try {
      const dir = COMPANY_LOGO_DIR;
      if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
    } catch { /* best effort */ }
  }

  console.log('========================================================');
  console.log(`📊 PHASE 10.0 Results: ${passedTests}/${totalTests} Passed.`);
  console.log('========================================================');
}

runPhase100Tests().catch((e) => {
  console.error('PHASE 10.0 SUITE CRASH:', e);
  process.exitCode = 1;
});