import { getDb } from './db.ts';

// ============================================================
// تطوير اختيار الحسابات في سندات القبض والصرف
// ============================================================
// قواعد الطرف المقابل ووسيلة التحصيل/الصرف مشتركة بين
// SalesService.createReceipt/postReceipt و PurchasingService.
// createPayment/postSupplierPayment so the six account types
// (عميل / مورد / موظف / حساب عام / صندوق / بنك) behave
// identically on both voucher screens.
//
// تنبيه محاسبي محفوظ هنا:
//   حساب الطرف المقابل (عميل/مورد/موظف/حساب عام) يظل منفصلاً تماماً
//   عن حساب وسيلة التحصيل أو الصرف (صندوق/بنك). اتجاه القيد لا يتغير:
//     - سند القبض: مدين حساب وسيلة التحصيل (صندوق/بنك)، دائن حساب الطرف المقابل.
//     - سند الصرف: مدين حساب الطرف المقابل، دائن حساب وسيلة الصرف (صندوق/بنك).
//
// العلاقات المعتمدة لربط الأطراف بالحسابات المحاسبية (لا تُستخدم بديلات):
//   العملاء     → sales.customers.receivables_account_id (fallback: حساب 1103)
//   الموردون    → purchasing.suppliers.payables_account_id (fallback: حساب 2101)
//   الصناديق    → banking.cash_accounts.gl_account_id
//   البنوك      → banking.bank_accounts.gl_account_id
//   الحسابات العامة → دليل الحسابات (حساب تفصيلي نشط فقط)
//   الموظفون    → لا يوجد سجل موظفين في النظام (فجوة موثقة؛ يُرفض القيد بدل الاستبدال)

export const VOUCHER_COUNTERPARTY_TYPES = [
  'CUSTOMER',
  'SUPPLIER',
  'EMPLOYEE',
  'GENERAL',
  'CASH',
  'BANK',
] as const;

export type VoucherCounterpartyType = (typeof VOUCHER_COUNTERPARTY_TYPES)[number];

export const COUNTERPARTY_TYPE_LABELS_AR: Record<VoucherCounterpartyType, string> = {
  CUSTOMER: 'عميل',
  SUPPLIER: 'مورد',
  EMPLOYEE: 'موظف',
  GENERAL: 'حساب عام',
  CASH: 'صندوق',
  BANK: 'بنك',
};

export const EMPLOYEES_GAP_AR =
  'لا يوجد سجل موظفين في النظام بعد، ولا يوجد ربط محاسبي معتمد للموظفين — لا يمكن تحديد موظف كطرف مقابل في السندات.';

export interface CounterpartyOption {
  /** معرّف تعريف الطرف (عميل/مورد/صندوق/بنك) أو فارغ لحسابات الدليل. */
  entityId?: string | null;
  entityType: 'CUSTOMER' | 'SUPPLIER' | 'CASH_ACCOUNT' | 'BANK_ACCOUNT' | 'ACCOUNT';
  code: string;
  name: string;
  /** تفاصيل تمييزية: الرصيد، رقم الحساب البنكي، اسم الفرع أو العملة... */
  extra?: string | null;
  /** الحساب المحاسبي الذي سيُقيد عليه الطرف. */
  accountId?: string | null;
  accountCode?: string | null;
  accountName?: string | null;
  /** الحرب: الطرف لا يملك ربطاً محاسبياً بعد — لا يصلح للقيد حتى يُربط. */
  missingAccountLink?: boolean;
}

export interface CounterpartyOptionsResult {
  type: VoucherCounterpartyType;
  options: CounterpartyOption[];
  /** فجوة بنوية موثقة (مثال: لا يوجد سجل موظفين). */
  gap?: 'EMPLOYEES_NOT_SUPPORTED';
  gapMessage?: string;
}

export interface ResolvedCounterparty {
  type: VoucherCounterpartyType;
  /** الحساب المحاسبي الذي سيدخل القيد. */
  accountId: string;
  /** وصف عربي للطرف يُستخدم في نص القيد والتدقيق. */
  label: string;
  /** معرّف تعريف الطرف (عميل/مورد) إن وجد — يُخزنه عمودا الأعمدة الأصلية. */
  customerId?: string | null;
  supplierId?: string | null;
}

export interface ResolveCounterpartyInput {
  type: VoucherCounterpartyType;
  counterpartyAccountId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  companyId: string;
  voucherKind: 'RECEIPT' | 'PAYMENT';
}

function activeAccountError(code: string, name: string, reason: string): Error {
  return new Error(`الحساب المحاسبي «${code} - ${name}» ${reason}`);
}

