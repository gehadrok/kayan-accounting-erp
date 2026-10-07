import React, { useState, useEffect } from 'react';
import { 
  Home, 
  BookOpen, 
  ShoppingCart, 
  Package, 
  Warehouse, 
  Landmark, 
  Building2, 
  Wallet, 
  BarChart3, 
  Settings, 
  ChevronLeft, 
  ChevronDown 
} from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';

interface SubMenuItem {
  name: string;
  path: string;
}

interface MenuItem {
  name: string;
  icon: React.ElementType;
  prefix: string | string[];
  subItems: SubMenuItem[];
}

const menuItems: MenuItem[] = [
  { 
    name: 'الرئيسية', 
    icon: Home,
    prefix: ['/', '/system'],
    subItems: [
      { name: 'لوحة التحكم', path: '/' },
      { name: 'سجل النشاط والتدقيق', path: '/system/audit-logs' },
      { name: 'حالة قاعدة البيانات والنظام', path: '/system/database' },
    ]
  },
  { 
    name: 'المحاسبة العامة', 
    icon: BookOpen, 
    prefix: '/accounting',
    subItems: [
      { name: 'دليل الحسابات', path: '/accounting/chart-of-accounts' },
      { name: 'القيود اليومية', path: '/accounting/journal-entries' },
      { name: 'الأستاذ العام', path: '/accounting/general-ledger' },
      { name: 'ميزان المراجعة', path: '/accounting/trial-balance' },
      { name: 'السنوات والفترات المالية', path: '/accounting/fiscal-periods' },
    ]
  },
  { 
    name: 'المبيعات', 
    icon: ShoppingCart, 
    prefix: '/sales',
    subItems: [
      { name: 'العملاء', path: '/sales/customers' },
      { name: 'فواتير المبيعات', path: '/sales/invoices' },
      { name: 'سندات القبض', path: '/sales/receipts' },
      { name: 'مردودات المبيعات', path: '/sales/returns' },
      { name: 'كشف حساب العميل والتقارير', path: '/sales/customer-statement' },
    ]
  },
  { 
    name: 'المشتريات', 
    icon: Package, 
    prefix: '/purchasing',
    subItems: [
      { name: 'الموردون', path: '/purchasing/suppliers' },
      { name: 'فواتير المشتريات', path: '/purchasing/invoices' },
      { name: 'سندات الصرف', path: '/purchasing/payments' },
      { name: 'مردودات المشتريات', path: '/purchasing/returns' },
      { name: 'تقارير المشتريات والذمم', path: '/purchasing/reports' },
    ]
  },
  { 
    name: 'المخزون', 
    icon: Warehouse, 
    prefix: '/inventory',
    subItems: [
      { name: 'الأصناف', path: '/inventory/items' },
      { name: 'المستودعات والتصنيفات', path: '/inventory/warehouses' },
      { name: 'حركات المخزون والتحويلات', path: '/inventory/transactions' },
      { name: 'الجرد والتقييم الفعلي', path: '/inventory/counts' },
    ]
  },
  { 
    name: 'الخزينة والبنوك', 
    icon: Landmark, 
    prefix: '/banking',
    subItems: [
      { name: 'حسابات البنوك والخزائن', path: '/banking/accounts' },
      { name: 'التحويلات المالية', path: '/banking/transfers' },
      { name: 'سجل الحركات والأستاذ', path: '/banking/ledger' },
      { name: 'التسويات البنكية', path: '/banking/reconciliation' },
      { name: 'جرد وتسوية الصناديق', path: '/banking/cash-reconciliation' },
    ]
  },
  { 
    name: 'الأصول الثابتة', 
    icon: Building2, 
    prefix: '/assets',
    subItems: [
      { name: 'سجل الأصول الثابتة', path: '/assets/registry' },
      { name: 'الإهلاك والمجموعات', path: '/assets/depreciation' },
    ]
  },
  { 
    name: 'المصروفات', 
    icon: Wallet, 
    prefix: '/expenses',
    subItems: [
      { name: 'فواتير وسجل المصروفات', path: '/expenses/list' },
      { name: 'المستحقات والمصروفات المقدمة', path: '/expenses/accruals' },
    ]
  },
  { 
    name: 'التقارير والقوائم المالية', 
    icon: BarChart3, 
    prefix: '/reports',
    subItems: [
      { name: 'مركز التقارير (Central Reports)', path: '/reports' },
      { name: 'القوائم المالية والتحليلات', path: '/reports/financial' },
      { name: 'المطابقة والتكامل المالي', path: '/reports/integrity' },
      { name: 'إقفال الفترات والسنوات', path: '/reports/period-closing' },
    ]
  },
  { 
    name: 'الإعدادات والنظام', 
    icon: Settings, 
    prefix: '/settings',
    subItems: [
      { name: 'مركز إعدادات النظام', path: '/settings' },
      { name: 'إعدادات المحاسبة وربط الحسابات', path: '/settings/accounting/accounts' },
      { name: 'المستخدمون والصلاحيات', path: '/settings/users' },
      { name: 'الفروع والشركة', path: '/settings/branches' },
      { name: 'سلامة النظام (Health Check)', path: '/settings/health' },
      { name: 'سجل التدقيق والأمان', path: '/settings/audit' },
    ]
  },
];

