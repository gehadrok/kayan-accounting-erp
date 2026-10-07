import { getDb, withTransaction } from './db.ts';
import { logAudit } from './auditService.ts';
import { AccountingService } from './accountingService.ts';
import { SettingsService } from './settingsService.ts';

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
}

export interface CreateReceiptAllocationDto {
  invoiceId: string;
  amount: number;
}

export interface CreateReceiptDto {
  customerId: string;
  paymentMethod: 'CASH' | 'BANK';
  targetAccountId?: string; // Cash 1101 or Bank 1102
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
  // Customers
  // ==========================================

  static async getCustomers(search?: string) {
    const db = await getDb();
    let query = `
      SELECT 
        c.*,
        a.code as "accountCode",
        a.name as "accountName",
        COALESCE(
          (SELECT SUM(inv.total - inv.paid_amount)
           FROM sales.sales_invoices inv
           WHERE inv.customer_id = c.id AND inv.status = 'POSTED' AND inv.payment_type = 'CREDIT'), 0
        ) as "outstandingBalance",
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
        COALESCE(
          (SELECT SUM(inv.total - inv.paid_amount)
           FROM sales.sales_invoices inv
           WHERE inv.customer_id = c.id AND inv.status = 'POSTED' AND inv.payment_type = 'CREDIT'), 0
        ) as "outstandingBalance",
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
        je.entry_number as "journalEntryNumber"
      FROM sales.sales_invoices inv
      JOIN sales.customers c ON c.id = inv.customer_id
      LEFT JOIN accounting.journal_entries je ON je.id = inv.journal_entry_id
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
        w.name as "warehouseName"
      FROM sales.sales_invoice_lines l
      LEFT JOIN inventory.items i ON i.id = l.item_id
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
      action: 'CREATE',
      entityType: 'SALES_INVOICE',
      entityId: invoice.id,
      newData: { invoice, lines: computedLines },
    });

    return { ...invoice, lines: computedLines };
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
    const whRes = await db.query<any>('SELECT id FROM inventory.warehouses WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1');
    const defaultWhId = whRes.rows[0]?.id;

    const issueLines: any[] = [];
    let totalCOGS = 0;

    if (invoice.lines && invoice.lines.length > 0 && defaultWhId) {
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
          const whCheck = await db.query<any>('SELECT id FROM inventory.warehouses WHERE id = $1 AND is_active = TRUE', [targetWhId]);
          if (whCheck.rows.length === 0) {
            throw new Error(`المستودع المحدد للصنف "${item.name}" غير موجود أو معطل — تم رفض الترحيل قبل إنشاء أي قيد`);
          }
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
      if (issueLines.length > 0) {
        await InventoryService.createStockTransaction({
          transactionType: 'SALES_ISSUE',
          transactionDate: invoice.invoice_date,
          warehouseId: defaultWhId,
          referenceType: 'SALES_INVOICE',
          referenceId: invoiceId,
          notes: `صرف مخزني بموجب فاتورة مبيعات ${invoice.invoice_number}`,
          lines: issueLines,
          companyId: invoice.company_id,
          userId,
        });

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

    if (invoice.status === 'POSTED' && invoice.journal_entry_id) {
      // Reverse the journal entry
      await AccountingService.reverseJournalEntry(invoice.journal_entry_id, userId);
    }

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
      newData: { status: 'VOIDED' },
    });

    return { success: true, message: 'تم إلغاء فاتورة المبيعات وعكس قيدها المحاسبي' };
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
        a.name as "targetAccountName",
        je.entry_number as "journalEntryNumber"
      FROM sales.receipts r
      JOIN sales.customers c ON c.id = r.customer_id
      JOIN accounting.accounts a ON a.id = r.target_account_id
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
        a.name as "targetAccountName",
        je.entry_number as "journalEntryNumber"
      FROM sales.receipts r
      JOIN sales.customers c ON c.id = r.customer_id
      JOIN accounting.accounts a ON a.id = r.target_account_id
      LEFT JOIN accounting.journal_entries je ON je.id = r.journal_entry_id
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

    // Determine target account (Cash 1101 or Bank 1102)
    let targetAccountId = dto.targetAccountId;
    if (!targetAccountId) {
      const code = dto.paymentMethod === 'BANK' ? '1102' : '1101';
      const accRes = await db.query<any>('SELECT id FROM accounting.accounts WHERE code = $1 LIMIT 1', [code]);
      targetAccountId = accRes.rows[0]?.id;
    }

    // Generate receipt number
    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM sales.receipts');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const receiptNumber = `RCV-2026-${seq.toString().padStart(4, '0')}`;

    // Validate allocations if provided
    let totalAlloc = 0;
    if (dto.allocations && dto.allocations.length > 0) {
      for (const a of dto.allocations) {
        totalAlloc += a.amount;
      }
      if (totalAlloc > dto.amount) {
        throw new Error(`إجمالي المبالغ المخصصة (${totalAlloc.toLocaleString()}) يتجاوز مبلغ سند القبض (${dto.amount.toLocaleString()})`);
      }
    }

    const unallocated = dto.amount - totalAlloc;

    const rRes = await db.query<any>(`
      INSERT INTO sales.receipts 
      (company_id, branch_id, receipt_number, customer_id, payment_method, target_account_id, receipt_date, amount, allocated_amount, unallocated_amount, reference_number, description, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'DRAFT', $13)
      RETURNING *
    `, [
      companyId,
      branchId,
      receiptNumber,
      dto.customerId,
      dto.paymentMethod,
      targetAccountId,
      dto.receiptDate,
      dto.amount,
      totalAlloc,
      unallocated,
      dto.referenceNumber || null,
      dto.description || `سند قبض نقدي/بنكي من العميل`,
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
    const customer = await this.getCustomerById(receipt.customer_id);

    // Receivables Account: 1103
    let receivablesAccountId = customer.receivables_account_id;
    if (!receivablesAccountId) {
      const defAcc = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1103' LIMIT 1");
      receivablesAccountId = defAcc.rows[0].id;
    }

    // Target Account: Cash or Bank
    const targetAccountId = receipt.target_account_id;

    // 1. Create Double-Entry Journal Entry
    const journalEntry = await AccountingService.createJournalEntry({
      companyId: receipt.company_id,
      branchId: receipt.branch_id,
      entryDate: receipt.receipt_date,
      sourceId: 'RECEIPTS',
      description: `سند قبض رقم ${receipt.receipt_number} من العميل ${customer.name}`,
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
          description: `دائن: ذمم العميل ${customer.name} (سند قبض رقم ${receipt.receipt_number})`,
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
        date: row.docDate,
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
