import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Search, 
  Plus, 
  CheckCircle2, 
  X, 
  AlertCircle, 
  RotateCcw, 
  Eye, 
  ArrowRightLeft,
  Calendar,
  Layers
} from 'lucide-react';

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  total_debit: string;
  total_credit: string;
  source_id?: string;
  created_at: string;
  lines?: any[];
}

export const JournalEntriesPage: React.FC = () => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Journal Entry state
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<Array<{ accountId: string; debit: number; credit: number; description: string }>>([
    { accountId: '', debit: 0, credit: 0, description: '' },
    { accountId: '', debit: 0, credit: 0, description: '' },
  ]);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const [resEntries, resAccounts] = await Promise.all([
        fetch('/api/journal-entries?limit=100'),
        fetch('/api/accounts')
      ]);
      if (resEntries.ok) {
        setEntries(await resEntries.json());
      }
      if (resAccounts.ok) {
        setAccounts(await resAccounts.json());
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

  const viewEntryDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/journal-entries/${id}`);
      if (res.ok) {
        setSelectedEntry(await res.json());
      }
    } catch (err) {
      console.error('Error fetching entry details:', err);
    }
  };

  const handlePostEntry = async (id: string) => {
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

  const addLine = () => {
    setLines([...lines, { accountId: '', debit: 0, credit: 0, description: '' }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length > 2) {
      setLines(lines.filter((_, i) => i !== idx));
    }
  };

  const updateLine = (idx: number, field: string, value: any) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], [field]: value };
    setLines(updated);
  };

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit as any) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit as any) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) {
      setError('القيد غير متوازن! يجب أن يتساوى إجمالي المدين مع إجمالي الدائن.');
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/journal-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryDate,
          description,
          lines: lines.map(l => ({
            accountId: l.accountId,
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
      setIsModalOpen(false);
      setDescription('');
      setLines([
        { accountId: '', debit: 0, credit: 0, description: '' },
        { accountId: '', debit: 0, credit: 0, description: '' },
      ]);
      await fetchEntries();
      // Auto open details
      viewEntryDetails(created.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEntries = entries.filter(e => 
    e.entry_number?.toLowerCase().includes(search.toLowerCase()) ||
    e.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">دفتر القيود اليومية (Journal Entries)</h1>
            <p className="text-xs text-slate-500 font-medium">تسجيل، مراجعة، ترحيل وعكس قيود اليومية العامة والآلية</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus size={16} />
            <span>قيد يومية يدوي جديد</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between gap-4 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="بحث برقم القيد أو البيان..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-semibold">
          إجمالي القيود: <span className="font-mono font-bold text-slate-800">{entries.length}</span>
        </div>
      </div>

      {/* Entries List Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200/70">
              <tr>
                <th className="py-3 px-4">رقم القيد</th>
                <th className="py-3 px-4">التاريخ</th>
                <th className="py-3 px-4">البيان</th>
                <th className="py-3 px-4 font-mono text-left">إجمالي المدين</th>
                <th className="py-3 px-4 font-mono text-left">إجمالي الدائن</th>
                <th className="py-3 px-4 text-center">المصدر</th>
                <th className="py-3 px-4 text-center">الحالة</th>
                <th className="py-3 px-4 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    جاري تحميل القيود اليومية...
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    لا توجد قيود يومية مطابقة
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-4 font-mono font-bold text-blue-600">
                      {entry.entry_number}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">
                      {entry.entry_date ? new Date(entry.entry_date).toLocaleDateString('ar-YE') : '—'}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-800 max-w-sm truncate">
                      {entry.description}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-left font-bold text-slate-800">
                      {parseFloat(entry.total_debit || '0').toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-left font-bold text-slate-800">
                      {parseFloat(entry.total_credit || '0').toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold">
                        {entry.source_id || 'GENERAL'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        entry.status === 'POSTED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : entry.status === 'REVERSED'
                          ? 'bg-slate-100 text-slate-500 line-through'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {entry.status === 'POSTED' ? 'مرحل' : entry.status === 'REVERSED' ? 'معكوس' : 'مسودة'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => viewEntryDetails(entry.id)}
                          className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="عرض تفاصيل القيد وسطور الحسابات"
                        >
                          <Eye size={15} />
                        </button>
                        {entry.status === 'DRAFT' && (
                          <button
                            onClick={() => handlePostEntry(entry.id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="ترحيل القيد"
                          >
                            <CheckCircle2 size={15} />
                          </button>
                        )}
                        {entry.status === 'POSTED' && (
                          <button
                            onClick={() => handleReverseEntry(entry.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                            title="عكس القيد"
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Entry Details Modal / Drawer */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl border border-slate-200 shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-blue-600" />
                <h3 className="font-bold text-slate-800 text-sm">
                  تفاصيل قيد اليومية رقم {selectedEntry.entry_number}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedEntry(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400">التاريخ:</span>
                  <div className="font-bold text-slate-800 font-mono mt-0.5">{selectedEntry.entry_date}</div>
                </div>
                <div>
                  <span className="text-slate-400">الحالة:</span>
                  <div className="font-bold text-emerald-600 mt-0.5">{selectedEntry.status}</div>
                </div>
                <div>
                  <span className="text-slate-400">المصدر:</span>
                  <div className="font-bold text-slate-800 mt-0.5">{selectedEntry.source_id || 'GENERAL'}</div>
                </div>
                <div>
                  <span className="text-slate-400">المبلغ الإجمالي:</span>
                  <div className="font-mono font-bold text-blue-700 mt-0.5">
                    {parseFloat(selectedEntry.total_debit).toLocaleString()} YER
                  </div>
                </div>
              </div>

              <div>
                <span className="text-xs text-slate-400">البيان:</span>
                <p className="text-xs font-semibold text-slate-800 mt-0.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {selectedEntry.description}
                </p>
              </div>

              {/* Lines Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">كود الحساب</th>
                      <th className="py-2.5 px-3">اسم الحساب</th>
                      <th className="py-2.5 px-3">البيان الفرعي للسطر</th>
                      <th className="py-2.5 px-3 font-mono text-left">مدين</th>
                      <th className="py-2.5 px-3 font-mono text-left">دائن</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedEntry.lines?.map((line: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-blue-600">{line.accountCode}</td>
                        <td className="py-2 px-3 font-medium text-slate-800">{line.accountName}</td>
                        <td className="py-2 px-3 text-slate-500">{line.description || '—'}</td>
                        <td className="py-2 px-3 font-mono text-left font-bold text-slate-900">
                          {parseFloat(line.debit || '0') > 0 ? parseFloat(line.debit).toLocaleString() : '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-left font-bold text-slate-900">
                          {parseFloat(line.credit || '0') > 0 ? parseFloat(line.credit).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                    <tr>
                      <td colSpan={4} className="py-2.5 px-3 text-right">المجموع:</td>
                      <td className="py-2.5 px-3 font-mono text-left text-blue-700">
                        {parseFloat(selectedEntry.total_debit).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-left text-blue-700">
                        {parseFloat(selectedEntry.total_credit).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Journal Entry Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl border border-slate-200 shadow-xl overflow-hidden my-8">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-blue-600" />
                <h3 className="font-bold text-slate-800 text-sm">تسجيل قيد يومية يدوي متوازن</h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateEntry} className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ القيد *</label>
                  <input
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">البيان العام للقيد *</label>
                  <input
                    type="text"
                    required
                    placeholder="شرح موجز للعملية المالية..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Lines */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">سطور القيد (أطراف المعاملة)</span>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1"
                  >
                    <Plus size={14} /> إضافة طرف
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto p-1">
                  {lines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                      <select
                        value={line.accountId}
                        onChange={(e) => updateLine(idx, 'accountId', e.target.value)}
                        required
                        className="flex-1 text-xs p-1.5 bg-white border border-slate-200 rounded"
                      >
                        <option value="">-- اختر الحساب --</option>
                        {accounts.filter(a => !a.is_group).map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} - {a.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="مدين"
                        min="0"
                        value={line.debit || ''}
                        onChange={(e) => updateLine(idx, 'debit', parseFloat(e.target.value) || 0)}
                        className="w-24 text-xs p-1.5 bg-white border border-slate-200 rounded font-mono text-left"
                      />
                      <input
                        type="number"
                        placeholder="دائن"
                        min="0"
                        value={line.credit || ''}
                        onChange={(e) => updateLine(idx, 'credit', parseFloat(e.target.value) || 0)}
                        className="w-24 text-xs p-1.5 bg-white border border-slate-200 rounded font-mono text-left"
                      />
                      <input
                        type="text"
                        placeholder="بيان فرعي (اختياري)"
                        value={line.description}
                        onChange={(e) => updateLine(idx, 'description', e.target.value)}
                        className="w-40 text-xs p-1.5 bg-white border border-slate-200 rounded"
                      />
                      {lines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="text-slate-400 hover:text-rose-500 p-1"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals & Balance indicator */}
              <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold ${
                isBalanced
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50/70 border-rose-200 text-rose-900'
              }`}>
                <div>
                  المدين: <span className="font-mono text-sm">{totalDebit.toLocaleString()}</span> | 
                  الدائن: <span className="font-mono text-sm">{totalCredit.toLocaleString()}</span> | 
                  الفارق: <span className="font-mono text-sm">{Math.abs(totalDebit - totalCredit).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  {isBalanced ? (
                    <span className="text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 size={16} /> القيد متوازن
                    </span>
                  ) : (
                    <span className="text-rose-700 flex items-center gap-1">
                      <AlertCircle size={16} /> القيد غير متوازن
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting || !isBalanced}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'جاري الحفظ...' : 'حفظ القيد اليومي'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
