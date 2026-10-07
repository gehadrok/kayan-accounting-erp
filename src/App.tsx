import React from 'react';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { CustomersPage } from './pages/Customers';
import { SalesInvoicesPage } from './pages/SalesInvoices';
import { ReceiptsPage } from './pages/Receipts';
import { SalesReturnsPage } from './pages/SalesReturns';
import { CustomerStatementPage } from './pages/CustomerStatement';
import { SuppliersPage } from './pages/Suppliers';
import { PurchaseInvoicesPage } from './pages/PurchaseInvoices';
import { SupplierPaymentsPage } from './pages/SupplierPayments';
import { PurchaseReturnsPage } from './pages/PurchaseReturns';
import { PurchasingReportsPage } from './pages/PurchasingReports';
import { InventoryItemsPage } from './pages/InventoryItems';
import { WarehousesPage } from './pages/Warehouses';
import { InventoryTransactionsPage } from './pages/InventoryTransactions';
import { InventoryCountsPage } from './pages/InventoryCounts';
import { BankingAccountsPage } from './pages/BankingAccounts';
import { BankingTransfersPage } from './pages/BankingTransfers';
import { BankingLedgerPage } from './pages/BankingLedger';
import { BankingReconciliationPage } from './pages/BankingReconciliation';
import { CashReconciliationPage } from './pages/CashReconciliation';
import { FixedAssetsPage } from './pages/FixedAssets';
import { AssetDepreciationPage } from './pages/AssetDepreciation';
import { ExpensesPage } from './pages/Expenses';
import { ExpenseAccrualsPage } from './pages/ExpenseAccruals';
import { ChartOfAccountsPage } from './pages/ChartOfAccounts';
import { JournalEntriesPage } from './pages/JournalEntries';
import { GeneralLedgerPage } from './pages/GeneralLedger';
import { TrialBalancePage } from './pages/TrialBalance';
import { FiscalPeriodsPage } from './pages/FiscalPeriods';
import { FinancialReportsPage } from './pages/FinancialReports';
import { FinancialIntegrityPage } from './pages/FinancialIntegrity';
import { PeriodClosingPage } from './pages/PeriodClosing';
import { AuditLogsPage } from './pages/AuditLogs';
import { SystemStatusPage } from './pages/SystemStatus';
import { UsersSettingsPage } from './pages/UsersSettings';
import { CompanyBranchesPage } from './pages/CompanyBranches';
import { ReportsCenter } from './pages/ReportsCenter';
import { ReportViewer } from './pages/ReportViewer';
import { SettingsHub } from './pages/SettingsHub';
import { NavigationProvider, useNavigation } from './context/NavigationContext';

const MainView: React.FC = () => {
  const { currentRoute } = useNavigation();

  const renderCurrentPage = () => {
    // Central Reports
    if (currentRoute === '/reports' || currentRoute === 'reports') {
      return <ReportsCenter />;
    }
    if (currentRoute.startsWith('/reports/view/')) {
      return <ReportViewer />;
    }
    if (currentRoute.startsWith('/settings')) {
      return <SettingsHub />;
    }

    switch (currentRoute) {
      // Sales
      case '/sales/customers':
      case 'customers':
        return <CustomersPage />;
      case '/sales/invoices':
      case 'sales-invoices':
        return <SalesInvoicesPage />;
      case '/sales/receipts':
      case 'receipts':
        return <ReceiptsPage />;
      case '/sales/returns':
      case 'sales-returns':
        return <SalesReturnsPage />;
      case '/sales/customer-statement':
      case 'customer-statement':
        return <CustomerStatementPage />;

      // Purchasing
      case '/purchasing/suppliers':
      case 'suppliers':
        return <SuppliersPage />;
      case '/purchasing/invoices':
      case 'purchase-invoices':
        return <PurchaseInvoicesPage />;
      case '/purchasing/payments':
      case 'supplier-payments':
        return <SupplierPaymentsPage />;
      case '/purchasing/returns':
      case 'purchase-returns':
        return <PurchaseReturnsPage />;
      case '/purchasing/reports':
      case 'purchasing-reports':
        return <PurchasingReportsPage />;

      // Inventory
      case '/inventory/items':
      case 'inventory-items':
        return <InventoryItemsPage />;
      case '/inventory/warehouses':
      case 'inventory-warehouses':
        return <WarehousesPage />;
      case '/inventory/transactions':
      case 'inventory-transactions':
      case 'inventory-transfers':
        return <InventoryTransactionsPage />;
      case '/inventory/counts':
      case 'inventory-counts':
        return <InventoryCountsPage />;

      // Banking & Cash
      case '/banking/accounts':
      case 'banking-accounts':
        return <BankingAccountsPage />;
      case '/banking/transfers':
      case 'banking-transfers':
        return <BankingTransfersPage />;
      case '/banking/ledger':
      case 'banking-ledger':
        return <BankingLedgerPage />;
      case '/banking/reconciliation':
      case 'banking-reconciliation':
        return <BankingReconciliationPage />;
      case '/banking/cash-reconciliation':
      case 'cash-reconciliation':
        return <CashReconciliationPage />;

      // Fixed Assets
      case '/assets/registry':
      case 'fixed-assets':
        return <FixedAssetsPage />;
      case '/assets/depreciation':
      case 'asset-depreciation':
        return <AssetDepreciationPage />;

      // Expenses
      case '/expenses/list':
      case 'expenses':
        return <ExpensesPage />;
      case '/expenses/accruals':
      case 'expense-accruals':
        return <ExpenseAccrualsPage />;

      // General Accounting
      case '/accounting/chart-of-accounts':
      case 'chart-of-accounts':
        return <ChartOfAccountsPage />;
      case '/accounting/journal-entries':
      case 'journal-entries':
        return <JournalEntriesPage />;
      case '/accounting/general-ledger':
      case 'general-ledger':
        return <GeneralLedgerPage />;
      case '/accounting/trial-balance':
      case 'trial-balance':
        return <TrialBalancePage />;
      case '/accounting/fiscal-periods':
      case 'fiscal-periods':
        return <FiscalPeriodsPage />;

      // Financial Reporting & Integrity
      case '/reports/financial':
      case 'financial-reports':
        return <FinancialReportsPage />;
      case '/reports/integrity':
      case 'reports-integrity':
        return <FinancialIntegrityPage />;
      case '/reports/period-closing':
      case 'period-closing':
        return <PeriodClosingPage />;

      // System & Settings
      case '/system/audit-logs':
      case 'audit-logs':
        return <AuditLogsPage />;
      case '/system/database':
      case 'system-status':
        return <SystemStatusPage />;
      case '/settings/users':
      case 'users':
        return <UsersSettingsPage />;
      case '/settings/branches':
      case 'branches':
        return <CompanyBranchesPage />;

      // Dashboard & default
      case '/':
      case '/dashboard':
      case 'dashboard':
      default:
        return <Dashboard />;
    }
  };

  return (
    <AppShell>
      {renderCurrentPage()}
    </AppShell>
  );
};

export default function App() {
  return (
    <NavigationProvider>
      <MainView />
    </NavigationProvider>
  );
}
