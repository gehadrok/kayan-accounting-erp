import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  DollarSign,
  ExternalLink,
  Eye,
  FileText,
  Landmark,
  Monitor,
  Pencil,
  Plus,
  Printer,
  Receipt as ReceiptIcon,
  Trash2,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { useSettings } from '../context/SettingsContext';
import { ReportHeader, type CompanyIdentity } from '../components/company/ReportHeader';
import {
  Button,
  Card,
  DatePicker,
  Dialog,
  EmptyState,
  IconButton,
  Input,
  KpiCard,
  LoadingState,
  PageHeader,
  PageToolbar,
  Select,
  StatusBadge,
  useToast,
} from '../components/ui';
import {
  DocumentActionBar,
  DocumentStatusBadge,
  DocumentTableShell,
  VoucherAuditStrip,
  VoucherField,
  VoucherInlineField,
  VoucherLedgerTable,
  VoucherPanel,
  VoucherStaticField,
  VoucherTotalsStrip,
  VoucherWorkspace,
  formatVoucherDateTime,
  formatVoucherMoney,
  type DocumentMode,
  type VoucherAuditItem,
  type VoucherLedgerRow,
} from '../components/documents';
import {
  COUNTERPARTY_TYPE_LABEL_AR,
  VoucherCounterpartyAccountSelect,
  VoucherCounterpartyTypeSelect,
  VoucherVehicleSelect,
  type VoucherCounterpartySelection,
  type VoucherCounterpartyTypeKey,
  type VoucherVehicleSelection,
} from '../components/documents/VoucherAccountPicker';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface ReceiptAllocation {
  id?: string;
  invoice_id: string;
  invoiceNumber: string;
  invoiceTotal: string;
  allocated_amount: number;
}

interface ReceiptItem {
  id: string;
  receipt_number: string;
  customer_id: string | null;
  supplier_id?: string | null;
  counterparty_type?: 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE' | 'GENERAL' | 'CASH' | 'BANK';
  counterparty_account_id?: string | null;
  counterpartyAccountName?: string | null;
  counterpartyAccountCode?: string | null;
  customerName: string | null;
  customerCode: string | null;
  payment_method: 'CASH' | 'BANK';
  target_account_id: string;
  targetAccountName: string;
  targetAccountCode?: string | null;
  branchName?: string | null;
  receipt_date: string;
  amount: string;
  allocated_amount: string;
  unallocated_amount: string;
  reference_number?: string;
  description?: string;
  status: 'DRAFT' | 'POSTED' | 'VOIDED';
  journal_entry_id?: string;
  journalEntryNumber?: string;
  created_at: string;
  updated_at?: string;
  createdByName?: string;
  lastModifiedByName?: string;
  lastModifiedAt?: string;
  allocations?: ReceiptAllocation[];
}

interface UnpaidInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: string;
  paid_amount: string;
  remainingAmount: number;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** اسم الطرف المقابل المعروض: عميل للنمط القديم، وغيره من علاقة الحساب المحفوظة. */
function counterpartyDisplayName(rec: ReceiptItem | null): string {
  if (!rec) return '—';
  if (rec.customerName) return rec.customerName;
  if (rec.counterpartyAccountName) {
    const code = rec.counterpartyAccountCode ? `${rec.counterpartyAccountCode} — ` : '';
    return `${code}${rec.counterpartyAccountName}`;
  }
  return '—';
}

function counterpartyTypeLabel(rec: ReceiptItem | null): string {
  const t = rec?.counterparty_type || 'CUSTOMER';
  return COUNTERPARTY_TYPE_LABEL_AR[t] || 'عميل';
}

function money(value: number | string | null | undefined): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '0';
}

function dateOnly(value?: string | null): string {
  return value ? String(value).slice(0, 10) : '';
}

const today = () => new Date().toISOString().split('T')[0];

const STATUS_FILTERS = [
  { value: 'ALL', label: 'الكل' },
  { value: 'POSTED', label: 'مرحّلة' },
  { value: 'DRAFT', label: 'مسودة' },
] as const;

/* ------------------------------------------------------------------ */
/* Print view — نفس قالب ReportHeader المعتمد.                         */
/* ------------------------------------------------------------------ */

