import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  Search,
  Plus,
  CheckCircle2,
  Package,
  RefreshCw,
  Eye,
  Check,
  FileText,
  Warehouse,
} from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';
import {
  Button,
  ConfirmDialog,
  Dialog,
  FormDialog,
  FormField,
  FormGrid,
  Input,
  Select,
  Textarea,
  useToast,
} from '../components/ui';

interface CountRow {
  id: string;
  count_number?: string;
  warehouse_id: string;
  warehouseName?: string;
  count_date?: string;
  notes?: string;
  status?: 'DRAFT' | 'APPROVED' | string;
}

interface WarehouseRow {
  id: string;
  code?: string;
  name: string;
}

const EMPTY_COUNT_FORM = {
  warehouseId: '',
  countDate: new Date().toISOString().split('T')[0],
  notes: '',
  lines: [] as Array<{ itemId: string; sku?: string; name?: string; countedQuantity: number }>,
};

export const InventoryCountsPage: React.FC = () => {
  const { navigateTo } = useNavigation();
  const toast = useToast();

  const [counts, setCounts] = useState<CountRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState('ALL');

  // نموذج إنشاء جرد جديد — نافذة مستقلة
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCountForm, setNewCountForm] = useState(EMPTY_COUNT_FORM);
  const [formSnapshot, setFormSnapshot] = useState(JSON.stringify(EMPTY_COUNT_FORM));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // عرض/اعتماد محضر قائم
  const [selectedCount, setSelectedCount] = useState<CountRow | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveTarget, setApproveTarget] = useState<CountRow | null>(null);

  const formDirty = showCreateModal && JSON.stringify(newCountForm) !== formSnapshot;

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resCounts, resWh] = await Promise.all([
        fetch('/api/inventory/counts'),
        fetch('/api/inventory/warehouses'),
      ]);
      if (!resCounts.ok || !resWh.ok) {
        const failed = !resCounts.ok ? resCounts : resWh;
        const data = await failed.json().catch(() => ({}));
        throw new Error(data.error || `تعذر تحميل بيانات الجرد (${failed.status})`);
      }
      const countsData = await resCounts.json();
      const whData = await resWh.json();
      setCounts(Array.isArray(countsData) ? countsData : []);
      setWarehouses(Array.isArray(whData) ? whData : []);
      setLoadError(null);
    } catch (err: any) {
      console.error('Error loading inventory counts:', err);
      setLoadError(err?.message || 'تعذر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreate = () => {
    const initial = { ...EMPTY_COUNT_FORM, countDate: new Date().toISOString().split('T')[0] };
    setNewCountForm(initial);
    setFormSnapshot(JSON.stringify(initial));
    setFormError(null);
    setShowCreateModal(true);
  };

  const closeCreate = () => {
    if (saving) return;
    setShowCreateModal(false);
    setFormError(null);
  };

  const handleCreateCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!newCountForm.warehouseId) {
      setFormError('يرجى اختيار المستودع المستهدف قبل إنشاء المحضر.');
      return;
    }
    if (!newCountForm.countDate) {
      setFormError('تاريخ جلسة الجرد مطلوب.');
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/inventory/counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId: newCountForm.warehouseId,
          countDate: newCountForm.countDate,
          notes: newCountForm.notes,
          lines: newCountForm.lines.map((l) => ({
            itemId: l.itemId,
            countedQuantity: l.countedQuantity,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || `فشل إنشاء محضر الجرد (${res.status})`);
        return; // تبقى القيم كما هي
      }

      setShowCreateModal(false);
      setNewCountForm(EMPTY_COUNT_FORM);
      setFormSnapshot(JSON.stringify(EMPTY_COUNT_FORM));
      toast.success('تم إنشاء محضر الجرد كمسودة', { description: data?.count_number });
      await fetchData();
    } catch (err: any) {
      setFormError(err?.message || 'تعذر الاتصال بالخادم. لم تُفقد بياناتك.');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveCount = async (count: CountRow) => {
    try {
      setApproving(true);
      const res = await fetch(`/api/inventory/counts/${count.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error('فشل اعتماد الجرد', {
          description: data.error || `رفض الخادم الطلب (${res.status})`,
        });
        return;
      }

      toast.success('تم اعتماد محضر الجرد وتوليد تسويات المخزون', {
        description: count.count_number,
      });
      setApproveTarget(null);
      setSelectedCount(null);
      await fetchData();
    } catch (err: any) {
      toast.error('تعذر تنفيذ الاعتماد', { description: err?.message });
    } finally {
      setApproving(false);
    }
  };

  const filteredCounts = counts.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      c.count_number?.toLowerCase().includes(q) ||
      c.warehouseName?.toLowerCase().includes(q) ||
      c.notes?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchesWarehouse = warehouseFilter === 'ALL' || c.warehouse_id === warehouseFilter;
    return matchesSearch && matchesStatus && matchesWarehouse;
  });

  const totalCounts = counts.length;
  const draftCounts = counts.filter((c) => c.status === 'DRAFT').length;
  const approvedCounts = counts.filter((c) => c.status === 'APPROVED').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-6 rounded-card border border-line shadow-k-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-control bg-state-success text-white flex items-center justify-center shadow-k-xs">
            <ClipboardCheck size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-ink-muted font-medium mb-1">
              <button onClick={() => navigateTo('/')} className="hover:text-brand transition-colors">الرئيسية</button>
              <span>&gt;</span>
              <span>المخزون</span>
              <span>&gt;</span>
              <span className="text-ink font-bold">الجرد الفعلي</span>
            </div>
            <h1 className="text-xl font-black text-ink">الجرد الفعلي للمخزون (Inventory Count Management)</h1>
            <p className="text-xs text-ink-muted">إنشاء وإدارة عمليات الجرد الفعلي ومطابقة الكميات مع الرصيد الدفتري وتنفيذ تسويات المخزون</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={fetchData} loading={loading}>
            تحديث
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={openCreate}>
            إنشاء جرد جديد
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-state-danger/40 bg-state-danger-soft px-4 py-3 text-[13px] font-semibold text-ink-danger">
          <span>{loadError}</span>
          <Button variant="secondary" size="sm" onClick={fetchData}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface p-5 rounded-card border border-line shadow-k-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-ink-muted">إجمالي عمليات الجرد</span>
            <p className="text-2xl font-black text-ink mt-1 font-mono">{totalCounts}</p>
            <span className="text-[11px] text-ink-muted">جميع المحاضر المسجلة</span>
          </div>
          <div className="w-10 h-10 rounded-control bg-brand-soft text-brand flex items-center justify-center">
            <ClipboardCheck size={20} aria-hidden="true" />
          </div>
        </div>

        <div className="bg-surface p-5 rounded-card border border-line shadow-k-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-ink-muted">المسودات قيد الإعداد</span>
            <p className="text-2xl font-black text-ink-warning mt-1 font-mono">{draftCounts}</p>
            <span className="text-[11px] text-ink-warning">تحتاج إدخال كميات أو اعتماد</span>
          </div>
          <div className="w-10 h-10 rounded-control bg-state-warning-soft text-ink-warning flex items-center justify-center">
            <FileText size={20} aria-hidden="true" />
          </div>
        </div>

        <div className="bg-surface p-5 rounded-card border border-line shadow-k-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-ink-muted">المحاضر المعتمَدة</span>
            <p className="text-2xl font-black text-ink-success mt-1 font-mono">{approvedCounts}</p>
            <span className="text-[11px] text-ink-success">تم تنفيذ تسويات المخزون المرتبطة</span>
          </div>
          <div className="w-10 h-10 rounded-control bg-state-success-soft text-ink-success flex items-center justify-center">
            <CheckCircle2 size={20} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface p-4 rounded-card border border-line shadow-k-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute right-3.5 top-3 text-ink-muted" aria-hidden="true" />
          <Input
            type="search"
            placeholder="بحث برقم الجرد أو المستودع..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10 text-xs"
            aria-label="بحث في محاضر الجرد"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <Select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="w-48 text-xs"
            aria-label="تصفية حسب المستودع"
            options={[
              { value: 'ALL', label: 'جميع المستودعات' },
              ...warehouses.map((w) => ({ value: w.id, label: w.name })),
            ]}
          />

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-44 text-xs"
            aria-label="تصفية حسب الحالة"
            options={[
              { value: 'ALL', label: 'جميع الحالات' },
              { value: 'DRAFT', label: 'مسودة (Draft)' },
              { value: 'APPROVED', label: 'معتمد (Approved)' },
            ]}
          />
        </div>
      </div>

      {/* Real Data Table */}
      <div className="bg-surface rounded-card border border-line overflow-hidden shadow-k-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-surface-sunken text-ink font-bold">
              <tr>
                <th className="py-3 px-4">رقم محضر الجرد</th>
                <th className="py-3 px-4">المستودع</th>
                <th className="py-3 px-4 font-mono">تاريخ الجرد</th>
                <th className="py-3 px-4">ملاحظات المحضر</th>
                <th className="py-3 px-4 text-center">الحالة</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-ink-muted">
                    جاري تحميل محاضر الجرد...
                  </td>
                </tr>
              ) : filteredCounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-16 h-16 rounded-card bg-surface-sunken text-ink-muted flex items-center justify-center">
                        <ClipboardCheck size={32} aria-hidden="true" />
                      </div>
                      <div className="text-sm font-bold text-ink">لا توجد عمليات جرد مطابقة للبحث</div>
                      <p className="text-xs text-ink-muted">
                        لم يتم إنشاء أي محضر جرد أو لم يتم العثور على نتائج تطابق معايير التصفية
                      </p>
                      <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openCreate} className="mt-2">
                        إنشاء أول عملية جرد
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCounts.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-hover transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-ink-success">{c.count_number}</td>
                    <td className="py-3.5 px-4 font-bold text-ink">
                      <span className="flex items-center gap-1.5">
                        <Warehouse size={14} className="text-ink-muted" aria-hidden="true" />
                        <span>{c.warehouseName || c.warehouse_id}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-ink-muted">
                      {c.count_date ? new Date(c.count_date).toLocaleDateString('ar-YE') : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-ink-muted truncate max-w-xs">{c.notes || '—'}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-[10px] font-bold ${
                        c.status === 'APPROVED'
                          ? 'bg-state-success-soft text-ink-success border border-state-success/30'
                          : 'bg-state-warning-soft text-ink-warning border border-state-warning/30'
                      }`}>
                        {c.status === 'APPROVED' ? <CheckCircle2 size={11} aria-hidden="true" /> : <FileText size={11} aria-hidden="true" />}
                        <span>{c.status === 'APPROVED' ? 'معتمد' : 'مسودة'}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="secondary"
                          size="xs"
                          icon={<Eye size={13} />}
                          onClick={() => setSelectedCount(c)}
                        >
                          عرض / إدارة
                        </Button>
                        {c.status !== 'APPROVED' && (
                          <Button
                            variant="success"
                            size="xs"
                            icon={<Check size={13} />}
                            onClick={() => setApproveTarget(c)}
                            disabled={approving}
                          >
                            اعتماد
                          </Button>
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

      {/* نافذة مستقلة: إنشاء محضر جرد */}
      <FormDialog
        open={showCreateModal}
        onClose={closeCreate}
        title="إنشاء عملية جرد جديدة (Stock Count)"
        description="سيتم إنشاء المحضر كمسودة، ثم تُدخل الكميات الفعلية قبل الاعتماد."
        icon={<ClipboardCheck size={19} />}
        size="lg"
        submitLabel="إنشاء المسودة الآن"
        submitLoadingLabel="جارٍ الإنشاء..."
        submitting={saving}
        dirty={formDirty}
        error={formError}
        onSubmit={handleCreateCount}
        footerNote="لن يُنشأ أي تسوية مخزون قبل الاعتماد النهائي."
      >
        <FormGrid cols={2}>
          <FormField label="المستودع المستهدف" required className="md:col-span-2">
            <Select
              value={newCountForm.warehouseId}
              onChange={(e) => setNewCountForm({ ...newCountForm, warehouseId: e.target.value })}
              placeholder="— اختر المستودع —"
              options={warehouses.map((w) => ({
                value: w.id,
                label: `${w.code ? `${w.code} - ` : ''}${w.name}`,
              }))}
            />
          </FormField>

          <FormField label="تاريخ جلسة الجرد" required>
            <Input
              type="date"
              value={newCountForm.countDate}
              onChange={(e) => setNewCountForm({ ...newCountForm, countDate: e.target.value })}
            />
          </FormField>

          <div className="md:col-span-2">
            <FormField label="ملاحظات أو سبب الجرد" hint="اختياري — يظهر في المحضر والتقارير">
              <Textarea
                rows={3}
                value={newCountForm.notes}
                onChange={(e) => setNewCountForm({ ...newCountForm, notes: e.target.value })}
                placeholder="مثال: جرد دوري نهاية النصف الأول من السنة..."
                maxLength={400}
              />
            </FormField>
          </div>

          <div className="md:col-span-2 rounded-control border border-line bg-brand-soft p-3 text-[11px] leading-relaxed text-ink">
            ملاحظة: سيتم إنشاء محضر الجرد بحالة <strong>مسودة</strong>، وسيتمكن أمين المستودع من إدخال الكميات
            الفعلية ومطابقتها قبل الاعتماد النهائي الذي يولد التسويات الدفترية.
          </div>
        </FormGrid>
      </FormDialog>

      {/* عرض/إدارة محضر قائم — للعرض فقط، والاعتماد إجراء منفصل مؤكد */}
      <Dialog
        open={Boolean(selectedCount)}
        onClose={() => setSelectedCount(null)}
        title="تفاصيل محضر الجرد التشغيلي"
        description={selectedCount?.count_number ? `رقم المحضر: ${selectedCount.count_number}` : undefined}
        icon={<Package size={19} />}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedCount(null)}>
              إغلاق
            </Button>
            {selectedCount && selectedCount.status !== 'APPROVED' && (
              <Button
                variant="success"
                icon={<CheckCircle2 size={15} />}
                onClick={() => setApproveTarget(selectedCount)}
                disabled={approving}
              >
                اعتماد المحضر وتوليد تسويات المخزون
              </Button>
            )}
          </>
        }
      >
        {selectedCount && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-surface-muted p-4 rounded-control border border-line">
              <div>
                <span className="text-ink-muted block">المستودع:</span>
                <strong className="text-ink">{selectedCount.warehouseName || selectedCount.warehouse_id}</strong>
              </div>
              <div>
                <span className="text-ink-muted block">تاريخ الجرد:</span>
                <strong className="text-ink font-mono">
                  {selectedCount.count_date
                    ? new Date(selectedCount.count_date).toLocaleDateString('ar-YE')
                    : '—'}
                </strong>
              </div>
              <div>
                <span className="text-ink-muted block">الحالة:</span>
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                  selectedCount.status === 'APPROVED'
                    ? 'bg-state-success-soft text-ink-success'
                    : 'bg-state-warning-soft text-ink-warning'
                }`}>
                  {selectedCount.status === 'APPROVED' ? 'معتمد' : 'مسودة'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-xs text-ink">ملاحظات المحضر:</h4>
              <p className="text-xs text-ink bg-surface-muted border border-line p-3 rounded-control">
                {selectedCount.notes || 'لا توجد ملاحظات إضافية'}
              </p>
            </div>
          </div>
        )}
      </Dialog>

      {/* تأكيد الاعتماد — يذكر رقم المحضر والمستودع */}
      <ConfirmDialog
        open={Boolean(approveTarget)}
        tone="warning"
        busy={approving}
        title="تأكيد اعتماد محضر الجرد"
        message={
          <>
            سيتم اعتماد المحضر <strong>{approveTarget?.count_number}</strong> للمستودع{' '}
            <strong>{approveTarget?.warehouseName || approveTarget?.warehouse_id}</strong>، وسيولّد النظام
            تسويات المخزون (فروقات الزيادة والعجز) آلياً. لا يمكن التراجع عن الاعتماد.
          </>
        }
        confirmLabel="اعتماد وتوليد التسويات"
        onCancel={() => setApproveTarget(null)}
        onConfirm={async () => {
          if (approveTarget) await handleApproveCount(approveTarget);
        }}
      />
    </div>
  );
};
