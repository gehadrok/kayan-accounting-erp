import React from 'react';
import { cn } from 'cn';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * KAYAN ENTERPRISE UI — KpiCard
 * ============================================================
 * بطاقة الإحصاء الموحدة في لوحة التحكم ورؤوس الوحدات.
 *
 * قيد مهم مقصود (المواصفة §11): البطاقة تعرض قيمة تمرَّر
 * لها فقط. لا تُحسب قيم مالية هنا ولا تُقدر من بيانات
 * وهمية — إن لم تصل قيمة حقيقية، تظهر بحالة `pending`
 * بدل إظهار رقم مُختلق كما كان الحال سابقًا.
 */

export interface KpiTrend {
  value: string;
  direction: 'up' | 'down' | 'flat';
  label?: string;
  /**
   * لون دلالي صريح يتجاوز لون الاتجاه.
   * السبب: ارتفاع المشتريات/المدفوعات ليس "نجاحاً" دائماً،
   * وارتفاع المبيعات ليس تحذيراً. الشاشة تحدد الدلالة.
   */
  tone?: 'success' | 'danger' | 'warning' | 'neutral';
}

export interface KpiCardProps {
  label: string;
  /** القيمة المعروضة — تمرَّر جاهزة للعرض من الشاشة. */
  value: React.ReactNode;
  /** وحدة/عملة بجانب القيمة. */
  unit?: string;
  icon?: React.ReactNode;
  /** لون الخلفية الدلالي للأيقونة. */
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
  trend?: KpiTrend;
  /** وصف صغير أسفل القيمة. */
  hint?: React.ReactNode;
  /** القيمة لم تصل بعد — تُظهر شرائح تحميل بدل رقم. */
  pending?: boolean;
  onClick?: () => void;
  className?: string;
}

const TONE: Record<NonNullable<KpiCardProps['tone']>, string> = {
  brand: 'bg-brand-soft text-brand',
  success: 'bg-state-success-soft text-state-success',
  warning: 'bg-state-warning-soft text-state-warning',
  danger: 'bg-state-danger-soft text-state-danger',
  neutral: 'bg-surface-sunken text-ink-muted',
};

const DEFAULT_TREND_TONE: Record<NonNullable<KpiTrend['direction']>, NonNullable<KpiTrend['tone']>> = {
  up: 'success',
  down: 'danger',
  flat: 'neutral',
};

const TREND_TONE: Record<NonNullable<KpiTrend['tone']>, string> = {
  success: 'text-state-success',
  danger: 'text-state-danger',
  warning: 'text-state-warning',
  neutral: 'text-ink-muted',
};

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  unit,
  icon,
  tone = 'neutral',
  trend,
  hint,
  pending = false,
  onClick,
  className,
}) => {
  const Root: React.ElementType = onClick ? 'button' : 'div';

  return (
    <Root
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group w-full rounded-card border border-line bg-surface p-4 text-start shadow-k-xs transition-shadow',
        onClick && 'cursor-pointer hover:shadow-k-md focus-visible:ring-[3px] focus-visible:ring-brand/25 outline-none',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-semibold leading-snug text-ink-muted">{label}</span>
        {icon && (
          <span
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control',
              TONE[tone]
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>

      <div className="mt-3">
        {pending ? (
          /* لا نعرض صفر ولا رقماً تقديرياً: الشريط يوضح أن القيمة
             لم تصل بعد من المصدر الحقيقي. */
          <div className="h-7 w-28 animate-pulse rounded-md bg-surface-sunken" aria-label="جارٍ التحميل" />
        ) : (
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="kayan-numeric text-2xl font-extrabold tracking-tight text-ink">
              {value}
            </span>
            {unit && <span className="text-xs font-semibold text-ink-muted">{unit}</span>}
          </div>
        )}

        {trend && !pending && (
          <div
            className={cn(
              'mt-1.5 inline-flex items-center gap-1 text-xs font-bold',
              TREND_TONE[trend.tone ?? DEFAULT_TREND_TONE[trend.direction]]
            )}
          >
            {trend.direction === 'up' ? (
              <TrendingUp size={13} />
            ) : trend.direction === 'down' ? (
              <TrendingDown size={13} />
            ) : (
              <Minus size={13} />
            )}
            <span className="kayan-numeric">{trend.value}</span>
            {trend.label && <span className="font-medium text-ink-muted">{trend.label}</span>}
          </div>
        )}

        {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      </div>
    </Root>
  );
};

/* ------------------------------------------------------------
   StatBadge — قيمة صغيرة داخل بطاقات KPI أو التقارير.
   ------------------------------------------------------------ */
export const StatBadge: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: KpiCardProps['tone'];
  className?: string;
}> = ({ label, value, tone = 'neutral', className }) => (
  <div className={cn('rounded-control border border-line bg-surface px-3 py-2', className)}>
    <p className="text-[11px] font-semibold text-ink-muted">{label}</p>
    <p className={cn('kayan-numeric mt-0.5 text-sm font-bold', tone === 'neutral' ? 'text-ink' : TONE[tone].split(' ')[1])}>
      {value}
    </p>
  </div>
);

/* ------------------------------------------------------------
   Card — غلاف البطاقة الموحد (سطح + حدود + زوايا الهوية).
   ------------------------------------------------------------ */
export interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** تُحذف إذا كان المحتوى يمتد خارج الإطار (جدول). */
  flush?: boolean;
  /** عنوان مصاحب للبطاقة. */
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** إجراءات أعلى يمين البطاقة. */
  actions?: React.ReactNode;
  /** يفرض ارتفاعاً ثابتاً. */
  minHeight?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  flush = false,
  title,
  description,
  actions,
  minHeight,
}) => (
  <section
    className={cn(
      'overflow-hidden rounded-card border border-line bg-surface shadow-k-xs',
      className
    )}
    style={minHeight ? { minHeight } : undefined}
  >
    {(title || actions) && (
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
        <div className="min-w-0">
          {title && <h2 className="text-sm font-bold text-ink">{title}</h2>}
          {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
    )}
    <div className={flush ? '' : 'p-4'}>{children}</div>
  </section>
);

/* ------------------------------------------------------------
   EmptyState — حالة "لا نتائج" الموحدة.
   ------------------------------------------------------------ */
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => (
  <div className={cn('px-6 py-14 text-center', className)}>
    {icon && <div className="mx-auto text-ink-muted/60">{icon}</div>}
    <p className="mt-3 text-sm font-bold text-ink">{title}</p>
    {description && <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-muted">{description}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

/* ------------------------------------------------------------
   LoadingState — مؤشر تحميل موحّد.
   ------------------------------------------------------------ */
export const LoadingState: React.FC<{ text?: string; className?: string }> = ({
  text = 'جارٍ التحميل...',
  className,
}) => (
  <div className={cn('px-6 py-14 text-center', className)} role="status">
    <div
      className="mx-auto h-7 w-7 animate-spin rounded-full border-[3px] border-line border-t-brand"
      aria-hidden="true"
    />
    <p className="mt-3 text-[13px] text-ink-muted">{text}</p>
  </div>
);