import React from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  CreditCard,
  FileWarning,
  Inbox,
  Landmark,
  PackageMinus,
  PackageX,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { Button, Card, DataTable, EmptyState, StatusBadge } from '../ui';
import type {
  DashboardAlert,
  DashboardDocument,
  DashboardJournal,
  DashboardMainAccount,
  DashboardTopCustomer,
  DashboardTopSupplier,
} from './types';
import {
  DOCUMENT_META,
  balanceSide,
  formatAmount,
  formatAmountExact,
  formatDateShort,
  formatStatusLabel,
  statusTone,
} from './dashboardFormat';

/* ============================================================
   رأس موحّد لبطاقات الجداول
   ============================================================ */
const TableCardHeader: React.FC<{
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, subtitle, actionLabel, onAction }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[11px] text-ink-muted">{subtitle}</p>}
    </div>
    {actionLabel && onAction && (
      <Button
        variant="ghost"
        size="xs"
        onClick={onAction}
        iconEnd={<ChevronLeft size={13} />}
        className="-me-1 px-2 text-[11px]"
      >
        {actionLabel}
      </Button>
    )}
  </div>
);

const rowNumber = (index: number) => (
  <span className="kayan-numeric text-[11px] font-semibold text-ink-muted">{index + 1}</span>
);

const amountCell = (value: number, tone: 'default' | 'balance' = 'default') => {
  const negative = value < -0.004;
  return (
    <span
      className={`kayan-numeric font-bold ${negative ? 'text-state-danger' : 'text-ink'}`}
      dir="ltr"
      title={formatAmountExact(value)}
    >
      {formatAmount(value)}
      {tone === 'balance' && Math.abs(value) > 0.004 && (
        <span className="ms-1 text-[9px] font-medium text-ink-muted no-underline" dir="rtl">
          {balanceSide(value).label}
        </span>
      )}
    </span>
  );
};

/* ============================================================
   1. أرصدة الحسابات الرئيسية
   ============================================================ */
export const MainAccountsCard: React.FC<{
  data: DashboardMainAccount[];
  loading?: boolean;
  error?: string | null;
  periodTo: string;
  onOpenAll: () => void;
  onRowClick?: () => void;
}> = ({ data, loading, error, periodTo, onOpenAll, onRowClick }) => (
  <DataTable
    className="h-full"
    columns={[
      {
        key: 'index',
        header: '#',
        width: '42px',
        align: 'center',
        render: (_row, index) => rowNumber(index),
      },
      {
        key: 'name',
        header: 'الحساب',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-ink" title={row.name}>
              {row.name}
            </p>
            <p className="kayan-numeric mt-0.5 text-[9px] text-ink-muted" dir="ltr">
              {row.code}
            </p>
          </div>
        ),
      },
      {
        key: 'balance',
        header: 'الرصيد (ريال يمني)',
        align: 'end',
        numeric: true,
        render: (row) => amountCell(row.balance, 'balance'),
      },
    ]}
    data={data}
    rowKey={(row) => row.code}
    loading={loading}
    loadingText="جارٍ تحميل أرصدة الحسابات..."
    error={error}
    emptyMessage="لا توجد أرصدة للحسابات الرئيسية حتى نهاية الفترة."
    emptyIcon={<Landmark size={26} className="mx-auto text-ink-muted/60" />}
    maxHeight="330px"
    onRowClick={onRowClick ? () => onRowClick() : undefined}
    header={
      <TableCardHeader
        title="أرصدة الحسابات الرئيسية"
        subtitle={`حتى ${formatDateShort(periodTo)} — ريال يمني`}
        actionLabel="عرض الكل"
        onAction={onOpenAll}
      />
    }
  />
);

/* ============================================================
   2. أعلى الموردين
   ============================================================ */
export const TopSuppliersCard: React.FC<{
  data: DashboardTopSupplier[];
  loading?: boolean;
  error?: string | null;
  periodLabel: string;
  onOpenAll: () => void;
  onRowClick?: () => void;
}> = ({ data, loading, error, periodLabel, onOpenAll, onRowClick }) => (
  <DataTable
    className="h-full"
    columns={[
      {
        key: 'index',
        header: '#',
        width: '42px',
        align: 'center',
        render: (_row, index) => rowNumber(index),
      },
      {
        key: 'name',
        header: 'المورد',
        render: (row) => (
          <span className="block truncate text-[12px] font-semibold text-ink" title={row.name}>
            {row.name}
          </span>
        ),
      },
      {
        key: 'totalPurchases',
        header: 'إجمالي المشتريات',
        align: 'end',
        numeric: true,
        hideOnSmall: true,
        render: (row) => amountCell(row.totalPurchases),
      },
      {
        key: 'balance',
        header: 'الرصيد الحالي',
        align: 'end',
        numeric: true,
        render: (row) => amountCell(row.balance),
      },
    ]}
    data={data}
    rowKey={(row) => row.id}
    loading={loading}
    loadingText="جارٍ تحميل الموردين..."
    error={error}
    emptyMessage="لا توجد مشتريات مرحّلة في هذه الفترة."
    emptyIcon={<PackageMinus size={26} className="mx-auto text-ink-muted/60" />}
    maxHeight="330px"
    onRowClick={onRowClick ? () => onRowClick() : undefined}
    header={
      <TableCardHeader
        title="أهم الموردين"
        subtitle={`أعلى المشتريات — ${periodLabel}`}
        actionLabel="عرض الكل"
        onAction={onOpenAll}
      />
    }
  />
);

