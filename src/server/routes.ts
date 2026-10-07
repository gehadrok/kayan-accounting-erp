import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { AccountingService } from './accountingService.ts';
import { getAuditLogs, logAudit } from './auditService.ts';
import { getDb, withTransaction } from './db.ts';

export const apiRouter = Router();

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

    res.json({
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      email: user.email,
      role: 'SUPER_ADMIN',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'حدث خطأ في تسجيل الدخول' });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/accounts', async (req: Request, res: Response) => {
  try {
    const { code, name, accountTypeId, parentId, level, isGroup, normalBalance } = req.body;
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
    });
    res.status(201).json(newAccount);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.put('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body;
    const updated = await AccountingService.updateAccount(id, { name, isActive });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/journal-entries', async (req: Request, res: Response) => {
  try {
    const { entryDate, description, lines, sourceId } = req.body;
    if (!entryDate || !description || !lines || lines.length < 2) {
      return res.status(400).json({ error: 'التاريخ والبيان وسطور القيد (طرفين على الأقل) مطلوبة' });
    }

    const entry = await AccountingService.createJournalEntry({
      entryDate,
      description,
      lines,
      sourceId,
    });
    res.status(201).json(entry);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/journal-entries/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const entryRes = await db.query<any>('SELECT * FROM accounting.journal_entries WHERE id = $1', [req.params.id]);
    if (entryRes.rows.length === 0) {
      return res.status(404).json({ error: 'القيد غير موجود' });
    }

    const linesRes = await db.query<any>(`
      SELECT jl.*, a.code as "accountCode", a.name as "accountName"
      FROM accounting.journal_entry_lines jl
      JOIN accounting.accounts a ON a.id = jl.account_id
      WHERE jl.journal_entry_id = $1
      ORDER BY jl.line_number ASC
    `, [req.params.id]);

    const entry: any = entryRes.rows[0];

    res.json({
      ...entry,
      lines: linesRes.rows,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Post a Journal Entry (ترحيل القيد مع الفحص المزدوج وفترة الصلاحية)
apiRouter.post('/journal-entries/:id/post', async (req: Request, res: Response) => {
  try {
    const posted = await AccountingService.postJournalEntry(req.params.id);
    res.json({
      success: true,
      message: 'تم ترحيل القيد بنجاح',
      entry: posted,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Reverse a Journal Entry (عكس القيد المرحل)
apiRouter.post('/journal-entries/:id/reverse', async (req: Request, res: Response) => {
  try {
    const result = await AccountingService.reverseJournalEntry(req.params.id);
    res.json({
      success: true,
      message: 'تم إنشاء قيد العكس وترحيله وتحديث القيد الأصلي',
      result,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete a Journal Entry (مسودة فقط)
apiRouter.delete('/journal-entries/:id', async (req: Request, res: Response) => {
  try {
    const result = await AccountingService.deleteJournalEntry(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get(['/fiscal-periods', '/accounting/fiscal-periods'], async (_req: Request, res: Response) => {
  try {
    const periods = await AccountingService.getFiscalPeriods();
    res.json(periods);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/accounting/cost-centers', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const result = await db.query<any>('SELECT * FROM accounting.cost_centers WHERE is_active = TRUE ORDER BY code ASC');
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 5. Reports (التقارير المالية)
// ==========================================
apiRouter.get('/reports/trial-balance', async (_req: Request, res: Response) => {
  try {
    const trialBalance = await AccountingService.getTrialBalance();
    res.json(trialBalance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 6. Audit Trail (سجل التدقيق)
// ==========================================
apiRouter.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const logs = await getAuditLogs(limit);
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/customers', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const customer = await SalesService.createCustomer(req.body);
    res.status(201).json(customer);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/customers/:id', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const customer = await SalesService.getCustomerById(req.params.id);
    res.json(customer);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.put('/customers/:id', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const updated = await SalesService.updateCustomer(req.params.id, req.body);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/customers/:id/unpaid-invoices', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const invoices = await SalesService.getUnpaidInvoices(req.params.id);
    res.json(invoices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/sales/invoices', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const invoice = await SalesService.createInvoice(req.body);
    res.status(201).json(invoice);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/sales/invoices/:id', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const invoice = await SalesService.getInvoiceById(req.params.id);
    res.json(invoice);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.post('/sales/invoices/:id/post', async (req: Request, res: Response) => {
  try {
    const { allowOverride } = req.body;
    const { SalesService } = await import('./salesService.ts');
    const result = await SalesService.postSalesInvoice(req.params.id, undefined, allowOverride);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/sales/invoices/:id/void', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const result = await SalesService.voidSalesInvoice(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/sales/receipts', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const receipt = await SalesService.createReceipt(req.body);
    res.status(201).json(receipt);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/sales/receipts/:id', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const receipt = await SalesService.getReceiptById(req.params.id);
    res.json(receipt);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.post('/sales/receipts/:id/post', async (req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const result = await SalesService.postReceipt(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/reports/ar-aging', async (_req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const report = await SalesService.getAccountsReceivableReport();
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/reports/accounts-receivable', async (_req: Request, res: Response) => {
  try {
    const { SalesService } = await import('./salesService.ts');
    const report = await SalesService.getAccountsReceivableReport();
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/suppliers', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const supplier = await PurchasingService.createSupplier(req.body);
    res.status(201).json(supplier);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/suppliers/:id', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const supplier = await PurchasingService.getSupplierById(req.params.id);
    res.json(supplier);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.put('/suppliers/:id', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const updated = await PurchasingService.updateSupplier(req.params.id, req.body);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/suppliers/:id/unpaid-invoices', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const invoices = await PurchasingService.getUnpaidInvoices(req.params.id);
    res.json(invoices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/purchasing/invoices', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const invoice = await PurchasingService.createInvoice(req.body);
    res.status(201).json(invoice);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/purchasing/invoices/:id', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const invoice = await PurchasingService.getInvoiceById(req.params.id);
    res.json(invoice);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.post('/purchasing/invoices/:id/post', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const result = await PurchasingService.postPurchaseInvoice(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/purchasing/invoices/:id/void', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const result = await PurchasingService.reversePurchaseInvoice(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/purchasing/payments', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const payment = await PurchasingService.createPayment(req.body);
    res.status(201).json(payment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/purchasing/payments/:id', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const payment = await PurchasingService.getPaymentById(req.params.id);
    res.json(payment);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.post('/purchasing/payments/:id/post', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const result = await PurchasingService.postSupplierPayment(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/purchasing/payments/:id/void', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const result = await PurchasingService.reverseSupplierPayment(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ==========================================
// 15. Reports (Supplier Statement, AP Aging, AP Reconciliation)
// ==========================================
apiRouter.get('/reports/supplier-statement/:id', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const statement = await PurchasingService.getSupplierStatement(req.params.id);
    res.json(statement);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/reports/supplier-statement', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const db = await import('./db.ts').then(m => m.getDb());
    const supplierId = req.query.supplierId as string;
    let targetId = supplierId;
    if (!targetId) {
      const supps = await db.query<any>('SELECT id FROM purchasing.suppliers WHERE is_active = true LIMIT 1');
      if (supps.rows.length === 0) return res.json([]);
      targetId = supps.rows[0].id;
    }
    const statement = await PurchasingService.getSupplierStatement(targetId);
    res.json(statement);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/reports/ap-aging', async (_req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const aging = await PurchasingService.getAccountsPayableAging();
    res.json(aging);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/reports/accounts-payable-aging', async (_req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const aging = await PurchasingService.getAccountsPayableAging();
    res.json(aging);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/reports/ap-reconciliation', async (_req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const report = await PurchasingService.getAPReconciliation();
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/reports/purchase-summary', async (req: Request, res: Response) => {
  try {
    const { PurchasingService } = await import('./purchasingService.ts');
    const summary = await PurchasingService.getPurchaseSummary(req.query.period as string);
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
      WHERE a.code IN ('1101', '1102') AND je.status = 'POSTED'
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
// 17. Inventory (المخزون والمستودعات)
// ==========================================
apiRouter.get('/inventory/categories', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const categories = await InventoryService.getCategories();
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/inventory/categories', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const category = await InventoryService.createCategory(req.body);
    res.status(201).json(category);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/inventory/units', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const units = await InventoryService.getUnits();
    res.json(units);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/inventory/units', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const unit = await InventoryService.createUnit(req.body);
    res.status(201).json(unit);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/inventory/warehouses', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const warehouses = await InventoryService.getWarehouses();
    res.json(warehouses);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/inventory/warehouses', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const warehouse = await InventoryService.createWarehouse(req.body);
    res.status(201).json(warehouse);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/inventory/items', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const item = await InventoryService.createItem(req.body);
    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/inventory/items/:id', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const item = await InventoryService.getItemById(req.params.id);
    res.json(item);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.put('/inventory/items/:id', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const updated = await InventoryService.updateItem(req.params.id, req.body);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.delete('/inventory/items/:id', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const result = await InventoryService.deleteItem(req.params.id, req.body.userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/inventory/items/:id/stock', async (req: Request, res: Response) => {
  try {
    const warehouseId = req.query.warehouseId as string;
    const { InventoryService } = await import('./inventoryService.ts');
    const stock = await InventoryService.getItemStock(req.params.id, warehouseId);
    res.json(stock);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/inventory/items/:id/ledger', async (req: Request, res: Response) => {
  try {
    const warehouseId = req.query.warehouseId as string;
    const { InventoryService } = await import('./inventoryService.ts');
    const ledger = await InventoryService.getItemLedger(req.params.id, warehouseId);
    res.json(ledger);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/inventory/transactions/:id', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const tx = await InventoryService.getStockTransactionDetails(req.params.id);
    res.json(tx);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.post('/inventory/transactions', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const tx = await InventoryService.createStockTransaction(req.body);
    res.status(201).json(tx);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/inventory/transfers', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const transfers = await InventoryService.getStockTransfers();
    res.json(transfers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/inventory/transfers', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const transfer = await InventoryService.createStockTransfer(req.body);
    res.status(201).json(transfer);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/inventory/counts', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const counts = await InventoryService.getStockCounts();
    res.json(counts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/inventory/counts', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const count = await InventoryService.createStockCount(req.body);
    res.status(201).json(count);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/inventory/counts/:id/approve', async (req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const result = await InventoryService.approveStockCount(req.params.id, req.body.userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/reports/inventory-reconciliation', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const report = await InventoryService.getInventoryReconciliation();
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/inventory/reports/reconciliation', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const report = await InventoryService.getInventoryReconciliation();
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/inventory/reports/low-stock', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const items = await InventoryService.getItems();
    const lowStock = items.filter(i => i.stockStatus === 'LOW_STOCK');
    res.json(lowStock);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/inventory/reports/out-of-stock', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const items = await InventoryService.getItems();
    const outOfStock = items.filter(i => i.stockStatus === 'OUT_OF_STOCK');
    res.json(outOfStock);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/inventory/dashboard-summary', async (_req: Request, res: Response) => {
  try {
    const { InventoryService } = await import('./inventoryService.ts');
    const summary = await InventoryService.getInventoryDashboardSummary();
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

// Cash Accounts
apiRouter.get('/banking/cash-accounts', async (_req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const accounts = await BankingService.getCashAccounts();
    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/banking/cash-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const account = await BankingService.getCashAccountById(req.params.id);
    res.json(account);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.post('/banking/cash-accounts', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const created = await BankingService.createCashAccount(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.put('/banking/cash-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const updated = await BankingService.updateCashAccount(req.params.id, req.body);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Bank Accounts
apiRouter.get('/banking/bank-accounts', async (_req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const accounts = await BankingService.getBankAccounts();
    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/banking/bank-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const account = await BankingService.getBankAccountById(req.params.id);
    res.json(account);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.post('/banking/bank-accounts', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const created = await BankingService.createBankAccount(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.put('/banking/bank-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const updated = await BankingService.updateBankAccount(req.params.id, req.body);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/banking/balances/:category/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const category = req.params.category.toUpperCase() as 'CASH' | 'BANK';
    const balance = await BankingService.getAccountBalance(category, req.params.id);
    res.json({ balance });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/banking/transfers', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const transfer = await BankingService.createTransfer(req.body);
    res.status(201).json(transfer);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Direct Bank Charges
apiRouter.post('/banking/charges', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const result = await BankingService.createBankCharge(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Bank Statements
apiRouter.get('/banking/statements', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const statements = await BankingService.getBankStatements(req.query.bankAccountId as string);
    res.json(statements);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/banking/statements/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const statement = await BankingService.getBankStatementById(req.params.id);
    res.json(statement);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.post('/banking/statements', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const created = await BankingService.createBankStatement(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Bank Reconciliation
apiRouter.get('/banking/reconciliations', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const reconciliations = await BankingService.getBankReconciliations(req.query.bankAccountId as string);
    res.json(reconciliations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/banking/charges', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const result = await BankingService.createBankCharge(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/banking/reconciliations', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const reconciliation = await BankingService.createBankReconciliation(req.body);
    res.status(201).json(reconciliation);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Cash Counts
apiRouter.get('/banking/cash-counts', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const counts = await BankingService.getCashCounts(req.query.cashAccountId as string);
    res.json(counts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/banking/cash-counts/:id', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const count = await BankingService.getCashCountById(req.params.id);
    res.json(count);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.post('/banking/cash-counts', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const count = await BankingService.createCashCount(req.body);
    res.status(201).json(count);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/banking/cash-counts/:id/approve', async (req: Request, res: Response) => {
  try {
    const { BankingService } = await import('./bankingService.ts');
    const approved = await BankingService.approveCashCount(req.params.id, req.body.userId);
    res.json(approved);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/assets/reports/reconciliation', async (_req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const report = await AssetService.getAssetGlReconciliation();
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/assets/categories', async (_req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const categories = await AssetService.getCategories();
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/assets/categories', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const created = await AssetService.createCategory(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/assets/:id', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const asset = await AssetService.getAssetById(req.params.id);
    res.json(asset);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.post('/assets', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const created = await AssetService.createAsset(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/assets/:id/capitalize', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const result = await AssetService.capitalizeAsset(req.params.id, req.body.capitalizationDate, req.body.userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/assets/:id/depreciation', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const result = await AssetService.postDepreciationEntry(req.params.id, req.body.fiscalPeriodId, req.body.userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/assets/:id/transfer', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const result = await AssetService.transferAsset({ ...req.body, assetId: req.params.id });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/assets/:id/maintenance', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const result = await AssetService.recordMaintenance({ ...req.body, assetId: req.params.id });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/assets/:id/dispose', async (req: Request, res: Response) => {
  try {
    const { AssetService } = await import('./assetService.ts');
    const result = await AssetService.disposeAsset({ ...req.body, assetId: req.params.id });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- Expenses ---
apiRouter.get('/expenses/summary', async (_req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const summary = await ExpenseService.getExpenseSummary();
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/expenses/categories', async (_req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const categories = await ExpenseService.getCategories();
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/expenses/categories', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const created = await ExpenseService.createCategory(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

// Move /expenses/:id below static routes so it doesn't intercept /expenses/accruals and /expenses/prepaid
apiRouter.post('/expenses', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const created = await ExpenseService.createExpense(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/expenses/:id/approve', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const approved = await ExpenseService.approveExpense(req.params.id, req.body.userId);
    res.json(approved);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/expenses/:id/post', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const posted = await ExpenseService.postExpense(req.params.id, req.body.userId);
    res.json(posted);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/expenses/:id/reverse', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const reversed = await ExpenseService.reverseExpense(req.params.id, req.body.reason || 'إلغاء وعكس المصروف', req.body.userId);
    res.json(reversed);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- Accruals ---
apiRouter.get('/expenses/accruals', async (_req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const accruals = await ExpenseService.getAccruals();
    res.json(accruals);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/expenses/accruals', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const created = await ExpenseService.createAccrual(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/expenses/accruals/:id/pay', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const paid = await ExpenseService.payAccrual({ ...req.body, accrualId: req.params.id });
    res.json(paid);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- Prepaid Schedules ---
apiRouter.get('/expenses/prepaid', async (_req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const schedules = await ExpenseService.getPrepaidSchedules();
    res.json(schedules);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/expenses/prepaid/:id', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const schedule = await ExpenseService.getPrepaidScheduleById(req.params.id);
    res.json(schedule);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

apiRouter.post('/expenses/prepaid', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const created = await ExpenseService.createPrepaidSchedule(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/expenses/prepaid/amortizations/:id/post', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const result = await ExpenseService.postPrepaidAmortization(req.params.id, req.body.userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Parameterized expense route placed after static accruals and prepaid routes
apiRouter.get('/expenses/:id', async (req: Request, res: Response) => {
  try {
    const { ExpenseService } = await import('./expenseService.ts');
    const expense = await ExpenseService.getExpenseById(req.params.id);
    res.json(expense);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
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
      accountId: req.query.accountId as string,
      branchId: req.query.branchId as string,
      costCenterId: req.query.costCenterId as string,
      fiscalYearId: req.query.fiscalYearId as string,
      fiscalPeriodId: req.query.fiscalPeriodId as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    });
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.status(404).json({ error: error.message });
  }
});

// 3. Trial Balance
apiRouter.get('/reports/trial-balance', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const tb = await ReportingService.getTrialBalance({
      branchId: req.query.branchId as string,
      fiscalYearId: req.query.fiscalYearId as string,
      fiscalPeriodId: req.query.fiscalPeriodId as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
    });
    res.json(tb);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

// 7. AR Aging
apiRouter.get('/reports/ar-aging', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const aging = await ReportingService.getArAging(req.query.asOfDate as string);
    res.json(aging);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. AP Aging
apiRouter.get('/reports/ap-aging', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const aging = await ReportingService.getApAging(req.query.asOfDate as string);
    res.json(aging);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

// 12. Monthly Trends
apiRouter.get('/reports/monthly', async (req: Request, res: Response) => {
  try {
    const { ReportingService } = await import('./reportingService.ts');
    const report = await ReportingService.getMonthlyReport(req.query.fiscalYearId as string);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 13. Financial Integrity & Cross-Module Reconciliation
apiRouter.get('/reports/reconciliation', async (req: Request, res: Response) => {
  try {
    const { FinancialIntegrityService } = await import('./financialIntegrityService.ts');
    const report = await FinancialIntegrityService.runIntegrityCheck(req.query.asOfDate as string);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 14. Fiscal Period Closing Check & Workflow
apiRouter.get('/fiscal-periods/:id/closing-check', async (req: Request, res: Response) => {
  try {
    const { FinancialIntegrityService } = await import('./financialIntegrityService.ts');
    const check = await FinancialIntegrityService.runPeriodClosingCheck(req.params.id);
    res.json(check);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/fiscal-periods/:id/close', async (req: Request, res: Response) => {
  try {
    const { FinancialIntegrityService } = await import('./financialIntegrityService.ts');
    const result = await FinancialIntegrityService.closeFiscalPeriod(req.params.id, req.body.userId, req.body.notes);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/fiscal-periods/:id/reopen', async (req: Request, res: Response) => {
  try {
    const { FinancialIntegrityService } = await import('./financialIntegrityService.ts');
    const result = await FinancialIntegrityService.reopenFiscalPeriod(req.params.id, req.body.userId || 'admin', req.body.reason);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 15. Fiscal Year Closing Workflow
apiRouter.post('/fiscal-years/:id/close', async (req: Request, res: Response) => {
  try {
    const { FinancialIntegrityService } = await import('./financialIntegrityService.ts');
    const result = await FinancialIntegrityService.closeFiscalYear(req.params.id, req.body.userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/sales/returns', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { SettingsService } = await import('./settingsService.ts');
    const { customerId, originalInvoiceId, returnDate, notes, lines, userId } = req.body;
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
    const { InventoryService } = await import('./inventoryService.ts');
    const whRes = await db.query<any>('SELECT id FROM inventory.warehouses WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1');
    const defaultWhId = whRes.rows[0]?.id;
    const returnStockLines: any[] = [];
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
        const qty = parseFloat(l.quantity || 1);
        const stockData = await InventoryService.getItemStock(item.id, defaultWhId);
        totalReturnCost += qty * stockData.averageCost;
        returnStockLines.push({ itemId: item.id, quantity: qty, unitCost: stockData.averageCost });
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
        userId,
      });
      const postedJE = await AccountingService.postJournalEntry(je.id, userId);

      const returnRes = await db.query<any>(`
        INSERT INTO sales.sales_returns (company_id, return_number, customer_id, original_invoice_id, return_date, subtotal, tax, total, status, journal_entry_id, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'POSTED', $9, $10, $11)
        RETURNING *
      `, [companyId, returnNumber, customerId, originalInvoiceId || null, returnDate, subtotal, tax, total, postedJE.id, notes || null, userId || null]);
      const created = returnRes.rows[0];

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const q = parseFloat(l.quantity || 1);
        const p = parseFloat(l.unitPrice || 0);
        const t = parseFloat(l.tax || 0);
        await db.query(`
          INSERT INTO sales.sales_return_lines (return_id, item_code, description, quantity, unit_price, tax, line_total, line_number)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [created.id, l.itemCode || null, l.description || 'صنف مردود', q, p, t, (q * p) + t, i + 1]);
      }

      // Inventory UP (RETURN_IN at actual WAC) + COGS DOWN (DR Inventory / CR COGS)
      if (returnStockLines.length > 0 && defaultWhId) {
        await InventoryService.createStockTransaction({
          transactionType: 'RETURN_IN',
          transactionDate: returnDate,
          warehouseId: defaultWhId,
          referenceType: 'SALES_RETURN',
          referenceId: created.id,
          notes: `استلام مرتجع بموجب مردود مبيعات ${returnNumber}`,
          lines: returnStockLines,
          companyId,
          userId,
        });

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
            userId,
          });
          await AccountingService.postJournalEntry(cogsRevJE.id, userId);
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
    res.status(400).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/purchasing/returns', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { supplierId, originalInvoiceId, returnDate, notes, lines, userId } = req.body;
    if (!supplierId || !returnDate || !lines || lines.length === 0) {
      return res.status(400).json({ error: 'المورد وتاريخ المردود وبنود المردود مطلوبة' });
    }

    const compRes = await db.query<any>('SELECT id FROM core.companies LIMIT 1');
    const companyId = compRes.rows[0]?.id;
    const countRes = await db.query<any>('SELECT COUNT(*) as count FROM purchasing.purchase_returns');
    const returnNumber = `PR-${new Date().getFullYear()}-${String(parseInt(countRes.rows[0]?.count || '0', 10) + 1).padStart(4, '0')}`;

    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      const q = parseFloat(l.quantity || 1);
      const p = parseFloat(l.unitPrice || 0);
      const t = parseFloat(l.tax || 0);
      subtotal += q * p;
      tax += t;
    }
    const total = subtotal + tax;

    const suppRes = await db.query<any>('SELECT * FROM purchasing.suppliers WHERE id = $1', [supplierId]);
    const supplier = suppRes.rows[0];
    if (!supplier) {
      return res.status(400).json({ error: 'المورد المحدد غير موجود' });
    }
    // Resolve accounts via Central Settings Mapping (PHASE 9.1 — no hardcoded business logic)
    const { SettingsService: PurSettings } = await import('./settingsService.ts');
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
    let vatInAccId: string | null = null;
    if (tax > 0) {
      vatInAccId = await PurSettings.getAccountMapping('purchasing.default_input_tax_account', '1105', companyId);
    }

    // Journal Entry (DR Payables, CR Purchases, CR Input Tax) — mirrors purchase posting in reverse
    const jeLines: any[] = [
      {
        accountId: payablesAccountId,
        debit: total,
        credit: 0,
        description: `مدين: ذمم المورد ${supplier?.name || ''} - إشعار مدين ${returnNumber}`,
      },
      {
        accountId: purchaseReturnAccountId,
        debit: 0,
        credit: subtotal,
        description: `دائن: مردودات المشتريات - مردود مشتريات ${returnNumber}`,
      },
    ];
    if (tax > 0 && vatInAccId) {
      jeLines.push({
        accountId: vatInAccId,
        debit: 0,
        credit: tax,
        description: `دائن: عكس ضريبة المدخلات - مردود مشتريات ${returnNumber}`,
      });
    }

    // ATOMIC COMMIT (PHASE 9.1): journal + return header + lines persist together
    const createdReturn = await withTransaction(async () => {
      const je = await AccountingService.createJournalEntry({
        companyId,
        entryDate: returnDate,
        sourceId: 'SYSTEM',
        description: `إثبات مردودات مشتريات رقم ${returnNumber} للمورد ${supplier?.name || ''}`,
        lines: jeLines,
        userId,
      });
      const postedJE = await AccountingService.postJournalEntry(je.id, userId);

      const returnRes = await db.query<any>(`
        INSERT INTO purchasing.purchase_returns (company_id, return_number, supplier_id, original_invoice_id, return_date, subtotal, tax, total, status, journal_entry_id, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'POSTED', $9, $10, $11)
        RETURNING *
      `, [companyId, returnNumber, supplierId, originalInvoiceId || null, returnDate, subtotal, tax, total, postedJE.id, notes || null, userId || null]);
      const created = returnRes.rows[0];

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const q = parseFloat(l.quantity || 1);
        const p = parseFloat(l.unitPrice || 0);
        const t = parseFloat(l.tax || 0);
        await db.query(`
          INSERT INTO purchasing.purchase_return_lines (return_id, item_code, description, quantity, unit_price, tax, line_total, line_number)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [created.id, l.itemCode || null, l.description || 'صنف مردود', q, p, t, (q * p) + t, i + 1]);
      }

      return created;
    });

    res.status(201).json({
      success: true,
      message: 'تم تسجيل وترحيل مردود المشتريات وتحديث حساب المورد والقيد المحاسبي',
      purchaseReturn: createdReturn,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ==========================================
// 18. Settings (Users, Roles & Branches)
// ==========================================
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
        COALESCE(r.name, 'مدير النظام الكامل (Super Admin)') as "roleName"
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
    res.status(500).json({ error: error.message });
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
        COUNT(DISTINCT rp.permission_id) AS "permissionsCount"
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
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 20. Central Settings Hub (مركز الإعدادات المركزي)
// ==========================================

// Get all settings grouped by module
apiRouter.get('/settings', async (_req: Request, res: Response) => {
  try {
    const { SettingsService } = await import('./settingsService.ts');
    const settings = await SettingsService.getAllSettings();
    const health = await SettingsService.getSystemConfigurationHealth();
    res.json({
      settings,
      health,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// System Configuration Health Check & Missing Settings Detector
apiRouter.get('/settings/health', async (_req: Request, res: Response) => {
  try {
    const { SettingsService } = await import('./settingsService.ts');
    const health = await SettingsService.getSystemConfigurationHealth();
    res.json(health);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get settings audit trail
apiRouter.get('/settings/audit', async (req: Request, res: Response) => {
  try {
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
    res.status(500).json({ error: error.message });
  }
});

// Get settings for a specific module
apiRouter.get('/settings/module/:module', async (req: Request, res: Response) => {
  try {
    const { SettingsService } = await import('./settingsService.ts');
    const settings = await SettingsService.getModuleSettings(req.params.module);
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a single setting
apiRouter.put('/settings/:key', async (req: Request, res: Response) => {
  try {
    const { SettingsService } = await import('./settingsService.ts');
    const { value, reason, userId, username, branchId, companyId } = req.body;
    const result = await SettingsService.setSetting(req.params.key, value, {
      userId,
      username,
      reason,
      branchId,
      companyId,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Bulk update settings
apiRouter.post('/settings/bulk', async (req: Request, res: Response) => {
  try {
    const { SettingsService } = await import('./settingsService.ts');
    const { settings, userId, username, reason } = req.body;
    if (!Array.isArray(settings)) {
      return res.status(400).json({ error: 'مصفوفة الإعدادات مطلوبة' });
    }

    const results = [];
    for (const item of settings) {
      if (item.key && item.value !== undefined) {
        const res = await SettingsService.setSetting(item.key, item.value, {
          userId,
          username,
          reason: reason || 'تحديث جماعي للإعدادات',
        });
        results.push(res);
      }
    }

    res.json({ success: true, updatedCount: results.length, results });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Reset setting to default
apiRouter.post('/settings/reset/:key', async (req: Request, res: Response) => {
  try {
    const { SettingsService } = await import('./settingsService.ts');
    await SettingsService.resetSetting(req.params.key, undefined, req.body.userId);
    res.json({ success: true, message: `تمت استعادة القيمة الافتراضية للإعداد ${req.params.key}` });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
      default:
        return res.status(400).json({ error: 'Invalid lookup type' });
    }

    const result = await db.query<any>(queryText, queryParams);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});








