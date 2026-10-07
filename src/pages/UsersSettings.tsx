import React, { useState, useEffect } from 'react';
import { 
  Users, 
  ShieldCheck, 
  UserCheck, 
  Key, 
  Clock, 
  CheckCircle2, 
  Search,
  Lock
} from 'lucide-react';

export const UsersSettingsPage: React.FC = () => {
  const [data, setData] = useState<{ users: any[]; roles: any[] }>({ users: [], roles: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/settings/users');
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error('Error fetching users:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const filteredUsers = data.users.filter(u =>
    u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-blue-700 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-blue-700/20">
            <Users size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">إدارة المستخدمين والأدوار والصلاحيات (RBAC)</h1>
            <p className="text-xs text-slate-500 font-medium">حسابات مستخدمي النظام، تعيين الأدوار الوظيفية، وسجل تسجيلات الدخول</p>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-800">قائمة المستخدمين المعتمدين</h2>
          <div className="relative w-64">
            <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="بحث بالاسم أو اسم الدخول..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-8 pl-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">اسم المستخدم</th>
                <th className="py-3 px-4">الاسم الكامل</th>
                <th className="py-3 px-4">البريد الإلكتروني</th>
                <th className="py-3 px-4">الدور الوظيفي (Role)</th>
                <th className="py-3 px-4 font-mono">آخر دخول</th>
                <th className="py-3 px-4 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    جاري تحميل المستخدمين...
                  </td>
                </tr>
              ) : filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono font-bold text-blue-700">
                    @{u.username}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-800">
                    {u.fullName}
                  </td>
                  <td className="py-3 px-4 text-slate-600 font-mono">
                    {u.email}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      <ShieldCheck size={12} />
                      {u.roleName}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ar-YE') : '—'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <CheckCircle2 size={11} /> نشط
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
