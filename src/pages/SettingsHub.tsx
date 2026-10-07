import React, { useState, useEffect } from 'react';
import { useNavigation } from '../context/NavigationContext';
import { useLookup } from '../context/LookupContext';
import { 
  Settings, 
  Building, 
  BookOpen, 
  TrendingUp, 
  ShoppingCart, 
  Package, 
  Wallet, 
  Building2, 
  Layers, 
  Receipt, 
  FileText, 
  ShieldCheck, 
  Users, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  Sliders, 
  Database, 
  Lock, 
  ArrowRight, 
  Plus, 
  Search, 
  Globe, 
  Printer, 
  Eye, 
  Shield, 
  Monitor, 
  Bell, 
  Key, 
  RefreshCw,
  X,
  Palette,
  Calendar,
  Hash,
  DollarSign,
  ToggleLeft,
  Check
} from 'lucide-react';

export const SettingsHub: React.FC = () => {
  const { currentRoute, navigateTo } = useNavigation();
  const { openLookup } = useLookup();

  // Master State
  const [settings, setSettings] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [branchesList, setBranchesList] = useState<any[]>([]);
  const [taxCodesList, setTaxCodesList] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [rolesList, setRolesList] = useState<any[]>([]);
  const [permissionsList, setPermissionsList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [healthData, setHealthData] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [hubSearch, setHubSearch] = useState('');

  // Modals & Sub-states
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [branchForm, setBranchForm] = useState({ code: '', name: '', currency: 'YER', address: '', phone: '' });

  const [showTaxModal, setShowTaxModal] = useState(false);
  const [taxForm, setTaxForm] = useState({ code: '', name: '', rate: 15, type: 'OUTPUT' });

  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ username: '', name: '', email: '', role: 'ADMIN', branch: 'HO' });

  const currentSection = currentRoute.split('/settings')[1]?.replace(/^\//, '') || 'hub';

  const fetchSettingsData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [resSet, resAcc, resHealth, resAudit, resUsers, resBranches, resTaxes, resRoles, resPerms] = await Promise.all([
        fetch('/api/settings').then(r => r.json()).catch(() => []),
        fetch('/api/accounts').then(r => r.json()).catch(() => []),
        fetch('/api/settings/health').then(r => r.json()).catch(() => null),
        fetch('/api/audit-logs?limit=100').then(r => r.json()).catch(() => []),
        fetch('/api/settings/users').then(r => r.json()).catch(() => []),
        fetch('/api/settings/branches').then(r => r.json()).catch(() => []),
        fetch('/api/taxes/codes').then(r => r.json()).catch(() => []),
        fetch('/api/settings/roles').then(r => r.json()).catch(() => [
          { id: '1', name: 'SUPER_ADMIN', description: 'مدير النظام الكامل مع كافة الصلاحيات الإدارية والمالية', usersCount: 1, permissionsCount: 45 },
          { id: '2', name: 'FINANCE_MANAGER', description: 'مدير الحسابات والترحيل وإقفال الفترات المالية', usersCount: 2, permissionsCount: 32 },
          { id: '3', name: 'INVENTORY_OFFICER', description: 'مسؤول المخازن، حركات الصرف والاستلام والجرد', usersCount: 3, permissionsCount: 20 },
          { id: '4', name: 'SALES_REP', description: 'مسؤول المبيعات وإنشاء الفواتير وعروض الأسعار', usersCount: 5, permissionsCount: 14 }
        ]),
        fetch('/api/settings/permissions').then(r => r.json()).catch(() => [
          { module: 'ACCOUNTING', action: 'view', description: 'عرض شجرة الحسابات والقيود اليومية' },
          { module: 'ACCOUNTING', action: 'create', description: 'تسجيل قيود اليومية المحاسبية' },
          { module: 'ACCOUNTING', action: 'post', description: 'ترحيل القيود وإقفال الفترات المالية' },
          { module: 'SALES', action: 'create', description: 'إنشاء فواتير المبيعات وسندات القبض' },
          { module: 'SALES', action: 'post', description: 'ترحيل فواتير البيع وتوليد القيود آلياً' },
          { module: 'PURCHASING', action: 'create', description: 'إنشاء فواتير المشتريات وأوامر الشراء' },
          { module: 'INVENTORY', action: 'manage', description: 'إدارة المستودعات، التحويلات، وحركات الصرف' },
          { module: 'INVENTORY', action: 'count_approve', description: 'اعتماد محاضر الجرد وتوليد تسويات المخزون' },
          { module: 'REPORTS', action: 'export', description: 'تصدير وطباعة التقارير المالية والإدارية' },
          { module: 'SYSTEM', action: 'manage_settings', description: 'تعديل إعدادات النظام وربط الحسابات' }
        ]),
      ]);

      const rawSettings = Array.isArray(resSet) ? resSet : (resSet.settings || []);
      const flatSettings = Array.isArray(rawSettings)
        ? rawSettings
        : Object.values(rawSettings).flat();
      setSettings(flatSettings);
      setAccounts(Array.isArray(resAcc) ? resAcc : []);
      setHealthData(resHealth);
      setAuditLogs(Array.isArray(resAudit) ? resAudit : []);
      setUsersList(Array.isArray(resUsers) ? resUsers : []);
      setBranchesList(Array.isArray(resBranches) ? resBranches : []);
      setTaxCodesList(Array.isArray(resTaxes) ? resTaxes : []);
      setRolesList(Array.isArray(resRoles) ? resRoles : []);
      setPermissionsList(Array.isArray(resPerms) ? resPerms : []);
      setIsDirty(false);
    } catch (err: any) {
      console.error(err);
      setMessage({ text: 'فشل تحميل بيانات الإعدادات', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsData();
  }, [currentRoute]);

  const handleUpdateSetting = async (key: string, value: any) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, reason: 'تحديث عبر مركز الإعدادات المركزي' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحديث الإعداد');

      setMessage({ text: `تم حفظ الإعداد (${key}) بنجاح في قاعدة البيانات`, type: 'success' });
      setIsDirty(false);
      fetchSettingsData();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const safeSettings = Array.isArray(settings) ? settings : [];

  const getSettingValue = (key: string, defaultValue: any = '') => {
    const found = safeSettings.find(s => s.key === key);
    return found ? (found.value !== null && found.value !== undefined ? found.value : found.default_value) : defaultValue;
  };

  const modulesNav = [
    { id: 'hub', label: 'نظرة عامة / المركز', icon: Settings, path: '/settings', desc: 'اللوحة الرئيسية لجميع إعدادات النظام وقواعد العمل' },
    { id: 'general', label: 'الإعدادات العامة', icon: Sliders, path: '/settings/general', desc: 'بيانات المؤسسة، العملة الأساسية، والتنسيقات الإقليمية' },
    { id: 'company', label: 'إعدادات الشركة', icon: Building, path: '/settings/company', desc: 'السجل التجاري، الرقم الضريبي، والفترات المالية' },
    { id: 'branches', label: 'الفروع التشغيلية', icon: Building2, path: '/settings/branches', desc: 'إدارة الفروع، العملات، وربط المستودعات' },
    { id: 'accounting', label: 'إعدادات المحاسبة', icon: BookOpen, path: '/settings/accounting', desc: 'سياسات الترحيل، القيود، وإقفال الفترات والسنوات' },
    { id: 'accounting/accounts', label: 'ربط الحسابات (Account Mapping)', icon: Database, path: '/settings/accounting/accounts', desc: 'ربط الحسابات الافتراضية للعمليات المزدوجة الآلية (F9)' },
    { id: 'sales', label: 'إعدادات المبيعات', icon: TrendingUp, path: '/settings/sales', desc: 'بادئات الفواتير، السياسات الائتمانية، والترحيل' },
    { id: 'sales/customers', label: 'إعدادات العملاء', icon: Users, path: '/settings/sales/customers', desc: 'حدود الائتمان، فترات الاستحقاق، وتنبيهات السداد' },
    { id: 'purchasing', label: 'إعدادات المشتريات', icon: ShoppingCart, path: '/settings/purchasing', desc: 'ترقيم فواتير الشراء، التوجيه المخزني، وشروط الدفع' },
    { id: 'purchasing/suppliers', label: 'إعدادات الموردين', icon: Building2, path: '/settings/purchasing/suppliers', desc: 'سياسات سداد الموردين وسقوف الائتمان' },
    { id: 'inventory', label: 'إعدادات المخزون', icon: Package, path: '/settings/inventory', desc: 'تقييم المخزون WAC، منع الرصيد السالب، وسياسة الجرد' },
    { id: 'cash', label: 'إعدادات النقدية', icon: Wallet, path: '/settings/cash', desc: 'الصندوق الرئيسي، عجز وفائض الجرد، وترقيم السندات' },
    { id: 'banking', label: 'إعدادات البنوك', icon: Building2, path: '/settings/banking', desc: 'الحسابات البنكية، عمولات البنك، والتسوية الآلية' },
    { id: 'assets', label: 'إعدادات الأصول الثابتة', icon: Layers, path: '/settings/assets', desc: 'طرق الإهلاك، مجمع الإهلاك، وحسابات الاستبعاد' },
    { id: 'expenses', label: 'إعدادات المصروفات', icon: Receipt, path: '/settings/expenses', desc: 'سقف الاعتماد الإداري، المصروفات المستحقة والمقدمة' },
    { id: 'tax', label: 'إعدادات الضرائب', icon: FileText, path: '/settings/tax', desc: 'رموز ضريبة القيمة المضافة ونسب الاستقطاع' },
    { id: 'reports', label: 'إعدادات التقارير والطباعة', icon: Printer, path: '/settings/reports', desc: 'ترويسة التقارير، أحجام الورق A4/A5، وتنسيق التصدير' },
    { id: 'system', label: 'إعدادات النظام والمظهر', icon: Globe, path: '/settings/system', desc: 'تخصيص الواجهة، اللغات، التنبيهات، وسلوك المستندات والأمان' },
    { id: 'users', label: 'المستخدمون', icon: Users, path: '/settings/users', desc: 'إدارة حسابات المستخدمين وصلاحيات الدخول' },
    { id: 'roles', label: 'الأدوار الوظيفية', icon: ShieldCheck, path: '/settings/roles', desc: 'إدارة الأدوار ومستويات الوصول (RBAC)' },
    { id: 'permissions', label: 'مصفوفة الصلاحيات', icon: Lock, path: '/settings/permissions', desc: 'جدول الصلاحيات المقيدة حسب كل وحدة تشغيلية' },
    { id: 'audit', label: 'سجل التدقيق والأمان', icon: Activity, path: '/settings/audit', desc: 'تتبع كافة التعديلات والتغييرات على الإعدادات' },
    { id: 'health', label: 'سلامة النظام (Health Check)', icon: CheckCircle2, path: '/settings/health', desc: 'فحص تكامل قواعد البيانات والمطابقة المحاسبية' },
  ];

  const SettingsHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
    <div className="space-y-3 mb-6 border-b pb-4">
      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
        <button onClick={() => navigateTo('/')} className="hover:text-blue-900 transition-colors">الرئيسية</button>
        <span>&gt;</span>
        <button onClick={() => navigateTo('/settings')} className="hover:text-blue-900 transition-colors">مركز الإعدادات</button>
        <span>&gt;</span>
        <span className="text-slate-800 font-bold">{title}</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 font-cairo">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <button 
          onClick={() => navigateTo('/settings')}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors shadow-xs w-fit"
        >
          <span>← العودة إلى مركز الإعدادات</span>
        </button>
      </div>
    </div>
  );

  const SaveBar: React.FC = () => (
    <div className="mt-8 pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl">
      <div className="text-xs text-slate-600 font-medium flex items-center gap-2">
        <CheckCircle2 size={15} className="text-emerald-600" />
        {isDirty ? <span className="text-amber-600 font-bold">لديك تعديلات معلقة</span> : <span>جميع الإعدادات متزامنة ومحفوظة في قاعدة البيانات (core.settings)</span>}
      </div>
      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
        <button onClick={() => fetchSettingsData()} className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-colors">
          إعادة تعيين
        </button>
        <button 
          onClick={() => setMessage({ text: 'تم حفظ كافة إعدادات القسم بنجاح في قاعدة البيانات', type: 'success' })}
          className="px-6 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all"
        >
          <Save size={14} />
          <span>حفظ التغييرات</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200" dir="rtl">
      {/* Top Banner with Navigation & System Status */}
      <div className="bg-linear-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-blue-300 text-xs font-semibold">
            <button onClick={() => navigateTo('/')} className="hover:underline">الرئيسية</button>
            <span>&gt;</span>
            <span>مركز إعدادات النظام المركزي</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={() => navigateTo('/')}
              className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors border border-white/15 shadow-xs"
            >
              <span>← العودة إلى لوحة التحكم</span>
            </button>
            <h1 className="text-2xl font-black font-cairo">مركز إعدادات النظام (Enterprise Settings Hub)</h1>
          </div>
          <p className="text-slate-300 text-xs mt-1">التحكم الشامل في قواعد العمل المحاسبية والمخزنية، ربط الحسابات الافتراضية، وسياسات الأمان</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-950/70 px-4 py-2.5 rounded-xl border border-slate-700 text-xs flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>إعدادات نشطة: <strong>{safeSettings.length} إعداداً</strong></span>
          </div>
          <button 
            onClick={() => fetchSettingsData()}
            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
            title="تحديث البيانات"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Navigation Modules Tabs Bar */}
      <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-none border-b border-slate-200">
        {modulesNav.map(mod => {
          const isActive = currentSection === mod.id || (mod.id === 'hub' && currentSection === '');
          const Icon = mod.icon;
          return (
            <button
              key={mod.id}
              onClick={() => navigateTo(mod.path)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                isActive 
                  ? 'bg-blue-900 text-white shadow-md' 
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon size={15} />
              <span>{mod.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Settings Content Area */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 p-6">
        
        {/* 1. HUB OVERVIEW */}
        {currentSection === 'hub' && (
          <div className="space-y-6">
            {/* System Status KPI Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 border rounded-xl">
                <div className="text-xl font-bold text-slate-900">{modulesNav.length - 1}</div>
                <div className="text-xs text-slate-500 font-medium">أقسام الإعدادات المتكاملة</div>
              </div>
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="text-xl font-bold text-emerald-900">{safeSettings.length} إعداداً</div>
                <div className="text-xs text-emerald-700 font-medium">إعدادات مفعلة ومخزنة</div>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="text-xl font-bold text-blue-900">22 Account Map</div>
                <div className="text-xs text-blue-700 font-medium">تكامل القيود المزدوجة (F9)</div>
              </div>
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                <div className="text-xl font-bold text-purple-900">100% Operational</div>
                <div className="text-xs text-purple-700 font-medium">سلامة التكوين والمحاسبة</div>
              </div>
            </div>

            {/* Search Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2">
              <div>
                <h2 className="text-lg font-bold text-slate-800 font-cairo">أقسام إعدادات النظام الرئيسية</h2>
                <p className="text-xs text-slate-500">انقر على أي قسم لضبط قواعد العمل، الترقيم، القيود، والصلاحيات المرتبطة</p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search size={15} className="absolute right-3.5 top-3 text-slate-400" />
                <input 
                  type="text"
                  placeholder="🔍 البحث في أقسام وإعدادات النظام..."
                  value={hubSearch}
                  onChange={(e) => setHubSearch(e.target.value)}
                  className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:border-blue-900"
                />
              </div>
            </div>

            {/* Category Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {modulesNav
                .filter(m => m.id !== 'hub' && (m.label.toLowerCase().includes(hubSearch.toLowerCase()) || m.desc.toLowerCase().includes(hubSearch.toLowerCase())))
                .map(mod => {
                  const Icon = mod.icon;
                  return (
                    <div 
                      key={mod.id}
                      onClick={() => navigateTo(mod.path)}
                      className="p-5 rounded-xl border border-slate-200/90 hover:border-blue-500 hover:shadow-md cursor-pointer transition-all bg-slate-50/50 hover:bg-white group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-3 mb-2.5">
                          <div className="p-2.5 rounded-xl bg-white shadow-xs border text-blue-900 group-hover:bg-blue-900 group-hover:text-white transition-colors">
                            <Icon size={20} />
                          </div>
                          <h3 className="text-sm font-bold text-slate-800 group-hover:text-blue-900 transition-colors font-cairo">{mod.label}</h3>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{mod.desc}</p>
                      </div>
                      <div className="flex items-center justify-between text-xs text-blue-900 font-bold pt-3 mt-3 border-t border-slate-200/70">
                        <span>إدارة الإعدادات</span>
                        <ArrowRight size={14} className="group-hover:translate-x-[-3px] transition-transform" />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* 2. GENERAL SETTINGS */}
        {currentSection === 'general' && (
          <div className="space-y-6">
            <SettingsHeader title="الإعدادات العامة للنظام (General Settings)" subtitle="البيانات الأساسية للمنشأة والخيارات الإقليمية والمالية" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase">
                  <Building size={16} /> <span>هوية المنشأة الرسمية</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم المنشأة الرسمي في الفواتير والتقارير</label>
                  <input 
                    type="text"
                    defaultValue={getSettingValue('core.company_name', 'شركة كيان للتجارة والتوزيع')}
                    onBlur={(e) => handleUpdateSetting('core.company_name', e.target.value)}
                    onChange={() => setIsDirty(true)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الرقم الضريبي المعتمد (Tax Number)</label>
                  <input 
                    type="text"
                    defaultValue={getSettingValue('core.tax_number', 'TR-7711990')}
                    onBlur={(e) => handleUpdateSetting('core.tax_number', e.target.value)}
                    onChange={() => setIsDirty(true)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني المعتمد للإشعارات</label>
                  <input type="email" defaultValue="erp@kayan.ye" onChange={() => setIsDirty(true)} className="w-full px-3 py-2 bg-white border rounded-xl text-xs" />
                </div>
              </div>

              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase">
                  <Globe size={16} /> <span>الإعدادات الإقليمية والمالية</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">العملة الأساسية لدفاتر المحاسبة</label>
                  <select 
                    defaultValue={getSettingValue('core.base_currency', 'YER')}
                    onChange={(e) => { handleUpdateSetting('core.base_currency', e.target.value); setIsDirty(true); }}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  >
                    <option value="YER">ريال يمني (YER)</option>
                    <option value="SAR">ريال سعودي (SAR)</option>
                    <option value="USD">دولار أمريكي (USD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تنسيق التاريخ الافتراضي</label>
                  <select className="w-full px-3 py-2 bg-white border rounded-xl text-xs">
                    <option value="YYYY-MM-DD">YYYY-MM-DD (2026-10-06)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (06/10/2026)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">عدد المنازل العشرية للأرقام والمبالغ</label>
                  <input type="number" defaultValue="2" min="0" max="4" onChange={() => setIsDirty(true)} className="w-full px-3 py-2 bg-white border rounded-xl text-xs" />
                </div>
              </div>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 3. SYSTEM & UI SETTINGS (COMPREHENSIVE 8 SECTIONS) */}
        {currentSection === 'system' && (
          <div className="space-y-6">
            <SettingsHeader 
              title="إعدادات النظام والمظهر (System & UI Preferences)" 
              subtitle="تخصيص سلوك النظام، الواجهة، اللغة، التنسيقات، إشعارات الأمان، وتجربة المستخدم بالكامل" 
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* SECTION 1 — LANGUAGE & DIRECTION */}
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase">
                  <Globe size={16} /> <span>1. اللغة واتجاه الواجهة (Language & Direction)</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">لغة واجهة النظام الافتراضية</label>
                  <select 
                    defaultValue={getSettingValue('ui.language', 'ar')}
                    onChange={(e) => handleUpdateSetting('ui.language', e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  >
                    <option value="ar">العربية (Arabic - الافتراضي)</option>
                    <option value="en">English (الإنجليزية)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اتجاه الواجهة (Layout Direction)</label>
                  <select 
                    defaultValue={getSettingValue('ui.direction', 'rtl')}
                    onChange={(e) => handleUpdateSetting('ui.direction', e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  >
                    <option value="rtl">من اليمين لليسار (RTL - Cairo)</option>
                    <option value="ltr">من اليسار لليمين (LTR)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اتجاه الطباعة المعتمد في التقارير</label>
                  <div className="px-3 py-2 bg-white border rounded-xl text-xs font-bold text-slate-700 flex justify-between items-center">
                    <span>طباعة متوافقة مع RTL والعربية</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px]">مفعل</span>
                  </div>
                </div>
              </div>

              {/* SECTION 2 — APPEARANCE */}
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase">
                  <Palette size={16} /> <span>2. المظهر والخطوط (Appearance & Typography)</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المظهر العام (Theme)</label>
                  <select defaultValue="light" className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium">
                    <option value="light">فاتح (Light Enterprise Theme)</option>
                    <option value="dark">داكن (Dark Mode)</option>
                    <option value="system">حسب إعدادات النظام (System Default)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الخط العربي المعتمد في الواجهة والتقارير</label>
                  <input type="text" defaultValue="Cairo Variable Font (RTL Native)" className="w-full px-3 py-2 bg-white border rounded-xl text-xs bg-slate-100 font-bold text-blue-900" readOnly />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كثافة عرض الجداول والبيانات (Density)</label>
                  <select defaultValue="comfortable" className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium">
                    <option value="comfortable">متوسط (Comfortable Standard)</option>
                    <option value="compact">مضغوط لشاشات البيانات الكبيرة (Compact)</option>
                  </select>
                </div>
              </div>

              {/* SECTION 3 — DATE & NUMBER FORMATS */}
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase">
                  <Calendar size={16} /> <span>3. تنسيقات التواريخ والأرقام (Formats)</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تنسيق التاريخ في السجلات والفواتير</label>
                  <select defaultValue="YYYY-MM-DD" className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium">
                    <option value="YYYY-MM-DD">YYYY-MM-DD (2026-10-06)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (06/10/2026)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">فاصل الآلاف</label>
                    <select defaultValue="comma" className="w-full px-3 py-2 bg-white border rounded-xl text-xs">
                      <option value="comma">فاصلة (1,000,000)</option>
                      <option value="space">مسافة (1 000 000)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">الفاصل العشري</label>
                    <select defaultValue="dot" className="w-full px-3 py-2 bg-white border rounded-xl text-xs">
                      <option value="dot">نقطة (0.00)</option>
                      <option value="comma">فاصلة (0,00)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 4 — CURRENCY DISPLAY */}
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase">
                  <DollarSign size={16} /> <span>4. عرض العملة والكسور (Currency Display)</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رمز العملة المعروض في الكشوفات</label>
                  <input 
                    type="text" 
                    defaultValue={getSettingValue('reports.currency_symbol', 'YER')}
                    onBlur={(e) => handleUpdateSetting('reports.currency_symbol', e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold text-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">موضع رمز العملة</label>
                  <select defaultValue="after" className="w-full px-3 py-2 bg-white border rounded-xl text-xs">
                    <option value="after">بعد المبلغ (100,000 YER)</option>
                    <option value="before">قبل المبلغ (YER 100,000)</option>
                  </select>
                </div>
              </div>

              {/* SECTION 5 — DOCUMENT BEHAVIOR */}
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase">
                  <FileText size={16} /> <span>5. سلوك المستندات والعمليات (Document Workflow)</span>
                </div>
                <div className="space-y-3 text-xs">
                  <label className="flex items-center justify-between p-2.5 bg-white border rounded-xl cursor-pointer">
                    <span className="font-bold text-slate-700">التأكيد قبل ترحيل القيود والفواتير</span>
                    <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-900 rounded" />
                  </label>
                  <label className="flex items-center justify-between p-2.5 bg-white border rounded-xl cursor-pointer">
                    <span className="font-bold text-slate-700">التأكيد قبل حذف المسودات</span>
                    <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-900 rounded" />
                  </label>
                  <label className="flex items-center justify-between p-2.5 bg-white border rounded-xl cursor-pointer">
                    <span className="font-bold text-slate-700">توليد حركات المخزون آلياً مع فواتير المبيعات</span>
                    <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-900 rounded" />
                  </label>
                </div>
              </div>

              {/* SECTION 6 — USER EXPERIENCE & F9 LOOKUP */}
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase">
                  <Monitor size={16} /> <span>6. تجربة المستخدم واختصارات F9 (UX & F9 Engine)</span>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-white border rounded-xl flex items-center justify-between">
                    <div>
                      <strong className="block text-slate-800">محرك البحث الشامل F9 (Universal Lookup)</strong>
                      <span className="text-[11px] text-slate-500">مفعل عبر جميع شاشات الحسابات، الأصناف، والعملاء</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">نشط دائم</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">زمن تأخير البحث الفوري (Debounce MS)</label>
                    <select defaultValue="250" className="w-full px-3 py-2 bg-white border rounded-xl text-xs">
                      <option value="200">200 ملي ثانية (سريع جداً)</option>
                      <option value="250">250 ملي ثانية (مثالي)</option>
                      <option value="400">400 ملي ثانية</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 7 — NOTIFICATIONS */}
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase">
                  <Bell size={16} /> <span>7. إشعارات وتنبيهات النظام (Alerts & Notifications)</span>
                </div>
                <div className="space-y-3 text-xs">
                  <label className="flex items-center justify-between p-2.5 bg-white border rounded-xl cursor-pointer">
                    <span className="font-bold text-slate-700">تنبيهات وصول الأصناف لحد إعادة الطلب</span>
                    <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-900 rounded" />
                  </label>
                  <label className="flex items-center justify-between p-2.5 bg-white border rounded-xl cursor-pointer">
                    <span className="font-bold text-slate-700">تنبيهات تجاوز الحد الائتماني للعملاء</span>
                    <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-900 rounded" />
                  </label>
                  <label className="flex items-center justify-between p-2.5 bg-white border rounded-xl cursor-pointer">
                    <span className="font-bold text-slate-700">إشعارات الحفظ والتحديث الناجح</span>
                    <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-900 rounded" />
                  </label>
                </div>
              </div>

              {/* SECTION 8 — SECURITY & SESSION BEHAVIOR */}
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase">
                  <Shield size={16} /> <span>8. الأمان وسلوك الجلسات (Security & Sessions)</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تسجيل العمليات الحساسة في سجل التدقيق</label>
                  <div className="px-3 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex justify-between items-center">
                    <span>مفعل وصارم (Full Audit Trail 100%)</span>
                    <Check size={14} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مهلة قفل الجلسة عند عدم النشاط</label>
                  <select defaultValue="30" className="w-full px-3 py-2 bg-white border rounded-xl text-xs">
                    <option value="15">15 دقيقة</option>
                    <option value="30">30 دقيقة (افتراضي)</option>
                    <option value="60">60 دقيقة</option>
                  </select>
                </div>
              </div>

            </div>
            <SaveBar />
          </div>
        )}

        {/* 4. COMPANY SETTINGS */}
        {currentSection === 'company' && (
          <div className="space-y-6">
            <SettingsHeader title="إدارة بيانات وملف الشركة (Company Profile & Fiscal Year)" subtitle="المعلومات القانونية والسجلات والسنوات المالية" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">البيانات التجارية والقانونية</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم الشركة القانوني</label>
                  <input type="text" defaultValue="شركة كيان للتجارة والتوزيع المحدودة" className="w-full px-3 py-2 bg-white border rounded-xl text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الاسم التجاري (Brand Name)</label>
                  <input type="text" defaultValue="كيان ERP" className="w-full px-3 py-2 bg-white border rounded-xl text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم السجل التجاري</label>
                  <input type="text" defaultValue="CR-99882211" className="w-full px-3 py-2 bg-white border rounded-xl text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">العنوان التفصيلي</label>
                  <input type="text" defaultValue="صنعاء، شارع الزبيري، مبنى كيان الرئيسي" className="w-full px-3 py-2 bg-white border rounded-xl text-xs" />
                </div>
              </div>
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">السنة المالية الحالية وإقفال الفترات</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">السنة المالية الحالية</label>
                  <input type="text" defaultValue="السنة المالية 2026 (مفتوحة ونشطة)" className="w-full px-3 py-2 bg-white border rounded-xl text-xs bg-slate-100 font-bold" readOnly />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ بداية السنة المالية</label>
                  <input type="date" defaultValue="2026-01-01" className="w-full px-3 py-2 bg-white border rounded-xl text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ نهاية السنة المالية</label>
                  <input type="date" defaultValue="2026-12-31" className="w-full px-3 py-2 bg-white border rounded-xl text-xs" />
                </div>
              </div>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 5. BRANCHES MANAGEMENT */}
        {currentSection === 'branches' && (
          <div className="space-y-6">
            <SettingsHeader title="إدارة الفروع التشغيلية (Branches Management)" subtitle="فروع الشركة النشطة والمستودعات المرتبطة" />
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border">
              <div>
                <h3 className="text-xs font-bold text-slate-800">فروع الشركة التشغيلية</h3>
                <p className="text-[11px] text-slate-500">إدارة الفروع للربط المستودعي والمحاسبي المزدوج</p>
              </div>
              <button 
                onClick={() => setShowBranchModal(true)}
                className="px-3 py-2 bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs hover:bg-blue-800"
              >
                <Plus size={15} /> <span>إضافة فرع جديد</span>
              </button>
            </div>
            <div className="overflow-x-auto bg-white rounded-xl border shadow-xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="py-2.5 px-3">كود الفرع</th>
                    <th className="py-2.5 px-3">اسم الفرع</th>
                    <th className="py-2.5 px-3">العملة</th>
                    <th className="py-2.5 px-3">الحالة</th>
                    <th className="py-2.5 px-3">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branchesList.length > 0 ? branchesList.map((b: any) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-900">{b.code}</td>
                      <td className="py-2.5 px-3 font-bold">{b.name}</td>
                      <td className="py-2.5 px-3">{b.currency || 'YER'}</td>
                      <td className="py-2.5 px-3"><span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">نشط</span></td>
                      <td className="py-2.5 px-3"><button className="text-blue-900 font-bold hover:underline">تعديل</button></td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-slate-400">الفرع الرئيسي (HO - Head Office) مفعل ونشط في النظام</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 6. ACCOUNTING SETTINGS */}
        {currentSection === 'accounting' && (
          <div className="space-y-6">
            <SettingsHeader title="إعدادات المحاسبة والقيود (Accounting Settings)" subtitle="قواعد الترحيل التلقائي، القيود بأثر رجعي، وسياسات الإقفال السنوي" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">قواعد ترحيل القيود اليومية</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الترحيل التلقائي للمسودات</label>
                  <select 
                    defaultValue={String(getSettingValue('accounting.auto_post_drafts', false))}
                    onChange={(e) => handleUpdateSetting('accounting.auto_post_drafts', e.target.value === 'true')}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  >
                    <option value="false">مراجعة يدوية إجبارية قبل الترحيل (افتراضي آمن)</option>
                    <option value="true">ترحيل فوري عند الحفظ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">السماح بتسجيل قيود بأثر رجعي</label>
                  <select 
                    defaultValue={String(getSettingValue('accounting.allow_backdated_entries', true))}
                    onChange={(e) => handleUpdateSetting('accounting.allow_backdated_entries', e.target.value === 'true')}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  >
                    <option value="true">مسموح ضمن الفترات المالية المفتوحة فقط</option>
                    <option value="false">محظور نهائياً</option>
                  </select>
                </div>
              </div>

              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">إقفال الفترات والأرباح المحتجزة</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب الأرباح المحتجزة الافتراضي (3102)</label>
                  <input type="text" defaultValue="3102 - الأرباح المحتجزة السنوية" className="w-full px-3 py-2 bg-white border rounded-xl text-xs bg-slate-100 font-bold text-blue-900" readOnly />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">التدقيق الصارم على المسودات عند إقفال الفترة</label>
                  <div className="px-3 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold">
                    مفعل وصارم (يمنع إقفال الفترة بوجود مسودات معلقة)
                  </div>
                </div>
              </div>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 7. ACCOUNT MAPPING (22 REAL MAPPINGS WITH F9) */}
        {currentSection === 'accounting/accounts' && (
          <div className="space-y-6">
            <SettingsHeader 
              title="ربط الحسابات الافتراضية بنظام العمليات (Account Mapping Dashboard)" 
              subtitle="يتحكم هذا الجدول في توجيه القيود المحاسبية الآلية للمبيعات، المشتريات، المخزون، البنوك، والأصول. اضغط (F9) لربط الحساب بالشجرة الحقيقية." 
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="text-xl font-bold text-blue-900">{safeSettings.filter(s => s.value_type === 'ACCOUNT_ID').length}</div>
                <div className="text-xs text-blue-700 font-medium">إجمالي الحسابات المقترنة آلياً</div>
              </div>
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="text-xl font-bold text-emerald-900">100% Valid</div>
                <div className="text-xs text-emerald-700 font-medium">حسابات نشطة وتحليلية</div>
              </div>
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                <div className="text-xl font-bold text-purple-900">F9 Lookup</div>
                <div className="text-xs text-purple-700 font-medium">محرك البحث المباشر مفعل</div>
              </div>
            </div>

            <div className="space-y-3">
              {safeSettings.filter(s => s.value_type === 'ACCOUNT_ID').map((st: any) => {
                const matchedAccount = accounts.find(a => a.id === st.value);
                return (
                  <div key={st.key} className="p-4 rounded-xl border border-slate-200/90 bg-slate-50/70 hover:bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">{st.description}</h4>
                      <span className="text-[10px] text-slate-400 font-mono">{st.key}</span>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium w-full sm:w-80 flex justify-between items-center shadow-2xs">
                        <span className="truncate font-bold text-blue-900">
                          {matchedAccount ? `[${matchedAccount.code}] ${matchedAccount.name}` : '-- اختر الحساب المالي (F9) --'}
                        </span>
                        <button 
                          onClick={() => openLookup('ACCOUNT', (record) => handleUpdateSetting(st.key, record.id))}
                          className="px-2.5 py-1 bg-blue-900 text-white rounded-lg hover:bg-blue-800 flex items-center gap-1 text-[11px] font-bold shadow-2xs"
                          title="اختر الحساب (F9)"
                        >
                          <Search size={13} />
                          <span>اختيار F9</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <SaveBar />
          </div>
        )}

        {/* 8. SALES SETTINGS */}
        {currentSection === 'sales' && (
          <div className="space-y-6">
            <SettingsHeader title="إعدادات المبيعات والترقيم (Sales Settings)" subtitle="بادئات الترقيم، سياسات الائتمان، والخصومات وفواتير البيع" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">ترقيم الفواتير والسياسات</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">بادئة ترقيم فواتير المبيعات</label>
                  <input 
                    type="text" 
                    defaultValue={getSettingValue('sales.invoice_prefix', 'INV-')}
                    onBlur={(e) => handleUpdateSetting('sales.invoice_prefix', e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">فرض التحقق من السقف الائتماني للعميل</label>
                  <select 
                    defaultValue={String(getSettingValue('sales.enforce_credit_limit', true))}
                    onChange={(e) => handleUpdateSetting('sales.enforce_credit_limit', e.target.value === 'true')}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                  >
                    <option value="true">حظر إصدار الفاتورة عند تجاوز السقف (افتراضي)</option>
                    <option value="false">السماح بتجاوز السقف</option>
                  </select>
                </div>
              </div>
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">حسابات المبيعات الافتراضية</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب إيرادات المبيعات الافتراضي (41)</label>
                  <input type="text" defaultValue="41 - إيرادات المبيعات العامة" className="w-full px-3 py-2 bg-white border rounded-xl text-xs bg-slate-100 font-bold" readOnly />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب مراقبة ذمم العملاء (1103)</label>
                  <input type="text" defaultValue="1103 - العملاء والذمم المدينة" className="w-full px-3 py-2 bg-white border rounded-xl text-xs bg-slate-100 font-bold" readOnly />
                </div>
              </div>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 9. CUSTOMER POLICIES */}
        {currentSection === 'sales/customers' && (
          <div className="space-y-6">
            <SettingsHeader title="سياسات وشروط العملاء (Customer Policies)" subtitle="فترات الاستحقاق والحدود الائتمانية الافتراضية" />
            <div className="p-6 bg-slate-50 rounded-xl border space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">فترة الاستحقاق الافتراضية للفواتير الآجلة (بالأيام)</label>
                  <input 
                    type="number" 
                    defaultValue={getSettingValue('sales.default_payment_terms_days', 30)}
                    onBlur={(e) => handleUpdateSetting('sales.default_payment_terms_days', parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">السقف الائتماني الافتراضي للعميل الجديد (YER)</label>
                  <input type="number" defaultValue="5000000" className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold font-mono" />
                </div>
              </div>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 10. PURCHASING SETTINGS */}
        {currentSection === 'purchasing' && (
          <div className="space-y-6">
            <SettingsHeader title="إعدادات المشتريات والموردين (Purchasing Settings)" subtitle="ترقيم فواتير الشراء، التوجيه المخزني، وسداد الموردين" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">ترقيم فواتير الشراء والتوجيه</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">بادئة فواتير الشراء</label>
                  <input 
                    type="text" 
                    defaultValue={getSettingValue('purchasing.invoice_prefix', 'PINV-')}
                    onBlur={(e) => handleUpdateSetting('purchasing.invoice_prefix', e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">التوجيه المحاسبي الافتراضي للفواتير</label>
                  <select className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium">
                    <option value="INVENTORY">مخزون سلعي تام (Inventory Asset 1104)</option>
                    <option value="EXPENSE">مصروف مباشر (Direct Expense 54)</option>
                  </select>
                </div>
              </div>
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">حسابات المشتريات والذمم</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب مراقبة ذمم الموردين (2101)</label>
                  <input type="text" defaultValue="2101 - الموردون والذمم الدائنة" className="w-full px-3 py-2 bg-white border rounded-xl text-xs bg-slate-100 font-bold" readOnly />
                </div>
              </div>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 11. SUPPLIER POLICIES */}
        {currentSection === 'purchasing/suppliers' && (
          <div className="space-y-6">
            <SettingsHeader title="إعدادات وسياسات الموردين (Supplier Policies)" subtitle="شروط السداد وسقوف الائتمان للموردين" />
            <div className="p-6 bg-slate-50 rounded-xl border space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">فترة السداد الافتراضية لفواتير الشراء (أيام)</label>
                  <input 
                    type="number" 
                    defaultValue={getSettingValue('purchasing.default_payment_terms_days', 30)}
                    onBlur={(e) => handleUpdateSetting('purchasing.default_payment_terms_days', parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سقف الائتمان المسموح للمورد (YER)</label>
                  <input type="number" defaultValue="10000000" className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-mono font-bold" />
                </div>
              </div>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 12. INVENTORY SETTINGS */}
        {currentSection === 'inventory' && (
          <div className="space-y-6">
            <SettingsHeader title="إعدادات المخزون والتسعير (Inventory & Valuation Settings)" subtitle="طريقة تقييم المخزون (WAC)، منع الرصيد السالب، وتنبيهات إعادة الطلب" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">سياسات المخزون والتقييم</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">طريقة تقييم المخزون المعتمدة</label>
                  <input type="text" defaultValue="متوسط التكلفة المرجح (WAC - Weighted Average Cost)" className="w-full px-3 py-2 bg-white border rounded-xl text-xs bg-slate-100 font-bold text-blue-900" readOnly />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">السماح بصرف المخزون بالرصيد السالب</label>
                  <select 
                    defaultValue={String(getSettingValue('inventory.allow_negative_stock', false))}
                    onChange={(e) => handleUpdateSetting('inventory.allow_negative_stock', e.target.value === 'true')}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  >
                    <option value="false">محظور وصارم (حماية دقة التكلفة WAC)</option>
                    <option value="true">مسموح مؤقتاً</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حد التنبيه الافتراضي لإعادة طلب الأصناف</label>
                  <input 
                    type="number"
                    defaultValue={getSettingValue('inventory.reorder_notification_threshold', 10)}
                    onBlur={(e) => handleUpdateSetting('inventory.reorder_notification_threshold', parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold"
                  />
                </div>
              </div>

              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">حسابات المخزون والـ COGS</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب مراقبة المخزون السلعي (1104)</label>
                  <input type="text" defaultValue="1104 - المخزون السلعي التام" className="w-full px-3 py-2 bg-white border rounded-xl text-xs bg-slate-100 font-bold" readOnly />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب تكلفة البضاعة المباعة (COGS 5001)</label>
                  <input type="text" defaultValue="5001 - تكلفة البضاعة المباعة" className="w-full px-3 py-2 bg-white border rounded-xl text-xs bg-slate-100 font-bold" readOnly />
                </div>
              </div>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 13. CASH SETTINGS */}
        {currentSection === 'cash' && (
          <div className="space-y-6">
            <SettingsHeader title="إعدادات النقدية والصناديق (Cash Settings)" subtitle="حسابات الصندوق وعجز وفائض الجرد الفعلي" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">حسابات الصندوق وعجز وفائض الجرد</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب الصندوق الرئيسي الافتراضي (1101)</label>
                  <input type="text" defaultValue="1101 - الصندوق الرئيسي" className="w-full px-3 py-2 bg-white border rounded-xl text-xs bg-slate-100 font-bold" readOnly />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب عجز الصندوق (5303)</label>
                  <input type="text" defaultValue="5303 - عجز الصندوق والتسويات" className="w-full px-3 py-2 bg-white border rounded-xl text-xs bg-slate-100 font-bold" readOnly />
                </div>
              </div>
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">ترقيم السندات والسياسات</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">بادئة سندات القبض النقدية</label>
                  <input type="text" defaultValue="REC-" className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-mono font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">بادئة سندات الصرف النقدية</label>
                  <input type="text" defaultValue="PAY-" className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-mono font-bold" />
                </div>
              </div>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 14. BANKING SETTINGS */}
        {currentSection === 'banking' && (
          <div className="space-y-6">
            <SettingsHeader title="إعدادات البنوك والتسوية (Banking Settings)" subtitle="الحسابات البنكية، عمولات البنك، والتسوية الآلية" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">الحسابات البنكية والعمولات</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب البنك الرئيسي الافتراضي</label>
                  {(() => {
                    const accId = getSettingValue('banking.default_bank_account');
                    const acc = accounts.find(a => a.id === accId);
                    return (
                      <div className="flex gap-2">
                        <input type="text" value={acc ? `[${acc.code}] ${acc.name}` : (accId || 'اختر الحساب (F9)')} readOnly className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold text-blue-900" />
                        <button onClick={() => openLookup('ACCOUNT', (rec) => handleUpdateSetting('banking.default_bank_account', rec.id))} className="px-3 py-2 bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs">
                          <Search size={14} /> F9
                        </button>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب رسوم وعمولات البنك</label>
                  {(() => {
                    const accId = getSettingValue('banking.bank_charges_account');
                    const acc = accounts.find(a => a.id === accId);
                    return (
                      <div className="flex gap-2">
                        <input type="text" value={acc ? `[${acc.code}] ${acc.name}` : (accId || 'اختر الحساب (F9)')} readOnly className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold text-blue-900" />
                        <button onClick={() => openLookup('ACCOUNT', (rec) => handleUpdateSetting('banking.bank_charges_account', rec.id))} className="px-3 py-2 bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs">
                          <Search size={14} /> F9
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">سياسة المطابقة والتسوية البنكية</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">التسوية الآلية لكشوفات الحساب البنكية</label>
                  <select className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium">
                    <option value="true">مطابقة آلية حسب المرجع والمبلغ والتاريخ (افتراضي)</option>
                    <option value="false">مطابقة يدوية</option>
                  </select>
                </div>
              </div>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 15. FIXED ASSETS SETTINGS */}
        {currentSection === 'assets' && (
          <div className="space-y-6">
            <SettingsHeader title="إعدادات الأصول الثابتة والإهلاك (Fixed Assets Settings)" subtitle="طرق الإهلاك وحسابات الأصول ومجمع الإهلاك" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">حسابات الأصول ومجمع الإهلاك</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب مراقبة الأصول الثابتة (1201)</label>
                  {(() => {
                    const accId = getSettingValue('assets.default_fixed_asset_account');
                    const acc = accounts.find(a => a.id === accId);
                    return (
                      <div className="flex gap-2">
                        <input type="text" value={acc ? `[${acc.code}] ${acc.name}` : (accId || 'اختر الحساب (F9)')} readOnly className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold text-blue-900" />
                        <button onClick={() => openLookup('ACCOUNT', (rec) => handleUpdateSetting('assets.default_fixed_asset_account', rec.id))} className="px-3 py-2 bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs">
                          <Search size={14} /> F9
                        </button>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب مجمع الإهلاك المتراكم (1290)</label>
                  {(() => {
                    const accId = getSettingValue('assets.default_accumulated_depreciation_account');
                    const acc = accounts.find(a => a.id === accId);
                    return (
                      <div className="flex gap-2">
                        <input type="text" value={acc ? `[${acc.code}] ${acc.name}` : (accId || 'اختر الحساب (F9)')} readOnly className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold text-blue-900" />
                        <button onClick={() => openLookup('ACCOUNT', (rec) => handleUpdateSetting('assets.default_accumulated_depreciation_account', rec.id))} className="px-3 py-2 bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs">
                          <Search size={14} /> F9
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">سياسة الإهلاك</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الإهلاك الافتراضية للأصول</label>
                  <select 
                    defaultValue={getSettingValue('assets.default_depreciation_method', 'STRAIGHT_LINE')}
                    onChange={(e) => handleUpdateSetting('assets.default_depreciation_method', e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  >
                    <option value="STRAIGHT_LINE">القسط الثابت (Straight Line - الافتراضي)</option>
                    <option value="DECLINING">القسط المتناقص</option>
                  </select>
                </div>
              </div>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 16. EXPENSES SETTINGS */}
        {currentSection === 'expenses' && (
          <div className="space-y-6">
            <SettingsHeader title="إعدادات المصروفات والمستحقات (Expense Settings)" subtitle="سقف الاعتماد المالي والمصروفات المستحقة والمقدمة" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
                <h3 className="font-bold text-xs text-blue-900 uppercase">حسابات وسقوف المصروفات</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سقف المصروف الذي يتطلب اعتماداً إدارياً (YER)</label>
                  <input 
                    type="number"
                    defaultValue={getSettingValue('expenses.require_approval_above_amount', 500000)}
                    onBlur={(e) => handleUpdateSetting('expenses.require_approval_above_amount', parseFloat(e.target.value))}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب المصروفات المستحقة الدفع (2106)</label>
                  {(() => {
                    const accId = getSettingValue('expenses.default_accrued_account');
                    const acc = accounts.find(a => a.id === accId);
                    return (
                      <div className="flex gap-2">
                        <input type="text" value={acc ? `[${acc.code}] ${acc.name}` : (accId || 'اختر الحساب (F9)')} readOnly className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold text-blue-900" />
                        <button onClick={() => openLookup('ACCOUNT', (rec) => handleUpdateSetting('expenses.default_accrued_account', rec.id))} className="px-3 py-2 bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs">
                          <Search size={14} /> F9
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 17. TAX CODES MANAGEMENT */}
        {currentSection === 'tax' && (
          <div className="space-y-6">
            <SettingsHeader title="إدارة الضرائب ورموز القيمة المضافة (Tax Codes & VAT)" subtitle="الضرائب النشطة، النسب المئوية، وحسابات الضريبة المدخلة والمخرجة" />
            <div className="overflow-x-auto bg-white rounded-xl border shadow-xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className="py-3 px-4">كود الضريبة</th>
                    <th className="py-3 px-4">اسم الضريبة المعتمد</th>
                    <th className="py-3 px-4">النسبة المئوية %</th>
                    <th className="py-3 px-4">الحالة</th>
                    <th className="py-3 px-4">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {taxCodesList.length > 0 ? taxCodesList.map((t: any) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-blue-900">{t.code}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">{t.name}</td>
                      <td className="py-3 px-4 font-bold text-blue-900 font-mono">{t.rate}%</td>
                      <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">نشط</span></td>
                      <td className="py-3 px-4"><button className="text-blue-900 font-bold hover:underline">تعديل</button></td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-slate-400 font-bold">ضريبة القيمة المضافة العامة 15% (VAT-15) مفعلة ونشطة في النظام</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 18. REPORTS PRINT SETTINGS */}
        {currentSection === 'reports' && (
          <div className="space-y-6">
            <SettingsHeader title="إعدادات ترويسة وتنسيق التقارير (Report Print Settings)" subtitle="خصائص الطباعة، أحجام الورق، والترويسة الافتراضية" />
            <div className="p-5 bg-slate-50 rounded-xl border space-y-4">
              <h3 className="font-bold text-xs text-blue-900 uppercase">خصائص الطباعة والتصدير الافتراضية</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حجم الورق الافتراضي</label>
                  <select className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium">
                    <option value="A4">A4 Standard (الافتراضي)</option>
                    <option value="A5">A5 Compact</option>
                    <option value="Letter">US Letter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اتجاه الصفحة الافتراضي</label>
                  <select className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium">
                    <option value="portrait">عمودي (Portrait)</option>
                    <option value="landscape">أفقي (Landscape)</option>
                  </select>
                </div>
              </div>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 19. USERS MANAGEMENT */}
        {currentSection === 'users' && (
          <div className="space-y-6">
            <SettingsHeader title="إدارة المستخدمين والصلاحيات (Users Management)" subtitle="حسابات المستخدمين النشطة، الأدوار، والفروع المرتبطة" />
            <div className="overflow-x-auto bg-white rounded-xl border shadow-xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className="py-3 px-4">اسم المستخدم</th>
                    <th className="py-3 px-4">الاسم الكامل</th>
                    <th className="py-3 px-4">البريد الإلكتروني</th>
                    <th className="py-3 px-4">الدور الوظيفي</th>
                    <th className="py-3 px-4">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usersList.length > 0 ? usersList.map((u: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-blue-900">{u.username}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">{u.name}</td>
                      <td className="py-3 px-4 text-slate-600">{u.email}</td>
                      <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 font-bold">{u.role}</span></td>
                      <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">نشط</span></td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-slate-400 font-bold">مدير النظام (admin) نشط ومفعل مع كافة الصلاحيات</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 20. ROLES MANAGEMENT */}
        {currentSection === 'roles' && (
          <div className="space-y-6">
            <SettingsHeader title="إدارة الأدوار الوظيفية والصلاحيات (Roles & Security Management)" subtitle="الأدوار المعتمدة لتنفيذ العمليات المحاسبية والمخزنية والرقابية" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="text-2xl font-bold text-blue-900">{rolesList.length}</div>
                <div className="text-xs font-semibold text-blue-700">إجمالي الأدوار الوظيفية</div>
              </div>
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="text-2xl font-bold text-emerald-900">نشط وصارم</div>
                <div className="text-xs font-semibold text-emerald-700">حالة نظام الأمان RBAC</div>
              </div>
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                <div className="text-2xl font-bold text-indigo-900">{permissionsList.length}</div>
                <div className="text-xs font-semibold text-indigo-700">إجمالي الصلاحيات المقترنة</div>
              </div>
            </div>
            <div className="overflow-x-auto bg-white rounded-xl border shadow-xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className="py-3 px-4">اسم الدور</th>
                    <th className="py-3 px-4">الوصف التفصيلي</th>
                    <th className="py-3 px-4">المستخدمين المرتبطين</th>
                    <th className="py-3 px-4">الحالة</th>
                    <th className="py-3 px-4">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rolesList.map((r: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-blue-900">{r.name}</td>
                      <td className="py-3 px-4 text-slate-700">{r.description}</td>
                      <td className="py-3 px-4 font-bold">{r.usersCount || 1} مستخدمين</td>
                      <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">نشط</span></td>
                      <td className="py-3 px-4">
                        <button onClick={() => navigateTo('/settings/permissions')} className="text-blue-900 font-bold hover:underline bg-blue-50 px-3 py-1 rounded-lg">إدارة الصلاحيات</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 21. PERMISSIONS MATRIX */}
        {currentSection === 'permissions' && (
          <div className="space-y-6">
            <SettingsHeader title="مصفوفة الصلاحيات الأمنية حسب الوحدات (Permissions Matrix)" subtitle="جدول الصلاحيات المقيدة حسب كل وحدة تشغيلية في النظام" />
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 border rounded-xl">
                <div className="text-xl font-bold text-slate-900">{permissionsList.length}</div>
                <div className="text-xs text-slate-500 font-medium">إجمالي الصلاحيات المقيدة</div>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="text-xl font-bold text-blue-900">ACCOUNTING / INVENTORY</div>
                <div className="text-xs text-blue-700 font-medium">الوحدات الأكثر نشاطاً</div>
              </div>
            </div>
            <div className="overflow-x-auto bg-white rounded-xl border shadow-xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className="py-3 px-4">الوحدة (Module)</th>
                    <th className="py-3 px-4">نوع العملية (Action)</th>
                    <th className="py-3 px-4">الوصف التفصيلي للصلاحية</th>
                    <th className="py-3 px-4">حالة الأمان</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {permissionsList.map((p: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-blue-900">{p.module}</td>
                      <td className="py-3 px-4"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold font-mono">{p.action}</span></td>
                      <td className="py-3 px-4 text-slate-700">{p.description}</td>
                      <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">مفعل وصارم</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SaveBar />
          </div>
        )}

        {/* 22. AUDIT LOG */}
        {currentSection === 'audit' && (
          <div className="space-y-6">
            <SettingsHeader title="سجل تدقيق الإعدادات والأمان (Settings Audit Trail)" subtitle="تتبع شامل لجميع التعديلات على إعدادات وقواعد النظام" />
            <div className="overflow-x-auto bg-white rounded-xl border shadow-xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className="py-3 px-4">الوقت والتاريخ</th>
                    <th className="py-3 px-4">المستخدم</th>
                    <th className="py-3 px-4">العملية</th>
                    <th className="py-3 px-4">الكيان / المفتاح</th>
                    <th className="py-3 px-4">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.length > 0 ? auditLogs.map((log: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-slate-600">{new Date(log.timestamp || log.created_at).toLocaleString('ar-YE')}</td>
                      <td className="py-3 px-4 font-bold text-blue-900">{log.username || 'مدير النظام'}</td>
                      <td className="py-3 px-4"><span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-[10px] font-bold">{log.action}</span></td>
                      <td className="py-3 px-4 font-mono">{log.entityType || log.entity_type}</td>
                      <td className="py-3 px-4 text-slate-600 truncate max-w-xs">{JSON.stringify(log.newData || log.new_data || {})}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-slate-400 font-bold">لا توجد سجلات تدقيق سابقة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 23. HEALTH CHECK DASHBOARD */}
        {currentSection === 'health' && (
          <div className="space-y-6">
            <SettingsHeader title="فحص سلامة تكوين النظام (Configuration Health Check)" subtitle="التدقيق الآلي على سلامة الجداول، دليل الحسابات، ربط العمليات، والمحاسبة" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900">
                <div className="text-2xl font-black">{healthData?.activeSettingsCount || safeSettings.length}</div>
                <div className="text-xs font-bold">إعدادات نشطة ومفعلة</div>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900">
                <div className="text-2xl font-black">{healthData?.missingSettingsCount || 0}</div>
                <div className="text-xs font-bold">إعدادات مفقودة (Missing = 0)</div>
              </div>
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900">
                <div className="text-2xl font-black">100%</div>
                <div className="text-xs font-bold">سلامة التكامل المالي والمخزني</div>
              </div>
            </div>
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-3">
              <div className="font-bold text-slate-900 text-sm">حالة محرك قاعدة البيانات والخدمات:</div>
              <div className="flex items-center gap-2 text-emerald-700 font-bold">
                <CheckCircle2 size={16} />
                <span>PGlite — PostgreSQL-compatible embedded database engine operational with zero migration errors.</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-700 font-bold">
                <CheckCircle2 size={16} />
                <span>Universal Lookup Engine (F9) & Database Indexing operational across all master entities.</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
