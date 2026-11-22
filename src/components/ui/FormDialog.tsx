import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { FormActions } from './FormField';
import { cn } from 'cn';

/**
 * KAYAN ENTERPRISE UI — FormDialog
 * ============================================================
 * نافذة إدخال مستقلة عن شاشة العرض، تجمع ما كان يتكرر في كل صفحة:
 *
 *   - نموذج داخل <form> حقيقي، وزر الحفظ مرتبط به عبر `form=` حتى
 *     يبقى في شريط سفلي مثبّت خارج منطقة التمرير.
 *   - عرض واسع افتراضي (xl) مع تمرير عمودي للجسم، ولا يشغل الشاشة
 *     على الجوال إلا بقدر ما يلزم.
 *   - حارس تغييرات غير محفوظة: أي محاولة إغلاق (X/Escape/النقر
 *     خارجاً) مع `dirty` تفتح تأكيداً بدل فقدان العمل بصمت.
 *   - منع الحفظ المكرر عبر `submitting` (يعطّل الحفظ والإلغاء
 *     والإغلاق حتى تنتهي العملية).
 *   - شريط خطأ فعلي من الخادم أعلى الحقول، مع إبقاء القيم كما هي.
 *
 * المكوّن لا يقرر نجاح الحفظ: الصفحة ترسل الطلب وتغلق النافذة بعد
 * نجاحه فقط، وتترك `error` معروضاً عند الفشل.
 */

export interface FormDialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** حقول النموذج. تُوضع داخل <form> تلقائياً. */
  children: React.ReactNode;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  submitLabel?: string;
  submitLoadingLabel?: string;
  cancelLabel?: string;
  /** عملية حفظ جارية — يمنع النقر المكرر والإغلاق. */
  submitting?: boolean;
  /** وجود تغييرات غير محفوظة — يفعّل حارس الإغلاق. */
  dirty?: boolean;
  /** خطأ خادم/تحقق يُعرض أعلى النموذج دون فقدان المدخلات. */
  error?: string | null;
  size?: 'md' | 'lg' | 'xl' | 'full';
  submitDisabled?: boolean;
  /** ملاحظة صغيرة بجانب أزرار الحفظ (مثل "الحقول المعلّمة * مطلوبة"). */
  footerNote?: React.ReactNode;
  /** إجراءات إضافية يسار الشريط (مثل زر الطباعة). */
  extraActions?: React.ReactNode;
  formId?: string;
  className?: string;
  bodyClassName?: string;
}

export const FormDialog: React.FC<FormDialogProps> = ({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  onSubmit,
  submitLabel = 'حفظ',
  submitLoadingLabel = 'جارٍ الحفظ...',
  cancelLabel = 'إلغاء',
  submitting = false,
  dirty = false,
  error,
  size = 'xl',
  submitDisabled = false,
  footerNote,
  extraActions,
  formId,
  className,
  bodyClassName,
}) => {
  const autoId = React.useId();
  const id = formId || `kayan-form-${autoId}`;
  const [confirmClose, setConfirmClose] = React.useState(false);

  /* أي محاولة إغلاق تمر من هنا: أثناء الحفظ لا شيء يحدث، ومع
     تغييرات غير محفوظة نطلب تأكيداً صريحاً. */
  const requestClose = React.useCallback(() => {
    if (submitting) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }, [dirty, onClose, submitting]);

  React.useEffect(() => {
    if (!open) setConfirmClose(false);
  }, [open]);

  const discardAndClose = () => {
    setConfirmClose(false);
    onClose();
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={requestClose}
        dismissible={!submitting}
        size={size}
        title={title}
        description={description}
        icon={icon}
        className={className}
        footer={
          <>
            <div className="me-auto flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-ink-muted">
              {extraActions}
              {footerNote}
            </div>
            <Button variant="secondary" onClick={requestClose} disabled={submitting}>
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              form={id}
              variant="primary"
              loading={submitting}
              loadingText={submitLoadingLabel}
              disabled={submitDisabled}
            >
              {submitLabel}
            </Button>
          </>
        }
      >
        <form id={id} onSubmit={onSubmit} className={cn('space-y-5', bodyClassName)} noValidate>
          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-control border border-state-danger/40 bg-state-danger-soft px-3.5 py-3 text-[13px] font-medium text-state-danger"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          ) : null}
          {children}
        </form>
      </Dialog>

      {/* تأكيد الإغلاق فوق النموذج: طبقة أعلى حتى لا يتداخلا. */}
      <Dialog
        open={open && confirmClose}
        onClose={() => setConfirmClose(false)}
        size="sm"
        zIndex={60}
        title="تغييرات غير محفوظة"
        icon={<AlertCircle size={19} />}
        footer={
          <FormActions className="w-full border-t-0 pt-0">
            <Button variant="secondary" onClick={() => setConfirmClose(false)}>
              متابعة التحرير
            </Button>
            <Button variant="danger" onClick={discardAndClose}>
              تجاهل والخروج
            </Button>
          </FormActions>
        }
      >
        <p className="text-sm leading-relaxed text-ink">
          أدخلت بيانات لم تُحفظ بعد. إذا أغلقت النموذج الآن ستفقد هذه التغييرات.
        </p>
      </Dialog>
    </>
  );
};
