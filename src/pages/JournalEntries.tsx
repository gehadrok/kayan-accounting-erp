import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Filter,
  Keyboard,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  Trash2,
  X,
} from 'lucide-react';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { useSettings } from '../context/SettingsContext';
import { ReportHeader, type CompanyIdentity } from '../components/company/ReportHeader';
import { AccountAutocomplete } from '../components/lookups/AccountAutocomplete';
import {
  Button,
  Card,
  DatePicker,
  EmptyState,
  IconButton,
  Input,
  KpiCard,
  LoadingState,
  PageHeader,
  PageToolbar,
  StatusBadge,
} from '../components/ui';
import {
  DocumentActionBar,
  DocumentAuditCard,
  DocumentField,
  DocumentReadField,
  DocumentReadGrid,
  DocumentSummaryCard,
  type DocumentMode,
  type DocumentStatus,
  type SummaryRow,
} from '../components/documents';
import { matchesEntrySearch } from './journalEntrySearch';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type JournalStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  status: JournalStatus;
  total_debit: string;
  total_credit: string;
  source_id?: string;
  created_at: string;
  lines?: any[];
}

interface JournalEntryLine {
  id?: string;
  account_id?: string;
  accountCode?: string;
  accountName?: string;
  cost_center_id?: string;
  costCenterCode?: string;
  costCenterName?: string;
  description?: string;
  debit?: string | number;
  credit?: string | number;
  line_number?: number;
}

interface JournalEntryDetail {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  status: JournalStatus;
  source_id?: string;
  fiscal_period_id?: string;
  posted_at?: string | null;
  posted_by?: string | null;
  reversed_entry_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  createdByName?: string | null;
  updatedByName?: string | null;
  lines?: JournalEntryLine[];
}

