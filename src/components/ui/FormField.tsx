import React from 'react';
import { cn } from 'cn';
import { AlertCircle } from 'lucide-react';
import {
  Input,
  SearchInput,
  NumberInput,
  Textarea,
  Select,
  SearchSelect,
  DatePicker,
  Checkbox,
} from './controls';

/**
 * KAYAN ENTERPRISE UI — form layout
 * ============================================================
 * تسميات فوق الحقول، علامة المطلوب، رسائل التحقق والخطأ — بنسختين
 * واحدة موحّدة. قبل هذا المكوّن كانت كل صفحة تكتب
 * `<label className="block text-xs font-medium text-slate-400 mb-1.5">`
 * وتنسخ إياها مع تعديل واحد، فتَرتبّت المسافات والألوان بعدد
 * التطوير لا بالمواصفة.
 *
 * القاعدة المتبقية من المواصفة §6: المكوّن يعرض الخطأ فقط، ولا
 * يقرّر شروط التحقق — الشروط تبقى في الصفحة نفسها كما هي اليوم.
 */

/* ------------------------------------------------------------
   الكائنات التي يحق للمكوّن حقن id/invalid فيها.
   ------------------------------------------------------------
   بدون هذا الحصر، cloneElement كان سيحقن `invalid` في أي عنصر
   عنده children، فتستقبل بعض الصناديق غير الحقولها prop
   إلى DOM وتظهر تحذيرات React لكل شاشة. القائمة مغلقة
   عن قصد: أي حقل جديد يجب أن يسجّل نفسه هنا ليحمل تسميتها.
   ------------------------------------------------------------ */
const FIELD_TYPES: ReadonlySet<unknown> = new Set([
  Input,
  SearchInput,
  NumberInput,
  Textarea,
  Select,
  SearchSelect,
  DatePicker,
  Checkbox,
]);

function isField(child: React.ReactNode): child is React.ReactElement<any> {
  return React.isValidElement(child) && FIELD_TYPES.has(child.type);
}

export interface FormFieldProps {
  /** نص التسمية. يُعرض فوق الحقل دائماً. */
  label: React.ReactNode;
  children: React.ReactNode;
  required?: boolean;
  /** رسالة تحقق تظهر بدل/مع رسالة الخطأ. */
  hint?: string;
  /** خطأ فعلي من الخادم أو من تحقق الصفحة. */
  error?: string | null;
  /** تسمية إضافية (مساعدة) تظهر بجانب التسمية. */
  optional?: string;
  id?: string;
  className?: string;
  /** عمود كامل في شبكة — لأن التسمية فوق الحقل تحتاج مساحة. */
  block?: boolean;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  children,
  required = false,
  hint,
  error,
  optional,
  id,
  className,
  block = true,
}) => {
  const autoId = React.useId();
  const fieldId = id || autoId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  return (
    <div className={cn(block && 'min-w-0', className)}>
      <label
        htmlFor={fieldId}
        className="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink"
      >
        <span>{label}</span>
        {required && (
          <span className="text-state-danger" aria-hidden="true" title="حقل مطلوب">
            *
          </span>
        )}
        {optional && <span className="font-normal text-ink-muted">({optional})</span>}
      </label>

      {/* مرّر المعرف + حالة الخطأ إلى الحقل: كل حقل في controls.tsx
          يقبل id و invalid، ولذلك نمرّر بدلاً من نسخ بنيته داخل كل
          حقل. نُقيّد الحقن بالحقول المعروفة حتى لا يصل prop غير
          متوقع إلى عنصر DOM. */}
      {isField(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id: fieldId,
            invalid: Boolean(error),
            'aria-describedby': error ? errorId : hint ? hintId : undefined,
          })
        : children}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-state-danger"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

/* ------------------------------------------------------------
   FormSection — قسم داخل نموذج، فيه عنوان + وصف اختياريان
   ثم محتوى. يستخدم لتقسيم نماذج طويلة (تفاصيل الصنف، فاتورة)
   إلى أجزاء مترابطة مع الحفاظ على كيان واحد.
   ------------------------------------------------------------ */
export interface FormSectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** عنوان قسم بلا مربع (عنوان فرعي خفيف). */
  plain?: boolean;
}

export const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  icon,
  children,
  className,
  plain = false,
}) => (
  <section className={cn(!plain && 'rounded-control border border-line bg-surface p-5', className)}>
    {(title || description) && (
      <header className={cn('flex items-start gap-3', !plain && 'mb-4')}>
        {icon && <span className="mt-0.5 text-brand">{icon}</span>}
        <div className="min-w-0">
          {title && <h3 className="text-sm font-bold text-ink">{title}</h3>}
          {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
        </div>
      </header>
    )}
    <div className={cn('space-y-4', plain && 'space-y-4')}>{children}</div>
  </section>
);

/* ------------------------------------------------------------
   FormActions — شريط زر الإجراءات داخل نموذج.
   الترتيب ثابت عبر كل النظام: تراجع ثم إلغاء ثم حفظ/أساسي،
   فتبقى عضلات المستخدم على نفس الطريقة في كل شاشة.
   ------------------------------------------------------------ */
export interface FormActionsProps {
  children: React.ReactNode;
  className?: string;
  /** يدفع الإجراءات في اتجاه البداية (يمين في RTL). */
  align?: 'start' | 'end' | 'between';
}

export const FormActions: React.FC<FormActionsProps> = ({ children, className, align = 'end' }) => (
  <div
    className={cn(
      'flex flex-wrap items-center gap-3 border-t border-line pt-4',
      align === 'end' && 'justify-end',
      align === 'start' && 'justify-start',
      align === 'between' && 'justify-between',
      className
    )}
  >
    {children}
  </div>
);

/* ------------------------------------------------------------
   FormGrid — شبكة أعمدة موحدة (1/2/3) مع فجوات ثابتة.
   الشاشات كانت تكتب grid-cols-1 md:grid-cols-2 gap-4 يدوياً،
   فتتباين المسافات عند إضافة عمود ثالث. هنا القاعدة واحدة.
   ------------------------------------------------------------ */
export interface FormGridProps {
  children: React.ReactNode;
  cols?: 1 | 2 | 3;
  className?: string;
}

const GRID: Record<number, string> = {
  1: 'grid grid-cols-1',
  2: 'grid grid-cols-1 md:grid-cols-2',
  3: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
};

export const FormGrid: React.FC<FormGridProps> = ({ children, cols = 2, className }) => (
  <div className={cn(GRID[cols], 'gap-4', className)}>{children}</div>
);