import React, { useState, useEffect } from 'react';
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

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [statementData, setStatementData] = useState<StatementData | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

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

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/customers?search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (err) {
      console.error('Failed to load customers', err);
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
    setStatementLoading(true);
    try {
      const res = await fetch(`/api/reports/customer-statement/${cust.id}`);
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

  // Toggle Active
  const toggleActive = async (cust: Customer) => {
    try {
      const res = await fetch(`/api/customers/${cust.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !cust.is_active }),
      });
      if (res.ok) {
        loadCustomers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingCustomer ? `/api/customers/${editingCustomer.id}` : '/api/customers';
      const method = editingCustomer ? 'PUT' : 'POST';

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
        setEditingCustomer(null);
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
        loadCustomers();
      } else {
        const data = await res.json();
        alert(data.error || 'فشلت العملية');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Calculations for KPI Cards
  const totalReceivables = customers.reduce((sum, c) => sum + (parseFloat(c.outstandingBalance) || 0), 0);
  const totalSales = customers.reduce((sum, c) => sum + (parseFloat(c.totalSales) || 0), 0);
  const activeCount = customers.filter(c => c.is_active).length;

  return (
    <div className="space-y-5 pb-8" dir="rtl">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
              <Users size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">إدارة العملاء والمدينون</h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                متابعة الحسابات المدينة، الحدود الائتمانية، وكشوف الحسابات المباشرة من واقع القيود
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingCustomer(null);
            setFormData({
              code: `CUST-${(customers.length + 1).toString().padStart(3, '0')}`,
              name: '',
              phone: '',
              email: '',
              address: '',
              taxNumber: '',
              creditLimit: '10000000',
              paymentTermsDays: '30',
            });
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
        >
          <Plus size={16} />
          <span>إضافة عميل جديد</span>
        </button>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">إجمالي العملاء</span>
            <span className="text-2xl font-black font-mono text-slate-900 block mt-1">{customers.length}</span>
            <span className="text-[11px] font-semibold text-emerald-600 mt-0.5 block">{activeCount} عميل نشط</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users size={22} />
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">إجمالي المديونيات القائمة</span>
            <span className="text-2xl font-black font-mono text-slate-900 block mt-1">{totalReceivables.toLocaleString()}</span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">ريال يمني (مستحق التحصيل)</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <CreditCard size={22} />
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">إجمالي مبيعات العملاء</span>
            <span className="text-2xl font-black font-mono text-slate-900 block mt-1">{totalSales.toLocaleString()}</span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">ريال يمني (فواتير مرحلة)</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <TrendingUp size={22} />
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/70 shadow-xs flex items-center justify-between">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">حساب أستاذ المدينين</span>
            <span className="text-lg font-black font-mono text-slate-900 block mt-1">1103 - العملاء</span>
            <span className="text-[11px] font-semibold text-blue-600 mt-0.5 block">أصول متداولة (مدين)</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Building2 size={22} />
          </div>
        </div>
      </div>

      {/* Main Customers Table Card */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-xs">
        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3.5 top-2.5 text-slate-400" size={17} />
            <input
              type="text"
              placeholder="ابحث بالاسم، الكود، أو رقم الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pr-10 pl-4 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-right"
            />
          </div>

          <span className="text-xs font-semibold text-slate-400">
            عرض {customers.length} عميل
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100 pb-2.5">
                <th className="font-semibold pb-3 pr-2">الكود</th>
                <th className="font-semibold pb-3 px-3">اسم العميل</th>
                <th className="font-semibold pb-3 px-3">الهاتف والبريد</th>
                <th className="font-semibold pb-3 px-3">الرصيد القائم (ر.ي)</th>
                <th className="font-semibold pb-3 px-3">الحد الائتماني (ر.ي)</th>
                <th className="font-semibold pb-3 px-3 text-center">الحالة</th>
                <th className="font-semibold pb-3 pl-2 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/90">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    جاري تحميل بيانات العملاء من قاعدة البيانات...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    لا يوجد عملاء يطابقون بحثك
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const bal = parseFloat(c.outstandingBalance) || 0;
                  const limit = parseFloat(c.credit_limit) || 0;
                  const isOver = limit > 0 && bal > limit;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="py-3.5 pr-2 font-mono font-bold text-blue-600">
                        {c.code}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-extrabold text-slate-800 block">{c.name}</span>
                        {c.address && <span className="text-[11px] text-slate-400 block">{c.address}</span>}
                      </td>
                      <td className="py-3.5 px-3 text-slate-600">
                        {c.phone && <span className="block font-mono text-[11px]">{c.phone}</span>}
                        {c.email && <span className="block text-[11px] text-slate-400">{c.email}</span>}
                      </td>
                      <td className="py-3.5 px-3 font-mono">
                        <span className={`font-black text-sm ${bal > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                          {bal.toLocaleString()}
                        </span>
                        {isOver && (
                          <span className="block text-[10px] font-bold text-rose-500">
                            تجاوز الحد!
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 font-mono font-bold text-slate-600">
                        {limit > 0 ? limit.toLocaleString() : 'غير محدد'}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          c.is_active 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            : 'bg-slate-100 text-slate-500'
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
                            onClick={() => {
                              setEditingCustomer(c);
                              setFormData({
                                code: c.code,
                                name: c.name,
                                phone: c.phone || '',
                                email: c.email || '',
                                address: c.address || '',
                                taxNumber: c.tax_number || '',
                                creditLimit: c.credit_limit || '0',
                                paymentTermsDays: String(c.payment_terms_days || 30),
                              });
                              setShowAddModal(true);
                            }}
                            title="تعديل"
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
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

      {/* Modal 1: Add/Edit Customer */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-right animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-extrabold text-slate-900">
                {editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">كود العميل</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الاسم الكامل *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم الهاتف</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الحد الائتماني (ر.ي)</label>
                  <input
                    type="number"
                    value={formData.creditLimit}
                    onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">أيام السداد (Terms)</label>
                  <input
                    type="number"
                    value={formData.paymentTermsDays}
                    onChange={(e) => setFormData({ ...formData, paymentTermsDays: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">العنوان</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="المحافظة - المديرية - الشارع"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  {editingCustomer ? 'حفظ التعديلات' : 'إضافة العميل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Customer Statement (كشف حساب العميل) */}
      {statementCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 text-right animate-scale-up max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="text-blue-600" size={20} />
                <h3 className="text-base font-extrabold text-slate-900">
                  كشف حساب العميل: {statementCustomer.name}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => window.print()}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                  title="طباعة"
                >
                  <Printer size={16} />
                </button>
                <button 
                  onClick={() => { setStatementCustomer(null); setStatementData(null); }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Customer Summary Cards inside Statement */}
            <div className="grid grid-cols-3 gap-3 my-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <span className="text-[11px] font-bold text-slate-500 block">إجمالي الفواتير (مدين)</span>
                <span className="text-lg font-black font-mono text-slate-900 block mt-0.5">
                  {(statementData?.totalDebit || 0).toLocaleString()} ر.ي
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <span className="text-[11px] font-bold text-slate-500 block">إجمالي السدادات (دائن)</span>
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
            <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-100">
                  <tr className="text-slate-500">
                    <th className="py-2.5 px-3 font-bold">التاريخ</th>
                    <th className="py-2.5 px-3 font-bold">المستند</th>
                    <th className="py-2.5 px-3 font-bold">البيان</th>
                    <th className="py-2.5 px-3 font-bold text-left">مدين (ر.ي)</th>
                    <th className="py-2.5 px-3 font-bold text-left">دائن (ر.ي)</th>
                    <th className="py-2.5 px-3 font-bold text-left">الرصيد (ر.ي)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statementLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        جاري تجهيز كشف الحساب من واقع القيود المحاسبية...
                      </td>
                    </tr>
                  ) : statementData?.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        لا توجد حركات مرحلة مسجلة على هذا العميل حتى الآن
                      </td>
                    </tr>
                  ) : (
                    statementData?.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                          {it.docDate}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-600">
                          {it.docNumber}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          {it.description}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 text-left">
                          {it.debit > 0 ? it.debit.toLocaleString() : '-'}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-600 text-left">
                          {it.credit > 0 ? it.credit.toLocaleString() : '-'}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-black text-slate-900 text-left">
                          {it.runningBalance.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <span>تم استخراج هذا الكشف آلياً من دفاتر الأستاذ العام لنظام كيان ERP</span>
              <button
                onClick={() => { setStatementCustomer(null); setStatementData(null); }}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold"
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
