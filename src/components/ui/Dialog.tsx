import React from 'react';
import { cn } from 'cn';
import { X, AlertTriangle, HelpCircle, Info } from 'lucide-react';
import { Button } from './Button';

/**
 * KAYAN ENTERPRISE UI — Dialog / ConfirmDialog
 * ============================================================
 * نافذة منبثقة موحّدة بدل `confirm()` و `window.alert()` النصّيتين.
 * الفرق العملي:
 *   - ConfirmDialog يسمح بعنوان ورسالة عربية أوضح ونص زر مخصّص
 *     (مثل "احذف الصنف" بدل "موافق")، ومظهر متناسق مع النظام.
 *   - يمنع تفاعل الصفحة خلفه ويستجيب لمفتاح Escape.
 *
 * السلوك الوظيفي لا يتغير: الصفحة تقرر متى يُفتح، وتشهد ماذا
 * يحدث. المكوّن لا يحذف شيئاً بنفسه — الـ callback هو من ينفّذ.
 */

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  /** شريط الإجراءات أسفل النافذة. */
  footer?: React.ReactNode;
  /** عرض أقصى: sm/md/lg/xl/full. */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** يمنع النقر خارج النافذة (النوافذ التي تحتوي على بيانات غير محفوظة). */
  dismissible?: boolean;
  /** تحويل التركيز إلى أول حقل عند الفتح. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  className?: string;
  /** طبقة التراص — للنوافذ المتداخلة (تأكيد فوق نموذج). */
  zIndex?: number;
}

const SIZES: Record<NonNullable<DialogProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  full: 'max-w-[calc(100vw-2rem)]',
};

export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  size = 'md',
  dismissible = true,
  initialFocus,
  className,
  zIndex = 50,
}) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);

    /* حبس التركيز داخل النافذة: بدونه ينتقل المؤشر إلى الصفحة
       خلفها، فتصبح لوحة المفاتيح غير قابلة للاستخدام لقارئ
       الشاشة وللتنقل بالتاب. */
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusTarget = initialFocus?.current ?? panel?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"]'
    );

    if (focusTarget) {
      focusTarget.focus();
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, dismissible, initialFocus]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      style={{ zIndex }}
    >
      <div
        className="fixed inset-0 bg-ink/45 backdrop-blur-[2px]"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'relative z-10 my-6 w-full overflow-hidden rounded-dialog border border-line bg-surface shadow-k-lg',
          'animate-in fade-in zoom-in-95 duration-150',
          SIZES[size],
          className
        )}
      >
        {(title || dismissible) && (
          <header className="flex items-start gap-3 border-b border-line px-5 py-4">
            {icon && <span className="mt-0.5 text-brand">{icon}</span>}
            <div className="min-w-0 flex-1">
              {title && <h2 className="text-base font-bold text-ink">{title}</h2>}
              {description && <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{description}</p>}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق"
                className="-me-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:ring-[3px] focus-visible:ring-brand/25 outline-none"
              >
                <X size={17} />
              </button>
            )}
          </header>
        )}

        {children && (
          <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto px-5 py-5 sm:px-6">
            {children}
          </div>
        )}

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-line bg-surface-muted px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------
   ConfirmDialog — تأكيد إجراء حسّاس.
   ------------------------------------------------------------ */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger للحذف/التدمير، info للإجراءات العادية. */
  tone?: 'danger' | 'info' | 'warning';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /** يعرض مؤشراً أثناء تنفيذ onConfirm ويمنع الإغلاق. */
  busy?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  tone = 'info',
  onConfirm,
  onCancel,
  busy = false,
}) => {
  const [pending, setPending] = React.useState(false);
  const isBusy = busy || pending;

  const handleConfirm = async () => {
    if (isBusy) return;
    try {
      setPending(true);
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  const TONE = {
    danger: { icon: <AlertTriangle size={20} />, cls: 'text-state-danger bg-state-danger-soft', variant: 'danger' as const },
    warning: { icon: <AlertTriangle size={20} />, cls: 'text-state-warning bg-state-warning-soft', variant: 'warning' as const },
    info: { icon: <HelpCircle size={20} />, cls: 'text-brand bg-brand-soft', variant: 'primary' as const },
  }[tone];

  return (
    <Dialog
      open={open}
      onClose={isBusy ? () => undefined : onCancel}
      dismissible={!isBusy}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isBusy}>
            {cancelLabel}
          </Button>
          <Button
            variant={TONE.variant}
            onClick={handleConfirm}
            loading={isBusy}
            loadingText="جارٍ التنفيذ..."
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full', TONE.cls)}>
          {TONE.icon}
        </span>
        <div className="min-w-0 pt-1.5 text-sm leading-relaxed text-ink">{message}</div>
      </div>
    </Dialog>
  );
};

/* ------------------------------------------------------------
   InfoDialog — نافذة عرض/شرح بلا إجراءات حسّاسة.
   ------------------------------------------------------------ */
export const InfoDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: DialogProps['size'];
}> = ({ open, onClose, title, children, size = 'md' }) => (
  <Dialog
    open={open}
    onClose={onClose}
    size={size}
    title={title}
    icon={<Info size={20} />}
    footer={
      <Button variant="secondary" onClick={onClose}>
        إغلاق
      </Button>
    }
  >
    {children}
  </Dialog>
);

export default Dialog;