export const Sidebar: React.FC = () => {
  const { currentRoute, navigateTo, isRouteActive } = useNavigation();

  // Helper to determine if a menu item's route is currently active
  const isParentSectionActive = (item: MenuItem): boolean => {
    if (Array.isArray(item.prefix)) {
      return item.prefix.some(p => {
        if (p === '/') {
          return currentRoute === '/' || currentRoute === '/dashboard';
        }
        return currentRoute.startsWith(p);
      });
    }
    return currentRoute.startsWith(item.prefix);
  };

  // Keep track of which menu items are expanded
  const [openItems, setOpenItems] = useState<string[]>(['الرئيسية', 'المبيعات']);

  // Auto-expand the active section whenever the route changes
  useEffect(() => {
    const activeMenu = menuItems.find(item => isParentSectionActive(item));
    if (activeMenu) {
      setOpenItems(prev => prev.includes(activeMenu.name) ? prev : [...prev, activeMenu.name]);
    }
  }, [currentRoute]);

  const toggleItem = (item: MenuItem) => {
    const isCurrentlyOpen = openItems.includes(item.name);
    if (isCurrentlyOpen) {
      setOpenItems(prev => prev.filter(name => name !== item.name));
    } else {
      setOpenItems(prev => [...prev, item.name]);
    }

    // If clicking parent and none of its children are currently active, navigate to first child
    const isParentActive = isParentSectionActive(item);
    if (!isParentActive && item.subItems.length > 0) {
      navigateTo(item.subItems[0].path);
    }
  };

  return (
    <aside className="fixed right-0 top-0 bottom-0 w-64 bg-[#0a1120] text-slate-200 flex flex-col z-40 border-l border-slate-800/80 select-none">
      {/* Brand Header */}
      <div 
        onClick={() => navigateTo('/')}
        className="h-16 flex items-center gap-3 px-5 border-b border-slate-800/70 cursor-pointer hover:bg-slate-900/50 transition-colors"
      >
        {/* Geometric Folded K Logo */}
        <div className="w-10 h-10 rounded-xl bg-linear-to-br from-blue-500 via-blue-600 to-indigo-700 flex items-center justify-center shadow-md shadow-blue-500/20 text-white font-extrabold text-xl tracking-tighter">
          <span className="font-serif">K</span>
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-lg font-black tracking-wider text-white">KAYAN</h1>
          </div>
          <p className="text-[11px] font-medium text-slate-400 tracking-wide uppercase">Accounting ERP</p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-1 custom-scrollbar">
        {menuItems.map((item) => {
          const isOpen = openItems.includes(item.name);
          const isParentActive = isParentSectionActive(item);

          return (
            <div key={item.name}>
              <button
                onClick={() => toggleItem(item)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  isParentActive
                    ? 'bg-slate-800/90 text-white font-bold border-r-2 border-blue-500 shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon 
                    size={17} 
                    className={isParentActive ? 'text-blue-400' : 'text-slate-400'} 
                  />
                  <span>{item.name}</span>
                </div>
                {item.subItems.length > 0 && (
                  isOpen ? (
                    <ChevronDown size={14} className={isParentActive ? 'text-blue-400' : 'text-slate-500'} />
                  ) : (
                    <ChevronLeft size={14} className={isParentActive ? 'text-blue-400' : 'text-slate-500'} />
                  )
                )}
              </button>

              {/* Sub items dropdown */}
              {item.subItems && isOpen && (
                <div className="mr-7 ml-2 mt-1 space-y-0.5 border-r border-slate-700/60 pr-2 py-0.5">
                  {item.subItems.map((sub) => {
                    const active = isRouteActive(sub.path);

                    return (
                      <button
                        key={sub.path}
                        onClick={() => navigateTo(sub.path)}
                        className={`block w-full text-right py-1.5 px-2.5 text-[11px] rounded-lg transition-all duration-150 cursor-pointer ${
                          active
                            ? 'text-blue-400 font-bold bg-blue-500/15 border-r-2 border-blue-400 shadow-xs'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 font-medium'
                        }`}
                      >
                        {sub.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Scenic Mountain Card Footer */}
      <div className="p-3 border-t border-slate-800/60">
        <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 p-3 text-center">
          <div className="absolute inset-0 bg-linear-to-t from-slate-950 via-slate-900/90 to-blue-950/40 pointer-events-none" />
          <div className="relative z-10 space-y-0.5">
            <p className="text-sm font-bold text-white tracking-wide">كيان ERP</p>
            <p className="text-[11px] text-slate-400">المحاسبة الذكية لمستقبل أعمالك</p>
            <p className="text-[10px] font-mono text-slate-500 mt-1">v8.5 - Production Ready</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
