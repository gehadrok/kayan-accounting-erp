import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Wallet,
  DollarSign,
  Plus,
  Printer,
  Download,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  X
} from 'lucide-react';

interface TransactionItem {
  id: string;
  transaction_number: string;
  transaction_date: string;
  account_category: 'CASH' | 'BANK';
  cashAccountName?: string;
  bankName?: string;
  bankAccountName?: string;
  transaction_type: string;
  direction: 'INFLOW' | 'OUTFLOW';
  amount: number;
  currencySymbol?: string;
  reference_type?: string;
  reference_number?: string;
  payee_or_payer?: string;
  description: string;
  journalEntryNumber?: string;
  is_reconciled: boolean;
  createdByName?: string;
}

export const BankingLedgerPage: React.FC = () => {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // Direct Bank Charge Modal
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [chargeSubmitting, setChargeSubmitting] = useState(false);
  const [chargeError, setChargeError] = useState('');
  const [chargeForm, setChargeForm] = useState({
    bankAccountId: '',
    chargeDate: new Date().toISOString().split('T')[0],
    amount: '',
    description: 'عمولات ومصروفات كشف حساب بنكي دوري',
    referenceNumber: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCategory !== 'ALL') params.append('category', selectedCategory);
      if (selectedAccountId !== 'ALL') {
        if (selectedCategory === 'CASH') params.append('cashAccountId', selectedAccountId);
        else if (selectedCategory === 'BANK') params.append('bankAccountId', selectedAccountId);
      }
      if (selectedType !== 'ALL') params.append('type', selectedType);
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);
      if (search) params.append('search', search);

      const [txRes, cashRes, bankRes] = await Promise.all([
        fetch(`/api/banking/transactions?${params.toString()}`),
        fetch('/api/banking/cash-accounts'),
        fetch('/api/banking/bank-accounts'),
      ]);

      if (txRes.ok && cashRes.ok && bankRes.ok) {
        const txData = await txRes.json();
        const cashData = await cashRes.json();
        const bankData = await bankRes.json();
        setTransactions(txData);
        setCashAccounts(cashData);
        setBankAccounts(bankData);

        if (bankData.length > 0 && !chargeForm.bankAccountId) {
          setChargeForm(prev => ({ ...prev, bankAccountId: bankData[0]?.id || '' }));
        }
      }
    } catch (err) {
      console.error('Error fetching ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCategory, selectedAccountId, selectedType, fromDate, toDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleCreateCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    setChargeSubmitting(true);
    setChargeError('');

    const amt = parseFloat(chargeForm.amount) || 0;
    if (amt <= 0) {
      setChargeError('مبلغ العمولة يجب أن يكون أكبر من صفر');
      setChargeSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/banking/charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...chargeForm,
          amount: amt,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل العمولة البنكية');

      setShowChargeModal(false);
      setChargeForm(prev => ({ ...prev, amount: '', referenceNumber: '' }));
      await fetchData();
    } catch (err: any) {
      setChargeError(err.message);
    } finally {
      setChargeSubmitting(false);
    }
  };

  const totalInflow = transactions
    .filter(t => t.direction === 'INFLOW')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalOutflow = transactions
    .filter(t => t.direction === 'OUTFLOW')
    .reduce((sum, t) => sum + t.amount, 0);

  const netCashFlow = totalInflow - totalOutflow;

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'OPENING': return { label: 'رصيد افتتاحي', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
      case 'RECEIPT': return { label: 'سند قبض', color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' };
      case 'PAYMENT': return { label: 'سند صرف', color: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' };
      case 'CASH_DEPOSIT': return { label: 'إيداع نقدي', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' };
      case 'CASH_WITHDRAWAL': return { label: 'سحب نقدي', color: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' };
      case 'CASH_TRANSFER_IN':
      case 'BANK_TRANSFER_IN': return { label: 'تحويل وارد', color: 'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400' };
      case 'CASH_TRANSFER_OUT':
      case 'BANK_TRANSFER_OUT': return { label: 'تحويل صادر', color: 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' };
      case 'BANK_CHARGE': return { label: 'عمولات ومصروفات', color: 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400' };
      case 'ADJUSTMENT_IN': return { label: 'تسوية بالزيادة (فائض)', color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' };
      case 'ADJUSTMENT_OUT': return { label: 'تسوية بالنقص (عجز)', color: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400' };
      default: return { label: type, color: 'bg-slate-100 text-slate-700' };
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">سجل حركات النقدية والأستاذ العام</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              دفتر الأستاذ الموحد للحركات النقدية والمصرفية (المصدر الوحيد للحقيقة للأرصدة)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowChargeModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs transition-all shadow-sm shadow-purple-500/20"
          >
            <Plus size={15} />
            <span>تسجيل عمولة بنكية</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold"
          >
            <Printer size={15} />
            <span>طباعة</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400">إجمالي المقبوضات والوارد</span>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight mt-0.5">
              +{totalInflow.toLocaleString()} <span className="text-xs font-normal text-slate-400">ر.ي</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
            <ArrowDownLeft size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400">إجمالي المدفوعات والمنصرف</span>
            <div className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono tracking-tight mt-0.5">
              -{totalOutflow.toLocaleString()} <span className="text-xs font-normal text-slate-400">ر.ي</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600">
            <ArrowUpRight size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400">صافي حركة الفترة المحددة</span>
            <div
              className={`text-xl font-black font-mono tracking-tight mt-0.5 ${
                netCashFlow >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {netCashFlow >= 0 ? '+' : ''}
              {netCashFlow.toLocaleString()} <span className="text-xs font-normal text-slate-400">ر.ي</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600">
            <DollarSign size={20} />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Category */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">نوع الحساب</label>
            <select
              value={selectedCategory}
              onChange={e => {
                setSelectedCategory(e.target.value);
                setSelectedAccountId('ALL');
              }}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="ALL">جميع الحسابات (بنوك وصناديق)</option>
              <option value="BANK">الحسابات البنكية فقط</option>
              <option value="CASH">الخزائن والصناديق فقط</option>
            </select>
          </div>

          {/* Account */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">الحساب المحدد</label>
            <select
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="ALL">كل الحسابات</option>
              {selectedCategory !== 'CASH' &&
                bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    بنك: {b.bank_name} ({b.account_name})
                  </option>
                ))}
              {selectedCategory !== 'BANK' &&
                cashAccounts.map(c => (
                  <option key={c.id} value={c.id}>
                    صندوق: {c.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Transaction Type */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">نوع الحركة</label>
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="ALL">جميع أنواع الحركات</option>
              <option value="RECEIPT">سندات القبض</option>
              <option value="PAYMENT">سندات الصرف</option>
              <option value="CASH_DEPOSIT">إيداعات نقدية</option>
              <option value="CASH_WITHDRAWAL">سحوبات نقدية</option>
              <option value="BANK_CHARGE">عمولات ومصروفات بنكية</option>
              <option value="ADJUSTMENT_IN">تسوية بالزيادة (فائض)</option>
              <option value="ADJUSTMENT_OUT">تسوية بالنقص (عجز)</option>
              <option value="OPENING">أرصدة افتتاحية</option>
            </select>
          </div>

          {/* From Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">من تاريخ</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">إلى تاريخ</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 pt-1">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="بحث بالرقم أو البيان أو المستفيد..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-xl text-xs font-semibold hover:bg-slate-900 transition-all"
          >
            تطبيق البحث
          </button>
        </form>
      </div>

      {/* Transactions Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">جاري تحميل سجل الحركات...</div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">لا توجد حركات مسجلة تطابق الشروط المحددة</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">رقم الحركة</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">الحساب</th>
                  <th className="py-3 px-4">نوع الحركة</th>
                  <th className="py-3 px-4">البيان والتفاصيل</th>
                  <th className="py-3 px-4 text-left">وارد (مدين)</th>
                  <th className="py-3 px-4 text-left">منصرف (دائن)</th>
                  <th className="py-3 px-4 text-center">القيد المحاسبي</th>
                  <th className="py-3 px-4 text-center">المطابقة البنكية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {transactions.map(item => {
                  const typeInfo = getTypeLabel(item.transaction_type);
                  const accountLabel =
                    item.account_category === 'CASH'
                      ? item.cashAccountName || 'خزينة'
                      : `${item.bankName || 'بنك'} (${item.bankAccountName || ''})`;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        {item.transaction_number}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">{item.transaction_date}</td>
                      <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                        {accountLabel}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-sm truncate text-slate-600 dark:text-slate-300" title={item.description}>
                        {item.description}
                        {item.payee_or_payer && (
                          <span className="text-[10px] text-slate-400 block">طرف التعامل: {item.payee_or_payer}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-left font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {item.direction === 'INFLOW' ? `+${item.amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-left font-mono font-bold text-rose-600 dark:text-rose-400">
                        {item.direction === 'OUTFLOW' ? `-${item.amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.journalEntryNumber ? (
                          <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-blue-600 dark:text-blue-400">
                            {item.journalEntryNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.is_reconciled ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                            <CheckCircle2 size={13} />
                            <span>مطابق</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400 font-medium text-[10px]">
                            <Clock size={12} />
                            <span>معلق</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Direct Bank Charge */}
      {showChargeModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-600">
                  <Landmark size={20} />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">تسجيل عمولة ومصروفات بنكية مباشرة</h3>
              </div>
              <button onClick={() => setShowChargeModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {chargeError && (
              <div className="mx-5 mt-4 p-3 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{chargeError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCharge} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">الحساب البنكي *</label>
                <select
                  required
                  value={chargeForm.bankAccountId}
                  onChange={e => setChargeForm({ ...chargeForm, bankAccountId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                >
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} - {b.account_name} ({b.account_number})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">مبلغ العمولة *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={chargeForm.amount}
                    onChange={e => setChargeForm({ ...chargeForm, amount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">التاريخ *</label>
                  <input
                    type="date"
                    required
                    value={chargeForm.chargeDate}
                    onChange={e => setChargeForm({ ...chargeForm, chargeDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">رقم الإشعار / المرجع</label>
                <input
                  type="text"
                  placeholder="مثال: REF-CHG-9981"
                  value={chargeForm.referenceNumber}
                  onChange={e => setChargeForm({ ...chargeForm, referenceNumber: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">البيان *</label>
                <input
                  type="text"
                  required
                  value={chargeForm.description}
                  onChange={e => setChargeForm({ ...chargeForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div className="p-2.5 bg-purple-50/60 dark:bg-purple-950/40 rounded-xl text-[11px] text-purple-700 dark:text-purple-300">
                سيتم توليد قيد يومية آلياً:
                <br />- مدين: 5302 عمولات ومصروفات بنكية
                <br />- دائن: الحساب البنكي المحدد
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowChargeModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={chargeSubmitting}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {chargeSubmitting ? 'جاري التسجيل...' : 'تسجيل العمولة البنكية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
