import React from 'react';
import { 
  Users, 
  UserCheck, 
  Package, 
  Warehouse, 
  ReceiptText, 
  FileText 
} from 'lucide-react';
import { MiniStatItem } from '../../types/dashboard';

export const MiniStatCard: React.FC<{ item: MiniStatItem }> = ({ item }) => {
  const getIcon = () => {
    switch (item.iconType) {
      case 'customers':
        return <Users size={20} className="text-blue-600" />;
      case 'suppliers':
        return <UserCheck size={20} className="text-purple-600" />;
      case 'items':
        return <Package size={20} className="text-orange-600" />;
      case 'warehouses':
        return <Warehouse size={20} className="text-emerald-600" />;
      case 'invoices':
        return <ReceiptText size={20} className="text-rose-600" />;
      case 'documents':
        return <FileText size={20} className="text-sky-600" />;
    }
  };

  const getBgClass = () => {
    switch (item.iconType) {
      case 'customers':
        return 'bg-blue-50 text-blue-600';
      case 'suppliers':
        return 'bg-purple-50 text-purple-600';
      case 'items':
        return 'bg-orange-50 text-orange-600';
      case 'warehouses':
        return 'bg-emerald-50 text-emerald-600';
      case 'invoices':
        return 'bg-rose-50 text-rose-600';
      case 'documents':
        return 'bg-sky-50 text-sky-600';
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200/70 shadow-xs hover:shadow-md hover:border-slate-300/80 transition-all duration-200 flex items-center justify-between">
      {/* Icon on left in LTR / right in visual RTL layout */}
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${getBgClass()}`}>
        {getIcon()}
      </div>

      {/* Info on right */}
      <div className="text-right">
        <span className="text-xs font-bold text-slate-500 block">
          {item.title}
        </span>
        <span className="text-xl font-black font-mono text-slate-900 block leading-tight mt-0.5">
          {item.value}
        </span>
        <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
          {item.subtext}
        </span>
      </div>
    </div>
  );
};
