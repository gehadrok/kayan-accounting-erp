import React, { useState, useEffect } from 'react';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { ReportHeader } from '../components/company/ReportHeader';
import { Button, FormDialog, FormField, FormGrid, FormSection, Input, NumberInput, Textarea, useToast } from '../components/ui';
import { 
  Users, 
  Search, 
  Plus, 
  FileText, 
  Edit3, 
  Power, 
  Building2, 
  Phone, 
  Mail, 
  CheckCircle2, 
  XCircle, 
  TrendingUp, 
  CreditCard,
  X,
  Printer,
  AlertCircle
} from 'lucide-react';

interface Customer {
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
  totalSales: string;
  totalReceipts: string;
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
  customer: Customer;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  items: StatementItem[];
}

const EMPTY_CUSTOMER_FORM = {
  code: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  taxNumber: '',
  creditLimit: '0',
  paymentTermsDays: '30',
};

/** كود مقترح مبني على أعلى كود موجود فعلاً. */
function nextCustomerCode(customers: Customer[]): string {
  const max = customers.reduce((acc, c) => {
    const m = /^CUST-(\d+)$/i.exec(c.code || '');
    return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
  }, 0);
  return `CUST-${String(max + 1).padStart(3, '0')}`;
}

export const CustomersPage: React.FC = () => {
  // PHASE 10.0 — company identity from the single central source
  const { company } = useCompanyProfile();
  const toast = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [statementData, setStatementData] = useState<StatementData | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState(EMPTY_CUSTOMER_FORM);
  const [formSnapshot, setFormSnapshot] = useState(JSON.stringify(EMPTY_CUSTOMER_FORM));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const formDirty = showAddModal && JSON.stringify(formData) !== formSnapshot;

  const openAddForm = () => {
    const initial = { ...EMPTY_CUSTOMER_FORM, code: nextCustomerCode(customers) };
    setEditingCustomer(null);
    setFormData(initial);
    setFormSnapshot(JSON.stringify(initial));
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditForm = (cust: Customer) => {
    const initial = {
      code: cust.code,
      name: cust.name,
      phone: cust.phone || '',
      email: cust.email || '',
      address: cust.address || '',
      taxNumber: cust.tax_number || '',
      creditLimit: cust.credit_limit ?? '0',
      paymentTermsDays: String(cust.payment_terms_days ?? 30),
    };
    setEditingCustomer(cust);
    setFormData(initial);
    setFormSnapshot(JSON.stringify(initial));
    setFormError(null);
    setShowAddModal(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowAddModal(false);
    setEditingCustomer(null);
    setFormError(null);
  };

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/customers?search=${encodeURIComponent(search)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `تعذر تحميل العملاء (${res.status})`);
      }
      setCustomers(await res.json());
      setLoadError(null);
    } catch (err: any) {
      console.error('Failed to load customers', err);
      setLoadError(err?.message || 'تعذر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [search]);

  // Open Statement
  const openStatement = async (cust: Customer) => {
    setStatementCustomer(cust);
    setStatementData(null);
    setStatementLoading(true);
    try {
      const res = await fetch(`/api/reports/customer-statement/${cust.id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر تحميل كشف الحساب');
      }
      setStatementData(await res.json());
    } catch (err: any) {
      toast.error('تعذر تحميل كشف الحساب', { description: err?.message });
      setStatementCustomer(null);
    } finally {
      setStatementLoading(false);
    }
  };

  // Toggle Active — لا فشل صامت.
  const toggleActive = async (cust: Customer) => {
    try {
      const res = await fetch(`/api/customers/${cust.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !cust.is_active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          cust.is_active ? 'تعذر تعطيل العميل' : 'تعذر تفعيل العميل',
          { description: data.error || `رفض الخادم الطلب (${res.status})` }
        );
        return;
      }
      toast.success(
        cust.is_active ? 'تم تعطيل العميل' : 'تم تفعيل العميل',
        { description: cust.name }
      );
      loadCustomers();
    } catch (err: any) {
      toast.error('تعذر تنفيذ العملية', { description: err?.message });
    }
  };

  // Submit Form — لا إغلاق قبل تأكيد الخادم، ولا فقدان مدخلات عند الفشل.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const name = formData.name.trim();
    const code = formData.code.trim();
    if (!code) {
      setFormError('كود العميل مطلوب.');
      return;
    }
    if (!name) {
      setFormError('اسم العميل مطلوب.');
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
      const url = editingCustomer ? `/api/customers/${editingCustomer.id}` : '/api/customers';
      const method = editingCustomer ? 'PUT' : 'POST';

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
        return; // القيم تبقى في النموذج
      }

      toast.success(
        editingCustomer ? 'تم حفظ تعديلات العميل' : 'تمت إضافة العميل',
        { description: name }
      );
      setShowAddModal(false);
      setEditingCustomer(null);
      setFormData(EMPTY_CUSTOMER_FORM);
      setFormSnapshot(JSON.stringify(EMPTY_CUSTOMER_FORM));
      loadCustomers();
    } catch (err: any) {
      setFormError(err?.message || 'تعذر الاتصال بالخادم. لم تُفقد بياناتك.');
    } finally {
      setSaving(false);
    }
  };

  // Calculations for KPI Cards
  const totalReceivables = customers.reduce((sum, c) => sum + (parseFloat(c.outstandingBalance) || 0), 0);
  const totalSales = customers.reduce((sum, c) => sum + (parseFloat(c.totalSales) || 0), 0);
  const activeCount = customers.filter(c => c.is_active).length;

  return (
    <div className="space-y-5 pb-8" dir="rtl">
        {/* PHASE 10.0 — print-only shared identity header (screen layout untouched) */}
        <div className="hidden print:block">
          <ReportHeader company={company} title="قائمة العملاء (Customers)" compact />
        </div>
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-surface p-5 rounded-2xl border border-line shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
              <Users size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-ink">إدارة العملاء والمدينون</h1>
              <p className="text-xs font-semibold text-ink-muted mt-0.5">
                متابعة الحسابات المدينة، الحدود الائتمانية، وكشوف الحسابات المباشرة من واقع القيود
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={openAddForm}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-control text-xs font-bold shadow-k-xs transition-all cursor-pointer"
        >
          <Plus size={16} />
          <span>إضافة عميل جديد</span>
        </button>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-surface p-4 rounded-2xl border border-line shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-ink-muted">إجمالي العملاء</span>
            <span className="text-2xl font-black font-mono text-ink block mt-1">{customers.length}</span>
            <span className="text-[11px] font-semibold text-emerald-600 mt-0.5 block">{activeCount} عميل نشط</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users size={22} />
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-surface p-4 rounded-2xl border border-line shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-ink-muted">إجمالي المديونيات القائمة</span>
            <span className="text-2xl font-black font-mono text-ink block mt-1">{totalReceivables.toLocaleString()}</span>
            <span className="text-[11px] text-ink-muted mt-0.5 block">ريال يمني (مستحق التحصيل)</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <CreditCard size={22} />
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-surface p-4 rounded-2xl border border-line shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-ink-muted">إجمالي مبيعات العملاء</span>
            <span className="text-2xl font-black font-mono text-ink block mt-1">{totalSales.toLocaleString()}</span>
            <span className="text-[11px] text-ink-muted mt-0.5 block">ريال يمني (فواتير مرحلة)</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <TrendingUp size={22} />
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-surface p-4 rounded-2xl border border-line shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-ink-muted">حساب أستاذ المدينين</span>
            <span className="text-lg font-black font-mono text-ink block mt-1">1103 - العملاء</span>
            <span className="text-[11px] font-semibold text-blue-600 mt-0.5 block">أصول متداولة (مدين)</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Building2 size={22} />
          </div>
        </div>
      </div>

      {/* Main Customers Table Card */}
      <div className="bg-surface rounded-2xl p-5 border border-line shadow-xs">
        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3.5 top-2.5 text-ink-muted" size={17} />
            <input
              type="text"
              placeholder="ابحث بالاسم، الكود، أو رقم الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pr-10 pl-4 bg-surface-muted border border-line rounded-xl text-xs focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-right"
            />
          </div>

          <span className="text-xs font-semibold text-ink-muted">
            عرض {customers.length} عميل
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="text-ink-muted border-b border-line-soft pb-2.5">
                <th className="font-semibold pb-3 pr-2">الكود</th>
                <th className="font-semibold pb-3 px-3">اسم العميل</th>
                <th className="font-semibold pb-3 px-3">الهاتف والبريد</th>
                <th className="font-semibold pb-3 px-3">الرصيد القائم (ر.ي)</th>
                <th className="font-semibold pb-3 px-3">الحد الائتماني (ر.ي)</th>
                <th className="font-semibold pb-3 px-3 text-center">الحالة</th>
                <th className="font-semibold pb-3 pl-2 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/90">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-ink-muted">
                    جاري تحميل بيانات العملاء من قاعدة البيانات...
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <p className="text-sm font-semibold text-state-danger">{loadError}</p>
                    <Button variant="secondary" size="sm" className="mt-3" onClick={loadCustomers}>
                      إعادة المحاولة
                    </Button>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-ink-muted">
                    لا يوجد عملاء يطابقون بحثك
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const bal = parseFloat(c.outstandingBalance) || 0;
                  const limit = parseFloat(c.credit_limit) || 0;
                  const isOver = limit > 0 && bal > limit;

                  return (
                    <tr key={c.id} className="hover:bg-surface-muted transition-colors group">
                      <td className="py-3.5 pr-2 font-mono font-bold text-blue-600">
                        {c.code}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-extrabold text-ink block">{c.name}</span>
                        {c.address && <span className="text-[11px] text-ink-muted block">{c.address}</span>}
                      </td>
                      <td className="py-3.5 px-3 text-ink-muted">
                        {c.phone && <span className="block font-mono text-[11px]">{c.phone}</span>}
                        {c.email && <span className="block text-[11px] text-ink-muted">{c.email}</span>}
                      </td>
                      <td className="py-3.5 px-3 font-mono">
                        <span className={`font-black text-sm ${bal > 0 ? 'text-amber-600' : 'text-ink'}`}>
                          {bal.toLocaleString()}
                        </span>
                        {isOver && (
                          <span className="block text-[10px] font-bold text-rose-500">
                            تجاوز الحد!
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 font-mono font-bold text-ink-muted">
                        {limit > 0 ? limit.toLocaleString() : 'غير محدد'}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          c.is_active 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            : 'bg-surface-sunken text-ink-muted'
                        }`}>
                          {c.is_active ? 'نشط' : 'معطل'}
                        </span>
                      </td>
                      <td className="py-3.5 pl-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openStatement(c)}
                            title="كشف حساب العميل"
                            className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          >
                            <FileText size={15} />
                          </button>
                          <button
                            onClick={() => openEditForm(c)}
                            title={`تعديل العميل ${c.name}`}
                            aria-label={`تعديل العميل ${c.name}`}
                            className="p-1.5 rounded-lg text-ink-muted hover:text-brand hover:bg-brand-soft transition-colors"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => toggleActive(c)}
                            title={c.is_active ? 'تعطيل العميل' : 'تفعيل العميل'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              c.is_active 
                                ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' 
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            }`}
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

      {/* نافذة مستقلة: إضافة/تعديل عميل */}
      <FormDialog
        open={showAddModal}
        onClose={closeForm}
        title={editingCustomer ? `تعديل العميل: ${editingCustomer.name}` : 'إضافة عميل جديد'}
        description={
          editingCustomer
            ? 'عدّل البيانات المسموح بها. كود العميل معرّف محمي.'
            : 'أدخل بيانات العميل الأساسية. الحقول المعلّمة بـ * مطلوبة.'
        }
        icon={<Users size={19} />}
        submitLabel={editingCustomer ? 'حفظ التعديلات' : 'إضافة العميل'}
        submitLoadingLabel="جارٍ الحفظ..."
        submitting={saving}
        dirty={formDirty}
        error={formError}
        onSubmit={handleSubmit}
        footerNote="الحفظ لا يُغلق النافذة إلا بعد تأكيد الخادم."
      >
        <FormSection title="البيانات الأساسية" plain>
          <FormGrid cols={2}>
            <FormField label="كود العميل" required hint={editingCustomer ? 'الكود محمي بعد الإنشاء' : 'يمكن تعديل الكود المقترح'}>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                readOnly={Boolean(editingCustomer)}
                className="font-mono"
                maxLength={40}
                autoComplete="off"
              />
            </FormField>

            <FormField label="الاسم الكامل" required>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                maxLength={200}
                autoComplete="off"
              />
            </FormField>

            <FormField label="رقم الهاتف">
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
                maxLength={120}
                autoComplete="off"
              />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="الشروط المالية والعنوان" plain>
          <FormGrid cols={2}>
            <FormField label="الحد الائتماني (ر.ي)" hint="0 يعني غير محدد">
              <NumberInput
                value={formData.creditLimit}
                onValueChange={(value) => setFormData({ ...formData, creditLimit: value })}
                min={0}
                step="0.01"
              />
            </FormField>

            <FormField label="أيام السداد" hint="عدد أيام المهلة المتفق عليها">
              <NumberInput
                value={formData.paymentTermsDays}
                onValueChange={(value) => setFormData({ ...formData, paymentTermsDays: value })}
                min={0}
                step={1}
              />
            </FormField>

            <FormField label="العنوان" className="md:col-span-2">
              <Textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={2}
                maxLength={300}
                placeholder="المحافظة - المديرية - الشارع"
              />
            </FormField>
          </FormGrid>
        </FormSection>
      </FormDialog>

      {/* Modal 2: Customer Statement (كشف حساب العميل) */}
      {statementCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-line text-right animate-scale-up max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-line-soft">
              <div className="flex items-center gap-2">
                <FileText className="text-blue-600" size={20} />
                <h3 className="text-base font-extrabold text-ink">
                  كشف حساب العميل: {statementCustomer.name}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => window.print()}
                  className="p-1.5 text-ink-muted hover:text-ink hover:bg-surface-sunken rounded-lg"
                  title="طباعة"
                >
                  <Printer size={16} />
                </button>
                <button 
                  onClick={() => { setStatementCustomer(null); setStatementData(null); }}
                  className="text-ink-muted hover:text-ink-muted"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Customer Summary Cards inside Statement */}
            <div className="grid grid-cols-3 gap-3 my-4">
              <div className="bg-surface-muted p-3 rounded-xl border border-line/60">
                <span className="text-[11px] font-bold text-ink-muted block">إجمالي الفواتير (مدين)</span>
                <span className="text-lg font-black font-mono text-ink block mt-0.5">
                  {(statementData?.totalDebit || 0).toLocaleString()} ر.ي
                </span>
              </div>
              <div className="bg-surface-muted p-3 rounded-xl border border-line/60">
                <span className="text-[11px] font-bold text-ink-muted block">إجمالي السدادات (دائن)</span>
                <span className="text-lg font-black font-mono text-emerald-600 block mt-0.5">
                  {(statementData?.totalCredit || 0).toLocaleString()} ر.ي
                </span>
              </div>
              <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200/60">
                <span className="text-[11px] font-bold text-blue-700 block">الرصيد النهائي المستحق</span>
                <span className="text-lg font-black font-mono text-blue-900 block mt-0.5">
                  {(statementData?.finalBalance || 0).toLocaleString()} ر.ي
                </span>
              </div>
            </div>

            {/* Statement Items Table */}
            <div className="flex-1 overflow-y-auto border border-line-soft rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-surface-muted sticky top-0 border-b border-line-soft">
                  <tr className="text-ink-muted">
                    <th className="py-2.5 px-3 font-bold">التاريخ</th>
                    <th className="py-2.5 px-3 font-bold">المستند</th>
                    <th className="py-2.5 px-3 font-bold">البيان</th>
                    <th className="py-2.5 px-3 font-bold text-left">مدين (ر.ي)</th>
                    <th className="py-2.5 px-3 font-bold text-left">دائن (ر.ي)</th>
                    <th className="py-2.5 px-3 font-bold text-left">الرصيد (ر.ي)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {statementLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-ink-muted">
                        جاري تجهيز كشف الحساب من واقع القيود المحاسبية...
                      </td>
                    </tr>
                  ) : statementData?.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-ink-muted">
                        لا توجد حركات مرحلة مسجلة على هذا العميل حتى الآن
                      </td>
                    </tr>
                  ) : (
                    statementData?.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-surface-muted">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-ink-muted">
                          {it.docDate}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-600">
                          {it.docNumber}
                        </td>
                        <td className="py-2.5 px-3 text-ink">
                          {it.description}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-ink text-left">
                          {it.debit > 0 ? it.debit.toLocaleString() : '-'}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-600 text-left">
                          {it.credit > 0 ? it.credit.toLocaleString() : '-'}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-black text-ink text-left">
                          {it.runningBalance.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 mt-3 border-t border-line-soft flex items-center justify-between text-xs text-ink-muted">
              <span>تم استخراج هذا الكشف آلياً من دفاتر الأستاذ العام لنظام كيان ERP</span>
              <button
                onClick={() => { setStatementCustomer(null); setStatementData(null); }}
                className="px-4 py-1.5 bg-surface-sunken hover:bg-surface-hover text-ink rounded-lg font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
