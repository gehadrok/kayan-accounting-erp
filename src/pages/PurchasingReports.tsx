import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Printer, 
  Users, 
  DollarSign, 
  Building,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  AlertTriangle,
  Scale
} from 'lucide-react';

export const PurchasingReportsPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [statement, setStatement] = useState<any>(null);
  const [apAging, setApAging] = useState<any>(null);
  const [apReconciliation, setApReconciliation] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'statement' | 'aging' | 'reconciliation'>('statement');
  const [loading, setLoading] = useState(true);
  const [loadingStatement, setLoadingStatement] = useState(false);

  useEffect(() => {
    const fetchInit = async () => {
      try {
        setLoading(true);
        const [resSupp, resAging, resRecon] = await Promise.all([
          fetch('/api/suppliers'),
          fetch('/api/reports/accounts-payable-aging'),
          fetch('/api/reports/ap-reconciliation')
        ]);
        if (resSupp.ok) {
          const suppList = await resSupp.json();
          setSuppliers(suppList);
          if (suppList.length > 0) {
            setSelectedSupplierId(suppList[0].id);
          }
        }
        if (resAging.ok) {
          setApAging(await resAging.json());
        }
        if (resRecon.ok) {
          setApReconciliation(await resRecon.json());
        }
      } catch (err) {
        console.error('Error fetching purchasing reports:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchInit();
  }, []);

  useEffect(() => {
    if (!selectedSupplierId) return;
    const fetchStatement = async () => {
      try {
        setLoadingStatement(true);
        const res = await fetch(`/api/reports/supplier-statement/${selectedSupplierId}`);
        if (res.ok) {
          setStatement(await res.json());
        }
      } catch (err) {
        console.error('Error fetching supplier statement:', err);
      } finally {
        setLoadingStatement(false);
      }
    };
    fetchStatement();
  }, [selectedSupplierId]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">تقارير المشتريات والذمم الدائنة (AP)</h1>
            <p className="text-xs text-slate-500 font-medium">كشوف حسابات الموردين، تقادم الديون (AP Aging)، ومطابقة رصيد الأستاذ العام</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
          >
            <Printer size={16} />
            <span>طباعة التقرير</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2 print:hidden">
        <button
          onClick={() => setActiveTab('statement')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
            activeTab === 'statement'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          كشف حساب مورد تفصيلي
        </button>
        <button
          onClick={() => setActiveTab('aging')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
            activeTab === 'aging'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          أعمار ديون الموردين (AP Aging)
        </button>
        <button
          onClick={() => setActiveTab('reconciliation')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
            activeTab === 'reconciliation'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          مطابقة الذمم مع الأستاذ العام (2101)
        </button>
      </div>

      {activeTab === 'statement' && (
        <div className="space-y-4">
          {/* Supplier Selector */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-4 print:hidden">
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <label className="text-xs font-bold text-slate-700 whitespace-nowrap">اختر المورد:</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full text-xs font-bold p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — ({s.code}) — الرصيد: {parseFloat(s.outstandingBalance || '0').toLocaleString()} YER
                  </option>
                ))}
              </select>
            </div>

            {statement?.supplier && (
              <div className="flex items-center gap-6 text-xs text-slate-600">
                <div>
                  <span className="text-slate-400">الهاتف: </span>
                  <span className="font-mono font-bold">{statement.supplier.phone || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400">العنوان: </span>
                  <span className="font-bold">{statement.supplier.address || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400">الرصيد المستحق للمورد: </span>
                  <span className="font-mono font-black text-rose-600 text-sm">
                    {parseFloat(statement.finalBalance || '0').toLocaleString()} YER
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Detailed Statement Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 print:border-none print:shadow-none print:p-0">
            <div className="border-b border-slate-200 pb-4 mb-4 flex justify-between items-start">
              <div>
                <h2 className="text-base font-black text-slate-800">كشف حساب مورد معتمد (Supplier Subledger Statement)</h2>
                <p className="text-xs text-slate-500">حركات الفواتير (دائن تزيد المديونية) وسندات الصرف (مدين تسدد المديونية)</p>
              </div>
              {statement?.supplier && (
                <div className="text-left font-mono text-xs text-slate-500">
                  <div className="font-bold text-slate-800">{statement.supplier.name}</div>
                  <div>كود المورد: {statement.supplier.code}</div>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">التاريخ</th>
                    <th className="py-2.5 px-3">نوع الحركة</th>
                    <th className="py-2.5 px-3">رقم المستند</th>
                    <th className="py-2.5 px-3">البيان</th>
                    <th className="py-2.5 px-3 font-mono text-left">مدين (سندات صرف)</th>
                    <th className="py-2.5 px-3 font-mono text-left">دائن (فواتير شراء)</th>
                    <th className="py-2.5 px-3 font-mono text-left">الرصيد التراكمي للمورد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingStatement ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        جاري تحميل الحركات...
                      </td>
                    </tr>
                  ) : !statement || statement.items?.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        لا توجد حركات مسجلة لهذا المورد حتى الآن
                      </td>
                    </tr>
                  ) : (
                    statement.items.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-3 font-mono text-slate-500">
                          {item.docDate ? new Date(item.docDate).toLocaleDateString('ar-YE') : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-700">
                          {item.type}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                          {item.docNumber}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                          {item.description}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-left font-bold text-emerald-700">
                          {item.debit > 0 ? item.debit.toLocaleString() : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-left font-bold text-rose-700">
                          {item.credit > 0 ? item.credit.toLocaleString() : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-left font-black text-slate-900 bg-slate-50/50">
                          {item.runningBalance.toLocaleString()} YER
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'aging' && apAging && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-black text-slate-800">تقرير تقادم ديون الموردين (AP Aging Summary)</h2>
              <p className="text-xs text-slate-500">توزيع فواتير الشراء غير المسددة حسب فترات الاستحقاق</p>
            </div>
            <div className="text-xs font-bold font-mono text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              إجمالي الالتزامات: {parseFloat(apAging.totalPayables || '0').toLocaleString()} YER
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">المورد</th>
                  <th className="py-2.5 px-3 font-mono text-left">الحالي (0-30 يوم)</th>
                  <th className="py-2.5 px-3 font-mono text-left">31 - 60 يوم</th>
                  <th className="py-2.5 px-3 font-mono text-left">61 - 90 يوم</th>
                  <th className="py-2.5 px-3 font-mono text-left">أكثر من 90 يوم</th>
                  <th className="py-2.5 px-3 font-mono text-left font-black">الإجمالي المستحق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {apAging.suppliers?.map((s: any) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-bold text-slate-800">
                      {s.name} <span className="text-[10px] text-slate-400 font-mono">({s.code})</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-left text-slate-700">
                      {parseFloat(s.current || '0').toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-left text-slate-700">
                      {parseFloat(s.days31to60 || '0').toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-left text-amber-700 font-semibold">
                      {parseFloat(s.days61to90 || '0').toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-left text-rose-700 font-bold">
                      {parseFloat(s.over90 || '0').toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-left font-black text-slate-900 bg-slate-50/50">
                      {parseFloat(s.totalDue || '0').toLocaleString()} YER
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'reconciliation' && apReconciliation && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-800">مطابقة دفتر أستاذ المساعد للموردين مع الأستاذ العام</h2>
              <p className="text-xs text-slate-500">التحقق الصارم من تطابق مجموع أرصدة الموردين مع حساب المراقبة GL 2101</p>
            </div>
            <div className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 ${
              apReconciliation.isReconciled 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              <Scale size={16} />
              <span>{apReconciliation.isReconciled ? 'متطابق بنسبة 100% (Reconciled)' : 'يوجد فارق غير مطابق'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 font-medium">مجموع أرصدة الموردين (Subledger)</span>
              <p className="text-xl font-black text-slate-800 font-mono mt-1">
                {parseFloat(apReconciliation.subledgerTotal || '0').toLocaleString()} YER
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 font-medium">رصيد حساب المراقبة بالأستاذ العام (GL 2101)</span>
              <p className="text-xl font-black text-blue-700 font-mono mt-1">
                {parseFloat(apReconciliation.glBalance || '0').toLocaleString()} YER
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 font-medium">الفارق (Variance)</span>
              <p className="text-xl font-black text-emerald-600 font-mono mt-1">
                {parseFloat(apReconciliation.variance || '0').toLocaleString()} YER
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
