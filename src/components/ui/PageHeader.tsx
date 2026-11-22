import React from 'react';
import { cn } from 'cn';
import { ChevronLeft, ChevronRight, Home } from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';

/**
 * KAYAN ENTERPRISE UI — PageHeader
 * ============================================================
 * عنوان الشاشة + مسار التنقل (Breadcrumbs) + وصف مختصر.
 * من المواصفة §4/ج: كل شاشة تتبع الترتيب:
 *   مسار ← عنوان ← شريط إجراءات ← بحث ← جدول ← ترقيم.
 *
 * ملاحظة وظيفية مهمة: المسار يبني من مسار URL الحالي، لا من
 * وسوم مُدخلة يدوياً في كل شاشة، لذا لا يمكن أن ينحرف المسار
 * عن الموضع الفعلي، ولا يحتاج شاشة جديدة إلى كود إضافي.
 */

export interface Breadcrumb {
  label: string;
  href?: string;
}

/** يبني مساراً من path منطقي مثل /inventory/items. */
export function pathToBreadcrumbs(path: string, labels: Record<string, string> = {}): Breadcrumb[] {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return [{ label: labels['/'] || 'الرئيسية', href: '/' }];

  const crumbs: Breadcrumb[] = [{ label: labels['/'] || 'الرئيسية', href: '/' }];
  segments.forEach((seg, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/');
    crumbs.push({ label: labels[href] || labels[seg] || pretty(seg), href });
  });
  return crumbs;
}

/** يحوّل مساراً عاماً إلى تسمية عربية مفهومة. */
function pretty(seg: string): string {
  const map: Record<string, string> = {
    inventory: 'المخزون',
    items: 'الأصناف',
    warehouses: 'المستودعات',
    transactions: 'الحركات',
    counts: 'الجرد',
    sales: 'المبيعات',
    purchasing: 'المشتريات',
    customers: 'العملاء',
    suppliers: 'الموردون',
    invoices: 'الفواتير',
    receipts: 'سندات القبض',
    payments: 'سندات الصرف',
    returns: 'المردودات',
    accounting: 'المحاسبة العامة',
    'chart-of-accounts': 'دليل الحسابات',
    'journal-entries': 'القيود اليومية',
    'general-ledger': 'الأستاذ العام',
    'trial-balance': 'ميزان المراجعة',
    'fiscal-periods': 'الفترات المالية',
    banking: 'الخزينة والبنوك',
    accounts: 'الحسابات',
    transfers: 'التحويلات',
    ledger: 'الأستاذ',
    reconciliation: 'التسويات',
    assets: 'الأصول الثابتة',
    expenses: 'المصروفات',
    reports: 'التقارير',
    settings: 'الإعدادات',
    users: 'المستخدمون',
    branches: 'الفروع',
    company: 'بيانات الشركة',
    system: 'النظام',
    'audit-logs': 'سجل التدقيق',
    database: 'قاعدة البيانات',
    health: 'السلامة',
  };
  if (map[seg]) return map[seg];
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface PageHeaderProps {
  /** عنوان الشاشة الرئيسي. */
  title: React.ReactNode;
  description?: React.ReactNode;
  /** مسار جاهز — إن لم يُمرَّر يُبنى من المسار الحالي. */
  breadcrumbs?: Breadcrumb[];
  /** وسم صغير بجانب العنوان (مثل "مسودة"). */
  badge?: React.ReactNode;
  /** أيقونة العنوان. */
  icon?: React.ReactNode;
  /** يسار العنوان (نهاية السطر في RTL) — عادةً ملصق/إحصاء. */
  actions?: React.ReactNode;
  className?: string;
  /** إخفاء المسار (للشاشات الفرعية داخل نوافذ). */
  hideBreadcrumbs?: boolean;
  compact?: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  breadcrumbs,
  badge,
  icon,
  actions,
  className,
  hideBreadcrumbs = false,
  compact = false,
}) => {
  const { currentRoute, navigateTo } = useNavigation();

  const crumbs = React.useMemo(
    () => breadcrumbs ?? pathToBreadcrumbs(currentRoute || '/'),
    [breadcrumbs, currentRoute]
  );

  return (
    <div className={cn('space-y-2.5', className)}>
      {!hideBreadcrumbs && crumbs.length > 0 && (
        <nav aria-label="مسار التنقل">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-ink-muted">
            {crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && (
                    <span className="text-ink-muted/60" aria-hidden="true">
                      {/* يتجه السهم لاتجاه القراءة: يسار في RTL */}
                      {document?.documentElement?.dir === 'ltr' ? (
                        <ChevronRight size={13} />
                      ) : (
                        <ChevronLeft size={13} />
                      )}
                    </span>
                  )}
                  {isLast ? (
                    <span aria-current="page" className="font-semibold text-ink">
                      {c.label}
                    </span>
                  ) : c.href ? (
                    <button
                      type="button"
                      onClick={() => navigateTo(c.href!)}
                      className="inline-flex items-center gap-1 rounded-sm px-1 transition-colors hover:text-brand"
                    >
                      {i === 0 && <Home size={13} aria-hidden="true" />}
                      <span>{c.label}</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1">{c.label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className={cn('flex flex-wrap items-start justify-between gap-3', compact && 'gap-2')}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            {icon && (
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand">
                {icon}
              </span>
            )}
            <h1 className="text-xl font-extrabold tracking-tight text-ink">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className={cn('mt-1 text-[13px] leading-relaxed text-ink-muted', compact && 'mt-0.5')}>
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------
   ScreenShell — غلاف الشاشة القياسي.
   ------------------------------------------------------------ */
export interface ScreenShellProps {
  /** الصفحة ككل، عادةً PageHeader ثم PageToolbar ثم محتوى. */
  children: React.ReactNode;
  className?: string;
  /** مسافة بين الكتل — افتراضية اتجاه التصميم. */
  gap?: 'sm' | 'md' | 'lg';
}

const GAPS = { sm: 'space-y-3', md: 'space-y-4', lg: 'space-y-5' } as const;

export const ScreenShell: React.FC<ScreenShellProps> = ({ children, className, gap = 'lg' }) => (
  <div className={cn('pb-6', GAPS[gap], className)}>{children}</div>
);

export default PageHeader;