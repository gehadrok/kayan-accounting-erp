import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Bell,
  Settings,
  Sun,
  Moon,
  ChevronsUpDown,
  Maximize2,
  Minimize2,
  Menu,
  UserRound,
  X,
  Loader2,
  CalendarDays,
  Building2,
  MessageSquare,
  AlertTriangle,
  PackageX,
  PackageMinus,
  CreditCard,
  Landmark,
  FileWarning,
  ShieldAlert,
  ChevronLeft,
  CornerDownLeft,
  Minus,
  Square,
  ChevronDown,
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useNavigation } from '../../context/NavigationContext';
import { useCompanyProfile } from '../../context/CompanyProfileContext';
import { formatMoney } from '../ui';
import { NAVIGATION_SEARCH_ITEMS } from './navigationMenu';
import { readSessionUser, type SessionUser } from '../../utils/session';

interface AlertItem {
  id: string;
  severity: 'danger' | 'warning';
  title: string;
  detail: string;
  count: number;
  amount?: number;
  href: string;
}

interface SearchResult {
  key: string;
  label: string;
  sublabel?: string;
  group: string;
  path: string;
  icon: 'nav' | 'customer' | 'supplier' | 'item';
}

const GROUP_ICON: Record<SearchResult['icon'], React.ReactNode> = {
  nav: <ChevronLeft size={15} />,
  customer: <UserRound size={15} />,
  supplier: <Building2 size={15} />,
  item: <PackageMinus size={15} />,
};

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

function matchesQuery(text: string, query: string): boolean {
  return text.toLocaleLowerCase('ar').includes(query.toLocaleLowerCase('ar'));
}

/**
 * PHASE 10.6.2 — الشريط العلوي.
 *
 * كل ما يظهر هنا حقيقي: المستخدم من جلسة `kayan_user` بعد تسجيل الدخول،
 * الشركة من CompanyProfileContext، التاريخ من ساعة الجهاز، وشارة
 * الإشعارات من /api/dashboard/alerts. البحث العام يبحث في وجهات التنقل
 * وفي العملاء والموردين والأصناف عبر واجهات النظام القائمة.
 */
