import React from 'react';
import { Ban, CheckCircle2, Clock } from 'lucide-react';
import { cn } from 'cn';
import {
  Card,
  PageHeader,
  StatusBadge,
  type Breadcrumb,
  type StatusTone,
} from '../ui';
import type { DocumentStatus } from './DocumentActionBar';

/**
 * KAYAN ENTERPRISE UI — DocumentLayout
 * ============================================================
 * غلاف شاشة المستند بتوزيع رأسي كثيف: الإجراءات، بيانات المستند،
 * التفاصيل/التخصيص، ثم بيانات التدقيق للقراءة فقط.
 */

export interface DocumentWorkspaceProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  breadcrumbs?: Breadcrumb[];
  actionBar: React.ReactNode;
  children: React.ReactNode;
  /** بيانات المستند الأساسية التي تظهر مباشرة أسفل شريط الإجراءات. */
  sidebar: React.ReactNode;
  /** معلومات السجل للقراءة فقط في نهاية مساحة العمل. */
  footer?: React.ReactNode;
  /** جسم الطباعة المخفي على الشاشة، ويظهر فقط في @media print. */
  printContent?: React.ReactNode;
  notice?: React.ReactNode;
}

export const DocumentWorkspace: React.FC<DocumentWorkspaceProps> = ({
  title,
  description,
  icon,
  badge,
  breadcrumbs,
  actionBar,
  children,
  sidebar,
  footer,
  printContent,
  notice,
}) => (
  <>
    <div className="kayan-voucher-workspace flex min-h-[calc(100dvh-8rem)] flex-col gap-3 pb-4 print:hidden">
      <PageHeader
        title={title}
        description={description}
        icon={icon}
        badge={badge}
        breadcrumbs={breadcrumbs}
        compact
        className="kayan-voucher-page-header"
      />

      {notice}

      {actionBar}

      <div className="kayan-voucher-body flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <section aria-label="بيانات المستند" className="kayan-voucher-info min-w-0 shrink-0">
          {sidebar}
        </section>

        <section aria-label="تفاصيل المستند" className="kayan-voucher-details flex min-h-[22rem] min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-2">{children}</div>
        </section>

        {footer && (
          <section aria-label="بيانات التدقيق" className="kayan-voucher-audit min-w-0 shrink-0">
            {footer}
          </section>
        )}
      </div>
    </div>

    {printContent && (
      <div className="hidden print:block" data-document-print="true">
        {printContent}
      </div>
    )}
  </>
);

/* ------------------------------------------------------------
   DocumentField — تسمية + حقل داخل العمود الجانبي.
   ------------------------------------------------------------ */
