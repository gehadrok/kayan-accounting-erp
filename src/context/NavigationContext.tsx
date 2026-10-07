import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const ROUTE_MAP: Record<string, string> = {
  // Legacy alias -> canonical route
  'dashboard': '/',
  'customers': '/sales/customers',
  'sales-invoices': '/sales/invoices',
  'receipts': '/sales/receipts',
  'sales-returns': '/sales/returns',
  'customer-statement': '/sales/customer-statement',
  'suppliers': '/purchasing/suppliers',
  'purchase-invoices': '/purchasing/invoices',
  'supplier-payments': '/purchasing/payments',
  'purchase-returns': '/purchasing/returns',
  'purchasing-reports': '/purchasing/reports',
  'inventory-items': '/inventory/items',
  'inventory-warehouses': '/inventory/warehouses',
  'inventory-transactions': '/inventory/transactions',
  'inventory-transfers': '/inventory/transactions',
  'inventory-counts': '/inventory/counts',
  'banking-accounts': '/banking/accounts',
  'banking-transfers': '/banking/transfers',
  'banking-ledger': '/banking/ledger',
  'banking-reconciliation': '/banking/reconciliation',
  'cash-reconciliation': '/banking/cash-reconciliation',
  'fixed-assets': '/assets/registry',
  'asset-depreciation': '/assets/depreciation',
  'expenses': '/expenses/list',
  'expense-accruals': '/expenses/accruals',
  'financial-reports': '/reports/financial',
  'reports-integrity': '/reports/integrity',
  'period-closing': '/reports/period-closing',
  'chart-of-accounts': '/accounting/chart-of-accounts',
  'journal-entries': '/accounting/journal-entries',
  'general-ledger': '/accounting/general-ledger',
  'trial-balance': '/accounting/trial-balance',
  'fiscal-periods': '/accounting/fiscal-periods',
  'audit-logs': '/system/audit-logs',
  'system-status': '/system/database',
  'users': '/settings/users',
  'branches': '/settings/branches',
};

function normalizePath(rawPath: string): string {
  if (!rawPath) return '/';
  
  // If it's a known legacy key
  if (ROUTE_MAP[rawPath]) {
    return ROUTE_MAP[rawPath];
  }

  let clean = rawPath.trim();
  // Strip hash prefix if any
  if (clean.startsWith('#')) {
    clean = clean.substring(1);
  }
  if (!clean.startsWith('/')) {
    clean = '/' + clean;
  }
  // Remove trailing slash unless root
  if (clean.length > 1 && clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  return clean || '/';
}

interface NavigationContextType {
  currentRoute: string;
  currentPage: string; // for backward compatibility
  navigateTo: (routeOrPage: string) => void;
  isRouteActive: (route: string) => boolean;
  isParentActive: (prefix: string) => boolean;
}

const NavigationContext = createContext<NavigationContextType>({
  currentRoute: '/',
  currentPage: 'dashboard',
  navigateTo: () => {},
  isRouteActive: () => false,
  isParentActive: () => false,
});

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Read initial path from browser
  const getInitialPath = (): string => {
    if (typeof window === 'undefined') return '/';
    // If hash is present and starts with #/, prefer hash
    if (window.location.hash && window.location.hash.length > 1) {
      return normalizePath(window.location.hash);
    }
    return normalizePath(window.location.pathname);
  };

  const [currentRoute, setCurrentRoute] = useState<string>(getInitialPath);

  // Sync with browser history and address bar
  const navigateTo = useCallback((destination: string) => {
    const targetRoute = normalizePath(destination);
    setCurrentRoute(targetRoute);

    if (typeof window !== 'undefined') {
      if (window.location.pathname !== targetRoute) {
        window.history.pushState({ route: targetRoute }, '', targetRoute);
      }
    }
  }, []);

  // Listen to browser Back/Forward (popstate) and hash changes
  useEffect(() => {
    const handlePopState = () => {
      const path = getInitialPath();
      setCurrentRoute(path);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const isRouteActive = useCallback((route: string): boolean => {
    const normalized = normalizePath(route);
    if (normalized === '/') {
      return currentRoute === '/' || currentRoute === '/dashboard';
    }
    return currentRoute === normalized;
  }, [currentRoute]);

  const isParentActive = useCallback((prefix: string): boolean => {
    if (!prefix || prefix === '/') return currentRoute === '/' || currentRoute === '/dashboard';
    return currentRoute.startsWith(prefix);
  }, [currentRoute]);

  return (
    <NavigationContext.Provider
      value={{
        currentRoute,
        currentPage: currentRoute,
        navigateTo,
        isRouteActive,
        isParentActive,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => useContext(NavigationContext);
