import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { AccountingService } from './accountingService.ts';
import { getAuditLogs, logAudit } from './auditService.ts';
import { getDb, withTransaction } from './db.ts';
import { round2 } from './money.ts';
import { VoucherAccounting } from './voucherAccounting.ts';
import { extractBearerToken, verifySessionToken } from './sessionTokens.ts';

export const apiRouter = Router();

type AuthenticatedActor = { userId: string; username: string };
type AccessScope = { company_id: string; branch_id: string | null; scope_type: 'COMPANY' | 'BRANCH' };

let apiRequestQueue: Promise<void> = Promise.resolve();

function sendRouteError(res: Response, status: number, error: unknown, fallback = 'تعذر تنفيذ الطلب.') {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  if (code === '42501') {
    return res.status(403).json({ error: 'نطاق الوصول لا يسمح بتنفيذ هذا الطلب.' });
  }
  if (code) {
    return res.status(status >= 500 ? 500 : 400).json({ error: fallback });
  }
  return res.status(status).json({
    error: error instanceof Error ? error.message : fallback,
  });
}

function isPublicApiRequest(req: Request): boolean {
  return (req.method === 'POST' && req.path === '/auth/login') ||
    (req.method === 'GET' && /^\/company\/logo\/[a-f0-9]{32}\.(png|jpg|webp)$/.test(req.path)) ||
    (req.method === 'GET' && req.path === '/health');
}

function isSessionInfoRequest(req: Request): boolean {
  return req.method === 'GET' && req.path === '/auth/session';
}

function requiredPermission(req: Request): string | null {
  const path = req.path;
  const method = req.method;

  if (/^\/settings\/users(?:\/|$)/.test(path) || /^\/settings\/roles(?:\/|$)/.test(path)) {
    if (/\/access-scopes(?:\/|$)/.test(path)) return 'settings.branches.manage';
    return 'settings.users.manage';
  }
  if (path === '/settings/access-scope-catalog') return 'settings.branches.manage';
  if (path === '/settings/permissions') return 'settings.users.manage';
  if (path === '/settings/branches' || path === '/core/branches') {
    return method === 'GET' ? 'settings.branches.view' : 'settings.branches.manage';
  }
  if (/^\/settings\/branches\/.+/.test(path)) return 'settings.branches.manage';
  if (path === '/company/profile' || path === '/company') return 'settings.company.view';
  if (path.startsWith('/company/logo')) return method === 'GET' ? null : 'settings.company.manage';
  if (path === '/system/status') return 'system.status.view';
  if (path === '/settings/health' || path === '/settings' || path.startsWith('/settings/module/')) return 'system.settings.view';
  if (path === '/settings/audit' || path === '/audit-logs') return 'system.audit.view';
  if (path.startsWith('/settings/')) return method === 'GET' ? 'system.settings.view' : 'system.settings.manage';

  if (path.startsWith('/dashboard/')) return 'dashboard.view';
  if (path.startsWith('/reports/')) {
    if (/audit|reconciliation|integrity/i.test(path)) return 'reports.audit.view';
    if (/inventory/i.test(path)) return 'reports.inventory.view';
    if (/sales|customer|ar-aging/i.test(path)) return 'reports.sales.view';
    if (/purchase|supplier|ap-aging|payable/i.test(path)) return 'reports.purchases.view';
    return 'reports.financial.view';
  }
  if (path.startsWith('/lookups/')) {
    const type = path.split('/')[2];
    if (['customer', 'customers'].includes(type)) return 'sales.view';
    if (['supplier', 'suppliers'].includes(type)) return 'purchasing.view';
    if (['item', 'items', 'warehouses', 'units'].includes(type)) return 'inventory.view';
    if (['cash', 'banks'].includes(type)) return 'banking.view';
    if (type === 'assets') return 'assets.view';
    if (type === 'expenses') return 'expenses.view';
    // خيارات الطرف المقابل ووسيلة التحصيل/الصرف — تتطلب صلاحية إدارة
    // السند نفسه: فقط من يستطيع ترحيل سند القبض/الصرف يرى قوائمه.
    if (type === 'receipt-counterparty' || type === 'receipt-vehicles') return 'sales.receipts.manage';
    if (type === 'payment-counterparty' || type === 'payment-vehicles') return 'purchasing.payments.manage';
    if (type === 'voucher-main-accounts') return 'purchasing.payments.manage';
    return 'accounting.view';
  }

  if (/^\/accounts\/import$/.test(path)) return 'accounting.manage';
  if (/^\/(?:accounts|accounting\/accounts)(\/.*)?$/.test(path)) return method === 'GET' ? 'accounting.view' : 'accounting.manage';
  if (/^\/(?:journal-entries|fiscal-years|accounting\/fiscal-years|fiscal-periods|accounting\/fiscal-periods|accounting\/cost-centers)/.test(path)) {
    if (/\/(?:post|reverse|close|reopen)$/.test(path)) return 'accounting.post';
    if (method === 'GET') return 'accounting.view';
    return 'accounting.create';
  }
  if (path.startsWith('/customers')) return method === 'GET' ? 'sales.view' : 'sales.customers.manage';
  if (path.startsWith('/sales/')) {
    if (path.includes('/returns')) return method === 'GET' ? 'sales.view' : 'sales.returns.manage';
    if (path.includes('/receipts')) return method === 'GET' ? 'sales.view' : 'sales.receipts.manage';
    if (/\/(?:post|void)$/.test(path)) return 'sales.invoices.post';
    return method === 'GET' ? 'sales.view' : 'sales.invoices.create';
  }
  if (path.startsWith('/suppliers')) return method === 'GET' ? 'purchasing.view' : 'purchasing.suppliers.manage';
  if (path.startsWith('/purchasing/')) {
    if (path.includes('/returns')) return method === 'GET' ? 'purchasing.view' : 'purchasing.returns.manage';
    if (path.includes('/payments')) return method === 'GET' ? 'purchasing.view' : 'purchasing.payments.manage';
    if (/\/(?:post|void)$/.test(path)) return 'purchasing.invoices.post';
    return method === 'GET' ? 'purchasing.view' : 'purchasing.invoices.create';
  }
  if (path.startsWith('/taxes/') || path.startsWith('/accounting/tax-codes')) {
    return method === 'GET' ? 'taxes.view' : 'taxes.manage';
  }
  if (path.startsWith('/inventory/')) {
    if (path.includes('/counts/') && path.endsWith('/approve')) return 'inventory.count_approve';
    return method === 'GET' ? 'inventory.view' : 'inventory.manage';
  }
  if (path.startsWith('/banking/')) return method === 'GET' ? 'banking.view' : 'banking.manage';
  if (path.startsWith('/assets/')) return method === 'GET' ? 'assets.view' : 'assets.manage';
  if (path.startsWith('/expenses/')) {
    if (/\/(?:approve|post|reverse)$/.test(path)) return 'expenses.approve';
    return method === 'GET' ? 'expenses.view' : 'expenses.manage';
  }

  return null;
}

function isScopeAdministrationRequest(req: Request): boolean {
  return /^\/settings\/(?:users|roles)(?:\/|$)/.test(req.path) ||
    req.path === '/settings/access-scope-catalog' ||
    req.path === '/settings/permissions';
}

async function resolveRequestScope(
  req: Request,
  db: Awaited<ReturnType<typeof getDb>>,
  actor: AuthenticatedActor
): Promise<{ companyId: string; branchId: string | null } | null> {
  if (isScopeAdministrationRequest(req) || isSessionInfoRequest(req)) return null;

  const scopeResult = await db.query<AccessScope>(
    'SELECT company_id, branch_id, scope_type FROM security.list_user_access_scopes($1)',
    [actor.userId]
  );
  const scopes = scopeResult.rows;
  if (scopes.length === 0) return null;

  const requestedCompanyId = req.header('x-kayan-company-id') || null;
  const requestedBranchId = req.header('x-kayan-branch-id') || null;
  const companyIds = [...new Set(scopes.map((scope) => scope.company_id))];
  const companyId = requestedCompanyId || (companyIds.length === 1 ? companyIds[0] : null);
  if (!companyId || !companyIds.includes(companyId)) return null;

  const branchScopes = scopes.filter((scope) => scope.company_id === companyId && scope.scope_type === 'BRANCH');
  if (requestedBranchId) {
    const branchAllowed = branchScopes.some((scope) => scope.branch_id === requestedBranchId);
    if (!branchAllowed) return null;
    return { companyId, branchId: requestedBranchId };
  }

  const hasCompanyScope = scopes.some(
    (scope) => scope.company_id === companyId && scope.scope_type === 'COMPANY'
  );
  if (!hasCompanyScope && branchScopes.length === 1) {
    return { companyId, branchId: branchScopes[0].branch_id };
  }
  if (!hasCompanyScope && branchScopes.length > 1) return null;
  return { companyId, branchId: null };
}

async function apiSecurityMiddleware(req: Request, res: Response, next: NextFunction) {
  const previous = apiRequestQueue;
  let releaseRequest!: () => void;
  apiRequestQueue = new Promise<void>((resolve) => { releaseRequest = resolve; });
  await previous;

  let db: Awaited<ReturnType<typeof getDb>> | null = null;
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (db) {
        await db.query("SELECT set_config('kayan.user_id', '', false), set_config('kayan.company_id', '', false), set_config('kayan.branch_id', '', false)");
        await db.query('RESET ROLE');
      }
    } catch (error) {
      console.error('[API Security] Failed to reset request database context');
    } finally {
      releaseRequest();
    }
  };
  res.once('finish', () => { void cleanup(); });
  res.once('close', () => { void cleanup(); });

  try {
    if (isPublicApiRequest(req)) {
      db = await getDb();
      next();
      return;
    }

    db = await getDb();
    const payload = verifySessionToken(extractBearerToken(req.header('authorization')));
    if (!payload) {
      res.status(401).json({ error: 'المصادقة مطلوبة أو انتهت الجلسة.' });
      return;
    }

    const userResult = await db.query<{ id: string; username: string }>(
      'SELECT id, username FROM security.users WHERE id = $1 AND is_active = TRUE',
      [payload.sub]
    );
    const user = userResult.rows[0];
    if (!user) {
      res.status(401).json({ error: 'الجلسة غير صالحة.' });
      return;
    }
    const actor: AuthenticatedActor = { userId: user.id, username: user.username };
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      req.body.userId = actor.userId;
    }

    const permissionCode = isSessionInfoRequest(req) ? null : requiredPermission(req);
    if (!permissionCode && !isSessionInfoRequest(req)) {
      res.status(403).json({ error: 'المسار غير مصرح به.' });
      return;
    }

    if (permissionCode) {
      const permissionResult = await db.query(
        `SELECT 1
           FROM security.user_roles ur
           JOIN security.role_permissions rp ON rp.role_id = ur.role_id
           JOIN security.permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = $1 AND p.code = $2
          LIMIT 1`,
        [actor.userId, permissionCode]
      );
      if (permissionResult.rows.length === 0) {
        // نفس صيغة الحارس الداخلي (resolveDocumentActor / audit routes):
        // ذكر رمز الصلاحية المطلوبة يساعد المستخدم على معرفة ما ينقصه.
        res.status(403).json({ error: `ليس لديك صلاحية تنفيذ هذا الإجراء (${permissionCode})` });
        return;
      }
    }

    const scope = await resolveRequestScope(req, db, actor);
    if (!scope && !isScopeAdministrationRequest(req) && !isSessionInfoRequest(req)) {
      res.status(403).json({ error: 'لا يوجد نطاق شركة أو فرع مصرح به لهذا الطلب.' });
      return;
    }

    await db.query('SET ROLE kayan_api');
    await db.query(
      `SELECT set_config('kayan.user_id', $1, false),
              set_config('kayan.company_id', $2, false),
              set_config('kayan.branch_id', $3, false)`,
      [actor.userId, scope?.companyId || '', scope?.branchId || '']
    );
    res.locals.authenticatedActor = actor;
    res.locals.accessScope = scope;
    next();
  } catch (error) {
    console.error('[API Security] Request authorization failed');
    res.status(500).json({ error: 'تعذر التحقق من صلاحيات الطلب.' });
  }
}

apiRouter.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));
apiRouter.use(apiSecurityMiddleware);

// ==========================================
// 1. Authentication & Users
// ==========================================
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبة' });
    }

    const db = await getDb();
    const userRes = await db.query<any>('SELECT * FROM security.users WHERE username = $1 AND is_active = TRUE', [username]);
    if (userRes.rows.length === 0) {
      await logAudit({ action: 'LOGIN', entityType: 'AUTH', oldData: { username, status: 'FAILED' } });
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    const user: any = userRes.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await logAudit({ action: 'LOGIN', entityType: 'AUTH', oldData: { username, status: 'WRONG_PASSWORD' } });
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    await db.query('UPDATE security.users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    await logAudit({ userId: user.id, username: user.username, action: 'LOGIN', entityType: 'AUTH', newData: { status: 'SUCCESS' } });

    // PHASE 10.0.1: issue a SIGNED session token. Client-supplied user ids are
    // never trusted for permission checks, so this token is the only accepted
    // proof of identity on the company-settings write endpoints.
    const { issueSessionToken } = await import('./sessionTokens.ts');

    const roleResult = await db.query<{ name: string }>(
      `SELECT r.name
         FROM security.user_roles ur
         JOIN security.roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1
        ORDER BY r.name`,
      [user.id]
    );
    const roles = roleResult.rows.map((role) => role.name);

    res.json({
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      email: user.email,
      role: roles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : (roles[0] || null),
      roles,
      token: issueSessionToken(user.id, user.username),
    });
  } catch (error: any) {
    sendRouteError(res, 500, error, 'حدث خطأ في تسجيل الدخول');
  }
});

apiRouter.get('/auth/session', async (_req: Request, res: Response) => {
  try {
    const actor = res.locals.authenticatedActor as AuthenticatedActor;
    const db = await getDb();
    const userResult = await db.query<{ id: string; username: string; full_name: string | null }>(
      'SELECT id, username, full_name FROM security.users WHERE id = $1 AND is_active = TRUE',
      [actor.userId]
    );
    const user = userResult.rows[0];
    if (!user) {
      res.status(401).json({ error: 'الجلسة غير صالحة.' });
      return;
    }

    const [scopeResult, roleResult, permissionResult] = await Promise.all([
      db.query(
        `SELECT company_id, company_name, branch_id, branch_name, scope_type
           FROM security.list_user_access_scopes($1)
          ORDER BY company_name, scope_type, branch_name`,
        [actor.userId]
      ),
      db.query<{ name: string }>(
        `SELECT r.name
           FROM security.user_roles ur
           JOIN security.roles r ON r.id = ur.role_id
          WHERE ur.user_id = $1`,
        [actor.userId]
      ),
      db.query(
        `SELECT 1
           FROM security.user_roles ur
           JOIN security.role_permissions rp ON rp.role_id = ur.role_id
           JOIN security.permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = $1 AND p.code = 'settings.branches.manage'
          LIMIT 1`,
        [actor.userId]
      ),
    ]);
    const roles = roleResult.rows.map((role) => role.name);
    res.json({
      user: { id: user.id, username: user.username, fullName: user.full_name },
      roles,
      scopes: scopeResult.rows,
      canManageScopes: roles.includes('SUPER_ADMIN') && permissionResult.rows.length > 0,
    });
  } catch {
    res.status(500).json({ error: 'تعذر التحقق من الجلسة الحالية.' });
  }
});

// ==========================================
// 2. Chart of Accounts (دليل الحسابات)
// ==========================================
apiRouter.get(['/accounts', '/accounting/accounts'], async (_req: Request, res: Response) => {
  try {
    const accounts = await AccountingService.getAccounts();
    res.json(accounts);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/accounts', async (req: Request, res: Response) => {
  try {
    const { code, name, accountTypeId, parentId, level, isGroup, normalBalance, currencyCodes } = req.body;
    if (!code || !name || !accountTypeId) {
      return res.status(400).json({ error: 'كود الحساب واسمه ونوعه حقول مطلوبة' });
    }

    const newAccount = await AccountingService.createAccount({
      code,
      name,
      accountTypeId,
      parentId,
      level,
      isGroup,
      normalBalance,
      currencyCodes,
    });
    res.status(201).json(newAccount);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/accounts/import', async (req: Request, res: Response) => {
  try {
    const actor = res.locals.authenticatedActor as AuthenticatedActor | undefined;
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'لا توجد صفوف للاستيراد — تأكد من اختيار ملف إكسل صحيح.' });
    }
    const summary = await AccountingService.importAccounts({ rows, userId: actor?.userId });
    res.status(200).json({ success: true, ...summary });
  } catch (error: any) {
    if (Array.isArray(error?.details)) {
      return res.status(400).json({ error: error.message, details: error.details });
    }
    sendRouteError(res, 400, error);
  }
});

apiRouter.put('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body;
    const updated = await AccountingService.updateAccount(id, { name, isActive });
    res.json(updated);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// PHASE COA-1 — حذف آمن للحساب من دليل الحسابات (مرفوض عند الفروع/الحركات).
apiRouter.delete('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const actor = res.locals.authenticatedActor as AuthenticatedActor | undefined;
    const deleted = await AccountingService.deleteAccount(req.params.id, actor?.userId);
    res.json({ success: true, account: deleted });
  } catch (error: any) {
    // قواعد الحذف الآمن: الحسابات ذات الفروع أو الحركات المرتبطة تُرفض (409)
    // لكن الحساب غير الموجود يُعيد 404 حقيقياً.
    const isNotFound = error?.message?.includes('غير موجود');
    sendRouteError(res, isNotFound ? 404 : 409, error);
  }
});

