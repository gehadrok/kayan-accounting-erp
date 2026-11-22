/**
 * PHASE 10.6.2 — عقد بيانات لوحة التحكم.
 *
 * هذه الأنواع تصف استجابة `/api/dashboard/overview` الفعلية فقط.
 * لا يوجد أي حقل وهمي أو قيمة افتراضية هنا؛ كل حقل يُملأ من الخادم
 * أو يبقى غائباً، والواجهة تتعامل مع الغياب بحالة واضحة.
 */

export interface DashboardPeriod {
  from: string;
  to: string;
  key: string;
  year: number | null;
  month: number | null;
}

export interface DashboardChartPeriod {
  from: string;
  to: string;
  year: number;
}

export interface DashboardComparison {
  current: number;
  previous: number;
  changePct: number | null;
}

export interface DashboardKpis {
  sales: number;
  purchases: number;
  receipts: number;
  payments: number;
}

export interface DashboardMonthlyPoint {
  month: string;
  receipts: number;
  payments: number;
  sales: number;
  purchases: number;
  revenue: number;
  expenses: number;
}

export interface DashboardExpenseSlice {
  account: string;
  code: string;
  amount: number;
}

export interface DashboardTopCustomer {
  id: string;
  name: string;
  totalSales: number;
  balance: number;
}

export interface DashboardTopSupplier {
  id: string;
  name: string;
  totalPurchases: number;
  balance: number;
}

export interface DashboardMainAccount {
  code: string;
  name: string;
  balance: number;
}

export interface DashboardAccountBalance {
  code: string;
  name: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface DashboardJournal {
  id: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  status: string;
  amount: number;
}

export type DashboardDocumentKind = 'invoice' | 'return' | 'receipt' | 'bill' | 'payment';

export interface DashboardDocument {
  id: string;
  kind: DashboardDocumentKind;
  number: string;
  date: string;
  amount: number;
  party: string;
  status: string;
}

export interface DashboardAlert {
  id: string;
  severity: 'danger' | 'warning';
  title: string;
  detail: string;
  count: number;
  amount?: number;
  href: string;
}

export interface DashboardOverview {
  generatedAt: string;
  period: DashboardPeriod;
  /** نطاق الرسم الشهري — قد يكون السنة كاملة عند اختيار شهر. */
  chartPeriod: DashboardChartPeriod;
  availablePeriods: string[];
  availableYears: number[];
  kpis: DashboardKpis;
  comparison: {
    sales: DashboardComparison;
    purchases: DashboardComparison;
    receipts: DashboardComparison;
    payments: DashboardComparison;
  };
  monthly: DashboardMonthlyPoint[];
  expenseMix: DashboardExpenseSlice[];
  topCustomers: DashboardTopCustomer[];
  topSuppliers: DashboardTopSupplier[];
  mainAccounts: DashboardMainAccount[];
  balances: DashboardAccountBalance[];
  recentJournals: DashboardJournal[];
  recentDocs: DashboardDocument[];
  liquidity: {
    cash: number;
    receivables: number;
    payables: number;
  };
  stockAlerts: {
    lowStock: number;
    outOfStock: number;
  };
  alerts: DashboardAlert[];
}