/**
 * التحقق من أن حساب دليل الحسابات صالح للقيد: موجود، في نطاق الشركة،
 * نشط، وتفصيلي (غير تجميعي).
 */
export async function validatePostableGlAccount(accountId: string, companyId: string): Promise<{ id: string; code: string; name: string }> {
  const db = await getDb();
  const res = await db.query<any>(
    `SELECT a.id, a.code, a.name, a.is_group, a.is_active
       FROM accounting.accounts a
      WHERE a.id = $1 AND a.company_id = $2`,
    [accountId, companyId]
  );
  const acc = res.rows[0];
  if (!acc) {
    throw new Error('الحساب المحاسبي المحدد غير موجود أو خارج نطاق الشركة');
  }
  if (acc.is_group) {
    throw activeAccountError(acc.code, acc.name, 'حساب تجميعي لا يقبل التحليل — اختر الحساب التفصيلي الفرعي');
  }
  if (acc.is_active === false) {
    throw activeAccountError(acc.code, acc.name, 'معطل ولا يجوز استخدامه في السندات');
  }
  return { id: acc.id, code: acc.code, name: acc.name };
}

/** فحص أن الحساب ليس حساب GL مربوطاً بصندوق/بنك نشط (يُختار من نوعه الصحيح). */
async function assertNotVehicleGlAccount(accountId: string, companyId: string): Promise<void> {
  const db = await getDb();
  const res = await db.query<any>(
    `SELECT k.id FROM banking.cash_accounts k
      WHERE k.gl_account_id = $1 AND k.company_id = $2 AND k.is_active = TRUE
      UNION ALL
      SELECT b.id FROM banking.bank_accounts b
      WHERE b.gl_account_id = $1 AND b.company_id = $2 AND b.is_active = TRUE
      LIMIT 1`,
    [accountId, companyId]
  );
  if (res.rows.length > 0) {
    throw new Error('هذا الحساب مربوط بتعريف صندوق أو بنك — اختره من نوع «الصناديق» أو «البنوك» وليس من «الحسابات العامة»');
  }
}

/**
 * يحل الطرف المختار إلى حساب محاسبي قابل للترحيل وفقاً لنوعه.
 * كل رفض يعود برسالة عربية واضحة؛ لا مكتبة حسابات مقلدة ولا ربط مُستبدل.
 */
