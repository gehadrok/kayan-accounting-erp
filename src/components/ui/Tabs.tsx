import React from 'react';
import { cn } from 'cn';

/**
 * KAYAN ENTERPRISE UI — Tabs
 * ============================================================
 * التبويبات الموحدة. التبويب ظهر في عشر شاشات (تفاصيل الصنف،
 * المصروفات، الأصول، التقارير...) وكل واحدة كتبت زرها بـ
 * border-b-2 خاص بها، فتباينت المسافات والسمك واللون.
 *
 * هذا المكوّن هو نسخة موحّدة من نمط شاشة العناصر المرجعية،
 * ولا يغيّر أي سلوك: الشاشة تملك القائمة وتقرّر الانتقال،
 * والمكوّن يعرض ويبلغ قارئ الشاشة (aria) فقط.
 */

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** عدّاد/ملصق صغير بعد النص (مثل عدد السجلات). */
  count?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  /** وصف لقارئ الشاشة — مطلوب تقريبًا للتبويبات. */
  ariaLabel?: string;
  className?: string;
  /** إيقاف زوايا التبويب عند تحذير مثلاً. */
  disabled?: boolean;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  value,
  onValueChange,
  ariaLabel = 'تبويبات',
  className,
  disabled = false,
}) => (
  <div
    role="tablist"
    aria-label={ariaLabel}
    className={cn('flex gap-1 overflow-x-auto border-b border-line', className)}
  >
    {items.map((t) => {
      const active = t.id === value;
      return (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active}
          disabled={disabled || t.disabled}
          onClick={() => onValueChange(t.id)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13px] font-semibold transition-colors outline-none',
            'focus-visible:ring-[3px] focus-visible:ring-brand/25 focus-visible:rounded-sm',
            'disabled:pointer-events-none disabled:opacity-50',
            active ? 'border-brand text-brand' : 'border-transparent text-ink-muted hover:text-ink'
          )}
        >
          {t.icon}
          <span>{t.label}</span>
          {t.count !== undefined && t.count !== null && (
            <span
              className={cn(
                'kayan-numeric rounded-pill border px-1.5 text-[11px] font-bold',
                active ? 'border-brand/30 bg-brand-soft text-brand' : 'border-line bg-surface-sunken text-ink-muted'
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

/** لوحة محتوى التبويب — نفس الهامش لكل الشاشات. */
export const TabPanel: React.FC<{
  id: string;
  active: string;
  children: React.ReactNode;
  className?: string;
}> = ({ id, active, children, className }) => {
  if (id !== active) return null;
  return (
    <div role="tabpanel" className={cn('', className)}>
      {children}
    </div>
  );
};

export default Tabs;
