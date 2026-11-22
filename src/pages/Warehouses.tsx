import React, { useState, useEffect, useMemo } from 'react';
import {
  Warehouse,
  FolderTree,
  Ruler,
  Plus,
  CheckCircle2,
  MapPin,
  Layers,
} from 'lucide-react';
import {
  ScreenShell,
  PageHeader,
  PageToolbar,
  DataTable,
  DataTableColumn,
  Tabs,
  KpiCard,
  Card,
  StatusBadge,
  Button,
  FormDialog,
  FormField,
  FormGrid,
  Input,
  NumberInput,
  useToast,
} from '../components/ui';

type TabId = 'warehouses' | 'categories' | 'units';

interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  address?: string | null;
}

interface CategoryRow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

interface UnitRow {
  id: string;
  code: string;
  name: string;
  conversion_factor?: string | number | null;
}

const TAB_META: Record<TabId, { label: string; addLabel: string; icon: React.ReactNode }> = {
  warehouses: { label: 'المستودعات', addLabel: 'إضافة مستودع جديد', icon: <Warehouse size={15} /> },
  categories: { label: 'التصنيفات', addLabel: 'إضافة تصنيف جديد', icon: <FolderTree size={15} /> },
  units: { label: 'وحدات القياس', addLabel: 'إضافة وحدة قياس جديدة', icon: <Ruler size={15} /> },
};

