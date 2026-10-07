import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Search, 
  Plus, 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FileText, 
  CheckCircle2, 
  X,
  Layers,
  Filter
} from 'lucide-react';

interface Account {
  id: string;
  code: string;
  name: string;
  account_type_id: string;
  accountTypeName?: string;
  level: number;
  is_group: boolean;
  normal_balance: 'DEBIT' | 'CREDIT';
  is_active: boolean;
  parent_id?: string;
}

export const ChartOfAccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Account form state
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newTypeId, setNewTypeId] = useState('ASSET');
  const [newParentId, setNewParentId] = useState('');
  const [newIsGroup, setNewIsGroup] = useState(false);
  const [newNormalBalance, setNewNormalBalance] = useState<'DEBIT' | 'CREDIT'>('DEBIT');

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (err) {
      console.error('Error fetching chart of accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newCode,
          name: newName,
          accountTypeId: newTypeId,
          parentId: newParentId || undefined,
          isGroup: newIsGroup,
          normalBalance: newNormalBalance,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل في إنشاء الحساب');
      }

      setIsModalOpen(false);
      setNewCode('');
      setNewName('');
      setNewParentId('');
      await fetchAccounts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch = 
      acc.name.toLowerCase().includes(search.toLowerCase()) || 
      acc.code.includes(search);
    const matchesType = selectedType === 'ALL' || acc.account_type_id === selectedType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-blue-600 to-cyan-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <BookOpen size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">دليل الحسابات الشامل (Chart of Accounts)</h1>
            <p className="text-xs text-slate-500 font-medium">الهيكل المالي المحاسبي الموحد للشجرة المحاسبية بمستوياتها الخمسة</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus size={16} />
            <span>إضافة حساب جديد</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400">1. الأصول (Assets)</span>
          <p className="text-xl font-black text-blue-600 font-mono mt-1">
            {accounts.filter(a => a.code.startsWith('1')).length} حساب
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400">2. الخصوم (Liabilities)</span>
          <p className="text-xl font-black text-rose-600 font-mono mt-1">
            {accounts.filter(a => a.code.startsWith('2')).length} حساب
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400">3. حقوق الملكية (Equity)</span>
          <p className="text-xl font-black text-purple-600 font-mono mt-1">
            {accounts.filter(a => a.code.startsWith('3')).length} حساب
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400">4. الإيرادات (Revenue)</span>
          <p className="text-xl font-black text-emerald-600 font-mono mt-1">
            {accounts.filter(a => a.code.startsWith('4')).length} حساب
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400">5. المصروفات (Expenses)</span>
          <p className="text-xl font-black text-amber-600 font-mono mt-1">
            {accounts.filter(a => a.code.startsWith('5')).length} حساب
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="بحث برقم الحساب أو اسم الحساب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          {['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                selectedType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {type === 'ALL' && 'الكل'}
              {type === 'ASSET' && 'الأصول'}
              {type === 'LIABILITY' && 'الخصوم'}
              {type === 'EQUITY' && 'الملكية'}
              {type === 'REVENUE' && 'الإيرادات'}
              {type === 'EXPENSE' && 'المصروفات'}
            </button>
          ))}
        </div>
      </div>

      {/* Accounts Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200/70">
              <tr>
                <th className="py-3 px-4">كود الحساب</th>
                <th className="py-3 px-4">اسم الحساب</th>
                <th className="py-3 px-4">نوع الحساب</th>
                <th className="py-3 px-4">طبيعة الرصيد</th>
                <th className="py-3 px-4 text-center">الرتبة</th>
                <th className="py-3 px-4 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    جاري تحميل دليل الحسابات...
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    لا توجد حسابات مطابقة لمعايير البحث
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                      {acc.code}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        {acc.is_group ? (
                          <Folder size={14} className="text-amber-500 fill-amber-500/20" />
                        ) : (
                          <FileText size={14} className="text-blue-500" />
                        )}
                        <span className={acc.is_group ? 'font-bold text-slate-900' : 'text-slate-700'}>
                          {acc.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        {acc.account_type_id}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`text-[10px] font-bold ${
                        acc.normal_balance === 'DEBIT' ? 'text-blue-600' : 'text-purple-600'
                      }`}>
                        {acc.normal_balance === 'DEBIT' ? 'مدين (Debit)' : 'دائن (Credit)'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className="font-mono text-slate-400 text-[11px]">
                        مستوى {acc.level || 1}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                        <CheckCircle2 size={11} />
                        نشط
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Account Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-blue-600" />
                <h3 className="font-bold text-slate-800 text-sm">إضافة حساب جديد في الشجرة المحاسبية</h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="p-5 space-y-3.5">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كود الحساب *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: 1106"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع الحساب *</label>
                  <select
                    value={newTypeId}
                    onChange={(e) => setNewTypeId(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="ASSET">أصول (Asset)</option>
                    <option value="LIABILITY">خصوم (Liability)</option>
                    <option value="EQUITY">حقوق ملكية (Equity)</option>
                    <option value="REVENUE">إيرادات (Revenue)</option>
                    <option value="EXPENSE">مصروفات (Expense)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الحساب بالعربية *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: حساب بنكي تجاري جديد"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الحساب الأب (Parent)</label>
                  <select
                    value={newParentId}
                    onChange={(e) => setNewParentId(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="">-- حساب رئيسي بدون أب --</option>
                    {accounts.filter(a => a.is_group).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">طبيعة الرصيد *</label>
                  <select
                    value={newNormalBalance}
                    onChange={(e) => setNewNormalBalance(e.target.value as any)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="DEBIT">مدين طبيعياً (DEBIT)</option>
                    <option value="CREDIT">دائن طبيعياً (CREDIT)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isGroup"
                  checked={newIsGroup}
                  onChange={(e) => setNewIsGroup(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <label htmlFor="isGroup" className="text-xs text-slate-700 font-medium">
                  حساب رئيسي/تجميعي (Group Account - يتفرع منه حسابات أخرى)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'جاري الإضافة...' : 'حفظ الحساب في الدليل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
