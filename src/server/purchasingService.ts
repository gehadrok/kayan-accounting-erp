import { getDb, withTransaction } from './db.ts';
import { logAudit, logAuditStrict } from './auditService.ts';
import { AccountingService } from './accountingService.ts';
import { SettingsService } from './settingsService.ts';
import { round2 } from './money.ts';
import {
  resolveCounterparty,
  resolveVehicle,
  COUNTERPARTY_TYPE_LABELS_AR,
  type VoucherCounterpartyType,
  VOUCHER_COUNTERPARTY_TYPES,
} from './voucherAccounting.ts';

export interface CreateSupplierDto {
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  creditLimit?: number;
  paymentTermsDays?: number;
  payablesAccountId?: string;
  companyId?: string;
  userId?: string;
}

export interface CreatePurchaseInvoiceLineDto {
  itemId?: string;
  warehouseId?: string;
  itemCode?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  tax?: number;
  taxCodeId?: string;
  expenseAccountId?: string;
}

export interface CreatePurchaseInvoiceDto {
  supplierId: string;
  paymentType?: 'CASH' | 'CREDIT';
  postingType?: 'EXPENSE' | 'INVENTORY';
  invoiceDate: string;
  dueDate?: string;
  notes?: string;
  lines: CreatePurchaseInvoiceLineDto[];
  companyId?: string;
  branchId?: string;
  userId?: string;
  /** يُملأ من الجلسة الموقّعة على الخادم فقط — لا من جسم الطلب. */
  username?: string;
}

export interface CreatePaymentAllocationDto {
  invoiceId: string;
  amount: number;
}

export interface CreatePaymentDto {
  /** الطرف المقابل: مورد (النمط القديم) أو أحد الأنواع الستة الجديدة. */
  supplierId?: string | null;
  customerId?: string | null;
  counterpartyType?: VoucherCounterpartyType;
  counterpartyAccountId?: string | null;
  /** وسيلة الصرف: معرّف تعريف صندوق/بنك (banking.*) — يُحلّ حسابه على الخادم. */
  sourceVehicleId?: string | null;
  paymentMethod: 'CASH' | 'BANK';
  sourceAccountId?: string; // Cash 1101 or Bank 1102 (legacy fallback)
  paymentDate: string;
  amount: number;
  referenceNumber?: string;
  description?: string;
  allocations?: CreatePaymentAllocationDto[];
  companyId?: string;
  branchId?: string;
  userId?: string;
}

export class PurchasingService {
  // ==========================================
  // 1. Suppliers
  // ==========================================

  /**
   * PHASE 10.2 — the canonical Accounts Payable movement set.
   *
   * Every AP-facing figure in the system (supplier card balance, supplier
   * statement closing balance, aging schedule total, and the reconciliation
   * subledger) MUST be this one number, because it is the one number the
   * General Ledger carries on the payables control account:
   *
   *   credits = POSTED CREDIT purchase invoices  (a CASH invoice never touches
   *             payables — it credits the cash account instead)
   *   debits  = POSTED supplier payments + POSTED purchase returns
   *
   * Two previous formulas broke that tie-out:
   *   - the card summed `total - paid_amount`, which only nets the ALLOCATED
   *     part of a payment, while the payment journal debits the FULL voucher
   *     amount. An unallocated remainder therefore left the card disagreeing
   *     with both the statement and the GL.
   *   - the aging schedule and the reconciliation subledger ignored purchase
   *     returns altogether, even though a posted return debits payables.
   *
   * Only POSTED documents contribute: a DRAFT document has no journal, and a
   * VOIDED one has had its journal reversed.
   */
  static async getApMovementTotals(supplierId?: string, branchId?: string) {
    const db = await getDb();
    const params: any[] = [];
    const sup = supplierId ? `AND supplier_id = $${params.push(supplierId)}` : '';
    const br = branchId ? `AND branch_id = $${params.push(branchId)}` : '';

    const res = await db.query<any>(`
      SELECT
        COALESCE((
          SELECT SUM(total) FROM purchasing.purchase_invoices
          WHERE status = 'POSTED' AND payment_type = 'CREDIT' ${sup} ${br}
        ), 0) AS credits,
        COALESCE((
          SELECT SUM(amount) FROM purchasing.payments
          WHERE status = 'POSTED' ${sup} ${br}
        ), 0) AS payment_debits,
        COALESCE((
          SELECT SUM(total) FROM purchasing.purchase_returns
          WHERE status = 'POSTED' ${sup} ${br}
        ), 0) AS return_debits
    `, params);

    const r = res.rows[0] || {};
    const credits = parseFloat(r.credits || '0');
    const paymentDebits = parseFloat(r.payment_debits || '0');
    const returnDebits = parseFloat(r.return_debits || '0');
    return { credits, paymentDebits, returnDebits, balance: credits - paymentDebits - returnDebits };
  }

  /** Inline twin of getApMovementTotals for set-based supplier queries. */
  private static apBalanceSql(supplierAlias: string): string {
    return `
      COALESCE((
        SELECT SUM(inv.total) FROM purchasing.purchase_invoices inv
        WHERE inv.supplier_id = ${supplierAlias}.id AND inv.status = 'POSTED'
          AND inv.payment_type = 'CREDIT'
      ), 0)
      - COALESCE((
        SELECT SUM(p.amount) FROM purchasing.payments p
        WHERE p.supplier_id = ${supplierAlias}.id AND p.status = 'POSTED'
      ), 0)
      - COALESCE((
        SELECT SUM(r.total) FROM purchasing.purchase_returns r
        WHERE r.supplier_id = ${supplierAlias}.id AND r.status = 'POSTED'
      ), 0)`;
  }

  static async getSuppliers(search?: string) {
    const db = await getDb();
    let query = `
      SELECT 
        s.*,
        a.code as "accountCode",
        a.name as "accountName",
        (${this.apBalanceSql('s')}) as "outstandingBalance",
        COALESCE(
          (SELECT SUM(inv.total)
           FROM purchasing.purchase_invoices inv
           WHERE inv.supplier_id = s.id AND inv.status = 'POSTED'), 0
        ) as "totalPurchases",
        COALESCE(
          (SELECT SUM(p.amount)
           FROM purchasing.payments p
           WHERE p.supplier_id = s.id AND p.status = 'POSTED'), 0
        ) as "totalPayments"
      FROM purchasing.suppliers s
      LEFT JOIN accounting.accounts a ON a.id = s.payables_account_id
    `;
    const params: any[] = [];

    if (search) {
      query += ` WHERE (s.name ILIKE $1 OR s.code ILIKE $1 OR s.phone ILIKE $1)`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY s.created_at DESC`;
    const res = await db.query<any>(query, params);
    return res.rows;
  }

static async getSupplierById(id: string) {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        s.*,
        a.code as "accountCode",
        a.name as "accountName",
        (${this.apBalanceSql('s')}) as "outstandingBalance",
        COALESCE(
          (SELECT SUM(inv.total)
           FROM purchasing.purchase_invoices inv
           WHERE inv.supplier_id = s.id AND inv.status = 'POSTED'), 0
        ) as "totalPurchases",
        COALESCE(
          (SELECT SUM(p.amount)
           FROM purchasing.payments p
           WHERE p.supplier_id = s.id AND p.status = 'POSTED'), 0
        ) as "totalPayments"
      FROM purchasing.suppliers s
      LEFT JOIN accounting.accounts a ON a.id = s.payables_account_id
      WHERE s.id = $1
    `, [id]);

    if (res.rows.length === 0) {
      throw new Error(`المورد برقم ${id} غير موجود`);
    }
    return res.rows[0];
  }

  static async createSupplier(dto: CreateSupplierDto) {
    const db = await getDb();

    let companyId = dto.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }

    // Default payables control account (2101 الموردون والدائنون)
    let payablesAccountId = dto.payablesAccountId;
    if (!payablesAccountId) {
      const accRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '2101' LIMIT 1");
      payablesAccountId = accRes.rows[0]?.id;
    }

