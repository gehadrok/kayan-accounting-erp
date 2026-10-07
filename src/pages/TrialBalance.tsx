import React, { useState, useEffect } from 'react';
import { 
  Scale, 
  Search, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  Filter,
  Layers
} from 'lucide-react';

export const TrialBalancePage: React.FC = () => {
  const [tb, setTb] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState<number>(0);

  useEffect(() => {
    const fetchTrialBalance = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/reports/trial-balance');
        if (res.ok) {
          const data = await res.json();
          setTb(data);
        }
      } catch (err) {
        console.error('Error fetching trial balance:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTrialBalance();
  }, []);

  const accounts = tb?.accounts || [];
  const filteredAccounts = accounts.filter((a: any) => {
    const matchesSearch = 
      a.accountName?.toLowerCase().includes(search.toLowerCase()) || 
      a.accountCode?.includes(search);
    const matchesLevel = filterLevel === 0 || a.level === filterLevel;
    return matchesSearch && matchesLevel;
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-cyan-600 to-blue-700 text-white flex items-center justify-center shadow-md shadow-cyan-500/20">
            <Scale size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">ميزان المراجعة بالأرصدة والمجاميع (Trial Balance)</h1>
            <p className="text-xs text-slate-500 font-medium">التحقق الصارم من توازن القيود، سلامة الأستاذ العام، وصحة الترحيل المالي</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
          >
            <Printer size={16} />
            <span>طباعة ميزان المراجعة</span>
          </button>
        </div>
      </div>

      {/* Balance Verification Banner */}
      {tb && (
        <div className={`p-4 rounded-xl border flex items-center justify-between shadow-xs ${
          tb.isBalanced 
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' 
            : 'bg-rose-50/80 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center gap-3">
            {tb.isBalanced ? (
              <CheckCircle2 size={24} className="text-emerald-600" />
            ) : (
              <AlertCircle size={24} className="text-rose-600" />
            )}
            <div>
              <p className="font-extrabold text-sm">
                {tb.isBalanced ? 'ميزان المراجعة متوازن تماماً بنسبة 100%' : 'تحذير: يوجد عدم توازن في ميزان المراجعة!'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                إجمالي المدين يطابق إجمالي الدائن بدقة متناهية (Zero Variance)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 font-mono text-xs">
            <div>
              <span className="text-slate-500 font-sans">إجمالي المدين: </span>
              <span className="font-black text-blue-700 text-sm">
                {parseFloat(tb.totalDebit || '0').toLocaleString()} YER
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-sans">إجمالي الدائن: </span>
              <span className="font-black text-emerald-700 text-sm">
                {parseFloat(tb.totalCredit || '0').toLocaleString()} YER
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs print:hidden">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="بحث برقم الحساب أو الاسم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500 font-bold ml-1">تصفية المستوى:</span>
          {[0, 1, 2, 3, 4, 5].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-2.5 py-1 rounded-lg font-mono font-bold transition cursor-pointer ${
                filterLevel === lvl
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {lvl === 0 ? 'الكل' : `مستوى ${lvl}`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">رقم الحساب</th>
                <th className="py-3 px-4">اسم الحساب</th>
                <th className="py-3 px-4 text-center">المستوى</th>
                <th className="py-3 px-4 font-mono text-left">مدين (Debit)</th>
                <th className="py-3 px-4 font-mono text-left">دائن (Credit)</th>
                <th className="py-3 px-4 font-mono text-left">الرصيد الصافي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    جاري احتساب ميزان المراجعة...
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    لا توجد حسابات مطابقة لمعايير البحث
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc: any) => {
                  const debit = parseFloat(acc.debit || '0');
                  const credit = parseFloat(acc.credit || '0');
                  const balance = parseFloat(acc.balance || '0');

                  return (
                    <tr key={acc.accountCode} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                        {acc.accountCode}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        {acc.accountName}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="font-mono text-slate-400 text-[10px]">
                          {acc.level || 1}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-left font-bold text-blue-700">
                        {debit > 0 ? debit.toLocaleString() : '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-left font-bold text-emerald-700">
                        {credit > 0 ? credit.toLocaleString() : '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-left font-black text-slate-900 bg-slate-50/30">
                        {balance.toLocaleString()} YER
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {tb && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-800">
                <tr>
                  <td colSpan={3} className="py-3 px-4 text-right">
                    إجمالي ميزان المراجعة:
                  </td>
                  <td className="py-3 px-4 font-mono text-left text-blue-700 text-sm">
                    {parseFloat(tb.totalDebit || '0').toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-mono text-left text-emerald-700 text-sm">
                    {parseFloat(tb.totalCredit || '0').toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-mono text-left text-sm text-slate-900">
                    {parseFloat(tb.totalDebit || '0').toLocaleString()} YER
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
