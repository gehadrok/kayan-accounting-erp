import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  FileSpreadsheet,
  ArrowRightLeft,
  Calendar,
  Layers,
  Coins,
  ShieldCheck,
  TrendingDown,
  RefreshCw,
  Send,
  RotateCcw,
  Landmark,
  CreditCard,
  Building2,
  FileText,
  Clock,
  Percent
} from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';

interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  glAccountCode?: string;
  glAccountName?: string;
  is_active: boolean;
}

interface ExpenseTransaction {
  id: string;
  expense_number: string;
  expense_date: string;
  category_id: string;
  categoryName?: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  payment_type: 'CASH' | 'BANK' | 'AP';
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'POSTED' | 'REVERSED';
  payment_account_name?: string;
  supplierName?: string;
  costCenterName?: string;
  journalEntryNumber?: string;
  description: string;
  notes?: string;
}

interface Accrual {
  id: string;
  accrual_number: string;
  accrual_date: string;
  categoryName?: string;
  amount: number;
  status: 'UNPAID' | 'PAID';
  payment_date?: string;
  description: string;
  journalEntryNumber?: string;
  paymentJournalNumber?: string;
}

interface PrepaidSchedule {
  id: string;
  schedule_number: string;
  payment_date: string;
  description: string;
  total_amount: number;
  duration_months: number;
  monthly_amount: number;
  amortizedAmount: number;
  remainingBalance: number;
  postedMonthsCount: number;
  status: string;
  paymentJournalNumber?: string;
  lines?: any[];
}

