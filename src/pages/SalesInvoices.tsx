import React, { useEffect, useState, useRef } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Banknote,
  Barcode,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  DollarSign,
  ExternalLink,
  Eye,
  FilePlus,
  FileText,
  HelpCircle,
  Home,
  Lock,
  LogOut,
  Pencil,
  Plus,
  PlusCircle,
  Printer,
  Save,
  ScanBarcode,
  Search,
  Settings,
  ShieldAlert,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  Unlock,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { useLookup } from '../context/LookupContext';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { useSettings } from '../context/SettingsContext';
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
  DocumentStatusBadge,
  type DocumentMode,
} from '../components/documents';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface InvoiceLine {
  id?: string;
  itemId?: string;
  item_code?: string;
  description: string;
  unit?: string;
  itemUnit?: string;
  warehouseId?: string;
  warehouseName?: string;
  quantity: number;
  free_quantity?: number;
  cost?: number;
  unit_price: number;
  margin?: number;
  margin_percent?: number;
  line_total?: number;
  total_margin?: number;
  net_price?: number;
  discount: number;
  tax: number;
  availableQty?: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customerName: string;
  customerCode: string;
  customerPhone?: string;
  customerAddress?: string;
  payment_type: 'CASH' | 'CREDIT';
  invoice_date: string;
  due_date: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  paid_amount: string;
  status: 'DRAFT' | 'POSTED' | 'VOIDED';
  journal_entry_id?: string;
  journalEntryNumber?: string;
  branchName?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
  created_by?: string;
  createdByName?: string;
  lastModifiedByName?: string;
  lastModifiedAt?: string;
  lines?: InvoiceLine[];
}

interface CustomerOption {
  id: string;
  code: string;
  name: string;
  credit_limit: string;
  outstandingBalance: string;
  is_active: boolean;
}

interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  location?: string;
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

const SESSION_TOKEN_KEY = 'kayan_session_token';

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token =
    typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_TOKEN_KEY) : null;
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function money(value: number | string | null | undefined): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

function dateOnly(value?: string | null): string {
  return value ? String(value).slice(0, 10) : '';
}

const emptyLine = (warehouseId?: string): InvoiceLine => ({
  item_code: '',
  description: '',
  unit: 'باكت',
  warehouseId,
  quantity: 1,
  free_quantity: 0,
  cost: 0,
  unit_price: 0,
  margin: 0,
  margin_percent: 0,
  line_total: 0,
  total_margin: 0,
  net_price: 0,
  discount: 0,
  tax: 0,
});

const STATUS_FILTERS = [
  { value: 'ALL', label: 'الكل' },
  { value: 'POSTED', label: 'مرحلة' },
  { value: 'DRAFT', label: 'مسودة' },
  { value: 'VOIDED', label: 'ملغاة' },
] as const;

/* Barcode Scanner Gun SVG Icon matching Onyx Pro */
const BarcodeGunIcon: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} stroke="none">
    <path d="M3 4a1 1 0 0 1 1-1h13a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-2l-1.5 5.5a1 1 0 0 1-.96.74H9.5a1 1 0 0 1-.96-.74L7 9H4a1 1 0 0 1-1-1V4z" />
    <path d="M10 14.5l-2.5 6.2a1 1 0 0 1-.93.63H4a1 1 0 0 1-.93-1.37L5.5 13H10v1.5z" />
    <rect x="18.5" y="4.5" width="2" height="3" rx="0.5" fill="#38bdf8" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Print View                                                         */
/* ------------------------------------------------------------------ */