export const WarehousesPage: React.FC = () => {
  const toast = useToast();

  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('warehouses');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states
  const [whName, setWhName] = useState('');
  const [whCode, setWhCode] = useState('');
  const [whAddress, setWhAddress] = useState('');
  const [catName, setCatName] = useState('');
  const [catCode, setCatCode] = useState('');
  const [unitName, setUnitName] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [unitFactor, setUnitFactor] = useState('1');

  const fetchData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [resWh, resCat, resUnits] = await Promise.all([
        fetch('/api/inventory/warehouses'),
        fetch('/api/inventory/categories'),
        fetch('/api/inventory/units'),
      ]);
      if (resWh.ok) setWarehouses(await resWh.json());
      if (resCat.ok) setCategories(await resCat.json());
      if (resUnits.ok) setUnits(await resUnits.json());
      if (!resWh.ok || !resCat.ok || !resUnits.ok) {
        throw new Error('تعذّر تحميل بعض البيانات الأساسية للمخزون');
      }
    } catch (err: any) {
      console.error('Error fetching inventory master data:', err);
      setLoadError(err?.message || 'تعذّر تحميل البيانات الأساسية للمخزون');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  /* بحث عميل على التبويب المفتوح فقط — لا يغيّر البيانات المحفوظة. */
  const q = search.trim().toLowerCase();
  const filteredWarehouses = useMemo(
    () =>
      warehouses.filter(
        (w) => !q || `${w.name} ${w.code} ${w.address || ''}`.toLowerCase().includes(q)
      ),
    [warehouses, q]
  );
  const filteredCategories = useMemo(
    () => categories.filter((c) => !q || `${c.name} ${c.code} ${c.description || ''}`.toLowerCase().includes(q)),
    [categories, q]
  );
  const filteredUnits = useMemo(
    () => units.filter((u) => !q || `${u.name} ${u.code}`.toLowerCase().includes(q)),
    [units, q]
  );

  const resetForm = () => {
    setWhName(''); setWhCode(''); setWhAddress('');
    setCatName(''); setCatCode('');
    setUnitName(''); setUnitCode(''); setUnitFactor('1');
    setFormError(null);
  };

  const nextCode = (prefix: string, rows: { code: string }[]) => {
    const max = rows.reduce((acc, r) => {
      const m = new RegExp(`^${prefix}-(\\d+)$`, 'i').exec(r.code || '');
      return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
    }, 0);
    return `${prefix}-${String(max + 1).padStart(2, '0')}`;
  };

  const openCreate = () => {
    resetForm();
    if (activeTab === 'warehouses') setWhCode(nextCode('WH', warehouses));
    else if (activeTab === 'categories') setCatCode(nextCode('CAT', categories));
    else setUnitCode(nextCode('UNT', units));
    setIsModalOpen(true);
  };

  const formDirty = Boolean(whName || catName || unitName || whAddress);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      if (activeTab === 'warehouses') {
        if (!whCode.trim() || !whName.trim()) throw new Error('كود المستودع واسمه مطلوبان.');
        const res = await fetch('/api/inventory/warehouses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: whName.trim(), code: whCode.trim(), address: whAddress.trim() }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `تعذر إضافة المستودع (${res.status})`);
        }
        toast.success('تمت إضافة المستودع بنجاح', { description: `كود المستودع: ${whCode}` });
      } else if (activeTab === 'categories') {
        if (!catCode.trim() || !catName.trim()) throw new Error('كود التصنيف واسمه مطلوبان.');
        const res = await fetch('/api/inventory/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: catName.trim(), code: catCode.trim() }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `تعذر إضافة التصنيف (${res.status})`);
        }
        toast.success('تمت إضافة التصنيف بنجاح', { description: `كود التصنيف: ${catCode}` });
      } else {
        if (!unitCode.trim() || !unitName.trim()) throw new Error('رمز الوحدة واسمها مطلوبان.');
        const factor = Number(unitFactor);
        if (!Number.isFinite(factor) || factor <= 0) throw new Error('معامل التحويل يجب أن يكون رقماً أكبر من صفر.');
        const res = await fetch('/api/inventory/units', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: unitName.trim(), code: unitCode.trim(), conversionFactor: factor }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `تعذر إضافة الوحدة (${res.status})`);
        }
        toast.success('تمت إضافة وحدة القياس بنجاح', { description: `رمز الوحدة: ${unitCode}` });
      }

      setIsModalOpen(false);
      resetForm();
      await fetchData();
    } catch (err: any) {
      // تبقى القيم في النموذج ليصححها المستخدم بدل إعادة الكتابة.
      setFormError(err?.message || 'تعذّر حفظ البيانات. راجع المدخلات وحاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  const meta = TAB_META[activeTab];

  const categoryColumns: DataTableColumn<CategoryRow>[] = [
    {
      key: 'code',
      header: 'كود التصنيف',
      width: '160px',
      render: (c) => <span className="font-mono text-[13px] font-bold text-brand">{c.code}</span>,
    },
    { key: 'name', header: 'اسم التصنيف', render: (c) => <span className="font-semibold text-ink">{c.name}</span> },
    { key: 'description', header: 'الوصف', render: (c) => <span className="text-ink-muted">{c.description || '—'}</span> },
    {
      key: 'status',
      header: 'الحالة',
      align: 'center',
      width: '120px',
      render: () => (
        <StatusBadge tone="success" size="sm" icon={<CheckCircle2 size={12} />}>
          نشط
        </StatusBadge>
      ),
    },
  ];

  const unitColumns: DataTableColumn<UnitRow>[] = [
    {
      key: 'code',
      header: 'رمز الوحدة',
      width: '160px',
      render: (u) => <span className="font-mono text-[13px] font-bold text-brand">{u.code}</span>,
    },
    { key: 'name', header: 'اسم الوحدة', render: (u) => <span className="font-semibold text-ink">{u.name}</span> },
    {
      key: 'conversion_factor',
      header: 'معامل التحويل',
      align: 'end',
      numeric: true,
      width: '150px',
      render: (u) => parseFloat(String(u.conversion_factor ?? '1')),
    },
    {
      key: 'status',
      header: 'الحالة',
      align: 'center',
      width: '120px',
      render: () => (
        <StatusBadge tone="success" size="sm" icon={<CheckCircle2 size={12} />}>
          نشط
        </StatusBadge>
      ),
    },
  ];

  return (
    <ScreenShell>
      <PageHeader
        title="المستودعات والتصنيفات ووحدات القياس"
        description="البيانات الأساسية للمخزون: المستودعات المركزية، شجرة التصنيفات، ووحدات القياس"
        icon={<Warehouse size={18} />}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={openCreate}>
            {meta.addLabel}
          </Button>
        }
      />

      {/* بطاقات الإحصاء — القيم مشتقّة من API حقيقي فقط */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="المستودعات المعرفة"
          value={warehouses.length.toLocaleString()}
          unit="مستودع"
          tone="brand"
          icon={<Warehouse size={18} />}
          pending={loading}
        />
        <KpiCard
          label="التصنيفات"
          value={categories.length.toLocaleString()}
          unit="تصنيف"
          tone="success"
          icon={<FolderTree size={18} />}
          pending={loading}
        />
        <KpiCard
          label="وحدات القياس"
          value={units.length.toLocaleString()}
          unit="وحدة"
          tone="warning"
          icon={<Ruler size={18} />}
          pending={loading}
        />
      </div>

      <PageToolbar
        search={{
          value: search,
          onValueChange: setSearch,
          placeholder: 'ابحث بالاسم أو الكود داخل التبويب المفتوح...',
        }}
      />

      <Card flush>
        <Tabs
          ariaLabel="أنواع البيانات الأساسية"
          value={activeTab}
          onValueChange={(id) => setActiveTab(id as TabId)}
          className="px-2"
          items={(['warehouses', 'categories', 'units'] as TabId[]).map((id) => ({
            id,
            label: TAB_META[id].label,
            icon: TAB_META[id].icon,
            count:
              id === 'warehouses'
                ? warehouses.length
                : id === 'categories'
                  ? categories.length
                  : units.length,
          }))}
        />

        <div className="p-4">
          {activeTab === 'warehouses' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {loading ? (
                <Card className="sm:col-span-2 lg:col-span-3">
                  <div className="px-6 py-10 text-center" role="status">
                    <div
                      className="mx-auto h-7 w-7 animate-spin rounded-full border-[3px] border-line border-t-brand"
                      aria-hidden="true"
                    />
                    <p className="mt-3 text-[13px] text-ink-muted">جارٍ تحميل المستودعات...</p>
                  </div>
                </Card>
              ) : filteredWarehouses.length === 0 ? (
                <Card className="sm:col-span-2 lg:col-span-3">
                  <div className="px-6 py-10 text-center">
                    <Layers size={30} className="mx-auto text-ink-muted/60" aria-hidden="true" />
                    <p className="mt-3 text-sm font-bold text-ink">
                      {search ? 'لا توجد مستودعات مطابقة للبحث' : 'لا توجد مستودعات معرفة بعد'}
                    </p>
                    {!search && (
                      <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-muted">
                        أنشئ أول مستودع لتتمكن من ربط حركات المخزون به.
                      </p>
                    )}
                  </div>
                </Card>
              ) : (
                filteredWarehouses.map((wh) => (
                  <div key={wh.id} className="space-y-3 rounded-card border border-line bg-surface p-5 shadow-k-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="inline-block rounded-md border border-brand/25 bg-brand-soft px-2 py-0.5 font-mono text-xs font-bold text-brand">
                          {wh.code}
                        </span>
                        <h3 className="mt-2 text-sm font-bold text-ink">{wh.name}</h3>
                      </div>
                      <StatusBadge tone="success" size="sm" icon={<CheckCircle2 size={12} />}>
                        نشط
                      </StatusBadge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <MapPin size={14} className="shrink-0 text-ink-muted/70" aria-hidden="true" />
                      <span>{wh.address || 'العنوان غير محدد'}</span>
                    </div>
                    <div className="border-t border-line-soft pt-2 font-mono text-[11px] text-ink-muted">
                      حساب المخزون المرتبط: 1104
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'categories' && (
            <DataTable<CategoryRow>
              columns={categoryColumns}
              data={filteredCategories}
              rowKey={(c) => c.id}
              loading={loading}
              loadingText="جارٍ تحميل التصنيفات..."
              error={loadError}
              emptyMessage={search ? 'لا توجد تصنيفات مطابقة للبحث' : 'لا توجد تصنيفات معرفة بعد'}
              emptyIcon={<FolderTree size={30} />}
              stickyHeader
            />
          )}

          {activeTab === 'units' && (
            <DataTable<UnitRow>
              columns={unitColumns}
              data={filteredUnits}
              rowKey={(u) => u.id}
              loading={loading}
              loadingText="جارٍ تحميل وحدات القياس..."
              error={loadError}
              emptyMessage={search ? 'لا توجد وحدات مطابقة للبحث' : 'لا توجد وحدات قياس معرفة بعد'}
              emptyIcon={<Ruler size={30} />}
              stickyHeader
            />
          )}
        </div>
      </Card>

      <FormDialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={meta.addLabel}
        description="سجل جديد مستقل — لا يمكن الحفظ قبل تأكيد الخادم."
        icon={meta.icon}
        size="lg"
        submitLabel="حفظ"
        submitting={saving}
        dirty={formDirty}
        error={formError}
        onSubmit={handleCreate}
        footerNote="الحقول المعلّمة بـ * مطلوبة."
      >
        {activeTab === 'warehouses' && (
          <FormGrid cols={2}>
            <FormField label="كود المستودع" required hint="مثال: WH-03">
              <Input required value={whCode} onChange={(e) => setWhCode(e.target.value)} className="font-mono" maxLength={40} />
            </FormField>
            <FormField label="اسم المستودع" required hint="مثال: مستودع المعلا">
              <Input required value={whName} onChange={(e) => setWhName(e.target.value)} maxLength={160} />
            </FormField>
            <FormField label="العنوان والموقع" hint="اختياري — يظهر في تقارير الحركة" className="md:col-span-2">
              <Input
                value={whAddress}
                onChange={(e) => setWhAddress(e.target.value)}
                placeholder="مثال: عدن - شارع الميناء"
                maxLength={250}
              />
            </FormField>
          </FormGrid>
        )}

        {activeTab === 'categories' && (
          <FormGrid cols={2}>
            <FormField label="كود التصنيف" required hint="مثال: CAT-NET">
              <Input required value={catCode} onChange={(e) => setCatCode(e.target.value)} className="font-mono" maxLength={40} />
            </FormField>
            <FormField label="اسم التصنيف" required hint="مثال: شبكات واتصالات">
              <Input required value={catName} onChange={(e) => setCatName(e.target.value)} maxLength={160} />
            </FormField>
          </FormGrid>
        )}

        {activeTab === 'units' && (
          <FormGrid cols={2}>
            <FormField label="رمز الوحدة" required hint="مثال: PKT">
              <Input required value={unitCode} onChange={(e) => setUnitCode(e.target.value)} className="font-mono" maxLength={40} />
            </FormField>
            <FormField label="اسم الوحدة" required hint="مثال: باكت">
              <Input required value={unitName} onChange={(e) => setUnitName(e.target.value)} maxLength={160} />
            </FormField>
            <FormField label="معامل التحويل" hint="العدد من الوحدة الأساسية داخل هذه الوحدة" className="md:col-span-2">
              <NumberInput min={1} step="1" value={unitFactor} onValueChange={setUnitFactor} />
            </FormField>
          </FormGrid>
        )}
      </FormDialog>
    </ScreenShell>
  );
};
