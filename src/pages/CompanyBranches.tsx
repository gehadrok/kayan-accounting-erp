import React, { useState, useEffect } from 'react';
import { 
  GitFork, 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  CheckCircle2, 
  DollarSign
} from 'lucide-react';

export const CompanyBranchesPage: React.FC = () => {
  const [data, setData] = useState<{ company: any; branches: any[] }>({ company: null, branches: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/settings/branches');
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error('Error fetching company branches:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBranches();
  }, []);

  const { company, branches } = data;

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-cyan-600 to-blue-700 text-white flex items-center justify-center shadow-md shadow-cyan-500/20">
            <GitFork size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">بيانات المنشأة والفروع ومراكز التكلفة</h1>
            <p className="text-xs text-slate-500 font-medium">الهيكل التنظيمي للمنشأة، العملة الأساسية، الفروع الإدارية ونقاط البيع</p>
          </div>
        </div>
      </div>

      {/* Company Profile Card */}
      {company && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black">
                K
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">{company.name}</h2>
                <p className="text-xs text-slate-400 font-medium">{company.legal_name || 'الاسم القانوني للمنشأة'}</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-lg border border-slate-200">
              الرقم الضريبي: {company.tax_number || 'TR-7711990'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <MapPin size={16} className="text-slate-400 shrink-0" />
              <span>{company.address || 'اليمن - الضالع / صنعاء'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Phone size={16} className="text-slate-400 shrink-0" />
              <span className="font-mono">{company.phone || '+967-770000000'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Mail size={16} className="text-slate-400 shrink-0" />
              <span className="font-mono">{company.email || 'info@kayan-erp.com'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Branches List */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-800">فروع المنشأة المعتمدة ({branches.length})</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((b) => (
            <div key={b.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {b.code}
                  </span>
                  <h4 className="font-bold text-sm text-slate-800 mt-2">{b.name}</h4>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 size={11} /> نشط
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <MapPin size={14} className="text-slate-400 shrink-0" />
                <span>{b.address || 'العنوان غير محدد'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
