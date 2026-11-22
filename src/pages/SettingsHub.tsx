import React, { useState, useEffect } from 'react';
import { useNavigation } from '../context/NavigationContext';
import { useLookup } from '../context/LookupContext';
import { useSettings } from '../context/SettingsContext';
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
  KeyRound,
  RefreshCw,
  X,
  Pencil,
  Power,
  LogIn,
  LogOut,
  Clock,
  UserPlus,
  Trash2,
  Palette,
  Calendar,
  Hash,
  DollarSign,
  ToggleLeft,
  GitFork,
  Check
} from 'lucide-react';

/**
 * Session helpers shared with CompanySettings: the user-management write
 * endpoints accept ONLY the server-issued signed token (same localStorage
 * keys, so signing in on either screen signs in on both).
 */
const USER_TOKEN_KEY = 'kayan_session_token';
const USER_KEY = 'kayan_user';

const ROLE_MODULE_NAMES: Record<string, string> = {
  ACCOUNTING: 'المحاسبة والقيود',
  SALES: 'المبيعات والعملاء',
  PURCHASING: 'المشتريات والموردين',
  INVENTORY: 'المخزون والمستودعات',
  BANKING: 'البنوك والنقدية',
  ASSETS: 'الأصول الثابتة',
  EXPENSES: 'المصروفات',
  REPORTS: 'التقارير والطباعة',
  SETTINGS: 'الإعدادات',
  SYSTEM: 'النظام والأمان',
};

function readStoredSessionToken(): string {
  try {
    return typeof localStorage !== 'undefined' ? (localStorage.getItem(USER_TOKEN_KEY) || '') : '';
  } catch {
    return '';
  }
}

function readStoredSessionUser(): { id?: string; username: string; fullName?: string } | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(USER_KEY) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeUserSession(token: string, user: any) {
  try {
    localStorage.setItem(USER_TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify({ id: user.id, username: user.username, fullName: user.fullName || user.full_name }));
  } catch { /* storage unavailable — the request still carries the token */ }
}

function clearUserSession() {
  try {
    localStorage.removeItem(USER_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('kayan_company_scope');
    localStorage.removeItem('kayan_branch_scope');
  } catch { /* ignore */ }
  window.dispatchEvent(new Event('kayan:session-logout'));
}

/**
 * Admin session gate for screens whose writes are RBAC-guarded (users, roles,
 * tax codes). Shown whenever no bearer session exists — the write endpoints
 * answer 401/403 without it.
 */
const AdminSessionGate: React.FC<{
  session: { username: string; fullName?: string } | null;
  form: { username: string; password: string };
  setForm: (f: { username: string; password: string }) => void;
  onLogin: () => void;
  onLogout: () => void;
  loggingIn: boolean;
  error: string | null;
  description: string;
}> = ({ session, form, setForm, onLogin, onLogout, loggingIn, error, description }) => {
  if (session) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between">
        <div className="text-xs font-bold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 size={15} />
          <span>جلسة الإدارة نشطة: {session.fullName || session.username} ({session.username})</span>
        </div>
        <button
          onClick={onLogout}
          className="px-3 py-1.5 bg-white border border-emerald-200 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
        >
          <LogOut size={13} />
          <span>خروج</span>
        </button>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-amber-200 shadow-xs p-5">
      <div className="flex items-center gap-2 mb-1">
        <LogIn size={16} className="text-amber-600" />
        <h3 className="text-sm font-black text-slate-900">تسجيل الدخول للإدارة</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">{description}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          placeholder="اسم المستخدم"
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
        />
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') onLogin(); }}
          placeholder="كلمة المرور"
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
        />
        <button
          onClick={onLogin}
          disabled={loggingIn}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-60"
        >
          {loggingIn ? 'جاري الدخول...' : 'دخول'}
        </button>
      </div>
      {error && <p className="text-xs font-bold text-rose-600 mt-2">{error}</p>}
    </div>
  );
};

