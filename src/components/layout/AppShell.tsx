import React, { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { LookupProvider } from '../../context/LookupContext';
import { LookupDialog } from '../lookups/LookupDialog';
import { useSettings } from '../../context/SettingsContext';
import { useNavigation } from '../../context/NavigationContext';

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  // PHASE 10.5.1 — layout direction follows the saved ui.direction setting
  // (applied to <html> by SettingsContext; mirrored here so the shell root
  // always agrees with it even if something overrides the document attr).
  const { getValue } = useSettings();
  const { currentRoute } = useNavigation();
  const dir = String(getValue('ui.direction', 'rtl')) === 'ltr' ? 'ltr' : 'rtl';
  const isVoucherRoute = currentRoute === '/sales/receipts' || currentRoute === '/purchasing/payments';

  // PHASE 10.6.2 — على الجوال تصبح القائمة لوحة منزلقة. تُغلق عند تغيير
  // الصفحة أو الضغط على Escape، ولا تحجز مساحة من المحتوى على الشاشات
  // الصغيرة. على سطح المكتب تبقى مثبتة كما كانت.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [currentRoute]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileSidebarOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileSidebarOpen]);

  return (
    <LookupProvider>
      {/* data-app-chrome: the sidebar/top bar are application chrome, never part
          of a printed report — src/index.css hides them in @media print. */}
      <div className={`kayan-app-shell min-h-screen overflow-x-hidden bg-page text-ink antialiased ${isVoucherRoute ? 'kayan-voucher-app' : ''}`} dir={dir}>
        <div data-app-chrome="true">
          <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
        </div>

        {mobileSidebarOpen && (
          <button
            type="button"
            aria-label="إغلاق القائمة الجانبية"
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
          />
        )}

        <div className="kayan-main-shell flex min-h-screen flex-col lg:mr-64">
          <div data-app-chrome="true">
            <TopBar onMenuClick={() => setMobileSidebarOpen(true)} />
          </div>
          <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-5 xl:p-6" data-print-root="true">
            {children}
          </main>
        </div>
      </div>
      <LookupDialog />
    </LookupProvider>
  );
};
