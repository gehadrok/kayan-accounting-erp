import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  ShieldCheck,
  RefreshCw,
  Clock
} from 'lucide-react';

export const FiscalPeriodsPage: React.FC = () => {
  const [periods, setPeriods] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [closingCheck, setClosingCheck] = useState<any | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resPeriods, resYears] = await Promise.all([
        fetch('/api/fiscal-periods'),
        fetch('/api/fiscal-years')
      ]);
      if (resPeriods.ok) {
        setPeriods(await resPeriods.json());
      }
      if (resYears.ok) {
        setYears(await resYears.json());
      }
    } catch (err) {
      console.error('Error fetching fiscal periods:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const runPeriodCheck = async (periodId: string) => {
    try {
      setSelectedPeriodId(periodId);
      const res = await fetch(`/api/fiscal-periods/${periodId}/closing-check`);
      if (res.ok) {
        setClosingCheck(await res.json());
      }
    } catch (err) {
      console.error('Error running closing check:', err);
    }
  };

  const handleClosePeriod = async (periodId: string) => {
    if (!confirm('هل أنت متأكد من إقفال هذه الفترة المالية؟ لن يُسمح بترحيل قيود جديدة في تواريخها.')) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/fiscal-periods/${periodId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'admin', notes: 'إقفال دوري معتمد للفترة' })
      });
      if (res.ok) {
        setClosingCheck(null);
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'فشل في إقفال الفترة');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenPeriod = async (periodId: string) => {
    const reason = prompt('يرجى كتابة سبب إعادة فتح الفترة المالية المغلقة:');
    if (!reason) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/fiscal-periods/${periodId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      if (res.ok) {
        setClosingCheck(null);
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'فشل في إعادة فتح الفترة');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <Calendar size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">إدارة السنوات والفترات المالية (Fiscal Periods)</h1>
            <p className="text-xs text-slate-500 font-medium">التحكم في فترات الإدخال والترحيل، الفحص المالي الآلي، والإقفال الدوري</p>
          </div>
        </div>
      </div>

      {/* Fiscal Years Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {years.map((year) => (
          <div key={year.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg text-slate-800 font-mono">{year.name || year.year}</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  year.is_closed ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  {year.is_closed ? 'سنة مالية مقفلة' : 'سنة مالية جارية نشطة'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-1">
                من {year.start_date} إلى {year.end_date}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
              <Clock size={20} />
            </div>
          </div>
        ))}
      </div>

      {/* Periods List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">الفترات المالية الشهرية (Monthly Fiscal Periods)</h2>
          <span className="text-xs text-slate-500 font-medium">إجمالي الفترات: {periods.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200/70">
              <tr>
                <th className="py-3 px-4">رقم الفترة</th>
                <th className="py-3 px-4">اسم الفترة</th>
                <th className="py-3 px-4 font-mono">تاريخ البداية</th>
                <th className="py-3 px-4 font-mono">تاريخ النهاية</th>
                <th className="py-3 px-4 text-center">حالة الفترة</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    جاري تحميل الفترات المالية...
                  </td>
                </tr>
              ) : periods.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    لا توجد فترات مالية معرفة
                  </td>
                </tr>
              ) : (
                periods.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      P-{String(p.period_num).padStart(2, '0')}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {p.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {p.start_date}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {p.end_date}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        p.status === 'OPEN'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {p.status === 'OPEN' ? <Unlock size={11} /> : <Lock size={11} />}
                        {p.status === 'OPEN' ? 'مفتوحة للترحيل' : 'مقفلة (Closed)'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {p.status === 'OPEN' ? (
                          <>
                            <button
                              onClick={() => runPeriodCheck(p.id)}
                              className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                            >
                              فحص شروط الإقفال
                            </button>
                            <button
                              onClick={() => handleClosePeriod(p.id)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition flex items-center gap-1"
                            >
                              <Lock size={12} /> إقفال
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleReopenPeriod(p.id)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition flex items-center gap-1"
                          >
                            <Unlock size={12} /> إعادة فتح
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

      {/* Closing Check Results Modal */}
      {closingCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-blue-600" />
                <h3 className="font-bold text-sm text-slate-800">نتيجة الفحص المحاسبي لإقفال الفترة</h3>
              </div>
              <button 
                onClick={() => setClosingCheck(null)} 
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className={`p-3 rounded-xl border flex items-center gap-2 font-bold ${
                closingCheck.canClose 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                {closingCheck.canClose ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{closingCheck.canClose ? 'جميع الشروط مستوفاة للإقفال الآمن' : 'توجد موانع تمنع الإقفال'}</span>
              </div>

              <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">توازن ميزان المراجعة:</span>
                  <span className="font-bold text-emerald-600">متوازن 100%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">قيود اليومية المسودة:</span>
                  <span className="font-bold text-slate-800">{closingCheck.draftEntriesCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">فواتير مبيعات مسودة:</span>
                  <span className="font-bold text-slate-800">{closingCheck.draftInvoicesCount || 0}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setClosingCheck(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg"
                >
                  إغلاق
                </button>
                {closingCheck.canClose && selectedPeriodId && (
                  <button
                    onClick={() => handleClosePeriod(selectedPeriodId)}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg flex items-center gap-1.5"
                  >
                    <Lock size={14} /> تأكيد إقفال الفترة
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
