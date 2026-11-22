export interface ReportDefinition {
  id: string;
  name: string;
  module: string;
  category: string;
  description: string;
  filters: string[];
  columns: { key: string; label: string; align?: 'right' | 'left' | 'center'; format?: string }[];
  dataSourceUrl: string;
  permissions: string[];
  printTemplate: 'A4_PORTRAIT' | 'A4_LANDSCAPE';
  exportFormats: string[];
}

/* ==========================================================================
   PHASE 10.5.1 — report formatting preferences (displayed / printed output).
   The screen settings were previously saved (reports.currency_symbol …) but
   nothing read them: every cell hardcoded "YER" + en-US + 2 decimals. These
   helpers are the ONE place money/number/date cells are formatted, used by
   the report screen, its print preview AND the print window.

   The singleton is written by SettingsContext (the React source of truth) so
   the non-React print window sees the same values as the screen.
   ========================================================================== */
export const reportFormatPrefs = {
  currencySymbol: 'YER',
  currencyPosition: 'after' as 'after' | 'before',
  decimalPlaces: 2,
  thousandsSeparator: ',',
  decimalSeparator: '.',
  dateFormat: 'YYYY-MM-DD',
};

/** Apply the configured thousands/decimal separators to a canonical en-US number string. */
function applySeparators(plain: string): string {
  const [intPart, decPart] = plain.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, reportFormatPrefs.thousandsSeparator);
  return decPart !== undefined ? grouped + reportFormatPrefs.decimalSeparator + decPart : grouped;
}

/** Currency amount with symbol, respecting position (before/after) + decimals setting. */
export function formatCurrency(v: any): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return v === undefined || v === null ? '' : String(v);
  const amount = applySeparators(n.toFixed(reportFormatPrefs.decimalPlaces));
  return reportFormatPrefs.currencyPosition === 'before'
    ? `${reportFormatPrefs.currencySymbol} ${amount}`
    : `${amount} ${reportFormatPrefs.currencySymbol}`;
}

/** Currency number only (no symbol) — for layouts that style the symbol separately. */
export function formatAmountOnly(v: any): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return v === undefined || v === null ? '' : String(v);
  return applySeparators(n.toFixed(reportFormatPrefs.decimalPlaces));
}

/** Plain number: grouped, natural precision (no forced decimals). */
export function formatNumberValue(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return applySeparators(String(n));
}

/** ISO date/datetime string → configured report format (identity for the default). */
export function formatDateValue(v: any): string {
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})([T ].*)?$/.exec(s);
  if (!m) return s;
  const [, y, mo, d, time] = m;
  const date = reportFormatPrefs.dateFormat === 'DD/MM/YYYY' ? `${d}/${mo}/${y}` : `${y}-${mo}-${d}`;
  // PHASE 10.5.1 — PG date columns carry a midnight time ("T00:00:00.000Z")
  // that is pure noise in reports; only real times are kept.
  if (!time || /^T?00:00:00(\.000)?Z?$/.test(time)) return date;
  return date + (time.startsWith('T') ? ` ${time.slice(1)}` : time);
}

/** One cell value → display string, honoring the column's declared format. */
export function formatReportValue(v: any, format?: string): string {
  if (v === undefined || v === null) return '';
  // PG numeric columns arrive as STRINGS ("70500.0000"). The old
  // `format === 'currency' && typeof v === 'number'` guard skipped every one
  // of them, so currency cells rendered raw while dates (strings) worked.
  if (format === 'currency') {
    const n = Number(v);
    return Number.isFinite(n) ? formatCurrency(n) : String(v);
  }
  if (typeof v === 'number') return formatNumberValue(v);
  if (typeof v === 'string') return formatDateValue(v);
  return String(v);
}

