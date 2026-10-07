import React, { useState, useEffect } from 'react';
import { useLookup } from '../context/LookupContext';
import {
  FileText,
  Search,
  Plus,
  Printer,
  CheckCircle2,
  Clock,
  Ban,
  DollarSign,
  AlertTriangle,
  X,
  CreditCard,
  Building2,
  Trash2,
  ArrowUpRight,
  ExternalLink,
  ShieldAlert,
  Package
} from 'lucide-react';

interface InvoiceLine {
  id?: string;
  itemId?: string;
  item_code?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax: number;
  line_total?: number;
  unit?: string;
  availableQty?: number;
  warehouseId?: string;
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
  notes?: string;
  created_at: string;
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

export const SalesInvoicesPage: React.FC = () => {
  const { openLookup } = useLookup();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  // PHASE 9.1 (P2): tax rate comes from Tax Configuration — never a hardcoded 15%
  const [taxCodes, setTaxCodes] = useState<TaxCodeOption[]>([]);
  const [selectedTaxCodeId, setSelectedTaxCodeId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [overrideTargetId, setOverrideTargetId] = useState<string | null>(null);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT'>('CREDIT');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');
  const [formLines, setFormLines] = useState<InvoiceLine[]>([
    { description: '', quantity: 1, unit_price: 0, discount: 0, tax: 0 }
  ]);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [allowCreditOverride, setAllowCreditOverride] = useState(false);

  // Fetch Data
  const loadData = async () => {
    try {
      setLoading(true);
      const [invRes, custRes, whRes, taxRes] = await Promise.all([
        fetch('/api/sales/invoices?limit=100'),
        fetch('/api/customers'),
        fetch('/api/inventory/warehouses'),
        fetch('/api/taxes/codes')
      ]);

      if (invRes.ok) {
        const invData = await invRes.json();
        setInvoices(invData);
      }
      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomers(custData.filter((c: CustomerOption) => c.is_active));
      }
      if (whRes.ok) {
        const whData = await whRes.json();
        setWarehouses(whData);
        if (whData.length > 0 && !selectedWarehouseId) {
          setSelectedWarehouseId(whData[0].id);
        }
      }
      if (taxRes.ok) {
        const taxData = await taxRes.json();
        setTaxCodes(Array.isArray(taxData) ? taxData : []);
      }
    } catch (err) {
      console.error('Error loading invoices data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // PHASE 9.1 (P2): dynamic tax rate from Tax Configuration.
  // No tax code selected => 0% (never an invented 15%).
  const getSelectedTaxRate = () => {
    if (!selectedTaxCodeId) return 0;
    const tc = taxCodes.find(t => t.id === selectedTaxCodeId);
    return tc ? parseFloat(tc.rate_percentage || '0') / 100 : 0;
  };

  const handleTaxCodeChange = (taxCodeId: string) => {
    setSelectedTaxCodeId(taxCodeId);
    const tc = taxCodes.find(t => t.id === taxCodeId);
    const rate = tc ? parseFloat(tc.rate_percentage || '0') / 100 : 0;
    setFormLines(prev => prev.map(l => {
      const lineNet = Math.max(0, (Number(l.quantity) || 0) * (Number(l.unit_price) || 0) - (Number(l.discount) || 0));
      return { ...l, tax: Number((lineNet * rate).toFixed(2)), line_total: lineNet + Number((lineNet * rate).toFixed(2)) };
    }));
  };

  // Handle Item Lookup Selection for a specific line index
  const handleOpenItemLookup = (lineIdx: number) => {
    openLookup('ITEM', (item: any) => {
      if (!item || !item.id) return;
      const price = parseFloat(item.sellingPrice || item.sale_price || item.averageCost || item.purchasePrice || item.purchase_price || 0);
      const available = parseFloat(item.availableQty !== undefined ? item.availableQty : (item.currentStock || 0));
      const rate = getSelectedTaxRate();

      setFormLines(prev => {
        const next = [...prev];
        const current = next[lineIdx] || { description: '', quantity: 1, unit_price: 0, discount: 0, tax: 0 };
        const qty = Number(current.quantity) > 0 ? Number(current.quantity) : 1;
        const disc = Number(current.discount) || 0;
        const lineNet = Math.max(0, (qty * price) - disc);
        const taxVal = Number((lineNet * rate).toFixed(2));
        
        next[lineIdx] = {
          ...current,
          itemId: item.id,
          item_code: item.sku || item.barcode || item.code || item.name,
          description: item.name || current.description,
          quantity: qty,
          unit_price: price,
          discount: disc,
          tax: taxVal,
          unit: item.unit || 'قطعة',
          availableQty: available,
          warehouseId: selectedWarehouseId || current.warehouseId || undefined,
        };
        return next;
      });
    });
  };

  // Handle Customer Lookup Selection
  const handleOpenCustomerLookup = () => {
    openLookup('CUSTOMER', (c: any) => {
      if (!c || !c.id) return;
      setSelectedCustomerId(c.id);
      setCustomers(prev => {
        if (!prev.some(x => x.id === c.id)) {
          return [...prev, {
            id: c.id,
            code: c.code,
            name: c.name,
            credit_limit: c.creditLimit || '0',
            outstandingBalance: c.balance || '0',
            is_active: true
          }];
        }
        return prev;
      });
    });
  };

  // Line Calculations
  const addLine = () => {
    setFormLines(prev => [
      ...prev,
      { description: '', quantity: 1, unit_price: 0, discount: 0, tax: 0, warehouseId: selectedWarehouseId }
    ]);
  };

  const removeLine = (idx: number) => {
    setFormLines(prev => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  const updateLine = (idx: number, field: keyof InvoiceLine, value: any) => {
    setFormLines(prev => {
      const updated = [...prev];
      const target = { ...updated[idx], [field]: value };
      const qty = field === 'quantity' ? Number(value) || 0 : Number(target.quantity) || 0;
      const price = field === 'unit_price' ? Number(value) || 0 : Number(target.unit_price) || 0;
      const disc = field === 'discount' ? Number(value) || 0 : Number(target.discount) || 0;
      const lineNet = Math.max(0, (qty * price) - disc);
      
      if (field === 'quantity' || field === 'unit_price' || field === 'discount') {
        target.tax = Number((lineNet * getSelectedTaxRate()).toFixed(2));
      }
      target.line_total = lineNet + (Number(target.tax) || 0);
      updated[idx] = target;
      return updated;
    });
  };

  const subtotal = formLines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
    0
  );
  const totalDiscount = formLines.reduce((sum, l) => sum + (Number(l.discount) || 0), 0);
  const totalTax = formLines.reduce((sum, l) => sum + (Number(l.tax) || 0), 0);
  const netTotal = subtotal - totalDiscount + totalTax;

  // Selected customer info for credit check
  const activeCustomer = customers.find(c => c.id === selectedCustomerId);
  const creditLimit = parseFloat(activeCustomer?.credit_limit || '0');
  const currentBalance = parseFloat(activeCustomer?.outstandingBalance || '0');
  const wouldExceedLimit =
    paymentType === 'CREDIT' &&
    creditLimit > 0 &&
    currentBalance + netTotal > creditLimit;

  // Handle Create Invoice
  const handleSaveInvoice = async (postImmediately = false) => {
    setFormError(null);
    if (!selectedCustomerId) {
      setFormError('يرجى اختيار العميل أولاً');
      return;
    }
    if (formLines.some(l => !l.description.trim() || l.quantity <= 0 || l.unit_price <= 0)) {
      setFormError('يرجى تعبئة كافة بنود الفاتورة والبيان والكمية والأسعار');
      return;
    }

    try {
      setFormSubmitting(true);
      const res = await fetch('/api/sales/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          paymentType,
          invoiceDate,
          dueDate,
          notes,
          lines: formLines.map(l => ({
            itemId: l.itemId,
            warehouseId: l.warehouseId || selectedWarehouseId || undefined,
            itemCode: l.item_code,
            description: l.description,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unit_price),
            discount: Number(l.discount) || 0,
            tax: Number(l.tax) || 0
          }))
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'فشل في حفظ الفاتورة');
      }

      const created = await res.json();

      if (postImmediately) {
        const postRes = await fetch(`/api/sales/invoices/${created.id}/post`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ allowOverride: allowCreditOverride })
        });
        if (!postRes.ok) {
          const postData = await postRes.json();
          throw new Error(postData.error || 'تم حفظ الفاتورة كمسودة ولكن تعذر ترحيلها');
        }
      }

      setShowCreateModal(false);
      resetForm();
      loadData();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedCustomerId('');
    setPaymentType('CREDIT');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setDueDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setNotes('');
    setFormLines([{ description: '', quantity: 1, unit_price: 0, discount: 0, tax: 0 }]);
    setSelectedTaxCodeId('');
    setAllowCreditOverride(false);
    setFormError(null);
  };

