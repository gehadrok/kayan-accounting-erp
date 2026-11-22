import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CreditCard,
  Package,
  RefreshCw,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import { DashboardHero } from '../components/dashboard/DashboardHero';
import {
  CashFlowChart,
  ExpenseDistribution,
  ProfitLossChart,
} from '../components/dashboard/DashboardCharts';
import {
  AlertsTasksCard,
  LatestDocumentsCard,
  LatestJournalsCard,
  MainAccountsCard,
  TopCustomersCard,
  TopSuppliersCard,
} from '../components/dashboard/DashboardTables';
import {
  ARABIC_MONTHS,
  DOCUMENT_META,
  formatAmount,
  formatAmountExact,
  formatPeriodLabel,
} from '../components/dashboard/dashboardFormat';
import type { DashboardAlert, DashboardDocument, DashboardOverview } from '../components/dashboard/types';
import { Button, KpiCard, Select, StatusBadge, type KpiTrend } from '../components/ui';
import { useNavigation } from '../context/NavigationContext';

/* ============================================================
   PHASE 10.6.2 — لوحة التحكم الفعلية
   ------------------------------------------------------------
   كل رقم في هذه الشاشة يأتي من `/api/dashboard/overview` الذي
   يقرأ الجداول الفعلية. لا تُستخدم بيانات mock هنا. الفلاتر
   حقيقية: السنة والشهر يعيدان جلب الفترة من الخادم، والرسم
   الشهري يعرض السنة كاملة مع تمييز الشهر المختار.
   ============================================================ */

type KpiKey = 'sales' | 'purchases' | 'receipts' | 'payments';

const KPI_CONFIG: Array<{
  key: KpiKey;
  label: string;
  icon: React.ReactNode;
  tone: 'brand' | 'success' | 'warning' | 'danger';
  path: string;
  /** دلالة اتجاه المقارنة لهذا المؤشر. */
  goodDirection: 'up' | 'down' | 'neutral';
}> = [
  {
    key: 'payments',
    label: 'إجمالي المدفوعات',
    icon: <CreditCard size={18} />,
    tone: 'brand',
    path: '/purchasing/payments',
    goodDirection: 'down',
  },
  {
    key: 'receipts',
    label: 'إجمالي المقبوضات',
    icon: <Wallet size={18} />,
    tone: 'warning',
    path: '/sales/receipts',
    goodDirection: 'up',
  },
  {
    key: 'purchases',
    label: 'إجمالي المشتريات',
    icon: <Package size={18} />,
    tone: 'danger',
    path: '/purchasing/invoices',
    goodDirection: 'down',
  },
  {
    key: 'sales',
    label: 'إجمالي المبيعات',
    icon: <ShoppingCart size={18} />,
    tone: 'success',
    path: '/sales/invoices',
    goodDirection: 'up',
  },
];

function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function trendFor(
  comparison: DashboardOverview['comparison'][KpiKey] | undefined,
  goodDirection: 'up' | 'down' | 'neutral'
): KpiTrend | undefined {
  if (!comparison || comparison.changePct === null || !Number.isFinite(comparison.changePct)) {
    return undefined;
  }
  const change = comparison.changePct;
  const direction: KpiTrend['direction'] = change > 0.04 ? 'up' : change < -0.04 ? 'down' : 'flat';
  const isGood =
    direction === 'flat' || goodDirection === 'neutral'
      ? null
      : direction === goodDirection;
  return {
    value: `${Math.abs(change).toFixed(1)}%`,
    direction,
    label: 'مقارنة بالفترة السابقة',
    tone: isGood === null ? 'neutral' : isGood ? 'success' : 'warning',
  };
}

