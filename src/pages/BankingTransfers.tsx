import React, { useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Building2,
  Wallet,
  Landmark,
  X,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  FileText
} from 'lucide-react';

interface TransferItem {
  id: string;
  transfer_number: string;
  transfer_date: string;
  transfer_type: 'CASH_TO_CASH' | 'BANK_TO_BANK' | 'CASH_TO_BANK' | 'BANK_TO_CASH';
  from_category: 'CASH' | 'BANK';
  fromCashName?: string;
  fromBankName?: string;
  fromBankAccountName?: string;
  to_category: 'CASH' | 'BANK';
  toCashName?: string;
  toBankName?: string;
  toBankAccountName?: string;
  amount: number;
  fee_amount: number;
  description: string;
  status: string;
  journalEntryNumber?: string;
  created_at: string;
}

interface AccountOption {
  id: string;
  name: string;
  category: 'CASH' | 'BANK';
  balance: number;
}

export const BankingTransfersPage: React.FC = () => {
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  // New Transfer Modal
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [form, setForm] = useState({
    transferDate: new Date().toISOString().split('T')[0],
    transferType: 'CASH_TO_CASH' as 'CASH_TO_CASH' | 'BANK_TO_BANK' | 'CASH_TO_BANK' | 'BANK_TO_CASH',
    fromCategory: 'CASH' as 'CASH' | 'BANK',
    fromCashAccountId: '',
    fromBankAccountId: '',
    toCategory: 'CASH' as 'CASH' | 'BANK',
    toCashAccountId: '',
    toBankAccountId: '',
    amount: '',
    feeAmount: '0',
    description: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [trfRes, cashRes, bankRes] = await Promise.all([
        fetch('/api/banking/transfers'),
        fetch('/api/banking/cash-accounts'),
        fetch('/api/banking/bank-accounts'),
      ]);

      if (trfRes.ok && cashRes.ok && bankRes.ok) {
        const trfData = await trfRes.json();
        const cashData = await cashRes.json();
        const bankData = await bankRes.json();
        setTransfers(trfData);
        setCashAccounts(cashData);
        setBankAccounts(bankData);

        // Pre-select defaults if available
        if (cashData.length > 0) {
          setForm(prev => ({
            ...prev,
            fromCashAccountId: cashData[0]?.id || '',
            toCashAccountId: cashData[1]?.id || cashData[0]?.id || '',
          }));
        }
        if (bankData.length > 0) {
          setForm(prev => ({
            ...prev,
            fromBankAccountId: bankData[0]?.id || '',
            toBankAccountId: bankData[1]?.id || bankData[0]?.id || '',
          }));
        }
      }
    } catch (err) {
      console.error('Error fetching transfers data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTypeChange = (type: 'CASH_TO_CASH' | 'BANK_TO_BANK' | 'CASH_TO_BANK' | 'BANK_TO_CASH') => {
    let fromCat: 'CASH' | 'BANK' = 'CASH';
    let toCat: 'CASH' | 'BANK' = 'CASH';

    if (type === 'BANK_TO_BANK') {
      fromCat = 'BANK';
      toCat = 'BANK';
    } else if (type === 'CASH_TO_BANK') {
      fromCat = 'CASH';
      toCat = 'BANK';
    } else if (type === 'BANK_TO_CASH') {
      fromCat = 'BANK';
      toCat = 'CASH';
    }

    setForm({
      ...form,
      transferType: type,
      fromCategory: fromCat,
      toCategory: toCat,
    });
  };

  const getSourceBalance = (): number => {
    if (form.fromCategory === 'CASH') {
      const acc = cashAccounts.find(c => c.id === form.fromCashAccountId);
      return acc?.currentBalance || 0;
    } else {
      const acc = bankAccounts.find(b => b.id === form.fromBankAccountId);
      return acc?.currentBalance || 0;
    }
  };

  const getDestBalance = (): number => {
    if (form.toCategory === 'CASH') {
      const acc = cashAccounts.find(c => c.id === form.toCashAccountId);
      return acc?.currentBalance || 0;
    } else {
      const acc = bankAccounts.find(b => b.id === form.toBankAccountId);
      return acc?.currentBalance || 0;
    }
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    const amt = parseFloat(form.amount) || 0;
    const fee = parseFloat(form.feeAmount) || 0;
    const avail = getSourceBalance();

    if (amt <= 0) {
      setErrorMsg('مبلغ التحويل يجب أن يكون أكبر من صفر');
      setSubmitting(false);
      return;
    }

    if (avail < amt + fee) {
      setErrorMsg(`الرصيد المتاح (${avail.toLocaleString()} ر.ي) غير كافٍ لتغطية المبلغ والرسوم`);
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/banking/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: amt,
          feeAmount: fee,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تنفيذ عملية التحويل');

      setShowModal(false);
      setForm(prev => ({
        ...prev,
        amount: '',
        feeAmount: '0',
        description: '',
      }));
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTransfers = transfers.filter(t => {
    const matchesSearch =
      t.transfer_number.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      (t.fromBankName && t.fromBankName.includes(search)) ||
      (t.fromCashName && t.fromCashName.includes(search)) ||
      (t.toBankName && t.toBankName.includes(search)) ||
      (t.toCashName && t.toCashName.includes(search));

    const matchesFilter = filterType === 'ALL' || t.transfer_type === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
            <ArrowRightLeft size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">التحويلات النقدية والبنكية</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              إدارة التحويلات بين الصناديق والبنوك، الإيداعات والسحوبات مع توليد القيود المحاسبية آلياً
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-all shadow-sm shadow-indigo-500/20"
        >
          <Plus size={16} />
          <span>إجراء تحويل جديد</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'الكل' },
            { id: 'CASH_TO_CASH', label: 'بين الصناديق' },
            { id: 'BANK_TO_BANK', label: 'بين البنوك' },
            { id: 'CASH_TO_BANK', label: 'إيداع بنكي' },
            { id: 'BANK_TO_CASH', label: 'سحب نقدي' },
          ].map(btn => (
            <button
              key={btn.id}
              onClick={() => setFilterType(btn.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                filterType === btn.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="بحث برقم السند أو الوصف..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-3 pr-9 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
        </div>
      </div>

      {/* Transfers Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">جاري تحميل سجل التحويلات...</div>
        ) : filteredTransfers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">لا توجد تحويلات مسجلة مطابقة للبحث</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">رقم التحويل</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">نوع التحويل</th>
                  <th className="py-3 px-4">من الحساب</th>
                  <th className="py-3 px-4">إلى الحساب</th>
                  <th className="py-3 px-4 text-left">المبلغ والرسوم</th>
                  <th className="py-3 px-4">البيان</th>
                  <th className="py-3 px-4 text-center">القيد المحاسبي</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {filteredTransfers.map(item => {
                  const fromLabel =
                    item.from_category === 'CASH'
                      ? item.fromCashName || 'صندوق نقدية'
                      : `${item.fromBankName || 'بنك'} (${item.fromBankAccountName || ''})`;

                  const toLabel =
                    item.to_category === 'CASH'
                      ? item.toCashName || 'صندوق نقدية'
                      : `${item.toBankName || 'بنك'} (${item.toBankAccountName || ''})`;

                  const typeBadge =
                    item.transfer_type === 'CASH_TO_CASH'
                      ? { label: 'بين الصناديق', color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' }
                      : item.transfer_type === 'BANK_TO_BANK'
                      ? { label: 'بين البنوك', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' }
                      : item.transfer_type === 'CASH_TO_BANK'
                      ? { label: 'إيداع بنكي', color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400' }
                      : { label: 'سحب نقدي', color: 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400' };

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        {item.transfer_number}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">{item.transfer_date}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${typeBadge.color}`}>
                          {typeBadge.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                        {fromLabel}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                        {toLabel}
                      </td>
                      <td className="py-3.5 px-4 text-left font-mono font-bold text-slate-900 dark:text-white">
                        {item.amount.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">ر.ي</span>
                        {item.fee_amount > 0 && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">
                            رسوم: {item.fee_amount.toLocaleString()} ر.ي
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs truncate text-slate-500 dark:text-slate-400" title={item.description}>
                        {item.description}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {item.journalEntryNumber ? (
                          <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-blue-600 dark:text-blue-400">
                            {item.journalEntryNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                          <CheckCircle2 size={13} />
                          <span>منفذ</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: New Transfer */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600">
                  <ArrowRightLeft size={20} />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">إجراء تحويل مالي / إيداع / سحب</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="mx-5 mt-4 p-3 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateTransfer} className="p-5 space-y-4">
              {/* Transfer Type Select */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">نوع العملية *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'CASH_TO_CASH', label: 'بين الصناديق' },
                    { id: 'BANK_TO_BANK', label: 'بين البنوك' },
                    { id: 'CASH_TO_BANK', label: 'إيداع بنكي' },
                    { id: 'BANK_TO_CASH', label: 'سحب نقدي' },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleTypeChange(t.id as any)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all border ${
                        form.transferType === t.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source & Destination Account Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                {/* Source Account */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">من الحساب (المصدر) *</label>
                    <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                      المتاح: {getSourceBalance().toLocaleString()} ر.ي
                    </span>
                  </div>
                  {form.fromCategory === 'CASH' ? (
                    <select
                      value={form.fromCashAccountId}
                      onChange={e => setForm({ ...form, fromCashAccountId: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      {cashAccounts.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.currentBalance.toLocaleString()} ر.ي)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={form.fromBankAccountId}
                      onChange={e => setForm({ ...form, fromBankAccountId: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      {bankAccounts.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.bank_name} - {b.account_name} ({b.currentBalance.toLocaleString()} ر.ي)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Destination Account */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">إلى الحساب (المستلم) *</label>
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      الحالي: {getDestBalance().toLocaleString()} ر.ي
                    </span>
                  </div>
                  {form.toCategory === 'CASH' ? (
                    <select
                      value={form.toCashAccountId}
                      onChange={e => setForm({ ...form, toCashAccountId: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      {cashAccounts.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.currentBalance.toLocaleString()} ر.ي)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={form.toBankAccountId}
                      onChange={e => setForm({ ...form, toBankAccountId: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      {bankAccounts.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.bank_name} - {b.account_name} ({b.currentBalance.toLocaleString()} ر.ي)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Amount, Fee & Date */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">مبلغ التحويل *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">عمولة التحويل</label>
                  <input
                    type="number"
                    step="any"
                    value={form.feeAmount}
                    onChange={e => setForm({ ...form, feeAmount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">تاريخ التحويل *</label>
                  <input
                    type="date"
                    required
                    value={form.transferDate}
                    onChange={e => setForm({ ...form, transferDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">بيان التحويل / الوصف *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: تغذية السيولة النقدية / إيداع متحصلات المبيعات..."
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Automatic Double Entry Preview Indicator */}
              <div className="p-3 bg-blue-50/60 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-900/50 text-[11px] text-blue-700 dark:text-blue-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 size={13} />
                  <span>توليد وترحيل آلي للقيد المحاسبي المتوازن (Double-Entry Posting):</span>
                </div>
                <div className="text-slate-600 dark:text-slate-400 font-mono text-[10px] pl-4">
                  - مدين: الحساب المستلم ({parseFloat(form.amount || '0').toLocaleString()} ر.ي)
                  {parseFloat(form.feeAmount || '0') > 0 && ` + مدين: عمولات بنكية (${parseFloat(form.feeAmount || '0').toLocaleString()} ر.ي)`}
                  <br />- دائن: الحساب المصدر ({(parseFloat(form.amount || '0') + parseFloat(form.feeAmount || '0')).toLocaleString()} ر.ي)
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {submitting ? 'جاري التنفيذ والترحيل...' : 'تنفيذ التحويل المالي'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
