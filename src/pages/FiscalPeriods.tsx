import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  Dialog,
  FormField,
  FormActions,
  Textarea,
  useToast,
} from '../components/ui';

interface FiscalPeriod {
  id: string;
  period_number: number;
  name: string;
  start_date: string;
  end_date: string;
  status: 'OPEN' | 'CLOSED' | string;
}

interface FiscalYear {
  id: string;
  name?: string;
  year?: string | number;
  start_date: string;
  end_date: string;
  is_closed: boolean;
}

interface ClosingCheck {
  isReadyToClose: boolean;
  overallStatus?: string;
  period?: { name?: string; startDate?: string; endDate?: string; status?: string };
  checks?: Array<{ key: string; title: string; passed: boolean; message: string }>;
}

export const FiscalPeriodsPage: React.FC = () => {
  const toast = useToast();
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [years, setYears] = useState<FiscalYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [closingCheck, setClosingCheck] = useState<ClosingCheck | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // تأكيد الإقفال / إعادة الفتح بنافذة مستقلة بدل confirm/prompt
  const [closeTarget, setCloseTarget] = useState<FiscalPeriod | null>(null);
  const [reopenTarget, setReopenTarget] = useState<FiscalPeriod | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resPeriods, resYears] = await Promise.all([
        fetch('/api/fiscal-periods'),
        fetch('/api/fiscal-years'),
      ]);
      if (!resPeriods.ok || !resYears.ok) {
        const failed = !resPeriods.ok ? resPeriods : resYears;
        const data = await failed.json().catch(() => ({}));
        throw new Error(data.error || `تعذر تحميل بيانات الفترات المالية (${failed.status})`);
      }
      setPeriods(await resPeriods.json());
      setYears(await resYears.json());
      setLoadError(null);
    } catch (err: any) {
      console.error('Error fetching fiscal periods:', err);
      setLoadError(err?.message || 'تعذر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const runPeriodCheck = async (periodId: string) => {
    try {
      setSelectedPeriodId(periodId);
      const res = await fetch(`/api/fiscal-periods/${periodId}/closing-check`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `تعذر تنفيذ فحص الإقفال (${res.status})`);
      }
      setClosingCheck(await res.json());
    } catch (err: any) {
      toast.error('تعذر تنفيذ فحص الإقفال', { description: err?.message });
    }
  };

  const handleClosePeriod = async (period: FiscalPeriod) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/fiscal-periods/${period.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'admin', notes: 'إقفال دوري معتمد للفترة' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error('فشل في إقفال الفترة', {
          description: err.error || `رفض الخادم الطلب (${res.status})`,
        });
        return;
      }
      toast.success('تم إقفال الفترة المالية', { description: period.name });
      setClosingCheck(null);
      setCloseTarget(null);
      await fetchData();
    } catch (err: any) {
      toast.error('تعذر الاتصال بالخادم', { description: err?.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenTarget) return;
    const reason = reopenReason.trim();
    if (!reason) {
      setReopenError('سبب إعادة الفتح مطلوب ويُسجّل في سجل التدقيق.');
      return;
    }
    try {
      setActionLoading(true);
      setReopenError(null);
      const res = await fetch(`/api/fiscal-periods/${reopenTarget.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setReopenError(err.error || `فشل في إعادة فتح الفترة (${res.status})`);
        return;
      }
      toast.success('تم إعادة فتح الفترة المالية', { description: reopenTarget.name });
      setClosingCheck(null);
      setReopenTarget(null);
      setReopenReason('');
      await fetchData();
    } catch (err: any) {
      setReopenError(err?.message || 'تعذر الاتصال بالخادم. لم تُفقد بياناتك.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-5 rounded-card border border-line shadow-k-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-control bg-brand text-white flex items-center justify-center shadow-k-xs">
            <Calendar size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-ink">إدارة السنوات والفترات المالية (Fiscal Periods)</h1>
            <p className="text-xs text-ink-muted font-medium">التحكم في فترات الإدخال والترحيل، الفحص المالي الآلي، والإقفال الدوري</p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchData}
          loading={loading}
          loadingText="جارٍ التحديث..."
        >
          تحديث
        </Button>
      </div>

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-state-danger/40 bg-state-danger-soft px-4 py-3 text-[13px] font-semibold text-ink-danger">
          <span>{loadError}</span>
          <Button variant="secondary" size="sm" onClick={fetchData}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {/* Fiscal Years Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {years.map((year) => (
          <div key={year.id} className="bg-surface p-5 rounded-card border border-line shadow-k-xs flex items-center justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-lg text-ink font-mono">{year.name || year.year}</h3>
                <span className={`px-2 py-0.5 rounded-pill text-[10px] font-bold ${
                  year.is_closed
                    ? 'bg-surface-sunken text-ink-muted'
                    : 'bg-state-success-soft text-ink-success border border-state-success/30'
                }`}>
                  {year.is_closed ? 'سنة مالية مقفلة' : 'سنة مالية جارية نشطة'}
                </span>
              </div>
              <p className="text-xs text-ink-muted font-mono mt-1">
                من {String(year.start_date).slice(0, 10)} إلى {String(year.end_date).slice(0, 10)}
              </p>
            </div>
            <div className="w-10 h-10 rounded-control bg-surface-muted flex items-center justify-center text-ink-muted">
              <Clock size={20} aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>

      {/* Periods List */}
      <div className="bg-surface rounded-card border border-line overflow-hidden shadow-k-xs">
        <div className="p-4 border-b border-line bg-surface-muted flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">الفترات المالية الشهرية (Monthly Fiscal Periods)</h2>
          <span className="text-xs text-ink-muted font-medium">إجمالي الفترات: {periods.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-surface-muted text-ink-muted font-bold border-b border-line">
              <tr>
                <th className="py-3 px-4">رقم الفترة</th>
                <th className="py-3 px-4">اسم الفترة</th>
                <th className="py-3 px-4 font-mono">تاريخ البداية</th>
                <th className="py-3 px-4 font-mono">تاريخ النهاية</th>
                <th className="py-3 px-4 text-center">حالة الفترة</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-ink-muted">
                    جاري تحميل الفترات المالية...
                  </td>
                </tr>
              ) : periods.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-ink-muted">
                    لا توجد فترات مالية معرفة
                  </td>
                </tr>
              ) : (
                periods.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-hover transition">
                    <td className="py-3 px-4 font-mono font-bold text-ink">
                      P-{String(p.period_number).padStart(2, '0')}
                    </td>
                    <td className="py-3 px-4 font-bold text-ink">{p.name}</td>
                    <td className="py-3 px-4 font-mono text-ink-muted">{String(p.start_date).slice(0, 10)}</td>
                    <td className="py-3 px-4 font-mono text-ink-muted">{String(p.end_date).slice(0, 10)}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill text-[10px] font-bold ${
                        p.status === 'OPEN'
                          ? 'bg-state-success-soft text-ink-success border border-state-success/30'
                          : 'bg-state-danger-soft text-ink-danger border border-state-danger/30'
                      }`}>
                        {p.status === 'OPEN' ? <Unlock size={11} aria-hidden="true" /> : <Lock size={11} aria-hidden="true" />}
                        {p.status === 'OPEN' ? 'مفتوحة للترحيل' : 'مقفلة (Closed)'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {p.status === 'OPEN' ? (
                          <>
                            <Button
                              variant="secondary"
                              size="xs"
                              onClick={() => runPeriodCheck(p.id)}
                              disabled={actionLoading}
                            >
                              فحص شروط الإقفال
                            </Button>
                            <Button
                              variant="danger"
                              size="xs"
                              icon={<Lock size={12} />}
                              onClick={() => setCloseTarget(p)}
                              disabled={actionLoading}
                            >
                              إقفال
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="secondary"
                            size="xs"
                            icon={<Unlock size={12} />}
                            onClick={() => {
                              setReopenTarget(p);
                              setReopenReason('');
                              setReopenError(null);
                            }}
                            disabled={actionLoading}
                          >
                            إعادة فتح
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Closing Check Results */}
      <Dialog
        open={Boolean(closingCheck)}
        onClose={() => setClosingCheck(null)}
        title="نتيجة الفحص المحاسبي لإقفال الفترة"
        icon={<ShieldCheck size={18} />}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClosingCheck(null)}>
              إغلاق
            </Button>
            {closingCheck?.isReadyToClose && selectedPeriodId && (
              <Button
                variant="danger"
                icon={<Lock size={14} />}
                onClick={() => {
                  const period = periods.find((p) => p.id === selectedPeriodId);
                  if (period) setCloseTarget(period);
                }}
              >
                تأكيد إقفال الفترة
              </Button>
            )}
          </>
        }
      >
        {closingCheck && (
          <div className="space-y-4 text-xs">
            <div className={`p-3 rounded-control border flex items-center gap-2 font-bold ${
              closingCheck.isReadyToClose
                ? 'bg-state-success-soft border-state-success/30 text-ink-success'
                : 'bg-state-danger-soft border-state-danger/30 text-ink-danger'
            }`}>
              {closingCheck.isReadyToClose ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
              <span>{closingCheck.isReadyToClose ? 'جميع الشروط مستوفاة للإقفال الآمن' : 'توجد موانع تمنع الإقفال'}</span>
            </div>

            {closingCheck.period && (
              <div className="flex flex-wrap justify-between gap-2 rounded-control border border-line bg-surface-muted px-3 py-2 font-mono">
                <span className="font-sans text-ink-muted">الفترة:</span>
                <span className="font-bold text-ink">
                  {closingCheck.period.name} ({String(closingCheck.period.startDate || '').slice(0, 10)} —{' '}
                  {String(closingCheck.period.endDate || '').slice(0, 10)})
                </span>
              </div>
            )}

            <ul className="space-y-2">
              {(closingCheck.checks || []).map((c) => (
                <li
                  key={c.key}
                  className={`rounded-control border px-3 py-2 ${
                    c.passed
                      ? 'border-line bg-surface-muted'
                      : 'border-state-danger/40 bg-state-danger-soft'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {c.passed ? (
                      <CheckCircle2 size={14} className="text-ink-success" aria-hidden="true" />
                    ) : (
                      <AlertCircle size={14} className="text-ink-danger" aria-hidden="true" />
                    )}
                    <span className="text-ink">{c.title}</span>
                  </div>
                  <p className={`mt-1 ps-6 ${c.passed ? 'text-ink-muted' : 'text-ink-danger'}`}>{c.message}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Dialog>

      {/* تأكيد الإقفال — يذكر اسم الفترة صراحةً */}
      <ConfirmDialog
        open={Boolean(closeTarget)}
        tone="danger"
        busy={actionLoading}
        title="تأكيد إقفال الفترة المالية"
        message={
          <>
            سيتم إقفال الفترة <strong>{closeTarget?.name}</strong> (
            {String(closeTarget?.start_date || '').slice(0, 10)} — {String(closeTarget?.end_date || '').slice(0, 10)}).
            لن يُسمح بترحيل قيود جديدة في تواريخها حتى تُعاد فتحها بسبب موثّق.
          </>
        }
        confirmLabel="إقفال الفترة"
        onCancel={() => setCloseTarget(null)}
        onConfirm={async () => {
          if (closeTarget) await handleClosePeriod(closeTarget);
        }}
      />

      {/* إعادة الفتح — سبب إلزامي يُسجَّل في التدقيق */}
      <Dialog
        open={Boolean(reopenTarget)}
        onClose={() => !actionLoading && setReopenTarget(null)}
        title={`إعادة فتح الفترة: ${reopenTarget?.name || ''}`}
        description="إعادة الفتح إجراء حسّاس يُسجَّل في سجل التدقيق بسبب موثّق."
        icon={<Unlock size={18} />}
        size="lg"
        dismissible={!actionLoading}
        footer={
          <FormActions className="w-full border-t-0 pt-0">
            <Button variant="secondary" onClick={() => setReopenTarget(null)} disabled={actionLoading}>
              إلغاء
            </Button>
            <Button
              type="submit"
              form="reopen-period-form"
              variant="primary"
              loading={actionLoading}
              loadingText="جارٍ إعادة الفتح..."
            >
              إعادة فتح الفترة
            </Button>
          </FormActions>
        }
      >
        <form id="reopen-period-form" onSubmit={handleReopenPeriod} className="space-y-4" noValidate>
          {reopenError && (
            <div role="alert" className="flex items-start gap-2 rounded-control border border-state-danger/40 bg-state-danger-soft px-3.5 py-3 text-[13px] font-medium text-ink-danger">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{reopenError}</span>
            </div>
          )}
          <FormField label="سبب إعادة الفتح" required hint="يظهر في سجل التدقيق ولا يمكن الحفظ بدونه">
            <Textarea
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="مثال: تصحيح قيد محاسبي مرحّل بالخطأ في الفترة"
            />
          </FormField>
        </form>
      </Dialog>
    </div>
  );
};