export const TopBar: React.FC<{ onMenuClick?: () => void }> = ({ onMenuClick }) => {
  const { getValue, setValue } = useSettings();
  const { navigateTo, currentRoute } = useNavigation();
  const { company } = useCompanyProfile();

  const theme = String(getValue('ui.theme', 'light'));
  const systemDark =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);

  const [user, setUser] = useState<SessionUser | null>(() => readSessionUser());
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertsState, setAlertsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [activeResult, setActiveResult] = useState(0);

  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const alertsRef = useRef<HTMLDivElement | null>(null);
  const companyRef = useRef<HTMLDivElement | null>(null);

  const gregorianDate = useMemo(
    () =>
      new Intl.DateTimeFormat('ar-YE-u-ca-gregory-nu-latn', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    []
  );

  const hijriDate = useMemo(
    () =>
      new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    []
  );

  const displayName = user?.fullName || user?.username || 'زائر';
  const displayHandle = user ? `@${user.username || 'user'}` : 'سجّل الدخول من الإعدادات';
  const avatarLetter = (user?.fullName || user?.username || '').trim().charAt(0).toUpperCase();

  /* ---------------- الإشعارات الحقيقية ---------------- */
  const loadAlerts = useCallback(async (signal?: AbortSignal) => {
    try {
      setAlertsState('loading');
      const response = await fetch('/api/dashboard/alerts', { signal });
      if (!response.ok) throw new Error('تعذر تحميل التنبيهات');
      const data = await response.json();
      const list: AlertItem[] = Array.isArray(data?.alerts) ? data.alerts : [];
      setAlerts(list);
      setAlertsState('ready');
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      setAlertsState('error');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadAlerts(controller.signal);

    const onAlertsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ alerts?: AlertItem[] }>).detail;
      if (Array.isArray(detail?.alerts)) {
        setAlerts(detail.alerts);
        setAlertsState('ready');
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'kayan_user') setUser(readSessionUser());
    };
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));

    window.addEventListener('kayan:alerts-updated', onAlertsUpdated);
    window.addEventListener('storage', onStorage);
    document.addEventListener('fullscreenchange', onFullscreen);

    return () => {
      controller.abort();
      window.removeEventListener('kayan:alerts-updated', onAlertsUpdated);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [loadAlerts]);

  useEffect(() => {
    setUser(readSessionUser());
  }, [currentRoute]);

  /* ---------------- إغلاق القوائم عند النقر خارجها ---------------- */
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchBoxRef.current && !searchBoxRef.current.contains(target)) setSearchOpen(false);
      if (alertsRef.current && !alertsRef.current.contains(target)) setAlertsOpen(false);
      if (companyRef.current && !companyRef.current.contains(target)) setCompanyOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  /* ---------------- CTRL+K لفتح البحث ---------------- */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setAlertsOpen(false);
        setCompanyOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  /* ---------------- البحث العام (وجهات + بيانات فعلية) ---------------- */
  const quickNavigation = useMemo<SearchResult[]>(
    () =>
      NAVIGATION_SEARCH_ITEMS.slice(0, 9).map((item) => ({
        key: `nav:${item.path}`,
        label: item.name,
        sublabel: item.group,
        group: 'وجهات التنقل',
        path: item.path,
        icon: 'nav',
      })),
    []
  );

  useEffect(() => {
    const query = searchTerm.trim();
    if (!searchOpen || query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);

      const navMatches: SearchResult[] = NAVIGATION_SEARCH_ITEMS.filter((item) =>
        matchesQuery(`${item.name} ${item.group} ${item.keywords}`, query)
      )
        .slice(0, 6)
        .map((item) => ({
          key: `nav:${item.path}`,
          label: item.name,
          sublabel: item.group,
          group: 'وجهات التنقل',
          path: item.path,
          icon: 'nav',
        }));

      const fetchList = async (url: string): Promise<any[]> => {
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) return [];
          const data = await response.json();
          return Array.isArray(data) ? data : [];
        } catch (error: any) {
          if (error?.name === 'AbortError') throw error;
          return [];
        }
      };

      try {
        const [customers, suppliers, items] = await Promise.all([
          fetchList(`/api/customers?search=${encodeURIComponent(query)}`),
          fetchList(`/api/suppliers?search=${encodeURIComponent(query)}`),
          fetchList(`/api/inventory/items?search=${encodeURIComponent(query)}`),
        ]);

        const results: SearchResult[] = [
          ...navMatches,
          ...customers.slice(0, 4).map((customer: any) => ({
            key: `customer:${customer.id}`,
            label: customer.name || customer.code || 'عميل',
            sublabel: [customer.code, customer.accountName].filter(Boolean).join(' · '),
            group: 'العملاء',
            path: '/sales/customers',
            icon: 'customer' as const,
          })),
          ...suppliers.slice(0, 4).map((supplier: any) => ({
            key: `supplier:${supplier.id}`,
            label: supplier.name || supplier.code || 'مورد',
            sublabel: [supplier.code, supplier.accountName].filter(Boolean).join(' · '),
            group: 'الموردون',
            path: '/purchasing/suppliers',
            icon: 'supplier' as const,
          })),
          ...items.slice(0, 4).map((item: any) => ({
            key: `item:${item.id}`,
            label: item.name || item.sku || 'صنف',
            sublabel: [item.sku, item.stockStatus === 'OUT_OF_STOCK' ? 'نافد' : item.stockStatus === 'LOW_STOCK' ? 'منخفض' : null]
              .filter(Boolean)
              .join(' · '),
            group: 'الأصناف',
            path: '/inventory/items',
            icon: 'item' as const,
          })),
        ];

        setSearchResults(results);
        setActiveResult(0);
      } catch (error: any) {
        if (error?.name !== 'AbortError') setSearchError('تعذر إكمال البحث الآن');
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm, searchOpen]);

  const visibleResults = searchTerm.trim().length >= 2 ? searchResults : quickNavigation;
  const groupedResults = useMemo(() => {
    const groups: Array<{ name: string; items: SearchResult[] }> = [];
    for (const result of visibleResults) {
      const existing = groups.find((group) => group.name === result.group);
      if (existing) existing.items.push(result);
      else groups.push({ name: result.group, items: [result] });
    }
    return groups;
  }, [visibleResults]);

  const selectResult = (result: SearchResult) => {
    navigateTo(result.path);
    setSearchOpen(false);
    setSearchTerm('');
    searchInputRef.current?.blur();
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchOpen) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveResult((index) => Math.min(index + 1, visibleResults.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveResult((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && visibleResults[activeResult]) {
      event.preventDefault();
      selectResult(visibleResults[activeResult]);
    }
  };

  const goToAlertsOnDashboard = () => {
    setAlertsOpen(false);
    navigateTo('/');
    window.setTimeout(() => {
      document.getElementById('dashboard-alerts')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
  };

  const toggleTheme = () => {
    setValue('ui.theme', isDark ? 'light' : 'dark', 'تبديل المظهر من الشريط العلوي').catch((error) => {
      console.error('[TopBar] theme save failed:', error);
    });
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* المتصفح قد يرفض ملء الشاشة بدون تفاعل مباشر — لا نغيّر الواجهة. */
    }
  };

  const iconButtonClass =
    'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/25';
  const isVoucherRoute = currentRoute === '/sales/receipts' || currentRoute === '/purchasing/payments';
  const voucherTitle = currentRoute === '/purchasing/payments' ? 'كيان المحاسبة - سند صرف' : 'كيان المحاسبة - سند قبض';

  if (isVoucherRoute) {
    return (
      <header className="kayan-voucher-topbar sticky top-0 z-30">
        <button
          type="button"
          onClick={onMenuClick}
          className="kayan-voucher-mobile-menu"
          title="فتح القائمة"
          aria-label="فتح القائمة الجانبية"
        >
          <Menu size={20} />
        </button>
        <span className="kayan-voucher-topbar-title">{voucherTitle}</span>
        <div className="kayan-voucher-window-controls" aria-label="أدوات النافذة">
          <span className="kayan-voucher-window-control" aria-hidden="true">
            <Minus size={14} />
          </span>
          <span className="kayan-voucher-window-control" aria-hidden="true">
            <Square size={12} />
          </span>
          <button
            type="button"
            className="kayan-voucher-window-control"
            title="الخروج من السند"
            aria-label="الخروج من السند"
            onClick={() => window.dispatchEvent(new Event('kayan:voucher-exit'))}
          >
            <ChevronDown size={15} />
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className={`kayan-topbar sticky top-0 z-30 border-b border-line bg-surface/95 px-3 shadow-k-xs backdrop-blur sm:px-4 lg:px-5`}>
      <div className="flex h-16 items-center gap-2 sm:gap-3">
        {/* بيانات المستخدم — أقصى اليمين */}
        <button
          type="button"
          onClick={() => navigateTo('/settings/users')}
          className="flex shrink-0 items-center gap-2.5 rounded-control p-1.5 text-start transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/25"
          title="المستخدم وإدارة الحسابات"
        >
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-brand to-indigo-600 text-sm font-bold text-white shadow-k-xs ring-2 ring-white/70 dark:ring-surface">
            {avatarLetter || <UserRound size={18} />}
          </span>
          <span className="hidden min-w-0 text-start sm:block">
            <span className="block max-w-[130px] truncate text-[12px] font-bold leading-tight text-ink">
              {displayName}
            </span>
            <span className="mt-0.5 block max-w-[130px] truncate text-[10px] font-medium text-ink-muted">
              {displayHandle}
            </span>
          </span>
          <ChevronsUpDown size={13} className="hidden shrink-0 text-ink-muted sm:block" />
        </button>

        <span className="hidden h-6 w-px shrink-0 bg-line sm:block" aria-hidden="true" />

        {/* الإشعارات والتنبيهات */}
        <div className="relative shrink-0" ref={alertsRef}>
          <button
            type="button"
            onClick={() => {
              setAlertsOpen((open) => !open);
              setCompanyOpen(false);
              setSearchOpen(false);
            }}
            className={iconButtonClass}
            title={alerts.length > 0 ? `${alerts.length} تنبيهات نشطة` : 'لا توجد تنبيهات نشطة'}
            aria-expanded={alertsOpen}
            aria-haspopup="dialog"
          >
            <Bell size={18} />
            {alerts.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-state-danger px-1 text-[9px] font-bold leading-none text-white shadow-xs">
                {alerts.length > 99 ? '99+' : alerts.length}
              </span>
            )}
          </button>

          {alertsOpen && (
            <div
              className="absolute start-0 top-full z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-card border border-line bg-surface shadow-k-lg"
              role="dialog"
              aria-label="التنبيهات والمهام"
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="text-[13px] font-bold text-ink">التنبيهات والمهام</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {alertsState === 'loading'
                      ? 'جارٍ التحقق من بيانات النظام...'
                      : alertsState === 'error'
                        ? 'تعذر تحميل التنبيهات'
                        : alerts.length > 0
                          ? `${alerts.length} تنبيهات حقيقية من بيانات النظام`
                          : 'لا توجد تنبيهات نشطة'}
                  </p>
                </div>
                {alertsState === 'loading' && <Loader2 size={16} className="animate-spin text-brand" />}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {alertsState === 'error' ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-[12px] font-semibold text-state-danger">تعذر تحميل التنبيهات</p>
                    <button
                      type="button"
                      onClick={() => loadAlerts()}
                      className="mt-2 text-[11px] font-bold text-brand hover:underline"
                    >
                      إعادة المحاولة
                    </button>
                  </div>
                ) : alerts.length === 0 && alertsState === 'ready' ? (
                  <div className="px-4 py-7 text-center">
                    <ShieldAlert size={22} className="mx-auto text-state-success" />
                    <p className="mt-2 text-[12px] font-semibold text-ink">كل الفحوصات سليمة</p>
                    <p className="mt-1 text-[11px] text-ink-muted">لا توجد تنبيهات مستندة إلى بيانات حالية.</p>
                  </div>
                ) : (
                  alerts.slice(0, 6).map((alert) => (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => {
                        setAlertsOpen(false);
                        navigateTo(alert.href);
                      }}
                      className="flex w-full items-start gap-3 border-b border-line-soft px-4 py-3 text-start transition-colors last:border-b-0 hover:bg-surface-hover"
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control ${
                          alert.severity === 'danger'
                            ? 'bg-state-danger-soft text-state-danger'
                            : 'bg-state-warning-soft text-state-warning'
                        }`}
                      >
                        {ALERT_ICON[alert.id] || <AlertTriangle size={16} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[12px] font-bold text-ink">{alert.title}</span>
                          <span className="shrink-0 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[10px] font-bold text-ink-muted">
                            {alert.count.toLocaleString('en-US')}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-ink-muted">{alert.detail}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={goToAlertsOnDashboard}
                className="flex w-full items-center justify-center gap-1.5 border-t border-line bg-surface-muted px-4 py-2.5 text-[11px] font-bold text-brand transition-colors hover:bg-surface-hover"
              >
                عرض التنبيهات في لوحة التحكم
                <ChevronLeft size={13} />
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigateTo('/system/audit-logs')}
          className={`${iconButtonClass} hidden sm:flex`}
          title="سجل النشاط والتدقيق"
        >
          <MessageSquare size={18} />
        </button>

        <button
          type="button"
          onClick={() => navigateTo('/settings')}
          className={`${iconButtonClass} hidden sm:flex`}
          title="الإعدادات"
        >
          <Settings size={18} />
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          className={`${iconButtonClass} hidden md:flex`}
          title={isFullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className={iconButtonClass}
          aria-label={isDark ? 'التبديل إلى المظهر الفاتح' : 'التبديل إلى المظهر الداكن'}
          title={isDark ? 'التبديل إلى المظهر الفاتح' : 'التبديل إلى المظهر الداكن'}
        >
          {isDark ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        {/* البحث العام */}
        <div className="relative min-w-0 flex-1 px-0 sm:px-1" ref={searchBoxRef}>
          <div className="relative flex items-center">
            <Search
              size={17}
              className="pointer-events-none absolute start-3 text-ink-muted"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setSearchOpen(true);
                setActiveResult(0);
              }}
              onFocus={() => {
                setSearchOpen(true);
                setAlertsOpen(false);
                setCompanyOpen(false);
              }}
              onKeyDown={onSearchKeyDown}
              type="search"
              role="searchbox"
              placeholder="البحث في النظام… (مستندات، حسابات، عملاء، موردون)"
              aria-label="البحث العام في النظام"
              aria-expanded={searchOpen}
              className="h-10 w-full rounded-control border border-line bg-surface-muted ps-10 pe-12 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 hover:bg-surface-hover focus:border-brand focus:bg-surface focus:ring-[3px] focus:ring-brand/15 sm:text-[13px]"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  searchInputRef.current?.focus();
                }}
                className="absolute end-2 flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"
                aria-label="مسح البحث"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute end-2 hidden items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-1 text-[9px] font-semibold text-ink-muted sm:flex">
                Ctrl K
              </kbd>
            )}
          </div>

          {searchOpen && (
            <div
              className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[420px] overflow-y-auto rounded-card border border-line bg-surface shadow-k-lg"
              role="listbox"
              aria-label="نتائج البحث"
            >
              {searchTerm.trim().length > 0 && searchTerm.trim().length < 2 ? (
                <div className="px-4 py-6 text-center text-[12px] text-ink-muted">
                  اكتب حرفين على الأقل لبدء البحث.
                </div>
              ) : searchLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-7 text-[12px] text-ink-muted">
                  <Loader2 size={16} className="animate-spin text-brand" />
                  جارٍ البحث في بيانات النظام...
                </div>
              ) : searchError ? (
                <div className="px-4 py-6 text-center text-[12px] font-semibold text-state-danger">
                  {searchError}
                </div>
              ) : groupedResults.length === 0 ? (
                <div className="px-4 py-7 text-center">
                  <p className="text-[12px] font-semibold text-ink">لا توجد نتائج مطابقة</p>
                  <p className="mt-1 text-[11px] text-ink-muted">
                    جرّب اسم عميل أو مورد أو صنف أو اسم شاشة.
                  </p>
                </div>
              ) : (
                <div className="py-1.5">
                  {groupedResults.map((group) => (
                    <div key={group.name} className="px-1.5 py-1">
                      <p className="px-2.5 py-1 text-[10px] font-bold text-ink-muted">{group.name}</p>
                      {group.items.map((result) => {
                        const globalIndex = visibleResults.findIndex((item) => item.key === result.key);
                        return (
                          <button
                            key={result.key}
                            type="button"
                            role="option"
                            aria-selected={globalIndex === activeResult}
                            onMouseEnter={() => setActiveResult(globalIndex)}
                            onClick={() => selectResult(result)}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors ${
                              globalIndex === activeResult ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-surface-hover'
                            }`}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-muted">
                              {GROUP_ICON[result.icon]}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-semibold">{result.label}</span>
                              {result.sublabel && (
                                <span className="block truncate text-[10px] text-ink-muted">{result.sublabel}</span>
                              )}
                            </span>
                            {globalIndex === activeResult && <CornerDownLeft size={13} className="shrink-0 text-brand" />}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between border-t border-line bg-surface-muted px-4 py-2 text-[10px] text-ink-muted">
                <span>بحث فعلي في العملاء والموردين والأصناف ووجهات النظام</span>
                <span className="flex items-center gap-2">
                  <span>Enter للفتح</span>
                  <span>Esc للإغلاق</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* الشركة والتاريخ — أقصى اليسار قبل زر الجوال */}
        <div className="relative hidden shrink-0 lg:block" ref={companyRef}>
          <button
            type="button"
            onClick={() => {
              setCompanyOpen((open) => !open);
              setAlertsOpen(false);
              setSearchOpen(false);
            }}
            className="flex h-10 max-w-[235px] items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-start transition-colors hover:bg-surface-hover"
            title={company?.nameAr || 'بيانات الشركة'}
            aria-expanded={companyOpen}
          >
            <Building2 size={16} className="shrink-0 text-brand" />
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-bold text-ink">
                {company?.nameAr || 'الشركة الحالية'}
              </span>
              <span className="mt-0.5 hidden truncate text-[9px] text-ink-muted xl:block">
                {company?.nameEn || 'Company profile'}
              </span>
            </span>
            <ChevronsUpDown size={13} className="shrink-0 text-ink-muted" />
          </button>

          <div className="mt-1 hidden items-center gap-1.5 px-1 text-[10px] text-ink-muted 2xl:flex">
            <CalendarDays size={12} />
            <span>{gregorianDate}</span>
          </div>

          {companyOpen && (
            <div
              className="absolute end-0 top-full z-50 mt-2 w-[min(92vw,340px)] overflow-hidden rounded-card border border-line bg-surface shadow-k-lg"
              role="dialog"
              aria-label="بيانات الشركة الحالية"
            >
              <div className="border-b border-line px-4 py-3">
                <p className="text-[13px] font-bold text-ink">{company?.nameAr || 'لم تُحمّل بيانات الشركة'}</p>
                <p className="mt-0.5 text-[10px] text-ink-muted">{company?.nameEn || 'Company profile'}</p>
              </div>
              <div className="space-y-2 px-4 py-3 text-[11px] text-ink">
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">العنوان</span>
                  <span className="text-end">{company?.addressAr || '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">الهاتف</span>
                  <span dir="ltr" className="kayan-numeric text-end">{company?.phone || '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">الرقم الضريبي</span>
                  <span className="kayan-numeric text-end">{company?.taxNumber || '—'}</span>
                </div>
                <p className="pt-1 text-[10px] text-ink-muted">
                  شركة واحدة مسجلة في هذه النسخة؛ تُدار بياناتها من إعدادات الشركة.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompanyOpen(false);
                  navigateTo('/settings/company');
                }}
                className="flex w-full items-center justify-center gap-1.5 border-t border-line bg-surface-muted px-4 py-2.5 text-[11px] font-bold text-brand transition-colors hover:bg-surface-hover"
              >
                عرض إعدادات الشركة
                <ChevronLeft size={13} />
              </button>
            </div>
          )}
        </div>

        {/* التاريخ يظهر أيضاً حين تكون بطاقة الشركة مخفية */}
        <div className="hidden shrink-0 items-center gap-1.5 text-[10px] text-ink-muted lg:flex 2xl:hidden">
          <CalendarDays size={13} />
          <span className="max-w-[120px] truncate" title={`${gregorianDate} — ${hijriDate} هـ`}>
            {gregorianDate}
          </span>
        </div>

        {user && (
          <span className="hidden max-w-[170px] truncate rounded-pill border border-line bg-surface-muted px-2 py-1 text-[9px] text-ink-muted xl:inline-block">
            {hijriDate} هـ
          </span>
        )}

        <button
          type="button"
          onClick={onMenuClick}
          className={`${iconButtonClass} lg:hidden`}
          title="فتح القائمة"
          aria-label="فتح القائمة الجانبية"
        >
          <Menu size={20} />
        </button>
      </div>
    </header>
  );
};
