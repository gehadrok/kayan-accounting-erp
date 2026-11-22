import { ReportDefinition, formatReportValue } from './reportRegistry';

/**
 * PHASE 10.0 — identity for the standalone print window.
 *
 * This service renders its own document into a new window, so it cannot use the
 * React ReportHeader component. It receives the SAME profile object from the
 * central context and reuses the identical layout contract and CSS, so the PDF
 * output matches the in-app header rather than drifting from it.
 */
export interface PrintIdentity {
  nameAr: string;
  legalNameAr?: string | null;
  addressAr?: string | null;
  phone?: string | null;
  email?: string | null;
  taxNumber?: string | null;
  nameEn?: string | null;
  addressEn?: string | null;
  phoneEn?: string | null;
  emailEn?: string | null;
  website?: string | null;
  commercialRegistration?: string | null;
  logoUrl?: string | null;
}

/** Escapes text before it is interpolated into the print document. */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class ReportExportService {
  /**
   * Export report data to CSV with UTF-8 BOM for proper Arabic Excel compatibility
   */
  static exportToCsv(reportDef: ReportDefinition, data: any[], filtersApplied: Record<string, any> = {}) {
    if (!data || data.length === 0) {
      alert('لا توجد بيانات متاحة للتصدير');
      return;
    }

    const headers = reportDef.columns.map(c => `"${c.label}"`).join(',');
    // PHASE 10.5.1: data exports (CSV/XLSX) intentionally keep RAW values —
    // screen/preview/print apply the format settings, a CSV stays machine-
    // readable (canonical 2-decimal numbers, no separators or symbols).
    const rows = data.map(item => {
      return reportDef.columns.map(col => {
        let val = item[col.key];
        if (val === null || val === undefined) val = '';
        if (typeof val === 'number') {
          val = val.toFixed(2);
        }
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${reportDef.id}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Export report to formatted Excel / Spreadsheet XML table
   */
  static exportToXlsx(reportDef: ReportDefinition, data: any[], filtersApplied: Record<string, any> = {}) {
    if (!data || data.length === 0) {
      alert('لا توجد بيانات متاحة للتصدير');
      return;
    }

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: 'Cairo', Tahoma, sans-serif; direction: rtl; }
          table { border-collapse: collapse; width: 100%; }
          th { background-color: #1e3a8a; color: #ffffff; border: 1px solid #cbd5e1; padding: 8px; text-align: right; }
          td { border: 1px solid #cbd5e1; padding: 6px; text-align: right; mso-number-format:"\@"; }
          .title { font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #1e3a8a; }
          .meta { font-size: 11px; color: #64748b; margin-bottom: 15px; }
        </style>
      </head>
      <body>
        <div class="title">${reportDef.name}</div>
        <div class="meta">تاريخ التقرير: ${new Date().toLocaleString('ar-YE')} | نظام كيان المحاسبي ERP</div>
        <table>
          <thead>
            <tr>
              ${reportDef.columns.map(c => `<th>${c.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${/* PHASE 10.5.1: raw values on purpose — same policy as CSV. */ ''}
            ${data.map(item => `
              <tr>
                ${reportDef.columns.map(c => `<td>${item[c.key] !== undefined ? item[c.key] : ''}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportDef.id}_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Export to PDF (triggers print layout configured for PDF save)
   */
  static exportToPdf(reportDef: ReportDefinition, data: any[], filtersApplied: Record<string, any> = {}, identity?: PrintIdentity | null) {
    this.printReport(reportDef, data, filtersApplied, identity);
  }

  /**
   * Professional Print Preview & PDF Layout.
   * `identity` is the centrally-loaded company profile; when it is missing the
   * header degrades to an empty reserved layout (no invented company data).
   */
  static printReport(reportDef: ReportDefinition, data: any[], filtersApplied: Record<string, any> = {}, identity?: PrintIdentity | null) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('الرجاء السماح بفتح النوافذ المنبثقة للطباعة والمعاينة');
      return;
    }

    // PHASE 10.0: the logo is served over the API, so a relative URL must be
    // resolved against the app origin for the print window to load it.
    const id = identity || null;
    const logo = id?.logoUrl
      ? (id.logoUrl.startsWith('http') ? id.logoUrl : `${window.location.origin}${id.logoUrl}`)
      : null;

    const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>${reportDef.name} - نظام كيان ERP</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
          body {
            font-family: 'Cairo', sans-serif;
            margin: 0;
            padding: 20px;
            color: #1e293b;
            background: #ffffff;
            direction: rtl;
          }
          .header {
            position: relative;
            display: grid;
            /* PHYSICAL layout, decided once and shared with the in-app header:
               Arabic at the FAR RIGHT edge, logo dead-centre, English at the
               FAR LEFT edge. The print document is dir="rtl", where a grid's
               column 1 renders on the RIGHT — pinning the container to ltr is
               what makes the column numbers below mean "left/right" literally
               instead of logically. Each column then restores its own text
               direction, so Arabic still reads right-to-left. */
            direction: ltr;
            grid-template-columns: 1fr 120px 1fr;
            column-gap: 10px;
            align-items: start;
            border-bottom: 2px solid #1e3a8a;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .rh-col { min-width: 0; line-height: 1.55; }
          /* Both blocks are pinned to row 1. Placing them by grid-COLUMN alone
             lets grid auto-placement cascade them into separate rows (the next
             item cannot fit the column it was given in the row just filled, so
             it drops to the next row) — which is what pushed the English block
             BELOW the Arabic one instead of beside it. */
          .rh-ar { grid-column: 3; grid-row: 1; text-align: right; direction: rtl; }
          .rh-en { grid-column: 1; grid-row: 1; text-align: left; direction: ltr; }
          .rh-name { font-size: 15px; font-weight: 800; color: #0f172a; overflow-wrap: anywhere; }
          .rh-line { font-size: 10.5px; color: #64748b; overflow-wrap: anywhere; }
          .rh-logo-slot {
            position: absolute; top: 0; left: 50%; transform: translateX(-50%);
            width: 120px; display: flex; align-items: center; justify-content: center;
          }
          .rh-logo { max-width: 100%; max-height: 64px; width: auto; height: auto; object-fit: contain; }
          .report-meta {
            text-align: left;
            font-size: 12px;
            color: #475569;
          }
          .report-title {
            text-align: center;
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
            margin: 20px 0 10px 0;
          }
          .report-desc {
            text-align: center;
            font-size: 12px;
            color: #64748b;
            margin-bottom: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 12px;
          }
          th {
            background-color: #1e3a8a !important;
            color: white !important;
            padding: 10px 8px;
            border: 1px solid #1e3a8a;
            text-align: right;
            -webkit-print-color-adjust: exact;
          }
          td {
            padding: 8px;
            border: 1px solid #cbd5e1;
            text-align: right;
          }
          tr:nth-child(even) {
            background-color: #f8fafc;
          }
          .footer {
            margin-top: 40px;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #64748b;
            border-top: 1px solid #e2e8f0;
            padding-top: 15px;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="rh-col rh-ar" dir="rtl">
            <div class="rh-name">${esc(id?.nameAr || '')}</div>
            ${id?.addressAr ? `<div class="rh-line">${esc(id.addressAr)}</div>` : ''}
            ${id ? `<div class="rh-line">${esc([id.phone, id.email].filter(Boolean).join('  •  '))}</div>` : ''}
            ${id ? `<div class="rh-line">${esc([id.website, id.commercialRegistration && 'س.ت: ' + id.commercialRegistration].filter(Boolean).join('  •  '))}</div>` : ''}
            ${id?.taxNumber ? `<div class="rh-line">الرقم الضريبي: ${esc(id.taxNumber)}</div>` : ''}
          </div>
          <div class="rh-col rh-en" dir="ltr">
            <div class="rh-name">${esc(id?.nameEn || id?.nameAr || '')}</div>
            ${id ? `<div class="rh-line">${esc(id.addressEn || id.addressAr || '')}</div>` : ''}
            ${id ? `<div class="rh-line">${esc([id.phoneEn || id.phone, id.emailEn || id.email].filter(Boolean).join('  •  '))}</div>` : ''}
            ${id ? `<div class="rh-line">${esc([id.website, id.commercialRegistration && 'CR: ' + id.commercialRegistration].filter(Boolean).join('  •  '))}</div>` : ''}
            ${id?.taxNumber ? `<div class="rh-line">Tax No: ${esc(id.taxNumber)}</div>` : ''}
          </div>
          <div class="rh-logo-slot">
            ${logo ? `<img class="rh-logo" src="${esc(logo)}" alt="logo">` : ''}
          </div>
        </div>

        <div class="report-title">${esc(reportDef.name)}</div>
        <div class="report-desc">${esc(reportDef.description)}</div>

        <table>
          <thead>
            <tr>
              ${reportDef.columns.map(c => `<th>${c.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.map(row => `
              <tr>
                ${reportDef.columns.map(c => `<td>${row[c.key] !== undefined ? formatReportValue(row[c.key], c.format) : ''}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <div>المستخدم: النظام الإداري الموحد</div>
          <div>صفحة 1 من 1</div>
          <div>نظام كيان المحاسبي</div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  }
}
