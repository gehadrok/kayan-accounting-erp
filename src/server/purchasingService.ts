import { getDb, withTransaction } from './db.ts';
import { logAudit } from './auditService.ts';
import { AccountingService } from './accountingService.ts';
import { SettingsService } from './settingsService.ts';

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
}

export interface CreatePaymentAllocationDto {
  invoiceId: string;
  amount: number;
}

export interface CreatePaymentDto {
  supplierId: string;
  paymentMethod: 'CASH' | 'BANK';
  sourceAccountId?: string; // Cash 1101 or Bank 1102
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

  static async getSuppliers(search?: string) {
    const db = await getDb();
    let query = `
      SELECT 
        s.*,
        a.code as "accountCode",
        a.name as "accountName",
        COALESCE(
          (SELECT SUM(inv.total - inv.paid_amount)
           FROM purchasing.purchase_invoices inv
           WHERE inv.supplier_id = s.id AND inv.status = 'POSTED' AND inv.payment_type = 'CREDIT'), 0
        ) as "outstandingBalance",
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
        COALESCE(
          (SELECT SUM(inv.total - inv.paid_amount)
           FROM purchasing.purchase_invoices inv
           WHERE inv.supplier_id = s.id AND inv.status = 'POSTED' AND inv.payment_type = 'CREDIT'), 0
        ) as "outstandingBalance",
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
        je.entry_number as "journalEntryNumber"
      FROM purchasing.purchase_invoices inv
      JOIN purchasing.suppliers s ON s.id = inv.supplier_id
      LEFT JOIN accounting.journal_entries je ON je.id = inv.journal_entry_id
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
        i.name as "itemName",
        i.sku as "sku",
        w.name as "warehouseName",
        a.name as "accountName" 
      FROM purchasing.purchase_invoice_lines l
      LEFT JOIN inventory.items i ON i.id = l.item_id
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

  static async createInvoice(dto: CreatePurchaseInvoiceDto) {
    const db = await getDb();

    if (!dto.lines || dto.lines.length === 0) {
      throw new Error('يجب أن تحتوي فاتورة المشتريات على بند أو صنف واحد على الأقل');
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
      action: 'CREATE',
      entityType: 'PURCHASE_INVOICE',
      entityId: invoice.id,
      newData: { invoice, lines: computedLines },
    });

    return { ...invoice, lines: computedLines };
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
      if (invoice.posting_type === 'INVENTORY' && invoice.lines && invoice.lines.length > 0) {
        const { InventoryService } = await import('./inventoryService.ts');
        const whRes = await db.query<any>('SELECT id FROM inventory.warehouses WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1');
        const defaultWhId = whRes.rows[0]?.id;

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
            stockLines.push({
              itemId,
              quantity: qty,
              unitCost: netUnitCost,
            });
          }
        }

        if (stockLines.length > 0) {
          await InventoryService.createStockTransaction({
            transactionType: 'PURCHASE_RECEIPT',
            transactionDate: invoice.invoice_date,
            warehouseId: defaultWhId,
            referenceType: 'PURCHASE_INVOICE',
            referenceId: invoiceId,
            notes: `استلام بضائع بموجب فاتورة مشتريات ${invoice.invoice_number}`,
            lines: stockLines,
            companyId: invoice.company_id,
            userId,
          });
        }
      }

      await logAudit({
        userId,
        action: 'POST',
        entityType: 'PURCHASE_INVOICE',
        entityId: invoiceId,
        newData: { invoiceId, journalEntryId: postedJE.id, totalAmount, paymentType: invoice.payment_type },
      });

      return postedJE;
    });

    return {
      success: true,
      message: 'تم ترحيل فاتورة المشتريات بنجاح وتوليد القيد المحاسبي المتوازن',
      invoiceId,
      journalEntryId: posted.id,
      journalEntryNumber: posted.entry_number,
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

    if (invoice.status === 'POSTED' && invoice.journal_entry_id) {
      await AccountingService.reverseJournalEntry(invoice.journal_entry_id, userId);
    }

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
      newData: { status: 'VOIDED' },
    });

    return { success: true, message: 'تم إلغاء فاتورة المشتريات وعكس القيد المحاسبي المرتبط بها' };
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
        a.name as "sourceAccountName",
        je.entry_number as "journalEntryNumber"
      FROM purchasing.payments p
      JOIN purchasing.suppliers s ON s.id = p.supplier_id
      JOIN accounting.accounts a ON a.id = p.source_account_id
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
        a.name as "sourceAccountName",
        je.entry_number as "journalEntryNumber"
      FROM purchasing.payments p
      JOIN purchasing.suppliers s ON s.id = p.supplier_id
      JOIN accounting.accounts a ON a.id = p.source_account_id
      LEFT JOIN accounting.journal_entries je ON je.id = p.journal_entry_id
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

    const supplier = await this.getSupplierById(dto.supplierId);
    if (!supplier.is_active) {
      throw new Error('المورد المحدد معطل أو غير نشط في النظام');
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

    // Source Account: Cash 1101 or Bank 1102
    let sourceAccountId = dto.sourceAccountId;
    if (!sourceAccountId) {
      const code = dto.paymentMethod === 'BANK' ? '1102' : '1101';
      const accRes = await db.query<any>('SELECT id FROM accounting.accounts WHERE code = $1 LIMIT 1', [code]);
      sourceAccountId = accRes.rows[0]?.id;
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

    const pRes = await db.query<any>(`
      INSERT INTO purchasing.payments 
      (company_id, branch_id, payment_number, supplier_id, payment_method, source_account_id, payment_date, amount, allocated_amount, unallocated_amount, reference_number, description, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'DRAFT', $13)
      RETURNING *
    `, [
      companyId,
      branchId,
      paymentNumber,
      dto.supplierId,
      dto.paymentMethod,
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

    const supplier = await this.getSupplierById(payment.supplier_id);
    const amount = parseFloat(payment.amount);

    // Validate Fiscal Period
    const periodRes = await db.query<any>(`
      SELECT id, status FROM accounting.fiscal_periods
      WHERE $1 BETWEEN start_date AND end_date
      LIMIT 1
    `, [payment.payment_date]);

    if (periodRes.rows.length === 0 || periodRes.rows[0].status !== 'OPEN') {
      throw new Error(`الفترة المالية الخاصة بتاريخ سند الصرف (${payment.payment_date}) مغلقة`);
    }

    // Debit Account: Payables Control (2101)
    let payablesAccountId = supplier.payables_account_id;
    if (!payablesAccountId) {
      const defAcc = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '2101' LIMIT 1");
      payablesAccountId = defAcc.rows[0]?.id;
    }

    // Journal Entry
    const journalEntry = await AccountingService.createJournalEntry({
      companyId: payment.company_id,
      branchId: payment.branch_id,
      entryDate: payment.payment_date,
      sourceId: 'PAYMENTS',
      description: `سند صرف رقم ${payment.payment_number} للمورد ${supplier.name}`,
      lines: [
        {
          accountId: payablesAccountId,
          debit: amount,
          credit: 0,
          description: `مدين: حساب المورد ${supplier.name} (تخفيض المديونية - سند صرف ${payment.payment_number})`,
        },
        {
          accountId: payment.source_account_id,
          debit: 0,
          credit: amount,
          description: `دائن: ${payment.sourceAccountName} (سداد للمورد - سند صرف ${payment.payment_number})`,
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
  }

  static async reverseSupplierPayment(paymentId: string, userId?: string) {
    const db = await getDb();
    const payment = await this.getPaymentById(paymentId);

    if (payment.status === 'VOIDED') {
      throw new Error('سند الصرف ملغى بالفعل');
    }

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
      newData: { status: 'VOIDED' },
    });

    return { success: true, message: 'تم إلغاء سند الصرف وعكس قيده المحاسبي وتحديث الفواتير' };
  }

  // ==========================================
  // 4. Reports (Supplier Subledger & AP Reconciliation)
  // ==========================================

  static async getSupplierStatement(supplierId: string) {
    const db = await getDb();
    const supplier = await this.getSupplierById(supplierId);

    // Invoices are Credits (increase liability to supplier)
    // Payments are Debits (decrease liability to supplier)
    const txRes = await db.query<any>(`
      SELECT 
        'INVOICE' as type,
        invoice_number as "docNumber",
        invoice_date as "docDate",
        COALESCE(notes, 'فاتورة مشتريات') as description,
        0.0000 as debit,
        total as credit,
        created_at
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
        created_at
      FROM purchasing.payments
      WHERE supplier_id = $1 AND status = 'POSTED'

      ORDER BY "docDate" ASC, created_at ASC
    `, [supplierId]);

    let runningBalance = 0;
    const items = txRes.rows.map((row: any) => {
      const debit = parseFloat(row.debit || '0');
      const credit = parseFloat(row.credit || '0');
      // For a Supplier (Liability/Creditor), normal balance is Credit
      runningBalance = runningBalance + credit - debit;

      return {
        type: row.type,
        docNumber: row.docNumber,
        docDate: row.docDate,
        description: row.description,
        debit,
        credit,
        runningBalance,
      };
    });

    return {
      supplier,
      totalDebit: items.reduce((sum, i) => sum + i.debit, 0),
      totalCredit: items.reduce((sum, i) => sum + i.credit, 0),
      finalBalance: runningBalance,
      items,
    };
  }

  static async getAccountsPayableAging() {
    const db = await getDb();
    const suppliers = await this.getSuppliers();

    // Fetch all unpaid posted credit invoices with age
    const invRes = await db.query<any>(`
      SELECT 
        inv.id,
        inv.supplier_id,
        inv.invoice_number,
        inv.due_date,
        (inv.total - inv.paid_amount) as remaining,
        CURRENT_DATE - inv.due_date as overdue_days
      FROM purchasing.purchase_invoices inv
      WHERE inv.status = 'POSTED' AND inv.payment_type = 'CREDIT' AND (inv.total - inv.paid_amount) > 0
    `);

    const agingData = suppliers.map(s => {
      const suppInvs = invRes.rows.filter((i: any) => i.supplier_id === s.id);
      let current = 0;
      let days1to30 = 0;
      let days31to60 = 0;
      let days61to90 = 0;
      let days90plus = 0;

      for (const inv of suppInvs) {
        const rem = parseFloat(inv.remaining);
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

      const total = current + days1to30 + days31to60 + days61to90 + days90plus;

      return {
        supplierId: s.id,
        code: s.code,
        name: s.name,
        current,
        days1to30,
        days31to60,
        days61to90,
        days90plus,
        total,
      };
    });

    return {
      totalPayables: agingData.reduce((sum, r) => sum + r.total, 0),
      currentTotal: agingData.reduce((sum, r) => sum + r.current, 0),
      days1to30Total: agingData.reduce((sum, r) => sum + r.days1to30, 0),
      days31to60Total: agingData.reduce((sum, r) => sum + r.days31to60, 0),
      days61to90Total: agingData.reduce((sum, r) => sum + r.days61to90, 0),
      days90plusTotal: agingData.reduce((sum, r) => sum + r.days90plus, 0),
      suppliers: agingData,
    };
  }

  /**
   * Accounts Payable Reconciliation (Quality Requirement #19):
   * Compares Supplier Subledger total with General Ledger Account (2101 Accounts Payable)
   */
  static async getAPReconciliation() {
    const db = await getDb();

    // 1. Subledger Balance: Sum of all posted credit invoices remaining balances
    const subledgerRes = await db.query<any>(`
      SELECT COALESCE(SUM(total - paid_amount), 0) as balance
      FROM purchasing.purchase_invoices
      WHERE status = 'POSTED' AND payment_type = 'CREDIT'
    `);
    const subledgerBalance = parseFloat(subledgerRes.rows[0]?.balance || '0');

    // 2. General Ledger Control Account (2101) Balance
    // In double entry, Account 2101 normal balance is CREDIT: Credits - Debits
    const glRes = await db.query<any>(`
      SELECT 
        COALESCE(SUM(jl.credit - jl.debit), 0) as gl_balance,
        COALESCE(SUM(jl.credit), 0) as total_credits,
        COALESCE(SUM(jl.debit), 0) as total_debits
      FROM accounting.journal_entry_lines jl
      JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounting.accounts a ON a.id = jl.account_id
      WHERE a.code = '2101' AND je.status = 'POSTED'
    `);
    const glBalance = parseFloat(glRes.rows[0]?.gl_balance || '0');

    const difference = Math.abs(subledgerBalance - glBalance);
    const status = difference < 0.001 ? 'RECONCILED' : 'OUT_OF_BALANCE';

    return {
      subledgerBalance,
      glBalance,
      difference,
      status,
      glAccountCode: '2101',
      glAccountName: 'الموردون والدائنون (حساب الرقابة)',
      reconciledAt: new Date().toISOString(),
    };
  }

  static async getPurchaseSummary(period?: string) {
    const db = await getDb();
    const invoices = await this.getInvoices(100);
    const totalPurchases = invoices
      .filter(i => i.status === 'POSTED')
      .reduce((sum, i) => sum + parseFloat(i.total), 0);
    const postedCount = invoices.filter(i => i.status === 'POSTED').length;
    const draftCount = invoices.filter(i => i.status === 'DRAFT').length;

    return {
      totalPurchases,
      postedCount,
      draftCount,
      invoices,
    };
  }
}
