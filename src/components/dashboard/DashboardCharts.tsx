import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Info,
  PieChart,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Card, EmptyState, LoadingState, StatusBadge, formatMoney } from '../ui';
import type { DashboardExpenseSlice, DashboardMonthlyPoint } from './types';
import {
  formatAmount,
  formatPeriodLabel,
  formatMonthShort,
  formatCompact,
} from './dashboardFormat';

/* ============================================================
   أدوات مشتركة للرسوم
   ============================================================ */

const COLOR = {
  receipts: 'var(--kayan-success)',
  payments: 'var(--kayan-danger)',
  net: 'var(--kayan-primary)',
  revenue: 'var(--kayan-success)',
  expenses: 'var(--kayan-danger)',
  grid: 'var(--kayan-line)',
  muted: 'var(--kayan-text-muted)',
  warning: 'var(--kayan-warning)',
};

const PIE_COLORS = [
  'var(--kayan-primary)',
  'var(--kayan-success)',
  '#8B5CF6',
  'var(--kayan-warning)',
  '#06B6D4',
  '#EC4899',
  '#64748B',
];

const ChartLegend: React.FC<{ items: Array<{ label: string; color: string }> }> = ({ items }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
    {items.map((item) => (
      <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
        {item.label}
      </span>
    ))}
  </div>
);

const ValueRow: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className="flex items-center justify-between gap-3 text-[11px]">
    <span className="inline-flex items-center gap-1.5 text-ink-muted">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
    <span className="kayan-numeric font-bold text-ink" dir="ltr">
      {formatMoney(value, { decimals: 0 })}
    </span>
  </div>
);

function tooltipPosition(centerX: number, width: number): React.CSSProperties {
  const ratio = Math.min(0.82, Math.max(0.18, centerX / width));
  return {
    left: `${ratio * 100}%`,
    transform: 'translateX(-50%)',
  };
}

/* ============================================================
   1. التدفقات النقدية — مقبوضات ومدفوعات وصافي التدفق
   ============================================================ */

interface CashFlowProps {
  data: DashboardMonthlyPoint[];
  loading?: boolean;
  error?: string | null;
  highlightMonth?: string | null;
}

