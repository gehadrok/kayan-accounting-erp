import React from 'react';
import { cn } from 'cn';
import { Loader2 } from 'lucide-react';

/**
 * KAYAN ENTERPRISE UI — Button
 * ============================================================
 * الزر الموحّد في كل النظام. الفروق بين الأزرار كانتأكبر مصدر
 * للتناقض البصري قبل هذا المكوّن: ارتفاع متفاوت، ظلال مختلفة،
 * واستخدام `p-1.5` لأزرار الجداول مقابل `px-4 py-2` للأزرار
 * الرئيسية داخل نفس الشاشة.
 *
 * القواعد المعتمدة (من المواصفة):
 *   1. الزر الأساسي أزرق.
 *   2. الثانوي أبيض بحدود رمادية.
 *   3. الحذف أحمر مع تأكيد.
 *   4. الاعتماد/الترحيل يستخدمان لون الحالة.
 *   5. لا يظهر زر لا ينطبق على الشاشة (المكوّن لا يقرّر —
 *      الصفحة هي التي تمرّر `actions`).
 *   6. لا يتجاوز الزر نظام الصلاحيات — يُعرض فقط إن كانت الصفحة
 *      تملك الإجراء.
 *   7. `disabled` + `loading` يمنعان تكرار الإرسال.
 */

export type ButtonVariant =
  | 'primary'    /* أزرق — الإجراء الأساسي */
  | 'secondary'  /* أبيض + حدود — بقية الإجراءات */
  | 'ghost'      /* بلا خلفية — إجراءات داخل الجداول */
  | 'danger'     /* أحمر — حذف وتدمير */
  | 'success'    /* أخضر — اعتماد / ترحيل */
  | 'warning'    /* برتقالي — إجراءات تحتاج انتباهاً */
  | 'link';

export type ButtonSize =
  | 'xs'    /* 32px — داخل الجداول */
  | 'sm'    /* 36px — ثانوي صغير */
  | 'md'    /* 42px — افتراضي */
  | 'lg';   /* 44px — الإجراء الرئيسي للشاشة */

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white border border-transparent shadow-k-xs hover:bg-brand-hover active:bg-brand-hover disabled:hover:bg-brand',
  secondary:
    'bg-surface text-ink border border-line shadow-k-xs hover:bg-surface-hover active:bg-surface-hover',
  ghost:
    'bg-transparent text-ink-muted border border-transparent hover:bg-surface-hover hover:text-ink',
  danger:
    'bg-state-danger text-white border border-transparent shadow-k-xs hover:brightness-95 active:brightness-90',
  success:
    'bg-state-success text-white border border-transparent shadow-k-xs hover:brightness-95 active:brightness-90',
  warning:
    'bg-state-warning text-white border border-transparent shadow-k-xs hover:brightness-95 active:brightness-90',
  link:
    'bg-transparent text-brand border border-transparent hover:underline underline-offset-4 px-0 h-auto',
};

/* الارتفاعات من رموز الهوية (--kayan-control-*) ضمن نطاق 40–44
   للأزرار العادية كما تنص المواصفة. */
const SIZES: Record<Exclude<ButtonSize, 'link'>, string> = {
  xs: 'h-8 px-2.5 gap-1.5 text-xs',
  sm: 'h-9 px-3 gap-1.5 text-[13px]',
  md: 'h-[42px] px-4 gap-2 text-sm',
  lg: 'h-11 px-5 gap-2 text-sm',
};

const BASE =
  'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-control font-semibold ' +
  'transition-[background-color,color,box-shadow,filter] duration-150 outline-none ' +
  'focus-visible:ring-[3px] focus-visible:ring-brand/25 ' +
  'disabled:pointer-events-none disabled:opacity-50 ' +
  '[&_svg]:pointer-events-none [&_svg]:shrink-0';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** حالة تنفيذ: تعطّل الزر وتعرض مؤشراً + نص "جارٍ التنفيذ". */
  loading?: boolean;
  /** النص البديل أثناء التحميل، بدون تشويه تسمية الزر. */
  loadingText?: string;
  /** أيقونة قبل النص. في RTL تظهر تلقائياً على يمين الزر. */
  icon?: React.ReactNode;
  /** أيقونة بعد النص. */
  iconEnd?: React.ReactNode;
  /** زر يمتد بعرض كامل (أزرار النوافذ). */
  block?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  loading = false,
  loadingText,
  icon,
  iconEnd,
  block = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}) => {
  const height = variant === 'link' ? '' : SIZES[size];
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], height, block && 'w-full', className)}
      {...rest}
    >
      {loading ? (
        <Loader2 size={size === 'lg' || size === 'md' ? 16 : 14} className="animate-spin" />
      ) : (
        icon
      )}
      <span>{loading && loadingText ? loadingText : children}</span>
      {!loading && iconEnd}
    </button>
  );
};

/* ------------------------------------------------------------
   IconButton — لأزرار إجراءات الصفوف.
   كان لكل صف في الجداول `p-1.5 hover:bg-...` مكتوبة يدوياً،
   فاختفت عند أول تنسيق. هنا مقاس واحد لكل الشاشات.
   ------------------------------------------------------------ */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** يحدد اللون الدلالي, ويصلح لشفافية اللون لقارئ الشاشة. */
  tone?: 'neutral' | 'primary' | 'danger' | 'success' | 'warning';
  label: string;
  size?: 'sm' | 'md';
  loading?: boolean;
}

const TONES: Record<NonNullable<IconButtonProps['tone']>, string> = {
  neutral: 'text-ink-muted hover:bg-surface-hover hover:text-ink',
  primary: 'text-brand hover:bg-brand-soft',
  danger: 'text-state-danger hover:bg-state-danger-soft',
  success: 'text-state-success hover:bg-state-success-soft',
  warning: 'text-state-warning hover:bg-state-warning-soft',
};

export const IconButton: React.FC<IconButtonProps> = ({
  tone = 'neutral',
  label,
  size = 'sm',
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    title={label}
    aria-label={label}
    disabled={disabled || loading}
    className={cn(
      'inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-150 outline-none',
      'focus-visible:ring-[3px] focus-visible:ring-brand/25 disabled:pointer-events-none disabled:opacity-40',
      size === 'sm' ? 'h-8 w-8' : 'h-[42px] w-[42px]',
      TONES[tone],
      className
    )}
    {...rest}
  >
    {loading ? <Loader2 size={15} className="animate-spin" /> : children}
  </button>
);

export default Button;