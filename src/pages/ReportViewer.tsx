import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowRight, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Printer, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Calendar, 
  Filter, 
  Play, 
  CheckCircle2, 
  X,
  Layers,
  Building,
  Users,
  Truck,
  Warehouse,
  AlertCircle
} from 'lucide-react';
import { REPORT_REGISTRY, ReportDefinition } from '../services/reportRegistry';
import { ReportExportService } from '../services/reportExportService';
import { useNavigation } from '../context/NavigationContext';
import { useLookup } from '../context/LookupContext';

export const ReportViewer: React.FC = () => {
  const { currentRoute, navigateTo } = useNavigation();
  const { openLookup } = useLookup();
  const reportId = currentRoute.split('/reports/view/')[1] || '';
  const [reportDef, setReportDef] = useState<ReportDefinition | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [statementSummary, setStatementSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [zoomLevel, setZoomLevel] = useState(100);

  // Filters state
  const [fromDate, setFromDate] = useState('2026-01-01');
  const [toDate, setToDate] = useState('2026-12-31');
  const [branchId, setBranchId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [customerId, setCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [supplierId, setSupplierId] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);

  // Dropdown lists
  const [branches, setBranches] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  // Print preview modal
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [paperSize, setPaperSize] = useState<'A4' | 'A5' | 'Letter'>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  useEffect(() => {
    const found = REPORT_REGISTRY.find(r => r.id === reportId);
    if (found) {
      setReportDef(found);
    }
  }, [reportId]);

  // Fetch filter metadata
  useEffect(() => {
    Promise.all([
      fetch('/api/settings/branches').then(r => r.json()).catch(() => ({ branches: [] })),
      fetch('/api/accounts').then(r => r.json()).catch(() => []),
      fetch('/api/customers').then(r => r.json()).catch(() => []),
      fetch('/api/suppliers').then(r => r.json()).catch(() => []),
      fetch('/api/inventory/warehouses').then(r => r.json()).catch(() => []),
    ]).then(([resBr, resAcc, resCust, resSupp, resWh]) => {
      const brList = resBr.branches || resBr || [];
      const custList = Array.isArray(resCust) ? resCust : [];
      setBranches(brList);
      setAccounts(Array.isArray(resAcc) ? resAcc : []);
      setCustomers(custList);
      setSuppliers(Array.isArray(resSupp) ? resSupp : []);
      setWarehouses(Array.isArray(resWh) ? resWh : []);

      // Auto-select first customer for customer-statement if not yet set
      if ((reportId === 'customer-statement' || reportDef?.filters?.includes('customer')) && custList.length > 0 && !customerId) {
        setCustomerId(custList[0].id);
        setSelectedCustomer(custList[0]);
      }
    });
  }, [reportId, reportDef]);

  const handleOpenCustomerLookup = () => {
    openLookup('CUSTOMER', (selected) => {
      if (selected) {
        setCustomerId(selected.id);
        setSelectedCustomer(selected);
      }
    });
  };

  const handleOpenSupplierLookup = () => {
    openLookup('SUPPLIER', (selected) => {
      if (selected) {
        setSupplierId(selected.id);
        setSelectedSupplier(selected);
      }
    });
  };

  const handleOpenAccountLookup = () => {
    openLookup('ACCOUNT', (selected) => {
      if (selected) {
        setAccountId(selected.id);
        setSelectedAccount(selected);
      }
    });
  };

  const handleOpenWarehouseLookup = () => {
    openLookup('WAREHOUSE', (selected) => {
      if (selected) {
        setWarehouseId(selected.id);
        setSelectedWarehouse(selected);
      }
    });
  };

  useEffect(() => {
    const handleGlobalF9 = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        const isCustomer = reportDef?.filters.includes('customer') || reportDef?.id === 'customer-statement';
        if (isCustomer) {
          e.preventDefault();
          handleOpenCustomerLookup();
        } else if (reportDef?.filters.includes('supplier')) {
          e.preventDefault();
          handleOpenSupplierLookup();
        } else if (reportDef?.filters.includes('account')) {
          e.preventDefault();
          handleOpenAccountLookup();
        } else if (reportDef?.filters.includes('warehouse')) {
          e.preventDefault();
          handleOpenWarehouseLookup();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalF9);
    return () => window.removeEventListener('keydown', handleGlobalF9);
  }, [reportDef]);

  const runReport = useCallback(async () => {
    if (!reportDef) return;

    const isCustomerReport = reportDef.filters.includes('customer') || reportDef.id === 'customer-statement';
    if (isCustomerReport && !customerId) {
      setError('يرجى اختيار العميل أولاً لتشغيل كشف الحساب');
      setData([]);
      setStatementSummary(null);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);
      if (branchId) params.append('branchId', branchId);
      if (accountId) params.append('accountId', accountId);
      if (customerId) params.append('customerId', customerId);
      if (supplierId) params.append('supplierId', supplierId);
      if (warehouseId) params.append('warehouseId', warehouseId);

      const url = `${reportDef.dataSourceUrl}${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url);
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'فشل تشغيل التقرير');

      // Check if statement metadata exists
      if (resData && typeof resData === 'object' && !Array.isArray(resData)) {
        if ('openingBalance' in resData || 'closingBalance' in resData) {
          setStatementSummary({
            customerName: resData.customerName || selectedCustomer?.name,
            customerCode: resData.customerCode || selectedCustomer?.code,
            openingBalance: resData.openingBalance || 0,
            totalDebit: resData.totalDebit || 0,
            totalCredit: resData.totalCredit || 0,
            closingBalance: resData.closingBalance || resData.finalBalance || 0,
          });
        } else {
          setStatementSummary(null);
        }
      } else {
        setStatementSummary(null);
      }

      // Normalize array data
      let rows: any[] = [];
      if (Array.isArray(resData)) {
        rows = resData;
      } else if (resData && typeof resData === 'object') {
        if (Array.isArray(resData.data)) rows = resData.data;
        else if (Array.isArray(resData.entries)) rows = resData.entries;
        else if (Array.isArray(resData.items)) rows = resData.items;
        else if (Array.isArray(resData.rows)) rows = resData.rows;
        else {
          rows = [resData];
        }
      }
      setData(rows);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء جلب بيانات التقرير');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [reportDef, fromDate, toDate, branchId, accountId, customerId, supplierId, warehouseId, selectedCustomer]);

  useEffect(() => {
    if (reportDef) {
      runReport();
    }
  }, [reportDef, runReport]);

  if (!reportDef) {
    return (
      <div className="p-8 text-center" dir="rtl">
        <h2 className="text-xl font-bold text-slate-700">التقرير غير موجود</h2>
        <button onClick={() => navigateTo('/reports')} className="mt-4 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-bold">
          العودة إلى مركز التقارير
        </button>
      </div>
    );
  }

  const filteredData = data.filter(item => {
    if (!searchTerm) return true;
    return Object.values(item).some(val => 
      String(val).toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const requiresCustomer = reportDef.filters.includes('customer') || reportDef.id === 'customer-statement';
  const requiresSupplier = reportDef.filters.includes('supplier');
  const requiresAccount = reportDef.filters.includes('account');
  const requiresWarehouse = reportDef.filters.includes('warehouse');

  return (
    <div className="space-y-5 pb-12" dir="rtl">
      {/* 1. Professional Action Toolbar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigateTo('/reports')}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1 text-xs font-bold"
          >
            <ArrowRight size={16} />
            <span>رجوع</span>
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900">{reportDef.name}</h1>
            <p className="text-xs text-slate-500">{reportDef.description}</p>
          </div>
        </div>

        {/* Toolbar Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center bg-slate-100 rounded-xl p-1">
            <button onClick={() => setZoomLevel(prev => Math.max(50, prev - 10))} className="p-1.5 hover:bg-white rounded-lg text-slate-700" title="تصغير">
              <ZoomOut size={15} />
            </button>
            <span className="text-xs font-bold px-2 text-slate-700">{zoomLevel}%</span>
            <button onClick={() => setZoomLevel(prev => Math.min(150, prev + 10))} className="p-1.5 hover:bg-white rounded-lg text-slate-700" title="تكبير">
              <ZoomIn size={15} />
            </button>
            <button onClick={() => setZoomLevel(100)} className="p-1.5 hover:bg-white rounded-lg text-slate-700 text-xs font-bold" title="إعادة ضبط">
              100%
            </button>
          </div>

          <button 
            onClick={() => setShowPrintModal(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Printer size={15} />
            <span>معاينة الطباعة</span>
          </button>

          <button 
            onClick={() => ReportExportService.printReport(reportDef, filteredData)}
            className="px-3 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Printer size={15} />
            <span>طباعة</span>
          </button>

          <button 
            onClick={() => ReportExportService.exportToPdf(reportDef, filteredData)}
            className="px-3 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <FileText size={15} />
            <span>PDF</span>
          </button>

          <button 
            onClick={() => ReportExportService.exportToXlsx(reportDef, filteredData)}
            className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <FileSpreadsheet size={15} />
            <span>XLSX</span>
          </button>

          <button 
            onClick={() => ReportExportService.exportToCsv(reportDef, filteredData)}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Download size={15} />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Professional Filters Bar */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Customer Parameter Box with F9 Lookup */}
          {requiresCustomer && (
            <div className="sm:col-span-2 lg:col-span-2 bg-blue-50/50 p-3.5 rounded-xl border border-blue-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                  <Users size={14} className="text-blue-600" />
                  <span>العميل</span>
                  <span className="text-rose-500 font-bold">*</span>
                </label>
                <span className="text-[10px] text-blue-600 font-bold bg-blue-100/70 px-2 py-0.5 rounded">
                  معامل تقرير أساسي
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <div 
                  onClick={handleOpenCustomerLookup}
                  onKeyDown={(e) => { if (e.key === 'F9' || e.key === 'Enter') { e.preventDefault(); handleOpenCustomerLookup(); } }}
                  tabIndex={0}
                  role="button"
                  aria-label="اختيار العميل"
                  className="flex-1 px-3 py-2.5 bg-white hover:bg-slate-50 border border-blue-300 rounded-xl text-xs flex items-center justify-between cursor-pointer focus:ring-2 focus:ring-blue-600 shadow-xs transition"
                >
                  <span className={customerId ? "font-bold text-slate-900" : "text-slate-400 font-medium"}>
                    {selectedCustomer 
                      ? `${selectedCustomer.code ? `[ ${selectedCustomer.code} ] ` : ''}${selectedCustomer.name}`
                      : (customerId ? `العميل المحدد (${customerId.slice(0, 8)}...)` : 'ابحث عن العميل...')}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200">
                    <Search size={13} />
                    <span>F9</span>
                  </span>
                </div>
                {customerId && (
                  <button
                    type="button"
                    onClick={() => { setCustomerId(''); setSelectedCustomer(null); }}
                    className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-slate-200 transition"
                    title="إلغاء اختيار العميل"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] text-slate-600 px-1 font-medium bg-white/60 p-1.5 rounded-lg border border-blue-100">
                <span>كود العميل: <strong className="text-blue-900 font-mono font-bold">{selectedCustomer?.code || '—'}</strong></span>
                <span>اسم العميل: <strong className="text-blue-900 font-bold">{selectedCustomer?.name || '—'}</strong></span>
                {selectedCustomer?.phone && (
                  <span>الهاتف: <strong className="text-slate-700 font-mono">{selectedCustomer.phone}</strong></span>
                )}
              </div>
            </div>
          )}

          {/* Supplier Parameter Box with F9 Lookup */}
          {requiresSupplier && (
            <div className="sm:col-span-2 lg:col-span-2 bg-amber-50/50 p-3.5 rounded-xl border border-amber-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                  <Truck size={14} className="text-amber-600" />
                  <span>المورد</span>
                  <span className="text-rose-500 font-bold">*</span>
                </label>
                <span className="text-[10px] text-amber-700 font-bold bg-amber-100/70 px-2 py-0.5 rounded">
                  معامل تقرير أساسي
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <div 
                  onClick={handleOpenSupplierLookup}
                  onKeyDown={(e) => { if (e.key === 'F9' || e.key === 'Enter') { e.preventDefault(); handleOpenSupplierLookup(); } }}
                  tabIndex={0}
                  role="button"
                  className="flex-1 px-3 py-2.5 bg-white hover:bg-slate-50 border border-amber-300 rounded-xl text-xs flex items-center justify-between cursor-pointer focus:ring-2 focus:ring-amber-600 shadow-xs transition"
                >
                  <span className={supplierId ? "font-bold text-slate-900" : "text-slate-400 font-medium"}>
                    {selectedSupplier 
                      ? `${selectedSupplier.code ? `[ ${selectedSupplier.code} ] ` : ''}${selectedSupplier.name}`
                      : (supplierId ? `المورد المحدد (${supplierId.slice(0, 8)}...)` : 'ابحث عن المورد...')}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200">
                    <Search size={13} />
                    <span>F9</span>
                  </span>
                </div>
                {supplierId && (
                  <button
                    type="button"
                    onClick={() => { setSupplierId(''); setSelectedSupplier(null); }}
                    className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-slate-200 transition"
                    title="إلغاء اختيار المورد"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] text-slate-600 px-1 font-medium bg-white/60 p-1.5 rounded-lg border border-amber-100">
                <span>كود المورد: <strong className="text-amber-900 font-mono font-bold">{selectedSupplier?.code || '—'}</strong></span>
                <span>اسم المورد: <strong className="text-amber-900 font-bold">{selectedSupplier?.name || '—'}</strong></span>
              </div>
            </div>
          )}

          {/* Account Parameter Box with F9 Lookup */}
          {requiresAccount && (
            <div className="sm:col-span-2 lg:col-span-2 bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                  <Building size={14} className="text-emerald-600" />
                  <span>الحساب المالي</span>
                  <span className="text-rose-500 font-bold">*</span>
                </label>
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded">
                  دليل الحسابات
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <div 
                  onClick={handleOpenAccountLookup}
                  onKeyDown={(e) => { if (e.key === 'F9' || e.key === 'Enter') { e.preventDefault(); handleOpenAccountLookup(); } }}
                  tabIndex={0}
                  role="button"
                  className="flex-1 px-3 py-2.5 bg-white hover:bg-slate-50 border border-emerald-300 rounded-xl text-xs flex items-center justify-between cursor-pointer focus:ring-2 focus:ring-emerald-600 shadow-xs transition"
                >
                  <span className={accountId ? "font-bold text-slate-900" : "text-slate-400 font-medium"}>
                    {selectedAccount 
                      ? `${selectedAccount.code ? `[ ${selectedAccount.code} ] ` : ''}${selectedAccount.name}`
                      : (accountId ? `الحساب المحدد (${accountId.slice(0, 8)}...)` : 'ابحث في دليل الحسابات...')}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200">
                    <Search size={13} />
                    <span>F9</span>
                  </span>
                </div>
                {accountId && (
                  <button
                    type="button"
                    onClick={() => { setAccountId(''); setSelectedAccount(null); }}
                    className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-slate-200 transition"
                    title="إلغاء اختيار الحساب"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] text-slate-600 px-1 font-medium bg-white/60 p-1.5 rounded-lg border border-emerald-100">
                <span>كود الحساب: <strong className="text-emerald-900 font-mono font-bold">{selectedAccount?.code || '—'}</strong></span>
                <span>اسم الحساب: <strong className="text-emerald-900 font-bold">{selectedAccount?.name || '—'}</strong></span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">من تاريخ</label>
            <input 
              type="date" 
              value={fromDate} 
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">إلى تاريخ</label>
            <input 
              type="date" 
              value={toDate} 
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الفرع</label>
            <select 
              value={branchId} 
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600"
            >
              <option value="">كافة الفروع</option>
              {branches.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button 
              onClick={runReport}
              className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <Play size={14} />
              <span>تشغيل التقرير</span>
            </button>
          </div>
        </div>
      </div>

      {/* Customer Statement Summary Cards Banner */}
      {statementSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-gradient-to-r from-slate-900 to-blue-950 p-4 rounded-2xl text-white shadow-md">
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10">
            <div className="text-[11px] text-blue-200 font-medium">الرصيد الافتتاحي</div>
            <div className="text-base font-black font-mono mt-1 text-white">
              {Number(statementSummary.openingBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-[10px] text-blue-200">YER</span>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10">
            <div className="text-[11px] text-emerald-200 font-medium">إجمالي المدين (مشتريات/فواتير)</div>
            <div className="text-base font-black font-mono mt-1 text-emerald-300">
              {Number(statementSummary.totalDebit).toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-[10px] text-emerald-200">YER</span>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10">
            <div className="text-[11px] text-amber-200 font-medium">إجمالي الدائن (سدادات/مردودات)</div>
            <div className="text-base font-black font-mono mt-1 text-amber-300">
              {Number(statementSummary.totalCredit).toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-[10px] text-amber-200">YER</span>
            </div>
          </div>
          <div className="bg-white/15 backdrop-blur-xs p-3 rounded-xl border border-white/20">
            <div className="text-[11px] text-white font-bold">الرصيد الختامي المستحق</div>
            <div className="text-lg font-black font-mono mt-1 text-blue-300">
              {Number(statementSummary.closingBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-[10px] text-blue-200">YER</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Search Data Bar */}
      <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute right-3 top-2.5 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="بحث داخل نتائج التقرير المعروض..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div className="text-xs font-bold text-slate-600">
          عدد الصفوف المعروضة: <span className="text-blue-900">{filteredData.length}</span>
        </div>
      </div>

      {/* 4. Report Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden" style={{ fontSize: `${zoomLevel}%` }}>
        {error && (
          <div className="p-6 text-center text-rose-600 font-bold text-xs flex items-center justify-center gap-2 bg-rose-50/50">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900 mx-auto mb-3"></div>
            <p className="text-slate-600 text-xs font-bold">جاري تحميل بيانات التقرير...</p>
          </div>
        ) : !error && filteredData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-xs">
                  {reportDef.columns.map(c => (
                    <th key={c.key} className="py-3 px-4 font-bold border-b border-slate-800">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                {filteredData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    {reportDef.columns.map(c => {
                      const val = row[c.key];
                      let formatted = val !== undefined && val !== null ? String(val) : '-';
                      if (c.format === 'currency' && typeof val === 'number') {
                        formatted = val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' YER';
                      }
                      return (
                        <td key={c.key} className="py-2.5 px-4 font-medium">
                          {formatted}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading && !error ? (
          <div className="py-16 text-center">
            <FileText size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-600 text-xs font-bold">لا توجد سجلات مطابقة للمعايير المحددة</p>
          </div>
        ) : null}
      </div>

      {/* 5. Print Preview Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Printer size={18} />
                <h3 className="text-sm font-bold">معاينة الطباعة الاحترافية (Print Preview)</h3>
              </div>
              <button onClick={() => setShowPrintModal(false)} className="p-1 hover:bg-slate-800 rounded-lg text-slate-300">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 bg-slate-100 flex-1 overflow-y-auto flex flex-col items-center">
              {/* Paper Layout controls */}
              <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-4 flex items-center gap-4 w-full max-w-2xl text-xs">
                <div>
                  <label className="font-bold text-slate-700 ml-2">حجم الورقة:</label>
                  <select value={paperSize} onChange={(e) => setPaperSize(e.target.value as any)} className="px-2 py-1 bg-slate-50 border rounded-lg">
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                    <option value="Letter">Letter</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 ml-2">الاتجاه:</label>
                  <select value={orientation} onChange={(e) => setOrientation(e.target.value as any)} className="px-2 py-1 bg-slate-50 border rounded-lg">
                    <option value="portrait">عمودي (Portrait)</option>
                    <option value="landscape">أفقي (Landscape)</option>
                  </select>
                </div>
              </div>

              {/* Virtual A4 Paper Container */}
              <div className="bg-white shadow-2xl rounded-lg p-8 w-full max-w-2xl text-slate-900 border border-slate-200 min-h-[500px] flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b-2 border-blue-900 pb-3 mb-4">
                    <div>
                      <h2 className="font-bold text-blue-900 text-base">شركة كيان للتجارة والتوزيع</h2>
                      <p className="text-[10px] text-slate-500">نظام كيان المحاسبي ERP</p>
                    </div>
                    <div className="text-left text-[10px] text-slate-500">
                      <div>التاريخ: {new Date().toLocaleDateString('ar-YE')}</div>
                    </div>
                  </div>

                  <h3 className="text-center font-bold text-sm mb-1">{reportDef.name}</h3>
                  <p className="text-center text-[10px] text-slate-500 mb-4">{reportDef.description}</p>

                  <table className="w-full text-right border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-blue-900 text-white">
                        {reportDef.columns.map(c => (
                          <th key={c.key} className="py-1.5 px-2 border">{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.slice(0, 8).map((row, i) => (
                        <tr key={i} className="border-b">
                          {reportDef.columns.map(c => (
                            <td key={c.key} className="py-1.5 px-2 border">{row[c.key] !== undefined ? row[c.key] : ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredData.length > 8 && (
                    <div className="text-center text-[10px] text-slate-500 mt-2">
                      ... (تم إظهار 8 أسطر من إجمالي {filteredData.length} سطر في المعاينة)
                    </div>
                  )}
                </div>

                <div className="border-t pt-3 mt-6 flex justify-between text-[10px] text-slate-500">
                  <div>المستخدم: مسؤول النظام</div>
                  <div>صفحة 1 من 1</div>
                  <div>نظام كيان ERP</div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t flex justify-end gap-2">
              <button onClick={() => setShowPrintModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-700">
                إغلاق
              </button>
              <button 
                onClick={() => {
                  setShowPrintModal(false);
                  ReportExportService.printReport(reportDef, filteredData);
                }} 
                className="px-4 py-2 bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md"
              >
                <Printer size={14} />
                <span>طباعة فعلية الآن</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
