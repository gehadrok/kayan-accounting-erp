import React, { useState } from 'react';
import { monthlyFinancialData } from '../../mock/dashboardData';

export const FinancialPerformanceChart: React.FC = () => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const data = monthlyFinancialData;
  const maxVal = 150; // 150M max scale
  const height = 220;
  const width = 640;
  const paddingX = 40;
  const paddingY = 25;
  const chartHeight = height - paddingY * 2;
  const chartWidth = width - paddingX * 2;

  // Calculate coordinates for points
  const points = data.map((d, i) => {
    const x = paddingX + (i / (data.length - 1)) * chartWidth;
    const ySales = height - paddingY - (d.sales / maxVal) * chartHeight;
    const yExpenses = height - paddingY - (d.expenses / maxVal) * chartHeight;
    const yProfit = height - paddingY - (d.profit / maxVal) * chartHeight;
    return { x, ySales, yExpenses, yProfit, ...d };
  });

  // Generate smooth SVG paths
  const createSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? i : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };

  const salesPath = createSmoothPath(points.map(p => ({ x: p.x, y: p.ySales })));
  const expensesPath = createSmoothPath(points.map(p => ({ x: p.x, y: p.yExpenses })));
  const profitPath = createSmoothPath(points.map(p => ({ x: p.x, y: p.yProfit })));

  // Area paths for gradient fills
  const salesArea = `${salesPath} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;
  const profitArea = `${profitPath} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-xs flex flex-col justify-between h-full">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-base font-extrabold text-slate-800">
          الأداء المالي خلال 12 شهر
        </h2>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-bold">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block shadow-xs" />
            <span className="text-slate-600">المبيعات</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-xs" />
            <span className="text-slate-600">المصروفات</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-xs" />
            <span className="text-slate-600">صافي الربح</span>
          </div>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative w-full overflow-hidden">
        {/* Y Axis Legend labels on the left */}
        <div className="absolute left-1 top-0 bottom-6 flex flex-col justify-between text-[11px] font-mono font-medium text-slate-400 select-none">
          <span>150M</span>
          <span>100M</span>
          <span>50M</span>
          <span>0</span>
        </div>

        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-56 overflow-visible select-none"
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.333, 0.666, 1].map((pct, idx) => {
            const y = paddingY + pct * chartHeight;
            return (
              <line
                key={idx}
                x1={paddingX}
                y1={y}
                x2={width - 10}
                y2={y}
                stroke="#E2E8F0"
                strokeWidth="1"
                strokeDasharray={idx === 3 ? 'none' : '3 3'}
              />
            );
          })}

          {/* Area Fills */}
          <path d={salesArea} fill="url(#salesGrad)" />
          <path d={profitArea} fill="url(#profitGrad)" />

          {/* Lines */}
          <path d={salesPath} fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" />
          <path d={expensesPath} fill="none" stroke="#F43F5E" strokeWidth="2.5" strokeLinecap="round" />
          <path d={profitPath} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />

          {/* Points & Hover detectors */}
          {points.map((pt, idx) => {
            const isHovered = hoveredIndex === idx;
            return (
              <g 
                key={pt.month} 
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="cursor-pointer"
              >
                {/* Vertical indicator line when hovered */}
                {isHovered && (
                  <line 
                    x1={pt.x} 
                    y1={paddingY} 
                    x2={pt.x} 
                    y2={height - paddingY} 
                    stroke="#94A3B8" 
                    strokeWidth="1.5" 
                    strokeDasharray="2 2" 
                  />
                )}

                {/* Sales dot */}
                <circle 
                  cx={pt.x} 
                  cy={pt.ySales} 
                  r={isHovered ? 5.5 : 3.5} 
                  fill="#FFFFFF" 
                  stroke="#2563EB" 
                  strokeWidth="2.5" 
                  className="transition-all duration-150"
                />

                {/* Expenses dot */}
                <circle 
                  cx={pt.x} 
                  cy={pt.yExpenses} 
                  r={isHovered ? 5.5 : 3.5} 
                  fill="#FFFFFF" 
                  stroke="#F43F5E" 
                  strokeWidth="2.5" 
                  className="transition-all duration-150"
                />

                {/* Profit dot */}
                <circle 
                  cx={pt.x} 
                  cy={pt.yProfit} 
                  r={isHovered ? 5.5 : 3.5} 
                  fill="#FFFFFF" 
                  stroke="#10B981" 
                  strokeWidth="2.5" 
                  className="transition-all duration-150"
                />

                {/* X Axis Month Label */}
                <text
                  x={pt.x}
                  y={height - 5}
                  textAnchor="middle"
                  className={`text-[11px] font-sans font-medium transition-colors ${
                    isHovered ? 'fill-blue-600 font-bold' : 'fill-slate-500'
                  }`}
                >
                  {pt.month}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip when hovering a month */}
        {hoveredIndex !== null && (
          <div 
            className="absolute top-2 bg-slate-900/95 backdrop-blur-xs text-white text-xs p-2.5 rounded-xl shadow-xl pointer-events-none border border-slate-700/80 z-20 min-w-[150px]"
            style={{ 
              right: `${Math.max(10, Math.min(80, (1 - hoveredIndex / (data.length - 1)) * 90))}%` 
            }}
          >
            <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1.5 text-center">
              شهر {data[hoveredIndex].month}
            </p>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between items-center gap-2">
                <span className="text-blue-300">المبيعات:</span>
                <span className="font-mono font-bold">{data[hoveredIndex].sales}M ريال</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-rose-300">المصروفات:</span>
                <span className="font-mono font-bold">{data[hoveredIndex].expenses}M ريال</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-emerald-300">صافي الربح:</span>
                <span className="font-mono font-bold">{data[hoveredIndex].profit}M ريال</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