export const ExpensesPage: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [activeTab, setActiveTab] = useState<'expenses' | 'accruals' | 'prepaid' | 'categories'>('expenses');
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [accruals, setAccruals] = useState<Accrual[]>([]);
  const [prepaidSchedules, setPrepaidSchedules] = useState<PrepaidSchedule[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [taxCodes, setTaxCodes] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('ALL');

  // Selected item states
  const [selectedPrepaid, setSelectedPrepaid] = useState<PrepaidSchedule | null>(null);
  const [prepaidDetailsLoading, setPrepaidDetailsLoading] = useState(false);

  // Modals
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showAddAccrualModal, setShowAddAccrualModal] = useState(false);
  const [showPayAccrualModal, setShowPayAccrualModal] = useState(false);
  const [selectedAccrual, setSelectedAccrual] = useState<Accrual | null>(null);
  const [showAddPrepaidModal, setShowAddPrepaidModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [selectedExpenseToReverse, setSelectedExpenseToReverse] = useState<ExpenseTransaction | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  // Form states
  const [expenseForm, setExpenseForm] = useState({
    expenseDate: new Date().toISOString().split('T')[0],
    categoryId: '',
    amount: '',
    paymentType: 'CASH' as 'CASH' | 'BANK' | 'AP',
    cashAccountId: '',
    bankAccountId: '',
    supplierId: '',
    costCenterId: '',
    taxCodeId: '',
    description: '',
    notes: '',
  });

  const [accrualForm, setAccrualForm] = useState({
    accrualDate: new Date().toISOString().split('T')[0],
    categoryId: '',
    amount: '',
    costCenterId: '',
    description: '',
    notes: '',
  });

  const [payAccrualForm, setPayAccrualForm] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    paymentType: 'BANK' as 'CASH' | 'BANK',
    cashAccountId: '',
    bankAccountId: '',
  });

  const [prepaidForm, setPrepaidForm] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    expenseAccountId: '',
    totalAmount: '',
    durationMonths: '12',
    paymentType: 'BANK' as 'CASH' | 'BANK',
    cashAccountId: '',
    bankAccountId: '',
    costCenterId: '',
    description: '',
  });

  const [categoryForm, setCategoryForm] = useState({
    code: '',
    name: '',
    glAccountId: '',
  });

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        resExpenses,
        resAccruals,
        resPrepaid,
        resCats,
        resCash,
        resBanks,
        resSuppliers,
        resCC,
        resTaxes,
        resSummary
      ] = await Promise.all([
        fetch('/api/expenses').then(r => r.json()),
        fetch('/api/expenses/accruals').then(r => r.json()).catch(() => []),
        fetch('/api/expenses/prepaid').then(r => r.json()).catch(() => []),
        fetch('/api/expenses/categories').then(r => r.json()),
        fetch('/api/banking/cash-accounts').then(r => r.json()).catch(() => []),
        fetch('/api/banking/bank-accounts').then(r => r.json()).catch(() => []),
        fetch('/api/purchasing/suppliers').then(r => r.json()).catch(() => []),
        fetch('/api/accounting/cost-centers').then(r => r.json()).catch(() => []),
        fetch('/api/accounting/tax-codes').then(r => r.json()).catch(() => []),
        fetch('/api/expenses/summary').then(r => r.json()).catch(() => null),
      ]);

      setExpenses(Array.isArray(resExpenses) ? resExpenses : []);
      setAccruals(Array.isArray(resAccruals) ? resAccruals : []);
      setPrepaidSchedules(Array.isArray(resPrepaid) ? resPrepaid : []);
      setCategories(Array.isArray(resCats) ? resCats : []);
      setCashAccounts(Array.isArray(resCash) ? resCash : []);
      setBankAccounts(Array.isArray(resBanks) ? resBanks : []);
      setSuppliers(Array.isArray(resSuppliers) ? resSuppliers : []);
      setCostCenters(Array.isArray(resCC) ? resCC : []);
      setTaxCodes(Array.isArray(resTaxes) ? resTaxes : []);
      setSummary(resSummary);
    } catch (err: any) {
      console.error(err);
      setMessage({ text: 'فشل تحميل بيانات المصروفات', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        ...expenseForm,
        amount: parseFloat(expenseForm.amount),
      };
      if (!payload.taxCodeId) delete payload.taxCodeId;
      if (!payload.costCenterId) delete payload.costCenterId;

      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إضافة المصروف');

      setMessage({ text: `تم إنشاء سند المصروف (${data.expense_number}) بنجاح`, type: 'success' });
      setShowAddExpenseModal(false);
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleApproveExpense = async (id: string) => {
    try {
      const res = await fetch(`/api/expenses/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل اعتماد المصروف');

      setMessage({ text: 'تم اعتماد المصروف وأصبح جاهزاً للترحيل المحاسبي', type: 'success' });
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handlePostExpense = async (id: string) => {
    try {
      const res = await fetch(`/api/expenses/${id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل ترحيل المصروف');

      setMessage({ text: `تم ترحيل المصروف إلى الأستاذ العام بنجاح (قيد رقم: ${data.journalEntryNumber})`, type: 'success' });
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleReverseExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpenseToReverse) return;
    try {
      const res = await fetch(`/api/expenses/${selectedExpenseToReverse.id}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reverseReason || 'عكس المصروف واسترداد القيد' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل عكس المصروف');

      setMessage({ text: `تم عكس المصروف وترحيل القيد العكسي (${data.reversalJournalEntryNumber || 'تم الترحيل'}) بنجاح`, type: 'success' });
      setShowReverseModal(false);
      setSelectedExpenseToReverse(null);
      setReverseReason('');
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleCreateAccrual = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        ...accrualForm,
        amount: parseFloat(accrualForm.amount),
      };
      if (!payload.costCenterId) delete payload.costCenterId;

      const res = await fetch('/api/expenses/accruals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إضافة المصروف المستحق');

      setMessage({ text: `تم تسجيل المصروف المستحق (${data.accrual_number}) وترحيل قيد الاستحقاق (حساب 2106) بنجاح`, type: 'success' });
      setShowAddAccrualModal(false);
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handlePayAccrual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccrual) return;
    try {
      const res = await fetch(`/api/expenses/accruals/${selectedAccrual.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payAccrualForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل سداد المصروف المستحق');

      setMessage({ text: `تم سداد الاستحقاق وإقفال حساب المستحقات (قيد رقم: ${data.paymentJournalNumber}) دون تكرار إثبات المصروف`, type: 'success' });
      setShowPayAccrualModal(false);
      setSelectedAccrual(null);
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleCreatePrepaid = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        ...prepaidForm,
        totalAmount: parseFloat(prepaidForm.totalAmount),
        durationMonths: parseInt(prepaidForm.durationMonths, 10),
      };
      if (!payload.costCenterId) delete payload.costCenterId;

      const res = await fetch('/api/expenses/prepaid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء جدول المصروف المقدم');

      setMessage({ text: `تم إنشاء جدول المصروف المقدم وترحيل قيد السداد الفوري (حساب 1106) بنجاح`, type: 'success' });
      setShowAddPrepaidModal(false);
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const viewPrepaidSchedule = async (schedule: PrepaidSchedule) => {
    setSelectedPrepaid(schedule);
    setPrepaidDetailsLoading(true);
    try {
      const res = await fetch(`/api/expenses/prepaid/${schedule.id}`).then(r => r.json());
      setSelectedPrepaid(res);
    } catch (err) {
      console.error(err);
    } finally {
      setPrepaidDetailsLoading(false);
    }
  };

  const handlePostAmortization = async (amortizationId: string) => {
    try {
      const res = await fetch(`/api/expenses/prepaid/amortizations/${amortizationId}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل ترحيل قسط الإطفاء الشهري');

      setMessage({ text: `تم ترحيل قسط الإطفاء الشهري بقيمة ${data.amount?.toLocaleString()} ر.ي بنجاح`, type: 'success' });
      if (selectedPrepaid) {
        viewPrepaidSchedule(selectedPrepaid);
      }
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'POSTED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">مرحل للأستاذ</span>;
      case 'APPROVED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">معتمد للترحيل</span>;
      case 'SUBMITTED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">بانتظار الاعتماد</span>;
      case 'DRAFT':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/30">مسودة</span>;
      case 'REVERSED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">معكوس / ملغي</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-700 text-slate-300">{status}</span>;
    }
  };

  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = 
      e.expense_number.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      (e.categoryName && e.categoryName.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || e.status === statusFilter;
    const matchesType = paymentTypeFilter === 'ALL' || e.payment_type === paymentTypeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30 shadow-inner">
            <Wallet className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-wide">إدارة المصروفات والتكاليف</h1>
            <p className="text-sm text-slate-400">سندات الصرف، الاعتماد، الترحيل المحاسبي، المصروفات المستحقة، والمصروفات المدفوعة مقدماً</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setAccrualForm({
                accrualDate: new Date().toISOString().split('T')[0],
                categoryId: categories[0]?.id || '',
                amount: '',
                costCenterId: costCenters[0]?.id || '',
                description: '',
                notes: '',
              });
              setShowAddAccrualModal(true);
            }}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition flex items-center gap-2"
          >
            <Clock className="w-4 h-4 text-amber-400" />
            إثبات استحقاق
          </button>
          <button
            onClick={() => {
              setPrepaidForm({
                paymentDate: new Date().toISOString().split('T')[0],
                expenseAccountId: '',
                totalAmount: '',
                durationMonths: '12',
                paymentType: 'BANK',
                cashAccountId: cashAccounts[0]?.id || '',
                bankAccountId: bankAccounts[0]?.id || '',
                costCenterId: costCenters[0]?.id || '',
                description: '',
              });
              setShowAddPrepaidModal(true);
            }}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition flex items-center gap-2"
          >
            <Calendar className="w-4 h-4 text-blue-400" />
            مصروف مقدم
          </button>
          <button
            onClick={() => {
              setExpenseForm({
                expenseDate: new Date().toISOString().split('T')[0],
                categoryId: categories[0]?.id || '',
                amount: '',
                paymentType: 'CASH',
                cashAccountId: cashAccounts[0]?.id || '',
                bankAccountId: bankAccounts[0]?.id || '',
                supplierId: suppliers[0]?.id || '',
                costCenterId: costCenters[0]?.id || '',
                taxCodeId: '',
                description: '',
                notes: '',
              });
              setShowAddExpenseModal(true);
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            تسجيل مصروف جديد
          </button>
        </div>
      </div>

      {/* Global Message */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center justify-between gap-3 border ${
          message.type === 'success' 
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200' 
            : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
        }`}>
          <div className="flex items-center gap-2.5">
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5 text-rose-400" />}
            <span className="text-sm font-medium">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111927] border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">إجمالي المصروفات المرحلة</span>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
              <Coins className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">{summary?.totalExpenses?.toLocaleString() || '0'} <span className="text-xs font-normal text-slate-400">ر.ي</span></div>
            <div className="text-xs text-slate-400 mt-1">
              مرحلة بقيود يومية إلى حسابات المصروفات (5)
            </div>
          </div>
        </div>

        <div className="bg-[#111927] border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">المصروفات المستحقة غير المسددة</span>
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-400">{summary?.unpaidAccruals?.toLocaleString() || '0'} <span className="text-xs font-normal text-slate-400">ر.ي</span></div>
            <div className="text-xs text-slate-400 mt-1">
              التزامات مستحقة الدفع (حساب 2106)
            </div>
          </div>
        </div>

        <div className="bg-[#111927] border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">رصيد المصروفات المدفوعة مقدماً</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-400">{summary?.remainingPrepaid?.toLocaleString() || '0'} <span className="text-xs font-normal text-slate-400">ر.ي</span></div>
            <div className="text-xs text-slate-400 mt-1">
              أصول متداولة قيد الإطفاء الشهري (حساب 1106)
            </div>
          </div>
        </div>

        <div className="bg-[#111927] border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">سندات بانتظار الاعتماد</span>
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
              <Send className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">{summary?.pendingApprovalCount || 0} <span className="text-xs font-normal text-slate-400">سند</span></div>
            <div className="text-xs text-slate-400 mt-1">
              دورة الاعتماد قبل الترحيل المالي
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`pb-3 px-4 font-semibold text-sm transition border-b-2 flex items-center gap-2 ${
            activeTab === 'expenses'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          سندات وفواتير المصروفات ({expenses.length})
        </button>
        <button
          onClick={() => setActiveTab('accruals')}
          className={`pb-3 px-4 font-semibold text-sm transition border-b-2 flex items-center gap-2 ${
            activeTab === 'accruals'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          المصروفات المستحقة (Accruals) ({accruals.length})
        </button>
        <button
          onClick={() => setActiveTab('prepaid')}
          className={`pb-3 px-4 font-semibold text-sm transition border-b-2 flex items-center gap-2 ${
            activeTab === 'prepaid'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          المصروفات المدفوعة مقدماً وإطفاؤها ({prepaidSchedules.length})
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`pb-3 px-4 font-semibold text-sm transition border-b-2 flex items-center gap-2 ${
            activeTab === 'categories'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          تصنيفات المصروفات ({categories.length})
        </button>
      </div>

      {/* Tab Content 1: Expenses List */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-[#111927] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="بحث برقم السند أو البيان أو التصنيف..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-10 pl-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">جميع الحالات</option>
                <option value="POSTED">مرحل للأستاذ</option>
                <option value="APPROVED">معتمد</option>
                <option value="SUBMITTED">بانتظار الاعتماد</option>
                <option value="DRAFT">مسودة</option>
                <option value="REVERSED">معكوس</option>
              </select>

              <select
                value={paymentTypeFilter}
                onChange={e => setPaymentTypeFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">جميع طرق السداد</option>
                <option value="CASH">صندوق / نقداً</option>
                <option value="BANK">بنك / تحويل</option>
                <option value="AP">آجل / موردون</option>
              </select>

              <button
                onClick={fetchData}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                title="تحديث البيانات"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-[#111927] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="py-3.5 px-4">رقم السند</th>
                    <th className="py-3.5 px-4">التاريخ</th>
                    <th className="py-3.5 px-4">التصنيف والبيان</th>
                    <th className="py-3.5 px-4">طريقة السداد</th>
                    <th className="py-3.5 px-4">المبلغ الصافي</th>
                    <th className="py-3.5 px-4">الضريبة</th>
                    <th className="py-3.5 px-4">الإجمالي</th>
                    <th className="py-3.5 px-4">الحالة</th>
                    <th className="py-3.5 px-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">جاري تحميل سندات المصروفات...</td>
                    </tr>
                  ) : filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">لا توجد سندات مصروفات مسجلة</td>
                    </tr>
                  ) : (
                    filteredExpenses.map(exp => (
                      <tr key={exp.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-400">{exp.expense_number}</td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono text-xs">{exp.expense_date}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{exp.description}</div>
                          <div className="text-xs text-slate-400">{exp.categoryName} {exp.costCenterName && `• ${exp.costCenterName}`}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-xs text-slate-300 flex items-center gap-1">
                            {exp.payment_type === 'CASH' && <Wallet className="w-3.5 h-3.5 text-emerald-400" />}
                            {exp.payment_type === 'BANK' && <Landmark className="w-3.5 h-3.5 text-blue-400" />}
                            {exp.payment_type === 'AP' && <Building2 className="w-3.5 h-3.5 text-amber-400" />}
                            {exp.payment_type === 'CASH' ? 'نقدي (صندوق)' : exp.payment_type === 'BANK' ? 'بنكي' : 'آجل (مورد)'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-white">{exp.amount?.toLocaleString()} ر.ي</td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono text-xs">{exp.tax_amount > 0 ? `${exp.tax_amount.toLocaleString()} ر.ي` : '—'}</td>
                        <td className="py-3.5 px-4 font-bold text-emerald-400">{exp.total_amount?.toLocaleString()} ر.ي</td>
                        <td className="py-3.5 px-4">{getStatusBadge(exp.status)}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            {exp.status === 'DRAFT' && (
                              <button
                                onClick={() => handleApproveExpense(exp.id)}
                                className="px-2.5 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg transition"
                                title="اعتماد المصروف"
                              >
                                اعتماد
                              </button>
                            )}

                            {(exp.status === 'APPROVED' || exp.status === 'SUBMITTED') && (
                              <button
                                onClick={() => handlePostExpense(exp.id)}
                                className="px-2.5 py-1 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg transition font-bold"
                                title="ترحيل القيد للأستاذ العام"
                              >
                                ترحيل
                              </button>
                            )}

                            {exp.status === 'POSTED' && (
                              <button
                                onClick={() => {
                                  setSelectedExpenseToReverse(exp);
                                  setShowReverseModal(true);
                                }}
                                className="px-2 py-1 text-xs bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 rounded-lg transition"
                                title="عكس المصروف وترحيل قيد تسوية عكسي"
                              >
                                <RotateCcw className="w-3.5 h-3.5 inline ml-1" />
                                عكس
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
        </div>
      )}

      {/* Tab Content 2: Accrued Expenses */}
      {activeTab === 'accruals' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-[#111927] border border-slate-800 rounded-2xl p-4">
            <div>
              <h3 className="font-bold text-white text-base">المصروفات المستحقة (Accrued Expenses)</h3>
              <p className="text-xs text-slate-400">إثبات المصروف في فترته المحاسبية المستحقة، ثم سداده لاحقاً دون تكرار إثباته في حسابات النفقات</p>
            </div>
            <button
              onClick={() => {
                setAccrualForm({
                  accrualDate: new Date().toISOString().split('T')[0],
                  categoryId: categories[0]?.id || '',
                  amount: '',
                  costCenterId: costCenters[0]?.id || '',
                  description: '',
                  notes: '',
                });
                setShowAddAccrualModal(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              إثبات استحقاق جديد
            </button>
          </div>

          <div className="bg-[#111927] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-3.5 px-4">رقم الاستحقاق</th>
                  <th className="py-3.5 px-4">تاريخ الاستحقاق</th>
                  <th className="py-3.5 px-4">البيان والتصنيف</th>
                  <th className="py-3.5 px-4">المبلغ المستحق</th>
                  <th className="py-3.5 px-4">قيد الاستحقاق (GL)</th>
                  <th className="py-3.5 px-4">حالة السداد</th>
                  <th className="py-3.5 px-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {accruals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">لا توجد مصروفات مستحقة مسجلة</td>
                  </tr>
                ) : (
                  accruals.map(acc => (
                    <tr key={acc.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-amber-400">{acc.accrual_number}</td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-xs">{acc.accrual_date}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{acc.description}</div>
                        <div className="text-xs text-slate-400">{acc.categoryName}</div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-white">{acc.amount?.toLocaleString()} ر.ي</td>
                      <td className="py-3.5 px-4 font-mono text-xs text-blue-400">{acc.journalEntryNumber || '—'}</td>
                      <td className="py-3.5 px-4">
                        {acc.status === 'PAID' ? (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            مسدد (قيد {acc.paymentJournalNumber})
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            مستحق غير مسدد
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {acc.status === 'UNPAID' && (
                          <button
                            onClick={() => {
                              setSelectedAccrual(acc);
                              setPayAccrualForm({
                                paymentDate: new Date().toISOString().split('T')[0],
                                paymentType: 'BANK',
                                cashAccountId: cashAccounts[0]?.id || '',
                                bankAccountId: bankAccounts[0]?.id || '',
                              });
                              setShowPayAccrualModal(true);
                            }}
                            className="px-3 py-1 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg transition font-bold"
                          >
                            سداد الاستحقاق
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content 3: Prepaid Expenses */}
      {activeTab === 'prepaid' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-[#111927] border border-slate-800 rounded-2xl p-4">
            <div>
              <h3 className="font-bold text-white text-base">المصروفات المدفوعة مقدماً (Prepaid Expenses)</h3>
              <p className="text-xs text-slate-400">سداد الدفعات المقدمة (تأمين، إيجارات) وتوليد جداول الإطفاء الشهري التلقائي لحساب 1106</p>
            </div>
            <button
              onClick={() => {
                setPrepaidForm({
                  paymentDate: new Date().toISOString().split('T')[0],
                  expenseAccountId: '',
                  totalAmount: '',
                  durationMonths: '12',
                  paymentType: 'BANK',
                  cashAccountId: cashAccounts[0]?.id || '',
                  bankAccountId: bankAccounts[0]?.id || '',
                  costCenterId: costCenters[0]?.id || '',
                  description: '',
                });
                setShowAddPrepaidModal(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              إنشاء جدول مصروف مقدم
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {prepaidSchedules.map(schedule => (
              <div key={schedule.id} className="bg-[#111927] border border-slate-800 rounded-2xl p-5 space-y-3 hover:border-slate-700 transition">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 font-mono text-xs font-bold rounded-md">{schedule.schedule_number}</span>
                  <span className="text-xs text-slate-400">{schedule.payment_date}</span>
                </div>
                <h4 className="font-bold text-white text-base">{schedule.description}</h4>
                <div className="space-y-1.5 text-xs text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">إجمالي المبلغ:</span>
                    <span className="font-bold text-white">{schedule.total_amount?.toLocaleString()} ر.ي</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">القسط الشهري:</span>
                    <span className="font-bold text-blue-400">{schedule.monthly_amount?.toLocaleString()} ر.ي / شهر</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">المطفأ حتى الآن:</span>
                    <span className="font-bold text-emerald-400">{schedule.amortizedAmount?.toLocaleString()} ر.ي ({schedule.postedMonthsCount}/{schedule.duration_months} شهر)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">الرصيد المتبقي:</span>
                    <span className="font-bold text-amber-400">{schedule.remainingBalance?.toLocaleString()} ر.ي</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => viewPrepaidSchedule(schedule)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                  >
                    عرض جدول الإطفاء
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content 4: Expense Categories */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl p-4 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-white text-base">تصنيفات المصروفات وربط شجرة الحسابات</h3>
              <p className="text-xs text-slate-400">ربط كل بند مصروف بالحساب المقابل له في دليل الحسابات (شجرة المصروفات - 5)</p>
            </div>
            <button
              onClick={() => setShowCategoryModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              إضافة تصنيف
            </button>
          </div>

          <div className="bg-[#111927] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-3.5 px-4">كود التصنيف</th>
                  <th className="py-3.5 px-4">اسم بند المصروف</th>
                  <th className="py-3.5 px-4">رقم حساب الأستاذ العام (GL)</th>
                  <th className="py-3.5 px-4">اسم الحساب</th>
                  <th className="py-3.5 px-4">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {categories.map(cat => (
                  <tr key={cat.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-400">{cat.code}</td>
                    <td className="py-3.5 px-4 font-semibold text-white">{cat.name}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">{cat.glAccountCode || '5301'}</td>
                    <td className="py-3.5 px-4 text-slate-400">{cat.glAccountName || 'مصروفات تشغيلية'}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 text-xs bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/30">نشط</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Add Expense */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">تسجيل سند مصروف جديد</h3>
              <button onClick={() => setShowAddExpenseModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1">تاريخ المصروف *</label>
                  <input
                    type="date"
                    required
                    value={expenseForm.expenseDate}
                    onChange={e => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">تصنيف المصروف *</label>
                  <select
                    required
                    value={expenseForm.categoryId}
                    onChange={e => setExpenseForm({ ...expenseForm, categoryId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">البيان والتفاصيل *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: شراء قرطاسية وأدوات مكتبية لمقر الشركة"
                  value={expenseForm.description}
                  onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1">المبلغ الصافي (ر.ي) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="1"
                    placeholder="مثال: 150000"
                    value={expenseForm.amount}
                    onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">ضريبة القيمة المضافة (إن وجدت)</label>
                  <select
                    value={expenseForm.taxCodeId}
                    onChange={e => setExpenseForm({ ...expenseForm, taxCodeId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="">بدون ضريبة (0%)</option>
                    {taxCodes.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1">طريقة السداد *</label>
                  <select
                    value={expenseForm.paymentType}
                    onChange={e => setExpenseForm({ ...expenseForm, paymentType: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="CASH">نقداً من الصندوق والخزينة</option>
                    <option value="BANK">تحويل بنكي أو شيك من حساب بنكي</option>
                    <option value="AP">آجل على الحساب (مورد / دائن)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">مركز التكلفة (اختياري)</label>
                  <select
                    value={expenseForm.costCenterId}
                    onChange={e => setExpenseForm({ ...expenseForm, costCenterId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="">-- بدون مركز تكلفة --</option>
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.name} ({cc.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              {expenseForm.paymentType === 'CASH' && (
                <div>
                  <label className="block text-slate-300 mb-1">الصندوق والخزينة *</label>
                  <select
                    required
                    value={expenseForm.cashAccountId}
                    onChange={e => setExpenseForm({ ...expenseForm, cashAccountId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    {cashAccounts.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {expenseForm.paymentType === 'BANK' && (
                <div>
                  <label className="block text-slate-300 mb-1">الحساب البنكي *</label>
                  <select
                    required
                    value={expenseForm.bankAccountId}
                    onChange={e => setExpenseForm({ ...expenseForm, bankAccountId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>{b.bank_name} - {b.account_name} ({b.account_number})</option>
                    ))}
                  </select>
                </div>
              )}

              {expenseForm.paymentType === 'AP' && (
                <div>
                  <label className="block text-slate-300 mb-1">المورد الدائن *</label>
                  <select
                    required
                    value={expenseForm.supplierId}
                    onChange={e => setExpenseForm({ ...expenseForm, supplierId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl"
                >
                  تسجيل المصروف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Accrual */}
      {showAddAccrualModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">إثبات مصروف مستحق (Accrual)</h3>
              <button onClick={() => setShowAddAccrualModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              توليد قيد استحقاق فوري: مدين حساب المصروف (5) / دائن المصروفات المستحقة الدفع (حساب 2106).
            </p>
            <form onSubmit={handleCreateAccrual} className="space-y-3 text-sm">
              <div>
                <label className="block text-slate-300 mb-1">تاريخ الاستحقاق *</label>
                <input
                  type="date"
                  required
                  value={accrualForm.accrualDate}
                  onChange={e => setAccrualForm({ ...accrualForm, accrualDate: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">تصنيف المصروف *</label>
                <select
                  required
                  value={accrualForm.categoryId}
                  onChange={e => setAccrualForm({ ...accrualForm, categoryId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">المبلغ المستحق (ر.ي) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="مثال: 5000000"
                  value={accrualForm.amount}
                  onChange={e => setAccrualForm({ ...accrualForm, amount: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">البيان والسبب *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: فاتورة كهرباء شهر سبتمبر لم تسدد بعد"
                  value={accrualForm.description}
                  onChange={e => setAccrualForm({ ...accrualForm, description: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddAccrualModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl"
                >
                  إثبات الاستحقاق
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Pay Accrual */}
      {showPayAccrualModal && selectedAccrual && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">سداد مصروف مستحق</h3>
              <button onClick={() => setShowPayAccrualModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
              <div>البيان: <strong className="text-white">{selectedAccrual.description}</strong></div>
              <div>المبلغ المستحق للسداد: <strong className="text-amber-400">{selectedAccrual.amount?.toLocaleString()} ر.ي</strong></div>
            </div>
            <p className="text-xs text-slate-400">
              القيد الناتج: مدين المصروفات المستحقة (2106) / دائن الصندوق أو البنك، دون إعادة قيد المصروف في حسابات التكاليف ثانية.
            </p>
            <form onSubmit={handlePayAccrual} className="space-y-3 text-sm">
              <div>
                <label className="block text-slate-300 mb-1">تاريخ السداد *</label>
                <input
                  type="date"
                  required
                  value={payAccrualForm.paymentDate}
                  onChange={e => setPayAccrualForm({ ...payAccrualForm, paymentDate: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">طريقة السداد *</label>
                <select
                  value={payAccrualForm.paymentType}
                  onChange={e => setPayAccrualForm({ ...payAccrualForm, paymentType: e.target.value as any })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="BANK">تحويل بنكي</option>
                  <option value="CASH">نقداً من الصندوق</option>
                </select>
              </div>

              {payAccrualForm.paymentType === 'BANK' ? (
                <div>
                  <label className="block text-slate-300 mb-1">الحساب البنكي *</label>
                  <select
                    required
                    value={payAccrualForm.bankAccountId}
                    onChange={e => setPayAccrualForm({ ...payAccrualForm, bankAccountId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>{b.bank_name} ({b.account_number})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-300 mb-1">الصندوق *</label>
                  <select
                    required
                    value={payAccrualForm.cashAccountId}
                    onChange={e => setPayAccrualForm({ ...payAccrualForm, cashAccountId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    {cashAccounts.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPayAccrualModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl"
                >
                  تأكيد السداد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Prepaid Schedule */}
      {showAddPrepaidModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">إنشاء جدول مصروف مدفوع مقدماً</h3>
              <button onClick={() => setShowAddPrepaidModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              سيتم ترحيل قيد السداد الفوري: مدين مصروفات مدفوعة مقدماً (1106) / دائن البنك أو الصندوق، وبناء جدول الأقساط الشهرية.
            </p>
            <form onSubmit={handleCreatePrepaid} className="space-y-3 text-sm">
              <div>
                <label className="block text-slate-300 mb-1">البيان والوصف *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: وثيقة تأمين شامل على المنشآت لسنة كاملة"
                  value={prepaidForm.description}
                  onChange={e => setPrepaidForm({ ...prepaidForm, description: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">إجمالي المبلغ المسدد *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="مثال: 12000000"
                    value={prepaidForm.totalAmount}
                    onChange={e => setPrepaidForm({ ...prepaidForm, totalAmount: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">المدة بالأشهر *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="60"
                    value={prepaidForm.durationMonths}
                    onChange={e => setPrepaidForm({ ...prepaidForm, durationMonths: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">تاريخ السداد المقدم *</label>
                <input
                  type="date"
                  required
                  value={prepaidForm.paymentDate}
                  onChange={e => setPrepaidForm({ ...prepaidForm, paymentDate: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">حساب المصروف الشهري المستهدف (عند الإطفاء) *</label>
                <select
                  required
                  value={prepaidForm.expenseAccountId}
                  onChange={e => setPrepaidForm({ ...prepaidForm, expenseAccountId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="">-- اختر حساب المصروف --</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.glAccountCode || c.id}>{c.name} ({c.glAccountCode || '5301'})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">طريقة السداد *</label>
                  <select
                    value={prepaidForm.paymentType}
                    onChange={e => setPrepaidForm({ ...prepaidForm, paymentType: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="BANK">تحويل بنكي</option>
                    <option value="CASH">نقداً من الصندوق</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">الحساب المسدد منه *</label>
                  {prepaidForm.paymentType === 'BANK' ? (
                    <select
                      value={prepaidForm.bankAccountId}
                      onChange={e => setPrepaidForm({ ...prepaidForm, bankAccountId: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    >
                      {bankAccounts.map(b => (
                        <option key={b.id} value={b.id}>{b.bank_name}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={prepaidForm.cashAccountId}
                      onChange={e => setPrepaidForm({ ...prepaidForm, cashAccountId: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    >
                      {cashAccounts.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddPrepaidModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl"
                >
                  إنشاء الجدول
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Prepaid Schedule Details & Amortize */}
      {selectedPrepaid && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">{selectedPrepaid.description}</h3>
                <p className="text-xs text-slate-400 font-mono">رقم الجدول: {selectedPrepaid.schedule_number} | قيد السداد: {selectedPrepaid.paymentJournalNumber}</p>
              </div>
              <button onClick={() => setSelectedPrepaid(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">إجمالي المبلغ</span>
                <div className="text-base font-bold text-white">{selectedPrepaid.total_amount?.toLocaleString()} ر.ي</div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">القسط الشهري</span>
                <div className="text-base font-bold text-blue-400">{selectedPrepaid.monthly_amount?.toLocaleString()} ر.ي</div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">الرصيد المتبقي</span>
                <div className="text-base font-bold text-amber-400">{selectedPrepaid.remainingBalance?.toLocaleString()} ر.ي</div>
              </div>
            </div>

            {prepaidDetailsLoading ? (
              <div className="py-8 text-center text-slate-500">جاري تحميل أقساط الإطفاء...</div>
            ) : selectedPrepaid.lines ? (
              <div className="space-y-3">
                <h4 className="font-bold text-white text-sm">أقساط الإطفاء الشهري (Amortization Schedule)</h4>
                <div className="overflow-x-auto max-h-64 border border-slate-800 rounded-xl">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-900 text-slate-400 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">الشهر</th>
                        <th className="py-2.5 px-3">الفترة المالية</th>
                        <th className="py-2.5 px-3">مبلغ القسط</th>
                        <th className="py-2.5 px-3">حالة الإطفاء</th>
                        <th className="py-2.5 px-3 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {selectedPrepaid.lines.map((line: any) => (
                        <tr key={line.id} className={line.is_posted ? 'bg-emerald-950/20' : ''}>
                          <td className="py-2.5 px-3 font-mono">قسط شهر {line.month_index}</td>
                          <td className="py-2.5 px-3">{line.periodName}</td>
                          <td className="py-2.5 px-3 font-bold text-white">{line.amount?.toLocaleString()} ر.ي</td>
                          <td className="py-2.5 px-3">
                            {line.is_posted ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> تم الإطفاء (قيد {line.journalEntryNumber})
                              </span>
                            ) : (
                              <span className="text-slate-400">مجدول</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {!line.is_posted && (
                              <button
                                onClick={() => handlePostAmortization(line.id)}
                                className="px-2.5 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg transition"
                              >
                                ترحيل القسط
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedPrepaid(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reverse Expense */}
      {showReverseModal && selectedExpenseToReverse && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">عكس قيد المصروف</h3>
              <button onClick={() => setShowReverseModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              سيتم إنشاء وترحيل قيد تسوية عكسي (تبديل المدين والدائن) وإلغاء أثر السحب من الصندوق أو البنك بدقة.
            </p>
            <form onSubmit={handleReverseExpense} className="space-y-3 text-sm">
              <div>
                <label className="block text-slate-300 mb-1">سبب العكس والإلغاء *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="مثال: إلغاء المعاملة واسترداد المبلغ أو خطأ في التسجيل"
                  value={reverseReason}
                  onChange={e => setReverseReason(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReverseModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl"
                >
                  تأكيد العكس
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
