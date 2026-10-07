import React, { useState, useEffect } from 'react';
import {
  Package,
  Search,
  Plus,
  Edit3,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  Printer,
  Barcode,
  TrendingDown,
  History,
  Tag,
  Trash2,
  Power
} from 'lucide-react';

interface Item {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  category_id?: string;
  categoryName?: string;
  unit_id?: string;
  unitName?: string;
  unitSymbol?: string;
  purchase_price: string;
  sale_price: string;
  minimum_stock: string;
  reorder_point: string;
  is_stock_item: boolean;
  is_active: boolean;
  currentStock: number;
  averageCost: number;
  stockValue: number;
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

interface Category {
  id: string;
  code: string;
  name: string;
}

interface Unit {
  id: string;
  code: string;
  name: string;
  symbol?: string;
}

interface LedgerEntry {
  transactionId: string;
  transactionNumber: string;
  transactionType: string;
  transactionDate: string;
  warehouseName: string;
  notes?: string;
  isInflow: boolean;
  inQty: number;
  outQty: number;
  runningStock: number;
  unitCost: number;
  currentAvgCost: number;
  runningValue: number;
}

interface ItemLedgerData {
  item: Item;
  entries: LedgerEntry[];
  finalStock: number;
  finalAverageCost: number;
  finalValue: number;
}

export const InventoryItemsPage: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  // Modals
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [selectedItemForLedger, setSelectedItemForLedger] = useState<Item | null>(null);
  const [ledgerData, setLedgerData] = useState<ItemLedgerData | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    sku: '',
    barcode: '',
    name: '',
    description: '',
    categoryId: '',
    unitId: '',
    purchasePrice: '0',
    salePrice: '0',
    minimumStock: '5',
    reorderPoint: '10',
    isStockItem: true,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [itemsRes, catsRes, unitsRes] = await Promise.all([
        fetch('/api/inventory/items'),
        fetch('/api/inventory/categories'),
        fetch('/api/inventory/units'),
      ]);
      const [itemsData, catsData, unitsData] = await Promise.all([
        itemsRes.json(),
        catsRes.json(),
        unitsRes.json(),
      ]);
      setItems(itemsData || []);
      setCategories(catsData || []);
      setUnits(unitsData || []);
    } catch (err: any) {
      console.error('Failed to load items', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormData({
      sku: `SKU-${Date.now().toString().slice(-5)}`,
      barcode: '',
      name: '',
      description: '',
      categoryId: categories[0]?.id || '',
      unitId: units[0]?.id || '',
      purchasePrice: '0',
      salePrice: '0',
      minimumStock: '5',
      reorderPoint: '10',
      isStockItem: true,
    });
    setError(null);
    setShowItemModal(true);
  };

  const handleOpenEdit = (item: Item) => {
    setEditingItem(item);
    setFormData({
      sku: item.sku,
      barcode: item.barcode || '',
      name: item.name,
      description: item.description || '',
      categoryId: item.category_id || '',
      unitId: item.unit_id || '',
      purchasePrice: item.purchase_price,
      salePrice: item.sale_price,
      minimumStock: item.minimum_stock,
      reorderPoint: item.reorder_point,
      isStockItem: item.is_stock_item,
    });
    setError(null);
    setShowItemModal(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        purchasePrice: parseFloat(formData.purchasePrice) || 0,
        salePrice: parseFloat(formData.salePrice) || 0,
        minimumStock: parseFloat(formData.minimumStock) || 0,
        reorderPoint: parseFloat(formData.reorderPoint) || 0,
      };

      let res;
      if (editingItem) {
        res = await fetch(`/api/inventory/items/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/inventory/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'فشل حفظ بيانات الصنف');
      }

      setShowItemModal(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (item: Item) => {
    if (!confirm(`هل أنت متأكد من رغبتك في حذف الصنف "${item.name}"؟`)) {
      return;
    }
    try {
      const res = await fetch(`/api/inventory/items/${item.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'تعذر حذف الصنف');
      } else {
        loadData();
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء محاولة الحذف');
    }
  };

  const handleToggleActive = async (item: Item) => {
    try {
      const res = await fetch(`/api/inventory/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.is_active }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'فشل تحديث حالة التفعيل');
      } else {
        loadData();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleViewLedger = async (item: Item) => {
    setSelectedItemForLedger(item);
    setShowLedgerModal(true);
    setLoadingLedger(true);
    try {
      const res = await fetch(`/api/inventory/items/${item.id}/ledger`);
      const data = await res.json();
      setLedgerData(data);
    } catch (err) {
      console.error('Failed to load item ledger', err);
    } finally {
      setLoadingLedger(false);
    }
  };

  const filteredItems = items.filter(i => {
    const matchesSearch =
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.sku.toLowerCase().includes(search.toLowerCase()) ||
      (i.barcode && i.barcode.includes(search));
    const matchesCategory =
      selectedCategory === 'ALL' || i.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalStockItems = items.length;
  const totalValuation = items.reduce((sum, i) => sum + (i.stockValue || 0), 0);
  const lowStockCount = items.filter(i => i.stockStatus === 'LOW_STOCK').length;
  const outOfStockCount = items.filter(i => i.stockStatus === 'OUT_OF_STOCK').length;

  const translateTxType = (type: string) => {
    switch (type) {
      case 'OPENING': return 'رصيد افتتاحي';
      case 'PURCHASE_RECEIPT': return 'استلام مشتريات';
      case 'SALES_ISSUE': return 'صرف مبيعات';
      case 'TRANSFER_IN': return 'تحويل وارد';
      case 'TRANSFER_OUT': return 'تحويل صادر';
      case 'ADJUSTMENT_IN': return 'تسوية إضافة';
      case 'ADJUSTMENT_OUT': return 'تسوية عجز';
      case 'RETURN_IN': return 'مردود مبيعات';
      case 'RETURN_OUT': return 'مردود مشتريات';
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-wide">إدارة الأصناف والمخزون</h1>
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
              النسخة المحاسبية المستمرة (Perpetual Inventory)
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            دليل الأصناف الشامل، بطاقات الأصناف، وتتبع حركة وأرصدة المخزون بالمتوسط المرجح المتحرك (WAC)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف جديد</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">إجمالي الأصناف المعرفة</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight">{totalStockItems.toLocaleString()}</div>
            <div className="text-xs text-slate-400 mt-0.5">{categories.length} تصنيفات نشطة</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">إجمالي قيمة المخزون (WAC)</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-emerald-400 tracking-tight">
              {totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal">ر.ي</span>
            </div>
            <div className="text-xs text-emerald-500/80 mt-0.5">تقييم مستمر مرتبط بـ GL 1104</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">أصناف قاربت النفاد (حد إعادة الطلب)</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-amber-400 tracking-tight">{lowStockCount}</div>
            <div className="text-xs text-amber-500/80 mt-0.5">تحتاج طلب شراء فوري</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">أصناف منتهية (رصيد صفري)</span>
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-rose-400 tracking-tight">{outOfStockCount}</div>
            <div className="text-xs text-rose-500/80 mt-0.5">ممنوع صرفها لمنع الرصيد السالب</div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/40 border border-slate-800/80">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="البحث باسم الصنف، كود SKU، أو الباركود..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2 bg-slate-800/50 border border-slate-700/80 rounded-lg text-sm text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-slate-800/50 border border-slate-700/80 rounded-lg text-sm text-slate-200 focus:outline-hidden focus:border-blue-500"
            >
              <option value="ALL">جميع التصنيفات</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm text-slate-300">
            <thead className="bg-slate-800/60 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">الصنف / الرمز</th>
                <th className="px-4 py-3.5">التصنيف والوحدة</th>
                <th className="px-4 py-3.5 text-center">الرصيد الفعلي</th>
                <th className="px-4 py-3.5 text-left">متوسط التكلفة (WAC)</th>
                <th className="px-4 py-3.5 text-left">قيمة المخزون</th>
                <th className="px-4 py-3.5 text-center">الحالة المخزنية</th>
                <th className="px-5 py-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    <p className="mt-2 text-xs">جاري تحميل بطاقات الأصناف وأرصدة المخزون...</p>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <Package className="w-12 h-12 mx-auto text-slate-600 mb-2" />
                    <p>لا توجد أصناف مطابقة للبحث</p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-white">{item.name}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-blue-400">{item.sku}</span>
                        {item.barcode && (
                          <span className="flex items-center gap-1 font-mono text-slate-400">
                            <Barcode className="w-3 h-3" />
                            {item.barcode}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="text-slate-200">{item.categoryName || 'عام'}</div>
                      <div className="text-xs text-slate-400">{item.unitName || 'قطعة'} ({item.unitSymbol || 'قطعة'})</div>
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <div className="font-bold text-base font-mono text-white">
                        {item.currentStock.toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-400">
                        الطلب: {item.reorder_point} | الأدنى: {item.minimum_stock}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-left font-mono">
                      <div className="text-slate-200 font-medium">
                        {item.averageCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-slate-400">
                        البيع: {parseFloat(item.sale_price).toLocaleString()}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-left font-mono font-bold text-emerald-400">
                      {item.stockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs text-slate-400 font-normal">ر.ي</span>
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      {item.stockStatus === 'IN_STOCK' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          متوفر
                        </span>
                      ) : item.stockStatus === 'LOW_STOCK' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          منخفض
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <XCircle className="w-3.5 h-3.5" />
                          نفد الرصيد
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleViewLedger(item)}
                          title="كشف حركة الصنف (Stock Ledger)"
                          className="p-1.5 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors cursor-pointer"
                        >
                          <History className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenEdit(item)}
                          title="تعديل بيانات الصنف"
                          className="p-1.5 hover:bg-slate-700/60 text-slate-300 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleToggleActive(item)}
                          title={item.is_active ? 'تعطيل الصنف' : 'تفعيل الصنف'}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            item.is_active ? 'hover:bg-amber-500/20 text-amber-400' : 'hover:bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          <Power className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteItem(item)}
                          title="حذف الصنف (في حال عدم وجود حركات)"
                          className="p-1.5 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Item Form Modal */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Package className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white">
                  {editingItem ? 'تعديل بيانات الصنف' : 'تعريف صنف مخزني جديد'}
                </h3>
              </div>
              <button
                onClick={() => setShowItemModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">كود الصنف (SKU) *</label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-hidden focus:border-blue-500"
                    placeholder="مثال: SKU-1002"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">الباركود الدولي</label>
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-hidden focus:border-blue-500"
                    placeholder="مثال: 6281000998877"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">اسم الصنف بالكامل *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-hidden focus:border-blue-500"
                  placeholder="مثال: شاشة ديل 27 بوصة IPS 4K Ultra HD"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">التصنيف *</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-hidden focus:border-blue-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">وحدة القياس الأساسية *</label>
                  <select
                    value={formData.unitId}
                    onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-hidden focus:border-blue-500"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">سعر الشراء القياسي (ر.ي)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">سعر البيع القياسي (ر.ي)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.salePrice}
                    onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">الحد الأدنى للسلامة (Safety Stock)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.minimumStock}
                    onChange={(e) => setFormData({ ...formData, minimumStock: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">حد إعادة الطلب (Reorder Point)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.reorderPoint}
                    onChange={(e) => setFormData({ ...formData, reorderPoint: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">ملاحظات ومواصفات تفصيلية</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-hidden focus:border-blue-500"
                  placeholder="أدخل المواصفات التقنية أو ملاحظات التخزين..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium shadow-md shadow-blue-600/20 transition-all disabled:opacity-50"
                >
                  {saving ? 'جاري الحفظ...' : editingItem ? 'تحديث الصنف' : 'حفظ الصنف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Ledger Modal */}
      {showLedgerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>كشف حركة الصنف التفصيلي (Stock Ledger)</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                      {selectedItemForLedger?.sku}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedItemForLedger?.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة الكشف</span>
                </button>
                <button
                  onClick={() => setShowLedgerModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              {loadingLedger ? (
                <div className="py-16 text-center text-slate-400">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <p className="mt-2 text-xs">جاري احتساب المتوسط المرجح وحركات المخزون...</p>
                </div>
              ) : ledgerData ? (
                <>
                  {/* Summary Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                    <div>
                      <div className="text-xs text-slate-400">الرصيد التراكمي الفعلي</div>
                      <div className="text-xl font-bold font-mono text-white mt-1">
                        {ledgerData.finalStock.toLocaleString()} <span className="text-xs font-normal text-slate-400">وحدة</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">متوسط التكلفة المرجح الحالي (WAC)</div>
                      <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                        {ledgerData.finalAverageCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">ر.ي</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">إجمالي قيمة الرصيد المخزني</div>
                      <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                        {ledgerData.finalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">ر.ي</span>
                      </div>
                    </div>
                  </div>

                  {/* Ledger Table */}
                  <div className="rounded-xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-right text-xs text-slate-300">
                      <thead className="bg-slate-800/70 text-slate-400 font-semibold border-b border-slate-800">
                        <tr>
                          <th className="px-3.5 py-2.5">رقم الحركة / التاريخ</th>
                          <th className="px-3.5 py-2.5">نوع الحركة</th>
                          <th className="px-3.5 py-2.5">المستودع</th>
                          <th className="px-3 py-2.5 text-center text-emerald-400">وارد (+)</th>
                          <th className="px-3 py-2.5 text-center text-rose-400">صادر (-)</th>
                          <th className="px-3 py-2.5 text-center font-bold text-white">الرصيد التراكمي</th>
                          <th className="px-3.5 py-2.5 text-left">تكلفة الوحدة</th>
                          <th className="px-3.5 py-2.5 text-left font-semibold text-blue-400">المتوسط المرجح (WAC)</th>
                          <th className="px-3.5 py-2.5 text-left font-bold text-emerald-400">قيمة الرصيد</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {ledgerData.entries.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                              لا توجد حركات مخزنية مسجلة لهذا الصنف حتى الآن
                            </td>
                          </tr>
                        ) : (
                          ledgerData.entries.map((entry, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/30 font-mono">
                              <td className="px-3.5 py-2.5">
                                <div className="font-semibold text-white">{entry.transactionNumber}</div>
                                <div className="text-[10px] text-slate-400">{entry.transactionDate}</div>
                              </td>
                              <td className="px-3.5 py-2.5 font-sans">
                                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                                  entry.isInflow
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }`}>
                                  {translateTxType(entry.transactionType)}
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 font-sans text-slate-200">
                                {entry.warehouseName}
                              </td>
                              <td className="px-3 py-2.5 text-center text-emerald-400 font-bold">
                                {entry.inQty > 0 ? `+${entry.inQty}` : '-'}
                              </td>
                              <td className="px-3 py-2.5 text-center text-rose-400 font-bold">
                                {entry.outQty > 0 ? `-${entry.outQty}` : '-'}
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold text-white bg-slate-800/30">
                                {entry.runningStock}
                              </td>
                              <td className="px-3.5 py-2.5 text-left text-slate-300">
                                {entry.unitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3.5 py-2.5 text-left text-blue-400 font-bold">
                                {entry.currentAvgCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3.5 py-2.5 text-left text-emerald-400 font-bold">
                                {entry.runningValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
