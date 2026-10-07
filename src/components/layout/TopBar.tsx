import React, { useState } from 'react';
import { Search, Bell, Sun, Moon, Globe, ChevronDown, ChevronsLeft, Minus, Square, X, User } from 'lucide-react';

export const TopBar = () => {
  const [isDark, setIsDark] = useState(false);

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-5 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Right side in RTL: Search Bar */}
      <div className="flex-1 max-w-xl">
        <div className="relative flex items-center">
          <input 
            type="text" 
            placeholder="إبحث (Ctrl+K) في النظام ..." 
            className="w-full h-10 pr-10 pl-10 bg-slate-50/80 hover:bg-slate-100/70 focus:bg-white border border-slate-200/90 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-right"
          />
          <Search className="absolute right-3.5 text-slate-400 pointer-events-none" size={17} />
          <div className="absolute left-3 flex items-center gap-1 text-slate-400 text-xs">
            <ChevronsLeft size={16} className="text-slate-400 hover:text-slate-600 cursor-pointer" />
          </div>
        </div>
      </div>

      {/* Left side in RTL: Controls & User Profile & Window buttons */}
      <div className="flex items-center gap-3">
        {/* Theme Toggle */}
        <button 
          onClick={() => setIsDark(!isDark)}
          className="w-9 h-9 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          title="تبديل المظهر"
        >
          {isDark ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button 
            className="w-9 h-9 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors relative"
            title="التنبيهات"
          >
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs">
              3
            </span>
          </button>
        </div>

        {/* Language selector badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50/80 border border-emerald-200/60 rounded-lg text-emerald-800 text-xs font-semibold cursor-pointer hover:bg-emerald-100/70 transition-colors">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
          <span>العربية</span>
          <Globe size={14} className="text-emerald-700" />
        </div>

        {/* User profile */}
        <div className="flex items-center gap-2.5 px-2 py-1 hover:bg-slate-100/80 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-200/60">
          <ChevronDown size={14} className="text-slate-400" />
          <div className="text-left select-none">
            <p className="text-sm font-bold text-slate-800 leading-tight">جهاد الصليحي</p>
            <p className="text-[11px] font-medium text-slate-500 text-left">مدير النظام</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-linear-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center font-bold text-sm shadow-xs border-2 border-white">
            <User size={18} />
          </div>
        </div>

        {/* Window Controls (Desktop App Shell look) */}
        <div className="flex items-center gap-1 mr-2 border-r border-slate-200 pr-2 text-slate-400">
          <button className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 rounded text-slate-500 transition-colors" title="تصغير">
            <Minus size={13} />
          </button>
          <button className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 rounded text-slate-500 transition-colors" title="تكبير">
            <Square size={11} />
          </button>
          <button className="w-7 h-7 flex items-center justify-center hover:bg-rose-500 hover:text-white rounded text-slate-500 transition-colors" title="إغلاق">
            <X size={13} />
          </button>
        </div>
      </div>
    </header>
  );
};
