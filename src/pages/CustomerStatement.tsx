import React, { useState, useEffect } from 'react';
import { useLookup } from '../context/LookupContext';
import { 
  FileText, 
  Search, 
  Printer, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Users, 
  DollarSign, 
  AlertTriangle,
  Building,
  Phone,
  Calendar,
  Filter
} from 'lucide-react';

export const CustomerStatementPage: React.FC = () => {
  const { openLookup } = useLookup();
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [statement, setStatement] = useState<any>(null);
  const [arReport, setArReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStatement, setLoadingStatement] = useState(false);

  const handleOpenCustomerLookup = () => {
    openLookup('CUSTOMER', (selected) => {
      if (selected && selected.id) {
        setSelectedCustomerId(selected.id);
        setCustomers(prev => {
          if (!prev.some(c => c.id === selected.id)) {
            return [selected, ...prev];
          }
          return prev;
        });
      }
    });
  };

  useEffect(() => {
    const handleGlobalF9 = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        handleOpenCustomerLookup();
      }
    };
    window.addEventListener('keydown', handleGlobalF9);
    return () => window.removeEventListener('keydown', handleGlobalF9);
  }, []);

  useEffect(() => {
    const fetchInit = async () => {
      try {
        setLoading(true);
        const [resCust, resAr] = await Promise.all([
          fetch('/api/customers'),
          fetch('/api/reports/accounts-receivable')
        ]);
        if (resCust.ok) {
          const custList = await resCust.json();
          setCustomers(custList);
          if (custList.length > 0) {
            setSelectedCustomerId(custList[0].id);
          }
        }
        if (resAr.ok) {
          setArReport(await resAr.json());
        }
      } catch (err) {
        console.error('Error fetching customers/AR report:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchInit();
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) return;
    const fetchStatement = async () => {
      try {
        setLoadingStatement(true);
        const res = await fetch(`/api/reports/customer-statement/${selectedCustomerId}`);
        if (res.ok) {
          setStatement(await res.json());
        }
      } catch (err) {
        console.error('Error fetching customer statement:', err);
      } finally {
        setLoadingStatement(false);
      }
    };
    fetchStatement();
  }, [selectedCustomerId]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">كشف حساب العميل والذمم المدينة (AR)</h1>
            <p className="text-xs text-slate-500 font-medium">متابعة دقيقة لحركات فواتير وسندات العميل، والرصيد التراكمي، وأعمار الديون</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
          >
            <Printer size={16} />
            <span>طباعة كشف الحساب</span>
          </button>
        </div>
      </div>

      {/* AR Overview Metrics (print:hidden) */}
      {arReport && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>إجمالي الذمم المدينة للعملاء</span>
              <DollarSign size={16} className="text-blue-500" />
            </div>
            <p className="text-2xl font-black text-blue-600 mt-2 font-mono">
              {parseFloat(arReport.totalReceivables || '0').toLocaleString()} <span className="text-xs font-bold text-slate-400">YER</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">مطابق لرصيد حساب المراقبة 1103 في الأستاذ العام</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>عدد العملاء النشطين</span>
              <Users size={16} className="text-emerald-500" />
            </div>
            <p className="text-2xl font-black text-slate-800 mt-2 font-mono">
              {arReport.activeCount || customers.length}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">عملاء لديهم حسابات جارية وحركات بيع</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>رصيد العميل المختار</span>
              <Building size={16} className="text-amber-500" />
            </div>
            <p className="text-2xl font-black text-amber-600 mt-2 font-mono">
              {statement ? parseFloat(statement.finalBalance || '0').toLocaleString() : '0'} <span className="text-xs font-bold text-slate-400">YER</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">صافي الرصيد المستحق في ذمة العميل الحالي</p>
          </div>
        </div>
      )}

      {/* Customer Selector Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3 flex-1 max-w-lg">
          <label className="text-xs font-bold text-slate-700 whitespace-nowrap">اختر العميل:</label>
          <div className="flex items-center gap-2 flex-1">
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'F9') {
                  e.preventDefault();
                  handleOpenCustomerLookup();
                }
              }}
              className="w-full text-xs font-bold p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — ({c.code}) — الرصيد: {parseFloat(c.outstandingBalance || '0').toLocaleString()} YER
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleOpenCustomerLookup}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg border border-blue-200 transition cursor-pointer whitespace-nowrap shadow-xs"
              title="استعلام وبحث عن عميل (F9)"
            >
              <Search size={13} />
              <span>F9 استعلام</span>
            </button>
          </div>
        </div>

        {statement?.customer && (
          <div className="flex items-center gap-6 text-xs text-slate-600">
            <div>
              <span className="text-slate-400">الهاتف: </span>
              <span className="font-mono font-bold">{statement.customer.phone || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400">العنوان: </span>
              <span className="font-bold">{statement.customer.address || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400">سقف الائتمان: </span>
              <span className="font-mono font-bold text-rose-600">
                {parseFloat(statement.customer.credit_limit || '0').toLocaleString()} YER
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Printable Statement Sheet */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 print:border-none print:shadow-none print:p-0">
        {/* Statement Header */}
        <div className="border-b border-slate-200 pb-5 mb-5 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-slate-900 tracking-tight">KAYAN</span>
              <span className="text-xs font-bold text-slate-400 uppercase">Accounting ERP</span>
            </div>
            <h2 className="text-lg font-black text-slate-800 mt-2">كشف حساب عميل مفصل (Detailed Customer Statement)</h2>
            <p className="text-xs text-slate-500 mt-0.5">الفترة: من بداية التعامل وحتى تاريخ اليوم {new Date().toLocaleDateString('ar-YE')}</p>
          </div>

          {statement?.customer && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs space-y-1 min-w-[240px]">
              <div className="font-bold text-sm text-slate-900">{statement.customer.name}</div>
              <div className="text-slate-500 font-mono">كود العميل: {statement.customer.code}</div>
              <div className="text-slate-500 font-mono">الرقم الضريبي: {statement.customer.tax_number || '—'}</div>
              <div className="text-slate-500">حساب المراقبة: 1103 (ذمم العملاء المدينة)</div>
            </div>
          )}
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">التاريخ</th>
                <th className="py-2.5 px-3">نوع الحركة</th>
                <th className="py-2.5 px-3">رقم المستند</th>
                <th className="py-2.5 px-3">البيان والتفاصيل</th>
                <th className="py-2.5 px-3 font-mono text-left">مدين (فواتير)</th>
                <th className="py-2.5 px-3 font-mono text-left">دائن (سداد/قبض)</th>
                <th className="py-2.5 px-3 font-mono text-left">الرصيد التراكمي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingStatement ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    جاري تحميل حركات كشف الحساب...
                  </td>
                </tr>
              ) : !statement || statement.items?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    لا توجد حركات مسجلة لهذا العميل حتى الآن.
                  </td>
                </tr>
              ) : (
                statement.items.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition">
                    <td className="py-2.5 px-3 font-mono text-slate-500">
                      {item.docDate ? new Date(item.docDate).toLocaleDateString('ar-YE') : '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center gap-1 font-semibold ${
                        item.debit > 0 ? 'text-blue-700' : 'text-emerald-700'
                      }`}>
                        {item.debit > 0 ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
                        {item.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                      {item.docNumber}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                      {item.description}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-left font-bold text-slate-800">
                      {item.debit > 0 ? item.debit.toLocaleString() : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-left font-bold text-emerald-700">
                      {item.credit > 0 ? item.credit.toLocaleString() : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-left font-black text-slate-900 bg-slate-50/50">
                      {item.runningBalance.toLocaleString()} YER
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {statement && (
              <tfoot className="border-t-2 border-slate-300 font-bold bg-slate-50 text-slate-800">
                <tr>
                  <td colSpan={4} className="py-3 px-3 text-right">
                    إجمالي الحركات والرصيد النهائي المستحق:
                  </td>
                  <td className="py-3 px-3 font-mono text-left text-blue-700">
                    {parseFloat(statement.totalDebit || '0').toLocaleString()}
                  </td>
                  <td className="py-3 px-3 font-mono text-left text-emerald-700">
                    {parseFloat(statement.totalCredit || '0').toLocaleString()}
                  </td>
                  <td className="py-3 px-3 font-mono text-left text-base font-black text-amber-700">
                    {parseFloat(statement.finalBalance || '0').toLocaleString()} YER
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
