import { ReportDefinition } from './reportRegistry';

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
  static exportToPdf(reportDef: ReportDefinition, data: any[], filtersApplied: Record<string, any> = {}) {
    this.printReport(reportDef, data, filtersApplied);
  }

  /**
   * Professional Print Preview & PDF Layout
   */
  static printReport(reportDef: ReportDefinition, data: any[], filtersApplied: Record<string, any> = {}) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('الرجاء السماح بفتح النوافذ المنبثقة للطباعة والمعاينة');
      return;
    }

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
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #1e3a8a;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .company-info h1 {
            font-size: 20px;
            color: #1e3a8a;
            margin: 0 0 5px 0;
          }
          .company-info p {
            font-size: 12px;
            color: #64748b;
            margin: 0;
          }
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
          <div class="company-info">
            <h1>شركة كيان للتجارة والتوزيع</h1>
            <p>نظام التخطيط المؤسسي ERP — المركز المالي والمحاسبي</p>
          </div>
          <div class="report-meta">
            <div><strong>تاريخ الإصدار:</strong> ${new Date().toLocaleDateString('ar-YE')}</div>
            <div><strong>الوقت:</strong> ${new Date().toLocaleTimeString('ar-YE')}</div>
          </div>
        </div>

        <div class="report-title">${reportDef.name}</div>
        <div class="report-desc">${reportDef.description}</div>

        <table>
          <thead>
            <tr>
              ${reportDef.columns.map(c => `<th>${c.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.map(row => `
              <tr>
                ${reportDef.columns.map(c => `<td>${row[c.key] !== undefined ? row[c.key] : ''}</td>`).join('')}
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
