import { getDb, withTransaction } from './db.ts';
import { logAudit, logAuditStrict } from './auditService.ts';
import { AccountingService } from './accountingService.ts';
import { SettingsService } from './settingsService.ts';
import {
  resolveCounterparty,
  resolveVehicle,
  COUNTERPARTY_TYPE_LABELS_AR,
  type VoucherCounterpartyType,
  VOUCHER_COUNTERPARTY_TYPES,
} from './voucherAccounting.ts';

export interface CreateCustomerDto {
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  creditLimit?: number;
  paymentTermsDays?: number;
  receivablesAccountId?: string;
  companyId?: string;
  userId?: string;
}

export interface CreateInvoiceLineDto {
  itemId?: string;
  warehouseId?: string;
  itemCode?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  tax?: number;
}

export interface CreateInvoiceDto {
  customerId: string;
  paymentType?: 'CASH' | 'CREDIT';
  invoiceDate: string;
  dueDate?: string;
  notes?: string;
  lines: CreateInvoiceLineDto[];
  companyId?: string;
  branchId?: string;
  userId?: string;
  /** يُملأ من الجلسة الموقّعة على الخادم فقط — لا من جسم الطلب. */
  username?: string;
}

export interface CreateReceiptAllocationDto {
  invoiceId: string;
  amount: number;
}

export interface CreateReceiptDto {
  /** الطرف المقابل: عميل (النمط القديم) أو أحد الأنواع الستة الجديدة. */
  customerId?: string | null;
  supplierId?: string | null;
  counterpartyType?: VoucherCounterpartyType;
  counterpartyAccountId?: string | null;
  /** وسيلة التحصيل: معرّف تعريف صندوق/بنك (banking.*) — يُحلّ حسابه على الخادم. */
  targetVehicleId?: string | null;
  paymentMethod: 'CASH' | 'BANK';
  targetAccountId?: string; // Cash 1101 or Bank 1102 (legacy fallback)
  receiptDate: string;
  amount: number;
  referenceNumber?: string;
  description?: string;
  allocations?: CreateReceiptAllocationDto[];
  companyId?: string;
  branchId?: string;
  userId?: string;
}

export class SalesService {
  // ==========================================
  // 1. Customers
  // ==========================================

  /**
   * PHASE 10.3 — the canonical Accounts Receivable movements.
   *
   * Twin of PurchasingService.getApMovementTotals: the customer card, the
   * customer statement, and the GL 1103 control account must all be the same
   * number, so this is derived the same way as the AP side —
   *
   *   credits = POSTED CREDIT sales invoices  (a CASH invoice settles against
   *             cash and never enters receivables)
   *   debits  = POSTED receipts + POSTED sales returns
   *
   * The card used to sum `total - paid_amount`, which ignored posted sales
   * returns entirely and only netted the ALLOCATED part of a receipt, while
   * the receipt journal debits receivables by the FULL voucher. So the card
   * disagreed with the customer's own statement and with account 1103.
   */
  static async getArMovementTotals(customerId?: string) {
    const db = await getDb();
    const params: any[] = [];
    const cust = customerId ? `AND customer_id = $${params.push(customerId)}` : '';

    const res = await db.query<any>(`
      SELECT
        COALESCE((
          SELECT SUM(total) FROM sales.sales_invoices
          WHERE status = 'POSTED' AND payment_type = 'CREDIT' ${cust}
        ), 0) AS credits,
        COALESCE((
          SELECT SUM(amount) FROM sales.receipts
          WHERE status = 'POSTED' ${cust}
        ), 0) AS receipt_debits,
        COALESCE((
          SELECT SUM(total) FROM sales.sales_returns
          WHERE status = 'POSTED' ${cust}
        ), 0) AS return_debits
    `, params);

    const r = res.rows[0] || {};
    const credits = parseFloat(r.credits || '0');
    const receiptDebits = parseFloat(r.receipt_debits || '0');
    const returnDebits = parseFloat(r.return_debits || '0');
    return { credits, receiptDebits, returnDebits, balance: credits - receiptDebits - returnDebits };
  }

  private static arBalanceSql(customerAlias: string): string {
    return `
      COALESCE((
        SELECT SUM(inv.total) FROM sales.sales_invoices inv
        WHERE inv.customer_id = ${customerAlias}.id AND inv.status = 'POSTED'
          AND inv.payment_type = 'CREDIT'
      ), 0)
      - COALESCE((
        SELECT SUM(rc.amount) FROM sales.receipts rc
        WHERE rc.customer_id = ${customerAlias}.id AND rc.status = 'POSTED'
      ), 0)
      - COALESCE((
        SELECT SUM(sr.total) FROM sales.sales_returns sr
        WHERE sr.customer_id = ${customerAlias}.id AND sr.status = 'POSTED'
      ), 0)`;
  }

  static async getCustomers(search?: string) {
    const db = await getDb();
    let query = `
      SELECT 
        c.*,
        a.code as "accountCode",
        a.name as "accountName",
        (${this.arBalanceSql('c')}) as "outstandingBalance",
        COALESCE(
          (SELECT SUM(inv.total)
           FROM sales.sales_invoices inv
           WHERE inv.customer_id = c.id AND inv.status = 'POSTED'), 0
        ) as "totalSales",
        COALESCE(
          (SELECT SUM(r.amount)
           FROM sales.receipts r
           WHERE r.customer_id = c.id AND r.status = 'POSTED'), 0
        ) as "totalReceipts"
      FROM sales.customers c
      LEFT JOIN accounting.accounts a ON a.id = c.receivables_account_id
    `;
    const params: any[] = [];

    if (search) {
      query += ` WHERE (c.name ILIKE $1 OR c.code ILIKE $1 OR c.phone ILIKE $1)`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY c.created_at DESC`;
    const res = await db.query<any>(query, params);
    return res.rows;
  }

  static async getCustomerById(id: string) {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        c.*,
        a.code as "accountCode",
        a.name as "accountName",
        (${this.arBalanceSql('c')}) as "outstandingBalance",
        COALESCE(
          (SELECT SUM(inv.total)
           FROM sales.sales_invoices inv
           WHERE inv.customer_id = c.id AND inv.status = 'POSTED'), 0
        ) as "totalSales",
        COALESCE(
          (SELECT SUM(r.amount)
           FROM sales.receipts r
           WHERE r.customer_id = c.id AND r.status = 'POSTED'), 0
        ) as "totalReceipts"
      FROM sales.customers c
      LEFT JOIN accounting.accounts a ON a.id = c.receivables_account_id
      WHERE c.id = $1
    `, [id]);

    if (res.rows.length === 0) {
      throw new Error(`العميل برقم ${id} غير موجود`);
    }
    return res.rows[0];
  }

  static async createCustomer(dto: CreateCustomerDto) {
    const db = await getDb();

    // Default company if not provided
    let companyId = dto.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }

    // Default receivables account (1103 العملاء والمدينون)
    let receivablesAccountId = dto.receivablesAccountId;
    if (!receivablesAccountId) {
      const accRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1103' LIMIT 1");
      receivablesAccountId = accRes.rows[0]?.id;
    }

