import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BRANCH_SCOPE_KEY,
  COMPANY_SCOPE_KEY,
  clearSession,
  readSessionToken,
  saveSession,
} from '../../utils/authenticatedFetch';
import { useNavigation } from '../../context/NavigationContext';

interface AccessScope {
  company_id: string;
  company_name: string;
  branch_id: string | null;
  branch_name: string | null;
  scope_type: 'COMPANY' | 'BRANCH';
}

interface SessionInfo {
  user: { id: string; username: string; fullName: string | null };
  scopes: AccessScope[];
  canManageScopes: boolean;
}

interface ScopeChoice {
  key: string;
  companyId: string;
  branchId: string | null;
  label: string;
}

type GateState = 'loading' | 'login' | 'choose-scope' | 'ready' | 'no-scope';

function getStoredScope(): { companyId: string; branchId: string | null } | null {
  try {
    const companyId = localStorage.getItem(COMPANY_SCOPE_KEY);
    if (!companyId) return null;
    return { companyId, branchId: localStorage.getItem(BRANCH_SCOPE_KEY) };
  } catch {
    return null;
  }
}

function saveScope(companyId: string, branchId: string | null): void {
  localStorage.setItem(COMPANY_SCOPE_KEY, companyId);
  if (branchId) localStorage.setItem(BRANCH_SCOPE_KEY, branchId);
  else localStorage.removeItem(BRANCH_SCOPE_KEY);
}