export const REPORT_CATEGORIES = [
  { id: 'ACCOUNTING', name: 'التقارير المحاسبية', icon: 'BookOpen' },
  { id: 'FINANCIAL', name: 'التقارير المالية الختامية', icon: 'Scale' },
  { id: 'SALES', name: 'تقارير المبيعات', icon: 'TrendingUp' },
  { id: 'CUSTOMERS', name: 'تقارير العملاء', icon: 'Users' },
  { id: 'PURCHASING', name: 'تقارير المشتريات', icon: 'ShoppingCart' },
  { id: 'SUPPLIERS', name: 'تقارير الموردين', icon: 'Truck' },
  { id: 'INVENTORY', name: 'تقارير المخزون', icon: 'Package' },
  { id: 'CASH', name: 'تقارير النقدية والصناديق', icon: 'Wallet' },
  { id: 'BANKING', name: 'تقارير البنوك والتسوية', icon: 'Building' },
  { id: 'ASSETS', name: 'تقارير الأصول الثابتة', icon: 'Layers' },
  { id: 'EXPENSES', name: 'تقارير المصروفات', icon: 'Receipt' },
  { id: 'TAX', name: 'التقارير الضريبية', icon: 'FileText' },
  { id: 'MANAGEMENT', name: 'التقارير التنفيذية والإدارة', icon: 'BarChart' },
  { id: 'AUDIT', name: 'تقارير التدقيق والأمان', icon: 'ShieldCheck' },
];

