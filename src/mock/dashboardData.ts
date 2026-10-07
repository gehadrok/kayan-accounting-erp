import { 
  KPICardData, 
  MonthlyFinancialPoint, 
  ExpenseCategory, 
  MiniStatItem, 
  TransactionItem, 
  QuickPrompt 
} from '../types/dashboard';

export const companyInfo = {
  name: 'شركة كيان سوفت للأنظمة',
  branch: 'الفرع الرئيسي - الضالع - جحاف',
  userGreeting: 'صباح الخير، جهاد 👋',
  dateSummary: 'إليك ملخص الوضع المالي اليوم الجمعة 2 أكتوبر 2026',
};

export const kpiCardsData: KPICardData[] = [
  {
    id: 'sales',
    title: 'إجمالي المبيعات',
    amount: 125400000,
    formattedAmount: '125,400,000',
    currency: 'ريال يمني',
    trend: {
      percentage: 12,
      isPositive: true,
      periodText: 'عن الشهر الماضي',
    },
    iconType: 'sales',
  },
  {
    id: 'expenses',
    title: 'إجمالي المصروفات',
    amount: 74200000,
    formattedAmount: '74,200,000',
    currency: 'ريال يمني',
    trend: {
      percentage: 5,
      isPositive: false, // in accounting, higher expenses is warning/coral
      periodText: 'عن الشهر الماضي',
    },
    iconType: 'expenses',
  },
  {
    id: 'profit',
    title: 'صافي الربح',
    amount: 51200000,
    formattedAmount: '51,200,000',
    currency: 'ريال يمني',
    trend: {
      percentage: 18,
      isPositive: true,
      periodText: 'عن الشهر الماضي',
    },
    iconType: 'profit',
  },
  {
    id: 'cash',
    title: 'الرصيد النقدي',
    amount: 420350000,
    formattedAmount: '420,350,000',
    currency: 'ريال يمني',
    subtext: 'في الصندوق والبنوك',
    iconType: 'cash',
  },
];

export const monthlyFinancialData: MonthlyFinancialPoint[] = [
  { month: 'يناير', sales: 50, expenses: 26, profit: 12 },
  { month: 'فبراير', sales: 72, expenses: 44, profit: 20 },
  { month: 'مارس', sales: 78, expenses: 47, profit: 21 },
  { month: 'أبريل', sales: 74, expenses: 46, profit: 19 },
  { month: 'مايو', sales: 81, expenses: 50, profit: 23 },
  { month: 'يونيو', sales: 88, expenses: 53, profit: 25 },
  { month: 'يوليو', sales: 96, expenses: 58, profit: 30 },
  { month: 'أغسطس', sales: 104, expenses: 62, profit: 34 },
  { month: 'سبتمبر', sales: 98, expenses: 60, profit: 32 },
  { month: 'أكتوبر', sales: 108, expenses: 64, profit: 36 },
  { month: 'نوفمبر', sales: 116, expenses: 68, profit: 42 },
  { month: 'ديسمبر', sales: 125.4, expenses: 74.2, profit: 51.2 },
];

export const expenseCategories: ExpenseCategory[] = [
  { id: 'salaries', name: 'رواتب وأجور', percentage: 32, color: '#2563EB' },
  { id: 'purchases', name: 'مشتريات', percentage: 18, color: '#F43F5E' },
  { id: 'operations', name: 'مصاريف تشغيلية', percentage: 15, color: '#F59E0B' },
  { id: 'rents', name: 'إيجارات', percentage: 12, color: '#10B981' },
  { id: 'others', name: 'مصاريف أخرى', percentage: 23, color: '#8B5CF6' },
];

export const miniStatCards: MiniStatItem[] = [
  {
    id: 'customers',
    title: 'العملاء',
    value: '84',
    subtext: 'عميل نشط',
    colorClass: 'text-blue-600 bg-blue-50 border-blue-100',
    iconType: 'customers',
  },
  {
    id: 'suppliers',
    title: 'الموردون',
    value: '31',
    subtext: 'مورد نشط',
    colorClass: 'text-purple-600 bg-purple-50 border-purple-100',
    iconType: 'suppliers',
  },
  {
    id: 'items',
    title: 'الأصناف',
    value: '1,250',
    subtext: 'صنف',
    colorClass: 'text-orange-600 bg-orange-50 border-orange-100',
    iconType: 'items',
  },
  {
    id: 'warehouses',
    title: 'المستودعات',
    value: '12',
    subtext: 'مستودع',
    colorClass: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    iconType: 'warehouses',
  },
  {
    id: 'invoices',
    title: 'فواتير اليوم',
    value: '18',
    subtext: 'فاتورة مبيعات',
    colorClass: 'text-rose-600 bg-rose-50 border-rose-100',
    iconType: 'invoices',
  },
  {
    id: 'documents',
    title: 'المستندات',
    value: '46',
    subtext: 'إجمالي اليوم',
    colorClass: 'text-sky-600 bg-sky-50 border-sky-100',
    iconType: 'documents',
  },
];

