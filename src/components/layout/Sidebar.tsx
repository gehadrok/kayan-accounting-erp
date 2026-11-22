import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ChevronLeft,
  ChevronDown,
  X,
  LifeBuoy,
  ArrowUpLeft,
  Home,
  BookOpen,
  ScrollText,
  Coins,
  ArrowLeftRight,
  Files,
  Users,
  UsersRound,
  Package,
  BarChart3,
  Settings,
} from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';
import { useCompanyProfile } from '../../context/CompanyProfileContext';
import {
  DASHBOARD_NAV_ITEM,
  NAVIGATION_GROUPS,
  type NavigationGroup,
} from './navigationMenu';

interface SidebarProps {
  /** يتحكم بظهور القائمة على الشاشات الصغيرة فقط. */
  mobileOpen?: boolean;
  onClose?: () => void;
}

/**
 * PHASE 10.6.2 — القائمة الجانبية اليمنى بهوية KAYAN الكحلية.
 *
 * محفوظ من النسخة السابقة: كل صفحات النظام وأقسامها الفرعية، والتوسيع
 * التلقائي للقسم النشط، وفتح أول صفحة عند اختيار قسم غير نشط. أضيف:
 * لوحة التحكم كعنصر مستقل، وحالة نشطة أوضح، ووضع جوال قابل للإغلاق.
 */
