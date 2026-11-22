import {
  BookOpen,
  ShoppingCart,
  Package,
  Warehouse,
  Landmark,
  Building2,
  Wallet,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react';

/**
 * PHASE 10.6.2 — قائمة التنقل المشتركة بين الشريط الجانبي والبحث العام.
 *
 * كانت القائمة معرّفة داخل Sidebar فقط، فلا يستطيع البحث العام معرفة
 * وجهات التنقل. هذا الملف مصدرها الوحيد، ويحافظ على كل الصفحات القائمة
 * وعلى ترتيب الوحدات في التصميم المرجعي.
 */
export interface NavigationSubItem {
  name: string;
  path: string;
  /** كلمات مساعدة عربية/إنجليزية للبحث، لا تظهر في الواجهة. */
  keywords?: string[];
}

export interface NavigationGroup {
  name: string;
  icon: LucideIcon;
  /** مسارات تُعتبر القسم نشطاً عند فتح أي منها. */
  prefixes: string[];
  subItems: NavigationSubItem[];
}

export const DASHBOARD_NAV_ITEM: NavigationSubItem = {
  name: 'لوحة التحكم',
  path: '/',
  keywords: ['dashboard', 'home', 'الرئيسية'],
};

export const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    name: 'المحاسبة العامة',
    icon: BookOpen,
    prefixes: ['/accounting', '/journal-entries', '/general-ledger', '/trial-balance', '/fiscal-periods'],
    subItems: [
      { name: 'دليل الحسابات', path: '/accounting/chart-of-accounts', keywords: ['accounts', 'chart'] },
      { name: 'القيود اليومية', path: '/accounting/journal-entries', keywords: ['journal', 'entries', 'قيود'] },
      { name: 'الأستاذ العام', path: '/accounting/general-ledger', keywords: ['ledger', 'general'] },
      { name: 'ميزان المراجعة', path: '/accounting/trial-balance', keywords: ['trial', 'balance', 'ميزان'] },
      { name: 'السنوات والفترات المالية', path: '/accounting/fiscal-periods', keywords: ['fiscal', 'periods', 'فترات'] },
    ],
  },
  {
    name: 'المبيعات',
    icon: ShoppingCart,
    prefixes: ['/sales'],
    subItems: [
      { name: 'العملاء', path: '/sales/customers', keywords: ['customers', 'عملاء'] },
      { name: 'فواتير المبيعات', path: '/sales/invoices', keywords: ['invoices', 'sales', 'مبيعات'] },
      { name: 'سندات القبض', path: '/sales/receipts', keywords: ['receipts', 'قبض'] },
      { name: 'مردودات المبيعات', path: '/sales/returns', keywords: ['returns', 'مرتجع'] },
      { name: 'كشف حساب العميل والتقارير', path: '/sales/customer-statement', keywords: ['statement', 'كشف'] },
    ],
  },
  {
    name: 'المشتريات',
    icon: Package,
    prefixes: ['/purchasing'],
    subItems: [
      { name: 'الموردون', path: '/purchasing/suppliers', keywords: ['suppliers', 'موردين'] },
      { name: 'فواتير المشتريات', path: '/purchasing/invoices', keywords: ['bills', 'purchases', 'مشتريات'] },
      { name: 'سندات الصرف', path: '/purchasing/payments', keywords: ['payments', 'صرف'] },
      { name: 'مردودات المشتريات', path: '/purchasing/returns', keywords: ['returns', 'مرتجع'] },
      { name: 'تقارير المشتريات والذمم', path: '/purchasing/reports', keywords: ['reports', 'تقارير'] },
    ],
  },
  {
    name: 'المخزون',
    icon: Warehouse,
    prefixes: ['/inventory'],
    subItems: [
      { name: 'الأصناف', path: '/inventory/items', keywords: ['items', 'products', 'أصناف'] },
      { name: 'المستودعات والتصنيفات', path: '/inventory/warehouses', keywords: ['warehouses', 'مستودعات'] },
      { name: 'حركات المخزون والتحويلات', path: '/inventory/transactions', keywords: ['stock', 'transactions', 'حركات'] },
      { name: 'الجرد والتقييم الفعلي', path: '/inventory/counts', keywords: ['counts', 'جرد'] },
    ],
  },
  {
    name: 'الخزينة والبنوك',
    icon: Landmark,
    prefixes: ['/banking'],
    subItems: [
      { name: 'حسابات البنوك والخزائن', path: '/banking/accounts', keywords: ['bank', 'cash', 'بنوك'] },
      { name: 'التحويلات المالية', path: '/banking/transfers', keywords: ['transfers', 'تحويلات'] },
      { name: 'سجل الحركات والأستاذ', path: '/banking/ledger', keywords: ['ledger', 'حركات'] },
      { name: 'التسويات البنكية', path: '/banking/reconciliation', keywords: ['reconciliation', 'تسوية'] },
      { name: 'جرد وتسوية الصناديق', path: '/banking/cash-reconciliation', keywords: ['cash', 'صندوق'] },
    ],
  },
  {
    name: 'الأصول الثابتة',
    icon: Building2,
    prefixes: ['/assets'],
    subItems: [
      { name: 'سجل الأصول الثابتة', path: '/assets/registry', keywords: ['assets', 'أصول'] },
      { name: 'الإهلاك والمجموعات', path: '/assets/depreciation', keywords: ['depreciation', 'إهلاك'] },
    ],
  },
  {
    name: 'المصروفات',
    icon: Wallet,
    prefixes: ['/expenses'],
    subItems: [
      { name: 'فواتير وسجل المصروفات', path: '/expenses/list', keywords: ['expenses', 'مصروفات'] },
      { name: 'المستحقات والمصروفات المقدمة', path: '/expenses/accruals', keywords: ['accruals', 'مستحقات'] },
    ],
  },
  {
    name: 'التقارير والقوائم المالية',
    icon: BarChart3,
    prefixes: ['/reports'],
    subItems: [
      { name: 'مركز التقارير (Central Reports)', path: '/reports', keywords: ['reports', 'تقارير'] },
      { name: 'القوائم المالية والتحليلات', path: '/reports/financial', keywords: ['financial', 'قوائم'] },
      { name: 'المطابقة والتكامل المالي', path: '/reports/integrity', keywords: ['integrity', 'مطابقة'] },
      { name: 'إقفال الفترات والسنوات', path: '/reports/period-closing', keywords: ['closing', 'إقفال'] },
    ],
  },
  {
    name: 'الإعدادات والنظام',
    icon: Settings,
    prefixes: ['/settings', '/system'],
    subItems: [
      { name: 'مركز إعدادات النظام', path: '/settings', keywords: ['settings', 'إعدادات'] },
      { name: 'بيانات الشركة والشعار', path: '/settings/company', keywords: ['company', 'شركة', 'شعار'] },
      { name: 'إعدادات المحاسبة وربط الحسابات', path: '/settings/accounting/accounts', keywords: ['mapping', 'ربط'] },
      { name: 'المستخدمون والصلاحيات', path: '/settings/users', keywords: ['users', 'roles', 'مستخدمون'] },
      { name: 'الفروع والشركة', path: '/settings/branches', keywords: ['branches', 'فروع'] },
      { name: 'سلامة النظام (Health Check)', path: '/settings/health', keywords: ['health', 'سلامة'] },
      { name: 'سجل التدقيق والأمان', path: '/settings/audit', keywords: ['audit', 'security', 'تدقيق', 'أمان'] },
      { name: 'سجل النشاط والتدقيق', path: '/system/audit-logs', keywords: ['audit', 'تدقيق'] },
      { name: 'حالة قاعدة البيانات والنظام', path: '/system/database', keywords: ['database', 'قاعدة بيانات'] },
    ],
  },
];

export const NAVIGATION_SEARCH_ITEMS: Array<{
  name: string;
  path: string;
  group: string;
  keywords: string;
}> = [
  { ...DASHBOARD_NAV_ITEM, group: 'الرئيسية', keywords: (DASHBOARD_NAV_ITEM.keywords || []).join(' ') },
  ...NAVIGATION_GROUPS.flatMap((group) =>
    group.subItems.map((sub) => ({
      name: sub.name,
      path: sub.path,
      group: group.name,
      keywords: (sub.keywords || []).join(' '),
    }))
  ),
];
