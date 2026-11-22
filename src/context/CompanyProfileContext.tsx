import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CompanyIdentity } from '../components/company/ReportHeader';

export interface CompanyProfile extends CompanyIdentity {
  id: string;
  logoFileName: string | null;
}

interface CompanyProfileContextValue {
  company: CompanyProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<CompanyProfile | null>;
}

const CompanyProfileContext = createContext<CompanyProfileContextValue>({
  company: null,
  loading: true,
  error: null,
  refresh: async () => null,
});

/**
 * PHASE 10.0 — the single central source of company identity.
 *
 * Every screen (settings form, application shell, printable reports) reads the
 * profile from here, so identity is stored and changed in exactly one place.
 * One fetch per app load, not one per report.
 */
export const CompanyProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/company/profile');
      if (!res.ok) throw new Error('تعذر تحميل بيانات الشركة');
      const data = await res.json();
      setCompany(data);
      setError(null);
      return data as CompanyProfile;
    } catch (e: any) {
      setError(e.message || 'تعذر تحميل بيانات الشركة');
      setCompany(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ company, loading, error, refresh }), [company, loading, error, refresh]);

  return <CompanyProfileContext.Provider value={value}>{children}</CompanyProfileContext.Provider>;
};

export function useCompanyProfile() {
  return useContext(CompanyProfileContext);
}

export default CompanyProfileContext;