export const Dashboard: React.FC = () => {
  const { navigateTo } = useNavigation();

  const now = useMemo(() => new Date(), []);
  const defaultYear = now.getFullYear();

  const [year, setYear] = useState<number>(defaultYear);
  const [month, setMonth] = useState<number | null>(null);
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const hadData = data !== null;
      if (hadData) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ year: String(year) });
        if (month) params.set('month', String(month));

        const response = await fetch(`/api/dashboard/overview?${params.toString()}`, { signal });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'تعذر تحميل بيانات لوحة التحكم');
        }
        const payload = (await response.json()) as DashboardOverview;
        setData(payload);
      } catch (fetchError: any) {
        if (fetchError?.name === 'AbortError') return;
        setError(fetchError?.message || 'تعذر تحميل بيانات لوحة التحكم');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // data غير مضافة عمداً: إضافتها تعيد تشغيل الجلب بعد كل استجابة.
    // القيمة المقروءة هنا تحدد شكل مؤشر التحميل فقط.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [year, month]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const handleYearChange = (value: string) => {
    const nextYear = Number(value);
    if (!Number.isFinite(nextYear)) return;
    setYear(nextYear);
    setMonth(null);
  };

  const handleMonthChange = (value: string) => {
    if (value === 'all') setMonth(null);
    else {
      const nextMonth = Number(value);
      if (nextMonth >= 1 && nextMonth <= 12) setMonth(nextMonth);
    }
  };

  const yearOptions = useMemo(() => {
    const years = new Set<number>(data?.availableYears ?? []);
    years.add(year);
    years.add(defaultYear);
    return [...years]
      .sort((a, b) => b - a)
      .map((value) => ({ value: String(value), label: String(value) }));
  }, [data?.availableYears, year, defaultYear]);

  const monthOptions = useMemo(() => {
    const values = new Set<number>();
    for (const period of data?.availablePeriods ?? []) {
      if (!period.startsWith(`${year}-`)) continue;
      const value = Number(period.slice(5, 7));
      if (value >= 1 && value <= 12) values.add(value);
    }
    if (month) values.add(month);
    return [
      { value: 'all', label: 'كل شهور السنة' },
      ...[...values]
        .sort((a, b) => a - b)
        .map((value) => ({ value: String(value), label: ARABIC_MONTHS[value - 1] })),
    ];
  }, [data?.availablePeriods, year, month]);

  const selectedPeriodLabel = month ? formatPeriodLabel(formatMonthKey(year, month)) : `سنة ${year}`;
  const highlightMonth = month ? formatMonthKey(year, month) : null;
  const chartYear = data?.chartPeriod?.year ?? year;

  const lastUpdatedLabel = useMemo(() => {
    if (!data?.generatedAt) return null;
    const date = new Date(data.generatedAt);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('ar-YE-u-ca-gregory-nu-latn', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }, [data?.generatedAt]);

  const cardsLoading = loading && !data;
  const cardsError = data ? null : error;
  const kpis = data?.kpis;
  const comparison = data?.comparison;

  return (
    <div className="space-y-4 pb-6">
      <DashboardHero />

      {/* شريط الفترة والأدوات */}
      <section
        aria-label="فلتر الفترة"
        className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-3.5 shadow-k-xs lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-ink">المؤشرات المالية</h2>
            <StatusBadge tone="info" size="sm">
              بيانات فعلية
            </StatusBadge>
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">
            الفترة المعروضة: <strong className="font-bold text-ink">{selectedPeriodLabel}</strong>
            {lastUpdatedLabel && <> · آخر تحديث {lastUpdatedLabel}</>}
            {' · '}كل المبالغ بالريال اليمني
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex w-[112px] flex-col gap-1">
            <span className="text-[10px] font-bold text-ink-muted">السنة</span>
            <Select
              value={String(year)}
              options={yearOptions}
              onChange={(event) => handleYearChange(event.target.value)}
              disabled={refreshing}
              aria-label="اختيار السنة"
              size="sm"
            />
          </label>
          <label className="flex w-[152px] flex-col gap-1">
            <span className="text-[10px] font-bold text-ink-muted">الشهر</span>
            <Select
              value={month ? String(month) : 'all'}
              options={monthOptions}
              onChange={(event) => handleMonthChange(event.target.value)}
              disabled={refreshing}
              aria-label="اختيار الشهر"
              size="sm"
            />
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => load()}
            disabled={loading || refreshing}
            icon={<RefreshCw size={15} className={loading || refreshing ? 'animate-spin' : ''} />}
            aria-label="تحديث بيانات اللوحة"
          >
            تحديث
          </Button>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-card border border-state-danger/30 bg-state-danger-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2 text-[12px] font-semibold text-state-danger">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <span>
              {error}
              {data ? ' — تُعرض آخر بيانات تم تحميلها بنجاح.' : ''}
            </span>
          </p>
          <Button variant="secondary" size="xs" onClick={() => load()} className="self-start sm:self-auto">
            إعادة المحاولة
          </Button>
        </div>
      )}

      <div
        className={`space-y-4 transition-opacity duration-200 ${refreshing ? 'opacity-60' : 'opacity-100'}`}
        aria-busy={loading || refreshing}
      >
        {/* المؤشرات الأربعة — الترتيب مطابق للتصميم المرجعي من اليمين */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {KPI_CONFIG.map((config) => {
            const value = kpis?.[config.key];
            const trend = trendFor(
              comparison ? comparison[config.key] : undefined,
              config.goodDirection
            );
            return (
              <KpiCard
                key={config.key}
                label={config.label}
                value={
                  kpis ? (
                    <span title={formatAmountExact(value ?? 0)}>{formatAmount(value ?? 0)}</span>
                  ) : cardsLoading ? (
                    '—'
                  ) : (
                    '—'
                  )
                }
                unit="ريال يمني"
                icon={config.icon}
                tone={config.tone}
                trend={trend}
                hint={
                  kpis
                    ? selectedPeriodLabel
                    : cardsError
                      ? 'تعذر تحميل القيمة'
                      : 'جارٍ تحميل القيمة...'
                }
                pending={cardsLoading}
                onClick={() => navigateTo(config.path)}
              />
            );
          })}
        </div>

        {/* الرسوم الثلاثة */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <CashFlowChart
            data={data?.monthly ?? []}
            loading={cardsLoading}
            error={cardsError}
            highlightMonth={highlightMonth}
          />
          <ProfitLossChart
            data={data?.monthly ?? []}
            loading={cardsLoading}
            error={cardsError}
            highlightMonth={highlightMonth}
            chartYear={chartYear}
          />
          <div className="md:col-span-2 xl:col-span-1">
            <ExpenseDistribution
              data={data?.expenseMix ?? []}
              loading={cardsLoading}
              error={cardsError}
              periodLabel={selectedPeriodLabel}
            />
          </div>
        </div>

        {/* جداول الأرصدة والأطراف */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MainAccountsCard
            data={data?.mainAccounts ?? []}
            loading={cardsLoading}
            error={cardsError}
            periodTo={data?.period.to ?? ''}
            onOpenAll={() => navigateTo('/accounting/general-ledger')}
            onRowClick={() => navigateTo('/accounting/general-ledger')}
          />
          <TopSuppliersCard
            data={data?.topSuppliers ?? []}
            loading={cardsLoading}
            error={cardsError}
            periodLabel={selectedPeriodLabel}
            onOpenAll={() => navigateTo('/purchasing/suppliers')}
            onRowClick={() => navigateTo('/purchasing/suppliers')}
          />
          <div className="md:col-span-2 xl:col-span-1">
            <TopCustomersCard
              data={data?.topCustomers ?? []}
              loading={cardsLoading}
              error={cardsError}
              periodLabel={selectedPeriodLabel}
              onOpenAll={() => navigateTo('/sales/customers')}
              onRowClick={() => navigateTo('/sales/customers')}
            />
          </div>
        </div>

        {/* آخر المستندات والقيود والتنبيهات */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <LatestDocumentsCard
            data={data?.recentDocs ?? []}
            loading={cardsLoading}
            error={cardsError}
            onRowClick={(document: DashboardDocument) => {
              const meta = DOCUMENT_META[document.kind];
              if (meta) navigateTo(meta.path);
            }}
          />
          <LatestJournalsCard
            data={data?.recentJournals ?? []}
            loading={cardsLoading}
            error={cardsError}
            onOpenAll={() => navigateTo('/accounting/journal-entries')}
            onRowClick={() => navigateTo('/accounting/journal-entries')}
          />
          <div className="md:col-span-2 xl:col-span-1">
            <AlertsTasksCard
              alerts={data?.alerts ?? []}
              loading={cardsLoading}
              error={cardsError}
              onOpen={(alert: DashboardAlert) => navigateTo(alert.href)}
              onOpenIntegrity={() => navigateTo('/reports/integrity')}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-between gap-1.5 border-t border-line-soft pt-3 text-[10px] text-ink-muted sm:flex-row">
        <p>
          المصدر: قاعدة بيانات النظام الفعلية عبر <span className="kayan-numeric" dir="ltr">/api/dashboard/overview</span>
        </p>
        <p>
          لا تُعرض أي أرقام تقديرية. الأرصدة حتى نهاية الفترة، والمستندات والقيود والتنبيهات بحالتها الحالية.
        </p>
      </div>
    </div>
  );
};