export const recentTransactions: TransactionItem[] = [
  {
    id: '1',
    type: 'فاتورة مبيعات',
    code: 'INV-2026-001',
    party: 'شركة النور للتجارة',
    amount: 125000000,
    formattedAmount: '125,000,000',
    time: '10:25',
    status: 'مرحل',
    categoryType: 'sales',
  },
  {
    id: '2',
    type: 'سند قبض',
    code: 'RCV-2026-003',
    party: 'عميل نقدي',
    amount: 80000000,
    formattedAmount: '80,000,000',
    time: '09:42',
    status: 'مرحل',
    categoryType: 'receipt',
  },
  {
    id: '3',
    type: 'فاتورة مشتريات',
    code: 'BILL-2026-011',
    party: 'مؤسسة الأمل',
    amount: 45000000,
    formattedAmount: '45,000,000',
    time: '09:15',
    status: 'مسجل',
    categoryType: 'purchase',
  },
  {
    id: '4',
    type: 'فاتورة مشتريات',
    code: 'JE-2026-027',
    party: 'مصاريف تشغيلية',
    amount: 15000000,
    formattedAmount: '15,000,000',
    time: '08:50',
    status: 'مرحل',
    categoryType: 'journal',
  },
  {
    id: '5',
    type: 'سند صرف',
    code: 'PAY-2026-005',
    party: 'بنك اليمن',
    amount: 200000000,
    formattedAmount: '200,000,000',
    time: '08:30',
    status: 'مسجل',
    categoryType: 'payment',
  },
];

export const quickPrompts: QuickPrompt[] = [
  {
    id: 'q1',
    text: 'ما هو صافي الربح لهذا العام؟',
    icon: 'profit',
    response: 'بلغ صافي الربح التراكمي لعام 2026 حتى اليوم 51,200,000 ريال يمني، بنسبة نمو بلغت +18% مقارنة بنفس الفترة من الشهر الماضي مع هامش ربح تشغيلي مستقر بنسبة 40.8%.',
  },
  {
    id: 'q2',
    text: 'لماذا ارتفعت المصروفات هذا الشهر؟',
    icon: 'expenses',
    response: 'ارتفعت المصروفات بنسبة 5% (بإجمالي 74,200,000 ريال يمني) ويعود السبب الرئيسي إلى سداد دفعات صيانة ومشتريات بضائع إضافية لموسم الربع الأخير وتمثل الرواتب 32% من هذا الإجمالي.',
  },
  {
    id: 'q3',
    text: 'اعرض لي أكثر العملاء مديونية',
    icon: 'debt',
    response: 'أكبر حسابات الذمم المدينة حالياً:\n1. شركة النور للتجارة: 125,000,000 ريال يمني (مستحق السداد خلال 15 يوماً).\n2. مؤسسة السلام: 42,500,000 ريال يمني.\n3. مجموعة الهدى: 18,300,000 ريال يمني.',
  },
  {
    id: 'q4',
    text: 'كشف العمليات غير الطبيعية',
    icon: 'audit',
    response: 'تم فحص جميع قيود اليومية آلياً:\n• لا توجد قيود غير متوازنة.\n• رُصدت عملية صرف غير معتادة برقم PAY-2026-005 بمبلغ 200,000,000 ريال يمني بحاجة إلى استكمال المراجعة والترحيل النهائي.',
  },
  {
    id: 'q5',
    text: 'اقترح تحسينات لزيادة الربح',
    icon: 'optimize',
    response: 'التوصيات المالية الذكية:\n1. تحصيل المديونيات المتأخرة خلال 10 أيام يرفع السيولة النقدية بنسبة 22%.\n2. إعادة التفاوض مع موردي الأصناف الأعلى مبيعاً لتخفيض تكلفة الشراء بنسبة 3%.\n3. ترشيد المصاريف التشغيلية الأخرى البالغة 23% من المصروفات.',
  },
  {
    id: 'q6',
    text: 'حلل المبيعات حسب الأصناف',
    icon: 'items',
    response: 'تحليل مبيعات الأصناف (1,250 صنف):\n• الصنف A-101 يشكل 28% من الإيراد الإجمالي.\n• معدل دوران المخزون في المستودع الرئيسي أعلى بنسبة 35% من المستودعات الفرعية.\n• 12 صنفاً وصلت إلى حد إعادة الطلب.',
  },
];
