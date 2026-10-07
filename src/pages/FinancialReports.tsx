import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Scale,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  Layers,
  Calendar,
  Filter,
  Printer,
  Download,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  PieChart,
  DollarSign,
  ShieldCheck,
  Building,
  Eye,
  ChevronDown,
  FileText,
  BookOpen,
} from 'lucide-react';

interface ReportFilter {
  fiscalPeriodId?: string;
  fiscalYearId?: string;
  fromDate?: string;
  toDate?: string;
  branchId?: string;
  costCenterId?: string;
  accountId?: string;
  hideZero?: boolean;
}

export const FinancialReportsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'pnl' | 'balance_sheet' | 'cash_flow' | 'trial_balance' | 'general_ledger' | 'account_statement' | 'reconciliation' | 'ratios'
  >('pnl');

  const [loading, setLoading] = useState(false);
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  // Report States
  const [pnlData, setPnlData] = useState<any>(null);
  const [bsData, setBsData] = useState<any>(null);
  const [cfData, setCfData] = useState<any>(null);
  const [tbData, setTbData] = useState<any>(null);
  const [glData, setGlData] = useState<any>(null);
  const [statementData, setStatementData] = useState<any>(null);
  const [reconData, setReconData] = useState<any>(null);
  const [ratiosData, setRatiosData] = useState<any>(null);

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [hideZero, setHideZero] = useState(true);

  // Fetch initial master data
  useEffect(() => {
    fetchPeriods();
    fetchAccounts();
  }, []);

  const fetchPeriods = async () => {
    try {
      const res = await fetch('/api/accounting/fiscal-periods');
      if (res.ok) {
        const data = await res.json();
        setPeriods(data);
        // Default to current or open period (like period 10)
        const openP = data.find((p: any) => p.status === 'OPEN' && p.period_number >= 10) || data[0];
        if (openP) {
          setSelectedPeriodId(openP.id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounting/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
        if (data.length > 0) {
          setSelectedAccountId(data[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch report data when tab or filters change
  useEffect(() => {
    loadCurrentReport();
  }, [activeTab, selectedPeriodId, fromDate, toDate, selectedAccountId]);

  const loadCurrentReport = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (selectedPeriodId) queryParams.append('fiscalPeriodId', selectedPeriodId);
      if (fromDate) queryParams.append('fromDate', fromDate);
      if (toDate) queryParams.append('toDate', toDate);

      if (activeTab === 'pnl') {
        const res = await fetch(`/api/reports/income-statement?${queryParams.toString()}`);
        if (res.ok) setPnlData(await res.json());
      } else if (activeTab === 'balance_sheet') {
        const res = await fetch(`/api/reports/balance-sheet?${queryParams.toString()}`);
        if (res.ok) setBsData(await res.json());
      } else if (activeTab === 'cash_flow') {
        const res = await fetch(`/api/reports/cash-flow?${queryParams.toString()}`);
        if (res.ok) setCfData(await res.json());
      } else if (activeTab === 'trial_balance') {
        const res = await fetch(`/api/reports/trial-balance?${queryParams.toString()}`);
        if (res.ok) setTbData(await res.json());
      } else if (activeTab === 'general_ledger') {
        if (selectedAccountId) queryParams.append('accountId', selectedAccountId);
        const res = await fetch(`/api/reports/general-ledger?${queryParams.toString()}`);
        if (res.ok) setGlData(await res.json());
      } else if (activeTab === 'account_statement') {
        if (selectedAccountId) {
          const res = await fetch(`/api/reports/account-statement/${selectedAccountId}?${queryParams.toString()}`);
          if (res.ok) setStatementData(await res.json());
        }
      } else if (activeTab === 'reconciliation') {
        const res = await fetch(`/api/reports/reconciliation?${queryParams.toString()}`);
        if (res.ok) setReconData(await res.json());
      } else if (activeTab === 'ratios') {
        const res = await fetch(`/api/reports/financial-dashboard?${queryParams.toString()}`);
        if (res.ok) setRatiosData(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatYER = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00 ر.ي';
    return (
      val.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + ' ر.ي'
    );
  };

  return (
    <div className="space-y-6 select-text">
      {/* Top Header & Executive Controls */}
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-wide">التقارير والقوائم المالية الرسمية</h1>
                <p className="text-sm text-slate-400 font-medium">
                  نظام كايان المحاسبي — المصدر الأوحد للحقيقة: General Ledger Engine
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-sm"
            >
              <Printer className="w-4 h-4 text-slate-300" />
              طباعة التقرير
            </button>
            <button
              onClick={loadCurrentReport}
              disabled={loading}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-blue-600/30"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              تحديث البيانات
            </button>
          </div>
        </div>

        {/* Global Filter Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">الفترة المالية</label>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="">جميع الفترات (كامل السنة)</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.status === 'CLOSED' ? '(مقفلة)' : '(مفتوحة)'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">من تاريخ</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">إلى تاريخ</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          {(activeTab === 'general_ledger' || activeTab === 'account_statement') && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">الحساب المحاسبي</label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} — {acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-800 pb-2 custom-scrollbar">
        {[
          { key: 'pnl', label: 'قائمة الدخل (P&L)', icon: TrendingUp },
          { key: 'balance_sheet', label: 'الميزانية العمومية', icon: Scale },
          { key: 'cash_flow', label: 'التدفقات النقدية', icon: DollarSign },
          { key: 'trial_balance', label: 'ميزان المراجعة', icon: FileSpreadsheet },
          { key: 'general_ledger', label: 'دفتر الأستاذ العام', icon: BookOpen },
          { key: 'account_statement', label: 'كشف حساب', icon: FileText },
          { key: 'reconciliation', label: 'المطابقة الشاملة', icon: ShieldCheck },
          { key: 'ratios', label: 'المؤشرات والنسب المالية', icon: PieChart },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 border border-blue-500/40'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Report Content Panels */}
      {loading ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-base font-semibold">جاري تجميع وحساب البيانات المحاسبية من دفتر الأستاذ العام...</p>
        </div>
      ) : (
        <>
          {/* ======================================================= */}
          {/* 1. INCOME STATEMENT (P&L) */}
          {/* ======================================================= */}
          {activeTab === 'pnl' && pnlData && (
            <div className="space-y-6">
              {/* Executive Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">إجمالي الإيرادات</div>
                  <div className="text-2xl font-black text-emerald-400">{formatYER(pnlData.totalRevenue)}</div>
                  <div className="text-xs text-slate-500 mt-2 font-medium">مبيعات وأنشطة تشغيلية</div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">مجمل الربح (Gross Profit)</div>
                  <div className="text-2xl font-black text-blue-400">{formatYER(pnlData.grossProfit)}</div>
                  <div className="text-xs text-blue-400/80 mt-2 font-semibold">الهامش: {(pnlData.grossMargin * 100).toFixed(1)}%</div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">المصروفات التشغيلية</div>
                  <div className="text-2xl font-black text-rose-400">{formatYER(pnlData.totalOperatingExpenses)}</div>
                  <div className="text-xs text-slate-500 mt-2 font-medium">تشغيل وإهلاك وإدارة</div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                  <div className={`absolute top-0 right-0 w-2 h-full ${pnlData.netProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">صافي الربح / الخسارة</div>
                  <div className={`text-2xl font-black ${pnlData.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatYER(pnlData.netProfit)}
                  </div>
                  <div className="text-xs text-slate-400 mt-2 font-semibold">
                    صافي الهامش: {(pnlData.netMargin * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Detailed Formal Statement */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    بيان الأرباح والخسائر التفصيلي (Income Statement)
                  </h3>
                  <span className="text-xs font-medium text-slate-400">
                    الفترة: {pnlData.fromDate?.split('T')[0]} إلى {pnlData.toDate?.split('T')[0]}
                  </span>
                </div>

                <div className="divide-y divide-slate-800/80">
                  {/* Section 1: Revenue */}
                  <div className="p-5">
                    <div className="flex items-center justify-between font-bold text-emerald-400 text-sm mb-3">
                      <span>1. الإيرادات التشغيلية (Revenues)</span>
                      <span>{formatYER(pnlData.totalRevenue)}</span>
                    </div>
                    <div className="space-y-1.5 pr-4">
                      {pnlData.sections?.revenues?.map((r: any) => (
                        <div key={r.accountId} className="flex justify-between text-xs text-slate-300 py-1 border-b border-slate-800/40">
                          <span>{r.accountCode} — {r.accountName}</span>
                          <span className="font-semibold text-slate-200">{formatYER(r.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 2: COGS */}
                  <div className="p-5">
                    <div className="flex items-center justify-between font-bold text-amber-400 text-sm mb-3">
                      <span>2. تكلفة المبيعات (Cost of Goods Sold - COGS)</span>
                      <span>({formatYER(pnlData.totalCogs)})</span>
                    </div>
                    <div className="space-y-1.5 pr-4">
                      {pnlData.sections?.cogs?.map((c: any) => (
                        <div key={c.accountId} className="flex justify-between text-xs text-slate-300 py-1 border-b border-slate-800/40">
                          <span>{c.accountCode} — {c.accountName}</span>
                          <span className="font-semibold text-slate-200">{formatYER(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Gross Profit Subtotal */}
                  <div className="p-5 bg-blue-950/20 flex justify-between font-bold text-blue-300 text-sm">
                    <span>إجمالي الربح (Gross Profit)</span>
                    <span>{formatYER(pnlData.grossProfit)}</span>
                  </div>

                  {/* Section 3: Operating Expenses */}
                  <div className="p-5">
                    <div className="flex items-center justify-between font-bold text-rose-400 text-sm mb-3">
                      <span>3. المصروفات التشغيلية والإدارية (Operating Expenses)</span>
                      <span>({formatYER(pnlData.totalOperatingExpenses)})</span>
                    </div>
                    <div className="space-y-1.5 pr-4">
                      {pnlData.sections?.operatingExpenses?.map((e: any) => (
                        <div key={e.accountId} className="flex justify-between text-xs text-slate-300 py-1 border-b border-slate-800/40">
                          <span>{e.accountCode} — {e.accountName}</span>
                          <span className="font-semibold text-slate-200">{formatYER(e.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Operating Profit Subtotal */}
                  <div className="p-5 bg-slate-950/50 flex justify-between font-bold text-indigo-300 text-sm">
                    <span>الدخل التشغيلي (Operating Income)</span>
                    <span>{formatYER(pnlData.operatingProfit)}</span>
                  </div>

                  {/* Section 4: Other Incomes & Expenses */}
                  <div className="p-5">
                    <div className="text-xs font-bold text-slate-400 mb-2">إيرادات ومصروفات أخرى (غير تشغيلية)</div>
                    <div className="space-y-1.5 pr-4">
                      {pnlData.sections?.otherIncomes?.map((oi: any) => (
                        <div key={oi.accountId} className="flex justify-between text-xs text-emerald-400 py-1 border-b border-slate-800/40">
                          <span>{oi.accountCode} — {oi.accountName} (إيراد إضافي / أرباح استبعاد)</span>
                          <span className="font-semibold">+{formatYER(oi.amount)}</span>
                        </div>
                      ))}
                      {pnlData.sections?.otherExpenses?.map((oe: any) => (
                        <div key={oe.accountId} className="flex justify-between text-xs text-rose-400 py-1 border-b border-slate-800/40">
                          <span>{oe.accountCode} — {oe.accountName} (رسوم بنكية / خسائر استبعاد)</span>
                          <span className="font-semibold">-{formatYER(oe.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Grand Net Profit */}
                  <div className={`p-6 flex justify-between font-black text-lg ${pnlData.netProfit >= 0 ? 'bg-emerald-950/30 text-emerald-300' : 'bg-rose-950/30 text-rose-300'}`}>
                    <span>صافي الربح / (الخسارة) للفترة</span>
                    <span>{formatYER(pnlData.netProfit)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* 2. BALANCE SHEET */}
          {/* ======================================================= */}
          {activeTab === 'balance_sheet' && bsData && (
            <div className="space-y-6">
              {/* Equation Balanced Badge */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between ${
                  bsData.isBalanced
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  {bsData.isBalanced ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <AlertTriangle className="w-6 h-6 text-rose-400" />}
                  <div>
                    <h4 className="font-bold text-sm">
                      {bsData.isBalanced ? 'الميزانية العمومية متزنة تماماً (Assets = Liabilities + Equity)' : 'تنبيه: عدم توازن في الميزانية العمومية'}
                    </h4>
                    <p className="text-xs opacity-80">
                      إجمالي الأصول: {formatYER(bsData.totalAssets)} = الخصوم وحقوق الملكية: {formatYER(bsData.totalLiabilitiesAndEquity)}
                    </p>
                  </div>
                </div>
                <div className="text-xs font-mono font-bold bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-700">
                  الفارق: {formatYER(bsData.difference)}
                </div>
              </div>

              {/* Two Column Layout: Assets vs Liabilities & Equity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Right Column: Assets */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-4 bg-blue-950/20 border-b border-slate-800 flex justify-between font-bold text-blue-300 text-sm">
                    <span>الأصول (Assets)</span>
                    <span>{formatYER(bsData.totalAssets)}</span>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Current Assets */}
                    <div>
                      <div className="flex justify-between font-bold text-xs text-slate-300 border-b border-slate-800 pb-1 mb-2">
                        <span>الأصول المتداولة (Current Assets)</span>
                        <span>{formatYER(bsData.totalCurrentAssets)}</span>
                      </div>
                      <div className="space-y-1 pr-3">
                        {bsData.sections?.currentAssets?.map((a: any) => (
                          <div key={a.accountId} className="flex justify-between text-xs text-slate-400 py-1">
                            <span>{a.accountCode} — {a.accountName}</span>
                            <span className="font-semibold text-slate-200">{formatYER(a.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Non-Current Assets */}
                    <div>
                      <div className="flex justify-between font-bold text-xs text-slate-300 border-b border-slate-800 pb-1 mb-2">
                        <span>الأصول غير المتداولة (Non-Current Assets)</span>
                        <span>{formatYER(bsData.totalNonCurrentAssets)}</span>
                      </div>
                      <div className="space-y-1 pr-3">
                        {bsData.sections?.nonCurrentAssets?.map((a: any) => (
                          <div key={a.accountId} className="flex justify-between text-xs text-slate-400 py-1">
                            <span>{a.accountCode} — {a.accountName}</span>
                            <span className="font-semibold text-slate-200">{formatYER(a.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Left Column: Liabilities & Equity */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-4 bg-indigo-950/20 border-b border-slate-800 flex justify-between font-bold text-indigo-300 text-sm">
                    <span>الالتزامات وحقوق الملكية (Liabilities & Equity)</span>
                    <span>{formatYER(bsData.totalLiabilitiesAndEquity)}</span>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Current Liabilities */}
                    <div>
                      <div className="flex justify-between font-bold text-xs text-slate-300 border-b border-slate-800 pb-1 mb-2">
                        <span>الالتزامات المتداولة (Current Liabilities)</span>
                        <span>{formatYER(bsData.totalCurrentLiabilities)}</span>
                      </div>
                      <div className="space-y-1 pr-3">
                        {bsData.sections?.currentLiabilities?.map((l: any) => (
                          <div key={l.accountId} className="flex justify-between text-xs text-slate-400 py-1">
                            <span>{l.accountCode} — {l.accountName}</span>
                            <span className="font-semibold text-slate-200">{formatYER(l.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Non-Current Liabilities */}
                    {bsData.sections?.nonCurrentLiabilities?.length > 0 && (
                      <div>
                        <div className="flex justify-between font-bold text-xs text-slate-300 border-b border-slate-800 pb-1 mb-2">
                          <span>الالتزامات طويلة الأجل (Long-term Liabilities)</span>
                          <span>{formatYER(bsData.totalNonCurrentLiabilities)}</span>
                        </div>
                        <div className="space-y-1 pr-3">
                          {bsData.sections?.nonCurrentLiabilities?.map((l: any) => (
                            <div key={l.accountId} className="flex justify-between text-xs text-slate-400 py-1">
                              <span>{l.accountCode} — {l.accountName}</span>
                              <span className="font-semibold text-slate-200">{formatYER(l.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Equity */}
                    <div>
                      <div className="flex justify-between font-bold text-xs text-slate-300 border-b border-slate-800 pb-1 mb-2">
                        <span>حقوق الملكية (Equity)</span>
                        <span>{formatYER(bsData.totalEquity)}</span>
                      </div>
                      <div className="space-y-1 pr-3">
                        {bsData.sections?.equity?.map((e: any) => (
                          <div key={e.accountId} className="flex justify-between text-xs text-slate-400 py-1">
                            <span>{e.accountCode} — {e.accountName}</span>
                            <span className="font-semibold text-slate-200">{formatYER(e.amount)}</span>
                          </div>
                        ))}
                        {/* Current Year Net Income Line (Dynamic from GL) */}
                        <div className="flex justify-between text-xs font-bold text-emerald-400 py-1.5 bg-emerald-950/20 px-2 rounded-lg">
                          <span>صافي أرباح الفترة الحالية (محسوب من دفتر الأستاذ)</span>
                          <span>{formatYER(bsData.currentYearEarnings)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* 3. CASH FLOW STATEMENT */}
          {/* ======================================================= */}
          {activeTab === 'cash_flow' && cfData && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <div className="text-xs font-semibold text-slate-400 mb-1">صافي التدفق التشغيلي</div>
                  <div className="text-xl font-bold text-emerald-400">{formatYER(cfData.operatingActivities?.totalOperating)}</div>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <div className="text-xs font-semibold text-slate-400 mb-1">صافي التدفق الاستثماري</div>
                  <div className="text-xl font-bold text-blue-400">{formatYER(cfData.investingActivities?.totalInvesting)}</div>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <div className="text-xs font-semibold text-slate-400 mb-1">النقدية آخر المدة (مطابقة الخزينة والبنوك)</div>
                  <div className="text-xl font-bold text-amber-400">{formatYER(cfData.actualClosingCash)}</div>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-6 space-y-6">
                <div>
                  <h4 className="font-bold text-emerald-400 text-sm mb-3">1. التدفقات النقدية من الأنشطة التشغيلية (Operating Activities)</h4>
                  <div className="space-y-2 pr-4 text-xs text-slate-300">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span>صافي الدخل للفترة (Net Income)</span>
                      <span className="font-bold">{formatYER(cfData.operatingActivities?.netProfit)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800 text-blue-300">
                      <span>+ إضافة: إهلاك الأصول الثابتة (مصروف غير نقدي)</span>
                      <span>+{formatYER(cfData.operatingActivities?.depreciationExpense)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span>التغير في حسابات المدينين والعملاء (1103)</span>
                      <span>{formatYER(cfData.operatingActivities?.arChange)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span>التغير في المخزون السلعي (1104)</span>
                      <span>{formatYER(cfData.operatingActivities?.invChange)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span>التغير في حسابات الموردين والدائنين (2101)</span>
                      <span>{formatYER(cfData.operatingActivities?.apChange)}</span>
                    </div>
                    <div className="flex justify-between py-2 font-bold text-emerald-300 bg-emerald-950/20 px-3 rounded-lg">
                      <span>صافي النقد المتولد من الأنشطة التشغيلية</span>
                      <span>{formatYER(cfData.operatingActivities?.totalOperating)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-blue-400 text-sm mb-3">2. التدفقات النقدية من الأنشطة الاستثمارية (Investing Activities)</h4>
                  <div className="space-y-2 pr-4 text-xs text-slate-300">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span>شراء / بيع أصول ثابتة رأسمالية</span>
                      <span>{formatYER(cfData.investingActivities?.capitalExpenditures)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-between font-black text-base text-white">
                  <span>صافي التغير في النقدية خلال الفترة</span>
                  <span>{formatYER(cfData.netCashChange)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* 4. TRIAL BALANCE */}
          {/* ======================================================= */}
          {activeTab === 'trial_balance' && tbData && (
            <div className="space-y-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${tbData.isBalanced ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <span className="font-bold text-sm text-white">
                    حالة الميزان: {tbData.isBalanced ? 'متزن تماماً (Balanced)' : 'غير متزن'}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="text-slate-400">
                    إجمالي المدين: <strong className="text-emerald-400">{formatYER(tbData.totalClosingDebit)}</strong>
                  </span>
                  <span className="text-slate-400">
                    إجمالي الدائن: <strong className="text-blue-400">{formatYER(tbData.totalClosingCredit)}</strong>
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold">
                    <tr>
                      <th className="p-3">كود الحساب</th>
                      <th className="p-3">اسم الحساب</th>
                      <th className="p-3">افتتاحي مدين</th>
                      <th className="p-3">افتتاحي دائن</th>
                      <th className="p-3">حركة مدين</th>
                      <th className="p-3">حركة دائن</th>
                      <th className="p-3 bg-blue-950/20 text-blue-300">رصيد ختامي مدين</th>
                      <th className="p-3 bg-indigo-950/20 text-indigo-300">رصيد ختامي دائن</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {tbData.accounts?.map((row: any) => (
                      <tr key={row.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-slate-300">{row.code}</td>
                        <td className="p-3 font-sans font-medium text-slate-200">{row.name}</td>
                        <td className="p-3 text-slate-400">{formatYER(row.openDebit)}</td>
                        <td className="p-3 text-slate-400">{formatYER(row.openCredit)}</td>
                        <td className="p-3 text-emerald-400">{formatYER(row.periodDebit)}</td>
                        <td className="p-3 text-rose-400">{formatYER(row.periodCredit)}</td>
                        <td className="p-3 bg-blue-950/10 font-bold text-slate-200">{formatYER(row.closingDebit)}</td>
                        <td className="p-3 bg-indigo-950/10 font-bold text-slate-200">{formatYER(row.closingCredit)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-950 font-bold text-sm border-t-2 border-slate-700">
                    <tr>
                      <td colSpan={2} className="p-3 text-slate-200">الإجمالي العام</td>
                      <td className="p-3 text-slate-400">{formatYER(tbData.totalOpeningDebit)}</td>
                      <td className="p-3 text-slate-400">{formatYER(tbData.totalOpeningCredit)}</td>
                      <td className="p-3 text-emerald-400">{formatYER(tbData.totalPeriodDebit)}</td>
                      <td className="p-3 text-rose-400">{formatYER(tbData.totalPeriodCredit)}</td>
                      <td className="p-3 bg-blue-950/30 text-blue-300">{formatYER(tbData.totalClosingDebit)}</td>
                      <td className="p-3 bg-indigo-950/30 text-indigo-300">{formatYER(tbData.totalClosingCredit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* 5. GENERAL LEDGER & RUNNING BALANCE */}
          {/* ======================================================= */}
          {activeTab === 'general_ledger' && glData && (
            <div className="space-y-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white text-sm">دفتر الأستاذ العام</h4>
                  <p className="text-xs text-slate-400">إجمالي القيود المعروضة: {glData.linesCount}</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="text-slate-400">
                    مدين: <strong className="text-emerald-400">{formatYER(glData.totalDebit)}</strong>
                  </span>
                  <span className="text-slate-400">
                    دائن: <strong className="text-blue-400">{formatYER(glData.totalCredit)}</strong>
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold">
                    <tr>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">رقم القيد</th>
                      <th className="p-3">الحساب</th>
                      <th className="p-3">البيان والشرح</th>
                      <th className="p-3">مدين</th>
                      <th className="p-3">دائن</th>
                      <th className="p-3">الرصيد التراكمي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {glData.lines?.map((line: any) => (
                      <tr key={line.lineId} className="hover:bg-slate-800/40">
                        <td className="p-3 text-slate-400">{line.entryDate?.split('T')[0]}</td>
                        <td className="p-3 font-bold text-blue-400">{line.entryNumber}</td>
                        <td className="p-3 font-sans text-slate-300">{line.accountCode} - {line.accountName}</td>
                        <td className="p-3 font-sans text-slate-400">{line.lineDescription || line.entryDescription}</td>
                        <td className="p-3 text-emerald-400">{line.debit > 0 ? formatYER(line.debit) : '-'}</td>
                        <td className="p-3 text-rose-400">{line.credit > 0 ? formatYER(line.credit) : '-'}</td>
                        <td className="p-3 font-bold text-slate-200">{formatYER(line.runningBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* 6. ACCOUNT STATEMENT */}
          {/* ======================================================= */}
          {activeTab === 'account_statement' && statementData && (
            <div className="space-y-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      كشف حساب: {statementData.account?.code} — {statementData.account?.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      طبيعة الحساب: {statementData.account?.normalBalance} | التصنيف: {statementData.account?.category}
                    </p>
                  </div>
                  <div className="flex gap-4 text-xs font-semibold">
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <div className="text-slate-500">رصيد أول المدة</div>
                      <div className="text-slate-200 font-bold">{formatYER(statementData.openingBalance)}</div>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <div className="text-slate-500">إجمالي الحركات (مدين / دائن)</div>
                      <div className="text-blue-400 font-bold">{formatYER(statementData.totalDebit)} / {formatYER(statementData.totalCredit)}</div>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <div className="text-slate-500">الرصيد الختامي</div>
                      <div className="text-emerald-400 font-bold">{formatYER(statementData.closingBalance)}</div>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold">
                      <tr>
                        <th className="p-3">التاريخ</th>
                        <th className="p-3">رقم القيد</th>
                        <th className="p-3">البيان</th>
                        <th className="p-3">مدين</th>
                        <th className="p-3">دائن</th>
                        <th className="p-3">الرصيد الجاري</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {statementData.lines?.map((line: any) => (
                        <tr key={line.lineId} className="hover:bg-slate-800/40">
                          <td className="p-3 text-slate-400">{line.entryDate?.split('T')[0]}</td>
                          <td className="p-3 font-bold text-blue-400">{line.entryNumber}</td>
                          <td className="p-3 font-sans text-slate-300">{line.lineDescription || line.entryDescription}</td>
                          <td className="p-3 text-emerald-400">{line.debit > 0 ? formatYER(line.debit) : '-'}</td>
                          <td className="p-3 text-rose-400">{line.credit > 0 ? formatYER(line.credit) : '-'}</td>
                          <td className="p-3 font-bold text-slate-200">{formatYER(line.displayRunningBalance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* 7. FINANCIAL INTEGRITY & CROSS-MODULE RECONCILIATION */}
          {/* ======================================================= */}
          {activeTab === 'reconciliation' && reconData && (
            <div className="space-y-6">
              <div
                className={`p-5 rounded-2xl border flex items-center justify-between ${
                  reconData.isAllReconciled
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-7 h-7 text-emerald-400" />
                  <div>
                    <h3 className="font-bold text-base">
                      {reconData.isAllReconciled
                        ? 'نظام المطابقة المالي: كافة الحسابات والأنظمة الفرعية مطابقة تماماً مع الأستاذ العام'
                        : 'يوجد عدم تطابق بين الحسابات الفرعية ودفتر الأستاذ العام'}
                    </h3>
                    <p className="text-xs opacity-80">
                      محرك التدقيق الآلي الشامل لجميع الموديولات (المخزون، العملاء، الموردين، الخزينة، البنوك، الأصول الثابتة)
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700">
                  {reconData.isAllReconciled ? 'حالة النظام: موثوق 100%' : 'تنبيه تدقيق'}
                </span>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold">
                    <tr>
                      <th className="p-3">النظام الفرعي (Module)</th>
                      <th className="p-3">رصيد السجل الفرعي (Subledger)</th>
                      <th className="p-3">رصيد الأستاذ العام (GL Balance)</th>
                      <th className="p-3">الفارق (Difference)</th>
                      <th className="p-3">حالة المطابقة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {reconData.modules?.map((m: any) => (
                      <tr key={m.module} className="hover:bg-slate-800/40">
                        <td className="p-3 font-sans font-bold text-slate-200">{m.name}</td>
                        <td className="p-3 text-slate-300">{formatYER(m.subledger)}</td>
                        <td className="p-3 text-blue-300">{formatYER(m.glBalance)}</td>
                        <td className="p-3 font-bold text-slate-400">{formatYER(m.difference)}</td>
                        <td className="p-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              m.status === 'RECONCILED'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {m.status === 'RECONCILED' ? 'مطابق تماماً' : 'غير متطابق'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* 8. FINANCIAL RATIOS & KPIS */}
          {/* ======================================================= */}
          {activeTab === 'ratios' && ratiosData && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="text-xs font-semibold text-slate-400 mb-2">نسبة السيولة العامة (Current Ratio)</div>
                <div className="text-3xl font-black text-emerald-400">{ratiosData.currentRatio?.toFixed(2)}x</div>
                <p className="text-xs text-slate-500 mt-2">الأصول المتداولة / الالتزامات المتداولة (المعيار الصحي &gt; 1.5x)</p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="text-xs font-semibold text-slate-400 mb-2">رأس المال العامل (Working Capital)</div>
                <div className="text-3xl font-black text-blue-400">{formatYER(ratiosData.workingCapital)}</div>
                <p className="text-xs text-slate-500 mt-2">الأصول المتداولة - الالتزامات المتداولة</p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="text-xs font-semibold text-slate-400 mb-2">هامش مجمل الربح (Gross Margin)</div>
                <div className="text-3xl font-black text-indigo-400">{(ratiosData.grossMargin * 100).toFixed(1)}%</div>
                <p className="text-xs text-slate-500 mt-2">مجمل الربح / إجمالي الإيرادات</p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="text-xs font-semibold text-slate-400 mb-2">هامش صافي الربح (Net Margin)</div>
                <div className="text-3xl font-black text-amber-400">{(ratiosData.netMargin * 100).toFixed(1)}%</div>
                <p className="text-xs text-slate-500 mt-2">صافي الربح / إجمالي الإيرادات</p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="text-xs font-semibold text-slate-400 mb-2">العائد على الأصول (ROA)</div>
                <div className="text-3xl font-black text-teal-400">{(ratiosData.roa * 100).toFixed(1)}%</div>
                <p className="text-xs text-slate-500 mt-2">صافي الربح / إجمالي الأصول</p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="text-xs font-semibold text-slate-400 mb-2">نسبة المديونية لحقوق الملكية (Debt to Equity)</div>
                <div className="text-3xl font-black text-rose-400">{ratiosData.debtToEquity?.toFixed(2)}x</div>
                <p className="text-xs text-slate-500 mt-2">إجمالي الالتزامات / حقوق الملكية</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
