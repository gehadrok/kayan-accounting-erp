import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Scale, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Printer,
  Layers,
  ArrowRight
} from 'lucide-react';

export const FinancialIntegrityPage: React.FC = () => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchIntegrity = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/reports/reconciliation');
      if (res.ok) {
        setReport(await res.json());
      }
    } catch (err) {
      console.error('Error fetching financial integrity report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrity();
  }, []);

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">التكامل المالي ومطابقة الدفاتر المساعدة (Subledger Reconciliation)</h1>
            <p className="text-xs text-slate-500 font-medium">فحص فوري وتلقائي لمطابقة الخزينة، البنوك، العملاء، الموردين، المخزون، والأصول مع الأستاذ العام</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchIntegrity}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
          >
            <RefreshCw size={15} />
            <span>إعادة الفحص المالي الآن</span>
          </button>
        </div>
      </div>

      {/* Global Status Banner */}
      {report && (
        <div className={`p-4 rounded-xl border flex items-center justify-between shadow-xs ${
          report.overallStatus === 'RECONCILED'
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
            : 'bg-rose-50/80 border-rose-200 text-rose-950'
        }`}>
          <div className="flex items-center gap-3">
            {report.overallStatus === 'RECONCILED' ? (
              <CheckCircle2 size={24} className="text-emerald-600" />
            ) : (
              <AlertCircle size={24} className="text-rose-600" />
            )}
            <div>
              <p className="font-extrabold text-sm">
                {report.overallStatus === 'RECONCILED'
                  ? 'النظام المحاسبي في حالة تكامل تام 100% (Fully Reconciled)'
                  : 'تحذير: توجد فروقات بين الدفاتر المساعدة والأستاذ العام!'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">
                تاريخ الفحص: {report.asOfDate} | إجمالي الفارق المالي العام: {parseFloat(report.totalDiscrepancy || '0').toLocaleString()} YER
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            جاري فحص جميع الدفاتر المساعدة ومطابقتها مع الأستاذ العام...
          </div>
        ) : (
          report?.modules?.map((m: any) => (
            <div key={m.module} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {m.glAccountCode}
                  </span>
                  <h3 className="font-bold text-sm text-slate-800 mt-1">{m.moduleName}</h3>
                </div>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  m.status === 'RECONCILED'
                    ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                    : 'text-rose-700 bg-rose-50 border border-rose-200'
                }`}>
                  {m.status === 'RECONCILED' ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                  {m.status === 'RECONCILED' ? 'مطابق 100%' : 'غير مطابق'}
                </span>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">رصيد الدفتر المساعد:</span>
                  <span className="font-bold text-slate-800">{parseFloat(m.subledgerTotal || '0').toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">رصيد الأستاذ العام (GL):</span>
                  <span className="font-bold text-blue-700">{parseFloat(m.glBalance || '0').toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-50 font-bold">
                  <span className="text-slate-400 font-sans">الفارق (Variance):</span>
                  <span className={m.variance === 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {parseFloat(m.variance || '0').toLocaleString()} YER
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
