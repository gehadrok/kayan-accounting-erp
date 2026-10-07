export interface KPICardData {
  id: string;
  title: string;
  amount: number;
  formattedAmount: string;
  currency: string;
  trend?: {
    percentage: number;
    isPositive: boolean;
    periodText: string;
  };
  subtext?: string;
  iconType: 'sales' | 'expenses' | 'profit' | 'cash';
}

export interface MonthlyFinancialPoint {
  month: string;
  sales: number;      // in Millions
  expenses: number;   // in Millions
  profit: number;     // in Millions
}

export interface ExpenseCategory {
  id: string;
  name: string;
  percentage: number;
  color: string;
}

export interface MiniStatItem {
  id: string;
  title: string;
  value: string;
  subtext: string;
  colorClass: string;
  iconType: 'customers' | 'suppliers' | 'items' | 'warehouses' | 'invoices' | 'documents';
}

export interface TransactionItem {
  id: string;
  type: string;
  code: string;
  party: string;
  amount: number;
  formattedAmount: string;
  time: string;
  status: 'مرحل' | 'مسجل' | 'مسودة';
  categoryType: 'sales' | 'receipt' | 'purchase' | 'journal' | 'payment';
}

export interface QuickPrompt {
  id: string;
  text: string;
  icon: 'profit' | 'expenses' | 'debt' | 'audit' | 'optimize' | 'items';
  response: string;
}
