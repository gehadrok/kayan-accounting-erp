import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
  FileCheck,
  TrendingDown,
  TrendingUp,
  Coins,
  History,
  Printer,
  Calendar,
  DollarSign
} from 'lucide-react';

interface CashAccount {
  id: string;
  name: string;
  code: string;
  currentBalance: number;
}

interface DenominationRow {
  denominationValue: number;
  label: string;
  countUnits: number;
}

interface CashCountItem {
  id: string;
  count_number: string;
  count_date: string;
  cashAccountName: string;
  cashAccountCode: string;
  counted_by_name: string;
  book_balance: number;
  actual_balance: number;
  discrepancy: number;
  status: string;
  notes?: string;
  journalEntryNumber?: string;
  approvedByName?: string;
  created_at: string;
  denominations?: {
    denomination_value: number;
    count_units: number;
    subtotal: number;
  }[];
}

const DEFAULT_DENOMINATIONS: DenominationRow[] = [
  { denominationValue: 1000, label: 'فئة 1000 ريال', countUnits: 0 },
  { denominationValue: 500, label: 'فئة 500 ريال', countUnits: 0 },
  { denominationValue: 250, label: 'فئة 250 ريال', countUnits: 0 },
  { denominationValue: 200, label: 'فئة 200 ريال', countUnits: 0 },
  { denominationValue: 100, label: 'فئة 100 ريال', countUnits: 0 },
  { denominationValue: 50, label: 'فئة 50 ريال', countUnits: 0 },
];