export interface DocumentFieldProps {
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const DocumentField: React.FC<DocumentFieldProps> = ({
  label,
  required,
  hint,
  children,
  className,
}) => (
  <div className={cn('min-w-0 space-y-1.5', className)}>
    <div className="flex min-h-[18px] items-center justify-between gap-2">
      <span className="text-[11px] font-bold leading-tight text-ink-muted">
        {label}
        {required && <span className="text-state-danger"> *</span>}
      </span>
      {hint}
    </div>
    {children}
  </div>
);

/* ------------------------------------------------------------
   DocumentReadField — قيمة للقراءة فقط (لا تُحرَّر من المستند).
   ------------------------------------------------------------ */
export interface DocumentReadFieldProps {
  label: React.ReactNode;
  value?: React.ReactNode;
  className?: string;
  /** محاذاة الأرقام/التواريخ. */
  numeric?: boolean;
}

export const DocumentReadField: React.FC<DocumentReadFieldProps> = ({
  label,
  value,
  className,
  numeric,
}) => (
  <div className="min-w-0">
    <dt className="text-[11px] font-semibold text-ink-muted">{label}</dt>
    <dd
      className={cn(
        'mt-0.5 break-words text-[13px] font-semibold text-ink',
        numeric && 'kayan-numeric',
        className
      )}
    >
      {value === undefined || value === null || value === '' ? (
        '—'
      ) : numeric ? (
        <bdi dir="ltr">{value}</bdi>
      ) : (
        value
      )}
    </dd>
  </div>
);

export interface DocumentReadGridProps {
  children: React.ReactNode;
  columns?: 1 | 2;
  className?: string;
}

export const DocumentReadGrid: React.FC<DocumentReadGridProps> = ({
  children,
  columns = 2,
  className,
}) => (
  <dl
    className={cn(
      'grid gap-x-3 gap-y-3',
      columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
      className
    )}
  >
    {children}
  </dl>
);

/* ------------------------------------------------------------
   DocumentSummaryCard — ملخص قيم المستند الحقيقية.
   لا يحسب أي قيمة؛ يستلمها جاهزة من منطق المستند.
   ------------------------------------------------------------ */
export type SummaryTone = 'default' | 'muted' | 'success' | 'danger' | 'warning';

export interface SummaryRow {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: SummaryTone;
}

const SUMMARY_TONE: Record<SummaryTone, string> = {
  default: 'text-ink',
  muted: 'text-ink-muted',
  success: 'text-state-success',
  danger: 'text-state-danger',
  warning: 'text-state-warning',
};

export interface DocumentSummaryCardProps {
  title?: string;
  description?: string;
  rows: SummaryRow[];
  totalLabel?: string;
  totalValue: React.ReactNode;
  currency?: string;
  footer?: React.ReactNode;
  className?: string;
}

export const DocumentSummaryCard: React.FC<DocumentSummaryCardProps> = ({
  title = 'ملخص المستند',
  description,
  rows,
  totalLabel = 'المبلغ النهائي',
  totalValue,
  currency = 'ريال يمني',
  footer,
  className,
}) => (
  <Card title={title} description={description} className={className}>
    <div className="space-y-2 text-[13px]">
      {rows.map((row, i) => (
        <div key={i} className="flex items-start justify-between gap-3">
          <span className="text-ink-muted">{row.label}</span>
          <span
            className={cn(
              'kayan-numeric shrink-0 text-end font-semibold',
              SUMMARY_TONE[row.tone || 'default']
            )}
          >
            {row.value}
          </span>
        </div>
      ))}

      <div className="mt-1 border-t border-line pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold text-ink">{totalLabel}</span>
          <span className="kayan-numeric text-xl font-extrabold tracking-tight text-brand">
            {totalValue}
          </span>
        </div>
        <p className="mt-0.5 text-end text-[11px] font-semibold text-ink-muted">{currency}</p>
      </div>

      {footer && <div className="border-t border-line-soft pt-2.5">{footer}</div>}
    </div>
  </Card>
);

/* ------------------------------------------------------------
   DocumentAuditCard — معلومات السجل من مصادرها الفعلية فقط.
   ------------------------------------------------------------ */
export interface DocumentAuditCardProps {
  title?: React.ReactNode;
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdDevice?: string | null;
  updatedDevice?: string | null;
  /** ملاحظة توضح مصدر البيانات أو غياب بعضها. */
  sourceNote?: React.ReactNode;
  className?: string;
}

export function formatDocumentDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${y}/${m}/${d} ${time}`;
}

export const DocumentAuditCard: React.FC<DocumentAuditCardProps> = ({
  title = 'معلومات السجل',
  createdByName,
  updatedByName,
  createdAt,
  updatedAt,
  createdDevice,
  updatedDevice,
  sourceNote,
  className,
}) => (
  <Card
    title={title}
    description="للقراءة فقط — لا تُحرَّر من نموذج المستند"
    className={className}
  >
    <DocumentReadGrid columns={2} className="gap-x-4 gap-y-2 lg:grid-cols-3">
      <DocumentReadField
        label="مدخل السجل"
        value={createdByName || <span className="font-normal text-ink-muted">غير متوفر</span>}
      />
      <DocumentReadField
        label="معدّل السجل"
        value={updatedByName || <span className="font-normal text-ink-muted">غير متوفر</span>}
      />
      <DocumentReadField label="تاريخ الإدخال" value={formatDocumentDateTime(createdAt)} numeric />
      <DocumentReadField label="تاريخ التعديل" value={formatDocumentDateTime(updatedAt)} numeric />
      <DocumentReadField
        label="الجهاز المدخل"
        value={createdDevice || <span className="font-normal text-ink-muted">غير متوفر</span>}
      />
      <DocumentReadField
        label="الجهاز المعدّل"
        value={updatedDevice || <span className="font-normal text-ink-muted">غير متوفر</span>}
      />
    </DocumentReadGrid>

    <p className="mt-2 border-t border-line-soft pt-2 text-[10px] leading-snug text-ink-muted">
      {sourceNote ??
        'المصدر: حقول السجل في قاعدة البيانات وسجل التدقيق. الأجهزة غير مسجلة، وتظهر «غير متوفر» بدل تخمينها.'}
    </p>
  </Card>
);

/* ------------------------------------------------------------
   DocumentStatusBadge — حالة المستند بنفس مفردات النظام.
   ------------------------------------------------------------ */
const STATUS_MAP: Record<DocumentStatus, { tone: StatusTone; label: string; icon: React.ReactNode }> = {
  DRAFT: { tone: 'warning', label: 'مسودة', icon: <Clock size={12} /> },
  POSTED: { tone: 'success', label: 'مرحّلة', icon: <CheckCircle2 size={12} /> },
  VOIDED: { tone: 'danger', label: 'ملغاة', icon: <Ban size={12} /> },
};

export const DocumentStatusBadge: React.FC<{ status: DocumentStatus }> = ({ status }) => {
  const conf = STATUS_MAP[status];
  return (
    <StatusBadge tone={conf.tone} icon={conf.icon}>
      {conf.label}
    </StatusBadge>
  );
};

/* ------------------------------------------------------------
   DocumentTableShell — غلاف جدول الأصناف مع تمرير أفقي.
   ------------------------------------------------------------ */
export const DocumentTableShell: React.FC<{
  children: React.ReactNode;
  className?: string;
  /** عرض أدنى يحافظ على وضوح الأعمدة بدل ضغطها. */
  minWidth?: number;
}> = ({ children, className, minWidth = 920 }) => (
  <div className={cn('min-h-0 min-w-0 flex-1 overflow-auto', className)}>
    <div style={{ minWidth }}>{children}</div>
  </div>
);

export default DocumentWorkspace;
