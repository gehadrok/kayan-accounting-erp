import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock,
  Database,
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
  RotateCcw,
  Save,
  ScanBarcode,
  Search,
  Settings,
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
  type DocumentStatus,
} from '../components/documents';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface SalesReturnLine {
  itemId?: string;
  itemCode: string;
  description: string;
  unit?: string;
  warehouseId?: string;
  warehouseName?: string;
  quantity: number;
  free_quantity?: number;
  cost?: number;
  unitPrice: number;
  margin?: number;
  margin_percent?: number;
  line_total?: number;
  total_margin?: number;
  net_price?: number;
  tax: number;
}

interface SavedSalesReturnLine {
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

interface SalesReturn {
  id: string;
  return_number: string;
  customerName: string;
  customerCode: string;
  customerPhone?: string;
  customerAddress?: string;
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
  lines?: SavedSalesReturnLine[];
}

interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

interface SalesInvoiceOption {
  id: string;
  invoice_number: string;
  customer_id: string;
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

const SESSION_TOKEN_KEY = 'kayan_session_token';

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token =
    typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_TOKEN_KEY) : null;
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

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

const emptyLine = (): SalesReturnLine => ({
  itemCode: '',
  description: '',
  unit: '',
  warehouseId: '',
  quantity: 1,
  free_quantity: 0,
  cost: 0,
  unitPrice: 0,
  tax: 0,
});

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

const SalesReturnPrint: React.FC<{
  ret: SalesReturn;
  company: CompanyIdentity | null;
}> = ({ ret, company }) => {
  const subtotal = parseFloat(ret.subtotal || '0');
  const tax = parseFloat(ret.tax || '0');
  const total = parseFloat(ret.total || '0');

  return (
    <div className="bg-white p-8 text-slate-800" dir="rtl">
      <ReportHeader
        company={company}
        title={`مردود مبيعات (إشعار دائن) رقم ${ret.return_number}`}
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
          <span className="block font-bold text-slate-400">بيانات العميل:</span>
          <span className="mt-0.5 block text-sm font-bold text-slate-900">
            {ret.customerName}
          </span>
          <span className="block font-mono text-slate-500">كود: {ret.customerCode}</span>
        </div>
        <div>
          <span className="block font-bold text-slate-400">ربط المستند:</span>
          <span className="mt-0.5 block text-slate-700">
            الفاتورة الأصلية: {ret.originalInvoiceNumber || '—'}
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
/* Page Component                                                     */
/* ------------------------------------------------------------------ */

export const SalesReturnsPage: React.FC = () => {
  const { openLookup } = useLookup();
  const { company } = useCompanyProfile();
  const toast = useToast();

  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoiceOption[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCodeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Default to 'create' mode to immediately display the Onyx Pro Return screen
  const [workspaceMode, setWorkspaceMode] = useState<DocumentMode | null>('create');
  const [selectedReturn, setSelectedReturn] = useState<SalesReturn | null>(null);

  // Field editability lock: fields are read-only UNLESS isEditing is true
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Column visibility settings (matching SalesInvoices Onyx Pro style)
  const [showCostAndProfit, setShowCostAndProfit] = useState<boolean>(true);
  const [showFreeQty, setShowFreeQty] = useState<boolean>(true);
  const [showNetPrice, setShowNetPrice] = useState<boolean>(true);
  const [showColumnSettings, setShowColumnSettings] = useState<boolean>(false);

  // Warehouses list (for per-line warehouse selector)
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [originalInvoiceId, setOriginalInvoiceId] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [selectedTaxCodeId, setSelectedTaxCodeId] = useState('');
  const [lines, setLines] = useState<SalesReturnLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Active line index for F2/F3/F4 keyboard actions
  const [activeLineIdx, setActiveLineIdx] = useState<number>(0);
  const [salesRep, setSalesRep] = useState<string>('أحمد محمد');
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

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resReturns, resCust, resInv, resTax, resWh] = await Promise.all([
        fetch('/api/sales/returns', { headers: authHeaders() }),
        fetch('/api/customers', { headers: authHeaders() }),
        fetch('/api/sales/invoices', { headers: authHeaders() }),
        fetch('/api/taxes/codes', { headers: authHeaders() }),
        fetch('/api/inventory/warehouses', { headers: authHeaders() }),
      ]);

      if (resReturns.ok) {
        const data = await resReturns.json();
        setReturns(Array.isArray(data) ? data : []);
      }
      if (resCust.ok) {
        const custData = await resCust.json();
        const custList = Array.isArray(custData) ? custData : [];
        setCustomers(custList);
        if (!selectedCustomerId && custList.length > 0) {
          const cashCust = custList.find((c: CustomerOption) => c.name.includes('نقدي')) || custList[0];
          if (cashCust) setSelectedCustomerId(cashCust.id);
        }
      }
      if (resInv.ok) {
        const invData = await resInv.json();
        setInvoices(Array.isArray(invData) ? invData : []);
      }
      if (resTax.ok) {
        const taxData = await resTax.json();
        const codes = Array.isArray(taxData) ? taxData : [];
        setTaxCodes(codes);
        const vat15 = codes.find((t: TaxCodeOption) => parseFloat(t.rate_percentage || '0') === 15);
        if (vat15 && !selectedTaxCodeId) {
          setSelectedTaxCodeId(vat15.id);
        }
      }
      if (resWh && resWh.ok) {
        const whData = await resWh.json();
        const whList = Array.isArray(whData) ? whData : [];
        setWarehouses(whList);
        if (!selectedWarehouseId && whList.length > 0) {
          setSelectedWarehouseId(whList[0].id);
        }
      }
    } catch (err: any) {
      console.error('Error fetching sales returns:', err);
      toast.error('تعذر تحميل بيانات مردودات المبيعات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- */
  /* Calculations & Lookups                                           */
  /* ---------------------------------------------------------------- */

  const getSelectedTaxRate = () => {
    if (!selectedTaxCodeId) return 0;
    const tc = taxCodes.find((t) => t.id === selectedTaxCodeId);
    return tc ? parseFloat(tc.rate_percentage || '0') / 100 : 0;
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
        if (!prev.some((x) => x.id === c.id)) {
          return [...prev, c];
        }
        return prev;
      });
    });
  };

