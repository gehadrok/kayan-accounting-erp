import React, { useState, useEffect } from 'react';
import { 
  Warehouse, 
  FolderTree, 
  Ruler, 
  Plus, 
  Search, 
  CheckCircle2, 
  MapPin, 
  X,
  Layers
} from 'lucide-react';

export const WarehousesPage: React.FC = () => {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'warehouses' | 'categories' | 'units'>('warehouses');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Form states
  const [whName, setWhName] = useState('');
  const [whCode, setWhCode] = useState('');
  const [whAddress, setWhAddress] = useState('');
  const [catName, setCatName] = useState('');
  const [catCode, setCatCode] = useState('');
  const [unitName, setUnitName] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [unitFactor, setUnitFactor] = useState(1);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resWh, resCat, resUnits] = await Promise.all([
        fetch('/api/inventory/warehouses'),
        fetch('/api/inventory/categories'),
        fetch('/api/inventory/units')
      ]);
      if (resWh.ok) setWarehouses(await resWh.json());
      if (resCat.ok) setCategories(await resCat.json());
      if (resUnits.ok) setUnits(await resUnits.json());
    } catch (err) {
      console.error('Error fetching inventory master data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeTab === 'warehouses') {
        const res = await fetch('/api/inventory/warehouses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: whName, code: whCode, address: whAddress }),
        });
        if (!res.ok) throw new Error('فشل في إضافة المستودع');
      } else if (activeTab === 'categories') {
        const res = await fetch('/api/inventory/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: catName, code: catCode }),
        });
        if (!res.ok) throw new Error('فشل في إضافة التصنيف');
      } else {
        const res = await fetch('/api/inventory/units', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: unitName, code: unitCode, conversionFactor: unitFactor }),
        });
        if (!res.ok) throw new Error('فشل في إضافة الوحدة');
      }

      setIsModalOpen(false);
      setWhName(''); setWhCode(''); setWhAddress('');
      setCatName(''); setCatCode('');
      setUnitName(''); setUnitCode('');
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-amber-600 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
            <Warehouse size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">إدارة المستودعات والتصنيفات والوحدات</h1>
            <p className="text-xs text-slate-500 font-medium">البيانات الأساسية للمخزون: المستودعات المركزية، شجرة التصنيفات، ووحدات القياس</p>
          </div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
        >
          <Plus size={16} />
          <span>
            {activeTab === 'warehouses' && 'إضافة مستودع جديد'}
            {activeTab === 'categories' && 'إضافة تصنيف جديد'}
            {activeTab === 'units' && 'إضافة وحدة قياس جديدة'}
          </span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('warehouses')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
            activeTab === 'warehouses'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Warehouse size={15} />
          <span>المستودعات ({warehouses.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
            activeTab === 'categories'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FolderTree size={15} />
          <span>التصنيفات ({categories.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('units')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
            activeTab === 'units'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Ruler size={15} />
          <span>وحدات القياس ({units.length})</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'warehouses' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouses.map((wh) => (
            <div key={wh.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {wh.code}
                  </span>
                  <h3 className="font-bold text-sm text-slate-800 mt-2">{wh.name}</h3>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 size={11} /> نشط
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <MapPin size={14} className="text-slate-400 shrink-0" />
                <span>{wh.address || 'العنوان غير محدد'}</span>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 font-mono">
                حساب المخزون المرتبط: 1104
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">كود التصنيف</th>
                <th className="py-3 px-4">اسم التصنيف</th>
                <th className="py-3 px-4">الوصف</th>
                <th className="py-3 px-4 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono font-bold text-amber-700">{c.code}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{c.name}</td>
                  <td className="py-3 px-4 text-slate-500">{c.description || '—'}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      نشط
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'units' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">رمز الوحدة</th>
                <th className="py-3 px-4">اسم الوحدة</th>
                <th className="py-3 px-4 font-mono">معامل التحويل</th>
                <th className="py-3 px-4 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {units.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono font-bold text-amber-700">{u.code}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{u.name}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{parseFloat(u.conversion_factor || '1')}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      نشط
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-md border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800">
                {activeTab === 'warehouses' && 'إضافة مستودع جديد'}
                {activeTab === 'categories' && 'إضافة تصنيف جديد'}
                {activeTab === 'units' && 'إضافة وحدة قياس جديدة'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-3.5 text-xs">
              {activeTab === 'warehouses' && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">كود المستودع *</label>
                    <input
                      type="text" required placeholder="مثال: WH-03"
                      value={whCode} onChange={(e) => setWhCode(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">اسم المستودع *</label>
                    <input
                      type="text" required placeholder="مثال: مستودع المعلا"
                      value={whName} onChange={(e) => setWhName(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">العنوان والموقع</label>
                    <input
                      type="text" placeholder="مثال: عدن - شارع الميناء"
                      value={whAddress} onChange={(e) => setWhAddress(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>
                </>
              )}

              {activeTab === 'categories' && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">كود التصنيف *</label>
                    <input
                      type="text" required placeholder="مثال: CAT-NET"
                      value={catCode} onChange={(e) => setCatCode(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">اسم التصنيف *</label>
                    <input
                      type="text" required placeholder="مثال: شبكات واتصالات"
                      value={catName} onChange={(e) => setCatName(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>
                </>
              )}

              {activeTab === 'units' && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">رمز الوحدة *</label>
                    <input
                      type="text" required placeholder="مثال: PKT"
                      value={unitCode} onChange={(e) => setUnitCode(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">اسم الوحدة *</label>
                    <input
                      type="text" required placeholder="مثال: باكت"
                      value={unitName} onChange={(e) => setUnitName(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">معامل التحويل</label>
                    <input
                      type="number" min="1" value={unitFactor}
                      onChange={(e) => setUnitFactor(parseFloat(e.target.value) || 1)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button" onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-xs"
                >
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
