import React from 'react';
import { cn } from 'cn';
import { Button, ButtonVariant, ButtonSize, IconButton } from './Button';
import { SearchInput, ControlSize } from './controls';

/**
 * KAYAN ENTERPRISE UI — PageToolbar
 * ============================================================
 * شريط الإجراءات الموحد أعلى كل شاشة. قبله كانت كل شاشة تبني
 * زراها يدوياً بـ px/py متنافرة، وترتيب متغير، وأيقونات بمواضع
 * مختلفة، فتختلف الشاشة عن جارتها بأكملها.
 *
 * القواعد المطبّقة (المواصفة §5):
 *   - أساسي أزرق • ثانوي أبيض+حدود • حذف أحمر
 *   - الإجراءات غير المطبقة لا تُمرَّر أصلاً فيظهر العمل
 *     افتراضياً صفر زر؛ الشاشة هي مَن يقرّر.
 *   - `busy` يعطّل الأزرار ويمنع تكرار الإرسال.
 *   - ترتيب ثابت عبر النظام: أساسي ← ثانوي ← فاصل ← أبسط ←
 *     فاصل ← حذف، بغض النظرة عن ترتيب الكتابة في الصفحة.
 */

export type ToolbarActionKind =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'success'
  | 'warning'
  | 'ghost';

export interface ToolbarAction {
  key: string;
  label: string;
  kind?: ToolbarActionKind;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  /** يظهر كزر محفوظ بحدود حمراء (الحذف في الشريط). */
  destructive?: boolean;
}

const KIND_TO_VARIANT: Record<ToolbarActionKind, ButtonVariant> = {
  primary: 'primary',
  secondary: 'secondary',
  danger: 'danger',
  success: 'success',
  warning: 'warning',
  ghost: 'ghost',
};

export interface PageToolbarProps {
  children?: React.ReactNode;
  /** حقل البحث الموحّد. يظهر أوتوماتيكياً إن وُجد. */
  search?: {
    value: string;
    onValueChange: (v: string) => void;
    placeholder?: string;
    /** مقاس ControlSize نفسه المستخدم في controls.tsx. */
    size?: ControlSize;
  };
  /** زر يسار الشريط (نهاية السطر في RTL) — عادةً إغلاق/رجوع. */
  end?: React.ReactNode;
  className?: string;
  /** بطاقة زخرفية ملتصقة (نصف الطول) — للشاشات الفرعية. */
  sticky?: boolean;
}

/**
 * يبني قائمة الأزرار مع ترتيب موحّد.
 * المدخلات تُستلم بترتيب الصفحة، والمخرجات تُرتّب دائمًا
 * حسب: أساسي ← إجراء ← إلغاء/تراجع ← حذف.
 */
function orderActions(actions: ToolbarAction[]): ToolbarAction[] {
  const rank = (a: ToolbarAction): number => {
    if (a.destructive) return 40;
    if (a.kind === 'primary') return 10;
    if (a.kind === 'danger') return 40;
    if (a.kind === 'success' || a.kind === 'warning') return 20;
    if (a.kind === 'ghost') return 30;
    return 25;
  };
  return [...actions].sort((a, b) => rank(a) - rank(b));
}

export const PageToolbar: React.FC<PageToolbarProps> & {
  /** يبني عنصر زر محسّن من إجراء. */
  actionToButton: (a: ToolbarAction, index?: number) => React.ReactNode;
} = ({ children, search, end, className, sticky }) => {
  /* children قد تكون إجراءات بأسلوب ToolbarAction أو عناصر
     JSX مباشرة؛ نمرّر الثاني كما هي حتى لا نكسر الشاشات التي
     بنت زرها قبل وجود المكوّن (خلال الترحيل التدريجي). */
  const childArray = React.Children.toArray(children);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface p-3',
        sticky && 'sticky top-2 z-20 shadow-k-sm',
        className
      )}
    >
      {search && (
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <SearchInput
            value={search.value}
            onValueChange={search.onValueChange}
            placeholder={search.placeholder}
            size={search.size || 'md'}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">{childArray}</div>

      {end && <div className="ms-auto flex items-center gap-2">{end}</div>}
    </div>
  );
};

/** يحوّل إجراءً إلى زر متّسم حسب نوعه. */
PageToolbar.actionToButton = (a: ToolbarAction, index = 0) => {
  const variant = KIND_TO_VARIANT[a.kind || 'secondary'];
  return (
    <Button
      key={a.key || `toolbar-${index}`}
      variant={variant}
      size="md"
      icon={a.icon}
      loading={a.loading}
      loadingText={a.loadingText}
      disabled={a.disabled}
      onClick={a.onClick}
    >
      {a.label}
    </Button>
  );
};

/* ------------------------------------------------------------
   ToolbarActions — مجموعة إجراءات معروضة بترتيب موحّد.
   ------------------------------------------------------------ */
export interface ToolbarActionsProps {
  actions: ToolbarAction[];
  /** يعطّل الجميع دفعة واحدة (أثناء تنفيذ عملية). */
  busy?: boolean;
  className?: string;
}

export const ToolbarActions: React.FC<ToolbarActionsProps> = ({ actions, busy, className }) => (
  <div className={cn('flex flex-wrap items-center gap-2', className)}>
    {orderActions(actions).map((a, i) => (
      <Button
        key={a.key || `ta-${i}`}
        variant={a.destructive ? 'danger' : KIND_TO_VARIANT[a.kind || 'secondary']}
        size="md"
        icon={a.icon}
        loading={a.loading}
        loadingText={a.loadingText}
        disabled={busy || a.disabled}
        onClick={a.onClick}
      >
        {a.label}
      </Button>
    ))}
  </div>
);

/* ------------------------------------------------------------
   ToolbarDivider — فاصل بصري بين مجموعات الإجراءات.
   ------------------------------------------------------------ */
export const ToolbarDivider: React.FC<{ className?: string }> = ({ className }) => (
  <span className={cn('mx-1 h-6 w-px bg-line', className)} aria-hidden="true" />
);

/* ------------------------------------------------------------
   ToolbarIconButton — أيقونة في الشريط بنفس مقاس الأزرار.
   ------------------------------------------------------------ */
export const ToolbarIconButton: React.FC<
  React.ComponentProps<typeof IconButton>
> = ({ className, ...rest }) => (
  <IconButton size="md" className={cn('border border-line bg-surface', className)} {...rest} />
);

export default PageToolbar;