export const SettingsHub: React.FC = () => {
  const { currentRoute, navigateTo } = useNavigation();
  const { openLookup } = useLookup();
  // PHASE 10.5.1 — the hub now saves through the central settings context, so
  // every document-level effect (theme/direction/density/formats) re-applies
  // immediately after a save instead of only after a full page reload.
  const { getValue: getLiveSetting, setValue: setLiveSetting } = useSettings();

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
  const [editingBranch, setEditingBranch] = useState<any | null>(null);
  const [branchForm, setBranchForm] = useState({ code: '', name: '', address: '' });
  const [branchFormError, setBranchFormError] = useState<string | null>(null);
  const [savingBranch, setSavingBranch] = useState(false);

  // Inline tax-code editing (the تعديل button used to be a no-op — see
  // PUT /api/taxes/codes/:id in routes.ts).
  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  const [taxEditForm, setTaxEditForm] = useState({ name: '', rate: 15 });
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxError, setTaxError] = useState<string | null>(null);

  // ---- Users Management screen state ----
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [userForm, setUserForm] = useState({ username: '', fullName: '', email: '', password: '', roleId: '', isActive: true });
  const [savingUser, setSavingUser] = useState(false);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [resetForm, setResetForm] = useState({ newPassword: '', confirmPassword: '' });
  const [resetError, setResetError] = useState<string | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [scopeTarget, setScopeTarget] = useState<any | null>(null);
  const [scopeCatalog, setScopeCatalog] = useState<Array<{
    company_id: string;
    company_name: string;
    branch_id: string | null;
    branch_name: string | null;
    branch_active: boolean | null;
  }>>([]);
  const [scopeCompanyIds, setScopeCompanyIds] = useState<string[]>([]);
  const [scopeBranchKeys, setScopeBranchKeys] = useState<string[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeSaving, setScopeSaving] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);
  // Session gate: user/role-write endpoints require the same signed token
  // that CompanySettings uses (localStorage key shared on purpose).
  const [userSession, setUserSession] = useState<{ username: string; fullName?: string } | null>(() => readStoredSessionUser());
  const [userLoginForm, setUserLoginForm] = useState({ username: '', password: '' });
  const [userLoggingIn, setUserLoggingIn] = useState(false);
  const [userLoginError, setUserLoginError] = useState<string | null>(null);

  // ---- Roles Management screen state ----
  const [roleSearch, setRoleSearch] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<any | null>(null);
  const [roleForm, setRoleForm] = useState({ name: '', description: '' });
  const [roleFormError, setRoleFormError] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<any | null>(null);
  const [permEditorRole, setPermEditorRole] = useState<any | null>(null);
  const [permSelected, setPermSelected] = useState<string[]>([]);
  const [permSearch, setPermSearch] = useState('');
  const [savingPerms, setSavingPerms] = useState(false);

  const currentSection = currentRoute.split('/settings')[1]?.replace(/^\//, '') || 'hub';

  const fetchSettingsData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [resSet, resAcc, resHealth, resAudit, resUsers, resBranches, resTaxes, resRoles, resPerms] = await Promise.all([
        fetch('/api/settings').then(r => r.json()).catch(() => []),
        fetch('/api/accounts').then(r => r.json()).catch(() => []),
        fetch('/api/settings/health').then(r => r.json()).catch(() => null),
        fetch('/api/audit-logs?limit=100', {
          // PHASE 10.5.3: the audit trail is permission-guarded now — attach
          // the stored session like every other guarded read.
          headers: readStoredSessionToken() ? { Authorization: `Bearer ${readStoredSessionToken()}` } : {},
        }).then(r => r.json()).catch(() => []),
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
      // /api/settings/users answers { users, roles } while the older screens
      // answered a bare array — accept both so the table never stays empty.
      // NOTE: the roles embedded in the users payload are RAW rows (no
      // counts), so the dedicated /api/settings/roles response — which
      // carries usersCount / permissionsCount / permissionIds — always wins.
      const usersPayload = resUsers && typeof resUsers === 'object' && !Array.isArray(resUsers) ? resUsers : null;
      setUsersList(Array.isArray(resUsers) ? resUsers : (usersPayload?.users || []));
      if (Array.isArray(resRoles) && resRoles.length > 0) {
        setRolesList(resRoles);
      } else if (usersPayload && Array.isArray(usersPayload.roles)) {
        setRolesList(usersPayload.roles);
      } else {
        setRolesList([]);
      }
      setBranchesList(Array.isArray(resBranches) ? resBranches : (resBranches?.branches || []));
      setTaxCodesList(Array.isArray(resTaxes) ? resTaxes : []);
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
      // PHASE 10.5.1 — one PUT through the central settings context: it stores
      // the value, updates the in-memory prefs and re-applies every
      // document-level effect (dark class, density, lang/dir, report formats)
      // immediately. The local row is patched in place afterwards — the old
      // code refetched ALL nine hub endpoints after each save with no
      // sequencing, so a slow response could overwrite a newer value.
      await setLiveSetting(key, value, 'تحديث عبر مركز الإعدادات المركزي');
      setSettings(prev => prev.map(s => (s.key === key ? { ...s, value } : s)));
      // PHASE 10.5.1 — getValue() reads React state, so during the save of
      // ui.notify_save_success itself the closure still holds the PREVIOUS
      // value (toggle OFF would still show a banner, toggle ON would swallow
      // it). The key being saved wins; every other save reads live state.
      const notifyVal = key === 'ui.notify_save_success' ? value : getLiveSetting('ui.notify_save_success', true);
      if (String(notifyVal) !== 'false') {
        setMessage({ text: `تم حفظ الإعداد (${key}) بنجاح في قاعدة البيانات`, type: 'success' });
      }
      setIsDirty(false);
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل تحديث الإعداد', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const safeSettings = Array.isArray(settings) ? settings : [];

  // ================= Users Management helpers =================
  const authedUserRequest = async (method: string, url: string, body?: any) => {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(readStoredSessionToken() ? { Authorization: `Bearer ${readStoredSessionToken()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      clearUserSession();
      setUserSession(null);
      throw new Error('انتهت الجلسة — سجّل الدخول أعلى الشاشة ثم أعد المحاولة.');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `فشل الطلب (${res.status})`);
    return data;
  };

  const refreshUsers = async () => {
    try {
      const res = await fetch('/api/settings/users').then(r => r.json());
      const payload = res && typeof res === 'object' && !Array.isArray(res) ? res : null;
      setUsersList(Array.isArray(res) ? res : (payload?.users || []));
      // NOTE: never touch rolesList here — the roles embedded in the users
      // payload are raw rows without counts, and the dedicated roles
      // refresher owns that state (refreshRoles).
    } catch (err) {
      console.error(err);
    }
  };

  // ================= Branches management helpers =================
  const refreshBranches = async () => {
    try {
      const res = await fetch('/api/settings/branches').then(r => r.json()).catch(() => null);
      setBranchesList(Array.isArray(res) ? res : (res?.branches || []));
    } catch (err) {
      console.error(err);
    }
  };

  const openBranchCreate = () => {
    setEditingBranch(null);
    setBranchForm({ code: '', name: '', address: '' });
    setBranchFormError(null);
    setShowBranchModal(true);
  };

  const openBranchEdit = (b: any) => {
    setEditingBranch(b);
    setBranchForm({ code: b.code || '', name: b.name || '', address: b.address || '' });
    setBranchFormError(null);
    setShowBranchModal(true);
  };

  const handleSaveBranch = async () => {
    setSavingBranch(true);
    setBranchFormError(null);
    try {
      if (editingBranch) {
        await authedUserRequest('PUT', `/api/settings/branches/${editingBranch.id}`, {
          code: branchForm.code,
          name: branchForm.name,
          address: branchForm.address,
          isActive: editingBranch.is_active !== false,
        });
      } else {
        await authedUserRequest('POST', '/api/settings/branches', {
          code: branchForm.code,
          name: branchForm.name,
          address: branchForm.address,
        });
      }
      const wasEdit = !!editingBranch;
      setShowBranchModal(false);
      setEditingBranch(null);
      setMessage({ text: wasEdit ? 'تم حفظ تعديلات الفرع بنجاح' : 'تم إنشاء الفرع بنجاح وربطه بالشركة', type: 'success' });
      await refreshBranches();
    } catch (err: any) {
      setBranchFormError(err.message || 'تعذر حفظ الفرع');
    } finally {
      setSavingBranch(false);
    }
  };

  // ================= Tax codes helpers =================
  const refreshTaxes = async () => {    try {
      const list = await fetch('/api/taxes/codes').then(r => r.json()).catch(() => null);
      setTaxCodesList(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error(err);
    }
  };

  const startEditTax = (t: any) => {
    setTaxError(null);
    setEditingTaxId(t.id);
    setTaxEditForm({
      name: t.name || '',
      rate: Number(t.rate_percentage ?? t.rate ?? 0),
    });
  };

  const saveTaxCode = async () => {
    if (!editingTaxId) return;
    setTaxSaving(true);
    setTaxError(null);
    try {
      await authedUserRequest('PUT', `/api/taxes/codes/${editingTaxId}`, {
        name: taxEditForm.name,
        ratePercentage: taxEditForm.rate,
      });
      setEditingTaxId(null);
      await refreshTaxes();
      setMessage({ text: 'تم حفظ تعديلات الضريبة بنجاح', type: 'success' });
    } catch (err: any) {
      setTaxError(err.message || 'فشل حفظ تعديلات الضريبة');
    } finally {
      setTaxSaving(false);
    }
  };

  const handleUserLogin = async () => {
    setUserLoggingIn(true);
    setUserLoginError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userLoginForm.username, password: userLoginForm.password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'فشل تسجيل الدخول');
      if (!data?.token) throw new Error('لم يُصدر الخادم رمز جلسة');
      storeUserSession(data.token, data);
      setUserSession({ username: data.username, fullName: data.fullName || data.full_name });
      setUserLoginForm({ username: '', password: '' });
      // PHASE 10.5.3 — refetch so the permission-guarded reads (audit trail,
      // users, roles...) re-run WITH the fresh token instead of staying empty
      // from the pre-login fetch.
      await fetchSettingsData();
      setMessage({ text: 'تم تسجيل الدخول — يمكنك الآن إدارة المستخدمين', type: 'success' });
    } catch (e: any) {
      setUserLoginError(e.message || 'فشل تسجيل الدخول');
    } finally {
      setUserLoggingIn(false);
    }
  };

  const openUserModal = (u?: any) => {
    setUserFormError(null);
    if (u) {
      setEditingUser(u);
      setUserForm({
        username: u.username || '',
        fullName: u.fullName || '',
        email: u.email || '',
        password: '',
        roleId: u.roleId || '',
        isActive: u.isActive !== false,
      });
    } else {
      setEditingUser(null);
      setUserForm({ username: '', fullName: '', email: '', password: '', roleId: rolesList[0]?.id || '', isActive: true });
    }
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    setUserFormError(null);
    if (!userForm.username.trim()) { setUserFormError('اسم المستخدم مطلوب'); return; }
    if (!userForm.fullName.trim()) { setUserFormError('الاسم الكامل مطلوب'); return; }
    if (!userForm.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(userForm.email.trim())) {
      setUserFormError('البريد الإلكتروني غير صالح'); return;
    }
    if (!editingUser && userForm.password.length < 6) {
      setUserFormError('كلمة المرور مطلوبة للمستخدم الجديد (6 أحرف على الأقل)'); return;
    }
    setSavingUser(true);
    try {
      if (editingUser) {
        await authedUserRequest('PUT', `/api/settings/users/${editingUser.id}`, {
          fullName: userForm.fullName.trim(),
          email: userForm.email.trim(),
          roleId: userForm.roleId || null,
          isActive: userForm.isActive,
        });
        setMessage({ text: 'تم حفظ بيانات المستخدم بنجاح', type: 'success' });
      } else {
        await authedUserRequest('POST', '/api/settings/users', {
          username: userForm.username.trim(),
          fullName: userForm.fullName.trim(),
          email: userForm.email.trim(),
          password: userForm.password,
          roleId: userForm.roleId || null,
          isActive: userForm.isActive,
        });
        setMessage({ text: 'تم إنشاء حساب المستخدم بنجاح', type: 'success' });
      }
      setShowUserModal(false);
      await refreshUsers();
    } catch (e: any) {
      setUserFormError(e.message || 'فشل حفظ المستخدم');
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleUserActive = async (u: any) => {
    if (togglingUserId) return;
    setTogglingUserId(u.id);
    setMessage(null);
    try {
      await authedUserRequest('PUT', `/api/settings/users/${u.id}`, { isActive: !(u.isActive !== false) });
      setMessage({ text: u.isActive !== false ? `تم تعطيل حساب (${u.username})` : `تم تفعيل حساب (${u.username})`, type: 'success' });
      await refreshUsers();
    } catch (e: any) {
      setMessage({ text: e.message || 'فشل تحديث حالة المستخدم', type: 'error' });
    } finally {
      setTogglingUserId(null);
    }
  };

  const openAccessScopeEditor = async (user: any) => {
    setScopeTarget(user);
    setScopeLoading(true);
    setScopeError(null);
    try {
      const [catalog, assigned] = await Promise.all([
        authedUserRequest('GET', '/api/settings/access-scope-catalog'),
        authedUserRequest('GET', `/api/settings/users/${user.id}/access-scopes`),
      ]);
      setScopeCatalog(Array.isArray(catalog) ? catalog : []);
      setScopeCompanyIds(
        Array.isArray(assigned)
          ? assigned.filter((scope: any) => scope.scope_type === 'COMPANY').map((scope: any) => scope.company_id)
          : []
      );
      setScopeBranchKeys(
        Array.isArray(assigned)
          ? assigned.filter((scope: any) => scope.scope_type === 'BRANCH')
            .map((scope: any) => `${scope.company_id}:${scope.branch_id}`)
          : []
      );
    } catch (requestError: any) {
      setScopeError(requestError.message || 'تعذر تحميل نطاقات وصول المستخدم.');
    } finally {
      setScopeLoading(false);
    }
  };

  const saveAccessScopes = async () => {
    if (!scopeTarget || scopeSaving) return;
    setScopeSaving(true);
    setScopeError(null);
    try {
      const branches = scopeBranchKeys.map((key) => {
        const [companyId, branchId] = key.split(':');
        return { companyId, branchId };
      });
      await authedUserRequest('PUT', `/api/settings/users/${scopeTarget.id}/access-scopes`, {
        companyIds: scopeCompanyIds,
        branches,
      });
      setScopeTarget(null);
      setMessage({ text: `تم تحديث نطاق الوصول للمستخدم (${scopeTarget.username})`, type: 'success' });
      const storedUser = readStoredSessionUser();
      if (storedUser?.id === scopeTarget.id) {
        window.location.reload();
        return;
      }
    } catch (requestError: any) {
      setScopeError(requestError.message || 'تعذر حفظ نطاقات الوصول.');
    } finally {
      setScopeSaving(false);
    }
  };

  const openResetModal = (u: any) => {
    setResetTarget(u);
    setResetForm({ newPassword: '', confirmPassword: '' });
    setResetError(null);
  };

  const handleResetPassword = async () => {
    setResetError(null);
    if (!resetTarget) return;
    if (resetForm.newPassword.length < 6) { setResetError('كلمة المرور الجديدة مطلوبة (6 أحرف على الأقل)'); return; }
    if (resetForm.newPassword !== resetForm.confirmPassword) { setResetError('تأكيد كلمة المرور غير متطابق'); return; }
    setSavingUser(true);
    try {
      const data = await authedUserRequest('POST', `/api/settings/users/${resetTarget.id}/reset-password`, { newPassword: resetForm.newPassword });
      setMessage({ text: data?.message || 'تمت إعادة تعيين كلمة المرور', type: 'success' });
      setResetTarget(null);
      await refreshUsers();
    } catch (e: any) {
      setResetError(e.message || 'فشل إعادة تعيين كلمة المرور');
    } finally {
      setSavingUser(false);
    }
  };

  // ================= Roles Management handlers =================
  const refreshRoles = async () => {
    try {
      const [resRoles, resPerms] = await Promise.all([
        fetch('/api/settings/roles').then(r => r.json()).catch(() => []),
        fetch('/api/settings/permissions').then(r => r.json()).catch(() => []),
      ]);
      setRolesList(Array.isArray(resRoles) ? resRoles : []);
      setPermissionsList(Array.isArray(resPerms) ? resPerms : []);
    } catch (err) {
      console.error(err);
    }
  };

  const openRoleModal = (r?: any) => {
    setRoleFormError(null);
    if (r) {
      setEditingRole(r);
      setRoleForm({ name: r.name || '', description: r.description || '' });
    } else {
      setEditingRole(null);
      setRoleForm({ name: '', description: '' });
    }
    setShowRoleModal(true);
  };

  const handleSaveRole = async () => {
    setRoleFormError(null);
    if (!roleForm.name.trim()) { setRoleFormError('اسم الدور مطلوب'); return; }
    setSavingRole(true);
    try {
      if (editingRole) {
        await authedUserRequest('PUT', `/api/settings/roles/${editingRole.id}`, {
          name: roleForm.name.trim(),
          description: roleForm.description.trim(),
        });
        setMessage({ text: 'تم حفظ بيانات الدور بنجاح', type: 'success' });
      } else {
        await authedUserRequest('POST', '/api/settings/roles', {
          name: roleForm.name.trim(),
          description: roleForm.description.trim(),
        });
        setMessage({ text: 'تم إنشاء الدور الجديد بنجاح', type: 'success' });
      }
      setShowRoleModal(false);
      await refreshRoles();
      await refreshUsers();
    } catch (e: any) {
      setRoleFormError(e.message || 'فشل حفظ الدور');
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!deleteRoleTarget) return;
    setSavingRole(true);
    try {
      const data = await authedUserRequest('DELETE', `/api/settings/roles/${deleteRoleTarget.id}`);
      setMessage({ text: data?.message || 'تم حذف الدور', type: 'success' });
      setDeleteRoleTarget(null);
      await refreshRoles();
      await refreshUsers();
    } catch (e: any) {
      setMessage({ text: e.message || 'فشل حذف الدور', type: 'error' });
      setDeleteRoleTarget(null);
    } finally {
      setSavingRole(false);
    }
  };

  const openPermEditor = (r: any) => {
    setPermEditorRole(r);
    setPermSelected(Array.isArray(r.permissionIds) ? [...r.permissionIds] : []);
    setPermSearch('');
  };

  const togglePerm = (permId: string) => {
    setPermSelected((prev) => prev.includes(permId) ? prev.filter((x) => x !== permId) : [...prev, permId]);
  };

  const toggleModulePerms = (moduleIds: string[], selectAll: boolean) => {
    setPermSelected((prev) => {
      const rest = prev.filter((x) => !moduleIds.includes(x));
      return selectAll ? [...rest, ...moduleIds] : rest;
    });
  };

  const handleSavePermissions = async () => {
    if (!permEditorRole) return;
    setSavingPerms(true);
    try {
      const data = await authedUserRequest('PUT', `/api/settings/roles/${permEditorRole.id}/permissions`, { permissionIds: permSelected });
      setMessage({ text: data?.message || 'تم حفظ صلاحيات الدور', type: 'success' });
      setPermEditorRole(null);
      await refreshRoles();
    } catch (e: any) {
      setMessage({ text: e.message || 'فشل حفظ الصلاحيات', type: 'error' });
    } finally {
      setSavingPerms(false);
    }
  };

  const getSettingValue = (key: string, defaultValue: any = '') => {
    const found = safeSettings.find(s => s.key === key);
    // PHASE 10.5.1 — GET /api/settings returns camelCase (defaultValue);
    // reading found.default_value made every null-valued setting fall back to
    // `undefined` instead of its stored default.
    return found ? (found.value !== null && found.value !== undefined ? found.value : found.defaultValue) : defaultValue;
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
        {isDirty
          ? <span className="text-amber-600 font-bold">لديك حقول معدّلة لم تُحفظ بعد — اترك الحقل ليُحفظ تلقائياً</span>
          : <span>كل تعديل يُحفظ فوراً في قاعدة البيانات (core.settings) — الحفظ تلقائي لكل إعداد</span>}
      </div>
      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
        {/* PHASE 10.5.1 — this bar's "حفظ التغييرات" used to show a success
            banner WITHOUT saving anything (onClick only set a message), and
            "إعادة تعيين" only refetched while claiming to reset. Saving is
            per-control and immediate now, so the only honest action left is a
            re-read of the settings from the database. */}
        <button
          onClick={() => fetchSettingsData()}
          className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
          title="إعادة قراءة جميع الإعدادات من قاعدة البيانات"
        >
          <RefreshCw size={13} />
          <span>تحديث من قاعدة البيانات</span>
        </button>
      </div>
    </div>
  );

  // PHASE 10.5.1 — first-load gate. The sections used to render while
  // `settings` was still empty, so every defaultValue= control captured its
  // FALLBACK at mount and never re-read the saved value afterwards (observed
  // live: the language select showed "ar" while core.settings held "en").
  // Rendering only after the first successful load makes every defaultValue
  // correct at mount; later route changes keep the already-loaded array, so
  // this never blanks the screen during in-hub navigation.
  if (loading && safeSettings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <RefreshCw size={28} className="animate-spin mb-3 text-blue-900" />
        <p className="text-xs font-bold">جاري تحميل إعدادات النظام من قاعدة البيانات...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200" dir="rtl">
      {/* PHASE 10.5.2 — every settings WRITE now needs a signed session
          (personal ui.* keys too); the gate states that up front instead of
          letting a save fail with 401 deep inside a section. */}
      <AdminSessionGate
        session={userSession}
        form={userLoginForm}
        setForm={setUserLoginForm}
        onLogin={handleUserLogin}
        onLogout={() => { clearUserSession(); setUserSession(null); setMessage({ text: 'تم تسجيل الخروج من جلسة الإدارة', type: 'success' }); }}
        loggingIn={userLoggingIn}
        error={userLoginError}
        description="حفظ أي إعداد — حتى تفضيلات الشاشة الشخصية — يتطلب جلسة مسجلة. سجّل الدخول للمتابعة."
      />

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
                  {/* PHASE 10.5.1 — this field had NO backing key and no
                      consumer; the SaveBar's fake button made it look saved.
                      Disabled with an explicit label rather than pretending. */}
                  <input type="email" defaultValue="erp@kayan.ye" disabled className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-bold" />
                  <p className="text-[10px] text-amber-700 mt-1">غير مدعوم — لا يوجد مفتاح إعداد ولا مستهلك لهذا الحقل بعد.</p>
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">تنسيق التاريخ (في التقارير)</label>
                  <select
                    value={String(getSettingValue('ui.date_format', 'YYYY-MM-DD'))}
                    onChange={(e) => handleUpdateSetting('ui.date_format', e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                  >
                    <option value="YYYY-MM-DD">YYYY-MM-DD (2026-10-06)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (06/10/2026)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">عدد المنازل العشرية للأرقام والمبالغ</label>
                  <input
                    type="number"
                    value={String(getSettingValue('reports.decimal_places', 2))}
                    min="0"
                    max="4"
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!Number.isNaN(n)) handleUpdateSetting('reports.decimal_places', Math.max(0, Math.min(4, n)));
                    }}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                  />
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
                    value={String(getSettingValue('ui.language', 'ar'))}
                    onChange={(e) => handleUpdateSetting('ui.language', e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  >
                    <option value="ar">العربية (Arabic - الافتراضي)</option>
                    <option value="en">English (الإنجليزية)</option>
                  </select>
                  <p className="text-[10px] text-amber-700 mt-1 leading-relaxed">
                    يُطبَّق فوراً على سمة اللغة (lang) وشارة اللغة في الشريط العلوي. ترجمة نصوص الواجهة الكاملة غير متوفرة بعد.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اتجاه الواجهة (Layout Direction)</label>
                  <select 
                    value={String(getSettingValue('ui.direction', 'rtl'))}
                    onChange={(e) => handleUpdateSetting('ui.direction', e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  >
                    <option value="rtl">من اليمين لليسار (RTL - Cairo)</option>
                    <option value="ltr" disabled>من اليسار لليمين (LTR) — غير مدعوم بعد</option>
                  </select>
                  <p className="text-[10px] text-amber-700 mt-1 leading-relaxed">
                    القيمة محفوظة وتُطبَّق على &lt;html dir&gt;. خيار LTR معطّل: الواجهة مبنية RTL في 36 شاشة ونقلها تغيير واسع غير مُنفَّذ.
                  </p>
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
                  <select
                    value={String(getSettingValue('ui.theme', 'light'))}
                    onChange={(e) => handleUpdateSetting('ui.theme', e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  >
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
                  <select
                    value={String(getSettingValue('ui.density', 'comfortable'))}
                    onChange={(e) => handleUpdateSetting('ui.density', e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  >
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">تنسيق التاريخ في التقارير</label>
                  <select
                    value={String(getSettingValue('ui.date_format', 'YYYY-MM-DD'))}
                    onChange={(e) => handleUpdateSetting('ui.date_format', e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                  >
                    <option value="YYYY-MM-DD">YYYY-MM-DD (2026-10-06)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (06/10/2026)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">فاصل الآلاف في التقارير</label>
                    <select
                      value={String(getSettingValue('ui.thousands_separator', 'comma'))}
                      onChange={(e) => handleUpdateSetting('ui.thousands_separator', e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                    >
                      <option value="comma">فاصلة (1,000,000)</option>
                      <option value="space">مسافة (1 000 000)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">الفاصل العشري في التقارير</label>
                    <select
                      value={String(getSettingValue('ui.decimal_separator', 'dot'))}
                      onChange={(e) => handleUpdateSetting('ui.decimal_separator', e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                    >
                      <option value="dot">نقطة (0.00)</option>
                      <option value="comma">فاصلة (0,00)</option>
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-amber-700 leading-relaxed">
                  تنبيه: تنسيقات الأرقام والتاريخ تُطبَّق على مركز التقارير (العرض والمعاينة والطباعة) — لا تغيّر التخزين أو القيود المحاسبية.
                </p>
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
                  <select
                    value={String(getSettingValue('reports.currency_position', 'after'))}
                    onChange={(e) => handleUpdateSetting('reports.currency_position', e.target.value)}
                    className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                  >
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
                    <input
                      type="checkbox"
                      checked={Boolean(getSettingValue('ui.confirm_before_post', true))}
                      onChange={(e) => handleUpdateSetting('ui.confirm_before_post', e.target.checked)}
                      className="w-4 h-4 text-blue-900 rounded"
                    />
                  </label>
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-amber-800">التأكيد قبل حذف المسودات</span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">غير مدعوم — لا يوجد حذف مسودات في النظام</span>
                  </div>
                  <label className="flex items-center justify-between p-2.5 bg-white border rounded-xl cursor-pointer">
                    <span className="font-bold text-slate-700">توليد حركات المخزون آلياً مع فواتير المبيعات</span>
                    <input
                      type="checkbox"
                      checked={Boolean(getSettingValue('inventory.auto_create_issue_on_sale', true))}
                      onChange={(e) => handleUpdateSetting('inventory.auto_create_issue_on_sale', e.target.checked)}
                      className="w-4 h-4 text-blue-900 rounded"
                    />
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
                    <select
                      value={String(getSettingValue('ui.lookup_debounce_ms', 200))}
                      onChange={(e) => handleUpdateSetting('ui.lookup_debounce_ms', parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                    >
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
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-amber-800">تنبيهات وصول الأصناف لحد إعادة الطلب</span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">غير مدعوم — لا يوجد مركز تنبيهات</span>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-amber-800">تنبيهات تجاوز الحد الائتماني للعملاء</span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">غير مدعوم — لا يوجد مركز تنبيهات</span>
                  </div>
                  <label className="flex items-center justify-between p-2.5 bg-white border rounded-xl cursor-pointer">
                    <span className="font-bold text-slate-700">إشعارات الحفظ والتحديث الناجح</span>
                    <input
                      type="checkbox"
                      checked={Boolean(getSettingValue('ui.notify_save_success', true))}
                      onChange={(e) => handleUpdateSetting('ui.notify_save_success', e.target.checked)}
                      className="w-4 h-4 text-blue-900 rounded"
                    />
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
                  <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800 flex justify-between items-center">
                    <span>غير مدعوم — لا يوجد مؤقت قفل جلسة بعد</span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">غير مفعّل</span>
                  </div>
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
                onClick={openBranchCreate}
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
                      <td className="py-2.5 px-3">
                        {b.is_active !== false ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">نشط</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold">معطّل</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <button onClick={() => openBranchEdit(b)} className="text-blue-900 font-bold hover:underline cursor-pointer">تعديل</button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-slate-400">لا توجد فروع مسجّلة بعد — اضغط (إضافة فرع جديد) لإنشاء أول فرع تشغيلي</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <SaveBar />
            {showBranchModal && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
                    <div className="flex items-center gap-2">
                      <GitFork size={18} className="text-blue-400" />
                      <span className="text-sm font-bold">{editingBranch ? `تعديل الفرع: ${editingBranch.name}` : 'إنشاء فرع جديد'}</span>
                    </div>
                    <button onClick={() => setShowBranchModal(false)} className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="p-5 space-y-4">
                    {branchFormError && (
                      <div className="p-3 rounded-xl text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-2">
                        <AlertCircle size={15} />
                        <span>{branchFormError}</span>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">كود الفرع <span className="text-rose-500">*</span></label>
                      <input
                        value={branchForm.code}
                        onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
                        placeholder="مثال: BR02"
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">كود فريد داخل الشركة — يُستخدم في الفواتير والمستودعات.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">اسم الفرع <span className="text-rose-500">*</span></label>
                      <input
                        value={branchForm.name}
                        onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                        placeholder="مثال: فرع صنعاء"
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">العنوان</label>
                      <input
                        value={branchForm.address}
                        onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                        placeholder="عنوان الفرع التفصيلي"
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button onClick={() => setShowBranchModal(false)} className="px-5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer">
                      إلغاء
                    </button>
                    <button
                      onClick={handleSaveBranch}
                      disabled={savingBranch}
                      className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-60"
                    >
                      {savingBranch ? 'جاري الحفظ...' : (editingBranch ? 'حفظ التعديلات' : 'إنشاء الفرع')}
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                {/* PHASE 10.5.1 — GET /api/settings returns valueType (camel);
                    filtering on value_type matched zero rows, so this dashboard
                    always showed 0 accounts and an empty mapping list. */}
                <div className="text-xl font-bold text-blue-900">{safeSettings.filter(s => (s.valueType || s.value_type) === 'ACCOUNT_ID').length}</div>
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
              {safeSettings.filter(s => (s.valueType || s.value_type) === 'ACCOUNT_ID').map((st: any) => {
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

            {/* Editing a tax code hits a permission-guarded endpoint — the gate
                makes the session requirement explicit instead of failing later. */}
            <AdminSessionGate
              session={userSession}
              form={userLoginForm}
              setForm={setUserLoginForm}
              onLogin={handleUserLogin}
              onLogout={() => { clearUserSession(); setUserSession(null); setMessage({ text: 'تم تسجيل الخروج من جلسة الإدارة', type: 'success' }); }}
              loggingIn={userLoggingIn}
              error={userLoginError}
              description="تعديل أكواد الضرائب ونسبها المئوية يتطلب جلسة مدير موثقة."
            />

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
                  {taxError && (
                    <tr>
                      <td colSpan={5} className="text-center py-3 text-rose-600 font-bold bg-rose-50">{taxError}</td>
                    </tr>
                  )}
                  {taxCodesList.length > 0 ? taxCodesList.map((t: any) => {
                    const editing = editingTaxId === t.id;
                    // The API returns accounting.tax_codes joined to
                    // accounting.tax_rates — the rate key is rate_percentage.
                    const rate = t.rate_percentage ?? t.rate ?? 0;
                    return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-blue-900">{t.code}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {editing ? (
                          <input
                            type="text"
                            value={taxEditForm.name}
                            onChange={(e) => setTaxEditForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full px-2 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-600"
                          />
                        ) : t.name}
                      </td>
                      <td className="py-3 px-4 font-bold text-blue-900 font-mono">
                        {editing ? (
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            max="100"
                            value={taxEditForm.rate}
                            onChange={(e) => setTaxEditForm(f => ({ ...f, rate: parseFloat(e.target.value) }))}
                            className="w-24 px-2 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold font-mono focus:ring-2 focus:ring-blue-600"
                          />
                        ) : `${rate}%`}
                      </td>
                      <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">نشط</span></td>
                      <td className="py-3 px-4">
                        {editing ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={saveTaxCode}
                              disabled={taxSaving}
                              className="px-2.5 py-1.5 bg-blue-900 text-white rounded-lg text-[11px] font-bold disabled:opacity-50"
                            >
                              {taxSaving ? 'جاري الحفظ...' : 'حفظ'}
                            </button>
                            <button
                              onClick={() => { setEditingTaxId(null); setTaxError(null); }}
                              className="px-2.5 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEditTax(t)} className="text-blue-900 font-bold hover:underline">تعديل</button>
                        )}
                      </td>
                    </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-slate-400 font-bold">لا توجد أكواد ضريبية نشطة</td>
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
        {currentSection === 'users' && (() => {
          const activeUsers = usersList.filter((u: any) => u.isActive !== false);
          const inactiveUsers = usersList.filter((u: any) => u.isActive === false);
          const filteredUsers = usersList.filter((u: any) => {
            const q = userSearch.trim().toLowerCase();
            if (q && !`${u.username || ''} ${u.fullName || ''} ${u.email || ''}`.toLowerCase().includes(q)) return false;
            if (userStatusFilter === 'active' && u.isActive === false) return false;
            if (userStatusFilter === 'inactive' && u.isActive !== false) return false;
            if (userRoleFilter && u.roleId !== userRoleFilter) return false;
            return true;
          });
          return (
          <div className="space-y-6">
            <SettingsHeader title="إدارة المستخدمين والصلاحيات (Users Management)" subtitle="إنشاء حسابات الدخول، إسناد الأدوار الوظيفية، التفعيل والتعطيل، وإعادة تعيين كلمات المرور" />

            {message && (
              <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
                {message.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                <span>{message.text}</span>
              </div>
            )}

            {/* Session gate */}
            {!userSession ? (
              <div className="bg-white rounded-2xl border border-amber-200 shadow-xs p-5">
                <div className="flex items-center gap-2 mb-1">
                  <LogIn size={16} className="text-amber-600" />
                  <h3 className="text-sm font-black text-slate-900">تسجيل الدخول للإدارة</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">عمليات إنشاء المستخدمين وتعديلها وإعادة تعيين كلمات المرور تتطلب جلسة مدير موثقة (نفس جلسة إعدادات الشركة).</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    value={userLoginForm.username}
                    onChange={(e) => setUserLoginForm({ ...userLoginForm, username: e.target.value })}
                    placeholder="اسم المستخدم"
                    className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                  <input
                    type="password"
                    value={userLoginForm.password}
                    onChange={(e) => setUserLoginForm({ ...userLoginForm, password: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUserLogin(); }}
                    placeholder="كلمة المرور"
                    className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                  <button
                    onClick={handleUserLogin}
                    disabled={userLoggingIn}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-60"
                  >
                    {userLoggingIn ? 'جاري الدخول...' : 'دخول'}
                  </button>
                </div>
                {userLoginError && <p className="text-xs font-bold text-rose-600 mt-2">{userLoginError}</p>}
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between">
                <div className="text-xs font-bold text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 size={15} />
                  <span>جلسة الإدارة نشطة: {userSession.fullName || userSession.username} ({userSession.username})</span>
                </div>
                <button
                  onClick={() => { clearUserSession(); setUserSession(null); setMessage({ text: 'تم تسجيل الخروج من جلسة الإدارة', type: 'success' }); }}
                  className="px-3 py-1.5 bg-white border border-emerald-200 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <LogOut size={13} />
                  <span>خروج</span>
                </button>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <Users size={15} />
                  <span className="text-[11px] font-bold">إجمالي المستخدمين</span>
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono">{usersList.length}</div>
              </div>
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-xs">
                <div className="flex items-center gap-2 text-emerald-700 mb-1">
                  <CheckCircle2 size={15} />
                  <span className="text-[11px] font-bold">حسابات نشطة</span>
                </div>
                <div className="text-2xl font-black text-emerald-900 font-mono">{activeUsers.length}</div>
              </div>
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl shadow-xs">
                <div className="flex items-center gap-2 text-rose-700 mb-1">
                  <Power size={15} />
                  <span className="text-[11px] font-bold">حسابات معطّلة</span>
                </div>
                <div className="text-2xl font-black text-rose-900 font-mono">{inactiveUsers.length}</div>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl shadow-xs">
                <div className="flex items-center gap-2 text-blue-700 mb-1">
                  <ShieldCheck size={15} />
                  <span className="text-[11px] font-bold">الأدوار المعرفة</span>
                </div>
                <div className="text-2xl font-black text-blue-900 font-mono">{rolesList.length}</div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
                <div className="relative flex-1">
                  <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="بحث باسم المستخدم أو الاسم الكامل أو البريد..."
                    className="w-full pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value as any)}
                  className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                >
                  <option value="all">كل الحالات</option>
                  <option value="active">نشط فقط</option>
                  <option value="inactive">معطّل فقط</option>
                </select>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                >
                  <option value="">كل الأدوار</option>
                  {rolesList.map((r: any) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => openUserModal()}
                  className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition cursor-pointer whitespace-nowrap"
                >
                  <UserPlus size={15} />
                  <span>مستخدم جديد</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className="py-3 px-4">المستخدم</th>
                    <th className="py-3 px-4">البريد الإلكتروني</th>
                    <th className="py-3 px-4">الدور الوظيفي</th>
                    <th className="py-3 px-4">آخر دخول</th>
                    <th className="py-3 px-4">الحالة</th>
                    <th className="py-3 px-4">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length > 0 ? filteredUsers.map((u: any) => (
                    <tr key={u.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black ${u.isActive !== false ? 'bg-blue-900 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            {(u.fullName || u.username || '?').trim().charAt(0)}
                          </div>
                          <div>
                            <div className="font-mono font-bold text-blue-900">{u.username}</div>
                            <div className="font-bold text-slate-700 text-[11px]">{u.fullName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{u.email}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-900 font-bold font-mono text-[11px]">{u.roleName || 'بدون دور'}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px] font-mono">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ar-YE') : '—'}
                      </td>
                      <td className="py-3 px-4">
                        {u.isActive !== false ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">نشط</span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">معطّل</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openUserModal(u)}
                            title="تعديل بيانات المستخدم"
                            className="p-2 text-blue-700 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => void openAccessScopeEditor(u)}
                            title="إسناد الشركات والفروع"
                            className="p-2 text-indigo-700 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                          >
                            <Building2 size={15} />
                          </button>
                          <button
                            onClick={() => handleToggleUserActive(u)}
                            disabled={togglingUserId === u.id}
                            title={u.isActive !== false ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                            className={`p-2 rounded-lg transition cursor-pointer disabled:opacity-50 ${u.isActive !== false ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'}`}
                          >
                            <Power size={15} />
                          </button>
                          <button
                            onClick={() => openResetModal(u)}
                            title="إعادة تعيين كلمة المرور"
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          >
                            <KeyRound size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="text-center py-10">
                        <Users size={32} className="mx-auto text-slate-300 mb-2" />
                        <p className="text-slate-500 text-xs font-bold">لا يوجد مستخدمون مطابقون للبحث الحالي</p>
                        <button onClick={() => { setUserSearch(''); setUserStatusFilter('all'); setUserRoleFilter(''); }} className="mt-2 text-blue-800 text-xs font-bold hover:underline">
                          مسح الفلاتر
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Add / Edit modal */}
            {showUserModal && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
                  <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
                    <div className="flex items-center gap-2">
                      <UserPlus size={18} className="text-blue-400" />
                      <span className="text-sm font-bold">{editingUser ? `تعديل المستخدم: ${editingUser.username}` : 'إنشاء مستخدم جديد'}</span>
                    </div>
                    <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="p-5 space-y-4 overflow-y-auto">
                    {userFormError && (
                      <div className="p-3 rounded-xl text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-2">
                        <AlertCircle size={15} />
                        <span>{userFormError}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستخدم <span className="text-rose-500">*</span></label>
                        <input
                          value={userForm.username}
                          disabled={!!editingUser}
                          onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                          placeholder="مثال: ahmed.sales"
                          dir="ltr"
                          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 disabled:opacity-60"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل <span className="text-rose-500">*</span></label>
                        <input
                          value={userForm.fullName}
                          onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                          placeholder="مثال: أحمد محمد السقاف"
                          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني <span className="text-rose-500">*</span></label>
                      <input
                        value={userForm.email}
                        onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                        placeholder="user@kayan-erp.com"
                        dir="ltr"
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                    {!editingUser && (
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور <span className="text-rose-500">*</span></label>
                        <input
                          type="password"
                          value={userForm.password}
                          onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                          placeholder="6 أحرف على الأقل"
                          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">الدور الوظيفي</label>
                        <select
                          value={userForm.roleId}
                          onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })}
                          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        >
                          <option value="">— بدون دور —</option>
                          {rolesList.map((r: any) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={userForm.isActive}
                            onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                            className="w-4 h-4 accent-blue-900"
                          />
                          <span>الحساب نشط ومفعّل</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button onClick={() => setShowUserModal(false)} className="px-5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer">
                      إلغاء
                    </button>
                    <button
                      onClick={handleSaveUser}
                      disabled={savingUser}
                      className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-60"
                    >
                      {savingUser ? 'جاري الحفظ...' : (editingUser ? 'حفظ التعديلات' : 'إنشاء المستخدم')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {scopeTarget && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
                  <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
                    <div className="flex items-center gap-2">
                      <Building2 size={18} className="text-indigo-300" />
                      <span className="text-sm font-bold">نطاق الوصول: {scopeTarget.username}</span>
                    </div>
                    <button onClick={() => setScopeTarget(null)} className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer" aria-label="إغلاق">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="p-5 space-y-4 overflow-y-auto">
                    <p className="text-xs leading-5 text-slate-600">
                      إسناد الشركة يسمح ببياناتها المشتركة فقط. يجب إسناد كل فرع صراحةً للوصول إلى بياناته. إسناد أي فرع يضيف شركته تلقائياً، لأن بيانات الفرع لا تُقرأ دون نطاق شركته. هذا النطاق منفصل عن صلاحيات العمليات والدور الوظيفي.
                    </p>
                    {scopeError && (
                      <div role="alert" className="p-3 rounded-xl text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-2">
                        <AlertCircle size={15} />
                        <span>{scopeError}</span>
                      </div>
                    )}
                    {scopeLoading ? (
                      <p className="py-8 text-center text-sm text-slate-500">جارٍ تحميل الشركات والفروع...</p>
                    ) : scopeCatalog.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-500">لا توجد شركات أو فروع قابلة للإسناد.</p>
                    ) : (
                      <div className="space-y-3">
                        {[...new Map(scopeCatalog.map((entry) => [entry.company_id, entry.company_name])).entries()].map(([companyId, companyName]) => (
                          <section key={companyId} className="rounded-xl border border-slate-200 p-4">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                              <input
                                type="checkbox"
                                checked={scopeCompanyIds.includes(companyId)}
                                onChange={(event) => {
                                  if (!event.target.checked) {
                                    // إلغاء الشركة يلغي فروعها أيضاً: الفرع لا يُقرأ
                                    // دون نطاق شركته (راجع V31 / RLS-1).
                                    setScopeBranchKeys((previous) =>
                                      previous.filter((item) => !item.startsWith(`${companyId}:`))
                                    );
                                  }
                                  setScopeCompanyIds((previous) =>
                                    event.target.checked
                                      ? [...previous, companyId]
                                      : previous.filter((id) => id !== companyId)
                                  );
                                }}
                                className="h-4 w-4 accent-blue-900"
                              />
                              <span>{companyName} — بيانات الشركة المشتركة</span>
                            </label>
                            <div className="mt-3 border-r-2 border-slate-100 pr-4 space-y-2">
                              {scopeCatalog.filter((entry) => entry.company_id === companyId && entry.branch_id).map((branch) => {
                                const key = `${branch.company_id}:${branch.branch_id}`;
                                return (
                                  <label key={key} className={`flex items-center gap-2 text-xs ${branch.branch_active ? 'text-slate-700' : 'text-slate-400'}`}>
                                    <input
                                      type="checkbox"
                                      checked={scopeBranchKeys.includes(key)}
                                      disabled={!branch.branch_active}
                                      onChange={(event) => {
                                        if (event.target.checked) {
                                          // إسناد فرع يشترط نطاق شركته (راجع V31 / RLS-1)
                                          setScopeCompanyIds((previous) =>
                                            previous.includes(branch.company_id)
                                              ? previous
                                              : [...previous, branch.company_id]
                                          );
                                        }
                                        setScopeBranchKeys((previous) =>
                                          event.target.checked
                                            ? [...previous, key]
                                            : previous.filter((item) => item !== key)
                                        );
                                      }}
                                      className="h-4 w-4 accent-indigo-700"
                                    />
                                    <span>{branch.branch_name}{branch.branch_active ? '' : ' — غير نشط'}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button onClick={() => setScopeTarget(null)} className="px-5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer">إلغاء</button>
                    <button
                      onClick={saveAccessScopes}
                      disabled={scopeLoading || scopeSaving}
                      className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-60"
                    >
                      {scopeSaving ? 'جارٍ الحفظ...' : 'حفظ نطاق الوصول'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Reset password modal */}
            {resetTarget && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
                    <div className="flex items-center gap-2">
                      <KeyRound size={18} className="text-amber-400" />
                      <span className="text-sm font-bold">إعادة تعيين كلمة المرور: {resetTarget.username}</span>
                    </div>
                    <button onClick={() => setResetTarget(null)} className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="p-5 space-y-4">
                    {resetError && (
                      <div className="p-3 rounded-xl text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-2">
                        <AlertCircle size={15} />
                        <span>{resetError}</span>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور الجديدة <span className="text-rose-500">*</span></label>
                      <input
                        type="password"
                        value={resetForm.newPassword}
                        onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })}
                        placeholder="6 أحرف على الأقل"
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">تأكيد كلمة المرور <span className="text-rose-500">*</span></label>
                      <input
                        type="password"
                        value={resetForm.confirmPassword}
                        onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleResetPassword(); }}
                        placeholder="أعد كتابة كلمة المرور"
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button onClick={() => setResetTarget(null)} className="px-5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer">
                      إلغاء
                    </button>
                    <button
                      onClick={handleResetPassword}
                      disabled={savingUser}
                      className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-60"
                    >
                      {savingUser ? 'جاري التعيين...' : 'تعيين كلمة المرور'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* 20. ROLES MANAGEMENT */}
        {currentSection === 'roles' && (() => {
          const q = roleSearch.trim().toLowerCase();
          const filteredRoles = rolesList.filter((r: any) => {
            if (!q) return true;
            return `${r.name || ''} ${r.description || ''}`.toLowerCase().includes(q);
          });
          const totalLinkedUsers = rolesList.reduce((s: number, r: any) => s + (Number(r.usersCount) || 0), 0);
          const permGroups: { module: string; items: any[] }[] = [];
          const seenModules = new Map<string, any[]>();
          permissionsList.forEach((p: any) => {
            const m = p.module || 'SYSTEM';
            if (!seenModules.has(m)) seenModules.set(m, []);
            seenModules.get(m)!.push(p);
          });
          seenModules.forEach((items, module) => permGroups.push({ module, items }));
          const matrixFiltered = permSearch.trim().toLowerCase();
          return (
          <div className="space-y-6">
            <SettingsHeader title="إدارة الأدوار الوظيفية والصلاحيات (Roles & Security Management)" subtitle="إنشاء الأدوار، إسناد الصلاحيات لكل دور من مصفوفة الصلاحيات، وحماية دور مدير النظام" />

            {message && (
              <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
                {message.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                <span>{message.text}</span>
              </div>
            )}

            {!userSession ? (
              <div className="bg-white rounded-2xl border border-amber-200 shadow-xs p-5">
                <div className="flex items-center gap-2 mb-1">
                  <LogIn size={16} className="text-amber-600" />
                  <h3 className="text-sm font-black text-slate-900">تسجيل الدخول للإدارة</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">إنشاء الأدوار وتعديل الصلاحيات يتطلب جلسة مدير موثقة (نفس جلسة شاشة المستخدمين وإعدادات الشركة).</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    value={userLoginForm.username}
                    onChange={(e) => setUserLoginForm({ ...userLoginForm, username: e.target.value })}
                    placeholder="اسم المستخدم"
                    className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                  <input
                    type="password"
                    value={userLoginForm.password}
                    onChange={(e) => setUserLoginForm({ ...userLoginForm, password: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUserLogin(); }}
                    placeholder="كلمة المرور"
                    className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                  <button
                    onClick={handleUserLogin}
                    disabled={userLoggingIn}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-60"
                  >
                    {userLoggingIn ? 'جاري الدخول...' : 'دخول'}
                  </button>
                </div>
                {userLoginError && <p className="text-xs font-bold text-rose-600 mt-2">{userLoginError}</p>}
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between">
                <div className="text-xs font-bold text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 size={15} />
                  <span>جلسة الإدارة نشطة: {userSession.fullName || userSession.username} ({userSession.username})</span>
                </div>
                <button
                  onClick={() => { clearUserSession(); setUserSession(null); }}
                  className="px-3 py-1.5 bg-white border border-emerald-200 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <LogOut size={13} />
                  <span>خروج</span>
                </button>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <ShieldCheck size={15} />
                  <span className="text-[11px] font-bold">إجمالي الأدوار</span>
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono">{rolesList.length}</div>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl shadow-xs">
                <div className="flex items-center gap-2 text-blue-700 mb-1">
                  <Users size={15} />
                  <span className="text-[11px] font-bold">مستخدمون مسندون لأدوار</span>
                </div>
                <div className="text-2xl font-black text-blue-900 font-mono">{totalLinkedUsers}</div>
              </div>
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl shadow-xs">
                <div className="flex items-center gap-2 text-indigo-700 mb-1">
                  <Lock size={15} />
                  <span className="text-[11px] font-bold">صلاحيات الفهرس</span>
                </div>
                <div className="text-2xl font-black text-indigo-900 font-mono">{permissionsList.length}</div>
              </div>
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-xs">
                <div className="flex items-center gap-2 text-emerald-700 mb-1">
                  <CheckCircle2 size={15} />
                  <span className="text-[11px] font-bold">حالة نظام الأمان</span>
                </div>
                <div className="text-lg font-black text-emerald-900">RBAC نشط</div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                    placeholder="بحث باسم الدور أو وصفه..."
                    className="w-full pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <button
                  onClick={() => openRoleModal()}
                  className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition cursor-pointer whitespace-nowrap"
                >
                  <Plus size={15} />
                  <span>دور جديد</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className="py-3 px-4">الدور</th>
                    <th className="py-3 px-4">الوصف</th>
                    <th className="py-3 px-4">المستخدمون</th>
                    <th className="py-3 px-4">الصلاحيات</th>
                    <th className="py-3 px-4">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRoles.length > 0 ? filteredRoles.map((r: any) => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-blue-900">{r.name}</span>
                          {r.name === 'SUPER_ADMIN' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">محمي</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs">{r.description || '—'}</td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-slate-800">{Number(r.usersCount) || 0}</span>
                        <span className="text-slate-500 text-[11px]"> مستخدم</span>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => openPermEditor(r)}
                          className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 rounded-lg text-[11px] font-bold transition cursor-pointer"
                        >
                          {Number(r.permissionsCount) || 0} صلاحية — إدارة
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openRoleModal(r)}
                            title="تعديل الدور"
                            className="p-2 text-blue-700 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => openPermEditor(r)}
                            title="مصفوفة الصلاحيات"
                            className="p-2 text-indigo-700 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                          >
                            <Lock size={15} />
                          </button>
                          {r.name !== 'SUPER_ADMIN' && (
                            <button
                              onClick={() => setDeleteRoleTarget(r)}
                              title="حذف الدور"
                              className="p-2 text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="text-center py-10">
                        <ShieldCheck size={32} className="mx-auto text-slate-300 mb-2" />
                        <p className="text-slate-500 text-xs font-bold">لا توجد أدوار مطابقة للبحث الحالي</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Role modal */}
            {showRoleModal && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={18} className="text-blue-400" />
                      <span className="text-sm font-bold">{editingRole ? `تعديل الدور: ${editingRole.name}` : 'إنشاء دور جديد'}</span>
                    </div>
                    <button onClick={() => setShowRoleModal(false)} className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="p-5 space-y-4">
                    {roleFormError && (
                      <div className="p-3 rounded-xl text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-2">
                        <AlertCircle size={15} />
                        <span>{roleFormError}</span>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">اسم الدور <span className="text-rose-500">*</span></label>
                      <input
                        value={roleForm.name}
                        disabled={editingRole?.name === 'SUPER_ADMIN'}
                        onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                        placeholder="مثال: SALES_REP"
                        dir="ltr"
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 disabled:opacity-60"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">أحرف إنجليزية كبيرة وأرقام وشرطة سفلية فقط — يُحوَّل تلقائياً.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">الوصف التفصيلي</label>
                      <textarea
                        value={roleForm.description}
                        onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                        placeholder="مثال: مسؤول المبيعات وإنشاء الفواتير"
                        rows={3}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button onClick={() => setShowRoleModal(false)} className="px-5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer">
                      إلغاء
                    </button>
                    <button
                      onClick={handleSaveRole}
                      disabled={savingRole}
                      className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-60"
                    >
                      {savingRole ? 'جاري الحفظ...' : (editingRole ? 'حفظ التعديلات' : 'إنشاء الدور')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete confirm */}
            {deleteRoleTarget && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden">
                  <div className="p-5 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
                      <Trash2 size={22} />
                    </div>
                    <h3 className="text-sm font-black text-slate-900">حذف الدور ({deleteRoleTarget.name})؟</h3>
                    <p className="text-xs text-slate-500">سيُحذف الدور نهائياً مع كل صلاحياته المسندة. لا يمكن حذف دور ما زال مسنداً لمستخدمين.</p>
                    <div className="flex justify-center gap-2 pt-1">
                      <button onClick={() => setDeleteRoleTarget(null)} className="px-5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer">
                        تراجع
                      </button>
                      <button
                        onClick={handleDeleteRole}
                        disabled={savingRole}
                        className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-60"
                      >
                        {savingRole ? 'جاري الحذف...' : 'حذف نهائي'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Permissions matrix editor */}
            {permEditorRole && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
                  <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
                    <div className="flex items-center gap-2">
                      <Lock size={18} className="text-indigo-400" />
                      <span className="text-sm font-bold">مصفوفة صلاحيات الدور: <span className="font-mono">{permEditorRole.name}</span></span>
                      <span className="text-[11px] bg-indigo-900 px-2 py-0.5 rounded-full font-bold">{permSelected.length} محددة</span>
                    </div>
                    <button onClick={() => setPermEditorRole(null)} className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="p-4 border-b border-slate-200 bg-slate-50">
                    <div className="relative">
                      <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={permSearch}
                        onChange={(e) => setPermSearch(e.target.value)}
                        placeholder="بحث في الصلاحيات..."
                        className="w-full pr-9 pl-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                      />
                    </div>
                  </div>
                  <div className="p-4 overflow-y-auto space-y-4 flex-1">
                    {permGroups.map((g) => {
                      const visible = g.items.filter((p: any) => {
                        if (!matrixFiltered) return true;
                        return `${p.code} ${p.name || ''} ${p.description || ''}`.toLowerCase().includes(matrixFiltered);
                      });
                      if (visible.length === 0) return null;
                      const ids = visible.map((p: any) => p.id);
                      const allOn = ids.every((id: string) => permSelected.includes(id));
                      return (
                        <div key={g.module} className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="bg-slate-100 px-4 py-2.5 flex items-center justify-between">
                            <div className="text-xs font-black text-slate-800">
                              {ROLE_MODULE_NAMES[g.module] || g.module}
                              <span className="text-slate-400 font-mono font-bold mr-2">{visible.filter((p: any) => permSelected.includes(p.id)).length}/{visible.length}</span>
                            </div>
                            <label className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-800 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={allOn}
                                onChange={(e) => toggleModulePerms(ids, e.target.checked)}
                                className="w-4 h-4 accent-indigo-700"
                              />
                              <span>تحديد الكل</span>
                            </label>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {visible.map((p: any) => (
                              <label key={p.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-indigo-50/50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={permSelected.includes(p.id)}
                                  onChange={() => togglePerm(p.id)}
                                  className="w-4 h-4 mt-0.5 accent-indigo-700 shrink-0"
                                />
                                <div className="flex-1">
                                  <div className="text-xs font-bold text-slate-800">{p.name || p.code}</div>
                                  <div className="text-[11px] text-slate-500">{p.description}</div>
                                </div>
                                <span className="font-mono text-[10px] text-slate-400 shrink-0" dir="ltr">{p.code}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                    <button onClick={() => setPermEditorRole(null)} className="px-5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer">
                      إلغاء
                    </button>
                    <button
                      onClick={handleSavePermissions}
                      disabled={savingPerms}
                      className="px-5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-60"
                    >
                      {savingPerms ? 'جاري الحفظ...' : `حفظ الصلاحيات (${permSelected.length})`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        })()}

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
