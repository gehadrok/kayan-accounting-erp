import React from 'react';

interface ThermalReceiptProps {
  companyName: string;
  companyNameEn?: string;
  companyAddress?: string;
  companyPhone?: string;
  invoiceNumber: string;
  invoiceDate: string;
  cashierName?: string;
  branchName?: string;
  items: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    discount?: number;
    total: number;
  }>;
  subtotal: number;
  discountTotal?: number;
  taxAmount?: number;
  grandTotal: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod?: string;
  notes?: string;
  /** Add print:hidden class so it only shows when printing */
  printOnly?: boolean;
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * ThermalReceipt — قالب الإيصال الحراري 80mm لنقطة البيع
 *
 * الكلاسات من print-templates.css تضمن:
 * - عرض 72mm (صافي 80mm)
 * - خط monospace لمحاذاة الأعمدة
 * - فواصل dashed تقليدية
 */
export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({
  companyName,
  companyNameEn,
  companyAddress,
  companyPhone,
  invoiceNumber,
  invoiceDate,
  cashierName,
  branchName,
  items,
  subtotal,
  discountTotal,
  taxAmount,
  grandTotal,
  paidAmount,
  changeAmount,
  paymentMethod = 'نقدي',
  notes,
  printOnly = true,
}) => {
  const now = new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={printOnly ? 'hidden print:block' : ''}>
      <div className="kayan-thermal-receipt" dir="rtl">

        {/* ======== ترويسة الإيصال ======== */}
        <div className="kayan-thermal-header">
          <div className="kayan-thermal-company-name">{companyName}</div>
          {companyNameEn && (
            <div className="kayan-thermal-company-sub" dir="ltr">{companyNameEn}</div>
          )}
          {companyAddress && (
            <div className="kayan-thermal-company-sub">{companyAddress}</div>
          )}
          {companyPhone && (
            <div className="kayan-thermal-company-sub" dir="ltr">📞 {companyPhone}</div>
          )}
        </div>

        {/* ======== معلومات الفاتورة ======== */}
        <div className="kayan-thermal-info">
          <div className="kayan-thermal-info-row">
            <span className="kayan-thermal-info-label">فاتورة #</span>
            <span className="kayan-thermal-info-value" dir="ltr">{invoiceNumber}</span>
          </div>
          <div className="kayan-thermal-info-row">
            <span className="kayan-thermal-info-label">التاريخ</span>
            <span className="kayan-thermal-info-value">{invoiceDate} {now}</span>
          </div>
          {branchName && (
            <div className="kayan-thermal-info-row">
              <span className="kayan-thermal-info-label">الفرع</span>
              <span className="kayan-thermal-info-value">{branchName}</span>
            </div>
          )}
          {cashierName && (
            <div className="kayan-thermal-info-row">
              <span className="kayan-thermal-info-label">الكاشير</span>
              <span className="kayan-thermal-info-value">{cashierName}</span>
            </div>
          )}
        </div>

        <hr className="kayan-thermal-divider" />

        {/* ======== جدول الأصناف ======== */}
        <table className="kayan-thermal-items">
          <thead>
            <tr>
              <th style={{ width: '40%' }}>الصنف</th>
              <th className="col-qty">كمية</th>
              <th className="col-price">سعر</th>
              <th className="col-total">المجموع</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td style={{ fontSize: '7.5pt', wordBreak: 'break-word' }}>{item.name}</td>
                <td className="col-qty">{item.qty}</td>
                <td className="col-price" dir="ltr">{fmt(item.unitPrice)}</td>
                <td className="col-total" dir="ltr">{fmt(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <hr className="kayan-thermal-divider" />

        {/* ======== المجاميع ======== */}
        <table className="kayan-thermal-totals">
          <tbody>
            <tr>
              <td>المجموع الفرعي:</td>
              <td dir="ltr">{fmt(subtotal)} ر.ي</td>
            </tr>
            {discountTotal != null && discountTotal > 0 && (
              <tr>
                <td>الخصم:</td>
                <td dir="ltr">({fmt(discountTotal)}) ر.ي</td>
              </tr>
            )}
            {taxAmount != null && taxAmount > 0 && (
              <tr>
                <td>الضريبة (15%):</td>
                <td dir="ltr">{fmt(taxAmount)} ر.ي</td>
              </tr>
            )}
            <tr className="kayan-thermal-grand-total">
              <td>الإجمالي:</td>
              <td dir="ltr">{fmt(grandTotal)} ر.ي</td>
            </tr>
          </tbody>
        </table>

        {/* ======== تفاصيل الدفع ======== */}
        <div className="kayan-thermal-payment">
          <div className="kayan-thermal-payment-row">
            <span>طريقة الدفع:</span>
            <span>{paymentMethod}</span>
          </div>
          <div className="kayan-thermal-payment-row">
            <span>المبلغ المستلم:</span>
            <span dir="ltr">{fmt(paidAmount)} ر.ي</span>
          </div>
          <div className="kayan-thermal-payment-row kayan-thermal-change">
            <span>الباقي:</span>
            <span dir="ltr">{fmt(changeAmount)} ر.ي</span>
          </div>
        </div>

        {/* ======== ملاحظات ======== */}
        {notes && (
          <>
            <hr className="kayan-thermal-divider" />
            <div style={{ fontSize: '7.5pt', textAlign: 'center' }}>{notes}</div>
          </>
        )}

        {/* ======== ذيل الإيصال ======== */}
        <div className="kayan-thermal-footer">
          <div className="kayan-thermal-thanks">شكراً لزيارتكم 🙏</div>
          <div>نظام كايان ERP 2026</div>
          <div dir="ltr" style={{ fontSize: '7pt', marginTop: '2pt' }}>KAYAN ERP 2026</div>
        </div>

      </div>
    </div>
  );
};

export default ThermalReceipt;