  const handleOpenItemLookup = (index: number) => {
    if (!isEditing) {
      setIsEditing(true);
      toast.info('تم تفعيل وضع التحرير');
    }
    openLookup('ITEM', (item: any) => {
      if (!item || !item.id) return;
      const price = parseFloat(
        item.sellingPrice || item.sale_price || item.averageCost || item.purchase_price || 0
      );
      const cost = parseFloat(
        item.averageCost || item.cost || item.purchasePrice || item.purchase_price || 0
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
          unit: item.unit || item.unitName || item.unit_name || current.unit || '',
          warehouseId: current.warehouseId || selectedWarehouseId || '',
          cost,
          unitPrice: price,
          quantity: qty,
          free_quantity: current.free_quantity || 0,
          tax: taxVal,
        };
        return next;
      });
    });
  };

  const addLine = () => {
    if (!isEditing) {
      setIsEditing(true);
      toast.info('تم تفعيل وضع التحرير وإضافة سطر مرتجع');
    }
    setLines((prev) => {
      const next = [...prev, emptyLine()];
      setActiveLineIdx(next.length - 1);
      return next;
    });
  };

  const removeLine = (index: number) => {
    if (!isEditing) {
      toast.warning('يرجى تفعيل وضع التعديل لحذف الأصناف');
      return;
    }
    setLines((prev) => {
      if (prev.length <= 1) return [emptyLine()];
      const next = prev.filter((_, i) => i !== index);
      setActiveLineIdx(Math.max(0, index - 1));
      return next;
    });
  };

  const updateLine = (index: number, field: keyof SalesReturnLine, value: any) => {
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

  const handleBarcodeLookup = async (code: string) => {
    if (!code.trim()) return;
    if (!isEditing) setIsEditing(true);
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
            lines.length === 1 && !lines[0].description ? 0 : activeLineIdx;

          setLines((prev) => {
            const next = [...prev];
            const current = next[targetIdx] || emptyLine();
            const qty = Number(current.quantity) > 0 ? Number(current.quantity) : 1;
            const lineNet = qty * price;
            const taxVal = Number((lineNet * rate).toFixed(2));

            next[targetIdx] = {
              ...current,
              itemId: found.id,
              itemCode: found.sku || found.barcode || found.code || found.name,
              description: found.name || current.description,
              unit: found.unit || found.unitName || current.unit || '',
              warehouseId: current.warehouseId || selectedWarehouseId || '',
              cost,
              quantity: qty,
              unitPrice: price,
              free_quantity: current.free_quantity || 0,
              tax: taxVal,
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

  const subtotal = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0
  );
  const totalTax = lines.reduce((sum, l) => sum + (Number(l.tax) || 0), 0);
  const computedTotal = subtotal + totalTax;

  /* ---------------------------------------------------------------- */
  /* Actions                                                          */
  /* ---------------------------------------------------------------- */

  const resetForm = () => {
    const cashCust = customers.find((c) => c.name.includes('نقدي')) || customers[0];
    setSelectedCustomerId(cashCust?.id || '');
    setOriginalInvoiceId('');
    setReturnDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setLines([emptyLine()]);
    setFormError(null);
    setActiveLineIdx(0);
  };

  const openNew = () => {
    if (isEditing && lines.some((l) => l.description.trim())) {
      if (!confirm('ستُفقد التغييرات غير المحفوظة. هل تريد فتح مستند جديد؟')) return;
    }
    resetForm();
    setSelectedReturn(null);
    setWorkspaceMode('create');
    setIsEditing(true);
    setFormError(null);
    toast.info('مردود جديد: تم تفعيل وضع الإدخال');
  };

  const openReturnDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/sales/returns/${id}`, { headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر فتح مردود المبيعات');
      }
      const data: SalesReturn = await res.json();
      setSelectedReturn(data);
      setSelectedCustomerId(
        customers.find((c) => c.name === data.customerName)?.id || ''
      );
      setOriginalInvoiceId(
        invoices.find((i) => i.invoice_number === data.originalInvoiceNumber)?.id || ''
      );
      setReturnDate(dateOnly(data.return_date));
      setNotes(data.notes || '');

      const loadedLines: SalesReturnLine[] = (data.lines || []).map((l) => ({
        itemId: l.itemId,
        itemCode: l.item_code || l.itemSku || '',
        description: l.description,
        unit: l.itemUnit || '',
        warehouseId: '',
        warehouseName: l.warehouseName || '',
        quantity: Number(l.quantity) || 0,
        free_quantity: 0,
        cost: 0,
        unitPrice: Number(l.unit_price) || 0,
        tax: Number(l.tax) || 0,
      }));
      setLines(loadedLines.length > 0 ? loadedLines : [emptyLine()]);
      setWorkspaceMode('view');
      setIsEditing(false); // Locked
      setFormError(null);
      return true;
    } catch (err: any) {
      toast.error('تعذر فتح مردود المبيعات', { description: err.message });
      return false;
    }
  };

  const handleExit = () => {
    if (isEditing && lines.some((l) => l.description.trim())) {
      if (!confirm('ستُفقد التغييرات غير المحفوظة. هل تريد الخروج من وضع التعديل؟')) return;
    }
    setIsEditing(false);
    if (selectedReturn) {
      setWorkspaceMode('view');
    } else {
      resetForm();
    }
    toast.info('تم إغلاق وضع التعديل وحفظ الشاشة في وضع القراءة');
  };

  const handleSave = async () => {
    setFormError(null);
    if (!selectedCustomerId) {
      setFormError('يرجى تحديد العميل');
      toast.error('يرجى تحديد العميل');
      return;
    }
    if (
      lines.some(
        (l) => !l.description.trim() || !Number.isFinite(Number(l.quantity)) || Number(l.quantity) <= 0
      )
    ) {
      setFormError('يرجى تعبئة بيان كل بند وكمية موجبة');
      toast.error('يرجى تعبئة بيان كل بند وكمية موجبة');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/sales/returns', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          customerId: selectedCustomerId,
          originalInvoiceId: originalInvoiceId || undefined,
          returnDate,
          notes,
          lines,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'فشل في حفظ مردود المبيعات');
      }

      const data = await res.json();
      const savedId: string | undefined = data?.salesReturn?.id;
      const savedNumber: string | undefined = data?.salesReturn?.return_number;

      toast.success('تم حفظ وترحيل مردود المبيعات بنجاح', {
        description: savedNumber ? `رقم المردود: ${savedNumber}` : undefined,
      });

      setIsEditing(false);
      await fetchData();

      if (savedId) {
        await openReturnDetails(savedId);
      }
    } catch (err: any) {
      setFormError(err.message);
      toast.error('تعذر حفظ مردود المبيعات', { description: err.message });
    } finally {
      setSubmitting(false);
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
          handleSave();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeLineIdx, isEditing, workspaceMode, lines, selectedCustomerId, originalInvoiceId, returnDate, notes]);

  /* ---------------------------------------------------------------- */
  /* Filtered Archive List                                            */
  /* ---------------------------------------------------------------- */

  const totalReturnsAmount = returns.reduce((sum, r) => sum + parseFloat(r.total || '0'), 0);

  const filteredReturns = returns.filter(
    (r) =>
      r.return_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.customerName?.toLowerCase().includes(search.toLowerCase()) ||
      r.customerCode?.toLowerCase().includes(search.toLowerCase()) ||
      r.originalInvoiceNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const isView = workspaceMode === 'view';
  const isArchiveList = workspaceMode === null;

  const displayReturnNumber =
    isView
      ? selectedReturn?.return_number || 'RET-0001'
      : returns.length > 0
      ? `RET-000${returns.length + 1}`
      : 'RET-0001';

  const activeCustomer = customers.find((c) => c.id === selectedCustomerId);
  const displayCustomerName =
    activeCustomer?.name ||
    (selectedCustomerId
      ? customers.find((c) => c.id === selectedCustomerId)?.name || 'عميل نقدي'
      : 'عميل نقدي');

  const minimumRows = 7;
  const emptyRowsCount = Math.max(0, minimumRows - lines.length);

  // Focus style with soft warm yellow highlighting
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
          <span className="text-[11px] font-normal text-slate-400">مردودات المبيعات (إشعار دائن)</span>
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

          {/* فواتير المبيعات */}
          <button
            type="button"
            onClick={() => {
              if (window.location) window.location.href = '/sales/invoices';
            }}
            className="flex flex-col items-center justify-center px-3 py-1 rounded hover:bg-white/60 transition-colors text-slate-700 group"
          >
            <ShoppingCart size={18} className="text-blue-600 group-hover:scale-105 transition-transform" />
            <span className="text-[11px] font-bold mt-0.5">المبيعات</span>
          </button>

          {/* مردود المبيعات (Active) */}
          <button
            type="button"
            onClick={() => setWorkspaceMode('create')}
            className={`flex flex-col items-center justify-center px-4 py-1 rounded transition-all group ${
              !isArchiveList
                ? 'bg-[#c5ddf5] border border-blue-400 text-blue-950 font-black shadow-xs'
                : 'hover:bg-white/60 text-slate-700'
            }`}
          >
            <RotateCcw size={18} className="text-blue-700 group-hover:scale-105 transition-transform" />
            <span className="text-[11px] font-bold mt-0.5">مردود المبيعات</span>
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
            onClick={() => toast.info('مردودات المبيعات: استخدم الاختصارات F2 إضافة، F3 بحث، F4 حذف، F5 جديد، F6 طباعة، F10 حفظ')}
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

        {/* Lock/Edit Indicator + Toggle Archive Button */}
        <div className="flex items-center gap-2">
          {!isArchiveList && (
            <>
              {/* Column Settings Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowColumnSettings((v) => !v)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
                  title="تخصيص أعمدة الجدول"
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
            <span>{isArchiveList ? 'العودة لشاشة المردود' : `سجل وقائمة المردودات (${returns.length})`}</span>
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
            title="مردودات المبيعات وإشعارات الدائن"
            description="إدارة مرتجعات البضائع، إصدار إشعارات الخصم، وتخفيض مديونية العملاء آلياً"
            icon={<RotateCcw size={20} />}
            actions={
              <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
                مردود جديد (F5)
              </Button>
            }
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              label="إجمالي المردودات"
              value={totalReturnsAmount.toLocaleString('en-US')}
              unit="ر.ي"
              icon={<RotateCcw size={18} />}
              tone="warning"
              hint="تؤثر مباشرة على تخفيض الإيرادات وذمم العملاء"
              pending={loading}
            />
            <KpiCard
              label="عدد إشعارات المردود"
              value={returns.length.toLocaleString('en-US')}
              icon={<FileText size={18} />}
              tone="brand"
              hint="إشعارات دائن معتمدة ومرحّلة"
              pending={loading}
            />
            <KpiCard
              label="متوسط قيمة المردود"
              value={
                returns.length > 0
                  ? Math.round(totalReturnsAmount / returns.length).toLocaleString('en-US')
                  : '0'
              }
              unit="ر.ي"
              icon={<Banknote size={18} />}
              tone="brand"
              hint="لكل إشعار دائن صادر"
              pending={loading}
            />
          </div>

          <PageToolbar
            search={{
              value: search,
              onValueChange: setSearch,
              placeholder: 'بحث برقم المردود أو اسم العميل أو الفاتورة...',
            }}
          />

          <Card flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-right text-xs">
                <thead className="border-b border-line bg-surface-muted font-bold text-ink-muted">
                  <tr>
                    <th className="px-4 py-3.5">رقم المردود</th>
                    <th className="px-4 py-3.5">التاريخ</th>
                    <th className="px-4 py-3.5">العميل</th>
                    <th className="px-4 py-3.5">الفاتورة الأصلية</th>
                    <th className="px-4 py-3.5">إجمالي المردود</th>
                    <th className="px-4 py-3.5">الحالة</th>
                    <th className="px-4 py-3.5">القيد المحاسبي</th>
                    <th className="px-4 py-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft font-medium text-ink">
                  {loading ? (
                    <tr>
                      <td colSpan={8}>
                        <LoadingState text="جارٍ تحميل مردودات المبيعات..." />
                      </td>
                    </tr>
                  ) : filteredReturns.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <EmptyState
                          icon={<RotateCcw size={32} />}
                          title="لا توجد مردودات مطابقة"
                          description="لم يتم تسجيل مردودات مبيعات بعد."
                          action={
                            <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
                              مردود جديد
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredReturns.map((r) => (
                      <tr key={r.id} className="transition-colors hover:bg-surface-hover/60">
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => openReturnDetails(r.id)}
                            className="inline-flex items-center gap-1 font-mono font-bold text-brand hover:underline"
                          >
                            <span>{r.return_number}</span>
                            <ExternalLink size={12} className="opacity-60" />
                          </button>
                        </td>
                        <td className="kayan-numeric px-4 py-3.5 text-ink-muted">
                          <bdi dir="ltr">{dateOnly(r.return_date)}</bdi>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-ink">{r.customerName}</div>
                          <div className="font-mono text-[10px] text-ink-muted">{r.customerCode}</div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-ink-muted">
                          {r.originalInvoiceNumber || '—'}
                        </td>
                        <td className="kayan-numeric px-4 py-3.5 font-bold text-ink">
                          {parseFloat(r.total || '0').toLocaleString('en-US')}{' '}
                          <span className="text-[10px] font-normal text-ink-muted">ر.ي</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <DocumentStatusBadge status={toDocumentStatus(r.status)} />
                        </td>
                        <td className="px-4 py-3.5">
                          {r.journalEntryNumber ? (
                            <span className="rounded-md border border-line bg-surface-muted px-2 py-1 font-mono text-xs font-bold text-ink">
                              {r.journalEntryNumber}
                            </span>
                          ) : (
                            <span className="text-[11px] text-ink-muted">بدون قيد</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <IconButton
                            tone="primary"
                            label="عرض المردود"
                            onClick={() => openReturnDetails(r.id)}
                          >
                            <Eye size={15} />
                          </IconButton>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        /* ================= ONYX PRO V8 SALES RETURN SCREEN ================= */
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
                فاتورة مردود مبيعات
              </h1>
              <p className="text-xs font-bold text-sky-200 mt-0.5 tracking-wider">
                — إشعار دائن / مردود بضاعة —
              </p>
              {isView && selectedReturn && (
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-white/20 text-white">
                    الحالة: {statusLabel(selectedReturn.status)}
                  </span>
                  {selectedReturn.journalEntryNumber && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-900/60 text-cyan-200 border border-blue-400/40">
                      قيد: {selectedReturn.journalEntryNumber}
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
                  <span>{returnDate.replace(/-/g, '/')}</span>
                  <DatePicker
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
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
            {/* Row 1: رقم المردود | العميل | الفاتورة الأصلية */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* رقم المردود */}
              <div className="md:col-span-3 flex items-center gap-2">
                <label className="w-24 shrink-0 font-bold text-slate-700 flex items-center gap-1">
                  <RotateCcw size={15} className="text-blue-600" />
                  <span>رقم المردود :</span>
                </label>
                <div className="flex-1 flex items-center bg-[#dbeafe] border border-[#93c5fd] rounded px-2.5 py-1 text-blue-900 font-mono font-black text-sm shadow-inner">
                  <span className="flex-1">{displayReturnNumber}</span>
                  <FileText size={14} className="text-blue-500 opacity-60" />
                </div>
              </div>

              {/* العميل */}
              <div className="md:col-span-5 flex items-center gap-2">
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

              {/* الفاتورة الأصلية */}
              <div className="md:col-span-4 flex items-center gap-2">
                <label className="w-24 shrink-0 font-bold text-slate-700 flex items-center gap-1">
                  <FileText size={15} className="text-emerald-600" />
                  <span>الفاتورة الأصلية :</span>
                </label>
                <div className="flex-1 relative">
                  <select
                    tabIndex={3}
                    value={originalInvoiceId}
                    disabled={!isEditing}
                    onChange={(e) => setOriginalInvoiceId(e.target.value)}
                    className={`w-full border rounded px-2.5 py-1 text-slate-900 font-bold text-xs appearance-none pr-7 pl-6 focus:outline-none transition-colors ${
                      isEditing
                        ? 'bg-white border-slate-300 focus:bg-[#fef9c3] focus:border-amber-500 cursor-pointer'
                        : 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <option value="">بدون ربط بفاتورة محددة</option>
                    {invoices
                      .filter((inv) => !selectedCustomerId || inv.customer_id === selectedCustomerId)
                      .map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoice_number} ({money(inv.total)} ر.ي)
                        </option>
                      ))}
                  </select>
                  <FileText size={14} className="absolute right-2 top-1.5 text-emerald-600 pointer-events-none" />
                  <span className="absolute left-2 top-1.5 text-slate-400 pointer-events-none text-[10px]">▼</span>
                </div>
              </div>
            </div>

            {/* Row 2: نوع الفاتورة | المندوب | الضريبة */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* نوع الفاتورة */}
              <div className="md:col-span-3 flex items-center gap-2">
                <label className="w-24 shrink-0 font-bold text-slate-700 flex items-center gap-1">
                  <RotateCcw size={15} className="text-blue-600" />
                  <span>نوع الفاتورة :</span>
                </label>
                <div className="flex-1 relative">
                  <select
                    tabIndex={4}
                    disabled={!isEditing}
                    className={`w-full border rounded px-2.5 py-1 text-slate-900 font-bold text-xs appearance-none pr-7 pl-6 focus:outline-none transition-colors ${
                      isEditing
                        ? 'bg-white border-slate-300 focus:bg-[#fef9c3] focus:border-amber-500 cursor-pointer'
                        : 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <option value="مردود مبيعات">مردود مبيعات</option>
                  </select>
                  <RotateCcw size={14} className="absolute right-2 top-1.5 text-blue-600 pointer-events-none" />
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

              {/* الضريبة */}
              <div className="md:col-span-4 flex items-center gap-2">
                <label className="w-24 shrink-0 font-bold text-slate-700 flex items-center gap-1">
                  <Banknote size={15} className="text-amber-600" />
                  <span>الضريبة :</span>
                </label>
                <div className="flex-1 relative">
                  <select
                    tabIndex={6}
                    value={selectedTaxCodeId}
                    disabled={!isEditing}
                    onChange={(e) => {
                      const newCode = e.target.value;
                      setSelectedTaxCodeId(newCode);
                      const tc = taxCodes.find((t) => t.id === newCode);
                      const rate = tc ? parseFloat(tc.rate_percentage || '0') / 100 : 0;
                      setLines((prev) =>
                        prev.map((l) => ({
                          ...l,
                          tax: Number(((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * rate).toFixed(2)),
                        }))
                      );
                    }}
                    className={`w-full border rounded px-2.5 py-1 text-slate-900 font-bold text-xs appearance-none pr-7 pl-6 focus:outline-none transition-colors ${
                      isEditing
                        ? 'bg-white border-slate-300 focus:bg-[#fef9c3] focus:border-amber-500 cursor-pointer'
                        : 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <option value="">بدون ضريبة (0%)</option>
                    {taxCodes.map((tc) => (
                      <option key={tc.id} value={tc.id}>
                        {tc.name} ({parseFloat(tc.rate_percentage || '0')}%)
                      </option>
                    ))}
                  </select>
                  <Banknote size={14} className="absolute right-2 top-1.5 text-amber-600 pointer-events-none" />
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
                placeholder="أدخل سبب إرجاع البضاعة وملاحظات التسوية..."
                className={`flex-1 border rounded px-2.5 py-1 text-slate-800 text-xs focus:outline-none transition-colors ${
                  isEditing
                    ? 'bg-white border-slate-300 focus:bg-[#fef9c3] focus:border-amber-500'
                    : 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                }`}
              />
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* 4. Items Table (جدول الأصناف المرتجعة)                           */}
          {/* ---------------------------------------------------------------- */}
          {/* 4. Items Table (جدول الأصناف المرتجعة - Onyx Pro 15-column layout) */}
          {/* ---------------------------------------------------------------- */}
          <div className="flex-1 bg-white border border-slate-300 rounded-md shadow-xs overflow-hidden flex flex-col min-h-[260px]">
            <div className="overflow-x-auto flex-1">
              <table className="w-full min-w-[1250px] text-right border-collapse text-xs">
                <thead>
                  {/* Pale pinkish-rose header matching SalesInvoices Onyx Pro */}
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
                  {lines.map((line, idx) => {
                    const isSelected = activeLineIdx === idx;
                    const qty = Number(line.quantity) || 0;
                    const price = Number(line.unitPrice) || 0;
                    const cost = Number(line.cost) || 0;
                    const margin = price - cost;
                    const marginPercent = price > 0 ? ((margin / price) * 100).toFixed(2) : '0.00';
                    const lineTotal = qty * price;
                    const totalMargin = qty * margin;
                    const netPrice = lineTotal + (Number(line.tax) || 0);

                    const baseTab = 10 + idx * 10;

                    return (
                      <tr
                        key={idx}
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

                        {/* رقم الصنف */}
                        <td className="py-1 px-2 border-l border-slate-200">
                          {!isEditing ? (
                            <span className="font-mono text-slate-800 font-bold block text-center">
                              {line.itemCode || '—'}
                            </span>
                          ) : (
                            <input
                              type="text"
                              tabIndex={baseTab + 1}
                              value={line.itemCode || ''}
                              placeholder="رقم الصنف"
                              onChange={(e) => updateLine(idx, 'itemCode', e.target.value)}
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

                        {/* اسم الصنف - Cyan highlight on selected */}
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

                        {/* الوحدة */}
                        <td className="py-1 px-2 text-center border-l border-slate-200">
                          {!isEditing ? (
                            <span className="text-slate-800">{line.unit || '—'}</span>
                          ) : (
                            <input
                              type="text"
                              tabIndex={baseTab + 3}
                              value={line.unit || ''}
                              onChange={(e) => updateLine(idx, 'unit', e.target.value)}
                              className={`${cellInputStyle} text-center`}
                              placeholder="وحدة"
                            />
                          )}
                        </td>

                        {/* المخزن */}
                        <td className="py-1 px-2 text-center border-l border-slate-200">
                          {!isEditing ? (
                            <span className="text-slate-800 text-xs">
                              {warehouses.find((w) => w.id === (line.warehouseId || selectedWarehouseId))?.name || '—'}
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

                        {/* الكمية */}
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

                        {/* ك. المجانية */}
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

                        {/* التكلفة (Auto from item) */}
                        {showCostAndProfit && (
                          <td className="py-1 px-2 text-center border-l border-slate-200 font-mono text-slate-700 bg-slate-50/50">
                            {money(cost)}
                          </td>
                        )}

                        {/* السعر */}
                        <td className="py-1 px-2 text-center border-l border-slate-200">
                          {!isEditing ? (
                            <span className="font-mono font-bold text-slate-900">{money(line.unitPrice)}</span>
                          ) : (
                            <input
                              type="number"
                              tabIndex={baseTab + 6}
                              min="0"
                              step="any"
                              value={line.unitPrice}
                              onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (idx === lines.length - 1) {
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

                        {/* هامش الربح */}
                        {showCostAndProfit && (
                          <td
                            className={`py-1 px-2 text-center border-l border-slate-200 font-mono font-bold ${
                              margin >= 0 ? 'text-emerald-700 bg-emerald-50/30' : 'text-rose-600 bg-rose-50/30'
                            }`}
                          >
                            {money(margin)}
                          </td>
                        )}

                        {/* نسبة هامش الربح */}
                        {showCostAndProfit && (
                          <td
                            className={`py-1 px-2 text-center border-l border-slate-200 font-mono text-xs ${
                              margin >= 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {marginPercent}%
                          </td>
                        )}

                        {/* الإجمالي */}
                        <td className="py-1 px-2 text-center border-l border-slate-200 font-mono font-bold text-slate-900">
                          {money(lineTotal)}
                        </td>

                        {/* إجمالي هامش الربح */}
                        {showCostAndProfit && (
                          <td
                            className={`py-1 px-2 text-center border-l border-slate-200 font-mono font-bold ${
                              totalMargin >= 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {money(totalMargin)}
                          </td>
                        )}

                        {/* صافي السعر */}
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
                      {isEditing ? 'اضغط Enter بعد السعر لإضافة صنف مرتجع جديد' : 'انقر على إضافة أو جديد لإدخال مرتجعات'}
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

                  {/* Empty rows */}
                  {Array.from({ length: emptyRowsCount }).map((_, i) => (
                    <tr key={`empty-${i}`} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-1 text-center border-l border-slate-200 text-slate-300">..</td>
                      <td className="py-2.5 px-1 text-center border-l border-slate-200 text-slate-300 font-mono">
                        {lines.length + 1 + i}
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
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-bold text-slate-700">المجموع الفرعي :</span>
                  <span className="font-mono font-black text-sm text-slate-900">
                    {money(isView ? selectedReturn?.subtotal : subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-bold text-slate-700">إجمالي الضريبة :</span>
                  <span className="font-mono font-bold text-slate-800">
                    {money(isView ? selectedReturn?.tax : totalTax)}
                  </span>
                </div>
              </div>

              {/* Total Blue Card */}
              <div className="bg-[#0b3864] text-white px-4 py-2.5 flex items-center justify-between border-t border-blue-900">
                <span className="font-black text-sm tracking-wide">الإجمالي الكلي للمردود :</span>
                <span className="font-mono font-black text-xl text-[#fbbf24] drop-shadow-xs">
                  {money(isView ? selectedReturn?.total : computedTotal)}
                </span>
              </div>
            </div>

            {/* Shopping Cart / Returns Box on Right (Col 6-12) */}
            <div className="md:col-span-7 bg-[#eaf3fc] border border-[#b9d5f3] rounded-md p-4 flex flex-col items-center justify-center text-center shadow-xs">
              <div className="text-blue-400 mb-1">
                <RotateCcw size={50} strokeWidth={1.8} className="text-blue-500/70" />
              </div>
              <p className="text-sm font-black text-blue-900 tracking-wide">
                أضف الأصناف المرتجعة من خلال البحث أو الباركود
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
                disabled={lines.length <= 1}
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
                disabled={submitting}
                onClick={() => {
                  if (!isEditing) {
                    setIsEditing(true);
                    toast.info('تم تفعيل وضع التعديل (اضغط F10 مرة أخرى للحفظ)');
                  } else {
                    handleSave();
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
                <span>قراءة الباركود للمردود</span>
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
              قم بمسح باركود الصنف المرتجع أو أدخل الكود:
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

      {/* Hidden Print Container */}
      <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:z-[9999]">
        {selectedReturn ? (
          <SalesReturnPrint ret={selectedReturn} company={company} />
        ) : (
          <SalesReturnPrint
            ret={{
              id: 'temp',
              return_number: displayReturnNumber,
              customerName: displayCustomerName,
              customerCode: activeCustomer?.code || 'CUST-001',
              originalInvoiceNumber: invoices.find((i) => i.id === originalInvoiceId)?.invoice_number || '',
              return_date: returnDate,
              subtotal: String(subtotal),
              tax: String(totalTax),
              total: String(computedTotal),
              status: 'POSTED',
              notes,
              created_at: new Date().toISOString(),
              lines: lines.map((l, i) => ({
                id: `line-${i}`,
                itemId: l.itemId,
                description: l.description,
                quantity: l.quantity,
                unit_price: l.unitPrice,
                tax: l.tax,
                line_total: (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) + (Number(l.tax) || 0),
                line_number: i + 1,
              })),
            }}
            company={company}
          />
        )}
      </div>
    </div>
  );
};

export default SalesReturnsPage;