export async function resolveCounterparty(input: ResolveCounterpartyInput): Promise<ResolvedCounterparty> {
  const db = await getDb();
  const { type, counterpartyAccountId, customerId, supplierId, companyId, voucherKind } = input;
  const voucherAr = voucherKind === 'RECEIPT' ? 'سند القبض' : 'سند الصرف';

  if (!type) {
    throw new Error(`اختر نوع الحساب ثم الحساب المقابل لحفظ ${voucherAr}`);
  }

  switch (type) {
    case 'CUSTOMER': {
      if (!customerId) {
        throw new Error('اختر أولاً نوع الحساب «العملاء» ثم العميل المقابل');
      }
      const res = await db.query<any>(
        `SELECT c.id, c.code, c.name, c.is_active, c.receivables_account_id,
                a.code AS "linkedCode", a.name AS "linkedName", a.is_group AS "linkedIsGroup", a.is_active AS "linkedActive"
           FROM sales.customers c
           LEFT JOIN accounting.accounts a ON a.id = c.receivables_account_id
          WHERE c.id = $1 AND c.company_id = $2`,
        [customerId, companyId]
      );
      const customer = res.rows[0];
      if (!customer) {
        throw new Error('العميل المحدد غير موجود أو خارج نطاق الشركة');
      }
      if (customer.is_active === false) {
        throw new Error(`العميل «${customer.name}» معطل ولا يجوز القيد عليه`);
      }

      let accountId = customer.receivables_account_id as string | null;
      let accountLabel = customer.linkedCode
        ? `الحساب ${customer.linkedCode} - ${customer.linkedName}`
        : null;

      if (!accountId) {
        // العلاقة الافتراضية المعتمدة للنظام: حساب الذمم 1103
        const defAcc = await db.query<any>(
          `SELECT id, code, name, is_group, is_active FROM accounting.accounts WHERE code = '1103' AND company_id = $1 LIMIT 1`,
          [companyId]
        );
        accountId = defAcc.rows[0]?.id || null;
        accountLabel = defAcc.rows[0] ? `الحساب الافتراضي ${defAcc.rows[0].code} - ${defAcc.rows[0].name}` : null;
      }

      if (!accountId) {
        throw new Error(
          `العميل «${customer.name}» غير مربوط بحساب محاسبي للذمم، ولا يوجد الحساب الافتراضي 1103 — ليّن ربط العميل بحساب الذمم من بطاقة العميل ثم أعد المحاولة`
        );
      }

      const acc = await validatePostableGlAccount(accountId, companyId);
      if (customer.receivables_account_id) {
        if (customer.linkedIsGroup) {
          throw activeAccountError(customer.linkedCode || '', customer.linkedName || '', 'حساب تجميعي لا يقبل التحليل — يلزم حساب تفصيلي');
        }
        if (customer.linkedActive === false) {
          throw activeAccountError(customer.linkedCode || '', customer.linkedName || '', 'معطّل ولا يجوز استخدامه');
        }
      }

      return { type, accountId: acc.id, label: `العميل ${customer.name}`, customerId: customer.id, supplierId: null };
    }

    case 'SUPPLIER': {
      if (!supplierId) {
        throw new Error('اختر أولاً نوع الحساب «الموردون» ثم المورد المقابل');
      }
      const res = await db.query<any>(
        `SELECT s.id, s.code, s.name, s.is_active, s.payables_account_id,
                a.code AS "linkedCode", a.name AS "linkedName", a.is_group AS "linkedIsGroup", a.is_active AS "linkedActive"
           FROM purchasing.suppliers s
           LEFT JOIN accounting.accounts a ON a.id = s.payables_account_id
          WHERE s.id = $1 AND s.company_id = $2`,
        [supplierId, companyId]
      );
      const supplier = res.rows[0];
      if (!supplier) {
        throw new Error('المورد المحدد غير موجود أو خارج نطاق الشركة');
      }
      if (supplier.is_active === false) {
        throw new Error(`المورد «${supplier.name}» معطل ولا يجوز الاستفادة منه في السندات`);
      }

      let accountId = supplier.payables_account_id as string | null;
      if (!accountId) {
        const defAcc = await db.query<any>(
          `SELECT id, code, name, is_group, is_active FROM accounting.accounts WHERE code = '2101' AND company_id = $1 LIMIT 1`,
          [companyId]
        );
        accountId = defAcc.rows[0]?.id || null;
      }

      if (!accountId) {
        throw new Error(
          `المورد «${supplier.name}» غير مربوط بحساب محاسبي للدائنين، ولا يوجد الحساب الافتراضي 2101 — ليّن ربط المورد بحساب الدائنين من بطاقة المورد ثم أعد المحاولة`
        );
      }

      const acc = await validatePostableGlAccount(accountId, companyId);
      if (supplier.payables_account_id) {
        if (supplier.linkedIsGroup) {
          throw activeAccountError(supplier.linkedCode || '', supplier.linkedName || '', 'حساب تجميعي لا يقبل التحليل — يلزم حساب تفصيلي');
        }
        if (supplier.linkedActive === false) {
          throw activeAccountError(supplier.linkedCode || '', supplier.linkedName || '', 'معطّل ولا يجوز استخدامه');
        }
      }

      return { type, accountId: acc.id, label: `المورد ${supplier.name}`, customerId: null, supplierId: supplier.id };
    }

    case 'EMPLOYEE': {
      throw new Error(EMPLOYEES_GAP_AR);
    }

    case 'GENERAL': {
      if (!counterpartyAccountId) {
        throw new Error('اختر الحساب العام المقابل من دليل الحسابات');
      }
      const acc = await validatePostableGlAccount(counterpartyAccountId, companyId);
      await assertNotVehicleGlAccount(counterpartyAccountId, companyId);
      return { type, accountId: acc.id, label: `الحساب ${acc.code} - ${acc.name}`, customerId: null, supplierId: null };
    }

    case 'CASH': {
      if (!counterpartyAccountId) {
        throw new Error('اختر الصندوق المقابل');
      }
      const acc = await validatePostableGlAccount(counterpartyAccountId, companyId);
      const res = await db.query<any>(
        `SELECT k.id, k.code, k.name FROM banking.cash_accounts k
          WHERE k.gl_account_id = $1 AND k.company_id = $2 AND k.is_active = TRUE
          LIMIT 1`,
        [counterpartyAccountId, companyId]
      );
      if (res.rows.length === 0) {
        throw new Error('الحساب المحدد ليس حساب GL مربوطاً بصندوق نشط — اختر الصندوق من قائمة «الصناديق»');
      }
      const cash = res.rows[0];
      return { type, accountId: acc.id, label: `الصندوق ${cash.name}`, customerId: null, supplierId: null };
    }

    case 'BANK': {
      if (!counterpartyAccountId) {
        throw new Error('اختر البنك المقابل');
      }
      const acc = await validatePostableGlAccount(counterpartyAccountId, companyId);
      const res = await db.query<any>(
        `SELECT b.id, b.code, b.bank_name, b.account_number FROM banking.bank_accounts b
          WHERE b.gl_account_id = $1 AND b.company_id = $2 AND b.is_active = TRUE
          LIMIT 1`,
        [counterpartyAccountId, companyId]
      );
      if (res.rows.length === 0) {
        throw new Error('الحساب المحدد ليس حساب GL مربوطاً بحساب بنكي نشط — اختر البنك من قائمة «البنوك»');
      }
      const bank = res.rows[0];
      return { type, accountId: acc.id, label: `البنك ${bank.bank_name}`, customerId: null, supplierId: null };
    }

    default: {
      throw new Error('نوع الحساب المقابل غير مدعوم');
    }
  }
}

