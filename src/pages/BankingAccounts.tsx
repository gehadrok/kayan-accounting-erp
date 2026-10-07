import React, { useState, useEffect } from 'react';
import {
  Landmark,
  Wallet,
  Plus,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Building2,
  CheckCircle2,
  XCircle,
  X,
  CreditCard,
  History,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';

interface CashAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  glAccountCode?: string;
  glAccountName?: string;
  branchName?: string;
  currencySymbol?: string;
  opening_balance: number;
  currentBalance: number;
  transactionsCount: number;
  is_active: boolean;
  notes?: string;
}

interface BankAccount {
  id: string;
  code: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  iban?: string;
  swift_bic?: string;
  branch_name?: string;
  glAccountCode?: string;
  glAccountName?: string;
  currencySymbol?: string;
  opening_balance: number;
  currentBalance: number;
  transactionsCount: number;
  statementsCount: number;
  unreconciledCount: number;
  is_active: boolean;
  notes?: string;
}

export const BankingAccountsPage: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [activeTab, setActiveTab] = useState<'banks' | 'cash'>('banks');
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [showAddCashModal, setShowAddCashModal] = useState(false);

  // Form states
  const [bankForm, setBankForm] = useState({
    code: '',
    bankName: '',
    accountName: '',
    accountNumber: '',
    iban: '',
    swiftBic: '',
    branchName: '',
    openingBalance: '0',
    notes: '',
  });

  const [cashForm, setCashForm] = useState({
    code: '',
    name: '',
    type: 'MAIN',
    openingBalance: '0',
    notes: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [cashRes, bankRes] = await Promise.all([
        fetch('/api/banking/cash-accounts'),
        fetch('/api/banking/bank-accounts'),
      ]);

      if (cashRes.ok && bankRes.ok) {
        const cashData = await cashRes.json();
        const bankData = await bankRes.json();
        setCashAccounts(cashData);
        setBankAccounts(bankData);
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalCash = cashAccounts.reduce((sum, c) => sum + (c.is_active ? c.currentBalance : 0), 0);
  const totalBanks = bankAccounts.reduce((sum, b) => sum + (b.is_active ? b.currentBalance : 0), 0);
  const totalLiquidity = totalCash + totalBanks;

  const handleCreateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/banking/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bankForm,
          openingBalance: parseFloat(bankForm.openingBalance) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إضافة الحساب البنكي');

      setShowAddBankModal(false);
      setBankForm({
        code: '',
        bankName: '',
        accountName: '',
        accountNumber: '',
        iban: '',
        swiftBic: '',
        branchName: '',
        openingBalance: '0',
        notes: '',
      });
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCash = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/banking/cash-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cashForm,
          openingBalance: parseFloat(cashForm.openingBalance) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إضافة الصندوق');

      setShowAddCashModal(false);
      setCashForm({
        code: '',
        name: '',
        type: 'MAIN',
        openingBalance: '0',
        notes: '',
      });
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredBanks = bankAccounts.filter(
    b =>
      b.bank_name.toLowerCase().includes(search.toLowerCase()) ||
      b.account_name.toLowerCase().includes(search.toLowerCase()) ||
      b.account_number.includes(search) ||
      b.code.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCash = cashAccounts.filter(
    c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <Landmark size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">إدارة الحسابات البنكية والخزائن</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                إدارة الحسابات المصرفية، الصناديق النقدية، أرصدة السيولة، وحركات الأستاذ المالي
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddBankModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-all shadow-sm shadow-blue-500/20"
          >
            <Plus size={16} />
            <span>إضافة بنك جديد</span>
          </button>
          <button
            onClick={() => setShowAddCashModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-all shadow-sm shadow-emerald-500/20"
          >
            <Plus size={16} />
            <span>إضافة صندوق نقدية</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Liquidity */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">إجمالي السيولة المتاحة</span>
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
              {totalLiquidity.toLocaleString()} <span className="text-xs font-normal text-slate-400">ر.ي</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">مجموع الأرصدة الحية المحسوبة من دفتر الأستاذ</p>
          </div>
          <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-blue-500/5 rounded-full pointer-events-none" />
        </div>

        {/* Bank Balances */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">أرصدة الحسابات البنكية</span>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Building2 size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono tracking-tight">
              {totalBanks.toLocaleString()} <span className="text-xs font-normal text-slate-400">ر.ي</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">موزعة على {bankAccounts.length} حسابات بنكية نشطة</p>
          </div>
        </div>

        {/* Cash Balances */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">أرصدة الصناديق والخزائن</span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Wallet size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
              {totalCash.toLocaleString()} <span className="text-xs font-normal text-slate-400">ر.ي</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">موزعة على {cashAccounts.length} صناديق نقدية</p>
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('banks')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'banks'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Landmark size={15} />
            <span>حسابات البنوك ({bankAccounts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('cash')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'cash'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Wallet size={15} />
            <span>الخزائن والصناديق ({cashAccounts.length})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="بحث بالاسم أو الكود أو رقم الحساب..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-3 pr-9 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
        </div>
      </div>

      {/* Content View */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 text-sm">
          جاري تحميل بيانات الحسابات النقدية والبنكية...
        </div>
      ) : activeTab === 'banks' ? (
        /* Bank Accounts Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBanks.map(bank => (
            <div
              key={bank.id}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-blue-400/50 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-base">
                      <Landmark size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">{bank.bank_name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{bank.account_name}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      bank.is_active
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
                    }`}
                  >
                    {bank.is_active ? 'نشط' : 'معطل'}
                  </span>
                </div>

                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>رقم الحساب:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{bank.account_number}</span>
                  </div>
                  {bank.iban && (
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>الآيبان IBAN:</span>
                      <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200">{bank.iban}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>حساب الأستاذ العام:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{bank.glAccountCode || '1102'}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <span className="text-[11px] text-slate-400">الرصيد الفعلي الحالي:</span>
                  <div className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono tracking-tight mt-0.5">
                    {bank.currentBalance.toLocaleString()} <span className="text-xs font-normal text-slate-400">ر.ي</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400 text-[11px]">{bank.transactionsCount} حركات مسجلة</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigateTo('banking-ledger')}
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium text-xs flex items-center gap-1"
                  >
                    <span>كشف الحساب</span>
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Cash Boxes Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCash.map(cash => (
            <div
              key={cash.id}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-emerald-400/50 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-base">
                      <Wallet size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">{cash.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{cash.code}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      cash.is_active
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
                    }`}
                  >
                    {cash.is_active ? 'نشط' : 'معطل'}
                  </span>
                </div>

                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>النوع:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {cash.type === 'MAIN'
                        ? 'خزينة رئيسية'
                        : cash.type === 'SALES'
                        ? 'صندوق مبيعات'
                        : cash.type === 'PETTY_CASH'
                        ? 'عهدة ومصروفات نثرية'
                        : 'صندوق فرع'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>حساب الأستاذ العام:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{cash.glAccountCode || '1101'}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <span className="text-[11px] text-slate-400">الرصيد الدفتري الحالي:</span>
                  <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight mt-0.5">
                    {cash.currentBalance.toLocaleString()} <span className="text-xs font-normal text-slate-400">ر.ي</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400 text-[11px]">{cash.transactionsCount} حركات</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigateTo('cash-reconciliation')}
                    className="text-amber-600 hover:text-amber-700 dark:text-amber-400 font-medium text-xs flex items-center gap-1"
                  >
                    <span>جرد الصندوق</span>
                  </button>
                  <button
                    onClick={() => navigateTo('banking-ledger')}
                    className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-medium text-xs flex items-center gap-1"
                  >
                    <span>سجل الحركات</span>
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Add Bank Account */}
      {showAddBankModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600">
                  <Landmark size={20} />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">إضافة حساب بنكي جديد</h3>
              </div>
              <button
                onClick={() => setShowAddBankModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="mx-5 mt-4 p-3 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateBank} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">كود البنك *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: BANK-04"
                    value={bankForm.code}
                    onChange={e => setBankForm({ ...bankForm, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">اسم البنك *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: بنك اليمن والكويت"
                    value={bankForm.bankName}
                    onChange={e => setBankForm({ ...bankForm, bankName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">اسم الحساب *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: الحساب الجاري بالريال"
                    value={bankForm.accountName}
                    onChange={e => setBankForm({ ...bankForm, accountName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">رقم الحساب *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: 1234567890"
                    value={bankForm.accountNumber}
                    onChange={e => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">الآيبان IBAN</label>
                  <input
                    type="text"
                    placeholder="YE..."
                    value={bankForm.iban}
                    onChange={e => setBankForm({ ...bankForm, iban: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">الرصيد الافتتاحي (ر.ي)</label>
                  <input
                    type="number"
                    step="any"
                    value={bankForm.openingBalance}
                    onChange={e => setBankForm({ ...bankForm, openingBalance: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">ملاحظات / فرع البنك</label>
                <input
                  type="text"
                  placeholder="مثال: الفرع الرئيسي - شارع الزبيري"
                  value={bankForm.branchName}
                  onChange={e => setBankForm({ ...bankForm, branchName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddBankModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {submitting ? 'جاري الحفظ...' : 'حفظ الحساب البنكي'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Cash Account */}
      {showAddCashModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600">
                  <Wallet size={20} />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">إضافة صندوق نقدية جديد</h3>
              </div>
              <button
                onClick={() => setShowAddCashModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="mx-5 mt-4 p-3 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateCash} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">كود الصندوق *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: CASH-04"
                  value={cashForm.code}
                  onChange={e => setCashForm({ ...cashForm, code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">اسم الصندوق / الخزينة *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: صندوق فرع عدن"
                  value={cashForm.name}
                  onChange={e => setCashForm({ ...cashForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">نوع الصندوق</label>
                  <select
                    value={cashForm.type}
                    onChange={e => setCashForm({ ...cashForm, type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="MAIN">خزينة رئيسية</option>
                    <option value="SALES">صندوق مبيعات كاشير</option>
                    <option value="PETTY_CASH">عهدة ومصروفات نثرية</option>
                    <option value="BRANCH">صندوق فرع</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">الرصيد الافتتاحي</label>
                  <input
                    type="number"
                    step="any"
                    value={cashForm.openingBalance}
                    onChange={e => setCashForm({ ...cashForm, openingBalance: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">ملاحظات</label>
                <textarea
                  rows={2}
                  placeholder="ملاحظات تفصيلية أو اسم المسؤول عن العهدة..."
                  value={cashForm.notes}
                  onChange={e => setCashForm({ ...cashForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCashModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {submitting ? 'جاري الحفظ...' : 'حفظ الصندوق'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
