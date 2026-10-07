import React from 'react';
import { Landmark } from 'lucide-react';
import { companyInfo } from '../../mock/dashboardData';

export const DashboardHeader: React.FC = () => {
  return (
    <div className="relative rounded-2xl overflow-hidden shadow-xs border border-slate-200/80 mb-5 bg-linear-to-r from-blue-100 via-sky-100 to-indigo-100 min-h-[120px] flex items-center">
      {/* Scenic Mountain Landscape Backdrop */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Soft sky and light gradient */}
        <div className="absolute inset-0 bg-linear-to-b from-sky-400/25 via-sky-200/30 to-amber-100/30" />

        {/* Realistic layered SVG mountain ranges resembling rugged hills */}
        <svg 
          className="absolute bottom-0 left-0 right-0 w-full h-24 object-cover opacity-35" 
          viewBox="0 0 1440 240" 
          preserveAspectRatio="none"
          fill="none"
        >
          {/* Distant mountain layer */}
          <path 
            d="M0,180 L80,140 L160,170 L260,110 L380,160 L480,90 L600,150 L720,80 L840,140 L960,70 L1080,130 L1200,90 L1320,150 L1440,110 L1440,240 L0,240 Z" 
            fill="#3B82F6" 
            fillOpacity="0.35"
          />
          {/* Midground rugged mountain ridge */}
          <path 
            d="M0,200 L90,165 L200,185 L310,135 L430,175 L540,120 L660,180 L770,115 L890,165 L1010,105 L1130,160 L1250,125 L1360,170 L1440,140 L1440,240 L0,240 Z" 
            fill="#1E40AF" 
            fillOpacity="0.45"
          />
          {/* Foreground textured rocky ridge */}
          <path 
            d="M0,220 L120,185 L240,210 L360,165 L490,205 L620,150 L740,195 L860,145 L980,190 L1100,140 L1220,185 L1340,160 L1440,175 L1440,240 L0,240 Z" 
            fill="#0F172A" 
            fillOpacity="0.3"
          />
        </svg>

        {/* Subtle cloud puffs and sun haze */}
        <div className="absolute top-2 right-1/4 w-48 h-12 bg-white/40 rounded-full blur-xl" />
        <div className="absolute top-4 left-1/3 w-64 h-16 bg-white/50 rounded-full blur-2xl" />
        {/* Soft edge gradient to ensure maximum text legibility */}
        <div className="absolute inset-0 bg-linear-to-l from-white/90 via-white/70 to-white/40" />
      </div>

      {/* Content Area */}
      <div className="relative z-10 w-full px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Right side in RTL: Welcome Message */}
        <div className="text-right">
          <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>{companyInfo.userGreeting}</span>
          </h1>
          <p className="text-sm font-semibold text-slate-600 mt-1">
            {companyInfo.dateSummary}
          </p>
        </div>

        {/* Left side in RTL: Floating Company Card */}
        <div className="flex items-center gap-3.5 bg-white/90 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-sm border border-white/80 hover:shadow-md transition-shadow">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0 shadow-xs">
            <Landmark size={22} className="text-blue-600" />
          </div>
          <div className="text-right">
            <h2 className="text-sm font-extrabold text-slate-900 leading-tight">
              {companyInfo.name}
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              {companyInfo.branch}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