const SalesInvoicePrint: React.FC<{
  invoice: Invoice;
  company: CompanyIdentity | null;
}> = ({ invoice, company }) => {
  const subtotal = parseFloat(invoice.subtotal || '0');
  const discount = parseFloat(invoice.discount || '0');
  const tax = parseFloat(invoice.tax || '0');
  const total = parseFloat(invoice.total || '0');

  return (
    <div className="bg-white p-8 text-slate-800" dir="rtl">
      <ReportHeader
        company={company}
        title={`فاتورة مبيعات رقم ${invoice.invoice_number}`}
        subtitle={
          <>
            التاريخ: <bdi dir="ltr">{dateOnly(invoice.invoice_date)}</bdi> • نوع الفاتورة:{' '}
            {invoice.payment_type === 'CASH' ? 'نقدي' : 'آجل'}
          </>
        }
        compact
      />

      <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200/80 bg-slate-50 p-4 text-xs">
        <div>
          <span className="block font-bold text-slate-400">بيانات العميل:</span>
          <span className="mt-0.5 block text-sm font-bold text-slate-900">
            {invoice.customerName}
          </span>
          <span className="block font-mono text-slate-500">كود: {invoice.customerCode}</span>
        </div>
        <div>
          <span className="block font-bold text-slate-400">العنوان والتواصل:</span>
          <span className="mt-0.5 block text-slate-700">{invoice.customerPhone || '—'}</span>
          <span className="block text-slate-500">{invoice.customerAddress || 'المركز الرئيسي'}</span>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-right text-xs">
          <thead className="border-b border-slate-200 bg-slate-100/70 font-bold text-slate-700">
            <tr>
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">رقم الصنف</th>
              <th className="px-3 py-2.5">اسم الصنف</th>
              <th className="px-3 py-2.5 text-center">الوحدة</th>
              <th className="px-3 py-2.5 text-center">الكمية</th>
              <th className="px-3 py-2.5 text-left">السعر</th>
              <th className="px-3 py-2.5 text-left">الخصم</th>
              <th className="px-3 py-2.5 text-left">الإجمالي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.lines?.map((line, idx) => (
              <tr key={line.id || idx}>
                <td className="px-3 py-2.5 font-mono text-slate-400">{idx + 1}</td>
                <td className="px-3 py-2.5 font-mono">{line.item_code || '—'}</td>
                <td className="px-3 py-2.5 font-semibold text-slate-800">{line.description}</td>
                <td className="px-3 py-2.5 text-center">{line.unit || line.itemUnit || '—'}</td>
                <td className="px-3 py-2.5 text-center font-mono font-bold">{line.quantity}</td>
                <td className="px-3 py-2.5 text-left font-mono">
                  {Number(line.unit_price).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-left font-mono text-rose-600">
                  {Number(line.discount) > 0 ? Number(line.discount).toLocaleString() : '—'}
                </td>
                <td className="px-3 py-2.5 text-left font-mono font-bold text-slate-900">
                  {Number(line.line_total || line.quantity * line.unit_price).toLocaleString()}
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
          {discount > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>إجمالي الخصم:</span>
              <span className="font-mono font-bold">-{discount.toLocaleString()} ر.ي</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>ضريبة المبيعات:</span>
              <span className="font-mono font-bold">+{tax.toLocaleString()} ر.ي</span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-300 pt-1.5 text-sm font-black text-slate-900">
            <span>المجموع الإجمالي:</span>
            <span className="font-mono text-blue-600">{total.toLocaleString()} ريال يمني</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Sales Invoices Page Component                                      */
/* ------------------------------------------------------------------ */

export const SalesInvoicesPage: React.FC = () => {
  const { openLookup } = useLookup();
  const { company } = useCompanyProfile();
  const { getValue } = useSettings();
  const toast = useToast();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [taxCodes, setTaxCodes] = useState<TaxCodeOption[]>([]);
  const [selectedTaxCodeId, setSelectedTaxCodeId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');

  // Default to 'create' mode to immediately display the Onyx Pro invoice screen
  const [workspaceMode, setWorkspaceMode] = useState<DocumentMode | null>('create');
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Field editability lock: fields are read-only UNLESS isEditing is true
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Column visibility settings (Onyx Pro style)
  const [showCostAndProfit, setShowCostAndProfit] = useState<boolean>(true);
  const [showFreeQty, setShowFreeQty] = useState<boolean>(true);
  const [showNetPrice, setShowNetPrice] = useState<boolean>(true);
  const [showColumnSettings, setShowColumnSettings] = useState<boolean>(false);

  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [overrideTargetId, setOverrideTargetId] = useState<string | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT'>('CASH');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');
  const [formLines, setFormLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [allowCreditOverride, setAllowCreditOverride] = useState(false);

  // Active line index for selection highlight
  const [activeLineIdx, setActiveLineIdx] = useState<number>(0);
  const [salesRep, setSalesRep] = useState<string>('أحمد محمد');
  const [invoiceType, setInvoiceType] = useState<string>('مبيعات');
  const [showBarcodeDialog, setShowBarcodeDialog] = useState<boolean>(false);
  const [barcodeInputVal, setBarcodeInputVal] = useState<string>('');

  // Clock state
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Data Loading                                                     */
  /* ---------------------------------------------------------------- */

  const loadData = async () => {
    try {
      setLoading(true);
      const [invRes, custRes, whRes, taxRes] = await Promise.all([
        fetch('/api/sales/invoices?limit=100', { headers: authHeaders() }),
        fetch('/api/customers', { headers: authHeaders() }),
        fetch('/api/inventory/warehouses?activeOnly=true', { headers: authHeaders() }),
        fetch('/api/taxes/codes', { headers: authHeaders() }),
      ]);

      if (invRes.ok) setInvoices(await invRes.json());
      if (custRes.ok) {
        const custData = await custRes.json();
        const activeCusts = custData.filter((c: CustomerOption) => c.is_active);
        setCustomers(activeCusts);
        if (!selectedCustomerId && activeCusts.length > 0) {
          const cashCust = activeCusts.find((c: CustomerOption) => c.name.includes('نقدي')) || activeCusts[0];
          if (cashCust) setSelectedCustomerId(cashCust.id);
        }
      }
      if (whRes.ok) {
        const whData = await whRes.json();
        setWarehouses(whData);
        if (whData.length > 0) {
          setSelectedWarehouseId((current) => current || whData[0].id);
        }
      }
      if (taxRes.ok) {
        const taxData = await taxRes.json();
        const codes = Array.isArray(taxData) ? taxData : [];
        setTaxCodes(codes);
        const vat15 = codes.find((t: TaxCodeOption) => parseFloat(t.rate_percentage || '0') === 15);
        if (vat15 && !selectedTaxCodeId) {
          setSelectedTaxCodeId(vat15.id);
        }
      }
    } catch (err) {
      console.error('Error loading invoices data:', err);
      toast.error('تعذر تحميل بيانات فواتير المبيعات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- */
  /* Calculations                                                     */
  /* ---------------------------------------------------------------- */

  const getSelectedTaxRate = () => {
    if (!selectedTaxCodeId) return 0;
    const tc = taxCodes.find((t) => t.id === selectedTaxCodeId);
    return tc ? parseFloat(tc.rate_percentage || '0') / 100 : 0;
  };

  const handleOpenItemLookup = (lineIdx: number) => {
    if (!isEditing) {
      setIsEditing(true);
      toast.info('تم تفعيل وضع التحرير');
    }
    openLookup('ITEM', (item: any) => {
      if (!item || !item.id) return;
      const price = parseFloat(
        item.sellingPrice ||
          item.sale_price ||
          item.averageCost ||
          item.purchasePrice ||
          item.purchase_price ||
          0
      );
      const cost = parseFloat(
        item.averageCost || item.cost || item.purchasePrice || item.purchase_price || 0
      );
      const available = parseFloat(
        item.availableQty !== undefined ? item.availableQty : item.currentStock || 0
      );
      const rate = getSelectedTaxRate();

      setFormLines((prev) => {
        const next = [...prev];
        const current = next[lineIdx] || emptyLine(selectedWarehouseId);
        const qty = Number(current.quantity) > 0 ? Number(current.quantity) : 1;
        const disc = Number(current.discount) || 0;
        const lineNet = Math.max(0, qty * price - disc);
        const tax = Number((lineNet * rate).toFixed(2));
        const margin = price - cost;
        const marginPercent = price > 0 ? Number(((margin / price) * 100).toFixed(2)) : 0;
        const totalMargin = Number((qty * margin).toFixed(2));
        const lineTotal = qty * price;
        const netPrice = lineNet + tax;

        next[lineIdx] = {
          ...current,
          itemId: item.id,
          item_code: item.sku || item.barcode || item.code || '',
          description: item.name || current.description,
          unit: item.unit || current.unit || 'باكت',
          warehouseId: selectedWarehouseId || current.warehouseId || undefined,
          quantity: qty,
          free_quantity: current.free_quantity || 0,
          cost,
          unit_price: price,
          margin,
          margin_percent: marginPercent,
          line_total: lineTotal,
          total_margin: totalMargin,
          net_price: netPrice,
          discount: disc,
          tax,
          availableQty: available,
        };
        return next;
      });
    });
  };

  const handleOpenCustomerLookup = () => {
    if (!isEditing) {
      setIsEditing(true);
      toast.info('تم تفعيل وضع التحرير');
    }
    openLookup('CUSTOMER', (c: any) => {
      if (!c || !c.id) return;
      setSelectedCustomerId(c.id);
      setCustomers((prev) => {
        if (prev.some((x) => x.id === c.id)) return prev;
        return [
          ...prev,
          {
            id: c.id,
            code: c.code,
            name: c.name,
            credit_limit: c.creditLimit || '0',
            outstandingBalance: c.balance || '0',
            is_active: true,
          },
        ];
      });
    });
  };

  const addLine = () => {
    if (!isEditing) {
      setIsEditing(true);
      toast.info('تم تفعيل وضع التحرير وإضافة سطر جديد');
    }
    setFormLines((prev) => {
      const next = [...prev, emptyLine(selectedWarehouseId)];
      setActiveLineIdx(next.length - 1);
      return next;
    });
  };

  const removeLine = (idx: number) => {
    if (!isEditing) {
      toast.warning('يرجى تفعيل وضع التعديل لحذف الأصناف');
      return;
    }
    setFormLines((prev) => {
      if (prev.length <= 1) {
        return [emptyLine(selectedWarehouseId)];
      }
      const next = prev.filter((_, i) => i !== idx);
      setActiveLineIdx(Math.max(0, idx - 1));
      return next;
    });
  };

  const updateLine = (idx: number, field: keyof InvoiceLine, value: any) => {
    setFormLines((prev) => {
      const updated = [...prev];
      const target = { ...updated[idx], [field]: value };
      const qty = field === 'quantity' ? Number(value) || 0 : Number(target.quantity) || 0;
      const price = field === 'unit_price' ? Number(value) || 0 : Number(target.unit_price) || 0;
      const cost = Number(target.cost) || 0;
      const disc = field === 'discount' ? Number(value) || 0 : Number(target.discount) || 0;
      const lineNet = Math.max(0, qty * price - disc);

      if (field === 'quantity' || field === 'unit_price' || field === 'discount') {
        target.tax = Number((lineNet * getSelectedTaxRate()).toFixed(2));
      }
      const lineTotal = qty * price;
      target.line_total = lineTotal;
      target.net_price = lineNet + (Number(target.tax) || 0);

      const margin = price - cost;
      target.margin = margin;
      target.margin_percent = price > 0 ? Number(((margin / price) * 100).toFixed(2)) : 0;
      target.total_margin = Number((qty * margin).toFixed(2));

      updated[idx] = target;
      return updated;
    });
  };

  const handleBarcodeLookup = async (code: string) => {
    if (!code.trim()) return;
    if (!isEditing) {
      setIsEditing(true);
    }
    try {
      const res = await fetch(`/api/inventory/items?search=${encodeURIComponent(code.trim())}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const items = await res.json();
        const found = items.find(
          (it: any) =>
            it.barcode === code.trim() ||
            it.sku === code.trim() ||
            it.code === code.trim() ||
            (it.name && it.name.includes(code.trim()))
        ) || items[0];

        if (found) {
          const price = parseFloat(
            found.sellingPrice || found.sale_price || found.purchasePrice || 0
          );
          const cost = parseFloat(
            found.averageCost || found.cost || found.purchasePrice || 0
          );
          const rate = getSelectedTaxRate();
          const targetIdx =
            formLines.length === 1 && !formLines[0].description
              ? 0
              : activeLineIdx;

          setFormLines((prev) => {
            const next = [...prev];
            const current = next[targetIdx] || emptyLine(selectedWarehouseId);
            const qty = Number(current.quantity) > 0 ? Number(current.quantity) : 1;
            const disc = Number(current.discount) || 0;
            const lineNet = Math.max(0, qty * price - disc);
            const tax = Number((lineNet * rate).toFixed(2));
            const margin = price - cost;
            const marginPercent = price > 0 ? Number(((margin / price) * 100).toFixed(2)) : 0;
            const totalMargin = Number((qty * margin).toFixed(2));
            const lineTotal = qty * price;
            const netPrice = lineNet + tax;

            next[targetIdx] = {
              ...current,
              itemId: found.id,
              item_code: found.sku || found.barcode || found.code || '',
              description: found.name || current.description,
              unit: found.unit || current.unit || 'باكت',
              warehouseId: selectedWarehouseId || current.warehouseId || undefined,
              quantity: qty,
              free_quantity: current.free_quantity || 0,
              cost,
              unit_price: price,
              margin,
              margin_percent: marginPercent,
              line_total: lineTotal,
              total_margin: totalMargin,
              net_price: netPrice,
              discount: disc,
              tax,
              availableQty: parseFloat(found.currentStock || found.availableQty || 0),
            };
            return next;
          });
          toast.success(`تم إدراج الصنف: ${found.name}`);
          setShowBarcodeDialog(false);
          setBarcodeInputVal('');
          return;
        }
      }
      toast.warning('لم يتم العثور على صنف بهذا الباركود');
    } catch (e) {
      console.error(e);
      toast.error('خطأ في البحث عن الصنف بالباركود');
    }
  };

  /* ---------------------------------------------------------------- */
  /* Totals                                                           */
  /* ---------------------------------------------------------------- */

  const subtotal = formLines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
    0
  );
  const totalDiscount = formLines.reduce((sum, l) => sum + (Number(l.discount) || 0), 0);
  const totalTax = formLines.reduce((sum, l) => sum + (Number(l.tax) || 0), 0);
  const netTotal = subtotal - totalDiscount + totalTax;

  const activeCustomer = customers.find((c) => c.id === selectedCustomerId);
  const creditLimit = parseFloat(activeCustomer?.credit_limit || '0');
  const currentBalance = parseFloat(activeCustomer?.outstandingBalance || '0');
  const wouldExceedLimit =
    paymentType === 'CREDIT' && creditLimit > 0 && currentBalance + netTotal > creditLimit;

  /* ---------------------------------------------------------------- */
  /* Form Actions                                                     */
  /* ---------------------------------------------------------------- */

  const resetForm = () => {
    const cashCust = customers.find((c) => c.name.includes('نقدي')) || customers[0];
    setSelectedCustomerId(cashCust?.id || '');
    setPaymentType('CASH');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setDueDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setNotes('');
    setFormLines([emptyLine(selectedWarehouseId)]);
    setAllowCreditOverride(false);
    setFormError(null);
    setActiveLineIdx(0);
  };

  const openNew = () => {
    if (isEditing && formLines.some((l) => l.description.trim())) {
      if (!confirm('ستُفقد التغييرات غير المحفوظة. هل تريد فتح مستند جديد؟')) return;
    }
    resetForm();
    setSelectedInvoice(null);
    setEditingInvoiceId(null);
    setWorkspaceMode('create');
    setIsEditing(true);
    setFormError(null);
    toast.info('فاتورة جديدة: تم تفعيل وضع الإدخال');
  };

  const applyInvoiceToForm = (inv: Invoice) => {
    setSelectedCustomerId(inv.customer_id);
    setPaymentType(inv.payment_type);
    setInvoiceDate(dateOnly(inv.invoice_date));
    setDueDate(dateOnly(inv.due_date));
    setNotes(inv.notes || '');
    setSelectedTaxCodeId('');
    setAllowCreditOverride(false);

    const lines: InvoiceLine[] = (inv.lines || []).map((l) => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unit_price) || 0;
      const cost = Number(l.cost) || 0;
      const margin = price - cost;
      const marginPercent = price > 0 ? Number(((margin / price) * 100).toFixed(2)) : 0;
      const totalMargin = Number((qty * margin).toFixed(2));
      const lineTotal = Number(l.line_total) || qty * price;
      const netPrice = lineTotal - (Number(l.discount) || 0) + (Number(l.tax) || 0);

      return {
        id: l.id,
        itemId: l.itemId,
        item_code: l.item_code,
        description: l.description,
        unit: l.itemUnit || l.unit || 'باكت',
        warehouseId: l.warehouseId,
        warehouseName: l.warehouseName,
        quantity: qty,
        free_quantity: l.free_quantity || 0,
        cost,
        unit_price: price,
        margin,
        margin_percent: marginPercent,
        line_total: lineTotal,
        total_margin: totalMargin,
        net_price: netPrice,
        discount: Number(l.discount) || 0,
        tax: Number(l.tax) || 0,
      };
    });

    setFormLines(lines.length > 0 ? lines : [emptyLine(selectedWarehouseId)]);
    const lineWarehouse = lines.find((l) => l.warehouseId)?.warehouseId;
    if (lineWarehouse) setSelectedWarehouseId(lineWarehouse);
    setFormError(null);
    setActiveLineIdx(0);
  };

  const openInvoiceDetails = async (invId: string) => {
    try {
      const res = await fetch(`/api/sales/invoices/${invId}`, { headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر فتح الفاتورة');
      }
      const data = await res.json();
      setSelectedInvoice(data);
      applyInvoiceToForm(data);
      setEditingInvoiceId(null);
      setWorkspaceMode('view');
      setIsEditing(false); // Locked for viewing
      setFormError(null);
    } catch (err: any) {
      toast.error('تعذر فتح الفاتورة', { description: err.message });
    }
  };

  const openInvoiceForEdit = async (invId: string) => {
    try {
      const res = await fetch(`/api/sales/invoices/${invId}`, { headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر فتح الفاتورة للتعديل');
      }
      const data: Invoice = await res.json();
      if (data.status !== 'DRAFT') {
        toast.warning('لا يمكن تعديل هذه الفاتورة', {
          description: 'التعديل متاح للمسودات فقط. الفواتير المرحّلة تُعالج بالإلغاء/العكس.',
        });
        return;
      }
      setSelectedInvoice(data);
      applyInvoiceToForm(data);
      setEditingInvoiceId(data.id);
      setWorkspaceMode('edit');
      setIsEditing(true); // Unlocked for editing
      toast.info('تم تفعيل وضع التعديل');
    } catch (err: any) {
      toast.error('تعذر فتح الفاتورة للتعديل', { description: err.message });
    }
  };

  const handleExit = () => {
    if (isEditing && formLines.some((l) => l.description.trim())) {
      if (!confirm('ستُفقد التغييرات غير المحفوظة. هل تريد الخروج من وضع التعديل؟')) return;
    }
    setIsEditing(false);
    if (selectedInvoice) {
      setWorkspaceMode('view');
      applyInvoiceToForm(selectedInvoice);
    } else {
      resetForm();
    }
    toast.info('تم إغلاق وضع التعديل وحفظ الشاشة في وضع القراءة');
  };

  const handleSaveInvoice = async (postImmediately = false) => {
    setFormError(null);

    if (
      postImmediately &&
      getValue('ui.confirm_before_post', true) &&
      !confirm('سيتم حفظ الفاتورة وترحيلها محاسبياً فوراً. هل تريد المتابعة؟')
    ) {
      return;
    }
    if (!selectedCustomerId) {
      setFormError('يرجى اختيار العميل أولاً');
      toast.error('يرجى اختيار العميل أولاً');
      return;
    }
    if (formLines.some((l) => !l.description.trim() || l.quantity <= 0 || l.unit_price <= 0)) {
      setFormError('يرجى تعبئة كافة بنود الفاتورة والبيان والكمية والأسعار');
      toast.error('يرجى تعبئة كافة بنود الفاتورة والبيان والكمية والأسعار');
      return;
    }

    const isEditMode = workspaceMode === 'edit' && Boolean(editingInvoiceId);

    try {
      setFormSubmitting(true);
      const res = await fetch(
        isEditMode ? `/api/sales/invoices/${editingInvoiceId}` : '/api/sales/invoices',
        {
          method: isEditMode ? 'PUT' : 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            customerId: selectedCustomerId,
            paymentType,
            invoiceDate,
            dueDate,
            notes,
            lines: formLines.map((l) => ({
              itemId: l.itemId,
              warehouseId: l.warehouseId || selectedWarehouseId || undefined,
              itemCode: l.item_code,
              description: l.description,
              quantity: Number(l.quantity),
              unitPrice: Number(l.unit_price),
              discount: Number(l.discount) || 0,
              tax: Number(l.tax) || 0,
            })),
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'فشل في حفظ الفاتورة');
      }

      const saved: Invoice = await res.json();

      if (postImmediately) {
        const postRes = await fetch(`/api/sales/invoices/${saved.id}/post`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ allowOverride: allowCreditOverride }),
        });
        if (!postRes.ok) {
          const postData = await postRes.json().catch(() => ({}));
          toast.error('تم حفظ الفاتورة كمسودة', {
            description: postData.error || 'تعذر ترحيل الفاتورة. يمكنك ترحيلها لاحقاً من المستند.',
          });
          await openInvoiceDetails(saved.id);
          loadData();
          return;
        }
      }

      toast.success(isEditMode ? 'تم حفظ تعديلات الفاتورة' : 'تم حفظ الفاتورة بنجاح', {
        description: `رقم الفاتورة: ${saved.invoice_number}`,
      });
      setIsEditing(false); // Lock after successful save
      await openInvoiceDetails(saved.id);
      loadData();
    } catch (err: any) {
      setFormError(err.message);
      toast.error('تعذر حفظ الفاتورة', { description: err.message });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handlePostInvoice = async (invId: string, allowOverride = false) => {
    if (
      !allowOverride &&
      getValue('ui.confirm_before_post', true) &&
      !confirm('هل أنت متأكد من ترحيل فاتورة المبيعات هذه؟ لا يمكن التراجع بعد الترحيل.')
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/sales/invoices/${invId}/post`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ allowOverride }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error && data.error.includes('الحد الائتماني')) {
          setOverrideTargetId(invId);
          setShowOverrideConfirm(true);
        } else {
          toast.error('تعذر ترحيل الفاتورة', { description: data.error || 'فشل الترحيل' });
        }
        return;
      }

      toast.success('تم ترحيل الفاتورة بنجاح', { description: 'أُنشئ القيد المحاسبي وفق قواعد النظام.' });
      loadData();
      if (selectedInvoice && selectedInvoice.id === invId) await openInvoiceDetails(invId);
    } catch (err: any) {
      toast.error('تعذر ترحيل الفاتورة', { description: err.message });
    }
  };

  const handleVoidInvoice = async (invId: string) => {
    if (!confirm('هل أنت متأكد من إلغاء هذه الفاتورة؟ سيتم عكس القيد المحاسبي المرتبط بها تلقائياً.')) {
      return;
    }
    try {
      const res = await fetch(`/api/sales/invoices/${invId}/void`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        toast.success('تم إلغاء الفاتورة وعكس القيد');
        loadData();
        if (selectedInvoice && selectedInvoice.id === invId) await openInvoiceDetails(invId);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error('تعذر إلغاء الفاتورة', { description: data.error || 'فشل إلغاء الفاتورة' });
      }
    } catch (err: any) {
      toast.error('تعذر إلغاء الفاتورة', { description: err.message });
    }
  };

  /* ---------------------------------------------------------------- */
  /* Global Keyboard Shortcuts (F2, F3, F4, F5, F6, F10, ESC)         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.key === 'F2') {
        e.preventDefault();
        addLine();
      } else if (e.key === 'F3') {
        e.preventDefault();
        handleOpenItemLookup(activeLineIdx);
      } else if (e.key === 'F4') {
        e.preventDefault();
        removeLine(activeLineIdx);
      } else if (e.key === 'F5') {
        e.preventDefault();
        openNew();
      } else if (e.key === 'F6') {
        e.preventDefault();
        window.print();
      } else if (e.key === 'F10') {
        e.preventDefault();
        if (!isEditing) {
          setIsEditing(true);
          toast.info('تم تفعيل وضع التعديل (اضغط F10 مرة أخرى للحفظ)');
        } else {
          handleSaveInvoice(false);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeLineIdx, isEditing, workspaceMode, formLines, selectedCustomerId, paymentType, invoiceDate, dueDate, notes]);

  /* ---------------------------------------------------------------- */
  /* Filtered List for Archive view                                   */
  /* ---------------------------------------------------------------- */

  const filteredInvoices = invoices.filter((inv) => {
    const q = search.toLowerCase();
    const matchesSearch =
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.customerName.toLowerCase().includes(q) ||
      (inv.customerCode && inv.customerCode.toLowerCase().includes(q));
    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    const matchesPayment = paymentFilter === 'ALL' || inv.payment_type === paymentFilter;
    return matchesSearch && matchesStatus && matchesPayment;
  });

  const totalSalesVolume = invoices
    .filter((i) => i.status === 'POSTED')
    .reduce((sum, i) => sum + parseFloat(i.total || '0'), 0);
  const postedCount = invoices.filter((i) => i.status === 'POSTED').length;
  const draftCount = invoices.filter((i) => i.status === 'DRAFT').length;
  const totalOutstanding = invoices
    .filter((i) => i.status === 'POSTED' && i.payment_type === 'CREDIT')
    .reduce(
      (sum, i) => sum + (parseFloat(i.total || '0') - parseFloat(i.paid_amount || '0')),
      0
    );

  const isView = workspaceMode === 'view';
  const isArchiveList = workspaceMode === null;

  const displayInvoiceNumber =
    isView || workspaceMode === 'edit'
      ? selectedInvoice?.invoice_number || '0001257'
      : invoices.length > 0
      ? `000${invoices.length + 1}`
      : '0001257';

  const displayCustomerName =
    activeCustomer?.name ||
    (selectedCustomerId
      ? customers.find((c) => c.id === selectedCustomerId)?.name || 'عميل نقدي'
      : 'عميل نقدي');

  const minimumRows = 7;
  const emptyRowsCount = Math.max(0, minimumRows - formLines.length);

  // Common input styling with soft-yellow focus highlighting
  const cellInputStyle =
    'w-full text-xs font-bold transition-all px-1.5 py-1 rounded border border-transparent ' +
    'focus:bg-[#fef9c3] focus:text-slate-950 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:shadow-xs outline-none';

  return (
    <div className="flex flex-col min-h-screen bg-slate-200 text-slate-800 font-sans select-none" dir="rtl">
      {/* ---------------------------------------------------------------- */}
      {/* 1. Window Header / Application Bar                               */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-[#0b2847] text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold border-b border-blue-900/60 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-black">
            8
          </div>
          <span className="tracking-wide">v8 برو سوفت اونكس برو - الإصدار الثامن</span>
        </div>
        <div className="flex items-center gap-2 text-slate-300">
          <span className="text-[11px] font-normal text-slate-400">نظام كايان المحاسبي</span>
          <div className="flex items-center gap-1.5 mr-3">
            <button type="button" className="w-4 h-4 rounded hover:bg-white/20 flex items-center justify-center text-xs" title="تصغير">
              _
            </button>
            <button type="button" className="w-4 h-4 rounded hover:bg-white/20 flex items-center justify-center text-xs" title="تكبير">
              □
            </button>
            <button type="button" onClick={handleExit} className="w-4 h-4 rounded hover:bg-rose-600 flex items-center justify-center text-xs" title="إغلاق">
              ×
            </button>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 2. Top Navigation Ribbon Tabs                                    */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-[#e4ecf5] border-b border-slate-300 px-3 py-1 flex items-center justify-between overflow-x-auto shadow-xs">
        <div className="flex items-center gap-1">
          {/* الرئيسية */}
          <button
            type="button"
            onClick={() => {
              if (window.location) window.location.href = '/';
            }}
            className="flex flex-col items-center justify-center px-3 py-1 rounded hover:bg-white/60 transition-colors text-slate-700 group"
          >
            <Home size={18} className="text-blue-600 group-hover:scale-105 transition-transform" />
            <span className="text-[11px] font-bold mt-0.5">الرئيسية</span>
          </button>

          {/* المبيعات (Active) */}
          <button
            type="button"
            onClick={() => setWorkspaceMode('create')}
            className={`flex flex-col items-center justify-center px-4 py-1 rounded transition-all group ${
              !isArchiveList
                ? 'bg-[#c5ddf5] border border-blue-400 text-blue-950 font-black shadow-xs'
                : 'hover:bg-white/60 text-slate-700'
            }`}
          >
            <ShoppingCart size={18} className="text-blue-700 group-hover:scale-105 transition-transform" />
            <span className="text-[11px] font-bold mt-0.5">المبيعات</span>
          </button>

          {/* المشتريات */}
          <button
            type="button"
            onClick={() => {
              if (window.location) window.location.href = '/purchasing/invoices';
            }}
            className="flex flex-col items-center justify-center px-3 py-1 rounded hover:bg-white/60 transition-colors text-slate-700 group"
          >
            <Banknote size={18} className="text-emerald-700 group-hover:scale-105 transition-transform" />
            <span className="text-[11px] font-bold mt-0.5">المشتريات</span>
          </button>

          {/* المخازن */}
          <button
            type="button"
            onClick={() => {
              if (window.location) window.location.href = '/inventory/items';
            }}
            className="flex flex-col items-center justify-center px-3 py-1 rounded hover:bg-white/60 transition-colors text-slate-700 group"
          >
            <Boxes size={18} className="text-amber-700 group-hover:scale-105 transition-transform" />
            <span className="text-[11px] font-bold mt-0.5">المخازن</span>
          </button>

          {/* التقارير */}
          <button
            type="button"
            onClick={() => {
              if (window.location) window.location.href = '/reports';
            }}
            className="flex flex-col items-center justify-center px-3 py-1 rounded hover:bg-white/60 transition-colors text-slate-700 group"
          >
            <BarChart3 size={18} className="text-blue-600 group-hover:scale-105 transition-transform" />
            <span className="text-[11px] font-bold mt-0.5">التقارير</span>
          </button>

          {/* الإعدادات */}
          <button
            type="button"
            onClick={() => {
              if (window.location) window.location.href = '/settings/company';
            }}
            className="flex flex-col items-center justify-center px-3 py-1 rounded hover:bg-white/60 transition-colors text-slate-700 group"
          >
            <Settings size={18} className="text-slate-600 group-hover:scale-105 transition-transform" />
            <span className="text-[11px] font-bold mt-0.5">الإعدادات</span>
          </button>

          {/* المساعدة */}
          <button
            type="button"
            onClick={() => toast.info('اونكس برو - فواتير المبيعات: استخدم مفاتيح الاختصار F2, F3, F4, F5, F6, F10')}
            className="flex flex-col items-center justify-center px-3 py-1 rounded hover:bg-white/60 transition-colors text-slate-700 group"
          >
            <HelpCircle size={18} className="text-sky-600 group-hover:scale-105 transition-transform" />
            <span className="text-[11px] font-bold mt-0.5">المساعدة</span>
          </button>

          {/* خروج */}
          <button
            type="button"
            onClick={handleExit}
            className="flex flex-col items-center justify-center px-3 py-1 rounded hover:bg-rose-100 transition-colors text-rose-700 group"
          >
            <LogOut size={18} className="text-rose-600 group-hover:scale-105 transition-transform" />
            <span className="text-[11px] font-bold mt-0.5">خروج</span>
          </button>
        </div>

        {/* Lock/Edit Indicator + Column Settings + Toggle Archive Button */}
        <div className="flex items-center gap-2">
          {!isArchiveList && (
            <>
              {/* Column Settings Toggle Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowColumnSettings((v) => !v)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-xs"
                  title="تخصيص أعمدة الجدول (الهامش والتكلفة والكمية المجانية)"
                >
                  <SlidersHorizontal size={13} className="text-blue-600" />
                  <span>أعمدة الجدول</span>
                </button>
                {showColumnSettings && (
                  <div className="absolute left-0 mt-1 w-52 bg-white rounded-md shadow-xl border border-slate-300 p-2.5 z-40 text-xs space-y-2 text-right">
                    <div className="font-bold border-b pb-1 text-slate-800">تخصيص أعمدة الجدول:</div>
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={showCostAndProfit}
                        onChange={(e) => setShowCostAndProfit(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <span>التكلفة وهوامش الربح</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={showFreeQty}
                        onChange={(e) => setShowFreeQty(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <span>الكمية المجانية</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={showNetPrice}
                        onChange={(e) => setShowNetPrice(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <span>صافي السعر</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Status Lock/Edit Badge */}
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold border transition-colors ${
                  isEditing
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-slate-100 text-slate-600 border-slate-300'
                }`}
              >
                {isEditing ? <Unlock size={14} className="text-amber-600" /> : <Lock size={14} className="text-slate-500" />}
                <span>{isEditing ? 'وضع التحرير نشط' : 'الحقول مقفلة (للعرض فقط)'}</span>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => setWorkspaceMode(isArchiveList ? 'create' : null)}
            className={`px-3 py-1 rounded-md text-xs font-bold border transition-colors flex items-center gap-1.5 shadow-xs ${
              isArchiveList
                ? 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <FileText size={14} />
            <span>{isArchiveList ? 'العودة لشاشة الفاتورة' : `سجل وقائمة الفواتير (${invoices.length})`}</span>
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 3. Main Workspace Area                                           */}
      {/* ---------------------------------------------------------------- */}
      {isArchiveList ? (
        /* ================= ARCHIVE LIST VIEW ================= */
        <div className="p-4 flex-1 space-y-4">
          <PageHeader
            title="فواتير المبيعات"
            description="إصدار الفواتير النقدية والآجلة، الرقابة الائتمانية، والترحيل المحاسبي الآلي المباشر"
            icon={<FileText size={20} />}
            actions={
              <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
                فاتورة جديدة (F5)
              </Button>
            }
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="إجمالي المبيعات المعتمدة"
              value={totalSalesVolume.toLocaleString('en-US')}
              unit="ر.ي"
              icon={<DollarSign size={18} />}
              tone="success"
              hint="ريال يمني — فواتير مرحلة"
              pending={loading}
            />
            <KpiCard
              label="الفواتير المرحلة"
              value={postedCount.toLocaleString('en-US')}
              icon={<CheckCircle2 size={18} />}
              tone="brand"
              hint="قيود محاسبية منشأة آلياً"
              pending={loading}
            />
            <KpiCard
              label="مسودات قيد الاعتماد"
              value={draftCount.toLocaleString('en-US')}
              icon={<Clock size={18} />}
              tone="warning"
              hint="بانتظار الترحيل النهائي"
              pending={loading}
            />
            <KpiCard
              label="متبقي آجل غير مسدد"
              value={totalOutstanding.toLocaleString('en-US')}
              unit="ر.ي"
              icon={<CreditCard size={18} />}
              tone="danger"
              hint="ذمم مستحقة التحصيل"
              pending={loading}
            />
          </div>

          <PageToolbar
            search={{
              value: search,
              onValueChange: setSearch,
              placeholder: 'بحث برقم الفاتورة أو اسم العميل أو الكود...',
            }}
            end={
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="group"
                  aria-label="تصفية بحالة الفاتورة"
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
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="min-w-[170px]"
                  size="sm"
                  options={[
                    { value: 'ALL', label: 'طريقة الدفع: الكل' },
                    { value: 'CREDIT', label: 'آجل (ذمم)' },
                    { value: 'CASH', label: 'نقدي (صندوق)' },
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
                    <th className="px-4 py-3.5">رقم الفاتورة</th>
                    <th className="px-4 py-3.5">التاريخ والاستحقاق</th>
                    <th className="px-4 py-3.5">العميل</th>
                    <th className="px-4 py-3.5">نوع الدفع</th>
                    <th className="px-4 py-3.5">إجمالي الفاتورة</th>
                    <th className="px-4 py-3.5">المدفوع / المتبقي</th>
                    <th className="px-4 py-3.5">الحالة</th>
                    <th className="px-4 py-3.5">القيد المحاسبي</th>
                    <th className="px-4 py-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft font-medium text-ink">
                  {loading ? (
                    <tr>
                      <td colSpan={9}>
                        <LoadingState text="جارٍ تحميل فواتير المبيعات..." />
                      </td>
                    </tr>
                  ) : filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <EmptyState
                          icon={<FileText size={32} />}
                          title="لا توجد فواتير مطابقة"
                          description="جرّب تغيير البحث أو الفلاتر، أو أنشئ فاتورة جديدة."
                          action={
                            <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
                              فاتورة جديدة
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => {
                      const total = parseFloat(inv.total || '0');
                      const paid = parseFloat(inv.paid_amount || '0');
                      const remaining = total - paid;

                      return (
                        <tr key={inv.id} className="transition-colors hover:bg-surface-hover/60">
                          <td className="px-4 py-3.5">
                            <button
                              type="button"
                              onClick={() => openInvoiceDetails(inv.id)}
                              className="inline-flex items-center gap-1 font-mono font-bold text-brand hover:underline"
                            >
                              <span>{inv.invoice_number}</span>
                              <ExternalLink size={12} className="opacity-60" />
                            </button>
                          </td>
                          <td className="px-4 py-3.5 text-ink-muted">
                            <div className="kayan-numeric">
                              <bdi dir="ltr">{dateOnly(inv.invoice_date)}</bdi>
                            </div>
                            {inv.payment_type === 'CREDIT' && (
                              <div className="kayan-numeric text-[11px] font-normal">
                                استحقاق: <bdi dir="ltr">{dateOnly(inv.due_date)}</bdi>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-ink">{inv.customerName}</div>
                            <div className="font-mono text-[10px] text-ink-muted">
                              {inv.customerCode}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge
                              tone={inv.payment_type === 'CASH' ? 'success' : 'info'}
                              size="sm"
                            >
                              {inv.payment_type === 'CASH' ? 'نقدي' : 'آجل'}
                            </StatusBadge>
                          </td>
                          <td className="kayan-numeric px-4 py-3.5 font-bold text-ink">
                            {total.toLocaleString('en-US')}{' '}
                            <span className="text-[10px] font-normal text-ink-muted">ر.ي</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="kayan-numeric font-bold text-state-success">
                              {paid > 0 ? `${paid.toLocaleString('en-US')} ر.ي` : '—'}
                            </div>
                            {inv.payment_type === 'CREDIT' && (
                              <div
                                className={`kayan-numeric text-[11px] ${
                                  remaining > 0
                                    ? 'font-bold text-state-danger'
                                    : 'text-ink-muted'
                                }`}
                              >
                                {remaining > 0
                                  ? `متبقي: ${remaining.toLocaleString('en-US')}`
                                  : 'مسدد بالكامل'}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <DocumentStatusBadge status={inv.status} />
                          </td>
                          <td className="px-4 py-3.5">
                            {inv.journalEntryNumber ? (
                              <span className="rounded-md border border-line bg-surface-muted px-2 py-1 font-mono text-xs font-bold text-ink">
                                {inv.journalEntryNumber}
                              </span>
                            ) : (
                              <span className="text-[11px] text-ink-muted">بدون قيد (مسودة)</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-center gap-1">
                              <IconButton
                                tone="primary"
                                label="عرض الفاتورة"
                                onClick={() => openInvoiceDetails(inv.id)}
                              >
                                <Eye size={15} />
                              </IconButton>
                              {inv.status === 'DRAFT' && (
                                <>
                                  <IconButton
                                    tone="neutral"
                                    label="تعديل المسودة"
                                    onClick={() => openInvoiceForEdit(inv.id)}
                                  >
                                    <Pencil size={15} />
                                  </IconButton>
                                  <Button
                                    size="xs"
                                    variant="success"
                                    onClick={() => handlePostInvoice(inv.id, false)}
                                  >
                                    ترحيل
                                  </Button>
                                </>
                              )}
                              {inv.status === 'POSTED' && (
                                <IconButton
                                  tone="danger"
                                  label="إلغاء الفاتورة وعكس القيد"
                                  onClick={() => handleVoidInvoice(inv.id)}
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
        </div>
      ) : (
        /* ================= ONYX PRO V8 SALES INVOICE SCREEN ================= */
        <div className="flex-1 flex flex-col p-2 space-y-2">
          {/* Header Blue Banner */}
          <div className="rounded-md overflow-hidden bg-gradient-to-r from-[#0d3b66] via-[#145388] to-[#0d3b66] text-white p-3 shadow-md flex items-center justify-between border border-blue-900">
            {/* Logo on Left */}
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-t-amber-400 border-l-cyan-400 border-b-transparent border-r-transparent transform -rotate-45" />
                <div className="absolute inset-1.5 rounded-full border-2 border-t-transparent border-l-transparent border-b-amber-300 border-r-cyan-300 transform rotate-12" />
                <div className="w-2 h-2 rounded-full bg-cyan-300 shadow-sm" />
              </div>
              <div>
                <div className="text-base font-black tracking-wide leading-tight flex items-center gap-1.5">
                  <span className="text-white">Yemen Soft</span>
                </div>
                <div className="text-xs font-bold text-amber-300 tracking-wider">
                  Onyx Pro v8
                </div>
              </div>
            </div>

            {/* Central Title */}
            <div className="text-center">
              <h1 className="text-2xl font-black tracking-wide text-white drop-shadow-sm">
                فاتورة مبيعات
              </h1>
              <p className="text-xs font-bold text-sky-200 mt-0.5 tracking-wider">
                — بيع نقدي / آجل —
              </p>
              {isView && selectedInvoice && (
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-white/20 text-white">
                    الحالة: {selectedInvoice.status === 'POSTED' ? 'مرحلة' : selectedInvoice.status === 'DRAFT' ? 'مسودة' : 'ملغاة'}
                  </span>
                  {selectedInvoice.journalEntryNumber && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-900/60 text-cyan-200 border border-blue-400/40">
                      قيد: {selectedInvoice.journalEntryNumber}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Date & Time Box on Right */}
            <div className="bg-white/10 backdrop-blur-xs border border-white/30 rounded-lg px-3 py-1.5 text-xs text-white shadow-inner flex flex-col justify-center min-w-[170px]">
              <div className="flex items-center justify-between gap-2 border-b border-white/20 pb-1">
                <span className="font-bold text-sky-200 flex items-center gap-1">
                  <span className="text-sky-300">التاريخ :</span>
                </span>
                <div className="flex items-center gap-1 font-mono font-bold">
                  <span>{invoiceDate.replace(/-/g, '/')}</span>
                  <DatePicker
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="opacity-0 w-0 h-0 p-0 absolute pointer-events-none"
                  />
                  <FileText size={13} className="text-sky-300" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 font-mono font-bold">
                <span className="text-sky-300 text-[11px]">الوقت :</span>
                <div className="flex items-center gap-1">
                  <span>{currentTimeStr || '04:17:32 PM'}</span>
                  <Clock size={13} className="text-sky-300" />
                </div>
              </div>
            </div>
          </div>

          {/* Form Error Banner if any */}
          {formError && (
            <div className="bg-rose-50 border border-rose-300 rounded-md p-2 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Header Form Fields Panel                                         */}
          {/* ---------------------------------------------------------------- */}
          <div className="bg-white border border-slate-300 rounded-md p-3 shadow-xs space-y-2.5 text-xs relative">
            {/* Row 1: رقم الفاتورة | العميل | طريقة الدفع */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* رقم الفاتورة */}
              <div className="md:col-span-3 flex items-center gap-2">
                <label className="w-24 shrink-0 font-bold text-slate-700 flex items-center gap-1">
                  <FileText size={15} className="text-blue-600" />
                  <span>رقم الفاتورة :</span>
                </label>
                <div className="flex-1 flex items-center bg-[#dbeafe] border border-[#93c5fd] rounded px-2.5 py-1 text-blue-900 font-mono font-black text-sm shadow-inner">
                  <span className="flex-1">{displayInvoiceNumber}</span>
                  <FileText size={14} className="text-blue-500 opacity-60" />
                </div>
              </div>

              {/* العميل */}
              <div className="md:col-span-6 flex items-center gap-2">
                <label className="w-16 shrink-0 font-bold text-slate-700 flex items-center gap-1">
                  <User size={15} className="text-blue-600" />
                  <span>العميل :</span>
                </label>
                <div className="flex-1 flex items-center gap-1">
                  <div className="flex-1 relative flex items-center">
                    <input
                      type="text"
                      readOnly
                      tabIndex={1}
                      disabled={!isEditing}
                      value={displayCustomerName}
                      onClick={isEditing ? handleOpenCustomerLookup : undefined}
                      className={`w-full border rounded px-2.5 py-1 text-slate-900 font-bold text-xs transition-colors ${
                        isEditing
                          ? 'bg-white border-slate-300 hover:border-blue-400 focus:bg-[#fef9c3] focus:border-amber-500 cursor-pointer'
                          : 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                      }`}
                    />
                    <User size={14} className="absolute left-2.5 text-blue-600 pointer-events-none" />
                  </div>
                  <button
                    type="button"
                    tabIndex={2}
                    disabled={!isEditing}
                    onClick={handleOpenCustomerLookup}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-slate-100 hover:bg-blue-50 text-slate-700 font-black text-xs transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="استعلام وبحث عن عميل (F9)"
                  >
                    ...
                  </button>
                </div>
              </div>

              {/* طريقة الدفع */}
              <div className="md:col-span-3 flex items-center gap-2">
                <label className="w-24 shrink-0 font-bold text-slate-700 flex items-center gap-1">
                  <Banknote size={15} className="text-emerald-600" />
                  <span>طريقة الدفع :</span>
                </label>
                <div className="flex-1 relative">
                  <select
                    tabIndex={3}
                    value={paymentType}
                    disabled={!isEditing}
                    onChange={(e) => setPaymentType(e.target.value as 'CASH' | 'CREDIT')}
                    className={`w-full border rounded px-2.5 py-1 text-slate-900 font-bold text-xs appearance-none pr-7 pl-6 focus:outline-none transition-colors ${
                      isEditing
                        ? 'bg-white border-slate-300 focus:bg-[#fef9c3] focus:border-amber-500 cursor-pointer'
                        : 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <option value="CASH">نقداً</option>
                    <option value="CREDIT">آجل</option>
                  </select>
                  <Banknote size={14} className="absolute right-2 top-1.5 text-emerald-600 pointer-events-none" />
                  <span className="absolute left-2 top-1.5 text-slate-400 pointer-events-none text-[10px]">▼</span>
                </div>
              </div>
            </div>

            {/* Row 2: نوع الفاتورة | المندوب | المستودع */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* نوع الفاتورة */}
              <div className="md:col-span-3 flex items-center gap-2">
                <label className="w-24 shrink-0 font-bold text-slate-700 flex items-center gap-1">
                  <ShoppingCart size={15} className="text-blue-600" />
                  <span>نوع الفاتورة :</span>
                </label>
                <div className="flex-1 relative">
                  <select
                    tabIndex={4}
                    value={invoiceType}
                    disabled={!isEditing}
                    onChange={(e) => setInvoiceType(e.target.value)}
                    className={`w-full border rounded px-2.5 py-1 text-slate-900 font-bold text-xs appearance-none pr-7 pl-6 focus:outline-none transition-colors ${
                      isEditing
                        ? 'bg-white border-slate-300 focus:bg-[#fef9c3] focus:border-amber-500 cursor-pointer'
                        : 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <option value="مبيعات">مبيعات</option>
                    <option value="مردود">مردود مبيعات</option>
                  </select>
                  <ShoppingCart size={14} className="absolute right-2 top-1.5 text-blue-600 pointer-events-none" />
                  <span className="absolute left-2 top-1.5 text-slate-400 pointer-events-none text-[10px]">▼</span>
                </div>
              </div>

              {/* المندوب */}
              <div className="md:col-span-5 flex items-center gap-2">
                <label className="w-16 shrink-0 font-bold text-slate-700 flex items-center gap-1">
                  <User size={15} className="text-blue-600" />
                  <span>المندوب :</span>
                </label>
                <div className="flex-1 relative">
                  <input
                    type="text"
                    tabIndex={5}
                    disabled={!isEditing}
                    value={salesRep}
                    onChange={(e) => setSalesRep(e.target.value)}
                    className={`w-full border rounded px-2.5 py-1 text-slate-900 font-bold text-xs pl-7 pr-2.5 focus:outline-none transition-colors ${
                      isEditing
                        ? 'bg-white border-slate-300 focus:bg-[#fef9c3] focus:border-amber-500'
                        : 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                    }`}
                    placeholder="اسم المندوب أو البائع"
                  />
                  <User size={14} className="absolute left-2.5 top-1.5 text-blue-600 pointer-events-none" />
                </div>
              </div>

              {/* المستودع */}
              <div className="md:col-span-4 flex items-center gap-2">
                <label className="w-20 shrink-0 font-bold text-slate-700 flex items-center gap-1">
                  <Boxes size={15} className="text-amber-600" />
                  <span>المستودع :</span>
                </label>
                <div className="flex-1 relative">
                  <select
                    tabIndex={6}
                    value={selectedWarehouseId}
                    disabled={!isEditing}
                    onChange={(e) => {
                      const newWh = e.target.value;
                      setSelectedWarehouseId(newWh);
                      setFormLines((prev) => prev.map((l) => ({ ...l, warehouseId: newWh })));
                    }}
                    className={`w-full border rounded px-2.5 py-1 text-slate-900 font-bold text-xs appearance-none pr-7 pl-6 focus:outline-none transition-colors ${
                      isEditing
                        ? 'bg-white border-slate-300 focus:bg-[#fef9c3] focus:border-amber-500 cursor-pointer'
                        : 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                    {warehouses.length === 0 && <option value="">المستودع الافتراضي</option>}
                  </select>
                  <Boxes size={14} className="absolute right-2 top-1.5 text-amber-600 pointer-events-none" />
                  <span className="absolute left-2 top-1.5 text-slate-400 pointer-events-none text-[10px]">▼</span>
                </div>
              </div>
            </div>

            {/* Row 3: ملاحظات */}
            <div className="flex items-center gap-2">
              <label className="w-24 shrink-0 font-bold text-slate-700 flex items-center gap-1">
                <FileText size={15} className="text-blue-600" />
                <span>ملاحظات :</span>
              </label>
              <input
                type="text"
                tabIndex={7}
                disabled={!isEditing}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أدخل أي ملاحظات خاصة بالفاتورة..."
                className={`flex-1 border rounded px-2.5 py-1 text-slate-800 text-xs focus:outline-none transition-colors ${
                  isEditing
                    ? 'bg-white border-slate-300 focus:bg-[#fef9c3] focus:border-amber-500'
                    : 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                }`}
              />
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* 4. Items Table (جدول الأصناف المطور مطابق لصورة أونكس برو تماماً) */}
          {/* ---------------------------------------------------------------- */}
          <div className="flex-1 bg-white border border-slate-300 rounded-md shadow-xs overflow-hidden flex flex-col min-h-[280px]">
            <div className="overflow-x-auto flex-1">
              <table className="w-full min-w-[1250px] text-right border-collapse text-xs">
                <thead>
                  {/* Pale pinkish-rose header like real Onyx Pro */}
                  <tr className="bg-[#fce7f3] text-slate-800 font-bold select-none border-b border-slate-300 text-[11px]">
                    <th className="w-8 py-2 px-1 text-center border-l border-slate-300 font-black">..</th>
                    <th className="w-10 py-2 px-1 text-center border-l border-slate-300 font-black">م</th>
                    <th className="w-32 py-2 px-2 text-center border-l border-slate-300 text-blue-900 font-black">
                      رقم الصنف
                    </th>
                    <th className="min-w-[200px] py-2 px-3 border-l border-slate-300 text-blue-900 font-black">
                      اسم الصنف
                    </th>
                    <th className="w-20 py-2 px-2 text-center border-l border-slate-300">الوحدة</th>
                    <th className="w-24 py-2 px-2 text-center border-l border-slate-300">المخزن</th>
                    <th className="w-20 py-2 px-2 text-center border-l border-slate-300 text-blue-900 font-black">
                      الكمية
                    </th>
                    {showFreeQty && (
                      <th className="w-20 py-2 px-2 text-center border-l border-slate-300">ك. المجانية</th>
                    )}
                    {showCostAndProfit && (
                      <th className="w-24 py-2 px-2 text-center border-l border-slate-300">التكلفة</th>
                    )}
                    <th className="w-24 py-2 px-2 text-center border-l border-slate-300 text-blue-900 font-black">
                      السعر
                    </th>
                    {showCostAndProfit && (
                      <>
                        <th className="w-24 py-2 px-2 text-center border-l border-slate-300">هامش الربح</th>
                        <th className="w-24 py-2 px-2 text-center border-l border-slate-300">نسبة هامش الربح</th>
                      </>
                    )}
                    <th className="w-28 py-2 px-2 text-center border-l border-slate-300">الإجمالي</th>
                    {showCostAndProfit && (
                      <th className="w-28 py-2 px-2 text-center border-l border-slate-300">إجمالي هامش الربح</th>
                    )}
                    {showNetPrice && (
                      <th className="w-28 py-2 px-2 text-center">صافي السعر</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {formLines.map((line, idx) => {
                    const isSelected = activeLineIdx === idx;
                    const qty = Number(line.quantity) || 0;
                    const price = Number(line.unit_price) || 0;
                    const cost = Number(line.cost) || 0;
                    const margin = price - cost;
                    const marginPercent = price > 0 ? ((margin / price) * 100).toFixed(2) : '0.00';
                    const lineTotal = qty * price;
                    const totalMargin = qty * margin;
                    const netPrice = line.net_price !== undefined ? line.net_price : lineTotal;

                    // Base tab index per row
                    const baseTab = 10 + idx * 10;

                    return (
                      <tr
                        key={line.id || idx}
                        onClick={() => setActiveLineIdx(idx)}
                        className={`transition-colors cursor-pointer ${
                          isSelected ? 'bg-blue-50/70 font-medium' : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* .. (Lookup Action Button) */}
                        <td className="py-1 px-1 text-center border-l border-slate-200">
                          <button
                            type="button"
                            tabIndex={-1}
                            disabled={!isEditing}
                            onClick={() => handleOpenItemLookup(idx)}
                            className="w-5 h-5 rounded flex items-center justify-center text-[10px] bg-slate-100 hover:bg-blue-200 text-slate-700 font-black border border-slate-300 mx-auto disabled:opacity-40"
                            title="استعلام عن الصنف (F3)"
                          >
                            ..
                          </button>
                        </td>

                        {/* م (Index) */}
                        <td className="py-1 px-1 text-center border-l border-slate-200 font-mono font-bold text-slate-700">
                          {idx + 1}
                        </td>

                        {/* رقم الصنف (Circled in red in reference - User input / lookup) */}
                        <td className="py-1 px-2 border-l border-slate-200">
                          {!isEditing ? (
                            <span className="font-mono text-slate-800 font-bold block text-center">
                              {line.item_code || '—'}
                            </span>
                          ) : (
                            <input
                              type="text"
                              tabIndex={baseTab + 1}
                              value={line.item_code || ''}
                              placeholder="رقم الصنف"
                              onChange={(e) => updateLine(idx, 'item_code', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'F3' || e.key === 'F9') {
                                  e.preventDefault();
                                  handleOpenItemLookup(idx);
                                }
                              }}
                              className={`${cellInputStyle} font-mono text-center`}
                            />
                          )}
                        </td>

                        {/* اسم الصنف (Circled in red in reference - Cyan active highlight) */}
                        <td
                          className={`py-1 px-2 border-l border-slate-200 ${
                            isSelected ? 'bg-[#cffafe]' : ''
                          }`}
                        >
                          {!isEditing ? (
                            <span className="font-bold text-blue-900 block truncate">
                              {line.description || '—'}
                            </span>
                          ) : (
                            <input
                              type="text"
                              tabIndex={baseTab + 2}
                              value={line.description}
                              placeholder="اكتب اسم الصنف أو F3 للبحث..."
                              onChange={(e) => updateLine(idx, 'description', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'F3' || e.key === 'F9') {
                                  e.preventDefault();
                                  handleOpenItemLookup(idx);
                                }
                              }}
                              className={`${cellInputStyle} text-blue-900 font-bold`}
                            />
                          )}
                        </td>

                        {/* الوحدة (Circled in red in reference - User input) */}
                        <td className="py-1 px-2 text-center border-l border-slate-200">
                          {!isEditing ? (
                            <span className="text-slate-800">{line.unit || 'باكت'}</span>
                          ) : (
                            <input
                              type="text"
                              tabIndex={baseTab + 3}
                              value={line.unit || 'باكت'}
                              onChange={(e) => updateLine(idx, 'unit', e.target.value)}
                              className={`${cellInputStyle} text-center`}
                            />
                          )}
                        </td>

                        {/* المخزن (Circled in red in reference - User input) */}
                        <td className="py-1 px-2 text-center border-l border-slate-200">
                          {!isEditing ? (
                            <span className="text-slate-800 text-xs">
                              {warehouses.find((w) => w.id === (line.warehouseId || selectedWarehouseId))?.name || '1'}
                            </span>
                          ) : (
                            <select
                              tabIndex={baseTab + 4}
                              value={line.warehouseId || selectedWarehouseId}
                              onChange={(e) => updateLine(idx, 'warehouseId', e.target.value)}
                              className={`${cellInputStyle} text-center py-0.5 text-xs bg-transparent`}
                            >
                              {warehouses.map((w, wIdx) => (
                                <option key={w.id} value={w.id}>
                                  {wIdx + 1} - {w.name}
                                </option>
                              ))}
                              {warehouses.length === 0 && <option value="">1</option>}
                            </select>
                          )}
                        </td>

                        {/* الكمية (Circled in red in reference - User input) */}
                        <td className="py-1 px-1 text-center border-l border-slate-200">
                          {!isEditing ? (
                            <span className="font-mono font-bold text-slate-900">{line.quantity}</span>
                          ) : (
                            <input
                              type="number"
                              tabIndex={baseTab + 5}
                              min="0.01"
                              step="any"
                              value={line.quantity}
                              onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                              className={`${cellInputStyle} text-center font-mono font-bold`}
                            />
                          )}
                        </td>

                        {/* ك. المجانية (Free Quantity) */}
                        {showFreeQty && (
                          <td className="py-1 px-1 text-center border-l border-slate-200">
                            {!isEditing ? (
                              <span className="font-mono text-slate-500">{line.free_quantity || 0}</span>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                value={line.free_quantity || 0}
                                onChange={(e) => updateLine(idx, 'free_quantity', Number(e.target.value) || 0)}
                                className={`${cellInputStyle} text-center font-mono`}
                              />
                            )}
                          </td>
                        )}

                        {/* التكلفة (Cost - Auto calculated) */}
                        {showCostAndProfit && (
                          <td className="py-1 px-2 text-center border-l border-slate-200 font-mono text-slate-700 bg-slate-50/50">
                            {money(cost)}
                          </td>
                        )}

                        {/* السعر (Circled in red in reference - User input) */}
                        <td className="py-1 px-2 text-center border-l border-slate-200">
                          {!isEditing ? (
                            <span className="font-mono font-bold text-slate-900">{money(line.unit_price)}</span>
                          ) : (
                            <input
                              type="number"
                              tabIndex={baseTab + 6}
                              min="0"
                              step="any"
                              value={line.unit_price}
                              onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (idx === formLines.length - 1) {
                                    addLine();
                                  } else {
                                    setActiveLineIdx(idx + 1);
                                  }
                                }
                              }}
                              className={`${cellInputStyle} text-center font-mono font-bold text-blue-900`}
                            />
                          )}
                        </td>

                        {/* هامش الربح (Profit Margin) */}
                        {showCostAndProfit && (
                          <td
                            className={`py-1 px-2 text-center border-l border-slate-200 font-mono font-bold ${
                              margin >= 0 ? 'text-emerald-700 bg-emerald-50/30' : 'text-rose-600 bg-rose-50/30'
                            }`}
                          >
                            {money(margin)}
                          </td>
                        )}

                        {/* نسبة هامش الربح (% Profit Margin) */}
                        {showCostAndProfit && (
                          <td
                            className={`py-1 px-2 text-center border-l border-slate-200 font-mono text-xs ${
                              margin >= 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {marginPercent}%
                          </td>
                        )}

                        {/* الإجمالي (Total) */}
                        <td className="py-1 px-2 text-center border-l border-slate-200 font-mono font-bold text-slate-900">
                          {money(lineTotal)}
                        </td>

                        {/* إجمالي هامش الربح (Total Margin) */}
                        {showCostAndProfit && (
                          <td
                            className={`py-1 px-2 text-center border-l border-slate-200 font-mono font-bold ${
                              totalMargin >= 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {money(totalMargin)}
                          </td>
                        )}

                        {/* صافي السعر (Net Price) */}
                        {showNetPrice && (
                          <td className="py-1 px-2 text-center font-mono font-black text-slate-900 bg-slate-50/60">
                            {money(netPrice)}
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {/* Active asterisk row indicator */}
                  <tr className="bg-[#eff6ff] text-slate-500 font-bold border-t border-slate-200">
                    <td className="py-1 px-1 text-center border-l border-slate-200">..</td>
                    <td className="py-1 px-1 text-center border-l border-slate-200 font-mono font-black text-blue-700">*</td>
                    <td className="py-1 px-2 border-l border-slate-200" />
                    <td className="py-1 px-3 border-l border-slate-200 text-[11px] text-slate-400 font-normal">
                      {isEditing ? 'اضغط Enter بعد السعر لإضافة صنف جديد مباشرة' : 'انقر على إضافة صنف أو جديد لإدخال بيانات'}
                    </td>
                    <td className="py-1 px-2 border-l border-slate-200" />
                    <td className="py-1 px-2 border-l border-slate-200" />
                    <td className="py-1 px-2 border-l border-slate-200" />
                    {showFreeQty && <td className="py-1 px-2 border-l border-slate-200" />}
                    {showCostAndProfit && <td className="py-1 px-2 border-l border-slate-200" />}
                    <td className="py-1 px-2 border-l border-slate-200" />
                    {showCostAndProfit && (
                      <>
                        <td className="py-1 px-2 border-l border-slate-200" />
                        <td className="py-1 px-2 border-l border-slate-200" />
                      </>
                    )}
                    <td className="py-1 px-2 border-l border-slate-200" />
                    {showCostAndProfit && <td className="py-1 px-2 border-l border-slate-200" />}
                    {showNetPrice && <td className="py-1 px-2" />}
                  </tr>

                  {/* Empty rows to give that true accounting software feel */}
                  {Array.from({ length: emptyRowsCount }).map((_, i) => (
                    <tr key={`empty-${i}`} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-1 text-center border-l border-slate-200 text-slate-300">..</td>
                      <td className="py-2.5 px-1 text-center border-l border-slate-200 text-slate-300 font-mono">
                        {formLines.length + 1 + i}
                      </td>
                      <td className="py-2.5 px-2 border-l border-slate-200" />
                      <td className="py-2.5 px-3 border-l border-slate-200" />
                      <td className="py-2.5 px-2 border-l border-slate-200" />
                      <td className="py-2.5 px-2 border-l border-slate-200" />
                      <td className="py-2.5 px-2 border-l border-slate-200" />
                      {showFreeQty && <td className="py-2.5 px-2 border-l border-slate-200" />}
                      {showCostAndProfit && <td className="py-2.5 px-2 border-l border-slate-200" />}
                      <td className="py-2.5 px-2 border-l border-slate-200" />
                      {showCostAndProfit && (
                        <>
                          <td className="py-2.5 px-2 border-l border-slate-200" />
                          <td className="py-2.5 px-2 border-l border-slate-200" />
                        </>
                      )}
                      <td className="py-2.5 px-2 border-l border-slate-200" />
                      {showCostAndProfit && <td className="py-2.5 px-2 border-l border-slate-200" />}
                      {showNetPrice && <td className="py-2.5 px-2" />}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* 5. Summary Section (أسفل الجدول)                                  */}
          {/* ---------------------------------------------------------------- */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
            {/* Totals Table on Left (Col 1-5) */}
            <div className="md:col-span-5 bg-white border border-[#93c5fd] rounded-md overflow-hidden shadow-xs flex flex-col justify-between text-xs">
              <div className="divide-y divide-slate-200">
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="font-bold text-slate-700">المجموع الفرعي :</span>
                  <span className="font-mono font-black text-sm text-slate-900">
                    {money(isView ? selectedInvoice?.subtotal : subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="font-bold text-slate-700">الخصم :</span>
                  <span className="font-mono font-bold text-rose-600">
                    {money(isView ? selectedInvoice?.discount : totalDiscount)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="font-bold text-slate-700">الضريبة (15%) :</span>
                  <span className="font-mono font-bold text-slate-800">
                    {money(isView ? selectedInvoice?.tax : totalTax)}
                  </span>
                </div>
              </div>

              {/* Total Blue Card */}
              <div className="bg-[#0b3864] text-white px-4 py-2.5 flex items-center justify-between border-t border-blue-900">
                <span className="font-black text-sm tracking-wide">الإجمالي الكلي :</span>
                <span className="font-mono font-black text-xl text-[#fbbf24] drop-shadow-xs">
                  {money(isView ? selectedInvoice?.total : netTotal)}
                </span>
              </div>
            </div>

            {/* Shopping Cart Call-To-Action Box on Right (Col 6-12) */}
            <div className="md:col-span-7 bg-[#eaf3fc] border border-[#b9d5f3] rounded-md p-4 flex flex-col items-center justify-center text-center shadow-xs">
              <div className="text-blue-400 mb-1">
                <ShoppingCart size={54} strokeWidth={1.5} className="text-blue-500/70" />
              </div>
              <p className="text-sm font-black text-blue-900 tracking-wide">
                أضف الأصناف من خلال البحث أو الباركود
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenItemLookup(activeLineIdx)}
                  className="px-2.5 py-1 bg-white border border-blue-300 rounded text-xs font-bold text-blue-800 hover:bg-blue-50 transition-colors shadow-xs"
                >
                  F3 بحث عن صنف
                </button>
                <button
                  type="button"
                  onClick={() => setShowBarcodeDialog(true)}
                  className="px-2.5 py-1 bg-white border border-blue-300 rounded text-xs font-bold text-blue-800 hover:bg-blue-50 transition-colors shadow-xs"
                >
                  قراءة باركود
                </button>
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* 6. Action Buttons Bar (شريط الأزرار السفلي بنفس الترتيب والشكل) */}
          {/* ---------------------------------------------------------------- */}
          <div className="bg-[#e2ebf4] border border-slate-300 rounded-md p-2 shadow-xs">
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {/* 1. قراءة باركود */}
              <button
                type="button"
                onClick={() => setShowBarcodeDialog(true)}
                className="flex flex-col items-center justify-center p-2 rounded-lg border border-slate-300 bg-gradient-to-b from-white to-slate-100 hover:from-white hover:to-blue-50 hover:border-blue-400 active:scale-95 shadow-sm transition-all text-slate-800 group"
              >
                <div className="mb-1 text-slate-700 group-hover:scale-110 transition-transform">
                  <BarcodeGunIcon className="w-7 h-7 text-slate-800" />
                </div>
                <span className="text-xs font-black text-slate-800 leading-tight">قراءة باركود</span>
              </button>

              {/* 2. بحث عن صنف (F3) */}
              <button
                type="button"
                onClick={() => handleOpenItemLookup(activeLineIdx)}
                className="flex flex-col items-center justify-center p-2 rounded-lg border border-slate-300 bg-gradient-to-b from-white to-slate-100 hover:from-white hover:to-blue-50 hover:border-blue-400 active:scale-95 shadow-sm transition-all text-slate-800 group"
              >
                <div className="mb-1 text-sky-600 group-hover:scale-110 transition-transform">
                  <Search size={28} strokeWidth={2.5} />
                </div>
                <span className="text-xs font-black text-slate-800 leading-tight">بحث عن صنف</span>
                <span className="text-[11px] font-bold text-slate-500 mt-0.5">(F3)</span>
              </button>

              {/* 3. إضافة صنف (F2) */}
              <button
                type="button"
                onClick={addLine}
                className="flex flex-col items-center justify-center p-2 rounded-lg border border-slate-300 bg-gradient-to-b from-white to-slate-100 hover:from-white hover:to-emerald-50 hover:border-emerald-400 active:scale-95 shadow-sm transition-all text-slate-800 group"
              >
                <div className="mb-1 text-emerald-600 group-hover:scale-110 transition-transform">
                  <PlusCircle size={28} strokeWidth={2.5} />
                </div>
                <span className="text-xs font-black text-slate-800 leading-tight">إضافة صنف</span>
                <span className="text-[11px] font-bold text-slate-500 mt-0.5">(F2)</span>
              </button>

              {/* 4. حذف صنف (F4) */}
              <button
                type="button"
                disabled={formLines.length <= 1}
                onClick={() => removeLine(activeLineIdx)}
                className="flex flex-col items-center justify-center p-2 rounded-lg border border-slate-300 bg-gradient-to-b from-white to-slate-100 hover:from-white hover:to-rose-50 hover:border-rose-400 active:scale-95 shadow-sm transition-all text-slate-800 group disabled:opacity-40"
              >
                <div className="mb-1 text-rose-500 group-hover:scale-110 transition-transform">
                  <Trash2 size={28} strokeWidth={2.2} />
                </div>
                <span className="text-xs font-black text-slate-800 leading-tight">حذف صنف</span>
                <span className="text-[11px] font-bold text-slate-500 mt-0.5">(F4)</span>
              </button>

              {/* 5. جديد (F5) */}
              <button
                type="button"
                onClick={openNew}
                className="flex flex-col items-center justify-center p-2 rounded-lg border border-slate-300 bg-gradient-to-b from-white to-slate-100 hover:from-white hover:to-blue-50 hover:border-blue-400 active:scale-95 shadow-sm transition-all text-slate-800 group"
              >
                <div className="mb-1 text-blue-600 group-hover:scale-110 transition-transform">
                  <FilePlus size={28} strokeWidth={2.2} />
                </div>
                <span className="text-xs font-black text-slate-800 leading-tight">جديد</span>
                <span className="text-[11px] font-bold text-slate-500 mt-0.5">(F5)</span>
              </button>

              {/* 6. طباعة (F6) */}
              <button
                type="button"
                onClick={() => window.print()}
                className="flex flex-col items-center justify-center p-2 rounded-lg border border-slate-300 bg-gradient-to-b from-white to-slate-100 hover:from-white hover:to-blue-50 hover:border-blue-400 active:scale-95 shadow-sm transition-all text-slate-800 group"
              >
                <div className="mb-1 text-blue-600 group-hover:scale-110 transition-transform">
                  <Printer size={28} strokeWidth={2.2} />
                </div>
                <span className="text-xs font-black text-slate-800 leading-tight">طباعة</span>
                <span className="text-[11px] font-bold text-slate-500 mt-0.5">(F6)</span>
              </button>

              {/* 7. حفظ / تعديل (F10) */}
              <button
                type="button"
                disabled={formSubmitting}
                onClick={() => {
                  if (!isEditing) {
                    setIsEditing(true);
                    toast.info('تم تفعيل وضع التعديل (اضغط F10 مرة أخرى للحفظ)');
                  } else {
                    handleSaveInvoice(false);
                  }
                }}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all text-slate-800 group shadow-sm active:scale-95 ${
                  isEditing
                    ? 'border-blue-500 bg-gradient-to-b from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200'
                    : 'border-slate-300 bg-gradient-to-b from-white to-slate-100 hover:from-white hover:to-blue-50'
                }`}
              >
                <div className="mb-1 text-blue-600 group-hover:scale-110 transition-transform">
                  {isEditing ? <Save size={28} strokeWidth={2.2} /> : <Pencil size={28} strokeWidth={2.2} />}
                </div>
                <span className="text-xs font-black text-slate-800 leading-tight">
                  {isEditing ? 'حفظ' : 'تعديل'}
                </span>
                <span className="text-[11px] font-bold text-slate-500 mt-0.5">(F10)</span>
              </button>

              {/* 8. إلغاء (ESC) */}
              <button
                type="button"
                onClick={handleExit}
                className="flex flex-col items-center justify-center p-2 rounded-lg border border-slate-300 bg-gradient-to-b from-white to-slate-100 hover:from-white hover:to-rose-50 hover:border-rose-400 active:scale-95 shadow-sm transition-all text-slate-800 group"
              >
                <div className="mb-1 text-rose-600 group-hover:scale-110 transition-transform">
                  <XCircle size={28} strokeWidth={2.2} />
                </div>
                <span className="text-xs font-black text-slate-800 leading-tight">إلغاء</span>
                <span className="text-[11px] font-bold text-slate-500 mt-0.5">(ESC)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 7. Bottom Status Bar (شريط الحالة السفلي)                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-[#0b2847] text-white px-3 py-1 flex items-center justify-between text-xs font-bold border-t border-blue-900 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-full border border-cyan-400 border-t-transparent animate-spin-slow" />
          <span className="text-sky-200">
            {company?.legalNameAr || company?.nameAr || 'شركة يمن سوفت للبرمجيات'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-emerald-400">
          <CheckCircle2 size={14} className="text-emerald-400" />
          <span>جاهز ...</span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-300 font-mono">
          <Database size={13} className="text-blue-400" />
          <span className="text-slate-300">قاعدة البيانات :</span>
          <span className="text-emerald-300 font-bold">محلية</span>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Modals & Dialogs                                                 */}
      {/* ---------------------------------------------------------------- */}

      {/* Barcode Scanner Modal */}
      {showBarcodeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-lg border border-slate-300 p-5 shadow-xl text-right space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <ScanBarcode size={20} className="text-blue-600" />
                <span>قراءة الباركود</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowBarcodeDialog(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              قم بمسح الباركود باستخدام القارئ أو أدخل الكود يدوياً:
            </p>
            <input
              type="text"
              autoFocus
              value={barcodeInputVal}
              onChange={(e) => setBarcodeInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleBarcodeLookup(barcodeInputVal);
                }
              }}
              placeholder="امسح أو اكتب الباركود واضغط Enter..."
              className="w-full border border-blue-400 rounded px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowBarcodeDialog(false)}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleBarcodeLookup(barcodeInputVal)}
              >
                إدراج الصنف
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Limit Override Modal */}
      {showOverrideConfirm && overrideTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md space-y-4 rounded-dialog border border-line bg-surface p-6 text-right shadow-k-lg">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-control bg-state-warning-soft text-state-warning">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-center text-base font-bold text-ink">
              تجاوز الحد الائتماني للعميل
            </h3>
            <p className="text-center text-xs leading-relaxed text-ink-muted">
              قيمة هذه الفاتورة بالإضافة إلى الرصيد الحالي تتجاوز السقف الائتماني المسموح به
              لهذا العميل. هل ترغب بتأكيد الصلاحية وترحيل الفاتورة مع توثيق التجاوز في سجل
              التدقيق؟
            </p>
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setShowOverrideConfirm(false);
                  setOverrideTargetId(null);
                }}
              >
                إلغاء
              </Button>
              <Button
                variant="warning"
                className="flex-1"
                onClick={() => {
                  const target = overrideTargetId;
                  setShowOverrideConfirm(false);
                  setOverrideTargetId(null);
                  if (target) handlePostInvoice(target, true);
                }}
              >
                تأكيد التجاوز والترحيل
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Print Container for window.print() */}
      <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:z-[9999]">
        {selectedInvoice ? (
          <SalesInvoicePrint invoice={selectedInvoice} company={company} />
        ) : (
          <SalesInvoicePrint
            invoice={{
              id: 'temp',
              invoice_number: displayInvoiceNumber,
              customer_id: selectedCustomerId,
              customerName: displayCustomerName,
              customerCode: activeCustomer?.code || 'CUST-001',
              customerPhone: '',
              customerAddress: '',
              payment_type: paymentType,
              invoice_date: invoiceDate,
              due_date: dueDate,
              subtotal: String(subtotal),
              discount: String(totalDiscount),
              tax: String(totalTax),
              total: String(netTotal),
              paid_amount: '0',
              status: 'DRAFT',
              notes,
              created_at: new Date().toISOString(),
              lines: formLines,
            }}
            company={company}
          />
        )}
      </div>
    </div>
  );
};

export default SalesInvoicesPage;