export const CashFlowChart: React.FC<CashFlowProps> = ({ data, loading, error, highlightMonth }) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const chart = useMemo(() => {
    const width = 680;
    const height = 290;
    const padding = { top: 18, right: 12, bottom: 34, left: 48 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const maxBar = Math.max(0, ...data.flatMap((d) => [d.receipts, d.payments]));
    const netValues = data.map((d) => d.receipts - d.payments);
    const minNet = Math.min(0, ...netValues);
    const scaleMin = minNet < 0 ? minNet * 1.08 : 0;
    const scaleMax = maxBar > 0 ? maxBar * 1.08 : 1;
    const span = scaleMax - scaleMin || 1;
    const zeroY = padding.top + ((scaleMax - 0) / span) * innerH;
    const y = (value: number) => padding.top + ((scaleMax - value) / span) * innerH;
    const group = innerW / Math.max(data.length, 1);
    const barW = Math.min(14, Math.max(5, group * 0.26));

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const value = scaleMax - ratio * span;
      return { value, y: padding.top + ratio * innerH };
    });

    const netPoints = data.map((d, index) => ({
      x: padding.left + group * (index + 0.5),
      y: y(d.receipts - d.payments),
      value: d.receipts - d.payments,
    }));

    return {
      width,
      height,
      padding,
      innerW,
      innerH,
      group,
      barW,
      zeroY,
      y,
      ticks,
      netPoints,
      hasData: maxBar > 0,
      chartMin: scaleMin,
    };
  }, [data]);

  const highlightIndex = highlightMonth
    ? data.findIndex((point) => point.month === highlightMonth)
    : -1;

  const totals = useMemo(
    () =>
      data.reduce(
        (acc, point) => ({
          receipts: acc.receipts + point.receipts,
          payments: acc.payments + point.payments,
        }),
        { receipts: 0, payments: 0 }
      ),
    [data]
  );

  return (
    <Card
      title="التدفقات النقدية"
      description="المقبوضات والمدفوعات الشهرية من السندات المرحّلة"
      actions={
        <span className="rounded-pill border border-line bg-surface-muted px-2 py-1 text-[10px] font-bold text-ink-muted">
          شهري · {data[0]?.month?.slice(0, 4) || '—'}
        </span>
      }
      className="h-full"
    >
      <div className="flex min-h-[310px] flex-col">
        {loading ? (
          <LoadingState text="جارٍ تحميل التدفقات النقدية..." />
        ) : error ? (
          <EmptyState
            icon={<AlertCircle size={28} className="text-state-danger" />}
            title="تعذر تحميل التدفقات النقدية"
            description={error}
          />
        ) : !chart.hasData ? (
          <EmptyState
            icon={<BarChart3 size={30} />}
            title="لا توجد تدفقات نقدية في هذه السنة"
            description="لم تُرحّل أي سندات قبض أو صرف خلال السنة المعروضة حتى الآن."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <ChartLegend
                items={[
                  { label: 'المقبوضات', color: COLOR.receipts },
                  { label: 'المدفوعات', color: COLOR.payments },
                  { label: 'صافي التدفق', color: COLOR.net },
                ]}
              />
              <div className="flex flex-wrap gap-3 text-[11px]">
                <span className="text-ink-muted">
                  مقبوضات السنة:{' '}
                  <strong className="kayan-numeric text-state-success" dir="ltr">
                    {formatAmount(totals.receipts)}
                  </strong>
                </span>
                <span className="text-ink-muted">
                  مدفوعات السنة:{' '}
                  <strong className="kayan-numeric text-state-danger" dir="ltr">
                    {formatAmount(totals.payments)}
                  </strong>
                </span>
              </div>
            </div>

            <div className="relative mt-2 w-full">
              <svg
                viewBox={`0 0 ${chart.width} ${chart.height}`}
                className="h-[250px] w-full select-none overflow-visible sm:h-[270px]"
                role="img"
                aria-label={`رسم التدفقات النقدية الشهري للسنة. إجمالي المقبوضات ${formatMoney(
                  totals.receipts,
                  { decimals: 0 }
                )} وإجمالي المدفوعات ${formatMoney(totals.payments, { decimals: 0 })}.`}
              >
                <title>التدفقات النقدية الشهرية</title>
                {highlightIndex >= 0 && (
                  <rect
                    x={chart.padding.left + chart.group * highlightIndex}
                    y={chart.padding.top}
                    width={chart.group}
                    height={chart.innerH}
                    fill="var(--kayan-primary)"
                    opacity="0.07"
                  />
                )}

                {chart.ticks.map((tick) => (
                  <g key={tick.y}>
                    <line
                      x1={chart.padding.left}
                      x2={chart.width - chart.padding.right}
                      y1={tick.y}
                      y2={tick.y}
                      stroke={COLOR.grid}
                      strokeWidth="1"
                      strokeDasharray={Math.abs(tick.value) < 0.001 ? 'none' : '3 4'}
                      opacity={Math.abs(tick.value) < 0.001 ? 0.9 : 0.65}
                    />
                    <text
                      x={chart.padding.left - 8}
                      y={tick.y + 3}
                      textAnchor="end"
                      fontSize="10"
                      fill={COLOR.muted}
                      className="kayan-numeric"
                    >
                      {formatCompact(tick.value)}
                    </text>
                  </g>
                ))}

                {data.map((point, index) => {
                  const center = chart.padding.left + chart.group * (index + 0.5);
                  const receiptsY = chart.y(point.receipts);
                  const paymentsY = chart.y(point.payments);
                  const isHovered = hovered === index;
                  return (
                    <g key={point.month}>
                      {isHovered && (
                        <line
                          x1={center}
                          x2={center}
                          y1={chart.padding.top}
                          y2={chart.padding.top + chart.innerH}
                          stroke={COLOR.muted}
                          strokeWidth="1"
                          strokeDasharray="2 3"
                          opacity="0.6"
                        />
                      )}
                      <rect
                        x={center - chart.barW - 1.5}
                        y={receiptsY}
                        width={chart.barW}
                        height={Math.max(0, chart.zeroY - receiptsY)}
                        rx="2.5"
                        fill={COLOR.receipts}
                        opacity={isHovered ? 1 : 0.9}
                      />
                      <rect
                        x={center + 1.5}
                        y={paymentsY}
                        width={chart.barW}
                        height={Math.max(0, chart.zeroY - paymentsY)}
                        rx="2.5"
                        fill={COLOR.payments}
                        opacity={isHovered ? 1 : 0.9}
                      />
                      <text
                        x={center}
                        y={chart.height - 10}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight={isHovered ? '700' : '500'}
                        fill={isHovered ? 'var(--kayan-primary)' : COLOR.muted}
                      >
                        {formatMonthShort(point.month)}
                      </text>
                      <rect
                        x={chart.padding.left + chart.group * index}
                        y={chart.padding.top}
                        width={chart.group}
                        height={chart.innerH}
                        fill="transparent"
                        onMouseEnter={() => setHovered(index)}
                        onMouseLeave={() => setHovered(null)}
                      />
                    </g>
                  );
                })}

                <path
                  d={chart.netPoints.map((p, index) => `${index === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                  fill="none"
                  stroke={COLOR.net}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.9"
                />
                {chart.netPoints.map((point, index) => (
                  <circle
                    key={`net-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r={hovered === index ? 4 : 2.5}
                    fill="var(--kayan-surface)"
                    stroke={COLOR.net}
                    strokeWidth="2"
                  />
                ))}
              </svg>

              {hovered !== null && data[hovered] && (
                <div
                  className="pointer-events-none absolute top-1 z-10 w-[188px] rounded-control border border-line bg-surface p-2.5 text-start shadow-k-lg"
                  style={tooltipPosition(
                    chart.padding.left + chart.group * (hovered + 0.5),
                    chart.width
                  )}
                  dir="rtl"
                >
                  <p className="border-b border-line-soft pb-1 text-[11px] font-bold text-ink">
                    {formatPeriodLabel(data[hovered].month)}
                  </p>
                  <div className="mt-1.5 space-y-1">
                    <ValueRow label="المقبوضات" value={data[hovered].receipts} color={COLOR.receipts} />
                    <ValueRow label="المدفوعات" value={data[hovered].payments} color={COLOR.payments} />
                    <ValueRow
                      label="صافي التدفق"
                      value={data[hovered].receipts - data[hovered].payments}
                      color={COLOR.net}
                    />
                  </div>
                </div>
              )}
            </div>

            {highlightMonth && highlightIndex >= 0 && (
              <p className="mt-1 text-[10px] text-ink-muted">
                الشهر المحدد في الفلتر: <strong className="text-brand">{formatPeriodLabel(highlightMonth)}</strong>
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
};

/* ============================================================
   2. الأرباح والخسائر — إيرادات ومصروفات من دفتر الأستاذ
   ============================================================ */

interface ProfitLossProps {
  data: DashboardMonthlyPoint[];
  loading?: boolean;
  error?: string | null;
  highlightMonth?: string | null;
  chartYear: number;
}

export const ProfitLossChart: React.FC<ProfitLossProps> = ({
  data,
  loading,
  error,
  highlightMonth,
  chartYear,
}) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const chart = useMemo(() => {
    const width = 680;
    const height = 290;
    const padding = { top: 18, right: 12, bottom: 34, left: 56 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const allValues = data.flatMap((d) => [d.revenue, d.expenses]);
    const rawMax = Math.max(0, ...allValues);
    const rawMin = Math.min(0, ...allValues);
    const scaleMax = rawMax > 0 ? rawMax * 1.08 : 1;
    const scaleMin = rawMin < 0 ? rawMin * 1.08 : 0;
    const span = scaleMax - scaleMin || 1;
    const zeroY = padding.top + ((scaleMax - 0) / span) * innerH;
    const y = (value: number) => padding.top + ((scaleMax - value) / span) * innerH;
    const group = innerW / Math.max(data.length, 1);
    const barW = Math.min(14, Math.max(5, group * 0.26));

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      value: scaleMax - ratio * span,
      y: padding.top + ratio * innerH,
    }));

    return {
      width,
      height,
      padding,
      innerW,
      innerH,
      group,
      barW,
      zeroY,
      y,
      ticks,
      hasData: data.some((d) => d.revenue !== 0 || d.expenses !== 0),
      hasNegative: allValues.some((v) => v < -0.004),
    };
  }, [data]);

  const highlightIndex = highlightMonth
    ? data.findIndex((point) => point.month === highlightMonth)
    : -1;

  const totals = data.reduce(
    (acc, point) => ({
      revenue: acc.revenue + point.revenue,
      expenses: acc.expenses + point.expenses,
    }),
    { revenue: 0, expenses: 0 }
  );
  const net = totals.revenue - totals.expenses;

  return (
    <Card
      title="الأرباح والخسائر"
      description={`إيرادات ومصروفات القيود المرحّلة — السنة ${chartYear}`}
      actions={
        <span className="rounded-pill border border-line bg-surface-muted px-2 py-1 text-[10px] font-bold text-ink-muted">
          شهري
        </span>
      }
      className="h-full"
    >
      <div className="flex min-h-[310px] flex-col">
        {loading ? (
          <LoadingState text="جارٍ تحميل الأرباح والخسائر..." />
        ) : error ? (
          <EmptyState
            icon={<AlertCircle size={28} className="text-state-danger" />}
            title="تعذر تحميل الأرباح والخسائر"
            description={error}
          />
        ) : !chart.hasData ? (
          <EmptyState
            icon={<TrendingUp size={30} />}
            title="لا توجد قيود إيرادات أو مصروفات"
            description="لم تُرحّل قيود على حسابات الإيرادات أو المصروفات خلال السنة المعروضة."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <ChartLegend
                items={[
                  { label: 'الإيرادات', color: COLOR.revenue },
                  { label: 'المصروفات', color: COLOR.expenses },
                ]}
              />
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 text-ink-muted">
                  الصافي:{' '}
                  <strong
                    className={`kayan-numeric ${net >= 0 ? 'text-state-success' : 'text-state-danger'}`}
                    dir="ltr"
                  >
                    {formatAmount(net)}
                  </strong>
                  {net >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                </span>
              </div>
            </div>

            <div className="relative mt-2 w-full">
              <svg
                viewBox={`0 0 ${chart.width} ${chart.height}`}
                className="h-[250px] w-full select-none overflow-visible sm:h-[270px]"
                role="img"
                aria-label={`رسم الإيرادات والمصروفات الشهري للسنة ${chartYear}. إجمالي الإيرادات ${formatMoney(
                  totals.revenue,
                  { decimals: 0 }
                )} وإجمالي المصروفات ${formatMoney(totals.expenses, { decimals: 0 })}.`}
              >
                <title>الإيرادات والمصروفات الشهرية</title>
                {highlightIndex >= 0 && (
                  <rect
                    x={chart.padding.left + chart.group * highlightIndex}
                    y={chart.padding.top}
                    width={chart.group}
                    height={chart.innerH}
                    fill="var(--kayan-primary)"
                    opacity="0.07"
                  />
                )}

                {chart.ticks.map((tick) => (
                  <g key={tick.y}>
                    <line
                      x1={chart.padding.left}
                      x2={chart.width - chart.padding.right}
                      y1={tick.y}
                      y2={tick.y}
                      stroke={COLOR.grid}
                      strokeWidth="1"
                      strokeDasharray={Math.abs(tick.value) < 0.001 ? 'none' : '3 4'}
                      opacity={Math.abs(tick.value) < 0.001 ? 0.9 : 0.65}
                    />
                    <text
                      x={chart.padding.left - 8}
                      y={tick.y + 3}
                      textAnchor="end"
                      fontSize="10"
                      fill={COLOR.muted}
                      className="kayan-numeric"
                    >
                      {formatCompact(tick.value)}
                    </text>
                  </g>
                ))}

                {data.map((point, index) => {
                  const center = chart.padding.left + chart.group * (index + 0.5);
                  const revenueY = chart.y(point.revenue);
                  const expensesY = chart.y(point.expenses);
                  const isHovered = hovered === index;
                  const revenueHeight = Math.abs(revenueY - chart.zeroY);
                  const expensesHeight = Math.abs(expensesY - chart.zeroY);

                  return (
                    <g key={point.month}>
                      {isHovered && (
                        <line
                          x1={center}
                          x2={center}
                          y1={chart.padding.top}
                          y2={chart.padding.top + chart.innerH}
                          stroke={COLOR.muted}
                          strokeWidth="1"
                          strokeDasharray="2 3"
                          opacity="0.6"
                        />
                      )}
                      <rect
                        x={center - chart.barW - 1.5}
                        y={point.revenue >= 0 ? revenueY : chart.zeroY}
                        width={chart.barW}
                        height={Math.max(0, revenueHeight)}
                        rx="2.5"
                        fill={COLOR.revenue}
                        opacity={isHovered ? 1 : 0.9}
                      />
                      <rect
                        x={center + 1.5}
                        y={point.expenses >= 0 ? expensesY : chart.zeroY}
                        width={chart.barW}
                        height={Math.max(0, expensesHeight)}
                        rx="2.5"
                        fill={COLOR.expenses}
                        opacity={isHovered ? 1 : 0.9}
                      />
                      <text
                        x={center}
                        y={chart.height - 10}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight={isHovered ? '700' : '500'}
                        fill={isHovered ? 'var(--kayan-primary)' : COLOR.muted}
                      >
                        {formatMonthShort(point.month)}
                      </text>
                      <rect
                        x={chart.padding.left + chart.group * index}
                        y={chart.padding.top}
                        width={chart.group}
                        height={chart.innerH}
                        fill="transparent"
                        onMouseEnter={() => setHovered(index)}
                        onMouseLeave={() => setHovered(null)}
                      />
                    </g>
                  );
                })}
              </svg>

              {hovered !== null && data[hovered] && (
                <div
                  className="pointer-events-none absolute top-1 z-10 w-[200px] rounded-control border border-line bg-surface p-2.5 text-start shadow-k-lg"
                  style={tooltipPosition(
                    chart.padding.left + chart.group * (hovered + 0.5),
                    chart.width
                  )}
                  dir="rtl"
                >
                  <p className="border-b border-line-soft pb-1 text-[11px] font-bold text-ink">
                    {formatPeriodLabel(data[hovered].month)}
                  </p>
                  <div className="mt-1.5 space-y-1">
                    <ValueRow label="الإيرادات" value={data[hovered].revenue} color={COLOR.revenue} />
                    <ValueRow label="المصروفات" value={data[hovered].expenses} color={COLOR.expenses} />
                    <ValueRow
                      label="الصافي"
                      value={data[hovered].revenue - data[hovered].expenses}
                      color={COLOR.net}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-muted">
              <span>
                إجمالي الإيرادات{' '}
                <strong className="kayan-numeric text-ink" dir="ltr">
                  {formatAmount(totals.revenue)}
                </strong>{' '}
                · إجمالي المصروفات{' '}
                <strong className="kayan-numeric text-ink" dir="ltr">
                  {formatAmount(totals.expenses)}
                </strong>
              </span>
              {chart.hasNegative && (
                <span className="inline-flex items-center gap-1 text-state-warning">
                  <Info size={12} />
                  القيم السالبة معروضة كما هي في القيود المرحّلة.
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
};

/* ============================================================
   3. توزيع المصروفات — دونات للنسب الموجبة، أشرطة موقعة للسالبة
   ============================================================ */

interface ExpenseDistributionProps {
  data: DashboardExpenseSlice[];
  loading?: boolean;
  error?: string | null;
  periodLabel: string;
}

export const ExpenseDistribution: React.FC<ExpenseDistributionProps> = ({
  data,
  loading,
  error,
  periodLabel,
}) => {
  const [active, setActive] = useState<string | null>(null);

  const analysis = useMemo(() => {
    const slices = data.filter((slice) => Math.abs(slice.amount) > 0.004);
    const hasNegative = slices.some((slice) => slice.amount < 0);
    const totalPositive = slices
      .filter((slice) => slice.amount > 0)
      .reduce((sum, slice) => sum + slice.amount, 0);
    const maxAbs = Math.max(0, ...slices.map((slice) => Math.abs(slice.amount)));
    const sorted = [...slices].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    return { slices, sorted, hasNegative, totalPositive, maxAbs };
  }, [data]);

  const donut = useMemo(() => {
    const radius = 58;
    const strokeWidth = 22;
    const center = 82;
    const circumference = 2 * Math.PI * radius;
    let accumulated = 0;
    return analysis.slices
      .filter((slice) => slice.amount > 0)
      .map((slice, index) => {
        const share = analysis.totalPositive > 0 ? slice.amount / analysis.totalPositive : 0;
        const offset = accumulated;
        accumulated += share;
        return {
          ...slice,
          share,
          color: PIE_COLORS[index % PIE_COLORS.length],
          dasharray: `${share * circumference} ${circumference}`,
          dashoffset: -offset * circumference,
          radius,
          strokeWidth,
          center,
          circumference,
        };
      });
  }, [analysis]);

  return (
    <Card
      title="توزيع المصروفات"
      description={`أرصدة حسابات المصروفات — ${periodLabel}`}
      actions={
        analysis.hasNegative ? (
          <StatusBadge tone="warning" size="sm">
            قيم سالبة
          </StatusBadge>
        ) : (
          <span className="rounded-pill border border-line bg-surface-muted px-2 py-1 text-[10px] font-bold text-ink-muted">
            {analysis.slices.length} حسابات
          </span>
        )
      }
      className="h-full"
    >
      <div className="flex min-h-[310px] flex-col">
        {loading ? (
          <LoadingState text="جارٍ تحميل توزيع المصروفات..." />
        ) : error ? (
          <EmptyState
            icon={<AlertCircle size={28} className="text-state-danger" />}
            title="تعذر تحميل توزيع المصروفات"
            description={error}
          />
        ) : analysis.slices.length === 0 ? (
          <EmptyState
            icon={<PieChart size={30} />}
            title="لا توجد مصروفات في هذه الفترة"
            description="لم تُرحّل قيود على حسابات المصروفات خلال الفترة المحددة."
          />
        ) : analysis.hasNegative ? (
          <div className="flex flex-1 flex-col">
            <div className="mb-3 flex items-start gap-2 rounded-control border border-state-warning/30 bg-state-warning-soft px-3 py-2 text-[10px] leading-relaxed text-state-warning">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                بعض أرصدة الحسابات سالبة، لذا تُعرض أشرطة موقعة بدل النسب المئوية. جمعها كنسبة من
                إجمالي المصروفات قد يكون مضللاً.
              </span>
            </div>

            <div className="mb-2 flex items-center justify-between text-[10px] font-semibold text-ink-muted">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-state-danger" />
                سالب / دائن
              </span>
              <span className="text-ink-muted/70">الخط الأوسط = صفر</span>
              <span className="inline-flex items-center gap-1">
                موجب / مدين
                <span className="h-2 w-2 rounded-full bg-state-success" />
              </span>
            </div>

            <div className="flex-1 space-y-3">
              {analysis.sorted.map((slice) => {
                const percent = analysis.maxAbs > 0 ? (Math.abs(slice.amount) / analysis.maxAbs) * 100 : 0;
                const negative = slice.amount < 0;
                const activeRow = active === slice.code;
                return (
                  <div
                    key={slice.code}
                    onMouseEnter={() => setActive(slice.code)}
                    onMouseLeave={() => setActive(null)}
                    className={`rounded-control px-1 py-1 transition-colors ${
                      activeRow ? 'bg-surface-hover' : ''
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[11px] font-semibold text-ink">{slice.account}</span>
                      <span
                        className={`kayan-numeric shrink-0 text-[11px] font-black ${
                          negative ? 'text-state-danger' : 'text-state-success'
                        }`}
                        dir="ltr"
                        title={formatMoney(slice.amount, { decimals: 2 })}
                      >
                        {formatAmount(slice.amount)}
                      </span>
                    </div>
                    <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-pill bg-surface-sunken">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong/80" aria-hidden="true" />
                      <span
                        className={`absolute inset-y-0 ${
                          negative ? 'right-1/2 rounded-l-pill bg-state-danger/80' : 'left-1/2 rounded-r-pill bg-state-success/80'
                        }`}
                        style={{ width: `${Math.max(1.5, percent / 2)}%` }}
                      />
                    </div>
                    <div className="mt-0.5 flex justify-between text-[9px] text-ink-muted">
                      <span className="kayan-numeric" dir="ltr">{slice.code}</span>
                      <span>{negative ? 'رصيد دائن صافٍ' : 'رصيد مدين'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-center">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
              <div className="relative h-40 w-40 shrink-0">
                <svg viewBox="0 0 164 164" className="h-full w-full -rotate-90" role="img" aria-label="مخطط دائري لتوزيع المصروفات">
                  <title>توزيع المصروفات حسب الحساب</title>
                  <circle cx={82} cy={82} r={58} fill="none" stroke="var(--kayan-surface-sunken)" strokeWidth="22" />
                  {donut.map((slice) => (
                    <circle
                      key={slice.code}
                      cx={82}
                      cy={82}
                      r={slice.radius}
                      fill="transparent"
                      stroke={slice.color}
                      strokeWidth={active === slice.code ? slice.strokeWidth + 4 : slice.strokeWidth}
                      strokeDasharray={slice.dasharray}
                      strokeDashoffset={slice.dashoffset}
                      strokeLinecap="butt"
                      className="cursor-pointer transition-[stroke-width] duration-150"
                      onMouseEnter={() => setActive(slice.code)}
                      onMouseLeave={() => setActive(null)}
                    />
                  ))}
                </svg>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="kayan-numeric max-w-[100px] truncate text-base font-black text-ink" dir="ltr">
                    {formatAmount(analysis.totalPositive)}
                  </span>
                  <span className="mt-0.5 text-[9px] font-semibold text-ink-muted">ريال يمني</span>
                  <span className="mt-1 text-[9px] text-ink-muted">إجمالي المصروفات</span>
                </div>
              </div>

              <div className="w-full min-w-0 flex-1 space-y-1.5">
                {donut.map((slice) => (
                  <div
                    key={slice.code}
                    onMouseEnter={() => setActive(slice.code)}
                    onMouseLeave={() => setActive(null)}
                    className={`flex items-center justify-between gap-2 rounded-control px-2 py-1.5 transition-colors ${
                      active === slice.code ? 'bg-surface-hover' : ''
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-ink">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: slice.color }}
                        aria-hidden="true"
                      />
                      <span className="truncate" title={slice.account}>{slice.account}</span>
                    </span>
                    <span className="shrink-0 text-end">
                      <span className="kayan-numeric block text-[11px] font-bold text-ink">
                        {(slice.share * 100).toFixed(1)}%
                      </span>
                      <span className="kayan-numeric block text-[9px] text-ink-muted" dir="ltr">
                        {formatAmount(slice.amount)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-4 text-center text-[10px] text-ink-muted">
              النسبة محسوبة من إجمالي أرصدة حسابات المصروفات الموجبة فقط.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};
