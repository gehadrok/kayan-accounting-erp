import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Search,
  Plus,
  Printer,
  CheckCircle2,
  Clock,
  Ban,
  Building2,
  Landmark,
  Wallet,
  X,
  AlertTriangle,
  ExternalLink,
  Receipt,
  ArrowRight,
  Percent
} from 'lucide-react';

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
  customer_id: string;
  customerName: string;
  customerCode: string;
  payment_method: 'CASH' | 'BANK';
  target_account_id: string;
  targetAccountName: string;
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
  allocations?: ReceiptAllocation[];
}

interface CustomerOption {
  id: string;
  code: string;
  name: string;
  outstandingBalance: string;
  is_active: boolean;
}

interface UnpaidInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: string;
  paid_amount: string;
  remainingAmount: number;
}

export const ReceiptsPage: React.FC = () => {
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptItem | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);

  // Form State
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [amount, setAmount] = useState<string>('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [allocations, setAllocations] = useState<{ [invoiceId: string]: number }>({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [recRes, custRes] = await Promise.all([
        fetch('/api/sales/receipts?limit=100'),
        fetch('/api/customers')
      ]);

      if (recRes.ok) {
        const recData = await recRes.json();
        setReceipts(recData);
      }
      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomers(custData.filter((c: CustomerOption) => c.is_active));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch unpaid invoices when customer changes in modal
  useEffect(() => {
    if (!customerId) {
      setUnpaidInvoices([]);
      setAllocations({});
      return;
    }

    const fetchUnpaid = async () => {
      try {
        const res = await fetch(`/api/customers/${customerId}/unpaid-invoices`);
        if (res.ok) {
          const invs = await res.json();
          setUnpaidInvoices(invs);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchUnpaid();
  }, [customerId]);

  // Auto-allocate amount across oldest invoices
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
    setAllocations(prev => ({
      ...prev,
      [invId]: Math.max(0, val)
    }));
  };

  const totalAllocated = Object.values(allocations).reduce((sum, v) => sum + (v || 0), 0);
  const parsedAmount = parseFloat(amount) || 0;
  const unallocatedRemaining = parsedAmount - totalAllocated;

  // Handle Save
  const handleSaveReceipt = async (postImmediately = false) => {
    setFormError(null);
    if (!customerId) {
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

    try {
      setFormSubmitting(true);
      const allocPayload = Object.entries(allocations)
        .filter(([_, val]) => val > 0)
        .map(([invoiceId, amt]) => ({ invoiceId, amount: amt }));

      const res = await fetch('/api/sales/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          paymentMethod,
          receiptDate,
          amount: parsedAmount,
          referenceNumber: referenceNumber || null,
          description: description || `سند قبض من العميل ${customers.find(c => c.id === customerId)?.name}`,
          allocations: allocPayload
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'فشل في حفظ سند القبض');
      }

      const created = await res.json();

      if (postImmediately) {
        const postRes = await fetch(`/api/sales/receipts/${created.id}/post`, {
          method: 'POST'
        });
        if (!postRes.ok) {
          const postData = await postRes.json();
          throw new Error(postData.error || 'تم حفظ السند كمسودة ولكن تعذر ترحيله');
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
    setCustomerId('');
    setPaymentMethod('CASH');
    setAmount('');
    setReceiptDate(new Date().toISOString().split('T')[0]);
    setReferenceNumber('');
    setDescription('');
    setUnpaidInvoices([]);
    setAllocations({});
    setFormError(null);
  };

  // View Receipt Details
  const openReceiptDetails = async (recId: string) => {
    try {
      const res = await fetch(`/api/sales/receipts/${recId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedReceipt(data);
        setShowViewModal(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Post Draft Receipt
  const handlePostReceipt = async (recId: string) => {
    try {
      const res = await fetch(`/api/sales/receipts/${recId}/post`, {
        method: 'POST'
      });
      if (res.ok) {
        loadData();
        if (selectedReceipt && selectedReceipt.id === recId) {
          openReceiptDetails(recId);
        }
      } else {
        const data = await res.json();
        alert(data.error || 'فشل ترحيل السند');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Filtering
  const filteredReceipts = receipts.filter(r => {
    const matchesSearch =
      r.receipt_number.toLowerCase().includes(search.toLowerCase()) ||
      r.customerName.toLowerCase().includes(search.toLowerCase()) ||
      (r.reference_number && r.reference_number.toLowerCase().includes(search.toLowerCase()));

    const matchesMethod = methodFilter === 'ALL' || r.payment_method === methodFilter;
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;

    return matchesSearch && matchesMethod && matchesStatus;
  });

  // KPI Calculations
  const totalReceiptsAmount = receipts
    .filter(r => r.status === 'POSTED')
    .reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);

  const cashReceipts = receipts
    .filter(r => r.status === 'POSTED' && r.payment_method === 'CASH')
    .reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);

  const bankReceipts = receipts
    .filter(r => r.status === 'POSTED' && r.payment_method === 'BANK')
    .reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);

  const draftReceiptsCount = receipts.filter(r => r.status === 'DRAFT').length;

  return (
    <div className="space-y-5 pb-8" dir="rtl">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
              <Receipt size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">سندات القبض والتحصيل</h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                إثبات المقبوضات النقدية والبنكية، تخصيص السداد على فواتير المبيعات، وتوليد القيود المحاسبية آلياً
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
        >
          <Plus size={16} />
          <span>سند قبض جديد</span>
        </button>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Receipts */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">إجمالي المقبوضات المعتمدة</span>
            <span className="text-2xl font-black font-mono text-slate-900 block mt-1">
              {totalReceiptsAmount.toLocaleString()}
            </span>
            <span className="text-[11px] font-semibold text-emerald-600 mt-0.5 block">
              ريال يمني (سندات مرحلة)
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <DollarSign size={22} />
          </div>
        </div>

        {/* Card 2: Cash Receipts */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">مقبوضات الصندوق والخزينة</span>
            <span className="text-2xl font-black font-mono text-blue-600 block mt-1">
              {cashReceipts.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">حساب 1101 الصندوق الرئيسي</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Wallet size={22} />
          </div>
        </div>

        {/* Card 3: Bank Receipts */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">مقبوضات البنوك والحوالات</span>
            <span className="text-2xl font-black font-mono text-indigo-600 block mt-1">
              {bankReceipts.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">حساب 1102 حسابات البنوك</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Landmark size={22} />
          </div>
        </div>

        {/* Card 4: Draft Receipts */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">سندات قيد الاعتماد</span>
            <span className="text-2xl font-black font-mono text-amber-600 block mt-1">
              {draftReceiptsCount}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">مسودة بانتظار الترحيل</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock size={22} />
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
              placeholder="بحث برقم السند أو اسم العميل أو المرجع..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-800"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {/* Status Filter */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  statusFilter === 'ALL' ? 'bg-white text-emerald-600 shadow-xs' : 'hover:text-slate-900'
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
                مرحل
              </button>
              <button
                onClick={() => setStatusFilter('DRAFT')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  statusFilter === 'DRAFT' ? 'bg-white text-amber-600 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                مسودة
              </button>
            </div>

            {/* Payment Method Filter */}
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="ALL">طريقة القبض: الكل</option>
              <option value="CASH">نقدي (الصندوق 1101)</option>
              <option value="BANK">بنكي (البنك 1102)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold">
              <tr>
                <th className="py-3.5 px-4">رقم السند</th>
                <th className="py-3.5 px-4">التاريخ</th>
                <th className="py-3.5 px-4">العميل</th>
                <th className="py-3.5 px-4">طريقة القبض والحساب</th>
                <th className="py-3.5 px-4">المبلغ</th>
                <th className="py-3.5 px-4">التخصيص على فواتير</th>
                <th className="py-3.5 px-4">الحالة</th>
                <th className="py-3.5 px-4">القيد المحاسبي</th>
                <th className="py-3.5 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-semibold">
                    جاري تحميل سندات القبض...
                  </td>
                </tr>
              ) : filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-semibold">
                    لا توجد سندات قبض مطابقة
                  </td>
                </tr>
              ) : (
                filteredReceipts.map(rec => {
                  const amt = parseFloat(rec.amount);
                  const alloc = parseFloat(rec.allocated_amount);

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Receipt Number */}
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-700">
                        <button
                          onClick={() => openReceiptDetails(rec.id)}
                          className="hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>{rec.receipt_number}</span>
                          <ExternalLink size={12} className="opacity-60" />
                        </button>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-slate-600">{rec.receipt_date}</td>

                      {/* Customer */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{rec.customerName}</div>
                        <div className="text-[10px] font-mono text-slate-400">{rec.customerCode}</div>
                      </td>

                      {/* Payment Method & Target Account */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          {rec.payment_method === 'CASH' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              نقدي
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              بنكي
                            </span>
                          )}
                          <span className="text-[11px] text-slate-500 font-semibold">
                            {rec.targetAccountName}
                          </span>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 font-mono font-black text-slate-900">
                        {amt.toLocaleString()}{' '}
                        <span className="text-[10px] font-normal text-slate-400">ر.ي</span>
                      </td>

                      {/* Allocation */}
                      <td className="py-3.5 px-4 font-mono">
                        {alloc > 0 ? (
                          <span className="text-emerald-700 font-bold">
                            {alloc.toLocaleString()} ر.ي
                          </span>
                        ) : (
                          <span className="text-slate-400">غير مخصص</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {rec.status === 'POSTED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} />
                            <span>مرحل</span>
                          </span>
                        )}
                        {rec.status === 'DRAFT' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock size={12} />
                            <span>مسودة</span>
                          </span>
                        )}
                      </td>

                      {/* Journal Entry */}
                      <td className="py-3.5 px-4">
                        {rec.journalEntryNumber ? (
                          <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                            {rec.journalEntryNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">بدون قيد (مسودة)</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openReceiptDetails(rec.id)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="عرض وطباعة السند"
                          >
                            <Printer size={15} />
                          </button>

                          {rec.status === 'DRAFT' && (
                            <button
                              onClick={() => handlePostReceipt(rec.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition-colors cursor-pointer"
                              title="ترحيل السند واعتماد القيد المحاسبي"
                            >
                              ترحيل
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
      {/* Modal: Create Receipt                                     */}
      {/* ========================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between p-5 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <Receipt className="text-emerald-400" size={22} />
                <div>
                  <h2 className="text-base font-bold">إنشاء سند قبض جديد</h2>
                  <p className="text-[11px] text-slate-300">
                    تسجيل الدفعات النقدية أو البنكية وتخفيض مديونية العميل آلياً
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">العميل المقبوض منه *</label>
                  <select
                    value={customerId}
                    onChange={e => setCustomerId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">-- اختر العميل --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} (رصيد مدين: {parseFloat(c.outstandingBalance || '0').toLocaleString()} ر.ي)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">مبلغ سند القبض (ر.ي) *</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="أدخل المبلغ المقبوض..."
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-left focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                {/* Payment Method */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">طريقة القبض والإيداع *</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="CASH">نقداً - الصندوق والخزينة الرئيسية (1101)</option>
                    <option value="BANK">بنكي - حسابات البنوك وشيكات (1102)</option>
                  </select>
                </div>

                {/* Receipt Date */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">تاريخ السند *</label>
                  <input
                    type="date"
                    value={receiptDate}
                    onChange={e => setReceiptDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                {/* Reference Number */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">الرقم المرجعي (رقم الشيك أو الحوالة)</label>
                  <input
                    type="text"
                    placeholder="مثال: CHQ-8902 أو TR-4421"
                    value={referenceNumber}
                    onChange={e => setReferenceNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">البيان / الوصف</label>
                  <input
                    type="text"
                    placeholder="بيان المقبوضات..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              {/* Unpaid Invoices Allocation Section */}
              {customerId && (
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-slate-900">
                        تخصيص السند على فواتير المبيعات غير المسددة
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        اختر الفواتير المراد تسويتها بهذا السند أو اضغط تخصيص تلقائي
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={parsedAmount <= 0}
                      onClick={handleAutoAllocate}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowRight size={13} />
                      <span>تخصيص تلقائي على الأقدم</span>
                    </button>
                  </div>

                  {unpaidInvoices.length === 0 ? (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                      لا توجد فواتير مبيعات آجلة غير مسددة لهذا العميل حالياً. سيُسجل المبلغ كرصيد دائن غير مخصص للعميل.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                          <tr>
                            <th className="py-2 px-3">رقم الفاتورة</th>
                            <th className="py-2 px-3">التاريخ</th>
                            <th className="py-2 px-3">إجمالي الفاتورة</th>
                            <th className="py-2 px-3">المتبقي غير المسدد</th>
                            <th className="py-2 px-3 w-36">المبلغ المخصص (ر.ي)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {unpaidInvoices.map(inv => (
                            <tr key={inv.id} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3 font-bold text-blue-600">
                                {inv.invoice_number}
                              </td>
                              <td className="py-2 px-3 text-slate-600 font-sans">{inv.invoice_date}</td>
                              <td className="py-2 px-3">{parseFloat(inv.total).toLocaleString()}</td>
                              <td className="py-2 px-3 text-rose-600 font-bold">
                                {inv.remainingAmount.toLocaleString()}
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="number"
                                  min="0"
                                  max={inv.remainingAmount}
                                  value={allocations[inv.id] || ''}
                                  placeholder="0"
                                  onChange={e =>
                                    handleAllocationChange(inv.id, parseFloat(e.target.value) || 0)
                                  }
                                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-left focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Allocation Status Indicator */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                    <span className="text-slate-600">
                      مبلغ السند:{' '}
                      <strong className="text-slate-900 font-mono font-bold">
                        {parsedAmount.toLocaleString()} ر.ي
                      </strong>
                    </span>
                    <span className="text-emerald-700">
                      إجمالي المخصص للفواتير:{' '}
                      <strong className="font-mono font-bold">
                        {totalAllocated.toLocaleString()} ر.ي
                      </strong>
                    </span>
                    <span className="text-slate-600">
                      المتبقي غير المخصص:{' '}
                      <strong
                        className={`font-mono font-bold ${
                          unallocatedRemaining < 0 ? 'text-rose-600' : 'text-slate-800'
                        }`}
                      >
                        {unallocatedRemaining.toLocaleString()} ر.ي
                      </strong>
                    </span>
                  </div>
                </div>
              )}
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
                  onClick={() => handleSaveReceipt(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  {formSubmitting ? 'جاري الحفظ...' : 'حفظ كمسودة'}
                </button>
                <button
                  type="button"
                  disabled={formSubmitting}
                  onClick={() => handleSaveReceipt(true)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer"
                >
                  {formSubmitting ? 'جاري الترحيل...' : 'حفظ وترحيل محاسبي فوري'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Modal: View & Print Receipt                               */}
      {/* ========================================================= */}
      {showViewModal && selectedReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 my-8 overflow-hidden">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white print:hidden">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-emerald-400" />
                <span className="text-sm font-bold">سند قبض رقم {selectedReceipt.receipt_number}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Printer size={14} />
                  <span>طباعة السند</span>
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
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-200 pb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-extrabold flex items-center justify-center text-xl">
                    K
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900">
                      مجموعة كيان العالمية للاستثمار والتجارة
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      سند قبض رسمي معتمد | الرقم الضريبي: 3004521098
                    </p>
                  </div>
                </div>

                <div className="text-left font-mono">
                  <div className="text-sm font-black text-emerald-700">
                    {selectedReceipt.receipt_number}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">التاريخ: {selectedReceipt.receipt_date}</div>
                </div>
              </div>

              {/* Receipt Content Layout */}
              <div className="space-y-4 text-xs leading-relaxed">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-500 w-28">وصلنا من المكرم / السيد:</span>
                    <span className="font-black text-slate-900 text-sm">{selectedReceipt.customerName}</span>
                    <span className="font-mono text-slate-400">({selectedReceipt.customerCode})</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-500 w-28">مبلغ وقدره:</span>
                    <span className="font-mono font-black text-emerald-700 text-base">
                      {parseFloat(selectedReceipt.amount).toLocaleString()} ريال يمني
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-500 w-28">طريقة القبض:</span>
                    <span className="font-bold text-slate-800">
                      {selectedReceipt.payment_method === 'CASH'
                        ? 'نقداً إلى الصندوق والخزينة الرئيسية (1101)'
                        : `شيك / حوالة بنكية إلى ${selectedReceipt.targetAccountName}`}
                    </span>
                    {selectedReceipt.reference_number && (
                      <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                        رقم المرجع: {selectedReceipt.reference_number}
                      </span>
                    )}
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="font-bold text-slate-500 w-28">وذلك عن:</span>
                    <span className="font-semibold text-slate-800 flex-1">
                      {selectedReceipt.description || 'سداد دفعات مبيعات وحسابات مدينة'}
                    </span>
                  </div>
                </div>

                {/* Allocations Table */}
                {selectedReceipt.allocations && selectedReceipt.allocations.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="font-bold text-slate-700 block">الفواتير المسددة بموجب هذا السند:</span>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold">
                          <tr>
                            <th className="py-2 px-3">رقم الفاتورة</th>
                            <th className="py-2 px-3">إجمالي الفاتورة</th>
                            <th className="py-2 px-3 text-left">المبلغ المسدد بهذا السند</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {selectedReceipt.allocations.map((a, idx) => (
                            <tr key={idx}>
                              <td className="py-2 px-3 font-bold text-blue-600">{a.invoiceNumber}</td>
                              <td className="py-2 px-3">{parseFloat(a.invoiceTotal).toLocaleString()} ر.ي</td>
                              <td className="py-2 px-3 text-left font-bold text-emerald-700">
                                {Number(a.allocated_amount).toLocaleString()} ر.ي
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Automatic Accounting Section */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 size={15} className="text-emerald-600" />
                      <span>الأثر المحاسبي التلقائي (Automatic Accounting):</span>
                    </span>
                    {selectedReceipt.journalEntryNumber ? (
                      <span className="font-mono font-bold text-blue-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                        رقم القيد: {selectedReceipt.journalEntryNumber}
                      </span>
                    ) : (
                      <span className="text-amber-600 font-bold">مسودة قيد الانتظار</span>
                    )}
                  </div>

                  {selectedReceipt.status === 'POSTED' ? (
                    <div className="text-slate-600 font-mono text-[11px] space-y-1 border-t border-slate-200 pt-2">
                      <div>
                        • الطرف المدين (DR): {selectedReceipt.targetAccountName} ={' '}
                        {parseFloat(selectedReceipt.amount).toLocaleString()} ر.ي
                      </div>
                      <div>
                        • الطرف الدائن (CR): 1103 - ذمم العملاء ({selectedReceipt.customerName}) ={' '}
                        {parseFloat(selectedReceipt.amount).toLocaleString()} ر.ي
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-[11px]">
                      سيتم إنشاء وترحيل قيد اليومية المزدوج فور الضغط على زر اعتماد وترحيل السند.
                    </p>
                  )}
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-3 gap-4 pt-8 text-center text-xs">
                  <div>
                    <span className="block text-slate-400 font-bold mb-8">أمين الصندوق / البنك</span>
                    <span className="border-t border-slate-300 pt-1 block w-32 mx-auto font-semibold text-slate-700">
                      التوقيع
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-bold mb-8">المحاسب المسؤول</span>
                    <span className="border-t border-slate-300 pt-1 block w-32 mx-auto font-semibold text-slate-700">
                      التوقيع والختم
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-bold mb-8">المستلم / العميل</span>
                    <span className="border-t border-slate-300 pt-1 block w-32 mx-auto font-semibold text-slate-700">
                      التوقيع
                    </span>
                  </div>
                </div>
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

              {selectedReceipt.status === 'DRAFT' && (
                <button
                  onClick={() => handlePostReceipt(selectedReceipt.id)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer"
                >
                  ترحيل واعتماد القيد المحاسبي الآن
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