/* ============================================================
   3. أعلى العملاء
   ============================================================ */
export const TopCustomersCard: React.FC<{
  data: DashboardTopCustomer[];
  loading?: boolean;
  error?: string | null;
  periodLabel: string;
  onOpenAll: () => void;
  onRowClick?: () => void;
}> = ({ data, loading, error, periodLabel, onOpenAll, onRowClick }) => (
  <DataTable
    className="h-full"
    columns={[
      {
        key: 'index',
        header: '#',
        width: '42px',
        align: 'center',
        render: (_row, index) => rowNumber(index),
      },
      {
        key: 'name',
        header: 'العميل',
        render: (row) => (
          <span className="block truncate text-[12px] font-semibold text-ink" title={row.name}>
            {row.name}
          </span>
        ),
      },
      {
        key: 'totalSales',
        header: 'إجمالي المبيعات',
        align: 'end',
        numeric: true,
        hideOnSmall: true,
        render: (row) => amountCell(row.totalSales),
      },
      {
        key: 'balance',
        header: 'الرصيد الحالي',
        align: 'end',
        numeric: true,
        render: (row) => amountCell(row.balance),
      },
    ]}
    data={data}
    rowKey={(row) => row.id}
    loading={loading}
    loadingText="جارٍ تحميل العملاء..."
    error={error}
    emptyMessage="لا توجد مبيعات مرحّلة في هذه الفترة."
    emptyIcon={<CreditCard size={26} className="mx-auto text-ink-muted/60" />}
    maxHeight="330px"
    onRowClick={onRowClick ? () => onRowClick() : undefined}
    header={
      <TableCardHeader
        title="أهم العملاء"
        subtitle={`أعلى المبيعات — ${periodLabel}`}
        actionLabel="عرض الكل"
        onAction={onOpenAll}
      />
    }
  />
);

/* ============================================================
   4. أحدث المستندات
   ============================================================ */
export const LatestDocumentsCard: React.FC<{
  data: DashboardDocument[];
  loading?: boolean;
  error?: string | null;
  onRowClick: (document: DashboardDocument) => void;
}> = ({ data, loading, error, onRowClick }) => (
  <DataTable
    className="h-full"
    columns={[
      {
        key: 'index',
        header: '#',
        width: '42px',
        align: 'center',
        render: (_row, index) => rowNumber(index),
      },
      {
        key: 'kind',
        header: 'المستند',
        render: (row) => {
          const meta = DOCUMENT_META[row.kind];
          return (
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-ink">{meta?.label || row.kind}</p>
              <p className="truncate text-[9px] text-ink-muted" title={row.party}>
                {row.party}
              </p>
            </div>
          );
        },
      },
      {
        key: 'number',
        header: 'الرقم',
        hideOnSmall: true,
        render: (row) => (
          <span className="kayan-numeric whitespace-nowrap text-[11px] text-ink-muted" dir="ltr">
            {row.number}
          </span>
        ),
      },
      {
        key: 'date',
        header: 'التاريخ',
        hideOnSmall: true,
        render: (row) => (
          <span className="kayan-numeric whitespace-nowrap text-[11px] text-ink-muted">
            {formatDateShort(row.date)}
          </span>
        ),
      },
      {
        key: 'amount',
        header: 'المبلغ',
        align: 'end',
        numeric: true,
        render: (row) => amountCell(row.amount),
      },
      {
        key: 'status',
        header: 'الحالة',
        align: 'center',
        hideOnSmall: true,
        render: (row) => (
          <StatusBadge tone={statusTone(row.status)} size="sm">
            {formatStatusLabel(row.status)}
          </StatusBadge>
        ),
      },
    ]}
    data={data}
    rowKey={(row) => row.id}
    loading={loading}
    loadingText="جارٍ تحميل المستندات..."
    error={error}
    emptyMessage="لا توجد مستندات مسجلة بعد."
    emptyIcon={<Inbox size={26} className="mx-auto text-ink-muted/60" />}
    maxHeight="360px"
    onRowClick={onRowClick}
    header={<TableCardHeader title="أحدث المستندات" subtitle="آخر 5 مستندات من كل الوحدات" />}
  />
);

/* ============================================================
   5. أحدث القيود اليومية
   ============================================================ */