export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onClose }) => {
  const { currentRoute, navigateTo, isRouteActive } = useNavigation();
  const { company } = useCompanyProfile();

  const isGroupActive = (group: NavigationGroup): boolean =>
    group.prefixes.some(
      (prefix) => currentRoute === prefix || currentRoute.startsWith(`${prefix}/`)
    );

  const activeGroupName =
    NAVIGATION_GROUPS.find((group) => isGroupActive(group))?.name ?? null;

  const [openItems, setOpenItems] = useState<string[]>(() =>
    activeGroupName ? [activeGroupName] : []
  );

  useEffect(() => {
    if (activeGroupName) {
      setOpenItems((previous) =>
        previous.includes(activeGroupName) ? previous : [...previous, activeGroupName]
      );
    }
  }, [activeGroupName]);

  const goTo = (path: string) => {
    navigateTo(path);
    onClose?.();
  };

  const toggleGroup = (group: NavigationGroup) => {
    const isOpen = openItems.includes(group.name);
    setOpenItems((previous) =>
      isOpen ? previous.filter((name) => name !== group.name) : [...previous, group.name]
    );

    if (!isGroupActive(group) && group.subItems.length > 0) {
      goTo(group.subItems[0].path);
    }
  };

  const dashboardActive = currentRoute === '/' || currentRoute === '/dashboard';
  const isVoucherRoute =
    currentRoute === '/sales/receipts' || currentRoute === '/purchasing/payments';

  if (isVoucherRoute) {
    const receiptActive = currentRoute === '/sales/receipts';
    const paymentActive = currentRoute === '/purchasing/payments';

    return (
      <aside
        id="app-sidebar"
        aria-label="التنقل الرئيسي"
        className={`kayan-sidebar kayan-voucher-sidebar fixed inset-y-0 right-0 z-50 flex w-64 flex-col bg-navy text-slate-200 shadow-2xl transition-transform duration-200 ease-out lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="kayan-vside-header">
          <button
            type="button"
            onClick={() => goTo('/')}
            className="kayan-vside-brand"
            title={company?.nameAr || 'KAYAN Accounting ERP'}
          >
            <span className="kayan-vside-logo" aria-hidden="true">
              <svg viewBox="0 0 48 48" className="h-11 w-11">
                <defs>
                  <linearGradient id="kayanVoucherGold" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffe08a" />
                    <stop offset="45%" stopColor="#f6c44b" />
                    <stop offset="100%" stopColor="#b98418" />
                  </linearGradient>
                </defs>
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="url(#kayanVoucherGold)"
                  strokeWidth="3.2"
                />
                <path
                  d="M17.5 12.5v23M17.5 24.4 30 12.5M17.5 24.4 30.5 35.5"
                  fill="none"
                  stroke="url(#kayanVoucherGold)"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 10c4.5 1.4 8 4.3 10.5 8.4M40 38c-4.5-1.4-8-4.3-10.5-8.4"
                  fill="none"
                  stroke="url(#kayanVoucherGold)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="kayan-vside-wordmark">
              <span className="kayan-vside-wordmark-en">KAYAN</span>
              <span className="kayan-vside-wordmark-sub">
                <span className="kayan-vside-wordmark-erp">ERP</span>
                <span className="kayan-vside-wordmark-ar">كيان</span>
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="kayan-vside-close lg:hidden"
            aria-label="إغلاق القائمة"
          >
            <X size={18} />
          </button>
        </div>

        <div className="kayan-vside-strip">المحاسبة العامة</div>

        <nav className="kayan-vside-nav">
          <button type="button" onClick={() => goTo('/')} className="kayan-vside-item">
            <Home size={18} />
            <span>الصفحة الرئيسية</span>
          </button>
          <button
            type="button"
            onClick={() => goTo('/accounting/chart-of-accounts')}
            className="kayan-vside-item"
          >
            <BookOpen size={18} />
            <span>دليل الحسابات</span>
          </button>
          <button
            type="button"
            onClick={() => goTo('/accounting/journal-entries')}
            className="kayan-vside-item"
          >
            <ScrollText size={18} />
            <span>القيود اليومية</span>
          </button>

          <div className="kayan-vside-group">
            <div className="kayan-vside-group-head">
              <span className="kayan-vside-group-title">
                <ScrollText size={18} />
                <span>السندات</span>
              </span>
              <ChevronDown size={16} className="kayan-vside-group-chevron" />
            </div>
            <div className="kayan-vside-sub">
              <button
                type="button"
                onClick={() => goTo('/sales/receipts')}
                className={`kayan-vside-subitem ${receiptActive ? 'is-active' : ''}`}
                aria-current={receiptActive ? 'page' : undefined}
              >
                <Coins size={17} />
                <span>سند قبض</span>
              </button>
              <button
                type="button"
                onClick={() => goTo('/purchasing/payments')}
                className={`kayan-vside-subitem ${paymentActive ? 'is-active' : ''}`}
                aria-current={paymentActive ? 'page' : undefined}
              >
                <Coins size={17} />
                <span>سند صرف</span>
              </button>
              <button
                type="button"
                onClick={() => goTo('/banking/transfers')}
                className="kayan-vside-subitem"
              >
                <ArrowLeftRight size={17} />
                <span>تحويل بين الصناديق</span>
              </button>
              <button
                type="button"
                onClick={() => goTo('/accounting/journal-entries')}
                className="kayan-vside-subitem"
              >
                <Files size={17} />
                <span>سندات أخرى</span>
              </button>
            </div>
          </div>

          <div className="kayan-vside-divider" />

          <button
            type="button"
            onClick={() => goTo('/sales/customers')}
            className="kayan-vside-item"
          >
            <UsersRound size={18} />
            <span>العملاء</span>
          </button>
          <button
            type="button"
            onClick={() => goTo('/purchasing/suppliers')}
            className="kayan-vside-item"
          >
            <Users size={18} />
            <span>الموردون</span>
          </button>
          <button
            type="button"
            onClick={() => goTo('/inventory/items')}
            className="kayan-vside-item"
          >
            <Package size={18} />
            <span>المخزون</span>
          </button>
          <button type="button" onClick={() => goTo('/reports')} className="kayan-vside-item">
            <BarChart3 size={18} />
            <span>التقارير</span>
          </button>
          <button type="button" onClick={() => goTo('/settings')} className="kayan-vside-item">
            <Settings size={18} />
            <span>الإعدادات</span>
          </button>
        </nav>
      </aside>
    );
  }

  return (
    <aside
      id="app-sidebar"
      aria-label="التنقل الرئيسي"
      className={`kayan-sidebar fixed inset-y-0 right-0 z-50 flex w-64 flex-col border-l border-white/10 bg-navy text-slate-200 shadow-2xl transition-transform duration-200 ease-out lg:translate-x-0 lg:shadow-none ${
        mobileOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* ترويسة الهوية */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <button
          type="button"
          onClick={() => goTo('/')}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-control text-start outline-none focus-visible:ring-2 focus-visible:ring-brand"
          title={company?.nameAr || 'KAYAN Accounting ERP'}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-to-br from-brand via-blue-500 to-indigo-700 shadow-lg shadow-brand/25">
            {company?.logoUrl ? (
              <img
                src={company.logoUrl}
                alt={company.nameAr}
                className="h-full w-full bg-white object-contain p-1"
              />
            ) : (
              <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden="true">
                <path d="M9 7h6.5v10.2L25.4 7H33L21.9 19.3 33.6 33H25.8L16.5 21.5 15.5 33H9z" fill="#fff" />
                <path d="M9 29.2h6.5V33H9z" fill="#93C5FD" />
              </svg>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[19px] font-black leading-none tracking-[0.12em] text-white">
              KAYAN
            </span>
            <span className="mt-1 block truncate text-[10px] font-semibold tracking-wide text-slate-400">
              Accounting ERP
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-slate-400 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="إغلاق القائمة"
        >
          <X size={18} />
        </button>
      </div>

      {/* التنقل */}
      <nav className="kayan-sidebar-nav flex-1 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin]">
        <button
          type="button"
          onClick={() => goTo(DASHBOARD_NAV_ITEM.path)}
          className={`mb-2 flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-sm font-bold transition-all ${
            dashboardActive
              ? 'bg-brand text-white shadow-lg shadow-brand/20'
              : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
          }`}
          aria-current={dashboardActive ? 'page' : undefined}
        >
          <span className="flex items-center gap-3">
            <LayoutDashboard size={19} className={dashboardActive ? 'text-white' : 'text-slate-400'} />
            <span>لوحة التحكم</span>
          </span>
          {dashboardActive && <span className="h-2 w-2 rounded-full bg-white/80" aria-hidden="true" />}
        </button>

        <div className="space-y-1">
          {NAVIGATION_GROUPS.map((group) => {
            const isOpen = openItems.includes(group.name);
            const isActive = isGroupActive(group);
            const Icon = group.icon;

            return (
              <div key={group.name}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
                    isActive
                      ? 'bg-white/[0.07] text-white'
                      : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                  }`}
                  aria-expanded={isOpen}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon size={18} className={isActive ? 'text-blue-300' : 'text-slate-400'} />
                    <span className="truncate">{group.name}</span>
                  </span>
                  {isOpen ? (
                    <ChevronDown size={15} className={isActive ? 'text-blue-300' : 'text-slate-500'} />
                  ) : (
                    <ChevronLeft size={15} className={isActive ? 'text-blue-300' : 'text-slate-500'} />
                  )}
                </button>

                {isOpen && (
                  <div className="me-2 ms-5 mt-1 space-y-0.5 border-e border-white/10 pe-2">
                    {group.subItems.map((sub) => {
                      const active = isRouteActive(sub.path);
                      return (
                        <button
                          key={sub.path}
                          type="button"
                          onClick={() => goTo(sub.path)}
                          aria-current={active ? 'page' : undefined}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-start text-[12px] transition-colors ${
                            active
                              ? 'bg-brand/20 font-bold text-white'
                              : 'font-medium text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
                          }`}
                        >
                          <span className="truncate">{sub.name}</span>
                          {active && <ArrowUpLeft size={12} className="shrink-0 text-blue-300" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* أسفل القائمة */}
      <div className="shrink-0 border-t border-white/10 p-3">
        <button
          type="button"
          onClick={() => goTo('/settings')}
          className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[12px] font-semibold text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <span className="flex items-center gap-2.5">
            <LifeBuoy size={17} className="text-blue-300" />
            مركز النظام
          </span>
          <ChevronLeft size={14} className="text-slate-500" />
        </button>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-medium text-slate-500">
          <span className="truncate" title={company?.nameAr}>
            {company?.nameAr || 'KAYAN ERP'}
          </span>
          <span className="kayan-numeric tracking-wider text-slate-400">ERP</span>
        </div>
      </div>
    </aside>
  );
};
