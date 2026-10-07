import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Layers, 
  Percent, 
  CheckCircle2, 
  Calendar, 
  Printer, 
  Scale,
  Sparkles
} from 'lucide-react';

export const AssetDepreciationPage: React.FC = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [reconReport, setReconReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [resCat, resRecon] = await Promise.all([
          fetch('/api/assets/categories'),
          fetch('/api/assets/reports/reconciliation')
        ]);
        if (resCat.ok) setCategories(await resCat.json());
        if (resRecon.ok) setReconReport(await resRecon.json());
      } catch (err) {
        console.error('Error fetching asset depreciation data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">مجموعات الأصول وجدول الإهلاك المحاسبي</h1>
            <p className="text-xs text-slate-500 font-medium">معدلات الإهلاك السنوية، العمر الإنتاجي، ومطابقة مجمع الإهلاك مع الأستاذ العام (GL 1202)</p>
          </div>
        </div>
      </div>

      {/* Reconciliation Card */}
      {reconReport && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Scale size={20} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">مطابقة الأصول مع الأستاذ العام</h3>
              <p className="text-xs text-slate-400">تطابق التكلفة التاريخية ومجمع الإهلاك مع حسابات GL 1201 و 1202</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-xs font-mono">
            <div>
              <span className="text-slate-400 font-sans">تكلفة الأصول: </span>
              <span className="font-bold text-blue-700">{parseFloat(reconReport.subledgerHistoricalCost || '0').toLocaleString()} YER</span>
            </div>
            <div>
              <span className="text-slate-400 font-sans">مجمع الإهلاك: </span>
              <span className="font-bold text-rose-700">{parseFloat(reconReport.subledgerAccDepr || '0').toLocaleString()} YER</span>
            </div>
            <div>
              <span className="text-slate-400 font-sans">صافي القيمة الدفترية: </span>
              <span className="font-black text-slate-900 bg-slate-100 px-2 py-1 rounded">
                {(parseFloat(reconReport.subledgerHistoricalCost || '0') - parseFloat(reconReport.subledgerAccDepr || '0')).toLocaleString()} YER
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Categories Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">مجموعات الأصول الثابتة ونسب الإهلاك</h2>
          <span className="text-xs text-slate-500 font-medium">عدد المجموعات: {categories.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">كود المجموعة</th>
                <th className="py-3 px-4">اسم المجموعة</th>
                <th className="py-3 px-4">طريقة الإهلاك</th>
                <th className="py-3 px-4 font-mono text-center">نسبة الإهلاك السنوية</th>
                <th className="py-3 px-4 font-mono text-center">العمر الإنتاجي</th>
                <th className="py-3 px-4 text-center">حساب الأصل</th>
                <th className="py-3 px-4 text-center">حساب المجمع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-700">{c.code}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{c.name}</td>
                  <td className="py-3 px-4 text-slate-600">القسط الثابت (Straight Line)</td>
                  <td className="py-3 px-4 font-mono text-center font-bold text-purple-700">
                    {parseFloat(c.depreciation_rate || '10')}%
                  </td>
                  <td className="py-3 px-4 font-mono text-center text-slate-600">
                    {c.useful_life_years || 10} سنوات
                  </td>
                  <td className="py-3 px-4 font-mono text-center text-slate-500">1201</td>
                  <td className="py-3 px-4 font-mono text-center text-slate-500">1202</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
