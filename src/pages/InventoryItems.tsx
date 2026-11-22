import React, { useState, useEffect, useMemo } from 'react';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { ReportHeader } from '../components/company/ReportHeader';
import {
  Package,
  Plus,
  Edit3,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Printer,
  Barcode,
  TrendingDown,
  History,
  Tag,
  Trash2,
  Power,
  Save,
  Boxes,
  FileText,
  Info,
  ClipboardList,
  PackageOpen,
} from 'lucide-react';

import {
  PageHeader,
  ScreenShell,
  PageToolbar,
  DataTable,
  DataTableColumn,
  KpiCard,
  Card,
  FormField,
  FormGrid,
  FormSection,
  FormActions,
  Input,
  NumberInput,
  NumericInput,
  Textarea,
  Select,
  SearchSelect,
  Checkbox,
  Dialog,
  FormDialog,
  ConfirmDialog,
  StatusBadge,
  EmptyState,
  Button,
  IconButton,
  Tabs,
  useToast,
  formatMoney,
} from '../components/ui';

/**
 * شاشة إدارة الأصناف — الشاشة المرجعية لهوية Kayan Enterprise UI.
 *
 * قواعد هذه الشاشة (المواصفة §11/§8):
 *   - الجدول في منطقة مستقلة، وتفاصيل/تحرير السجل في قسم منظّم
 *     أسفل الجدول مقسّم إلى تبويبات.
 *   - لا يتغيّر أي سلوك وظيفي: نفس نقاط الـ API، نفس الـ payload،
 *     نفس قواعد التحقق (required) ونفس رسالة خطأ الخادم.
 *   - لا تُعرض بيانات تجريبية: كل رقم مشتق من استجابة API حقيقية.
 */

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
  created_at?: string;
  updated_at?: string;
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

type DetailTab = 'basic' | 'pricing' | 'stock' | 'extra';

const PAGE_SIZE = 10;

