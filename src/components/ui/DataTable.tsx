import React from 'react';
import { cn } from 'cn';
import { Check, ChevronDown, ChevronUp, ChevronsUpDown, Inbox, Loader2, AlertCircle, Minus } from 'lucide-react';

/**
 * KAYAN ENTERPRISE UI — DataTable
 * ============================================================
 * الجدول الموحد لكل الوحدات. قبله كانت كل شاشة تكتب
 * `<table>` خاصاً بها بـ thead/vmess/fixtures مختلفة، فتتباين
 * المسافات والألوان والترويسة حتى داخل الوحدة نفسها.
 *
 * القواعد المطبّقة (المواصفة §7):
 *   - الأرقام المالية محاذاة ثابتة ومطابقة للعرض.
 *   - الحالة بنص واضح وليس باللون وحده.
 *   - حالات تحميل / خطأ / فراغ / ترقيم موحّدة.
 *   - الترويسة ثابتة بصرياً داخل منطقة قابلة للتمرير.
 *   - `selectable` اختيار الصفوف + `onSelect` — اختيارياً.
 *   - لا يحمل كل السجلات: يقبل `paged` بترتيب الصفحات
 *     نفسه عبر `pagination`.
 *
 * التصميم قائم على الجداول الأصلية (opacity/layout), والقفل على
 * القيم المالية/التواريخ يمرّر من الصفحة لأنها الأقرب للقاعدة.
 */

export type SortDir = 'asc' | 'desc' | null;

export interface DataTableColumn<T = any> {
  key: string;
  header: React.ReactNode;
  /** محاذاة المحتوى — الافتراضي 'start'. الأرقام تستخدم 'end' */
  align?: 'start' | 'center' | 'end';
  /** يضع العمود في محاذاة tabular-nums. */
  numeric?: boolean;
  width?: string;
  render?: (row: T, index: number) => React.ReactNode;
  /** يمكن الفرز على هذا العمود — يحتاج علىSortChange. */
  sortable?: boolean;
  /** عرض العمود على الشاشات الكبيرة فقط (يختفي على الصغيرة). */
  hideOnSmall?: boolean;
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<T = any> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  loadingText?: string;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  error?: string | null;
  /** ارتفاع الأجزاء الثابتة. */
  maxHeight?: string;
  onSortChange?: (key: string, dir: SortDir) => void;
  sort?: { key: string; dir: SortDir };
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  onRowClick?: (row: T, index: number) => void;
  rowClassName?: (row: T, index: number) => string;
  pagination?: DataTablePagination;
  stickyHeader?: boolean;
  /** إظهار عمود # (رقم الصف) بأرقام مصفوفة. */
  showRowNumbers?: boolean;
  /** عناصر ثابتة أعلى الجدول (ملصقات إحصاء). */
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** مجموعات أعمدة قابلة للطي على الشاشات الصغيرة. */
  compact?: boolean;
}

const ALIGN: Record<NonNullable<DataTableColumn['align']>, string> = {
  start: 'text-start',
  center: 'text-center',
  end: 'text-end',
};

