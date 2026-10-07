import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileCheck,
  ShieldAlert,
  ArrowRightLeft,
  Clock,
  Sparkles,
  BookOpen,
  Send,
  X,
  History,
  Building,
} from 'lucide-react';

export const PeriodClosingPage: React.FC = () => {
  const [periods, setPeriods] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [checklist, setChecklist] = useState<any>(null);

  // Modals
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showYearCloseModal, setShowYearCloseModal] = useState(false);

  // Form states
  const [closingNotes, setClosingNotes] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [forceClose, setForceClose] = useState(false);

  // Notification
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchPeriodsAndYears();
  }, []);

  const fetchPeriodsAndYears = async () => {
    setLoading(true);
    try {
      const pRes = await fetch('/api/accounting/fiscal-periods');
      if (pRes.ok) {
        const pData = await pRes.json();
        setPeriods(pData);
        if (pData.length > 0 && !selectedPeriod) {
          const current = pData.find((p: any) => p.status === 'OPEN' && p.period_number >= 10) || pData[0];
          setSelectedPeriod(current);
          fetchChecklist(current.id);
        }
      }
      const yRes = await fetch('/api/accounting/fiscal-years');
      if (yRes.ok) {
        setYears(await yRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchChecklist = async (periodId: string) => {
    try {
      const res = await fetch(`/api/fiscal-periods/${periodId}/closing-check`);
      if (res.ok) {
        setChecklist(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectPeriod = (period: any) => {
    setSelectedPeriod(period);
    fetchChecklist(period.id);
  };

  const handleClosePeriod = async () => {
    if (!selectedPeriod) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/fiscal-periods/${selectedPeriod.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'admin',
          notes: closingNotes,
          force: forceClose,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotification({ type: 'success', message: data.message || 'تم إقفال الفترة المالية بنجاح' });
        setShowCloseModal(false);
        setClosingNotes('');
        await fetchPeriodsAndYears();
        if (selectedPeriod) fetchChecklist(selectedPeriod.id);
      } else {
        setNotification({ type: 'error', message: data.error || 'فشل إقفال الفترة' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenPeriod = async () => {
    if (!selectedPeriod) return;
    if (!reopenReason || reopenReason.trim().length < 5) {
      setNotification({ type: 'error', message: 'يرجى كتابة سبب صريح ومفصل لإعادة فتح الفترة' });
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/fiscal-periods/${selectedPeriod.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'admin',
          reason: reopenReason,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotification({ type: 'success', message: data.message || 'تم إعادة فتح الفترة بنجاح' });
        setShowReopenModal(false);
        setReopenReason('');
        await fetchPeriodsAndYears();
        if (selectedPeriod) fetchChecklist(selectedPeriod.id);
      } else {
        setNotification({ type: 'error', message: data.error || 'فشل إعادة فتح الفترة' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseYear = async (yearId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/fiscal-years/${yearId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'admin' }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotification({ type: 'success', message: data.message || 'تم إقفال السنة المالية بنجاح' });
        setShowYearCloseModal(false);
        await fetchPeriodsAndYears();
      } else {
        setNotification({ type: 'error', message: data.error || 'فشل إقفال السنة المالية' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 select-text">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between shadow-xl ${
            notification.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/80 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            )}
            <span className="text-sm font-bold">{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="p-1 hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">إقفال الفترات والسنوات المالية</h1>
              <p className="text-sm text-slate-400 font-medium">
                إدارة دورة الإقفال الشهري والسنوي، قائمة التحقق، حماية الفترات المقفلة، وسجل التدقيق
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowYearCloseModal(true)}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-purple-600/30 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              إقفال السنة المالية (Year-End)
            </button>
            <button
              onClick={fetchPeriodsAndYears}
              disabled={loading}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              تحديث الفترات
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Periods Selector & Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Fiscal Periods Grid (1 to 12) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              الفترات المالية للسنة
            </h3>
            <span className="text-xs text-slate-400 font-semibold">{periods.length} فترات</span>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
            {periods.map((p) => {
              const isSelected = selectedPeriod?.id === p.id;
              const isClosed = p.status === 'CLOSED';
              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectPeriod(p)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-500/10'
                      : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                        isClosed ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {p.period_number}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-200">{p.name}</h4>
                      <p className="text-[11px] text-slate-400">
                        {p.start_date?.split('T')[0]} إلى {p.end_date?.split('T')[0]}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isClosed
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    {isClosed ? 'مقفلة' : 'مفتوحة'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Pre-Closing Checklist & Controls */}
        <div className="lg:col-span-2 space-y-6">
          {selectedPeriod ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
              {/* Active Period Status Banner */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white">{selectedPeriod.name}</h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        selectedPeriod.status === 'CLOSED'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {selectedPeriod.status === 'CLOSED' ? 'فترة مقفلة نظامياً' : 'فترة مفتوحة للترحيل'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    تاريخ البدء: {selectedPeriod.start_date?.split('T')[0]} | تاريخ الانتهاء:{' '}
                    {selectedPeriod.end_date?.split('T')[0]}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {selectedPeriod.status === 'CLOSED' ? (
                    <button
                      onClick={() => setShowReopenModal(true)}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-amber-600/20"
                    >
                      <Unlock className="w-4 h-4" />
                      إعادة فتح الفترة (Re-open)
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowCloseModal(true)}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-rose-600/20"
                    >
                      <Lock className="w-4 h-4" />
                      إقفال الفترة الشهرية
                    </button>
                  )}
                </div>
              </div>

              {/* Pre-Close Verification Checklist */}
              <div>
                <h4 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-blue-400" />
                  قائمة التحقق المالي لما قبل الإقفال (Pre-Closing Checklist)
                </h4>

                {checklist ? (
                  <div className="space-y-3">
                    {checklist.checks?.map((c: any) => (
                      <div
                        key={c.key}
                        className={`p-3.5 rounded-xl border flex items-center justify-between ${
                          c.passed
                            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                            : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {c.passed ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                          )}
                          <div>
                            <h5 className="text-xs font-bold text-slate-200">{c.title}</h5>
                            <p className="text-[11px] opacity-80 mt-0.5">{c.message}</p>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            c.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {c.passed ? 'مكتمل' : 'يحتاج تسوية'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 text-xs font-medium">
                    جاري تحميل قائمة التحقق المالي...
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
              يرجى اختيار فترة مالية من القائمة
            </div>
          )}
        </div>
      </div>

      {/* Modal: Close Period */}
      {showCloseModal && selectedPeriod && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-rose-500" />
                تأكيد إقفال الفترة: {selectedPeriod.name}
              </h3>
              <button onClick={() => setShowCloseModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              عند إقفال الفترة، سيقوم محرك الحماية المحاسبي بمنع أي عمليات إنشاء أو ترحيل أو تعديل لقيود بتاريخ يقع ضمن
              هذه الفترة (Closed Period Protection).
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">ملاحظات الإقفال</label>
              <textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                rows={3}
                placeholder="أدخل أي ملاحظات تدقيقية أو إدارية توثق حالة الإقفال..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowCloseModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                onClick={handleClosePeriod}
                disabled={actionLoading}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/30"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                إقفال الفترة رسمياً
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reopen Period */}
      {showReopenModal && selectedPeriod && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Unlock className="w-5 h-5 text-amber-500" />
                إعادة فتح الفترة المقفلة: {selectedPeriod.name}
              </h3>
              <button onClick={() => setShowReopenModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 leading-relaxed">
              ⚠️ تنبيه أمني وتدقيقي: تتطلب معايير الحوكمة المالية تسجيل سبب رسمي وصريح لإعادة فتح أي فترة مقفلة، وسيتم توثيق
              هذا الإجراء ومستخدمه في سجل التدقيق غير القابل للتعديل (Immutable Audit Trail).
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">سبب إعادة الفتح (إلزامي)</label>
              <textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                rows={3}
                placeholder="أدخل مبرر إعادة فتح الفترة (مثل: تسوية تدقيقية معتمدة من الإدارة المالية)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowReopenModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                onClick={handleReopenPeriod}
                disabled={actionLoading}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-600/30"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                تأكيد إعادة الفتح
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Year-End Closing */}
      {showYearCloseModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                إقفال السنة المالية (Fiscal Year-End Closing)
              </h3>
              <button onClick={() => setShowYearCloseModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              الإقفال السنوي يقوم تلقائياً بإنشاء قيد الإقفال السنوي وتصفير جميع حسابات النتيجة (الإيرادات والمصروفات)
              وترحيل صافي الربح / الخسارة إلى حساب الأرباح المبقاة (Retained Earnings 32)، وقفل السنة نهائياً.
            </p>

            <div className="space-y-3">
              {years.map((y) => (
                <div key={y.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                  <div>
                    <h5 className="font-bold text-sm text-white">{y.year_name}</h5>
                    <p className="text-xs text-slate-400">
                      {y.start_date?.split('T')[0]} إلى {y.end_date?.split('T')[0]}
                    </p>
                  </div>
                  {y.is_closed ? (
                    <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                      مقفل
                    </span>
                  ) : (
                    <button
                      onClick={() => handleCloseYear(y.id)}
                      disabled={actionLoading}
                      className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/30"
                    >
                      تنفيذ قيد الإقفال السنوي
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowYearCloseModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
