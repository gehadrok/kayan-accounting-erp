import React from 'react';

/**
 * PHASE 10.0 — shared bilingual report header.
 *
 * ONE component for every printable document and report, so the identity is
 * defined once and cannot drift between pages.
 *
 * LAYOUT CONTRACT (do not mirror — this order is fixed):
 *   LEFT   → Arabic   (dir=rtl, text aligned to the left inside its column)
 *   CENTER → logo     (horizontally centred on the PAGE)
 *   RIGHT  → English  (dir=ltr, text aligned to the right inside its column)
 *
 * Why the logo cannot move: it is absolutely positioned at `left: 50%` with a
 * -50% translate INSIDE a `position: relative` header that spans the full
 * page width. Its position is therefore derived from the page, never from the
 * space left over between the two text blocks. The text columns are laid out in
 * a grid whose middle track is a FIXED-width spacer, so a long Arabic name or a
 * long English name grows its own column inward only up to that reserved gap —
 * the logo stays exactly page-centred and the two sides can never collide.
 */

export interface CompanyIdentity {
  nameAr: string;
  legalNameAr?: string | null;
  addressAr?: string | null;
  phone?: string | null;
  email?: string | null;
  taxNumber?: string | null;
  nameEn?: string | null;
  legalNameEn?: string | null;
  addressEn?: string | null;
  phoneEn?: string | null;
  emailEn?: string | null;
  website?: string | null;
  commercialRegistration?: string | null;
  logoUrl?: string | null;
}

interface ReportHeaderProps {
  company?: CompanyIdentity | null;
  /** Report title rendered centred under the header rule. */
  title?: string;
  /** Optional document number / period line rendered under the title. */
  subtitle?: React.ReactNode;
  /** Compact variant for dense reports (statements, ledgers, listings). */
  compact?: boolean;
  className?: string;
}

/** English falls back to the Arabic value rather than leaving a blank column. */
function enOr(company: CompanyIdentity | null | undefined): {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
} {
  if (!company) return { name: '', address: null, phone: null, email: null };
  return {
    name: company.nameEn || company.nameAr || '',
    address: company.addressEn || company.addressAr || null,
    phone: company.phoneEn || company.phone || null,
    email: company.emailEn || company.email || null,
  };
}

function DetailLine({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <div className="kayan-rh-line">{children}</div>;
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  company,
  title,
  subtitle,
  compact = false,
  className = '',
}) => {
  const en = enOr(company);
  const nameAr = company?.nameAr || '';
  // When no logo is stored the slot stays EMPTY (no placeholder artwork, no
  // invented logo) — the reserved gap is simply clean whitespace.
  const logoUrl = company?.logoUrl || null;

  return (
    <div className={`kayan-report-header ${compact ? 'kayan-rh-compact' : ''} ${className}`}>
      <div className="kayan-rh-grid">
        {/* ---------------- LEFT: Arabic ---------------- */}
        <div className="kayan-rh-col kayan-rh-ar" dir="rtl">
          <div className="kayan-rh-name">{nameAr || 'اسم الشركة'}</div>
          {company?.legalNameAr && !compact && (
            <div className="kayan-rh-sub">{company.legalNameAr}</div>
          )}
          <DetailLine>{company?.addressAr}</DetailLine>
          <DetailLine>
            {[company?.phone, company?.email].filter(Boolean).join('  •  ')}
          </DetailLine>
          <DetailLine>
            {[company?.website, company?.commercialRegistration && `س.ت: ${company.commercialRegistration}`]
              .filter(Boolean)
              .join('  •  ')}
          </DetailLine>
          <DetailLine>{company?.taxNumber && `الرقم الضريبي: ${company.taxNumber}`}</DetailLine>
        </div>

        {/* ---- CENTRE: fixed reserved gap, keeps both sides away from the logo ---- */}
        <div className="kayan-rh-gap" aria-hidden="true" />

        {/* ---------------- RIGHT: English ---------------- */}
        <div className="kayan-rh-col kayan-rh-en" dir="ltr">
          <div className="kayan-rh-name">{en.name || '—'}</div>
          {company?.legalNameEn && !compact && (
            <div className="kayan-rh-sub">{company.legalNameEn}</div>
          )}
          <DetailLine>{en.address}</DetailLine>
          <DetailLine>{[en.phone, en.email].filter(Boolean).join('  •  ')}</DetailLine>
          <DetailLine>
            {[company?.website, company?.commercialRegistration && `CR: ${company.commercialRegistration}`]
              .filter(Boolean)
              .join('  •  ')}
          </DetailLine>
          <DetailLine>{company?.taxNumber && `Tax No: ${company.taxNumber}`}</DetailLine>
        </div>

        {/* ---- LOGO: absolutely centred on the PAGE, never on the leftover space ---- */}
        <div className="kayan-rh-logo-slot" aria-hidden={!logoUrl}>
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`شعار ${nameAr}`}
              className="kayan-rh-logo"
              /* Transparency and aspect ratio are preserved: the box is sized by
                 height and the image only ever scales down, never stretched or
                 cropped by object-fit. */
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
            />
          )}
        </div>
      </div>

      {title && <div className="kayan-rh-title">{title}</div>}
      {subtitle && <div className="kayan-rh-subtitle">{subtitle}</div>}
    </div>
  );
};

export default ReportHeader;