export function DataTable<T = any>({
  columns,
  data,
  rowKey,
  loading = false,
  loadingText = 'جارٍ التحميل...',
  emptyMessage = 'لا توجد بيانات لعرضها',
  emptyIcon,
  error = null,
  maxHeight,
  onSortChange,
  sort,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  onRowClick,
  rowClassName,
  pagination,
  stickyHeader = true,
  showRowNumbers = false,
  header,
  footer,
  className,
}: DataTableProps<T>) {
  const allKeys = React.useMemo(() => data.map((r, i) => rowKey(r, i)), [data, rowKey]);
  const allSelected = selectedKeys.length > 0 && selectedKeys.length === data.length && data.length > 0;
  const someSelected = selectedKeys.length > 0 && !allSelected;

  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? [] : allKeys);
  };

  const toggleOne = (key: string) => {
    if (!onSelectionChange) return;
    onSelectionChange(
      selectedKeys.includes(key) ? selectedKeys.filter((k) => k !== key) : [...selectedKeys, key]
    );
  };

  const handleSort = (col: DataTableColumn<T>) => {
    if (!onSortChange || !col.sortable) return;
    const nextDir: SortDir = sort?.key === col.key && sort.dir === 'asc' ? 'desc' : 'asc';
    onSortChange(col.key, nextDir);
  };

  const visibleColumns = columns;

  const isEmpty = !loading && !error && data.length === 0;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border border-line bg-surface shadow-k-xs',
        className
      )}
    >
      {header && <div className="border-b border-line px-4 py-3">{header}</div>}

      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full border-collapse text-start text-[13px]">
          <thead
            className={cn(
              'bg-surface-muted text-xs font-bold text-ink-muted',
              stickyHeader && 'sticky top-0 z-10'
            )}
          >
            <tr className="border-b border-line">
              {selectable && (
                <th scope="col" className="w-10 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    aria-label="تحديد كل الصفوف"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="h-4 w-4 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface checked:border-brand checked:bg-brand outline-none focus-visible:ring-[3px] focus-visible:ring-brand/25"
                  />
                </th>
              )}
              {showRowNumbers && (
                <th scope="col" className="w-10 px-3 py-3 text-center font-mono">#</th>
              )}
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'px-4 py-3 whitespace-nowrap',
                    ALIGN[col.align || 'start'],
                    col.numeric && 'kayan-numeric',
                    col.hideOnSmall && 'hidden md:table-cell'
                  )}
                >
                  {col.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-sm px-1 py-0.5 transition-colors hover:text-ink',
                        sort?.key === col.key && 'text-brand'
                      )}
                      aria-label={`ترتيب حسب ${typeof col.header === 'string' ? col.header : col.key}`}
                    >
                      <span>{col.header}</span>
                      {sort?.key === col.key ? (
                        sort.dir === 'desc' ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronUp size={14} />
                        )
                      ) : (
                        <ChevronsUpDown size={13} className="opacity-50" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-line-soft">
            {loading ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + (selectable ? 1 : 0) + (showRowNumbers ? 1 : 0)}
                  className="px-6 py-14 text-center"
                >
                  <Loader2 size={22} className="mx-auto animate-spin text-brand" />
                  <p className="mt-3 text-[13px] text-ink-muted">{loadingText}</p>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + (selectable ? 1 : 0) + (showRowNumbers ? 1 : 0)}
                  className="px-6 py-14 text-center"
                >
                  <AlertCircle size={22} className="mx-auto text-state-danger" />
                  <p className="mt-3 text-[13px] font-semibold text-state-danger">{error}</p>
                </td>
              </tr>
            ) : isEmpty ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + (selectable ? 1 : 0) + (showRowNumbers ? 1 : 0)}
                  className="px-6 py-14 text-center"
                >
                  {emptyIcon || <Inbox size={26} className="mx-auto text-ink-muted/60" />}
                  <p className="mt-3 text-[13px] text-ink-muted">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const key = rowKey(row, index);
                const isSelected = selectedKeys.includes(key);
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                    className={cn(
                      'transition-colors',
                      onRowClick && 'cursor-pointer',
                      isSelected ? 'bg-brand-soft' : 'hover:bg-surface-hover',
                      rowClassName && rowClassName(row, index)
                    )}
                  >
                    {selectable && (
                      <td className="px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`تحديد الصف ${index + 1}`}
                          checked={isSelected}
                          onChange={() => toggleOne(key)}
                          className="h-4 w-4 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface checked:border-brand checked:bg-brand outline-none focus-visible:ring-[3px] focus-visible:ring-brand/25"
                        />
                      </td>
                    )}
                    {showRowNumbers && (
                      <td className="kayan-numeric px-3 text-center font-mono text-xs text-ink-muted">
                        {pagination
                          ? (pagination.page - 1) * pagination.pageSize + index + 1
                          : index + 1}
                      </td>
                    )}
                    {visibleColumns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-4 py-3 align-middle',
                          ALIGN[col.align || 'start'],
                          col.numeric && 'kayan-numeric font-medium',
                          col.hideOnSmall && 'hidden md:table-cell'
                        )}
                      >
                        {col.render ? col.render(row, index) : (row as any)?.[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {footer && <div className="border-t border-line px-4 py-3">{footer}</div>}

      {pagination && pagination.total > 0 && (
        <DataTablePaginationBar pagination={pagination} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------
   شريط الترقيم — نص "عرض 1-5 من 1,250" + أزرار الصفحات.
   يظهر فقط إن كان هناك ما يُصفح.
   ------------------------------------------------------------ */
export const DataTablePaginationBar: React.FC<{ pagination: DataTablePagination }> = ({
  pagination,
}) => {
  const { page, pageSize, total, onPageChange } = pagination;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const goTo = (p: number) => {
    if (p < 1 || p > pages || p === page) return;
    onPageChange(p);
  };

  const windowSize = 5;
  const start = Math.max(1, Math.min(page - Math.floor(windowSize / 2), pages - windowSize + 1));
  const nums: number[] = [];
  for (let i = start; i < start + windowSize && i <= pages; i++) nums.push(i);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-muted px-4 py-3">
      <p className="kayan-numeric text-xs text-ink-muted">
        عرض {from.toLocaleString()}–{to.toLocaleString()} من {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-1">
        <PaginationButton onClick={() => goTo(page - 1)} disabled={page <= 1} label="الصفحة السابقة">
          <ChevronUp size={15} className="-rotate-90" />
        </PaginationButton>
        {nums.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => goTo(n)}
            aria-current={n === page ? 'page' : undefined}
            className={cn(
              'kayan-numeric h-8 min-w-8 rounded-md px-2 text-[13px] font-semibold transition-colors',
              n === page
                ? 'bg-brand text-white shadow-k-xs'
                : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
            )}
          >
            {n.toLocaleString()}
          </button>
        ))}
        <PaginationButton onClick={() => goTo(page + 1)} disabled={page >= pages} label="الصفحة التالية">
          <ChevronDown size={15} className="-rotate-90" />
        </PaginationButton>
      </div>
    </div>
  );
};

const PaginationButton: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}> = ({ children, onClick, disabled, label }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-line bg-surface px-2 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
  >
    {children}
  </button>
);

