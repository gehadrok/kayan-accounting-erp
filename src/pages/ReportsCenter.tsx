import React, { useState } from 'react';
import { 
  FileText, 
  Search, 
  Printer, 
  Download, 
  ArrowLeft, 
  ShieldCheck, 
  BookOpen, 
  Scale, 
  TrendingUp, 
  Users, 
  ShoppingCart, 
  Truck, 
  Package, 
  Wallet, 
  Building, 
  Layers, 
  Receipt, 
  BarChart,
  Filter
} from 'lucide-react';
import { REPORT_REGISTRY, REPORT_CATEGORIES, ReportDefinition } from '../services/reportRegistry';
import { useNavigation } from '../context/NavigationContext';

export const ReportsCenter: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const { navigateTo } = useNavigation();

  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case 'BookOpen': return <BookOpen size={18} className="text-blue-600" />;
      case 'Scale': return <Scale size={18} className="text-indigo-600" />;
      case 'TrendingUp': return <TrendingUp size={18} className="text-emerald-600" />;
      case 'Users': return <Users size={18} className="text-amber-600" />;
      case 'ShoppingCart': return <ShoppingCart size={18} className="text-purple-600" />;
      case 'Truck': return <Truck size={18} className="text-orange-600" />;
      case 'Package': return <Package size={18} className="text-cyan-600" />;
      case 'Wallet': return <Wallet size={18} className="text-green-600" />;
      case 'Building': return <Building size={18} className="text-blue-500" />;
      case 'Layers': return <Layers size={18} className="text-rose-600" />;
      case 'Receipt': return <Receipt size={18} className="text-yellow-600" />;
      case 'ShieldCheck': return <ShieldCheck size={18} className="text-indigo-500" />;
      default: return <BarChart size={18} className="text-slate-600" />;
    }
  };

  const filteredReports = REPORT_REGISTRY.filter(rep => {
    const matchesSearch = rep.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          rep.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'ALL' || rep.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6 pb-8" dir="rtl">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-200 text-sm font-semibold mb-1">
            <FileText size={16} />
            <span>نظام كيان المحاسبي ERP</span>
          </div>
          <h1 className="text-2xl font-bold font-cairo">مركز التقارير المركزي (Central Report Center)</h1>
          <p className="text-blue-100 text-sm mt-1">البوابة الشاملة للوصول إلى كافة التقارير المالية والإدارية والمحاسبية والمخزنية</p>
        </div>
        <div className="flex items-center gap-2 bg-blue-950/60 px-4 py-2 rounded-xl border border-blue-700/50 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>إجمالي التقارير المتاحة: <strong>{REPORT_REGISTRY.length} تقريراً</strong></span>
        </div>
      </div>

      {/* 2. Search & Category Filters */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute right-3.5 top-3 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="بحث في اسم أو وصف التقرير..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              selectedCategory === 'ALL'
                ? 'bg-blue-900 text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            جميع التقارير
          </button>
          {REPORT_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === cat.id
                  ? 'bg-blue-900 text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {getCategoryIcon(cat.icon)}
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredReports.map(rep => {
          const categoryObj = REPORT_CATEGORIES.find(c => c.id === rep.category);
          return (
            <div 
              key={rep.id}
              onClick={() => navigateTo(`/reports/view/${rep.id}`)}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div>
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-900 border border-blue-100 group-hover:bg-blue-900 group-hover:text-white transition-colors">
                    <FileText size={20} />
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
                    {categoryObj?.name || rep.category}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-800 group-hover:text-blue-900 transition-colors mb-2">
                  {rep.name}
                </h3>
                <p className="text-slate-600 text-xs leading-relaxed mb-4 line-clamp-2">
                  {rep.description}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-auto">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <span>الصيغ:</span>
                  <span className="font-bold text-slate-700">{rep.exportFormats.join(', ')}</span>
                </div>
                
                <button className="flex items-center gap-1 text-xs font-bold text-blue-900 group-hover:translate-x-[-4px] transition-transform">
                  <span>عرض التقرير</span>
                  <ArrowLeft size={14} />
                </button>
              </div>
            </div>
          );
        })}

        {filteredReports.length === 0 && (
          <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200">
            <FileText size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-lg font-bold text-slate-700">لا توجد تقارير مطابقة للبحث</h3>
            <p className="text-slate-500 text-sm mt-1">جرب البحث بكلمات أخرى أو اختر تصنيفاً مختلفاً</p>
          </div>
        )}
      </div>
    </div>
  );
};
