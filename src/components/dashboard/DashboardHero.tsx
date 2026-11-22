import React, { useMemo } from 'react';
import { CalendarDays, Building2, Sparkles } from 'lucide-react';
import { useCompanyProfile } from '../../context/CompanyProfileContext';
import { readSessionUser } from '../../utils/session';

/**
 * ترحيب لوحة التحكم — الخلفية رسم SVG محلي أصلي (public/dashboard-hero.svg)
 * لا رابط خارجي ولا صورة من بيانات وهمية. التاريخ من ساعة الجهاز، والشركة
 * من CompanyProfileContext، والاسم من جلسة kayan_user إن وُجدت.
 */
export const DashboardHero: React.FC = () => {
  const { company } = useCompanyProfile();

  const now = useMemo(() => new Date(), []);

  const gregorian = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('ar-YE-u-ca-gregory-nu-latn', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return formatter.format(now);
  }, [now]);

  const dateParts = useMemo(() => {
    const weekday = new Intl.DateTimeFormat('ar-YE-u-ca-gregory-nu-latn', {
      weekday: 'long',
    }).format(now);
    const day = new Intl.DateTimeFormat('ar-YE-u-ca-gregory-nu-latn', {
      day: 'numeric',
    }).format(now);
    const month = new Intl.DateTimeFormat('ar-YE-u-ca-gregory-nu-latn', {
      month: 'long',
    }).format(now);
    const year = new Intl.DateTimeFormat('ar-YE-u-ca-gregory-nu-latn', {
      year: 'numeric',
    }).format(now);
    return { weekday, day, month, year };
  }, [now]);

  const hijri = useMemo(
    () =>
      new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(now),
    [now]
  );

  const user = readSessionUser();
  const firstName = user?.fullName?.trim().split(/\s+/)[0];
  const title = firstName ? `مرحباً ${firstName} في كيان` : 'مرحباً بك في كيان';

  return (
    <section
      className="relative overflow-hidden rounded-card border border-line bg-surface shadow-k-xs"
      aria-labelledby="dashboard-hero-title"
    >
      {/* الرسم الأصلي — يظهر على يسار البانر ويذوب تدريجياً في سطح البطاقة */}
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[60%] sm:block" aria-hidden="true">
        <img
          src="/dashboard-hero.svg"
          alt=""
          className="h-full w-full object-cover object-left"
        />
        <div className="absolute inset-0 bg-linear-to-r from-transparent via-surface/20 to-surface" />
        <div className="absolute inset-0 bg-linear-to-t from-surface/55 via-transparent to-transparent" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16] sm:hidden"
        aria-hidden="true"
        style={{
          backgroundImage: 'url(/dashboard-hero.svg)',
          backgroundSize: 'cover',
          backgroundPosition: 'left center',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-linear-to-l from-brand-soft/70 via-transparent to-transparent" aria-hidden="true" />

      <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:min-h-[170px] lg:flex-row lg:items-end lg:justify-between lg:p-7">
        <div className="min-w-0 max-w-2xl text-start">
          <p className="inline-flex items-center gap-1.5 rounded-pill border border-brand/20 bg-brand-soft px-2.5 py-1 text-[10px] font-black tracking-[0.16em] text-brand">
            <Sparkles size={12} aria-hidden="true" />
            KAYAN · ACCOUNTING ERP
          </p>
          <h1
            id="dashboard-hero-title"
            className="mt-2.5 text-2xl font-black leading-tight tracking-tight text-ink sm:text-[30px]"
          >
            {title}
          </h1>
          <p className="mt-1.5 max-w-xl text-[13px] font-medium leading-relaxed text-ink-muted sm:text-sm">
            نظرة شاملة على أداء منشأتك اليوم — كل المؤشرات والجداول محدثة من بيانات النظام الفعلية.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-line bg-surface/85 px-2.5 py-1 text-[11px] font-semibold text-ink">
              <Building2 size={13} className="shrink-0 text-brand" aria-hidden="true" />
              <span className="truncate">{company?.nameAr || 'بيانات الشركة غير محمّلة'}</span>
            </span>
            <span className="hidden items-center gap-1.5 text-[11px] text-ink-muted sm:inline-flex">
              <CalendarDays size={13} aria-hidden="true" />
              {gregorian}
            </span>
          </div>
        </div>

        {/* بطاقة التاريخ — على اليسار في RTL كما في التصميم المرجعي */}
        <div className="w-full shrink-0 sm:max-w-[260px] lg:w-[250px]">
          <div className="rounded-card border border-line bg-surface/92 p-3.5 shadow-k-sm backdrop-blur">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand">
                <CalendarDays size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0 text-start">
                <p className="text-[11px] font-bold text-brand">{dateParts.weekday}</p>
                <p className="mt-0.5 text-sm font-extrabold leading-tight text-ink">
                  {dateParts.day} {dateParts.month} {dateParts.year}
                </p>
                <p className="mt-1 text-[10px] font-medium text-ink-muted">{hijri} هـ</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
