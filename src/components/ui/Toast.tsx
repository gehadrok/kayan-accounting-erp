import React from 'react';
import { cn } from 'cn';
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info, Loader2 } from 'lucide-react';

/**
 * KAYAN ENTERPRISE UI — Toast
 * ============================================================
 * رسائل النجاح/الخطأ/التحذير الموحدة بدل `alert()` و `confirm()`.
 *
 * قاعدة حاسمة (المواصفة §10): لا تُعرض رسالة نجاح قبل تأكيد
 * النجاح من الخادم. مزوّد الرسائل هنا لا يقرّر متى تظهر —
 * الصفحة تطلب `success()`/`error()` بعد أن تتحقق فعلاً من
 * استجابة الـ API. لذلك هذه الطبقة مجرد عرض، ولن تخلق
 * "رسالة نجاح كاذبة" بنفسها أبداً.
 */

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  /** مدة البقاء بالمللي ثانية. 0 = يبقى حتى يُغلق يدوياً. */
  duration?: number;
  /** إجراء نصّي داخل الإشعار (مثل "تراجع"). */
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
  tone: ToastTone;
}

interface ToastContextValue {
  /** يعرض إشعاراً بمدة افتراضية، ويعيد id قابل للإغلاق. */
  show: (tone: ToastTone, opts: ToastOptions) => number;
  success: (title: string, opts?: Partial<ToastOptions>) => number;
  error: (title: string, opts?: Partial<ToastOptions>) => number;
  warning: (title: string, opts?: Partial<ToastOptions>) => number;
  info: (title: string, opts?: Partial<ToastOptions>) => number;
  /** حالة تنفيذ مستمرة (تظهر أعلى اليسار). */
  loading: (title: string, opts?: Partial<ToastOptions>) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TONE_STYLE: Record<ToastTone, { wrap: string; icon: React.ReactNode; bar: string }> = {
  success: {
    wrap: 'border-state-success/40 bg-white',
    bar: 'bg-state-success',
    icon: <CheckCircle2 size={18} className="text-state-success" />,
  },
  error: {
    wrap: 'border-state-danger/40 bg-white',
    bar: 'bg-state-danger',
    icon: <AlertCircle size={18} className="text-state-danger" />,
  },
  warning: {
    wrap: 'border-state-warning/40 bg-white',
    bar: 'bg-state-warning',
    icon: <AlertTriangle size={18} className="text-state-warning" />,
  },
  info: {
    wrap: 'border-brand/40 bg-white',
    bar: 'bg-brand',
    icon: <Info size={18} className="text-brand" />,
  },
};

let seq = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const timers = React.useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) {
      clearTimeout(tm);
      timers.current.delete(id);
    }
  }, []);

  const show = React.useCallback(
    (tone: ToastTone, opts: ToastOptions) => {
      const id = ++seq;
      const duration = opts.duration ?? (tone === 'error' ? 7000 : 4500);
      setItems((prev) => [...prev.slice(-4), { ...opts, tone, id }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => {
            dismiss(id);
          }, duration)
        );
      }
      return id;
    },
    [dismiss]
  );

  const withTone = React.useCallback(
    (tone: ToastTone, fallbackDuration?: number) =>
      (title: string, opts: Partial<ToastOptions> = {}) =>
        show(tone, { title, duration: fallbackDuration, ...opts }),
    [show]
  );

  const api = React.useMemo<ToastContextValue>(
    () => ({
      show,
      success: withTone('success'),
      error: withTone('error'),
      warning: withTone('warning'),
      info: withTone('info'),
      loading: (title, opts = {}) => show('info', { title, duration: 0, ...opts }),
      dismiss,
      clear: () => {
        setItems([]);
        timers.current.forEach((t) => clearTimeout(t));
        timers.current.clear();
      },
    }),
    [show, withTone, dismiss]
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

const ToastViewport: React.FC<{ items: ToastItem[]; onDismiss: (id: number) => void }> = ({
  items,
  onDismiss,
}) => (
  <div
    className="pointer-events-none fixed bottom-4 start-4 z-[60] flex w-full max-w-sm flex-col gap-2.5 print:hidden"
    role="status"
    aria-live="polite"
  >
    {items.map((t) => {
      const conf = TONE_STYLE[t.tone];
      return (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto relative overflow-hidden rounded-control border shadow-k-lg',
            'animate-in slide-in-from-bottom-2 fade-in duration-200',
            conf.wrap
          )}
        >
          <span className={cn('absolute inset-y-0 start-0 w-1', conf.bar)} aria-hidden="true" />
          <div className="flex items-start gap-3 py-3 pe-3 ps-5">
            <span className="mt-0.5 shrink-0">{t.tone === 'info' && t.duration === 0 ? <Loader2 size={18} className="animate-spin text-brand" /> : conf.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-ink">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{t.description}</p>
              )}
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action!.onClick();
                    onDismiss(t.id);
                  }}
                  className="mt-1.5 text-xs font-bold text-brand underline-offset-2 hover:underline"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="إغلاق الرسالة"
              className="-me-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:ring-[3px] focus-visible:ring-brand/25 outline-none"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      );
    })}
  </div>
);

/** يرجع مزوّد الرسائل. يجب أن يكون تحت ToastProvider. */
export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast يجب أن يُستخدم داخل ToastProvider');
  return ctx;
}

/**
 * بديل وظيفي عن window.alert / window.confirm للترحيل التدريجي.
 * يعطي نفس الوظيفة (رسم رسالة وانتظار المستخدم) لكن بشكل موحّد
 * ومتسق مع الهوية البصرية.
 *
 * ملاحظة: alertAsync حل مشكلة مزمنة في الترحيل — الصفحات
 * القديمة كانت تستعمل `confirm()` ثم تكمل السطر تلقائياً،
 * وهذا البديل يعيد وعداً ينتظر فعل المستخدم فعلاً.
 */
export function useAlerts() {
  const [state, setState] = React.useState<{
    open: boolean;
    title: string;
    message: string;
    tone: 'danger' | 'warning' | 'info';
    resolve?: (v: boolean) => void;
  }>({ open: false, title: '', message: '', tone: 'info' });

  const confirm = React.useCallback((title: string, message: string, tone: 'danger' | 'warning' | 'info' = 'info') => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, title, message, tone, resolve });
    });
  }, []);

  const close = React.useCallback((value: boolean) => {
    setState((s) => {
      s.resolve?.(value);
      return { ...s, open: false, resolve: undefined };
    });
  }, []);

  return { alertState: state, confirm, close };
}