// ============================================================
// قوائم الاختيار لكل نوع
// ============================================================

export interface BuildCounterpartyOptionsInput {
  kind: 'receipt' | 'payment';
  counterpartyType: string;
  search?: string;
  limit?: number;
}

/**
 * الحسابات الفعلية لكل نوع — مصادر حقيقية من قاعدة البيانات فقط.
 * تُعيد المعرفات المطابقة للقاعدة المعتمدة: العملاء/الموردين بمعرّفات تعريفهم
 * وحسابهم المربوط؛ الصناديق/البنوك بحساب GL؛ الحسابات العامة بحسابات دليل
 * تفصيلية نشطة غير مربوطة بصناديق/بنوك؛ الموظفون فجوة موثقة بلا بيانات.
 */
export async function buildCounterpartyOptions(input: BuildCounterpartyOptionsInput): Promise<CounterpartyOptionsResult> {
  const db = await getDb();
  const { counterpartyType } = input;
  const limit = Math.min(Math.max(input.limit || 60, 1), 200);
  const search = (input.search || '').trim();

  if (VOUCHER_COUNTERPARTY_TYPES.includes(counterpartyType as VoucherCounterpartyType) === false) {
    throw new Error('نوع الحساب غير معروف — الأنواع المتاحة: عميل/مورد/موظف/حساب عام/صندوق/بنك');
  }

  const companyRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
  const companyId = companyRes.rows[0]?.id;

  switch (counterpartyType) {
    case 'CUSTOMER': {
      const res = await db.query<any>(
        `SELECT c.id AS "entityId", 'CUSTOMER' AS "entityType", c.code, c.name,
                COALESCE((SELECT SUM(inv.total - inv.paid_amount)
                            FROM sales.sales_invoices inv
                           WHERE inv.customer_id = c.id AND inv.status = 'POSTED' AND inv.payment_type = 'CREDIT'), 0)::text
                  AS balance,
                a.id AS "accountId", a.code AS "accountCode", a.name AS "accountName"
           FROM sales.customers c
           LEFT JOIN accounting.accounts a ON a.id = c.receivables_account_id
          WHERE c.company_id = $1 AND (c.is_active IS NULL OR c.is_active = TRUE)
            AND ($2 = '' OR c.code ILIKE '%' || $2 || '%' OR c.name ILIKE '%' || $2 || '%')
          ORDER BY c.name
          LIMIT $3`,
        [companyId, search, limit]
      );
      return {
        type: 'CUSTOMER',
        options: res.rows.map((r) => ({
          entityId: r.entityId,
          entityType: 'CUSTOMER',
          code: r.code,
          name: r.name,
          extra: `رصيد مستحق: ${r.balance}`,
          accountId: r.accountId,
          accountCode: r.accountCode,
          accountName: r.accountName,
          missingAccountLink: !r.accountId,
        })),
      };
    }

    case 'SUPPLIER': {
      const res = await db.query<any>(
        `SELECT s.id AS "entityId", 'SUPPLIER' AS "entityType", s.code, s.name,
                COALESCE((SELECT SUM(inv.total - inv.paid_amount)
                            FROM purchasing.purchase_invoices inv
                           WHERE inv.supplier_id = s.id AND inv.status = 'POSTED' AND inv.payment_type = 'CREDIT'), 0)::text
                  AS balance,
                a.id AS "accountId", a.code AS "accountCode", a.name AS "accountName"
           FROM purchasing.suppliers s
           LEFT JOIN accounting.accounts a ON a.id = s.payables_account_id
          WHERE s.company_id = $1 AND (s.is_active IS NULL OR s.is_active = TRUE)
            AND ($2 = '' OR s.code ILIKE '%' || $2 || '%' OR s.name ILIKE '%' || $2 || '%')
          ORDER BY s.name
          LIMIT $3`,
        [companyId, search, limit]
      );
      return {
        type: 'SUPPLIER',
        options: res.rows.map((r) => ({
          entityId: r.entityId,
          entityType: 'SUPPLIER',
          code: r.code,
          name: r.name,
          extra: `رصيد مستحق: ${r.balance}`,
          accountId: r.accountId,
          accountCode: r.accountCode,
          accountName: r.accountName,
          missingAccountLink: !r.accountId,
        })),
      };
    }

    case 'EMPLOYEE':
      // فجوة موثقة: لا يوجد جدول موظفين في أي ترحيل — لا بيانات وهمية.
      return { type: 'EMPLOYEE', options: [], gap: 'EMPLOYEES_NOT_SUPPORTED', gapMessage: EMPLOYEES_GAP_AR };

    case 'GENERAL': {
      const res = await db.query<any>(
        `SELECT a.id AS "entityId", 'ACCOUNT' AS "entityType", a.code, a.name,
                t.name AS "typeName"
           FROM accounting.accounts a
           LEFT JOIN accounting.account_types t ON t.id = a.account_type_id
          WHERE a.company_id = $1 AND a.is_active = TRUE AND a.is_group = FALSE
            AND NOT EXISTS (SELECT 1 FROM banking.cash_accounts k
                             WHERE k.gl_account_id = a.id AND k.is_active = TRUE)
            AND NOT EXISTS (SELECT 1 FROM banking.bank_accounts b
                             WHERE b.gl_account_id = a.id AND b.is_active = TRUE)
            AND ($2 = '' OR a.code ILIKE '%' || $2 || '%' OR a.name ILIKE '%' || $2 || '%')
          ORDER BY a.code
          LIMIT $3`,
        [companyId, search, limit]
      );
      return {
        type: 'GENERAL',
        options: res.rows.map((r) => ({
          entityId: null,
          entityType: 'ACCOUNT',
          code: r.code,
          name: r.name,
          extra: r.typeName || null,
          accountId: r.entityId,
          accountCode: r.code,
          accountName: r.name,
        })),
      };
    }

    case 'CASH': {
      const res = await db.query<any>(
        `SELECT k.id AS "entityId", 'CASH_ACCOUNT' AS "entityType", k.code, k.name,
                a.id AS "accountId", a.code AS "accountCode", a.name AS "accountName",
                COALESCE(br.name, '') AS branchName, COALESCE(cur.code, '') AS currencyCode
           FROM banking.cash_accounts k
           JOIN accounting.accounts a ON a.id = k.gl_account_id
           LEFT JOIN core.branches br ON br.id = k.branch_id
           LEFT JOIN core.currencies cur ON cur.id = k.currency_id
          WHERE k.company_id = $1 AND k.is_active = TRUE AND a.is_active <> FALSE
            AND ($2 = '' OR k.code ILIKE '%' || $2 || '%' OR k.name ILIKE '%' || $2 || '%'
                 OR a.code ILIKE '%' || $2 || '%' OR a.name ILIKE '%' || $2 || '%')
          ORDER BY k.name
          LIMIT $3`,
        [companyId, search, limit]
      );
      return {
        type: 'CASH',
        options: res.rows.map((r) => ({
          entityId: r.entityId,
          entityType: 'CASH_ACCOUNT',
          code: r.code,
          name: r.name,
          extra: [r.branchName, r.currencyCode].filter(Boolean).join(' • ') || null,
          accountId: r.accountId,
          accountCode: r.accountCode,
          accountName: r.accountName,
        })),
      };
    }

    case 'BANK': {
      const res = await db.query<any>(
        `SELECT b.id AS "entityId", 'BANK_ACCOUNT' AS "entityType", b.bank_name AS name, b.account_number,
                a.id AS "accountId", a.code AS "accountCode", a.name AS "accountName",
                COALESCE(br.name, '') AS branchName, COALESCE(cur.code, '') AS currencyCode
           FROM banking.bank_accounts b
           JOIN accounting.accounts a ON a.id = b.gl_account_id
           LEFT JOIN core.branches br ON br.id = b.branch_id
           LEFT JOIN core.currencies cur ON cur.id = b.currency_id
          WHERE b.company_id = $1 AND b.is_active = TRUE AND a.is_active <> FALSE
            AND ($2 = '' OR b.bank_name ILIKE '%' || $2 || '%' OR b.account_number ILIKE '%' || $2 || '%'
                 OR a.code ILIKE '%' || $2 || '%' OR a.name ILIKE '%' || $2 || '%')
          ORDER BY b.bank_name
          LIMIT $3`,
        [companyId, search, limit]
      );
      return {
        type: 'BANK',
        options: res.rows.map((r) => ({
          entityId: r.entityId,
          entityType: 'BANK_ACCOUNT',
          code: r.account_number,
          name: r.name,
          extra: [r.branchName, r.currencyCode].filter(Boolean).join(' • ') || null,
          accountId: r.accountId,
          accountCode: r.accountCode,
          accountName: r.accountName,
        })),
      };
    }

    default:
      throw new Error('نوع الحساب غير معروف');
  }
}

