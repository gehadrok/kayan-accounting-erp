import React, { useState, useEffect } from 'react';
import { useLookup } from '../context/LookupContext';
import {
  Package,
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
  ExternalLink,
  Percent,
  Warehouse
} from 'lucide-react';

interface PurchaseInvoiceLine {
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
}

interface PurchaseInvoice {
  id: string;
  invoice_number: string;
  supplier_id: string;
  supplierName: string;
  supplierCode: string;
  supplierPhone?: string;
  supplierAddress?: string;
  supplierTaxNumber?: string;
  payment_type: 'CASH' | 'CREDIT';
  posting_type: 'EXPENSE' | 'INVENTORY';
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
  lines?: PurchaseInvoiceLine[];
}

interface SupplierOption {
  id: string;
  code: string;
  name: string;
  outstandingBalance: string;
  is_active: boolean;
}

interface TaxCodeOption {
  id: string;
  code: string;
  name: string;
  rate_percentage: string;
}

interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  location?: string;
}

export const PurchaseInvoicesPage: React.FC = () => {
  const { openLookup } = useLookup();
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCodeOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);

  // Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT'>('CREDIT');
  const [postingType, setPostingType] = useState<'EXPENSE' | 'INVENTORY'>('EXPENSE');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [selectedTaxCodeId, setSelectedTaxCodeId] = useState('');
  const [notes, setNotes] = useState('');
  const [formLines, setFormLines] = useState<PurchaseInvoiceLine[]>([
    { description: '', quantity: 1, unit_price: 0, discount: 0, tax: 0 }
  ]);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [invRes, suppRes, taxRes, whRes] = await Promise.all([
        fetch('/api/purchasing/invoices?limit=100'),
        fetch('/api/suppliers'),
        fetch('/api/taxes/codes'),
        fetch('/api/inventory/warehouses')
      ]);

      if (invRes.ok) {
        const invData = await invRes.json();
        setInvoices(invData);
      }
      if (suppRes.ok) {
        const suppData = await suppRes.json();
        setSuppliers(suppData.filter((s: SupplierOption) => s.is_active));
      }
      if (taxRes.ok) {
        const taxData = await taxRes.json();
        setTaxCodes(taxData);
      }
      if (whRes.ok) {
        const whData = await whRes.json();
        setWarehouses(whData);
        if (whData.length > 0 && !selectedWarehouseId) {
          setSelectedWarehouseId(whData[0].id);
        }
      }
    } catch (err) {
      console.error('Error loading purchasing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle Item Lookup Selection
  const handleOpenItemLookup = (lineIdx: number) => {
    openLookup('ITEM', (item: any) => {
      if (!item || !item.id) return;
      const price = parseFloat(item.purchasePrice || item.averageCost || item.purchase_price || 0);
      const available = parseFloat(item.availableQty !== undefined ? item.availableQty : (item.currentStock || 0));
      
      setFormLines(prev => {
        const next = [...prev];
        const current = next[lineIdx] || { description: '', quantity: 1, unit_price: 0, discount: 0, tax: 0 };
        const qty = Number(current.quantity) > 0 ? Number(current.quantity) : 1;
        const disc = Number(current.discount) || 0;
        const lineNet = Math.max(0, (qty * price) - disc);
        const currentTaxRate = selectedTaxCodeId 
          ? parseFloat(taxCodes.find(t => t.id === selectedTaxCodeId)?.rate_percentage || '0') / 100
          : 0;
        const taxVal = Number((lineNet * currentTaxRate).toFixed(2));

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
        };
        return next;
      });
    });
  };

  // Handle Supplier Lookup Selection
  const handleOpenSupplierLookup = () => {
    openLookup('SUPPLIER', (s: any) => {
      if (!s || !s.id) return;
      setSelectedSupplierId(s.id);
      setSuppliers(prev => {
        if (!prev.some(x => x.id === s.id)) {
          return [...prev, {
            id: s.id,
            code: s.code,
            name: s.name,
            outstandingBalance: s.balance || '0',
            is_active: true
          }];
        }
        return prev;
      });
    });
  };

  // Form Line Management
  const addLine = () => {
    setFormLines(prev => [
      ...prev,
      { description: '', quantity: 1, unit_price: 0, discount: 0, tax: 0 }
    ]);
  };

  const removeLine = (idx: number) => {
    setFormLines(prev => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  const updateLine = (idx: number, field: keyof PurchaseInvoiceLine, value: any) => {
    setFormLines(prev => {
      const updated = [...prev];
      const target = { ...updated[idx], [field]: value };
      const qty = field === 'quantity' ? Number(value) || 0 : Number(target.quantity) || 0;
      const price = field === 'unit_price' ? Number(value) || 0 : Number(target.unit_price) || 0;
      const disc = field === 'discount' ? Number(value) || 0 : Number(target.discount) || 0;
      const lineNet = Math.max(0, (qty * price) - disc);

      if (field === 'quantity' || field === 'unit_price' || field === 'discount') {
        const rate = selectedTaxCodeId 
          ? parseFloat(taxCodes.find(t => t.id === selectedTaxCodeId)?.rate_percentage || '0') / 100 
          : 0;
        target.tax = Number((lineNet * rate).toFixed(2));
      }
      target.line_total = lineNet + (Number(target.tax) || 0);
      updated[idx] = target;
      return updated;
    });
  };

  // When tax code is selected, update lines tax percentage
  const handleTaxCodeChange = (taxCodeId: string) => {
    setSelectedTaxCodeId(taxCodeId);
    const selected = taxCodes.find(t => t.id === taxCodeId);
    const rate = selected ? parseFloat(selected.rate_percentage) / 100 : 0;

    const updated = formLines.map(l => {
      const lineNet = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0) - (Number(l.discount) || 0);
      return {
        ...l,
        tax: lineNet > 0 ? lineNet * rate : 0
      };
    });
    setFormLines(updated);
  };

  const subtotal = formLines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
    0
  );
  const totalDiscount = formLines.reduce((sum, l) => sum + (Number(l.discount) || 0), 0);
  const totalTax = formLines.reduce((sum, l) => sum + (Number(l.tax) || 0), 0);
  const netTotal = subtotal - totalDiscount + totalTax;

  // Handle Save
  const handleSaveInvoice = async (postImmediately = false) => {
    setFormError(null);
    if (!selectedSupplierId) {
      setFormError('يرجى اختيار المورد');
      return;
    }
    if (formLines.some(l => !l.description.trim() || l.quantity <= 0 || l.unit_price <= 0)) {
      setFormError('يرجى تعبئة كافة البنود والكميات والأسعار بشكل صحيح');
      return;
    }

    try {
      setFormSubmitting(true);
      const res = await fetch('/api/purchasing/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: selectedSupplierId,
          paymentType,
          postingType,
          invoiceDate,
          dueDate,
          notes,
          lines: formLines.map(l => ({
            itemId: l.itemId,
            itemCode: l.item_code,
            description: l.description,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unit_price),
            discount: Number(l.discount) || 0,
            tax: Number(l.tax) || 0,
            taxCodeId: selectedTaxCodeId || null
          }))
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'فشل في حفظ الفاتورة');
      }

      const created = await res.json();

      if (postImmediately) {
        const postRes = await fetch(`/api/purchasing/invoices/${created.id}/post`, {
          method: 'POST'
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
    setSelectedSupplierId('');
    setPaymentType('CREDIT');
    setPostingType('EXPENSE');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setDueDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setSelectedTaxCodeId('');
    setNotes('');
    setFormLines([{ description: '', quantity: 1, unit_price: 0, discount: 0, tax: 0 }]);
    setFormError(null);
  };

  // Open Viewer
  const openInvoiceDetails = async (invId: string) => {
    try {
      const res = await fetch(`/api/purchasing/invoices/${invId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedInvoice(data);
        setShowViewModal(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Post Draft
  const handlePostInvoice = async (invId: string) => {
    try {
      const res = await fetch(`/api/purchasing/invoices/${invId}/post`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'فشل ترحيل الفاتورة');
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

  // Void
  const handleVoidInvoice = async (invId: string) => {
    if (!confirm('هل أنت متأكد من إلغاء فاتورة المشتريات وعكس قيدها المحاسبي؟')) {
      return;
    }
    try {
      const res = await fetch(`/api/purchasing/invoices/${invId}/void`, {
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
      inv.supplierName.toLowerCase().includes(search.toLowerCase()) ||
      (inv.supplierCode && inv.supplierCode.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    const matchesPayment = paymentFilter === 'ALL' || inv.payment_type === paymentFilter;

    return matchesSearch && matchesStatus && matchesPayment;
  });

  // KPI Calculations
  const totalPurchasesVolume = invoices
    .filter(i => i.status === 'POSTED')
    .reduce((sum, i) => sum + parseFloat(i.total || '0'), 0);

  const postedCount = invoices.filter(i => i.status === 'POSTED').length;
  const draftCount = invoices.filter(i => i.status === 'DRAFT').length;

  const totalPayablesDue = invoices
    .filter(i => i.status === 'POSTED' && i.payment_type === 'CREDIT')
    .reduce((sum, i) => sum + (parseFloat(i.total || '0') - parseFloat(i.paid_amount || '0')), 0);

  return (
    <div className="space-y-5 pb-8" dir="rtl">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Package size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">فواتير المشتريات</h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                تسجيل مشتريات البضائع والمصروفات، الرقابة على فترات السداد، وتوليد القيود المحاسبية التلقائية
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
        >
          <Plus size={16} />
          <span>إنشاء فاتورة مشتريات جديدة</span>
        </button>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">إجمالي المشتريات المرحلة</span>
            <span className="text-2xl font-black font-mono text-slate-900 block mt-1">
              {totalPurchasesVolume.toLocaleString()}
            </span>
            <span className="text-[11px] font-semibold text-blue-600 mt-0.5 block">
              ريال يمني (قيود مرحلة)
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <DollarSign size={22} />
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">الفواتير المرحلة</span>
            <span className="text-2xl font-black font-mono text-emerald-600 block mt-1">{postedCount}</span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">معتمدة في الأستاذ العام</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={22} />
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">مسودات المشتريات</span>
            <span className="text-2xl font-black font-mono text-amber-600 block mt-1">{draftCount}</span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">بانتظار الاعتماد والترحيل</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock size={22} />
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">المتبقي للدفع (ذمم الموردين)</span>
            <span className="text-2xl font-black font-mono text-rose-600 block mt-1">
              {totalPayablesDue.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">التزامات آجلة مستحقة السداد</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <CreditCard size={22} />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              type="text"
              placeholder="بحث برقم فاتورة المشتريات أو اسم المورد أو الكود..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {/* Status Filter */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  statusFilter === 'ALL' ? 'bg-white text-indigo-600 shadow-xs' : 'hover:text-slate-900'
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
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="ALL">طريقة السداد: الكل</option>
              <option value="CREDIT">آجل (ذمم موردين)</option>
              <option value="CASH">نقدي (صندوق/بنك)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold">
              <tr>
                <th className="py-3.5 px-4">رقم الفاتورة</th>
                <th className="py-3.5 px-4">التاريخ والاستحقاق</th>
                <th className="py-3.5 px-4">المورد</th>
                <th className="py-3.5 px-4">نوع الدفع والتوجيه</th>
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
                    جاري تحميل فواتير المشتريات...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-semibold">
                    لا توجد فواتير مشتريات مطابقة
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => {
                  const total = parseFloat(inv.total);
                  const paid = parseFloat(inv.paid_amount);
                  const remaining = total - paid;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-indigo-600">
                        <button
                          onClick={() => openInvoiceDetails(inv.id)}
                          className="hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>{inv.invoice_number}</span>
                          <ExternalLink size={12} className="opacity-60" />
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600">
                        <div>{inv.invoice_date}</div>
                        {inv.payment_type === 'CREDIT' && (
                          <div className="text-[11px] text-slate-400 font-normal">
                            استحقاق: {inv.due_date}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{inv.supplierName}</div>
                        <div className="text-[10px] font-mono text-slate-400">{inv.supplierCode}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          {inv.payment_type === 'CASH' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              نقدي
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              آجل
                            </span>
                          )}
                          <span className="text-[11px] text-slate-500 font-semibold">
                            {inv.posting_type === 'INVENTORY' ? 'مخزون' : 'مصروفات'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-black text-slate-900">
                        {total.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">ر.ي</span>
                      </td>

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

                      <td className="py-3.5 px-4">
                        {inv.journalEntryNumber ? (
                          <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                            {inv.journalEntryNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">بدون قيد (مسودة)</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openInvoiceDetails(inv.id)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="عرض وطباعة"
                          >
                            <Printer size={15} />
                          </button>

                          {inv.status === 'DRAFT' && (
                            <button
                              onClick={() => handlePostInvoice(inv.id)}
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
      {/* Modal: Create Purchase Invoice                            */}
      {/* ========================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200 my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <Package className="text-indigo-400" size={22} />
                <div>
                  <h2 className="text-base font-bold">إنشاء فاتورة مشتريات جديدة</h2>
                  <p className="text-[11px] text-slate-300">
                    تسجيل المشتريات وإثبات مديونية المورد وتوليد القيد المزدوج المتوازن
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

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              {/* Grid 1: Basic Details */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">المورد *</label>
                    <button
                      type="button"
                      onClick={handleOpenSupplierLookup}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200 transition cursor-pointer"
                      title="استعلام وبحث عن مورد (F9)"
                    >
                      <Search size={11} />
                      <span>F9 استعلام</span>
                    </button>
                  </div>
                  <select
                    value={selectedSupplierId}
                    onChange={e => setSelectedSupplierId(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'F9') {
                        e.preventDefault();
                        handleOpenSupplierLookup();
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">-- اختر المورد أو اضغط F9 --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code}) - رصيد مستحق: {parseFloat(s.outstandingBalance || '0').toLocaleString()} ر.ي
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">نوع السداد *</label>
                  <select
                    value={paymentType}
                    onChange={e => setPaymentType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="CREDIT">آجل (ذمم موردين - 2101)</option>
                    <option value="CASH">نقدي (الصندوق والخزينة - 1101)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">التوجيه المحاسبي *</label>
                  <select
                    value={postingType}
                    onChange={e => setPostingType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="EXPENSE">مصروفات وتكاليف شراء (54)</option>
                    <option value="INVENTORY">مخزون سلعي (1104)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">تاريخ الفاتورة *</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={e => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">تاريخ الاستحقاق</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-bold text-slate-700">الضريبة المطبقة</label>
                  <select
                    value={selectedTaxCodeId}
                    onChange={e => handleTaxCodeChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">بدون ضريبة (0%)</option>
                    {taxCodes.map(tc => (
                      <option key={tc.id} value={tc.id}>
                        {tc.name} ({parseFloat(tc.rate_percentage)}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Lines Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800">بنود وأصناف المشتريات</label>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>إضافة بند</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                      <tr>
                        <th className="py-2.5 px-3">البيان / الصنف / الخدمة</th>
                        <th className="py-2.5 px-3 w-24">الكمية</th>
                        <th className="py-2.5 px-3 w-32">السعر (ر.ي)</th>
                        <th className="py-2.5 px-3 w-24">الخصم</th>
                        <th className="py-2.5 px-3 w-24">الضريبة</th>
                        <th className="py-2.5 px-3 w-32">الإجمالي</th>
                        <th className="py-2.5 px-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formLines.map((line, idx) => {
                        const lineTotal =
                          (Number(line.quantity) || 0) * (Number(line.unit_price) || 0) -
                          (Number(line.discount) || 0) +
                          (Number(line.tax) || 0);

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-2">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    placeholder="وصف الصنف أو اضغط F9 للاختيار..."
                                    value={line.description}
                                    onKeyDown={e => {
                                      if (e.key === 'F9') {
                                        e.preventDefault();
                                        handleOpenItemLookup(idx);
                                      }
                                    }}
                                    onChange={e => updateLine(idx, 'description', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleOpenItemLookup(idx)}
                                    className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200 text-[11px] font-bold flex items-center gap-1 transition shrink-0 cursor-pointer shadow-xs"
                                    title="بحث واستعلام عن الصنف (F9)"
                                  >
                                    <Search size={12} />
                                    <span>F9 استعلام</span>
                                  </button>
                                </div>
                                {line.item_code && (
                                  <div className="flex items-center gap-1.5 text-[10px]">
                                    <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">
                                      {line.item_code}
                                    </span>
                                    {line.availableQty !== undefined && (
                                      <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                                        الرصيد الحالي: {line.availableQty} {line.unit || ''}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="1"
                                value={line.quantity}
                                onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                value={line.unit_price}
                                onChange={e => updateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-left focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                value={line.discount}
                                onChange={e => updateLine(idx, 'discount', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-left focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                value={line.tax}
                                onChange={e => updateLine(idx, 'tax', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-left focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition"
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
                  <label className="text-xs font-bold text-slate-700">ملاحظات وشروط الفاتورة</label>
                  <textarea
                    rows={2}
                    placeholder="أي ملاحظات أو بيانات إضافية..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                      <span>ضريبة القيمة المضافة (مدخلات):</span>
                      <span className="font-mono font-bold">+{totalTax.toLocaleString()} ر.ي</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-2 flex justify-between font-black text-sm text-slate-900">
                    <span>الصافي النهائي:</span>
                    <span className="font-mono text-indigo-600">{netTotal.toLocaleString()} ر.ي</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
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
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition cursor-pointer"
                >
                  {formSubmitting ? 'جاري المعالجة...' : 'حفظ وترحيل محاسبي فوري'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Modal: View & Print Purchase Invoice                      */}
      {/* ========================================================= */}
      {showViewModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 my-8 overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white print:hidden">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-indigo-400" />
                <span className="text-sm font-bold">فاتورة مشتريات رقم {selectedInvoice.invoice_number}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
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

            <div className="p-8 space-y-6 text-slate-800">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-200 pb-5">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-extrabold flex items-center justify-center text-lg">
                    K
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">
                      مجموعة كيان العالمية للتجارة والأنظمة
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      فاتورة مشتريات ضريبية معتمدة | الرقم الضريبي: 3004521098
                    </p>
                  </div>
                </div>

                <div className="text-left font-mono">
                  <div className="text-sm font-black text-indigo-600">{selectedInvoice.invoice_number}</div>
                  <div className="text-xs text-slate-500 mt-0.5">التاريخ: {selectedInvoice.invoice_date}</div>
                  <div className="text-xs text-slate-500">
                    نوع السداد: {selectedInvoice.payment_type === 'CASH' ? 'نقدي' : 'آجل'}
                  </div>
                </div>
              </div>

              {/* Supplier Box */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block font-bold">بيانات المورد:</span>
                  <span className="font-bold text-slate-900 text-sm block mt-0.5">
                    {selectedInvoice.supplierName}
                  </span>
                  <span className="font-mono text-slate-500 block">كود: {selectedInvoice.supplierCode}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold">التواصل والضريبة:</span>
                  <span className="text-slate-700 block mt-0.5">
                    {selectedInvoice.supplierPhone || '—'}
                  </span>
                  <span className="text-slate-500 block font-mono">
                    الرقم الضريبي: {selectedInvoice.supplierTaxNumber || 'غير متوفر'}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">البيان</th>
                      <th className="py-2.5 px-3 text-center">الكمية</th>
                      <th className="py-2.5 px-3 text-left">السعر</th>
                      <th className="py-2.5 px-3 text-left">الخصم</th>
                      <th className="py-2.5 px-3 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {selectedInvoice.lines?.map((line, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-sans font-semibold text-slate-800">{line.description}</td>
                        <td className="py-2 px-3 text-center font-bold">{line.quantity}</td>
                        <td className="py-2 px-3 text-left">{Number(line.unit_price).toLocaleString()}</td>
                        <td className="py-2 px-3 text-left text-rose-600">
                          {Number(line.discount) > 0 ? Number(line.discount).toLocaleString() : '—'}
                        </td>
                        <td className="py-2 px-3 text-left font-bold text-slate-900">
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
                      <span>ضريبة القيمة المضافة:</span>
                      <span className="font-mono font-bold">
                        +{parseFloat(selectedInvoice.tax).toLocaleString()} ر.ي
                      </span>
                    </div>
                  )}
                  <div className="border-t border-slate-300 pt-1.5 flex justify-between text-sm font-black text-slate-900">
                    <span>المجموع الإجمالي:</span>
                    <span className="font-mono text-indigo-600">
                      {parseFloat(selectedInvoice.total).toLocaleString()} ريال يمني
                    </span>
                  </div>
                </div>
              </div>

              {/* Automatic Accounting Section */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 size={15} className="text-emerald-600" />
                    <span>الأثر المحاسبي التلقائي (Automatic Accounting):</span>
                  </span>
                  {selectedInvoice.journalEntryNumber ? (
                    <span className="font-mono font-bold text-indigo-600 bg-white px-2 py-0.5 rounded border border-slate-200">
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
                      {selectedInvoice.posting_type === 'INVENTORY'
                        ? '1104 - المخزون السلعي'
                        : '54 - مشتريات بضائع وتكاليف الشراء'}{' '}
                      = {(parseFloat(selectedInvoice.subtotal) - parseFloat(selectedInvoice.discount)).toLocaleString()} ر.ي
                      {parseFloat(selectedInvoice.tax) > 0 && ` + 1105 ضريبة المدخلات (${parseFloat(selectedInvoice.tax).toLocaleString()} ر.ي)`}
                    </div>
                    <div>
                      • الطرف الدائن (CR):{' '}
                      {selectedInvoice.payment_type === 'CASH'
                        ? '1101 - الصندوق والخزينة'
                        : `2101 - الموردون والدائنون (${selectedInvoice.supplierName})`}{' '}
                      = {parseFloat(selectedInvoice.total).toLocaleString()} ر.ي
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 text-[11px]">
                    سيتم إنشاء وترحيل قيد اليومية المزدوج فور الضغط على زر اعتماد وترحيل الفاتورة.
                  </p>
                )}
              </div>
            </div>

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
                    onClick={() => handlePostInvoice(selectedInvoice.id)}
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
    </div>
  );
};
