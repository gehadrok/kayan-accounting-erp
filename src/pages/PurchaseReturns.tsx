import React, { useState, useEffect } from 'react';
import { useLookup } from '../context/LookupContext';
import { 
  Undo2, 
  Search, 
  Plus, 
  CheckCircle2, 
  X, 
  Package, 
  AlertCircle,
  Truck
} from 'lucide-react';

interface PurchaseReturn {
  id: string;
  return_number: string;
  supplierName: string;
  supplierCode: string;
  originalInvoiceNumber?: string;
  return_date: string;
  subtotal: string;
  tax: string;
  total: string;
  status: string;
  notes?: string;
  created_at: string;
}

export const PurchaseReturnsPage: React.FC = () => {
  const { openLookup } = useLookup();
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New return form state
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [originalInvoiceId, setOriginalInvoiceId] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  // PHASE 9.1 (P2): tax rate comes from Tax Configuration — never a hardcoded 15%
  const [taxCodes, setTaxCodes] = useState<any[]>([]);
  const [selectedTaxCodeId, setSelectedTaxCodeId] = useState('');
  const [lines, setLines] = useState<Array<{ itemId?: string; itemCode: string; description: string; quantity: number; unitPrice: number; tax: number }>>([
    { itemCode: '', description: '', quantity: 1, unitPrice: 0, tax: 0 }
  ]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resReturns, resSupp, resInv, resTax] = await Promise.all([
        fetch('/api/purchasing/returns'),
        fetch('/api/suppliers'),
        fetch('/api/purchasing/invoices'),
        fetch('/api/taxes/codes')
      ]);

      if (resReturns.ok) {
        setReturns(await resReturns.json());
      }
      if (resSupp.ok) {
        setSuppliers(await resSupp.json());
      }
      if (resInv.ok) {
        setInvoices(await resInv.json());
      }
      if (resTax.ok) {
        const taxData = await resTax.json();
        setTaxCodes(Array.isArray(taxData) ? taxData : []);
      }
    } catch (err: any) {
      console.error('Error fetching purchase returns:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenSupplierLookup = () => {
    openLookup('SUPPLIER', (s: any) => {
      if (!s || !s.id) return;
      setSelectedSupplierId(s.id);
      setSuppliers(prev => {
        if (!prev.some(x => x.id === s.id)) {
          return [...prev, s];
        }
        return prev;
      });
    });
  };

  // PHASE 9.1 (P2): dynamic tax rate from Tax Configuration (no code => 0%).
  const getSelectedTaxRate = () => {
    if (!selectedTaxCodeId) return 0;
    const tc = taxCodes.find(t => t.id === selectedTaxCodeId);
    return tc ? parseFloat(tc.rate_percentage || '0') / 100 : 0;
  };

  const handleTaxCodeChange = (taxCodeId: string) => {
    setSelectedTaxCodeId(taxCodeId);
    const tc = taxCodes.find(t => t.id === taxCodeId);
    const rate = tc ? parseFloat(tc.rate_percentage || '0') / 100 : 0;
    setLines(prev => prev.map(l => {
      const lineNet = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
      return { ...l, tax: Number((lineNet * rate).toFixed(2)) };
    }));
  };

  const handleOpenItemLookup = (index: number) => {
    openLookup('ITEM', (item: any) => {
      if (!item || !item.id) return;
      const price = parseFloat(item.purchasePrice || item.averageCost || item.purchase_price || 0);
      setLines(prev => {
        const next = [...prev];
        const current = next[index] || { itemCode: '', description: '', quantity: 1, unitPrice: 0, tax: 0 };
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
    setLines(prev => [...prev, { itemCode: '', description: '', quantity: 1, unitPrice: 0, tax: 0 }]);
  };

  const removeLine = (index: number) => {
    setLines(prev => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateLine = (index: number, field: string, value: any) => {
    setLines(prev => {
      const updated = [...prev];
      const target = { ...updated[index], [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = field === 'quantity' ? Number(value) || 0 : Number(target.quantity) || 0;
        const price = field === 'unitPrice' ? Number(value) || 0 : Number(target.unitPrice) || 0;
        target.tax = Number(((qty * price) * getSelectedTaxRate()).toFixed(2));
      }
      updated[index] = target;
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      setError('يرجى تحديد المورد');
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
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
        const errData = await res.json();
        throw new Error(errData.error || 'فشل في حفظ مردود المشتريات');
      }

      setIsModalOpen(false);
      setSelectedSupplierId('');
      setOriginalInvoiceId('');
      setSelectedTaxCodeId('');
      setNotes('');
      setLines([{ itemCode: 'PUR-RET', description: 'صنف مردود للمورد', quantity: 1, unitPrice: 0, tax: 0 }]);
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const totalReturnsAmount = returns.reduce((sum, r) => sum + parseFloat(r.total || '0'), 0);
  const filteredReturns = returns.filter(r => 
    r.return_number?.toLowerCase().includes(search.toLowerCase()) ||
    r.supplierName?.toLowerCase().includes(search.toLowerCase()) ||
    r.originalInvoiceNumber?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-amber-600 to-rose-600 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
            <Undo2 size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">مردودات المشتريات وإشعارات المدين</h1>
            <p className="text-xs text-slate-500 font-medium">إرجاع البضاعة للموردين، تخفيض الذمم الدائنة (AP 2101)، وتوليد القيود آلياً</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus size={18} />
            <span>تسجيل مردود مشتريات جديد</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>إجمالي مردودات المشتريات</span>
            <Undo2 size={16} className="text-amber-500" />
          </div>
          <p className="text-2xl font-black text-slate-800 mt-2 font-mono">
            {totalReturnsAmount.toLocaleString()} <span className="text-xs font-bold text-slate-400">YER</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">تخفض من تكلفة المشتريات والالتزامات للموردين</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>عدد الإشعارات المسجلة</span>
            <Package size={16} className="text-blue-500" />
          </div>
          <p className="text-2xl font-black text-slate-800 mt-2 font-mono">
            {returns.length}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">إشعارات خصم ومردود للموردين</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>الأثر المحاسبي</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <p className="text-lg font-bold text-emerald-600 mt-2">
            تخفيض حساب الموردين (AP)
          </p>
          <p className="text-[11px] text-slate-400 mt-1">قيد محاسبي مدين AP 2101 / دائن مشتريات 54</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between gap-4 bg-white p-3 rounded-xl border border-slate-200/80">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="بحث برقم المردود، اسم المورد، أو الفاتورة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>
      </div>

      {/* Returns Data Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-200/70">
              <tr>
                <th className="py-3 px-4">رقم الإشعار</th>
                <th className="py-3 px-4">المورد</th>
                <th className="py-3 px-4">الفاتورة الأصلية</th>
                <th className="py-3 px-4">تاريخ المردود</th>
                <th className="py-3 px-4 font-mono">المبلغ الصافي</th>
                <th className="py-3 px-4 font-mono">الضريبة</th>
                <th className="py-3 px-4 font-mono">الإجمالي</th>
                <th className="py-3 px-4 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    جاري تحميل سجل مردودات المشتريات...
                  </td>
                </tr>
              ) : filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Undo2 size={32} className="mx-auto mb-2 text-slate-300 opacity-60" />
                    <p className="font-semibold">لا توجد مردودات مشتريات مسجلة حتى الآن</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">يمكنك إضافة إشعار مردود مشتريات جديد بالضغط على الزر أعلاه</p>
                  </td>
                </tr>
              ) : (
                filteredReturns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-mono font-bold text-amber-700">
                      {ret.return_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800">{ret.supplierName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{ret.supplierCode}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {ret.originalInvoiceNumber || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {ret.return_date ? new Date(ret.return_date).toLocaleDateString('ar-YE') : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 font-semibold">
                      {parseFloat(ret.subtotal || '0').toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {parseFloat(ret.tax || '0').toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-mono font-extrabold text-slate-900">
                      {parseFloat(ret.total || '0').toLocaleString()} YER
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                        <CheckCircle2 size={11} />
                        مرحل
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Purchase Return Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl border border-slate-200 shadow-xl overflow-hidden my-8">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <Undo2 size={18} className="text-amber-600" />
                <h3 className="font-bold text-slate-800 text-sm">تسجيل مردود مشتريات جديد (إشعار مدين)</h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={15} />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">المورد *</label>
                    <button
                      type="button"
                      onClick={handleOpenSupplierLookup}
                      className="text-[10px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-0.5 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 cursor-pointer"
                      title="استعلام وبحث عن مورد (F9)"
                    >
                      <Search size={10} />
                      <span>F9 استعلام</span>
                    </button>
                  </div>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'F9') {
                        e.preventDefault();
                        handleOpenSupplierLookup();
                      }
                    }}
                    required
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    <option value="">-- اختر المورد أو اضغط F9 --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">فاتورة الشراء الأصلية</label>
                  <select
                    value={originalInvoiceId}
                    onChange={(e) => setOriginalInvoiceId(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    <option value="">-- بدون ربط بفاتورة محددة --</option>
                    {invoices
                      .filter(inv => !selectedSupplierId || inv.supplier_id === selectedSupplierId)
                      .map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoice_number} ({parseFloat(inv.total).toLocaleString()} YER)
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ المردود *</label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    required
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الضريبة المطبقة</label>
                  <select
                    value={selectedTaxCodeId}
                    onChange={(e) => handleTaxCodeChange(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    <option value="">بدون ضريبة (0%)</option>
                    {taxCodes.map((tc) => (
                      <option key={tc.id} value={tc.id}>
                        {tc.name} ({parseFloat(tc.rate_percentage || '0')}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">البيان / ملاحظات</label>
                <input
                  type="text"
                  placeholder="سبب إرجاع البضاعة للمورد وملاحظات الخصم..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Items Lines */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">الأصناف المرتجعة</span>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs text-amber-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={14} /> إضافة سطر
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto p-1">
                  {lines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="كود الصنف أو F9"
                          value={line.itemCode}
                          onKeyDown={(e) => {
                            if (e.key === 'F9') {
                              e.preventDefault();
                              handleOpenItemLookup(idx);
                            }
                          }}
                          onChange={(e) => updateLine(idx, 'itemCode', e.target.value)}
                          className="w-24 text-xs p-1.5 bg-white border border-slate-200 rounded font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleOpenItemLookup(idx)}
                          className="px-1.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded border border-amber-200 text-[10px] font-bold cursor-pointer"
                          title="استعلام عن الصنف (F9)"
                        >
                          F9
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="وصف الصنف المردود"
                        value={line.description}
                        onKeyDown={(e) => {
                          if (e.key === 'F9') {
                            e.preventDefault();
                            handleOpenItemLookup(idx);
                          }
                        }}
                        onChange={(e) => updateLine(idx, 'description', e.target.value)}
                        required
                        className="flex-1 text-xs p-1.5 bg-white border border-slate-200 rounded"
                      />
                      <input
                        type="number"
                        placeholder="الكمية"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, 'quantity', parseFloat(e.target.value) || 1)}
                        className="w-16 text-xs p-1.5 bg-white border border-slate-200 rounded font-mono text-center"
                      />
                      <input
                        type="number"
                        placeholder="السعر"
                        min="0"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        className="w-24 text-xs p-1.5 bg-white border border-slate-200 rounded font-mono text-left"
                      />
                      <span className="text-xs font-mono font-bold w-24 text-left">
                        {((line.quantity * line.unitPrice) + line.tax).toLocaleString()}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="text-slate-400 hover:text-rose-500 p-1"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Summary */}
              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-100 flex items-center justify-between text-xs font-bold text-amber-900">
                <span>إجمالي الخصم من حساب المورد:</span>
                <span className="font-mono text-base font-black">
                  {lines.reduce((sum, l) => sum + (l.quantity * l.unitPrice) + l.tax, 0).toLocaleString()} YER
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? 'جاري الترحيل...' : 'ترحيل مردود المشتريات وتخفيض الذمم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
