export interface Account {
  id: string;
  code: string;
  name: string;
  accountTypeId: string;
  accountTypeName?: string;
  level: number;
  isGroup: boolean;
  isActive: boolean;
  normalBalance: string;
  balance: number;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  periodName?: string;
  totalDebit: number;
  totalCredit: number;
  linesCount: number;
}

export async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch('/api/accounts');
  if (!res.ok) throw new Error('فشل جلب الحسابات');
  return res.json();
}

export async function fetchJournalEntries(): Promise<JournalEntry[]> {
  const res = await fetch('/api/journal-entries');
  if (!res.ok) throw new Error('فشل جلب القيود اليومية');
  return res.json();
}

export async function fetchTrialBalance() {
  const res = await fetch('/api/reports/trial-balance');
  if (!res.ok) throw new Error('فشل جلب ميزان المراجعة');
  return res.json();
}

export async function postJournalEntry(id: string) {
  const res = await fetch(`/api/journal-entries/${id}/post`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'فشل الترحيل');
  return data;
}

export async function reverseJournalEntry(id: string) {
  const res = await fetch(`/api/journal-entries/${id}/reverse`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'فشل عكس القيد');
  return data;
}
