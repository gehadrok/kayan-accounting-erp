import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { reportFormatPrefs } from '../services/reportRegistry';

/**
 * PHASE 10.5.1 — the single central source of UI/system preferences.
 *
 * Before this existed, every control on the System & UI screen either saved a
 * key nothing ever read, or did not save at all: there was no app-wide place
 * that loaded core.settings and applied it. This provider fetches the settings
 * once per app load, keeps them in memory, applies the document-level effects
 * (theme class, density class, <html lang>/<html dir>) and exposes:
 *   getValue(key, fallback)  → read a setting anywhere (React re-renders on change)
 *   setValue(key, value)     → PUT + update memory + re-apply effects immediately
 *
 * The report formatter (reportRegistry.reportFormatPrefs) is a non-React
 * singleton used by the print window; it is kept in sync here so printable
 * output always matches the screen.
 */

const PREF_KEYS = [
  'ui.language',
  'ui.direction',
  'ui.theme',
  'ui.density',
  'ui.date_format',
  'ui.thousands_separator',
  'ui.decimal_separator',
  'ui.confirm_before_post',
  'ui.lookup_debounce_ms',
  'ui.notify_save_success',
  'reports.currency_symbol',
  'reports.currency_position',
  'reports.decimal_places',
  'inventory.auto_create_issue_on_sale',
];

type Prefs = Record<string, any>;

/**
 * PHASE 10.5.2 — the settings API now requires a signed session on every
 * write (401 without it), so the provider attaches the stored bearer token
 * to its requests instead of leaving the route open.
 */
const SESSION_TOKEN_KEY = 'kayan_session_token';

function sessionHeaders(): Record<string, string> {
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_TOKEN_KEY) : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

interface SettingsContextValue {
  prefs: Prefs;
  loading: boolean;
  loaded: boolean;
  getValue: (key: string, fallback?: any) => any;
  setValue: (key: string, value: any, reason?: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  prefs: {},
  loading: true,
  loaded: false,
  getValue: (_key: string, fallback?: any) => fallback,
  setValue: async () => { throw new Error('SettingsProvider missing'); },
  refresh: async () => { /* no-op */ },
});

function flattenSettings(payload: any): Prefs {
  const out: Prefs = {};
  const groups = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.settings : payload;
  const rows: any[] = Array.isArray(groups)
    ? groups
    : groups && typeof groups === 'object'
      ? Object.values(groups).flat()
      : [];
  for (const row of rows) {
    if (!row || typeof row.key !== 'string') continue;
    out[row.key] = row.value !== null && row.value !== undefined ? row.value : row.defaultValue;
  }
  return out;
}

/** Non-React bridge: the print window reads these instead of React state. */
function syncReportFormatPrefs(prefs: Prefs) {
  reportFormatPrefs.currencySymbol = String(prefs['reports.currency_symbol'] ?? 'YER');
  reportFormatPrefs.currencyPosition = prefs['reports.currency_position'] === 'before' ? 'before' : 'after';
  reportFormatPrefs.decimalPlaces = Math.max(0, Math.min(4, Number(prefs['reports.decimal_places'] ?? 2) || 0));
  reportFormatPrefs.thousandsSeparator = prefs['ui.thousands_separator'] === 'space' ? ' ' : ',';
  reportFormatPrefs.decimalSeparator = prefs['ui.decimal_separator'] === 'comma' ? ',' : '.';
  reportFormatPrefs.dateFormat = prefs['ui.date_format'] === 'DD/MM/YYYY' ? 'DD/MM/YYYY' : 'YYYY-MM-DD';
}

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prefs, setPrefs] = useState<Prefs>({});
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const applyDocumentEffects = useCallback((p: Prefs) => {
    const el = document.documentElement;

    const theme = String(p['ui.theme'] ?? 'light');
    const systemDark = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;
    el.classList.toggle('dark', theme === 'dark' || (theme === 'system' && systemDark));

    el.classList.toggle('compact', String(p['ui.density'] ?? 'comfortable') === 'compact');

    el.lang = String(p['ui.language'] ?? 'ar');
    el.dir = String(p['ui.direction'] ?? 'rtl') === 'ltr' ? 'ltr' : 'rtl';

    syncReportFormatPrefs(p);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings', { headers: sessionHeaders() });
      if (!res.ok) throw new Error('تعذر تحميل إعدادات النظام');
      const next = flattenSettings(await res.json());
      setPrefs(next);
      applyDocumentEffects(next);
      setLoaded(true);
    } catch (err) {
      console.error('[SettingsProvider]', err);
    } finally {
      setLoading(false);
    }
  }, [applyDocumentEffects]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live update when the OS theme changes while theme = 'system'.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyDocumentEffects(prefs);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [prefs, applyDocumentEffects]);

  const setValue = useCallback(async (key: string, value: any, reason?: string) => {
    const res = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
      body: JSON.stringify({ value, reason: reason || 'تحديث عبر مركز الإعدادات المركزي' }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || `فشل حفظ الإعداد (${res.status})`);

    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      applyDocumentEffects(next);
      return next;
    });
  }, [applyDocumentEffects]);

  const getValue = useCallback((key: string, fallback?: any) => {
    const v = prefs[key];
    return v !== undefined && v !== null ? v : fallback;
  }, [prefs]);

  const value = useMemo(
    () => ({ prefs, loading, loaded, getValue, setValue, refresh }),
    [prefs, loading, loaded, getValue, setValue, refresh]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export function useSettings() {
  return useContext(SettingsContext);
}

export default SettingsContext;
