import React, { useState, useEffect } from 'react';
import {
  CheckCheck,
  Landmark,
  Plus,
  Search,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  X,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck
} from 'lucide-react';

interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  code: string;
  currentBalance: number;
}

interface ReconciliationItem {
  id: string;
  reconciliation_number: string;
  reconciliation_date: string;
  period_end_date: string;
  bankName: string;
  accountName: string;
  statement_closing_balance: number;
  gl_book_balance: number;
  unreconciled_deposits: number;
  unreconciled_withdrawals: number;
  adjusted_bank_balance: number;
  difference: number;
  status: string;
  notes?: string;
  created_at: string;
}

interface BankStatementItem {
  id: string;
  statement_number: string;
  statement_date: string;
  from_date: string;
  to_date: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  opening_balance: number;
  closing_balance: number;
  total_deposits: number;
  total_withdrawals: number;
  totalLines: number;
  reconciledLines: number;
  status: string;
}

export const BankingReconciliationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sessions' | 'statements'>('sessions');
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationItem[]>([]);
  const [statements, setStatements] = useState<BankStatementItem[]>([]);
  const [loading, setLoading] = useState(true);

  // New Reconciliation Workspace Modal
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [stmtClosingBalance, setStmtClosingBalance] = useState('');
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [recError, setRecError] = useState('');

  // New Statement Modal
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [statementForm, setStatementForm] = useState({
    bankAccountId: '',
    statementNumber: '',
    statementDate: new Date().toISOString().split('T')[0],
    fromDate: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
    openingBalance: '0',
    closingBalance: '0',
    notes: '',
    lines: [
      {
        transactionDate: new Date().toISOString().split('T')[0],
        description: 'إيداع مبيعات',
        direction: 'DEPOSIT' as 'DEPOSIT' | 'WITHDRAWAL',
        amount: 50000,
        referenceNumber: 'REF-001',
      },
    ],
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [banksRes, recRes, stmtRes] = await Promise.all([
        fetch('/api/banking/bank-accounts'),
        fetch('/api/banking/reconciliations'),
        fetch('/api/banking/statements'),
      ]);

      if (banksRes.ok && recRes.ok && stmtRes.ok) {
        const banksData = await banksRes.json();
        const recData = await recRes.json();
        const stmtData = await stmtRes.json();
        setBanks(banksData);
        setReconciliations(recData);
        setStatements(stmtData);

        if (banksData.length > 0 && !selectedBankId) {
          setSelectedBankId(banksData[0]?.id || '');
          setStatementForm(prev => ({ ...prev, bankAccountId: banksData[0]?.id || '' }));
        }
      }
    } catch (err) {
      console.error('Error fetching reconciliations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFetchPreview = async () => {
    if (!selectedBankId || !stmtClosingBalance) return;
    try {
      setPreviewLoading(true);
      setRecError('');
      const res = await fetch('/api/banking/reconciliations/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccountId: selectedBankId,
          periodEndDate,
          statementClosingBalance: parseFloat(stmtClosingBalance) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل حساب مطابقة التسوية');
      setPreviewData(data);
    } catch (err: any) {
      setRecError(err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFinalizeReconciliation = async () => {
    try {
      setCompleting(true);
      setRecError('');
      const res = await fetch('/api/banking/reconciliations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccountId: selectedBankId,
          reconciliationDate: new Date().toISOString().split('T')[0],
          periodEndDate,
          statementClosingBalance: parseFloat(stmtClosingBalance) || 0,
          matchedTransactionIds: previewData?.unreconciledTransactions?.map((t: any) => t.id) || [],
          notes: 'تسوية بنكية معتمدة ومطابقة',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إغلاق التسوية البنكية');

      setShowWorkspace(false);
      setPreviewData(null);
      setStmtClosingBalance('');
      await fetchData();
    } catch (err: any) {
      setRecError(err.message);
    } finally {
      setCompleting(false);
    }
  };

  const handleCreateStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/banking/statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...statementForm,
          openingBalance: parseFloat(statementForm.openingBalance) || 0,
          closingBalance: parseFloat(statementForm.closingBalance) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء كشف الحساب');

      setShowStatementModal(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400">
            <CheckCheck size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">التسويات البنكية ومطابقة الحسابات</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              مطابقة كشوف الحسابات المصرفية مع دفاتر الأستاذ العام، معالجة المعلقات، وإصدار مذكرة التسوية
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStatementModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-xs transition-all"
          >
            <FileSpreadsheet size={16} />
            <span>تسجيل كشف حساب بنكي</span>
          </button>
          <button
            onClick={() => setShowWorkspace(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm transition-all shadow-sm shadow-teal-500/20"
          >
            <Plus size={16} />
            <span>إجراء تسوية بنكية جديدة</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'sessions'
              ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <CheckCheck size={15} />
          <span>جلسات ومذكرات التسوية ({reconciliations.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('statements')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'statements'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet size={15} />
          <span>كشوف الحسابات المسجلة ({statements.length})</span>
        </button>
      </div>

      {/* Content View */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 text-sm">
          جاري تحميل بيانات التسويات البنكية...
        </div>
      ) : activeTab === 'sessions' ? (
        /* Reconciliations Table */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          {reconciliations.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">لا توجد جلسات تسوية بنكية منجزة حتى الآن</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">رقم مذكرة التسوية</th>
                    <th className="py-3 px-4">التاريخ</th>
                    <th className="py-3 px-4">البنك والحساب</th>
                    <th className="py-3 px-4 text-left">رصيد كشف البنك</th>
                    <th className="py-3 px-4 text-left">رصيد الدفاتر المحاسبية</th>
                    <th className="py-3 px-4 text-left">الرصيد المعدل</th>
                    <th className="py-3 px-4 text-center">الفرق</th>
                    <th className="py-3 px-4 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {reconciliations.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        {r.reconciliation_number}
                      </td>
                      <td className="py-3.5 px-4">{r.period_end_date}</td>
                      <td className="py-3.5 px-4 font-medium">
                        {r.bankName} - {r.accountName}
                      </td>
                      <td className="py-3.5 px-4 text-left font-mono font-bold">
                        {r.statement_closing_balance.toLocaleString()} ر.ي
                      </td>
                      <td className="py-3.5 px-4 text-left font-mono font-bold text-blue-600 dark:text-blue-400">
                        {r.gl_book_balance.toLocaleString()} ر.ي
                      </td>
                      <td className="py-3.5 px-4 text-left font-mono font-bold text-teal-600 dark:text-teal-400">
                        {r.adjusted_bank_balance.toLocaleString()} ر.ي
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold">
                        {Math.abs(r.difference) < 0.01 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">0.00 (مطابق تماماً)</span>
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">{r.difference.toLocaleString()} ر.ي</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[11px] bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={13} />
                          <span>معتمدة</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Statements Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {statements.map(stmt => (
            <div
              key={stmt.id}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600">
                      <FileSpreadsheet size={18} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">{stmt.statement_number}</h3>
                      <p className="text-[11px] text-slate-400 font-mono">{stmt.bankName}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      stmt.status === 'RECONCILED'
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                    }`}
                  >
                    {stmt.status === 'RECONCILED' ? 'تمت المطابقة' : 'بانتظار التسوية'}
                  </span>
                </div>

                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>الفترة:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {stmt.from_date} إلى {stmt.to_date}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>الرصيد الافتتاحي:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{stmt.opening_balance.toLocaleString()} ر.ي</span>
                  </div>
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>الرصيد الختامي:</span>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {stmt.closing_balance.toLocaleString()} ر.ي
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                    <span>الأسطر وحالة المطابقة:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {stmt.reconciledLines} / {stmt.totalLines} مطابق
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-[11px] text-slate-400">بتاريخ {stmt.statement_date}</span>
                <button
                  onClick={() => {
                    setSelectedBankId(banks.find(b => b.bank_name === stmt.bankName)?.id || '');
                    setStmtClosingBalance(stmt.closing_balance.toString());
                    setPeriodEndDate(stmt.to_date);
                    setShowWorkspace(true);
                  }}
                  className="text-teal-600 hover:text-teal-700 dark:text-teal-400 font-bold text-xs"
                >
                  مطابقة هذا الكشف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Reconciliation Workspace */}
      {showWorkspace && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in duration-200 my-8">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-600">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">معالج التسوية والمطابقة البنكية</h3>
                  <p className="text-[11px] text-slate-400">إجراء المقارنة واحتساب مذكرات التسوية وإغلاق الفترة</p>
                </div>
              </div>
              <button onClick={() => setShowWorkspace(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {recError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle size={16} />
                  <span>{recError}</span>
                </div>
              )}

              {/* Step 1: Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">الحساب البنكي *</label>
                  <select
                    value={selectedBankId}
                    onChange={e => {
                      setSelectedBankId(e.target.value);
                      setPreviewData(null);
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
                  >
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name} ({b.account_number})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">تاريخ إقفال الفترة *</label>
                  <input
                    type="date"
                    value={periodEndDate}
                    onChange={e => {
                      setPeriodEndDate(e.target.value);
                      setPreviewData(null);
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    رصيد إقفال كشف البنك *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={stmtClosingBalance}
                      onChange={e => {
                        setStmtClosingBalance(e.target.value);
                        setPreviewData(null);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleFetchPreview}
                      disabled={previewLoading || !stmtClosingBalance}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl whitespace-nowrap disabled:opacity-50"
                    >
                      {previewLoading ? 'مطابقة...' : 'احتساب'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 2: Live Reconciliation Breakdown */}
              {previewData && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                      <span className="text-[11px] text-slate-400">رصيد كشف البنك</span>
                      <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                        {previewData.statementClosingBalance.toLocaleString()} ر.ي
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                      <span className="text-[11px] text-slate-400">رصيد الدفاتر المحاسبية</span>
                      <div className="text-base font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                        {previewData.glBookBalance.toLocaleString()} ر.ي
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                      <span className="text-[11px] text-slate-400">الرصيد المعدل</span>
                      <div className="text-base font-bold font-mono text-teal-600 dark:text-teal-400 mt-0.5">
                        {previewData.adjustedBankBalance.toLocaleString()} ر.ي
                      </div>
                    </div>
                    <div className={`p-3 rounded-xl ${previewData.isBalanced ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'}`}>
                      <span className="text-[11px]">الفرق المحاسبي</span>
                      <div className="text-base font-black font-mono mt-0.5">
                        {previewData.isBalanced ? '0.00 (تطابق تام)' : `${previewData.difference.toLocaleString()} ر.ي`}
                      </div>
                    </div>
                  </div>

                  {/* Formula Explanation */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs space-y-2">
                    <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <FileSpreadsheet size={15} className="text-teal-600" />
                      <span>مذكرة التسوية البنكية المعتمدة (Bank Reconciliation Statement)</span>
                    </h4>
                    <div className="space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      <div className="flex justify-between">
                        <span>رصيد كشف الحساب البنكي في {periodEndDate}:</span>
                        <span>{previewData.statementClosingBalance.toLocaleString()} ر.ي</span>
                      </div>
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                        <span>+ إيداعات بالطريق لم تقيد في كشف البنك:</span>
                        <span>+{previewData.unreconciledDeposits.toLocaleString()} ر.ي</span>
                      </div>
                      <div className="flex justify-between text-rose-600 dark:text-rose-400">
                        <span>- شيكات ومسحوبات لم تصرف بعد من البنك:</span>
                        <span>-{previewData.unreconciledWithdrawals.toLocaleString()} ر.ي</span>
                      </div>
                      <div className="flex justify-between font-bold pt-1 border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
                        <span>= الرصيد البنكي المعدل:</span>
                        <span>{previewData.adjustedBankBalance.toLocaleString()} ر.ي</span>
                      </div>
                      <div className="flex justify-between font-bold text-blue-600 dark:text-blue-400">
                        <span>رصيد حساب البنك في الدفاتر المحاسبية (GL Account 1102):</span>
                        <span>{previewData.glBookBalance.toLocaleString()} ر.ي</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowWorkspace(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
                >
                  إلغاء
                </button>
                {previewData && (
                  <button
                    type="button"
                    onClick={handleFinalizeReconciliation}
                    disabled={completing}
                    className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <CheckCheck size={16} />
                    <span>{completing ? 'جاري الإقفال...' : 'اعتماد وإغلاق التسوية البنكية'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Statement */}
      {showStatementModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600">
                  <FileSpreadsheet size={20} />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">تسجيل كشف حساب بنكي وارد</h3>
              </div>
              <button onClick={() => setShowStatementModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateStatement} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">الحساب البنكي *</label>
                <select
                  required
                  value={statementForm.bankAccountId}
                  onChange={e => setStatementForm({ ...statementForm, bankAccountId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
                >
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} ({b.account_number})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">رقم كشف الحساب *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: STMT-2026-OCT"
                    value={statementForm.statementNumber}
                    onChange={e => setStatementForm({ ...statementForm, statementNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">تاريخ الكشف *</label>
                  <input
                    type="date"
                    required
                    value={statementForm.statementDate}
                    onChange={e => setStatementForm({ ...statementForm, statementDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">الرصيد الافتتاحي *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={statementForm.openingBalance}
                    onChange={e => setStatementForm({ ...statementForm, openingBalance: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">الرصيد الختامي *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={statementForm.closingBalance}
                    onChange={e => setStatementForm({ ...statementForm, closingBalance: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowStatementModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 text-xs font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all"
                >
                  حفظ كشف الحساب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
