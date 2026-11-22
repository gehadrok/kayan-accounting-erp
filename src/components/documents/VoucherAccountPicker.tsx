/**
 * KAYAN ENTERPRISE — اختيار الحسابات في سندات القبض والصرف
 * ============================================================
 * مكوّنان مشتركان بين شاشة سند القبض وشاشة سند الصرف:
 *
 * 1) VoucherCounterpartyPicker — اختيار الطرف المقابل على مرحلتين:
 *      المرحلة 1: نوع الحساب (عملاء/موردون/موظفون/حسابات عامة/صناديق/بنوك)
 *      المرحلة 2: قائمة الحسابات الفعلية القابلة للبحث، من مصادر حقيقية
 *                 (endpoint: /api/lookups/{receipt|payment}-counterparty)
 *
 * 2) VoucherVehiclePicker — اختيار وسيلة التحصيل/الصرف من تعريفات
 *    الصناديق/البنوك الفعلية المربوطة بحسابات GL القابلة للترحيل.
 *
 * واجهة RTL بخط Cairo، وحالات تحميل/فراغ/خطأ + إعادة محاولة. البيانات كلها
 * من الخادم فقط — لا أسماء أو حسابات وهمية.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
  Search,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { DocumentField } from './DocumentLayout';
import { Input } from '../ui';


/* ------------------------------------------------------------------ */
/* الأنواع الستة وتسمياتها العربية — مطابقة للخادم                     */
/* ------------------------------------------------------------------ */

export type VoucherCounterpartyTypeKey = 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE' | 'GENERAL' | 'CASH' | 'BANK';

export const VOUCHER_COUNTERPARTY_TYPES: Array<{ value: VoucherCounterpartyTypeKey; label: string; hint: string }> = [
  { value: 'CUSTOMER', label: 'العملاء', hint: 'قبض من/صرف إلى ذمم العملاء (' },
  { value: 'SUPPLIER', label: 'الموردون', hint: 'الموردون والدائنون' },
  { value: 'EMPLOYEE', label: 'الموظفون', hint: 'يتطلب سجل موظفين (غير متوفر بعد)' },
  { value: 'GENERAL', label: 'الحسابات العامة', hint: 'حسابات تفصيلية من دليل الحسابات' },
  { value: 'CASH', label: 'الصناديق', hint: 'صناديق النقدية وحساباتها' },
  { value: 'BANK', label: 'البنوك', hint: 'الحسابات البنكية وحساباتها' },
];

export const COUNTERPARTY_TYPE_LABEL_AR: Record<string, string> = Object.fromEntries(
  VOUCHER_COUNTERPARTY_TYPES.map((t) => [t.value, t.label])
);

/* ------------------------------------------------------------------ */
/* الأدوات الداخلية                                                    */
/* ------------------------------------------------------------------ */

interface VoucherOptionBase {
  entityId?: string | null;
  code: string | null;
  name: string | null;
  extra?: string | null;
  accountId?: string | null;
  accountCode?: string | null;
  accountName?: string | null;
  missingAccountLink?: boolean;
}

/** حالة القائمة المشتركة: تحميل / فراغ / فجوة / خطأ + إعادة المحاولة. */
function useVoucherOptionList(url: string | null) {
  const [options, setOptions] = useState<VoucherOptionBase[]>([]);
  const [gapMessage, setGapMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!url) {
      setOptions([]);
      setGapMessage(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'تعذر تحميل الحسابات');
        }
        const data = await res.json();
        if (cancelled) return;
        setOptions(data.options || []);
        setGapMessage(data.gapMessage || (data.gap ? 'لا توجد حسابات لهذا النوع بعد' : null));
      } catch (err: any) {
        if (cancelled) return;
        setOptions([]);
        setGapMessage(null);
        setError(err.message || 'خطأ غير متوقع');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [url, reloadTick]);

  const retry = useCallback(() => setReloadTick((t) => t + 1), []);

  return { options, gapMessage, loading, error, retry };
}

/** حقل بحث مدمج مع تلميح. */
const SearchBox: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}> = ({ value, onChange, placeholder, disabled }) => (
  <div className="relative">
    <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="pr-9 font-medium"
    />
    {value && !disabled && (
      <button
        type="button"
        onClick={() => onChange('')}
        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-muted transition hover:bg-surface-hover"
        title="مسح البحث"
      >
        <X size={13} />
      </button>
    )}
  </div>
);

