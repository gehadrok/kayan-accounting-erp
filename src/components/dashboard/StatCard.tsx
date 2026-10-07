import React from 'react';
import { TrendingUp, TrendingDown, ReceiptText, BarChart3, Wallet } from 'lucide-react';
import { KPICardData } from '../../types/dashboard';

export const StatCard: React.FC<{ data: KPICardData }> = ({ data }) => {
  const renderIcon = () => {
    switch (data.iconType) {
      case 'sales':
        return (
          <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
            <TrendingUp size={24} />
          </div>
        );
      case 'expenses':
        return (
          <div className="w-12 h-12 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-md shadow-rose-500/20">
            <ReceiptText size={24} />
          </div>
        );
      case 'profit':
        return (
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20">
            <BarChart3 size={24} />
          </div>
        );
      case 'cash':
        return (
          <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
            <Wallet size={24} />
          </div>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-xs hover:shadow-md hover:border-slate-300/80 transition-all duration-200 flex flex-col justify-between">
      {/* Top Row: Label on right, Icon on left */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-600">
          {data.title}
        </span>
        {renderIcon()}
      </div>

      {/* Middle: Amount & Currency */}
      <div className="mt-3">
        <div className="text-2xl lg:text-[26px] font-black text-slate-900 font-mono tracking-tight leading-none">
          {data.formattedAmount}
        </div>
        <div className="text-xs font-semibold text-slate-400 mt-1.5 font-sans">
          {data.currency}
        </div>
      </div>

      {/* Bottom: Trend or Subtext */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center text-xs">
        {data.trend ? (
          <div className={`flex items-center gap-1 font-bold ${
            data.trend.isPositive ? 'text-emerald-600' : 'text-rose-500'
          }`}>
            <span>{data.trend.isPositive ? '↑' : '↑'}</span>
            <span>{data.trend.percentage}%</span>
            <span className="text-slate-500 font-normal mr-1">{data.trend.periodText}</span>
          </div>
        ) : (
          <div className="text-slate-500 font-medium">
            {data.subtext}
          </div>
        )}
      </div>
    </div>
  );
};
