/**
 * KAYAN ENTERPRISE UI — مكتبة المكونات المشتركة
 * ============================================================
 * نقطة الاستيراد الوحيدة لكل شاشة. استورد من هنا لا من
 * الملفات مباشرة، حتى يبقى ترتيب إعادة التسمية قراراً واحداً
 * بدل تعديل كل استدعاء في النظام.
 *
 * تصنيفات المكوّنات:
 *   - controls   : حقول الإدخال وعناصر النموذج
 *   - Button     : الأزرار والأيقونات
 *   - FormField  : بنية النماذج والتسميات
 *   - PageToolbar: شريط الإجراءات العلوي
 *   - DataTable  : الجداول والترقيم والحالة
 *   - Dialog     : النوافذ والتأكيد
 *   - Toast      : رسائل النظام
 *   - PageHeader : العنوان والمسار
 *   - KpiCard    : بطاقات الإحصاء والبطاقات العامة
 *   - Tabs       : التبويبات الموحدة
 */

export { Button, IconButton } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize, IconButtonProps } from './Button';

export {
  Input,
  SearchInput,
  NumberInput,
  NumericInput,
  Textarea,
  Select,
  SearchSelect,
  DatePicker,
  Checkbox,
  RadioGroup,
  controlBase,
} from './controls';
export type {
  InputProps,
  SearchInputProps,
  NumberInputProps,
  NumericInputProps,
  TextareaProps,
  SelectProps,
  SelectOption,
  SearchSelectProps,
  DatePickerProps,
  CheckboxProps,
  RadioGroupProps,
  RadioOption,
  ControlSize,
} from './controls';

export { FormField, FormSection, FormActions, FormGrid } from './FormField';
export type { FormFieldProps, FormSectionProps, FormActionsProps, FormGridProps } from './FormField';

export { PageToolbar, ToolbarActions, ToolbarDivider, ToolbarIconButton } from './PageToolbar';
export type { PageToolbarProps, ToolbarAction, ToolbarActionKind } from './PageToolbar';

export {
  DataTable,
  DataTablePaginationBar,
  StatusBadge,
  CellStatus,
  TableToolbar,
  formatMoney,
  formatDate,
} from './DataTable';
export type {
  DataTableProps,
  DataTableColumn,
  DataTablePagination,
  SortDir,
  StatusBadgeProps,
  CellStatusProps,
  StatusTone,
} from './DataTable';

export { Dialog, ConfirmDialog, InfoDialog } from './Dialog';
export type { DialogProps, ConfirmDialogProps } from './Dialog';

export { FormDialog } from './FormDialog';
export type { FormDialogProps } from './FormDialog';

export { ToastProvider, useToast, useAlerts } from './Toast';
export type { ToastTone, ToastOptions } from './Toast';

export { PageHeader, ScreenShell, pathToBreadcrumbs } from './PageHeader';
export type { PageHeaderProps, Breadcrumb, ScreenShellProps } from './PageHeader';

export { KpiCard, StatBadge, Card, EmptyState, LoadingState } from './KpiCard';
export type { KpiCardProps, KpiTrend, CardProps, EmptyStateProps } from './KpiCard';

export { Tabs, TabPanel } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';