export const REPORT_REGISTRY: ReportDefinition[] = [
  // 1. ACCOUNTING
  {
    id: 'general-ledger',
    name: 'دفتر الأستاذ العام',
    module: 'ACCOUNTING',
    category: 'ACCOUNTING',
    description: 'عرض تفصيلي لجميع الحركات والقيود المرحّلة على حساب مالي محدد مع الرصيد التراكمي المستمر.',
    filters: ['dateRange', 'branch', 'account'],
    columns: [
      { key: 'entryNumber', label: 'رقم القيد' },
      { key: 'entryDate', label: 'التاريخ' },
      { key: 'lineDescription', label: 'البيان' },
      { key: 'accountCode', label: 'كود الحساب' },
      { key: 'accountName', label: 'اسم الحساب' },
      { key: 'debit', label: 'مدين', format: 'currency' },
      { key: 'credit', label: 'دائن', format: 'currency' },
      { key: 'runningBalance', label: 'الرصيد', format: 'currency' },
    ],
    dataSourceUrl: '/api/reports/general-ledger',
    permissions: ['reports.view', 'reports.financial.view'],
    printTemplate: 'A4_PORTRAIT',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },
  {
    id: 'trial-balance',
    name: 'ميزان المراجعة',
    module: 'ACCOUNTING',
    category: 'ACCOUNTING',
    description: 'عرض أرصدة وحركات جميع حسابات دليل الحسابات للمراجعة والتحقق من تساوي المدين والدائن.',
    filters: ['dateRange', 'branch', 'fiscalYear'],
    columns: [
      { key: 'code', label: 'كود الحساب' },
      { key: 'name', label: 'اسم الحساب' },
      { key: 'category', label: 'التصنيف' },
      { key: 'normalBalance', label: 'طبيعة الرصيد' },
      { key: 'totalDebit', label: 'إجمالي المدين', format: 'currency' },
      { key: 'totalCredit', label: 'إجمالي الدائن', format: 'currency' },
      { key: 'balance', label: 'صافي الرصيد', format: 'currency' },
    ],
    dataSourceUrl: '/api/reports/trial-balance',
    permissions: ['reports.view', 'reports.financial.view'],
    printTemplate: 'A4_LANDSCAPE',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },
  {
    id: 'journal-entries',
    name: 'تقرير قيود اليومية',
    module: 'ACCOUNTING',
    category: 'ACCOUNTING',
    description: 'سجل شامل لجميع قيود اليومية المسجلة في النظام مع تفاصيل الحسابات وأطراف القيد.',
    filters: ['dateRange', 'branch'],
    columns: [
      { key: 'entryNumber', label: 'رقم القيد' },
      { key: 'entryDate', label: 'التاريخ' },
      { key: 'description', label: 'البيان' },
      { key: 'periodName', label: 'الفترة' },
      { key: 'status', label: 'الحالة' },
      { key: 'linesCount', label: 'عدد البنود' },
      { key: 'totalDebit', label: 'المبلغ', format: 'currency' },
    ],
    // Was pointed at /api/reports/general-ledger, which returns journal LINES
    // keyed entryDate/lineDescription — none of this report's columns ever
    // matched, so the screen rendered empty columns. The journal-entries
    // endpoint is the real source for an entry-level report.
    dataSourceUrl: '/api/journal-entries?limit=500',
    permissions: ['reports.view', 'reports.financial.view'],
    printTemplate: 'A4_LANDSCAPE',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },
  {
    id: 'account-activity',
    name: 'حركة الحسابات المالية',
    module: 'ACCOUNTING',
    category: 'ACCOUNTING',
    description: 'ملخص الحركات المدينة والدائنة وصافي الحركة لكل حساب خلال الفترة المحددة.',
    filters: ['dateRange', 'branch'],
    columns: [
      { key: 'code', label: 'كود الحساب' },
      { key: 'name', label: 'اسم الحساب' },
      { key: 'totalDebit', label: 'إجمالي المدين', format: 'currency' },
      { key: 'totalCredit', label: 'إجمالي الدائن', format: 'currency' },
      { key: 'netMovement', label: 'صافي الحركة', format: 'currency' },
    ],
    dataSourceUrl: '/api/reports/trial-balance',
    permissions: ['reports.view', 'reports.financial.view'],
    printTemplate: 'A4_PORTRAIT',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },

  // 2. FINANCIAL
  {
    id: 'income-statement',
    name: 'قائمة الدخل (الأرباح والخسائر)',
    module: 'FINANCIAL',
    category: 'FINANCIAL',
    description: 'تقرير الأداء المالي الشامل يوضح الإيرادات، تكلفة البضاعة المباعة، مجمل الربح، والمصروفات.',
    filters: ['dateRange', 'branch', 'fiscalYear'],
    columns: [
      { key: 'section', label: 'القسم' },
      { key: 'accountCode', label: 'كود الحساب' },
      { key: 'accountName', label: 'اسم الحساب' },
      { key: 'amount', label: 'المبلغ (YER)', format: 'currency' },
    ],
    // Returns one nested object { sections: { revenues, cogs, ... } } — never a
    // row array. ReportViewer flattens it (see FLATTENERS).
    dataSourceUrl: '/api/reports/income-statement',
    permissions: ['reports.view', 'reports.financial.view'],
    printTemplate: 'A4_PORTRAIT',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },
  {
    id: 'balance-sheet',
    name: 'الميزانية العمومية (المركز المالي)',
    module: 'FINANCIAL',
    category: 'FINANCIAL',
    description: 'عرض الأصول، الالتزامات، وحقوق الملكية في تاريخ محدد وفق المعادلة المحاسبية.',
    filters: ['dateRange', 'branch'],
    columns: [
      { key: 'section', label: 'القسم' },
      { key: 'accountCode', label: 'كود الحساب' },
      { key: 'accountName', label: 'العنصر المالي' },
      { key: 'amount', label: 'الرصيد (YER)', format: 'currency' },
    ],
    // Returns one nested object { sections: { currentAssets, ... } } — flattened
    // by ReportViewer.
    dataSourceUrl: '/api/reports/balance-sheet',
    permissions: ['reports.view', 'reports.financial.view'],
    printTemplate: 'A4_PORTRAIT',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },
  {
    id: 'cash-flow',
    name: 'قائمة التدفقات النقدية',
    module: 'FINANCIAL',
    category: 'FINANCIAL',
    description: 'تحليل التدفقات النقدية من الأنشطة التشغيلية، الاستثمارية، والتمويلية.',
    filters: ['dateRange', 'branch'],
    columns: [
      { key: 'group', label: 'النشاط' },
      { key: 'activity', label: 'البند' },
      { key: 'value', label: 'صافي التدفق (YER)', format: 'currency' },
    ],
    // Returns one nested object { operatingActivities, investingActivities,
    // financingActivities } — flattened by ReportViewer.
    dataSourceUrl: '/api/reports/cash-flow',
    permissions: ['reports.view', 'reports.financial.view'],
    printTemplate: 'A4_PORTRAIT',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },
  {
    id: 'profitability-analysis',
    name: 'تحليل الربحية والأداء',
    module: 'FINANCIAL',
    category: 'FINANCIAL',
    description: 'نسب تحليل الربحية وهامش مجمل الربح وصافي الربح التشغيلي.',
    filters: ['dateRange', 'branch'],
    columns: [
      { key: 'metric', label: 'مؤشر الأداء' },
      { key: 'value', label: 'القيمة / النسبة' },
    ],
    // Same nested payload as income-statement; ReportViewer derives the ratio
    // rows from its totals (FLATTENERS['profitability-analysis']).
    dataSourceUrl: '/api/reports/income-statement',
    permissions: ['reports.view', 'reports.financial.view'],
    printTemplate: 'A4_PORTRAIT',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },

  // 3. SALES
  {
    id: 'sales-summary',
    name: 'ملخص فواتير المبيعات',
    module: 'SALES',
    category: 'SALES',
    description: 'إجمالي المبيعات، الضرائب، والخصومات والتحصيلات لفواتير المبيعات المرحّلة.',
    filters: ['dateRange', 'branch'],
    columns: [
      { key: 'invoice_number', label: 'رقم الفاتورة' },
      { key: 'invoice_date', label: 'التاريخ' },
      { key: 'customerName', label: 'العميل' },
      { key: 'subtotal', label: 'المبلغ', format: 'currency' },
      { key: 'tax', label: 'الضريبة', format: 'currency' },
      { key: 'total', label: 'الإجمالي', format: 'currency' },
    ],
    // Was pointed at /api/reports/general-ledger — an accounting report has
    // no invoice_number/customerName/tax keys, so every column rendered blank.
    dataSourceUrl: '/api/sales/invoices?limit=500',
    permissions: ['reports.view', 'reports.sales.view'],
    printTemplate: 'A4_LANDSCAPE',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },
  {
    id: 'sales-returns',
    name: 'مردودات المبيعات',
    module: 'SALES',
    category: 'SALES',
    description: 'تقرير بمرتجعات المبيعات والأرصدة الدائنة الصادرة للعملاء.',
    filters: ['dateRange', 'branch'],
    columns: [
      { key: 'return_number', label: 'رقم المرتجع' },
      { key: 'return_date', label: 'التاريخ' },
      { key: 'customerName', label: 'العميل' },
      { key: 'total', label: 'المبلغ', format: 'currency' },
    ],
    // Was pointed at /api/reports/general-ledger — see sales-summary.
    dataSourceUrl: '/api/sales/returns?limit=500',
    permissions: ['reports.view', 'reports.sales.view'],
    printTemplate: 'A4_PORTRAIT',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },

  // 4. CUSTOMERS
  {
    id: 'customer-statement',
    name: 'كشف حساب العملاء',
    module: 'SALES',
    category: 'CUSTOMERS',
    description: 'حركة الفواتير والسندات والأرصدة للعملاء خلال الفترة.',
    filters: ['dateRange', 'customer', 'branch'],
    columns: [
      { key: 'date', label: 'التاريخ' },
      { key: 'reference', label: 'رقم المستند' },
      { key: 'description', label: 'البيان' },
      { key: 'debit', label: 'مدين', format: 'currency' },
      { key: 'credit', label: 'دائن', format: 'currency' },
      { key: 'balance', label: 'الرصيد', format: 'currency' },
    ],
    dataSourceUrl: '/api/reports/customer-statement',
    permissions: ['reports.view', 'reports.sales.view'],
    printTemplate: 'A4_PORTRAIT',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },
  {
    id: 'ar-aging',
    name: 'أعمار ديون العملاء (AR Aging)',
    module: 'SALES',
    category: 'CUSTOMERS',
    description: 'تحليل أرصدة الذمم المدينة حسب فترات التأخير (1-30، 31-60، 61-90، وأكثر من 90 يوم).',
    filters: ['branch'],
    columns: [
      { key: 'customerName', label: 'اسم العميل' },
      { key: 'current', label: 'جاري', format: 'currency' },
      { key: 'days1_30', label: '1-30 يوم', format: 'currency' },
      { key: 'days31_60', label: '31-60 يوم', format: 'currency' },
      { key: 'days61_90', label: '61-90 يوم', format: 'currency' },
      { key: 'days91_120', label: '91-120 يوم', format: 'currency' },
      { key: 'daysOver120', label: 'أكثر من 120 يوم', format: 'currency' },
      { key: 'totalDue', label: 'الإجمالي', format: 'currency' },
    ],
    // ReportingService.getArAging returns real aging buckets, but its route was
    // shadowed by an earlier duplicate aliasing the flat accounts-receivable
    // report (no buckets). With the duplicate removed this URL returns buckets.
    dataSourceUrl: '/api/reports/ar-aging',
    permissions: ['reports.view', 'reports.sales.view'],
    printTemplate: 'A4_LANDSCAPE',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },

  // 5. PURCHASING
  {
    id: 'purchase-summary',
    name: 'ملخص فواتير الشراء',
    module: 'PURCHASING',
    category: 'PURCHASING',
    description: 'إجمالي المشتريات، الضرائب، والمستحقات لفواتير الشراء.',
    filters: ['dateRange', 'branch'],
    columns: [
      { key: 'invoice_number', label: 'رقم الفاتورة' },
      { key: 'invoice_date', label: 'التاريخ' },
      { key: 'supplierName', label: 'المورد' },
      { key: 'subtotal', label: 'قبل الضريبة', format: 'currency' },
      { key: 'tax', label: 'الضريبة', format: 'currency' },
      { key: 'total', label: 'الإجمالي', format: 'currency' },
    ],
    // Was pointed at /api/reports/general-ledger — purchase invoice keys never
    // existed there. This endpoint returns { invoices: [...] } which the viewer
    // unwraps via the `invoices` container key.
    dataSourceUrl: '/api/reports/purchase-summary',
    permissions: ['reports.view', 'reports.purchases.view'],
    printTemplate: 'A4_LANDSCAPE',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },

  // 6. SUPPLIERS
  {
    id: 'supplier-statement',
    name: 'كشف حساب الموردين',
    module: 'PURCHASING',
    category: 'SUPPLIERS',
    description: 'حركة فواتير الشراء وسندات الصرف والأرصدة للموردين.',
    filters: ['dateRange', 'supplier', 'branch'],
    columns: [
      { key: 'date', label: 'التاريخ' },
      { key: 'reference', label: 'رقم المستند' },
      { key: 'description', label: 'البيان' },
      { key: 'debit', label: 'مدين', format: 'currency' },
      { key: 'credit', label: 'دائن', format: 'currency' },
      { key: 'balance', label: 'الرصيد', format: 'currency' },
    ],
    dataSourceUrl: '/api/reports/supplier-statement',
    permissions: ['reports.view', 'reports.sales.view'],
    printTemplate: 'A4_PORTRAIT',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },
  {
    id: 'ap-aging',
    name: 'أعمار ديون الموردين (AP Aging)',
    module: 'PURCHASING',
    category: 'SUPPLIERS',
    description: 'تحليل الالتزامات المستحقة للموردين حسب فترات الاستحقاق.',
    filters: ['branch'],
    columns: [
      { key: 'name', label: 'اسم المورد' },
      { key: 'current', label: 'جاري', format: 'currency' },
      { key: 'days1to30', label: '1-30 يوم', format: 'currency' },
      { key: 'days31to60', label: '31-60 يوم', format: 'currency' },
      { key: 'days61to90', label: '61-90 يوم', format: 'currency' },
      { key: 'days90plus', label: 'أكثر من 90 يوم', format: 'currency' },
      { key: 'unapplied', label: 'دفعات غير مطبقة', format: 'currency' },
      { key: 'total', label: 'الإجمالي', format: 'currency' },
    ],
    dataSourceUrl: '/api/reports/accounts-payable-aging',
    permissions: ['reports.view', 'reports.sales.view'],
    printTemplate: 'A4_LANDSCAPE',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },

  // 7. INVENTORY
  {
    id: 'inventory-valuation',
    name: 'تقييم المخزون (WAC Valuation)',
    module: 'INVENTORY',
    category: 'INVENTORY',
    description: 'أرصدة الأصناف الحالية في المستودعات مع تقييم التكلفة بناءً على المتوسط المرجح.',
    filters: ['warehouse', 'item'],
    columns: [
      { key: 'sku', label: 'كود الصنف' },
      { key: 'name', label: 'اسم الصنف' },
      { key: 'categoryName', label: 'الفئة' },
      { key: 'currentStock', label: 'الرصيد المتاح', format: 'number' },
      { key: 'averageCost', label: 'متوسط التكلفة', format: 'currency' },
      { key: 'stockValue', label: 'إجمالي التقييم', format: 'currency' },
    ],
    // Returns { totalValue, itemCount, items: [...] } — the `items` container
    // key is unwrapped by the viewer; item keys are sku/name/currentStock/
    // stockValue (not itemCode/itemName/quantity/totalValue).
    dataSourceUrl: '/api/inventory/reports/value',
    permissions: ['reports.view', 'reports.inventory.view'],
    printTemplate: 'A4_PORTRAIT',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },
  {
    id: 'low-stock',
    name: 'الأصناف منخفضة المخزون',
    module: 'INVENTORY',
    category: 'INVENTORY',
    description: 'الأصناف التي اقتربت أرصدتها من حد إعادة الطلب.',
    filters: ['warehouse'],
    columns: [
      { key: 'sku', label: 'كود الصنف' },
      { key: 'name', label: 'اسم الصنف' },
      { key: 'categoryName', label: 'الفئة' },
      { key: 'currentStock', label: 'الرصيد الحالي', format: 'number' },
      { key: 'minimum_stock', label: 'حد الطلب', format: 'number' },
      { key: 'stockStatus', label: 'الحالة' },
    ],
    // Was pointed at /api/inventory/reports/value — the valuation payload has
    // no low-stock rows at all, so the report always rendered blank.
    dataSourceUrl: '/api/inventory/reports/low-stock',
    permissions: ['reports.view', 'reports.inventory.view'],
    printTemplate: 'A4_PORTRAIT',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },

  // 8. CASH & 9. BANKING & 10. ASSETS & 11. EXPENSES & 12. TAX & 14. AUDIT
  {
    id: 'audit-logs',
    name: 'سجل التدقيق والأمان',
    module: 'AUDIT',
    category: 'AUDIT',
    description: 'سجل إثبات الأنشطة والعمليات الحساسة في النظام مع اسم المستخدم ووقت التنفيذ.',
    filters: ['dateRange', 'status'],
    columns: [
      { key: 'timestamp', label: 'وقت التنفيذ' },
      { key: 'username', label: 'المستخدم' },
      { key: 'action', label: 'العملية' },
      { key: 'entity_type', label: 'نوع الكيان' },
      { key: 'ip_address', label: 'عنوان IP' },
    ],
    dataSourceUrl: '/api/audit-logs?limit=100',
    permissions: ['reports.view', 'reports.audit.view'],
    printTemplate: 'A4_LANDSCAPE',
    exportFormats: ['PDF', 'XLSX', 'CSV', 'PRINT'],
  },
];
