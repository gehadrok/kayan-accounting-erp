import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  DollarSign, 
  AlertCircle,
  Plus,
  Layers
} from 'lucide-react';

export const ExpenseAccrualsPage: React.FC = () => {
  const [accruals, setAccruals] = useState<any[]>([]);
  const [prepaid, setPrepaid] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'accruals' | 'prepaid'>('accruals');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [resAcc, resPrep] = await Promise.all([
          fetch('/api/expenses/accruals'),
          fetch('/api/expenses/prepaid')
        ]);
        if (resAcc.ok) setAccruals(await resAcc.json());
        if (resPrep.ok) setPrepaid(await resPrep.json());
      } catch (err) {
        console.error('Error fetching accruals & prepaid:', err);
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
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-amber-600 to-rose-600 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
            <Clock size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">المصروفات المستحقة والمدفوعة مقدماً</h1>
            <p className="text-xs text-slate-500 font-medium">مبدأ الاستحقاق المحاسبي: إثبات مستحقات نهاية الشهر، وجداول استهلاك الإيجارات والتأمينات المقدمة</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('accruals')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
            activeTab === 'accruals'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Clock size={15} />
          <span>المصروفات المستحقة (Accruals) ({accruals.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('prepaid')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
            activeTab === 'prepaid'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calendar size={15} />
          <span>المصروفات المقدمة والإطفاء (Prepaid) ({prepaid.length})</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'accruals' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">رقم المستحق</th>
                  <th className="py-3 px-4">البيان</th>
                  <th className="py-3 px-4 font-mono">تاريخ الاستحقاق</th>
                  <th className="py-3 px-4 font-mono text-left">المبلغ</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accruals.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      لا توجد استحقاقات مسجلة حالياً
                    </td>
                  </tr>
                ) : (
                  accruals.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-amber-700">{a.accrual_number || a.id}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{a.description}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">{a.accrual_date || '—'}</td>
                      <td className="py-3 px-4 font-mono text-left font-bold text-slate-900">
                        {parseFloat(a.amount || '0').toLocaleString()} YER
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          {a.status || 'مستحق'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'prepaid' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">رقم الجدول</th>
                  <th className="py-3 px-4">البيان</th>
                  <th className="py-3 px-4 font-mono text-left">إجمالي المبلغ المدفوع</th>
                  <th className="py-3 px-4 font-mono text-center">عدد الأقساط</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prepaid.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      لا توجد مصروفات مدفوعة مقدماً مسجلة
                    </td>
                  </tr>
                ) : (
                  prepaid.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-rose-700">{p.schedule_number || p.id}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{p.description}</td>
                      <td className="py-3 px-4 font-mono text-left font-bold text-slate-900">
                        {parseFloat(p.total_amount || '0').toLocaleString()} YER
                      </td>
                      <td className="py-3 px-4 font-mono text-center text-slate-600">{p.total_periods || 12} شهر</td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          نشط قيد الاستهلاك
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