    const res = await db.query<any>(`
      INSERT INTO sales.customers 
      (company_id, code, name, phone, email, address, tax_number, credit_limit, payment_terms_days, receivables_account_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      companyId,
      dto.code,
      dto.name,
      dto.phone || null,
      dto.email || null,
      dto.address || null,
      dto.taxNumber || null,
      dto.creditLimit || 0,
      dto.paymentTermsDays || 30,
      receivablesAccountId,
    ]);

    const customer = res.rows[0];
    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'CUSTOMER',
      entityId: customer.id,
      newData: customer,
    });

    return customer;
  }

  static async updateCustomer(id: string, dto: Partial<CreateCustomerDto>) {
    const db = await getDb();
    const existing = await this.getCustomerById(id);

    const res = await db.query<any>(`
      UPDATE sales.customers 
      SET 
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        email = COALESCE($3, email),
        address = COALESCE($4, address),
        tax_number = COALESCE($5, tax_number),
        credit_limit = COALESCE($6, credit_limit),
        payment_terms_days = COALESCE($7, payment_terms_days),
        is_active = COALESCE($8, is_active),
        updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `, [
      dto.name,
      dto.phone,
      dto.email,
      dto.address,
      dto.taxNumber,
      dto.creditLimit,
      dto.paymentTermsDays,
      (dto as any).isActive,
      id,
    ]);

    const updated = res.rows[0];
    await logAudit({
      userId: dto.userId,
      action: 'UPDATE',
      entityType: 'CUSTOMER',
      entityId: id,
      oldData: existing,
      newData: updated,
    });

    return updated;
  }

  // ==========================================
  // Credit Control
  // ==========================================

  static async checkCreditLimit(customerId: string, newInvoiceTotal: number, allowOverride = false) {
    const customer = await this.getCustomerById(customerId);
    const limit = parseFloat(customer.credit_limit || '0');
    const currentBalance = parseFloat(customer.outstandingBalance || '0');

    if (limit > 0 && (currentBalance + newInvoiceTotal) > limit) {
      if (!allowOverride) {
        throw new Error(
          `تم تجاوز الحد الائتماني للعميل "${customer.name}". الحد الائتماني: ${limit.toLocaleString()} ر.ي، الرصيد القائم: ${currentBalance.toLocaleString()} ر.ي، الفاتورة الجديدة: ${newInvoiceTotal.toLocaleString()} ر.ي (الإجمالي المطلوب: ${(currentBalance + newInvoiceTotal).toLocaleString()} ر.ي). يتطلب ترحيل هذه الفاتورة صلاحية تجاوز الحد الائتماني.`
        );
      } else {
        await logAudit({
          action: 'POST',
          entityType: 'CREDIT_LIMIT_OVERRIDE',
          entityId: customerId,
          newData: { customerName: customer.name, limit, currentBalance, newInvoiceTotal },
        });
      }
    }
  }

  // ==========================================
  // Sales Invoices
  // ==========================================

  static async getInvoices(limit = 50) {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        inv.*,
        c.name as "customerName",
        c.code as "customerCode",
        je.entry_number as "journalEntryNumber"
      FROM sales.sales_invoices inv
      JOIN sales.customers c ON c.id = inv.customer_id
      LEFT JOIN accounting.journal_entries je ON je.id = inv.journal_entry_id
      ORDER BY inv.invoice_date DESC, inv.created_at DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  }

  static async getInvoiceById(id: string) {
    const db = await getDb();
    const invRes = await db.query<any>(`
      SELECT 
        inv.*,
        c.name as "customerName",
        c.code as "customerCode",
        c.phone as "customerPhone",
        c.address as "customerAddress",
        je.entry_number as "journalEntryNumber",
        b.name as "branchName",
        cu.username as "createdByName",
        lm.username as "lastModifiedByName",
        lm.timestamp as "lastModifiedAt"
      FROM sales.sales_invoices inv
      JOIN sales.customers c ON c.id = inv.customer_id
      LEFT JOIN accounting.journal_entries je ON je.id = inv.journal_entry_id
      LEFT JOIN core.branches b ON b.id = inv.branch_id
      LEFT JOIN security.users cu ON cu.id = inv.created_by
      LEFT JOIN LATERAL (
        SELECT al.username, al.timestamp
        FROM audit.audit_logs al
        WHERE al.entity_type = 'SALES_INVOICE'
          AND al.entity_id = inv.id::text
          AND al.action = 'UPDATE'
          AND al.user_id IS NOT NULL
        ORDER BY al.timestamp DESC
        LIMIT 1
      ) lm ON TRUE
      WHERE inv.id = $1
    `, [id]);

    if (invRes.rows.length === 0) {
      throw new Error(`الفاتورة برقم ${id} غير موجودة`);
    }

    const linesRes = await db.query<any>(`
      SELECT 
        l.*,
        l.item_id as "itemId",
        l.warehouse_id as "warehouseId",
        i.name as "itemName",
        i.sku as "sku",
        iu.name as "itemUnit",
        w.name as "warehouseName"
      FROM sales.sales_invoice_lines l
      LEFT JOIN inventory.items i ON i.id = l.item_id
      LEFT JOIN inventory.units iu ON iu.id = i.unit_id
      LEFT JOIN inventory.warehouses w ON w.id = l.warehouse_id
      WHERE l.invoice_id = $1
      ORDER BY l.line_number ASC
    `, [id]);

    return {
      ...invRes.rows[0],
      lines: linesRes.rows,
    };
  }

  static async createInvoice(dto: CreateInvoiceDto) {
    const db = await getDb();

    if (!dto.lines || dto.lines.length === 0) {
      throw new Error('يجب أن تحتوي الفاتورة على صنف أو خدمة واحدة على الأقل');
    }

    // Default company and branch
    let companyId = dto.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }

    let branchId = dto.branchId;
    if (!branchId) {
      const branchRes = await db.query<{ id: string }>('SELECT id FROM core.branches LIMIT 1');
      branchId = branchRes.rows[0]?.id;
    }

    // Calculate subtotal, discount, tax, total
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    const computedLines = dto.lines.map((l, idx) => {
      const qty = l.quantity || 1;
      const price = l.unitPrice || 0;
      const disc = l.discount || 0;
      const tax = l.tax || 0;
      const lineTotal = (qty * price) - disc + tax;

      subtotal += (qty * price);
      totalDiscount += disc;
      totalTax += tax;

      return {
        ...l,
        quantity: qty,
        unitPrice: price,
        discount: disc,
        tax: tax,
        lineTotal,
        lineNumber: idx + 1,
      };
    });

    const total = subtotal - totalDiscount + totalTax;

    // Generate invoice number
    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM sales.sales_invoices');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const invoiceNumber = `INV-2026-${seq.toString().padStart(4, '0')}`;

    // Due date defaults to 30 days from invoiceDate if not provided
    const dueDate = dto.dueDate || dto.invoiceDate;

    // PHASE 10.6.4 — header + lines persist in ONE transaction: a failing
    // line insert (e.g. FK violation) no longer leaves an orphan DRAFT
    // invoice with missing lines behind.
    return withTransaction(async () => {
      const invRes = await db.query<any>(`
        INSERT INTO sales.sales_invoices
        (company_id, branch_id, invoice_number, customer_id, payment_type, invoice_date, due_date, subtotal, discount, tax, total, paid_amount, status, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, 'DRAFT', $12, $13)
        RETURNING *
      `, [
        companyId,
        branchId,
        invoiceNumber,
        dto.customerId,
        dto.paymentType || 'CREDIT',
        dto.invoiceDate,
        dueDate,
        subtotal,
        totalDiscount,
        totalTax,
        total,
        dto.notes || null,
        dto.userId || null,
      ]);

      const invoice = invRes.rows[0];

      // Insert lines
      for (const line of computedLines) {
        await db.query(`
          INSERT INTO sales.sales_invoice_lines
          (invoice_id, item_id, warehouse_id, item_code, description, quantity, unit_price, discount, tax, line_total, line_number)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          invoice.id,
          line.itemId || null,
          line.warehouseId || null,
          line.itemCode || null,
          line.description,
          line.quantity,
          line.unitPrice,
          line.discount,
          line.tax,
          line.lineTotal,
          line.lineNumber,
        ]);
      }

      await logAudit({
        userId: dto.userId,
        username: dto.username,
        action: 'CREATE',
        entityType: 'SALES_INVOICE',
        entityId: invoice.id,
        newData: { invoice, lines: computedLines },
      });

      return { ...invoice, lines: computedLines };
    });
  }

  /**
   * PHASE 10.6.1 — تعديل مسودة فاتورة مبيعات فقط.
   *
   * لم يكن في النظام أي مسار تعديل. هذا المسار الأدنى مبني على نفس
   * حساب البنود المستخدم في createInvoice، ولا يمس أي قاعدة محاسبية:
   *   - يرفض المستندات POSTED / VOIDED (لا تعديل بعد الترحيل أو الإلغاء).
   *   - لا يغيّر رقم الفاتورة ولا الشركة/الفرع ولا created_by ولا paid_amount.
   *   - يستبدل بنود المسودة داخل معاملة واحدة، فلا تبقى بنود يتيمة عند الفشل.
   *   - يسجّل UPDATE في سجل التدقيق مع الهوية المستخرجة من الجلسة على الخادم.
   */
  static async updateInvoice(id: string, dto: CreateInvoiceDto) {
    const db = await getDb();

    if (!dto.lines || dto.lines.length === 0) {
      throw new Error('يجب أن تحتوي الفاتورة على صنف أو خدمة واحدة على الأقل');
    }

    const computed = dto.lines.map((l, idx) => {
      const qty = l.quantity || 1;
      const price = l.unitPrice || 0;
      const disc = l.discount || 0;
      const tax = l.tax || 0;
      return {
        ...l,
        quantity: qty,
        unitPrice: price,
        discount: disc,
        tax,
        lineTotal: qty * price - disc + tax,
        lineNumber: idx + 1,
      };
    });

    const subtotal = computed.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
    const totalDiscount = computed.reduce((sum, l) => sum + l.discount, 0);
    const totalTax = computed.reduce((sum, l) => sum + l.tax, 0);
    const total = subtotal - totalDiscount + totalTax;
    const dueDate = dto.dueDate || dto.invoiceDate;

    return withTransaction(async () => {
      const current = await db.query<any>(
        'SELECT * FROM sales.sales_invoices WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (current.rows.length === 0) {
        throw new Error(`الفاتورة برقم ${id} غير موجودة`);
      }
      const invoice = current.rows[0];
      if (invoice.status !== 'DRAFT') {
        throw new Error(
          invoice.status === 'POSTED'
            ? 'لا يمكن تعديل فاتورة مرحّلة محاسبياً. استخدم الإلغاء/العكس وفق قواعد النظام.'
            : 'لا يمكن تعديل فاتورة ملغاة.'
        );
      }

      const oldLines = await db.query<any>(
        'SELECT * FROM sales.sales_invoice_lines WHERE invoice_id = $1 ORDER BY line_number',
        [id]
      );

      const updatedRes = await db.query<any>(`
        UPDATE sales.sales_invoices
        SET customer_id = $2,
            payment_type = $3,
            invoice_date = $4,
            due_date = $5,
            subtotal = $6,
            discount = $7,
            tax = $8,
            total = $9,
            notes = $10,
            updated_at = NOW()
        WHERE id = $1 AND status = 'DRAFT'
        RETURNING *
      `, [
        id,
        dto.customerId,
        dto.paymentType || 'CREDIT',
        dto.invoiceDate,
        dueDate,
        subtotal,
        totalDiscount,
        totalTax,
        total,
        dto.notes || null,
      ]);

      if (updatedRes.rows.length === 0) {
        throw new Error('تعذر تعديل الفاتورة: تغيّرت حالتها أثناء الحفظ. أعد فتحها وحاول مجدداً.');
      }

      await db.query('DELETE FROM sales.sales_invoice_lines WHERE invoice_id = $1', [id]);

      for (const line of computed) {
        await db.query(`
          INSERT INTO sales.sales_invoice_lines
          (invoice_id, item_id, warehouse_id, item_code, description, quantity, unit_price, discount, tax, line_total, line_number)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          id,
          line.itemId || null,
          line.warehouseId || null,
          line.itemCode || null,
          line.description,
          line.quantity,
          line.unitPrice,
          line.discount,
          line.tax,
          line.lineTotal,
          line.lineNumber,
        ]);
      }

      const updated = updatedRes.rows[0];

      await logAudit({
        userId: dto.userId,
        username: dto.username,
        action: 'UPDATE',
        entityType: 'SALES_INVOICE',
        entityId: id,
        oldData: { invoice, lines: oldLines.rows },
        newData: { invoice: updated, lines: computed },
      });

      return { ...updated, lines: computed };
    });
  }

  /**
   * PHASE 9.1 — Atomic Posting of a Sales Invoice.
   *
   * Posting order — validate EVERYTHING before persisting ANYTHING:
   *   1. Validate invoice (status, totals)                    [no writes]
   *   2. Validate customer (+ credit limit)                  [no writes]
   *   3. Validate fiscal period is OPEN                      [no writes]
   *   4. Validate warehouse(s)                               [no writes]
   *   5. Validate stock availability for ALL stock lines     [no writes]
   *   6. Calculate WAC + COGS                                [no writes]
   *   7. Resolve accounts via Central Settings Mapping      [no writes]
   *   8. BEGIN TRANSACTION — persist everything atomically:
   *        sales journal (DR AR=gross / CR Revenue=net / CR OutputVAT=tax),
   *        invoice finalization, stock issue, COGS journal.
   *      COMMIT on success, ROLLBACK on ANY failure, so there is never:
   *        Invoice DRAFT + Journal POSTED,
   *        Invoice POSTED + Journal missing,
   *        Inventory changed + GL missing,
   *        GL changed + Inventory missing.
   */
  static async postSalesInvoice(invoiceId: string, userId?: string, allowOverride = false) {
    const db = await getDb();
    const invoice = await this.getInvoiceById(invoiceId);

    if (invoice.status === 'POSTED') {
      throw new Error('الفاتورة مرحلة بالفعل');
    }
    if (invoice.status === 'VOIDED') {
      throw new Error('لا يمكن ترحيل فاتورة ملغاة');
    }

    const subtotalAmount = parseFloat(invoice.subtotal);
    const discountAmount = parseFloat(invoice.discount);
    const taxAmount = parseFloat(invoice.tax);
    const totalAmount = parseFloat(invoice.total);
    if (totalAmount <= 0) {
      throw new Error('لا يمكن ترحيل فاتورة بقيمة صفر أو سالبة');
    }
    // Net revenue (ex-VAT): DR gross must equal CR net + CR VAT
    const netRevenue = subtotalAmount - discountAmount;
    if (netRevenue < 0) {
      throw new Error('صافي الفاتورة بعد الخصم سالب — راجع بنود الفاتورة والخصومات');
    }

    // ---- 1. Customer validation + credit control (no writes) ----
    const customer = await this.getCustomerById(invoice.customer_id);
    if (!customer.is_active) {
      throw new Error(`العميل "${customer.name}" معطل ولا يمكن ترحيل فواتير له`);
    }
    if (invoice.payment_type === 'CREDIT') {
      await this.checkCreditLimit(invoice.customer_id, totalAmount, allowOverride);
    }

    // ---- 2. Fiscal period must be OPEN for the invoice date (no writes) ----
    const periodRes = await db.query<any>(`
      SELECT id, status FROM accounting.fiscal_periods
      WHERE $1::date BETWEEN start_date AND end_date
      LIMIT 1
    `, [invoice.invoice_date]);
    if (periodRes.rows.length === 0 || periodRes.rows[0].status !== 'OPEN') {
      throw new Error(`الفترة المالية الخاصة بتاريخ الفاتورة (${invoice.invoice_date}) مغلقة أو غير متاحة للترحيل`);
    }

    // ---- 3. Resolve accounts via Central Settings Mapping (no writes) ----
    const salesAccountId = await SettingsService.getAccountMapping(
      'sales.default_revenue_account',
      '41',
      invoice.company_id
    );

    let debitAccountId: string;
    let debitDescription: string;

    if (invoice.payment_type === 'CASH') {
      debitAccountId = await SettingsService.getAccountMapping(
        'cash.default_cash_account',
        '1101',
        invoice.company_id
      );
      debitDescription = `مدين: الصندوق والخزينة (فاتورة مبيعات نقدية رقم ${invoice.invoice_number})`;
    } else {
      // Customer Receivables Account: from customer master or sales.default_ar_account setting
      debitAccountId = customer.receivables_account_id;
      if (!debitAccountId) {
        debitAccountId = await SettingsService.getAccountMapping(
          'sales.default_ar_account',
          '1103',
          invoice.company_id
        );
      }
      debitDescription = `مدين: حساب العميل ${customer.name} (فاتورة مبيعات آجلة رقم ${invoice.invoice_number})`;
    }

    // Dynamic output-VAT account — never a hardcoded business account.
    // Resolved only when the invoice actually carries tax (VAT-0 => no VAT line).
    let outputVatAccountId: string | null = null;
    if (taxAmount > 0) {
      outputVatAccountId = await SettingsService.getAccountMapping(
        'sales.default_output_tax_account',
        '2105',
        invoice.company_id
      );
    }

    // ---- 4/5. Warehouse + stock availability validation for ALL lines (no writes) ----
    // Any shortage throws HERE — before any journal/invoice row is created.
    const { InventoryService } = await import('./inventoryService.ts');
    // HOTFIX: shared deterministic default (same ordering rule the purchase
    // receipt uses), so an invoice can never be received in one warehouse and
    // issued from another purely because the two sides resolved "default"
    // differently.
    const defaultWhId = await InventoryService.getDefaultActiveWarehouse();

    const issueLines: any[] = [];
    let totalCOGS = 0;

    // PHASE 10.5.1 — inventory.auto_create_issue_on_sale existed as a key (and a
    // dead checkbox on the settings screen) but nothing ever read it: every
    // sales invoice always issued stock + booked COGS. The flag now gates the
    // whole block — stock validation, SALES_ISSUE movements and the COGS
    // journal — while the revenue journal is unaffected. Default remains true,
    // so existing behaviour does not change until someone switches it off.
    const autoIssueOn = await SettingsService.getSetting<boolean>('inventory.auto_create_issue_on_sale', { companyId: invoice.company_id });

    if (autoIssueOn && invoice.lines && invoice.lines.length > 0 && defaultWhId) {
      const allowNegative = await SettingsService.getSetting<boolean>('inventory.allow_negative_stock', { companyId: invoice.company_id });
      for (const l of invoice.lines) {
        let item: any = null;
        if (l.item_id || l.itemId) {
          const itemRes = await db.query<any>('SELECT * FROM inventory.items WHERE id = $1', [l.item_id || l.itemId]);
          if (itemRes.rows.length > 0) item = itemRes.rows[0];
        }
        if (!item) {
          const itemRes = await db.query<any>(
            'SELECT * FROM inventory.items WHERE (sku = $1 OR name = $2) AND is_stock_item = TRUE LIMIT 1',
            [l.item_code, l.description]
          );
          if (itemRes.rows.length > 0) item = itemRes.rows[0];
        }
        if (item && item.is_stock_item) {
          const targetWhId = l.warehouse_id || l.warehouseId || defaultWhId;
          await InventoryService.requireActiveWarehouse(
            targetWhId,
            `المستودع المحدد للصنف "${item.name}" غير موجود أو معطل — تم رفض الترحيل قبل إنشاء أي قيد`
          );
          const qty = parseFloat(l.quantity);
          const stockData = await InventoryService.getItemStock(item.id, targetWhId);

          if (!allowNegative && stockData.currentStock < qty) {
            throw new Error(
              `المخزون المتوفر للصنف "${item.name}" في المستودع (${stockData.currentStock}) غير كافٍ لصرف كمية الفاتورة (${qty}). تم رفض الترحيل لمنع الرصيد السالب.`
            );
          }

          const unitCost = stockData.averageCost;
          totalCOGS += (qty * unitCost);
          issueLines.push({
            itemId: item.id,
            quantity: qty,
            unitCost,
            // PHASE 9.5.1: the SELLING warehouse travels with the line so the
            // movement is posted (and WAC-valued) in the same warehouse the
            // COGS snapshot was taken from — never silently defaulted.
            warehouseId: targetWhId,
          });
        }
      }
    }

    // ---- 6. VAT-split journal lines: DR AR=gross / CR Revenue=net / CR OutputVAT=tax ----
    // Debit (gross) always equals credits (net + tax) by construction.
    const salesJournalLines: any[] = [
      {
        accountId: debitAccountId,
        debit: totalAmount,
        credit: 0,
        description: debitDescription,
      },
      {
        accountId: salesAccountId,
        debit: 0,
        credit: netRevenue,
        description: `دائن: إيرادات المبيعات (فاتورة رقم ${invoice.invoice_number})`,
      },
    ];
    if (taxAmount > 0 && outputVatAccountId) {
      salesJournalLines.push({
        accountId: outputVatAccountId,
        debit: 0,
        credit: taxAmount,
        description: `دائن: ضريبة القيمة المضافة على المبيعات (فاتورة رقم ${invoice.invoice_number})`,
      });
    }

    // ---- 7. ATOMIC COMMIT — persist everything or nothing ----
    // All queries below run on the shared PGlite connection inside one
    // BEGIN..COMMIT unit (see withTransaction in db.ts). Any throw rolls
    // back the sales journal, the invoice update, the stock issue and the
    // COGS journal together — no partial success is possible.
    const posted = await withTransaction(async () => {
      // 7a. Sales journal (creation + posting validate balance & open period)
      const journalEntry = await AccountingService.createJournalEntry({
        companyId: invoice.company_id,
        branchId: invoice.branch_id,
        entryDate: invoice.invoice_date,
        sourceId: 'SALES',
        description: `فاتورة مبيعات رقم ${invoice.invoice_number} للعميل ${invoice.customerName}`,
        lines: salesJournalLines,
        userId,
      });
      const postedJE = await AccountingService.postJournalEntry(journalEntry.id, userId);

      // 7b. Finalize the invoice (if CASH, mark paid in full)
      const paidAmount = invoice.payment_type === 'CASH' ? totalAmount : 0;
      await db.query(`
        UPDATE sales.sales_invoices
        SET status = 'POSTED', journal_entry_id = $1, paid_amount = $2, updated_at = NOW()
        WHERE id = $3
      `, [postedJE.id, paidAmount, invoiceId]);

      // 7c. Stock issue + COGS journal (same transaction — GL never diverges from inventory)
      // PHASE 9.5.1: one SALES_ISSUE per selling warehouse so every movement
      // is WAC-valued in its own warehouse (snapshot scope == movement scope
      // == replay scope). Single-warehouse sales still produce exactly one
      // movement; the COGS journal below stays a single invoice-level entry.
      if (issueLines.length > 0) {
        const issueByWarehouse = new Map<string, typeof issueLines>();
        for (const l of issueLines) {
          const key: string = l.warehouseId;
          if (!issueByWarehouse.has(key)) issueByWarehouse.set(key, []);
          issueByWarehouse.get(key)!.push({ itemId: l.itemId, quantity: l.quantity, unitCost: l.unitCost });
        }
        for (const [whId, group] of issueByWarehouse) {
          await InventoryService.createStockTransaction({
            transactionType: 'SALES_ISSUE',
            transactionDate: invoice.invoice_date,
            warehouseId: whId,
            referenceType: 'SALES_INVOICE',
            referenceId: invoiceId,
            notes: `صرف مخزني بموجب فاتورة مبيعات ${invoice.invoice_number}`,
            lines: group,
            companyId: invoice.company_id,
            userId,
          });
        }

        if (totalCOGS > 0) {
          const cogsAccId = await SettingsService.getAccountMapping('inventory.default_cogs_account', '5001', invoice.company_id);
          const invAccId = await SettingsService.getAccountMapping('inventory.default_inventory_account', '1104', invoice.company_id);

          const cogsJE = await AccountingService.createJournalEntry({
            companyId: invoice.company_id,
            branchId: invoice.branch_id,
            entryDate: invoice.invoice_date,
            sourceId: 'SYSTEM',
            description: `إثبات تكلفة البضاعة المباعة (COGS) لفاتورة مبيعات رقم ${invoice.invoice_number}`,
            lines: [
              {
                accountId: cogsAccId,
                debit: totalCOGS,
                credit: 0,
                description: `مدين: تكلفة المبيعات (COGS) - فاتورة ${invoice.invoice_number}`,
              },
              {
                accountId: invAccId,
                debit: 0,
                credit: totalCOGS,
                description: `دائن: المخزون السلعي (تخفيض التكلفة) - فاتورة ${invoice.invoice_number}`,
              },
            ],
            userId,
          });
          await AccountingService.postJournalEntry(cogsJE.id, userId);
        }
      }

      await logAudit({
        userId,
        action: 'POST',
        entityType: 'SALES_INVOICE',
        entityId: invoiceId,
        newData: { invoiceId, journalEntryId: postedJE.id, totalAmount, netRevenue, taxAmount, paymentType: invoice.payment_type },
      });

      return postedJE;
    });

    return {
      success: true,
      message: 'تم ترحيل فاتورة المبيعات بنجاح وتوليد القيد المحاسبي المتوازن',
      invoiceId,
      journalEntryId: posted.id,
      journalEntryNumber: posted.entry_number,
    };
  }

  /**
   * Voids a sales invoice:
   * If posted, reverses the linked journal entry.
   */
  static async voidSalesInvoice(invoiceId: string, userId?: string) {
    const db = await getDb();
    const invoice = await this.getInvoiceById(invoiceId);

    if (invoice.status === 'VOIDED') {
      throw new Error('الفاتورة ملغاة بالفعل');
    }

    // PHASE 10.6.4 — the whole cancellation is ONE transaction: the journal
    // reversal, the stock-movement cancellation and the status change either
    // all land or none does. A failure could previously leave a REVERSED
    // journal behind a POSTED (or vice versa) invoice that a retry could not
    // repair. Audit history is preserved — stock rows are flagged VOIDED
    // (a status the schema already defines), never deleted.
    return withTransaction(async () => {
      if (invoice.status === 'POSTED' && invoice.journal_entry_id) {
        // Reverse the journal entry
        await AccountingService.reverseJournalEntry(invoice.journal_entry_id, userId);
      }

      // PHASE 10.6.4 — cancel the stock movements the invoice created
      // (SALES_ISSUE). Quantity and valuation replays count only POSTED
      // stock transactions, so flagging them VOIDED restores the stock
      // subledger to its pre-invoice state and keeps it aligned with the
      // reversed GL (COGS/inventory journal legs already undone above).
      const stockVoidRes = await db.query<any>(`
        UPDATE inventory.stock_transactions
           SET status = 'VOIDED'
         WHERE reference_type = 'SALES_INVOICE' AND reference_id = $1 AND status = 'POSTED'
        RETURNING id
      `, [invoiceId]);
      const stockMovementsVoided = stockVoidRes.rows.length;

      await db.query(`
        UPDATE sales.sales_invoices
        SET status = 'VOIDED', updated_at = NOW()
        WHERE id = $1
      `, [invoiceId]);

      await logAudit({
        userId,
        action: 'UPDATE',
        entityType: 'SALES_INVOICE',
        entityId: invoiceId,
        oldData: invoice,
        newData: { status: 'VOIDED', journalReversed: Boolean(invoice.status === 'POSTED' && invoice.journal_entry_id), stockMovementsVoided },
      });

      return { success: true, message: 'تم إلغاء فاتورة المبيعات وعكس قيدها المحاسبي وإلغاء حركاتها المخزنية' };
    });
  }

  // ==========================================
  // Receipts (سندات القبض)
  // ==========================================

  static async getReceipts(limit = 50) {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT
        r.*,
        c.name as "customerName",
        c.code as "customerCode",
        cp.name as "counterpartyAccountName",
        cp.code as "counterpartyAccountCode",
        a.name as "targetAccountName",
        a.code as "targetAccountCode",
        b.name as "branchName",
        je.entry_number as "journalEntryNumber"
      FROM sales.receipts r
      LEFT JOIN sales.customers c ON c.id = r.customer_id
      LEFT JOIN accounting.accounts cp ON cp.id = r.counterparty_account_id
      JOIN accounting.accounts a ON a.id = r.target_account_id
      LEFT JOIN core.branches b ON b.id = r.branch_id
      LEFT JOIN accounting.journal_entries je ON je.id = r.journal_entry_id
      ORDER BY r.receipt_date DESC, r.created_at DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  }

  static async getReceiptById(id: string) {
    const db = await getDb();
    const rRes = await db.query<any>(`
      SELECT
        r.*,
        c.name as "customerName",
        c.code as "customerCode",
        cp.name as "counterpartyAccountName",
        cp.code as "counterpartyAccountCode",
        a.name as "targetAccountName",
        a.code as "targetAccountCode",
        b.name as "branchName",
        je.entry_number as "journalEntryNumber",
        cu.username as "createdByName",
        lm.username as "lastModifiedByName",
        lm.timestamp as "lastModifiedAt"
      FROM sales.receipts r
      LEFT JOIN sales.customers c ON c.id = r.customer_id
      LEFT JOIN accounting.accounts cp ON cp.id = r.counterparty_account_id
      JOIN accounting.accounts a ON a.id = r.target_account_id
      LEFT JOIN core.branches b ON b.id = r.branch_id
      LEFT JOIN accounting.journal_entries je ON je.id = r.journal_entry_id
      LEFT JOIN security.users cu ON cu.id = r.created_by
      LEFT JOIN LATERAL (
        SELECT al.username, al.timestamp
        FROM audit.audit_logs al
        WHERE al.entity_type = 'RECEIPT'
          AND al.entity_id = r.id::text
          AND al.action = 'UPDATE'
          AND al.user_id IS NOT NULL
        ORDER BY al.timestamp DESC
        LIMIT 1
      ) lm ON TRUE
      WHERE r.id = $1
    `, [id]);

    if (rRes.rows.length === 0) {
      throw new Error(`سند القبض برقم ${id} غير موجود`);
    }

    const allocRes = await db.query<any>(`
      SELECT 
        ra.*,
        inv.invoice_number as "invoiceNumber",
        inv.total as "invoiceTotal"
      FROM sales.receipt_allocations ra
      JOIN sales.sales_invoices inv ON inv.id = ra.invoice_id
      WHERE ra.receipt_id = $1
    `, [id]);

    return {
      ...rRes.rows[0],
      allocations: allocRes.rows,
    };
  }

  /**
   * Updates a DRAFT receipt voucher — server-enforced (server re-validates
   * status, company/branch scope, counterparty, vehicle, amount and every
   * allocation against the invoice's remaining balance, excluding this
   * voucher's own old allocations and including other Draft receipts'
   * allocations). The entire update (header + allocations + audit) runs
   * inside withTransaction; POSTED/VOIDED/journaled vouchers are refused.
   * companyId/branchId from the body are IGNORED — scope is checked inside
   * updateReceiptAgainstScope via the stored voucher ownership.
   */
  static async updateReceipt(
    id: string,
    dto: Omit<CreateReceiptDto, 'companyId' | 'branchId'> & {
      expectedUpdatedAt?: string | null;
      username?: string;
    },
  ) {
    const db = await getDb();

    if (dto.amount <= 0) {
      throw new Error('مبلغ سند القبض يجب أن يكون أكبر من صفر');
    }

    return withTransaction(async () => {
      // Re-read the voucher inside the transaction (row lock) — any concurrent
      // post/void between form-load and save is detected here.
      const curRes = await db.query<any>(
        'SELECT * FROM sales.receipts WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (curRes.rows.length === 0) {
        throw new Error(`سند القبض برقم ${id} غير موجود`);
      }
      const old = curRes.rows[0];

      if (old.status !== 'DRAFT') {
        throw new Error(
          old.status === 'POSTED'
            ? 'لا يمكن تعديل سند قبض مرحّل. لا يُعدَّل القيد المحاسبي مباشرة.'
            : 'لا يمكن تعديل سند قبض ملغى.',
        );
      }
      if (old.journal_entry_id) {
        throw new Error('لا يمكن تعديل سند قبض لديه قيد محاسبي مُرحّل. لا يُعدَّل القيد مباشرة.');
      }
      if (dto.expectedUpdatedAt) {
        // PGlite يُعيد timestamptz ككائن Date، بينما يصل للعميل كنص ISO عبر JSON.
        // المقارنة كنص تُفشل كل عملية تعديل حتى لو لم تتغير البيانات، لذا تُقارن
        // بالقيمة الزمنية الموحّدة (milliseconds) مع تجاهل القيم غير الصالحة.
        const expected = new Date(dto.expectedUpdatedAt).getTime();
        const actual = new Date(old.updated_at).getTime();
        if (Number.isFinite(expected) && Number.isFinite(actual) && expected !== actual) {
          throw new Error('تعذر تعديل سند القبض: تغيّرت بياناته أثناء التحرير. أعد فتحه وحاول مجدداً.');
        }
      }

      const companyId = old.company_id;

      // --- counterparty resolution (same as create) ---
      const counterpartyTypeInput = (dto.counterpartyType || '').toString().toUpperCase() || old.counterparty_type || '';
      if (counterpartyTypeInput && VOUCHER_COUNTERPARTY_TYPES.includes(counterpartyTypeInput as any) === false) {
        throw new Error('نوع الحساب غير معروف — الأنواع المتاحة: عميل/مورد/موظف/حساب عام/صندوق/بنك');
      }
      const counterpartyType = counterpartyTypeInput as VoucherCounterpartyType;

      // سند القبض لا يخزّن supplier_id في النمط القديم؛ إذا كان الطرف «مورداً»
      // نسترد معرّفه من ربطه بحساب الذمم المحفوظ في السند حتى ينجح التحقق.
      let resolvedSupplierId = dto.supplierId || null;
      if (counterpartyType === 'SUPPLIER' && !resolvedSupplierId && dto.counterpartyAccountId) {
        const supRes = await db.query<any>(
          'SELECT id FROM purchasing.suppliers WHERE payables_account_id = $1 AND company_id = $2 LIMIT 1',
          [dto.counterpartyAccountId, companyId],
        );
        resolvedSupplierId = supRes.rows[0]?.id || null;
      }

      const counterparty = await resolveCounterparty({
        type: counterpartyType as any,
        counterpartyAccountId: dto.counterpartyAccountId || null,
        customerId: dto.customerId || null,
        supplierId: resolvedSupplierId,
        companyId,
        voucherKind: 'RECEIPT',
      });

      if (counterparty.type !== 'CUSTOMER' && dto.allocations && dto.allocations.length > 0) {
        throw new Error('مخصصات الفواتير تُقبل فقط عند قيد سند القبض على عميل — أفرغ التخصيصات لحفظ السند');
      }

      // --- vehicle / collection account (same as create) ---
      let targetAccountId: string | undefined;
      let resolvedPaymentMethod: 'CASH' | 'BANK' = dto.paymentMethod === 'BANK' ? 'BANK' : (dto.paymentMethod || 'CASH');
      if (dto.targetVehicleId) {
        const vehicle = await resolveVehicle(dto.targetVehicleId, resolvedPaymentMethod, companyId);
        targetAccountId = vehicle.accountId;
        resolvedPaymentMethod = vehicle.category;
      } else if (dto.targetAccountId) {
        const accRes = await db.query<any>(
          'SELECT id FROM accounting.accounts WHERE id = $1 AND company_id = $2 AND is_active = TRUE AND is_group = FALSE',
          [dto.targetAccountId, companyId],
        );
        if (accRes.rows.length === 0) {
          throw new Error('حساب التحصيل المحدد غير موجود أو معطل أو تجميعي');
        }
        targetAccountId = accRes.rows[0].id;
      } else {
        const code = resolvedPaymentMethod === 'BANK' ? '1102' : '1101';
        const accRes = await db.query<any>('SELECT id FROM accounting.accounts WHERE code = $1 LIMIT 1', [code]);
        targetAccountId = accRes.rows[0]?.id;
      }
      if (!targetAccountId) {
        throw new Error('لم يتم تحديد حساب وسيلة التحصيل (صندوق/بنك)');
      }
      if (targetAccountId === counterparty.accountId) {
        throw new Error('حساب الطرف المقابل متطابق مع حساب وسيلة التحصيل — القبض يجب أن يكون من طرف مختلف عن وسيلة التحصيل');
      }

      // --- allocations: validate fully against invoices and remaining
      // balances, excluding this voucher's own old allocations (so they are
      // not double-counted), under a row lock on each invoice. ---
      const allocList = (dto.allocations || []).filter((a) => a.amount > 0);
      let totalAlloc = 0;
      if (allocList.length > 0) {
        for (const a of allocList) {
          const invRes = await db.query<any>(
            `SELECT inv.id, inv.total, inv.paid_amount
               FROM sales.sales_invoices inv
              WHERE inv.id = $1 AND inv.company_id = $2
              FOR UPDATE`,
            [a.invoiceId, companyId],
          );
          if (invRes.rows.length === 0) {
            throw new Error(`الفاتورة برقم ${a.invoiceId} غير موجودة`);
          }
          const inv = invRes.rows[0];
          const otherDraftRes = await db.query<any>(
            `SELECT COALESCE(SUM(ra.allocated_amount), 0) AS other_allocated
               FROM sales.receipt_allocations ra
               JOIN sales.receipts r ON r.id = ra.receipt_id
              WHERE ra.invoice_id = $1
                AND ra.receipt_id <> $2
                AND r.status = 'DRAFT'`,
            [a.invoiceId, id],
          );
          const invoiceTotal = parseFloat(inv.total);
          const paidAmount = parseFloat(inv.paid_amount || '0');
          const otherDraft = parseFloat(otherDraftRes.rows[0]?.other_allocated || '0');
          const remaining = invoiceTotal - paidAmount - otherDraft;
          if (a.amount > remaining) {
            throw new Error(
              `المبلغ المخصص (${Number(a.amount).toLocaleString()}) للفاتورة ${a.invoiceId}` +
              ` يتجاوز الرصيد المتاح منها (${Number(remaining).toLocaleString()})`,
            );
          }
          totalAlloc += a.amount;
        }
        if (totalAlloc > dto.amount) {
          throw new Error(
            `إجمالي المبالغ المخصصة (${totalAlloc.toLocaleString()}) يتجاوز مبلغ سند القبض (${dto.amount.toLocaleString()})`,
          );
        }
      }

      const unallocated = dto.amount - totalAlloc;
      const descriptionDefault =
        counterparty.type === 'CUSTOMER'
          ? 'سند قبض نقدي/بنكي من العميل'
          : `سند قبض على ${COUNTERPARTY_TYPE_LABELS_AR[counterparty.type as keyof typeof COUNTERPARTY_TYPE_LABELS_AR] || counterparty.type}: ${counterparty.label}`;

      const updatedRes = await db.query<any>(
        `UPDATE sales.receipts
            SET customer_id = $2,
                counterparty_type = $3,
                counterparty_account_id = $4,
                payment_method = $5,
                target_account_id = $6,
                receipt_date = $7,
                amount = $8,
                allocated_amount = $9,
                unallocated_amount = $10,
                reference_number = $11,
                description = $12,
                updated_at = NOW()
          WHERE id = $1 AND status = 'DRAFT' AND journal_entry_id IS NULL
          RETURNING *`,
        [
          id,
          counterparty.customerId || null,
          counterparty.type,
          counterparty.customerId ? null : counterparty.accountId,
          resolvedPaymentMethod,
          targetAccountId,
          dto.receiptDate,
          dto.amount,
          totalAlloc,
          unallocated,
          dto.referenceNumber || null,
          dto.description || descriptionDefault,
        ],
      );

      if (updatedRes.rows.length === 0) {
        throw new Error('تعذر تعديل سند القبض: تغيّرت حالته أثناء الحفظ. أعد فتحه وحاول مجدداً.');
      }
      const updated = updatedRes.rows[0];

      // --- replace allocations atomically (same transaction) ---
      await db.query('DELETE FROM sales.receipt_allocations WHERE receipt_id = $1', [id]);
      for (const a of allocList) {
        await db.query(
          `INSERT INTO sales.receipt_allocations (receipt_id, invoice_id, allocated_amount)
           VALUES ($1, $2, $3)`,
          [id, a.invoiceId, a.amount],
        );
      }

      const oldAllocRes = await db.query<any>(
        'SELECT invoice_id, allocated_amount FROM sales.receipt_allocations WHERE receipt_id = $1',
        [id],
      );

      await logAuditStrict({
        userId: dto.userId,
        username: dto.username,
        action: 'UPDATE',
        entityType: 'RECEIPT',
        entityId: id,
        oldData: { receipt: old },
        newData: { receipt: updated, allocations: allocList },
      });

      return { ...updated, allocations: oldAllocRes.rows };
    });
  }

  static async createReceipt(dto: CreateReceiptDto) {
    const db = await getDb();

    if (dto.amount <= 0) {
      throw new Error('مبلغ سند القبض يجب أن يكون أكبر من صفر');
    }

    // Default company and branch
    let companyId = dto.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }

    let branchId = dto.branchId;
    if (!branchId) {
      const branchRes = await db.query<{ id: string }>('SELECT id FROM core.branches LIMIT 1');
      branchId = branchRes.rows[0]?.id;
    }

    // ------------------------------------------------------------------
    // الطرف المقابل على مرحلتين: نوع الحساب ثم الحساب.
    // النمط القديم (customerId فقط) يظل يعمل ويُعامل كنوع «عميل».
    // ------------------------------------------------------------------
    const counterpartyTypeInput = (dto.counterpartyType || '').toString().toUpperCase();
    if (counterpartyTypeInput && VOUCHER_COUNTERPARTY_TYPES.includes(counterpartyTypeInput as any) === false) {
      throw new Error('نوع الحساب غير معروف — الأنواع المتاحة: عميل/مورد/موظف/حساب عام/صندوق/بنك');
    }
    const counterpartyType = (
      counterpartyTypeInput ||
      (dto.customerId ? 'CUSTOMER' : dto.supplierId ? 'SUPPLIER' : '')
    ) as VoucherCounterpartyType;

    const counterparty = await resolveCounterparty({
      type: counterpartyType as any,
      counterpartyAccountId: dto.counterpartyAccountId || null,
      customerId: dto.customerId || null,
      supplierId: dto.supplierId || null,
      companyId,
      voucherKind: 'RECEIPT',
    });

    // المخصصات تُقيد على فواتير العميل فقط — بخلاف ذلك لا معنى لها.
    if (counterparty.type !== 'CUSTOMER' && dto.allocations && dto.allocations.length > 0) {
      throw new Error('مخصصات الفواتير تُقبل فقط عند قيد سند القبض على عميل — أفرغ التخصيصات لحفظ السند');
    }

    // ------------------------------------------------------------------
    // وسيلة التحصيل (الصندوق/البنك الذي استُلمت فيه الأموال):
    //   أولوية 1: targetVehicleId (تعريف صندوق/بنك فعلي → يُحلّ حسابه على الخادم)
    //   أولوية 2: targetAccountId (حساب GL صريح — بديل متوافق للنماذج القديمة)
    //   افتراضي: 1101 نقدي / 1102 بنكي (سلوك التوافق السابق)
    // ------------------------------------------------------------------
    let targetAccountId: string | undefined;
    let resolvedPaymentMethod: 'CASH' | 'BANK' = dto.paymentMethod === 'BANK' ? 'BANK' : 'CASH';

    if (dto.targetVehicleId) {
      const vehicle = await resolveVehicle(dto.targetVehicleId, resolvedPaymentMethod, companyId);
      targetAccountId = vehicle.accountId;
      resolvedPaymentMethod = vehicle.category; // نوع الحركة يتبع وسيلة التحصيل الفعلية
    } else if (dto.targetAccountId) {
      const accRes = await db.query<any>(
        'SELECT id FROM accounting.accounts WHERE id = $1 AND company_id = $2 AND is_active = TRUE AND is_group = FALSE',
        [dto.targetAccountId, companyId]
      );
      if (accRes.rows.length === 0) {
        throw new Error('حساب التحصيل المحدد غير موجود أو معطل أو تجميعي');
      }
      targetAccountId = accRes.rows[0].id;
    } else {
      const code = resolvedPaymentMethod === 'BANK' ? '1102' : '1101';
      const accRes = await db.query<any>('SELECT id FROM accounting.accounts WHERE code = $1 LIMIT 1', [code]);
      targetAccountId = accRes.rows[0]?.id;
    }

    if (!targetAccountId) {
      throw new Error(
        'لم يتم تحديد حساب وسيلة التحصيل (صندوق/بنك) — اختر الصندوق أو البنك الذي استُلمت فيه الأموال'
      );
    }

    // منع قيد الطرف مقابل نفس حساب وسيلة التحصيل (مدين ودائن لحساب واحد بلا معنى محاسبي)
    if (targetAccountId === counterparty.accountId) {
      throw new Error(
        'حساب الطرف المقابل متطابق مع حساب وسيلة التحصيل (الصندوق/البنك) — القبض يجب أن يكون من طرف مختلف عن وسيلة التحصيل'
      );
    }

    // Generate receipt number
    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM sales.receipts');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const receiptNumber = `RCV-2026-${seq.toString().padStart(4, '0')}`;

    // Validate allocations if provided
    let totalAlloc = 0;
    if (dto.allocations && dto.allocations.length > 0) {
      for (const a of dto.allocations) {
        // وجود الفاتورة يُفحص هنا بنفس نمط سندات الصرف
        // (purchasingService.createPayment): الفاتورة المعدومة تُرفض بخطأ
        // بيانات (400) قبل أي إدراج، بدل أن يسقط الإدراج على سياسة WITH
        // CHECK في RLS (SQLSTATE 42501) فتُعاد كخطأ نطاق (403) مضلِّل.
        const invRes = await db.query<{ id: string }>(
          'SELECT id FROM sales.sales_invoices WHERE id = $1 AND company_id = $2',
          [a.invoiceId, companyId]
        );
        if (invRes.rows.length === 0) {
          throw new Error(`الفاتورة برقم ${a.invoiceId} غير موجودة`);
        }
        totalAlloc += a.amount;
      }
      if (totalAlloc > dto.amount) {
        throw new Error(`إجمالي المبالغ المخصصة (${totalAlloc.toLocaleString()}) يتجاوز مبلغ سند القبض (${dto.amount.toLocaleString()})`);
      }
    }

    const unallocated = dto.amount - totalAlloc;
    const descriptionDefault = counterparty.type === 'CUSTOMER'
      ? 'سند قبض نقدي/بنكي من العميل'
      : `سند قبض على ${COUNTERPARTY_TYPE_LABELS_AR[counterparty.type as keyof typeof COUNTERPARTY_TYPE_LABELS_AR] || counterparty.type}: ${counterparty.label}`;

    // PHASE 10.6.4 — receipt header + allocations persist in ONE
    // transaction: an invalid allocation (e.g. unknown invoice) can no
    // longer leave a header row with missing allocations behind.
    return withTransaction(async () => {
      const rRes = await db.query<any>(`
        INSERT INTO sales.receipts
        (company_id, branch_id, receipt_number, customer_id, counterparty_type, counterparty_account_id, payment_method, target_account_id, receipt_date, amount, allocated_amount, unallocated_amount, reference_number, description, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'DRAFT', $15)
        RETURNING *
      `, [
        companyId,
        branchId,
        receiptNumber,
        counterparty.customerId || null,
        counterparty.type,
        counterparty.customerId ? null : counterparty.accountId,
        resolvedPaymentMethod,
        targetAccountId,
        dto.receiptDate,
        dto.amount,
        totalAlloc,
        unallocated,
        dto.referenceNumber || null,
        dto.description || descriptionDefault,
        dto.userId || null,
      ]);

      const receipt = rRes.rows[0];

      // Save allocations
      if (dto.allocations && dto.allocations.length > 0) {
        for (const a of dto.allocations) {
          await db.query(`
            INSERT INTO sales.receipt_allocations (receipt_id, invoice_id, allocated_amount)
            VALUES ($1, $2, $3)
          `, [receipt.id, a.invoiceId, a.amount]);
        }
      }

      await logAudit({
        userId: dto.userId,
        action: 'CREATE',
        entityType: 'RECEIPT',
        entityId: receipt.id,
        newData: { receipt, allocations: dto.allocations },
      });

      return receipt;
    });
  }

  /**
   * Posts a Receipt:
   * 1. Validates receipt
   * 2. Creates and posts balanced Journal Entry:
   *    Debit: Cash/Bank Account (1101 or 1102)
   *    Credit: Customer Receivables Account (1103)
   * 3. Allocates payment towards invoices (updates invoice.paid_amount)
   * 4. Updates receipt status to POSTED
   */
  static async postReceipt(receiptId: string, userId?: string) {
    const db = await getDb();
    const receipt = await this.getReceiptById(receiptId);

    if (receipt.status === 'POSTED') {
      throw new Error('سند القبض مرحل بالفعل');
    }
    if (receipt.status === 'VOIDED') {
      throw new Error('لا يمكن ترحيل سند قبض ملغى');
    }

    const amount = parseFloat(receipt.amount);
    const counterpartyType = (receipt.counterparty_type || 'CUSTOMER') as VoucherCounterpartyType;

    // ------------------------------------------------------------------
    // مدين: حساب وسيلة التحصيل (target_account_id)
    // دائن: حساب الطرف المقابل —
    //   * أنواع جديدة: counterparty_account_id المحفوظ (المُتحقَّق منه عند
    //     الإنشاء) إعادة التحقق قبل الترحيل؛
    //   * النمط القديم (عميل): receivables_account_id للعميل مع
    //     الافتراضي المعتمد 1103.
    // اتجاه القيد لم يتغير عمّا هو عليه في النظام.
    // ------------------------------------------------------------------
    let receivablesAccountId: string;
    let counterpartyLabel: string;
    if (receipt.counterparty_account_id) {
      const cpAcc = await db.query<any>(
        'SELECT id, code, name, is_group, is_active FROM accounting.accounts WHERE id = $1',
        [receipt.counterparty_account_id]
      );
      const acc = cpAcc.rows[0];
      if (!acc) {
        throw new Error('حساب الطرف المقابل لسند القبض غير موجود في دليل الحسابات');
      }
      if (acc.is_group) {
        throw new Error(`حساب الطرف المقابل «${acc.code} - ${acc.name}» تجميعي ولا يقبل التحليل — لا يمكن الترحيل`);
      }
      if (acc.is_active === false) {
        throw new Error(`حساب الطرف المقابل «${acc.code} - ${acc.name}» معطل — لا يمكن الترحيل`);
      }
      receivablesAccountId = acc.id;
      counterpartyLabel = `${COUNTERPARTY_TYPE_LABELS_AR[counterpartyType] || 'طرف مقابل'} ${acc.code} - ${acc.name}`;
    } else if (counterpartyType === 'CUSTOMER' && receipt.customer_id) {
      const customer = await this.getCustomerById(receipt.customer_id);

      // Receivables Account: linked account or default 1103
      receivablesAccountId = customer.receivables_account_id;
      if (!receivablesAccountId) {
        const defAcc = await db.query<any>(
          "SELECT id FROM accounting.accounts WHERE code = '1103' LIMIT 1"
        );
        receivablesAccountId = defAcc.rows[0]?.id || null;
      }
      if (!receivablesAccountId) {
        throw new Error(
          `العميل «${customer.name}» غير مربوط بحساب محاسبي للذمم ولا يوجد الحساب الافتراضي 1103 — ليّن ربط العميل بحساب الذمم ثم أعد الترحيل`
        );
      }
      counterpartyLabel = `العميل ${customer.name}`;
    } else {
      throw new Error('سند القبض لا يملك طرفاً مقابلًا صالحًا للترحيل — راجع بيانات السند');
    }

    // Target Account: Cash or Bank
    const targetAccountId = receipt.target_account_id;

    // 1-4. PHASE 10.6.4 — ATOMIC COMMIT. The JE creation, its posting, the
    // invoice paid_amount updates and the receipt status change used to run
    // as separate statements: a failure between them left a POSTED journal
    // behind a DRAFT receipt, and a resubmission would then book the money
    // effect twice. Everything below is one transaction now — a retry can
    // only ever happen from a state where nothing was written.
    return withTransaction(async () => {
      const journalEntry = await AccountingService.createJournalEntry({
        companyId: receipt.company_id,
        branchId: receipt.branch_id,
        entryDate: receipt.receipt_date,
        sourceId: 'RECEIPTS',
        description: `سند قبض رقم ${receipt.receipt_number} من ${counterpartyLabel}`,
        lines: [
          {
            accountId: targetAccountId,
            debit: amount,
            credit: 0,
            description: `مدين: ${receipt.targetAccountName} (سند قبض رقم ${receipt.receipt_number})`,
          },
          {
            accountId: receivablesAccountId,
            debit: 0,
            credit: amount,
            description: `دائن: ${counterpartyLabel} (سند قبض رقم ${receipt.receipt_number})`,
          },
        ],
        userId,
      });

      // 2. Post Journal Entry
      const postedJE = await AccountingService.postJournalEntry(journalEntry.id, userId);

      // 3. Update allocated invoices
      if (receipt.allocations && receipt.allocations.length > 0) {
        for (const alloc of receipt.allocations) {
          await db.query(`
            UPDATE sales.sales_invoices
            SET paid_amount = paid_amount + $1, updated_at = NOW()
            WHERE id = $2
          `, [alloc.allocated_amount, alloc.invoice_id]);
        }
      }

      // 4. Mark receipt as POSTED
      await db.query(`
        UPDATE sales.receipts
        SET status = 'POSTED', journal_entry_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [postedJE.id, receiptId]);

      await logAudit({
        userId,
        action: 'POST',
        entityType: 'RECEIPT',
        entityId: receiptId,
        newData: { receiptId, journalEntryId: postedJE.id, amount },
      });

      return {
        success: true,
        message: 'تم ترحيل سند القبض بنجاح وتوليد القيد المحاسبي وتحديث رصيد العميل',
        receiptId,
        journalEntryId: postedJE.id,
        journalEntryNumber: postedJE.entry_number,
      };
    });
  }

  // ==========================================
  // Customer Statement & Reports
  // ==========================================

  static async getCustomerStatement(customerId: string, fromDate?: string, toDate?: string, branchId?: string) {
    const db = await getDb();
    const customer = await this.getCustomerById(customerId);

    // 1. Calculate Opening Balance before fromDate
    let openingBalance = 0;
    if (fromDate) {
      let opQuery = `
        SELECT 
          COALESCE(SUM(
            CASE 
              WHEN src = 'INV' THEN total
              WHEN src = 'REC' THEN -amount
              WHEN src = 'RET' THEN -total
              ELSE 0 
            END
          ), 0) as op_bal
        FROM (
          SELECT 'INV' as src, total, 0 as amount, invoice_date as doc_date, branch_id
          FROM sales.sales_invoices
          WHERE customer_id = $1 AND status = 'POSTED' AND payment_type = 'CREDIT'
          
          UNION ALL
          
          SELECT 'REC' as src, 0 as total, amount, receipt_date as doc_date, branch_id
          FROM sales.receipts
          WHERE customer_id = $1 AND status = 'POSTED'

          UNION ALL

          SELECT 'RET' as src, total, 0 as amount, return_date as doc_date, branch_id
          FROM sales.sales_returns
          WHERE customer_id = $1 AND status = 'POSTED'
        ) t
        WHERE doc_date < $2
      `;
      const opParams: any[] = [customerId, fromDate];
      if (branchId) {
        opParams.push(branchId);
        opQuery += ` AND branch_id = $${opParams.length}`;
      }
      const opRes = await db.query<any>(opQuery, opParams);
      openingBalance = parseFloat(opRes.rows[0]?.op_bal || '0');
    }

    // 2. Fetch Period Transactions
    let query = `
      SELECT 
        'INVOICE' as "type",
        invoice_number as "docNumber",
        invoice_date as "docDate",
        COALESCE(notes, 'فاتورة مبيعات آجل') as "description",
        total as "debit",
        0 as "credit",
        created_at,
        branch_id
      FROM sales.sales_invoices
      WHERE customer_id = $1 AND status = 'POSTED' AND payment_type = 'CREDIT'

      UNION ALL

      SELECT 
        'RECEIPT' as "type",
        receipt_number as "docNumber",
        receipt_date as "docDate",
        COALESCE(description, 'سند قبض وتحصيل') as "description",
        0 as "debit",
        amount as "credit",
        created_at,
        branch_id
      FROM sales.receipts
      WHERE customer_id = $1 AND status = 'POSTED'

      UNION ALL

      SELECT 
        'RETURN' as "type",
        return_number as "docNumber",
        return_date as "docDate",
        COALESCE(notes, 'مردود مبيعات (إشعار دائن)') as "description",
        0 as "debit",
        total as "credit",
        created_at,
        branch_id
      FROM sales.sales_returns
      WHERE customer_id = $1 AND status = 'POSTED'
    `;

    const conditions: string[] = [];
    const params: any[] = [customerId];

    if (fromDate) {
      params.push(fromDate);
      conditions.push(`"docDate" >= $${params.length}`);
    }
    if (toDate) {
      params.push(toDate);
      conditions.push(`"docDate" <= $${params.length}`);
    }
    if (branchId) {
      params.push(branchId);
      conditions.push(`branch_id = $${params.length}`);
    }

    let wrappedQuery = `SELECT * FROM (${query}) q`;
    if (conditions.length > 0) {
      wrappedQuery += ` WHERE ${conditions.join(' AND ')}`;
    }
    wrappedQuery += ` ORDER BY "docDate" ASC, created_at ASC`;

    const txRes = await db.query<any>(wrappedQuery, params);

    let runningBalance = openingBalance;
    const items = txRes.rows.map((row: any) => {
      const debit = parseFloat(row.debit || '0');
      const credit = parseFloat(row.credit || '0');
      runningBalance += (debit - credit);

      return {
        type: row.type === 'INVOICE' ? 'فاتورة مبيعات' : row.type === 'RECEIPT' ? 'سند قبض' : 'مردود مبيعات',
        reference: row.docNumber,
        docNumber: row.docNumber,
        // A raw Date serialises to a full ISO timestamp, which then prints as
        // `2026-10-12T00:00:00.000Z`. The report registry column is a plain
        // date, so the alias carries yyyy-mm-dd like the supplier statement.
        date: row.docDate ? new Date(row.docDate).toISOString().split('T')[0] : null,
        docDate: row.docDate,
        description: row.description,
        debit,
        credit,
        balance: runningBalance,
        runningBalance,
      };
    });

    return {
      customer,
      customerId,
      customerName: customer.name,
      customerCode: customer.code,
      openingBalance,
      totalDebit: items.reduce((sum, i) => sum + i.debit, 0),
      totalCredit: items.reduce((sum, i) => sum + i.credit, 0),
      closingBalance: runningBalance,
      finalBalance: runningBalance,
      entries: items,
      items,
      rows: items,
    };
  }

  static async getUnpaidInvoices(customerId: string) {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        inv.*,
        (inv.total - inv.paid_amount) as "remainingAmount"
      FROM sales.sales_invoices inv
      WHERE inv.customer_id = $1 
        AND inv.status = 'POSTED' 
        AND (inv.total - inv.paid_amount) > 0
      ORDER BY inv.invoice_date ASC
    `, [customerId]);
    return res.rows;
  }

  static async getAccountsReceivableReport() {
    const customers = await this.getCustomers();
    const totalReceivables = customers.reduce((sum, c) => sum + parseFloat(c.outstandingBalance || '0'), 0);
    const activeCount = customers.filter(c => c.is_active).length;

    return {
      totalReceivables,
      activeCount,
      customers,
    };
  }
}