// ==========================================
// 3. Journal Entries (القيود اليومية)
// ==========================================
apiRouter.get('/journal-entries', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const entries = await AccountingService.getJournalEntries(limit);
    res.json(entries);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/journal-entries', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'accounting.create');
    if (!actor) return;
    const { entryDate, description, lines, sourceId } = req.body;
    if (!entryDate || !description || !lines || lines.length < 2) {
      return res.status(400).json({ error: 'التاريخ والبيان وسطور القيد (طرفين على الأقل) مطلوبة' });
    }

    const entry = await AccountingService.createJournalEntry({
      entryDate,
      description,
      lines,
      sourceId,
      userId: actor.userId,
    });
    res.status(201).json(entry);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/journal-entries/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const entryRes = await db.query<any>(`
      SELECT je.*, cu.username as "createdByName"
      FROM accounting.journal_entries je
      LEFT JOIN security.users cu ON cu.id = je.created_by
      WHERE je.id = $1
    `, [req.params.id]);
    if (entryRes.rows.length === 0) {
      return res.status(404).json({ error: 'القيد غير موجود' });
    }

    const linesRes = await db.query<any>(`
      SELECT jl.*, a.code as "accountCode", a.name as "accountName",
             cc.code as "costCenterCode", cc.name as "costCenterName"
      FROM accounting.journal_entry_lines jl
      JOIN accounting.accounts a ON a.id = jl.account_id
      LEFT JOIN accounting.cost_centers cc ON cc.id = jl.cost_center_id
      WHERE jl.journal_entry_id = $1
      ORDER BY jl.line_number ASC
    `, [req.params.id]);

    const entry: any = entryRes.rows[0];

    res.json({
      ...entry,
      lines: linesRes.rows,
    });
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// Post a Journal Entry (ترحيل القيد مع الفحص المزدوج وفترة الصلاحية)
apiRouter.post('/journal-entries/:id/post', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'accounting.post');
    if (!actor) return;
    const posted = await AccountingService.postJournalEntry(req.params.id, actor.userId);
    res.json({
      success: true,
      message: 'تم ترحيل القيد بنجاح',
      entry: posted,
    });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// Reverse a Journal Entry (عكس القيد المرحل)
apiRouter.post('/journal-entries/:id/reverse', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'accounting.post');
    if (!actor) return;
    const result = await AccountingService.reverseJournalEntry(req.params.id, actor.userId);
    res.json({
      success: true,
      message: 'تم إنشاء قيد العكس وترحيله وتحديث القيد الأصلي',
      result,
    });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// Delete a Journal Entry (مسودة فقط)
apiRouter.delete('/journal-entries/:id', async (req: Request, res: Response) => {
  try {
    // PHASE 10.6.4 — حذف مسودة قيد جزء من دورة إنشائه، لذا يحتاج صلاحية
    // إنشاء القيود من الكتالوج (accounting.create) بدل الجلسة فقط.
    const actor = await requireDocumentActor(req, res, 'accounting.create');
    if (!actor) return;
    const result = await AccountingService.deleteJournalEntry(req.params.id, actor.userId);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// ==========================================
// 4. Fiscal Years & Periods (السنوات والفترات المالية)
// ==========================================
apiRouter.get(['/fiscal-years', '/accounting/fiscal-years'], async (_req: Request, res: Response) => {
  try {
    const years = await AccountingService.getFiscalYears();
    res.json(years);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get(['/fiscal-periods', '/accounting/fiscal-periods'], async (_req: Request, res: Response) => {
  try {
    const periods = await AccountingService.getFiscalPeriods();
    res.json(periods);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/accounting/cost-centers', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const result = await db.query<any>('SELECT * FROM accounting.cost_centers WHERE is_active = TRUE ORDER BY code ASC');
    res.json(result.rows);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// ==========================================
// 5. Reports (التقارير المالية)
// ==========================================
apiRouter.get('/reports/trial-balance', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const tb = await ReportingService.getTrialBalance({
      branchId:      req.query.branchId      as string,
      fiscalYearId:  req.query.fiscalYearId  as string,
      fiscalPeriodId:req.query.fiscalPeriodId as string,
      fromDate:      req.query.fromDate      as string,
      toDate:        req.query.toDate        as string,
    });

    // Map to shape expected by TrialBalancePage.tsx
    const accounts = (tb.accounts || []).map((a: any) => ({
      accountCode:   a.accountCode,
      accountName:   a.accountName,
      level:         a.level ?? 1,
      debit:         String(a.closingDebit  ?? 0),
      credit:        String(a.closingCredit ?? 0),
      balance:       String((a.closingDebit ?? 0) - (a.closingCredit ?? 0)),
    }));

    res.json({
      // TrialBalancePage.tsx reads: accounts[], totalDebit, totalCredit, isBalanced
      accounts,
      totalDebit:  tb.totalClosingDebit  ?? 0,
      totalCredit: tb.totalClosingCredit ?? 0,
      isBalanced:  tb.isBalanced,
      // FinancialReportsPage.tsx reads: totalOpeningDebit/Credit, totalPeriodDebit/Credit, totalClosingDebit/Credit
      totalOpeningDebit:  tb.totalOpeningDebit  ?? 0,
      totalOpeningCredit: tb.totalOpeningCredit ?? 0,
      totalPeriodDebit:   tb.totalPeriodDebit   ?? 0,
      totalPeriodCredit:  tb.totalPeriodCredit  ?? 0,
      totalClosingDebit:  tb.totalClosingDebit  ?? 0,
      totalClosingCredit: tb.totalClosingCredit ?? 0,
      difference:  tb.difference ?? 0,
      fromDate:    tb.fromDate,
      toDate:      tb.toDate,
    });
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// ==========================================
// 6. Audit Trail (سجل التدقيق)
// ==========================================
// PHASE 10.5.3: who-did-what is privileged oversight data. The endpoint backs
// BOTH the system audit screen (system.audit.view) and the audit report
// (reports.audit.view) — either permission is sufficient. Identity comes ONLY
// from the signed session; `userId`/`username` in query or body are ignored
// (getAuditLogs takes no identity parameters at all).
apiRouter.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const actorId = await requireAuditViewPermission(req, res);
    if (!actorId) return;
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const logs = await getAuditLogs(limit);
    res.json(logs);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// ==========================================
// 7. Customers (العملاء)
// ==========================================
apiRouter.get('/customers', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string;
    const { SalesService } = await import('./salesService.ts');
    const customers = await SalesService.getCustomers(search);
    res.json(customers);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/customers', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const customer = await SalesService.createCustomer(req.body);
    res.status(201).json(customer);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/customers/:id', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const customer = await SalesService.getCustomerById(req.params.id);
    res.json(customer);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.put('/customers/:id', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const updated = await SalesService.updateCustomer(req.params.id, req.body);
    res.json(updated);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/customers/:id/unpaid-invoices', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const invoices = await SalesService.getUnpaidInvoices(req.params.id);
    res.json(invoices);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

/**
 * PHASE 10.6.3 — هوية إلزامية لعمليات كتابة المستندات.
 *
 * كل مسار إنشاء/تعديل/ترحيل/إلغاء مستند يتطلب الآن جلسة موقّعة وصالحة
 * لمستخدم نشط. الهوية تُستخرج حصرًا من الجلسة الموقّعة على الخادم؛ أي
 * userId/username/branchId/companyId يرسله المتصفح تُتجاهل تمامًا عند
 * تحديد منشئ السجل أو معدّله.
 *
 * تُفحص الصلاحية من كتالوج الأمن الموجود (security.permissions عبر أدوار
 * المستخدم) عند وجود توافق مباشر مع العملية (مثال: sales.invoices.create).
 * العمليات التي لا تحمل صلاحية منفصلة في الكتالوج (تعديل مسودة، إلغاء)
 * تُفعّل للمستخدم الموثّق النشط فقط — बिना إنشاء نظام صلاحية موازٍ.
 *
 * تعيد هذه الدالة { userId, username } المستمدَين من الجلسة فقط، أو تُرسل
 * 401/403 وتُعيد null عندما لا توجد جلسة صالحة أو لا تكفي الصلاحية.
 */
async function requireDocumentActor(
  req: Request,
  res: Response,
  permissionCode?: string
): Promise<{ userId: string; username: string } | null> {
  const db = await getDb();
  const { verifySessionToken, extractBearerToken } = await import('./sessionTokens.ts');

  const payload = verifySessionToken(extractBearerToken(req.header('authorization')));
  if (!payload) {
    res.status(401).json({
      error: 'انتهت الجلسة أو لم يتم تسجيل الدخول. تتطلب عمليات حفظ المستندات جلسة صالحة.',
    });
    return null;
  }

  // إعادة قراءة المستخدم من قاعدة البيانات: الرمز المنتهي أو لمستخدم معطل
  // لا يمنح هوية، حتى لو كان الرمز نفسه موقّعًا بشكل صحيح.
  const userRes = await db.query<any>(
    'SELECT id, username FROM security.users WHERE id = $1 AND is_active = TRUE',
    [payload.sub]
  );
  if (userRes.rows.length === 0) {
    res.status(401).json({ error: 'المستخدم الحالي غير موجود أو معطل' });
    return null;
  }

  const actor = { userId: userRes.rows[0].id, username: userRes.rows[0].username };

  if (permissionCode) {
    const permRes = await db.query<any>(
      `SELECT 1
         FROM security.user_roles ur
         JOIN security.role_permissions rp ON rp.role_id = ur.role_id
         JOIN security.permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = $1 AND p.code = $2
        LIMIT 1`,
      [actor.userId, permissionCode]
    );
    if (permRes.rows.length === 0) {
      res.status(403).json({ error: `ليس لديك صلاحية تنفيذ هذا الإجراء (${permissionCode})` });
      return null;
    }
  }

  return actor;
}

// ==========================================
// 8. Sales Invoices (فواتير المبيعات)
// ==========================================
apiRouter.get('/sales/invoices', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const { SalesService } = await import('./salesService.ts');
    const invoices = await SalesService.getInvoices(limit);
    res.json(invoices);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/sales/invoices', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'sales.invoices.create');
    if (!actor) return;
    const { SalesService } = await import('./salesService.ts');
    // PHASE 10.6.4 — companyId/branchId القادمة من المتصفح تُتجاهل: نطاق
    // المستند يُشتق على الخادم من البيانات الافتراضية للشركة/الفرع.
    const { companyId, branchId, ...clientPayload } = req.body || {};
    const invoice = await SalesService.createInvoice({
      ...clientPayload,
      userId: actor.userId,
      username: actor.username,
    });
    res.status(201).json(invoice);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.put('/sales/invoices/:id', async (req: Request, res: Response) => {
  try {
    // PHASE 10.6.4 — حفظ/تعديل فاتورة المبيعات (مسودة) جزء من دورة إنشائها،
    // لذا يحتاج صلاحية الإنشاء من الكتالوج (sales.invoices.create).
    const actor = await requireDocumentActor(req, res, 'sales.invoices.create');
    if (!actor) return;
    const { SalesService } = await import('./salesService.ts');
    // PHASE 10.6.4 — companyId/branchId من المتصفح تُتجاهل؛ التعديل لا يغيّر
    // نطاق المستند (الشركة/الفرع محفوظتان كما هما).
    const { companyId, branchId, ...clientPayload } = req.body || {};
    const invoice = await SalesService.updateInvoice(req.params.id, {
      ...clientPayload,
      userId: actor.userId,
      username: actor.username,
    });
    res.json(invoice);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/sales/invoices/:id', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const invoice = await SalesService.getInvoiceById(req.params.id);
    res.json(invoice);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.post('/sales/invoices/:id/post', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'sales.invoices.post');
    if (!actor) return;
    const { allowOverride } = req.body;
    const { SalesService } = await import('./salesService.ts');
    const result = await SalesService.postSalesInvoice(req.params.id, actor.userId, allowOverride);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/sales/invoices/:id/void', async (req: Request, res: Response) => {
  try {
    // PHASE 10.6.4 — إلغاء فاتورة مرحّلة يعكس أثر الترحيل، لذا يحتاج نفس
    // صلاحية الترحيل من الكتالوج (sales.invoices.post) — لا صلاحية إلغاء
    // مستقلة موجودة في الكتالوج ولا تُخترع أسماء جديدة.
    const actor = await requireDocumentActor(req, res, 'sales.invoices.post');
    if (!actor) return;
    const { SalesService } = await import('./salesService.ts');
    const result = await SalesService.voidSalesInvoice(req.params.id, actor.userId);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// ==========================================
// 9. Receipts (سندات القبض)
// ==========================================
apiRouter.get('/sales/receipts', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const { SalesService } = await import('./salesService.ts');
    const receipts = await SalesService.getReceipts(limit);
    res.json(receipts);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/sales/receipts', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'sales.receipts.manage');
    if (!actor) return;
    const { SalesService } = await import('./salesService.ts');
    // PHASE 10.6.4 — companyId/branchId القادمة من المتصفح تُتجاهل.
    const { companyId, branchId, ...clientPayload } = req.body || {};
    const receipt = await SalesService.createReceipt({
      ...clientPayload,
      userId: actor.userId,
    });
    res.status(201).json(receipt);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

/**
 * تعديل سند القبض (المسودات فقط) — يخدم زر «تعديل» في شاشة سندات القبض.
 * SalesService.updateReceipt يعيد التحقق من الحالة والنطاق والحسابات والتخصيصات
 * داخل معاملة واحدة، ويرفض السند المرحّل/الملغى وذا القيد المحاسبي.
 * companyId/branchId القادمان من المتصفح يُتجاهلان؛ نطاق السند لا يتغير.
 */
apiRouter.put('/sales/receipts/:id', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'sales.receipts.manage');
    if (!actor) return;
    const { SalesService } = await import('./salesService.ts');
    const { companyId, branchId, ...clientPayload } = req.body || {};
    const receipt = await SalesService.updateReceipt(req.params.id, {
      ...clientPayload,
      userId: actor.userId,
      username: actor.username,
    });
    res.json(receipt);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/sales/receipts/:id', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const receipt = await SalesService.getReceiptById(req.params.id);
    res.json(receipt);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.post('/sales/receipts/:id/post', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'sales.receipts.manage');
    if (!actor) return;
    const { SalesService } = await import('./salesService.ts');
    const result = await SalesService.postReceipt(req.params.id, actor.userId);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// ==========================================
// 10. Customer Statement & Receivables Reports
// ==========================================
apiRouter.get('/reports/customer-statement/:id', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const statement = await SalesService.getCustomerStatement(req.params.id);
    res.json(statement);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/reports/customer-statement', async (req: Request, res: Response) => {
  try {
    const customerId = req.query.customerId as string;
    if (!customerId) {
      return res.status(400).json({ error: 'يرجى اختيار العميل أولاً لتشغيل كشف الحساب' });
    }
    const fromDate = req.query.fromDate as string;
    const toDate = req.query.toDate as string;
    const branchId = req.query.branchId as string;
    const { SalesService } = await import('./salesService.ts');
    const statement = await SalesService.getCustomerStatement(customerId, fromDate, toDate, branchId);
    res.json(statement);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// NOTE: the older '/reports/ar-aging' alias defined further down in this file
// (ReportingService.getArAging) was previously unreachable — Express matches
// the FIRST handler for a path, so this duplicate masked it with a flat
// accounts-receivable payload that has no aging buckets. The duplicate was
// removed; '/reports/accounts-receivable' below still serves that report.

apiRouter.get('/reports/accounts-receivable', async (_req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const report = await SalesService.getAccountsReceivableReport();
    res.json(report);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// ==========================================
// 11. Taxes (الضرائب القابلة للتهيئة)
// ==========================================
apiRouter.get(['/taxes/codes', '/accounting/tax-codes'], async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const resCodes = await db.query<any>(`
      SELECT tc.*, tr.rate_percentage, tr.sales_tax_account_id, tr.purchase_tax_account_id
      FROM accounting.tax_codes tc
      LEFT JOIN accounting.tax_rates tr ON tr.tax_code_id = tc.id AND tr.is_active = TRUE
      WHERE tc.is_active = TRUE
      ORDER BY tr.rate_percentage ASC
    `);
    res.json(resCodes.rows);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

/**
 * Edit a tax code (name + rate). The tax screen's تعديل button previously had
 * no endpoint behind it, so the row was permanently read-only. The rate lives
 * in accounting.tax_rates (rate_percentage), the label in accounting.tax_codes.
 */
apiRouter.put('/taxes/codes/:id', async (req: Request, res: Response) => {
  try {
    const actorId = await requireSettingPermission(req, res, 'system.settings.manage');
    if (!actorId) return;
    const db = await getDb();

    const tcRes = await db.query<any>(
      'SELECT id, code, name FROM accounting.tax_codes WHERE id = $1',
      [req.params.id]
    );
    if (tcRes.rows.length === 0) return res.status(404).json({ error: 'كود الضريبة غير موجود' });
    const current = tcRes.rows[0];

    const { name, ratePercentage } = req.body || {};
    const cleanName = name !== undefined ? String(name || '').trim() : current.name;
    if (!cleanName) return res.status(400).json({ error: 'اسم الضريبة مطلوب' });

    let rate: number | null = null;
    if (ratePercentage !== undefined && ratePercentage !== null && ratePercentage !== '') {
      rate = parseFloat(ratePercentage);
      if (!isFinite(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ error: 'النسبة المئوية يجب أن تكون رقماً بين 0 و 100' });
      }
    }

    await db.query('UPDATE accounting.tax_codes SET name = $1 WHERE id = $2', [cleanName, current.id]);
    if (rate !== null) {
      await db.query(
        `UPDATE accounting.tax_rates SET rate_percentage = $1
          WHERE tax_code_id = $2 AND is_active = TRUE`,
        [rate, current.id]
      );
    }

    await logAudit({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'TAX_CODE',
      entityId: current.id,
      newData: { code: current.code, name: cleanName, ratePercentage: rate },
    });

    res.json({ success: true, message: 'تم حفظ تعديلات الضريبة بنجاح' });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// ==========================================
// 12. Suppliers (الموردون والدائنون)
// ==========================================
apiRouter.get(['/suppliers', '/purchasing/suppliers'], async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string;
    const { PurchasingService } = await import('./purchasingService.ts');
    const suppliers = await PurchasingService.getSuppliers(search);
    res.json(suppliers);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/suppliers', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const supplier = await PurchasingService.createSupplier(req.body);
    res.status(201).json(supplier);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/suppliers/:id', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const supplier = await PurchasingService.getSupplierById(req.params.id);
    res.json(supplier);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.put('/suppliers/:id', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const updated = await PurchasingService.updateSupplier(req.params.id, req.body);
    res.json(updated);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/suppliers/:id/unpaid-invoices', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const invoices = await PurchasingService.getUnpaidInvoices(req.params.id);
    res.json(invoices);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// ==========================================
// 13. Purchase Invoices (فواتير المشتريات)
// ==========================================
apiRouter.get('/purchasing/invoices', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const { PurchasingService } = await import('./purchasingService.ts');
    const invoices = await PurchasingService.getInvoices(limit);
    res.json(invoices);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/purchasing/invoices', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'purchasing.invoices.create');
    if (!actor) return;
    const { PurchasingService } = await import('./purchasingService.ts');
    // PHASE 10.6.4 — companyId/branchId القادمة من المتصفح تُتجاهل.
    const { companyId, branchId, ...clientPayload } = req.body || {};
    const invoice = await PurchasingService.createInvoice({
      ...clientPayload,
      userId: actor.userId,
      username: actor.username,
    });
    res.status(201).json(invoice);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.put('/purchasing/invoices/:id', async (req: Request, res: Response) => {
  try {
    // PHASE 10.6.4 — حفظ/تعديل فاتورة المشتريات (مسودة) جزء من دورة إنشائها،
    // لذا يحتاج صلاحية الإنشاء من الكتالوج (purchasing.invoices.create).
    const actor = await requireDocumentActor(req, res, 'purchasing.invoices.create');
    if (!actor) return;
    const { PurchasingService } = await import('./purchasingService.ts');
    // PHASE 10.6.4 — companyId/branchId من المتصفح تُتجاهل؛ نطاق المستند لا يتغير.
    const { companyId, branchId, ...clientPayload } = req.body || {};
    const invoice = await PurchasingService.updateInvoice(req.params.id, {
      ...clientPayload,
      userId: actor.userId,
      username: actor.username,
    });
    res.json(invoice);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/purchasing/invoices/:id', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const invoice = await PurchasingService.getInvoiceById(req.params.id);
    res.json(invoice);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.post('/purchasing/invoices/:id/post', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'purchasing.invoices.post');
    if (!actor) return;
    const { PurchasingService } = await import('./purchasingService.ts');
    const result = await PurchasingService.postPurchaseInvoice(req.params.id, actor.userId);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/purchasing/invoices/:id/void', async (req: Request, res: Response) => {
  try {
    // PHASE 10.6.4 — إلغاء فاتورة مشتريات مرحّلة يعكس أثر الترحيل، لذا يحتاج
    // نفس صلاحية الترحيل من الكتالوج (purchasing.invoices.post).
    const actor = await requireDocumentActor(req, res, 'purchasing.invoices.post');
    if (!actor) return;
    const { PurchasingService } = await import('./purchasingService.ts');
    const result = await PurchasingService.reversePurchaseInvoice(req.params.id, actor.userId);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// ==========================================
// 14. Supplier Payments (سندات الصرف للموردين)
// ==========================================
apiRouter.get('/purchasing/payments', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const { PurchasingService } = await import('./purchasingService.ts');
    const payments = await PurchasingService.getPayments(limit);
    res.json(payments);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/purchasing/payments', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'purchasing.payments.manage');
    if (!actor) return;
    const { PurchasingService } = await import('./purchasingService.ts');
    // PHASE 10.6.4 — companyId/branchId القادمة من المتصفح تُتجاهل.
    const { companyId, branchId, ...clientPayload } = req.body || {};
    const payment = await PurchasingService.createPayment({
      ...clientPayload,
      userId: actor.userId,
    });
    res.status(201).json(payment);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

/**
 * تعديل سند الصرف (المسودات فقط) — يخدم زر «تعديل» في شاشة سندات الصرف.
 * PurchasingService.updatePayment يعيد التحقق من الحالة والنطاق والحسابات
 * والتخصيصات داخل معاملة واحدة، ويرفض السند المرحّل/الملغى وذا القيد المحاسبي.
 * companyId/branchId القادمان من المتصفح يُتجاهلان؛ نطاق السند لا يتغير.
 */
apiRouter.put('/purchasing/payments/:id', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'purchasing.payments.manage');
    if (!actor) return;
    const { PurchasingService } = await import('./purchasingService.ts');
    const { companyId, branchId, ...clientPayload } = req.body || {};
    const payment = await PurchasingService.updatePayment(req.params.id, {
      ...clientPayload,
      userId: actor.userId,
      username: actor.username,
    });
    res.json(payment);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/purchasing/payments/:id', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const payment = await PurchasingService.getPaymentById(req.params.id);
    res.json(payment);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.post('/purchasing/payments/:id/post', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'purchasing.payments.manage');
    if (!actor) return;
    const { PurchasingService } = await import('./purchasingService.ts');
    const result = await PurchasingService.postSupplierPayment(req.params.id, actor.userId);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/purchasing/payments/:id/void', async (req: Request, res: Response) => {
  try {
    // PHASE 10.6.4 — إلغاء سند صرف يعكس أثره المحاسبي ويعدّل أرصدة الفواتير،
    // لذا يحتاج صلاحية إدارة السندات نفسها من الكتالوج (purchasing.payments.manage).
    const actor = await requireDocumentActor(req, res, 'purchasing.payments.manage');
    if (!actor) return;
    const { PurchasingService } = await import('./purchasingService.ts');
    const result = await PurchasingService.reverseSupplierPayment(req.params.id, actor.userId);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// ==========================================
// 15. Reports (Supplier Statement, AP Aging, AP Reconciliation)
// ==========================================
// PHASE 10.2: the report registry advertises `dateRange` and `branch` for the
// supplier statement (src/services/reportRegistry.ts). Both endpoints used to
// drop those query params on the floor and return the unfiltered book, so a
// filtered view silently contradicted the supplier card shown beside it. The
// contract now mirrors the sales-side customer statement.
const supplierStatementFilters = (req: Request) => ({
  fromDate: req.query.fromDate as string | undefined,
  toDate: req.query.toDate as string | undefined,
  branchId: req.query.branchId as string | undefined,
});

apiRouter.get('/reports/supplier-statement/:id', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const { fromDate, toDate, branchId } = supplierStatementFilters(req);
    const statement = await PurchasingService.getSupplierStatement(req.params.id, fromDate, toDate, branchId);
    res.json(statement);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/reports/supplier-statement', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const db = await import('./db.ts').then(m => m.getDb());
    const { fromDate, toDate, branchId } = supplierStatementFilters(req);
    const supplierId = req.query.supplierId as string;
    let targetId = supplierId;
    if (!targetId) {
      const supps = await db.query<any>('SELECT id FROM purchasing.suppliers WHERE is_active = true LIMIT 1');
      if (supps.rows.length === 0) return res.json([]);
      targetId = supps.rows[0].id;
    }
    const statement = await PurchasingService.getSupplierStatement(targetId, fromDate, toDate, branchId);
    res.json(statement);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// PHASE 10.2: `branch` is a declared filter for the AP aging report; the
// handler ignored req entirely.
apiRouter.get('/reports/ap-aging', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const aging = await PurchasingService.getAccountsPayableAging(req.query.branchId as string | undefined);
    res.json(aging);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/reports/accounts-payable-aging', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const aging = await PurchasingService.getAccountsPayableAging(req.query.branchId as string | undefined);
    res.json(aging);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/reports/ap-reconciliation', async (_req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const report = await PurchasingService.getAPReconciliation();
    res.json(report);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/reports/purchase-summary', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const summary = await PurchasingService.getPurchaseSummary({
      period: req.query.period as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      branchId: req.query.branchId as string | undefined,
    });
    res.json(summary);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// ==========================================
// 16. Dashboard Real Data Summary
// ==========================================
apiRouter.get('/dashboard/summary', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const custRes = await db.query<any>('SELECT COUNT(*) as count FROM sales.customers WHERE is_active = TRUE');
    const suppRes = await db.query<any>('SELECT COUNT(*) as count FROM purchasing.suppliers WHERE is_active = TRUE');
    const salesRes = await db.query<any>("SELECT COALESCE(SUM(total), 0) as total FROM sales.sales_invoices WHERE status = 'POSTED'");
    const purchRes = await db.query<any>("SELECT COALESCE(SUM(total), 0) as total FROM purchasing.purchase_invoices WHERE status = 'POSTED'");
    const receiptsRes = await db.query<any>("SELECT COALESCE(SUM(amount), 0) as total FROM sales.receipts WHERE status = 'POSTED'");
    const paymentsRes = await db.query<any>("SELECT COALESCE(SUM(amount), 0) as total FROM purchasing.payments WHERE status = 'POSTED'");
    const cashRes = await db.query<any>(`
      SELECT COALESCE(SUM(jl.debit - jl.credit), 0) as total
      FROM accounting.journal_entry_lines jl
      JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounting.accounts a ON a.id = jl.account_id
      WHERE a.code IN ('1101', '1102') AND je.status IN ('POSTED', 'REVERSED')
    `);
    const apRes = await db.query<any>(`
      SELECT COALESCE(SUM(total - paid_amount), 0) as total
      FROM purchasing.purchase_invoices
      WHERE status = 'POSTED' AND payment_type = 'CREDIT'
    `);
    const arRes = await db.query<any>(`
      SELECT COALESCE(SUM(total - paid_amount), 0) as total
      FROM sales.sales_invoices
      WHERE status = 'POSTED' AND payment_type = 'CREDIT'
    `);

    res.json({
      activeCustomers: parseInt(custRes.rows[0]?.count || '0', 10),
      activeSuppliers: parseInt(suppRes.rows[0]?.count || '0', 10),
      totalSales: parseFloat(salesRes.rows[0]?.total || '0'),
      totalPurchases: parseFloat(purchRes.rows[0]?.total || '0'),
      totalReceipts: parseFloat(receiptsRes.rows[0]?.total || '0'),
      totalPayments: parseFloat(paymentsRes.rows[0]?.total || '0'),
      cashBalance: parseFloat(cashRes.rows[0]?.total || '0'),
      accountsPayable: parseFloat(apRes.rows[0]?.total || '0'),
      accountsReceivable: parseFloat(arRes.rows[0]?.total || '0'),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 16.1 Dashboard (لوحة التحكم — PHASE 10.6.2)
// ------------------------------------------------------------
// نقطة واحدة تجمع كل ما تعرضه اللوحة من بيانات حقيقية.
// سبب وجودها: تجميع نفس الاستعلامات في المتصفح كان يتطلب
// طلباً منفصلاً لكل بطاقة ورسم، ويكرر حساب النسب، ويجعل
// الشاشة تعتمد على بيانات ثابتة. كل رقم هنا يأتي من جداول
// فعلية، وحالة الفراغ تُترك للواجهة لتعرضها بوضوح.
// ==========================================

interface DashboardAlert {
  id: string;
  severity: 'danger' | 'warning';
  title: string;
  detail: string;
  count: number;
  amount?: number;
  href: string;
}

type DbClient = Awaited<ReturnType<typeof getDb>>;

/**
 * أرصدة المخزون الحالية كما يحسبها دفتر حركات المخزون المرحّلة فقط.
 * لا تُستخدم حركة DRAFT في الرصيد؛ ولا تُحتسب الأصناف غير المخزنية
 * (الخدمات) ضمن تنبيهات النفاد. هذه قراءة للوحة فقط ولا تغيّر
 * أي منطق مخزون أو ترحيل.
 */
async function getStockAlertCounts(db: DbClient): Promise<{ lowStock: number; outOfStock: number }> {
  const stock = await db.query<any>(`
    SELECT
      COUNT(*) FILTER (WHERE current_stock > 0 AND reorder_point > 0 AND current_stock <= reorder_point)::int AS low_stock,
      COUNT(*) FILTER (WHERE current_stock <= 0)::int AS out_of_stock
    FROM (
      SELECT i.id,
             i.reorder_point,
             COALESCE(SUM(
               CASE
                 WHEN tx.id IS NULL THEN 0
                 WHEN tx.transaction_type IN (
                   'OPENING','PURCHASE_RECEIPT','TRANSFER_IN','ADJUSTMENT_IN','RETURN_IN','STOCK_COUNT_ADJUSTMENT'
                 ) THEN l.quantity
                 ELSE -l.quantity
               END
             ), 0) AS current_stock
      FROM inventory.items i
      LEFT JOIN inventory.stock_transaction_lines l ON l.item_id = i.id
      LEFT JOIN inventory.stock_transactions tx
        ON tx.id = l.transaction_id AND tx.status = 'POSTED'
      WHERE i.is_active = TRUE AND i.is_stock_item = TRUE
      GROUP BY i.id, i.reorder_point
    ) s
  `);

  return {
    lowStock: Number(stock.rows[0]?.low_stock ?? 0),
    outOfStock: Number(stock.rows[0]?.out_of_stock ?? 0),
  };
}

/**
 * تنبيهات حقيقية مشتقة من بيانات النظام نفسها. لا تُنشأ أي تنبيهات
 * عندما لا يوجد شرط فعلي (رصيد متجاوز، فاتورة متأخرة، مخزون نافد،
 * حركة بنكية غير مطابقة، قيد غير مرحّل، أو ميزان غير متزن).
 */
async function getDashboardAlerts(
  db: DbClient,
  stock: { lowStock: number; outOfStock: number }
): Promise<DashboardAlert[]> {
  const alerts: DashboardAlert[] = [];

  /* ---------- الحد الائتماني: العملاء ---------- */
  const customerCredit = await db.query<any>(`
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(balance - credit_limit), 0) AS excess
    FROM (
      SELECT c.id,
             c.credit_limit,
             COALESCE((
               SELECT SUM(si.total) FROM sales.sales_invoices si
               WHERE si.customer_id = c.id AND si.status = 'POSTED' AND si.payment_type = 'CREDIT'
             ), 0)
             - COALESCE((
               SELECT SUM(r.amount) FROM sales.receipts r
               WHERE r.customer_id = c.id AND r.status = 'POSTED'
             ), 0)
             - COALESCE((
               SELECT SUM(sr.total) FROM sales.sales_returns sr
               WHERE sr.customer_id = c.id AND sr.status = 'POSTED'
             ), 0) AS balance
      FROM sales.customers c
      WHERE c.is_active = TRUE AND c.credit_limit > 0
    ) c
    WHERE balance > credit_limit
  `);
  const customerOverLimit = Number(customerCredit.rows[0]?.count ?? 0);
  if (customerOverLimit > 0) {
    alerts.push({
      id: 'customer-credit-limit',
      severity: 'danger',
      title: 'عملاء تجاوزوا الحد الائتماني',
      detail: 'الرصيد القائم أكبر من الحد الائتماني المسجل للعميل',
      count: customerOverLimit,
      amount: Number(customerCredit.rows[0]?.excess ?? 0),
      href: '/sales/customers',
    });
  }

  /* ---------- الحد الائتماني: الموردون ---------- */
  const supplierCredit = await db.query<any>(`
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(balance - credit_limit), 0) AS excess
    FROM (
      SELECT s.id,
             s.credit_limit,
             COALESCE((
               SELECT SUM(pi.total) FROM purchasing.purchase_invoices pi
               WHERE pi.supplier_id = s.id AND pi.status = 'POSTED' AND pi.payment_type = 'CREDIT'
             ), 0)
             - COALESCE((
               SELECT SUM(p.amount) FROM purchasing.payments p
               WHERE p.supplier_id = s.id AND p.status = 'POSTED'
             ), 0)
             - COALESCE((
               SELECT SUM(pr.total) FROM purchasing.purchase_returns pr
               WHERE pr.supplier_id = s.id AND pr.status = 'POSTED'
             ), 0) AS balance
      FROM purchasing.suppliers s
      WHERE s.is_active = TRUE AND s.credit_limit > 0
    ) s
    WHERE balance > credit_limit
  `);
  const supplierOverLimit = Number(supplierCredit.rows[0]?.count ?? 0);
  if (supplierOverLimit > 0) {
    alerts.push({
      id: 'supplier-credit-limit',
      severity: 'danger',
      title: 'موردون تجاوزوا الحد الائتماني',
      detail: 'الرصيد القائم أكبر من الحد الائتماني المسجل للمورد',
      count: supplierOverLimit,
      amount: Number(supplierCredit.rows[0]?.excess ?? 0),
      href: '/purchasing/suppliers',
    });
  }

  /* ---------- ذمم مدينة متأخرة ---------- */
  const overdueReceivable = await db.query<any>(`
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(total - paid_amount), 0) AS amount
    FROM sales.sales_invoices
    WHERE status = 'POSTED'
      AND payment_type = 'CREDIT'
      AND due_date < CURRENT_DATE
      AND total - paid_amount > 0.005
  `);
  const overdueArCount = Number(overdueReceivable.rows[0]?.count ?? 0);
  if (overdueArCount > 0) {
    alerts.push({
      id: 'overdue-receivables',
      severity: 'danger',
      title: 'فواتير بيع متأخرة السداد',
      detail: 'فواتير آجلة تجاوزت تاريخ الاستحقاق ولم تُسدد بالكامل',
      count: overdueArCount,
      amount: Number(overdueReceivable.rows[0]?.amount ?? 0),
      href: '/sales/invoices',
    });
  }

  /* ---------- ذمم دائنة متأخرة ---------- */
  const overduePayable = await db.query<any>(`
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(total - paid_amount), 0) AS amount
    FROM purchasing.purchase_invoices
    WHERE status = 'POSTED'
      AND payment_type = 'CREDIT'
      AND due_date < CURRENT_DATE
      AND total - paid_amount > 0.005
  `);
  const overdueApCount = Number(overduePayable.rows[0]?.count ?? 0);
  if (overdueApCount > 0) {
    alerts.push({
      id: 'overdue-payables',
      severity: 'danger',
      title: 'فواتير شراء متأخرة السداد',
      detail: 'فواتير آجلة تجاوزت تاريخ الاستحقاق ولم تُسدد بالكامل',
      count: overdueApCount,
      amount: Number(overduePayable.rows[0]?.amount ?? 0),
      href: '/purchasing/invoices',
    });
  }

  /* ---------- المخزون ---------- */
  if (stock.lowStock > 0) {
    alerts.push({
      id: 'low-stock',
      severity: 'warning',
      title: 'أصناف منخفضة المخزون',
      detail: 'وصل الرصيد الحالي إلى حد إعادة الطلب أو أقل',
      count: stock.lowStock,
      href: '/inventory/items',
    });
  }
  if (stock.outOfStock > 0) {
    alerts.push({
      id: 'out-of-stock',
      severity: 'warning',
      title: 'أصناف نافدة من المخزون',
      detail: 'لا يوجد رصيد حالي لهذه الأصناف في المستودعات',
      count: stock.outOfStock,
      href: '/inventory/items',
    });
  }

  /* ---------- حركات بنكية غير مطابقة ---------- */
  const bankUnreconciled = await db.query<any>(`
    SELECT COUNT(*)::int AS count
    FROM banking.transactions
    WHERE account_category = 'BANK' AND is_reconciled = FALSE
  `);
  const bankCount = Number(bankUnreconciled.rows[0]?.count ?? 0);
  if (bankCount > 0) {
    alerts.push({
      id: 'unreconciled-bank',
      severity: 'warning',
      title: 'حركات بنكية غير مطابقة',
      detail: 'حركات على الحسابات البنكية لم تُسوَّ بعد مع كشوف البنك',
      count: bankCount,
      href: '/banking/reconciliation',
    });
  }

  /* ---------- قيود غير مرحّلة ---------- */
  const draftJournals = await db.query<any>(`
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(amount), 0) AS amount
    FROM (
      SELECT je.id, COALESCE(SUM(jl.debit), 0) AS amount
      FROM accounting.journal_entries je
      LEFT JOIN accounting.journal_entry_lines jl ON jl.journal_entry_id = je.id
      WHERE je.status = 'DRAFT'
      GROUP BY je.id
    ) d
  `);
  const draftCount = Number(draftJournals.rows[0]?.count ?? 0);
  if (draftCount > 0) {
    alerts.push({
      id: 'draft-journals',
      severity: 'warning',
      title: 'قيود محاسبية غير مرحّلة',
      detail: 'قيود مسودة تحتاج مراجعة وترحيلاً',
      count: draftCount,
      amount: Number(draftJournals.rows[0]?.amount ?? 0),
      href: '/accounting/journal-entries',
    });
  }

  /* ---------- توازن ميزان المراجعة ---------- */
  const trial = await db.query<any>(`
    SELECT COALESCE(SUM(jl.debit), 0) AS debit,
           COALESCE(SUM(jl.credit), 0) AS credit
    FROM accounting.journal_entry_lines jl
    JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.status = 'POSTED'
  `);
  const debit = Number(trial.rows[0]?.debit ?? 0);
  const credit = Number(trial.rows[0]?.credit ?? 0);
  const difference = Math.round((debit - credit) * 10000) / 10000;
  if (Math.abs(difference) > 0.005) {
    alerts.push({
      id: 'unbalanced-trial-balance',
      severity: 'danger',
      title: 'ميزان المراجعة غير متزن',
      detail: 'يوجد فرق بين إجمالي المدين وإجمالي الدائن في القيود المرحّلة',
      count: 1,
      amount: Math.abs(difference),
      href: '/reports/integrity',
    });
  }

  return alerts;
}

apiRouter.get('/dashboard/overview', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const num = (v: any): number => {
      const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
      return Number.isFinite(n) ? n : 0;
    };

    /* الفترة المختارة: إمّا تاريخ ISO صريح، أو نطاق سنة/شهر.
       بدون أي معطى نعرض السنة الميلادية الجارية. */
    const now = new Date();
    let from: Date;
    let to: Date;
    let periodKey: string;

    const monthParam = String(req.query.month ?? '');
    const yearParam = String(req.query.year ?? '');
    const fromParam = String(req.query.from ?? '');
    const toParam = String(req.query.to ?? '');

    if (fromParam && toParam) {
      from = new Date(fromParam);
      to = new Date(toParam);
      periodKey = 'custom';
    } else if (monthParam && yearParam) {
      const y = parseInt(yearParam, 10);
      const m = parseInt(monthParam, 10);
      if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
        res.status(400).json({ error: 'فترة غير صالحة: تحقق من السنة والشهر' });
        return;
      }
      from = new Date(Date.UTC(y, m - 1, 1));
      to = new Date(Date.UTC(y, m, 0));
      periodKey = `${y}-${String(m).padStart(2, '0')}`;
    } else if (yearParam) {
      const y = parseInt(yearParam, 10);
      if (!Number.isInteger(y) || y < 1900 || y > 2200) {
        res.status(400).json({ error: 'سنة غير صالحة' });
        return;
      }
      from = new Date(Date.UTC(y, 0, 1));
      to = new Date(Date.UTC(y, 11, 31));
      periodKey = String(y);
    } else {
      from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      to = new Date(Date.UTC(now.getUTCFullYear(), 11, 31));
      periodKey = String(now.getUTCFullYear());
    }

    const f = from.toISOString().slice(0, 10);
    const t = to.toISOString().slice(0, 10);

    /* الرسم الشهري يعرض السنة كاملة حتى عند اختيار شهر واحد، حتى
       يظل الاتجاه قابلاً للقراءة ويُظلل الشهر المحدد داخل الرسم.
       أما الجداول والمؤشرات فتبقى على الفترة المختارة نفسها. */
    const chartYear = periodKey === 'custom'
      ? Number(f.slice(0, 4))
      : Number(periodKey.slice(0, 4)) || now.getUTCFullYear();
    const chartFrom = periodKey === 'custom' ? from : new Date(Date.UTC(chartYear, 0, 1));
    const chartTo = periodKey === 'custom' ? to : new Date(Date.UTC(chartYear, 11, 31));
    const cf = chartFrom.toISOString().slice(0, 10);
    const ct = chartTo.toISOString().slice(0, 10);

    /* مقارنة الفترة السابقة بنفس الطول — تُستخدم فقط إن كانت
       الفترة السابقة تحوي بيانات فعلية، وإلا تُعرض القيمة بلا نسبة. */
    const spanMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - spanMs);
    const pf = prevFrom.toISOString().slice(0, 10);
    const pt = prevTo.toISOString().slice(0, 10);

    /* ---------- مؤشرات الفترة الحالية ---------- */
    const cur = await db.query<any>(`
      SELECT
        (SELECT COALESCE(SUM(total), 0) FROM sales.sales_invoices
          WHERE status = 'POSTED' AND invoice_date BETWEEN $1 AND $2) AS sales,
        (SELECT COALESCE(SUM(total), 0) FROM purchasing.purchase_invoices
          WHERE status = 'POSTED' AND invoice_date BETWEEN $1 AND $2) AS purchases,
        (SELECT COALESCE(SUM(amount), 0) FROM sales.receipts
          WHERE status = 'POSTED' AND receipt_date BETWEEN $1 AND $2) AS receipts,
        (SELECT COALESCE(SUM(amount), 0) FROM purchasing.payments
          WHERE status = 'POSTED' AND payment_date BETWEEN $1 AND $2) AS payments
    `, [f, t]);

    /* ---------- الفترة السابقة (للمقارنة) ---------- */
    const prev = await db.query<any>(`
      SELECT
        (SELECT COALESCE(SUM(total), 0) FROM sales.sales_invoices
          WHERE status = 'POSTED' AND invoice_date BETWEEN $1 AND $2) AS sales,
        (SELECT COALESCE(SUM(total), 0) FROM purchasing.purchase_invoices
          WHERE status = 'POSTED' AND invoice_date BETWEEN $1 AND $2) AS purchases,
        (SELECT COALESCE(SUM(amount), 0) FROM sales.receipts
          WHERE status = 'POSTED' AND receipt_date BETWEEN $1 AND $2) AS receipts,
        (SELECT COALESCE(SUM(amount), 0) FROM purchasing.payments
          WHERE status = 'POSTED' AND payment_date BETWEEN $1 AND $2) AS payments
    `, [pf, pt]);

    /* ---------- الاتجاه الشهري: التدفقات والمبيعات ---------- */
    const monthly = await db.query<any>(`
      WITH months AS (
        SELECT generate_series($1::date, $2::date, '1 month') AS m
      )
      SELECT
        to_char(months.m, 'YYYY-MM') AS month,
        (SELECT COALESCE(SUM(r.amount), 0) FROM sales.receipts r
          WHERE r.status = 'POSTED'
            AND date_trunc('month', r.receipt_date::timestamp) = months.m) AS receipts,
        (SELECT COALESCE(SUM(p.amount), 0) FROM purchasing.payments p
          WHERE p.status = 'POSTED'
            AND date_trunc('month', p.payment_date::timestamp) = months.m) AS payments,
        (SELECT COALESCE(SUM(si.total), 0) FROM sales.sales_invoices si
          WHERE si.status = 'POSTED'
            AND date_trunc('month', si.invoice_date::timestamp) = months.m) AS sales,
        (SELECT COALESCE(SUM(pi.total), 0) FROM purchasing.purchase_invoices pi
          WHERE pi.status = 'POSTED'
            AND date_trunc('month', pi.invoice_date::timestamp) = months.m) AS purchases,
        (SELECT COALESCE(SUM(CASE WHEN at.category = 'REVENUE' THEN jl.credit - jl.debit ELSE 0 END), 0)
           FROM accounting.journal_entry_lines jl
           JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
           JOIN accounting.accounts a ON a.id = jl.account_id
           JOIN accounting.account_types at ON at.id = a.account_type_id
          WHERE je.status = 'POSTED'
            AND date_trunc('month', je.entry_date::timestamp) = months.m
            AND at.category = 'REVENUE') AS revenue,
        (SELECT COALESCE(SUM(CASE WHEN at.category = 'EXPENSE' THEN jl.debit - jl.credit ELSE 0 END), 0)
           FROM accounting.journal_entry_lines jl
           JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
           JOIN accounting.accounts a ON a.id = jl.account_id
           JOIN accounting.account_types at ON at.id = a.account_type_id
          WHERE je.status = 'POSTED'
            AND date_trunc('month', je.entry_date::timestamp) = months.m
            AND at.category = 'EXPENSE') AS expenses
      FROM months
      ORDER BY months.m
    `, [cf, ct]);

    /* ---------- توزيع المصروفات على الحسابات ---------- */
    const expenseMix = await db.query<any>(`
      SELECT a.name AS account,
             a.code AS code,
             COALESCE(SUM(jl.debit - jl.credit), 0) AS amount
      FROM accounting.journal_entry_lines jl
      JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounting.accounts a ON a.id = jl.account_id
      JOIN accounting.account_types at ON at.id = a.account_type_id
      WHERE je.status = 'POSTED'
        AND je.entry_date BETWEEN $1 AND $2
        AND at.category = 'EXPENSE'
      GROUP BY a.name, a.code
      ORDER BY amount DESC
      LIMIT 8
    `, [f, t]);

    /* ---------- أعلى العملاء: مبيعات الفترة + الرصيد الحالي ---------- */
    const topCustomers = await db.query<any>(`
      SELECT c.id,
             c.name,
             COALESCE((
               SELECT SUM(si.total) FROM sales.sales_invoices si
               WHERE si.customer_id = c.id AND si.status = 'POSTED'
                 AND si.invoice_date BETWEEN $1 AND $2
             ), 0) AS "totalSales",
             COALESCE((
               SELECT SUM(si.total) FROM sales.sales_invoices si
               WHERE si.customer_id = c.id AND si.status = 'POSTED'
                 AND si.payment_type = 'CREDIT'
             ), 0)
             - COALESCE((
               SELECT SUM(r.amount) FROM sales.receipts r
               WHERE r.customer_id = c.id AND r.status = 'POSTED'
             ), 0)
             - COALESCE((
               SELECT SUM(sr.total) FROM sales.sales_returns sr
               WHERE sr.customer_id = c.id AND sr.status = 'POSTED'
             ), 0) AS balance
      FROM sales.customers c
      WHERE c.is_active = TRUE
        AND EXISTS (
          SELECT 1 FROM sales.sales_invoices si
          WHERE si.customer_id = c.id AND si.status = 'POSTED'
            AND si.invoice_date BETWEEN $1 AND $2
        )
      ORDER BY "totalSales" DESC, c.name
      LIMIT 5
    `, [f, t]);

    /* ---------- أعلى الموردين: مشتريات الفترة + الرصيد الحالي ---------- */
    const topSuppliers = await db.query<any>(`
      SELECT s.id,
             s.name,
             COALESCE((
               SELECT SUM(pi.total) FROM purchasing.purchase_invoices pi
               WHERE pi.supplier_id = s.id AND pi.status = 'POSTED'
                 AND pi.invoice_date BETWEEN $1 AND $2
             ), 0) AS "totalPurchases",
             COALESCE((
               SELECT SUM(pi.total) FROM purchasing.purchase_invoices pi
               WHERE pi.supplier_id = s.id AND pi.status = 'POSTED'
                 AND pi.payment_type = 'CREDIT'
             ), 0)
             - COALESCE((
               SELECT SUM(p.amount) FROM purchasing.payments p
               WHERE p.supplier_id = s.id AND p.status = 'POSTED'
             ), 0)
             - COALESCE((
               SELECT SUM(pr.total) FROM purchasing.purchase_returns pr
               WHERE pr.supplier_id = s.id AND pr.status = 'POSTED'
             ), 0) AS balance
      FROM purchasing.suppliers s
      WHERE s.is_active = TRUE
        AND EXISTS (
          SELECT 1 FROM purchasing.purchase_invoices pi
          WHERE pi.supplier_id = s.id AND pi.status = 'POSTED'
            AND pi.invoice_date BETWEEN $1 AND $2
        )
      ORDER BY "totalPurchases" DESC, s.name
      LIMIT 5
    `, [f, t]);

    /* ---------- أرصدة الحسابات الرئيسية حتى نهاية الفترة ----------
       الرصيد تراكمي من بداية القيود المرحّلة حتى نهاية الفترة، وليس
       حركة الفترة وحدها؛ لذلك يُحسب من كل القيود السابقة للتاريخ. */
    const MAIN_ACCOUNT_CODES = ['1101', '1102', '1103', '1104', '2101'];
    const mainAccounts = await db.query<any>(`
      SELECT a.code,
             a.name,
             COALESCE(SUM(m.debit - m.credit), 0) AS balance
      FROM accounting.accounts a
      LEFT JOIN (
        SELECT jl.account_id, jl.debit, jl.credit
        FROM accounting.journal_entry_lines jl
        JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
        WHERE je.status = 'POSTED' AND je.entry_date <= $2
      ) m ON m.account_id = a.id
      WHERE a.code = ANY($1::text[])
      GROUP BY a.code, a.name
      ORDER BY a.code
    `, [MAIN_ACCOUNT_CODES, t]);

    /* ---------- ترحيل الحسابات ---------- */
    const ledger = await db.query<any>(`
      SELECT a.code, a.name,
             COALESCE(SUM(jl.debit), 0) AS debit,
             COALESCE(SUM(jl.credit), 0) AS credit
      FROM accounting.journal_entry_lines jl
      JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounting.accounts a ON a.id = jl.account_id
      WHERE je.status = 'POSTED' AND je.entry_date BETWEEN $1 AND $2
      GROUP BY a.code, a.name
      ORDER BY a.code
    `, [f, t]);

    const balances = ledger.rows
      .map((r: any) => ({ ...r, balance: num(r.debit) - num(r.credit) }))
      .filter((r: any) => r.balance !== 0);

    /* ---------- آخر العمليات ---------- */
    const recentJournals = await db.query<any>(`
      SELECT je.id, je.entry_number, je.entry_date, je.description, je.status,
             COALESCE(SUM(jl.debit), 0) AS amount
      FROM accounting.journal_entries je
      LEFT JOIN accounting.journal_entry_lines jl ON jl.journal_entry_id = je.id
      GROUP BY je.id, je.entry_number, je.entry_date, je.description, je.status
      ORDER BY je.entry_date DESC, je.created_at DESC
      LIMIT 5
    `);

    /* المستندات الفعلية مع طرف المعاملة وحالتها؛ كل صف يحمل معرّف
       المستند الحقيقي ليُستخدم مفتاحاً في الجدول ورابطاً للوحدة. */
    const recentDocs = await db.query<any>(`
      SELECT * FROM (
        SELECT 'invoice' AS kind, si.id::text AS id, si.invoice_number AS number,
               si.invoice_date AS doc_date, si.total AS amount, si.status,
               c.name AS party
        FROM sales.sales_invoices si
        JOIN sales.customers c ON c.id = si.customer_id
        WHERE si.status <> 'VOIDED'
        UNION ALL
        SELECT 'return', sr.id::text, sr.return_number, sr.return_date, sr.total, sr.status,
               c.name
        FROM sales.sales_returns sr
        JOIN sales.customers c ON c.id = sr.customer_id
        WHERE sr.status <> 'VOIDED'
        UNION ALL
        SELECT 'receipt', r.id::text, r.receipt_number, r.receipt_date, r.amount, r.status,
               c.name
        FROM sales.receipts r
        JOIN sales.customers c ON c.id = r.customer_id
        WHERE r.status <> 'VOIDED'
        UNION ALL
        SELECT 'bill', pi.id::text, pi.invoice_number, pi.invoice_date, pi.total, pi.status,
               s.name
        FROM purchasing.purchase_invoices pi
        JOIN purchasing.suppliers s ON s.id = pi.supplier_id
        WHERE pi.status <> 'VOIDED'
        UNION ALL
        SELECT 'payment', p.id::text, p.payment_number, p.payment_date, p.amount, p.status,
               s.name
        FROM purchasing.payments p
        JOIN purchasing.suppliers s ON s.id = p.supplier_id
        WHERE p.status <> 'VOIDED'
      ) d
      ORDER BY doc_date DESC, number DESC
      LIMIT 5
    `);

    /* ---------- مؤشرات السيولة ---------- */
    const liquidity = await db.query<any>(`
      SELECT
        (SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
           FROM accounting.journal_entry_lines jl
           JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
           JOIN accounting.accounts a ON a.id = jl.account_id
          WHERE a.code IN ('1101','1102') AND je.status = 'POSTED') AS cash,
        (SELECT COALESCE(SUM(si.total - si.paid_amount), 0) FROM sales.sales_invoices si
          WHERE si.status = 'POSTED') AS receivables,
        (SELECT COALESCE(SUM(pi.total - pi.paid_amount), 0) FROM purchasing.purchase_invoices pi
          WHERE pi.status = 'POSTED') AS payables
    `);

    /* ---------- الفترات والسنوات المتاحة للاختيار ---------- */
    const periods = await db.query<any>(`
      SELECT DISTINCT to_char(entry_date, 'YYYY-MM') AS period
      FROM accounting.journal_entries
      WHERE status = 'POSTED'
      ORDER BY period DESC
      LIMIT 24
    `);

    const years = await db.query<any>(`
      SELECT DISTINCT EXTRACT(YEAR FROM entry_date)::int AS year
      FROM accounting.journal_entries
      WHERE status = 'POSTED'
      ORDER BY year DESC
    `);

    /* ---------- تنبيهات المخزون من الحركات المرحّلة فقط ---------- */
    const stockAlerts = await getStockAlertCounts(db);
    const alerts = await getDashboardAlerts(db, stockAlerts);

    const c = cur.rows[0] || {};
    const p = prev.rows[0] || {};

    const changePct = (curVal: number, prevVal: number): number | null => {
      const pv = num(prevVal);
      if (!pv) return null;
      return Math.round(((curVal - pv) / pv) * 10000) / 100;
    };

    res.json({
      generatedAt: new Date().toISOString(),
      period: { from: f, to: t, key: periodKey, year: periodKey === 'custom' ? null : Number(periodKey.slice(0, 4)), month: periodKey.length === 7 ? Number(periodKey.slice(5, 7)) : null },
      chartPeriod: { from: cf, to: ct, year: chartYear },
      availablePeriods: periods.rows.map((r: any) => r.period),
      availableYears: years.rows.map((r: any) => Number(r.year)),
      kpis: {
        sales: num(c.sales),
        purchases: num(c.purchases),
        receipts: num(c.receipts),
        payments: num(c.payments),
      },
      /* النسبة تُحسب على القيم الفعلية فقط إن وُجِدت قيم فعلية في الفترة
         السابقة، وإلا تُعاد null ويُخفي البطاقة النسبة بدل اختلاقها. */
      comparison: {
        sales: { current: num(c.sales), previous: num(p.sales), changePct: changePct(num(c.sales), num(p.sales)) },
        purchases: { current: num(c.purchases), previous: num(p.purchases), changePct: changePct(num(c.purchases), num(p.purchases)) },
        receipts: { current: num(c.receipts), previous: num(p.receipts), changePct: changePct(num(c.receipts), num(p.receipts)) },
        payments: { current: num(c.payments), previous: num(p.payments), changePct: changePct(num(c.payments), num(p.payments)) },
      },
      monthly: monthly.rows.map((r: any) => ({
        month: r.month,
        receipts: num(r.receipts),
        payments: num(r.payments),
        sales: num(r.sales),
        purchases: num(r.purchases),
        revenue: num(r.revenue),
        expenses: num(r.expenses),
      })),
      expenseMix: expenseMix.rows.map((r: any) => ({
        account: r.account,
        code: r.code,
        amount: num(r.amount),
      })),
      topCustomers: topCustomers.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        totalSales: num(r.totalSales),
        balance: num(r.balance),
      })),
      topSuppliers: topSuppliers.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        totalPurchases: num(r.totalPurchases),
        balance: num(r.balance),
      })),
      mainAccounts: mainAccounts.rows.map((r: any) => ({
        code: r.code,
        name: r.name,
        balance: num(r.balance),
      })),
      balances: balances.map((r: any) => ({
        code: r.code,
        name: r.name,
        debit: num(r.debit),
        credit: num(r.credit),
        balance: r.balance,
      })),
      recentJournals: recentJournals.rows.map((r: any) => ({
        id: r.id,
        entryNumber: r.entry_number,
        entryDate: r.entry_date,
        description: r.description,
        status: r.status,
        amount: num(r.amount),
      })),
      recentDocs: recentDocs.rows.map((r: any) => ({
        id: r.id,
        kind: r.kind,
        number: r.number,
        date: r.doc_date,
        amount: num(r.amount),
        party: r.party,
        status: r.status,
      })),
      liquidity: {
        cash: num(liquidity.rows[0]?.cash),
        receivables: num(liquidity.rows[0]?.receivables),
        payables: num(liquidity.rows[0]?.payables),
      },
      stockAlerts,
      alerts,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* تنبيهات لوحة التحكم وحدها — يستخدمها الشريط العلوي حتى لا يعيد
   تحميل كل مؤشرات اللوحة لمجرد عرض شارة الإشعارات. */
apiRouter.get('/dashboard/alerts', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const stockAlerts = await getStockAlertCounts(db);
    const alerts = await getDashboardAlerts(db, stockAlerts);
    res.json({
      generatedAt: new Date().toISOString(),
      count: alerts.length,
      alerts,
      stockAlerts,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 17. Inventory (المخزون والمستودعات)
// ==========================================
apiRouter.get('/inventory/categories', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const categories = await InventoryService.getCategories();
    res.json(categories);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/inventory/categories', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const category = await InventoryService.createCategory(req.body);
    res.status(201).json(category);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/inventory/units', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const units = await InventoryService.getUnits();
    res.json(units);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/inventory/units', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const unit = await InventoryService.createUnit(req.body);
    res.status(201).json(unit);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/inventory/warehouses', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    // HOTFIX: operational screens request ?activeOnly=true so a deactivated
    // warehouse is never offered as a posting target. Master-data screens
    // (Warehouses.tsx) keep the unfiltered list.
    const activeOnly = String(req.query.activeOnly).toLowerCase() === 'true';
    const warehouses = await InventoryService.getWarehouses(activeOnly);
    res.json(warehouses);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/inventory/warehouses', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const warehouse = await InventoryService.createWarehouse(req.body);
    res.status(201).json(warehouse);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/inventory/items', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string;
    const categoryId = req.query.categoryId as string;
    const { InventoryService } = await import('./inventoryService.ts');
    const items = await InventoryService.getItems(search, categoryId);
    res.json(items);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/inventory/items', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const item = await InventoryService.createItem(req.body);
    res.status(201).json(item);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/inventory/items/:id', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const item = await InventoryService.getItemById(req.params.id);
    res.json(item);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.put('/inventory/items/:id', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const updated = await InventoryService.updateItem(req.params.id, req.body);
    res.json(updated);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.delete('/inventory/items/:id', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const result = await InventoryService.deleteItem(req.params.id, req.body.userId);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/inventory/items/:id/stock', async (req: Request, res: Response) => {
  try {
    const warehouseId = req.query.warehouseId as string;
    const { InventoryService } = await import('./inventoryService.ts');
    const stock = await InventoryService.getItemStock(req.params.id, warehouseId);
    res.json(stock);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/inventory/items/:id/ledger', async (req: Request, res: Response) => {
  try {
    const warehouseId = req.query.warehouseId as string;
    const { InventoryService } = await import('./inventoryService.ts');
    const ledger = await InventoryService.getItemLedger(req.params.id, warehouseId);
    res.json(ledger);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/inventory/stock', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const search = req.query.search as string;
    const categoryId = req.query.categoryId as string;
    const items = await InventoryService.getItems(search, categoryId);
    res.json(items);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/inventory/ledger', async (req: Request, res: Response) => {
  try {
    const itemId = req.query.itemId as string;
    const warehouseId = req.query.warehouseId as string;
    const { InventoryService } = await import('./inventoryService.ts');
    if (!itemId) {
      // If no item specified, return first item or list of transactions
      const items = await InventoryService.getItems();
      if (items.length > 0) {
        const ledger = await InventoryService.getItemLedger(items[0].id, warehouseId);
        return res.json(ledger);
      }
      return res.json({ entries: [] });
    }
    const ledger = await InventoryService.getItemLedger(itemId, warehouseId);
    res.json(ledger);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/inventory/transactions', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const warehouseId = req.query.warehouseId as string;
    const txs = await InventoryService.getStockTransactions(limit, warehouseId);
    res.json(txs);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/inventory/transactions/:id', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const tx = await InventoryService.getStockTransactionDetails(req.params.id);
    res.json(tx);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.post('/inventory/transactions', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const tx = await InventoryService.createStockTransaction(req.body);
    res.status(201).json(tx);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/inventory/transfers', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const transfers = await InventoryService.getStockTransfers();
    res.json(transfers);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/inventory/transfers', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const transfer = await InventoryService.createStockTransfer(req.body);
    res.status(201).json(transfer);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/inventory/counts', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const counts = await InventoryService.getStockCounts();
    res.json(counts);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/inventory/counts', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const count = await InventoryService.createStockCount(req.body);
    res.status(201).json(count);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/inventory/counts/:id/approve', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const result = await InventoryService.approveStockCount(req.params.id, req.body.userId);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/reports/inventory-reconciliation', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const report = await InventoryService.getInventoryReconciliation();
    res.json(report);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/inventory/reports/reconciliation', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const report = await InventoryService.getInventoryReconciliation();
    res.json(report);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/inventory/reports/value', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const items = await InventoryService.getItems();
    const totalValue = items.reduce((sum, i) => sum + (i.stockValue || 0), 0);
    res.json({
      totalValue,
      itemCount: items.length,
      items: items.map(i => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        currentStock: i.currentStock,
        averageCost: i.averageCost,
        stockValue: i.stockValue,
        categoryName: i.categoryName,
      })),
    });
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/inventory/reports/low-stock', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const items = await InventoryService.getItems();
    const lowStock = items.filter(i => i.stockStatus === 'LOW_STOCK');
    res.json(lowStock);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/inventory/reports/out-of-stock', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const items = await InventoryService.getItems();
    const outOfStock = items.filter(i => i.stockStatus === 'OUT_OF_STOCK');
    res.json(outOfStock);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/inventory/dashboard-summary', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const summary = await InventoryService.getInventoryDashboardSummary();
    res.json(summary);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// ==========================================
// Phase 6: Cash & Banking API Routes
// ==========================================

// Liquidity & Overview Summary
apiRouter.get('/banking/summary', async (_req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const summary = await BankingService.getLiquiditySummary();
    res.json(summary);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// Cash Accounts
apiRouter.get('/banking/cash-accounts', async (_req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const accounts = await BankingService.getCashAccounts();
    res.json(accounts);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/banking/cash-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const account = await BankingService.getCashAccountById(req.params.id);
    res.json(account);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.post('/banking/cash-accounts', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const created = await BankingService.createCashAccount(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.put('/banking/cash-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const updated = await BankingService.updateCashAccount(req.params.id, req.body);
    res.json(updated);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// Bank Accounts
apiRouter.get('/banking/bank-accounts', async (_req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const accounts = await BankingService.getBankAccounts();
    res.json(accounts);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/banking/bank-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const account = await BankingService.getBankAccountById(req.params.id);
    res.json(account);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.post('/banking/bank-accounts', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const created = await BankingService.createBankAccount(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.put('/banking/bank-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const updated = await BankingService.updateBankAccount(req.params.id, req.body);
    res.json(updated);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// Unified Cash & Bank Ledger Transactions
apiRouter.get('/banking/transactions', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const transactions = await BankingService.getTransactions({
      accountCategory: req.query.category as any,
      cashAccountId: req.query.cashAccountId as string,
      bankAccountId: req.query.bankAccountId as string,
      transactionType: req.query.type as string,
      isReconciled: req.query.isReconciled !== undefined ? req.query.isReconciled === 'true' : undefined,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    });
    res.json(transactions);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/banking/balances/:category/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const category = req.params.category.toUpperCase() as 'CASH' | 'BANK';
    const balance = await BankingService.getAccountBalance(category, req.params.id);
    res.json({ balance });
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// Transfers & Deposits & Withdrawals
apiRouter.get('/banking/transfers', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const transfers = await BankingService.getTransfers(limit);
    res.json(transfers);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/banking/transfers', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const transfer = await BankingService.createTransfer(req.body);
    res.status(201).json(transfer);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// Direct Bank Charges
apiRouter.post('/banking/charges', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const result = await BankingService.createBankCharge(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// Bank Statements
apiRouter.get('/banking/statements', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const statements = await BankingService.getBankStatements(req.query.bankAccountId as string);
    res.json(statements);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/banking/statements/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const statement = await BankingService.getBankStatementById(req.params.id);
    res.json(statement);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.post('/banking/statements', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const created = await BankingService.createBankStatement(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// Bank Reconciliation
apiRouter.get('/banking/reconciliations', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const reconciliations = await BankingService.getBankReconciliations(req.query.bankAccountId as string);
    res.json(reconciliations);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/banking/charges', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const result = await BankingService.createBankCharge(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/banking/reconciliations/preview', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const { bankAccountId, periodEndDate, statementClosingBalance } = req.body;
    const preview = await BankingService.getReconciliationPreview(
      bankAccountId,
      periodEndDate,
      parseFloat(statementClosingBalance || '0')
    );
    res.json(preview);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/banking/reconciliations', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const reconciliation = await BankingService.createBankReconciliation(req.body);
    res.status(201).json(reconciliation);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// Cash Counts
apiRouter.get('/banking/cash-counts', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const counts = await BankingService.getCashCounts(req.query.cashAccountId as string);
    res.json(counts);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/banking/cash-counts/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const count = await BankingService.getCashCountById(req.params.id);
    res.json(count);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.post('/banking/cash-counts', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const count = await BankingService.createCashCount(req.body);
    res.status(201).json(count);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/banking/cash-counts/:id/approve', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const approved = await BankingService.approveCashCount(req.params.id, req.body.userId);
    res.json(approved);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// ==========================================
// Phase 7: Fixed Assets & Expense Management API Routes
// ==========================================

// --- Fixed Assets ---
apiRouter.get('/assets/summary', async (_req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const summary = await AssetService.getAssetSummary();
    res.json(summary);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/assets/reports/reconciliation', async (_req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const report = await AssetService.getAssetGlReconciliation();
    res.json(report);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/assets/categories', async (_req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const categories = await AssetService.getCategories();
    res.json(categories);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/assets/categories', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const created = await AssetService.createCategory(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/assets', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const assets = await AssetService.getAssets({
      status: req.query.status as string,
      categoryId: req.query.categoryId as string,
      branchId: req.query.branchId as string,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
    });
    res.json(assets);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/assets/:id', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const asset = await AssetService.getAssetById(req.params.id);
    res.json(asset);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.post('/assets', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const created = await AssetService.createAsset(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/assets/:id/capitalize', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const result = await AssetService.capitalizeAsset(req.params.id, req.body.capitalizationDate, req.body.userId);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/assets/:id/depreciation', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const result = await AssetService.postDepreciationEntry(req.params.id, req.body.fiscalPeriodId, req.body.userId);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/assets/:id/transfer', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const result = await AssetService.transferAsset({ ...req.body, assetId: req.params.id });
    res.status(201).json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/assets/:id/maintenance', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const result = await AssetService.recordMaintenance({ ...req.body, assetId: req.params.id });
    res.status(201).json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/assets/:id/dispose', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const result = await AssetService.disposeAsset({ ...req.body, assetId: req.params.id });
    res.status(201).json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// --- Expenses ---
apiRouter.get('/expenses/summary', async (_req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const summary = await ExpenseService.getExpenseSummary();
    res.json(summary);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/expenses/categories', async (_req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const categories = await ExpenseService.getCategories();
    res.json(categories);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/expenses/categories', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const created = await ExpenseService.createCategory(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/expenses', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const expenses = await ExpenseService.getExpenses({
      status: req.query.status as string,
      categoryId: req.query.categoryId as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
    });
    res.json(expenses);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// Move /expenses/:id below static routes so it doesn't intercept /expenses/accruals and /expenses/prepaid
apiRouter.post('/expenses', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const created = await ExpenseService.createExpense(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/expenses/:id/approve', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const approved = await ExpenseService.approveExpense(req.params.id, req.body.userId);
    res.json(approved);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/expenses/:id/post', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const posted = await ExpenseService.postExpense(req.params.id, req.body.userId);
    res.json(posted);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/expenses/:id/reverse', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const reversed = await ExpenseService.reverseExpense(req.params.id, req.body.reason || 'إلغاء وعكس المصروف', req.body.userId);
    res.json(reversed);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// --- Accruals ---
apiRouter.get('/expenses/accruals', async (_req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const accruals = await ExpenseService.getAccruals();
    res.json(accruals);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/expenses/accruals', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const created = await ExpenseService.createAccrual(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/expenses/accruals/:id/pay', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const paid = await ExpenseService.payAccrual({ ...req.body, accrualId: req.params.id });
    res.json(paid);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// --- Prepaid Schedules ---
apiRouter.get('/expenses/prepaid', async (_req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const schedules = await ExpenseService.getPrepaidSchedules();
    res.json(schedules);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/expenses/prepaid/:id', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const schedule = await ExpenseService.getPrepaidScheduleById(req.params.id);
    res.json(schedule);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

apiRouter.post('/expenses/prepaid', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const created = await ExpenseService.createPrepaidSchedule(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/expenses/prepaid/amortizations/:id/post', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const result = await ExpenseService.postPrepaidAmortization(req.params.id, req.body.userId);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// Parameterized expense route placed after static accruals and prepaid routes
apiRouter.get('/expenses/:id', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const expense = await ExpenseService.getExpenseById(req.params.id);
    res.json(expense);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

// ==========================================
// Phase 8: Financial Reporting & Period Closing API Routes
// ==========================================

// 1. General Ledger Report
apiRouter.get('/reports/general-ledger', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const report = await ReportingService.getGeneralLedger({
      accountId:     req.query.accountId     as string,
      branchId:      req.query.branchId      as string,
      costCenterId:  req.query.costCenterId  as string,
      fiscalYearId:  req.query.fiscalYearId  as string,
      fiscalPeriodId:req.query.fiscalPeriodId as string,
      fromDate:      req.query.fromDate      as string,
      toDate:        req.query.toDate        as string,
      limit:  req.query.limit  ? parseInt(req.query.limit  as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    });

    // Group flat lines by account for GeneralLedgerPage.tsx
    const accountMap = new Map<string, {
      accountCode: string; accountName: string;
      openingBalance: number; totalDebit: number; totalCredit: number;
      closingBalance: number; entries: any[];
    }>();

    for (const line of report.lines) {
      const key = line.accountCode;
      if (!accountMap.has(key)) {
        accountMap.set(key, {
          accountCode:    line.accountCode,
          accountName:    line.accountName,
          openingBalance: 0,
          totalDebit:     0,
          totalCredit:    0,
          closingBalance: 0,
          entries:        [],
        });
      }
      const acc = accountMap.get(key)!;
      acc.totalDebit  += line.debit;
      acc.totalCredit += line.credit;
      acc.entries.push({
        entryDate:    line.entryDate,
        entryNumber:  line.entryNumber,
        description:  line.lineDescription || line.entryDescription,
        debit:        line.debit,
        credit:       line.credit,
        runningBalance: line.runningBalance,
      });
    }

    // Recalculate closing balance per account
    for (const acc of accountMap.values()) {
      acc.closingBalance = acc.openingBalance + acc.totalDebit - acc.totalCredit;
    }

    res.json({
      openingBalance: report.openingBalance,
      totalDebit:     report.totalDebit,
      totalCredit:    report.totalCredit,
      closingBalance: report.closingBalance,
      linesCount:     report.linesCount,
      lines:          report.lines,
      accounts:       Array.from(accountMap.values()),
    });
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// 2. Account Statement
apiRouter.get('/reports/account-statement/:id', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const statement = await ReportingService.getAccountStatement(req.params.id, {
      branchId: req.query.branchId as string,
      costCenterId: req.query.costCenterId as string,
      fiscalYearId: req.query.fiscalYearId as string,
      fiscalPeriodId: req.query.fiscalPeriodId as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
    });
    res.json(statement);
  } catch (error: any) {
    sendRouteError(res, 404, error);
  }
});

// 4. Income Statement / P&L
apiRouter.get('/reports/income-statement', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const pnl = await ReportingService.getIncomeStatement({
      branchId: req.query.branchId as string,
      costCenterId: req.query.costCenterId as string,
      fiscalYearId: req.query.fiscalYearId as string,
      fiscalPeriodId: req.query.fiscalPeriodId as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
    });
    res.json(pnl);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// 5. Balance Sheet
apiRouter.get('/reports/balance-sheet', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const bs = await ReportingService.getBalanceSheet({
      branchId: req.query.branchId as string,
      fiscalYearId: req.query.fiscalYearId as string,
      fiscalPeriodId: req.query.fiscalPeriodId as string,
      toDate: (req.query.toDate || req.query.asOfDate) as string,
    });
    res.json(bs);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// 6. Cash Flow Statement
apiRouter.get('/reports/cash-flow', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const cf = await ReportingService.getCashFlowStatement({
      branchId: req.query.branchId as string,
      fiscalYearId: req.query.fiscalYearId as string,
      fiscalPeriodId: req.query.fiscalPeriodId as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
    });
    res.json(cf);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// 7. AR Aging
apiRouter.get('/reports/ar-aging', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const aging = await ReportingService.getArAging(req.query.asOfDate as string);
    res.json(aging);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// 8. AP Aging
apiRouter.get('/reports/ap-aging', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const aging = await ReportingService.getApAging(req.query.asOfDate as string);
    res.json(aging);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// 9. Tax Report
apiRouter.get('/reports/tax', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const tax = await ReportingService.getTaxReport({
      fiscalPeriodId: req.query.fiscalPeriodId as string,
      fiscalYearId: req.query.fiscalYearId as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
    });
    res.json(tax);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// 10. Financial Dashboard & KPIs
apiRouter.get('/reports/financial-dashboard', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const dashboard = await ReportingService.getFinancialDashboard({
      branchId: req.query.branchId as string,
      fiscalPeriodId: req.query.fiscalPeriodId as string,
      fiscalYearId: req.query.fiscalYearId as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
    });
    res.json(dashboard);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// 11. Comparative Report
apiRouter.get('/reports/comparative', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const currentPeriodId = req.query.currentPeriodId as string;
    const previousPeriodId = req.query.previousPeriodId as string;
    if (!currentPeriodId || !previousPeriodId) {
      return res.status(400).json({ error: 'currentPeriodId and previousPeriodId are required' });
    }
    const report = await ReportingService.getComparativeReport(currentPeriodId, previousPeriodId);
    res.json(report);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// 12. Monthly Trends
apiRouter.get('/reports/monthly', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const report = await ReportingService.getMonthlyReport(req.query.fiscalYearId as string);
    res.json(report);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// 13. Financial Integrity & Cross-Module Reconciliation
apiRouter.get('/reports/reconciliation', async (req: Request, res: Response) => {
  try {
    const { FinancialIntegrityService } = await import('./financialIntegrityService.ts');
    const report = await FinancialIntegrityService.runIntegrityCheck(req.query.asOfDate as string);
    res.json(report);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// 14. Fiscal Period Closing Check & Workflow
apiRouter.get('/fiscal-periods/:id/closing-check', async (req: Request, res: Response) => {
  try {
    const { FinancialIntegrityService } = await import('./financialIntegrityService.ts');
    const check = await FinancialIntegrityService.runPeriodClosingCheck(req.params.id);
    res.json(check);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/fiscal-periods/:id/close', async (req: Request, res: Response) => {
  try {
    const { FinancialIntegrityService } = await import('./financialIntegrityService.ts');
    const result = await FinancialIntegrityService.closeFiscalPeriod(req.params.id, req.body.userId, req.body.notes);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/fiscal-periods/:id/reopen', async (req: Request, res: Response) => {
  try {
    const { FinancialIntegrityService } = await import('./financialIntegrityService.ts');
    const result = await FinancialIntegrityService.reopenFiscalPeriod(req.params.id, req.body.userId || 'admin', req.body.reason);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// 15. Fiscal Year Closing Workflow
apiRouter.post('/fiscal-years/:id/close', async (req: Request, res: Response) => {
  try {
    const { FinancialIntegrityService } = await import('./financialIntegrityService.ts');
    const result = await FinancialIntegrityService.closeFiscalYear(req.params.id, req.body.userId);
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// ==========================================
// 16. Sales Returns (مردودات المبيعات)
// ==========================================
apiRouter.get('/sales/returns', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const result = await db.query<any>(`
      SELECT 
        sr.*,
        c.name as "customerName",
        c.code as "customerCode",
        si.invoice_number as "originalInvoiceNumber"
      FROM sales.sales_returns sr
      JOIN sales.customers c ON c.id = sr.customer_id
      LEFT JOIN sales.sales_invoices si ON si.id = sr.original_invoice_id
      ORDER BY sr.created_at DESC
    `);
    res.json(result.rows);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/sales/returns/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const headerRes = await db.query<any>(`
      SELECT
        sr.*,
        c.name as "customerName",
        c.code as "customerCode",
        c.phone as "customerPhone",
        c.address as "customerAddress",
        si.invoice_number as "originalInvoiceNumber",
        je.entry_number as "journalEntryNumber",
        b.name as "branchName",
        COALESCE(cu.full_name, cu.username) as "createdByName"
      FROM sales.sales_returns sr
      JOIN sales.customers c ON c.id = sr.customer_id
      LEFT JOIN sales.sales_invoices si ON si.id = sr.original_invoice_id
      LEFT JOIN accounting.journal_entries je ON je.id = sr.journal_entry_id
      LEFT JOIN core.branches b ON b.id = sr.branch_id
      LEFT JOIN security.users cu ON cu.id = sr.created_by
      WHERE sr.id = $1
    `, [req.params.id]);

    if (headerRes.rows.length === 0) {
      return res.status(404).json({ error: 'مردود المبيعات غير موجود' });
    }

    const linesRes = await db.query<any>(`
      SELECT
        l.*,
        l.item_id as "itemId",
        l.warehouse_id as "warehouseId",
        i.name as "itemName",
        i.sku as "itemSku",
        iu.name as "itemUnit",
        w.name as "warehouseName"
      FROM sales.sales_return_lines l
      LEFT JOIN inventory.items i ON i.id = l.item_id
      LEFT JOIN inventory.units iu ON iu.id = i.unit_id
      LEFT JOIN inventory.warehouses w ON w.id = l.warehouse_id
      WHERE l.return_id = $1
      ORDER BY l.line_number ASC
    `, [req.params.id]);

    res.json({
      ...headerRes.rows[0],
      lines: linesRes.rows,
    });
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.post('/sales/returns', async (req: Request, res: Response) => {
  try {
    const actor = await requireDocumentActor(req, res, 'sales.returns.manage');
    if (!actor) return;
    const db = await getDb();
    const { SettingsService } = await import('./settingsService.ts');
    const { customerId, originalInvoiceId, returnDate, notes, lines } = req.body;
    if (!customerId || !returnDate || !lines || lines.length === 0) {
      return res.status(400).json({ error: 'العميل وتاريخ المردود وبنود المردود مطلوبة' });
    }

    const compRes = await db.query<any>('SELECT id FROM core.companies LIMIT 1');
    const companyId = compRes.rows[0]?.id;
    const countRes = await db.query<any>('SELECT COUNT(*) as count FROM sales.sales_returns');
    const returnNumber = `SR-${new Date().getFullYear()}-${String(parseInt(countRes.rows[0]?.count || '0', 10) + 1).padStart(4, '0')}`;

    // ---- Validate everything BEFORE any write (PHASE 9.1) ----
    const custRes = await db.query<any>('SELECT * FROM sales.customers WHERE id = $1', [customerId]);
    if (custRes.rows.length === 0) {
      return res.status(400).json({ error: 'العميل المحدد غير موجود' });
    }
    const customer = custRes.rows[0];

    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      const q = parseFloat(l.quantity || 1);
      const p = parseFloat(l.unitPrice || 0);
      const t = parseFloat(l.tax || 0);
      if (q <= 0 || p < 0 || t < 0) {
        return res.status(400).json({ error: 'كميات وأسعار وضرائب بنود المردود يجب أن تكون موجبة' });
      }
      subtotal += q * p;
      tax += t;
    }
    const total = subtotal + tax;
    if (total <= 0) {
      return res.status(400).json({ error: 'إجمالي المردود يجب أن يكون أكبر من صفر' });
    }

    // ---- Resolve accounts via Central Settings Mapping (no hardcoded business logic) ----
    let receivablesAccountId = customer?.receivables_account_id;
    if (!receivablesAccountId) {
      receivablesAccountId = await SettingsService.getAccountMapping('sales.default_ar_account', '1103', companyId);
    }
    let revenueReturnAccountId: string;
    try {
      revenueReturnAccountId = await SettingsService.getAccountMapping('sales.default_sales_return_account', '4102', companyId);
    } catch {
      // Fallback to the general revenue account when no dedicated returns account exists
      revenueReturnAccountId = await SettingsService.getAccountMapping('sales.default_revenue_account', '41', companyId);
    }
    let vatOutAccId: string | null = null;
    if (tax > 0) {
      vatOutAccId = await SettingsService.getAccountMapping('sales.default_output_tax_account', '2105', companyId);
    }

    // ---- Validate stock items + compute WAC return cost (no writes) ----
    // Sales return reverses the original sale: Inventory UP, COGS DOWN at actual WAC.
    // PHASE 9.5.1: each line may name its warehouse (column exists on
    // sales_return_lines); it defaults to the default warehouse only when
    // unset, and must be active. Snapshot and movement share that warehouse.
    const { InventoryService } = await import('./inventoryService.ts');
    // HOTFIX: shared deterministic default, matching purchase receipts and sales issues.
    const defaultWhId = await InventoryService.getDefaultActiveWarehouse();
    const returnStockLines: any[] = [];
    // PHASE 9.5.1: per-request-line resolution so persisted return lines carry
    // their item and warehouse (columns exist since V15).
    const lineResolution: Array<{ itemId: string | null; warehouseId: string | null }> = [];
    let totalReturnCost = 0;
    for (const l of lines) {
      let item: any = null;
      if (l.itemId) {
        const itemRes = await db.query<any>('SELECT * FROM inventory.items WHERE id = $1', [l.itemId]);
        if (itemRes.rows.length > 0) item = itemRes.rows[0];
      }
      if (!item) {
        const itemRes = await db.query<any>(
          'SELECT * FROM inventory.items WHERE (sku = $1 OR name = $2) AND is_stock_item = TRUE LIMIT 1',
          [l.itemCode || null, l.description || null]
        );
        if (itemRes.rows.length > 0) item = itemRes.rows[0];
      }
      if (item && item.is_stock_item && defaultWhId) {
        const lineWhId = l.warehouseId || l.warehouse_id || defaultWhId;
        const lineWhCheck = await db.query<any>('SELECT id FROM inventory.warehouses WHERE id = $1 AND is_active = TRUE', [lineWhId]);
        if (lineWhCheck.rows.length === 0) {
          return res.status(400).json({ error: 'المستودع المحدد في بند مردود المبيعات غير موجود أو معطل' });
        }
        const qty = parseFloat(l.quantity || 1);
        const stockData = await InventoryService.getItemStock(item.id, lineWhId);
        totalReturnCost += qty * stockData.averageCost;
        returnStockLines.push({ itemId: item.id, quantity: qty, unitCost: stockData.averageCost, warehouseId: lineWhId });
        lineResolution.push({ itemId: item.id, warehouseId: lineWhId });
      } else {
        lineResolution.push({ itemId: null, warehouseId: null });
      }
    }

    // ---- Journal lines mirror the fixed sales posting in reverse ----
    // DR Sales Returns (net) + DR Output VAT (tax) / CR Customer Receivables (gross)
    const jeLines: any[] = [
      {
        accountId: revenueReturnAccountId,
        debit: subtotal,
        credit: 0,
        description: `مدين: مردودات المبيعات - إشعار دائن ${returnNumber}`,
      },
    ];
    if (tax > 0 && vatOutAccId) {
      jeLines.push({
        accountId: vatOutAccId,
        debit: tax,
        credit: 0,
        description: `مدين: عكس ضريبة المخرجات - مردود مبيعات ${returnNumber}`,
      });
    }
    jeLines.push({
      accountId: receivablesAccountId,
      debit: 0,
      credit: total,
      description: `دائن: ذمم العميل ${customer?.name || ''} - مردود مبيعات ${returnNumber}`,
    });

    // ---- ATOMIC COMMIT: journal + return + stock RETURN_IN + COGS reversal ----
    const createdReturn = await withTransaction(async () => {
      const je = await AccountingService.createJournalEntry({
        companyId,
        entryDate: returnDate,
        sourceId: 'SYSTEM',
        description: `إثبات مردودات مبيعات رقم ${returnNumber} للعميل ${customer?.name || ''}`,
        lines: jeLines,
        userId: actor.userId,
      });
      const postedJE = await AccountingService.postJournalEntry(je.id, actor.userId);

      const returnRes = await db.query<any>(`
        INSERT INTO sales.sales_returns (company_id, return_number, customer_id, original_invoice_id, return_date, subtotal, tax, total, status, journal_entry_id, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'POSTED', $9, $10, $11)
        RETURNING *
      `, [companyId, returnNumber, customerId, originalInvoiceId || null, returnDate, subtotal, tax, total, postedJE.id, notes || null, actor.userId || null]);
      const created = returnRes.rows[0];

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const q = parseFloat(l.quantity || 1);
        const p = parseFloat(l.unitPrice || 0);
        const t = parseFloat(l.tax || 0);
        const rsl = lineResolution[i] || { itemId: null, warehouseId: null };
        await db.query(`
          INSERT INTO sales.sales_return_lines (return_id, item_id, warehouse_id, item_code, description, quantity, unit_price, tax, line_total, line_number)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [created.id, rsl.itemId, rsl.warehouseId, l.itemCode || null, l.description || 'صنف مردود', q, p, t, (q * p) + t, i + 1]);
      }

      // Inventory UP (RETURN_IN at actual WAC) + COGS DOWN (DR Inventory / CR COGS)
      // PHASE 9.5.1: one RETURN_IN per return warehouse so snapshot scope ==
      // movement scope == replay scope. Single-warehouse returns still yield
      // exactly one movement; the COGS reversal below stays invoice-level.
      if (returnStockLines.length > 0 && defaultWhId) {
        const returnByWarehouse = new Map<string, typeof returnStockLines>();
        for (const rl of returnStockLines) {
          const key: string = rl.warehouseId;
          if (!returnByWarehouse.has(key)) returnByWarehouse.set(key, []);
          returnByWarehouse.get(key)!.push({ itemId: rl.itemId, quantity: rl.quantity, unitCost: rl.unitCost });
        }
        for (const [whId, group] of returnByWarehouse) {
          await InventoryService.createStockTransaction({
            transactionType: 'RETURN_IN',
            transactionDate: returnDate,
            warehouseId: whId,
            referenceType: 'SALES_RETURN',
            referenceId: created.id,
            notes: `استلام مرتجع بموجب مردود مبيعات ${returnNumber}`,
            lines: group,
            companyId,
            userId: actor.userId,
          });
        }

        if (totalReturnCost > 0) {
          const invAccId = await SettingsService.getAccountMapping('inventory.default_inventory_account', '1104', companyId);
          const cogsAccId = await SettingsService.getAccountMapping('inventory.default_cogs_account', '5001', companyId);
          const cogsRevJE = await AccountingService.createJournalEntry({
            companyId,
            entryDate: returnDate,
            sourceId: 'SYSTEM',
            description: `عكس تكلفة البضاعة المباعة (COGS) لمردود مبيعات رقم ${returnNumber}`,
            lines: [
              {
                accountId: invAccId,
                debit: totalReturnCost,
                credit: 0,
                description: `مدين: المخزون السلعي (استلام مرتجع) - مردود ${returnNumber}`,
              },
              {
                accountId: cogsAccId,
                debit: 0,
                credit: totalReturnCost,
                description: `دائن: تكلفة المبيعات (عكس COGS) - مردود ${returnNumber}`,
              },
            ],
            userId: actor.userId,
          });
          await AccountingService.postJournalEntry(cogsRevJE.id, actor.userId);
        }
      }

      return created;
    });

    res.status(201).json({
      success: true,
      message: 'تم تسجيل وترحيل مردود المبيعات وتحديث حساب العميل والقيد المحاسبي',
      salesReturn: createdReturn,
    });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// ==========================================
// 17. Purchasing Returns (مردودات المشتريات)
// ==========================================
apiRouter.get('/purchasing/returns', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const result = await db.query<any>(`
      SELECT 
        pr.*,
        s.name as "supplierName",
        s.code as "supplierCode",
        pi.invoice_number as "originalInvoiceNumber"
      FROM purchasing.purchase_returns pr
      JOIN purchasing.suppliers s ON s.id = pr.supplier_id
      LEFT JOIN purchasing.purchase_invoices pi ON pi.id = pr.original_invoice_id
      ORDER BY pr.created_at DESC
    `);
    res.json(result.rows);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/purchasing/returns/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const headerRes = await db.query<any>(`
      SELECT
        pr.*,
        s.name as "supplierName",
        s.code as "supplierCode",
        s.phone as "supplierPhone",
        s.address as "supplierAddress",
        s.tax_number as "supplierTaxNumber",
        pi.invoice_number as "originalInvoiceNumber",
        je.entry_number as "journalEntryNumber",
        b.name as "branchName",
        COALESCE(cu.full_name, cu.username) as "createdByName"
      FROM purchasing.purchase_returns pr
      JOIN purchasing.suppliers s ON s.id = pr.supplier_id
      LEFT JOIN purchasing.purchase_invoices pi ON pi.id = pr.original_invoice_id
      LEFT JOIN accounting.journal_entries je ON je.id = pr.journal_entry_id
      LEFT JOIN core.branches b ON b.id = pr.branch_id
      LEFT JOIN security.users cu ON cu.id = pr.created_by
      WHERE pr.id = $1
    `, [req.params.id]);

    if (headerRes.rows.length === 0) {
      return res.status(404).json({ error: 'مردود المشتريات غير موجود' });
    }

    const linesRes = await db.query<any>(`
      SELECT
        l.*,
        l.item_id as "itemId",
        l.warehouse_id as "warehouseId",
        i.name as "itemName",
        i.sku as "itemSku",
        iu.name as "itemUnit",
        w.name as "warehouseName"
      FROM purchasing.purchase_return_lines l
      LEFT JOIN inventory.items i ON i.id = l.item_id
      LEFT JOIN inventory.units iu ON iu.id = i.unit_id
      LEFT JOIN inventory.warehouses w ON w.id = l.warehouse_id
      WHERE l.return_id = $1
      ORDER BY l.line_number ASC
    `, [req.params.id]);

    res.json({
      ...headerRes.rows[0],
      lines: linesRes.rows,
    });
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// ---- PHASE 9.3: in-process serialization for purchase-return postings ----
// PGlite exposes a single shared connection, so overlapping postings would
// interleave inside one another's BEGIN..COMMIT window. This promise-chain
// mutex forces purchase returns to post strictly one after another within
// this server process. Multi-process deployments would additionally need a
// database-level lock (documented technical debt, see Phase 9.3 report).
let purchaseReturnLock: Promise<void> = Promise.resolve();
function withPurchaseReturnLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = purchaseReturnLock;
  let release!: () => void;
  purchaseReturnLock = new Promise<void>((resolve) => { release = resolve; });
  return (async () => {
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  })();
}

// Sum of POSTED return quantities already recorded against one original line.
async function postedReturnQtyForLine(db: { query: (...args: any[]) => Promise<any> }, originalLineId: string): Promise<number> {
  const r = await db.query(`
    SELECT COALESCE(SUM(prl.quantity), 0) as qty
    FROM purchasing.purchase_return_lines prl
    JOIN purchasing.purchase_returns pr ON pr.id = prl.return_id
    WHERE prl.original_line_id = $1 AND pr.status = 'POSTED'
  `, [originalLineId]);
  return parseFloat(r.rows[0]?.qty || '0');
}

/**
 * Deterministic cumulative allocation for partial returns.
 * For an original monetary component A (net, discount or tax) on a line of
 * quantity Q with P already returned, allocating a further R gives:
 *   allocation = round2(A * (P + R) / Q) - round2(A * P / Q)
 * so installments always sum to exactly A at full return (no rounding drift),
 * and the final return can never exceed the recorded original economics.
 */
function allocateCumulative(originalAmount: number, originalQty: number, alreadyReturned: number, returnQty: number): number {
  if (!(originalQty > 0)) return 0;
  return round2((originalAmount * (alreadyReturned + returnQty)) / originalQty)
       - round2((originalAmount * alreadyReturned) / originalQty);
}

apiRouter.post('/purchasing/returns', async (req: Request, res: Response) => {
  return withPurchaseReturnLock(async () => {
  try {
    const actor = await requireDocumentActor(req, res, 'purchasing.returns.manage');
    if (!actor) return;
    const db = await getDb();
    const { SettingsService: PurSettings } = await import('./settingsService.ts');
    const { InventoryService: InvService } = await import('./inventoryService.ts');
    const { supplierId, originalInvoiceId, returnDate, notes, lines } = req.body;

    // ---- 0. Required fields (linked returns only — see note below) ----
    if (!supplierId || !returnDate || !lines || lines.length === 0) {
      return res.status(400).json({ error: 'المورد وتاريخ المردود وبنود المردود مطلوبة' });
    }
    // PHASE 9.3: new returns MUST link to an original invoice. Legacy
    // documents keep original_invoice_id NULL, but an empty link must never
    // become a bypass around quantity validation.
    if (!originalInvoiceId) {
      return res.status(400).json({ error: 'مرتجع المشتريات يتطلب ربطه بفاتورة الشراء الأصلية (originalInvoiceId)' });
    }

    const compRes = await db.query<any>('SELECT id, currency_id FROM core.companies LIMIT 1');
    const companyId = compRes.rows[0]?.id;
    const companyCurrencyId: string | null = compRes.rows[0]?.currency_id || null;

    // ---- 1. Supplier validation ----
    const suppRes = await db.query<any>('SELECT * FROM purchasing.suppliers WHERE id = $1', [supplierId]);
    const supplier = suppRes.rows[0];
    if (!supplier) {
      return res.status(400).json({ error: 'المورد المحدد غير موجود' });
    }
    if (!supplier.is_active) {
      return res.status(400).json({ error: `المورد "${supplier.name}" معطل ولا يمكن تسجيل مرتجعات له` });
    }

    // ---- 2. Original invoice validation (source of truth, not the UI) ----
    const invRes = await db.query<any>('SELECT * FROM purchasing.purchase_invoices WHERE id = $1', [originalInvoiceId]);
    const invoice = invRes.rows[0];
    if (!invoice) {
      return res.status(400).json({ error: 'فاتورة الشراء الأصلية غير موجودة' });
    }
    if (invoice.status !== 'POSTED') {
      return res.status(400).json({ error: `فاتورة الشراء الأصلية غير مرحّلة (الحالة: ${invoice.status}) ولا تقبل المرتجعات` });
    }
    if (invoice.supplier_id !== supplierId) {
      return res.status(400).json({ error: 'المورد المحدد لا يطابق مورد فاتورة الشراء الأصلية' });
    }
    // Single-currency guard: returns carry no currency of their own.
    if (invoice.currency_id && companyCurrencyId && invoice.currency_id !== companyCurrencyId) {
      return res.status(400).json({ error: 'مرتجعات الفواتير بعملة أجنبية غير مدعومة في هذه المرحلة' });
    }

    const invLinesRes = await db.query<any>(`
      SELECT * FROM purchasing.purchase_invoice_lines WHERE invoice_id = $1 ORDER BY line_number ASC
    `, [originalInvoiceId]);
    const invLines: any[] = invRes.rows.length > 0 ? invLinesRes.rows : [];
    if (invLines.length === 0) {
      return res.status(400).json({ error: 'فاتورة الشراء الأصلية بلا بنود قابلة للإرجاع' });
    }

    // ---- 3. Strict return-date period check (no open-period fallback) ----
    // Unlike getPeriodForDate (which falls back to ANY open period), a return
    // dated inside a CLOSED period — or outside all defined periods — is
    // rejected outright instead of being silently attached elsewhere.
    if (typeof returnDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(returnDate) || Number.isNaN(Date.parse(returnDate))) {
      return res.status(400).json({ error: 'تاريخ المردود غير صالح (الصيغة المطلوبة YYYY-MM-DD)' });
    }
    const periodRes = await db.query<any>(`
      SELECT id, name, status FROM accounting.fiscal_periods
      WHERE $1::date BETWEEN start_date AND end_date
      LIMIT 1
    `, [returnDate]);
    if (periodRes.rows.length === 0) {
      return res.status(400).json({ error: `تاريخ المردود (${returnDate}) خارج الفترات المحاسبية المعرفة — الترحيل مرفوض` });
    }
    if (periodRes.rows[0].status !== 'OPEN') {
      return res.status(400).json({ error: `الفترة المالية "${periodRes.rows[0].name}" مغلقة — لا يمكن ترحيل المردود بتاريخ (${returnDate})` });
    }

    // ---- 4. Line matching + quantity limits (pre-write validation) ----
    // HOTFIX: shared deterministic default, matching purchase receipts and sales issues.
    const defaultWhId = await (await import('./inventoryService.ts')).InventoryService.getDefaultActiveWarehouse();

    interface ResolvedLine {
      originalLine: any;
      returnQty: number;
      isStock: boolean;
      warehouseId: string | null;
      itemId: string | null;
    }
    const resolved: ResolvedLine[] = [];
    const requestedPerLine = new Map<string, number>();

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const qty = Number(l.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: `كمية البند رقم ${i + 1} يجب أن تكون موجبة` });
      }

      // 4a. Match the return line to its original invoice line.
      let orig: any = null;
      if (l.originalLineId) {
        const m = await db.query<any>(`
          SELECT * FROM purchasing.purchase_invoice_lines WHERE id = $1 AND invoice_id = $2
        `, [l.originalLineId, originalInvoiceId]);
        if (m.rows.length === 0) {
          return res.status(400).json({ error: `سطر الفاتورة الأصلي المحدد للبند رقم ${i + 1} غير موجود في الفاتورة ${invoice.invoice_number}` });
        }
        orig = m.rows[0];
      } else {
        // Match by item when (and only when) unambiguous.
        const key = l.itemId || l.itemCode;
        if (!key) {
          return res.status(400).json({ error: `البند رقم ${i + 1}: حدد سطر الفاتورة الأصلي (originalLineId) أو صنفًا مطابقًا` });
        }
        const cands = invLines.filter((r: any) =>
          (l.itemId && r.item_id === l.itemId) ||
          (l.itemCode && r.item_code === l.itemCode)
        );
        if (cands.length === 0) {
          return res.status(400).json({ error: `البند رقم ${i + 1}: لا يوجد سطر مطابق في الفاتورة الأصلية` });
        }
        if (cands.length > 1) {
          return res.status(400).json({ error: `البند رقم ${i + 1}: الصنف مكرر في الفاتورة الأصلية — حدد سطر الفاتورة الأصلي (originalLineId) explicitly` });
        }
        orig = cands[0];
      }

      // 4b. Quantity cap: originalQty - previouslyPostedReturns - this request so far.
      const origQty = parseFloat(orig.quantity);
      const alreadyReturned = await postedReturnQtyForLine(db, orig.id);
      const requestedSoFar = requestedPerLine.get(orig.id) || 0;
      const remaining = origQty - alreadyReturned - requestedSoFar;
      if (qty - remaining > 1e-9) {
        return res.status(400).json({
          error: `كمية المردود للبند "${orig.description}" (${qty}) تتجاوز المتبقي القابل للإرجاع (${remaining}) من سطر الفاتورة الأصلية`,
        });
      }
      requestedPerLine.set(orig.id, requestedSoFar + qty);

      // 4c. Stock vs expense classification (original data decides).
      let isStock = false;
      let itemId: string | null = orig.item_id || null;
      if (invoice.posting_type === 'INVENTORY' && itemId) {
        const itemRes = await db.query<any>('SELECT id, is_stock_item FROM inventory.items WHERE id = $1', [itemId]);
        if (itemRes.rows.length > 0 && itemRes.rows[0].is_stock_item) {
          isStock = true;
        }
      }
      let warehouseId: string | null = null;
      if (isStock) {
        warehouseId = orig.warehouse_id || defaultWhId;
        if (!warehouseId) {
          return res.status(400).json({ error: 'لا يوجد مستودع نشط لصرف المرتجع — تم رفض الطلب قبل إنشاء أي مستند' });
        }
      }

      // NOTE (PHASE 9.4): monetary shares (net / discount / tax) are computed
      // inside the transaction from FRESH posted-return sums (see 6c), so no
      // amounts are derived here. Only matching, caps and classification.
      resolved.push({ originalLine: orig, returnQty: qty, isStock, warehouseId, itemId });
    }

    // ---- 5. Central account resolution (no hardcoded business accounts) ----
    let payablesAccountId = supplier?.payables_account_id;
    if (!payablesAccountId) {
      payablesAccountId = await PurSettings.getAccountMapping('purchasing.default_ap_account', '2101', companyId);
    }
    let purchaseReturnAccountId: string;
    try {
      purchaseReturnAccountId = await PurSettings.getAccountMapping('purchasing.default_expense_account', '5402', companyId);
    } catch {
      purchaseReturnAccountId = await PurSettings.getAccountMapping('purchasing.default_expense_account', '54', companyId);
    }
    const inventoryAccountId = await PurSettings.getAccountMapping('inventory.default_inventory_account', '1104', companyId);
    const vatInAccId: string | null = await PurSettings.getAccountMapping('purchasing.default_input_tax_account', '1105', companyId);

    const countRes = await db.query<any>('SELECT COUNT(*) as count FROM purchasing.purchase_returns');
    const returnNumber = `PR-${new Date().getFullYear()}-${String(parseInt(countRes.rows[0]?.count || '0', 10) + 1).padStart(4, '0')}`;

    // ---- 6. ATOMIC COMMIT: re-check + doc + RETURN_OUT + journal + audit ----
    // Write order is deliberate: header first, stock movements second,
    // journal last — so a journal failure rolls back doc+stock (proven by test),
    // and a stock failure rolls back the doc (proven by test).
    // PHASE 9.4 valuation policy: each line's economics are derived from the
    // ORIGINAL invoice line (net after discount, discount, tax) via cumulative
    // round2 allocation; the linked RETURN_OUT is posted under the explicit
    // ORIGINAL_COST policy with that same net value, and the journal credits
    // read back the stored movement — movement == GL by construction.
    const result = await withTransaction(async () => {
      // 6a. Final re-validation inside the transaction (race guard: the
      // in-process mutex above serializes postings; FOR UPDATE re-checks).
      const lockRes = await db.query<any>('SELECT status FROM purchasing.purchase_invoices WHERE id = $1 FOR UPDATE', [originalInvoiceId]);
      if (lockRes.rows.length === 0 || lockRes.rows[0].status !== 'POSTED') {
        throw new Error('فاتورة الشراء الأصلية لم تعد مرحّلة — تم رفض المردود');
      }
      // 6a2. Fresh economics per line (fresh P defeats stale pre-write sums).
      interface LineEconomics { netShare: number; discountShare: number; taxShare: number }
      const economics = new Map<string, LineEconomics>();
      for (const r of resolved) {
        const fresh = await postedReturnQtyForLine(db, r.originalLine.id);
        const origQty = parseFloat(r.originalLine.quantity);
        // NOTE: concurrent same-line quantities inside ONE request were already
        // capped pre-write; the mutex prevents interleaving requests.
        if (r.returnQty - (origQty - fresh) > 1e-9) {
          throw new Error(`تجاوز المتبقي القابل للإرجاع للبند "${r.originalLine.description}" عند التثبيت النهائي`);
        }
        // Original line representation (matches purchasingService.createInvoice):
        //   line_total = qty*unit_price - discount + tax  =>  net excludes discount.
        const origNet = origQty * parseFloat(r.originalLine.unit_price) - parseFloat(r.originalLine.discount || '0');
        const origDiscount = parseFloat(r.originalLine.discount || '0');
        const origTax = parseFloat(r.originalLine.tax || '0');
        economics.set(r.originalLine.id, {
          netShare: allocateCumulative(origNet, origQty, fresh, r.returnQty),
          discountShare: allocateCumulative(origDiscount, origQty, fresh, r.returnQty),
          taxShare: allocateCumulative(origTax, origQty, fresh, r.returnQty),
        });
      }

// 6b. Return header (totals filled after movements are known).
      // PHASE 10.2: branch_id is inherited from the original invoice. It was
      // never written before, so every purchase return sat at NULL and was
      // silently dropped from any branch-scoped AP report while still moving
      // the control account — a return that shows up in the GL but not in the
      // subledger. Persistence only; the journal is untouched.
      const headerRes = await db.query<any>(`
        INSERT INTO purchasing.purchase_returns (company_id, branch_id, return_number, supplier_id, original_invoice_id, return_date, subtotal, tax, total, status, journal_entry_id, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, 'POSTED', NULL, $7, $8)
        RETURNING *
      `, [companyId, invoice.branch_id || null, returnNumber, supplierId, originalInvoiceId, returnDate, notes || null, actor.userId || null]);
      const created = headerRes.rows[0];

      // 6c. One RETURN_OUT movement per returned stock line, valued at the
      // ORIGINAL line net (ORIGINAL_COST policy). Expense lines reuse the
      // same net share without any movement.
      let totalInventoryCredit = 0;
      let totalExpenseCredit = 0;
      let totalVat = 0;
      const movementRefs: Array<{ lineIndex: number; transactionId: string; unitCost: number; totalCost: number }> = [];

      for (let i = 0; i < resolved.length; i++) {
        const r = resolved[i];
        const econ = economics.get(r.originalLine.id)!;
        totalVat += econ.taxShare;
        const movementUnit = r.returnQty > 0 ? econ.netShare / r.returnQty : 0;
        if (r.isStock && r.itemId && r.warehouseId) {
          const tx = await InvService.createStockTransaction({
            transactionType: 'RETURN_OUT',
            transactionDate: returnDate,
            warehouseId: r.warehouseId,
            referenceType: 'PURCHASE_RETURN',
            referenceId: created.id,
            notes: `صرف مرتجع بموجب مردود مشتريات ${returnNumber}`,
            lines: [{ itemId: r.itemId, quantity: r.returnQty, unitCost: movementUnit }],
            valuationPolicy: 'ORIGINAL_COST',
            companyId,
            userId: actor.userId,
          });
          const mv = await db.query<any>(`
            SELECT quantity, unit_cost, total_cost FROM inventory.stock_transaction_lines WHERE transaction_id = $1
          `, [tx.id]);
          const unitCost = parseFloat(mv.rows[0]?.unit_cost || '0');
          const totalCost = parseFloat(mv.rows[0]?.total_cost || '0');
          // Movement value MUST equal the allocated original net (GL match).
          if (Math.abs(totalCost - econ.netShare) > 0.01) {
            throw new Error('فشل التحقق الداخلي: قيمة حركة المخزون لا تطابق صافي سطر الفاتورة الأصلية');
          }
          movementRefs.push({ lineIndex: i, transactionId: tx.id, unitCost, totalCost });
          totalInventoryCredit += totalCost;
          (r as any).movementUnitCost = unitCost;
          (r as any).movementTotal = totalCost;
        } else {
          totalExpenseCredit += econ.netShare;
          (r as any).movementUnitCost = movementUnit;
          (r as any).movementTotal = econ.netShare;
        }
        (r as any).econ = econ;
      }

      // 6d. Persist return lines linked to their original lines (with discount share).
      for (let i = 0; i < resolved.length; i++) {
        const r = resolved[i];
        const econ: LineEconomics = (r as any).econ;
        const lineTotal = (r as any).movementTotal + econ.taxShare;
        await db.query(`
          INSERT INTO purchasing.purchase_return_lines (return_id, item_id, warehouse_id, original_line_id, item_code, description, quantity, unit_price, discount, tax, line_total, line_number)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          created.id,
          r.itemId,
          r.warehouseId,
          r.originalLine.id,
          r.originalLine.item_code || null,
          r.originalLine.description || 'صنف مردود',
          r.returnQty,
          (r as any).movementUnitCost,
          econ.discountShare,
          econ.taxShare,
          lineTotal,
          i + 1,
        ]);
      }

      const subtotal = totalInventoryCredit + totalExpenseCredit;
      const total = subtotal + totalVat;
      await db.query(`
        UPDATE purchasing.purchase_returns SET subtotal = $1, tax = $2, total = $3 WHERE id = $4
      `, [subtotal, totalVat, total, created.id]);

      // 6e. Balanced journal: DR Payables / CR Inventory + CR Purchases + CR Input VAT.
      const jeLines: any[] = [
        {
          accountId: payablesAccountId,
          debit: total,
          credit: 0,
          description: `مدين: ذمم المورد ${supplier?.name || ''} - إشعار مدين ${returnNumber}`,
        },
      ];
      if (totalInventoryCredit > 0) {
        jeLines.push({
          accountId: inventoryAccountId,
          debit: 0,
          credit: totalInventoryCredit,
          description: `دائن: المخزون السلعي (صرف مرتجع) - مردود مشتريات ${returnNumber}`,
        });
      }
      if (totalExpenseCredit > 0) {
        jeLines.push({
          accountId: purchaseReturnAccountId,
          debit: 0,
          credit: totalExpenseCredit,
          description: `دائن: مردودات المشتريات - مردود مشتريات ${returnNumber}`,
        });
      }
      if (totalVat > 0 && vatInAccId) {
        jeLines.push({
          accountId: vatInAccId,
          debit: 0,
          credit: totalVat,
          description: `دائن: عكس ضريبة المدخلات - مردود مشتريات ${returnNumber}`,
        });
      }
      const drSum = jeLines.reduce((s, l) => s + (l.debit || 0), 0);
      const crSum = jeLines.reduce((s, l) => s + (l.credit || 0), 0);
      if (Math.abs(drSum - crSum) > 0.01) {
        throw new Error('فشل التحقق الداخلي: قيد مردود المشتريات غير متوازن');
      }

      // Zero-value return (e.g. fully discounted line, no tax): the stock
      // movement is real but there is no financial effect, so no journal is
      // posted and the document stays linked to the movement only.
      let postedJE: any = null;
      if (total > 0) {
        const je = await AccountingService.createJournalEntry({
          companyId,
          entryDate: returnDate,
          sourceId: 'SYSTEM',
          description: `إثبات مردودات مشتريات رقم ${returnNumber} للمورد ${supplier?.name || ''}`,
          lines: jeLines,
          userId: actor.userId,
        });
        postedJE = await AccountingService.postJournalEntry(je.id, actor.userId);
        await db.query('UPDATE purchasing.purchase_returns SET journal_entry_id = $1 WHERE id = $2', [postedJE.id, created.id]);
      }

      await logAudit({
        userId: actor.userId,
        action: 'POST',
        entityType: 'PURCHASE_RETURN',
        entityId: created.id,
        newData: { returnNumber, originalInvoiceId, journalEntryId: postedJE?.id || null, total, movements: movementRefs.length },
      });

      return { created, postedJE, movementRefs };
    });

    res.status(201).json({
      success: true,
      message: result.postedJE
        ? 'تم تسجيل وترحيل مردود المشتريات وتحديث حساب المورد والمخزون والقيد المحاسبي'
        : 'تم تسجيل مردود المشتريات وتحديث المخزون (مرتجع صفري القيمة بلا أثر مالي، لا قيد محاسبي)',
      purchaseReturn: result.created,
      journalEntryId: result.postedJE?.id || null,
      stockMovements: result.movementRefs.length,
    });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
  });
});

// ==========================================
// 18. Settings (Users, Roles & Branches)
// ==========================================
async function requireActualSuperAdmin(req: Request, res: Response): Promise<string | null> {
  const actor = res.locals.authenticatedActor as AuthenticatedActor | undefined;
  if (!actor) return null;
  const db = await getDb();
  const result = await db.query(
    `SELECT 1
       FROM security.user_roles ur
       JOIN security.roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1 AND r.name = 'SUPER_ADMIN'
      LIMIT 1`,
    [actor.userId]
  );
  if (result.rows.length === 0) {
    res.status(403).json({ error: 'إدارة نطاقات الوصول متاحة لمدير النظام المعتمد فقط.' });
    return null;
  }
  return actor.userId;
}

apiRouter.get('/settings/access-scope-catalog', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const result = await db.query(
      'SELECT company_id, company_name, branch_id, branch_name, branch_active FROM security.list_access_scope_catalog()'
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'تعذر تحميل قائمة الشركات والفروع.' });
  }
});

apiRouter.get('/settings/users/:id/access-scopes', async (req: Request, res: Response) => {
  try {
    if (!(await requireActualSuperAdmin(req, res))) return;
    const db = await getDb();
    const userResult = await db.query('SELECT id FROM security.users WHERE id = $1', [req.params.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'المستخدم غير موجود.' });
    const scopes = await db.query(
      'SELECT company_id, company_name, branch_id, branch_name, scope_type FROM security.list_user_access_scopes($1)',
      [req.params.id]
    );
    res.json(scopes.rows);
  } catch {
    res.status(500).json({ error: 'تعذر تحميل نطاقات وصول المستخدم.' });
  }
});

apiRouter.put('/settings/users/:id/access-scopes', async (req: Request, res: Response) => {
  try {
    const actorId = await requireActualSuperAdmin(req, res);
    if (!actorId) return;
    const db = await getDb();
    const userId = req.params.id;
    const userResult = await db.query('SELECT id FROM security.users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'المستخدم غير موجود.' });

    const companyIds = req.body?.companyIds;
    const branches = req.body?.branches;
    if (!Array.isArray(companyIds) || !Array.isArray(branches)) {
      return res.status(400).json({ error: 'قوائم الشركات والفروع مطلوبة.' });
    }
    if (!companyIds.every((id: unknown) => typeof id === 'string') ||
        !branches.every((entry: any) =>
          entry && typeof entry.companyId === 'string' && typeof entry.branchId === 'string')) {
      return res.status(400).json({ error: 'صيغة نطاقات الشركات والفروع غير صحيحة.' });
    }

    const uniqueCompanyIds = [...new Set(companyIds as string[])];
    const uniqueBranches = [
      ...new Map((branches as Array<{ companyId: string; branchId: string }>).map((branch) => [
        `${branch.companyId}:${branch.branchId}`,
        branch,
      ])).values(),
    ];

    // PHASE RLS-1 — منع فقدان نطاق الشركة.
    //
    // قراءة الصفوف الجماعية (دليل الحسابات، العملاء، بيانات الشركة...) مرتبطة
    // بجدول user_company_scopes وحده عبر سياسات RLS. إسناد فرع دون شركته كان
    // يُنتج جلسة صالحة تُعيد 200 لكن بمصفوفات فارغة في كل مكان، لأن الدالة
    // security.user_can_access_company() لا تنظر إلى نطاق الفروع إطلاقاً.
    // الفرع يقع داخل شركته، لذا تُضمَّن شركة كل فرع مُسند إلى النطاق دائماً.
    for (const branch of uniqueBranches) {
      if (!uniqueCompanyIds.includes(branch.companyId)) uniqueCompanyIds.push(branch.companyId);
    }
    const companies = await db.query<{ company_id: string }>(
      'SELECT company_id FROM security.list_company_access_catalog()'
    );
    const validCompanyIds = new Set(companies.rows.map((company) => company.company_id));
    if (uniqueCompanyIds.some((id) => !validCompanyIds.has(id))) {
      return res.status(400).json({ error: 'تتضمن القائمة شركة غير موجودة.' });
    }

    const catalog = await db.query<{ company_id: string; branch_id: string; branch_active: boolean }>(
      'SELECT company_id, branch_id, branch_active FROM security.list_access_scope_catalog() WHERE branch_id IS NOT NULL'
    );
    const branchCatalog = new Map(catalog.rows.map((branch) => [
      `${branch.company_id}:${branch.branch_id}`,
      branch,
    ]));
    if (uniqueBranches.some((branch) => {
      const catalogBranch = branchCatalog.get(`${branch.companyId}:${branch.branchId}`);
      return !catalogBranch || !catalogBranch.branch_active;
    })) {
      return res.status(400).json({ error: 'كل فرع مسند يجب أن يكون نشطًا وتابعًا للشركة المحددة.' });
    }

    await withTransaction(async () => {
      await db.query('DELETE FROM security.user_branch_scopes WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM security.user_company_scopes WHERE user_id = $1', [userId]);
      for (const companyId of uniqueCompanyIds) {
        await db.query(
          'INSERT INTO security.user_company_scopes (user_id, company_id, granted_by) VALUES ($1, $2, $3)',
          [userId, companyId, actorId]
        );
      }
      for (const branch of uniqueBranches) {
        await db.query(
          `INSERT INTO security.user_branch_scopes (user_id, company_id, branch_id, granted_by)
           VALUES ($1, $2, $3, $4)`,
          [userId, branch.companyId, branch.branchId, actorId]
        );
      }
    });

    const scopes = await db.query(
      'SELECT company_id, company_name, branch_id, branch_name, scope_type FROM security.list_user_access_scopes($1)',
      [userId]
    );
    await logAudit({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'USER_ACCESS_SCOPES',
      entityId: userId,
      newData: { companyCount: uniqueCompanyIds.length, branchCount: uniqueBranches.length },
    });
    res.json({ success: true, scopes: scopes.rows });
  } catch {
    res.status(500).json({ error: 'تعذر حفظ نطاقات الوصول.' });
  }
});

apiRouter.get('/settings/users', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const usersRes = await db.query<any>(`
      SELECT
        u.id,
        u.username,
        u.full_name as "fullName",
        u.email,
        u.is_active as "isActive",
        u.last_login_at as "lastLoginAt",
        u.created_at as "createdAt",
        COALESCE(r.name, 'بدون دور') as "roleName",
        r.id as "roleId",
        COALESCE(
          (SELECT ARRAY_AGG(ur2.role_id) FROM security.user_roles ur2 WHERE ur2.user_id = u.id),
          '{}'
        ) as "roleIds"
      FROM security.users u
      LEFT JOIN security.user_roles ur ON ur.user_id = u.id
      LEFT JOIN security.roles r ON r.id = ur.role_id
      ORDER BY u.created_at ASC
    `);
    const rolesRes = await db.query<any>('SELECT * FROM security.roles ORDER BY name ASC');
    res.json({
      users: usersRes.rows,
      roles: rolesRes.rows,
    });
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

/**
 * Users Management — full lifecycle for security accounts.
 *
 * The application previously exposed NO screen or API to create a user or
 * reset a password (see V22__admin_password_recovery.sql). These three
 * endpoints complete the Users Management screen:
 *   POST   /settings/users                  create account + assign role
 *   PUT    /settings/users/:id              edit profile / role / active flag
 *   POST   /settings/users/:id/reset-password   admin password reset
 *
 * All writes require the signed session token AND the
 * `settings.users.manage` permission (see requireUsersManagePermission),
 * and every mutation is audit-logged. The last active SUPER_ADMIN can never
 * be deactivated or lose the role, and an operator can never deactivate
 * their own account.
 */
const USER_ROW_SQL = `
  SELECT
    u.id,
    u.username,
    u.full_name as "fullName",
    u.email,
    u.is_active as "isActive",
    u.last_login_at as "lastLoginAt",
    u.created_at as "createdAt",
    COALESCE(r.name, 'بدون دور') as "roleName",
    r.id as "roleId"
  FROM security.users u
  LEFT JOIN security.user_roles ur ON ur.user_id = u.id
  LEFT JOIN security.roles r ON r.id = ur.role_id
  WHERE u.id = $1
`;

apiRouter.post('/settings/users', async (req: Request, res: Response) => {
  try {
    const actorId = await requireUsersManagePermission(req, res);
    if (!actorId) return;
    const db = await getDb();
    const { username, fullName, email, password, roleId, isActive } = req.body || {};

    const cleanUsername = String(username || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(fullName || '').trim();
    if (!cleanUsername) return res.status(400).json({ error: 'اسم المستخدم مطلوب' });
    if (!cleanName) return res.status(400).json({ error: 'الاسم الكامل مطلوب' });
    if (!cleanEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'كلمة المرور مطلوبة (6 أحرف على الأقل)' });
    }
    if (roleId) {
      const roleRes = await db.query<any>('SELECT id FROM security.roles WHERE id = $1', [roleId]);
      if (roleRes.rows.length === 0) return res.status(400).json({ error: 'الدور المحدد غير موجود' });
    }
    const dupRes = await db.query<any>(
      'SELECT id FROM security.users WHERE username = $1 OR email = $2',
      [cleanUsername, cleanEmail]
    );
    if (dupRes.rows.length > 0) {
      return res.status(400).json({ error: 'اسم المستخدم أو البريد الإلكتروني مستخدم من قبل' });
    }

    const hash = await bcrypt.hash(String(password), 10);
    const insRes = await db.query<any>(
      `INSERT INTO security.users (username, password_hash, full_name, email, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [cleanUsername, hash, cleanName, cleanEmail, isActive === false ? false : true]
    );
    const newId = insRes.rows[0].id;
    if (roleId) {
      await db.query('INSERT INTO security.user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [newId, roleId]);
    }
    await logAudit({
      userId: actorId,
      action: 'CREATE',
      entityType: 'USER',
      entityId: newId,
      newData: { username: cleanUsername, email: cleanEmail, roleId: roleId || null },
    });

    const row = (await db.query<any>(USER_ROW_SQL, [newId])).rows[0];
    res.status(201).json({ success: true, message: 'تم إنشاء حساب المستخدم بنجاح', user: row });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.put('/settings/users/:id', async (req: Request, res: Response) => {
  try {
    const actorId = await requireUsersManagePermission(req, res);
    if (!actorId) return;
    const db = await getDb();
    const targetId = req.params.id;
    const { fullName, email, roleId, isActive } = req.body || {};

    const curRes = await db.query<any>('SELECT * FROM security.users WHERE id = $1', [targetId]);
    if (curRes.rows.length === 0) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const current: any = curRes.rows[0];

    const cleanName = fullName !== undefined ? String(fullName || '').trim() : current.full_name;
    const cleanEmail = email !== undefined ? String(email || '').trim().toLowerCase() : current.email;
    if (!cleanName) return res.status(400).json({ error: 'الاسم الكامل مطلوب' });
    if (!cleanEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    }
    const emailDup = await db.query<any>(
      'SELECT id FROM security.users WHERE email = $1 AND id <> $2',
      [cleanEmail, targetId]
    );
    if (emailDup.rows.length > 0) {
      return res.status(400).json({ error: 'البريد الإلكتروني مستخدم من قبل مستخدم آخر' });
    }

    const nextActive = isActive === undefined ? current.is_active : !!isActive;
    const nextRoleId = roleId === undefined ? undefined : (roleId || null);
    if (nextRoleId) {
      const roleRes = await db.query<any>('SELECT id FROM security.roles WHERE id = $1', [nextRoleId]);
      if (roleRes.rows.length === 0) return res.status(400).json({ error: 'الدور المحدد غير موجود' });
    }

    // Safety: an operator can never deactivate their own account.
    if (targetId === actorId && nextActive === false) {
      return res.status(400).json({ error: 'لا يمكنك تعطيل حسابك الخاص أثناء تسجيل الدخول به' });
    }
    // Safety: the last active SUPER_ADMIN can never be deactivated or un-roled.
    const isSuperAdmin = (await db.query<any>(
      `SELECT 1 FROM security.user_roles ur
        JOIN security.roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 AND r.name = 'SUPER_ADMIN' LIMIT 1`,
      [targetId]
    )).rows.length > 0;
    if (isSuperAdmin && (nextActive === false || nextRoleId === null)) {
      const othersRes = await db.query<any>(
        `SELECT COUNT(DISTINCT ur.user_id)::int AS c
           FROM security.user_roles ur
           JOIN security.roles r ON r.id = ur.role_id
           JOIN security.users u ON u.id = ur.user_id
          WHERE r.name = 'SUPER_ADMIN' AND u.is_active = TRUE AND ur.user_id <> $1`,
        [targetId]
      );
      if (parseInt(othersRes.rows[0]?.c || '0', 10) === 0) {
        return res.status(400).json({ error: 'لا يمكن تعطيل أو سحب دور آخر مدير نظام نشط — سيُقفل النظام بالكامل' });
      }
    }

    await db.query(
      'UPDATE security.users SET full_name = $1, email = $2, is_active = $3, updated_at = NOW() WHERE id = $4',
      [cleanName, cleanEmail, nextActive, targetId]
    );
    if (nextRoleId !== undefined) {
      await db.query('DELETE FROM security.user_roles WHERE user_id = $1', [targetId]);
      if (nextRoleId) {
        await db.query('INSERT INTO security.user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [targetId, nextRoleId]);
      }
    }
    await logAudit({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'USER',
      entityId: targetId,
      oldData: { full_name: current.full_name, email: current.email, is_active: current.is_active },
      newData: { full_name: cleanName, email: cleanEmail, is_active: nextActive, roleId: nextRoleId === undefined ? '(unchanged)' : nextRoleId },
    });

    const row = (await db.query<any>(USER_ROW_SQL, [targetId])).rows[0];
    res.json({ success: true, message: 'تم حفظ بيانات المستخدم بنجاح', user: row });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.post('/settings/users/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const actorId = await requireUsersManagePermission(req, res);
    if (!actorId) return;
    const db = await getDb();
    const targetId = req.params.id;
    const { newPassword } = req.body || {};

    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة مطلوبة (6 أحرف على الأقل)' });
    }
    const curRes = await db.query<any>('SELECT id, username FROM security.users WHERE id = $1', [targetId]);
    if (curRes.rows.length === 0) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const hash = await bcrypt.hash(String(newPassword), 10);
    await db.query('UPDATE security.users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, targetId]);
    await logAudit({
      userId: actorId,
      action: 'RESET_PASSWORD',
      entityType: 'USER',
      entityId: targetId,
      newData: { username: curRes.rows[0].username },
    });
    res.json({ success: true, message: `تمت إعادة تعيين كلمة المرور للمستخدم (${curRes.rows[0].username})` });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

/**
 * Roles Management — the Roles screen needs real lifecycle endpoints, not a
 * read-only list: create, rename/describe, delete, and the permission matrix
 * assignment. All writes share the `settings.users.manage` guard with user
 * management (roles ARE user administration), and every mutation is
 * audit-logged. Hard rules:
 *   - the SUPER_ADMIN role can never be renamed or deleted (code references
 *     it by name for last-admin protection and permission seeding);
 *   - a role with assigned users can never be deleted (reassign first);
 *   - permission ids are validated against security.permissions.
 */
const ROLE_ROW_SQL = `
  SELECT
    r.id,
    r.name,
    r.description,
    (SELECT COUNT(DISTINCT ur.user_id) FROM security.user_roles ur WHERE ur.role_id = r.id) AS "usersCount",
    (SELECT COUNT(*) FROM security.role_permissions rp WHERE rp.role_id = r.id) AS "permissionsCount",
    COALESCE(
      (SELECT ARRAY_AGG(rp2.permission_id) FROM security.role_permissions rp2 WHERE rp2.role_id = r.id),
      '{}'
    ) AS "permissionIds"
  FROM security.roles r
  WHERE r.id = $1
`;

apiRouter.post('/settings/roles', async (req: Request, res: Response) => {
  try {
    const actorId = await requireUsersManagePermission(req, res);
    if (!actorId) return;
    const db = await getDb();
    const { name, description } = req.body || {};

    const cleanName = String(name || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (!cleanName) return res.status(400).json({ error: 'اسم الدور مطلوب (أحرف إنجليزية بدون مسافات)' });
    if (!/^[A-Z0-9_]+$/.test(cleanName)) {
      return res.status(400).json({ error: 'اسم الدور يقبل الأحرف الإنجليزية الكبيرة والأرقام والشرطة السفلية فقط' });
    }
    const dupRes = await db.query<any>('SELECT id FROM security.roles WHERE UPPER(name) = $1', [cleanName]);
    if (dupRes.rows.length > 0) return res.status(400).json({ error: 'يوجد دور بهذا الاسم مسبقاً' });

    const insRes = await db.query<any>(
      'INSERT INTO security.roles (name, description) VALUES ($1, $2) RETURNING id',
      [cleanName, String(description || '').trim() || null]
    );
    await logAudit({
      userId: actorId,
      action: 'CREATE',
      entityType: 'ROLE',
      entityId: insRes.rows[0].id,
      newData: { name: cleanName },
    });
    const row = (await db.query<any>(ROLE_ROW_SQL, [insRes.rows[0].id])).rows[0];
    res.status(201).json({ success: true, message: `تم إنشاء الدور (${cleanName}) بنجاح`, role: row });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.put('/settings/roles/:id', async (req: Request, res: Response) => {
  try {
    const actorId = await requireUsersManagePermission(req, res);
    if (!actorId) return;
    const db = await getDb();
    const targetId = req.params.id;
    const { name, description } = req.body || {};

    const curRes = await db.query<any>('SELECT * FROM security.roles WHERE id = $1', [targetId]);
    if (curRes.rows.length === 0) return res.status(404).json({ error: 'الدور غير موجود' });
    const current: any = curRes.rows[0];

    let nextName = current.name;
    if (name !== undefined) {
      const cleanName = String(name || '').trim().toUpperCase().replace(/\s+/g, '_');
      if (!cleanName) return res.status(400).json({ error: 'اسم الدور مطلوب' });
      if (!/^[A-Z0-9_]+$/.test(cleanName)) {
        return res.status(400).json({ error: 'اسم الدور يقبل الأحرف الإنجليزية الكبيرة والأرقام والشرطة السفلية فقط' });
      }
      if (current.name === 'SUPER_ADMIN' && cleanName !== 'SUPER_ADMIN') {
        return res.status(400).json({ error: 'لا يمكن تغيير اسم دور مدير النظام (SUPER_ADMIN) — تعتمد عليه حماية النظام' });
      }
      if (cleanName !== current.name) {
        const dupRes = await db.query<any>('SELECT id FROM security.roles WHERE UPPER(name) = $1 AND id <> $2', [cleanName, targetId]);
        if (dupRes.rows.length > 0) return res.status(400).json({ error: 'يوجد دور بهذا الاسم مسبقاً' });
      }
      nextName = cleanName;
    }
    const nextDesc = description !== undefined ? (String(description || '').trim() || null) : current.description;

    await db.query('UPDATE security.roles SET name = $1, description = $2, updated_at = NOW() WHERE id = $3', [nextName, nextDesc, targetId]);
    await logAudit({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'ROLE',
      entityId: targetId,
      oldData: { name: current.name, description: current.description },
      newData: { name: nextName, description: nextDesc },
    });
    const row = (await db.query<any>(ROLE_ROW_SQL, [targetId])).rows[0];
    res.json({ success: true, message: 'تم حفظ بيانات الدور بنجاح', role: row });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.delete('/settings/roles/:id', async (req: Request, res: Response) => {
  try {
    const actorId = await requireUsersManagePermission(req, res);
    if (!actorId) return;
    const db = await getDb();
    const targetId = req.params.id;

    const curRes = await db.query<any>('SELECT * FROM security.roles WHERE id = $1', [targetId]);
    if (curRes.rows.length === 0) return res.status(404).json({ error: 'الدور غير موجود' });
    if (curRes.rows[0].name === 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'لا يمكن حذف دور مدير النظام (SUPER_ADMIN)' });
    }
    const usersRes = await db.query<any>(
      'SELECT COUNT(DISTINCT user_id)::int AS c FROM security.user_roles WHERE role_id = $1',
      [targetId]
    );
    const linkedUsers = parseInt(usersRes.rows[0]?.c || '0', 10);
    if (linkedUsers > 0) {
      return res.status(400).json({ error: `لا يمكن حذف الدور — ما زال مسنداً إلى ${linkedUsers} مستخدم. أعد إسنادهم أولاً` });
    }

    await db.query('DELETE FROM security.role_permissions WHERE role_id = $1', [targetId]);
    await db.query('DELETE FROM security.roles WHERE id = $1', [targetId]);
    await logAudit({
      userId: actorId,
      action: 'DELETE',
      entityType: 'ROLE',
      entityId: targetId,
      oldData: { name: curRes.rows[0].name },
    });
    res.json({ success: true, message: `تم حذف الدور (${curRes.rows[0].name})` });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.put('/settings/roles/:id/permissions', async (req: Request, res: Response) => {
  try {
    const actorId = await requireUsersManagePermission(req, res);
    if (!actorId) return;
    const db = await getDb();
    const targetId = req.params.id;
    const { permissionIds } = req.body || {};

    const curRes = await db.query<any>('SELECT * FROM security.roles WHERE id = $1', [targetId]);
    if (curRes.rows.length === 0) return res.status(404).json({ error: 'الدور غير موجود' });
    if (!Array.isArray(permissionIds)) return res.status(400).json({ error: 'قائمة الصلاحيات مطلوبة' });
    const uniqueIds = [...new Set(permissionIds.filter((x: any) => typeof x === 'string' && x))];
    if (uniqueIds.length > 0) {
      const checkRes = await db.query<any>(
        `SELECT COUNT(*)::int AS c FROM security.permissions WHERE id = ANY($1)`,
        [uniqueIds]
      );
      if (parseInt(checkRes.rows[0]?.c || '0', 10) !== uniqueIds.length) {
        return res.status(400).json({ error: 'تتضمن القائمة صلاحية غير موجودة' });
      }
    }

    await db.query('DELETE FROM security.role_permissions WHERE role_id = $1', [targetId]);
    for (const pid of uniqueIds) {
      await db.query('INSERT INTO security.role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [targetId, pid]);
    }
    await logAudit({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'ROLE_PERMISSIONS',
      entityId: targetId,
      newData: { role: curRes.rows[0].name, permissionsCount: uniqueIds.length },
    });
    const row = (await db.query<any>(ROLE_ROW_SQL, [targetId])).rows[0];
    res.json({ success: true, message: `تم حفظ مصفوفة صلاحيات الدور (${curRes.rows[0].name}) — ${uniqueIds.length} صلاحية`, role: row });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.get('/settings/roles', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const result = await db.query<any>(`
      SELECT
        r.id,
        r.name,
        r.description,
        COUNT(DISTINCT ur.user_id) AS "usersCount",
        COUNT(DISTINCT rp.permission_id) AS "permissionsCount",
        COALESCE(
          (SELECT ARRAY_AGG(rp2.permission_id) FROM security.role_permissions rp2 WHERE rp2.role_id = r.id),
          '{}'
        ) AS "permissionIds"
      FROM security.roles r
      LEFT JOIN security.user_roles ur ON ur.role_id = r.id
      LEFT JOIN security.role_permissions rp ON rp.role_id = r.id
      GROUP BY r.id, r.name, r.description
      ORDER BY r.name ASC
    `);
    res.json(result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      usersCount: Number(r.usersCount),
      permissionsCount: Number(r.permissionsCount),
      permissionIds: r.permissionIds || [],
    })));
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get('/settings/permissions', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const result = await db.query<any>(`
      SELECT id, code, name, module, description
      FROM security.permissions
      ORDER BY module ASC, code ASC
    `);
    res.json(result.rows.map((p: any) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      module: p.module,
      action: p.code.includes(':') ? p.code.split(':')[1] : p.code,
      description: p.description || p.name,
    })));
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.get(['/settings/branches', '/core/branches'], async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const companyRes = await db.query<any>('SELECT * FROM core.companies LIMIT 1');
    const branchesRes = await db.query<any>('SELECT * FROM core.branches ORDER BY created_at ASC');
    // If request explicitly came to /core/branches, return array for core endpoints compatibility
    if (_req.originalUrl.includes('/core/branches')) {
      return res.json(branchesRes.rows);
    }
    res.json({
      company: companyRes.rows[0] || null,
      branches: branchesRes.rows,
    });
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// PHASE 10.6.2 — Branch management writes.
//
// The branches screen used to answer a bare read only: the "add branch"
// button and the table's edit action persisted nothing. These endpoints
// implement create + edit with the V26 row-scope semantics: caller identity
// is taken from the signed session (never from the body), the required
// permission is settings.branches.manage, and every write lands inside the
// caller's authorized company scope (res.locals.accessScope, populated by
// apiSecurityMiddleware). The row-level policy lets COMPANY-scoped sessions
// manage all their company's branches (V27) while BRANCH-scoped sessions stay
// limited to their own active branch. Duplicate branch codes per company are
// rejected before touching the database.

type RequestAccessScope = { companyId: string; branchId: string | null } | null;

function getRequestAccessScope(res: Response): RequestAccessScope {
  return (res.locals as { accessScope?: RequestAccessScope }).accessScope || null;
}

async function requireBranchManagePermission(req: Request, res: Response): Promise<string | null> {
  return requireSettingPermission(req, res, 'settings.branches.manage');
}

apiRouter.post('/settings/branches', async (req: Request, res: Response) => {
  try {
    const actorId = await requireBranchManagePermission(req, res);
    if (!actorId) return;
    const db = await getDb();

    let companyId = getRequestAccessScope(res)?.companyId || '';
    if (!companyId) {
      const catalogRes = await db.query<{ company_id: string }>(
        'SELECT company_id FROM security.list_company_access_catalog()'
      );
      companyId = catalogRes.rows[0]?.company_id || '';
    }
    if (!companyId) {
      return res.status(400).json({ error: 'لا توجد شركة مرتبطة بالجلسة لربط الفرع بها.' });
    }

    const code = String(req.body?.code ?? '').trim();
    const name = String(req.body?.name ?? '').trim();
    const address = String(req.body?.address ?? '').trim();
    if (!code || !name) {
      return res.status(400).json({ error: 'كود الفرع واسم الفرع مطلوبان.' });
    }
    if (code.length > 50) {
      return res.status(400).json({ error: 'كود الفرع يجب ألا يتجاوز 50 حرفًا.' });
    }
    if (name.length > 255) {
      return res.status(400).json({ error: 'اسم الفرع يجب ألا يتجاوز 255 حرفًا.' });
    }

    const dupRes = await db.query(
      'SELECT 1 FROM core.branches WHERE company_id = $1 AND code = $2 LIMIT 1',
      [companyId, code]
    );
    if (dupRes.rows.length > 0) {
      return res.status(409).json({ error: 'كود الفرع مستخدم بالفعل لهذه الشركة. اختر كودًا آخر.' });
    }

    const insertedRes = await db.query<any>(
      `INSERT INTO core.branches (company_id, code, name, address)
       VALUES ($1, $2, $3, $4)
       RETURNING id, company_id, code, name, address, is_active, created_at`,
      [companyId, code, name, address || null]
    );
    await logAudit({
      userId: actorId,
      action: 'CREATE',
      entityType: 'BRANCH',
      entityId: insertedRes.rows[0]?.id,
      newData: { companyId, code, name },
    });
    res.status(201).json({ success: true, branch: insertedRes.rows[0] });
  } catch (error: any) {
    sendRouteError(res, 500, error, 'تعذر إنشاء الفرع.');
  }
});

apiRouter.put('/settings/branches/:id', async (req: Request, res: Response) => {
  try {
    const actorId = await requireBranchManagePermission(req, res);
    if (!actorId) return;
    const db = await getDb();

    const branchId = String(req.params.id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId)) {
      return res.status(400).json({ error: 'معرّف الفرع غير صالح.' });
    }

    const existingRes = await db.query<any>(
      'SELECT id, company_id, code, name, address, is_active FROM core.branches WHERE id = $1 LIMIT 1',
      [branchId]
    );
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'الفرع غير موجود أو غير مصرح به لنطاقك.' });
    }
    const branch = existingRes.rows[0];

    const body = (req.body || {}) as Record<string, unknown>;
    const nextCode = body.code !== undefined ? String(body.code).trim() : branch.code;
    const nextName = body.name !== undefined ? String(body.name).trim() : branch.name;
    const nextAddress = body.address !== undefined ? (String(body.address).trim() || null) : branch.address;
    const nextIsActive = body.isActive !== undefined ? Boolean(body.isActive) : branch.is_active;

    if (!nextCode || !nextName) {
      return res.status(400).json({ error: 'كود الفرع واسم الفرع مطلوبان.' });
    }
    if (nextCode.length > 50) {
      return res.status(400).json({ error: 'كود الفرع يجب ألا يتجاوز 50 حرفًا.' });
    }
    if (nextName.length > 255) {
      return res.status(400).json({ error: 'اسم الفرع يجب ألا يتجاوز 255 حرفًا.' });
    }
    if (nextCode !== branch.code) {
      const dupRes = await db.query(
        'SELECT 1 FROM core.branches WHERE company_id = $1 AND code = $2 AND id <> $3 LIMIT 1',
        [branch.company_id, nextCode, branchId]
      );
      if (dupRes.rows.length > 0) {
        return res.status(409).json({ error: 'كود الفرع مستخدم بالفعل لهذه الشركة. اختر كودًا آخر.' });
      }
    }

    const updatedRes = await db.query<any>(
      `UPDATE core.branches
          SET code = $1, name = $2, address = $3, is_active = $4, updated_at = NOW()
        WHERE id = $5
        RETURNING id, company_id, code, name, address, is_active, updated_at`,
      [nextCode, nextName, nextAddress, nextIsActive, branchId]
    );
    await logAudit({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'BRANCH',
      entityId: branchId,
      oldData: { code: branch.code, name: branch.name, address: branch.address, isActive: branch.is_active },
      newData: { code: nextCode, name: nextName, address: nextAddress, isActive: nextIsActive },
    });
    res.json({ success: true, branch: updatedRes.rows[0] });
  } catch (error: any) {
    sendRouteError(res, 500, error, 'تعذر تحديث الفرع.');
  }
});

// ==========================================
// 18b. Company Identity, Bilingual Profile & Logo (PHASE 10.0)
// ==========================================

/**
 * Shared RBAC core for the settings write endpoints.
 *
 * Reuses the project's existing RBAC tables (security.users ->
 * security.user_roles -> security.roles -> security.role_permissions ->
 * security.permissions) instead of inventing a parallel permission model.
 *
 * IDENTITY IS PROVEN BY A SIGNED TOKEN, NOT BY A CLIENT CLAIM.
 * The previous version accepted `x-user-id` / `req.body.userId`. Both come from
 * the browser, so any caller could post an administrator's UUID and inherit
 * that account's permissions. Those inputs are now IGNORED COMPLETELY — a
 * request that presents only a body/header userId is treated as anonymous.
 *
 * The token is verified for signature and expiry first, then the user is
 * re-loaded from the database (so a deactivated or deleted user cannot act on
 * an old token), then the RBAC permission is checked. All three must pass.
 */
async function requireSettingPermission(req: Request, res: Response, permissionCode: string): Promise<string | null> {
  const db = await getDb();
  const { verifySessionToken, extractBearerToken } = await import('./sessionTokens.ts');

  const token = extractBearerToken(req.header('authorization'));
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({
      error: 'انتهت الجلسة أو لم يتم تسجيل الدخول. سجّل الدخول من شاشة الإعدادات للمتابعة.',
    });
    return null;
  }

  // Re-read the user: an old token must not outlive deactivation/deletion.
  const userRes = await db.query<any>(
    'SELECT id, username FROM security.users WHERE id = $1 AND is_active = TRUE',
    [payload.sub]
  );
  if (userRes.rows.length === 0) {
    res.status(401).json({ error: 'المستخدم الحالي غير موجود أو معطل' });
    return null;
  }

  const permRes = await db.query<any>(
    `SELECT 1
       FROM security.user_roles ur
       JOIN security.role_permissions rp ON rp.role_id = ur.role_id
       JOIN security.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1 AND p.code = $2
      LIMIT 1`,
    [payload.sub, permissionCode]
  );
  if (permRes.rows.length === 0) {
    res.status(403).json({ error: `ليس لديك صلاحية تنفيذ هذا الإجراء (${permissionCode})` });
    return null;
  }

  return userRes.rows[0].id;
}

async function requireCompanyManagePermission(req: Request, res: Response): Promise<string | null> {
  return requireSettingPermission(req, res, 'settings.company.manage');
}

/**
 * Guard for every user-management WRITE endpoint. The permission itself is
 * seeded by V23 (granted to SUPER_ADMIN); without it, user creation,
 * role assignment and password resets are rejected before any write.
 */
async function requireUsersManagePermission(req: Request, res: Response): Promise<string | null> {
  return requireSettingPermission(req, res, 'settings.users.manage');
}

/**
 * PHASE 10.5.2 — key-level authorization for core.settings writes.
 *
 * core.settings mixes two very different kinds of keys:
 *   * personal display preferences (ui.*) — any ACTIVE, signed-in user may
 *     tune their own workstation feel (theme, density, formats...);
 *   * administrative settings — everything else (accounting rules, sales/
 *     inventory switches, report currency...): these change business behaviour
 *     and require the `system.settings.manage` permission.
 *
 * Unknown keys default to the PROTECTED side (deny by default), so a key
 * added by a future migration can never silently become world-writable.
 * Identity is taken ONLY from the signed session token — req.body.userId /
 * username / branchId / companyId are client-forgeable and now ignored.
 */
const PERSONAL_SETTING_KEYS: ReadonlySet<string> = new Set([
  'ui.theme',
  'ui.density',
  'ui.language',
  'ui.direction',
  'ui.date_format',
  'ui.thousands_separator',
  'ui.decimal_separator',
  'ui.lookup_debounce_ms',
  'ui.notify_save_success',
]);

interface SettingWriteActor {
  userId: string;
  username: string;
}

function isPersonalSettingKey(key: string): boolean {
  return PERSONAL_SETTING_KEYS.has(key);
}

async function hasSettingPermission(db: any, userId: string, permissionCode: string): Promise<boolean> {
  const permRes = await db.query(
    `SELECT 1
       FROM security.user_roles ur
       JOIN security.role_permissions rp ON rp.role_id = ur.role_id
       JOIN security.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1 AND p.code = $2
      LIMIT 1`,
    [userId, permissionCode]
  );
  return permRes.rows.length > 0;
}

/** Session-only gate for settings writes: valid signed token + live active user. */
async function requireSettingSession(req: Request, res: Response): Promise<SettingWriteActor | null> {
  const db = await getDb();
  const { verifySessionToken, extractBearerToken } = await import('./sessionTokens.ts');

  const payload = verifySessionToken(extractBearerToken(req.header('authorization')));
  if (!payload) {
    res.status(401).json({
      error: 'انتهت الجلسة أو لم يتم تسجيل الدخول. سجّل الدخول من شاشة الإعدادات للمتابعة.',
    });
    return null;
  }

  // Re-read the user: an old token must not outlive deactivation/deletion.
  const userRes = await db.query<any>(
    'SELECT id, username FROM security.users WHERE id = $1 AND is_active = TRUE',
    [payload.sub]
  );
  if (userRes.rows.length === 0) {
    res.status(401).json({ error: 'المستخدم الحالي غير موجود أو معطل' });
    return null;
  }

  return { userId: userRes.rows[0].id, username: userRes.rows[0].username };
}

/**
 * Session + key-class gate for a settings write targeting `key`.
 * Returns the token-derived actor, or null after sending 401/403.
 */
async function requireSettingWriteAccess(req: Request, res: Response, key: string): Promise<SettingWriteActor | null> {
  const actor = await requireSettingSession(req, res);
  if (!actor) return null;
  if (!isPersonalSettingKey(key)) {
    const db = await getDb();
    if (!(await hasSettingPermission(db, actor.userId, 'system.settings.manage'))) {
      res.status(403).json({
        error: `تعديل هذا الإعداد محمي (${key}) — يتطلب صلاحية system.settings.manage`,
      });
      return null;
    }
  }
  return actor;
}

/**
 * PHASE 10.5.3 — read guard for the audit trail (GET /api/audit-logs).
 *
 * The endpoint serves two UIs with two catalog permissions:
 *   * the system audit screen   → system.audit.view   (V24 catalog)
 *   * the audit report viewer   → reports.audit.view  (V24 catalog)
 * Possession of EITHER is sufficient. Session identity only — the route
 * accepts no identity parameters, so there is nothing to forge via query or
 * body; a caller without the permission simply gets 403.
 */
async function requireAuditViewPermission(req: Request, res: Response): Promise<string | null> {
  const actor = await requireSettingSession(req, res);
  if (!actor) return null;
  const db = await getDb();
  const allowed =
    (await hasSettingPermission(db, actor.userId, 'system.audit.view')) ||
    (await hasSettingPermission(db, actor.userId, 'reports.audit.view'));
  if (!allowed) {
    res.status(403).json({
      error: 'ليس لديك صلاحية عرض سجل التدقيق (system.audit.view أو reports.audit.view)',
    });
    return null;
  }
  return actor.userId;
}

// ---- Read: the single central source used by the UI, the shell and every report ----
apiRouter.get(['/company/profile', '/company'], async (_req: Request, res: Response) => {
  try {
    const { CompanyService } = await import('./companyService.ts');
    res.json(await CompanyService.getProfile());
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

apiRouter.put('/company/profile', async (req: Request, res: Response) => {
  try {
    const userId = await requireCompanyManagePermission(req, res);
    if (!userId) return;
    const { CompanyService } = await import('./companyService.ts');
    const profile = await CompanyService.updateProfile(req.body || {}, userId);
    res.json({ success: true, message: 'تم حفظ بيانات الشركة بنجاح', profile });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// ---- Logo upload / removal ----
// base64 body keeps this dependency-free (no multer in the project today) while
// still validating the CONTENT server-side, which is what actually matters.
apiRouter.post('/company/logo', async (req: Request, res: Response) => {
  try {
    const userId = await requireCompanyManagePermission(req, res);
    if (!userId) return;
    const { CompanyService } = await import('./companyService.ts');
    const profile = await CompanyService.saveLogo(req.body?.data, userId);
    res.json({ success: true, message: 'تم رفع الشعار بنجاح', profile });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

apiRouter.delete('/company/logo', async (req: Request, res: Response) => {
  try {
    const userId = await requireCompanyManagePermission(req, res);
    if (!userId) return;
    const { CompanyService } = await import('./companyService.ts');
    const profile = await CompanyService.removeLogo(userId);
    res.json({ success: true, message: 'تم إزالة الشعار', profile });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

/**
 * Serves a stored logo. The file name is matched against a strict generated-name
 * whitelist and then resolved with a containment check, so `..`, subpaths and
 * absolute paths simply do not resolve. Nothing about the storage layout is
 * disclosed on failure — a generic 404 is returned instead.
 */
apiRouter.get('/company/logo/:fileName', async (req: Request, res: Response) => {
  try {
    const { CompanyService } = await import('./companyService.ts');
    const full = CompanyService.resolveLogoFile(req.params.fileName);
    if (!full) {
      return res.status(404).json({ error: 'الشعار غير موجود' });
    }
    const fs = await import('fs');
    res.setHeader('Content-Type', CompanyService.mimeFor(req.params.fileName));
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(fs.readFileSync(full));
  } catch (error: any) {
    res.status(404).json({ error: 'الشعار غير موجود' });
  }
});

// ==========================================
// 19. System Status & Database Integrity
// ==========================================
apiRouter.get('/system/status', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const migRes = await db.query<any>('SELECT * FROM core.schema_migrations ORDER BY applied_at ASC');
    const compRes = await db.query<any>('SELECT name, tax_number, legal_name FROM core.companies LIMIT 1');
    const accountsCount = await db.query<any>('SELECT COUNT(*) as c FROM accounting.accounts');
    const jesCount = await db.query<any>('SELECT COUNT(*) as c FROM accounting.journal_entries');
    const itemsCount = await db.query<any>('SELECT COUNT(*) as c FROM inventory.items');
    const custCount = await db.query<any>('SELECT COUNT(*) as c FROM sales.customers');
    const suppCount = await db.query<any>('SELECT COUNT(*) as c FROM purchasing.suppliers');

    res.json({
      status: 'OPERATIONAL',
      engine: 'PostgreSQL (PGlite Enterprise Engine)',
      database: 'kayan_erp_production',
      serverTime: new Date().toISOString(),
      company: compRes.rows[0] || { name: 'كيان للتجارة والتوزيع' },
      migrations: migRes.rows,
      stats: {
        accounts: parseInt(accountsCount.rows[0]?.c || '0', 10),
        journalEntries: parseInt(jesCount.rows[0]?.c || '0', 10),
        items: parseInt(itemsCount.rows[0]?.c || '0', 10),
        customers: parseInt(custCount.rows[0]?.c || '0', 10),
        suppliers: parseInt(suppCount.rows[0]?.c || '0', 10),
      },
    });
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// ==========================================
// 20. Central Settings Hub (مركز الإعدادات المركزي)
// ==========================================

// Get all settings grouped by module
// PHASE 10.5.3: secret-shaped keys (password/secret/token/api-key...) are
// stripped from the HTTP response by default — see settingKeyPolicy.ts. The
// open read is what lets the whole UI boot; credentials never ride along.
apiRouter.get('/settings', async (_req: Request, res: Response) => {
  try {
    const { SettingsService } = await import('./settingsService.ts');
    const { stripSecretSettings } = await import('./settingKeyPolicy.ts');
    const settings = stripSecretSettings(await SettingsService.getAllSettings());
    const health = await SettingsService.getSystemConfigurationHealth();
    res.json({
      settings,
      health,
    });
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// System Configuration Health Check & Missing Settings Detector
apiRouter.get('/settings/health', async (_req: Request, res: Response) => {
  try {
    const { SettingsService } = await import('./settingsService.ts');
    const health = await SettingsService.getSystemConfigurationHealth();
    res.json(health);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// Get settings audit trail (PHASE 10.5.2: who-changed-what is management
// data — same permission as protected settings writes; no UI consumer, the
// hub reads /api/audit-logs instead).
apiRouter.get('/settings/audit', async (req: Request, res: Response) => {
  try {
    const actorId = await requireSettingPermission(req, res, 'system.settings.manage');
    if (!actorId) return;
    const db = await getDb();
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const auditRes = await db.query<any>(`
      SELECT sa.*, s.description, s.module
      FROM core.settings_audit sa
      LEFT JOIN core.settings s ON s.key = sa.setting_key
      ORDER BY sa.created_at DESC
      LIMIT $1
    `, [limit]);
    res.json(auditRes.rows);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// Get settings for a specific module (PHASE 10.5.3: same secret-key filter
// as GET /settings — credentials never leave the process over HTTP).
apiRouter.get('/settings/module/:module', async (req: Request, res: Response) => {
  try {
    const { SettingsService } = await import('./settingsService.ts');
    const { isSecretSettingKey } = await import('./settingKeyPolicy.ts');
    const settings = await SettingsService.getModuleSettings(req.params.module);
    res.json(settings.filter((row: any) => row && !isSecretSettingKey(row.key)));
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});

// Update a single setting (PHASE 10.5.2: signed session required for every
// key; system.settings.manage required for every non-personal key; actor
// identity comes from the token — body userId/username/branchId/companyId
// are ignored).
apiRouter.put('/settings/:key', async (req: Request, res: Response) => {
  try {
    const actor = await requireSettingWriteAccess(req, res, req.params.key);
    if (!actor) return;
    const { SettingsService } = await import('./settingsService.ts');
    const { value, reason } = req.body || {};
    const result = await SettingsService.setSetting(req.params.key, value, {
      userId: actor.userId,
      username: actor.username,
      reason,
    });
    res.json(result);
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// Bulk update settings (PHASE 10.5.2: every item is validated — session +
// key class — BEFORE anything is written, so a rejected batch never leaves
// half of it persisted; actor identity comes from the token).
apiRouter.post('/settings/bulk', async (req: Request, res: Response) => {
  try {
    const { SettingsService } = await import('./settingsService.ts');
    const { settings, reason } = req.body || {};
    if (!Array.isArray(settings)) {
      return res.status(400).json({ error: 'مصفوفة الإعدادات مطلوبة' });
    }

    const actor = await requireSettingSession(req, res);
    if (!actor) return;

    const db = await getDb();
    for (const item of settings) {
      if (!item || typeof item.key !== 'string' || item.value === undefined) continue;
      if (!isPersonalSettingKey(item.key) && !(await hasSettingPermission(db, actor.userId, 'system.settings.manage'))) {
        return res.status(403).json({
          error: `تعديل الإعدادات الإدارية محمي (${item.key}) — يتطلب صلاحية system.settings.manage`,
        });
      }
    }

    const results = [];
    for (const item of settings) {
      if (item && item.key && item.value !== undefined) {
        const updated = await SettingsService.setSetting(item.key, item.value, {
          userId: actor.userId,
          username: actor.username,
          reason: reason || 'تحديث جماعي للإعدادات',
        });
        results.push(updated);
      }
    }

    res.json({ success: true, updatedCount: results.length, results });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// Reset setting to default (PHASE 10.5.2: same session + key-class gate as
// the update route; the acting user is the token owner, never req.body).
apiRouter.post('/settings/reset/:key', async (req: Request, res: Response) => {
  try {
    const actor = await requireSettingWriteAccess(req, res, req.params.key);
    if (!actor) return;
    const { SettingsService } = await import('./settingsService.ts');
    await SettingsService.resetSetting(req.params.key, undefined, actor.userId);
    res.json({ success: true, message: `تمت استعادة القيمة الافتراضية للإعداد ${req.params.key}` });
  } catch (error: any) {
    sendRouteError(res, 400, error);
  }
});

// ==========================================
// Universal Master Data Lookup APIs (Phase 8.10)
// ==========================================
apiRouter.get('/lookups/:type', async (req: Request, res: Response) => {
  try {
    const type = req.params.type;
    const q = (req.query.q as string) || '';
    const limit = parseInt((req.query.limit as string) || '25', 10);
    const db = await getDb();
    let queryText = '';
    let queryParams: any[] = [];

    switch (type) {
      case 'accounts':
      case 'account':
        queryText = `
          SELECT 
            a.id, 
            a.code, 
            a.name, 
            COALESCE(t.name, a.account_type_id) as "type", 
            a.normal_balance as "nature", 
            a.is_active as "isActive" 
          FROM accounting.accounts a
          LEFT JOIN accounting.account_types t ON t.id = a.account_type_id
          WHERE (a.code ILIKE $1 OR a.name ILIKE $1) AND (a.is_active IS NULL OR a.is_active = true)
          ORDER BY a.code LIMIT $2
        `;
        queryParams = [`%${q}%`, limit];
        break;
      case 'items':
      case 'item':
        queryText = `
          SELECT 
            i.id, 
            i.sku, 
            i.barcode, 
            i.name, 
            COALESCE(u.symbol, u.name, 'قطعة') as "unit", 
            i.sale_price as "sellingPrice",
            i.purchase_price as "purchasePrice",
            COALESCE((
              SELECT SUM(CASE WHEN t.transaction_type IN ('OPENING', 'PURCHASE_RECEIPT', 'TRANSFER_IN', 'RETURN_IN', 'ADJUSTMENT_IN') THEN tl.quantity ELSE -tl.quantity END) 
              FROM inventory.stock_transaction_lines tl 
              JOIN inventory.stock_transactions t ON t.id = tl.transaction_id 
              WHERE tl.item_id = i.id
            ), 0) as "availableQty",
            i.is_stock_item as "isStockItem",
            COALESCE(i.purchase_price, 0) as "averageCost"
          FROM inventory.items i
          LEFT JOIN inventory.units u ON u.id = i.unit_id
          WHERE (i.sku ILIKE $1 OR i.barcode ILIKE $1 OR i.name ILIKE $1) AND (i.is_active IS NULL OR i.is_active = true)
          ORDER BY i.name LIMIT $2
        `;
        queryParams = [`%${q}%`, limit];
        break;
      case 'customers':
      case 'customer':
        queryText = `
          SELECT 
            c.id, 
            c.code, 
            c.name, 
            COALESCE(c.phone, '') as "phone", 
            c.tax_number as "taxNumber",
            COALESCE((
              SELECT SUM(inv.total - inv.paid_amount)
              FROM sales.sales_invoices inv
              WHERE inv.customer_id = c.id AND inv.status = 'POSTED' AND inv.payment_type = 'CREDIT'
            ), 0) as "balance", 
            c.credit_limit as "creditLimit" 
          FROM sales.customers c 
          WHERE (c.code ILIKE $1 OR c.name ILIKE $1 OR COALESCE(c.phone, '') ILIKE $1 OR COALESCE(c.tax_number, '') ILIKE $1) 
            AND (c.is_active IS NULL OR c.is_active = true)
          ORDER BY c.name LIMIT $2
        `;
        queryParams = [`%${q}%`, limit];
        break;
      case 'suppliers':
      case 'supplier':
        queryText = `
          SELECT 
            s.id, 
            s.code, 
            s.name, 
            COALESCE(s.phone, '') as "phone", 
            s.tax_number as "taxNumber",
            COALESCE((
              SELECT SUM(inv.total - inv.paid_amount)
              FROM purchasing.purchase_invoices inv
              WHERE inv.supplier_id = s.id AND inv.status = 'POSTED' AND inv.payment_type = 'CREDIT'
            ), 0) as "balance", 
            s.credit_limit as "creditLimit" 
          FROM purchasing.suppliers s 
          WHERE (s.code ILIKE $1 OR s.name ILIKE $1 OR COALESCE(s.phone, '') ILIKE $1 OR COALESCE(s.tax_number, '') ILIKE $1) 
            AND (s.is_active IS NULL OR s.is_active = true)
          ORDER BY s.name LIMIT $2
        `;
        queryParams = [`%${q}%`, limit];
        break;
      case 'cash':
        queryText = `SELECT id, code, name, currency FROM banking.cash_accounts WHERE (code ILIKE $1 OR name ILIKE $1) AND is_active = true ORDER BY name LIMIT $2`;
        queryParams = [`%${q}%`, limit];
        break;
      case 'banks':
        queryText = `SELECT id, account_number as "accountNumber", bank_name as "bankName", currency FROM banking.bank_accounts WHERE (account_number ILIKE $1 OR bank_name ILIKE $1) AND is_active = true ORDER BY bank_name LIMIT $2`;
        queryParams = [`%${q}%`, limit];
        break;
      case 'warehouses':
        queryText = `SELECT id, code, name, address as "location" FROM inventory.warehouses WHERE (code ILIKE $1 OR name ILIKE $1) AND is_active = true ORDER BY name LIMIT $2`;
        queryParams = [`%${q}%`, limit];
        break;
      case 'cost-centers':
        queryText = `SELECT id, code, name FROM accounting.cost_centers WHERE (code ILIKE $1 OR name ILIKE $1) AND is_active = true ORDER BY name LIMIT $2`;
        queryParams = [`%${q}%`, limit];
        break;
      case 'taxes':
        queryText = `SELECT id, code, name, rate_percentage as "rate" FROM accounting.tax_codes WHERE (code ILIKE $1 OR name ILIKE $1) AND is_active = true ORDER BY code LIMIT $2`;
        queryParams = [`%${q}%`, limit];
        break;
      case 'units':
        queryText = `SELECT id, code, name, symbol FROM inventory.units WHERE (code ILIKE $1 OR name ILIKE $1) ORDER BY name LIMIT $2`;
        queryParams = [`%${q}%`, limit];
        break;
      case 'branches':
        queryText = `SELECT id, code, name FROM core.branches WHERE (code ILIKE $1 OR name ILIKE $1) AND is_active = true ORDER BY name LIMIT $2`;
        queryParams = [`%${q}%`, limit];
        break;
      case 'assets':
        queryText = `SELECT id, code, name, purchase_cost as "purchaseCost" FROM assets.fixed_assets WHERE (code ILIKE $1 OR name ILIKE $1) ORDER BY name LIMIT $2`;
        queryParams = [`%${q}%`, limit];
        break;
      case 'expenses':
        queryText = `SELECT id, code, name FROM expenses.expense_categories WHERE (code ILIKE $1 OR name ILIKE $1) ORDER BY name LIMIT $2`;
        queryParams = [`%${q}%`, limit];
        break;
      // هم ---
      // خيارات الطرف المقابل ووسيلة التحصيل/الصرف لسندات القبض والصرف:
      // مصادر حقيقية فقط (عملاء/موردون مربوطون بحساباتهم، صناديق/بنوك بحساب
      // GL، تفصيلي من دليل الحسابات، موظفون فجوة موثقة). المعالج مكتوب
      // في voucherAccounting.ts ويستخدمها كلا السندَين.
      // الحسابات الرئيسية لسند الصرف (الحقل الأول) — تُستثنى منها
      // حسابات الصناديق/البنوك لأن الصندوق/البنك المصدر يُختار في أعلى السند.
      case 'voucher-main-accounts': {
        const options = await VoucherAccounting.buildVoucherMainAccountOptions({
          search: q,
          limit,
        });
        return res.json(options);
      }
      case 'receipt-counterparty': {
        const options = await VoucherAccounting.buildCounterpartyOptions({
          kind: 'receipt',
          counterpartyType: (req.query.type as string) || '',
          search: q,
          limit,
        });
        return res.json(options);
      }
      case 'payment-counterparty': {
        const options = await VoucherAccounting.buildCounterpartyOptions({
          kind: 'payment',
          counterpartyType: (req.query.type as string) || '',
          search: q,
          limit,
        });
        return res.json(options);
      }
      case 'receipt-vehicles':
      case 'payment-vehicles': {
        const category = req.query.category === 'BANK' ? 'BANK' : 'CASH';
        const vehicles = await VoucherAccounting.buildVehicleOptions({ category, search: q, limit });
        return res.json(vehicles);
      }
      default:
        return res.status(400).json({ error: 'Invalid lookup type' });
    }

    const result = await db.query<any>(queryText, queryParams);
    res.json(result.rows);
  } catch (error: any) {
    sendRouteError(res, 500, error);
  }
});