  // Open invoice viewer
  const openInvoiceDetails = async (invId: string) => {
    try {
      const res = await fetch(`/api/sales/invoices/${invId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedInvoice(data);
        setShowViewModal(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Post existing draft invoice
  const handlePostInvoice = async (invId: string, allowOverride = false) => {
    try {
      const res = await fetch(`/api/sales/invoices/${invId}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowOverride })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error && data.error.includes('الحد الائتماني')) {
          setOverrideTargetId(invId);
          setShowOverrideConfirm(true);
        } else {
          alert(data.error || 'فشل الترحيل');
        }
        return;
      }

      loadData();
      if (selectedInvoice && selectedInvoice.id === invId) {
        openInvoiceDetails(invId);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Void posted invoice
  const handleVoidInvoice = async (invId: string) => {
    if (!confirm('هل أنت متأكد من إلغاء هذه الفاتورة؟ سيتم عكس القيد المحاسبي المرتبط بها تلقائياً.')) {
      return;
    }
    try {
      const res = await fetch(`/api/sales/invoices/${invId}/void`, {
        method: 'POST'
      });
      if (res.ok) {
        loadData();
        if (selectedInvoice && selectedInvoice.id === invId) {
          openInvoiceDetails(invId);
        }
      } else {
        const data = await res.json();
        alert(data.error || 'فشل إلغاء الفاتورة');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Filtering
  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch =
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(search.toLowerCase()) ||
      (inv.customerCode && inv.customerCode.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    const matchesPayment = paymentFilter === 'ALL' || inv.payment_type === paymentFilter;

    return matchesSearch && matchesStatus && matchesPayment;
  });

  // KPI Calculations
  const totalSalesVolume = invoices
    .filter(i => i.status === 'POSTED')
    .reduce((sum, i) => sum + parseFloat(i.total || '0'), 0);

  const postedCount = invoices.filter(i => i.status === 'POSTED').length;
  const draftCount = invoices.filter(i => i.status === 'DRAFT').length;

  const totalOutstanding = invoices
    .filter(i => i.status === 'POSTED' && i.payment_type === 'CREDIT')
    .reduce((sum, i) => sum + (parseFloat(i.total || '0') - parseFloat(i.paid_amount || '0')), 0);

  return (
    <div className="space-y-5 pb-8" dir="rtl">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
              <FileText size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">فواتير المبيعات</h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                إصدار الفواتير النقدية والآجلة، الرقابة الائتمانية، والترحيل المحاسبي الآلي المباشر
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
        >
          <Plus size={16} />
          <span>إنشاء فاتورة جديدة</span>
        </button>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Sales */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">إجمالي المبيعات المعتمدة</span>
            <span className="text-2xl font-black font-mono text-slate-900 block mt-1">
              {totalSalesVolume.toLocaleString()}
            </span>
            <span className="text-[11px] font-semibold text-emerald-600 mt-0.5 block">
              ريال يمني (فواتير مرحلة)
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <DollarSign size={22} />
          </div>
        </div>

        {/* Card 2: Posted Invoices */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">الفواتير المرحلة</span>
            <span className="text-2xl font-black font-mono text-blue-600 block mt-1">{postedCount}</span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">قيود محاسبية منشأة آلياً</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <CheckCircle2 size={22} />
          </div>
        </div>

        {/* Card 3: Draft Invoices */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">مسودات قيد الاعتماد</span>
            <span className="text-2xl font-black font-mono text-amber-600 block mt-1">{draftCount}</span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">بانتظار الترحيل النهائي</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock size={22} />
          </div>
        </div>

        {/* Card 4: Outstanding Receivables */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">متبقي آجل غير مسدد</span>
            <span className="text-2xl font-black font-mono text-purple-700 block mt-1">
              {totalOutstanding.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">ذمم مستحقة التحصيل</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <CreditCard size={22} />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              type="text"
              placeholder="بحث برقم الفاتورة أو اسم العميل أو الكود..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {/* Status Filter */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  statusFilter === 'ALL' ? 'bg-white text-blue-600 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setStatusFilter('POSTED')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  statusFilter === 'POSTED' ? 'bg-white text-emerald-600 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                مرحلة
              </button>
              <button
                onClick={() => setStatusFilter('DRAFT')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  statusFilter === 'DRAFT' ? 'bg-white text-amber-600 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                مسودة
              </button>
              <button
                onClick={() => setStatusFilter('VOIDED')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  statusFilter === 'VOIDED' ? 'bg-white text-rose-600 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                ملغاة
              </button>
            </div>

            {/* Payment Filter */}
            <select
              value={paymentFilter}
              onChange={e => setPaymentFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">طريقة الدفع: الكل</option>
              <option value="CREDIT">آجل (ذمم)</option>
              <option value="CASH">نقدي (صندوق)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold">
              <tr>
                <th className="py-3.5 px-4">رقم الفاتورة</th>
                <th className="py-3.5 px-4">التاريخ والاستحقاق</th>
                <th className="py-3.5 px-4">العميل</th>
                <th className="py-3.5 px-4">نوع الدفع</th>
                <th className="py-3.5 px-4">إجمالي الفاتورة</th>
                <th className="py-3.5 px-4">المدفوع / المتبقي</th>
                <th className="py-3.5 px-4">الحالة</th>
                <th className="py-3.5 px-4">القيد المحاسبي</th>
                <th className="py-3.5 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-semibold">
                    جاري تحميل فواتير المبيعات...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-semibold">
                    لا توجد فواتير مطابقة للبحث
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => {
                  const total = parseFloat(inv.total);
                  const paid = parseFloat(inv.paid_amount);
                  const remaining = total - paid;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Invoice Number */}
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-600">
                        <button
                          onClick={() => openInvoiceDetails(inv.id)}
                          className="hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>{inv.invoice_number}</span>
                          <ExternalLink size={12} className="opacity-60" />
                        </button>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <div>{inv.invoice_date}</div>
                        {inv.payment_type === 'CREDIT' && (
                          <div className="text-[11px] text-slate-400 font-normal">
                            استحقاق: {inv.due_date}
                          </div>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{inv.customerName}</div>
                        <div className="text-[10px] font-mono text-slate-400">{inv.customerCode}</div>
                      </td>

                      {/* Payment Type */}
                      <td className="py-3.5 px-4">
                        {inv.payment_type === 'CASH' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            نقدي
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            آجل
                          </span>
                        )}
                      </td>

                      {/* Total */}
                      <td className="py-3.5 px-4 font-mono font-black text-slate-900">
                        {total.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">ر.ي</span>
                      </td>

                      {/* Paid & Remaining */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-emerald-600 font-bold">
                          {paid > 0 ? `${paid.toLocaleString()} ر.ي` : '—'}
                        </div>
                        {inv.payment_type === 'CREDIT' && (
                          <div
                            className={`font-mono text-[11px] ${
                              remaining > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'
                            }`}
                          >
                            {remaining > 0 ? `متبقي: ${remaining.toLocaleString()}` : 'مسدد بالكامل'}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {inv.status === 'POSTED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} />
                            <span>مرحلة</span>
                          </span>
                        )}
                        {inv.status === 'DRAFT' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock size={12} />
                            <span>مسودة</span>
                          </span>
                        )}
                        {inv.status === 'VOIDED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <Ban size={12} />
                            <span>ملغاة</span>
                          </span>
                        )}
                      </td>

                      {/* Journal Entry */}
                      <td className="py-3.5 px-4">
                        {inv.journalEntryNumber ? (
                          <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                            {inv.journalEntryNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">بدون قيد (مسودة)</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openInvoiceDetails(inv.id)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="عرض وطباعة"
                          >
                            <Printer size={15} />
                          </button>

                          {inv.status === 'DRAFT' && (
                            <button
                              onClick={() => handlePostInvoice(inv.id, false)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition-colors cursor-pointer"
                              title="ترحيل القيد المحاسبي"
                            >
                              ترحيل
                            </button>
                          )}

                          {inv.status === 'POSTED' && (
                            <button
                              onClick={() => handleVoidInvoice(inv.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="إلغاء الفاتورة وعكس القيد"
                            >
                              <Ban size={15} />
                            </button>
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
      </div>

      {/* ========================================================= */}
      {/* Modal: Create Invoice                                     */}
      {/* ========================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200 my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between p-5 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <FileText className="text-blue-400" size={22} />
                <div>
                  <h2 className="text-base font-bold">إنشاء فاتورة مبيعات جديدة</h2>
                  <p className="text-[11px] text-slate-300">
                    إصدار الفاتورة وتوليد القيد المزدوج المتوازن في الأستاذ العام
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              {/* Main Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Customer */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">العميل *</label>
                    <button
                      type="button"
                      onClick={handleOpenCustomerLookup}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200 transition cursor-pointer"
                      title="استعلام وبحث عن عميل (F9)"
                    >
                      <Search size={11} />
                      <span>F9 استعلام</span>
                    </button>
                  </div>
                  <select
                    value={selectedCustomerId}
                    onChange={e => setSelectedCustomerId(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'F9') {
                        e.preventDefault();
                        handleOpenCustomerLookup();
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">-- اختر العميل أو اضغط F9 --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Warehouse */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">المستودع / المخزن *</label>
                  </div>
                  <select
                    value={selectedWarehouseId}
                    onChange={e => {
                      const newWhId = e.target.value;
                      setSelectedWarehouseId(newWhId);
                      setFormLines(prev => prev.map(l => ({ ...l, warehouseId: newWhId })));
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Payment Type */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">نوع الفاتورة *</label>
                  <select
                    value={paymentType}
                    onChange={e => setPaymentType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="CREDIT">آجل (على الحساب - ذمم)</option>
                    <option value="CASH">نقدي (الصندوق والخزينة)</option>
                  </select>
                </div>

                {/* Date */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">تاريخ الفاتورة *</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={e => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {/* Tax Code (PHASE 9.1 P2 — dynamic, from Tax Configuration) */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">الضريبة المطبقة</label>
                  <select
                    value={selectedTaxCodeId}
                    onChange={e => handleTaxCodeChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">بدون ضريبة (0%)</option>
                    {taxCodes.map(tc => (
                      <option key={tc.id} value={tc.id}>
                        {tc.name} ({parseFloat(tc.rate_percentage || '0')}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Credit Status Banner for Customer */}
              {activeCustomer && paymentType === 'CREDIT' && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                    wouldExceedLimit
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-blue-50/60 border-blue-200 text-blue-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {wouldExceedLimit ? <ShieldAlert size={18} className="text-rose-600" /> : <CreditCard size={18} className="text-blue-600" />}
                    <div>
                      <span className="font-bold">الموقف الائتماني للعميل: </span>
                      الحد الائتماني: {creditLimit.toLocaleString()} ر.ي | الرصيد الحالي:{' '}
                      {currentBalance.toLocaleString()} ر.ي | الرصيد بعد الفاتورة:{' '}
                      {(currentBalance + netTotal).toLocaleString()} ر.ي
                    </div>
                  </div>
                  {wouldExceedLimit && (
                    <label className="flex items-center gap-1.5 cursor-pointer font-bold text-rose-700">
                      <input
                        type="checkbox"
                        checked={allowCreditOverride}
                        onChange={e => setAllowCreditOverride(e.target.checked)}
                        className="rounded text-rose-600 focus:ring-rose-500"
                      />
                      <span>طلب صلاحية تجاوز الحد</span>
                    </label>
                  )}
                </div>
              )}

              {/* Invoice Lines Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800">بنود الفاتورة والأصناف</label>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-lg border border-blue-200 transition"
                  >
                    <Plus size={14} />
                    <span>إضافة بند (صنف)</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                      <tr>
                        <th className="py-2.5 px-3">البيان / الصنف (F9 للاستعلام)</th>
                        <th className="py-2.5 px-3 w-24 text-center">الكمية</th>
                        <th className="py-2.5 px-3 w-32 text-left">السعر (ر.ي)</th>
                        <th className="py-2.5 px-3 w-24 text-left">الخصم</th>
                        <th className="py-2.5 px-3 w-24 text-left">الضريبة</th>
                        <th className="py-2.5 px-3 w-32 text-left">الإجمالي</th>
                        <th className="py-2.5 px-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formLines.map((line, idx) => {
                        const lineTotal =
                          (Number(line.quantity) || 0) * (Number(line.unit_price) || 0) -
                          (Number(line.discount) || 0) +
                          (Number(line.tax) || 0);

                        const hasStockExceeded = line.itemId && line.availableQty !== undefined && Number(line.quantity) > line.availableQty;

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-2">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    placeholder="اكتب البيان أو اضغط F9 لاختيار صنف..."
                                    value={line.description}
                                    onKeyDown={e => {
                                      if (e.key === 'F9') {
                                        e.preventDefault();
                                        handleOpenItemLookup(idx);
                                      }
                                    }}
                                    onChange={e => updateLine(idx, 'description', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleOpenItemLookup(idx)}
                                    className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg border border-blue-200 text-[11px] font-bold flex items-center gap-1 transition shrink-0 cursor-pointer shadow-xs"
                                    title="بحث واستعلام عن الصنف (F9)"
                                  >
                                    <Search size={12} />
                                    <span>F9 استعلام</span>
                                  </button>
                                </div>
                                {line.itemId && (
                                  <div className="flex items-center gap-2 text-[10px] pr-1">
                                    <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold">
                                      {line.item_code || 'SKU'}
                                    </span>
                                    {line.availableQty !== undefined && (
                                      <span className={`px-1.5 py-0.5 rounded font-bold ${
                                        line.availableQty > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                      }`}>
                                        الرصيد المتاح: {line.availableQty} {line.unit || ''}
                                      </span>
                                    )}
                                    {hasStockExceeded && (
                                      <span className="text-rose-600 font-bold flex items-center gap-0.5 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                        <AlertTriangle size={10} />
                                        الكمية تتجاوز الرصيد المتاح ({line.availableQty})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={line.quantity}
                                onChange={e => updateLine(idx, 'quantity', e.target.value)}
                                className={`w-full px-2 py-1.5 bg-white border rounded-lg text-xs font-mono font-bold text-center focus:outline-none focus:ring-1 ${
                                  hasStockExceeded ? 'border-rose-400 bg-rose-50 text-rose-800' : 'border-slate-200 focus:ring-blue-500'
                                }`}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.unit_price}
                                onChange={e => updateLine(idx, 'unit_price', e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-left focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.discount}
                                onChange={e => updateLine(idx, 'discount', e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-left focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.tax}
                                onChange={e => updateLine(idx, 'tax', e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-left focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-2 font-mono font-bold text-slate-800 text-left">
                              {lineTotal.toLocaleString()}
                            </td>
                            <td className="p-2 text-center">
                              {formLines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeLine(idx)}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition cursor-pointer"
                                  title="حذف البند"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="flex flex-col md:flex-row justify-between gap-4 pt-2">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-bold text-slate-700">ملاحظات الفاتورة</label>
                  <textarea
                    rows={2}
                    placeholder="أي ملاحظات أو شروط خاصة بالفاتورة..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="w-full md:w-72 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>المجموع الفرعي:</span>
                    <span className="font-mono font-bold">{subtotal.toLocaleString()} ر.ي</span>
                  </div>
                  {totalDiscount > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>إجمالي الخصم:</span>
                      <span className="font-mono font-bold">-{totalDiscount.toLocaleString()} ر.ي</span>
                    </div>
                  )}
                  {totalTax > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>ضريبة المبيعات:</span>
                      <span className="font-mono font-bold">+{totalTax.toLocaleString()} ر.ي</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-2 flex justify-between font-black text-sm text-slate-900">
                    <span>الصافي النهائي:</span>
                    <span className="font-mono text-blue-600">{netTotal.toLocaleString()} ر.ي</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                إلغاء
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={formSubmitting}
                  onClick={() => handleSaveInvoice(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  {formSubmitting ? 'جاري الحفظ...' : 'حفظ كمسودة'}
                </button>
                <button
                  type="button"
                  disabled={formSubmitting}
                  onClick={() => handleSaveInvoice(true)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition cursor-pointer"
                >
                  {formSubmitting ? 'جاري المعالجة...' : 'حفظ وترحيل محاسبي فوري'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Modal: View & Print Invoice                               */}
      {/* ========================================================= */}
      {showViewModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 my-8 overflow-hidden">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white print:hidden">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-blue-400" />
                <span className="text-sm font-bold">فاتورة مبيعات رقم {selectedInvoice.invoice_number}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Printer size={14} />
                  <span>طباعة الفاتورة</span>
                </button>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="p-8 space-y-6 text-slate-800">
              {/* Header: Company & Tax Details */}
              <div className="flex items-start justify-between border-b border-slate-200 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-extrabold flex items-center justify-center text-lg">
                      K
                    </div>
                    <div>
                      <h2 className="text-lg font-black tracking-tight text-slate-900">
                        مجموعة كيان العالمية للتجارة والأنظمة
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        الجمهورية اليمنية - صنعاء | السجل التجاري: 104523 | الرقم الضريبي: 3004521098
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-left font-mono">
                  <div className="text-sm font-black text-blue-600">{selectedInvoice.invoice_number}</div>
                  <div className="text-xs text-slate-500 mt-0.5">التاريخ: {selectedInvoice.invoice_date}</div>
                  <div className="text-xs text-slate-500">
                    نوع الفاتورة: {selectedInvoice.payment_type === 'CASH' ? 'نقدي' : 'آجل'}
                  </div>
                </div>
              </div>

              {/* Customer Box */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block font-bold">بيانات العميل:</span>
                  <span className="font-bold text-slate-900 text-sm block mt-0.5">
                    {selectedInvoice.customerName}
                  </span>
                  <span className="font-mono text-slate-500 block">كود: {selectedInvoice.customerCode}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold">العنوان والتواصل:</span>
                  <span className="text-slate-700 block mt-0.5">
                    {selectedInvoice.customerPhone || '—'}
                  </span>
                  <span className="text-slate-500 block">
                    {selectedInvoice.customerAddress || 'المركز الرئيسي'}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-bold">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">البيان</th>
                      <th className="py-2.5 px-3 text-center">الكمية</th>
                      <th className="py-2.5 px-3 text-left">السعر</th>
                      <th className="py-2.5 px-3 text-left">الخصم</th>
                      <th className="py-2.5 px-3 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedInvoice.lines?.map((line, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{line.description}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold">{line.quantity}</td>
                        <td className="py-2.5 px-3 text-left font-mono">
                          {Number(line.unit_price).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono text-rose-600">
                          {Number(line.discount) > 0 ? Number(line.discount).toLocaleString() : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-bold text-slate-900">
                          {Number(line.line_total || line.quantity * line.unit_price).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>المجموع الفرعي:</span>
                    <span className="font-mono font-bold">
                      {parseFloat(selectedInvoice.subtotal).toLocaleString()} ر.ي
                    </span>
                  </div>
                  {parseFloat(selectedInvoice.discount) > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>إجمالي الخصم:</span>
                      <span className="font-mono font-bold">
                        -{parseFloat(selectedInvoice.discount).toLocaleString()} ر.ي
                      </span>
                    </div>
                  )}
                  {parseFloat(selectedInvoice.tax) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>ضريبة المبيعات:</span>
                      <span className="font-mono font-bold">
                        +{parseFloat(selectedInvoice.tax).toLocaleString()} ر.ي
                      </span>
                    </div>
                  )}
                  <div className="border-t border-slate-300 pt-1.5 flex justify-between text-sm font-black text-slate-900">
                    <span>المجموع الإجمالي:</span>
                    <span className="font-mono text-blue-600">
                      {parseFloat(selectedInvoice.total).toLocaleString()} ريال يمني
                    </span>
                  </div>
                </div>
              </div>

              {/* Automatic Accounting Section (Phase 3 Spec) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 size={15} className="text-emerald-600" />
                    <span>الأثر المحاسبي التلقائي (Automatic Accounting):</span>
                  </span>
                  {selectedInvoice.journalEntryNumber ? (
                    <span className="font-mono font-bold text-blue-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      رقم القيد: {selectedInvoice.journalEntryNumber}
                    </span>
                  ) : (
                    <span className="text-amber-600 font-bold">قيد الانتظار (مسودة)</span>
                  )}
                </div>

                {selectedInvoice.status === 'POSTED' ? (
                  <div className="text-slate-600 font-mono text-[11px] space-y-1 border-t border-slate-200 pt-2">
                    <div>
                      • الطرف المدين (DR):{' '}
                      {selectedInvoice.payment_type === 'CASH'
                        ? '1101 - الصندوق والخزينة'
                        : `1103 - ذمم العملاء (${selectedInvoice.customerName})`}{' '}
                      = {parseFloat(selectedInvoice.total).toLocaleString()} ر.ي
                    </div>
                    <div>
                      • الطرف الدائن (CR): 41 - إيرادات المبيعات ={' '}
                      {parseFloat(selectedInvoice.total).toLocaleString()} ر.ي
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 text-[11px]">
                    سيتم إنشاء وترحيل قيد اليومية المزدوج فور الضغط على زر اعتماد وترحيل الفاتورة أدناه.
                  </p>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between print:hidden">
              <button
                onClick={() => setShowViewModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                إغلاق
              </button>

              <div className="flex items-center gap-2">
                {selectedInvoice.status === 'DRAFT' && (
                  <button
                    onClick={() => handlePostInvoice(selectedInvoice.id, false)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer"
                  >
                    ترحيل واعتماد القيد المحاسبي الآن
                  </button>
                )}
                {selectedInvoice.status === 'POSTED' && (
                  <button
                    onClick={() => handleVoidInvoice(selectedInvoice.id)}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    إلغاء الفاتورة وعكس القيد المحاسبي
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credit Limit Override Modal */}
      {showOverrideConfirm && overrideTargetId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-right space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              تجاوز الحد الائتماني للعميل
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed text-center">
              قيمة هذه الفاتورة بالإضافة إلى الرصيد الحالي تتجاوز السقف الائتماني المسموح به لهذا العميل.
              هل ترغب بتأكيد الصلاحية وترحيل الفاتورة مع توثيق التجاوز في سجل التدقيق (Audit Log)؟
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  setShowOverrideConfirm(false);
                  setOverrideTargetId(null);
                }}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  const target = overrideTargetId;
                  setShowOverrideConfirm(false);
                  setOverrideTargetId(null);
                  handlePostInvoice(target, true);
                }}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 transition cursor-pointer"
              >
                تأكيد التجاوز والترحيل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
