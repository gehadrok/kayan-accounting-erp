import React, { useState, useEffect } from 'react';
import { 
  ArrowLeftRight, 
  Search, 
  Plus, 
  Warehouse, 
  Package, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Calendar,
  CheckCircle2,
  X,
  Layers
} from 'lucide-react';

export const InventoryTransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'transactions' | 'transfers'>('transactions');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Transfer form state
  const [fromWhId, setFromWhId] = useState('');
  const [toWhId, setToWhId] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resTx, resTr, resWh, resItems] = await Promise.all([
        fetch('/api/inventory/transactions?limit=100'),
        fetch('/api/inventory/transfers'),
        fetch('/api/inventory/warehouses'),
        fetch('/api/inventory/items')
      ]);

      if (resTx.ok) setTransactions(await resTx.json());
      if (resTr.ok) setTransfers(await resTr.json());
      if (resWh.ok) setWarehouses(await resWh.json());
      if (resItems.ok) setItems(await resItems.json());
    } catch (err) {
      console.error('Error fetching inventory transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromWhId === toWhId) {
      alert('لا يمكن التحويل لنفس المستودع! يرجى اختيار مستودعين مختلفين.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromWarehouseId: fromWhId,
          toWarehouseId: toWhId,
          transferDate,
          notes,
          lines: [{ itemId: selectedItemId, quantity, unitCost: 0 }],
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'فشل في حفظ التحويل المخزني');
      }

      setIsModalOpen(false);
      setNotes('');
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-cyan-600 to-blue-700 text-white flex items-center justify-center shadow-md shadow-cyan-500/20">
            <ArrowLeftRight size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">حركات المخزون والتحويلات المستودعية</h1>
            <p className="text-xs text-slate-500 font-medium">سجل الحركات الصادرة والواردة، مذكرات الصرف والتوريد، والتحويل بين المستودعات</p>
          </div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
        >
          <Plus size={16} />
          <span>إنشاء تحويل بين المستودعات</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
            activeTab === 'transactions'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Package size={15} />
          <span>حركات المخزون ({transactions.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('transfers')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
            activeTab === 'transfers'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ArrowLeftRight size={15} />
          <span>التحويلات المستودعية ({transfers.length})</span>
        </button>
      </div>

      {activeTab === 'transactions' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">رقم الحركة</th>
                  <th className="py-3 px-4">نوع الحركة</th>
                  <th className="py-3 px-4">المستودع</th>
                  <th className="py-3 px-4 font-mono">التاريخ</th>
                  <th className="py-3 px-4">المرجع والبيان</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      جاري تحميل حركات المخزون...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      لا توجد حركات مخزنية مسجلة
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">
                        {tx.transaction_number}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-800">
                          {tx.transaction_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {tx.warehouse_name || tx.warehouse_id}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString('ar-YE') : '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {tx.notes || tx.reference_type || '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 size={11} />
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'transfers' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">رقم التحويل</th>
                  <th className="py-3 px-4">من مستودع</th>
                  <th className="py-3 px-4">إلى مستودع</th>
                  <th className="py-3 px-4 font-mono">التاريخ</th>
                  <th className="py-3 px-4">ملاحظات</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      لا توجد تحويلات مستودعية مسجلة
                    </td>
                  </tr>
                ) : (
                  transfers.map((tr) => (
                    <tr key={tr.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">
                        {tr.transfer_number}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {tr.fromWarehouseName || tr.from_warehouse_id}
                      </td>
                      <td className="py-3 px-4 font-semibold text-emerald-700">
                        {tr.toWarehouseName || tr.to_warehouse_id}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {tr.transfer_date ? new Date(tr.transfer_date).toLocaleDateString('ar-YE') : '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {tr.notes || '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 size={11} />
                          {tr.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Transfer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowLeftRight size={18} className="text-blue-600" />
                <h3 className="font-bold text-sm text-slate-800">تحويل مخزني بين المستودعات</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleCreateTransfer} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">من مستودع (المصدر) *</label>
                  <select
                    value={fromWhId} onChange={(e) => setFromWhId(e.target.value)} required
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="">-- اختر مستودع المصدر --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">إلى مستودع (الوجهة) *</label>
                  <select
                    value={toWhId} onChange={(e) => setToWhId(e.target.value)} required
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="">-- اختر مستودع الوجهة --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">الصنف المحول *</label>
                <select
                  value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)} required
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="">-- اختر الصنف --</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.sku} - {i.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الكمية المحولة *</label>
                  <input
                    type="number" min="1" required value={quantity}
                    onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ التحويل *</label>
                  <input
                    type="date" required value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات التحويل</label>
                <input
                  type="text" placeholder="سبب نقل البضاعة..."
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button" onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit" disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'جاري التحويل...' : 'تأكيد التحويل المستودعي'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