// ============================================================
// وسيلة التحصيل / الصرف (صندوق أو بنك)
// ============================================================

export interface VehicleOption {
  /** معرّف تعريف الصندوق/البنك (banking.*). */
  entityId: string;
  category: 'CASH' | 'BANK';
  code: string;
  name: string;
  extra?: string | null;
  /** الحساب المحاسبي المرتبط بالصندوق/البنك. */
  accountId: string;
  accountCode: string;
  accountName: string;
}

export interface ResolvedVehicle {
  category: 'CASH' | 'BANK';
  accountId: string;
  accountName: string;
  accountCode: string;
  vehicleName: string;
}

export interface BuildVehicleOptionsInput {
  category: 'CASH' | 'BANK';
  search?: string;
  limit?: number;
}

/** تعريفات الصناديق/البنوك الفعلية مع حساب GL مربوطاً — مطلوب الدخول/الخروج منه. */
export async function buildVehicleOptions(input: BuildVehicleOptionsInput): Promise<{ options: VehicleOption[] }> {
  const db = await getDb();
  const limit = Math.min(Math.max(input.limit || 50, 1), 200);
  const search = (input.search || '').trim();
  const companyRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
  const companyId = companyRes.rows[0]?.id;

  if (input.category === 'CASH') {
    const res = await db.query<any>(
      `SELECT k.id, k.code, k.name, a.id AS "accountId", a.code AS "accountCode", a.name AS "accountName",
              COALESCE(br.name, '') AS branchName
         FROM banking.cash_accounts k
         JOIN accounting.accounts a ON a.id = k.gl_account_id
         LEFT JOIN core.branches br ON br.id = k.branch_id
        WHERE k.company_id = $1 AND k.is_active = TRUE AND a.is_active <> FALSE
          AND ($2 = '' OR k.code ILIKE '%' || $2 || '%' OR k.name ILIKE '%' || $2 || '%'
               OR a.code ILIKE '%' || $2 || '%' OR a.name ILIKE '%' || $2 || '%')
        ORDER BY k.name LIMIT $3`,
      [companyId, search, limit]
    );
    return {
      options: res.rows.map((r) => ({
        entityId: r.id,
        category: 'CASH' as const,
        code: r.code,
        name: r.name,
        extra: r.branchName || null,
        accountId: r.accountId,
        accountCode: r.accountCode,
        accountName: r.accountName,
      })),
    };
  }

  const res = await db.query<any>(
    `SELECT b.id, b.code, b.bank_name, b.account_number, a.id AS "accountId", a.code AS "accountCode", a.name AS "accountName",
            COALESCE(br.name, '') AS branchName
       FROM banking.bank_accounts b
       JOIN accounting.accounts a ON a.id = b.gl_account_id
       LEFT JOIN core.branches br ON br.id = b.branch_id
      WHERE b.company_id = $1 AND b.is_active = TRUE AND a.is_active <> FALSE
        AND ($2 = '' OR b.bank_name ILIKE '%' || $2 || '%' OR b.account_number ILIKE '%' || $2 || '%'
             OR a.code ILIKE '%' || $2 || '%' OR a.name ILIKE '%' || $2 || '%')
      ORDER BY b.bank_name LIMIT $3`,
    [companyId, search, limit]
  );
  return {
    options: res.rows.map((r) => ({
      entityId: r.id,
      category: 'BANK' as const,
      code: r.account_number,
      name: r.bank_name,
      extra: r.branchName || null,
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
    })),
  };
}