    const res = await db.query<any>(`
      INSERT INTO purchasing.suppliers 
      (company_id, code, name, phone, email, address, tax_number, credit_limit, payment_terms_days, payables_account_id)
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
      payablesAccountId,
    ]);

    const supplier = res.rows[0];
    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'SUPPLIER',
      entityId: supplier.id,
      newData: supplier,
    });

    return supplier;
  }

  static async updateSupplier(id: string, dto: Partial<CreateSupplierDto> & { isActive?: boolean }) {
    const db = await getDb();
    const existing = await this.getSupplierById(id);

    const res = await db.query<any>(`
      UPDATE purchasing.suppliers 
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
      dto.isActive !== undefined ? dto.isActive : (dto as any).is_active,
      id,
    ]);

    const updated = res.rows[0];
    await logAudit({
      userId: dto.userId,
      action: 'UPDATE',
      entityType: 'SUPPLIER',
      entityId: id,
      oldData: existing,
      newData: updated,
    });

    return updated;
  }

  // ==========================================
  // 2. Purchase Invoices
  // ==========================================

  static async getInvoices(limit = 50) {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        inv.*,
        s.name as "supplierName",
        s.code as "supplierCode",
        je.entry_number as "journalEntryNumber"
      FROM purchasing.purchase_invoices inv
      JOIN purchasing.suppliers s ON s.id = inv.supplier_id
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
        s.name as "supplierName",
        s.code as "supplierCode",
        s.phone as "supplierPhone",
        s.address as "supplierAddress",
        s.tax_number as "supplierTaxNumber",
        je.entry_number as "journalEntryNumber",
        b.name as "branchName",
        cu.username as "createdByName",
        lm.username as "lastModifiedByName",
        lm.timestamp as "lastModifiedAt"
      FROM purchasing.purchase_invoices inv
      JOIN purchasing.suppliers s ON s.id = inv.supplier_id
      LEFT JOIN accounting.journal_entries je ON je.id = inv.journal_entry_id
      LEFT JOIN core.branches b ON b.id = inv.branch_id
      LEFT JOIN security.users cu ON cu.id = inv.created_by
      LEFT JOIN LATERAL (
        SELECT al.username, al.timestamp
        FROM audit.audit_logs al
        WHERE al.entity_type = 'PURCHASE_INVOICE'
          AND al.entity_id = inv.id::text
          AND al.action = 'UPDATE'
          AND al.user_id IS NOT NULL
        ORDER BY al.timestamp DESC
        LIMIT 1
      ) lm ON TRUE
      WHERE inv.id = $1
    `, [id]);

    if (invRes.rows.length === 0) {
      throw new Error(`فاتورة المشتريات برقم ${id} غير موجودة`);
    }

    const linesRes = await db.query<any>(`
      SELECT 
        l.*, 
        l.item_id as "itemId",
        l.warehouse_id as "warehouseId",
        l.tax_code_id as "taxCodeId",
        l.expense_account_id as "expenseAccountId",
        i.name as "itemName",
        i.sku as "sku",
        i.is_stock_item as "isStockItem",
        iu.name as "itemUnit",
        w.name as "warehouseName",
        a.name as "accountName" 
      FROM purchasing.purchase_invoice_lines l
      LEFT JOIN inventory.items i ON i.id = l.item_id
      LEFT JOIN inventory.units iu ON iu.id = i.unit_id
      LEFT JOIN inventory.warehouses w ON w.id = l.warehouse_id
      LEFT JOIN accounting.accounts a ON a.id = l.expense_account_id
      WHERE l.invoice_id = $1
      ORDER BY l.line_number ASC
    `, [id]);

    return {
      ...invRes.rows[0],
      lines: linesRes.rows,
    };
  }

  /**
   * HOTFIX — authoritative resolution of a purchase line to an inventory item.
   *
   * A purchase line reaches an item either explicitly (item_id) or through the
   * historical SKU/name fallback. BOTH are honored here, and the caller is told
   * whether the resolved item is a stock item, because that single fact decides
   * whether `posting_type = 'EXPENSE'` is a valid posting or a silent
   * contradiction (stock bought but never received).
   *
   * Returns null for a free-text expense/service line — those are legitimately
   * non-stock and stay postable as EXPENSE.
   */
  private static async resolveLineItem(line: any): Promise<{ id: string; isStockItem: boolean } | null> {
    const db = await getDb();

    let itemId: string | null = line.item_id || line.itemId || null;
    if (!itemId) {
      const itemRes = await db.query<any>(
        'SELECT id, is_stock_item FROM inventory.items WHERE sku = $1 OR name = $2 LIMIT 1',
        [line.item_code ?? line.itemCode ?? null, line.description ?? null]
      );
      if (itemRes.rows.length > 0) itemId = itemRes.rows[0].id;
    }
    if (!itemId) return null;

    const itemRes = await db.query<any>('SELECT id, is_stock_item FROM inventory.items WHERE id = $1', [itemId]);
    if (itemRes.rows.length === 0) return null;
    return { id: itemRes.rows[0].id, isStockItem: itemRes.rows[0].is_stock_item === true };
  }

  /**
   * HOTFIX — posting_type vs. line content guard (server-side, mandatory).
   *
   * Before this existed, an invoice saved with the form default
   * (posting_type = 'EXPENSE') posted successfully, produced a balanced
   * journal, returned "تم ترحيل فاتورة المشتريات بنجاح" — and silently created
   * NO stock movement at all. The success message was the only signal, and it
   * was wrong.
   *
   * Rule: an invoice that carries at least one STOCK item must be routed
   * INVENTORY, otherwise the goods are never received. Free-text expense and
   * service lines (and items explicitly flagged is_stock_item = FALSE) remain
   * postable as EXPENSE — nothing is silently reclassified.
   */
  private static async assertPostingTypeMatchesLines(invoice: any) {
    if (invoice.posting_type !== 'EXPENSE') return;

    const stockLines: string[] = [];
    for (const l of invoice.lines || []) {
      const item = await this.resolveLineItem(l);
      if (item && item.isStockItem) {
        stockLines.push(l.description || l.item_code || l.item_id || 'صنف مخزني');
      }
    }

    if (stockLines.length > 0) {
      throw new Error(
        `تعارض في التوجيه المحاسبي: الفاتورة "${invoice.invoice_number}" تحتوي ${stockLines.length} بند صنف مخزني ` +
        `(${stockLines.slice(0, 3).join('، ')})، وتم ترحيلها على أنها "مصروفات (54)" — وهو ما يعني عدم إنشاء حركة استلام مطلقًا. ` +
        `اختر "مخزون سلعي (1104)" ليتم استلام الكميات، أو استخدم بنودًا غير مخزنية للخدمات والمصروفات.`
      );
    }
  }

  static async createInvoice(dto: CreatePurchaseInvoiceDto) {
    const db = await getDb();

    if (!dto.lines || dto.lines.length === 0) {
      throw new Error('يجب أن تحتوي فاتورة المشتريات على بند أو صنف واحد على الأقل');
    }

    // HOTFIX: a document line must never be created against a warehouse that
    // does not exist or is deactivated — otherwise the invoice saves fine and
    // only fails much later, at posting, with no warehouse on the document.
    const { InventoryService } = await import('./inventoryService.ts');
    for (const l of dto.lines) {
      const lineWhId = l.warehouseId || null;
      if (lineWhId) {
        await InventoryService.requireActiveWarehouse(
          lineWhId,
          'المستودع المحدد في بند فاتورة المشتريات غير موجود أو معطل — تم رفض حفظ الفاتورة'
        );
      }
    }

    // Validate supplier
    const supplier = await this.getSupplierById(dto.supplierId);
    if (!supplier.is_active) {
      throw new Error('المورد المحدد غير نشط أو معطل في النظام');
    }

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
    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM purchasing.purchase_invoices');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const invoiceNumber = `PINV-2026-${seq.toString().padStart(4, '0')}`;

    const dueDate = dto.dueDate || dto.invoiceDate;

    // PHASE 10.6.4 — header + lines persist in ONE transaction so a failing
    // line insert cannot leave an orphan DRAFT invoice behind.
    return withTransaction(async () => {
      const invRes = await db.query<any>(`
        INSERT INTO purchasing.purchase_invoices
        (company_id, branch_id, invoice_number, supplier_id, payment_type, posting_type, invoice_date, due_date, subtotal, discount, tax, total, paid_amount, status, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, 'DRAFT', $13, $14)
        RETURNING *
      `, [
        companyId,
        branchId,
        invoiceNumber,
        dto.supplierId,
        dto.paymentType || 'CREDIT',
        dto.postingType || 'EXPENSE',
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

      for (const line of computedLines) {
        await db.query(`
          INSERT INTO purchasing.purchase_invoice_lines
          (invoice_id, item_id, warehouse_id, item_code, description, quantity, unit_price, discount, tax, tax_code_id, line_total, line_number, expense_account_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
          line.taxCodeId || null,
          line.lineTotal,
          line.lineNumber,
          line.expenseAccountId || null,
        ]);
      }

      await logAudit({
        userId: dto.userId,
        username: dto.username,
        action: 'CREATE',
        entityType: 'PURCHASE_INVOICE',
        entityId: invoice.id,
        newData: { invoice, lines: computedLines },
      });

      return { ...invoice, lines: computedLines };
    });
  }

  /**
   * PHASE 10.6.1 — تعديل مسودة فاتورة مشتريات فقط.
   *
   * نفس قواعد createInvoice (تحقق المورد النشط والمستودعات النشطة)،
   * ونفس حساب البنود، مع حصر التعديل في DRAFT وعدم المساس برقم
   * الفاتورة أو الشركة/الفرع أو created_by أو paid_amount.
   */
  static async updateInvoice(id: string, dto: CreatePurchaseInvoiceDto) {
    const db = await getDb();

    if (!dto.lines || dto.lines.length === 0) {
      throw new Error('يجب أن تحتوي فاتورة المشتريات على بند أو صنف واحد على الأقل');
    }

    const { InventoryService } = await import('./inventoryService.ts');
    for (const l of dto.lines) {
      if (l.warehouseId) {
        await InventoryService.requireActiveWarehouse(
          l.warehouseId,
          'المستودع المحدد في بند فاتورة المشتريات غير موجود أو معطل — تم رفض حفظ الفاتورة'
        );
      }
    }

    const supplier = await this.getSupplierById(dto.supplierId);
    if (!supplier.is_active) {
      throw new Error('المورد المحدد غير نشط أو معطل في النظام');
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
        'SELECT * FROM purchasing.purchase_invoices WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (current.rows.length === 0) {
        throw new Error(`فاتورة المشتريات برقم ${id} غير موجودة`);
      }
      const invoice = current.rows[0];
      if (invoice.status !== 'DRAFT') {
        throw new Error(
          invoice.status === 'POSTED'
            ? 'لا يمكن تعديل فاتورة مشتريات مرحّلة محاسبياً. استخدم الإلغاء/العكس وفق قواعد النظام.'
            : 'لا يمكن تعديل فاتورة مشتريات ملغاة.'
        );
      }

      const oldLines = await db.query<any>(
        'SELECT * FROM purchasing.purchase_invoice_lines WHERE invoice_id = $1 ORDER BY line_number',
        [id]
      );

      const updatedRes = await db.query<any>(`
        UPDATE purchasing.purchase_invoices
        SET supplier_id = $2,
            payment_type = $3,
            posting_type = $4,
            invoice_date = $5,
            due_date = $6,
            subtotal = $7,
            discount = $8,
            tax = $9,
            total = $10,
            notes = $11,
            updated_at = NOW()
        WHERE id = $1 AND status = 'DRAFT'
        RETURNING *
      `, [
        id,
        dto.supplierId,
        dto.paymentType || 'CREDIT',
        dto.postingType || 'EXPENSE',
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

      await db.query('DELETE FROM purchasing.purchase_invoice_lines WHERE invoice_id = $1', [id]);

      for (const line of computed) {
        await db.query(`
          INSERT INTO purchasing.purchase_invoice_lines
          (invoice_id, item_id, warehouse_id, item_code, description, quantity, unit_price, discount, tax, tax_code_id, line_total, line_number, expense_account_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
          line.taxCodeId || null,
          line.lineTotal,
          line.lineNumber,
          line.expenseAccountId || null,
        ]);
      }

      const updated = updatedRes.rows[0];

      await logAudit({
        userId: dto.userId,
        username: dto.username,
        action: 'UPDATE',
        entityType: 'PURCHASE_INVOICE',
        entityId: id,
        oldData: { invoice, lines: oldLines.rows },
        newData: { invoice: updated, lines: computed },
      });

      return { ...updated, lines: computed };
    });
  }

  /**
   * Automatic Accounting Posting of a Purchase Invoice:
   * 1. Validates invoice, supplier status, open fiscal period
   * 2. Rejects modification after posting
   * 3. Creates balanced Journal Entry:
   *    - DEBIT: Purchase/Inventory Account (54 or 1104) + Input Tax Account (1105)
   *    - CREDIT: Accounts Payable (2101) if CREDIT, or Cash/Bank (1101/1102) if CASH
   * 4. Updates invoice status to POSTED
   */
  static async postPurchaseInvoice(invoiceId: string, userId?: string) {
    const db = await getDb();
    const invoice = await this.getInvoiceById(invoiceId);

    if (invoice.status === 'POSTED') {
      throw new Error('فاتورة المشتريات مرحلة بالفعل ولا يمكن إعادة ترحيلها');
    }
    if (invoice.status === 'VOIDED') {
      throw new Error('لا يمكن ترحيل فاتورة مشتريات ملغاة');
    }

    const totalAmount = parseFloat(invoice.total);
    if (totalAmount <= 0) {
      throw new Error('لا يمكن ترحيل فاتورة مشتريات بقيمة صفر أو سالبة');
    }

    // 1. Validate Supplier
    const supplier = await this.getSupplierById(invoice.supplier_id);
    if (!supplier.is_active) {
      throw new Error(`المورد "${supplier.name}" معطل ولا يمكن ترحيل فواتير له`);
    }

    // 1b. HOTFIX: posting_type must agree with the actual line content.
    // Runs BEFORE any write, so a contradictory invoice is rejected with a
    // readable reason instead of "succeeding" without a stock receipt.
    await this.assertPostingTypeMatchesLines(invoice);

    // 2. Validate Fiscal Period for invoiceDate
    const periodRes = await db.query<any>(`
      SELECT id, status FROM accounting.fiscal_periods
      WHERE $1 BETWEEN start_date AND end_date
      LIMIT 1
    `, [invoice.invoice_date]);

    if (periodRes.rows.length === 0 || periodRes.rows[0].status !== 'OPEN') {
      throw new Error(`الفترة المالية الخاصة بتاريخ الفاتورة (${invoice.invoice_date}) مغلقة أو غير متاحة للترحيل`);
    }

    // 3. Determine Accounts via Central Settings Mapping
    let creditAccountId: string;
    let creditDescription: string;

    if (invoice.payment_type === 'CASH') {
      creditAccountId = await SettingsService.getAccountMapping('cash.default_cash_account', '1101', invoice.company_id);
      creditDescription = `دائن: الصندوق والخزينة (فاتورة مشتريات نقدية رقم ${invoice.invoice_number})`;
    } else {
      creditAccountId = supplier.payables_account_id;
      if (!creditAccountId) {
        creditAccountId = await SettingsService.getAccountMapping('purchasing.default_ap_account', '2101', invoice.company_id);
      }
      creditDescription = `دائن: حساب المورد ${supplier.name} (فاتورة مشتريات رقم ${invoice.invoice_number})`;
    }

    // Debit Accounts (Purchases / Inventory & Tax)
    const netPurchases = parseFloat(invoice.subtotal) - parseFloat(invoice.discount);
    const taxAmount = parseFloat(invoice.tax);

    // Determine purchase debit account (either 1104 for inventory or 54 for expense)
    let purchaseAccountId: string;
    if (invoice.posting_type === 'INVENTORY') {
      purchaseAccountId = await SettingsService.getAccountMapping('inventory.default_inventory_account', '1104', invoice.company_id);
    } else {
      purchaseAccountId = await SettingsService.getAccountMapping('purchasing.default_expense_account', '54', invoice.company_id);
    }

    const journalLines: any[] = [];

    // Line 1: Main Purchases / Inventory (Debit)
    journalLines.push({
      accountId: purchaseAccountId,
      debit: netPurchases,
      credit: 0,
      description: `مدين: مشتريات وتكاليف الشراء (فاتورة رقم ${invoice.invoice_number})`,
    });

    // Line 2: Input Tax (Debit) if tax > 0
    if (taxAmount > 0) {
      const taxAccId = await SettingsService.getAccountMapping('purchasing.default_input_tax_account', '1105', invoice.company_id);
      journalLines.push({
        accountId: taxAccId || purchaseAccountId,
        debit: taxAmount,
        credit: 0,
        description: `مدين: ضريبة القيمة المضافة على المشتريات (فاتورة رقم ${invoice.invoice_number})`,
      });
    }

    // Line 3: Credit side (Payables / Cash)
    journalLines.push({
      accountId: creditAccountId,
      debit: 0,
      credit: totalAmount,
      description: creditDescription,
    });

    // 4-6. ATOMIC COMMIT (PHASE 9.1): journal + invoice update + stock
    // receipt persist together or roll back together — GL (1104) can
    // never diverge from the stock subledger on a failed receipt.
    // Declared OUTSIDE the callback so the response can report how many
    // receipts actually landed (a success message alone is not proof).
    let expectedReceiptMovements = 0;
    const posted = await withTransaction(async () => {
      // 4. Create and Post the Double-Entry Journal Entry
      const journalEntry = await AccountingService.createJournalEntry({
        companyId: invoice.company_id,
        branchId: invoice.branch_id,
        entryDate: invoice.invoice_date,
        sourceId: 'PURCHASES',
        description: `فاتورة مشتريات رقم ${invoice.invoice_number} من المورد ${invoice.supplierName}`,
        lines: journalLines,
        userId,
      });

      const postedJE = await AccountingService.postJournalEntry(journalEntry.id, userId);

      // 5. Update Invoice
      const paidAmount = invoice.payment_type === 'CASH' ? totalAmount : 0;
      await db.query(`
        UPDATE purchasing.purchase_invoices
        SET status = 'POSTED', journal_entry_id = $1, paid_amount = $2, updated_at = NOW()
        WHERE id = $3
      `, [postedJE.id, paidAmount, invoiceId]);

      // 6. If posting_type is INVENTORY, create PURCHASE_RECEIPT stock transaction
      // (inside the same transaction — a stock failure rolls back the journal too)
      let expectedReceiptQty = 0;
      if (invoice.posting_type === 'INVENTORY' && invoice.lines && invoice.lines.length > 0) {
        const { InventoryService } = await import('./inventoryService.ts');

        // HOTFIX: refuse to double-receive. Posting is already blocked above
        // once status = POSTED, but this also protects against a retry that
        // would otherwise append a second receipt for the same invoice.
        const dupRes = await db.query<any>(
          `SELECT COUNT(*)::int AS c FROM inventory.stock_transactions
           WHERE reference_id = $1 AND reference_type = 'PURCHASE_INVOICE' AND transaction_type = 'PURCHASE_RECEIPT'`,
          [invoiceId]
        );
        if (parseInt(dupRes.rows[0]?.c || '0', 10) > 0) {
          throw new Error('توجد حركة استلام مسجلة بالفعل لهذه الفاتورة — تم رفض الترحيل لمنع تكرار الاستلام');
        }

        // HOTFIX: shared deterministic default (same ordering rule the sales
        // side uses), so a document can never be received in one warehouse and
        // issued from another when no warehouse is stated on the line.
        const defaultWhId = await InventoryService.getDefaultActiveWarehouse();

        if (!defaultWhId) {
          throw new Error('لا يوجد مستودع نشط لاستلام البضاعة — تم رفض الترحيل قبل إنشاء أي قيد');
        }

        const stockLines: any[] = [];
        for (const l of invoice.lines) {
          let itemId: string | null = l.item_id || l.itemId || null;
          if (!itemId) {
            const itemRes = await db.query<any>(
              'SELECT id FROM inventory.items WHERE sku = $1 OR name = $2 LIMIT 1',
              [l.item_code, l.description]
            );
            if (itemRes.rows.length > 0) itemId = itemRes.rows[0].id;
          }
          if (itemId) {
            const qty = parseFloat(l.quantity);
            const price = parseFloat(l.unit_price);
            const disc = parseFloat(l.discount || '0');
            const netUnitCost = qty > 0 ? (price - (disc / qty)) : price;
            // PHASE 9.4.4: pass the EXACT line net (2dp money, == journal leg)
            // as the movement total instead of re-deriving it from a rounded
            // unit — fractional nets (e.g. 60 x 4,000 - 1) otherwise break
            // reconciliation past 0.001. Journal amounts are NOT touched.
            const netLineTotal = round2(qty * price - disc);
            // PHASE 9.5.1: the DOCUMENT line warehouse travels with the stock
            // line (falls back to the default warehouse only when unset) so
            // the receipt lands where the document says — never silently
            // defaulted when specified.
            const targetWhId = l.warehouse_id || (l as any).warehouseId || defaultWhId;
            stockLines.push({
              itemId,
              quantity: qty,
              unitCost: netUnitCost,
              totalCost: netLineTotal,
              warehouseId: targetWhId,
            });
          }
        }

        if (stockLines.length > 0) {
          // PHASE 9.5.1: one PURCHASE_RECEIPT per document warehouse so every
          // receipt is valued in its own warehouse. Single-warehouse invoices
          // still produce exactly one movement; the purchase journal below is
          // untouched (invoice-level totals).
          const receiptByWarehouse = new Map<string, typeof stockLines>();
          for (const sl of stockLines) {
            const key: string = sl.warehouseId;
            if (!receiptByWarehouse.has(key)) receiptByWarehouse.set(key, []);
            receiptByWarehouse.get(key)!.push({ itemId: sl.itemId, quantity: sl.quantity, unitCost: sl.unitCost, totalCost: sl.totalCost });
          }
          expectedReceiptMovements = receiptByWarehouse.size;
          for (const group of receiptByWarehouse.values()) {
            for (const sl of group) expectedReceiptQty += sl.quantity;
          }
          for (const [whId, group] of receiptByWarehouse) {
            await InventoryService.requireActiveWarehouse(
              whId,
              'المستودع المحدد في سطر فاتورة المشتريات غير موجود أو معطل — تم رفض الترحيل قبل إنشاء أي قيد'
            );
            await InventoryService.createStockTransaction({
              transactionType: 'PURCHASE_RECEIPT',
              transactionDate: invoice.invoice_date,
              warehouseId: whId,
              referenceType: 'PURCHASE_INVOICE',
              referenceId: invoiceId,
              notes: `استلام بضائع بموجب فاتورة مشتريات ${invoice.invoice_number}`,
              lines: group,
              valuationPolicy: 'EXACT_COST',
              companyId: invoice.company_id,
              userId,
            });
          }
        }
      }

      // 6b. HOTFIX — a success message is NOT proof of a receipt. When the
      // document routed stock lines, verify the movements actually landed
      // (count AND received quantity) before the transaction is allowed to
      // commit. A mismatch throws, which rolls the journal and the invoice
      // status back together, so "posted" can never outrun "received".
      if (expectedReceiptMovements > 0) {
        const verifyRes = await db.query<any>(`
          SELECT COUNT(DISTINCT tx.warehouse_id)::int AS movements,
                 COALESCE(SUM(l.quantity), 0)::float AS received_qty
          FROM inventory.stock_transactions tx
          JOIN inventory.stock_transaction_lines l ON l.transaction_id = tx.id
          WHERE tx.reference_id = $1 AND tx.reference_type = 'PURCHASE_INVOICE'
            AND tx.transaction_type = 'PURCHASE_RECEIPT' AND tx.status = 'POSTED'
        `, [invoiceId]);
        const movements = parseInt(verifyRes.rows[0]?.movements || '0', 10);
        const receivedQty = parseFloat(verifyRes.rows[0]?.received_qty || '0');
        const expectedQty = expectedReceiptQty;

        if (movements !== expectedReceiptMovements || Math.abs(receivedQty - expectedQty) > 0.0001) {
          throw new Error(
            `فشل التحقق الداخلي للاستلام: تم إنشاء ${movements} حركة استلام بإجمالي ${receivedQty} ` +
            `مقابل ${expectedReceiptMovements} حركة / ${expectedQty} متوقعة — تم التراجع عن الترحيل بالكامل`
          );
        }
      }

      await logAudit({
        userId,
        action: 'POST',
        entityType: 'PURCHASE_INVOICE',
        entityId: invoiceId,
        newData: { invoiceId, journalEntryId: postedJE.id, totalAmount, paymentType: invoice.payment_type, receiptMovements: expectedReceiptMovements },
      });

      return postedJE;
    });

    return {
      success: true,
      message: expectedReceiptMovements > 0
        ? `تم ترحيل فاتورة المشتريات بنجاح وتوليد القيد المحاسبي المتوازن، وتم إنشاء ${expectedReceiptMovements} حركة استلام مخزنية`
        : 'تم ترحيل فاتورة المشتريات بنجاح وتوليد القيد المحاسبي المتوازن (مشتريات مصروفات — لا يوجد استلام مخزني)',
      invoiceId,
      journalEntryId: posted.id,
      journalEntryNumber: posted.entry_number,
      receiptMovements: expectedReceiptMovements,
    };
  }

  /**
   * Voids a posted purchase invoice:
   * Reverses the linked journal entry and updates status to VOIDED
   */
  static async reversePurchaseInvoice(invoiceId: string, userId?: string) {
    const db = await getDb();
    const invoice = await this.getInvoiceById(invoiceId);

    if (invoice.status === 'VOIDED') {
      throw new Error('فاتورة المشتريات ملغاة بالفعل');
    }

    // PHASE 10.6.4 — ONE transaction for the journal reversal, the receipt
    // movement cancellation and the status change. Stock rows are flagged
    // VOIDED (schema-defined status) — never deleted — so both the stock
    // quantities and the GL inventory leg return to the pre-posting state.
    return withTransaction(async () => {
      if (invoice.status === 'POSTED' && invoice.journal_entry_id) {
        await AccountingService.reverseJournalEntry(invoice.journal_entry_id, userId);
      }

      const stockVoidRes = await db.query<any>(`
        UPDATE inventory.stock_transactions
           SET status = 'VOIDED'
         WHERE reference_type = 'PURCHASE_INVOICE' AND reference_id = $1 AND status = 'POSTED'
        RETURNING id
      `, [invoiceId]);
      const stockMovementsVoided = stockVoidRes.rows.length;

      await db.query(`
        UPDATE purchasing.purchase_invoices
        SET status = 'VOIDED', updated_at = NOW()
        WHERE id = $1
      `, [invoiceId]);

      await logAudit({
        userId,
        action: 'UPDATE',
        entityType: 'PURCHASE_INVOICE',
        entityId: invoiceId,
        oldData: invoice,
        newData: { status: 'VOIDED', journalReversed: Boolean(invoice.status === 'POSTED' && invoice.journal_entry_id), stockMovementsVoided },
      });

      return { success: true, message: 'تم إلغاء فاتورة المشتريات وعكس قيدها المحاسبي وإلغاء حركات الاستلام المخزنية المرتبطة بها' };
    });
  }

  // ==========================================
  // 3. Supplier Payments (سندات الصرف)
  // ==========================================

  static async getPayments(limit = 50) {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT
        p.*,
        s.name as "supplierName",
        s.code as "supplierCode",
        cp.name as "counterpartyAccountName",
        cp.code as "counterpartyAccountCode",
        a.name as "sourceAccountName",
        a.code as "sourceAccountCode",
        b.name as "branchName",
        je.entry_number as "journalEntryNumber"
      FROM purchasing.payments p
      LEFT JOIN purchasing.suppliers s ON s.id = p.supplier_id
      LEFT JOIN accounting.accounts cp ON cp.id = p.counterparty_account_id
      JOIN accounting.accounts a ON a.id = p.source_account_id
      LEFT JOIN core.branches b ON b.id = p.branch_id
      LEFT JOIN accounting.journal_entries je ON je.id = p.journal_entry_id
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  }

  static async getPaymentById(id: string) {
    const db = await getDb();
    const pRes = await db.query<any>(`
      SELECT
        p.*,
        s.name as "supplierName",
        s.code as "supplierCode",
        cp.name as "counterpartyAccountName",
        cp.code as "counterpartyAccountCode",
        a.name as "sourceAccountName",
        a.code as "sourceAccountCode",
        b.name as "branchName",
        je.entry_number as "journalEntryNumber",
        cu.username as "createdByName",
        lm.username as "lastModifiedByName",
        lm.timestamp as "lastModifiedAt"
      FROM purchasing.payments p
      LEFT JOIN purchasing.suppliers s ON s.id = p.supplier_id
      LEFT JOIN accounting.accounts cp ON cp.id = p.counterparty_account_id
      JOIN accounting.accounts a ON a.id = p.source_account_id
      LEFT JOIN core.branches b ON b.id = p.branch_id
      LEFT JOIN accounting.journal_entries je ON je.id = p.journal_entry_id
      LEFT JOIN security.users cu ON cu.id = p.created_by
      LEFT JOIN LATERAL (
        SELECT al.username, al.timestamp
        FROM audit.audit_logs al
        WHERE al.entity_type = 'SUPPLIER_PAYMENT'
          AND al.entity_id = p.id::text
          AND al.action = 'UPDATE'
          AND al.user_id IS NOT NULL
        ORDER BY al.timestamp DESC
        LIMIT 1
      ) lm ON TRUE
      WHERE p.id = $1
    `, [id]);

    if (pRes.rows.length === 0) {
      throw new Error(`سند الصرف برقم ${id} غير موجود`);
    }

    const allocRes = await db.query<any>(`
      SELECT 
        pa.*,
        inv.invoice_number as "invoiceNumber",
        inv.total as "invoiceTotal"
      FROM purchasing.payment_allocations pa
      JOIN purchasing.purchase_invoices inv ON inv.id = pa.invoice_id
      WHERE pa.payment_id = $1
    `, [id]);

    return {
      ...pRes.rows[0],
      allocations: allocRes.rows,
    };
  }

  static async getUnpaidInvoices(supplierId: string) {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        inv.*,
        (inv.total - inv.paid_amount) as "remainingAmount"
      FROM purchasing.purchase_invoices inv
      WHERE inv.supplier_id = $1 
        AND inv.status = 'POSTED' 
        AND (inv.total - inv.paid_amount) > 0
      ORDER BY inv.invoice_date ASC
    `, [supplierId]);
    return res.rows;
  }

  static async createPayment(dto: CreatePaymentDto) {
    const db = await getDb();

    if (dto.amount <= 0) {
      throw new Error('مبلغ سند الصرف يجب أن يكون أكبر من صفر');
    }

// ------------------------------------------------------------------
    // الطرف المقابل على مرحلتين: نوع الحساب ثم الحساب.
    // النمط القديم (supplierId فقط) يظل يعمل ويُعامل كنوع «مورد».
    // ------------------------------------------------------------------
    const counterpartyTypeInput = (dto.counterpartyType || '').toString().toUpperCase();
    if (counterpartyTypeInput && VOUCHER_COUNTERPARTY_TYPES.includes(counterpartyTypeInput as any) === false) {
      throw new Error('نوع الحساب غير معروف — الأنواع المتاحة: عميل/مورد/موظف/حساب عام/صندوق/بنك');
    }
    const counterpartyType = (
      counterpartyTypeInput ||
      (dto.supplierId ? 'SUPPLIER' : dto.customerId ? 'CUSTOMER' : '')
    ) as VoucherCounterpartyType;

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

    const counterparty = await resolveCounterparty({
      type: counterpartyType as any,
      counterpartyAccountId: dto.counterpartyAccountId || null,
      customerId: dto.customerId || null,
      supplierId: dto.supplierId || null,
      companyId,
      voucherKind: 'PAYMENT',
    });

    // المخصصات تُقيد على فواتير المورد فقط — بخلاف ذلك لا معنى لها.
    if (counterparty.type !== 'SUPPLIER' && dto.allocations && dto.allocations.length > 0) {
      throw new Error('مخصصات الفواتير تُقبل فقط عند قيد سند الصرف على مورد — أفرغ التخصيصات لحفظ السند');
    }

    // ------------------------------------------------------------------
    // وسيلة الصرف (الصندوق/البنك الذي خرجت منه الأموال):
    //   أولوية 1: sourceVehicleId (تعريف صندوق/بنك فعلي → يُحلّ حسابه على الخادم)
    //   أولوية 2: sourceAccountId (حساب GL صريح — بديل متوافق)
    //   افتراضي: 1101 نقدي / 1102 بنكي (سلوك التوافق السابق)
    // ------------------------------------------------------------------
    let sourceAccountId: string | undefined;
    let resolvedPaymentMethod: 'CASH' | 'BANK' = dto.paymentMethod === 'BANK' ? 'BANK' : 'CASH';

    if (dto.sourceVehicleId) {
      const vehicle = await resolveVehicle(dto.sourceVehicleId, resolvedPaymentMethod, companyId);
      sourceAccountId = vehicle.accountId;
      resolvedPaymentMethod = vehicle.category; // نوع الحركة يتبع وسيلة الصرف الفعلية
    } else if (dto.sourceAccountId) {
      const accRes = await db.query<any>(
        'SELECT id FROM accounting.accounts WHERE id = $1 AND company_id = $2 AND is_active = TRUE AND is_group = FALSE',
        [dto.sourceAccountId, companyId]
      );
      if (accRes.rows.length === 0) {
        throw new Error('حساب الصرف المحدد غير موجود أو معطل أو تجميعي');
      }
      sourceAccountId = accRes.rows[0].id;
    } else {
      const code = resolvedPaymentMethod === 'BANK' ? '1102' : '1101';
      const accRes = await db.query<any>('SELECT id FROM accounting.accounts WHERE code = $1 LIMIT 1', [code]);
      sourceAccountId = accRes.rows[0]?.id;
    }

    if (!sourceAccountId) {
      throw new Error(
        'لم يتم تحديد حساب وسيلة الصرف (صندوق/بنك) — اختر الصندوق أو البنك الذي خرجت منه الأموال'
      );
    }

    // منع قيد الطرف مقابل نفس حساب وسيلة الصرف (مدين ودائن لحساب واحد بلا معنى محاسبي)
    if (sourceAccountId === counterparty.accountId) {
      throw new Error(
        'حساب الطرف المقابل متطابق مع حساب وسيلة الصرف (الصندوق/البنك) — الصرف يجب أن يكون إلى طرف مختلف عن وسيلة الصرف'
      );
    }

    // Validate allocations
    let totalAllocated = 0;
    if (dto.allocations && dto.allocations.length > 0) {
      for (const a of dto.allocations) {
        const inv = await this.getInvoiceById(a.invoiceId);
        const remaining = parseFloat(inv.total) - parseFloat(inv.paid_amount);
        if (a.amount > remaining) {
          throw new Error(`المبلغ المخصص (${a.amount.toLocaleString()}) للفاتورة ${inv.invoice_number} يتجاوز الرصيد المتبقي منها (${remaining.toLocaleString()})`);
        }
        totalAllocated += a.amount;
      }
      if (totalAllocated > dto.amount) {
        throw new Error(`إجمالي المبالغ المخصصة (${totalAllocated.toLocaleString()}) يتجاوز مبلغ سند الصرف (${dto.amount.toLocaleString()})`);
      }
    }

    const unallocated = dto.amount - totalAllocated;

    // Generate Payment Number
    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM purchasing.payments');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const paymentNumber = `PAY-2026-${seq.toString().padStart(4, '0')}`;

    // PHASE 10.6.4 — payment header + allocations persist in ONE transaction:
    // an invalid allocation (e.g. unknown invoice) can no longer leave a
    // header row behind.
    return withTransaction(async () => {
      const pRes = await db.query<any>(`
        INSERT INTO purchasing.payments
        (company_id, branch_id, payment_number, supplier_id, counterparty_type, counterparty_account_id, payment_method, source_account_id, payment_date, amount, allocated_amount, unallocated_amount, reference_number, description, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'DRAFT', $15)
        RETURNING *
      `, [
        companyId,
        branchId,
        paymentNumber,
        counterparty.supplierId || null,
        counterparty.type,
        counterparty.supplierId ? null : counterparty.accountId,
        resolvedPaymentMethod,
        sourceAccountId,
        dto.paymentDate,
        dto.amount,
        totalAllocated,
        unallocated,
        dto.referenceNumber || null,
        dto.description || null,
        dto.userId || null,
      ]);

      const payment = pRes.rows[0];

      if (dto.allocations && dto.allocations.length > 0) {
        for (const a of dto.allocations) {
          if (a.amount > 0) {
            await db.query(`
              INSERT INTO purchasing.payment_allocations (payment_id, invoice_id, allocated_amount)
              VALUES ($1, $2, $3)
            `, [payment.id, a.invoiceId, a.amount]);
          }
        }
      }

      await logAudit({
        userId: dto.userId,
        action: 'CREATE',
        entityType: 'SUPPLIER_PAYMENT',
        entityId: payment.id,
        newData: { payment, allocations: dto.allocations },
      });

      return payment;
    });
  }

  /**
   * Updates a DRAFT supplier payment voucher — server-enforced twin of
   * SalesService.updateReceipt. Re-validates status, company scope,
   * counterparty, vehicle, amount and every allocation against the invoice's
   * remaining balance (excluding this voucher's own old allocations and
   * including other Draft payments' allocations), inside one transaction.
   * POSTED/VOIDED/journaled vouchers are refused. companyId/branchId from the
   * body are IGNORED — scope is checked against the stored voucher ownership.
   */
  static async updatePayment(
    id: string,
    dto: Omit<CreatePaymentDto, 'companyId' | 'branchId'> & {
      expectedUpdatedAt?: string | null;
      username?: string;
    },
  ) {
    const db = await getDb();

    if (dto.amount <= 0) {
      throw new Error('مبلغ سند الصرف يجب أن يكون أكبر من صفر');
    }

    return withTransaction(async () => {
      // Re-read the voucher inside the transaction (row lock) — any concurrent
      // post/void between form-load and save is detected here.
      const curRes = await db.query<any>(
        'SELECT * FROM purchasing.payments WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (curRes.rows.length === 0) {
        throw new Error(`سند الصرف برقم ${id} غير موجود`);
      }
      const old = curRes.rows[0];

      if (old.status !== 'DRAFT') {
        throw new Error(
          old.status === 'POSTED'
            ? 'لا يمكن تعديل سند صرف مرحّل. لا يُعدَّل القيد المحاسبي مباشرة.'
            : 'لا يمكن تعديل سند صرف ملغى.',
        );
      }
      if (old.journal_entry_id) {
        throw new Error('لا يمكن تعديل سند صرف لديه قيد محاسبي مُرحّل. لا يُعدَّل القيد مباشرة.');
      }
      if (dto.expectedUpdatedAt) {
        const expected = new Date(dto.expectedUpdatedAt).getTime();
        const actual = new Date(old.updated_at).getTime();
        if (Number.isFinite(expected) && Number.isFinite(actual) && expected !== actual) {
          throw new Error('تعذر تعديل سند الصرف: تغيّرت بياناته أثناء التحرير. أعد فتحه وحاول مجدداً.');
        }
      }

      const companyId = old.company_id;

      // --- counterparty resolution (same as create) ---
      const counterpartyTypeInput = (dto.counterpartyType || '').toString().toUpperCase() || old.counterparty_type || '';
      if (counterpartyTypeInput && VOUCHER_COUNTERPARTY_TYPES.includes(counterpartyTypeInput as any) === false) {
        throw new Error('نوع الحساب غير معروف — الأنواع المتاحة: عميل/مورد/موظف/حساب عام/صندوق/بنك');
      }
      const counterpartyType = counterpartyTypeInput as VoucherCounterpartyType;

      // سند الصرف لا يخزّن customer_id؛ إذا كان الطرف «عميلاً» نسترد معرّفه
      // من ربطه بحساب الذمم المحفوظ في السند حتى ينجح التحقق عند التعديل.
      let resolvedCustomerId = dto.customerId || null;
      if (counterpartyType === 'CUSTOMER' && !resolvedCustomerId && dto.counterpartyAccountId) {
        const cusRes = await db.query<any>(
          'SELECT id FROM sales.customers WHERE receivables_account_id = $1 AND company_id = $2 LIMIT 1',
          [dto.counterpartyAccountId, companyId],
        );
        resolvedCustomerId = cusRes.rows[0]?.id || null;
      }

      const counterparty = await resolveCounterparty({
        type: counterpartyType as any,
        counterpartyAccountId: dto.counterpartyAccountId || null,
        customerId: resolvedCustomerId,
        supplierId: dto.supplierId || null,
        companyId,
        voucherKind: 'PAYMENT',
      });

      if (counterparty.type !== 'SUPPLIER' && dto.allocations && dto.allocations.length > 0) {
        throw new Error('مخصصات الفواتير تُقبل فقط عند قيد سند الصرف على مورد — أفرغ التخصيصات لحفظ السند');
      }

      // --- vehicle / source account (same as create) ---
      let sourceAccountId: string | undefined;
      let resolvedPaymentMethod: 'CASH' | 'BANK' = dto.paymentMethod === 'BANK' ? 'BANK' : (dto.paymentMethod || 'CASH');
      if (dto.sourceVehicleId) {
        const vehicle = await resolveVehicle(dto.sourceVehicleId, resolvedPaymentMethod, companyId);
        sourceAccountId = vehicle.accountId;
        resolvedPaymentMethod = vehicle.category;
      } else if (dto.sourceAccountId) {
        const accRes = await db.query<any>(
          'SELECT id FROM accounting.accounts WHERE id = $1 AND company_id = $2 AND is_active = TRUE AND is_group = FALSE',
          [dto.sourceAccountId, companyId],
        );
        if (accRes.rows.length === 0) {
          throw new Error('حساب الصرف المحدد غير موجود أو معطل أو تجميعي');
        }
        sourceAccountId = accRes.rows[0].id;
      } else {
        const code = resolvedPaymentMethod === 'BANK' ? '1102' : '1101';
        const accRes = await db.query<any>('SELECT id FROM accounting.accounts WHERE code = $1 LIMIT 1', [code]);
        sourceAccountId = accRes.rows[0]?.id;
      }
      if (!sourceAccountId) {
        throw new Error('لم يتم تحديد حساب وسيلة الصرف (صندوق/بنك)');
      }
      if (sourceAccountId === counterparty.accountId) {
        throw new Error('حساب الطرف المقابل متطابق مع حساب وسيلة الصرف — الصرف يجب أن يكون إلى طرف مختلف عن وسيلة الصرف');
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
               FROM purchasing.purchase_invoices inv
              WHERE inv.id = $1 AND inv.company_id = $2
              FOR UPDATE`,
            [a.invoiceId, companyId],
          );
          if (invRes.rows.length === 0) {
            throw new Error(`الفاتورة برقم ${a.invoiceId} غير موجودة`);
          }
          const inv = invRes.rows[0];
          const otherDraftRes = await db.query<any>(
            `SELECT COALESCE(SUM(pa.allocated_amount), 0) AS other_allocated
               FROM purchasing.payment_allocations pa
               JOIN purchasing.payments p ON p.id = pa.payment_id
              WHERE pa.invoice_id = $1
                AND pa.payment_id <> $2
                AND p.status = 'DRAFT'`,
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
            `إجمالي المبالغ المخصصة (${totalAlloc.toLocaleString()}) يتجاوز مبلغ سند الصرف (${dto.amount.toLocaleString()})`,
          );
        }
      }

      const unallocated = dto.amount - totalAlloc;
      const descriptionDefault = counterparty.type === 'SUPPLIER'
        ? 'سند صرف نقدي/بنكي إلى المورد'
        : `سند صرف على ${COUNTERPARTY_TYPE_LABELS_AR[counterparty.type as keyof typeof COUNTERPARTY_TYPE_LABELS_AR] || counterparty.type}: ${counterparty.label}`;

      const updatedRes = await db.query<any>(
        `UPDATE purchasing.payments
            SET supplier_id = $2,
                counterparty_type = $3,
                counterparty_account_id = $4,
                payment_method = $5,
                source_account_id = $6,
                payment_date = $7,
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
          counterparty.supplierId || null,
          counterparty.type,
          counterparty.supplierId ? null : counterparty.accountId,
          resolvedPaymentMethod,
          sourceAccountId,
          dto.paymentDate,
          dto.amount,
          totalAlloc,
          unallocated,
          dto.referenceNumber || null,
          dto.description || descriptionDefault,
        ],
      );

      if (updatedRes.rows.length === 0) {
        throw new Error('تعذر تعديل سند الصرف: تغيّرت حالته أثناء الحفظ. أعد فتحه وحاول مجدداً.');
      }
      const updated = updatedRes.rows[0];

      // --- replace allocations atomically (same transaction) ---
      await db.query('DELETE FROM purchasing.payment_allocations WHERE payment_id = $1', [id]);
      for (const a of allocList) {
        await db.query(
          `INSERT INTO purchasing.payment_allocations (payment_id, invoice_id, allocated_amount)
           VALUES ($1, $2, $3)`,
          [id, a.invoiceId, a.amount],
        );
      }

      const savedAllocRes = await db.query<any>(
        'SELECT invoice_id, allocated_amount FROM purchasing.payment_allocations WHERE payment_id = $1',
        [id],
      );

      await logAuditStrict({
        userId: dto.userId,
        username: dto.username,
        action: 'UPDATE',
        entityType: 'SUPPLIER_PAYMENT',
        entityId: id,
        oldData: { payment: old },
        newData: { payment: updated, allocations: allocList },
      });

      return { ...updated, allocations: savedAllocRes.rows };
    });
  }

  /**
   * Automatic Accounting Posting of a Supplier Payment:
   * 1. Validate fiscal period is OPEN
   * 2. Double Entry:
   *    - DEBIT: 2101 Accounts Payable (الموردون والدائنون) = payment.amount
   *    - CREDIT: Cash (1101) or Bank (1102) = payment.amount
   * 3. Update paid_amount on allocated invoices
   * 4. Update payment status to POSTED
   */
  static async postSupplierPayment(paymentId: string, userId?: string) {
    const db = await getDb();
    const payment = await this.getPaymentById(paymentId);

    if (payment.status === 'POSTED') {
      throw new Error('سند الصرف مرحل بالفعل');
    }
    if (payment.status === 'VOIDED') {
      throw new Error('لا يمكن ترحيل سند صرف ملغي');
    }

    const amount = parseFloat(payment.amount);
    const counterpartyType = (payment.counterparty_type || 'SUPPLIER') as VoucherCounterpartyType;

    // Validate Fiscal Period
    const periodRes = await db.query<any>(`
      SELECT id, status FROM accounting.fiscal_periods
      WHERE $1 BETWEEN start_date AND end_date
      LIMIT 1
    `, [payment.payment_date]);

    if (periodRes.rows.length === 0 || periodRes.rows[0].status !== 'OPEN') {
      throw new Error(`الفترة المالية الخاصة بتاريخ سند الصرف (${payment.payment_date}) مغلقة`);
    }

// ------------------------------------------------------------------
    // مدين: حساب الطرف المقابل —
    //   * أنواع جديدة: counterparty_account_id المحفوظ، إعادة التحقق قبل الترحيل؛
    //   * النمط القديم (مورد): payables_account_id مع الافتراضي 2101.
    // دائن: حساب وسيلة الصرف (source_account_id).
    // اتجاه القيد لم يتغير عمّا هو عليه في النظام.
    // ------------------------------------------------------------------
    let payablesAccountId: string;
    let counterpartyLabel: string;
    if (payment.counterparty_account_id) {
      const accRes = await db.query<any>(
        'SELECT id, code, name, is_group, is_active FROM accounting.accounts WHERE id = $1',
        [payment.counterparty_account_id]
      );
      const acc = accRes.rows[0];
      if (!acc) {
        throw new Error('حساب الطرف المقابل لسند الصرف غير موجود في دليل الحسابات');
      }
      if (acc.is_group) {
        throw new Error(`حساب الطرف المقابل «${acc.code} - ${acc.name}» تجميعي ولا يقبل التحليل — لا يمكن الترحيل`);
      }
      if (acc.is_active === false) {
        throw new Error(`حساب الطرف المقابل «${acc.code} - ${acc.name}» معطل — لا يمكن الترحيل`);
      }
      payablesAccountId = acc.id;
      counterpartyLabel = `${COUNTERPARTY_TYPE_LABELS_AR[counterpartyType] || 'طرف مقابل'} ${acc.code} - ${acc.name}`;
    } else if (counterpartyType === 'SUPPLIER' && payment.supplier_id) {
      const supplier = await this.getSupplierById(payment.supplier_id);
      payablesAccountId = supplier.payables_account_id;
      if (!payablesAccountId) {
        const defAcc = await db.query<any>(
          "SELECT id FROM accounting.accounts WHERE code = '2101' LIMIT 1"
        );
        payablesAccountId = defAcc.rows[0]?.id || null;
      }
      if (!payablesAccountId) {
        throw new Error(
          `المورد «${supplier.name}» غير مربوط بحساب محاسبي للدائنين ولا يوجد الحساب الافتراضي 2101 — ليّن ربط المورد بحساب الدائنين ثم أعد الترحيل`
        );
      }
      counterpartyLabel = `المورد ${supplier.name}`;
    } else {
      throw new Error('سند الصرف لا يملك طرفاً مقابلًا صالحًا للترحيل — راجع بيانات السند');
    }

    // 1-4. PHASE 10.6.4 — ATOMIC COMMIT. JE creation/posting, invoice
    // paid_amount updates and the payment status change run as ONE
    // transaction; a mid-way failure can no longer leave a POSTED journal
    // behind a DRAFT payment that a resubmission would double-book.
    return withTransaction(async () => {
      const journalEntry = await AccountingService.createJournalEntry({
        companyId: payment.company_id,
        branchId: payment.branch_id,
        entryDate: payment.payment_date,
        sourceId: 'PAYMENTS',
        description: `سند صرف رقم ${payment.payment_number} إلى ${counterpartyLabel}`,
        lines: [
          {
            accountId: payablesAccountId,
            debit: amount,
            credit: 0,
            description: `مدين: ${counterpartyLabel} (سند صرف ${payment.payment_number})`,
          },
          {
            accountId: payment.source_account_id,
            debit: 0,
            credit: amount,
            description: `دائن: ${payment.sourceAccountName} (سند صرف ${payment.payment_number})`,
          },
        ],
        userId,
      });

      const postedJE = await AccountingService.postJournalEntry(journalEntry.id, userId);

      // Update allocated invoices paid_amount
      if (payment.allocations && payment.allocations.length > 0) {
        for (const a of payment.allocations) {
          await db.query(`
            UPDATE purchasing.purchase_invoices
            SET paid_amount = paid_amount + $1, updated_at = NOW()
            WHERE id = $2
          `, [a.allocated_amount, a.invoice_id]);
        }
      }

      await db.query(`
        UPDATE purchasing.payments
        SET status = 'POSTED', journal_entry_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [postedJE.id, paymentId]);

      await logAudit({
        userId,
        action: 'POST',
        entityType: 'SUPPLIER_PAYMENT',
        entityId: paymentId,
        newData: { paymentId, journalEntryId: postedJE.id, amount },
      });

      return {
        success: true,
        message: 'تم ترحيل سند الصرف بنجاح وتوليد القيد المحاسبي وتحديث الفواتير',
        paymentId,
        journalEntryId: postedJE.id,
        journalEntryNumber: postedJE.entry_number,
      };
    });
  }

  static async reverseSupplierPayment(paymentId: string, userId?: string) {
    const db = await getDb();
    const payment = await this.getPaymentById(paymentId);

    if (payment.status === 'VOIDED') {
      throw new Error('سند الصرف ملغى بالفعل');
    }

    // PHASE 10.6.4 — ONE transaction: journal reversal + paid_amount rollback
    // + status change land together or not at all.
    return withTransaction(async () => {
      if (payment.status === 'POSTED' && payment.journal_entry_id) {
        await AccountingService.reverseJournalEntry(payment.journal_entry_id, userId);
      }

      // Roll back invoice paid_amount
      if (payment.allocations && payment.allocations.length > 0) {
        for (const a of payment.allocations) {
          await db.query(`
            UPDATE purchasing.purchase_invoices
            SET paid_amount = GREATEST(0, paid_amount - $1), updated_at = NOW()
            WHERE id = $2
          `, [a.allocated_amount, a.invoice_id]);
        }
      }

      await db.query(`
        UPDATE purchasing.payments
        SET status = 'VOIDED', updated_at = NOW()
        WHERE id = $1
      `, [paymentId]);

      await logAudit({
        userId,
        action: 'UPDATE',
        entityType: 'SUPPLIER_PAYMENT',
        entityId: paymentId,
        oldData: payment,
        newData: { status: 'VOIDED', journalReversed: Boolean(payment.status === 'POSTED' && payment.journal_entry_id) },
      });

      return { success: true, message: 'تم إلغاء سند الصرف وعكس قيده المحاسبي وتحديث الفواتير' };
    });
  }

  // ==========================================
  // 4. Reports (Supplier Subledger & AP Reconciliation)
  // ==========================================

  /**
   * PHASE 10.2 — supplier subledger.
   *
   * Sign convention: a supplier is a CREDITOR, so its normal balance is a
   * credit. POSTED CREDIT invoices are credits; POSTED payments and POSTED
   * purchase returns are debits. CASH purchase invoices never appear — they
   * settled against the cash account and never entered payables at all.
   *
   * PHASE 10.2 added the declared-but-unapplied report filters. The registry
   * (src/services/reportRegistry.ts) advertises `dateRange` and `branch` for
   * this report but the endpoint silently ignored them, so a filtered view
   * returned the unfiltered book and then contradicted the card next to it.
   * The contract now mirrors getCustomerStatement exactly: `fromDate` opens
   * the statement at the balance carried from every earlier document,
   * `toDate`/`branchId` scope the rows, and an unfiltered call still returns
   * the whole book so the closing balance equals the supplier card.
   */
  static async getSupplierStatement(supplierId: string, fromDate?: string, toDate?: string, branchId?: string) {
    const db = await getDb();
    const supplier = await this.getSupplierById(supplierId);

    // Opening balance: every movement dated strictly before `fromDate`, expressed
    // as ONE signed credit-normal amount. (Keeping each leg in its own column
    // means aliasing a column `total` next to the real `total` column, which
    // PostgreSQL resolves to the alias and silently drops every return.)
    let openingBalance = 0;
    if (fromDate) {
      const opParams: any[] = [supplierId, fromDate];
      let opQuery = `
        SELECT COALESCE(SUM(t.signed_amount), 0) AS op_bal
        FROM (
          SELECT total AS signed_amount, invoice_date AS doc_date, branch_id
          FROM purchasing.purchase_invoices
          WHERE supplier_id = $1 AND status = 'POSTED' AND payment_type = 'CREDIT'

          UNION ALL

          SELECT -amount AS signed_amount, payment_date AS doc_date, branch_id
          FROM purchasing.payments
          WHERE supplier_id = $1 AND status = 'POSTED'

          UNION ALL

          SELECT -total AS signed_amount, return_date AS doc_date, branch_id
          FROM purchasing.purchase_returns
          WHERE supplier_id = $1 AND status = 'POSTED'
        ) t
        WHERE doc_date < $2
      `;
      if (branchId) {
        opParams.push(branchId);
        opQuery += ` AND branch_id = $${opParams.length}`;
      }
      const opRes = await db.query<any>(opQuery, opParams);
      openingBalance = parseFloat(opRes.rows[0]?.op_bal || '0');
    }

    // Returns are DEBITS — a purchase return debits payables exactly like a
    // payment does; it only cancels part of the invoiced amount instead of
    // settling it. The sales-side statement has always carried its RETURN leg;
    // this is the purchase-side twin.
    const txQuery = `
      SELECT 
        'INVOICE' as type,
        invoice_number as "docNumber",
        invoice_date as "docDate",
        COALESCE(notes, 'فاتورة مشتريات') as description,
        0.0000 as debit,
        total as credit,
        created_at,
        branch_id
      FROM purchasing.purchase_invoices
      WHERE supplier_id = $1 AND status = 'POSTED' AND payment_type = 'CREDIT'

      UNION ALL

      SELECT 
        'PAYMENT' as type,
        payment_number as "docNumber",
        payment_date as "docDate",
        COALESCE(description, 'سند صرف وسداد دفعات') as description,
        amount as debit,
        0.0000 as credit,
        created_at,
        branch_id
      FROM purchasing.payments
      WHERE supplier_id = $1 AND status = 'POSTED'

      UNION ALL

      SELECT
        'RETURN' as type,
        return_number as "docNumber",
        return_date as "docDate",
        COALESCE(notes, 'مردود مشتريات (إشعار مدين)') as description,
        total as debit,
        0.0000 as credit,
        created_at,
        branch_id
      FROM purchasing.purchase_returns
      WHERE supplier_id = $1 AND status = 'POSTED'
    `;

    const conditions: string[] = [];
    const params: any[] = [supplierId];
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

    let wrapped = `SELECT * FROM (${txQuery}) q`;
    if (conditions.length > 0) {
      wrapped += ` WHERE ${conditions.join(' AND ')}`;
    }
    wrapped += ` ORDER BY "docDate" ASC, created_at ASC`;

    const txRes = await db.query<any>(wrapped, params);

    let runningBalance = openingBalance;
    const items = txRes.rows.map((row: any) => {
      const debit = parseFloat(row.debit || '0');
      const credit = parseFloat(row.credit || '0');
      // For a Supplier (Liability/Creditor), normal balance is Credit
      runningBalance = runningBalance + credit - debit;

      return {
        type: row.type,
        docNumber: row.docNumber,
        docDate: row.docDate,
        // Report-registry contract: the statement columns are keyed `date` and
        // `reference` (src/services/reportRegistry.ts). Without these aliases
        // the viewer, the print preview and every export render both columns
        // blank even though (and unlike) the sales-side customer statement.
        reference: row.docNumber,
        date: row.docDate ? new Date(row.docDate).toISOString().split('T')[0] : null,
        description: row.description,
        debit,
        credit,
        runningBalance,
        balance: runningBalance,
      };
    });

    return {
      supplier,
      supplierId,
      fromDate: fromDate || null,
      toDate: toDate || null,
      branchId: branchId || null,
      openingBalance,
      totalDebit: items.reduce((sum, i) => sum + i.debit, 0),
      totalCredit: items.reduce((sum, i) => sum + i.credit, 0),
      finalBalance: runningBalance,
      closingBalance: runningBalance,
      items,
    };
  }

  /**
   * PHASE 10.2 — Accounts Payable aging.
   *
   * The schedule used to bucket raw `invoice.total - invoice.paid_amount`, so
   * it (a) never subtracted posted purchase returns and kept showing money the
   * supplier no longer owed, and (b) kept netting only allocated payments. Both
   * made its grand total disagree with the supplier card and the GL.
   *
   * It is now derived from the same canonical movements as every other AP
   * report, in three steps:
   *   1. open CREDIT invoices start at `total - paid_amount` (allocation aware);
   *   2. each POSTED return is applied to the invoice it was linked to, since a
   *      return always carries its original_invoice_id — that is what puts the
   *      reduction in the correct age bucket rather than smearing it across all;
   *   3. the UNALLOCATED part of posted payments is then applied oldest-due
   *      first, which is the conventional aging order.
   *
   * Anything that cannot be attached to an open invoice (an overpayment, or a
   * return against an already-settled or CASH invoice) is reported explicitly
   * as `unapplied` instead of being silently dropped, so the invariant
   * `buckets + unapplied === total === supplier card balance` always holds and
   * the grand total can always be tied back to the GL.
   */
  static async getAccountsPayableAging(branchId?: string) {
    const db = await getDb();
    const suppliers = await this.getSuppliers();
    const params: any[] = [];
    const branchClause = branchId ? `AND branch_id = $${params.push(branchId)}` : '';

    // 1. Open posted credit invoices, oldest due date first.
    const invRes = await db.query<any>(`
      SELECT 
        inv.id,
        inv.supplier_id,
        inv.invoice_number,
        inv.due_date,
        (inv.total - inv.paid_amount) as remaining,
        CURRENT_DATE - inv.due_date as overdue_days
      FROM purchasing.purchase_invoices inv
      WHERE inv.status = 'POSTED' AND inv.payment_type = 'CREDIT'
        AND (inv.total - inv.paid_amount) > 0
        ${branchClause}
      ORDER BY inv.due_date ASC, inv.invoice_date ASC
    `, params);

    // 2. Posted returns, each attributed to the invoice it reverses.
    const retRes = await db.query<any>(`
      SELECT r.supplier_id, r.original_invoice_id, r.total
      FROM purchasing.purchase_returns r
      WHERE r.status = 'POSTED'
        ${branchId ? `AND r.branch_id = $1` : ''}
      ORDER BY r.return_date ASC
    `, branchId ? [branchId] : []);

    // 3. Posted payments, oldest first — only the part not already reflected in
    //    paid_amount still needs to be aged off.
    const payRes = await db.query<any>(`
      SELECT p.supplier_id, p.amount, p.allocated_amount
      FROM purchasing.payments p
      WHERE p.status = 'POSTED'
        ${branchId ? `AND p.branch_id = $1` : ''}
      ORDER BY p.payment_date ASC, p.created_at ASC
    `, branchId ? [branchId] : []);

    // Canonical per-supplier balance. Unfiltered, the supplier card already
    // carries it; a branch-scoped run has to recompute it from the same
    // movements the other AP reports use, or the row would not sum to the
    // branch's own ledger.
    const cardBalances = new Map<string, number>(suppliers.map((s: any) => [s.id, parseFloat(s.outstandingBalance || '0')]));
    if (branchId) {
      for (const s of suppliers) {
        const t = await this.getApMovementTotals(s.id, branchId);
        cardBalances.set(s.id, t.balance);
      }
    }

    const agingData = suppliers.map((s: any) => {
      const suppInvs: any[] = invRes.rows.filter((i: any) => i.supplier_id === s.id);
      const openById = new Map<string, number>();
      for (const inv of suppInvs) {
        openById.set(inv.id, parseFloat(inv.remaining));
      }

      let unattributed = 0;

      // Returns reduce their own invoice; the rest is an unattributed credit.
      for (const r of retRes.rows.filter((x: any) => x.supplier_id === s.id)) {
        const open = r.original_invoice_id ? openById.get(r.original_invoice_id) : undefined;
        const amount = parseFloat(r.total);
        if (open === undefined || open <= 0) {
          unattributed += amount;
          continue;
        }
        const applied = Math.min(open, amount);
        openById.set(r.original_invoice_id, open - applied);
        unattributed += amount - applied;
      }

      // Unallocated payment cash clears the oldest open invoices first.
      for (const p of payRes.rows.filter((x: any) => x.supplier_id === s.id)) {
        let unallocated = Math.max(0, parseFloat(p.amount) - parseFloat(p.allocated_amount || '0'));
        for (const inv of suppInvs) {
          if (unallocated <= 1e-9) break;
          const open = openById.get(inv.id) || 0;
          if (open <= 0) continue;
          const applied = Math.min(open, unallocated);
          openById.set(inv.id, open - applied);
          unallocated -= applied;
        }
        // Anything left over is an advance/prepayment — not aged.
        unattributed -= unallocated;
      }

      let current = 0;
      let days1to30 = 0;
      let days31to60 = 0;
      let days61to90 = 0;
      let days90plus = 0;

      for (const inv of suppInvs) {
        const rem = openById.get(inv.id) || 0;
        if (rem <= 0) continue;
        const days = parseInt(inv.overdue_days, 10);

        if (days <= 0) {
          current += rem;
        } else if (days <= 30) {
          days1to30 += rem;
        } else if (days <= 60) {
          days31to60 += rem;
        } else if (days <= 90) {
          days61to90 += rem;
        } else {
          days90plus += rem;
        }
      }

      // Canonical balance: credits - posted payments - posted returns. Unfiltered
      // this is exactly the supplier card balance; a branch-scoped run uses the
      // same formula restricted to that branch.
      const balance = cardBalances.get(s.id) ?? 0;

      const buckets = current + days1to30 + days31to60 + days61to90 + days90plus;
      // Never lose a cent: whatever cannot be aged is reported as unapplied so
      // the row still sums to the ledger balance.
      const unapplied = balance - buckets;

      return {
        supplierId: s.id,
        code: s.code,
        name: s.name,
        current,
        days1to30,
        days31to60,
        days61to90,
        days90plus,
        unapplied,
        total: balance,
      };
    });

    return {
      asOfDate: new Date().toISOString().split('T')[0],
      branchId: branchId || null,
      totalPayables: agingData.reduce((sum, r) => sum + r.total, 0),
      currentTotal: agingData.reduce((sum, r) => sum + r.current, 0),
      days1to30Total: agingData.reduce((sum, r) => sum + r.days1to30, 0),
      days31to60Total: agingData.reduce((sum, r) => sum + r.days31to60, 0),
      days61to90Total: agingData.reduce((sum, r) => sum + r.days61to90, 0),
      days90plusTotal: agingData.reduce((sum, r) => sum + r.days90plus, 0),
      unappliedTotal: agingData.reduce((sum, r) => sum + r.unapplied, 0),
      suppliers: agingData,
    };
  }

  /**
   * Accounts Payable Reconciliation (Quality Requirement #19):
   * Compares the supplier subledger with the General Ledger payables control
   * account.
   *
   * PHASE 10.2: the subledger side used to be `SUM(total - paid_amount)` over
   * posted credit invoices, which (a) ignored posted purchase returns and
   * (b) netted only allocated payments — so any posted return made a perfectly
   * healthy ledger report OUT_OF_BALANCE by exactly the return amount. Both
   * sides now read the same canonical movements the other AP reports use.
   *
   * The GL side is also no longer hardcoded to code 2101: a supplier may be
   * linked to a different payables account (the system resolves each supplier's
   * own account when posting), and those movements were previously invisible to
   * the reconciliation on BOTH sides at once, which hid real differences.
   */
  static async getAPReconciliation() {
    const db = await getDb();

    // 1. Subledger side: canonical AP movements across every supplier.
    const totals = await this.getApMovementTotals();
    const subledgerBalance = totals.balance;

    // 2. General Ledger payables side. Normal balance is CREDIT: credits - debits.
    //
    // PHASE 10.2: the filter must include REVERSED originals. This ledger does
    // not edit or delete a posted entry to void it — reverseJournalEntry keeps
    // the original and ADDS a compensating POSTED entry, then marks the
    // original REVERSED. Every GL consumer here filters `status = 'POSTED'`,
    // which retires the original but keeps its compensation and therefore
    // leaves a phantom of the whole reversed amount in every report (a voided
    // 999,999 purchase invoice showed the payables account at -799,999). With
    // `IN ('POSTED','REVERSED')` the pair nets to zero, exactly matching the
    // subledger where a VOIDED document contributes nothing.
    const glRes = await db.query<any>(`
      SELECT 
        COALESCE(SUM(jl.credit - jl.debit), 0) as gl_balance,
        COALESCE(SUM(jl.credit), 0) as total_credits,
        COALESCE(SUM(jl.debit), 0) as total_debits
      FROM accounting.journal_entry_lines jl
      JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounting.accounts a ON a.id = jl.account_id
      WHERE je.status IN ('POSTED', 'REVERSED')
        AND (
          a.code = '2101'
          OR a.id IN (
            SELECT DISTINCT payables_account_id FROM purchasing.suppliers
            WHERE payables_account_id IS NOT NULL
          )
        )
    `);
    const glBalance = parseFloat(glRes.rows[0]?.gl_balance || '0');

    const difference = Math.abs(subledgerBalance - glBalance);
    const status = difference < 0.001 ? 'RECONCILED' : 'OUT_OF_BALANCE';

    return {
      subledgerBalance,
      glBalance,
      subledgerCredits: totals.credits,
      subledgerPaymentDebits: totals.paymentDebits,
      subledgerReturnDebits: totals.returnDebits,
      totalCredits: parseFloat(glRes.rows[0]?.total_credits || '0'),
      totalDebits: parseFloat(glRes.rows[0]?.total_debits || '0'),
      difference,
      status,
      glAccountCode: '2101',
      glAccountName: 'الموردون والدائنون (حساب الرقابة)',
      reconciledAt: new Date().toISOString(),
    };
  }

  /**
   * PHASE 10.2 — purchase summary.
   *
   * The registry advertises `dateRange` and `branch` for this report and the
   * endpoint forwarded a `period` argument that the body never used, so every
   * filter silently did nothing and the "summary" always meant "last 100
   * invoices, all branches". The declared filters are now applied, and
   * `totalPurchases` finally respects them instead of being a page-of-N total.
   */
  static async getPurchaseSummary(filters: { period?: string; fromDate?: string; toDate?: string; branchId?: string } = {}) {
    const db = await getDb();
    const { period, fromDate, toDate, branchId } = filters;

    const params: any[] = [];
    const clauses: string[] = [];
    if (fromDate) {
      params.push(fromDate);
      clauses.push(`invoice_date >= $${params.length}`);
    }
    if (toDate) {
      params.push(toDate);
      clauses.push(`invoice_date <= $${params.length}`);
    }
    if (branchId) {
      params.push(branchId);
      clauses.push(`branch_id = $${params.length}`);
    }
    if (period) {
      params.push(period);
      clauses.push(`to_char(invoice_date, 'YYYY-MM') = $${params.length}`);
    }

    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    const sumRes = await db.query<any>(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'POSTED' THEN total END), 0) AS total_purchases,
        COUNT(*) FILTER (WHERE status = 'POSTED') AS posted_count,
        COUNT(*) FILTER (WHERE status = 'DRAFT') AS draft_count
      FROM purchasing.purchase_invoices${where}
    `, params);

    // The invoice list keeps its existing limit/sort contract.
    const invoices = await this.getInvoices(100);
    const filteredInvoices = clauses.length === 0 ? invoices : invoices.filter((i: any) => {
      if (fromDate && i.invoice_date < fromDate) return false;
      if (toDate && i.invoice_date > toDate) return false;
      if (branchId && i.branch_id !== branchId) return false;
      return true;
    });

    return {
      fromDate: fromDate || null,
      toDate: toDate || null,
      branchId: branchId || null,
      period: period || null,
      totalPurchases: parseFloat(sumRes.rows[0]?.total_purchases || '0'),
      postedCount: parseInt(sumRes.rows[0]?.posted_count || '0', 10),
      draftCount: parseInt(sumRes.rows[0]?.draft_count || '0', 10),
      invoices: filteredInvoices,
    };
  }
}