interface FormLine {
  mainAccountId?: string;
  accountId: string;
  analyticalId?: string;
  costCenterId?: string;
  debit: number;
  credit: number;
  description: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function money(value: number | string | null | undefined): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

function dateOnly(value?: string | null): string {
  return value ? String(value).slice(0, 10) : '';
}

const STATUS_LABEL: Record<JournalStatus, string> = {
  DRAFT: 'مسودة',
  POSTED: 'مرحل',
  REVERSED: 'معكوس',
};

const EntryStatusBadge: React.FC<{ status: JournalStatus; size?: 'sm' | 'md' }> = ({
  status,
  size = 'md',
}) => {
  if (status === 'POSTED') {
    return (
      <StatusBadge tone="success" size={size} icon={<CheckCircle2 size={12} />}>
        {STATUS_LABEL[status]}
      </StatusBadge>
    );
  }
  if (status === 'REVERSED') {
    return (
      <StatusBadge tone="neutral" size={size} icon={<RotateCcw size={12} />}>
        {STATUS_LABEL[status]}
      </StatusBadge>
    );
  }
  return (
    <StatusBadge tone="warning" size={size} icon={<Clock size={12} />}>
      {STATUS_LABEL[status]}
    </StatusBadge>
  );
};

const emptyFormLines = (): FormLine[] => [
  { mainAccountId: '', accountId: '', analyticalId: '', costCenterId: '', debit: 0, credit: 0, description: '' },
  { mainAccountId: '', accountId: '', analyticalId: '', costCenterId: '', debit: 0, credit: 0, description: '' },
];

/* ------------------------------------------------------------------ */
/* Print template — ReportHeader + lines + totals                     */
/* ------------------------------------------------------------------ */

const JournalEntryPrint: React.FC<{
  entry: JournalEntryDetail;
  company: CompanyIdentity | null;
}> = ({ entry, company }) => {
  const lines = entry.lines || [];
  const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const balanced = difference < 0.001 && totalDebit > 0;

  return (
    <div className="bg-white p-8 text-slate-800" dir="rtl">
      <ReportHeader
        company={company}
        title={`قيد يومية رقم ${entry.entry_number}`}
        subtitle={
          <>
            التاريخ: <bdi dir="ltr">{dateOnly(entry.entry_date)}</bdi> • الحالة:{' '}
            {STATUS_LABEL[entry.status]} • المصدر: {entry.source_id || '—'}
          </>
        }
        compact
      />

      <div className="mt-6 rounded-xl border border-slate-200/80 bg-slate-50 p-4 text-xs">
        <span className="block font-bold text-slate-400">البيان العام للقيد:</span>
        <span className="mt-1 block text-sm font-bold text-slate-900">{entry.description}</span>
        <span className="mt-1 block text-slate-500">
          عدد السطور: {lines.length} — المصدر: {entry.source_id || '—'}
        </span>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-right text-xs">
          <thead className="border-b border-slate-200 bg-slate-100/70 font-bold text-slate-700">
            <tr>
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">كود الحساب</th>
              <th className="px-3 py-2.5">اسم الحساب</th>
              <th className="px-3 py-2.5">مركز التكلفة</th>
              <th className="px-3 py-2.5">بيان السطر</th>
              <th className="px-3 py-2.5 text-left">مدين</th>
              <th className="px-3 py-2.5 text-left">دائن</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, idx) => (
              <tr key={line.id || idx}>
                <td className="px-3 py-2.5 font-mono text-slate-400">{idx + 1}</td>
                <td className="px-3 py-2.5 font-mono font-bold text-blue-700">
                  {line.accountCode || '—'}
                </td>
                <td className="px-3 py-2.5 font-semibold text-slate-800">
                  {line.accountName || '—'}
                </td>
                <td className="px-3 py-2.5 text-slate-500">
                  {line.costCenterName ? `${line.costCenterCode || ''} ${line.costCenterName}` : '—'}
                </td>
                <td className="px-3 py-2.5 text-slate-500">{line.description || '—'}</td>
                <td className="px-3 py-2.5 text-left font-mono font-bold">
                  {Number(line.debit) > 0 ? money(line.debit) : '—'}
                </td>
                <td className="px-3 py-2.5 text-left font-mono font-bold">
                  {Number(line.credit) > 0 ? money(line.credit) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50 font-bold">
            <tr>
              <td colSpan={5} className="px-3 py-2.5">
                المجموع:
              </td>
              <td className="px-3 py-2.5 text-left font-mono text-blue-700">
                {money(totalDebit)}
              </td>
              <td className="px-3 py-2.5 text-left font-mono text-emerald-700">
                {money(totalCredit)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-5 flex justify-end">
        <div className="w-64 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>إجمالي المدين:</span>
            <span className="font-mono font-bold">{money(totalDebit)} ر.ي</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>إجمالي الدائن:</span>
            <span className="font-mono font-bold">{money(totalCredit)} ر.ي</span>
          </div>
          <div
            className={`flex justify-between border-t border-slate-300 pt-1.5 text-sm font-black ${
              balanced ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            <span>{balanced ? 'القيد متوازن — الفارق:' : 'القيد غير متوازن — الفارق:'}</span>
            <span className="font-mono">{money(difference)} ر.ي</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export const JournalEntriesPage: React.FC = () => {
  const { company } = useCompanyProfile();
  const { getValue } = useSettings();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // List Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | JournalStatus>('ALL');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  // Workspace state
  const [workspaceMode, setWorkspaceMode] = useState<DocumentMode | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntryDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Create Form State
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<FormLine[]>(emptyFormLines);

  // Keyboard navigation refs
  const lineRefs = useRef<Array<{
    account: HTMLInputElement | null;
    costCenter: HTMLSelectElement | null;
    desc: HTMLInputElement | null;
    debit: HTMLInputElement | null;
    credit: HTMLInputElement | null;
  }>>([]);

  const focusCell = useCallback((rowIdx: number, field: 'account' | 'costCenter' | 'desc' | 'debit' | 'credit') => {
    setTimeout(() => {
      const row = lineRefs.current[rowIdx];
      if (row && row[field]) {
        row[field]?.focus();
        if (row[field] instanceof HTMLInputElement) {
          (row[field] as HTMLInputElement).select();
        }
      }
    }, 15);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Data                                                             */
  /* ---------------------------------------------------------------- */

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const [resEntries, resAccounts, resCostCenters, resCustomers, resSuppliers] = await Promise.all([
        fetch('/api/journal-entries?limit=100'),
        fetch('/api/accounts'),
        fetch('/api/accounting/cost-centers'),
        fetch('/api/customers'),
        fetch('/api/suppliers'),
      ]);
      if (resEntries.ok) {
        const rows = await resEntries.json();
        setEntries(
          rows.map((r: any) => ({
            id: r.id,
            entry_number: r.entryNumber ?? r.entry_number,
            entry_date: r.entryDate ?? r.entry_date,
            description: r.description,
            status: r.status,
            total_debit: r.totalDebit ?? r.total_debit,
            total_credit: r.totalCredit ?? r.total_credit,
            source_id: r.sourceId ?? r.source_id,
            created_at: r.createdAt ?? r.created_at,
            lines: r.lines,
          }))
        );
      }
      if (resAccounts.ok) {
        setAccounts(await resAccounts.json());
      }
      if (resCostCenters.ok) {
        setCostCenters(await resCostCenters.json());
      }
      if (resCustomers.ok) {
        setCustomers(await resCustomers.json());
      }
      if (resSuppliers.ok) {
        setSuppliers(await resSuppliers.json());
      }
    } catch (err) {
      console.error('Error fetching journal entries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const viewEntryDetails = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/journal-entries/${id}`);
      if (res.ok) {
        setSelectedEntry(await res.json());
        setWorkspaceMode('view');
        setFormError(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      }
    } catch (err) {
      console.error('Error fetching entry details:', err);
    }
    return false;
  };

  /* ---------------------------------------------------------------- */
  /* Post / Reverse                                                   */
  /* ---------------------------------------------------------------- */

  const handlePostEntry = async (id: string) => {
    if (
      getValue('ui.confirm_before_post', true) &&
      !confirm('هل أنت متأكد من ترحيل هذا القيد المحاسبي؟ لا يمكن التراجع بعد الترحيل.')
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/journal-entries/${id}/post`, { method: 'POST' });
      if (res.ok) {
        await fetchEntries();
        if (selectedEntry?.id === id) {
          await viewEntryDetails(id);
        }
      } else {
        const err = await res.json();
        alert(err.error || 'فشل في ترحيل القيد');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReverseEntry = async (id: string) => {
    if (!confirm('هل أنت متأكد من عكس هذا القيد؟ سيتم إنشاء قيد عكسي تلقائياً.')) return;
    try {
      const res = await fetch(`/api/journal-entries/${id}/reverse`, { method: 'POST' });
      if (res.ok) {
        await fetchEntries();
        if (selectedEntry?.id === id) {
          await viewEntryDetails(id);
        }
      } else {
        const err = await res.json();
        alert(err.error || 'فشل في عكس القيد');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Create Form Logic                                                */
  /* ---------------------------------------------------------------- */

  const addLine = () => {
    const nextIdx = lines.length;
    setLines([...lines, { mainAccountId: '', accountId: '', analyticalId: '', costCenterId: '', debit: 0, credit: 0, description: '' }]);
    focusCell(nextIdx, 'account');
  };

  const removeLine = (idx: number) => {
    if (lines.length > 2) {
      setLines(lines.filter((_, i) => i !== idx));
    }
  };

  const updateLine = (idx: number, field: string, value: any) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const patchLine = (idx: number, patch: Partial<FormLine>) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...patch };
      return updated;
    });
  };

  // Main/Control accounts: group accounts or parent accounts up to level 4, plus 1103/2101
  const mainAccounts = accounts.filter((a) => {
    const isGrp = Boolean(a.isGroup ?? a.is_group);
    const lvl = Number(a.level || 0);
    return isGrp || lvl <= 4 || a.code === '1103' || a.code === '2101';
  });

  const getAnalyticalContext = (mainAccountId?: string) => {
    if (!mainAccountId) return { kind: 'FREE' as const, mainAcc: null, options: [] as any[] };
    const mainAcc = accounts.find((a) => a.id === mainAccountId) || null;
    if (!mainAcc) return { kind: 'FREE' as const, mainAcc: null, options: [] as any[] };

    const code = String(mainAcc.code || '');
    const name = String(mainAcc.name || '');

    if (code.startsWith('1103') || name.includes('عملاء') || name.includes('مدينون')) {
      return { kind: 'CUSTOMERS' as const, mainAcc, options: customers };
    }
    if (code.startsWith('2101') || name.includes('مورد') || name.includes('دائنون')) {
      return { kind: 'SUPPLIERS' as const, mainAcc, options: suppliers };
    }

    const childLeaves = accounts.filter((a) => {
      const isGrp = Boolean(a.isGroup ?? a.is_group);
      if (isGrp) return false;
      return a.parent_id === mainAcc.id || (code && String(a.code || '').startsWith(code) && a.id !== mainAcc.id);
    });

    if (childLeaves.length === 0 && !Boolean(mainAcc.isGroup ?? mainAcc.is_group)) {
      return { kind: 'LEAF_SELF' as const, mainAcc, options: [mainAcc] };
    }

    return { kind: 'SUB_ACCOUNTS' as const, mainAcc, options: childLeaves };
  };

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit as any) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit as any) || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.001 && totalDebit > 0;

  const handleAutoBalance = () => {
    const diff = totalDebit - totalCredit;
    if (Math.abs(diff) < 0.001) return;

    const lastIdx = lines.length - 1;
    const lastLine = lines[lastIdx];
    if (lastLine && Number(lastLine.debit) === 0 && Number(lastLine.credit) === 0) {
      if (diff > 0) {
        updateLine(lastIdx, 'credit', diff);
      } else {
        updateLine(lastIdx, 'debit', Math.abs(diff));
      }
      focusCell(lastIdx, 'account');
    } else {
      setLines([
        ...lines,
        {
          accountId: '',
          costCenterId: '',
          debit: diff < 0 ? Math.abs(diff) : 0,
          credit: diff > 0 ? diff : 0,
          description: description || 'موازنة القيد',
        },
      ]);
      focusCell(lines.length, 'account');
    }
  };

  useEffect(() => {
    if (workspaceMode !== 'create') return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        addLine();
      } else if (e.key === 'F9') {
        e.preventDefault();
        handleAutoBalance();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [workspaceMode, lines, description, totalDebit, totalCredit]);

  const canSaveEntry =
    isBalanced &&
    Boolean(entryDate) &&
    description.trim().length > 0 &&
    lines.length >= 2 &&
    lines.every((line) => Boolean(line.accountId));

  const createSaveReason = !isBalanced
    ? 'لا يمكن الحفظ: يجب أن يتساوى إجمالي المدين مع إجمالي الدائن وأن يكون أكبر من صفر.'
    : !entryDate
      ? 'تاريخ القيد مطلوب.'
      : !description.trim()
        ? 'البيان العام للقيد مطلوب.'
        : lines.some((line) => !line.accountId)
          ? 'يجب اختيار حساب لكل سطر في القيد.'
          : undefined;

  const resetForm = () => {
    setEntryDate(new Date().toISOString().split('T')[0]);
    setDescription('');
    setLines(emptyFormLines());
    setFormError(null);
  };

  const hasUnsavedCreate = () => {
    const today = new Date().toISOString().split('T')[0];
    if (entryDate !== today || description.trim().length > 0) return true;
    if (lines.length !== 2) return true;
    return lines.some(
      (line) =>
        Boolean(line.accountId) ||
        Number(line.debit) !== 0 ||
        Number(line.credit) !== 0 ||
        line.description.trim().length > 0
    );
  };

  const openNew = () => {
    if (workspaceMode === 'create' && hasUnsavedCreate()) {
      if (!confirm('ستُفقد التغييرات غير المحفوظة. هل تريد بدء قيد جديد؟')) return;
    }
    resetForm();
    setSelectedEntry(null);
    setWorkspaceMode('create');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExit = () => {
    if (workspaceMode === 'create' && hasUnsavedCreate()) {
      if (!confirm('ستُفقد التغييرات غير المحفوظة. هل تريد الخروج إلى قائمة القيود؟')) return;
    }
    setWorkspaceMode(null);
    setSelectedEntry(null);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreateEntry = async () => {
    if (!isBalanced) {
      setFormError('القيد غير متوازن! يجب أن يتساوى إجمالي المدين مع إجمالي الدائن.');
      return;
    }
    if (!entryDate || !description.trim()) {
      setFormError('يرجى إدخال تاريخ القيد والبيان العام.');
      return;
    }
    if (lines.some((line) => !line.accountId)) {
      setFormError('يرجى اختيار حساب لكل سطر في القيد.');
      return;
    }

    setFormError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/journal-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryDate,
          description,
          lines: lines.map((l) => ({
            accountId: l.accountId,
            costCenterId: l.costCenterId || undefined,
            debit: parseFloat(l.debit as any) || 0,
            credit: parseFloat(l.credit as any) || 0,
            description: l.description || description,
          })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل في إنشاء القيد');
      }

      const created = await res.json();
      setDescription('');
      setLines(emptyFormLines());
      await fetchEntries();

      const opened = await viewEntryDetails(created.id);
      if (!opened) {
        setWorkspaceMode(null);
      }
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Derived                                                          */
  /* ---------------------------------------------------------------- */

  const filteredEntries = entries.filter((entry) => {
    if (!matchesEntrySearch(entry, search)) return false;
    if (statusFilter !== 'ALL' && entry.status !== statusFilter) return false;
    const d = dateOnly(entry.entry_date);
    if (fromDateFilter && d < fromDateFilter) return false;
    if (toDateFilter && d > toDateFilter) return false;
    return true;
  });

  const postedCount = entries.filter((entry) => entry.status === 'POSTED').length;
  const draftCount = entries.filter((entry) => entry.status === 'DRAFT').length;
  const reversedCount = entries.filter((entry) => entry.status === 'REVERSED').length;

  const filteredTotalDebit = filteredEntries.reduce((s, e) => s + (Number(e.total_debit) || 0), 0);
  const filteredTotalCredit = filteredEntries.reduce((s, e) => s + (Number(e.total_credit) || 0), 0);

  /* ---------------------------------------------------------------- */
  /* Voucher Workspace (Full-Width Professional Layout)               */
  /* ---------------------------------------------------------------- */

  if (workspaceMode !== null) {
    const isCreate = workspaceMode === 'create';
    const isView = workspaceMode === 'view';
    const status = selectedEntry?.status;

    const detailLines = selectedEntry?.lines || [];
    const detailTotalDebit = detailLines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    const detailTotalCredit = detailLines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
    const detailDifference = Math.abs(detailTotalDebit - detailTotalCredit);
    const detailBalanced = detailDifference < 0.001 && detailTotalDebit > 0;

    const displayTotalDebit = isView ? detailTotalDebit : totalDebit;
    const displayTotalCredit = isView ? detailTotalCredit : totalCredit;
    const displayDifference = isView ? detailDifference : difference;
    const displayBalanced = isView ? detailBalanced : isBalanced;
    const displayLinesCount = isView ? detailLines.length : lines.length;

    const documentTitle = isCreate
      ? 'تحرير قيد يومية جديد'
      : `قيد يومية رقم ${selectedEntry?.entry_number || ''}`;

    const badge = isCreate ? (
      <StatusBadge tone="info">قيد جديد</StatusBadge>
    ) : status ? (
      <EntryStatusBadge status={status} />
    ) : null;

    const actionBarStatus: DocumentStatus | undefined =
      isView && (status === 'DRAFT' || status === 'POSTED') ? status : undefined;

    const summaryRows: SummaryRow[] = [
      { label: 'عدد السطور', value: `${displayLinesCount} سطر` },
      { label: 'إجمالي المدين', value: `${money(displayTotalDebit)} ر.ي` },
      { label: 'إجمالي الدائن', value: `${money(displayTotalCredit)} ر.ي` },
      {
        label: 'الفارق',
        value: `${money(displayDifference)} ر.ي`,
        tone: displayBalanced ? 'success' : 'danger',
      },
    ];

    const extraActions = isView ? (
      <>
        {status === 'DRAFT' && selectedEntry && (
          <Button
            variant="success"
            size="md"
            icon={<CheckCircle2 size={16} />}
            onClick={() => handlePostEntry(selectedEntry.id)}
          >
            ترحيل القيد
          </Button>
        )}
        {status === 'POSTED' && selectedEntry && (
          <Button
            variant="danger"
            size="md"
            icon={<RotateCcw size={16} />}
            onClick={() => handleReverseEntry(selectedEntry.id)}
          >
            عكس القيد
          </Button>
        )}
      </>
    ) : undefined;

    return (
      <div className="space-y-4 pb-10" dir="rtl">
        {/* Print-only document */}
        {isView && selectedEntry && (
          <div className="hidden print:block" data-document-print>
            <JournalEntryPrint entry={selectedEntry} company={company} />
          </div>
        )}

        {/* Workspace Top Header & Action Bar (hidden on print) */}
        <div className="print:hidden space-y-4">
          {/* Breadcrumbs + Title + Live Balance Status */}
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-k-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={handleExit}
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-muted text-ink-muted transition hover:bg-surface-hover hover:text-ink"
                title="العودة إلى سجل القيود"
              >
                <ChevronLeft size={18} className="rotate-180" />
              </button>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-black text-ink">{documentTitle}</h1>
                  {badge}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                      displayBalanced
                        ? 'border-state-success/30 bg-state-success-soft text-state-success'
                        : 'border-state-danger/30 bg-state-danger-soft text-state-danger'
                    }`}
                  >
                    {displayBalanced ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                    {displayBalanced ? 'متوازن 100%' : `غير متوازن (فارق: ${money(displayDifference)})`}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {isCreate
                    ? 'أدخل التاريخ والبيان ثم اختر الحسابات والمبالغ. القيد يحفظ فور تساوي المدين والدائن.'
                    : `التاريخ: ${dateOnly(selectedEntry?.entry_date)} • المصدر: ${selectedEntry?.source_id || '—'}`}
                </p>
              </div>
            </div>

            {/* Live Totals Pill */}
            <div className="flex items-center gap-4 rounded-xl border border-line bg-surface-muted/70 px-4 py-2 text-xs">
              <div>
                <span className="block text-[10px] font-semibold text-ink-muted">إجمالي المدين</span>
                <span className="kayan-numeric font-mono text-sm font-black text-blue-700">
                  {money(displayTotalDebit)}
                </span>
              </div>
              <div className="h-7 w-px bg-line" />
              <div>
                <span className="block text-[10px] font-semibold text-ink-muted">إجمالي الدائن</span>
                <span className="kayan-numeric font-mono text-sm font-black text-emerald-700">
                  {money(displayTotalCredit)}
                </span>
              </div>
              <div className="h-7 w-px bg-line" />
              <div>
                <span className="block text-[10px] font-semibold text-ink-muted">الفارق</span>
                <span
                  className={`kayan-numeric font-mono text-sm font-black ${
                    displayBalanced ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {money(displayDifference)}
                </span>
              </div>
            </div>
          </div>

          {/* Standard Document Action Bar */}
          <DocumentActionBar
            mode={workspaceMode}
            status={actionBarStatus}
            saving={isCreate && submitting}
            onNew={openNew}
            onEdit={() => undefined}
            onSave={isCreate ? handleCreateEntry : () => undefined}
            onPrint={isView ? () => window.print() : undefined}
            onArchive={() => undefined}
            onExit={handleExit}
            canEdit={false}
            editReason={
              isCreate
                ? 'لا يمكن تعديل قيد قبل حفظه. احفظ القيد ثم افتحه من قائمة القيود.'
                : 'تُصحح القيود المرحلة عبر إنشاء قيد عكسي للحفاظ على سلامة التدقيق.'
            }
            canSave={isCreate ? canSaveEntry : false}
            saveReason={
              isCreate
                ? createSaveReason || 'جاهز للحفظ'
                : 'وضع العرض للقراءة فقط؛ الحفظ متاح عند إنشاء قيد جديد.'
            }
            canPrint={isView}
            printReason="احفظ القيد أولاً ثم اطبع النسخة المحفوظة."
            canArchive={false}
            archiveReason="الأرشفة غير مدعومة لسجلات القيود المحاسبية."
            extraActions={extraActions}
          />

          {/* Error Notice */}
          {formError && (
            <div className="flex items-start gap-2 rounded-xl border border-state-danger/30 bg-state-danger-soft px-4 py-3 text-xs font-bold text-state-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Voucher Header Card — Full Width 12-Col Grid */}
          <Card
            title="بيانات رأس القيد"
            description={isCreate ? 'المعلومات الأساسية للسند المحاسبي' : 'بيانات القيد المحفوظة (للقراءة فقط)'}
          >
            {isView ? (
              <DocumentReadGrid columns={4}>
                <DocumentReadField label="رقم القيد" value={selectedEntry?.entry_number} numeric />
                <DocumentReadField label="تاريخ القيد" value={dateOnly(selectedEntry?.entry_date)} numeric />
                <DocumentReadField label="المصدر" value={selectedEntry?.source_id || '—'} />
                <DocumentReadField
                  label="الحالة"
                  value={status ? <EntryStatusBadge status={status} size="sm" /> : '—'}
                />
                <DocumentReadField
                  label="البيان العام للقيد"
                  className="sm:col-span-4"
                  value={selectedEntry?.description}
                />
              </DocumentReadGrid>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="md:col-span-2">
                  <DocumentField label="رقم القيد">
                    <div className="flex h-9 items-center rounded-control border border-line bg-surface-muted px-3 font-mono text-xs font-bold text-ink-muted">
                      تلقائي عند الحفظ
                    </div>
                  </DocumentField>
                </div>

                <div className="md:col-span-3">
                  <DocumentField label="تاريخ القيد" required>
                    <DatePicker
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
                    />
                  </DocumentField>
                </div>

                <div className="md:col-span-2">
                  <DocumentField label="المصدر">
                    <div className="flex h-9 items-center rounded-control border border-line bg-surface-muted px-3 font-mono text-xs font-bold text-ink-muted">
                      GL (يدوي)
                    </div>
                  </DocumentField>
                </div>

                <div className="md:col-span-5">
                  <DocumentField label="البيان العام للقيد" required>
                    <Input
                      type="text"
                      placeholder="اكتب شرحاً واضحاً للعملية المحاسبية..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </DocumentField>
                </div>
              </div>
            )}
          </Card>

          {/* Full-Width Accounting Grid */}
          {isView ? (
            <Card
              flush
              title="جدول أطراف القيد المحاسبي"
              description={`${detailLines.length} سطر مسجّل`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-line bg-surface-muted font-bold text-ink-muted">
                    <tr>
                      <th className="w-12 px-4 py-3 text-center">#</th>
                      <th className="w-32 px-3 py-3">كود الحساب</th>
                      <th className="px-3 py-3">اسم الحساب</th>
                      <th className="w-48 px-3 py-3">مركز التكلفة</th>
                      <th className="px-3 py-3">بيان السطر</th>
                      <th className="w-36 bg-blue-50/60 px-4 py-3 text-end text-blue-800">مدين (ر.ي)</th>
                      <th className="w-36 bg-emerald-50/60 px-4 py-3 text-end text-emerald-800">دائن (ر.ي)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft text-ink">
                    {detailLines.map((line, idx) => (
                      <tr key={line.id || idx} className="transition-colors hover:bg-surface-hover/50">
                        <td className="px-4 py-3 text-center font-mono text-ink-muted">{idx + 1}</td>
                        <td className="px-3 py-3 font-mono font-bold text-brand">
                          {line.accountCode || '—'}
                        </td>
                        <td className="px-3 py-3 font-semibold text-ink">
                          {line.accountName || '—'}
                        </td>
                        <td className="px-3 py-3 text-ink-muted">
                          {line.costCenterName ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-muted px-2 py-0.5 text-[11px] text-ink">
                              <span className="font-mono font-bold text-brand">{line.costCenterCode}</span>
                              <span>{line.costCenterName}</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-3 text-ink-muted">{line.description || '—'}</td>
                        <td className="kayan-numeric bg-blue-50/20 px-4 py-3 text-end font-mono font-bold text-blue-800">
                          {Number(line.debit) > 0 ? money(line.debit) : '—'}
                        </td>
                        <td className="kayan-numeric bg-emerald-50/20 px-4 py-3 text-end font-mono font-bold text-emerald-800">
                          {Number(line.credit) > 0 ? money(line.credit) : '—'}
                        </td>
                      </tr>
                    ))}
                    {detailLines.length === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState
                            icon={<FileSpreadsheet size={30} />}
                            title="لا توجد سطور محفوظة"
                            description="لم تُسجَّل سطور على هذا القيد."
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="border-t-2 border-line bg-surface-muted font-bold text-ink">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-left">
                        الإجمالي العام للقيد:
                      </td>
                      <td className="kayan-numeric bg-blue-50/50 px-4 py-3 text-end font-mono text-sm font-black text-blue-800">
                        {money(detailTotalDebit)}
                      </td>
                      <td className="kayan-numeric bg-emerald-50/50 px-4 py-3 text-end font-mono text-sm font-black text-emerald-800">
                        {money(detailTotalCredit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          ) : (
            <Card
              flush
              title="جدول أطراف القيد المحاسبي"
              description={`${lines.length} سطور — تنقّل بسرعة عبر لوحة المفاتيح`}
              actions={
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Scale size={14} />}
                    onClick={handleAutoBalance}
                    title="موازنة القيد آلياً وحساب الفارق (F9)"
                  >
                    موازنة القيد (F9)
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Plus size={14} />}
                    onClick={addLine}
                    title="إضافة سطر جديد (F2)"
                  >
                    إضافة سطر (F2)
                  </Button>
                </div>
              }
            >
              {/* Keyboard Shortcuts Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft bg-surface-muted/60 px-4 py-2 text-[11px] text-ink-muted">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1 font-bold text-ink">
                    <Keyboard size={13} className="text-brand" />
                    اختصارات المحاسب:
                  </span>
                  <span>
                    <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> انتقال للخلية التالية
                  </span>
                  <span>
                    <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px]">F4</kbd> فتح دليل الحسابات
                  </span>
                  <span>
                    <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px]">F9</kbd> موازنة تلقائية
                  </span>
                  <span>
                    <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px]">F2</kbd> سطر جديد
                  </span>
                </div>
                <span className="font-mono text-[10px] font-bold text-ink-muted">العملة: YER</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-line bg-surface-muted font-bold text-ink-muted">
                    <tr>
                      <th className="w-9 px-2 py-3 text-center">#</th>
                      <th className="min-w-[190px] px-2 py-3">الحساب الرئيسي</th>
                      <th className="min-w-[210px] px-2 py-3">الحساب التحليلي (الفرعي)</th>
                      <th className="w-36 px-2 py-3">مركز التكلفة</th>
                      <th className="min-w-[140px] px-2 py-3">بيان السطر</th>
                      <th className="w-28 bg-blue-50/60 px-2 py-3 text-end text-blue-800">مدين (ر.ي)</th>
                      <th className="w-28 bg-emerald-50/60 px-2 py-3 text-end text-emerald-800">دائن (ر.ي)</th>
                      <th className="w-10 px-1 py-3 text-center" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {lines.map((line, idx) => {
                      const ctx = getAnalyticalContext(line.mainAccountId);
                      return (
                      <tr key={idx} className="transition-colors hover:bg-surface-hover/40">
                        <td className="px-2 py-2 text-center font-mono font-semibold text-ink-muted">
                          {idx + 1}
                        </td>
                        <td className="px-1.5 py-2">
                          <select
                            value={line.mainAccountId || ''}
                            onChange={(e) => {
                              const mId = e.target.value;
                              const nextCtx = getAnalyticalContext(mId);
                              if (!mId) {
                                patchLine(idx, { mainAccountId: '', analyticalId: '', accountId: '' });
                              } else if (nextCtx.kind === 'LEAF_SELF' && nextCtx.mainAcc) {
                                patchLine(idx, {
                                  mainAccountId: mId,
                                  analyticalId: nextCtx.mainAcc.id,
                                  accountId: nextCtx.mainAcc.id,
                                });
                              } else {
                                patchLine(idx, {
                                  mainAccountId: mId,
                                  analyticalId: '',
                                  accountId: '',
                                });
                              }
                            }}
                            className="h-9 w-full rounded-control border border-line bg-surface px-2 text-xs text-ink transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                          >
                            <option value="">-- بحث حر في الدليل --</option>
                            {mainAccounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1.5 py-2">
                          {ctx.kind === 'CUSTOMERS' ? (
                            <select
                              value={line.analyticalId || ''}
                              onChange={(e) => {
                                const custId = e.target.value;
                                const cust = customers.find((c) => c.id === custId);
                                if (cust) {
                                  const targetAccId = cust.receivables_account_id || ctx.mainAcc?.id || '';
                                  patchLine(idx, {
                                    analyticalId: cust.id,
                                    accountId: targetAccId,
                                    description: line.description || `عميل: ${cust.name}`,
                                  });
                                  focusCell(idx, 'costCenter');
                                } else {
                                  patchLine(idx, { analyticalId: '', accountId: '' });
                                }
                              }}
                              className="h-9 w-full rounded-control border border-blue-300 bg-blue-50/30 px-2 text-xs font-semibold text-ink transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                            >
                              <option value="">-- اختر العميل ({customers.length}) --</option>
                              {customers.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.code} - {c.name}
                                </option>
                              ))}
                            </select>
                          ) : ctx.kind === 'SUPPLIERS' ? (
                            <select
                              value={line.analyticalId || ''}
                              onChange={(e) => {
                                const suppId = e.target.value;
                                const supp = suppliers.find((s) => s.id === suppId);
                                if (supp) {
                                  const targetAccId = supp.payables_account_id || ctx.mainAcc?.id || '';
                                  patchLine(idx, {
                                    analyticalId: supp.id,
                                    accountId: targetAccId,
                                    description: line.description || `مورد: ${supp.name}`,
                                  });
                                  focusCell(idx, 'costCenter');
                                } else {
                                  patchLine(idx, { analyticalId: '', accountId: '' });
                                }
                              }}
                              className="h-9 w-full rounded-control border border-amber-300 bg-amber-50/30 px-2 text-xs font-semibold text-ink transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                            >
                              <option value="">-- اختر المورد ({suppliers.length}) --</option>
                              {suppliers.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.code} - {s.name}
                                </option>
                              ))}
                            </select>
                          ) : ctx.kind === 'SUB_ACCOUNTS' || ctx.kind === 'LEAF_SELF' ? (
                            <select
                              value={line.accountId || ''}
                              onChange={(e) => {
                                const accId = e.target.value;
                                patchLine(idx, { analyticalId: accId, accountId: accId });
                                if (accId) focusCell(idx, 'costCenter');
                              }}
                              className="h-9 w-full rounded-control border border-line bg-surface px-2 text-xs text-ink transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                            >
                              <option value="">-- اختر الحساب التحليلي ({ctx.options.length}) --</option>
                              {ctx.options.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.code} - {a.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <AccountAutocomplete
                              accounts={accounts}
                              value={line.accountId}
                              inputRef={{
                                get current() {
                                  return lineRefs.current[idx]?.account || null;
                                },
                                set current(el) {
                                  if (!lineRefs.current[idx]) lineRefs.current[idx] = {} as any;
                                  lineRefs.current[idx].account = el;
                                },
                              }}
                              onChange={(accId, acc) => {
                                updateLine(idx, 'accountId', accId);
                                if (acc) {
                                  focusCell(idx, 'costCenter');
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  focusCell(idx, 'costCenter');
                                }
                              }}
                            />
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <select
                            ref={(el) => {
                              if (!lineRefs.current[idx]) lineRefs.current[idx] = {} as any;
                              lineRefs.current[idx].costCenter = el;
                            }}
                            value={line.costCenterId || ''}
                            onChange={(e) => updateLine(idx, 'costCenterId', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                focusCell(idx, 'desc');
                              }
                            }}
                            className="h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                          >
                            <option value="">-- بدون مركز --</option>
                            {costCenters.map((cc) => (
                              <option key={cc.id} value={cc.id}>
                                {cc.code} - {cc.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            ref={(el) => {
                              if (!lineRefs.current[idx]) lineRefs.current[idx] = {} as any;
                              lineRefs.current[idx].desc = el;
                            }}
                            type="text"
                            placeholder="بيان فرعي (اختياري)"
                            value={line.description}
                            onChange={(e) => updateLine(idx, 'description', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                focusCell(idx, 'debit');
                              }
                            }}
                            className="h-9 w-full rounded-control border border-line bg-surface px-3 text-xs text-ink transition-colors placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                          />
                        </td>
                        <td className="bg-blue-50/15 px-2 py-2">
                          <input
                            ref={(el) => {
                              if (!lineRefs.current[idx]) lineRefs.current[idx] = {} as any;
                              lineRefs.current[idx].debit = el;
                            }}
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={line.debit || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              updateLine(idx, 'debit', val);
                              if (val > 0 && line.credit) {
                                updateLine(idx, 'credit', 0);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = parseFloat(line.debit as any) || 0;
                                if (val > 0) {
                                  updateLine(idx, 'credit', 0);
                                  if (idx === lines.length - 1) {
                                    const curDebit = lines.reduce((s, l, i) => s + (i === idx ? val : (parseFloat(l.debit as any) || 0)), 0);
                                    const curCredit = lines.reduce((s, l, i) => s + (i === idx ? 0 : (parseFloat(l.credit as any) || 0)), 0);
                                    const diff = curDebit - curCredit;
                                    const nextCredit = diff > 0 ? diff : 0;
                                    setLines((prev) => [
                                      ...prev,
                                      { accountId: '', costCenterId: '', debit: 0, credit: nextCredit, description: line.description || description },
                                    ]);
                                    focusCell(idx + 1, 'account');
                                  } else {
                                    focusCell(idx + 1, 'account');
                                  }
                                } else {
                                  focusCell(idx, 'credit');
                                }
                              }
                            }}
                            className="h-9 w-full rounded-control border border-line bg-surface px-2.5 text-end font-mono text-xs font-bold text-blue-800 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="bg-emerald-50/15 px-2 py-2">
                          <input
                            ref={(el) => {
                              if (!lineRefs.current[idx]) lineRefs.current[idx] = {} as any;
                              lineRefs.current[idx].credit = el;
                            }}
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={line.credit || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              updateLine(idx, 'credit', val);
                              if (val > 0 && line.debit) {
                                updateLine(idx, 'debit', 0);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = parseFloat(line.credit as any) || 0;
                                if (val > 0) {
                                  updateLine(idx, 'debit', 0);
                                  if (idx === lines.length - 1) {
                                    const curDebit = lines.reduce((s, l, i) => s + (i === idx ? 0 : (parseFloat(l.debit as any) || 0)), 0);
                                    const curCredit = lines.reduce((s, l, i) => s + (i === idx ? val : (parseFloat(l.credit as any) || 0)), 0);
                                    const diff = curCredit - curDebit;
                                    if (diff > 0.001) {
                                      setLines((prev) => [
                                        ...prev,
                                        { accountId: '', costCenterId: '', debit: diff, credit: 0, description: line.description || description },
                                      ]);
                                      focusCell(idx + 1, 'account');
                                    }
                                  } else {
                                    focusCell(idx + 1, 'account');
                                  }
                                } else if (idx < lines.length - 1) {
                                  focusCell(idx + 1, 'account');
                                }
                              }
                            }}
                            className="h-9 w-full rounded-control border border-line bg-surface px-2.5 text-end font-mono text-xs font-bold text-emerald-800 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          {lines.length > 2 && (
                            <IconButton
                              tone="danger"
                              label="حذف السطر"
                              onClick={() => removeLine(idx)}
                            >
                              <Trash2 size={14} />
                            </IconButton>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-line bg-surface-muted font-bold text-ink">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-left">
                        الإجمالي العام للقيد:
                      </td>
                      <td className="kayan-numeric bg-blue-50/50 px-3 py-3 text-end font-mono text-sm font-black text-blue-800">
                        {money(totalDebit)}
                      </td>
                      <td className="kayan-numeric bg-emerald-50/50 px-3 py-3 text-end font-mono text-sm font-black text-emerald-800">
                        {money(totalCredit)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Balance Status Bar */}
              <div
                className={`flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs font-bold ${
                  isBalanced
                    ? 'border-state-success/30 bg-state-success-soft text-state-success'
                    : 'border-state-danger/30 bg-state-danger-soft text-state-danger'
                }`}
              >
                <div className="flex flex-wrap items-center gap-4">
                  <span>
                    المدين: <span className="kayan-numeric font-mono">{money(totalDebit)} ر.ي</span>
                  </span>
                  <span>
                    الدائن: <span className="kayan-numeric font-mono">{money(totalCredit)} ر.ي</span>
                  </span>
                  <span>
                    الفارق: <span className="kayan-numeric font-mono">{money(difference)} ر.ي</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!isBalanced && totalDebit !== totalCredit && (
                    <button
                      type="button"
                      onClick={handleAutoBalance}
                      className="rounded-lg bg-white/80 px-2.5 py-1 text-[11px] font-bold text-ink shadow-xs hover:bg-white"
                    >
                      موازنة الآن (F9)
                    </button>
                  )}
                  <span className="inline-flex items-center gap-1">
                    {isBalanced ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {isBalanced ? 'القيد متوازن وجاهز للحفظ' : 'يجب توازن القيد قبل الحفظ'}
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* Bottom Summary & Audit Strip (View Mode) */}
          {isView && selectedEntry && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <DocumentSummaryCard
                title="ملخص التوازن المالي"
                rows={summaryRows}
                totalLabel="إجمالي القيد"
                totalValue={`${money(displayTotalDebit)} ر.ي`}
              />
              <DocumentAuditCard
                createdByName={selectedEntry.createdByName ?? null}
                updatedByName={null}
                createdAt={selectedEntry.created_at ?? null}
                updatedAt={selectedEntry.updated_at ?? null}
                createdDevice={null}
                updatedDevice={null}
                sourceNote="بيانات التدقيق المرجعية لقيد اليومية في النظام المحاسبي."
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* List Screen                                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-4 pb-8" dir="rtl">
      <PageHeader
        title="القيود المحاسبية"
        description="إدارة، مراجعة، ترحيل وعكس قيود اليومية العامة والآلية"
        icon={<FileSpreadsheet size={20} />}
        actions={
          <div className="flex items-center gap-2">
            <IconButton
              label="تحديث البيانات"
              onClick={fetchEntries}
              className="border border-line bg-surface"
            >
              <RefreshCw size={15} />
            </IconButton>
            <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
              قيد يومية جديد
            </Button>
          </div>
        }
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="إجمالي القيود"
          value={entries.length.toLocaleString('en-US')}
          icon={<FileSpreadsheet size={18} />}
          tone="brand"
          hint="كل القيود المسجلة في دفتر اليومية"
          pending={loading}
        />
        <KpiCard
          label="القيود المرحلة"
          value={postedCount.toLocaleString('en-US')}
          icon={<CheckCircle2 size={18} />}
          tone="success"
          hint="قيود معتمدة في الأستاذ العام"
          pending={loading}
        />
        <KpiCard
          label="مسودات بانتظار الترحيل"
          value={draftCount.toLocaleString('en-US')}
          icon={<Clock size={18} />}
          tone="warning"
          hint="تحتاج مراجعة وترحيلاً محاسبياً"
          pending={loading}
        />
        <KpiCard
          label="القيود المعكوسة"
          value={reversedCount.toLocaleString('en-US')}
          icon={<RotateCcw size={18} />}
          tone="neutral"
          hint="قيود عُكست بقيد مقابل تلقائي"
          pending={loading}
        />
      </div>

      {/* Organized Search, Status Pills & Date Filter Toolbar */}
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-3.5 shadow-k-xs">
        <PageToolbar
          search={{
            value: search,
            onValueChange: setSearch,
            placeholder: 'بحث برقم القيد أو البيان العام...',
          }}
          end={
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-muted/60 px-2.5 py-1">
                <Calendar size={13} className="text-ink-muted" />
                <span className="text-[11px] font-semibold text-ink-muted">من:</span>
                <input
                  type="date"
                  value={fromDateFilter}
                  onChange={(e) => setFromDateFilter(e.target.value)}
                  className="bg-transparent font-mono text-[11px] text-ink focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-muted/60 px-2.5 py-1">
                <Calendar size={13} className="text-ink-muted" />
                <span className="text-[11px] font-semibold text-ink-muted">إلى:</span>
                <input
                  type="date"
                  value={toDateFilter}
                  onChange={(e) => setToDateFilter(e.target.value)}
                  className="bg-transparent font-mono text-[11px] text-ink focus:outline-none"
                />
              </div>
              {(search || statusFilter !== 'ALL' || fromDateFilter || toDateFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('ALL');
                    setFromDateFilter('');
                    setToDateFilter('');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[11px] font-bold text-ink-muted hover:bg-surface-hover hover:text-ink"
                >
                  <X size={12} />
                  مسح الفلاتر
                </button>
              )}
            </div>
          }
        />

        {/* Status Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-bold text-ink-muted">
              <Filter size={12} />
              الحالة:
            </span>
            {(
              [
                { key: 'ALL', label: 'الكل', count: entries.length },
                { key: 'POSTED', label: 'مرحل', count: postedCount },
                { key: 'DRAFT', label: 'مسودة', count: draftCount },
                { key: 'REVERSED', label: 'معكوس', count: reversedCount },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  statusFilter === tab.key
                    ? 'bg-brand text-white shadow-xs'
                    : 'bg-surface-muted text-ink-muted hover:bg-surface-hover hover:text-ink'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
                    statusFilter === tab.key ? 'bg-white/20 text-white' : 'bg-surface text-ink-muted'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <span className="text-[11px] font-semibold text-ink-muted">
            المعروض: <strong className="font-mono text-ink">{filteredEntries.length}</strong> من{' '}
            <strong className="font-mono text-ink">{entries.length}</strong> قيد
          </span>
        </div>
      </div>

      {/* Journal Entries Table */}
      <Card flush>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-line bg-surface-muted font-bold text-ink-muted">
              <tr>
                <th className="whitespace-nowrap px-3 py-3.5">رقم القيد</th>
                <th className="whitespace-nowrap px-2.5 py-3.5">التاريخ</th>
                <th className="px-3 py-3.5">البيان العام</th>
                <th className="whitespace-nowrap px-3 py-3.5 text-end text-blue-800">مدين (ر.ي)</th>
                <th className="whitespace-nowrap px-3 py-3.5 text-end text-emerald-800">دائن (ر.ي)</th>
                <th className="whitespace-nowrap px-2.5 py-3.5 text-center">المصدر</th>
                <th className="whitespace-nowrap px-2.5 py-3.5 text-center">الحالة</th>
                <th className="whitespace-nowrap px-2.5 py-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft font-medium text-ink">
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <LoadingState text="جارٍ تحميل القيود اليومية..." />
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<FileSpreadsheet size={32} />}
                      title="لا توجد قيود يومية مطابقة"
                      description="جرّب تغيير البحث أو الفلاتر، أو أنشئ قيد يومية جديداً."
                      action={
                        <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>
                          قيد يومية جديد
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => viewEntryDetails(entry.id)}
                    className="cursor-pointer transition-colors hover:bg-surface-hover/60"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          viewEntryDetails(entry.id);
                        }}
                        className="inline-flex items-center gap-1 font-mono font-bold text-brand hover:underline"
                      >
                        <span>{entry.entry_number}</span>
                        <ExternalLink size={11} className="opacity-60" />
                      </button>
                    </td>
                    <td className="kayan-numeric px-3 py-3 font-mono text-ink-muted">
                      {entry.entry_date ? <bdi dir="ltr">{dateOnly(entry.entry_date)}</bdi> : '—'}
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-3 text-ink">{entry.description}</td>
                    <td className="kayan-numeric px-4 py-3 text-end font-mono font-bold text-blue-800">
                      {money(entry.total_debit)}
                    </td>
                    <td className="kayan-numeric px-4 py-3 text-end font-mono font-bold text-emerald-800">
                      {money(entry.total_credit)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="rounded-md border border-line bg-surface-muted px-2 py-0.5 font-mono text-[10px] font-bold text-ink-muted">
                        {entry.source_id || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <EntryStatusBadge status={entry.status} size="sm" />
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <IconButton
                          tone="primary"
                          label="عرض تفاصيل القيد"
                          onClick={() => viewEntryDetails(entry.id)}
                        >
                          <Eye size={15} />
                        </IconButton>
                        {entry.status === 'DRAFT' && (
                          <IconButton
                            tone="success"
                            label="ترحيل القيد"
                            onClick={() => handlePostEntry(entry.id)}
                          >
                            <CheckCircle2 size={15} />
                          </IconButton>
                        )}
                        {entry.status === 'POSTED' && (
                          <IconButton
                            tone="danger"
                            label="عكس القيد"
                            onClick={() => handleReverseEntry(entry.id)}
                          >
                            <RotateCcw size={15} />
                          </IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredEntries.length > 0 && (
              <tfoot className="border-t-2 border-line bg-surface-muted font-bold text-ink">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-left text-xs text-ink-muted">
                    إجمالي القيود المعروضة ({filteredEntries.length}):
                  </td>
                  <td className="kayan-numeric px-4 py-3 text-end font-mono text-sm font-black text-blue-800">
                    {money(filteredTotalDebit)}
                  </td>
                  <td className="kayan-numeric px-4 py-3 text-end font-mono text-sm font-black text-emerald-800">
                    {money(filteredTotalCredit)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
};