/* ------------------------------------------------------------
   StatusBadge — ملصق حالة موحّد.
   لون + نص + أيقونة متسقة عبر كل النظام (المستندات، المخزون،
   المستخدمون...). شرط المواصفة: لا يُعتمد على اللون وحده،
   فالنص دائماً حاضر.
   ------------------------------------------------------------ */
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'progress';

export interface StatusBadgeProps {
  tone: StatusTone;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  /** ملصق صغير داخل الجداول. */
  size?: 'sm' | 'md';
}

const TONE_STYLE: Record<StatusTone, string> = {
  success: 'bg-state-success-soft text-state-success border-state-success/30',
  warning: 'bg-state-warning-soft text-state-warning border-state-warning/30',
  danger: 'bg-state-danger-soft text-state-danger border-state-danger/30',
  info: 'bg-brand-soft text-brand border-brand/30',
  progress: 'bg-brand-soft text-brand border-brand/30',
  neutral: 'bg-surface-sunken text-ink-muted border-line',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  tone,
  children,
  icon,
  className,
  size = 'md',
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-pill border font-semibold',
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      TONE_STYLE[tone],
      className
    )}
  >
    {icon}
    <span>{children}</span>
  </span>
);

/* ------------------------------------------------------------
   CellStatus — حالة صف الجدول: أيقونة + نص صريح.
   ------------------------------------------------------------ */
export interface CellStatusProps {
  status: 'active' | 'inactive' | 'pending' | 'posted' | 'draft' | 'reversed';
  label?: string;
}

const STATUS_MAP: Record<CellStatusProps['status'], { tone: StatusTone; label: string }> = {
  active: { tone: 'success', label: 'نشط' },
  inactive: { tone: 'neutral', label: 'غير نشط' },
  pending: { tone: 'warning', label: 'قيد الانتظار' },
  posted: { tone: 'success', label: 'مرحل' },
  draft: { tone: 'neutral', label: 'مسودة' },
  reversed: { tone: 'danger', label: 'معكوس' },
};

export const CellStatus: React.FC<CellStatusProps> = ({ status, label }) => {
  const conf = STATUS_MAP[status];
  return (
    <StatusBadge tone={conf.tone} size="sm">
      {label || conf.label}
    </StatusBadge>
  );
};

/* ------------------------------------------------------------
   TableToolbar — شريط علوي فوق الجدول (بحث/فلاتر/إحصاء).
   ------------------------------------------------------------ */
export const TableToolbar: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    className={cn(
      'flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3',
      className
    )}
  >
    {children}
  </div>
);

/* ------------------------------------------------------------
   money / date helpers موحّدة.
   ------------------------------------------------------------ */
export function formatMoney(
  value: number | string | null | undefined,
  opts: { decimals?: number; currency?: string } = {}
): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!isFinite(n)) return '—';
  const decimals = opts.decimals ?? 2;
  const body = n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return opts.currency ? `${body} ${opts.currency}` : body;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

export default DataTable;