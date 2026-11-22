import React from 'react';
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronFirst,
  ChevronLast,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { Button, ToolbarDivider } from '../ui';

/**
 * KAYAN ENTERPRISE UI — DocumentActionBar
 * ============================================================
 * شريط الإجراءات الموحّد لشاشات المستندات.
 *
 * الترتيب ثابت في كل المستندات (المواصفة §4):
 *   إضافة جديد ← تعديل ← حفظ ← طباعة ← أرشفة ← خروج.
 *
 * لا ينشئ هذا المكوّن أي وظيفة وهمية: كل زر يستدعي handler فعلياً
 * تمرّره الشاشة. الأزرار غير المدعومة تُعطَّل مع سبب ظاهر، بدل أن
 * تُخفى أو تُربط بسلوك مزيف. الأرشفة تحديداً غير مدعومة في النظام
 * الحالي، لذلك تصل دائماً `canArchive = false` مع سبب.
 */

export type DocumentMode = 'create' | 'view' | 'edit';
export type DocumentStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

export interface DocumentActionBarProps {
  mode: DocumentMode;
  status?: DocumentStatus;
  saving?: boolean;
  /** نسخة شريط الإجراءات: الافتراضية للمستندات، voucher لسندي القبض/الصرف. */
  variant?: 'default' | 'voucher';
  /** عنوان السند داخل شريط الإجراءات (نسخة voucher). */
  title?: React.ReactNode;
  /** أيقونة العنوان (عملات ذهبية في المرجع). */
  titleIcon?: React.ReactNode;
  /** إجراءات ثانوية مضغوطة تحت الشريط (حفظ وترحيل / ترحيل واعتماد). */
  secondaryActions?: React.ReactNode;
  /** إجراءات إضافية مسموحة في المستند (ترحيل، إلغاء/عكس...). */
  extraActions?: React.ReactNode;
  onNew: () => void;
  onEdit?: () => void;
  onSave?: () => void;
  onPrint?: () => void;
  onArchive?: () => void;
  onExit: () => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onFirst?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onLast?: () => void;
  navigationDisabled?: boolean;
  navigationReason?: string;
  onDelete?: () => void;
  canDelete?: boolean;
  deleteReason?: string;
  canEdit?: boolean;
  editReason?: string;
  canSave?: boolean;
  saveReason?: string;
  canPrint?: boolean;
  printReason?: string;
  canArchive?: boolean;
  archiveReason?: string;
  className?: string;
}

interface ActionSlotProps {
  label: string;
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  onClick?: () => void;
  disabled?: boolean;
  reason?: string;
  loading?: boolean;
}

/** زر واحد مع سبب تعطيل مقروء حتى عندما يكون الزر نفسه معطّلاً. */
const ActionSlot: React.FC<ActionSlotProps> = ({
  label,
  icon,
  variant = 'secondary',
  onClick,
  disabled,
  reason,
  loading,
}) => (
  <span className="inline-flex" title={disabled && reason ? reason : undefined}>
    <Button
      variant={variant}
      size="md"
      icon={icon}
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      loadingText="جارٍ التنفيذ..."
      aria-disabled={disabled || undefined}
    >
      {label}
    </Button>
  </span>
);

