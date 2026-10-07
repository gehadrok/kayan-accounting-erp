import React from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { LookupProvider } from '../../context/LookupContext';
import { LookupDialog } from '../lookups/LookupDialog';

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  return (
    <LookupProvider>
      <div className="min-h-screen bg-slate-50 text-slate-800 antialiased overflow-x-hidden" dir="rtl">
        <Sidebar />
        <div className="mr-64 flex flex-col min-h-screen">
          <TopBar />
          <main className="p-5 flex-1">
            {children}
          </main>
        </div>
      </div>
      <LookupDialog />
    </LookupProvider>
  );
};