export const LatestJournalsCard: React.FC<{
  data: DashboardJournal[];
  loading?: boolean;
  error?: string | null;
  onOpenAll: () => void;
  onRowClick?: () => void;
}> = ({ data, loading, error, onOpenAll, onRowClick }) => (
  <DataTable
    className="h-full"
    columns={[
      {
        key: 'index',
        header: '#',
        width: '42px',
        align: 'center',
        render: (_row, index) => rowNumber(index),
      },
      {
        key: 'entryNumber',
        header: 'رقم القيد',
        render: (row) => (
          <span className="kayan-numeric whitespace-nowrap text-[11px] font-semibold text-ink" dir="ltr">
            {row.entryNumber}
          </span>
        ),
      },
      {
        key: 'description',
        header: 'البيان',
        hideOnSmall: true,
        render: (row) => (
          <span className="block truncate text-[11px] text-ink-muted" title={row.description}>
            {row.description}
          </span>
        ),
      },
      {
        key: 'date',
        header: 'التاريخ',
        hideOnSmall: true,
        render: (row) => (
          <span className="kayan-numeric whitespace-nowrap text-[11px] text-ink-muted">
            {formatDateShort(row.entryDate)}
          </span>
        ),
      },
      {
        key: 'amount',
        header: 'المبلغ',
        align: 'end',
        numeric: true,
        render: (row) => amountCell(row.amount),
      },
    ]}
    data={data}
    rowKey={(row) => row.id}
    loading={loading}
    loadingText="جارٍ تحميل القيود..."
    error={error}
    emptyMessage="لا توجد قيود يومية مسجلة بعد."
    emptyIcon={<Inbox size={26} className="mx-auto text-ink-muted/60" />}
    maxHeight="360px"
    onRowClick={onRowClick ? () => onRowClick() : undefined}
    header={
      <TableCardHeader
        title="أحدث القيود اليومية"
        subtitle="آخر 5 قيود — بما فيها المسودات"
        actionLabel="عرض الكل"
        onAction={onOpenAll}
      />
    }
  />
);

/* ============================================================
   6. التنبيهات والمهام — كل صف مبني على فحص فعلي
   ============================================================ */

const ALERT_ICON: Record<string, React.ReactNode> = {
  'customer-credit-limit': <CreditCard size={16} />,
  'supplier-credit-limit': <CreditCard size={16} />,
  'overdue-receivables': <FileWarning size={16} />,
  'overdue-payables': <FileWarning size={16} />,
  'low-stock': <PackageMinus size={16} />,
  'out-of-stock': <PackageX size={16} />,
  'unreconciled-bank': <Landmark size={16} />,
  'draft-journals': <AlertTriangle size={16} />,
  'unbalanced-trial-balance': <ShieldAlert size={16} />,
};

export const AlertsTasksCard: React.FC<{
  alerts: DashboardAlert[];
  loading?: boolean;
  error?: string | null;
  onOpen: (alert: DashboardAlert) => void;
  onOpenIntegrity: () => void;
}> = ({ alerts, loading, error, onOpen, onOpenIntegrity }) => (
  <Card
    title="التنبيهات والمهام"
    description="فحوصات فعلية على البيانات الحالية"
    actions={
      alerts.length > 0 ? (
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-state-danger px-1.5 text-[10px] font-bold text-white">
          {alerts.length}
        </span>
      ) : null
    }
    flush
    className="h-full"
  >
    <div className="min-h-[280px]">
      {loading ? (
        <div className="space-y-2 p-4" role="status" aria-label="جارٍ تحميل التنبيهات">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-14 animate-pulse rounded-control bg-surface-sunken" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<AlertTriangle size={28} className="text-state-danger" />}
          title="تعذر تحميل التنبيهات"
          description={error}
        />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={30} className="text-state-success" />}
          title="كل الفحوصات سليمة"
          description="لا توجد تجاوزات ائتمانية أو فواتير متأخرة أو مخزون نافد أو قيود تحتاج مراجعة."
        />
      ) : (
        <div className="divide-y divide-line-soft">
          {alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              onClick={() => onOpen(alert)}
              className="flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/25"
            >
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${
                  alert.severity === 'danger'
                    ? 'bg-state-danger-soft text-state-danger'
                    : 'bg-state-warning-soft text-state-warning'
                }`}
                aria-hidden="true"
              >
                {ALERT_ICON[alert.id] || <AlertTriangle size={16} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[12px] font-bold text-ink">{alert.title}</span>
                  <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[9px] font-bold text-ink-muted">
                    {alert.count.toLocaleString('en-US')}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-ink-muted">{alert.detail}</span>
                {typeof alert.amount === 'number' && alert.amount > 0.004 && (
                  <span className="kayan-numeric mt-1 block text-[10px] font-semibold text-ink-muted" dir="ltr">
                    {formatAmount(alert.amount)} ريال يمني
                  </span>
                )}
              </span>
              <ChevronLeft size={15} className="mt-1 shrink-0 text-ink-muted" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
    <div className="border-t border-line bg-surface-muted px-4 py-2.5">
      <Button
        variant="ghost"
        size="xs"
        onClick={onOpenIntegrity}
        icon={<Wallet size={13} />}
        className="w-full justify-center text-[11px]"
      >
        فتح فحص سلامة البيانات
      </Button>
    </div>
  </Card>
);
