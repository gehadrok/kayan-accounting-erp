/**
 * KAYAN ENTERPRISE UI — Document components
 * ============================================================
 * نقطة استيراد موحّدة لمكوّنات شاشات المستندات (فاتورة، مرتجع، سند، قيد).
 */
export { DocumentActionBar } from './DocumentActionBar';
export type {
  DocumentActionBarProps,
  DocumentMode,
  DocumentStatus,
} from './DocumentActionBar';

export {
  DocumentWorkspace,
  DocumentField,
  DocumentReadField,
  DocumentReadGrid,
  DocumentSummaryCard,
  DocumentAuditCard,
  DocumentStatusBadge,
  DocumentTableShell,
  formatDocumentDateTime,
} from './DocumentLayout';
export type {
  DocumentWorkspaceProps,
  DocumentFieldProps,
  DocumentReadFieldProps,
  DocumentReadGridProps,
  DocumentSummaryCardProps,
  DocumentAuditCardProps,
  SummaryRow,
  SummaryTone,
} from './DocumentLayout';

export {
  VoucherWorkspace,
  VoucherPanel,
  VoucherField,
  VoucherStaticField,
  VoucherInlineField,
  VoucherLedgerTable,
  VoucherTotalsStrip,
  VoucherAuditStrip,
  formatVoucherMoney,
  formatVoucherDateTime,
} from './VoucherSheet';
export type {
  VoucherWorkspaceProps,
  VoucherPanelProps,
  VoucherFieldProps,
  VoucherStaticFieldProps,
  VoucherInlineFieldProps,
  VoucherLedgerRow,
  VoucherLedgerTableProps,
  VoucherTotalsStripProps,
  VoucherAuditItem,
  VoucherAuditStripProps,
} from './VoucherSheet';
