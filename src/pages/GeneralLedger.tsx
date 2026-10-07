import React, { useState, useEffect } from 'react';
import { 
  BookMarked, 
  Search, 
  Printer, 
  Filter, 
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownLeft
} from 'lucide-react';

export const GeneralLedgerPage: React.FC = () => {
  const [report, setReport] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await fetch('/api/accounts');
        if (res.ok) {
          setAccounts(await res.json());
        }
      } catch (err) {
        console.error('Error fetching accounts:', err);
      }
    };
    fetchAccounts();
  }, []);

  const fetchLedger = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedAccountId) params.append('accountId', selectedAccountId);
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);

      const res = await fetch(`/api/reports/general-ledger?${params.toString()}`);
      if (res.ok) {
        setReport(await res.json());
      }
    } catch (err) {
      console.error('Error fetching general ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [selectedAccountId, fromDate, toDate]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-indigo-700 to-blue-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
            <BookMarked size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">الأستاذ العام التفصيلي (General Ledger)</h1>
            <p className="text-xs text-slate-500 font-medium">دفتر الأستاذ العام المعتمد لجميع الحسابات، الرصيد الافتتاحي، والحركات المرحلة</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
          >
            <Printer size={16} />
            <span>طباعة الأستاذ العام</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 flex flex-wrap items-center gap-4 print:hidden">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-bold text-slate-500 mb-1">تصفية بحساب معين:</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full text-xs font-semibold p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="">-- جميع الحسابات (شامل) --</option>
            {accounts.filter(a => !a.is_group).map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-36">
          <label className="block text-[11px] font-bold text-slate-500 mb-1">من تاريخ:</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono"
          />
        </div>

        <div className="w-36">
          <label className="block text-[11px] font-bold text-slate-500 mb-1">إلى تاريخ:</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono"
          />
        </div>
      </div>

      {/* Ledger Accounts Cards / Sections */}
      {loading ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400">
          جاري استخراج دفتر الأستاذ العام وحساب الأرصدة...
        </div>
      ) : !report?.accounts || report.accounts.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400">
          لا توجد حركات مرحلة للأستاذ العام خلال الفترة المحددة
        </div>
      ) : (
        <div className="space-y-4">
          {report.accounts.map((acc: any) => (
            <div key={acc.accountCode} className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="p-4 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-blue-700 text-sm bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                    {acc.accountCode}
                  </span>
                  <span className="font-bold text-slate-800 text-sm">{acc.accountName}</span>
                </div>
                <div className="flex items-center gap-6 text-xs font-mono">
                  <div>
                    <span className="text-slate-400">الرصيد الافتتاحي: </span>
                    <span className="font-bold text-slate-700">{parseFloat(acc.openingBalance || '0').toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">حركات المدين: </span>
                    <span className="font-bold text-blue-700">{parseFloat(acc.totalDebit || '0').toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">حركات الدائن: </span>
                    <span className="font-bold text-emerald-700">{parseFloat(acc.totalCredit || '0').toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">الرصيد الختامي: </span>
                    <span className="font-black text-slate-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      {parseFloat(acc.closingBalance || '0').toLocaleString()} YER
                    </span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-white text-slate-400 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="py-2.5 px-4">التاريخ</th>
                      <th className="py-2.5 px-4">رقم القيد</th>
                      <th className="py-2.5 px-4">البيان والشرح</th>
                      <th className="py-2.5 px-4 font-mono text-left">مدين</th>
                      <th className="py-2.5 px-4 font-mono text-left">دائن</th>
                      <th className="py-2.5 px-4 font-mono text-left">الرصيد الجاري</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {acc.entries?.map((e: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {e.entryDate ? new Date(e.entryDate).toLocaleDateString('ar-YE') : '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-blue-600">
                          {e.entryNumber}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">
                          {e.description}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-left font-bold text-slate-900">
                          {e.debit > 0 ? e.debit.toLocaleString() : '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-left font-bold text-slate-900">
                          {e.credit > 0 ? e.credit.toLocaleString() : '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-left font-black text-slate-900 bg-slate-50/40">
                          {e.runningBalance.toLocaleString()} YER
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