/**
 * يحل صندوق/بنك مختار إلى حسابه المحاسبي الصالح للقيد — يقبل فقط معرّف
 * تعريف نشط مربوط بحساب تفصيلي نشط — فيتم التحقق من الحساب المحاسبي على
 * الخادم ولا اطلاع للمتصفح على القيمة النهائية.
 */
export async function resolveVehicle(vehicleEntityId: string, expectedCategory: 'CASH' | 'BANK', companyId: string): Promise<ResolvedVehicle> {  const db = await getDb();

  const cashRes = await db.query<any>(
    `SELECT k.id, k.code, k.name, k.gl_account_id, a.code AS "accountCode", a.name AS "accountName", a.is_group, a.is_active AS "accountActive"
       FROM banking.cash_accounts k
       LEFT JOIN accounting.accounts a ON a.id = k.gl_account_id
      WHERE k.id = $1 AND k.company_id = $2
      LIMIT 1`,
    [vehicleEntityId, companyId]
  );
  const cash = cashRes.rows[0];
  if (cash) {
    if (expectedCategory !== 'CASH') {
      throw new Error('الوسيلة المختارة صندوق نقدي بينما نوع الحركة بنكي — اختر وسيلة متوافقة مع نوع الحركة');
    }
    if (cash.is_active === false) {
      throw new Error(`الصندوق «${cash.name}» معطل ولا يجوز التحصيل/الصرف منه`);
    }
    if (!cash.gl_account_id) {
      throw new Error(`الصندوق «${cash.name}» غير مربوط بحساب محاسبي — ليّن ربطه بحساب GL من شاشة الصناديق`);
    }
    if (cash.is_group) {
      throw activeAccountError(cash.accountCode || '', cash.accountName || '', 'حساب تجميعي لا يقبل التحليل');
    }
    if (cash.accountActive === false) {
      throw activeAccountError(cash.accountCode || '', cash.accountName || '', 'معطّل ولا يجوز استخدامه');
    }
    return {
      category: 'CASH',
      accountId: cash.gl_account_id,
      accountName: cash.accountName,
      accountCode: cash.accountCode,
      vehicleName: cash.name,
    };
  }

  const bankRes = await db.query<any>(
    `SELECT b.id, b.code, b.bank_name, b.account_number, b.gl_account_id, a.code AS "accountCode", a.name AS "accountName", a.is_group, a.is_active AS "accountActive"
       FROM banking.bank_accounts b
       LEFT JOIN accounting.accounts a ON a.id = b.gl_account_id
      WHERE b.id = $1 AND b.company_id = $2
      LIMIT 1`,
    [vehicleEntityId, companyId]
  );
  const bank = bankRes.rows[0];
  if (bank) {
    if (expectedCategory !== 'BANK') {
      throw new Error('الوسيلة المختارة حساب بنكي بينما نوع الحركة نقدي — اختر وسيلة متوافقة مع نوع الحركة');
    }
    if (bank.is_active === false) {
      throw new Error(`الحساب البنكي «${bank.bank_name}» معطل ولا يجوز التحصيل/الصرف منه`);
    }
    if (!bank.gl_account_id) {
      throw new Error(`الحساب البنكي «${bank.bank_name}» غير مربوط بحساب محاسبي — ليّن ربطه بحساب GL من شاشة البنوك`);
    }
    if (bank.is_group) {
      throw activeAccountError(bank.accountCode || '', bank.accountName || '', 'حساب تجميعي لا يقبل التحليل');
    }
    if (bank.accountActive === false) {
      throw activeAccountError(bank.accountCode || '', bank.accountName || '', 'معطّل ولا يجوز استخدامه');
    }
    return {
      category: 'BANK',
      accountId: bank.gl_account_id,
      accountName: bank.accountName,
      accountCode: bank.accountCode,
      vehicleName: bank.bank_name,
    };
  }

  throw new Error('الصندوق أو البنك المختار غير موجود أو خارج نطاق الشركة');
}

