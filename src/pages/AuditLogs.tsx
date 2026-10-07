import React, { useState, useEffect } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  ShieldAlert, 
  User, 
  Clock,
  Layers
} from 'lucide-react';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/audit-logs?limit=100');
        if (res.ok) {
          setLogs(await res.json());
        }
      } catch (err) {
        console.error('Error fetching audit logs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(l => 
    l.action?.toLowerCase().includes(search.toLowerCase()) ||
    l.entity_type?.toLowerCase().includes(search.toLowerCase()) ||
    l.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-slate-700 to-slate-900 text-white flex items-center justify-center shadow-md shadow-slate-700/20">
            <History size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">سجل التدقيق والنشاط (Audit Trail & Activity Log)</h1>
            <p className="text-xs text-slate-500 font-medium">سجل رقابي غير قابل للتعديل يوثق جميع العمليات، المستخدمين، التعديلات وحركات الترحيل</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between gap-4 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="بحث بالإجراء، نوع الكيان، أو اسم المستخدم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-semibold font-mono">
          إجمالي السجلات: {logs.length}
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">التاريخ والوقت</th>
                <th className="py-3 px-4">المستخدم</th>
                <th className="py-3 px-4">نوع العملية (Action)</th>
                <th className="py-3 px-4">الوحدة / الكيان</th>
                <th className="py-3 px-4">تفاصيل الحركة والبيانات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    جاري استدعاء سجل التدقيق...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    لا توجد سجلات مطابقة
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono text-slate-500 text-[11px]">
                      {log.created_at ? new Date(log.created_at).toLocaleString('ar-YE') : '—'}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-800">
                      {log.username || 'النظام (SYSTEM)'}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-blue-700">
                      {log.entity_type}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 font-mono text-[11px] max-w-md truncate">
                      {log.new_data ? JSON.stringify(log.new_data) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
