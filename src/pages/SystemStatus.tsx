import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Server, 
  CheckCircle2, 
  HardDrive, 
  Clock, 
  ShieldCheck, 
  Layers,
  Activity
} from 'lucide-react';

export const SystemStatusPage: React.FC = () => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/system/status');
        if (res.ok) {
          setStatus(await res.json());
        }
      } catch (err) {
        console.error('Error fetching system status:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, []);

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-slate-800 to-indigo-900 text-white flex items-center justify-center shadow-md shadow-slate-900/20">
            <Database size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">حالة النظام وقاعدة البيانات (System & Database Health)</h1>
            <p className="text-xs text-slate-500 font-medium">بيئة التشغيل، إحصائيات الجداول، وهجرات المخطط المالي (V1 إلى V12)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            قاعدة البيانات نشطة وجاهزة (Operational)
          </span>
        </div>
      </div>

      {/* KPI Stats */}
      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400">الحسابات المالية</span>
            <p className="text-xl font-black text-blue-600 font-mono mt-1">{status.stats?.accounts || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400">القيود اليومية</span>
            <p className="text-xl font-black text-indigo-600 font-mono mt-1">{status.stats?.journalEntries || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400">الأصناف المخزنية</span>
            <p className="text-xl font-black text-amber-600 font-mono mt-1">{status.stats?.items || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400">العملاء النشطين</span>
            <p className="text-xl font-black text-emerald-600 font-mono mt-1">{status.stats?.customers || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400">الموردين النشطين</span>
            <p className="text-xl font-black text-purple-600 font-mono mt-1">{status.stats?.suppliers || 0}</p>
          </div>
        </div>
      )}

      {/* Database Engine Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Server size={18} className="text-blue-600" />
          <span>محرك قواعد البيانات والتهيئة</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-100">
          <div>
            <span className="text-slate-400">المحرك:</span>
            <div className="font-bold text-slate-800 font-mono mt-0.5">{status?.engine || 'PostgreSQL Engine'}</div>
          </div>
          <div>
            <span className="text-slate-400">اسم قاعدة البيانات:</span>
            <div className="font-bold text-slate-800 font-mono mt-0.5">{status?.database || 'kayan_erp'}</div>
          </div>
          <div>
            <span className="text-slate-400">المنشأة المرتبطة:</span>
            <div className="font-bold text-slate-800 mt-0.5">{status?.company?.name || 'شركة كيان التجارية'}</div>
          </div>
        </div>
      </div>

      {/* Applied Migrations Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Layers size={16} className="text-indigo-600" />
            <span>سجل هجرات وتحديثات قاعدة البيانات (Applied Schema Migrations)</span>
          </h2>
          <span className="text-xs text-slate-500 font-mono font-bold">
            {status?.migrations?.length || 0} هجرة منفذة بنجاح
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">رقم الإصدار (Version)</th>
                <th className="py-2.5 px-4">تاريخ التطبيق</th>
                <th className="py-2.5 px-4 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {status?.migrations?.map((m: any) => (
                <tr key={m.version} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-mono font-bold text-blue-700">{m.version}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-500">
                    {m.applied_at ? new Date(m.applied_at).toLocaleString('ar-YE') : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      <CheckCircle2 size={11} /> مطبق بنجاح
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
