import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Ban,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
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
  VoucherMainAccountSelect,
  VoucherVehicleSelect,
  type VoucherCounterpartySelection,
  type VoucherCounterpartyTypeKey,
  type VoucherMainAccountSelection,
  type VoucherVehicleSelection,
} from '../components/documents/VoucherAccountPicker';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface PaymentAllocation {
  id?: string;
  invoice_id: string;
  invoiceNumber: string;
  invoiceTotal: string;
  allocated_amount: number;
}

interface PaymentItem {
  id: string;
  payment_number: string;
  supplier_id: string | null;
  counterparty_type?: 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE' | 'GENERAL' | 'CASH' | 'BANK';
  counterparty_account_id?: string | null;
  counterpartyAccountName?: string | null;
  counterpartyAccountCode?: string | null;
  supplierName: string | null;
  supplierCode: string | null;
  payment_method: 'CASH' | 'BANK';
  source_account_id: string;
  sourceAccountName: string;
  sourceAccountCode?: string | null;
  branchName?: string | null;
  payment_date: string;
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
  allocations?: PaymentAllocation[];
}

interface SupplierOption {
  id: string;
  code: string;
  name: string;
  outstandingBalance: string;
  is_active: boolean;
}

interface UnpaidPurchaseInvoice {
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

function counterpartyDisplayName(pay: PaymentItem | null): string {
  if (!pay) return '—';
  if (pay.supplierName) return pay.supplierName;
  if (pay.counterpartyAccountName) {
    const code = pay.counterpartyAccountCode ? `${pay.counterpartyAccountCode} — ` : '';
    return `${code}${pay.counterpartyAccountName}`;
  }
  return '—';
}

function counterpartyTypeLabel(pay: PaymentItem | null): string {
  const t = pay?.counterparty_type || 'SUPPLIER';
  return COUNTERPARTY_TYPE_LABEL_AR[t] || 'مورد';
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

const PaymentPrint: React.FC<{
  payment: PaymentItem;
  company: CompanyIdentity | null;
}> = ({ payment, company }) => {
  const amount = parseFloat(payment.amount || '0');
  const allocations = payment.allocations || [];

  return (
    <div className="bg-white p-8 text-slate-800" dir="rtl">
      <ReportHeader
        company={company}
        title={`سند صرف رقم ${payment.payment_number}`}
        subtitle={
          <>
            التاريخ: <bdi dir="ltr">{dateOnly(payment.payment_date)}</bdi>
          </>
        }
        compact
      />

      <div className="mt-6 space-y-4 text-xs leading-relaxed">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 font-bold text-slate-500">يصرف للمكرم / السيد:</span>
            <span className="text-sm font-black text-slate-900">{counterpartyDisplayName(payment)}</span>
            <span className="font-mono text-slate-400">({counterpartyTypeLabel(payment)})</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-28 font-bold text-slate-500">مبلغ وقدره:</span>
            <span className="font-mono text-base font-black text-rose-700">
              {amount.toLocaleString()} ريال يمني
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 font-bold text-slate-500">طريقة الصرف:</span>
            <span className="font-bold text-slate-800">
              {payment.payment_method === 'CASH'
                ? 'نقداً من الصندوق والخزينة الرئيسية (1101)'
                : `شيك / حوالة مسحوبة من ${payment.sourceAccountName}`}
            </span>
            {payment.reference_number && (
              <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-slate-600">
                رقم المرجع: {payment.reference_number}
              </span>
            )}
          </div>

          <div className="flex items-start gap-2">
            <span className="w-28 shrink-0 font-bold text-slate-500">وذلك عن:</span>
            <span className="flex-1 font-semibold text-slate-800">
              {payment.description || 'سداد دفعات مشتريات وتوريدات'}
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
                      <td className="px-3 py-2 font-bold text-indigo-600">
                        {allocation.invoiceNumber}
                      </td>
                      <td className="px-3 py-2">
                        {parseFloat(allocation.invoiceTotal || '0').toLocaleString()} ر.ي
                      </td>
                      <td className="px-3 py-2 text-left font-bold text-rose-700">
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
            {payment.journalEntryNumber ? (
              <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono font-bold text-rose-600">
                رقم القيد: {payment.journalEntryNumber}
              </span>
            ) : (
              <span className="font-bold text-amber-600">مسودة قيد الانتظار</span>
            )}
          </div>

          {payment.status === 'POSTED' ? (
            <div className="space-y-1 border-t border-slate-200 pt-2 font-mono text-[11px] text-slate-600">
              <div>
                • الطرف المدين (DR): 2101 - الموردون والدائنون ({payment.supplierName}) ={' '}
                {amount.toLocaleString()} ر.ي
              </div>
              <div>
                • الطرف الدائن (CR): {payment.sourceAccountName} = {amount.toLocaleString()} ر.ي
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              سيتم إنشاء وترحيل قيد اليومية المزدوج فور الضغط على زر ترحيل السند.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 pt-8 text-center text-xs">
          <div>
            <span className="mb-8 block font-bold text-slate-400">المدير المالي</span>
            <span className="mx-auto block w-32 border-t border-slate-300 pt-1 font-semibold text-slate-700">
              الاعتماد
            </span>
          </div>
          <div>
            <span className="mb-8 block font-bold text-slate-400">أمين الصندوق / البنك</span>
            <span className="mx-auto block w-32 border-t border-slate-300 pt-1 font-semibold text-slate-700">
              التوقيع والصرف
            </span>
          </div>
          <div>
            <span className="mb-8 block font-bold text-slate-400">المستلم / المورد</span>
            <span className="mx-auto block w-32 border-t border-slate-300 pt-1 font-semibold text-slate-700">
              التوقيع والاستلام
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

export const SupplierPaymentsPage: React.FC = () => {
  const { company } = useCompanyProfile();
  const toast = useToast();

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [workspaceMode, setWorkspaceMode] = useState<DocumentMode | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentItem | null>(null);

  // الطرف المقابل على مرحلتين: الحساب الرئيسي (F9) ثم الحساب التحليلي
  const [mainAccount, setMainAccount] = useState<VoucherMainAccountSelection | null>(null);
  const [counterpartyType, setCounterpartyType] = useState<VoucherCounterpartyTypeKey | ''>('');
  const [counterpartySelection, setCounterpartySelection] = useState<VoucherCounterpartySelection | null>(null);
  // إشارة لدفع التركيز إلى الحقل التحليلي بعد اختيار الحساب الرئيسي
  const [focusSignal, setFocusSignal] = useState(0);
  // وسيلة الصرف: صندوق/بنك فعلي مختار (اختياري — الافتراضي 1101/1102)
  const [sourceVehicle, setSourceVehicle] = useState<VoucherVehicleSelection | null>(null);

  // المعرّف القديم supplierId يظل مرجع فواتير المورد غير المسددة مع نوع «الموردون».
  const [supplierId, setSupplierId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [referenceNumber, setReferenceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidPurchaseInvoice[]>([]);
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
      const payRes = await fetch('/api/purchasing/payments?limit=100');

      if (payRes.ok) {
        const payData = await payRes.json();
        setPayments(Array.isArray(payData) ? payData : []);
      }
    } catch (err) {
      console.error(err);
      toast.error('تعذر تحميل بيانات سندات الصرف');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // الفرع المعروض في سند الصرف: هو الفرع الافتراضي الذي يستخدمه الخادم
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

  // Fetch unpaid purchase invoices when supplier changes.
  useEffect(() => {
    if (!supplierId) {
      setUnpaidInvoices([]);
      setAllocations({});
      setUnpaidLoading(false);
      return;
    }

    let cancelled = false;
    const fetchUnpaid = async () => {
      try {
        setUnpaidLoading(true);
        const res = await fetch(`/api/suppliers/${supplierId}/unpaid-invoices`);
        if (res.ok) {
          const invs = await res.json();
          if (!cancelled) setUnpaidInvoices(Array.isArray(invs) ? invs : []);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) toast.error('تعذر تحميل فواتير المورد غير المسددة');
      } finally {
        if (!cancelled) setUnpaidLoading(false);
      }
    };

    fetchUnpaid();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  /* ---------------------------------------------------------------- */
  /* Allocation                                                       */
  /* ---------------------------------------------------------------- */

  // Auto Allocate.
  const handleAutoAllocate = () => {
    const totalPayment = parseFloat(amount) || 0;
    if (totalPayment <= 0) return;

    let remainingToAlloc = totalPayment;
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
    setMainAccount(null);
    setCounterpartyType('');
    setCounterpartySelection(null);
    setFocusSignal(0);
    setSourceVehicle(null);
    setSupplierId('');
    setPaymentMethod('CASH');
    setAmount('');
    setPaymentDate(today());
    setReferenceNumber('');
    setDescription('');
    setUnpaidInvoices([]);
    setAllocations({});
    setFormError(null);
  };

  // اختيار الحساب الرئيسي (الحقل الأول) يحدد نوع الطرف المقابل، ثم ينتقل
  // التركيز تلقائياً إلى الحقل التحليلي (الحقل الثاني).
  const handleMainAccountChange = (selection: VoucherMainAccountSelection | null) => {
    setMainAccount(selection);
    setCounterpartyType((selection?.kind as VoucherCounterpartyTypeKey) || '');
    setCounterpartySelection(null);
    if (!selection || selection.kind !== 'SUPPLIER') {
      setSupplierId('');
      setUnpaidInvoices([]);
      setAllocations({});
    }
    if (selection) setFocusSignal((n) => n + 1);
  };

  const handleCounterpartySelection = (selection: VoucherCounterpartySelection | null) => {
    setCounterpartySelection(selection);
    if (counterpartyType === 'SUPPLIER') {
      setSupplierId(selection?.entityId || '');
      if (!selection) {
        setUnpaidInvoices([]);
        setAllocations({});
      }
    }
  };

  const hasUnsavedChanges = () =>
    Boolean(
      counterpartySelection ||
        supplierId ||
        amount ||
        referenceNumber ||
        description ||
        sourceVehicle ||
        paymentMethod !== 'CASH' ||
        paymentDate !== today() ||
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
    setSelectedPayment(null);
    setWorkspaceMode('create');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openPaymentDetails = async (payId: string) => {
    try {
      const res = await fetch(`/api/purchasing/payments/${payId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر فتح سند الصرف');
      }
      const data = await res.json();
      setSelectedPayment(data);
      setWorkspaceMode('view');
      setFormError(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      toast.error('تعذر فتح سند الصرف', { description: err.message });
    }
  };

  /** هل تغيّرت بيانات النموذج عن السند المحمّل في وضع التعديل؟ */
  const hasEditChanges = () => {
    const pay = selectedPayment;
    if (!pay) return false;
    const savedType = (pay.counterparty_type ||
      (pay.supplier_id ? 'SUPPLIER' : 'CUSTOMER')) as VoucherCounterpartyTypeKey;
    const savedAlloc = new Map(
      (pay.allocations || []).map((a) => [a.invoice_id, Number(a.allocated_amount) || 0])
    );
    const allocChanged = [...savedAlloc.keys(), ...Object.keys(allocations)].some(
      (key) => (savedAlloc.get(key) || 0) !== (allocations[key] || 0)
    );
    return (
      counterpartyType !== savedType ||
      (counterpartySelection?.entityId || '') !==
        (savedType === 'SUPPLIER' ? pay.supplier_id || '' : '') ||
      (counterpartySelection?.accountId || '') !== (pay.counterparty_account_id || '') ||
      paymentMethod !== pay.payment_method ||
      parsedAmount !== parseFloat(pay.amount || '0') ||
      paymentDate !== dateOnly(pay.payment_date) ||
      (referenceNumber || '') !== (pay.reference_number || '') ||
      (description || '') !== (pay.description || '') ||
      (sourceVehicle?.accountId || '') !== (pay.source_account_id || '') ||
      allocChanged
    );
  };

  /** تعبئة النموذج من سند محفوظ والدخول في وضع التعديل (للمسودات فقط). */
  const handleEditPayment = () => {
    const pay = selectedPayment;
    if (!pay) return;
    if (pay.status !== 'DRAFT') {
      toast.warning('لا يمكن تعديل هذا السند', {
        description: 'التعديل متاح للمسودات فقط. السند المرحّل يُعالج بالإلغاء/العكس.',
      });
      return;
    }
    const type = (pay.counterparty_type ||
      (pay.supplier_id ? 'SUPPLIER' : 'CUSTOMER')) as VoucherCounterpartyTypeKey;
    const label = counterpartyDisplayName(pay);
    const counterpartyAccountId = pay.counterparty_account_id || '';

    setCounterpartyType(type);
    setCounterpartySelection({
      entityId: type === 'SUPPLIER' ? pay.supplier_id || '' : '',
      accountId: counterpartyAccountId,
      label,
      accountCode: pay.counterpartyAccountCode || pay.supplierCode || '',
    });
    setMainAccount({
      accountId: counterpartyAccountId,
      code: pay.counterpartyAccountCode || pay.supplierCode || '',
      name: label,
      kind: type === 'CUSTOMER' ? 'CUSTOMER' : type === 'SUPPLIER' ? 'SUPPLIER' : 'GENERAL',
      hasChildren: false,
      children: [],
    });
    setFocusSignal(0);
    setSupplierId(type === 'SUPPLIER' ? pay.supplier_id || '' : '');
    setSourceVehicle(
      pay.source_account_id
        ? {
            entityId: '',
            accountId: pay.source_account_id,
            label: pay.sourceAccountName || 'حساب الصرف',
            accountCode: pay.sourceAccountCode || '',
          }
        : null
    );
    setPaymentMethod(pay.payment_method);
    setAmount(String(parseFloat(pay.amount || '0')));
    setPaymentDate(dateOnly(pay.payment_date));
    setReferenceNumber(pay.reference_number || '');
    setDescription(pay.description || '');
    setAllocations(
      Object.fromEntries(
        (pay.allocations || []).map((a) => [a.invoice_id, Number(a.allocated_amount) || 0])
      )
    );
    setFormError(null);
    setWorkspaceMode('edit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExit = () => {
    if (workspaceMode === 'create' && hasUnsavedChanges()) {
      if (!confirm('ستُفقد التغييرات غير المحفوظة. هل تريد الخروج إلى قائمة سندات الصرف؟')) {
        return;
      }
    }
    if (workspaceMode === 'edit' && hasEditChanges()) {
      if (!confirm('ستُفقد التغييرات غير المحفوظة. هل تريد الخروج دون حفظ التعديلات؟')) {
        return;
      }
    }
    setWorkspaceMode(null);
    setSelectedPayment(null);
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
  /* Save / post / void                                               */
  /* ---------------------------------------------------------------- */

const handleSavePayment = async (postImmediately = false) => {
    setFormError(null);
    if (!counterpartyType) {
      setFormError('يرجى اختيار نوع الحساب (الطرف المقابل) أولاً');
      return;
    }
    if (!counterpartySelection) {
      setFormError('يرجى اختيار الحساب المقابل من القائمة');
      return;
    }
    if (counterpartyType === 'SUPPLIER' && !supplierId) {
      setFormError('يرجى اختيار المورد');
      return;
    }
    if (parsedAmount <= 0) {
      setFormError('يرجى إدخال مبلغ صحيح لسند الصرف');
      return;
    }
    if (totalAllocated > parsedAmount) {
      setFormError(
        `المبالغ المخصصة (${totalAllocated.toLocaleString()}) تتجاوز مبلغ السند (${parsedAmount.toLocaleString()})`
      );
      return;
    }

    const isEdit = workspaceMode === 'edit' && Boolean(selectedPayment);

    try {
      setFormSubmitting(true);
      const allocPayload = Object.entries(allocations)
        .filter(([_, val]) => val > 0)
        .map(([invoiceId, amt]) => ({ invoiceId, amount: amt }));

      const descriptionFallback = description || `سند صرف إلى ${counterpartySelection.label}`;

      const res = await fetch(isEdit ? `/api/purchasing/payments/${selectedPayment!.id}` : '/api/purchasing/payments', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counterpartyType,
          supplierId: counterpartyType === 'SUPPLIER' ? supplierId : null,
          customerId: counterpartyType === 'CUSTOMER' ? counterpartySelection.entityId || null : null,
          counterpartyAccountId:
            counterpartyType === 'GENERAL' || counterpartyType === 'CASH' || counterpartyType === 'BANK'
              ? counterpartySelection.accountId
              : counterpartyType === 'CUSTOMER'
                ? counterpartySelection.accountId
                : null,
          sourceVehicleId: sourceVehicle?.entityId || null,
          // في وضع التعديل نحتفظ بحساب الصرف المحفوظ إذا لم يُختر تعريف صندوق/بنك جديد.
          ...(isEdit && !sourceVehicle?.entityId
            ? { sourceAccountId: selectedPayment!.source_account_id }
            : {}),
          // قفل تفاؤلي: يمنع الكتابة فوق تعديل آخر حدث أثناء فتح الشاشة.
          ...(isEdit ? { expectedUpdatedAt: selectedPayment!.updated_at } : {}),
          paymentMethod,
          paymentDate,
          amount: parsedAmount,
          referenceNumber: referenceNumber || null,
          description: descriptionFallback,
          allocations: allocPayload,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'فشل في حفظ سند الصرف');
      }

      const saved = await res.json();

      if (postImmediately) {
        const postRes = await fetch(`/api/purchasing/payments/${saved.id}/post`, {
          method: 'POST',
        });
        if (!postRes.ok) {
          const postData = await postRes.json().catch(() => ({}));
          toast.error('تم حفظ سند الصرف كمسودة', {
            description:
              postData.error || 'تعذر ترحيل السند. يمكنك ترحيله لاحقاً من المستند.',
          });
          resetForm();
          loadData();
          await openPaymentDetails(saved.id);
          return;
        }
      }

      toast.success(
        postImmediately ? 'تم حفظ وترحيل سند الصرف' : isEdit ? 'تم حفظ تعديلات سند الصرف' : 'تم حفظ سند الصرف',
        { description: `رقم السند: ${saved.payment_number}` }
      );
      resetForm();
      loadData();
      await openPaymentDetails(saved.id);
    } catch (err: any) {
      setFormError(err.message);
      toast.error('تعذر حفظ سند الصرف', { description: err.message });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handlePostPayment = async (payId: string) => {
    try {
      const res = await fetch(`/api/purchasing/payments/${payId}/post`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error('تعذر ترحيل سند الصرف', {
          description: data.error || 'فشل ترحيل سند الصرف',
        });
        return;
      }

      toast.success('تم ترحيل سند الصرف', {
        description: 'أُنشئ القيد المحاسبي وتم تحديث أرصدة الفواتير والمورد.',
      });
      loadData();
      if (selectedPayment && selectedPayment.id === payId) {
        await openPaymentDetails(payId);
      }
    } catch (err: any) {
      toast.error('تعذر ترحيل سند الصرف', { description: err.message });
    }
  };

  const handleVoidPayment = async (payId: string) => {
    if (!confirm('هل أنت متأكد من إلغاء سند الصرف وعكس قيده المحاسبي وتحديث الفواتير؟')) {
      return;
    }
    try {
      const res = await fetch(`/api/purchasing/payments/${payId}/void`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error('تعذر إلغاء سند الصرف', {
          description: data.error || 'فشل إلغاء سند الصرف',
        });
        return;
      }

      toast.success('تم إلغاء سند الصرف وعكس القيد');
      loadData();
      if (selectedPayment && selectedPayment.id === payId) {
        await openPaymentDetails(payId);
      }
    } catch (err: any) {
      toast.error('تعذر إلغاء سند الصرف', { description: err.message });
    }
  };

  /* ---------------------------------------------------------------- */
  /* List data                                                        */
  /* ---------------------------------------------------------------- */

  const filteredPayments = payments.filter((p) => {
    const matchesSearch =
      p.payment_number.toLowerCase().includes(search.toLowerCase()) ||
      counterpartyDisplayName(p).toLowerCase().includes(search.toLowerCase()) ||
      (p.reference_number && p.reference_number.toLowerCase().includes(search.toLowerCase()));

    const matchesMethod = methodFilter === 'ALL' || p.payment_method === methodFilter;
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;

    return matchesSearch && matchesMethod && matchesStatus;
  });

  const totalPaymentsAmount = payments
    .filter((p) => p.status === 'POSTED')
    .reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

  const cashPayments = payments
    .filter((p) => p.status === 'POSTED' && p.payment_method === 'CASH')
    .reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

  const bankPayments = payments
    .filter((p) => p.status === 'POSTED' && p.payment_method === 'BANK')
    .reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

  const draftPaymentsCount = payments.filter((p) => p.status === 'DRAFT').length;

  /* ---------------------------------------------------------------- */
  /* Document workspace                                               */
  /* ---------------------------------------------------------------- */

  if (workspaceMode !== null) {
    const isCreate = workspaceMode === 'create';
    const isView = workspaceMode === 'view';
    const isEdit = workspaceMode === 'edit';
    const isPersisted = isView || isEdit;
    const status = selectedPayment?.status;
    const effectiveMethod = isView ? selectedPayment?.payment_method : paymentMethod;
    const documentAmount = isView ? parseFloat(selectedPayment?.amount || '0') : parsedAmount;
    const documentUnallocated = isView
      ? parseFloat(selectedPayment?.unallocated_amount || '0')
      : unallocatedRemaining;

    const documentTitle = isCreate
      ? 'سند صرف جديد'
      : `سند صرف رقم ${selectedPayment?.payment_number || ''}`;

    const documentDescription = isCreate ? (
      'سجّل مبلغ المدفوع وخصّصه على الفواتير غير المسددة، ثم احفظ المسودة أو احفظ وترحيل.'
    ) : (
      <>
        {counterpartyDisplayName(selectedPayment)} • تاريخ السند{' '}
        <bdi dir="ltr">{dateOnly(selectedPayment?.payment_date)}</bdi>
      </>
    );

    const badge = isCreate ? (
      <StatusBadge tone="info">جديدة</StatusBadge>
    ) : status ? (
      <DocumentStatusBadge status={status} />
    ) : null;

    const movementLabel = (method?: 'CASH' | 'BANK') =>
      method === 'BANK' ? 'بنكي — صرف من البنك' : 'نقدي — سحب من الصندوق';

    const sourceAccountLabel = isView
      ? selectedPayment?.sourceAccountName || '—'
      : (sourceVehicle?.label || (paymentMethod === 'BANK' ? 'البنك الافتراضي (1102)' : 'الصندوق الافتراضي (1101)'));
    const sourceAccountCode = isView
      ? selectedPayment?.sourceAccountCode || '—'
      : (sourceVehicle?.accountCode || (paymentMethod === 'BANK' ? '1102' : '1101'));

const counterpartyAccountLabel = isView
      ? selectedPayment?.supplierName || selectedPayment?.counterpartyAccountName || '—'
      : (counterpartySelection?.label || '—');
    const counterpartyAccountCode = isView
      ? selectedPayment?.counterpartyAccountCode || selectedPayment?.supplierCode || '—'
      : (counterpartySelection?.accountCode || '—');
    const counterpartyTypeValue = isView
      ? counterpartyTypeLabel(selectedPayment)
      : counterpartyType
        ? COUNTERPARTY_TYPE_LABEL_AR[counterpartyType] || 'العملاء'
        : '—';
    const documentDescriptionText = isView
      ? selectedPayment?.description || 'بيان سند الصرف'
      : description || (counterpartySelection ? `صرف على ${counterpartySelection.label}` : '—');
    const documentReference = isView ? selectedPayment?.reference_number || '—' : referenceNumber || '—';
    const documentDate = isView ? dateOnly(selectedPayment?.payment_date) : paymentDate;
    const documentNumber = isPersisted ? selectedPayment?.payment_number || '—' : 'يُولَّد عند الحفظ';
    const documentBranch = isPersisted ? selectedPayment?.branchName || '—' : branchName || '—';

    const ledgerRows: VoucherLedgerRow[] = [
      {
        key: 'target',
        accountType: effectiveMethod === 'BANK' ? 'بنك' : 'صندوق',
        accountCode: sourceAccountCode,
        accountName: sourceAccountLabel,
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
        value: selectedPayment?.createdByName || '—',
        icon: <UserRound size={14} />,
        tone: 'default',
      },
      {
        label: 'تاريخ الإدخال',
        value: formatVoucherDateTime(selectedPayment?.created_at),
        icon: <Monitor size={14} />,
        tone: 'default',
      },
      {
        label: 'آخر تعديل',
        value: selectedPayment?.lastModifiedByName || '—',
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
          selectedPayment?.lastModifiedAt || selectedPayment?.updated_at || selectedPayment?.created_at
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
              <DatePicker value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          )}
        </VoucherField>
        <VoucherField label="نوع الحركة" required className="gcol-3">
          {isView ? (
            <VoucherStaticField>{movementLabel(selectedPayment?.payment_method)}</VoucherStaticField>
          ) : (
            <div className="kayan-sheet-control">
              <Select
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value as 'CASH' | 'BANK');
                  setSourceVehicle(null);
                }}
                options={[
                  { value: 'CASH', label: 'نقدي — سحب من الصندوق (1101)' },
                  { value: 'BANK', label: 'بنكي — صرف من البنك (1102)' },
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
            <VoucherStaticField icon={<Landmark size={15} />}>{sourceAccountLabel}</VoucherStaticField>
          ) : (
            <div className="kayan-sheet-control">
              <VoucherVehicleSelect
                voucherKind="payment"
                category={paymentMethod === 'BANK' ? 'BANK' : 'CASH'}
                value={sourceVehicle}
                onSelect={setSourceVehicle}
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
              <VoucherMainAccountSelect
                value={mainAccount}
                onChange={handleMainAccountChange}
                disabled={false}
              />
            </div>
          )}
        </VoucherField>
        <VoucherField label="الحساب التحليلي" required className="gcol-3">
          {isView ? (
            <VoucherStaticField icon={<UserRound size={15} />}>{counterpartyAccountLabel}</VoucherStaticField>
          ) : (
            <div className="kayan-sheet-control">
              <VoucherCounterpartyAccountSelect
                voucherKind="payment"
                counterpartyType={counterpartyType}
                selection={counterpartySelection}
                onSelectionChange={handleCounterpartySelection}
                disabled={false}
                restrictToAccountIds={
                  mainAccount?.kind === 'GENERAL' ? mainAccount.children.map((child) => child.accountId) : null
                }
                focusSignal={focusSignal}
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
                  placeholder="بيان الصرف..."
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
        ) : !supplierId ? (
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

    const viewAllocations = selectedPayment?.allocations || [];
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
          {isView && selectedPayment?.journalEntryNumber ? (
            <span className="rounded-control border border-line bg-surface-muted px-2.5 py-1 font-mono text-xs font-bold text-brand">
              {selectedPayment.journalEntryNumber}
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
              • الطرف المدين (DR): {sourceAccountLabel} = {formatVoucherMoney(documentAmount)} {currency}
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
            onClick={() => handleSavePayment(true)}
            disabled={formSubmitting || !counterpartySelection || parsedAmount <= 0}
            loading={formSubmitting}
            loadingText="جارٍ الحفظ والترحيل..."
          >
            حفظ وترحيل
          </Button>
        ) : isView && status === 'DRAFT' && selectedPayment ? (
          <Button
            variant="success"
            size="sm"
            icon={<CheckCircle2 size={16} />}
            onClick={() => handlePostPayment(selectedPayment.id)}
          >
            ترحيل واعتماد
          </Button>
        ) : null}
      </>
    );

    const navigateToPayment = (index: number) => {
      const target = filteredPayments[index];
      if (target) openPaymentDetails(target.id);
    };
    const navIndex = isView && selectedPayment
      ? filteredPayments.findIndex((r) => r.id === selectedPayment.id)
      : -1;

    return (
      <>
        <VoucherWorkspace
          actionBar={
            <DocumentActionBar
              variant="voucher"
              title="سند صرف"
              titleIcon={<Coins size={24} />}
              mode={workspaceMode}
              status={status}
              saving={formSubmitting}
              onNew={openNew}
              onEdit={handleEditPayment}
              onSave={() => handleSavePayment(false)}
              onPrint={() => window.print()}
              onArchive={() => undefined}
              onExit={handleExit}
              searchValue={search}
              onSearchChange={setSearch}
              navigationDisabled={!isView || navIndex < 0}
              navigationReason="التنقل بين سندات الصرف متاح بعد فتح سند محفوظ من قائمة سندات الصرف."
              onFirst={() => navigateToPayment(0)}
              onPrevious={() => navigateToPayment(navIndex - 1)}
              onNext={() => navigateToPayment(navIndex + 1)}
              onLast={() => navigateToPayment(filteredPayments.length - 1)}
              canEdit={isView && status === 'DRAFT' && Boolean(selectedPayment)}
              editReason={
                !selectedPayment
                  ? 'افتح سند صرف محفوظاً أولاً، ثم يمكن تعديله.'
                  : status === 'POSTED'
                    ? 'لا يمكن تعديل سند صرف مرحّل محاسبياً؛ استخدم الإلغاء/العكس وفق قواعد النظام.'
                    : status === 'VOIDED'
                      ? 'لا يمكن تعديل سند صرف ملغى.'
                      : 'التعديل متاح للمسودات فقط.'
              }
              canSave={isCreate || isEdit}
              saveReason={
                isPersisted && !isEdit
                  ? 'المستند محفوظ. اضغط «تعديل» لتغيير بياناته.'
                  : 'لا توجد بيانات قابلة للحفظ في هذه الحالة.'
              }
              canPrint={isView && Boolean(selectedPayment)}
              printReason={
                isEdit
                  ? 'احفظ التعديلات أولاً، ثم اطبع النسخة المحفوظة.'
                  : 'احفظ السند أولاً، ثم يمكن طباعته بالقالب المعتمد.'
              }
              canArchive={false}
              archiveReason="الأرشفة غير مدعومة لسندات الصرف في النظام الحالي."
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
            selectedPayment ? (
              <PaymentPrint payment={selectedPayment} company={company} />
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
                  disabled={!supplierId || parsedAmount <= 0}
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
        title="سندات الصرف للموردين"
        description="إثبات المدفوعات النقدية والبنكية والشيكات، تخصيص السداد على فواتير المشتريات، وتخفيض مديونية الموردين آلياً"
        icon={<CreditCard size={20} />}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
            سند صرف جديد
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="إجمالي المدفوعات المعتمدة"
          value={money(totalPaymentsAmount)}
          unit="ر.ي"
          icon={<CreditCard size={18} />}
          tone="success"
          hint="ريال يمني — سندات مرحلة"
          pending={loading}
        />
        <KpiCard
          label="مدفوعات الصندوق والخزينة"
          value={money(cashPayments)}
          unit="ر.ي"
          icon={<Wallet size={18} />}
          tone="brand"
          hint="حساب 1101 الصندوق الرئيسي"
          pending={loading}
        />
        <KpiCard
          label="مدفوعات البنوك والشيكات"
          value={money(bankPayments)}
          unit="ر.ي"
          icon={<Landmark size={18} />}
          tone="neutral"
          hint="حساب 1102 حسابات البنوك"
          pending={loading}
        />
        <KpiCard
          label="سندات قيد الاعتماد"
          value={draftPaymentsCount.toLocaleString('en-US')}
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
          placeholder: 'بحث برقم سند الصرف أو اسم المورد أو المرجع...',
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
              className="min-w-[200px]"
              size="sm"
              options={[
                { value: 'ALL', label: 'طريقة الصرف: الكل' },
                { value: 'CASH', label: 'نقدي (الصندوق 1101)' },
                { value: 'BANK', label: 'بنكي / شيكات (البنك 1102)' },
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
                <th className="px-4 py-3.5">طريقة الصرف والحساب</th>
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
                    <LoadingState text="جارٍ تحميل سندات الصرف..." />
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={<CreditCard size={32} />}
                      title="لا توجد سندات صرف مطابقة"
                      description="جرّب تغيير البحث أو الفلاتر، أو أنشئ سند صرف جديداً."
                      action={
                        <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
                          سند صرف جديد
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredPayments.map((pay) => {
                  const amt = parseFloat(pay.amount || '0');
                  const alloc = parseFloat(pay.allocated_amount || '0');

                  return (
                    <tr key={pay.id} className="transition-colors hover:bg-surface-hover/60">
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => openPaymentDetails(pay.id)}
                          className="inline-flex items-center gap-1 font-mono font-bold text-brand hover:underline"
                        >
                          <span>{pay.payment_number}</span>
                          <ExternalLink size={12} className="opacity-60" />
                        </button>
                      </td>

                      <td className="kayan-numeric px-4 py-3.5 text-ink-muted">
                        <bdi dir="ltr">{dateOnly(pay.payment_date)}</bdi>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-ink">{counterpartyDisplayName(pay)}</span>
                          {pay.counterparty_type && pay.counterparty_type !== 'SUPPLIER' && (
                            <StatusBadge tone="info" size="sm">
                              {counterpartyTypeLabel(pay)}
                            </StatusBadge>
                          )}
                        </div>
                        {pay.supplierCode && (
                          <div className="font-mono text-[10px] text-ink-muted">{pay.supplierCode}</div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge
                            tone={pay.payment_method === 'CASH' ? 'success' : 'info'}
                            size="sm"
                          >
                            {pay.payment_method === 'CASH' ? 'نقدي' : 'بنكي'}
                          </StatusBadge>
                          <span className="text-[11px] font-semibold text-ink-muted">
                            {pay.sourceAccountName}
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
                        <DocumentStatusBadge status={pay.status} />
                      </td>

                      <td className="px-4 py-3.5">
                        {pay.journalEntryNumber ? (
                          <span className="rounded-md border border-line bg-surface-muted px-2 py-1 font-mono text-xs font-bold text-ink">
                            {pay.journalEntryNumber}
                          </span>
                        ) : (
                          <span className="text-[11px] text-ink-muted">بدون قيد (مسودة)</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          <IconButton
                            tone="primary"
                            label="عرض سند الصرف"
                            onClick={() => openPaymentDetails(pay.id)}
                          >
                            <Eye size={15} />
                          </IconButton>
                          {pay.status === 'DRAFT' && (
                            <Button
                              size="xs"
                              variant="success"
                              onClick={() => handlePostPayment(pay.id)}
                            >
                              ترحيل
                            </Button>
                          )}
                          {pay.status === 'POSTED' && (
                            <IconButton
                              tone="danger"
                              label="إلغاء سند الصرف وعكس القيد"
                              onClick={() => handleVoidPayment(pay.id)}
                            >
                              <Ban size={15} />
                            </IconButton>
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
        عرض البيانات المالية من الخدمات الحالية فقط. تعديل سندات الصرف متاح للمسودات غير المرحّلة
        من شاشة عرض السند، والترحيل متاح للمسودات وفق قواعد النظام. الأرشفة غير مدعومة حالياً.
      </p>
    </div>
  );
};

export default SupplierPaymentsPage;