/** حالة رسالة داخل مربع القائمة (فراغ/فجوة/خطأ). */
const ListMessage: React.FC<{
  icon?: React.ReactNode;
  tone: 'muted' | 'error' | 'info';
  children: React.ReactNode;
  onRetry?: () => void;
}> = ({ icon, tone, children, onRetry }) => {
  const toneClass =
    tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : tone === 'info'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-line-soft bg-surface-muted text-ink-muted';
  return (
    <div className={`flex items-center justify-between gap-2 rounded-control border px-3 py-2.5 text-[11px] font-medium ${toneClass}`}>
      <div className="flex items-start gap-2">
        {icon}
        <span className="leading-relaxed">{children}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 whitespace-nowrap rounded-lg border border-current/30 bg-white/70 px-2 py-1 text-[10px] font-bold transition hover:bg-white"
        >
          <span className="inline-flex items-center gap-1">
            <RefreshCw size={11} /> إعادة المحاولة
          </span>
        </button>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 1) الطرف المقابل — نوع الحساب ثم الحساب الفرعي                      */
/* ------------------------------------------------------------------ */

export interface VoucherCounterpartySelection {
  /** معرّف تعريف الطرف (عميل/مورد/صندوق/بنك) — فارغ لحسابات الدليل. */
  entityId: string;
  accountId: string;
  /** نص وصفي للطرف (يُستخدم في البيان الافتراضي للسند). */
  label: string;
  accountCode?: string | null;
}

export interface VoucherCounterpartyPickerProps {
  voucherKind: 'receipt' | 'payment';
  /** نوع الحساب المختار (مرحلة 1) — '' يعني لم يُختر بعد. */
  counterpartyType: VoucherCounterpartyTypeKey | '';
  onCounterpartyTypeChange: (type: VoucherCounterpartyTypeKey | '') => void;
  /** الاختيار الحالي (مرحلة 2). */
  selection: VoucherCounterpartySelection | null;
  onSelectionChange: (selection: VoucherCounterpartySelection | null) => void;
  /** النوع صار بحالة «مطلوب» للتمرير في الحفظ. */
  disabled?: boolean;
}

export const VoucherCounterpartyPicker: React.FC<VoucherCounterpartyPickerProps> = ({
  voucherKind,
  counterpartyType,
  onCounterpartyTypeChange,
  selection,
  onSelectionChange,
  disabled,
}) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [search]);

  // تغيير النوع يمسح البحث؛ ممسح الاختيار نفسه يتم في الصفحة (onCounterpartyTypeChange)
  useEffect(() => {
    setSearch('');
    setDebouncedSearch('');
  }, [counterpartyType]);

  const url =
    counterpartyType && !disabled
      ? `/api/lookups/${voucherKind}-counterparty?type=${counterpartyType}&q=${encodeURIComponent(debouncedSearch)}&limit=80`
      : null;
  const { options, gapMessage, loading, error, retry } = useVoucherOptionList(url);

  const matches = options.filter((o) => {
    if (!debouncedSearch) return true;
    const hay = `${o.code || ''} ${o.name || ''} ${o.accountCode || ''} ${o.accountName || ''}`.toLowerCase();
    return hay.includes(debouncedSearch.toLowerCase());
  });

  return (
    <div className="space-y-3">
      {/* المرحلة 1: نوع الحساب */}
      <DocumentField label="نوع الحساب (الطرف المقابل)" required>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {VOUCHER_COUNTERPARTY_TYPES.map((t) => {
            const active = t.value === counterpartyType;
            return (
              <button
                key={t.value}
                type="button"
                disabled={disabled}
                onClick={() => onCounterpartyTypeChange(active ? '' : t.value)}
                className={`rounded-control border px-3 py-2 text-[11px] font-bold transition ${
                  active
                    ? 'border-brand bg-brand/10 text-brand shadow-xs'
                    : 'border-line-soft bg-surface-muted text-ink-muted hover:border-line hover:text-ink'
                } ${t.value === 'EMPLOYEE' ? 'opacity-90' : ''}`}
                title={t.hint}
              >
                <span className="inline-flex items-center gap-1.5">
                  {active && <Check size={12} />}
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </DocumentField>

      {/* المرحلة 2: الحساب الفعلي */}
      {!counterpartyType && (
        <DocumentField label="الحساب" required>
          <p className="rounded-control border border-line-soft bg-surface-muted px-3 py-2 text-[11px] text-ink-muted">
            اختر نوع الحساب أولاً ثم ستظهر الحسابات الفعلية القابلة للتحديد.
          </p>
        </DocumentField>
      )}

      {counterpartyType && !selection && !disabled && (
        <DocumentField label="الحساب (البحث بالاسم أو رقم الحساب)" required>
          <div className="space-y-2">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="ابحث بالاسم أو رقم الحساب أو الكود..."
              disabled={loading && options.length === 0}
            />

            {loading && options.length === 0 && (
              <ListMessage tone="muted" icon={<Loader2 size={13} className="animate-spin" />}>
                جارٍ تحميل الحسابات من النظام...
              </ListMessage>
            )}

            {error && (
              <ListMessage tone="error" icon={<AlertTriangle size={13} />} onRetry={retry}>
                {error}
              </ListMessage>
            )}

            {!error && gapMessage && (
              <ListMessage tone="info" icon={<AlertTriangle size={13} />}>
                {gapMessage}
              </ListMessage>
            )}

            {!error && !loading && !gapMessage && matches.length === 0 && (
              <ListMessage tone="muted" onRetry={retry}>
                لا توجد حسابات مطابقة لهذا النوع{debouncedSearch ? ' بهذا البحث' : ''}.
              </ListMessage>
            )}

            {matches.length > 0 && (
              <div className="max-h-56 divide-y divide-line-soft overflow-y-auto rounded-control border border-line-soft bg-white">
                {matches.map((o, idx) => {
                  const key = `${o.entityId || 'gl'}-${o.accountId || idx}`;
                  const unsupported = Boolean(o.missingAccountLink);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={unsupported}
                      onClick={() =>
                        onSelectionChange({
                          entityId: o.entityId || '',
                          accountId: o.accountId || '',
                          label: `${o.name || o.code}`,
                          accountCode: o.accountCode || null,
                        })
                      }
                      className={`block w-full px-3 py-2 text-right transition ${
                        unsupported
                          ? 'cursor-not-allowed bg-amber-50/40 opacity-60'
                          : 'hover:bg-surface-hover/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-ink">{o.name || '—'}</span>
                        <span className="font-mono text-[10px] text-ink-muted">{o.code}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 text-[10px] text-ink-muted">
                        <span>
                          {o.accountCode
                            ? `الحساب: ${o.accountCode} — ${o.accountName || ''}`
                            : o.missingAccountLink
                              ? 'غير مربوط بحساب محاسبي — لا يصلح للقيد حتى يُربط'
                              : ''}
                        </span>
                        {o.extra && <span className="font-medium">{o.extra}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DocumentField>
      )}

      {counterpartyType && selection && (
        <DocumentField label="الحساب المختار" required>
          <div className="flex items-center justify-between gap-2 rounded-control border border-emerald-200 bg-emerald-50 px-3 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Check size={13} className="shrink-0 text-emerald-600" />
                <span className="truncate text-xs font-bold text-ink">{selection.label}</span>
                {selection.accountCode && (
                  <span className="font-mono text-[10px] text-ink-muted">{selection.accountCode}</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectionChange(null)}
              className="shrink-0 rounded-lg border border-line-soft bg-white px-2 py-1 text-[10px] font-bold text-ink-muted transition hover:bg-surface-hover"
            >
              تغيير/مسح
            </button>
          </div>
        </DocumentField>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 2) وسيلة التحصيل / الصرف (صندوق أو بنك)                             */
/* ------------------------------------------------------------------ */

export interface VoucherVehicleSelection {
  entityId: string;
  accountId: string;
  label: string;
  accountCode?: string | null;
}

interface VehicleOptionItem extends VoucherOptionBase {
  entityId: string;
}

export interface VoucherVehiclePickerProps {
  voucherKind: 'receipt' | 'payment';
  category: 'CASH' | 'BANK';
  value: VoucherVehicleSelection | null;
  onSelect: (selection: VoucherVehicleSelection | null) => void;
  label: string;
}

export const VoucherVehiclePicker: React.FC<VoucherVehiclePickerProps> = ({
  voucherKind,
  category,
  value,
  onSelect,
  label,
}) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [search]);

  useEffect(() => {
    setSearch('');
    setDebouncedSearch('');
  }, [category]);

  const url = `/api/lookups/${voucherKind}-vehicles?category=${category}&q=${encodeURIComponent(debouncedSearch)}&limit=60`;
  const { options, gapMessage, loading, error, retry } = useVoucherOptionList(url);

  const matches = options.filter((o) => {
    if (!debouncedSearch) return true;
    const hay = `${o.code || ''} ${o.name || ''} ${o.accountCode || ''} ${o.accountName || ''}`.toLowerCase();
    return hay.includes(debouncedSearch.toLowerCase());
  });

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-control border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Check size={13} className="shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <div className="truncate text-xs font-bold text-ink">{value.label}</div>
              <div className="text-[10px] text-ink-muted">
                الحساب المحاسبي: <span className="font-mono">{value.accountCode}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="shrink-0 rounded-lg border border-line-soft bg-white px-2 py-1 text-[10px] font-bold text-ink-muted transition hover:bg-surface-hover"
          >
            تغيير
          </button>
        </div>
      ) : (
        <DocumentField label={label} required>
          <div className="space-y-2">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder={category === 'CASH' ? 'ابحث بالاسم أو رقم الحساب في الصناديق...' : 'ابحث بالبنك أو رقم الحساب...'}
              disabled={loading && options.length === 0}
            />

            {loading && options.length === 0 && (
              <ListMessage tone="muted" icon={<Loader2 size={13} className="animate-spin" />}>
                جارٍ تحميل {category === 'CASH' ? 'الصناديق' : 'البنوك'}...
              </ListMessage>
            )}

            {error && (
              <ListMessage tone="error" icon={<AlertTriangle size={13} />} onRetry={retry}>
                {error}
              </ListMessage>
            )}

            {!error && !loading && !gapMessage && matches.length === 0 && (
              <ListMessage tone="muted" onRetry={retry}>
                لا توجد {category === 'CASH' ? 'صناديق' : 'حسابات بنكية'} مربوطة بحسابات محاسبية نشطة —
                سيُستخدم الافتراضي النظام (1101/1102) عند الحفظ بدل الاختيار.
              </ListMessage>
            )}

            {matches.length > 0 && (
              <div className="max-h-48 divide-y divide-line-soft overflow-y-auto rounded-control border border-line-soft bg-white">
                {matches.map((o: any, idx) => (
                  <button
                    key={`${o.entityId}-${idx}`}
                    type="button"
                    onClick={() =>
                      onSelect({
                        entityId: o.entityId,
                        accountId: o.accountId || '',
                        label: `${o.name || o.code}`,
                        accountCode: o.accountCode || null,
                      })
                    }
                    className="block w-full px-3 py-2 text-right transition hover:bg-surface-hover/70"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-ink">{o.name || '—'}</span>
                      <span className="font-mono text-[10px] text-ink-muted">{o.code}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 text-[10px] text-ink-muted">
                      <span>
                        الحساب: {o.accountCode} — {o.accountName || ''}
                      </span>
                      {o.extra && <span>{o.extra}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DocumentField>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 3) حقول اختيار مضغوطة لسندي القبض والصرف                            */
/* ------------------------------------------------------------------ */
/*
 * هذه الحقول تستخدم نفس مصادر البيانات الحقيقية في المكوّنين أعلاه،
 * لكن بهيئة قائمة منسدلة واحدة تناسب شريط بيانات السند في المرجع.
 * أُضيفت بجوار المكوّنين القديمين دون تغييرهما حتى تبقى بقية الشاشات
 * التي تستخدم الواجهة الكبيرة كما هي.
 */

function compactOptionKey(entityId?: string | null, accountId?: string | null): string {
  return `${entityId || 'gl'}:${accountId || ''}`;
}

/* ---------- نوع الحساب المقابل ---------- */

export interface VoucherCounterpartyTypeSelectProps {
  value: VoucherCounterpartyTypeKey | '';
  onChange: (type: VoucherCounterpartyTypeKey | '') => void;
  disabled?: boolean;
}

export const VoucherCounterpartyTypeSelect: React.FC<VoucherCounterpartyTypeSelectProps> = ({
  value,
  onChange,
  disabled,
}) => (
  <div className="kayan-sheet-select" title="نوع الحساب المقابل">
    <Users size={16} className="kayan-sheet-select-icon" aria-hidden="true" />
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as VoucherCounterpartyTypeKey | '')}
      disabled={disabled}
      aria-label="نوع الحساب المقابل"
    >
      <option value="">اختر نوع الحساب</option>
      {VOUCHER_COUNTERPARTY_TYPES.map((type) => (
        <option key={type.value} value={type.value}>
          {type.label}
        </option>
      ))}
    </select>
    <ChevronDown size={14} className="kayan-sheet-select-chevron" aria-hidden="true" />
  </div>
);

/* ---------- الحساب الرئيسي (الحقل الأول — بحث F9) ---------- */
/*
 * بديل القائمة المنسدلة للأنواع: يعرض الحسابات الرئيسية الحقيقية من دليل
 * الحسابات (العملاء/الموردون/حسابات تجميعية) مع بحث بالاسم أو الرقم.
 * تُستثنى حسابات الصناديق/البنوك من الخادم — الصندوق المصدر يُختار في أعلى السند.
 * بعد الاختيار ينتقل التركيز إلى حقل الحساب التحليلي.
 */

export type VoucherMainAccountKind = 'CUSTOMER' | 'SUPPLIER' | 'GENERAL';

export interface VoucherMainAccountSelection {
  accountId: string;
  code: string;
  name: string;
  kind: VoucherMainAccountKind;
  hasChildren: boolean;
  children: Array<{ accountId: string; code: string; name: string }>;
}

const KIND_LABEL: Record<VoucherMainAccountKind, string> = {
  CUSTOMER: 'عملاء',
  SUPPLIER: 'موردون',
  GENERAL: 'حساب عام',
};

export interface VoucherMainAccountSelectProps {
  value: VoucherMainAccountSelection | null;
  onChange: (selection: VoucherMainAccountSelection | null) => void;
  disabled?: boolean;
}

export const VoucherMainAccountSelect: React.FC<VoucherMainAccountSelectProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [options, setOptions] = useState<VoucherMainAccountSelection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/lookups/voucher-main-accounts?q=${encodeURIComponent(debouncedQuery)}&limit=120`
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'تعذر تحميل الحسابات الرئيسية');
        }
        const data = await res.json();
        if (cancelled) return;
        setOptions(data.options || []);
        setActive(0);
      } catch (err: any) {
        if (cancelled) return;
        setOptions([]);
        setError(err.message || 'خطأ غير متوقع');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setDebouncedQuery('');
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current || options.length === 0) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, options, open]);

  const openPanel = () => {
    if (disabled || open) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(Math.max(rect.width, 360), 520);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const top = rect.bottom + 6 + 320 > window.innerHeight ? Math.max(12, rect.top - 326) : rect.bottom + 6;
      setAnchor({ top, left, width });
    }
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setAnchor(null);
  };

  const select = (option: VoucherMainAccountSelection) => {
    onChange(option);
    close();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((prev) => (options.length ? (prev < options.length - 1 ? prev + 1 : 0) : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((prev) => (options.length ? (prev > 0 ? prev - 1 : options.length - 1) : 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[active];
      if (option) select(option);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={openPanel}
        onFocus={() => {
          if (!value) openPanel();
        }}
        onKeyDown={(event) => {
          if (event.key === 'F9') {
            event.preventDefault();
            openPanel();
          }
        }}
        title="اختر الحساب الرئيسي (F9)"
        className={`kayan-sheet-select kayan-sheet-select-button w-full text-right ${
          value ? 'has-value' : ''
        }`}
      >
        {value ? <Check size={16} className="kayan-sheet-select-icon" aria-hidden="true" /> : <Users size={16} className="kayan-sheet-select-icon" aria-hidden="true" />}
        <span className="min-w-0 flex-1 truncate">
          {value ? `${value.code} — ${value.name}` : 'اختر الحساب الرئيسي (F9)'}
        </span>
        <ChevronDown size={14} className="kayan-sheet-select-chevron" aria-hidden="true" />
      </button>

      {open && anchor && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden="true" />
          <div
            className="fixed z-50 overflow-hidden rounded-xl border border-line bg-white shadow-xl"
            style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
            dir="rtl"
          >
            <div className="flex items-center gap-2 border-b border-line-soft bg-slate-900 px-3 py-2 text-white">
              <Search size={14} className="text-blue-400" />
              <span className="text-[11px] font-bold">اختر الحساب الرئيسي</span>
            </div>
            <div className="border-b border-line-soft bg-slate-50 p-2">
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="اكتب بالاسم أو رقم الحساب..."
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white pe-2 ps-8 text-[11px] outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div ref={listRef} className="max-h-64 overflow-y-auto">
              {loading && options.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-ink-muted">
                  <Loader2 size={13} className="animate-spin" /> جارٍ التحميل...
                </div>
              )}
              {error && (
                <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-rose-600">
                  <AlertTriangle size={13} /> {error}
                </div>
              )}
              {!loading && !error && options.length === 0 && (
                <div className="py-6 text-center text-[11px] text-ink-muted">لا توجد حسابات رئيسية مطابقة</div>
              )}
              {options.map((option, index) => (
                <button
                  key={option.accountId}
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => select(option)}
                  className={`block w-full px-3 py-2 text-right text-[11px] transition ${
                    index === active ? 'bg-blue-100/80 font-bold text-blue-950' : 'text-ink hover:bg-surface-hover/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <span className="font-mono text-[10px] text-ink-muted">{option.code}</span> {option.name}
                    </span>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600">
                      {KIND_LABEL[option.kind]}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-line-soft bg-slate-50 px-3 py-1.5 text-[10px] text-ink-muted">
              <span>↑ ↓ للتنقل، Enter للاختيار، Esc للإغلاق</span>
              <button type="button" onClick={close} className="rounded p-0.5 hover:bg-slate-200" title="إغلاق">
                <X size={12} />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

/* ---------- الحساب المقابل ---------- */

export interface VoucherCounterpartyAccountSelectProps {
  voucherKind: 'receipt' | 'payment';
  counterpartyType: VoucherCounterpartyTypeKey | '';
  selection: VoucherCounterpartySelection | null;
  onSelectionChange: (selection: VoucherCounterpartySelection | null) => void;
  disabled?: boolean;
  /**
   * حصر القائمة في حسابات الأبناء التفصيلية المختارة (حالة الحساب الرئيسي العام).
   * عند تمريره تُعرض الحسابات التابعة للحساب الرئيسي فقط بدل كل حسابات النوع.
   */
  restrictToAccountIds?: string[] | null;
  /** إشارة تغيير لدفع التركيز إلى هذا الحقل (بعد اختيار الحساب الرئيسي). */
  focusSignal?: number;
}

export const VoucherCounterpartyAccountSelect: React.FC<VoucherCounterpartyAccountSelectProps> = ({
  voucherKind,
  counterpartyType,
  selection,
  onSelectionChange,
  disabled,
  restrictToAccountIds,
  focusSignal,
}) => {
  useEffect(() => {
    if (!focusSignal) return;
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(
        'select[aria-label="الحساب المقابل"], input[placeholder^="ابحث بالاسم أو رقم الحساب"]'
      );
      target?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusSignal]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [search]);

  useEffect(() => {
    setSearch('');
    setDebouncedSearch('');
  }, [counterpartyType]);

  const url = counterpartyType
    ? `/api/lookups/${voucherKind}-counterparty?type=${counterpartyType}&q=${encodeURIComponent(debouncedSearch)}&limit=200`
    : null;
  const { options, gapMessage, loading, error, retry } = useVoucherOptionList(url);

  const matches = options.filter((option) => option.accountId || option.missingAccountLink);
  const visibleMatches =
    restrictToAccountIds && restrictToAccountIds.length > 0
      ? matches.filter((option) => option.accountId && restrictToAccountIds.includes(option.accountId))
      : matches;
  const selectedKey = selection ? compactOptionKey(selection.entityId, selection.accountId) : '';
  const selectionIsListed = matches.some(
    (option) => compactOptionKey(option.entityId, option.accountId) === selectedKey
  );

  const placeholder = !counterpartyType
    ? 'اختر نوع الحساب أولاً'
    : loading && options.length === 0
      ? 'جارٍ تحميل الحسابات...'
      : error
        ? 'تعذر تحميل الحسابات'
        : visibleMatches.length === 0
          ? gapMessage
            ? 'لا توجد حسابات لهذا النوع'
            : 'لا توجد حسابات متاحة'
          : loading
            ? 'جارٍ تحديث الحسابات...'
            : 'اختر الحساب المقابل';

  const handleChange = (value: string) => {
    if (!value) {
      onSelectionChange(null);
      return;
    }
    const option = visibleMatches.find(
      (item) => compactOptionKey(item.entityId, item.accountId) === value
    );
    if (!option) return;
    onSelectionChange({
      entityId: option.entityId || '',
      accountId: option.accountId || '',
      label: option.name || option.code || 'حساب',
      accountCode: option.accountCode || null,
    });
  };

  const accountSelectField = (
    <div
      className={`kayan-sheet-select ${!counterpartyType || error ? 'is-muted' : ''}`}
      title={error || gapMessage || 'الحساب المقابل'}
    >
      <UserRound size={16} className="kayan-sheet-select-icon" aria-hidden="true" />
      <select
        value={selectedKey}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => {
          if (error) retry();
        }}
        disabled={disabled || !counterpartyType}
        aria-label="الحساب المقابل"
      >
        <option value="">{placeholder}</option>
        {selection && !selectionIsListed && (
          <option value={selectedKey}>
            {selection.label}
            {selection.accountCode ? ` — ${selection.accountCode}` : ''}
          </option>
        )}
        {visibleMatches.map((option) => (
          <option
            key={compactOptionKey(option.entityId, option.accountId)}
            value={compactOptionKey(option.entityId, option.accountId)}
            disabled={option.missingAccountLink}
          >
            {option.name || option.code || 'حساب'}
            {option.accountCode ? ` — ${option.accountCode}` : ''}
            {option.missingAccountLink ? ' (غير مربوط بحساب)' : ''}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="kayan-sheet-select-chevron" aria-hidden="true" />
    </div>
  );

  if (!counterpartyType) {
    return accountSelectField;
  }

  if (selection) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-control border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Check size={13} className="shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <div className="truncate text-xs font-bold text-ink">{selection.label}</div>
            {selection.accountCode && (
              <div className="text-[10px] text-ink-muted">
                الحساب: <span className="font-mono">{selection.accountCode}</span>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelectionChange(null)}
          className="shrink-0 rounded-lg border border-line-soft bg-white px-2 py-1 text-[10px] font-bold text-ink-muted transition hover:bg-surface-hover"
        >
          تغيير/مسح
        </button>
      </div>
    );
  }

  if (disabled) {
    return accountSelectField;
  }

  const filteredMatches = debouncedSearch
    ? visibleMatches.filter((option) => {
        const hay = `${option.code || ''} ${option.name || ''} ${option.accountCode || ''} ${option.accountName || ''}`.toLowerCase();
        return hay.includes(debouncedSearch.toLowerCase());
      })
    : visibleMatches;

  return (
    <div className="space-y-2">
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="ابحث بالاسم أو رقم الحساب أو الكود..."
        disabled={disabled}
      />
      {loading && options.length === 0 && (
        <ListMessage tone="muted" icon={<Loader2 size={13} className="animate-spin" />}>
          جارٍ تحميل الحسابات من النظام...
        </ListMessage>
      )}
      {error && (
        <ListMessage tone="error" icon={<AlertTriangle size={13} />} onRetry={retry}>
          {error}
        </ListMessage>
      )}
      {!error && !loading && !gapMessage && filteredMatches.length === 0 && (
        <ListMessage tone="muted" onRetry={retry}>
          لا توجد حسابات مطابقة لهذا النوع{debouncedSearch ? ' بهذا البحث' : ''}.
        </ListMessage>
      )}
      {filteredMatches.length > 0 && (
        <div className="max-h-56 divide-y divide-line-soft overflow-y-auto rounded-control border border-line-soft bg-white">
          {filteredMatches.map((option) => {
            const key = `${option.entityId || 'gl'}-${option.accountId || ''}`;
            const unsupported = Boolean(option.missingAccountLink);
            return (
              <button
                key={key}
                type="button"
                disabled={unsupported}
                onClick={() =>
                  onSelectionChange({
                    entityId: option.entityId || '',
                    accountId: option.accountId || '',
                    label: `${option.name || option.code}`,
                    accountCode: option.accountCode || null,
                  })
                }
                className={`block w-full px-3 py-2 text-right transition ${
                  unsupported ? 'cursor-not-allowed bg-amber-50/40 opacity-60' : 'hover:bg-surface-hover/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-ink">{option.name || '—'}</span>
                  <span className="font-mono text-[10px] text-ink-muted">{option.code}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 text-[10px] text-ink-muted">
                  <span>
                    {option.accountCode
                      ? `الحساب: ${option.accountCode} — ${option.accountName || ''}`
                      : option.missingAccountLink
                        ? 'غير مربوط بحساب محاسبي — لا يصلح للقيد حتى يُربط'
                        : ''}
                  </span>
                  {option.extra && <span className="font-medium">{option.extra}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ---------- حساب الصندوق / البنك ---------- */

export interface VoucherVehicleSelectProps {
  voucherKind: 'receipt' | 'payment';
  category: 'CASH' | 'BANK';
  value: VoucherVehicleSelection | null;
  onSelect: (selection: VoucherVehicleSelection | null) => void;
  disabled?: boolean;
}

export const VoucherVehicleSelect: React.FC<VoucherVehicleSelectProps> = ({
  voucherKind,
  category,
  value,
  onSelect,
  disabled,
}) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [search]);

  useEffect(() => {
    setSearch('');
    setDebouncedSearch('');
  }, [category]);

  const url = `/api/lookups/${voucherKind}-vehicles?category=${category}&q=${encodeURIComponent(debouncedSearch)}&limit=200`;
  const { options, gapMessage, loading, error, retry } = useVoucherOptionList(url);

  const selectedKey = value ? compactOptionKey(value.entityId, value.accountId) : '';
  const selectionIsListed = options.some(
    (option) => compactOptionKey(option.entityId, option.accountId) === selectedKey
  );

  const placeholder = loading && options.length === 0
    ? `جارٍ تحميل ${category === 'CASH' ? 'الصناديق' : 'البنوك'}...`
    : error
      ? `تعذر تحميل ${category === 'CASH' ? 'الصناديق' : 'البنوك'}`
      : options.length === 0
        ? `سيُستخدم ${category === 'CASH' ? 'الصندوق' : 'البنك'} الافتراضي`
        : `اختر ${category === 'CASH' ? 'الصندوق' : 'البنك'}`;

  const handleChange = (next: string) => {
    if (!next) {
      onSelect(null);
      return;
    }
    const option = options.find(
      (item) => compactOptionKey(item.entityId, item.accountId) === next
    );
    if (!option) return;
    onSelect({
      entityId: option.entityId || '',
      accountId: option.accountId || '',
      label: option.name || option.code || (category === 'CASH' ? 'صندوق' : 'بنك'),
      accountCode: option.accountCode || null,
    });
  };

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-control border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Check size={13} className="shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <div className="truncate text-xs font-bold text-ink">{value.label}</div>
            <div className="text-[10px] text-ink-muted">
              الحساب المحاسبي: <span className="font-mono">{value.accountCode}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="shrink-0 rounded-lg border border-line-soft bg-white px-2 py-1 text-[10px] font-bold text-ink-muted transition hover:bg-surface-hover"
        >
          تغيير
        </button>
      </div>
    );
  }

  if (disabled) {
    return (
      <div
        className={`kayan-sheet-select ${error ? 'is-muted' : ''}`}
        title={error || gapMessage || (category === 'CASH' ? 'حساب الصندوق' : 'حساب البنك')}
      >
        <Calculator size={16} className="kayan-sheet-select-icon" aria-hidden="true" />
        <select
          value={selectedKey}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => {
            if (error) retry();
          }}
          disabled={disabled}
          aria-label={category === 'CASH' ? 'حساب الصندوق' : 'حساب البنك'}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option
              key={compactOptionKey(option.entityId, option.accountId)}
              value={compactOptionKey(option.entityId, option.accountId)}
            >
              {option.name || option.code || '—'}
              {option.accountCode ? ` — ${option.accountCode}` : ''}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="kayan-sheet-select-chevron" aria-hidden="true" />
      </div>
    );
  }

  const matches = options.filter((o) => {
    if (!debouncedSearch) return true;
    const hay = `${o.code || ''} ${o.name || ''} ${o.accountCode || ''} ${o.accountName || ''}`.toLowerCase();
    return hay.includes(debouncedSearch.toLowerCase());
  });

  const filteredMatches = debouncedSearch
    ? matches.filter((o) => {
        const hay = `${o.code || ''} ${o.name || ''} ${o.accountCode || ''} ${o.accountName || ''}`.toLowerCase();
        return hay.includes(debouncedSearch.toLowerCase());
      })
    : matches;

  return (
    <div className="space-y-2">
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder={category === 'CASH' ? 'ابحث بالاسم أو رقم الحساب في الصناديق...' : 'ابحث بالبنك أو رقم الحساب...'}
        disabled={disabled}
      />
      {loading && options.length === 0 && (
        <ListMessage tone="muted" icon={<Loader2 size={13} className="animate-spin" />}>
          جارٍ تحميل {category === 'CASH' ? 'الصناديق' : 'البنوك'}...
        </ListMessage>
      )}
      {error && <ListMessage tone="error" icon={<AlertTriangle size={13} />} onRetry={retry}>{error}</ListMessage>}
      {!error && !loading && !gapMessage && filteredMatches.length === 0 && (
        <ListMessage tone="muted" onRetry={retry}>
          لا توجد {category === 'CASH' ? 'صناديق' : 'حسابات بنكية'} مربوطة بحسابات محاسبية نشطة —
          سيُستخدم الافتراضي النظام (1101/1102) عند الحفظ بدل الاختيار.
        </ListMessage>
      )}
      {filteredMatches.length > 0 && (
        <div className="max-h-48 divide-y divide-line-soft overflow-y-auto rounded-control border border-line-soft bg-white">
          {filteredMatches.map((o, idx) => (
            <button
              key={`${o.entityId}-${idx}`}
              type="button"
              onClick={() =>
                onSelect({
                  entityId: o.entityId || '',
                  accountId: o.accountId || '',
                  label: `${o.name || o.code}`,
                  accountCode: o.accountCode || null,
                })
              }
              className="block w-full px-3 py-2 text-right transition hover:bg-surface-hover/70"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-ink">{o.name || '—'}</span>
                <span className="font-mono text-[10px] text-ink-muted">{o.code}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 text-[10px] text-ink-muted">
                <span>الحساب: {o.accountCode} — {o.accountName || ''}</span>
                {o.extra && <span>{o.extra}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
