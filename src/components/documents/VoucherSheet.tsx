import React from 'react';
import { ChevronDown, Copy, Trash2 } from 'lucide-react';
import { cn } from 'cn';

/**
 * KAYAN ENTERPRISE — VoucherSheet
 * ============================================================
 * غلاف بصري موحّد لسند القبض وسند الصرف، مطابق لتركيب المرجع:
 *  - شريط إجراءات علوي مستقل.
 *  - لوحة بيانات السند بشريط كحلي وتبويب على اليمين.
 *  - جدول قيود بأعمدة مدينة/دائنة ملوّنة وثمانية أسطر ثابتة.
 *  - شريط إجماليات وشريط تدقيق للقراءة فقط.
 *
 * المكوّنات عرضية فقط: لا تحسب مبالغ ولا تنشئ بيانات؛ الصفحة تمرّر
 * القيم الحقيقية من الخدمات الحالية.
 */

export function formatVoucherMoney(value: number | string | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** تاريخ ووقت بصيغة المرجع (01/11/2026 15:07:22) مع احترام قيمة الخادم. */
export function formatVoucherDateTime(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const date = parsed.toLocaleDateString('en-GB');
  const time = parsed.toLocaleTimeString('en-GB', { hour12: false });
  return `${date} ${time}`;
}

/* ------------------------------------------------------------------ */
/* Workspace                                                          */
/* ------------------------------------------------------------------ */

export interface VoucherWorkspaceProps {
  actionBar: React.ReactNode;
  info: React.ReactNode;
  details: React.ReactNode;
  audit?: React.ReactNode;
  notice?: React.ReactNode;
  printContent?: React.ReactNode;
}

export const VoucherWorkspace: React.FC<VoucherWorkspaceProps> = ({
  actionBar,
  info,
  details,
  audit,
  notice,
  printContent,
}) => (
  <>
    <div className="kayan-sheet-workspace print:hidden">
      {notice && <div className="kayan-sheet-notice">{notice}</div>}
      {actionBar}
      <div className="kayan-sheet-body">
        <div className="kayan-sheet-info">{info}</div>
        <div className="kayan-sheet-details">{details}</div>
        {audit && <div className="kayan-sheet-audit">{audit}</div>}
      </div>
    </div>

    {printContent && (
      <div className="hidden print:block" data-document-print="true">
        {printContent}
      </div>
    )}
  </>
);

/* ------------------------------------------------------------------ */
/* Panel with the navy ribbon and right-side tab                      */
/* ------------------------------------------------------------------ */

export interface VoucherPanelProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** يحوّل أيقونة التبويب إلى زر حقيقي (مثل فتح الأثر المحاسبي). */
  onTabAction?: () => void;
  tabActionTitle?: string;
}

export const VoucherPanel: React.FC<VoucherPanelProps> = ({
  title,
  icon,
  children,
  className,
  bodyClassName,
  onTabAction,
  tabActionTitle,
}) => (
  <section className={cn('kayan-sheet-panel', className)}>
    <div className="kayan-sheet-ribbon">
      <div className="kayan-sheet-tab">
        {icon &&
          (onTabAction ? (
            <button
              type="button"
              onClick={onTabAction}
              className="kayan-sheet-tab-icon-btn"
              title={tabActionTitle || 'خيارات اللوحة'}
              aria-label={tabActionTitle || 'خيارات اللوحة'}
            >
              {icon}
            </button>
          ) : (
            <span className="kayan-sheet-tab-icon">{icon}</span>
          ))}
        <span className="kayan-sheet-tab-title">{title}</span>
      </div>
    </div>
    <div className={cn('kayan-sheet-panel-body', bodyClassName)}>{children}</div>
  </section>
);

/* ------------------------------------------------------------------ */
/* Labeled field / read-only field                                    */
/* ------------------------------------------------------------------ */

export interface VoucherFieldProps {
  label: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const VoucherField: React.FC<VoucherFieldProps> = ({
  label,
  required,
  children,
  className,
}) => (
  <div className={cn('kayan-sheet-field', className)}>
    <span className="kayan-sheet-field-label">
      <span>{label}</span>
      {required && <span className="kayan-sheet-required">*</span>}
    </span>
    {children}
  </div>
);

export interface VoucherStaticFieldProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  tone?: 'default' | 'amount' | 'muted' | 'success';
  title?: string;
}