const ReceiptPrint: React.FC<{
  receipt: ReceiptItem;
  company: CompanyIdentity | null;
}> = ({ receipt, company }) => {
  const amount = parseFloat(receipt.amount || '0');
  const allocations = receipt.allocations || [];

  return (
    <div className="bg-white p-8 text-slate-800" dir="rtl">
      <ReportHeader
        company={company}
        title={`سند قبض رقم ${receipt.receipt_number}`}
        subtitle={
          <>
            التاريخ: <bdi dir="ltr">{dateOnly(receipt.receipt_date)}</bdi>
          </>
        }
        compact
      />

      <div className="mt-6 space-y-4 text-xs leading-relaxed">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 font-bold text-slate-500">وصلنا من المكرم / السيد:</span>
            <span className="text-sm font-black text-slate-900">{counterpartyDisplayName(receipt)}</span>
            <span className="font-mono text-slate-400">({counterpartyTypeLabel(receipt)})</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-28 font-bold text-slate-500">مبلغ وقدره:</span>
            <span className="font-mono text-base font-black text-emerald-700">
              {amount.toLocaleString()} ريال يمني
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 font-bold text-slate-500">طريقة القبض:</span>
            <span className="font-bold text-slate-800">
              {receipt.payment_method === 'CASH'
                ? 'نقداً إلى الصندوق والخزينة الرئيسية (1101)'
                : `شيك / حوالة بنكية إلى ${receipt.targetAccountName}`}
            </span>
            {receipt.reference_number && (
              <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-slate-600">
                رقم المرجع: {receipt.reference_number}
              </span>
            )}
          </div>

          <div className="flex items-start gap-2">
            <span className="w-28 shrink-0 font-bold text-slate-500">وذلك عن:</span>
            <span className="flex-1 font-semibold text-slate-800">
              {receipt.description || 'سداد دفعات مبيعات وحسابات مدينة'}
            </span>
          </div>
        </div>

        {allocations.length > 0 && (
          <div className="space-y-1.5">
            <span className="block font-bold text-slate-700">
              الفواتير المسددة بموجب هذا السند:
            </span>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 font-bold text-slate-700">
                  <tr>
                    <th className="px-3 py-2">رقم الفاتورة</th>
                    <th className="px-3 py-2">إجمالي الفاتورة</th>
                    <th className="px-3 py-2 text-left">المبلغ المسدد بهذا السند</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {allocations.map((allocation, idx) => (
                    <tr key={allocation.id || idx}>
                      <td className="px-3 py-2 font-bold text-blue-600">
                        {allocation.invoiceNumber}
                      </td>
                      <td className="px-3 py-2">
                        {parseFloat(allocation.invoiceTotal || '0').toLocaleString()} ر.ي
                      </td>
                      <td className="px-3 py-2 text-left font-bold text-emerald-700">
                        {Number(allocation.allocated_amount || 0).toLocaleString()} ر.ي
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-black text-slate-800">
              <CheckCircle2 size={15} className="text-emerald-600" />
              <span>الأثر المحاسبي التلقائي (Automatic Accounting):</span>
            </span>
            {receipt.journalEntryNumber ? (
              <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono font-bold text-blue-600">
                رقم القيد: {receipt.journalEntryNumber}
              </span>
            ) : (
              <span className="font-bold text-amber-600">مسودة قيد الانتظار</span>
            )}
          </div>

          {receipt.status === 'POSTED' ? (
            <div className="space-y-1 border-t border-slate-200 pt-2 font-mono text-[11px] text-slate-600">
              <div>
                • الطرف المدين (DR): {receipt.targetAccountName} = {amount.toLocaleString()} ر.ي
              </div>
              <div>
                • الطرف الدائن (CR): {counterpartyDisplayName(receipt)} ={' '}
                {amount.toLocaleString()} ر.ي
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              سيتم إنشاء وترحيل قيد اليومية المزدوج فور الضغط على زر اعتماد وترحيل السند.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 pt-8 text-center text-xs">
          <div>
            <span className="mb-8 block font-bold text-slate-400">أمين الصندوق / البنك</span>
            <span className="mx-auto block w-32 border-t border-slate-300 pt-1 font-semibold text-slate-700">
              التوقيع
            </span>
          </div>
          <div>
            <span className="mb-8 block font-bold text-slate-400">المحاسب المسؤول</span>
            <span className="mx-auto block w-32 border-t border-slate-300 pt-1 font-semibold text-slate-700">
              التوقيع والختم
            </span>
          </div>
          <div>
            <span className="mb-8 block font-bold text-slate-400">المستلم / العميل</span>
            <span className="mx-auto block w-32 border-t border-slate-300 pt-1 font-semibold text-slate-700">
              التوقيع
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export const ReceiptsPage: React.FC = () => {
  const { company } = useCompanyProfile();
  const toast = useToast();

  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [workspaceMode, setWorkspaceMode] = useState<DocumentMode | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptItem | null>(null);

  // الطرف المقابل على مرحلتين: نوع الحساب ثم الحساب الفعلي
  const [counterpartyType, setCounterpartyType] = useState<VoucherCounterpartyTypeKey | ''>('');
  const [counterpartySelection, setCounterpartySelection] = useState<VoucherCounterpartySelection | null>(null);
  // وسيلة التحصيل: صندوق/بنك فعلي مختار (اختياري — الافتراضي 1101/1102)
  const [targetVehicle, setTargetVehicle] = useState<VoucherVehicleSelection | null>(null);

  // المعرّف القديم customerId يظل مرجع فواتير العميل غير المسددة مع نوع «العملاء».
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [amount, setAmount] = useState<string>('');
  const [receiptDate, setReceiptDate] = useState(today());
  const [referenceNumber, setReferenceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [unpaidLoading, setUnpaidLoading] = useState(false);
  const [allocations, setAllocations] = useState<{ [invoiceId: string]: number }>({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [branchName, setBranchName] = useState('—');
  const [allocationDialogOpen, setAllocationDialogOpen] = useState(false);
  const [accountingDialogOpen, setAccountingDialogOpen] = useState(false);

  const { getValue } = useSettings();
  const currency = String(getValue('reports.currency_symbol', 'YER') || 'YER');

  /* ---------------------------------------------------------------- */
  /* Data                                                             */
  /* ---------------------------------------------------------------- */

  const loadData = async () => {
    try {
      setLoading(true);
      const recRes = await fetch('/api/sales/receipts?limit=100');

      if (recRes.ok) {
        const recData = await recRes.json();
        setReceipts(Array.isArray(recData) ? recData : []);
      }
    } catch (err) {
      console.error(err);
      toast.error('تعذر تحميل بيانات سندات القبض');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // الفرع المعروض في سند القبض: هو الفرع الافتراضي الذي يستخدمه الخادم
  // عند حفظ سند جديد، واسم الفرع المخزن في السند المرحّل.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/core/branches')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: any) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data?.branches || [];
        const first = list?.[0];
        setBranchName(first?.name || '—');
      })
      .catch(() => setBranchName('—'));
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch unpaid invoices when customer changes in the document.
  useEffect(() => {
    if (!customerId) {
      setUnpaidInvoices([]);
      setAllocations({});
      setUnpaidLoading(false);
      return;
    }

    let cancelled = false;
    const fetchUnpaid = async () => {
      try {
        setUnpaidLoading(true);
        const res = await fetch(`/api/customers/${customerId}/unpaid-invoices`);
        if (res.ok) {
          const invs = await res.json();
          if (!cancelled) setUnpaidInvoices(Array.isArray(invs) ? invs : []);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) toast.error('تعذر تحميل فواتير العميل غير المسددة');
      } finally {
        if (!cancelled) setUnpaidLoading(false);
      }
    };

    fetchUnpaid();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  /* ---------------------------------------------------------------- */
  /* Allocation                                                       */
  /* ---------------------------------------------------------------- */

  // Auto-allocate amount across oldest invoices.
  const handleAutoAllocate = () => {
    const totalReceipt = parseFloat(amount) || 0;
    if (totalReceipt <= 0) return;

    let remainingToAlloc = totalReceipt;
    const newAlloc: { [id: string]: number } = {};

    for (const inv of unpaidInvoices) {
      if (remainingToAlloc <= 0) break;
      const rem = Number(inv.remainingAmount);
      const alloc = Math.min(rem, remainingToAlloc);
      newAlloc[inv.id] = alloc;
      remainingToAlloc -= alloc;
    }

    setAllocations(newAlloc);
  };

  const handleAllocationChange = (invId: string, val: number) => {
    setAllocations((prev) => ({
      ...prev,
      [invId]: Math.max(0, val),
    }));
  };

  const totalAllocated = Object.values(allocations).reduce((sum, v) => sum + (v || 0), 0);
  const parsedAmount = parseFloat(amount) || 0;
  const unallocatedRemaining = parsedAmount - totalAllocated;

  /* ---------------------------------------------------------------- */
  /* Form / workspace transitions                                     */
  /* ---------------------------------------------------------------- */

  const resetForm = () => {
    setCounterpartyType('');
    setCounterpartySelection(null);
    setTargetVehicle(null);
    setCustomerId('');
    setPaymentMethod('CASH');
    setAmount('');
    setReceiptDate(today());
    setReferenceNumber('');
    setDescription('');
    setUnpaidInvoices([]);
    setAllocations({});
    setFormError(null);
  };

  /** تغيير نوع الحساب يمسح الاختيار السابق للحساب الفرعي — منع خلط الأنواع. */
  const handleCounterpartyTypeChange = (type: VoucherCounterpartyTypeKey | '') => {
    setCounterpartyType(type);
    setCounterpartySelection(null);
    if (type !== 'CUSTOMER') {
      setCustomerId('');
      setUnpaidInvoices([]);
      setAllocations({});
    }
  };

  /** المرحلة 2 — اختيار الحساب الفعلي حسب النوع. */
  const handleCounterpartySelection = (selection: VoucherCounterpartySelection | null) => {
    setCounterpartySelection(selection);
    if (counterpartyType === 'CUSTOMER') {
      setCustomerId(selection?.entityId || '');
      if (!selection) {
        setUnpaidInvoices([]);
        setAllocations({});
      }
    }
  };

  const hasUnsavedChanges = () =>
    Boolean(
      counterpartySelection ||
        customerId ||
        amount ||
        referenceNumber ||
        description ||
        targetVehicle ||
        paymentMethod !== 'CASH' ||
        receiptDate !== today() ||
        Object.values(allocations).some((value) => value > 0)
    );

  const openNew = () => {
    if (workspaceMode === 'create' && hasUnsavedChanges()) {
      if (!confirm('ستُفقد التغييرات غير المحفوظة. هل تريد إعادة تعيين النموذج وبدء سند جديد؟')) {
        return;
      }
    }
    if (workspaceMode === 'edit' && hasEditChanges()) {
      if (!confirm('ستُفقد التغييرات غير المحفوظة. هل تريد فتح سند جديد دون حفظ التعديلات؟')) {
        return;
      }
    }
    resetForm();
    setSelectedReceipt(null);
    setWorkspaceMode('create');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openReceiptDetails = async (recId: string) => {
    try {
      const res = await fetch(`/api/sales/receipts/${recId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر فتح سند القبض');
      }
      const data = await res.json();
      setSelectedReceipt(data);
      setWorkspaceMode('view');
      setFormError(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      toast.error('تعذر فتح سند القبض', { description: err.message });
    }
  };

  /** هل تغيّرت بيانات النموذج عن السند المحمّل في وضع التعديل؟ */
  const hasEditChanges = () => {
    const rec = selectedReceipt;
    if (!rec) return false;
    const savedType = (rec.counterparty_type ||
      (rec.customer_id ? 'CUSTOMER' : rec.supplier_id ? 'SUPPLIER' : 'GENERAL')) as VoucherCounterpartyTypeKey;
    const savedAlloc = new Map(
      (rec.allocations || []).map((a) => [a.invoice_id, Number(a.allocated_amount) || 0])
    );
    const allocChanged = [...savedAlloc.keys(), ...Object.keys(allocations)].some(
      (key) => (savedAlloc.get(key) || 0) !== (allocations[key] || 0)
    );
    return (
      counterpartyType !== savedType ||
      (counterpartySelection?.entityId || '') !==
        (savedType === 'CUSTOMER' ? rec.customer_id || '' : savedType === 'SUPPLIER' ? rec.supplier_id || '' : '') ||
      (counterpartySelection?.accountId || '') !== (rec.counterparty_account_id || '') ||
      paymentMethod !== rec.payment_method ||
      parsedAmount !== parseFloat(rec.amount || '0') ||
      receiptDate !== dateOnly(rec.receipt_date) ||
      (referenceNumber || '') !== (rec.reference_number || '') ||
      (description || '') !== (rec.description || '') ||
      (targetVehicle?.accountId || '') !== (rec.target_account_id || '') ||
      allocChanged
    );
  };

  /** تعبئة النموذج من سند محفوظ والدخول في وضع التعديل (للمسودات فقط). */
  const handleEditReceipt = () => {
    const rec = selectedReceipt;
    if (!rec) return;
    if (rec.status !== 'DRAFT') {
      toast.warning('لا يمكن تعديل هذا السند', {
        description: 'التعديل متاح للمسودات فقط. السند المرحّل يُعالج بالإلغاء/العكس.',
      });
      return;
    }
    const type = (rec.counterparty_type ||
      (rec.customer_id ? 'CUSTOMER' : rec.supplier_id ? 'SUPPLIER' : 'GENERAL')) as VoucherCounterpartyTypeKey;

    setCounterpartyType(type);
    setCounterpartySelection({
      entityId:
        type === 'CUSTOMER' ? rec.customer_id || '' : type === 'SUPPLIER' ? rec.supplier_id || '' : '',
      accountId: rec.counterparty_account_id || '',
      label: rec.customerName || rec.counterpartyAccountName || '—',
      accountCode: rec.counterpartyAccountCode || rec.customerCode || '',
    });
    setCustomerId(type === 'CUSTOMER' ? rec.customer_id || '' : '');
    setTargetVehicle(
      rec.target_account_id
        ? {
            entityId: '',
            accountId: rec.target_account_id,
            label: rec.targetAccountName || 'حساب التحصيل',
            accountCode: rec.targetAccountCode || '',
          }
        : null
    );
    setPaymentMethod(rec.payment_method);
    setAmount(String(parseFloat(rec.amount || '0')));
    setReceiptDate(dateOnly(rec.receipt_date));
    setReferenceNumber(rec.reference_number || '');
    setDescription(rec.description || '');
    setAllocations(
      Object.fromEntries(
        (rec.allocations || []).map((a) => [a.invoice_id, Number(a.allocated_amount) || 0])
      )
    );
    setFormError(null);
    setWorkspaceMode('edit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExit = () => {
    if (workspaceMode === 'create' && hasUnsavedChanges()) {
      if (!confirm('ستُفقد التغييرات غير المحفوظة. هل تريد الخروج إلى قائمة سندات القبض؟')) {
        return;
      }
    }
    if (workspaceMode === 'edit' && hasEditChanges()) {
      if (!confirm('ستُفقد التغييرات غير المحفوظة. هل تريد الخروج دون حفظ التعديلات؟')) {
        return;
      }
    }
    setWorkspaceMode(null);
    setSelectedReceipt(null);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const onVoucherExit = () => {
      if (workspaceMode !== null) handleExit();
    };
    window.addEventListener('kayan:voucher-exit', onVoucherExit);
    return () => window.removeEventListener('kayan:voucher-exit', onVoucherExit);
  });

  /* ---------------------------------------------------------------- */
  /* Save / post                                                      */
  /* ---------------------------------------------------------------- */

  const handleSaveReceipt = async (postImmediately = false) => {
    setFormError(null);
    if (!counterpartyType) {
      setFormError('يرجى اختيار نوع الحساب (الطرف المقابل) أولاً');
      return;
    }
    if (!counterpartySelection) {
      setFormError('يرجى اختيار الحساب المقابل من القائمة');
      return;
    }
    if (counterpartyType === 'CUSTOMER' && !customerId) {
      setFormError('يرجى اختيار العميل');
      return;
    }
    if (parsedAmount <= 0) {
      setFormError('يرجى إدخال مبلغ صحيح لسند القبض');
      return;
    }
    if (totalAllocated > parsedAmount) {
      setFormError(
        `المبالغ المخصصة (${totalAllocated.toLocaleString()}) تتجاوز مبلغ السند (${parsedAmount.toLocaleString()})`
      );
      return;
    }

    const isEdit = workspaceMode === 'edit' && Boolean(selectedReceipt);

    try {
      setFormSubmitting(true);
      const allocPayload = Object.entries(allocations)
        .filter(([_, val]) => val > 0)
        .map(([invoiceId, amt]) => ({ invoiceId, amount: amt }));

      const descriptionFallback = description || `سند قبض من ${counterpartySelection.label}`;

      const res = await fetch(isEdit ? `/api/sales/receipts/${selectedReceipt!.id}` : '/api/sales/receipts', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counterpartyType,
          customerId: counterpartyType === 'CUSTOMER' ? customerId : null,
          supplierId: counterpartyType === 'SUPPLIER' ? counterpartySelection.entityId : null,
          counterpartyAccountId:
            counterpartyType === 'GENERAL' ||
            counterpartyType === 'CASH' ||
            counterpartyType === 'BANK' ||
            // سند القبض لا يخزّن supplier_id؛ إرسال حساب المورد يسمح للخادم
            // باسترداد المورد من ربطه بحساب الذمم عند التعديل.
            (isEdit && counterpartyType === 'SUPPLIER')
              ? counterpartySelection.accountId
              : null,
          targetVehicleId: targetVehicle?.entityId || null,
          // في وضع التعديل نحتفظ بحساب التحصيل المحفوظ إذا لم يُختر تعريف صندوق/بنك جديد.
          ...(isEdit && !targetVehicle?.entityId
            ? { targetAccountId: selectedReceipt!.target_account_id }
            : {}),
          // قفل تفاؤلي: يمنع الكتابة فوق تعديل آخر حدث أثناء فتح الشاشة.
          ...(isEdit ? { expectedUpdatedAt: selectedReceipt!.updated_at } : {}),
          paymentMethod,
          receiptDate,
          amount: parsedAmount,
          referenceNumber: referenceNumber || null,
          description: descriptionFallback,
          allocations: allocPayload,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'فشل في حفظ سند القبض');
      }

      const saved = await res.json();

      if (postImmediately) {
        const postRes = await fetch(`/api/sales/receipts/${saved.id}/post`, {
          method: 'POST',
        });
        if (!postRes.ok) {
          const postData = await postRes.json().catch(() => ({}));
          toast.error('تم حفظ سند القبض كمسودة', {
            description:
              postData.error || 'تعذر ترحيل السند. يمكنك ترحيله لاحقاً من المستند.',
          });
          resetForm();
          loadData();
          await openReceiptDetails(saved.id);
          return;
        }
      }

      toast.success(
        postImmediately ? 'تم حفظ وترحيل سند القبض' : isEdit ? 'تم حفظ تعديلات سند القبض' : 'تم حفظ سند القبض',
        { description: `رقم السند: ${saved.receipt_number}` }
      );
      resetForm();
      loadData();
      await openReceiptDetails(saved.id);
    } catch (err: any) {
      setFormError(err.message);
      toast.error('تعذر حفظ سند القبض', { description: err.message });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handlePostReceipt = async (recId: string) => {
    try {
      const res = await fetch(`/api/sales/receipts/${recId}/post`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error('تعذر ترحيل سند القبض', {
          description: data.error || 'فشل ترحيل السند',
        });
        return;
      }

      toast.success('تم ترحيل سند القبض', {
        description: 'أُنشئ القيد المحاسبي وتم تحديث أرصدة الفواتير.',
      });
      loadData();
      if (selectedReceipt && selectedReceipt.id === recId) {
        await openReceiptDetails(recId);
      }
    } catch (err: any) {
      toast.error('تعذر ترحيل سند القبض', { description: err.message });
    }
  };

  /* ---------------------------------------------------------------- */
  /* List data                                                        */
  /* ---------------------------------------------------------------- */

  const filteredReceipts = receipts.filter((r) => {
    const matchesSearch =
      r.receipt_number.toLowerCase().includes(search.toLowerCase()) ||
      counterpartyDisplayName(r).toLowerCase().includes(search.toLowerCase()) ||
      (r.reference_number && r.reference_number.toLowerCase().includes(search.toLowerCase()));

    const matchesMethod = methodFilter === 'ALL' || r.payment_method === methodFilter;
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;

    return matchesSearch && matchesMethod && matchesStatus;
  });

  const totalReceiptsAmount = receipts
    .filter((r) => r.status === 'POSTED')
    .reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);

  const cashReceipts = receipts
    .filter((r) => r.status === 'POSTED' && r.payment_method === 'CASH')
    .reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);

  const bankReceipts = receipts
    .filter((r) => r.status === 'POSTED' && r.payment_method === 'BANK')
    .reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);

  const draftReceiptsCount = receipts.filter((r) => r.status === 'DRAFT').length;

  /* ---------------------------------------------------------------- */
  /* Document workspace                                               */
  /* ---------------------------------------------------------------- */

  if (workspaceMode !== null) {
    const isCreate = workspaceMode === 'create';
    const isView = workspaceMode === 'view';
    const isEdit = workspaceMode === 'edit';
    const isPersisted = isView || isEdit;
    const status = selectedReceipt?.status;
    const effectiveMethod = isView ? selectedReceipt?.payment_method : paymentMethod;
    const documentAmount = isView ? parseFloat(selectedReceipt?.amount || '0') : parsedAmount;
    const documentUnallocated = isView
      ? parseFloat(selectedReceipt?.unallocated_amount || '0')
      : unallocatedRemaining;

    const documentTitle = isCreate
      ? 'سند قبض جديد'
      : `سند قبض رقم ${selectedReceipt?.receipt_number || ''}`;

    const documentDescription = isCreate ? (
      'سجّل مبلغ المقبوض وخصّصه على الفواتير غير المسددة، ثم احفظ المسودة أو احفظ وترحيل.'
    ) : (
      <>
        {counterpartyDisplayName(selectedReceipt)} • تاريخ السند{' '}
        <bdi dir="ltr">{dateOnly(selectedReceipt?.receipt_date)}</bdi>
      </>
    );

    const badge = isCreate ? (
      <StatusBadge tone="info">جديدة</StatusBadge>
    ) : status ? (
      <DocumentStatusBadge status={status} />
    ) : null;

    const movementLabel = (method?: 'CASH' | 'BANK') =>
      method === 'BANK' ? 'بنكي — تحصيل من البنك' : 'نقدي — تحصيل إلى الصندوق';

    const targetAccountLabel = isView
      ? selectedReceipt?.targetAccountName || '—'
      : (targetVehicle?.label || (paymentMethod === 'BANK' ? 'البنك الافتراضي (1102)' : 'الصندوق الافتراضي (1101)'));
    const targetAccountCode = isView
      ? selectedReceipt?.targetAccountCode || '—'
      : (targetVehicle?.accountCode || (paymentMethod === 'BANK' ? '1102' : '1101'));

    const counterpartyAccountLabel = isView
      ? selectedReceipt?.customerName || selectedReceipt?.counterpartyAccountName || '—'
      : (counterpartySelection?.label || '—');
    const counterpartyAccountCode = isView
      ? selectedReceipt?.counterpartyAccountCode || selectedReceipt?.customerCode || '—'
      : (counterpartySelection?.accountCode || '—');
    const counterpartyTypeValue = isView
      ? counterpartyTypeLabel(selectedReceipt)
      : counterpartyType
        ? COUNTERPARTY_TYPE_LABEL_AR[counterpartyType] || 'العملاء'
        : '—';
    const documentDescriptionText = isView
      ? selectedReceipt?.description || 'تحصيل سند قبض'
      : description || (counterpartySelection ? `تحصيل من ${counterpartySelection.label}` : '—');
    const documentReference = isView ? selectedReceipt?.reference_number || '—' : referenceNumber || '—';
    const documentDate = isView ? dateOnly(selectedReceipt?.receipt_date) : receiptDate;
    const documentNumber = isPersisted ? selectedReceipt?.receipt_number || '—' : 'يُولَّد عند الحفظ';
    const documentBranch = isPersisted ? selectedReceipt?.branchName || '—' : branchName || '—';

    const ledgerRows: VoucherLedgerRow[] = [
      {
        key: 'target',
        accountType: effectiveMethod === 'BANK' ? 'بنك' : 'صندوق',
        accountCode: targetAccountCode,
        accountName: targetAccountLabel,
        description: documentDescriptionText,
        currency,
        rate: '1.0000',
        debit: documentAmount > 0 ? documentAmount : undefined,
      },
      {
        key: 'counterparty',
        accountType: counterpartyTypeValue,
        accountCode: counterpartyAccountCode,
        accountName: counterpartyAccountLabel,
        description: documentDescriptionText,
        currency,
        rate: '1.0000',
        credit: documentAmount > 0 ? documentAmount : undefined,
      },
    ];

    const auditItems: VoucherAuditItem[] = [
      {
        label: 'مدخل السند',
        value: selectedReceipt?.createdByName || '—',
        icon: <UserRound size={14} />,
        tone: 'default',
      },
      {
        label: 'تاريخ الإدخال',
        value: formatVoucherDateTime(selectedReceipt?.created_at),
        icon: <Monitor size={14} />,
        tone: 'default',
      },
      {
        label: 'آخر تعديل',
        value: selectedReceipt?.lastModifiedByName || '—',
        icon: <Pencil size={14} />,
        tone: 'default',
      },
      {
        label: 'مرات الطباعة',
        value: '0',
        icon: <Printer size={14} />,
        tone: 'default',
      },
      {
        label: 'معدل السجل',
        value:
          status === 'POSTED'
            ? 'معتمد وفعال'
            : status === 'DRAFT'
              ? 'مسودة غير مرحّلة'
              : status === 'VOIDED'
                ? 'ملغى'
                : 'غير مسجل',
        icon: <BadgeCheck size={14} />,
        tone: status === 'POSTED' ? 'success' : status === 'VOIDED' ? 'danger' : 'warning',
      },
      {
        label: 'تاريخ آخر تعديل',
        value: formatVoucherDateTime(
          selectedReceipt?.lastModifiedAt || selectedReceipt?.updated_at || selectedReceipt?.created_at
        ),
        icon: <CalendarDays size={14} />,
        tone: 'default',
      },
      {
        label: 'جهاز الإدخال',
        value: 'غير مسجل',
        icon: <Monitor size={14} />,
        tone: 'muted',
      },
    ];

    const infoBody = (
      <div className="kayan-sheet-info-grid">
        <VoucherField label="رقم السند" required className="gcol-1">
          <VoucherStaticField>{documentNumber}</VoucherStaticField>
        </VoucherField>
        <VoucherField label="تاريخ السند" required className="gcol-2">
          {isView ? (
            <VoucherStaticField icon={<CalendarDays size={15} />}>{documentDate}</VoucherStaticField>
          ) : (
            <div className="kayan-sheet-control">
              <DatePicker value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
            </div>
          )}
        </VoucherField>
        <VoucherField label="نوع الحركة" required className="gcol-3">
          {isView ? (
            <VoucherStaticField>{movementLabel(selectedReceipt?.payment_method)}</VoucherStaticField>
          ) : (
            <div className="kayan-sheet-control">
              <Select
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value as 'CASH' | 'BANK');
                  setTargetVehicle(null);
                }}
                options={[
                  { value: 'CASH', label: 'نقدي — تحصيل إلى الصندوق (1101)' },
                  { value: 'BANK', label: 'بنكي — تحصيل من البنك (1102)' },
                ]}
              />
            </div>
          )}
        </VoucherField>
        <VoucherInlineField label="الفرع" className="gcol-4">
          <VoucherStaticField>{documentBranch}</VoucherStaticField>
        </VoucherInlineField>

        <VoucherField label="حساب الصندوق / البنك" required className="gcol-1">
          {isView ? (
            <VoucherStaticField icon={<Landmark size={15} />}>{targetAccountLabel}</VoucherStaticField>
          ) : (
            <div className="kayan-sheet-control">
              <VoucherVehicleSelect
                voucherKind="receipt"
                category={paymentMethod === 'BANK' ? 'BANK' : 'CASH'}
                value={targetVehicle}
                onSelect={setTargetVehicle}
                disabled={false}
              />
            </div>
          )}
        </VoucherField>
        <VoucherField label="نوع الحساب المقابل" required className="gcol-2">
          {isView ? (
            <VoucherStaticField icon={<Users size={15} />}>{counterpartyTypeValue}</VoucherStaticField>
          ) : (
            <div className="kayan-sheet-control">
              <VoucherCounterpartyTypeSelect
                value={counterpartyType}
                onChange={handleCounterpartyTypeChange}
                disabled={false}
              />
            </div>
          )}
        </VoucherField>
        <VoucherField label="الحساب المقابل" required className="gcol-3">
          {isView ? (
            <VoucherStaticField icon={<UserRound size={15} />}>{counterpartyAccountLabel}</VoucherStaticField>
          ) : (
            <div className="kayan-sheet-control">
              <VoucherCounterpartyAccountSelect
                voucherKind="receipt"
                counterpartyType={counterpartyType}
                selection={counterpartySelection}
                onSelectionChange={handleCounterpartySelection}
                disabled={false}
              />
            </div>
          )}
        </VoucherField>
        <div className="kayan-sheet-info-field kayan-sheet-inline-pair gcol-4">
          <VoucherInlineField label="العملة">
            <VoucherStaticField>{currency}</VoucherStaticField>
          </VoucherInlineField>
          <VoucherInlineField label="سعر الصرف">
            <VoucherStaticField className="kayan-numeric">1.0000</VoucherStaticField>
          </VoucherInlineField>
        </div>

        <div className="kayan-sheet-info-span2">
          <VoucherField label="البيان">
            {isView ? (
              <VoucherStaticField>{documentDescriptionText}</VoucherStaticField>
            ) : (
              <div className="kayan-sheet-control">
                <Input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="بيان المقبوضات..."
                />
              </div>
            )}
          </VoucherField>
        </div>
        <VoucherField label="الرقم المرجع" className="gcol-3">
          {isView ? (
            <VoucherStaticField>{documentReference}</VoucherStaticField>
          ) : (
            <div className="kayan-sheet-control">
              <Input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="مثال: CHQ-8902 أو TR-4421"
                className="font-mono"
              />
            </div>
          )}
        </VoucherField>
        <VoucherField label="المبلغ" required className="gcol-4">
          {isView ? (
            <VoucherStaticField tone="amount">{formatVoucherMoney(documentAmount)}</VoucherStaticField>
          ) : (
            <div className="kayan-sheet-control">
              <Input
                type="number"
                min="0.01"
                step="any"
                numeric
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="kayan-sheet-amount-input font-mono font-bold"
              />
            </div>
          )}
        </VoucherField>
        <div className="kayan-sheet-note-cell gcol-5">
          <button
            type="button"
            className="kayan-sheet-note-btn"
            onClick={() => setAllocationDialogOpen(true)}
            title="تخصيص السند على الفواتير"
            aria-label="تخصيص السند على الفواتير"
          >
            <FileText size={16} />
          </button>
        </div>
      </div>
    );

    const infoPanel = (
      <VoucherPanel
        title="بيانات السند والصندوق"
        icon={<FileText size={18} />}
        onTabAction={() => setAllocationDialogOpen(true)}
        tabActionTitle="تخصيص السند على الفواتير"
      >
        {infoBody}
      </VoucherPanel>
    );

    const detailsPanel = (
      <VoucherPanel
        title="تفاصيل السند (القيود)"
        icon={<Calculator size={18} />}
        onTabAction={() => setAccountingDialogOpen(true)}
        tabActionTitle="الأثر المحاسبي التلقائي"
      >
        <VoucherLedgerTable rows={ledgerRows} />
        <VoucherTotalsStrip
          debit={documentAmount}
          credit={documentAmount}
          difference={0}
          currency={currency}
        />
      </VoucherPanel>
    );

    const allocationCreateBody = (
      <div className="space-y-3.5">
        {counterpartyType !== 'CUSTOMER' ? (
          <EmptyState
            icon={<ReceiptIcon size={30} />}
            title="التخصيص على فواتير عميل فقط"
            description="تخصيص السند على الفواتير متاح عند اختيار نوع الحساب «العملاء». السند على الأنواع الأخرى يُسجل مبلغه كاملاً دون تخصيص على فواتير."
          />
        ) : !customerId ? (
          <EmptyState
            icon={<ReceiptIcon size={30} />}
            title="لم يتم اختيار العميل بعد"
            description="اختر العميل من بطاقة «معلومات السند» أولاً، ثم ستظهر هنا فواتير المبيعات الآجلة غير المسددة لتخصيص مبلغ السند عليها."
          />
        ) : unpaidLoading ? (
          <LoadingState text="جارٍ تحميل فواتير العميل غير المسددة..." />
        ) : unpaidInvoices.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={30} />}
            title="لا توجد فواتير غير مسددة"
            description="لا توجد فواتير مبيعات آجلة غير مسددة لهذا العميل حالياً. سيُسجل المبلغ كرصيد دائن غير مخصص للعميل."
          />
        ) : (
          <DocumentTableShell minWidth={760}>
            <table className="w-full text-right text-xs">
              <thead className="border-b border-line bg-surface-muted font-bold text-ink-muted">
                <tr>
                  <th className="w-10 px-3 py-3">#</th>
                  <th className="px-3 py-3">رقم الفاتورة</th>
                  <th className="px-3 py-3">التاريخ</th>
                  <th className="px-3 py-3 text-end">إجمالي الفاتورة</th>
                  <th className="px-3 py-3 text-end">المتبقي غير المسدد</th>
                  <th className="w-40 px-3 py-3 text-end">المبلغ المخصص (ر.ي)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft font-medium text-ink">
                {unpaidInvoices.map((inv, idx) => (
                  <tr key={inv.id} className="transition-colors hover:bg-surface-hover/60">
                    <td className="px-3 py-2.5 font-mono text-ink-muted">{idx + 1}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-brand">{inv.invoice_number}</td>
                    <td className="kayan-numeric px-3 py-2.5 text-ink-muted">
                      <bdi dir="ltr">{dateOnly(inv.invoice_date)}</bdi>
                    </td>
                    <td className="kayan-numeric px-3 py-2.5 text-end">{money(inv.total)}</td>
                    <td className="kayan-numeric px-3 py-2.5 text-end font-bold text-state-danger">
                      {money(inv.remainingAmount)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Input
                        size="sm"
                        type="number"
                        min="0"
                        max={inv.remainingAmount}
                        step="any"
                        numeric
                        value={allocations[inv.id] || ''}
                        placeholder="0"
                        onChange={(e) => handleAllocationChange(inv.id, parseFloat(e.target.value) || 0)}
                        className="text-end font-mono font-bold"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DocumentTableShell>
        )}
      </div>
    );

    const viewAllocations = selectedReceipt?.allocations || [];
    const allocationViewBody = viewAllocations.length > 0 ? (
      <DocumentTableShell minWidth={640}>
        <table className="w-full text-right text-xs">
          <thead className="border-b border-line bg-surface-muted font-bold text-ink-muted">
            <tr>
              <th className="w-10 px-3 py-3">#</th>
              <th className="px-3 py-3">رقم الفاتورة</th>
              <th className="px-3 py-3 text-end">إجمالي الفاتورة</th>
              <th className="px-3 py-3 text-end">المبلغ المسدد بهذا السند</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft text-ink">
            {viewAllocations.map((allocation, idx) => (
              <tr key={allocation.id || idx}>
                <td className="px-3 py-2.5 font-mono text-ink-muted">{idx + 1}</td>
                <td className="px-3 py-2.5 font-mono font-bold text-brand">{allocation.invoiceNumber}</td>
                <td className="kayan-numeric px-3 py-2.5 text-end">{money(allocation.invoiceTotal)}</td>
                <td className="kayan-numeric px-3 py-2.5 text-end font-bold text-state-success">
                  {money(allocation.allocated_amount)}
                </td>
              </tr>
            ))}
            {viewAllocations.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    icon={<ReceiptIcon size={30} />}
                    title="لا توجد فواتير مخصصة"
                    description="سُجل مبلغ هذا السند كرصيد غير مخصص، أو لم تُحفظ تخصيصات على فواتير."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DocumentTableShell>
    ) : null;

    const accountingBody = (
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-bold text-ink">رقم القيد المحاسبي</span>
          {isView && selectedReceipt?.journalEntryNumber ? (
            <span className="rounded-control border border-line bg-surface-muted px-2.5 py-1 font-mono text-xs font-bold text-brand">
              {selectedReceipt.journalEntryNumber}
            </span>
          ) : (
            <StatusBadge tone="warning">مسودة قيد الانتظار</StatusBadge>
          )}
        </div>

        <div className="kayan-voucher-journal-table mt-3 overflow-x-auto">
          <table className="w-full min-w-[920px] text-right text-xs">
            <thead>
              <tr>
                <th>م</th>
                <th>نوع الحساب</th>
                <th>رقم الحساب</th>
                <th>اسم الحساب</th>
                <th>البيان</th>
                <th>عملة</th>
                <th>سعر الصرف</th>
                <th>مدين</th>
                <th>دائن</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row, idx) => (
                <tr key={row.key || idx}>
                  <td>{idx + 1}</td>
                  <td>{row.accountType || '—'}</td>
                  <td>{row.accountCode || '—'}</td>
                  <td>{row.accountName || '—'}</td>
                  <td>{row.description || '—'}</td>
                  <td>{row.currency || '—'}</td>
                  <td>{row.rate || '1.0000'}</td>
                  <td>{row.debit !== undefined ? formatVoucherMoney(row.debit) : '—'}</td>
                  <td>{row.credit !== undefined ? formatVoucherMoney(row.credit) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {status === 'POSTED' ? (
          <div className="mt-3 space-y-1.5 border-t border-line-soft pt-3 font-mono text-[11px] leading-relaxed text-ink-muted">
            <div>
              • الطرف المدين (DR): {targetAccountLabel} = {formatVoucherMoney(documentAmount)} {currency}
            </div>
            <div>
              • الطرف الدائن (CR): {counterpartyAccountLabel} = {formatVoucherMoney(documentAmount)} {currency}
            </div>
          </div>
        ) : (
          <p className="mt-3 border-t border-line-soft pt-3 text-[11px] leading-relaxed text-ink-muted">
            سيتم إنشاء وترحيل قيد اليومية المزدوج فور الضغط على «ترحيل واعتماد».
          </p>
        )}
      </div>
    );

    const secondaryActions = (
      <>
        {isCreate || isEdit ? (
          <Button
            variant="success"
            size="sm"
            icon={<CheckCircle2 size={16} />}
            onClick={() => handleSaveReceipt(true)}
            disabled={formSubmitting || !counterpartySelection || parsedAmount <= 0}
            loading={formSubmitting}
            loadingText="جارٍ الحفظ والترحيل..."
          >
            حفظ وترحيل
          </Button>
        ) : isView && status === 'DRAFT' && selectedReceipt ? (
          <Button
            variant="success"
            size="sm"
            icon={<CheckCircle2 size={16} />}
            onClick={() => handlePostReceipt(selectedReceipt.id)}
          >
            ترحيل واعتماد
          </Button>
        ) : null}
      </>
    );

    const navigateToReceipt = (index: number) => {
      const target = filteredReceipts[index];
      if (target) openReceiptDetails(target.id);
    };
    const navIndex = isView && selectedReceipt
      ? filteredReceipts.findIndex((r) => r.id === selectedReceipt.id)
      : -1;

    return (
      <>
        <VoucherWorkspace
          actionBar={
            <DocumentActionBar
              variant="voucher"
              title="سند قبض"
              titleIcon={<Coins size={24} />}
              mode={workspaceMode}
              status={status}
              saving={formSubmitting}
              onNew={openNew}
              onEdit={handleEditReceipt}
              onSave={() => handleSaveReceipt(false)}
              onPrint={() => window.print()}
              onArchive={() => undefined}
              onExit={handleExit}
              searchValue={search}
              onSearchChange={setSearch}
              navigationDisabled={!isView || navIndex < 0}
              navigationReason="التنقل بين سندات القبض متاح بعد فتح سند محفوظ من قائمة سندات القبض."
              onFirst={() => navigateToReceipt(0)}
              onPrevious={() => navigateToReceipt(navIndex - 1)}
              onNext={() => navigateToReceipt(navIndex + 1)}
              onLast={() => navigateToReceipt(filteredReceipts.length - 1)}
              canEdit={isView && status === 'DRAFT' && Boolean(selectedReceipt)}
              editReason={
                !selectedReceipt
                  ? 'افتح سند قبض محفوظاً أولاً، ثم يمكن تعديله.'
                  : status === 'POSTED'
                    ? 'لا يمكن تعديل سند قبض مرحّل محاسبياً؛ استخدم الإلغاء/العكس وفق قواعد النظام.'
                    : status === 'VOIDED'
                      ? 'لا يمكن تعديل سند قبض ملغى.'
                      : 'التعديل متاح للمسودات فقط.'
              }
              canSave={isCreate || isEdit}
              saveReason={
                isPersisted && !isEdit
                  ? 'المستند محفوظ. اضغط «تعديل» لتغيير بياناته.'
                  : 'لا توجد بيانات قابلة للحفظ في هذه الحالة.'
              }
              canPrint={isView && Boolean(selectedReceipt)}
              printReason={
                isEdit
                  ? 'احفظ التعديلات أولاً، ثم اطبع النسخة المحفوظة.'
                  : 'احفظ السند أولاً، ثم يمكن طباعته بالقالب المعتمد.'
              }
              canArchive={false}
              archiveReason="الأرشفة غير مدعومة لسندات القبض في النظام الحالي."
              secondaryActions={secondaryActions}
            />
          }
          notice={
            formError ? (
              <div className="flex items-start gap-2 rounded-card border border-state-danger/30 bg-state-danger-soft px-4 py-3 text-xs font-bold text-state-danger">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            ) : undefined
          }
          info={infoPanel}
          details={detailsPanel}
          audit={<VoucherAuditStrip items={auditItems} />}
          printContent={
            selectedReceipt ? (
              <ReceiptPrint receipt={selectedReceipt} company={company} />
            ) : undefined
          }
        />

        <Dialog
          open={allocationDialogOpen}
          onClose={() => setAllocationDialogOpen(false)}
          title="تخصيص السند على الفواتير"
          description="اختر الفواتير المراد تسويتها بهذا السند أو استخدم التخصيص التلقائي على الأقدم."
          icon={<ReceiptIcon size={18} />}
          size="xl"
          footer={
            <>
              {isCreate && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<ArrowRight size={14} />}
                  onClick={handleAutoAllocate}
                  disabled={!customerId || parsedAmount <= 0}
                >
                  تخصيص تلقائي على الأقدم
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => setAllocationDialogOpen(false)}>
                إغلاق
              </Button>
            </>
          }
        >
          {allocationCreateBody}
          {allocationViewBody}
        </Dialog>

        <Dialog
          open={accountingDialogOpen}
          onClose={() => setAccountingDialogOpen(false)}
          title="الأثر المحاسبي التلقائي"
          description="معلومات القيد المرتبط بالسند — لا تُعدَّل من هذه الشاشة"
          icon={<Calculator size={18} />}
          size="xl"
          footer={
            <Button size="sm" variant="secondary" onClick={() => setAccountingDialogOpen(false)}>
              إغلاق
            </Button>
          }
        >
          {accountingBody}
        </Dialog>
      </>
    );
  }

  /* ---------------------------------------------------------------- */
  /* List screen                                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title="سندات القبض والتحصيل"
        description="إثبات المقبوضات النقدية والبنكية، تخصيص السداد على فواتير المبيعات، وتوليد القيود المحاسبية آلياً"
        icon={<ReceiptIcon size={20} />}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
            سند قبض جديد
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="إجمالي المقبوضات المعتمدة"
          value={money(totalReceiptsAmount)}
          unit="ر.ي"
          icon={<DollarSign size={18} />}
          tone="success"
          hint="ريال يمني — سندات مرحلة"
          pending={loading}
        />
        <KpiCard
          label="مقبوضات الصندوق والخزينة"
          value={money(cashReceipts)}
          unit="ر.ي"
          icon={<Wallet size={18} />}
          tone="brand"
          hint="حساب 1101 الصندوق الرئيسي"
          pending={loading}
        />
        <KpiCard
          label="مقبوضات البنوك والحوالات"
          value={money(bankReceipts)}
          unit="ر.ي"
          icon={<Landmark size={18} />}
          tone="neutral"
          hint="حساب 1102 حسابات البنوك"
          pending={loading}
        />
        <KpiCard
          label="سندات قيد الاعتماد"
          value={draftReceiptsCount.toLocaleString('en-US')}
          icon={<Clock size={18} />}
          tone="warning"
          hint="مسودة بانتظار الترحيل"
          pending={loading}
        />
      </div>

      <PageToolbar
        search={{
          value: search,
          onValueChange: setSearch,
          placeholder: 'بحث برقم السند أو اسم العميل أو المرجع...',
        }}
        end={
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="تصفية بحالة السند"
              className="flex items-center gap-0.5 rounded-control bg-surface-sunken p-1 text-[11px] font-bold text-ink-muted"
            >
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  aria-pressed={statusFilter === filter.value}
                  className={`rounded-md px-2.5 py-1.5 transition-colors ${
                    statusFilter === filter.value
                      ? 'bg-surface text-brand shadow-k-xs'
                      : 'hover:text-ink'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <Select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="min-w-[190px]"
              size="sm"
              options={[
                { value: 'ALL', label: 'طريقة القبض: الكل' },
                { value: 'CASH', label: 'نقدي (الصندوق 1101)' },
                { value: 'BANK', label: 'بنكي (البنك 1102)' },
              ]}
            />

            <IconButton
              label="تحديث البيانات"
              onClick={loadData}
              className="border border-line bg-surface"
            >
              <Clock size={15} />
            </IconButton>
          </div>
        }
      />

      <Card flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-right text-xs">
            <thead className="border-b border-line bg-surface-muted font-bold text-ink-muted">
              <tr>
                <th className="px-4 py-3.5">رقم السند</th>
                <th className="px-4 py-3.5">التاريخ</th>
                <th className="px-4 py-3.5">الطرف المقابل</th>
                <th className="px-4 py-3.5">طريقة القبض والحساب</th>
                <th className="px-4 py-3.5">المبلغ</th>
                <th className="px-4 py-3.5">التخصيص على فواتير</th>
                <th className="px-4 py-3.5">الحالة</th>
                <th className="px-4 py-3.5">القيد المحاسبي</th>
                <th className="px-4 py-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft font-medium text-ink">
              {loading ? (
                <tr>
                  <td colSpan={9}>
                    <LoadingState text="جارٍ تحميل سندات القبض..." />
                  </td>
                </tr>
              ) : filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={<ReceiptIcon size={32} />}
                      title="لا توجد سندات قبض مطابقة"
                      description="جرّب تغيير البحث أو الفلاتر، أو أنشئ سند قبض جديداً."
                      action={
                        <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
                          سند قبض جديد
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredReceipts.map((rec) => {
                  const amt = parseFloat(rec.amount || '0');
                  const alloc = parseFloat(rec.allocated_amount || '0');

                  return (
                    <tr key={rec.id} className="transition-colors hover:bg-surface-hover/60">
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => openReceiptDetails(rec.id)}
                          className="inline-flex items-center gap-1 font-mono font-bold text-brand hover:underline"
                        >
                          <span>{rec.receipt_number}</span>
                          <ExternalLink size={12} className="opacity-60" />
                        </button>
                      </td>

                      <td className="kayan-numeric px-4 py-3.5 text-ink-muted">
                        <bdi dir="ltr">{dateOnly(rec.receipt_date)}</bdi>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-ink">{counterpartyDisplayName(rec)}</span>
                          {rec.counterparty_type && rec.counterparty_type !== 'CUSTOMER' && (
                            <StatusBadge tone="info" size="sm">
                              {counterpartyTypeLabel(rec)}
                            </StatusBadge>
                          )}
                        </div>
                        {rec.customerCode && (
                          <div className="font-mono text-[10px] text-ink-muted">{rec.customerCode}</div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge
                            tone={rec.payment_method === 'CASH' ? 'success' : 'info'}
                            size="sm"
                          >
                            {rec.payment_method === 'CASH' ? 'نقدي' : 'بنكي'}
                          </StatusBadge>
                          <span className="text-[11px] font-semibold text-ink-muted">
                            {rec.targetAccountName}
                          </span>
                        </div>
                      </td>

                      <td className="kayan-numeric px-4 py-3.5 font-bold text-ink">
                        {money(amt)}{' '}
                        <span className="text-[10px] font-normal text-ink-muted">ر.ي</span>
                      </td>

                      <td className="kayan-numeric px-4 py-3.5">
                        {alloc > 0 ? (
                          <span className="font-bold text-state-success">
                            {money(alloc)} ر.ي
                          </span>
                        ) : (
                          <span className="text-ink-muted">غير مخصص</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <DocumentStatusBadge status={rec.status} />
                      </td>

                      <td className="px-4 py-3.5">
                        {rec.journalEntryNumber ? (
                          <span className="rounded-md border border-line bg-surface-muted px-2 py-1 font-mono text-xs font-bold text-ink">
                            {rec.journalEntryNumber}
                          </span>
                        ) : (
                          <span className="text-[11px] text-ink-muted">بدون قيد (مسودة)</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          <IconButton
                            tone="primary"
                            label="عرض سند القبض"
                            onClick={() => openReceiptDetails(rec.id)}
                          >
                            <Eye size={15} />
                          </IconButton>
                          {rec.status === 'DRAFT' && (
                            <Button
                              size="xs"
                              variant="success"
                              onClick={() => handlePostReceipt(rec.id)}
                            >
                              ترحيل
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="px-1 text-[11px] text-ink-muted">
        عرض البيانات المالية من الخدمات الحالية فقط. تعديل سندات القبض متاح للمسودات غير المرحّلة
        من شاشة عرض السند، والترحيل متاح للمسودات وفق قواعد النظام. الأرشفة غير مدعومة حالياً.
      </p>
    </div>
  );
};

export default ReceiptsPage;