// ============================================================
// الحسابات الرئيسية لسند الصرف — الحقل الأول (F9)
// ============================================================
// الحقل الأول في سند الصرف يعرض «الحسابات الرئيسية» من دليل الحسابات:
//   • حسابات التحكم الفعلية (العملاء/الموردون) — تُكتشف من ربط الأطراف بها.
//   • الحسابات التجميعية (is_group = TRUE) التي تحوي أبناءً تفصيليين.
// وتُستثنى حسابات الصناديق/البنوك وسلسلة ancestors —— الصندوق المصدر
// يُختار في أعلى السند، فلا معنى لظهوره طرفاً ثانياً.
//
// الناتج يحمل kind لكل حساب رئيسي:
//   CUSTOMER → الحقل الثاني يعرض العملاء
//   SUPPLIER → الحقل الثاني يعرض الموردين
//   GENERAL  → الحقل الثاني يعرض الحسابات الأبناء التفصيلية

export type VoucherMainAccountKind = 'CUSTOMER' | 'SUPPLIER' | 'GENERAL';

export interface VoucherMainAccountChild {
  accountId: string;
  code: string;
  name: string;
}

export interface VoucherMainAccountOption {
  accountId: string;
  code: string;
  name: string;
  kind: VoucherMainAccountKind;
  hasChildren: boolean;
  children: VoucherMainAccountChild[];
}