export const VoucherStaticField: React.FC<VoucherStaticFieldProps> = ({
  children,
  icon,
  className,
  tone = 'default',
  title,
}) => (
  <div
    className={cn('kayan-sheet-static', tone !== 'default' && `is-${tone}`, className)}
    title={title}
  >
    {icon && <span className="kayan-sheet-static-icon">{icon}</span>}
    <span className="kayan-sheet-static-value">{children}</span>
  </div>
);

/** حقل بعنوان بجانب الضابط (الفرع/العملة/سعر الصرف في المرجع). */
export interface VoucherInlineFieldProps {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const VoucherInlineField: React.FC<VoucherInlineFieldProps> = ({
  label,
  children,
  className,
}) => (
  <div className={cn('kayan-sheet-inline-field', className)}>
    <span className="kayan-sheet-inline-label">{label}</span>
    <div className="kayan-sheet-inline-control">{children}</div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Ledger table                                                       */
/* ------------------------------------------------------------------ */

export interface VoucherLedgerRow {
  key?: string;
  accountType?: string;
  accountCode?: string;
  accountName?: string;
  description?: string;
  currency?: string;
  rate?: string;
  debit?: number | string | null;
  credit?: number | string | null;
}

export interface VoucherLedgerTableProps {
  rows: VoucherLedgerRow[];
  /** إجمالي الأسطر المعروضة؛ الأسطر الناقصة تُملأ كصفوف فارغة. */
  minRows?: number;
  emptyActionsTitle?: string;
}

const EMPTY_CELL = <span className="kayan-sheet-empty-value" aria-hidden="true" />;

export const VoucherLedgerTable: React.FC<VoucherLedgerTableProps> = ({
  rows,
  minRows = 8,
  emptyActionsTitle = 'الإجراءات غير مدعومة في بنود هذا السند',
}) => {
  const filled = rows.filter(
    (row) =>
      Boolean(row.accountName || row.accountCode || row.accountType || row.description) ||
      (row.debit !== null && row.debit !== undefined && row.debit !== '') ||
      (row.credit !== null && row.credit !== undefined && row.credit !== '')
  );
  const emptyCount = Math.max(0, minRows - filled.length);
  const placeholders = Array.from({ length: emptyCount }, (_, index) => index);

  const actionCell = (
    <td className="kayan-sheet-ledger-actions">
      <span className="kayan-sheet-row-actions" title={emptyActionsTitle}>
        <button
          type="button"
          className="kayan-sheet-row-action copy"
          disabled
          aria-label="نسخ السطر"
          title={emptyActionsTitle}
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          className="kayan-sheet-row-action delete"
          disabled
          aria-label="حذف السطر"
          title={emptyActionsTitle}
        >
          <Trash2 size={14} />
        </button>
      </span>
    </td>
  );

  return (
    <div className="kayan-sheet-ledger-wrap">
      <table className="kayan-sheet-ledger">
        <thead>
          <tr>
            <th className="col-index">م</th>
            <th className="col-type">نوع الحساب</th>
            <th className="col-code">رقم الحساب</th>
            <th className="col-name">اسم الحساب</th>
            <th className="col-description">البيان</th>
            <th className="col-currency">عملة</th>
            <th className="col-rate">سعر الصرف</th>
            <th className="col-debit">مدين</th>
            <th className="col-credit">دائن</th>
            <th className="col-actions" aria-label="إجراءات" />
          </tr>
        </thead>
        <tbody>
          {filled.map((row, index) => (
            <tr key={row.key || `row-${index}`} className="is-filled">
              <td className="col-index">{index + 1}</td>
              <td className="col-type">
                <span className="kayan-sheet-type-value">{row.accountType || '—'}</span>
                <ChevronDown size={12} className="kayan-sheet-type-chevron" aria-hidden="true" />
              </td>
              <td className="col-code">{row.accountCode || EMPTY_CELL}</td>
              <td className="col-name">{row.accountName || EMPTY_CELL}</td>
              <td className="col-description" title={row.description || undefined}>
                {row.description || EMPTY_CELL}
              </td>
              <td className="col-currency">{row.currency || '—'}</td>
              <td className="col-rate kayan-numeric">{row.rate || '1.0000'}</td>
              <td
                className={cn(
                  'col-debit kayan-numeric',
                  row.debit !== null && row.debit !== undefined && 'is-debit'
                )}
              >
                {row.debit !== null && row.debit !== undefined
                  ? formatVoucherMoney(row.debit)
                  : EMPTY_CELL}
              </td>
              <td
                className={cn(
                  'col-credit kayan-numeric',
                  row.credit !== null && row.credit !== undefined && 'is-credit'
                )}
              >
                {row.credit !== null && row.credit !== undefined
                  ? formatVoucherMoney(row.credit)
                  : EMPTY_CELL}
              </td>
              {actionCell}
            </tr>
          ))}

          {placeholders.map((_, placeholderIndex) => {
            const index = filled.length + placeholderIndex;
            return (
              <tr
                key={`empty-${index}`}
                className={cn('is-placeholder', index % 2 === 1 && 'is-tinted')}
              >
                <td className="col-index">{index + 1}</td>
                <td className="col-type">
                  <ChevronDown size={12} className="kayan-sheet-type-chevron" aria-hidden="true" />
                </td>
                <td className="col-code">{EMPTY_CELL}</td>
                <td className="col-name">{EMPTY_CELL}</td>
                <td className="col-description">{EMPTY_CELL}</td>
                <td className="col-currency">{EMPTY_CELL}</td>
                <td className="col-rate">{EMPTY_CELL}</td>
                <td className="col-debit">{EMPTY_CELL}</td>
                <td className="col-credit">{EMPTY_CELL}</td>
                {actionCell}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Totals strip                                                       */
/* ------------------------------------------------------------------ */

export interface VoucherTotalsStripProps {
  debit: number;
  credit: number;
  difference: number;
  currency?: string;
  onAddLine?: () => void;
  onDeleteLine?: () => void;
  addTitle?: string;
  deleteTitle?: string;
}

export const VoucherTotalsStrip: React.FC<VoucherTotalsStripProps> = ({
  debit,
  credit,
  difference,
  currency,
  onAddLine,
  onDeleteLine,
  addTitle = 'إضافة سطر غير مدعومة في بنود هذا السند',
  deleteTitle = 'حذف سطر غير مدعوم في بنود هذا السند',
}) => (
  <div className="kayan-sheet-totals">
    <div className="kayan-sheet-totals-values">
      <span className="kayan-sheet-total">
        <span className="kayan-sheet-total-label">إجمالي المدين</span>
        <span className="kayan-sheet-total-value is-debit" title={currency}>
          {formatVoucherMoney(debit)}
        </span>
      </span>
      <span className="kayan-sheet-total">
        <span className="kayan-sheet-total-label">إجمالي الدائن</span>
        <span className="kayan-sheet-total-value is-credit" title={currency}>
          {formatVoucherMoney(credit)}
        </span>
      </span>
      <span className="kayan-sheet-total">
        <span className="kayan-sheet-total-label">الفرق</span>
        <span
          className={cn(
            'kayan-sheet-total-value is-difference',
            Math.abs(difference) > 0.0001 && 'has-difference'
          )}
        >
          {formatVoucherMoney(difference)}
        </span>
      </span>
    </div>

    <div className="kayan-sheet-totals-actions">
      <span title={addTitle}>
        <button
          type="button"
          className="kayan-sheet-line-btn add"
          onClick={onAddLine}
          disabled={!onAddLine}
          aria-label="إضافة سطر"
        >
          <span>إضافة سطر</span>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      </span>
      <span title={deleteTitle}>
        <button
          type="button"
          className="kayan-sheet-line-btn delete"
          onClick={onDeleteLine}
          disabled={!onDeleteLine}
          aria-label="حذف سطر"
        >
          <span>حذف سطر</span>
          <Trash2 size={16} />
        </button>
      </span>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Audit strip                                                        */
/* ------------------------------------------------------------------ */

export interface VoucherAuditItem {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted';
  title?: string;
}

export interface VoucherAuditStripProps {
  items: VoucherAuditItem[];
}

export const VoucherAuditStrip: React.FC<VoucherAuditStripProps> = ({ items }) => (
  <div className="kayan-sheet-audit-grid">
    {items.map((item, index) => (
      <div className="kayan-sheet-audit-item" key={index}>
        <span className="kayan-sheet-audit-label">{item.label}</span>
        <span
          className={cn(
            'kayan-sheet-audit-value',
            item.tone && item.tone !== 'default' && `is-${item.tone}`
          )}
          title={item.title}
        >
          {item.icon && <span className="kayan-sheet-audit-icon">{item.icon}</span>}
          <span className="kayan-sheet-audit-text">{item.value}</span>
        </span>
      </div>
    ))}
  </div>
);

export default VoucherWorkspace;