export const CashReconciliationPage: React.FC = () => {
  const [counts, setCounts] = useState<CashCountItem[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // New Count Modal
  const [showModal, setShowModal] = useState(false);
  const [selectedCashId, setSelectedCashId] = useState('');
  const [countDate, setCountDate] = useState(new Date().toISOString().split('T')[0]);
  const [countedByName, setCountedByName] = useState('جهاد الصليحي');
  const [denominations, setDenominations] = useState<DenominationRow[]>(DEFAULT_DENOMINATIONS);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Selected Count Details Drawer
  const [selectedCount, setSelectedCount] = useState<CashCountItem | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [countsRes, cashRes] = await Promise.all([
        fetch('/api/banking/cash-counts'),
        fetch('/api/banking/cash-accounts'),
      ]);

      if (countsRes.ok && cashRes.ok) {
        const countsData = await countsRes.json();
        const cashData = await cashRes.json();
        setCounts(countsData);
        setCashAccounts(cashData);

        if (cashData.length > 0 && !selectedCashId) {
          setSelectedCashId(cashData[0]?.id || '');
        }
      }
    } catch (err) {
      console.error('Error fetching cash counts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const selectedCashAccount = cashAccounts.find(c => c.id === selectedCashId);
  const bookBalance = selectedCashAccount?.currentBalance || 0;

  const actualBalance = denominations.reduce(
    (sum, d) => sum + d.denominationValue * (d.countUnits || 0),
    0
  );

  const discrepancy = actualBalance - bookBalance;

  const handleDenominationChange = (value: number, units: number) => {
    setDenominations(prev =>
      prev.map(d => (d.denominationValue === value ? { ...d, countUnits: Math.max(0, units) } : d))
    );
  };

  const handleCreateCount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/banking/cash-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashAccountId: selectedCashId,
          countDate,
          countedByName,
          denominations: denominations.map(d => ({
            denominationValue: d.denominationValue,
            countUnits: d.countUnits || 0,
          })),
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل حفظ محضر الجرد');

      setShowModal(false);
      setDenominations(DEFAULT_DENOMINATIONS);
      setNotes('');
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveCount = async (countId: string) => {
    if (!confirm('هل أنت متأكد من اعتماد محضر الجرد؟ سيتم توليد قيود التسوية آلياً في حال وجود عجز أو فائض.')) return;
    try {
      const res = await fetch(`/api/banking/cash-counts/${countId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل اعتماد محضر الجرد');
      await fetchData();
      if (selectedCount && selectedCount.id === countId) {
        const updated = await (await fetch(`/api/banking/cash-counts/${countId}`)).json();
        setSelectedCount(updated);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const viewCountDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/banking/cash-counts/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedCount(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
            <Coins size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">جرد وتسوية الصناديق والخزائن</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              محاضر الجرد الفعلي للنقدية، تفصيل الفئات الورقية، واحتساب وتسوية العجز والفائض آلياً
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setDenominations(DEFAULT_DENOMINATIONS);
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-all shadow-sm shadow-amber-500/20"
        >
          <Plus size={16} />
          <span>إنشاء محضر جرد جديد</span>
        </button>
      </div>

      {/* Counts Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">جاري تحميل سجل محاضر الجرد...</div>
        ) : counts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">لا توجد محاضر جرد نقدية مسجلة حتى الآن</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">رقم المحضر</th>
                  <th className="py-3 px-4">تاريخ الجرد</th>
                  <th className="py-3 px-4">الصندوق</th>
                  <th className="py-3 px-4">المسؤول عن الجرد</th>
                  <th className="py-3 px-4 text-left">الرصيد الدفتري</th>
                  <th className="py-3 px-4 text-left">الرصيد الفعلي</th>
                  <th className="py-3 px-4 text-center">الفارق (عجز / فائض)</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                  <th className="py-3 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {counts.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                      {item.count_number}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">{item.count_date}</td>
                    <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                      {item.cashAccountName}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {item.counted_by_name}
                    </td>
                    <td className="py-3.5 px-4 text-left font-mono font-bold text-slate-800 dark:text-slate-200">
                      {item.book_balance.toLocaleString()} ر.ي
                    </td>
                    <td className="py-3.5 px-4 text-left font-mono font-bold text-amber-600 dark:text-amber-400">
                      {item.actual_balance.toLocaleString()} ر.ي
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold">
                      {Math.abs(item.discrepancy) < 0.01 ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">0.00 (مطابق)</span>
                      ) : item.discrepancy < 0 ? (
                        <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center justify-center gap-1">
                          <TrendingDown size={14} />
                          <span>عجز: {Math.abs(item.discrepancy).toLocaleString()} ر.ي</span>
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center gap-1">
                          <TrendingUp size={14} />
                          <span>فائض: {item.discrepancy.toLocaleString()} ر.ي</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          item.status === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                            : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                        }`}
                      >
                        {item.status === 'APPROVED' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                        <span>{item.status === 'APPROVED' ? 'معتمد ومقيد' : 'مسودة'}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => viewCountDetails(item.id)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                        >
                          عرض الفئات
                        </button>
                        {item.status === 'DRAFT' && (
                          <button
                            onClick={() => handleApproveCount(item.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs"
                          >
                            اعتماد
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: New Cash Count */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in duration-200 my-6">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600">
                  <Coins size={20} />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">محضر جرد فعلي للنقدية</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="mx-5 mt-4 p-3 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateCount} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">الصندوق / الخزينة *</label>
                  <select
                    value={selectedCashId}
                    onChange={e => setSelectedCashId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
                  >
                    {cashAccounts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.currentBalance.toLocaleString()} ر.ي)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">تاريخ الجرد *</label>
                  <input
                    type="date"
                    required
                    value={countDate}
                    onChange={e => setCountDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">اسم المسؤول عن الجرد *</label>
                  <input
                    type="text"
                    required
                    value={countedByName}
                    onChange={e => setCountedByName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Denominations breakdown */}
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white mb-2">
                  تفصيل الفئات النقدية المعدودة (Denomination Breakdown):
                </label>
                <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-200 dark:border-slate-700/60 space-y-2">
                  {denominations.map(d => {
                    const lineSubtotal = d.denominationValue * (d.countUnits || 0);
                    return (
                      <div key={d.denominationValue} className="flex items-center justify-between gap-3 text-xs">
                        <span className="w-28 font-medium text-slate-700 dark:text-slate-300">{d.label}</span>
                        <div className="flex items-center gap-2 flex-1 max-w-xs">
                          <span className="text-[11px] text-slate-400">العدد:</span>
                          <input
                            type="number"
                            min="0"
                            value={d.countUnits === 0 ? '' : d.countUnits}
                            placeholder="0"
                            onChange={e => handleDenominationChange(d.denominationValue, parseInt(e.target.value || '0', 10))}
                            className="w-24 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-center font-mono font-bold text-xs"
                          />
                          <span className="text-[11px] text-slate-400">ورقة</span>
                        </div>
                        <div className="w-32 text-left font-mono font-bold text-slate-900 dark:text-white">
                          = {lineSubtotal.toLocaleString()} ر.ي
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Reconciliation Comparison */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-100 dark:border-amber-900/40">
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">الرصيد الدفتري الحالي:</span>
                  <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                    {bookBalance.toLocaleString()} ر.ي
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">الرصيد الفعلي المعدود:</span>
                  <div className="text-base font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
                    {actualBalance.toLocaleString()} ر.ي
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">الفارق المحاسبي:</span>
                  <div
                    className={`text-base font-black font-mono mt-0.5 ${
                      Math.abs(discrepancy) < 0.01
                        ? 'text-emerald-600'
                        : discrepancy < 0
                        ? 'text-rose-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {Math.abs(discrepancy) < 0.01
                      ? '0.00 (مطابق)'
                      : discrepancy < 0
                      ? `عجز: ${Math.abs(discrepancy).toLocaleString()} ر.ي`
                      : `فائض: ${discrepancy.toLocaleString()} ر.ي`}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">ملاحظات المحضر</label>
                <input
                  type="text"
                  placeholder="ملاحظات حول سبب العجز أو الفائض أو اسم الشهود..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 text-xs font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {submitting ? 'جاري الحفظ...' : 'حفظ محضر الجرد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer / Modal: View Count Details */}
      {selectedCount && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileCheck size={20} className="text-amber-600" />
                <h3 className="font-bold text-slate-900 dark:text-white">تفاصيل محضر الجرد {selectedCount.count_number}</h3>
              </div>
              <button onClick={() => setSelectedCount(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">الصندوق:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedCount.cashAccountName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">التاريخ:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{selectedCount.count_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">المسؤول عن الجرد:</span>
                <span className="text-slate-800 dark:text-slate-200">{selectedCount.counted_by_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الرصيد الدفتري:</span>
                <span className="font-mono font-bold">{selectedCount.book_balance.toLocaleString()} ر.ي</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الرصيد الفعلي المعدود:</span>
                <span className="font-mono font-bold text-amber-600">{selectedCount.actual_balance.toLocaleString()} ر.ي</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                <span className="font-bold">الفارق:</span>
                <span className="font-mono font-bold">
                  {selectedCount.discrepancy < 0
                    ? `عجز: ${Math.abs(selectedCount.discrepancy).toLocaleString()} ر.ي`
                    : selectedCount.discrepancy > 0
                    ? `فائض: ${selectedCount.discrepancy.toLocaleString()} ر.ي`
                    : 'مطابق تماماً'}
                </span>
              </div>
            </div>

            {selectedCount.denominations && selectedCount.denominations.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-2">الفئات النقدية المعدودة:</h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {selectedCount.denominations.map((d, i) => (
                    <div key={i} className="flex justify-between text-xs p-2 bg-slate-50 dark:bg-slate-800/40 rounded-lg font-mono">
                      <span>فئة {d.denomination_value} ر.ي ({d.count_units} ورقة)</span>
                      <span className="font-bold">{d.subtotal.toLocaleString()} ر.ي</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedCount.journalEntryNumber && (
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-xs text-blue-700 dark:text-blue-300">
                قيد التسوية المرتبط: <span className="font-mono font-bold">{selectedCount.journalEntryNumber}</span>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedCount(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