export const AuthenticationGate: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { currentRoute } = useNavigation();
  const isVoucherRoute =
    currentRoute === '/sales/receipts' || currentRoute === '/purchasing/payments';
  const [state, setState] = useState<GateState>('loading');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [selectedScope, setSelectedScope] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const scopeChoices = useMemo<ScopeChoice[]>(() => {
    if (!session) return [];
    return session.scopes.map((scope) => ({
      key: `${scope.company_id}:${scope.branch_id || 'company'}`,
      companyId: scope.company_id,
      branchId: scope.branch_id,
      label: scope.scope_type === 'COMPANY'
        ? `${scope.company_name} — بيانات الشركة المشتركة`
        : `${scope.company_name} — ${scope.branch_name}`,
    }));
  }, [session]);

  const loadSession = useCallback(async () => {
    const token = readSessionToken();
    if (!token) {
      setSession(null);
      setState('login');
      return;
    }

    setState('loading');
    setError('');
    try {
      const response = await fetch('/api/auth/session');
      if (!response.ok) {
        if (response.status !== 401) {
          const result = await response.json().catch(() => null);
          throw new Error(result?.error || 'تعذر التحقق من الجلسة.');
        }
        clearSession();
        setSession(null);
        setState('login');
        return;
      }

      const result = await response.json() as SessionInfo;
      setSession(result);
      if (result.scopes.length === 0) {
        setState('no-scope');
        return;
      }

      const choices = result.scopes.map((scope) => ({
        key: `${scope.company_id}:${scope.branch_id || 'company'}`,
        companyId: scope.company_id,
        branchId: scope.branch_id,
        label: scope.scope_type === 'COMPANY'
          ? `${scope.company_name} — بيانات الشركة المشتركة`
          : `${scope.company_name} — ${scope.branch_name}`,
      }));
      const stored = getStoredScope();
      const storedChoice = stored && choices.find((choice) =>
        choice.companyId === stored.companyId && choice.branchId === stored.branchId
      );
      const nextScope = storedChoice || (
        result.scopes.length === 1
          ? choices[0]
          : null
      );
      if (nextScope) {
        saveScope(nextScope.companyId, nextScope.branchId);
        setSelectedScope(nextScope.key);
        setState('ready');
      } else {
        setSelectedScope('');
        setState('choose-scope');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر التحقق من الجلسة.');
      setState('login');
    }
  }, []);

  useEffect(() => {
    void loadSession();
    const onExpired = () => {
      setNotice('انتهت الجلسة. سجّل الدخول مجددًا للمتابعة.');
      setSession(null);
      setState('login');
    };
    const onLogout = () => {
      setSession(null);
      setState('login');
    };
    const onDenied = () => setNotice('ليس لديك صلاحية لتنفيذ هذا الإجراء.');
    window.addEventListener('kayan:session-expired', onExpired);
    window.addEventListener('kayan:session-logout', onLogout);
    window.addEventListener('kayan:permission-denied', onDenied);
    return () => {
      window.removeEventListener('kayan:session-expired', onExpired);
      window.removeEventListener('kayan:session-logout', onLogout);
      window.removeEventListener('kayan:permission-denied', onDenied);
    };
  }, [loadSession]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.token) {
        throw new Error(result?.error || 'تعذر تسجيل الدخول.');
      }
      saveSession(result.token, {
        id: result.id,
        username: result.username,
        fullName: result.fullName,
      });
      setPassword('');
      await loadSession();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر تسجيل الدخول.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleScopeChange = (key: string) => {
    const scope = scopeChoices.find((choice) => choice.key === key);
    if (!scope) return;
    saveScope(scope.companyId, scope.branchId);
    setSelectedScope(scope.key);
    setState('ready');
    setNotice('');
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setState('login');
    setNotice('تم تسجيل الخروج.');
  };

  if (state === 'loading') {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-600">جارٍ التحقق من الجلسة...</div>;
  }

  if (state === 'login') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4" dir="rtl">
        <form onSubmit={handleLogin} className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <div>
            <h1 className="text-xl font-bold text-slate-900">تسجيل الدخول</h1>
            <p className="mt-1 text-sm text-slate-600">استخدم حسابك للمتابعة إلى نظام كيان.</p>
          </div>
          {notice && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <label className="block space-y-1 text-sm font-medium text-slate-700">
            اسم المستخدم
            <input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-lg border p-3" />
          </label>
          <label className="block space-y-1 text-sm font-medium text-slate-700">
            كلمة المرور
            <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border p-3" />
          </label>
          <button disabled={submitting} className="w-full rounded-lg bg-blue-900 p-3 font-bold text-white disabled:opacity-60">
            {submitting ? 'جارٍ التحقق...' : 'دخول'}
          </button>
        </form>
      </main>
    );
  }

  if (state === 'no-scope') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4" dir="rtl">
        <section className="w-full max-w-lg space-y-4 rounded-2xl border border-amber-200 bg-white p-8 shadow-lg">
          <h1 className="text-xl font-bold text-slate-900">لا يوجد نطاق بيانات مسند</h1>
          <p className="text-sm leading-6 text-slate-700">
            لا يمكن عرض بيانات الشركات أو الفروع حتى يُسند مسؤول مخوّل نطاق وصول صالحًا لهذا الحساب.
            {session?.canManageScopes && ' يمكنك فتح إدارة المستخدمين من القائمة الجانبية لإسناد النطاق.'}
          </p>
          <div className="flex gap-3">
            {session?.canManageScopes && (
              <button onClick={() => setState('ready')} className="rounded-lg bg-blue-900 px-4 py-2 font-bold text-white">
                متابعة إلى إدارة النطاقات
              </button>
            )}
            <button onClick={handleLogout} className="rounded-lg border px-4 py-2 font-bold text-slate-700">تسجيل الخروج</button>
          </div>
        </section>
      </main>
    );
  }

  if (state === 'choose-scope') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4" dir="rtl">
        <section className="w-full max-w-lg space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <div>
            <h1 className="text-xl font-bold text-slate-900">اختر نطاق العمل</h1>
            <p className="mt-1 text-sm text-slate-600">سيتم حصر البيانات والعمليات في الشركة أو الفرع الذي تختاره.</p>
          </div>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <select value={selectedScope} onChange={(event) => setSelectedScope(event.target.value)} className="w-full rounded-lg border p-3">
            <option value="">اختر شركة أو فرعًا</option>
            {scopeChoices.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
          </select>
          <div className="flex gap-3">
            <button disabled={!selectedScope} onClick={() => handleScopeChange(selectedScope)} className="rounded-lg bg-blue-900 px-4 py-2 font-bold text-white disabled:opacity-50">متابعة</button>
            <button onClick={handleLogout} className="rounded-lg border px-4 py-2 font-bold text-slate-700">تسجيل الخروج</button>
          </div>
        </section>
      </main>
    );
  }

  if (isVoucherRoute) {
    return <>{children}</>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-2 text-sm" dir="rtl">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-slate-800">{session?.user.fullName || session?.user.username}</span>
          {scopeChoices.length > 0 && (
            <label className="flex items-center gap-2 text-slate-600">
              نطاق البيانات
              <select value={selectedScope} onChange={(event) => handleScopeChange(event.target.value)} className="max-w-xs rounded-md border px-2 py-1">
                {scopeChoices.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="flex items-center gap-3">
          {notice && <span role="status" className="text-amber-800">{notice}</span>}
          <button onClick={handleLogout} className="font-bold text-slate-600 hover:text-rose-700">تسجيل الخروج</button>
        </div>
      </div>
      {children}
    </div>
  );
};
