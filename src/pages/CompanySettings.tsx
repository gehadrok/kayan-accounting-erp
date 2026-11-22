import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, Upload, Trash2, Save, X, Image as ImageIcon,
  CheckCircle2, AlertTriangle, RotateCcw, Eye,
} from 'lucide-react';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { ReportHeader } from '../components/company/ReportHeader';

interface FormState {
  nameAr: string;
  legalNameAr: string;
  addressAr: string;
  phone: string;
  email: string;
  taxNumber: string;
  nameEn: string;
  legalNameEn: string;
  addressEn: string;
  phoneEn: string;
  emailEn: string;
  website: string;
  commercialRegistration: string;
}

const EMPTY: FormState = {
  nameAr: '', legalNameAr: '', addressAr: '', phone: '', email: '', taxNumber: '',
  nameEn: '', legalNameEn: '', addressEn: '', phoneEn: '', emailEn: '',
  website: '', commercialRegistration: '',
};

const inputCls =
  'w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400';
const labelCls = 'block text-[11px] font-bold text-slate-600 mb-1';

/**
 * PHASE 10.0 — Company settings screen.
 *
 * Writes ONLY the bilingual identity fields. The logo has its own endpoints, so
 * saving the form can never overwrite or drop a stored logo.
 */
export const CompanySettingsPage: React.FC = () => {
  const { company, refresh, loading: profileLoading } = useCompanyProfile();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [saved, setSaved] = useState<FormState>(EMPTY);
  const [dirty, setDirty] = useState(false);

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [pendingRemove, setPendingRemove] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // PHASE 10.0.1 — session state. The write endpoints require a signed token,
  // so the screen needs a signed-in user before Save can work.
  const [session, setSession] = useState<{ username: string; fullName?: string } | null>(() => storedUser());
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginForm.username, password: loginForm.password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'فشل تسجيل الدخول');
      if (!data?.token) throw new Error('لم يُصدر الخادم رمز جلسة — لا يمكن حفظ الإعدادات');
      storeSession(data.token, data);
      setSession({ username: data.username, fullName: data.full_name });
      setLoginForm({ username: '', password: '' });
      setMessage({ text: 'تم تسجيل الدخول بنجاح — يمكنك الآن حفظ الإعدادات', type: 'success' });
    } catch (e: any) {
      setLoginError(e.message || 'فشل تسجيل الدخول');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setMessage({ text: 'تم تسجيل الخروج', type: 'success' });
  };

  // Hydrate the form from the central source exactly once per loaded profile.
  useEffect(() => {
    if (!company) return;
    const next: FormState = {
      nameAr: company.nameAr || '',
      legalNameAr: company.legalNameAr || '',
      addressAr: company.addressAr || '',
      phone: company.phone || '',
      email: company.email || '',
      taxNumber: company.taxNumber || '',
      nameEn: company.nameEn || '',
      legalNameEn: company.legalNameEn || '',
      addressEn: company.addressEn || '',
      phoneEn: company.phoneEn || '',
      emailEn: company.emailEn || '',
      website: company.website || '',
      commercialRegistration: company.commercialRegistration || '',
    };
    setForm(next);
    setSaved(next);
    setDirty(false);
    setPendingRemove(false);
    setLogoPreview(null);
    setLogoFile(null);
  }, [company]);

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setMessage(null);
  };

  const resetChanges = () => {
    setForm(saved);
    setDirty(false);
    setMessage({ text: 'تم التراجع عن التعديلات غير المحفوظة', type: 'success' });
  };

  // ---------------- logo handling ----------------
  const handleLogoPick = (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    setPendingRemove(false);

    // Client-side pre-check for a fast, friendly message. The SERVER still
    // re-validates the actual bytes — this never replaces it.
    const okType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
    if (!okType) {
      setMessage({ text: 'صيغة الملف غير مدعومة. المسموح: PNG أو JPEG أو WebP فقط', type: 'error' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ text: 'حجم الشعار يتجاوز 2 ميجابايت', type: 'error' });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async () => {
    if (!logoFile) return;
    setSavingLogo(true);
    setMessage(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
        reader.readAsDataURL(logoFile);
      });
      const data = await authedRequest('POST', '/api/company/logo', { data: base64 });
      setLogoFile(null);
      setLogoPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refresh();
      setMessage({ text: 'تم حفظ الشعار بنجاح', type: 'success' });
    } catch (e: any) {
      setMessage({ text: e.message || 'فشل رفع الشعار', type: 'error' });
    } finally {
      setSavingLogo(false);
    }
  };

  const removeLogo = async () => {
    setSavingLogo(true);
    setMessage(null);
    try {
      const data = await authedRequest('DELETE', '/api/company/logo');
      setLogoFile(null);
      setLogoPreview(null);
      setPendingRemove(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refresh();
      setMessage({ text: 'تم إزالة الشعار', type: 'success' });
    } catch (e: any) {
      setMessage({ text: e.message || 'فشل إزالة الشعار', type: 'error' });
    } finally {
      setSavingLogo(false);
    }
  };

  /**
   * Saves the profile through the ONE endpoint the server exposes:
   *   PUT /api/company/profile
   * Every supported field is sent explicitly, so a save never depends on the
   * server guessing intent. After the write the profile is RE-FETCHED and
   * compared against what was submitted, so a silent partial save is reported
   * as a failure instead of appearing to succeed.
   */
  const saveProfile = async () => {
    setSavingProfile(true);
    setMessage(null);
    try {
      const payload = {
        nameAr: form.nameAr,
        legalNameAr: form.legalNameAr,
        addressAr: form.addressAr,
        phone: form.phone,
        email: form.email,
        taxNumber: form.taxNumber,
        nameEn: form.nameEn,
        legalNameEn: form.legalNameEn,
        addressEn: form.addressEn,
        phoneEn: form.phoneEn,
        emailEn: form.emailEn,
        website: form.website,
        commercialRegistration: form.commercialRegistration,
      };

      const data = await authedRequest('PUT', '/api/company/profile', payload);

      // Re-fetch from the central source and verify it actually persisted.
      await refresh();
      const reread = (await (await fetch('/api/company/profile')).json()) as any;

      const submittedAr = form.nameAr.trim();
      if (reread?.nameAr !== submittedAr) {
        setMessage({
          text: `تعذر تأكيد الحفظ: القيمة المقروءة بعد الحفظ ("${reread?.nameAr ?? ''}") لا تطابق المُدخل ("${submittedAr}")`,
          type: 'error',
        });
        return;
      }

      setSaved(form);
      setDirty(false);
      setMessage({
        text: data?.profile ? 'تم حفظ بيانات الشركة بنجاح والتحقق منها' : 'تم حفظ بيانات الشركة بنجاح',
        type: 'success',
      });
    } catch (e: any) {
      setMessage({ text: e.message || 'فشل حفظ بيانات الشركة', type: 'error' });
    } finally {
      setSavingProfile(false);
    }
  };

  // Live preview identity: unsaved edits are previewed so the header the user
  // is about to publish is exactly what they see.
  const previewIdentity = useMemo(
    () => ({
      nameAr: form.nameAr || company?.nameAr || '',
      legalNameAr: form.legalNameAr || company?.legalNameAr || null,
      addressAr: form.addressAr || company?.addressAr || null,
      phone: form.phone || company?.phone || null,
      email: form.email || company?.email || null,
      taxNumber: form.taxNumber || company?.taxNumber || null,
      nameEn: form.nameEn || company?.nameEn || null,
      legalNameEn: form.legalNameEn || company?.legalNameEn || null,
      addressEn: form.addressEn || company?.addressEn || null,
      phoneEn: form.phoneEn || company?.phoneEn || null,
      emailEn: form.emailEn || company?.emailEn || null,
      website: form.website || company?.website || null,
      commercialRegistration: form.commercialRegistration || company?.commercialRegistration || null,
      logoUrl: logoPreview || company?.logoUrl || null,
    }),
    [form, company, logoPreview]
  );

  const displayedLogo = logoPreview || (pendingRemove ? null : company?.logoUrl || null);
  const stockConflict = useMemo(
    () => form.nameAr.trim().length > 0 && dirty,
    [form.nameAr, dirty]
  );

  return (
    <div dir="rtl" className="space-y-5">
      {/* ---------- page header ---------- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
            <Building2 size={19} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900">إعدادات الشركة</h1>
            <p className="text-[11px] text-slate-500">
              بيانات الشركة بالعربية والإنجليزية والشعار — تظهر تلقائيًا في الواجهة والتقارير المطبوعة
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 kayan-no-print">
          <button
            onClick={resetChanges}
            disabled={!dirty || savingProfile}
            className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <RotateCcw size={14} /> إلغاء التعديلات
          </button>
          <button
            onClick={saveProfile}
            disabled={!dirty || savingProfile || !session}
            title={!session ? 'سجّل الدخول أولًا حتى يتم التحقق من صلاحية الحفظ على الخادم' : undefined}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {savingProfile ? <RotateCcw size={14} className="animate-spin" /> : <Save size={14} />}
            {savingProfile ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
          </button>
        </div>
      </div>

      {/* ---------- sign-in (identity is proven by a server-issued token) ---------- */}
      {!session ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 kayan-no-print">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-700" />
            <span className="text-xs font-black text-amber-900">تسجيل الدخول مطلوب للحفظ</span>
          </div>
          <p className="text-[11px] text-amber-800 leading-5 mb-3">
            يحقّق الخادم صلاحية تعديل إعدادات الشركة مقابل رمز جلسة صادر عنه، ولا يقبل معرّف مستخدم مرسلًا من المتصفح.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <label className={labelCls}>اسم المستخدم</label>
              <input
                className={inputCls}
                dir="ltr"
                value={loginForm.username}
                onChange={(e) => setLoginForm((p) => ({ ...p, username: e.target.value }))}
                placeholder="admin"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className={labelCls}>كلمة المرور</label>
              <input
                type="password"
                className={inputCls}
                dir="ltr"
                value={loginForm.password}
                onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
              />
            </div>
            <button
              onClick={handleLogin}
              disabled={loggingIn || !loginForm.username || !loginForm.password}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1.5"
            >
              {loggingIn ? <RotateCcw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              دخول
            </button>
          </div>
          {loginError && <p className="text-[11px] font-bold text-rose-700 mt-2">{loginError}</p>}
        </div>
      ) : (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 kayan-no-print">
          <span className="text-[11px] font-bold text-emerald-800">
            مسجّل الدخول باسم: {session.fullName || session.username}
          </span>
          <button onClick={handleLogout} className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline">
            تسجيل الخروج
          </button>
        </div>
      )}

      {message && (
        <div
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold kayan-no-print ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ================= ARABIC ================= */}
        <section className="xl:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center gap-2">
              <span className="text-sm font-black">بيانات الشركة بالعربية</span>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className={labelCls}>اسم الشركة بالعربية *</label>
                <input className={inputCls} value={form.nameAr} onChange={(e) => setField('nameAr', e.target.value)} placeholder="مجموعة كيان العالمية" />
              </div>
              <div>
                <label className={labelCls}>الاسم القانوني (عربي)</label>
                <input className={inputCls} value={form.legalNameAr} onChange={(e) => setField('legalNameAr', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>العنوان (عربي)</label>
                <input className={inputCls} value={form.addressAr} onChange={(e) => setField('addressAr', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>الهاتف</label>
                  <input className={inputCls} dir="ltr" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="+967 7xx xxx xxx" />
                </div>
                <div>
                  <label className={labelCls}>البريد الإلكتروني</label>
                  <input className={inputCls} dir="ltr" value={form.email} onChange={(e) => setField('email', e.target.value)} />
                </div>
              </div>
              <div>
                <label className={labelCls}>الموقع الإلكتروني</label>
                <input className={inputCls} dir="ltr" value={form.website} onChange={(e) => setField('website', e.target.value)} placeholder="www.example.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>الرقم الضريبي</label>
                  <input className={inputCls} value={form.taxNumber} onChange={(e) => setField('taxNumber', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>السجل التجاري</label>
                  <input className={inputCls} value={form.commercialRegistration} onChange={(e) => setField('commercialRegistration', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= LOGO ================= */}
        <section className="xl:col-span-1">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-full">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center gap-2">
              <ImageIcon size={16} />
              <span className="text-sm font-black">شعار الشركة</span>
            </div>
            <div className="p-4 space-y-4">
              {/* Preview: a clean empty panel when there is no logo — never a
                  fabricated placeholder logo. */}
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 flex items-center justify-center p-6 min-h-[190px] kayan-no-print">
                {displayedLogo ? (
                  <img
                    src={displayedLogo}
                    alt="معاينة الشعار"
                    className="max-w-full max-h-[150px] w-auto h-auto object-contain"
                  />
                ) : (
                  <div className="text-center text-slate-400">
                    <ImageIcon size={34} className="mx-auto mb-2 opacity-50" />
                    <p className="text-[11px] font-bold">لا يوجد شعار محفوظ</p>
                    <p className="text-[10px] mt-0.5">سيُترك الموضع فارغًا في الترويسة</p>
                  </div>
                )}
              </div>

              <div className="space-y-2 kayan-no-print">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => handleLogoPick(e.target.files?.[0])}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Upload size={14} /> رفع شعار من الجهاز
                  </button>
                  {displayedLogo && (
                    <button
                      onClick={() => {
                        if (company?.logoUrl && !logoFile && !pendingRemove) { setPendingRemove(true); setMessage({ text: 'اضغط "تأكيد الإزالة" لحذف الشعار المحفوظ', type: 'error' }); }
                        else { setLogoFile(null); setLogoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }
                      }}
                      className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5"
                    >
                      <Trash2 size={14} /> إزالة
                    </button>
                  )}
                </div>

                {logoFile && (
                  <button
                    onClick={uploadLogo}
                    disabled={savingLogo}
                    className="w-full px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {savingLogo ? <RotateCcw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    {savingLogo ? 'جارٍ الرفع...' : 'تأكيد رفع الشعار'}
                  </button>
                )}

                {pendingRemove && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={removeLogo}
                      disabled={savingLogo}
                      className="flex-1 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
                    >
                      تأكيد الإزالة
                    </button>
                    <button
                      onClick={() => { setPendingRemove(false); setMessage(null); }}
                      className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold flex items-center gap-1.5"
                    >
                      <X size={14} /> تراجع
                    </button>
                  </div>
                )}

                <p className="text-[10px] text-slate-500 leading-5">
                  الصيغ المدعومة: PNG، JPEG، WebP — بحد أقصى 2 ميجابايت. يتم فحص محتوى الملف فعليًا على الخادم
                  (وليس الامتداد فقط)، وملفات SVG مرفوضة لأسباب أمنية. تُحفظ الشفافية ونسبة الأبعاد كما هي.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ================= ENGLISH ================= */}
        <section className="xl:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center gap-2">
              <span className="text-sm font-black">Company Details (English)</span>
            </div>
            <div className="p-4 space-y-3" dir="ltr">
              <div>
                <label className={`${labelCls} text-left`}>Company Name (English)</label>
                <input className={`${inputCls} text-left`} dir="ltr" value={form.nameEn} onChange={(e) => setField('nameEn', e.target.value)} placeholder="Kayan Global Group" />
              </div>
              <div>
                <label className={`${labelCls} text-left`}>Legal Name (English)</label>
                <input className={`${inputCls} text-left`} dir="ltr" value={form.legalNameEn} onChange={(e) => setField('legalNameEn', e.target.value)} />
              </div>
              <div>
                <label className={`${labelCls} text-left`}>Address (English)</label>
                <input className={`${inputCls} text-left`} dir="ltr" value={form.addressEn} onChange={(e) => setField('addressEn', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`${labelCls} text-left`}>Phone (English)</label>
                  <input className={`${inputCls} text-left`} dir="ltr" value={form.phoneEn} onChange={(e) => setField('phoneEn', e.target.value)} placeholder="Leave empty to reuse" />
                </div>
                <div>
                  <label className={`${labelCls} text-left`}>Email (English)</label>
                  <input className={`${inputCls} text-left`} dir="ltr" value={form.emailEn} onChange={(e) => setField('emailEn', e.target.value)} placeholder="Leave empty to reuse" />
                </div>
              </div>
              <p className="text-[10px] text-slate-500 leading-5 text-left">
                Phone, email, tax number and commercial registration are shared fields. Leave the English
                boxes empty to reuse the Arabic values shown on the LEFT of the report header.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* ================= LIVE HEADER PREVIEW ================= */}
      <section>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center gap-2 kayan-no-print">
            <Eye size={15} className="text-slate-600" />
            <span className="text-xs font-black text-slate-700">معاينة حية لترويسة التقرير</span>
            <span className="text-[10px] text-slate-500 mr-auto">
              الترتيب: العربية أقصى اليمين • الشعار في الوسط • الإنجليزية أقصى اليسار
            </span>
            {stockConflict && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5">
                معاينة غير محفوظة
              </span>
            )}
          </div>
          <div className="p-5">
            <ReportHeader company={previewIdentity} title="فاتورة مبيعات" subtitle="رقم: INV-2026-0001 — التاريخ: 2026-10-11" />
          </div>
        </div>
      </section>

      {profileLoading && (
        <p className="text-center text-xs text-slate-400 kayan-no-print">جارٍ تحميل بيانات الشركة...</p>
      )}
    </div>
  );
};

/**
 * PHASE 10.0.1 — session handling.
 *
 * The server issues a SIGNED token at /auth/login and the write endpoints accept
 * ONLY that token as proof of identity. A localStorage user id is NOT identity:
 * the previous version read `kayan_user` / `kayan_user_id`, which nothing in
 * this app ever writes, so every save failed — and trusting a browser-supplied
 * id would let any caller impersonate an administrator.
 */
const TOKEN_KEY = 'kayan_session_token';
const USER_KEY = 'kayan_user';

function storedToken(): string {
  try {
    return typeof localStorage !== 'undefined' ? (localStorage.getItem(TOKEN_KEY) || '') : '';
  } catch {
    return '';
  }
}

function storedUser(): { id: string; username: string; fullName?: string } | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(USER_KEY) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSession(token: string, user: any) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify({ id: user.id, username: user.username, fullName: user.full_name }));
  } catch { /* storage unavailable — the request still carries the token */ }
}

function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('kayan_company_scope');
    localStorage.removeItem('kayan_branch_scope');
  } catch { /* ignore */ }
  window.dispatchEvent(new Event('kayan:session-logout'));
}

/**
 * Authenticated write. Sends the bearer token and a clear message on 401 so a
 * stale session surfaces as "sign in again" rather than a silent failure.
 */
async function authedRequest(method: string, url: string, body?: any) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(storedToken() ? { Authorization: `Bearer ${storedToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearSession();
    throw new Error('انتهت الجلسة أو لم تسجّل الدخول — يُرجى إدخال بيانات الدخول أعلى الشاشة ثم الحفظ مرة أخرى.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `فشل الطلب (${res.status})`);
  return data;
}

export default CompanySettingsPage;