/** نموذج البيانات — قيم string حتى الحفظ، كي لا تفقد الدقة. */
const emptyForm = () => ({
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

export const InventoryItemsPage: React.FC = () => {
  const { company } = useCompanyProfile();
  const toast = useToast();

  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* حالة القسم التفصيلي أسفل الجدول:
     - isNew = وضع التعريف الجديد
     - selectedId = الصنف المحدّد للعرض/التعديل
     لا يوجد كلاهما → حالة فراغ توضيحية بدل نموذج مُفترض. */
  const [isNew, setIsNew] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('basic');

  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [selectedItemForLedger, setSelectedItemForLedger] = useState<Item | null>(null);
  const [ledgerData, setLedgerData] = useState<ItemLedgerData | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const [formData, setFormData] = useState(emptyForm());
  const [formSnapshot, setFormSnapshot] = useState(JSON.stringify(emptyForm()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [page, setPage] = useState(1);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) || null,
    [items, selectedId]
  );

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [itemsRes, catsRes, unitsRes] = await Promise.all([
        fetch('/api/inventory/items'),
        fetch('/api/inventory/categories'),
        fetch('/api/inventory/units'),
      ]);
      if (!itemsRes.ok) throw new Error(`تعذّر تحميل الأصناف (${itemsRes.status})`);
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
      setLoadError(err?.message || 'تعذّر تحميل بيانات الأصناف');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  /* التصفية والترقيم — يعيدان الصفحة إلى 1 عند تغيّر الفلتر
     حتى لا يبقى المستخدم في صفحة بلا نتائج. */
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const matchesSearch =
        !q ||
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        (i.barcode && i.barcode.includes(q));
      const matchesCategory = selectedCategory === 'ALL' || i.category_id === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [items, search, selectedCategory]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedCategory]);

  const pagedItems = useMemo(
    () => filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredItems, page]
  );

  const totalStockItems = items.length;
  const totalValuation = items.reduce((sum, i) => sum + (i.stockValue || 0), 0);
  const lowStockCount = items.filter((i) => i.stockStatus === 'LOW_STOCK').length;
  const outOfStockCount = items.filter((i) => i.stockStatus === 'OUT_OF_STOCK').length;

  /* ------------------------------------------------------------
     هامش الربح — قيم مشتقّة فقط من حقلي السعر الموجودين فعلاً
     في قاعدة البيانات. لا يُخزَّن ولا يُرسل، ولذلك لا يمكن أن
     يغيّر أي حساب محاسبي: عرض قراءة فقط.
     ------------------------------------------------------------ */
  const computeMargin = (purchase: number, sale: number): number | null => {
    if (!isFinite(purchase) || !isFinite(sale) || purchase <= 0) return null;
    return ((sale - purchase) / purchase) * 100;
  };

  const marginOf = (item: Item) =>
    computeMargin(parseFloat(item.purchase_price), parseFloat(item.sale_price));

  const currentMargin = computeMargin(
    parseFloat(formData.purchasePrice) || 0,
    parseFloat(formData.salePrice) || 0
  );

  /* ------------------------------------------------------------
     فتح النموذج — نفس المنطق السابق حرفياً (نفس القيم الافتراضية).
     ------------------------------------------------------------ */
  const handleOpenCreate = () => {
    setIsNew(true);
    setEditing(false);
    setSelectedId(null);
    const initial = {
      ...emptyForm(),
      sku: `SKU-${Date.now().toString().slice(-5)}`,
      categoryId: categories[0]?.id || '',
      unitId: units[0]?.id || '',
    };
    setFormData(initial);
    setFormSnapshot(JSON.stringify(initial));
    setError(null);
    setErrors({});
    setActiveTab('basic');
  };

  const handleOpenEdit = (item: Item) => {
    setIsNew(false);
    setEditing(true);
    setSelectedId(item.id);
    const initial = {
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
    };
    setFormData(initial);
    setFormSnapshot(JSON.stringify(initial));
    setError(null);
    setErrors({});
    setActiveTab('basic');
  };

  /* اختيار صف = عرض فقط. لا يُحمَّل نموذج تحرير ولا تُفتح حقول
     قابلة للكتابة إلا بعد ضغط "تعديل". */
  const selectItem = (item: Item) => {
    if (isNew || editing) return; /* لا نفقد تعريفاً غير محفوظ */
    setSelectedId(item.id);
  };

  const handleCancelDetail = () => {
    setIsNew(false);
    setEditing(false);
    setError(null);
    setErrors({});
  };

  /* ------------------------------------------------------------
     التحقق — نفس شروط required السابقة فقط، بلا قواعد جديدة.
     ------------------------------------------------------------ */
  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!formData.sku.trim()) next.sku = 'كود الصنف مطلوب';
    if (!formData.name.trim()) next.name = 'اسم الصنف مطلوب';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSaveItem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving) return; /* منع تكرار الإرسال */
    if (!validate()) return;

    setSaving(true);
    setError(null);

    try {
      /* نفس بناء الـ payload السابق حرفياً: تحويل رقمي عند
         الإرسال فقط، لا أثناء الكتابة. */
      const payload = {
        ...formData,
        purchasePrice: parseFloat(formData.purchasePrice) || 0,
        salePrice: parseFloat(formData.salePrice) || 0,
        minimumStock: parseFloat(formData.minimumStock) || 0,
        reorderPoint: parseFloat(formData.reorderPoint) || 0,
      };

      let res;
      if (!isNew && selectedId) {
        res = await fetch(`/api/inventory/items/${selectedId}`, {
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
        const errJson = await res.json().catch(() => null);
        throw new Error((errJson && errJson.error) || 'فشل حفظ بيانات الصنف');
      }

      const saved: Item | null = await res.json().catch(() => null);
      toast.success(isNew ? 'تم إنشاء الصنف بنجاح' : 'تم حفظ التعديلات بنجاح', {
        description: formData.name,
      });
      await loadData();
      setEditing(false);
      if (saved?.id) {
        setIsNew(false);
        setSelectedId(saved.id);
      } else if (!isNew) {
        setSelectedId(selectedId);
      } else {
        setIsNew(false);
        setSelectedId(null);
      }
      setFormSnapshot(JSON.stringify(formData));
    } catch (err: any) {
      setError(err.message);
      toast.error('تعذّر حفظ بيانات الصنف', { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    const item = confirmDelete;
    if (!item) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/inventory/items/${item.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (data && data.error) || 'تعذر حذف الصنف';
        toast.error('تعذّر حذف الصنف', { description: msg });
      } else {
        toast.success('تم حذف الصنف', { description: item.name });
        if (selectedId === item.id) handleCancelDetail();
        await loadData();
      }
    } catch (err: any) {
      toast.error('حدث خطأ أثناء محاولة الحذف', { description: err?.message });
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const handleToggleActive = async (item: Item) => {
    if (togglingId) return;
    setTogglingId(item.id);
    try {
      const res = await fetch(`/api/inventory/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.is_active }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error('فشل تحديث حالة التفعيل', {
          description: (err && err.error) || undefined,
        });
      } else {
        toast.success(item.is_active ? 'تم تعطيل الصنف' : 'تم تفعيل الصنف', {
          description: item.name,
        });
        await loadData();
      }
    } catch (err: any) {
      toast.error('تعذّر تحديث الحالة', { description: err?.message });
    } finally {
      setTogglingId(null);
    }
  };

  const handleViewLedger = async (item: Item) => {
    setSelectedItemForLedger(item);
    setShowLedgerModal(true);
    setLoadingLedger(true);
    setLedgerData(null);
    try {
      const res = await fetch(`/api/inventory/items/${item.id}/ledger`);
      const data = await res.json();
      setLedgerData(data);
    } catch (err) {
      console.error('Failed to load item ledger', err);
      toast.error('تعذّر تحميل كشف حركة الصنف');
    } finally {
      setLoadingLedger(false);
    }
  };

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

  const stockBadge = (item: Item) => {
    if (item.stockStatus === 'IN_STOCK')
      return <StatusBadge tone="success" size="sm" icon={<CheckCircle2 size={12} />}>متوفر</StatusBadge>;
    if (item.stockStatus === 'LOW_STOCK')
      return <StatusBadge tone="warning" size="sm" icon={<AlertTriangle size={12} />}>منخفض</StatusBadge>;
    return <StatusBadge tone="danger" size="sm" icon={<XCircle size={12} />}>نفد الرصيد</StatusBadge>;
  };

  /* ------------------------------------------------------------
     أعمدة الجدول — أرقام بمحاذاة ثابتة، حالة بنص لا لون وحده.
     ------------------------------------------------------------ */
  const columns: DataTableColumn<Item>[] = [
    {
      key: 'sku',
      header: 'رقم الصنف',
      width: '150px',
      render: (r) => (
        <div>
          <div className="font-mono font-bold text-brand">{r.sku}</div>
          {r.barcode && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted">
              <Barcode size={11} aria-hidden="true" />
              <span className="font-mono">{r.barcode}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'name',
      header: 'اسم الصنف',
      render: (r) => <span className="font-semibold text-ink">{r.name}</span>,
    },
    {
      key: 'unit',
      header: 'الوحدة',
      width: '120px',
      render: (r) => <span>{r.unitName || 'قطعة'}{r.unitSymbol ? ` (${r.unitSymbol})` : ''}</span>,
    },
    {
      key: 'category',
      header: 'التصنيف',
      width: '140px',
      hideOnSmall: true,
      render: (r) => <span className="text-ink-muted">{r.categoryName || 'عام'}</span>,
    },
    {
      key: 'currentStock',
      header: 'الكمية',
      align: 'end',
      numeric: true,
      width: '110px',
      render: (r) => <span className="font-bold text-ink">{r.currentStock.toLocaleString()}</span>,
    },
    {
      key: 'reorder',
      header: 'حد إعادة الطلب',
      align: 'end',
      numeric: true,
      width: '130px',
      hideOnSmall: true,
      render: (r) => <span className="text-ink-muted">{parseFloat(r.reorder_point).toLocaleString()}</span>,
    },
    {
      key: 'cost',
      header: 'التكلفة',
      align: 'end',
      numeric: true,
      width: '130px',
      render: (r) => <span>{formatMoney(r.averageCost)}</span>,
    },
    {
      key: 'price',
      header: 'السعر',
      align: 'end',
      numeric: true,
      width: '130px',
      render: (r) => <span>{formatMoney(parseFloat(r.sale_price))}</span>,
    },
    {
      key: 'margin',
      header: 'هامش الربح',
      align: 'end',
      numeric: true,
      width: '110px',
      hideOnSmall: true,
      render: (r) => {
        const m = marginOf(r);
        if (m === null) return <span className="text-ink-muted">—</span>;
        const tone = m >= 0 ? 'text-state-success' : 'text-state-danger';
        return <span className={`font-bold ${tone}`}>{m.toFixed(0)}%</span>;
      },
    },
    {
      key: 'status',
      header: 'الحالة',
      align: 'center',
      width: '120px',
      render: (r) => stockBadge(r),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      align: 'center',
      width: '150px',
      render: (r) => (
        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton
            tone="primary"
            label="كشف حركة الصنف (Stock Ledger)"
            onClick={() => handleViewLedger(r)}
          >
            <History size={15} />
          </IconButton>
          <IconButton tone="neutral" label="تعديل بيانات الصنف" onClick={() => handleOpenEdit(r)}>
            <Edit3 size={15} />
          </IconButton>
          <IconButton
            tone={r.is_active ? 'warning' : 'success'}
            label={r.is_active ? 'تعطيل الصنف' : 'تفعيل الصنف'}
            loading={togglingId === r.id}
            onClick={() => handleToggleActive(r)}
          >
            <Power size={15} />
          </IconButton>
          <IconButton tone="danger" label="حذف الصنف (في حال عدم وجود حركات)" onClick={() => setConfirmDelete(r)}>
            <Trash2 size={15} />
          </IconButton>
        </div>
      ),
    },
  ];

  const tabs: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
    { id: 'basic', label: 'البيانات الأساسية', icon: <FileText size={14} /> },
    { id: 'pricing', label: 'التصنيف والتكلفة', icon: <DollarSign size={14} /> },
    { id: 'stock', label: 'المخزون والوحدات', icon: <Boxes size={14} /> },
    { id: 'extra', label: 'بيانات إضافية', icon: <Info size={14} /> },
  ];

  return (
    <ScreenShell>
      {/* الترويسة الطباعية فقط — لا تُظهر على الشاشة */}
      <div className="hidden print:block">
        <ReportHeader company={company} title="قائمة الأصناف (Inventory Items)" compact />
      </div>

      <PageHeader
        title="إدارة العناصر"
        description="تعريف الأصناف والوحدات والتصنيفات والأرصدة والأسعار"
        icon={<PackageOpen size={18} />}
        badge={
          <StatusBadge tone="info" size="sm">
            المخزون المستمر (Perpetual)
          </StatusBadge>
        }
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={handleOpenCreate}>
            عنصر جديد
          </Button>
        }
      />

      {/* بطاقات الإحصاء — كل قيم مشتقّة من API حقيقي */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="إجمالي الأصناف المعرفة"
          value={totalStockItems.toLocaleString()}
          unit="صنف"
          tone="brand"
          icon={<Package size={18} />}
          hint={`${categories.length} تصنيفات نشطة`}
          pending={loading}
        />
        <KpiCard
          label="إجمالي قيمة المخزون (WAC)"
          value={formatMoney(totalValuation)}
          unit="ر.ي"
          tone="success"
          icon={<DollarSign size={18} />}
          hint="تقييم مستمر مرتبط بـ GL 1104"
          pending={loading}
        />
        <KpiCard
          label="أصناف قاربت النفاد (حد إعادة الطلب)"
          value={lowStockCount.toLocaleString()}
          unit="صنف"
          tone="warning"
          icon={<AlertTriangle size={18} />}
          hint="تحتاج طلب شراء"
          pending={loading}
        />
        <KpiCard
          label="أصناف منتهية (رصيد صفري)"
          value={outOfStockCount.toLocaleString()}
          unit="صنف"
          tone="danger"
          icon={<TrendingDown size={18} />}
          hint="ممنوع صرفها لمنع الرصيد السالب"
          pending={loading}
        />
      </div>

      {/* شريط البحث والفلترة — نفس وظائف الشريط الأصلي فقط
          (بحث + فلترة التصنيف). لا زر إجراء جديد (المواصفة §5). */}
      <PageToolbar
        search={{ value: search, onValueChange: setSearch, placeholder: 'ابحث باسم الصنف، كود SKU، أو الباركود...' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink-muted">
            <Tag size={14} className="me-1 inline" aria-hidden="true" />
            التصنيف:
          </span>
          <Select
            size="sm"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="تصفية حسب التصنيف"
            options={[
              { value: 'ALL', label: 'جميع التصنيفات' },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
      </PageToolbar>

      {/* ------------------------------------------------------------
          منطقة الجدول
          ------------------------------------------------------------ */}
      <DataTable<Item>
        columns={columns}
        data={pagedItems}
        rowKey={(r) => r.id}
        loading={loading}
        loadingText="جاري تحميل بطاقات الأصناف وأرصدة المخزون..."
        error={loadError}
        emptyMessage={items.length === 0 ? 'لا توجد أصناف معرفة بعد' : 'لا توجد أصناف مطابقة للبحث'}
        emptyIcon={<PackageOpen size={30} />}
        showRowNumbers
        stickyHeader
        onRowClick={selectItem}
        rowClassName={(r) => (r.id === selectedId ? 'bg-brand-soft' : '')}
        header={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-bold text-ink">
              قائمة الأصناف
              <span className="kayan-numeric ms-2 font-normal text-ink-muted">
                عدد العناصر: {filteredItems.length.toLocaleString()}
              </span>
            </p>
            {!loadError && !loading && items.length > 0 && (
              <span className="text-xs text-ink-muted">
                اضغط على أي صف لعرض تفاصيله وتحريره
              </span>
            )}
          </div>
        }
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: filteredItems.length,
          onPageChange: setPage,
        }}
      />

      {/* ------------------------------------------------------------
          قسم التفاصيل أسفل الجدول — مقسّم إلى تبويبات
          (المواصفة §8)
          ------------------------------------------------------------ */}
      <div id="item-detail">
        {!selected && !isNew && !editing ? (
          <Card>
            <EmptyState
              icon={<PackageOpen size={34} />}
              title="اختر صنفاً من الجدول لعرض تفاصيله"
              description="أو أنشئ صنفاً جديداً لتعريفه من الأعلى. التفاصيل هنا للعرض فقط، والتحرير من نافذة مستقلة."
              action={
                <Button variant="primary" icon={<Plus size={15} />} onClick={handleOpenCreate}>
                  عنصر جديد
                </Button>
              }
            />
          </Card>
        ) : selected && !isNew && !editing ? (
          <Card
            title={`بيانات الصنف: ${selected.name}`}
            description="وضع العرض — الحقول غير قابلة للكتابة. استخدم «تعديل الصنف» لفتح نموذج مستقل."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<History size={15} />}
                  onClick={() => handleViewLedger(selected)}
                >
                  كشف الحركة
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Edit3 size={15} />}
                  onClick={() => handleOpenEdit(selected)}
                >
                  تعديل الصنف
                </Button>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['كود الصنف (SKU)', selected.sku],
                ['الباركود', selected.barcode || '—'],
                ['اسم الصنف', selected.name],
                ['التصنيف', selected.categoryName || '—'],
                ['وحدة القياس', selected.unitName || selected.unitSymbol || '—'],
                ['سعر الشراء', `${formatMoney(parseFloat(selected.purchase_price) || 0)} ر.ي`],
                ['سعر البيع', `${formatMoney(parseFloat(selected.sale_price) || 0)} ر.ي`],
                ['هامش الربح', marginOf(selected) === null ? '—' : `${marginOf(selected)!.toFixed(1)}%`],
                ['الحد الأدنى للمخزون', formatMoney(parseFloat(selected.minimum_stock) || 0)],
                ['حد إعادة الطلب', formatMoney(parseFloat(selected.reorder_point) || 0)],
                ['الرصيد الفعلي', selected.currentStock.toLocaleString()],
                ['متوسط التكلفة (WAC)', `${formatMoney(selected.averageCost)} ر.ي`],
                ['قيمة المخزون', `${formatMoney(selected.stockValue)} ر.ي`],
                ['صنف مخزني', selected.is_stock_item ? 'نعم' : 'لا'],
                ['حالة الصنف', selected.is_active ? 'نشط' : 'غير نشط'],
                ['الوصف', selected.description || '—'],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-control border border-line bg-surface-muted px-3 py-2">
                  <p className="text-[11px] font-semibold text-ink-muted">{label}</p>
                  <p className="mt-0.5 break-words text-[13px] font-bold text-ink">{value}</p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {/* نموذج الإضافة/التعديل — نافذة مستقلة عن جدول العرض */}
        <FormDialog
          open={isNew || editing}
          onClose={handleCancelDetail}
          title={isNew ? 'تعريف عنصر جديد' : `تعديل الصنف: ${selected?.name || ''}`}
          description={
            isNew
              ? 'أدخل البيانات الأساسية ثم اضغط حفظ لإنشاء الصنف في دليل الأصناف.'
              : 'عدّل الحقول المسموح بها. كود الصنف معرّف محمي بعد الإنشاء.'
          }
          icon={<Package size={18} />}
          size="xl"
          submitLabel={isNew ? 'حفظ الصنف' : 'حفظ التعديلات'}
          submitLoadingLabel="جارٍ الحفظ..."
          submitting={saving}
          dirty={JSON.stringify(formData) !== formSnapshot}
          error={error}
          onSubmit={handleSaveItem}
          footerNote="الحقول المعلّمة بـ * مطلوبة. لا تُغلق النافذة قبل تأكيد الخادم."
        >
            <div>
              {/* التبويبات — المكوّن المشترك الموحّد (نفس النمط في كل الشاشات) */}
              <Tabs
                ariaLabel="تبويبات تفاصيل الصنف"
                value={activeTab}
                onValueChange={(id) => setActiveTab(id as DetailTab)}
                className="mb-4 px-1"
                items={tabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))}
              />

              <div>

                {activeTab === 'basic' && (
                  <FormGrid cols={2}>
                    <FormField
                      label="كود الصنف (SKU)"
                      required
                      error={errors.sku}
                      hint={isNew ? 'يجب أن يكون فريداً داخل الشركة' : 'معرّف محمي — لا يمكن تغييره بعد الإنشاء'}
                    >
                      <Input
                        value={formData.sku}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                        placeholder="مثال: ITM-001"
                        readOnly={!isNew}
                        className={!isNew ? 'cursor-not-allowed opacity-70' : undefined}
                      />
                    </FormField>
                    <FormField label="الباركود الدولي" hint="اختياري — يُستخدم في الباركود قارئ المستودع">
                      <Input
                        value={formData.barcode}
                        onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                        placeholder="مثال: 6281000123457"
                      />
                    </FormField>
                    <FormField label="اسم الصنف بالكامل" required error={errors.name} className="md:col-span-2">
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="مثال: سكر أبيض 1 كجم"
                      />
                    </FormField>
                    <FormField label="ملاحظات ومواصفات تفصيلية" className="md:col-span-2">
                      <Textarea
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="أدخل المواصفات التقنية أو ملاحظات التخزين..."
                      />
                    </FormField>
                  </FormGrid>
                )}

                {activeTab === 'pricing' && (
                  <>
                    <FormGrid cols={2}>
                      <FormField label="التصنيف" required>
                        <SearchSelect
                          value={formData.categoryId}
                          onValueChange={(v) => setFormData({ ...formData, categoryId: v })}
                          options={categories.map((c) => ({ value: c.id, label: c.name }))}
                          placeholder="اختر التصنيف"
                          emptyLabel="لا توجد تصنيفات"
                        />
                      </FormField>
                      <FormField label="وحدة القياس الأساسية" required>
                        <SearchSelect
                          value={formData.unitId}
                          onValueChange={(v) => setFormData({ ...formData, unitId: v })}
                          options={units.map((u) => ({
                            value: u.id,
                            label: u.symbol ? `${u.name} (${u.symbol})` : u.name,
                          }))}
                          placeholder="اختر الوحدة"
                          emptyLabel="لا توجد وحدات"
                        />
                      </FormField>
                      <FormField label="سعر الشراء (التكلفة القياسية)" hint="بالريال — يُستخدم في احتساب الوارد">
                        <NumericInput
                          value={formData.purchasePrice}
                          onValueChange={(v) => setFormData({ ...formData, purchasePrice: v })}
                          step="0.01"
                          min="0"
                        />
                      </FormField>
                      <FormField label="سعر البيع" hint="بالريال — يُستخدم في احتساب الصادر">
                        <NumberInput
                          value={formData.salePrice}
                          onValueChange={(v) => setFormData({ ...formData, salePrice: v })}
                          step="0.01"
                          min="0"
                        />
                      </FormField>
                    </FormGrid>

                    {/* هامش الربح — قراءة فقط، مشتقّ من السعرين */}
                    <div className="mt-4 rounded-control border border-line bg-surface-muted px-4 py-3">
                      <p className="text-[13px] font-semibold text-ink-muted">هامش الربح (محسوب)</p>
                      <p className="kayan-numeric mt-1 text-lg font-extrabold text-ink">
                        {currentMargin === null ? '—' : `${currentMargin.toFixed(1)}%`}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {(parseFloat(formData.salePrice) || 0) - (parseFloat(formData.purchasePrice) || 0) >= 0
                          ? 'الربح للوحدة: '
                          : 'خسارة للوحدة: '}
                        {formatMoney(
                          Math.abs(
                            (parseFloat(formData.salePrice) || 0) - (parseFloat(formData.purchasePrice) || 0)
                          )
                        )}{' '}
                        ر.ي — يُعرض فقط ولا يُخزَّن.
                      </p>
                    </div>
                  </>
                )}

                {activeTab === 'stock' && (
                  <>
                    <FormGrid cols={2}>
                      <FormField label="الحد الأدنى للسلامة (Safety Stock)" hint="لا يُسمح بالنزول تحته في الطلب">
                        <NumberInput
                          value={formData.minimumStock}
                          onValueChange={(v) => setFormData({ ...formData, minimumStock: v })}
                          min="0"
                        />
                      </FormField>
                      <FormField label="حد إعادة الطلب (Reorder Point)" hint="عند بلوغه يظهر الصنف كمنخفض">
                        <NumberInput
                          value={formData.reorderPoint}
                          onValueChange={(v) => setFormData({ ...formData, reorderPoint: v })}
                          min="0"
                        />
                      </FormField>
                    </FormGrid>

                    <div className="mt-4 space-y-3 rounded-control border border-line bg-surface-muted p-4">
                      <Checkbox
                        checked={formData.isStockItem}
                        onChange={(e) => setFormData({ ...formData, isStockItem: e.target.checked })}
                        label="صنف مخزني (يخضع لحركات المخزون والتقييم المستمر)"
                      />
                      {selected && (
                        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                          <span className="text-[13px] font-semibold text-ink-muted">حالة الصنف:</span>
                          <StatusBadge tone={selected.is_active ? 'success' : 'neutral'}>
                            {selected.is_active ? 'نشط' : 'غير نشط'}
                          </StatusBadge>
                          <Button
                            size="sm"
                            variant={selected.is_active ? 'warning' : 'success'}
                            loading={togglingId === selected.id}
                            onClick={() => handleToggleActive(selected)}
                          >
                            {selected.is_active ? 'تعطيل الصنف' : 'تفعيل الصنف'}
                          </Button>
                        </div>
                      )}
                    </div>

                    {selected && (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-control border border-line px-3 py-2">
                          <p className="text-[11px] font-semibold text-ink-muted">الرصيد الفعلي</p>
                          <p className="kayan-numeric mt-0.5 text-base font-extrabold text-ink">
                            {selected.currentStock.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-control border border-line px-3 py-2">
                          <p className="text-[11px] font-semibold text-ink-muted">متوسط التكلفة (WAC)</p>
                          <p className="kayan-numeric mt-0.5 text-base font-extrabold text-ink">
                            {formatMoney(selected.averageCost)}
                          </p>
                        </div>
                        <div className="rounded-control border border-line px-3 py-2">
                          <p className="text-[11px] font-semibold text-ink-muted">قيمة المخزون</p>
                          <p className="kayan-numeric mt-0.5 text-base font-extrabold text-state-success">
                            {formatMoney(selected.stockValue)} <span className="text-[11px]">ر.ي</span>
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'extra' && (
                  <div className="space-y-4">
                    <FormSection plain title="ملخص الوضع المخزني" icon={<ClipboardList size={16} />}>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-control border border-line px-3 py-2">
                          <p className="text-[11px] font-semibold text-ink-muted">الحالة المخزنية</p>
                          <div className="mt-1">{selected ? stockBadge(selected) : '—'}</div>
                        </div>
                        <div className="rounded-control border border-line px-3 py-2">
                          <p className="text-[11px] font-semibold text-ink-muted">الرصيد الفعلي</p>
                          <p className="kayan-numeric mt-0.5 text-base font-extrabold text-ink">
                            {selected ? selected.currentStock.toLocaleString() : '—'}
                          </p>
                        </div>
                        <div className="rounded-control border border-line px-3 py-2">
                          <p className="text-[11px] font-semibold text-ink-muted">قيمة المخزون</p>
                          <p className="kayan-numeric mt-0.5 text-base font-extrabold text-ink">
                            {selected ? `${formatMoney(selected.stockValue)} ر.ي` : '—'}
                          </p>
                        </div>
                      </div>
                    </FormSection>

                    {/* سجل التعديلات — من حقول قاعدة البيانات نفسها
                        (created_at / updated_at). لا أسماء مستخدمين
                        لأن الجدول لا يحفظها، فلا نُفّر وصفاً. */}
                    <FormSection plain title="سجل الإنشاء والتعديل" icon={<History size={16} />}>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-control border border-line bg-surface-muted px-3 py-2">
                          <p className="text-[11px] font-semibold text-ink-muted">تاريخ الإنشاء</p>
                          <p className="kayan-numeric mt-0.5 text-[13px] font-bold text-ink">
                            {selected?.created_at ? new Date(selected.created_at).toLocaleString('en-GB') : '—'}
                          </p>
                        </div>
                        <div className="rounded-control border border-line bg-surface-muted px-3 py-2">
                          <p className="text-[11px] font-semibold text-ink-muted">آخر تعديل</p>
                          <p className="kayan-numeric mt-0.5 text-[13px] font-bold text-ink">
                            {selected?.updated_at ? new Date(selected.updated_at).toLocaleString('en-GB') : '—'}
                          </p>
                        </div>
                      </div>
                    </FormSection>
                  </div>
                )}
              </div>
            </div>
        </FormDialog>
      </div>

      {/* ------------------------------------------------------------
          نافذة كشف حركة الصنف — سلوكها محفوظ تماماً
          ------------------------------------------------------------ */}
      <Dialog
        open={showLedgerModal}
        onClose={() => setShowLedgerModal(false)}
        size="xl"
        title="كشف حركة الصنف التفصيلي (Stock Ledger)"
        description={
          selectedItemForLedger
            ? `${selectedItemForLedger.name} — ${selectedItemForLedger.sku}`
            : undefined
        }
        icon={<History size={18} />}
        footer={
          <>
            <Button variant="secondary" icon={<Printer size={14} />} onClick={() => window.print()}>
              طباعة الكشف
            </Button>
            <Button variant="primary" onClick={() => setShowLedgerModal(false)}>
              إغلاق
            </Button>
          </>
        }
      >
        {loadingLedger ? (
          <div className="py-14 text-center">
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-[3px] border-line border-t-brand" />
            <p className="mt-3 text-[13px] text-ink-muted">
              جاري احتساب المتوسط المرجح وحركات المخزون...
            </p>
          </div>
        ) : ledgerData ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-control border border-line bg-surface-muted px-3 py-2.5">
                <p className="text-[11px] font-semibold text-ink-muted">الرصيد التراكمي الفعلي</p>
                <p className="kayan-numeric mt-1 text-lg font-extrabold text-ink">
                  {ledgerData.finalStock.toLocaleString()}{' '}
                  <span className="text-[11px] font-normal">وحدة</span>
                </p>
              </div>
              <div className="rounded-control border border-line bg-surface-muted px-3 py-2.5">
                <p className="text-[11px] font-semibold text-ink-muted">متوسط التكلفة المرجح (WAC)</p>
                <p className="kayan-numeric mt-1 text-lg font-extrabold text-brand">
                  {formatMoney(ledgerData.finalAverageCost)}
                </p>
              </div>
              <div className="rounded-control border border-line bg-surface-muted px-3 py-2.5">
                <p className="text-[11px] font-semibold text-ink-muted">إجمالي قيمة الرصيد</p>
                <p className="kayan-numeric mt-1 text-lg font-extrabold text-state-success">
                  {formatMoney(ledgerData.finalValue)}
                </p>
              </div>
            </div>

            <DataTable
              compact
              columns={[
                {
                  key: 'num',
                  header: 'رقم الحركة / التاريخ',
                  render: (e: LedgerEntry) => (
                    <div>
                      <div className="font-mono font-bold text-ink">{e.transactionNumber}</div>
                      <div className="kayan-numeric text-[11px] text-ink-muted">{e.transactionDate}</div>
                    </div>
                  ),
                },
                {
                  key: 'type',
                  header: 'نوع الحركة',
                  render: (e: LedgerEntry) => (
                    <StatusBadge tone={e.isInflow ? 'success' : 'danger'} size="sm">
                      {translateTxType(e.transactionType)}
                    </StatusBadge>
                  ),
                },
                { key: 'wh', header: 'المستودع', render: (e: LedgerEntry) => e.warehouseName },
                {
                  key: 'in',
                  header: 'وارد (+)',
                  align: 'end',
                  numeric: true,
                  render: (e: LedgerEntry) =>
                    e.inQty > 0 ? (
                      <span className="font-bold text-state-success">+{e.inQty}</span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    ),
                },
                {
                  key: 'out',
                  header: 'صادر (-)',
                  align: 'end',
                  numeric: true,
                  render: (e: LedgerEntry) =>
                    e.outQty > 0 ? (
                      <span className="font-bold text-state-danger">-{e.outQty}</span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    ),
                },
                {
                  key: 'run',
                  header: 'الرصيد التراكمي',
                  align: 'end',
                  numeric: true,
                  render: (e: LedgerEntry) => <span className="font-bold text-ink">{e.runningStock}</span>,
                },
                {
                  key: 'uc',
                  header: 'تكلفة الوحدة',
                  align: 'end',
                  numeric: true,
                  hideOnSmall: true,
                  render: (e: LedgerEntry) => formatMoney(e.unitCost),
                },
                {
                  key: 'wac',
                  header: 'المتوسط المرجح (WAC)',
                  align: 'end',
                  numeric: true,
                  hideOnSmall: true,
                  render: (e: LedgerEntry) => (
                    <span className="font-bold text-brand">{formatMoney(e.currentAvgCost)}</span>
                  ),
                },
                {
                  key: 'val',
                  header: 'قيمة الرصيد',
                  align: 'end',
                  numeric: true,
                  render: (e: LedgerEntry) => (
                    <span className="font-bold text-state-success">{formatMoney(e.runningValue)}</span>
                  ),
                },
              ]}
              data={ledgerData.entries}
              rowKey={(e, i) => e.transactionId || String(i)}
              emptyMessage="لا توجد حركات مخزنية مسجلة لهذا الصنف حتى الآن"
              stickyHeader
            />
          </div>
        ) : null}
      </Dialog>

      {/* تأكيد الحذف — بدل confirm() النصّي */}
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        tone="danger"
        title="تأكيد حذف الصنف"
        message={
          <>
            هل أنت متأكد من رغبتك في حذف الصنف{' '}
            <strong className="font-bold">"{confirmDelete?.name}"</strong>؟
            <br />
            <span className="text-ink-muted">
              لا يمكن حذف صنف أُجريت عليه حركات مخزنية.
            </span>
          </>
        }
        confirmLabel="حذف الصنف"
        cancelLabel="إلغاء"
        busy={deleting}
        onConfirm={handleDeleteItem}
        onCancel={() => setConfirmDelete(null)}
      />
    </ScreenShell>
  );
};