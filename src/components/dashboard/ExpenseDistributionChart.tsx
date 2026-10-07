import React, { useState } from 'react';
import { expenseCategories } from '../../mock/dashboardData';

export const ExpenseDistributionChart: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = expenseCategories;
  const radius = 62;
  const strokeWidth = 24;
  const center = 90;
  const circumference = 2 * Math.PI * radius;

  // Calculate SVG stroke-dasharray and stroke-dashoffset for each slice
  let accumulatedPercent = 0;
  const slices = categories.map((cat) => {
    const strokeDasharray = `${(cat.percentage / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
    accumulatedPercent += cat.percentage;
    return {
      ...cat,
      strokeDasharray,
      strokeDashoffset,
    };
  });

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-xs flex flex-col justify-between h-full">
      {/* Title */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-extrabold text-slate-800">
          توزيع المصروفات
        </h2>
      </div>

      {/* Donut Chart & Legend layout */}
      <div className="flex items-center justify-between gap-2 py-2">
        {/* Donut Chart with Center Text */}
        <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 180 180">
            {slices.map((slice) => {
              const isHovered = activeCategory === slice.id;
              return (
                <circle
                  key={slice.id}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={slice.strokeDasharray}
                  strokeDashoffset={slice.strokeDashoffset}
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setActiveCategory(slice.id)}
                  onMouseLeave={() => setActiveCategory(null)}
                />
              );
            })}
          </svg>

          {/* Center text in donut */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
            <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">
              74.2M
            </span>
            <span className="text-[11px] font-semibold text-slate-400 mt-0.5 font-sans">
              ريال يمني
            </span>
          </div>
        </div>

        {/* Legend List */}
        <div className="flex-1 space-y-2.5 pr-2">
          {categories.map((cat) => {
            const isHovered = activeCategory === cat.id;
            return (
              <div
                key={cat.id}
                onMouseEnter={() => setActiveCategory(cat.id)}
                onMouseLeave={() => setActiveCategory(null)}
                className={`flex items-center justify-between text-xs py-1 px-2 rounded-lg cursor-pointer transition-colors ${
                  isHovered ? 'bg-slate-100 font-bold' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-xs"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-slate-700 font-medium">{cat.name}</span>
                </div>
                <span className="font-mono font-bold text-slate-900">
                  {cat.percentage}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