export async function buildVoucherMainAccountOptions(input: {
  search?: string;
  limit?: number;
  companyId?: string;
}): Promise<{ options: VoucherMainAccountOption[]; gap: boolean }> {
  const db = await getDb();
  const limit = Math.min(Math.max(input.limit || 100, 1), 300);
  const search = (input.search || '').trim();

  let companyId = input.companyId;
  if (!companyId) {
    const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
    companyId = compRes.rows[0]?.id;
  }
  if (!companyId) return { options: [], gap: true };

  const customerRef = `EXISTS (SELECT 1 FROM sales.customers c WHERE c.receivables_account_id = a.id AND c.company_id = a.company_id)`;
  const supplierRef = `EXISTS (SELECT 1 FROM purchasing.suppliers s WHERE s.payables_account_id = a.id AND s.company_id = a.company_id)`;

  const res = await db.query<any>(
    `WITH RECURSIVE
       cb AS (
         SELECT gl_account_id AS id FROM banking.cash_accounts
          WHERE company_id = $1 AND gl_account_id IS NOT NULL
         UNION
         SELECT gl_account_id FROM banking.bank_accounts
          WHERE company_id = $1 AND gl_account_id IS NOT NULL
       ),
       anc AS (
         SELECT a.id, a.parent_id FROM accounting.accounts a
          WHERE a.id IN (SELECT id FROM cb)
         UNION ALL
         SELECT p.id, p.parent_id FROM accounting.accounts p
          JOIN anc ON p.id = anc.parent_id
       )
     SELECT a.id, a.code, a.name, a.is_group AS "isGroup",
            CASE
              WHEN ${customerRef} THEN 'CUSTOMER'
              WHEN ${supplierRef} THEN 'SUPPLIER'
              ELSE 'GENERAL'
            END AS kind,
            EXISTS (
              SELECT 1 FROM accounting.accounts ch
               WHERE ch.parent_id = a.id AND ch.is_active = TRUE AND ch.is_group = FALSE
            ) AS "hasChildren"
       FROM accounting.accounts a
      WHERE a.company_id = $1
        AND a.is_active = TRUE
        AND a.id NOT IN (SELECT id FROM anc)
        AND (
          a.is_group = TRUE
          OR ${customerRef}
          OR ${supplierRef}
        )
        -- لا تُعرض حسابات الصناديق/البنوك: الصندوق المصدر يُختار في أعلى السند.
        -- (مرجع الأجداد يستثني شجرة الحسابات المستخدمة فعلاً، واستبعاد الاسم
        --  يزيل الأشجار القديمة غير المربوطة بأي صندوق/بنك.)
        AND a.name NOT ILIKE '%نقد%'
        AND a.name NOT ILIKE '%صندوق%'
        AND a.name NOT ILIKE '%صناديق%'
        AND a.name NOT ILIKE '%خزين%'
        AND a.name NOT ILIKE '%خزائن%'
        AND a.name NOT ILIKE '%بنك%'
        AND a.name NOT ILIKE '%بنوك%'
        -- المجموعة العامة بلا أبناء تفصيليين نشطين طريق مسدود — لا تُعرض.
        AND (
          ${customerRef}
          OR ${supplierRef}
          OR EXISTS (
            SELECT 1 FROM accounting.accounts ch
             WHERE ch.parent_id = a.id AND ch.is_active = TRUE AND ch.is_group = FALSE
          )
        )
        AND ($2 = '' OR a.code ILIKE '%' || $2 || '%' OR a.name ILIKE '%' || $2 || '%')
      ORDER BY a.code
      LIMIT $3`,
    [companyId, search, limit]
  );

  const rows = res.rows as Array<any>;
  if (rows.length === 0) return { options: [], gap: false };

  const ids = rows.map((r) => r.id);
  const childrenRes = await db.query<any>(
    `SELECT id, parent_id, code, name
       FROM accounting.accounts
      WHERE parent_id = ANY($1::uuid[])
        AND is_active = TRUE
        AND is_group = FALSE
      ORDER BY code`,
    [ids]
  );

  const childrenByParent = new Map<string, VoucherMainAccountChild[]>();
  for (const child of childrenRes.rows as Array<any>) {
    const list = childrenByParent.get(child.parent_id) || [];
    list.push({ accountId: child.id, code: child.code, name: child.name });
    childrenByParent.set(child.parent_id, list);
  }

  const options: VoucherMainAccountOption[] = rows.map((r) => {
    const children = childrenByParent.get(r.id) || [];
    return {
      accountId: r.id,
      code: r.code,
      name: r.name,
      kind: r.kind as VoucherMainAccountKind,
      hasChildren: Boolean(r.hasChildren) || children.length > 0,
      children,
    };
  });

  return { options, gap: false };
}

// ومساحة أسماء للاستيراد في المسارات
export const VoucherAccounting = {
  buildCounterpartyOptions,
  buildVehicleOptions,
  buildVoucherMainAccountOptions,
};
