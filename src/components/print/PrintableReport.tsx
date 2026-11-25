import React from 'react';
import { ReportHeader, type CompanyIdentity } from '../company/ReportHeader';

interface PrintableReportProps {
  company?: CompanyIdentity | null;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Show signature boxes at the bottom (for income statement / balance sheet) */
  signatures?: Array<{ label: string }>;
  /** KPI summary cards at the top */
  kpis?: Array<{ label: string; value: string; type?: 'profit' | 'loss' | 'debit' | 'credit' | 'neutral' }>;
  /** Whether the layout is balanced (shows green/red bar) */
  balanceStatus?: { isBalanced: boolean; debit: string; credit: string };
  /** Add print:hidden class to wrapper so it only shows when printing */
  printOnly?: boolean;
}

/**
 * PrintableReport — مكوّن التقرير المالي القابل للطباعة A4
 * 
 * يُستخدم داخل الصفحات المالية مع class `hidden print:block`
 * ثم يتم تفعيله عند window.print()
 * 
 * الكلاسات المُضافة من print-templates.css تضمن:
 * - هوامش صفحة A4 صحيحة
 * - تكرار رأس الجدول في كل صفحة
 * - تلوين صفوف بالتناوب
 * - تذييل ثابت مع ترقيم الصفحات
 */
export const PrintableReport: React.FC<PrintableReportProps> = ({
  company,
  title,
  subtitle,
  children,
  signatures,
  kpis,
  balanceStatus,
  printOnly = true,
}) => {
  const now = new Date().toLocaleDateString('ar-YE', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className={printOnly ? 'hidden print:block' : 'kayan-print-report'}>
      <div className="kayan-print-report kayan-print-body">
        {/* رأس التقرير بهوية الشركة */}
        <ReportHeader
          company={company}
          title={title}
          subtitle={subtitle}
        />

        {/* بطاقات المؤشرات المالية */}
        {kpis && kpis.length > 0 && (
          <div className="kayan-print-kpi-grid">
            {kpis.map((kpi, i) => (
              <div key={i} className="kayan-print-kpi-card">
                <div className="kayan-print-kpi-label">{kpi.label}</div>
                <div className={`kayan-print-kpi-value ${kpi.type || 'neutral'}`}>
                  {kpi.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* شريط حالة التوازن */}
        {balanceStatus && (
          <div className={`kayan-print-balance-bar ${!balanceStatus.isBalanced ? 'unbalanced' : ''}`}>
            <span className="label">
              {balanceStatus.isBalanced
                ? '✓ الميزان متوازن تماماً (Balanced)'
                : '⚠ تحذير: عدم توازن في الميزان'}
            </span>
            <div style={{ display: 'flex', gap: '16pt' }}>
              <span>مدين: <strong className="value">{balanceStatus.debit}</strong></span>
              <span>دائن: <strong className="value">{balanceStatus.credit}</strong></span>
            </div>
          </div>
        )}

        {/* محتوى التقرير */}
        {children}

        {/* مساحة التوقيعات */}
        {signatures && signatures.length > 0 && (
          <div className="kayan-print-signatures">
            {signatures.map((sig, i) => (
              <div key={i} className="kayan-print-signature-box">
                {sig.label}
              </div>
            ))}
          </div>
        )}

        {/* تذييل الصفحة */}
        <div className="kayan-print-footer">
          نظام كايان ERP 2026 — تاريخ الطباعة: {now}
          &nbsp;|&nbsp;
          صفحة <span className="kayan-print-page-num" />
        </div>
      </div>
    </div>
  );
};

export default PrintableReport;
