import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useLookup } from '../context/LookupContext';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { ReportHeader, type CompanyIdentity } from '../components/company/ReportHeader';
import {
  Button,
  Card,
  DatePicker,
  EmptyState,
  IconButton,
  Input,
  KpiCard,
  LoadingState,
  PageHeader,
  PageToolbar,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '../components/ui';
import {
  DocumentActionBar,
  DocumentAuditCard,
  DocumentField,
  DocumentReadField,
  DocumentReadGrid,
  DocumentStatusBadge,
  DocumentSummaryCard,
  DocumentTableShell,
  DocumentWorkspace,
  type DocumentMode,
  type DocumentStatus,
  type SummaryRow,
} from '../components/documents';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface PurchaseReturnLine {
  itemId?: string;
  itemCode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  tax: number;
}

interface SavedPurchaseReturnLine {
  id?: string;
  itemId?: string;
  itemName?: string;
  itemSku?: string;
  itemUnit?: string;
  item_code?: string;
  description: string;
  quantity: string | number;
  unit_price: string | number;
  tax: string | number;
  line_total: string | number;
  line_number: number;
  warehouseName?: string;
}

interface PurchaseReturn {
  id: string;
  return_number: string;
  supplierName: string;
  supplierCode: string;
  supplierPhone?: string;
  supplierTaxNumber?: string;
  originalInvoiceNumber?: string;
  return_date: string;
  subtotal: string;
  tax: string;
  total: string;
  status: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
  created_by?: string;
  createdByName?: string;
  branchName?: string;
  journalEntryNumber?: string;
  lines?: SavedPurchaseReturnLine[];
}

interface SupplierOption {
  id: string;
  code: string;
  name: string;
}

interface PurchaseInvoiceOption {
  id: string;
  invoice_number: string;
  supplier_id: string;
  total: string;
}

interface TaxCodeOption {
  id: string;
  code: string;
  name: string;
  rate_percentage: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function money(value: number | string | null | undefined): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '0';
}

function dateOnly(value?: string | null): string {
  return value ? String(value).slice(0, 10) : '';
}

function toDocumentStatus(status?: string | null): DocumentStatus {
  if (status === 'DRAFT') return 'DRAFT';
  if (status === 'VOIDED') return 'VOIDED';
  return 'POSTED';
}

function statusLabel(status?: string | null): string {
  if (status === 'DRAFT') return 'مسودة';
  if (status === 'VOIDED') return 'ملغاة';
  return 'مرحّل';
}

const emptyLine = (): PurchaseReturnLine => ({
  itemCode: '',
  description: '',
  quantity: 1,
  unitPrice: 0,
  tax: 0,
});

/* ------------------------------------------------------------------ */
/* Print view                                                         */
/* ------------------------------------------------------------------ */

const PurchaseReturnPrint: React.FC<{
  ret: PurchaseReturn;
  company: CompanyIdentity | null;
}> = ({ ret, company }) => {
  const subtotal = parseFloat(ret.subtotal || '0');
  const tax = parseFloat(ret.tax || '0');
  const total = parseFloat(ret.total || '0');

  return (
    <div className="bg-white p-8 text-slate-800" dir="rtl">
      <ReportHeader
        company={company}
        title={`مردود مشتريات (إشعار مدين) رقم ${ret.return_number}`}
        subtitle={
          <>
            التاريخ: <bdi dir="ltr">{dateOnly(ret.return_date)}</bdi> • الحالة:{' '}
            {statusLabel(ret.status)}
          </>
        }
        compact
      />

      <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200/80 bg-slate-50 p-4 text-xs">
        <div>
          <span className="block font-bold text-slate-400">بيانات المورد:</span>
          <span className="mt-0.5 block text-sm font-bold text-slate-900">
            {ret.supplierName}
          </span>
          <span className="block font-mono text-slate-500">كود: {ret.supplierCode}</span>
        </div>
        <div>
          <span className="block font-bold text-slate-400">ربط المستند:</span>
          <span className="mt-0.5 block text-slate-700">
            فاتورة الشراء الأصلية: {ret.originalInvoiceNumber || '—'}
          </span>
          <span className="block text-slate-500">الفرع: {ret.branchName || '—'}</span>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-right text-xs">
          <thead className="border-b border-slate-200 bg-slate-100/70 font-bold text-slate-700">
            <tr>
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">البيان</th>
              <th className="px-3 py-2.5 text-center">الكمية</th>
              <th className="px-3 py-2.5 text-left">السعر</th>
              <th className="px-3 py-2.5 text-left">الضريبة</th>
              <th className="px-3 py-2.5 text-left">الإجمالي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ret.lines?.map((line, idx) => (
              <tr key={line.id || idx}>
                <td className="px-3 py-2.5 font-mono text-slate-400">
                  {line.line_number || idx + 1}
                </td>
                <td className="px-3 py-2.5">
                  <span className="block font-semibold text-slate-800">{line.description}</span>
                  {(line.item_code || line.itemSku) && (
                    <span className="block font-mono text-[10px] text-slate-500">
                      {line.item_code || line.itemSku}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center font-mono font-bold">
                  {Number(line.quantity).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-left font-mono">
                  {Number(line.unit_price).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-left font-mono">
                  {Number(line.tax).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-left font-mono font-bold text-slate-900">
                  {Number(line.line_total || 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex justify-end">
        <div className="w-64 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>المجموع الفرعي:</span>
            <span className="font-mono font-bold">{subtotal.toLocaleString()} ر.ي</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>إجمالي الضريبة:</span>
            <span className="font-mono font-bold">+{tax.toLocaleString()} ر.ي</span>
          </div>
          <div className="flex justify-between border-t border-slate-300 pt-1.5 text-sm font-black text-slate-900">
            <span>إجمالي المرتجع:</span>
            <span className="font-mono text-blue-600">{total.toLocaleString()} ريال يمني</span>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-black text-slate-800">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span>الأثر المحاسبي التلقائي:</span>
          </span>
          {ret.journalEntryNumber ? (
            <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono font-bold text-blue-600">
              رقم القيد: {ret.journalEntryNumber}
            </span>
          ) : (
            <span className="font-bold text-slate-500">رقم القيد: غير متوفر</span>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">
          يُرحَّل المردود آلياً عند الحفظ وفق إعدادات الحسابات المركزية. لا تُعدَّل القيود
          المحاسبية من شاشة المرتجعات.
        </p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export const PurchaseReturnsPage: React.FC = () => {
  const { openLookup } = useLookup();
  const { company } = useCompanyProfile();
  const toast = useToast();

  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoiceOption[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCodeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [workspaceMode, setWorkspaceMode] = useState<DocumentMode | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<PurchaseReturn | null>(null);

  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [originalInvoiceId, setOriginalInvoiceId] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [selectedTaxCodeId, setSelectedTaxCodeId] = useState('');
  const [lines, setLines] = useState<PurchaseReturnLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /* ---------------------------------------------------------------- */
  /* Data                                                             */
  /* ---------------------------------------------------------------- */

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resReturns, resSupp, resInv, resTax] = await Promise.all([
        fetch('/api/purchasing/returns'),
        fetch('/api/suppliers'),
        fetch('/api/purchasing/invoices'),
        fetch('/api/taxes/codes'),
      ]);

      if (resReturns.ok) {
        const data = await resReturns.json();
        setReturns(Array.isArray(data) ? data : []);
      }
      if (resSupp.ok) {
        const suppData = await resSupp.json();
        setSuppliers(Array.isArray(suppData) ? suppData : []);
      }
      if (resInv.ok) {
        const invData = await resInv.json();
        setInvoices(Array.isArray(invData) ? invData : []);
      }
      if (resTax.ok) {
        const taxData = await resTax.json();
        setTaxCodes(Array.isArray(taxData) ? taxData : []);
      }
    } catch (err: any) {
      console.error('Error fetching purchase returns:', err);
      toast.error('تعذر تحميل بيانات مردودات المشتريات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- */
  /* Lookups + line editing (same behaviour as before)                */
  /* ---------------------------------------------------------------- */

  const handleOpenSupplierLookup = () => {
    openLookup('SUPPLIER', (s: any) => {
      if (!s || !s.id) return;
      setSelectedSupplierId(s.id);
      setSuppliers((prev) => {
        if (!prev.some((x) => x.id === s.id)) {
          return [...prev, s];
        }
        return prev;
      });
    });
  };

  // Dynamic tax rate from Tax Configuration (no code => 0%).
  const getSelectedTaxRate = () => {
    if (!selectedTaxCodeId) return 0;
    const tc = taxCodes.find((t) => t.id === selectedTaxCodeId);
    return tc ? parseFloat(tc.rate_percentage || '0') / 100 : 0;
  };

  const handleTaxCodeChange = (taxCodeId: string) => {
    setSelectedTaxCodeId(taxCodeId);
    const tc = taxCodes.find((t) => t.id === taxCodeId);
    const rate = tc ? parseFloat(tc.rate_percentage || '0') / 100 : 0;
    setLines((prev) =>
      prev.map((l) => {
        const lineNet = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
        return { ...l, tax: Number((lineNet * rate).toFixed(2)) };
      })
    );
  };

  const handleOpenItemLookup = (index: number) => {
    openLookup('ITEM', (item: any) => {
      if (!item || !item.id) return;
      const price = parseFloat(
        item.purchasePrice || item.averageCost || item.purchase_price || 0
      );
      setLines((prev) => {
        const next = [...prev];
        const current = next[index] || emptyLine();
        const qty = Number(current.quantity) > 0 ? Number(current.quantity) : 1;
        const lineNet = qty * price;
        const taxVal = Number((lineNet * getSelectedTaxRate()).toFixed(2));
        next[index] = {
          ...current,
          itemId: item.id,
          itemCode: item.sku || item.barcode || item.name,
          description: item.name,
          unitPrice: price,
          quantity: qty,
          tax: taxVal,
        };
        return next;
      });
    });
  };

  const addLine = () => {
    setLines((prev) => [...prev, emptyLine()]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateLine = (index: number, field: keyof PurchaseReturnLine, value: any) => {
    setLines((prev) => {
      const updated = [...prev];
      const target = { ...updated[index], [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        const qty =
          field === 'quantity' ? Number(value) || 0 : Number(target.quantity) || 0;
        const price =
          field === 'unitPrice' ? Number(value) || 0 : Number(target.unitPrice) || 0;
        target.tax = Number((qty * price * getSelectedTaxRate()).toFixed(2));
      }
      updated[index] = target;
      return updated;
    });
  };

  /* ---------------------------------------------------------------- */
  /* Totals                                                           */
  /* ---------------------------------------------------------------- */

  const subtotal = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0
  );
  const totalTax = lines.reduce((sum, l) => sum + (Number(l.tax) || 0), 0);
  const computedTotal = subtotal + totalTax;

  const isDirty =
    Boolean(selectedSupplierId) ||
    Boolean(originalInvoiceId) ||
    Boolean(selectedTaxCodeId) ||
    notes.trim().length > 0 ||
    lines.some(
      (l) =>
        Boolean(l.itemId) ||
        l.itemCode.trim().length > 0 ||
        l.description.trim().length > 0 ||
        Number(l.quantity) !== 1 ||
        Number(l.unitPrice) !== 0 ||
        Number(l.tax) !== 0
    );

  const confirmDiscard = (message: string): boolean => {
    if (!isDirty) return true;
    return confirm(message);
  };

  /* ---------------------------------------------------------------- */
  /* Workspace transitions                                            */
  /* ---------------------------------------------------------------- */

  const resetForm = () => {
    setSelectedSupplierId('');
    setOriginalInvoiceId('');
    setReturnDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setSelectedTaxCodeId('');
    setLines([emptyLine()]);
    setFormError(null);
  };

  const openNew = () => {
    if (workspaceMode === 'create' && !confirmDiscard('ستُفقد التغييرات غير المحفوظة. هل تريد فتح مستند جديد؟')) {
      return;
    }
    resetForm();
    setSelectedReturn(null);
    setWorkspaceMode('create');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openReturnDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/purchasing/returns/${id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر فتح مردود المشتريات');
      }
      const data: PurchaseReturn = await res.json();
      setSelectedReturn(data);
      setWorkspaceMode('view');
      setFormError(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    } catch (err: any) {
      toast.error('تعذر فتح مردود المشتريات', { description: err.message });
      return false;
    }
  };

  const handleExit = () => {
    if (workspaceMode === 'create' && !confirmDiscard('ستُفقد التغييرات غير المحفوظة. هل تريد الخروج إلى قائمة المردودات؟')) {
      return;
    }
    setWorkspaceMode(null);
    setSelectedReturn(null);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ---------------------------------------------------------------- */
  /* Save                                                             */
  /* ---------------------------------------------------------------- */

  const handleSave = async () => {
    setFormError(null);
    if (!selectedSupplierId) {
      setFormError('يرجى تحديد المورد');
      return;
    }
    if (!originalInvoiceId) {
      setFormError('مرتجع المشتريات يتطلب ربطه بفاتورة الشراء الأصلية');
      return;
    }
    if (
      lines.some(
        (l) => !l.description.trim() || !Number.isFinite(Number(l.quantity)) || Number(l.quantity) <= 0
      )
    ) {
      setFormError('يرجى تعبئة بيان كل بند وكمية موجبة');
      return;
    }

    try {
      setSubmitting(true);
      // Payload shape unchanged: no taxCodeId is sent for purchase returns.
      const res = await fetch('/api/purchasing/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: selectedSupplierId,
          originalInvoiceId: originalInvoiceId || undefined,
          returnDate,
          notes,
          lines,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'فشل في حفظ مردود المشتريات');
      }

      const data = await res.json();
      const savedId: string | undefined = data?.purchaseReturn?.id;
      const savedNumber: string | undefined = data?.purchaseReturn?.return_number;

      toast.success('تم حفظ وترحيل مردود المشتريات', {
        description: savedNumber ? `رقم المردود: ${savedNumber}` : undefined,
      });

      resetForm();
      setWorkspaceMode(null);
      setSelectedReturn(null);
      await fetchData();

      if (savedId) {
        await openReturnDetails(savedId);
      }
    } catch (err: any) {
      setFormError(err.message);
      toast.error('تعذر حفظ مردود المشتريات', { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* List data                                                        */
  /* ---------------------------------------------------------------- */

  const totalReturnsAmount = returns.reduce(
    (sum, r) => sum + parseFloat(r.total || '0'),
    0
  );

  const filteredReturns = returns.filter(
    (r) =>
      r.return_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.supplierName?.toLowerCase().includes(search.toLowerCase()) ||
      r.supplierCode?.toLowerCase().includes(search.toLowerCase()) ||
      r.originalInvoiceNumber?.toLowerCase().includes(search.toLowerCase())
  );

  /* ---------------------------------------------------------------- */
  /* Document workspace                                               */
  /* ---------------------------------------------------------------- */

  if (workspaceMode !== null) {
    const isCreate = workspaceMode === 'create';
    const isView = workspaceMode === 'view';
    const status = isView && selectedReturn ? toDocumentStatus(selectedReturn.status) : undefined;

    const viewSubtotal = isView ? parseFloat(selectedReturn?.subtotal || '0') : 0;
    const viewTax = isView ? parseFloat(selectedReturn?.tax || '0') : 0;
    const viewTotal = isView ? parseFloat(selectedReturn?.total || '0') : 0;

    const displaySubtotal = isView ? viewSubtotal : subtotal;
    const displayTax = isView ? viewTax : totalTax;
    const displayTotal = isView ? viewTotal : computedTotal;
    const displayLineCount = isView ? selectedReturn?.lines?.length || 0 : lines.length;

    const documentTitle = isCreate
      ? 'مردود مشتريات جديد (إشعار مدين)'
      : `مردود مشتريات رقم ${selectedReturn?.return_number || ''}`;

    const description = isCreate ? (
      'إشعار مدين يعيد البضاعة إلى المورد ويخفض الالتزام — أدخل البيانات والأصناف ثم احفظ.'
    ) : (
      <>
        {selectedReturn?.supplierName || ''} • تاريخ المردود{' '}
        <bdi dir="ltr">{dateOnly(selectedReturn?.return_date)}</bdi>
      </>
    );

    const badge = isCreate ? (
      <StatusBadge tone="info">جديدة</StatusBadge>
    ) : status ? (
      <DocumentStatusBadge status={status} />
    ) : null;

    const infoCard = (
      <Card title="معلومات المستند">
        {isView ? (
          <div className="space-y-4">
            <DocumentReadGrid columns={2}>
              <DocumentReadField
                label="رقم المردود"
                value={selectedReturn?.return_number}
                numeric
              />
              <DocumentReadField
                label="الحالة"
                value={status ? <DocumentStatusBadge status={status} /> : '—'}
              />
              <DocumentReadField
                label="تاريخ المردود"
                value={dateOnly(selectedReturn?.return_date)}
                numeric
              />
              <DocumentReadField
                label="الضريبة"
                value={`${money(selectedReturn?.tax)} ر.ي`}
                numeric
              />
              <DocumentReadField
                label="المورد"
                className="sm:col-span-2"
                value={
                  <span className="block">
                    <span className="block">{selectedReturn?.supplierName}</span>
                    <span className="mt-0.5 block font-mono text-[11px] font-normal text-ink-muted">
                      كود: {selectedReturn?.supplierCode}
                    </span>
                  </span>
                }
              />
              <DocumentReadField
                label="فاتورة الشراء الأصلية"
                value={selectedReturn?.originalInvoiceNumber || '—'}
                numeric
              />
              <DocumentReadField label="الفرع" value={selectedReturn?.branchName || '—'} />
            </DocumentReadGrid>
            {selectedReturn?.notes && (
              <div className="rounded-control border border-line-soft bg-surface-muted p-3">
                <p className="text-[11px] font-bold text-ink-muted">ملاحظات المرتجع</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                  {selectedReturn.notes}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
            <DocumentField
              label="المورد"
              required
              hint={
                <button
                  type="button"
                  onClick={handleOpenSupplierLookup}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-brand transition-colors hover:bg-brand-soft"
                  title="استعلام وبحث عن مورد (F9)"
                >
                  <Search size={10} />
                  <span>F9 استعلام</span>
                </button>
              }
            >
              <Select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'F9') {
                    e.preventDefault();
                    handleOpenSupplierLookup();
                  }
                }}
                options={suppliers.map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.code})`,
                }))}
                placeholder="-- اختر المورد أو اضغط F9 --"
              />
            </DocumentField>

            <DocumentField label="فاتورة الشراء الأصلية" required>
              <Select
                value={originalInvoiceId}
                onChange={(e) => setOriginalInvoiceId(e.target.value)}
                options={[
                  { value: '', label: '-- اختر فاتورة الشراء الأصلية --' },
                  ...invoices
                    .filter(
                      (inv) => !selectedSupplierId || inv.supplier_id === selectedSupplierId
                    )
                    .map((inv) => ({
                      value: inv.id,
                      label: `${inv.invoice_number} (${parseFloat(inv.total || '0').toLocaleString()} ر.ي)`,
                    })),
                ]}
              />
            </DocumentField>

            <DocumentField label="تاريخ المردود" required>
              <DatePicker
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
              />
            </DocumentField>

            <DocumentField label="الضريبة المطبقة">
              <Select
                value={selectedTaxCodeId}
                onChange={(e) => handleTaxCodeChange(e.target.value)}
                options={[
                  { value: '', label: 'بدون ضريبة (0%)' },
                  ...taxCodes.map((tc) => ({
                    value: tc.id,
                    label: `${tc.name} (${parseFloat(tc.rate_percentage || '0')}%)`,
                  })),
                ]}
              />
            </DocumentField>

            <DocumentField label="ملاحظات المرتجع">
              <Textarea
                rows={2}
                placeholder="سبب إرجاع البضاعة للمورد وملاحظات الخصم..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </DocumentField>

            <p className="rounded-control border border-line-soft bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
              رقم المردود يُولَّد تلقائياً من الخادم عند الحفظ، ويُرحَّل المستند محاسبياً
              فوراً. لا يُحرَّر الرقم يدوياً.
            </p>
          </div>
        )}
      </Card>
    );

    const summaryRows: SummaryRow[] = [
      { label: 'إجمالي الأصناف', value: `${money(displaySubtotal)} ر.ي` },
      { label: 'إجمالي الضرائب', value: `+${money(displayTax)} ر.ي` },
    ];

    const summaryCard = (
      <DocumentSummaryCard
        title="ملخص المرتجع"
        rows={summaryRows}
        totalLabel="إجمالي قيمة المردود"
        totalValue={money(displayTotal)}
        footer={
          <div className="flex items-center justify-between text-[11px] text-ink-muted">
            <span>عدد البنود</span>
            <span className="font-semibold text-ink">{displayLineCount}</span>
          </div>
        }
      />
    );

    const auditCard = (
      <DocumentAuditCard
        createdByName={selectedReturn?.createdByName}
        createdAt={selectedReturn?.created_at}
        updatedAt={selectedReturn?.updated_at}
        createdDevice={null}
        updatedDevice={null}
        sourceNote="المصدر: created_by / created_at / updated_at في سجل مردود المشتريات. لا يحتوي الجدول على updated_by أو معرّف جهاز، لذلك تُعرض «غير متوفر» بدل التخمين."
      />
    );

    const itemsCard = (
      <Card
        flush
        title="الأصناف المرتجعة"
        description={
          isView
            ? `${displayLineCount} بند — بيانات محفوظة للقراءة فقط`
            : `${lines.length} بند — ابحث عن الصنف عبر F9 أو أضف بنداً يدوياً`
        }
        actions={
          isCreate && (
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={addLine}>
              إضافة صنف
            </Button>
          )
        }
      >
        {isView ? (
          <DocumentTableShell minWidth={860}>
            <table className="w-full text-right text-xs">
              <thead className="border-b border-line bg-surface-muted font-bold text-ink-muted">
                <tr>
                  <th className="w-10 px-3 py-3">#</th>
                  <th className="min-w-[260px] px-3 py-3">البيان</th>
                  <th className="px-3 py-3 text-center">الكمية</th>
                  <th className="px-3 py-3 text-center">الوحدة</th>
                  <th className="px-3 py-3 text-end">السعر</th>
                  <th className="px-3 py-3 text-end">الضريبة</th>
                  <th className="px-3 py-3 text-end">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft text-ink">
                {selectedReturn?.lines?.map((line, idx) => (
                  <tr key={line.id || idx} className="transition-colors hover:bg-surface-hover/60">
                    <td className="px-3 py-2.5 font-mono text-ink-muted">
                      {line.line_number || idx + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-ink">{line.description}</p>
                      {(line.item_code || line.itemSku) && (
                        <p className="mt-0.5 font-mono text-[10px] text-ink-muted">
                          {line.item_code || line.itemSku}
                        </p>
                      )}
                    </td>
                    <td className="kayan-numeric px-3 py-2.5 text-center font-bold">
                      {Number(line.quantity).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-center text-[11px] text-ink-muted">
                      {line.itemUnit || '—'}
                    </td>
                    <td className="kayan-numeric px-3 py-2.5 text-end">
                      {Number(line.unit_price).toLocaleString()}
                    </td>
                    <td className="kayan-numeric px-3 py-2.5 text-end">
                      {Number(line.tax) > 0 ? Number(line.tax).toLocaleString() : '—'}
                    </td>
                    <td className="kayan-numeric px-3 py-2.5 text-end font-bold">
                      {Number(line.line_total || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {(!selectedReturn?.lines || selectedReturn.lines.length === 0) && (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon={<FileText size={30} />}
                        title="لا توجد بنود محفوظة"
                        description="لم تُسجَّل بنود على هذا المردود."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </DocumentTableShell>
        ) : (
          <DocumentTableShell minWidth={1020}>
            <table className="w-full text-right text-xs">
              <thead className="border-b border-line bg-surface-muted font-bold text-ink-muted">
                <tr>
                  <th className="w-10 px-2 py-3">#</th>
                  <th className="w-40 px-2 py-3">كود الصنف (F9)</th>
                  <th className="min-w-[240px] px-2 py-3">البيان</th>
                  <th className="w-24 px-2 py-3 text-center">الكمية</th>
                  <th className="w-32 px-2 py-3 text-end">السعر (ر.ي)</th>
                  <th className="w-24 px-2 py-3 text-end">الضريبة</th>
                  <th className="w-32 px-2 py-3 text-end">الإجمالي</th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {lines.map((line, idx) => {
                  const lineTotal =
                    (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) +
                    (Number(line.tax) || 0);

                  return (
                    <tr
                      key={idx}
                      className="align-top transition-colors hover:bg-surface-hover/50"
                    >
                      <td className="p-2 font-mono text-[11px] text-ink-muted">{idx + 1}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          <Input
                            size="sm"
                            type="text"
                            placeholder="كود الصنف"
                            value={line.itemCode}
                            onKeyDown={(e) => {
                              if (e.key === 'F9') {
                                e.preventDefault();
                                handleOpenItemLookup(idx);
                              }
                            }}
                            onChange={(e) => updateLine(idx, 'itemCode', e.target.value)}
                            className="font-mono"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            icon={<Search size={12} />}
                            onClick={() => handleOpenItemLookup(idx)}
                            title="بحث واستعلام عن الصنف (F9)"
                            className="shrink-0 px-2.5"
                          >
                            F9
                          </Button>
                        </div>
                      </td>
                      <td className="p-2">
                        <Input
                          size="sm"
                          type="text"
                          placeholder="وصف الصنف المردود..."
                          value={line.description}
                          onKeyDown={(e) => {
                            if (e.key === 'F9') {
                              e.preventDefault();
                              handleOpenItemLookup(idx);
                            }
                          }}
                          onChange={(e) => updateLine(idx, 'description', e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          size="sm"
                          type="number"
                          min="0.01"
                          step="any"
                          numeric
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(idx, 'quantity', parseFloat(e.target.value) || 1)
                          }
                          className="text-center font-mono font-bold"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          size="sm"
                          type="number"
                          min="0"
                          step="any"
                          numeric
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)
                          }
                          className="text-end font-mono font-bold"
                        />
                      </td>
                      <td className="kayan-numeric p-2 text-end font-mono text-ink-muted">
                        {money(line.tax)}
                      </td>
                      <td className="kayan-numeric p-2 text-end font-mono font-bold text-ink">
                        {lineTotal.toLocaleString()}
                      </td>
                      <td className="p-2 text-center">
                        {lines.length > 1 && (
                          <IconButton
                            tone="danger"
                            label="حذف البند"
                            onClick={() => removeLine(idx)}
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DocumentTableShell>
        )}
      </Card>
    );

    return (
      <DocumentWorkspace
        title={documentTitle}
        description={description}
        icon={<Undo2 size={20} />}
        badge={badge}
        breadcrumbs={[
          { label: 'الرئيسية', href: '/' },
          { label: 'مردودات المشتريات', href: '/purchasing/returns' },
          { label: isCreate ? 'جديدة' : selectedReturn?.return_number || 'مستند' },
        ]}
        notice={
          formError ? (
            <div className="flex items-start gap-2 rounded-card border border-state-danger/30 bg-state-danger-soft px-4 py-3 text-xs font-bold text-state-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : undefined
        }
        actionBar={
          <DocumentActionBar
            mode={workspaceMode}
            status={status}
            saving={submitting}
            onNew={openNew}
            onEdit={undefined}
            onSave={isCreate ? handleSave : undefined}
            onPrint={isView && selectedReturn ? () => window.print() : undefined}
            onExit={handleExit}
            canEdit={false}
            editReason="لا يوجد مسار تعديل للمرتجعات في النظام الحالي"
            canSave={isCreate}
            saveReason="المرتجع محفوظ — لا توجد تغييرات قابلة للحفظ."
            canPrint={isView && Boolean(selectedReturn)}
            printReason="الطباعة متاحة بعد حفظ المرتجع وعرضه."
            canArchive={false}
            archiveReason="الأرشفة غير مدعومة للمرتجعات في النظام الحالي."
          />
        }
        sidebar={
          <>
            {infoCard}
            {summaryCard}
            {auditCard}
          </>
        }
        printContent={
          selectedReturn ? (
            <PurchaseReturnPrint ret={selectedReturn} company={company} />
          ) : undefined
        }
      >
        {itemsCard}
      </DocumentWorkspace>
    );
  }

  /* ---------------------------------------------------------------- */
  /* List screen                                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title="مردودات المشتريات وإشعارات المدين"
        description="إرجاع البضاعة للموردين، تخفيض الذمم الدائنة (AP 2101)، وتوليد القيود آلياً"
        icon={<Undo2 size={20} />}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
            مردود مشتريات جديد
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="إجمالي مردودات المشتريات"
          value={totalReturnsAmount.toLocaleString('en-US')}
          unit="ر.ي"
          icon={<Undo2 size={18} />}
          tone="warning"
          hint="تخفض من تكلفة المشتريات والالتزامات للموردين"
          pending={loading}
        />
        <KpiCard
          label="عدد الإشعارات المسجلة"
          value={returns.length.toLocaleString('en-US')}
          icon={<Package size={18} />}
          tone="brand"
          hint="إشعارات خصم ومردود للموردين"
          pending={loading}
        />
        <KpiCard
          label="الأثر المحاسبي"
          value="تخفيض ذمم الموردين"
          icon={<CheckCircle2 size={18} />}
          tone="success"
          hint="قيد مزدوج: مدين ذمم الموردين / دائن مشتريات ومخزون"
          pending={loading}
        />
      </div>

      <PageToolbar
        search={{
          value: search,
          onValueChange: setSearch,
          placeholder: 'بحث برقم المردود أو اسم المورد أو رقم الفاتورة...',
        }}
        end={
          <IconButton
            label="تحديث البيانات"
            onClick={fetchData}
            className="border border-line bg-surface"
          >
            <RefreshCw size={15} />
          </IconButton>
        }
      />

      <Card flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-right text-xs">
            <thead className="border-b border-line bg-surface-muted font-bold text-ink-muted">
              <tr>
                <th className="px-4 py-3.5">رقم الإشعار</th>
                <th className="px-4 py-3.5">المورد</th>
                <th className="px-4 py-3.5">الفاتورة الأصلية</th>
                <th className="px-4 py-3.5">تاريخ المردود</th>
                <th className="px-4 py-3.5">المبلغ الصافي</th>
                <th className="px-4 py-3.5">الضريبة</th>
                <th className="px-4 py-3.5">الإجمالي</th>
                <th className="px-4 py-3.5 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft font-medium text-ink">
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <LoadingState text="جارٍ تحميل سجل مردودات المشتريات..." />
                  </td>
                </tr>
              ) : filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<Undo2 size={32} />}
                      title="لا توجد مردودات مشتريات مطابقة"
                      description={
                        search
                          ? 'جرّب تغيير البحث، أو سجّل مردود مشتريات جديداً.'
                          : 'لم تُسجَّل مردودات مشتريات حتى الآن. ابدأ بتسجيل إشعار مدين جديد.'
                      }
                      action={
                        <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
                          مردود مشتريات جديد
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredReturns.map((ret) => (
                  <tr key={ret.id} className="transition-colors hover:bg-surface-hover/60">
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => openReturnDetails(ret.id)}
                        title="عرض المستند وطباعته"
                        className="inline-flex items-center gap-1 font-mono font-bold text-brand hover:underline"
                      >
                        <span>{ret.return_number}</span>
                        <ExternalLink size={12} className="opacity-60" />
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-ink">{ret.supplierName}</div>
                      <div className="font-mono text-[10px] text-ink-muted">
                        {ret.supplierCode}
                      </div>
                    </td>
                    <td className="kayan-numeric px-4 py-3.5 text-ink-muted">
                      {ret.originalInvoiceNumber || '—'}
                    </td>
                    <td className="kayan-numeric px-4 py-3.5 text-ink-muted">
                      {ret.return_date ? <bdi dir="ltr">{dateOnly(ret.return_date)}</bdi> : '—'}
                    </td>
                    <td className="kayan-numeric px-4 py-3.5 font-semibold text-ink">
                      {money(ret.subtotal)}
                    </td>
                    <td className="kayan-numeric px-4 py-3.5 text-ink-muted">
                      {money(ret.tax)}
                    </td>
                    <td className="kayan-numeric px-4 py-3.5 font-extrabold text-ink">
                      {money(ret.total)}{' '}
                      <span className="text-[10px] font-normal text-ink-muted">ر.ي</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <DocumentStatusBadge status={toDocumentStatus(ret.status)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="px-1 text-[11px] text-ink-muted">
        التعديل والأرشفة غير مدعومين للمرتجعات في النظام الحالي. تُفتح المستندات المحفوظة
        للعرض والطباعة فقط.
      </p>
    </div>
  );
};

export default PurchaseReturnsPage;
