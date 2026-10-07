import React, { useState, useEffect } from 'react';
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

export const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

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

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    taxNumber: '',
    creditLimit: '0',
    paymentTermsDays: '30',
  });

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/suppliers?search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data);
      }
    } catch (err) {
      console.error('Failed to load suppliers', err);
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
      if (res.ok) {
        const data = await res.json();
        setStatementData(data);
      }
    } catch (err) {
      console.error('Failed to load statement', err);
    } finally {
      setStatementLoading(false);
    }
  };

  // Open Aging Report
  const openAgingReport = async () => {
    try {
      const res = await fetch('/api/reports/accounts-payable-aging');
      if (res.ok) {
        const data = await res.json();
        setAgingData(data);
        setShowAgingModal(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Open Reconciliation Report
  const openReconReport = async () => {
    try {
      const res = await fetch('/api/reports/ap-reconciliation');
      if (res.ok) {
        const data = await res.json();
        setReconData(data);
        setShowReconModal(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle Active
  const toggleActive = async (supp: Supplier) => {
    try {
      const res = await fetch(`/api/suppliers/${supp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !supp.is_active }),
      });
      if (res.ok) {
        loadSuppliers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingSupplier ? `/api/suppliers/${editingSupplier.id}` : '/api/suppliers';
      const method = editingSupplier ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          creditLimit: parseFloat(formData.creditLimit) || 0,
          paymentTermsDays: parseInt(formData.paymentTermsDays, 10) || 30,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setEditingSupplier(null);
        setFormData({
          code: '',
          name: '',
          phone: '',
          email: '',
          address: '',
          taxNumber: '',
          creditLimit: '0',
          paymentTermsDays: '30',
        });
        loadSuppliers();
      } else {
        const data = await res.json();
        alert(data.error || 'فشلت العملية');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const totalPayables = suppliers.reduce((sum, s) => sum + (parseFloat(s.outstandingBalance) || 0), 0);
  const totalPurchases = suppliers.reduce((sum, s) => sum + (parseFloat(s.totalPurchases) || 0), 0);
  const activeCount = suppliers.filter(s => s.is_active).length;

  return (
    <div className="space-y-5 pb-8" dir="rtl">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Truck size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">إدارة الموردين والذمم الدائنة</h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                متابعة حسابات الموردين، الرقابة على الاستحقاقات، كشوف الحسابات، ومطابقة الأستاذ المساعد مع حساب الرقابة
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openAgingReport}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
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
            onClick={() => {
              setEditingSupplier(null);
              setFormData({
                code: `SUP-${(suppliers.length + 1).toString().padStart(3, '0')}`,
                name: '',
                phone: '',
                email: '',
                address: '',
                taxNumber: '',
                creditLimit: '50000000',
                paymentTermsDays: '30',
              });
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Plus size={16} />
            <span>إضافة مورد جديد</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">إجمالي الموردين</span>
            <span className="text-2xl font-black font-mono text-slate-900 block mt-1">{suppliers.length}</span>
            <span className="text-[11px] font-semibold text-emerald-600 mt-0.5 block">{activeCount} مورد نشط</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Truck size={22} />
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">إجمالي الالتزامات القائمة</span>
            <span className="text-2xl font-black font-mono text-rose-600 block mt-1">{totalPayables.toLocaleString()}</span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">ريال يمني (مستحق للموردين)</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <CreditCard size={22} />
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">إجمالي مشتريات الموردين</span>
            <span className="text-2xl font-black font-mono text-slate-900 block mt-1">{totalPurchases.toLocaleString()}</span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">ريال يمني (فواتير مرحلة)</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <TrendingDown size={22} />
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">مطابقة الأستاذ المساعد AP</span>
            <span className="text-lg font-black text-emerald-600 block mt-1 flex items-center gap-1">
              <CheckCircle2 size={18} />
              <span>متطابق وموزون</span>
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Subledger = GL Control (2101)</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Scale size={22} />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            type="text"
            placeholder="بحث باسم المورد أو الكود أو رقم الهاتف..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800"
          />
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold">
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
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-semibold">
                    جاري تحميل بيانات الموردين...
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-semibold">
                    لا يوجد موردون مسجلون حالياً
                  </td>
                </tr>
              ) : (
                suppliers.map(s => {
                  const bal = parseFloat(s.outstandingBalance) || 0;
                  const limit = parseFloat(s.credit_limit) || 0;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-indigo-600">{s.code}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{s.name}</td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-600 flex items-center gap-1">
                          <Phone size={11} className="text-slate-400" />
                          <span>{s.phone || '—'}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{s.address || '—'}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-black text-rose-600 text-sm">
                        {bal.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">ر.ي</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-slate-700 font-semibold">
                          {limit > 0 ? `${limit.toLocaleString()} ر.ي` : 'غير محدد'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-normal">
                          سداد خلال: {s.payment_terms_days} يوم
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700 font-semibold">
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
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <XCircle size={12} />
                            <span>معطل</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openStatement(s)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="كشف حساب المورد"
                          >
                            <FileText size={15} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingSupplier(s);
                              setFormData({
                                code: s.code,
                                name: s.name,
                                phone: s.phone || '',
                                email: s.email || '',
                                address: s.address || '',
                                taxNumber: s.tax_number || '',
                                creditLimit: s.credit_limit,
                                paymentTermsDays: s.payment_terms_days.toString(),
                              });
                              setShowAddModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="تعديل المورد"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => toggleActive(s)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              s.is_active
                                ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
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
      {/* Modal: Add/Edit Supplier                                  */}
      {/* ========================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <Truck className="text-indigo-400" size={22} />
                <h2 className="text-base font-bold">
                  {editingSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
                </h2>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">كود المورد *</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">اسم المورد *</label>
                  <input
                    type="text"
                    required
                    placeholder="اسم الشركة أو التاجر..."
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">رقم الهاتف</label>
                  <input
                    type="text"
                    placeholder="+967-..."
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">البريد الإلكتروني</label>
                  <input
                    type="email"
                    placeholder="info@supplier.com"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">الحد الائتماني (ر.ي)</label>
                  <input
                    type="number"
                    value={formData.creditLimit}
                    onChange={e => setFormData({ ...formData, creditLimit: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">أيام السداد (Terms)</label>
                  <input
                    type="number"
                    value={formData.paymentTermsDays}
                    onChange={e => setFormData({ ...formData, paymentTermsDays: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">الرقم الضريبي للمورد</label>
                  <input
                    type="text"
                    value={formData.taxNumber}
                    onChange={e => setFormData({ ...formData, taxNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">العنوان ومقر المورد</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition cursor-pointer"
                >
                  {editingSupplier ? 'حفظ التعديلات' : 'إضافة المورد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Modal: Supplier Statement                                 */}
      {/* ========================================================= */}
      {statementSupplier && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col">
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
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {statementLoading ? (
                <div className="py-12 text-center text-slate-400 font-semibold text-xs">
                  جاري تحميل كشف الحساب...
                </div>
              ) : statementData ? (
                <>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-500 block">المورد:</span>
                      <strong className="text-slate-900 text-sm block mt-0.5">{statementSupplier.name}</strong>
                      <span className="font-mono text-slate-400">كود: {statementSupplier.code}</span>
                    </div>
                    <div className="text-left font-mono">
                      <span className="text-slate-500 block">الرصيد المستحق (دائن):</span>
                      <span className="text-base font-black text-rose-600 block mt-0.5">
                        {statementData.finalBalance.toLocaleString()} ر.ي
                      </span>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold">
                        <tr>
                          <th className="py-2.5 px-3">التاريخ</th>
                          <th className="py-2.5 px-3">رقم المستند</th>
                          <th className="py-2.5 px-3">النوع والبيان</th>
                          <th className="py-2.5 px-3 text-left">مدين (سداد)</th>
                          <th className="py-2.5 px-3 text-left">دائن (مشتريات)</th>
                          <th className="py-2.5 px-3 text-left">الرصيد</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {statementData.items.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-slate-400 font-sans">
                              لا توجد حركات مسجلة لهذا المورد
                            </td>
                          </tr>
                        ) : (
                          statementData.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3 text-slate-600">{item.docDate}</td>
                              <td className="py-2 px-3 font-bold text-indigo-600">{item.docNumber}</td>
                              <td className="py-2 px-3 text-slate-800 font-sans">{item.description}</td>
                              <td className="py-2 px-3 text-left font-bold text-emerald-600">
                                {item.debit > 0 ? item.debit.toLocaleString() : '—'}
                              </td>
                              <td className="py-2 px-3 text-left font-bold text-rose-600">
                                {item.credit > 0 ? item.credit.toLocaleString() : '—'}
                              </td>
                              <td className="py-2 px-3 text-left font-black text-slate-900">
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-indigo-400" />
                <span className="text-sm font-bold">تقرير أعمار الدائنين (Accounts Payable Aging)</span>
              </div>
              <button
                onClick={() => setShowAgingModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden font-mono">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold font-sans">
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
                  <tbody className="divide-y divide-slate-100">
                    {agingData.suppliers.map(row => (
                      <tr key={row.supplierId} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-sans font-bold text-slate-900">{row.name}</td>
                        <td className="py-2.5 px-3 text-left">{row.current.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-left">{row.days1to30.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-left">{row.days31to60.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-left">{row.days61to90.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-left text-rose-600 font-bold">{row.days90plus.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-left font-black text-slate-900">{row.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Scale size={18} className="text-emerald-400" />
                <span className="text-sm font-bold">تقرير مطابقة الأستاذ المساعد مع الأستاذ العام (AP Reconciliation)</span>
              </div>
              <button
                onClick={() => setShowReconModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
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

              <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono">
                <div className="flex justify-between text-slate-700 font-sans">
                  <span>إجمالي رصيد الأستاذ المساعد للموردين (Subledger):</span>
                  <span className="font-mono font-black">{reconData.subledgerBalance.toLocaleString()} ر.ي</span>
                </div>
                <div className="flex justify-between text-slate-700 font-sans">
                  <span>رصيد حساب الرقابة الدائن في الأستاذ العام ({reconData.glAccountCode}):</span>
                  <span className="font-mono font-black">{reconData.glBalance.toLocaleString()} ر.ي</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between font-sans font-bold">
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
