import React, { useState, useEffect, useRef } from 'react';
import { useLookup, LookupType } from '../../context/LookupContext';
import { Search, X, Check, Clock, ChevronRight, ChevronLeft, AlertCircle, RefreshCw } from 'lucide-react';

const LOOKUP_CONFIG: Record<LookupType, { title: string; endpoint: string; columns: { key: string; label: string }[] }> = {
  ACCOUNT: {
    title: 'بحث واختيار الحساب المحاسبي',
    endpoint: '/api/lookups/accounts',
    columns: [
      { key: 'code', label: 'كود الحساب' },
      { key: 'name', label: 'اسم الحساب' },
      { key: 'type', label: 'النوع' },
      { key: 'nature', label: 'الطبيعة' },
    ]
  },
  ITEM: {
    title: 'بحث واختيار الأصناف والمخزون',
    endpoint: '/api/lookups/items',
    columns: [
      { key: 'sku', label: 'SKU' },
      { key: 'barcode', label: 'الباركود' },
      { key: 'name', label: 'اسم الصنف' },
      { key: 'availableQty', label: 'الرصيد المتاح' },
      { key: 'averageCost', label: 'متوسط التكلفة' },
    ]
  },
  CUSTOMER: {
    title: 'بحث واختيار العملاء',
    endpoint: '/api/lookups/customers',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'name', label: 'اسم العميل' },
      { key: 'phone', label: 'الجوال' },
      { key: 'balance', label: 'الرصيد' },
    ]
  },
  SUPPLIER: {
    title: 'بحث واختيار الموردين',
    endpoint: '/api/lookups/suppliers',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'name', label: 'اسم المورد' },
      { key: 'phone', label: 'الجوال' },
      { key: 'balance', label: 'الرصيد' },
    ]
  },
  CASH_ACCOUNT: {
    title: 'بحث واختيار الصناديق النقدية',
    endpoint: '/api/lookups/cash',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'name', label: 'اسم الصندوق' },
      { key: 'currency', label: 'العملة' },
    ]
  },
  BANK_ACCOUNT: {
    title: 'بحث واختيار الحسابات البنكية',
    endpoint: '/api/lookups/banks',
    columns: [
      { key: 'accountNumber', label: 'رقم الحساب' },
      { key: 'bankName', label: 'اسم البنك' },
      { key: 'currency', label: 'العملة' },
    ]
  },
  WAREHOUSE: {
    title: 'بحث واختيار المستودعات',
    endpoint: '/api/lookups/warehouses',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'name', label: 'اسم المستودع' },
      { key: 'location', label: 'الموقع' },
    ]
  },
  COST_CENTER: {
    title: 'بحث واختيار مراكز التكلفة',
    endpoint: '/api/lookups/cost-centers',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'name', label: 'اسم مركز التكلفة' },
    ]
  },
  TAX_CODE: {
    title: 'بحث واختيار رموز الضرائب',
    endpoint: '/api/lookups/taxes',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'name', label: 'اسم الضريبة' },
      { key: 'rate', label: 'النسبة %' },
    ]
  },
  UNIT: {
    title: 'بحث واختيار وحدات القياس',
    endpoint: '/api/lookups/units',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'name', label: 'اسم ووحدة القياس' },
    ]
  },
  BRANCH: {
    title: 'بحث واختيار الفروع',
    endpoint: '/api/lookups/branches',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'name', label: 'اسم الفرع' },
    ]
  },
  ASSET: {
    title: 'بحث واختيار الأصول الثابتة',
    endpoint: '/api/lookups/assets',
    columns: [
      { key: 'code', label: 'كود الأصل' },
      { key: 'name', label: 'اسم الأصل' },
      { key: 'purchaseCost', label: 'تكلفة الشراء' },
    ]
  },
  EXPENSE_CATEGORY: {
    title: 'بحث واختيار تصنيفات المصروفات',
    endpoint: '/api/lookups/expenses',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'name', label: 'التصنيف' },
    ]
  }
};