export const DocumentActionBar: React.FC<DocumentActionBarProps> = ({
  mode,
  status,
  saving = false,
  variant = 'default',
  title,
  titleIcon,
  secondaryActions,
  extraActions,
  onNew,
  onEdit,
  onSave,
  onPrint,
  onArchive,
  onExit,
  searchValue = '',
  onSearchChange,
  onFirst,
  onPrevious,
  onNext,
  onLast,
  navigationDisabled = false,
  navigationReason = 'التنقل بين السندات غير متاح في هذه الحالة.',
  onDelete,
  canDelete = false,
  deleteReason = 'حذف السند غير مدعوم من مسار الخادم الحالي.',
  canEdit,
  editReason,
  canSave,
  saveReason,
  canPrint,
  printReason,
  canArchive = false,
  archiveReason = 'الأرشفة غير مدعومة لهذا النوع من المستندات في النظام الحالي.',
  className,
}) => {
  const isDraft = status === 'DRAFT';
  const editAllowed =
    (canEdit ?? (mode === 'view' && isDraft)) && mode === 'view' && status !== 'VOIDED';
  const saveAllowed = (canSave ?? (mode === 'create' || mode === 'edit')) && !saving;
  const printAllowed = (canPrint ?? mode === 'view') && Boolean(onPrint);

  const disabledNotes: Array<{ label: string; reason: string }> = [];

  if (!editAllowed && mode !== 'edit') {
    const reason =
      editReason ??
      (mode === 'create'
        ? 'احفظ المستند أولاً، ثم يمكن تعديله من شاشة العرض.'
        : status === 'POSTED'
          ? 'لا يمكن تعديل مستند مرحّل محاسبياً؛ استخدم الإلغاء/العكس وفق قواعد النظام.'
          : status === 'VOIDED'
            ? 'لا يمكن تعديل مستند ملغى.'
            : 'التعديل غير متاح لهذه الحالة.');
    disabledNotes.push({ label: 'تعديل', reason });
  } else if (mode === 'edit') {
    disabledNotes.push({
      label: 'تعديل',
      reason: 'أنت في وضع التعديل بالفعل. احفظ التغييرات أو اخرج دون حفظ.',
    });
  }

  if (!saveAllowed && !saving) {
    disabledNotes.push({
      label: 'حفظ',
      reason:
        saveReason ??
        (mode === 'view'
          ? 'المستند محفوظ. ادخل وضع التعديل لتغيير بياناته.'
          : 'لا توجد تغييرات قابلة للحفظ في هذه الحالة.'),
    });
  }

  if (!printAllowed && mode !== 'view') {
    disabledNotes.push({
      label: 'طباعة',
      reason:
        mode === 'edit'
          ? 'احفظ التعديلات أولاً، ثم اطبع النسخة المحفوظة.'
          : 'احفظ المستند أولاً، ثم يمكن طباعته بالقالب المعتمد.',
    });
  } else if (!printAllowed && mode === 'view') {
    disabledNotes.push({
      label: 'طباعة',
      reason: printReason ?? 'لا يوجد مستند محفوظ لطباعته في هذه الحالة.',
    });
  }

  if (!canArchive) {
    disabledNotes.push({ label: 'أرشفة', reason: archiveReason });
  }

  if (!canDelete) {
    disabledNotes.push({ label: 'حذف', reason: deleteReason });
  }

  if (variant === 'voucher') {
    const editNote = disabledNotes.find((note) => note.label === 'تعديل')?.reason;
    const saveNote =
      saveReason ??
      (mode === 'view'
        ? 'المستند محفوظ. ادخل وضع التعديل لتغيير بياناته.'
        : 'لا توجد تغييرات قابلة للحفظ في هذه الحالة.');
    const printNote =
      printReason ??
      (mode === 'edit'
        ? 'احفظ التعديلات أولاً ثم اطبع.'
        : mode === 'view'
          ? 'لا يوجد مستند محفوظ لطباعته في هذه الحالة.'
          : 'احفظ المستند أولاً ثم يمكن طباعته بالقالب المعتمد.');

    return (
      <div className={`kayan-voucher-actions kayan-sheet-actions ${className || ''}`}>
        <div className="kayan-sheet-actionbar">
          <div className="kayan-sheet-actionbar-title">
            {titleIcon && <span className="kayan-sheet-actionbar-title-icon">{titleIcon}</span>}
            <span>{title}</span>
          </div>

          <ActionSlot
            label="إضافة جديد"
            icon={<Plus size={18} />}
            variant="primary"
            onClick={onNew}
            disabled={saving}
          />
          <ActionSlot
            label="حفظ"
            icon={<Save size={18} />}
            variant="success"
            onClick={onSave}
            disabled={!saveAllowed}
            reason={saveNote}
            loading={saving}
          />
          <ActionSlot
            label="تعديل"
            icon={<Pencil size={18} />}
            onClick={onEdit}
            disabled={!editAllowed || saving}
            reason={editNote}
          />
          <ActionSlot
            label="حذف"
            icon={<Trash2 size={18} />}
            variant="danger"
            onClick={onDelete}
            disabled={!canDelete || saving}
            reason={deleteReason}
          />
          <ActionSlot
            label="الأرشيف"
            icon={<Archive size={18} />}
            onClick={onArchive}
            disabled={!canArchive}
            reason={archiveReason}
          />
          <ActionSlot
            label="طباعة"
            icon={<Printer size={18} />}
            onClick={onPrint}
            disabled={!printAllowed}
            reason={printNote}
          />

          {extraActions && <div className="kayan-sheet-actionbar-extra">{extraActions}</div>}

          <div
            className="kayan-sheet-actionbar-nav"
            title={navigationDisabled ? navigationReason : undefined}
          >
            <div className="kayan-sheet-nav-arrows">
              <button
                type="button"
                aria-label="أول سند"
                title="أول سند"
                onClick={onFirst}
                disabled={navigationDisabled || !onFirst}
              >
                <ChevronFirst size={18} />
              </button>
              <button
                type="button"
                aria-label="السند السابق"
                title="السند السابق"
                onClick={onPrevious}
                disabled={navigationDisabled || !onPrevious}
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                aria-label="السند التالي"
                title="السند التالي"
                onClick={onNext}
                disabled={navigationDisabled || !onNext}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                aria-label="آخر سند"
                title="آخر سند"
                onClick={onLast}
                disabled={navigationDisabled || !onLast}
              >
                <ChevronLast size={18} />
              </button>
            </div>
            <div className="kayan-sheet-search-field">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
                placeholder="بحث عن سند"
                aria-label="بحث عن سند"
                disabled={!onSearchChange}
              />
            </div>
          </div>
        </div>

        {secondaryActions && (
          <div className="kayan-sheet-actionbar-secondary print:hidden">{secondaryActions}</div>
        )}
      </div>
    );
  }

  return (
    <div className={`kayan-voucher-actions ${className || ''}`}>
      <div className="kayan-voucher-action-row flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-2.5 shadow-k-xs print:hidden">
        <ActionSlot
          label="إضافة جديد"
          icon={<Plus size={16} />}
          variant="primary"
          onClick={onNew}
          disabled={saving}
        />
        <ActionSlot
          label="تعديل"
          icon={<Pencil size={16} />}
          onClick={onEdit}
          disabled={!editAllowed || saving}
          reason={disabledNotes.find((n) => n.label === 'تعديل')?.reason}
        />
        <ActionSlot
          label="حفظ"
          icon={<Save size={16} />}
          variant="success"
          onClick={onSave}
          disabled={!saveAllowed}
          reason={
            saveReason ??
            (mode === 'view'
              ? 'المستند محفوظ. ادخل وضع التعديل لتغيير بياناته.'
              : 'لا توجد تغييرات قابلة للحفظ في هذه الحالة.')
          }
          loading={saving}
        />

        <ActionSlot
          label="حذف"
          icon={<Trash2 size={16} />}
          variant="danger"
          onClick={onDelete}
          disabled={!canDelete || saving}
          reason={deleteReason}
        />

        <ToolbarDivider className="mx-0.5 hidden sm:block" />

        <ActionSlot
          label="طباعة"
          icon={<Printer size={16} />}
          onClick={onPrint}
          disabled={!printAllowed}
          reason={
            printReason ??
            (mode === 'edit'
              ? 'احفظ التعديلات أولاً ثم اطبع.'
              : 'الطباعة متاحة بعد حفظ المستند.')
          }
        />
        <ActionSlot
          label="أرشفة"
          icon={<Archive size={16} />}
          onClick={onArchive}
          disabled={!canArchive}
          reason={archiveReason}
        />
        <ActionSlot
          label="خروج"
          icon={<ArrowRight size={16} />}
          variant="ghost"
          onClick={onExit}
          disabled={saving}
        />

        {extraActions && (
          <>
            <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-2">{extraActions}</div>
          </>
        )}

        <div className="kayan-voucher-navigation-tools" title={navigationDisabled ? navigationReason : undefined}>
          <div className="kayan-voucher-search-field">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder="بحث عن سند"
              aria-label="بحث عن سند"
              disabled={!onSearchChange}
            />
          </div>
          <button type="button" aria-label="أول سند" title="أول سند" onClick={onFirst} disabled={navigationDisabled || !onFirst}>
            <ChevronFirst size={17} />
          </button>
          <button type="button" aria-label="السند السابق" title="السند السابق" onClick={onPrevious} disabled={navigationDisabled || !onPrevious}>
            <ChevronRight size={17} />
          </button>
          <button type="button" aria-label="السند التالي" title="السند التالي" onClick={onNext} disabled={navigationDisabled || !onNext}>
            <ChevronLeft size={17} />
          </button>
          <button type="button" aria-label="آخر سند" title="آخر سند" onClick={onLast} disabled={navigationDisabled || !onLast}>
            <ChevronLast size={17} />
          </button>
        </div>
      </div>

      {disabledNotes.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] leading-relaxed text-ink-muted print:hidden">
          <span className="inline-flex items-center gap-1 font-semibold text-ink-muted">
            <CheckCircle2 size={12} className="opacity-70" aria-hidden="true" />
            ملاحظات الإجراءات:
          </span>
          {disabledNotes.map((note) => (
            <span key={note.label}>
              <strong className="font-bold text-ink">{note.label}:</strong> {note.reason}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentActionBar;
