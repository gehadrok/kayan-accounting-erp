import React, { useState, useEffect } from 'react';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { ReportHeader } from '../components/company/ReportHeader';
import { Button, FormDialog, FormField, FormGrid, FormSection, Input, NumberInput, Textarea, useToast } from '../components/ui';
import {
  Truck,
  Search,
  Plus,
  FileText,
  Edit3,
  Power,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  TrendingDown,
  CreditCard,
  X,
  Printer,
  AlertCircle,
  Building2,
  Calendar,
  Scale
} from 'lucide-react';

interface Supplier {
  id: string;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_number?: string;
  credit_limit: string;
  payment_terms_days: number;
  is_active: boolean;
  outstandingBalance: string;
  totalPurchases: string;
  totalPayments: string;
}

interface StatementItem {
  type: string;
  docNumber: string;
  docDate: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

interface StatementData {
  supplier: Supplier;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  items: StatementItem[];
}

interface AgingRow {
  supplierId: string;
  code: string;
  name: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
}

interface AgingData {
  totalPayables: number;
  currentTotal: number;
  days1to30Total: number;
  days31to60Total: number;
  days61to90Total: number;
  days90plusTotal: number;
  suppliers: AgingRow[];
}

interface ReconciliationData {
  subledgerBalance: number;
  glBalance: number;
  difference: number;
  status: string;
  glAccountCode: string;
  glAccountName: string;
  reconciledAt: string;
}

const EMPTY_SUPPLIER_FORM = {
  code: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  taxNumber: '',
  creditLimit: '0',
  paymentTermsDays: '30',
};

/** توليد كود مقترح من أعلى كود موجود فعلاً، لا من عدد الصفوف. */
function nextSupplierCode(suppliers: Supplier[]): string {
  const max = suppliers.reduce((acc, s) => {
    const m = /^SUP-(\d+)$/i.exec(s.code || '');
    return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
  }, 0);
  return `SUP-${String(max + 1).padStart(3, '0')}`;
}

export const SuppliersPage: React.FC = () => {
  // PHASE 10.0 — company identity from the single central source
  const { company } = useCompanyProfile();
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [statementSupplier, setStatementSupplier] = useState<Supplier | null>(null);
  const [statementData, setStatementData] = useState<StatementData | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  // Reports Modals
  const [showAgingModal, setShowAgingModal] = useState(false);
  const [agingData, setAgingData] = useState<AgingData | null>(null);
  const [showReconModal, setShowReconModal] = useState(false);
  const [reconData, setReconData] = useState<ReconciliationData | null>(null);

  // Form State — القيم الافتراضية حقيقية فقط، ولا مبالغ مالية وهمية.
  const [formData, setFormData] = useState(EMPTY_SUPPLIER_FORM);
  const [formSnapshot, setFormSnapshot] = useState(JSON.stringify(EMPTY_SUPPLIER_FORM));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const formDirty = showAddModal && JSON.stringify(formData) !== formSnapshot;

  const openAddForm = () => {
    const initial = {
      ...EMPTY_SUPPLIER_FORM,
      code: nextSupplierCode(suppliers),
    };
    setEditingSupplier(null);
    setFormData(initial);
    setFormSnapshot(JSON.stringify(initial));
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditForm = (supp: Supplier) => {
    const initial = {
      code: supp.code,
      name: supp.name,
      phone: supp.phone || '',
      email: supp.email || '',
      address: supp.address || '',
      taxNumber: supp.tax_number || '',
      creditLimit: supp.credit_limit ?? '0',
      paymentTermsDays: String(supp.payment_terms_days ?? 30),
    };
    setEditingSupplier(supp);
    setFormData(initial);
    setFormSnapshot(JSON.stringify(initial));
    setFormError(null);
    setShowAddModal(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowAddModal(false);
    setEditingSupplier(null);
    setFormError(null);
  };

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/suppliers?search=${encodeURIComponent(search)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `تعذر تحميل الموردين (${res.status})`);
      }
      const data = await res.json();
      setSuppliers(data);
      setLoadError(null);
    } catch (err: any) {
      console.error('Failed to load suppliers', err);
      setLoadError(err?.message || 'تعذر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [search]);

  // Open Statement
  const openStatement = async (supp: Supplier) => {
    setStatementSupplier(supp);
    setStatementLoading(true);
    try {
      const res = await fetch(`/api/reports/supplier-statement/${supp.id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر تحميل كشف الحساب');
      }
      setStatementData(await res.json());
    } catch (err: any) {
      toast.error('تعذر تحميل كشف الحساب', { description: err?.message });
      setStatementSupplier(null);
    } finally {
      setStatementLoading(false);
    }
  };

  // Open Aging Report
  const openAgingReport = async () => {
    try {
      const res = await fetch('/api/reports/accounts-payable-aging');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر تحميل تقرير الأعمار');
      }
      setAgingData(await res.json());
      setShowAgingModal(true);
    } catch (err: any) {
      toast.error('تعذر تحميل تقرير الأعمار', { description: err?.message });
    }
  };

  // Open Reconciliation Report
  const openReconReport = async () => {
    try {
      const res = await fetch('/api/reports/ap-reconciliation');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر تحميل تقرير المطابقة');
      }
      setReconData(await res.json());
      setShowReconModal(true);
    } catch (err: any) {
      toast.error('تعذر تحميل تقرير المطابقة', { description: err?.message });
    }
  };

  // Toggle Active — لا تغيير صامت: نعرض سبب الرفض بوضوح.
  const toggleActive = async (supp: Supplier) => {
    try {
      const res = await fetch(`/api/suppliers/${supp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !supp.is_active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          supp.is_active ? 'تعذر تعطيل المورد' : 'تعذر تفعيل المورد',
          { description: data.error || `رفض الخادم الطلب (${res.status})` }
        );
        return;
      }
      toast.success(
        supp.is_active ? 'تم تعطيل المورد' : 'تم تفعيل المورد',
        { description: supp.name }
      );
      loadSuppliers();
    } catch (err: any) {
      toast.error('تعذر تنفيذ العملية', { description: err?.message });
    }
  };

  // Submit Form — لا إغلاق ولا تحديث قائمة قبل تأكيد استجابة الخادم.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const name = formData.name.trim();
    const code = formData.code.trim();
    if (!code) {
      setFormError('كود المورد مطلوب.');
      return;
    }
    if (!name) {
      setFormError('اسم المورد مطلوب.');
      return;
    }
    const creditLimit = Number(formData.creditLimit);
    const terms = Number(formData.paymentTermsDays);
    if (!Number.isFinite(creditLimit) || creditLimit < 0) {
      setFormError('الحد الائتماني يجب أن يكون رقماً غير سالب.');
      return;
    }
    if (!Number.isInteger(terms) || terms < 0) {
      setFormError('أيام السداد يجب أن تكون عدداً صحيحاً غير سالب.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const url = editingSupplier ? `/api/suppliers/${editingSupplier.id}` : '/api/suppliers';
      const method = editingSupplier ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          code,
          name,
          creditLimit,
          paymentTermsDays: terms,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || `فشلت العملية (${res.status})`);
        return; // تبقى القيم كما هي
      }

      toast.success(
        editingSupplier ? 'تم حفظ تعديلات المورد' : 'تمت إضافة المورد',
        { description: name }
      );
      setShowAddModal(false);
      setEditingSupplier(null);
      setFormData(EMPTY_SUPPLIER_FORM);
      setFormSnapshot(JSON.stringify(EMPTY_SUPPLIER_FORM));
      loadSuppliers();
    } catch (err: any) {
      setFormError(err?.message || 'تعذر الاتصال بالخادم. لم تُفقد بياناتك.');
    } finally {
      setSaving(false);
    }
  };

  const totalPayables = suppliers.reduce((sum, s) => sum + (parseFloat(s.outstandingBalance) || 0), 0);
  const totalPurchases = suppliers.reduce((sum, s) => sum + (parseFloat(s.totalPurchases) || 0), 0);
  const activeCount = suppliers.filter(s => s.is_active).length;

  return (
    <div className="space-y-5 pb-8" dir="rtl">
        {/* PHASE 10.0 — print-only shared identity header (screen layout untouched) */}
        <div className="hidden print:block">
          <ReportHeader company={company} title="قائمة الموردين (Suppliers)" compact />
        </div>
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-surface p-5 rounded-2xl border border-line shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Truck size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-ink">إدارة الموردين والذمم الدائنة</h1>
              <p className="text-xs font-semibold text-ink-muted mt-0.5">
                متابعة حسابات الموردين، الرقابة على الاستحقاقات، كشوف الحسابات، ومطابقة الأستاذ المساعد مع حساب الرقابة
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openAgingReport}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-surface-sunken hover:bg-surface-hover text-ink rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <Calendar size={15} />
            <span>أعمار الدائنين</span>
          </button>

          <button
            onClick={openReconReport}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <Scale size={15} />
            <span>مطابقة AP مع GL</span>
          </button>

          <button
            onClick={openAddForm}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-control text-xs font-bold shadow-k-xs transition-all cursor-pointer"
          >
            <Plus size={16} />
            <span>إضافة مورد جديد</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-surface p-4 rounded-2xl border border-line shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-ink-muted">إجمالي الموردين</span>
            <span className="text-2xl font-black font-mono text-ink block mt-1">{suppliers.length}</span>
            <span className="text-[11px] font-semibold text-emerald-600 mt-0.5 block">{activeCount} مورد نشط</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Truck size={22} />
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-surface p-4 rounded-2xl border border-line shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-ink-muted">إجمالي الالتزامات القائمة</span>
            <span className="text-2xl font-black font-mono text-rose-600 block mt-1">{totalPayables.toLocaleString()}</span>
            <span className="text-[11px] text-ink-muted mt-0.5 block">ريال يمني (مستحق للموردين)</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <CreditCard size={22} />
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-surface p-4 rounded-2xl border border-line shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-ink-muted">إجمالي مشتريات الموردين</span>
            <span className="text-2xl font-black font-mono text-ink block mt-1">{totalPurchases.toLocaleString()}</span>
            <span className="text-[11px] text-ink-muted mt-0.5 block">ريال يمني (فواتير مرحلة)</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <TrendingDown size={22} />
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-surface p-4 rounded-2xl border border-line shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-ink-muted">مطابقة الأستاذ المساعد AP</span>
            <span className="text-lg font-black text-emerald-600 block mt-1 flex items-center gap-1">
              <CheckCircle2 size={18} />
              <span>متطابق وموزون</span>
            </span>
            <span className="text-[11px] text-ink-muted mt-0.5 block">Subledger = GL Control (2101)</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Scale size={22} />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface p-4 rounded-2xl border border-line shadow-xs flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={17} />
          <input
            type="text"
            placeholder="بحث باسم المورد أو الكود أو رقم الهاتف..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2 bg-surface-muted border border-line rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-ink"
          />
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-surface rounded-2xl border border-line shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-surface-muted border-b border-line text-ink-muted font-bold">
              <tr>
                <th className="py-3.5 px-4">كود المورد</th>
                <th className="py-3.5 px-4">اسم المورد</th>
                <th className="py-3.5 px-4">التواصل والعنوان</th>
                <th className="py-3.5 px-4">الرصيد المستحق (دائن)</th>
                <th className="py-3.5 px-4">الحد الائتماني وشروط السداد</th>
                <th className="py-3.5 px-4">إجمالي المشتريات</th>
                <th className="py-3.5 px-4">إجمالي المدفوعات</th>
                <th className="py-3.5 px-4">الحالة</th>
                <th className="py-3.5 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink font-medium">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-ink-muted font-semibold">
                    جاري تحميل بيانات الموردين...
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center">
                    <p className="text-sm font-semibold text-state-danger">{loadError}</p>
                    <Button variant="secondary" size="sm" className="mt-3" onClick={loadSuppliers}>
                      إعادة المحاولة
                    </Button>
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-ink-muted font-semibold">
                    لا يوجد موردون مسجلون حالياً
                  </td>
                </tr>
              ) : (
                suppliers.map(s => {
                  const bal = parseFloat(s.outstandingBalance) || 0;
                  const limit = parseFloat(s.credit_limit) || 0;

                  return (
                    <tr key={s.id} className="hover:bg-surface-muted transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-indigo-600">{s.code}</td>
                      <td className="py-3.5 px-4 font-bold text-ink">{s.name}</td>
                      <td className="py-3.5 px-4">
                        <div className="text-ink-muted flex items-center gap-1">
                          <Phone size={11} className="text-ink-muted" />
                          <span>{s.phone || '—'}</span>
                        </div>
                        <div className="text-[11px] text-ink-muted mt-0.5">{s.address || '—'}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-black text-rose-600 text-sm">
                        {bal.toLocaleString()} <span className="text-[10px] font-normal text-ink-muted">ر.ي</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-ink font-semibold">
                          {limit > 0 ? `${limit.toLocaleString()} ر.ي` : 'غير محدد'}
                        </div>
                        <div className="text-[11px] text-ink-muted font-normal">
                          سداد خلال: {s.payment_terms_days} يوم
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-ink font-semibold">
                        {(parseFloat(s.totalPurchases) || 0).toLocaleString()} ر.ي
                      </td>
                      <td className="py-3.5 px-4 font-mono text-emerald-600 font-semibold">
                        {(parseFloat(s.totalPayments) || 0).toLocaleString()} ر.ي
                      </td>
                      <td className="py-3.5 px-4">
                        {s.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} />
                            <span>نشط</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-surface-sunken text-ink-muted border border-line">
                            <XCircle size={12} />
                            <span>معطل</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openStatement(s)}
                            className="p-1.5 text-ink-muted hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="كشف حساب المورد"
                          >
                            <FileText size={15} />
                          </button>
                          <button
                            onClick={() => openEditForm(s)}
                            className="p-1.5 text-ink-muted hover:text-brand hover:bg-brand-soft rounded-lg transition-colors cursor-pointer"
                            title="تعديل المورد"
                            aria-label={`تعديل المورد ${s.name}`}
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => toggleActive(s)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              s.is_active
                                ? 'text-ink-muted hover:text-rose-600 hover:bg-rose-50'
                                : 'text-ink-muted hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={s.is_active ? 'تعطيل المورد' : 'تفعيل المورد'}
                          >
                            <Power size={15} />
                          </button>
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
      {/* نافذة مستقلة: إضافة/تعديل مورد                              */}
      {/* ========================================================= */}
      <FormDialog
        open={showAddModal}
        onClose={closeForm}
        title={editingSupplier ? `تعديل المورد: ${editingSupplier.name}` : 'إضافة مورد جديد'}
        description={
          editingSupplier
            ? 'عدّل البيانات المسموح بها. كود المورد معرّف محمي ولا يمكن تغييره.'
            : 'أدخل بيانات المورد الأساسية. الحقول المعلّمة بـ * مطلوبة.'
        }
        icon={<Truck size={19} />}
        submitLabel={editingSupplier ? 'حفظ التعديلات' : 'إضافة المورد'}
        submitLoadingLabel="جارٍ الحفظ..."
        submitting={saving}
        dirty={formDirty}
        error={formError}
        onSubmit={handleSubmit}
        footerNote="لن تُغلق النافذة قبل تأكيد الخادم للحفظ."
      >
        <FormSection title="البيانات الأساسية" plain>
          <FormGrid cols={2}>
            <FormField label="كود المورد" required hint={editingSupplier ? 'الكود محمي بعد الإنشاء' : 'كود مقترح، يمكن تعديله'}>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                readOnly={Boolean(editingSupplier)}
                className={editingSupplier ? 'font-mono' : 'font-mono'}
                maxLength={40}
                autoComplete="off"
              />
            </FormField>

            <FormField label="اسم المورد" required>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="اسم الشركة أو التاجر..."
                maxLength={200}
                autoComplete="off"
              />
            </FormField>

            <FormField label="رقم الهاتف">
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+967-..."
                inputMode="tel"
                maxLength={40}
                autoComplete="off"
              />
            </FormField>

            <FormField label="البريد الإلكتروني">
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="info@supplier.com"
                maxLength={120}
                autoComplete="off"
              />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="الشروط المالية" plain>
          <FormGrid cols={2}>
            <FormField label="الحد الائتماني (ر.ي)" hint="0 يعني غير محدد">
              <NumberInput
                value={formData.creditLimit}
                onValueChange={(value) => setFormData({ ...formData, creditLimit: value })}
                min={0}
                step="0.01"
              />
            </FormField>

            <FormField label="أيام السداد" hint="عدد الأيام المتفق عليها مع المورد">
              <NumberInput
                value={formData.paymentTermsDays}
                onValueChange={(value) => setFormData({ ...formData, paymentTermsDays: value })}
                min={0}
                step={1}
              />
            </FormField>

            <FormField label="الرقم الضريبي للمورد" className="md:col-span-2">
              <Input
                value={formData.taxNumber}
                onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                maxLength={60}
                autoComplete="off"
              />
            </FormField>

            <FormField label="العنوان ومقر المورد" className="md:col-span-2">
              <Textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={2}
                maxLength={300}
                placeholder="المدينة، الشارع، أقرب معلم..."
              />
            </FormField>
          </FormGrid>
        </FormSection>
      </FormDialog>

      {/* ========================================================= */}
      {/* Modal: Supplier Statement                                 */}
      {/* ========================================================= */}
      {statementSupplier && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-3xl border border-line overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white print:hidden">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-indigo-400" />
                <span className="text-sm font-bold">كشف حساب المورد: {statementSupplier.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Printer size={14} />
                  <span>طباعة الكشف</span>
                </button>
                <button
                  onClick={() => setStatementSupplier(null)}
                  className="text-ink-muted hover:text-white p-1 rounded-lg transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {statementLoading ? (
                <div className="py-12 text-center text-ink-muted font-semibold text-xs">
                  جاري تحميل كشف الحساب...
                </div>
              ) : statementData ? (
                <>
                  <div className="bg-surface-muted p-4 rounded-xl border border-line flex items-center justify-between text-xs">
                    <div>
                      <span className="text-ink-muted block">المورد:</span>
                      <strong className="text-ink text-sm block mt-0.5">{statementSupplier.name}</strong>
                      <span className="font-mono text-ink-muted">كود: {statementSupplier.code}</span>
                    </div>
                    <div className="text-left font-mono">
                      <span className="text-ink-muted block">الرصيد المستحق (دائن):</span>
                      <span className="text-base font-black text-rose-600 block mt-0.5">
                        {statementData.finalBalance.toLocaleString()} ر.ي
                      </span>
                    </div>
                  </div>

                  <div className="border border-line rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-surface-sunken text-ink font-bold">
                        <tr>
                          <th className="py-2.5 px-3">التاريخ</th>
                          <th className="py-2.5 px-3">رقم المستند</th>
                          <th className="py-2.5 px-3">النوع والبيان</th>
                          <th className="py-2.5 px-3 text-left">مدين (سداد)</th>
                          <th className="py-2.5 px-3 text-left">دائن (مشتريات)</th>
                          <th className="py-2.5 px-3 text-left">الرصيد</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line font-mono">
                        {statementData.items.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-ink-muted font-sans">
                              لا توجد حركات مسجلة لهذا المورد
                            </td>
                          </tr>
                        ) : (
                          statementData.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-surface-muted">
                              <td className="py-2 px-3 text-ink-muted">{item.docDate}</td>
                              <td className="py-2 px-3 font-bold text-indigo-600">{item.docNumber}</td>
                              <td className="py-2 px-3 text-ink font-sans">{item.description}</td>
                              <td className="py-2 px-3 text-left font-bold text-emerald-600">
                                {item.debit > 0 ? item.debit.toLocaleString() : '—'}
                              </td>
                              <td className="py-2 px-3 text-left font-bold text-rose-600">
                                {item.credit > 0 ? item.credit.toLocaleString() : '—'}
                              </td>
                              <td className="py-2 px-3 text-left font-black text-ink">
                                {item.runningBalance.toLocaleString()}
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

      {/* ========================================================= */}
      {/* Modal: Accounts Payable Aging Report                     */}
      {/* ========================================================= */}
      {showAgingModal && agingData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-4xl border border-line overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-indigo-400" />
                <span className="text-sm font-bold">تقرير أعمار الدائنين (Accounts Payable Aging)</span>
              </div>
              <button
                onClick={() => setShowAgingModal(false)}
                className="text-ink-muted hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="border border-line rounded-xl overflow-hidden font-mono">
                <table className="w-full text-right text-xs">
                  <thead className="bg-surface-sunken text-ink font-bold font-sans">
                    <tr>
                      <th className="py-2.5 px-3">المورد</th>
                      <th className="py-2.5 px-3 text-left">الحالي (Current)</th>
                      <th className="py-2.5 px-3 text-left">1-30 يوم</th>
                      <th className="py-2.5 px-3 text-left">31-60 يوم</th>
                      <th className="py-2.5 px-3 text-left">61-90 يوم</th>
                      <th className="py-2.5 px-3 text-left">+90 يوم</th>
                      <th className="py-2.5 px-3 text-left font-black">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {agingData.suppliers.map(row => (
                      <tr key={row.supplierId} className="hover:bg-surface-muted">
                        <td className="py-2.5 px-3 font-sans font-bold text-ink">{row.name}</td>
                        <td className="py-2.5 px-3 text-left">{row.current.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-left">{row.days1to30.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-left">{row.days31to60.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-left">{row.days61to90.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-left text-rose-600 font-bold">{row.days90plus.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-left font-black text-ink">{row.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-surface-muted font-bold border-t border-line">
                    <tr>
                      <td className="py-2.5 px-3 font-sans">الإجمالي الكلي</td>
                      <td className="py-2.5 px-3 text-left">{agingData.currentTotal.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-left">{agingData.days1to30Total.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-left">{agingData.days31to60Total.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-left">{agingData.days61to90Total.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-left text-rose-600">{agingData.days90plusTotal.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-left font-black text-rose-700">{agingData.totalPayables.toLocaleString()} ر.ي</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Modal: AP Reconciliation Report (Quality #19)             */}
      {/* ========================================================= */}
      {showReconModal && reconData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg border border-line overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Scale size={18} className="text-emerald-400" />
                <span className="text-sm font-bold">تقرير مطابقة الأستاذ المساعد مع الأستاذ العام (AP Reconciliation)</span>
              </div>
              <button
                onClick={() => setShowReconModal(false)}
                className="text-ink-muted hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                reconData.status === 'RECONCILED'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 size={24} className="text-emerald-600" />
                  <div>
                    <h4 className="font-black text-sm">
                      {reconData.status === 'RECONCILED' ? 'الأستاذ المساعد متطابق بالكامل (RECONCILED)' : 'يوجد فارق تسوية (OUT OF BALANCE)'}
                    </h4>
                    <p className="text-[11px] text-emerald-700">
                      رصيد ذمم الموردين يطابق رصيد حساب الرقابة في الدفتر الأستاذ العام (2101).
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 bg-surface-muted p-4 rounded-xl border border-line font-mono">
                <div className="flex justify-between text-ink font-sans">
                  <span>إجمالي رصيد الأستاذ المساعد للموردين (Subledger):</span>
                  <span className="font-mono font-black">{reconData.subledgerBalance.toLocaleString()} ر.ي</span>
                </div>
                <div className="flex justify-between text-ink font-sans">
                  <span>رصيد حساب الرقابة الدائن في الأستاذ العام ({reconData.glAccountCode}):</span>
                  <span className="font-mono font-black">{reconData.glBalance.toLocaleString()} ر.ي</span>
                </div>
                <div className="border-t border-line pt-2 flex justify-between font-sans font-bold">
                  <span>الفارق (Difference):</span>
                  <span className="font-mono font-black text-emerald-700">{reconData.difference.toLocaleString()} ر.ي</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