export const LookupDialog: React.FC = () => {
  const { isOpen, lookupType, onSelect, closeLookup } = useLookup();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentItems, setRecentItems] = useState<any[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);

  const config = lookupType ? LOOKUP_CONFIG[lookupType] : null;

  const fetchResults = async (searchQuery: string) => {
    if (!lookupType || !config) return;
    const currentSeq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${config.endpoint}?q=${encodeURIComponent(searchQuery)}&limit=25`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (currentSeq !== requestSeq.current) return;
      const rows = Array.isArray(data) ? data : (data.items || data.rows || []);
      setResults(rows);
      setSelectedIndex(0);
    } catch (err: any) {
      if (currentSeq !== requestSeq.current) return;
      console.error(`[LookupDialog Error] ${lookupType}:`, err);
      const entityName = lookupType === 'CUSTOMER' ? 'العملاء' : (lookupType === 'SUPPLIER' ? 'الموردين' : 'البيانات');
      setError(`تعذر تحميل ${entityName}.`);
      setResults([]);
    } finally {
      if (currentSeq === requestSeq.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setError(null);
      fetchResults('');
      loadRecent();
      setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  }, [isOpen, lookupType]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetchResults(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Global keyboard navigation while dialog is open (ArrowDown, ArrowUp, Enter, Escape)
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (results.length > 0 ? (prev < results.length - 1 ? prev + 1 : 0) : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (results.length > 0 ? (prev > 0 ? prev - 1 : results.length - 1) : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeLookup();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, results, selectedIndex]);

  // Auto-scroll selected row into view
  useEffect(() => {
    if (tableBodyRef.current && results.length > 0) {
      const selectedRow = tableBodyRef.current.children[selectedIndex] as HTMLElement;
      if (selectedRow) {
        selectedRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, results]);

  const loadRecent = () => {
    if (!lookupType) return;
    try {
      const saved = localStorage.getItem(`kayan_lookup_recent_${lookupType}`);
      if (saved) setRecentItems(JSON.parse(saved));
      else setRecentItems([]);
    } catch {
      setRecentItems([]);
    }
  };

  const saveRecent = (record: any) => {
    if (!lookupType) return;
    try {
      const existing = recentItems.filter(r => r.id !== record.id);
      const updated = [record, ...existing].slice(0, 5);
      setRecentItems(updated);
      localStorage.setItem(`kayan_lookup_recent_${lookupType}`, JSON.stringify(updated));
    } catch {}
  };

  const handleSelect = (record: any) => {
    saveRecent(record);
    if (onSelect) onSelect(record);
    closeLookup();
  };

  if (!isOpen || !config) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 border border-slate-200">
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-blue-400" />
            <h3 className="text-sm font-bold">{config.title}</h3>
          </div>
          <button 
            onClick={closeLookup} 
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
            title="إغلاق (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 bg-slate-50 border-b">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 text-slate-400" size={16} />
            <input 
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="اكتب للبحث (الكود، الاسم، الباركود، رقم الهاتف)..."
              className="w-full pl-4 pr-10 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
            />
          </div>
        </div>

        {recentItems.length > 0 && !query && (
          <div className="px-4 py-2 bg-amber-50/60 border-b flex items-center gap-2 overflow-x-auto text-[11px]">
            <span className="flex items-center gap-1 font-bold text-amber-800 whitespace-nowrap">
              <Clock size={12} /> الأخيرة:
            </span>
            {recentItems.map((r, i) => (
              <button 
                key={i} 
                onClick={() => handleSelect(r)}
                className="px-2.5 py-1 bg-white border border-amber-200 rounded-lg text-slate-700 hover:bg-amber-100 whitespace-nowrap font-medium cursor-pointer transition shadow-2xs"
              >
                {r.name || r.code || r.sku}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 min-h-[220px]">
          {loading ? (
            <div className="text-center py-12 text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw size={18} className="animate-spin text-blue-600" />
              <span>جاري البحث وتحميل النتائج...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-xs text-rose-600 flex flex-col items-center justify-center gap-2">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertCircle size={18} className="text-rose-500" />
                <span>{error}</span>
              </div>
              <button 
                onClick={() => fetchResults(query)}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-900 text-white rounded-lg text-xs font-bold hover:bg-blue-800 transition cursor-pointer shadow-xs"
              >
                <RefreshCw size={12} />
                <span>إعادة المحاولة</span>
              </button>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400">
              لا توجد نتائج مطابقة للبحث
            </div>
          ) : (
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                  {config.columns.map(col => (
                    <th key={col.key} className="py-2.5 px-3 font-bold">{col.label}</th>
                  ))}
                  <th className="py-2.5 px-3 text-center">اختيار</th>
                </tr>
              </thead>
              <tbody ref={tableBodyRef} className="divide-y divide-slate-100">
                {results.map((row, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <tr 
                      key={row.id || idx}
                      onClick={() => handleSelect(row)}
                      className={`cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-blue-100/80 text-blue-950 font-bold ring-1 ring-blue-400 ring-inset' 
                          : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      {config.columns.map(col => (
                        <td key={col.key} className="py-2.5 px-3 font-mono">
                          {row[col.key] !== undefined && row[col.key] !== null ? String(row[col.key]) : '—'}
                        </td>
                      ))}
                      <td className="py-2.5 px-3 text-center">
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleSelect(row); }}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                            isSelected 
                              ? 'bg-blue-700 text-white shadow-xs' 
                              : 'bg-slate-100 hover:bg-blue-900 hover:text-white text-slate-700'
                          }`}
                        >
                          اختر (Enter)
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 bg-slate-50 border-t flex justify-between items-center text-[11px] text-slate-500 font-medium">
          <div>استخدم (↑ ↓) للتنقل، (Enter) للاختيار، (Esc) للإغلاق</div>
          <div className="font-mono font-bold text-slate-700">عدد النتائج: {results.length}</div>
        </div>
      </div>
    </div>
  );
};
