import React, { useEffect, useState } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Receipt, 
  Layers, 
  CreditCard 
} from 'lucide-react';
import { recentTransactions } from '../../mock/dashboardData';
import { TransactionItem } from '../../types/dashboard';

export const RecentTransactions: React.FC = () => {
  const [transactions, setTransactions] = useState<TransactionItem[]>(recentTransactions);

  useEffect(() => {
    // Attempt to load live transactions from PostgreSQL API
    fetch('/api/journal-entries?limit=5')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          // Map DB entries to the transaction table structure
          const mapped: TransactionItem[] = data.map((d: any, idx: number) => {
            const isPosted = d.status === 'POSTED';
            let cat: TransactionItem['categoryType'] = 'journal';
            let typeLabel = 'قيد يومية';
            if (d.sourceId === 'SALES') { cat = 'sales'; typeLabel = 'فاتورة مبيعات'; }
            else if (d.sourceId === 'PURCHASES') { cat = 'purchase'; typeLabel = 'فاتورة مشتريات'; }
            else if (d.sourceId === 'RECEIPTS') { cat = 'receipt'; typeLabel = 'سند قبض'; }
            else if (d.sourceId === 'PAYMENTS') { cat = 'payment'; typeLabel = 'سند صرف'; }

            return {
              id: d.id || String(idx),
              type: typeLabel,
              code: d.entryNumber || `JE-2026-00${idx + 1}`,
              party: d.description?.split(':')[0]?.slice(0, 24) || 'العمليات المحاسبية',
              amount: parseFloat(d.totalDebit) || 0,
              formattedAmount: (parseFloat(d.totalDebit) || 0).toLocaleString(),
              time: d.createdAt ? new Date(d.createdAt).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }) : '10:00',
              status: isPosted ? 'مرحل' : 'مسجل',
              categoryType: cat,
            };
          });

          // Merge live entries with existing so table remains full and rich
          if (mapped.length >= 3) {
            setTransactions(mapped);
          } else {
            setTransactions([...mapped, ...recentTransactions.slice(mapped.length)]);
          }
        }
      })
      .catch(() => {
        // Fallback gracefully to demo transactions if offline
      });
  }, []);

  const getItemIcon = (category: TransactionItem['categoryType']) => {
    switch (category) {
      case 'sales':
        return (
          <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
            <ArrowUpRight size={15} />
          </div>
        );
      case 'receipt':
        return (
          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <ArrowDownLeft size={15} />
          </div>
        );
      case 'purchase':
        return (
          <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <Receipt size={15} />
          </div>
        );
      case 'journal':
        return (
          <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <Layers size={15} />
          </div>
        );
      case 'payment':
        return (
          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <CreditCard size={15} />
          </div>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-xs flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-extrabold text-slate-800">
          آخر العمليات
        </h2>
        <button className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
          عرض الكل
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100 pb-2">
              <th className="font-semibold pb-2 pr-1">النوع</th>
              <th className="font-semibold pb-2 px-2">الرقم</th>
              <th className="font-semibold pb-2 px-2">الطرف</th>
              <th className="font-semibold pb-2 px-2">المبلغ</th>
              <th className="font-semibold pb-2 px-2 text-center">التاريخ</th>
              <th className="font-semibold pb-2 pl-1 text-center">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80">
            {transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors group">
                {/* Type + Icon */}
                <td className="py-3 pr-1">
                  <div className="flex items-center gap-2">
                    {getItemIcon(tx.categoryType)}
                    <span className="font-semibold text-slate-700 whitespace-nowrap">
                      {tx.type}
                    </span>
                  </div>
                </td>

                {/* Code */}
                <td className="py-3 px-2">
                  <span className="font-mono font-bold text-blue-600 hover:underline cursor-pointer whitespace-nowrap">
                    {tx.code}
                  </span>
                </td>

                {/* Party */}
                <td className="py-3 px-2">
                  <span className="text-slate-600 font-medium whitespace-nowrap">
                    {tx.party}
                  </span>
                </td>

                {/* Amount */}
                <td className="py-3 px-2">
                  <span className="font-mono font-bold text-slate-900 whitespace-nowrap">
                    {tx.formattedAmount}
                  </span>
                </td>

                {/* Time */}
                <td className="py-3 px-2 text-center text-slate-400 font-mono text-[11px]">
                  {tx.time}
                </td>

                {/* Status Badge */}
                <td className="py-3 pl-1 text-center">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                      tx.status === 'مرحل'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                        : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                    }`}
                  >
                    {tx.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
