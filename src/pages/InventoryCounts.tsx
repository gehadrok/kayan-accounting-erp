import React, { useState, useEffect } from 'react';
import { 
  ClipboardCheck, 
  Search, 
  Plus, 
  CheckCircle2, 
  AlertTriangle,
  Package,
  ArrowRight,
  Filter,
  RefreshCw,
  Eye,
  Check,
  X,
  FileText,
  SlidersHorizontal,
  Calendar,
  Warehouse
} from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';
import { useLookup } from '../context/LookupContext';

export const InventoryCountsPage: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { openLookup } = useLookup();

  const [counts, setCounts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [itemsList, setItemsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState('ALL');

  // Modal State for New Count
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCountForm, setNewCountForm] = useState({
    warehouseId: '',
    countDate: new Date().toISOString().split('T')[0],
    notes: '',
    lines: [] as Array<{ itemId: string; sku?: string; name?: string; countedQuantity: number }>
  });

  // Selected Count Detail Modal / Workspace
  const [selectedCount, setSelectedCount] = useState<any | null>(null);
  const [countLines, setCountLines] = useState<any[]>([]);
  const [approving, setApproving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resCounts, resWh, resItems] = await Promise.all([
        fetch('/api/inventory/counts').then(r => r.json()).catch(() => []),
        fetch('/api/inventory/warehouses').then(r => r.json()).catch(() => []),
        fetch('/api/inventory/items').then(r => r.json()).catch(() => [])
      ]);
      setCounts(Array.isArray(resCounts) ? resCounts : []);
      setWarehouses(Array.isArray(resWh) ? resWh : []);
      setItemsList(Array.isArray(resItems) ? resItems : []);
    } catch (err) {
      console.error('Error loading inventory counts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCountForm.warehouseId) {
      alert('يرجى اختيار المستودع');
      return;
    }
    try {
      const res = await fetch('/api/inventory/counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId: newCountForm.warehouseId,
          countDate: newCountForm.countDate,
          notes: newCountForm.notes,
          lines: newCountForm.lines.map(l => ({ itemId: l.itemId, countedQuantity: l.countedQuantity }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء محضر الجرد');

      setShowCreateModal(false);
      setNewCountForm({ warehouseId: '', countDate: new Date().toISOString().split('T')[0], notes: '', lines: [] });
      setMessage({ text: 'تم إنشاء محضر الجرد كمسودة بنجاح', type: 'success' });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleApproveCount = async (countId: string) => {
    if (!confirm('هل أنت متأكد من اعتماد عملية الجرد؟ سيؤدي الاعتماد إلى توليد تسويات المخزون (فروقات الزيادة والعجز) آلياً.')) return;
    try {
      setApproving(true);
      const res = await fetch(`/api/inventory/counts/${countId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل اعتماد الجرد');

      setMessage({ text: 'تم اعتماد محضر الجرد وتوليد تسويات المخزون بنجاح', type: 'success' });
      setSelectedCount(null);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setApproving(false);
    }
  };

  const filteredCounts = counts.filter(c => {
    const matchesSearch = c.count_number?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.warehouseName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.notes?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchesWarehouse = warehouseFilter === 'ALL' || c.warehouse_id === warehouseFilter;
    return matchesSearch && matchesStatus && matchesWarehouse;
  });

  const totalCounts = counts.length;
  const draftCounts = counts.filter(c => c.status === 'DRAFT').length;
  const approvedCounts = counts.filter(c => c.status === 'APPROVED').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
            <ClipboardCheck size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
              <button onClick={() => navigateTo('/')} className="hover:text-blue-900 transition-colors">الرئيسية</button>
              <span>&gt;</span>
              <span>المخزون</span>
              <span>&gt;</span>
              <span className="text-slate-800 font-bold">الجرد الفعلي</span>
            </div>
            <h1 className="text-xl font-black text-slate-800 font-cairo">الجرد الفعلي للمخزون (Inventory Count Management)</h1>
            <p className="text-xs text-slate-500">إنشاء وإدارة عمليات الجرد الفعلي ومطابقة الكميات مع الرصيد الدفتري وتنفيذ تسويات المخزون</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => fetchData()}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={14} />
            <span>تحديث</span>
          </button>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all"
          >
            <Plus size={16} />
            <span>+ إنشاء جرد جديد</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <CheckCircle2 size={16} />
          <span>{message.text}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">إجمالي عمليات الجرد</span>
            <p className="text-2xl font-black text-slate-900 mt-1 font-mono">{totalCounts}</p>
            <span className="text-[11px] text-slate-400">جميع المحاضر المسجلة</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <ClipboardCheck size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">المسودات قيد الإعداد</span>
            <p className="text-2xl font-black text-amber-700 mt-1 font-mono">{draftCounts}</p>
            <span className="text-[11px] text-amber-600">تحتاج إدخال كميات أو اعتماد</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <FileText size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">المحاضر المعتمَدة</span>
            <p className="text-2xl font-black text-emerald-700 mt-1 font-mono">{approvedCounts}</p>
            <span className="text-[11px] text-emerald-600">تم تنفيذ تسويات المخزون المرتبطة</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <CheckCircle2 size={20} />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute right-3.5 top-3 text-slate-400" />
          <input 
            type="text"
            placeholder="بحث برقم الجرد أو المستودع..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:border-blue-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select 
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
          >
            <option value="ALL">جميع المستودعات</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
          >
            <option value="ALL">جميع الحالات</option>
            <option value="DRAFT">مسودة (Draft)</option>
            <option value="APPROVED">معتمد (Approved)</option>
          </select>
        </div>
      </div>

      {/* Real Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-900 text-white font-bold">
              <tr>
                <th className="py-3 px-4">رقم محضر الجرد</th>
                <th className="py-3 px-4">المستودع</th>
                <th className="py-3 px-4 font-mono">تاريخ الجرد</th>
                <th className="py-3 px-4">ملاحظات المحضر</th>
                <th className="py-3 px-4 text-center">الحالة</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                        <ClipboardCheck size={32} />
                      </div>
                      <div className="text-sm font-bold text-slate-700">لا توجد عمليات جرد مطابقة للبحث</div>
                      <p className="text-xs text-slate-400">لم يتم إنشاء أي محضر جرد أو لم يتم العثور على نتائج تطابق معايير التصفية</p>
                      <button 
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-emerald-800 flex items-center gap-1.5 mt-2"
                      >
                        <Plus size={14} />
                        <span>+ إنشاء أول عملية جرد</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCounts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-800">
                      {c.count_number}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800 flex items-center gap-1.5">
                      <Warehouse size={14} className="text-slate-400" />
                      <span>{c.warehouseName || c.warehouse_id}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {c.count_date ? new Date(c.count_date).toLocaleDateString('ar-YE') : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 truncate max-w-xs">
                      {c.notes || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        c.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {c.status === 'APPROVED' ? <CheckCircle2 size={11} /> : <FileText size={11} />}
                        <span>{c.status === 'APPROVED' ? 'معتمد' : 'مسودة'}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => setSelectedCount(c)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 rounded-lg font-bold text-xs flex items-center gap-1 transition-colors"
                        >
                          <Eye size={13} />
                          <span>عرض / إدارة</span>
                        </button>
                        {c.status !== 'APPROVED' && (
                          <button 
                            onClick={() => handleApproveCount(c.id)}
                            disabled={approving}
                            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs flex items-center gap-1 transition-colors shadow-xs"
                          >
                            <Check size={13} />
                            <span>اعتماد</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Count Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b pb-4">
              <h3 className="text-lg font-bold text-slate-900 font-cairo">إنشاء عملية جرد جديدة (Stock Count)</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateCount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اختر المستودع المستهدف *</label>
                <select 
                  value={newCountForm.warehouseId}
                  onChange={(e) => setNewCountForm({ ...newCountForm, warehouseId: e.target.value })}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                >
                  <option value="">-- اختر المستودع --</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ جلسة الجرد *</label>
                <input 
                  type="date"
                  value={newCountForm.countDate}
                  onChange={(e) => setNewCountForm({ ...newCountForm, countDate: e.target.value })}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات أو سبب الجرد</label>
                <textarea 
                  rows={3}
                  value={newCountForm.notes}
                  onChange={(e) => setNewCountForm({ ...newCountForm, notes: e.target.value })}
                  placeholder="مثال: جرد دوري نهاية النصف الأول من السنة..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-[11px] text-blue-900 leading-relaxed">
                ملاحظة: سيتم إنشاء محضر الجرد بحالة <strong>مسودة</strong>، وسيتمكن أمين المستودع من إدخال الكميات الفعلية ومطابقتها قبل الاعتماد النهائي الذي يولد التسويات الدفترية.
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button 
                  type="button" 
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  إلغاء
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-800"
                >
                  إنشاء المسودة الآن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Selected Count Workspace Modal */}
      {selectedCount && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b pb-4">
              <div>
                <span className="text-xs font-mono font-bold text-emerald-800">{selectedCount.count_number}</span>
                <h3 className="text-lg font-bold text-slate-900 font-cairo">تفاصيل محضر الجرد التشغيلي</h3>
              </div>
              <button onClick={() => setSelectedCount(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs bg-slate-50 p-4 rounded-xl border">
              <div>
                <span className="text-slate-400 block">المستودع:</span>
                <strong className="text-slate-800">{selectedCount.warehouseName || selectedCount.warehouse_id}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">تاريخ الجرد:</span>
                <strong className="text-slate-800 font-mono">{selectedCount.count_date ? new Date(selectedCount.count_date).toLocaleDateString('ar-YE') : '—'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">الحالة:</span>
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${selectedCount.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {selectedCount.status}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-xs text-slate-700">ملاحظات المحضر:</h4>
              <p className="text-xs text-slate-600 bg-white border p-3 rounded-xl">{selectedCount.notes || 'لا توجد ملاحظات إضافية'}</p>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <button 
                onClick={() => setSelectedCount(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                إغلاق
              </button>
              {selectedCount.status !== 'APPROVED' && (
                <button 
                  onClick={() => handleApproveCount(selectedCount.id)}
                  disabled={approving}
                  className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2"
                >
                  <CheckCircle2 size={15} />
                  <span>اعتماد المحضر وتوليد تسويات المخزون</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
