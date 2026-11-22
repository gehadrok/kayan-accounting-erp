import { formatMoney } from '../ui';
import type { DashboardDocumentKind } from './types';

/** أسماء الشهور الميلادية بالعربية — ثابتة لتفادي اختلاف اللهجات. */
export const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

export function monthNumber(period: string): number | null {
  const value = Number(period.slice(5, 7));
  return value >= 1 && value <= 12 ? value : null;
}

/** "2026-10" ← "أكتوبر 2026" */
export function formatPeriodLabel(period: string): string {
  const month = monthNumber(period);
  if (!month) return period;
  return `${ARABIC_MONTHS[month - 1]} ${period.slice(0, 4)}`;
}

/** "2026-10" ← "أكتوبر" */
export function formatMonthShort(period: string): string {
  const month = monthNumber(period);
  return month ? ARABIC_MONTHS[month - 1] : period;
}

export function formatPeriodRange(from: string, to: string): string {
  if (from === to) return from;
  return `${formatDateShort(from)} — ${formatDateShort(to)}`;
}

export function formatDateShort(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/** يرقّم بمقياس مضغوط للرسم فقط: 1.5M، 750K، -3.5B. */
export function formatCompact(value: number): string {
  const n = Number(value) || 0;
  if (n === 0) return '0';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 2,
  }).format(n);
}

/** مبلغ جدولي: أرقام لاتينية وفواصل آلاف. الكسور تظهر فقط عند وجودها. */
export function formatAmount(value: number | string | null | undefined, decimals = 0): string {
  return formatMoney(value, { decimals });
}

/** المبلغ الكامل للاستخدام في title/Tooltip فقط. */
export function formatAmountExact(value: number | string | null | undefined): string {
  return formatMoney(value, { decimals: 2 });
}

export const DOCUMENT_META: Record<
  DashboardDocumentKind,
  { label: string; path: string; tone: 'brand' | 'success' | 'warning' | 'neutral' }
> = {
  invoice: { label: 'فاتورة بيع', path: '/sales/invoices', tone: 'brand' },
  return: { label: 'مرتجع بيع', path: '/sales/returns', tone: 'warning' },
  receipt: { label: 'سند قبض', path: '/sales/receipts', tone: 'success' },
  bill: { label: 'فاتورة شراء', path: '/purchasing/invoices', tone: 'neutral' },
  payment: { label: 'سند صرف', path: '/purchasing/payments', tone: 'warning' },
};

export function formatStatusLabel(status: string): string {
  switch (status) {
    case 'POSTED':
      return 'مرحّل';
    case 'DRAFT':
      return 'مسودة';
    case 'VOIDED':
      return 'ملغي';
    case 'REVERSED':
      return 'معكوس';
    default:
      return status || '—';
  }
}

export function statusTone(
  status: string
): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  switch (status) {
    case 'POSTED':
      return 'success';
    case 'DRAFT':
      return 'warning';
    case 'VOIDED':
      return 'danger';
    case 'REVERSED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** موجب = مدين، سالب = دائن — للعرض المحاسبي فقط. */
export function balanceSide(balance: number): { label: string; tone: 'success' | 'danger' | 'neutral' } {
  if (balance > 0.004) return { label: 'مدين', tone: 'success' };
  if (balance < -0.004) return { label: 'دائن', tone: 'danger' };
  return { label: 'صفر', tone: 'neutral' };
}
