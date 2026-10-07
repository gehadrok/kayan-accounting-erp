import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  FileSpreadsheet,
  ArrowRightLeft,
  Wrench,
  Trash2,
  TrendingDown,
  Layers,
  Calendar,
  Sparkles,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ShieldCheck,
  Percent,
  RefreshCw,
  Coins
} from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';

interface AssetCategory {
  id: string;
  code: string;
  name: string;
  useful_life_months: number;
  depreciation_method: string;
  assetAccountCode?: string;
  assetAccountName?: string;
  accumulatedAccountCode?: string;
  accumulatedAccountName?: string;
  expenseAccountCode?: string;
  expenseAccountName?: string;
  gainAccountCode?: string;
  lossAccountCode?: string;
  active: boolean;
}

interface FixedAsset {
  id: string;
  asset_code: string;
  asset_name: string;
  category_id: string;
  categoryName?: string;
  branchName?: string;
  costCenterName?: string;
  acquisition_date: string;
  capitalization_date?: string;
  acquisition_cost: number;
  salvage_value: number;
  useful_life_months: number;
  depreciation_method: string;
  accumulatedDepreciation: number;
  netBookValue: number;
  status: 'DRAFT' | 'ACTIVE' | 'UNDER_CONSTRUCTION' | 'FULLY_DEPRECIATED' | 'DISPOSED' | 'SOLD' | 'RETIRED';
  serial_number?: string;
  location?: string;
  supplierName?: string;
  acquisition_journal_entry_id?: string;
  postedPeriodsCount: number;
  notes?: string;
}

interface DepreciationScheduleItem {
  id: string;
  period_month_index: number;
  periodName: string;
  periodStatus: string;
  depreciation_amount: number;
  accumulated_depreciation_after: number;
  net_book_value_after: number;
  is_posted: boolean;
  posted_date?: string;
  journalEntryNumber?: string;
}

interface FiscalPeriod {
  id: string;
  period_number: number;
  name: string;
  status: 'OPEN' | 'CLOSED';
}

export const FixedAssetsPage: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [activeTab, setActiveTab] = useState<'register' | 'categories' | 'schedule' | 'reconciliation'>('register');
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [reconciliation, setReconciliation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Selected asset for drawer or detailed operations
  const [selectedAsset, setSelectedAsset] = useState<FixedAsset | null>(null);
  const [assetDetails, setAssetDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCapitalizeModal, setShowCapitalizeModal] = useState(false);
  const [showDepreciateModal, setShowDepreciateModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showDisposalModal, setShowDisposalModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // Form states
  const [assetForm, setAssetForm] = useState({
    assetCode: '',
    assetName: '',
    categoryId: '',
    branchId: '',
    costCenterId: '',
    acquisitionDate: new Date().toISOString().split('T')[0],
    acquisitionCost: '',
    salvageValue: '0',
    usefulLifeMonths: '60',
    status: 'ACTIVE',
    paymentMethod: 'NONE', // NONE, CASH, BANK
    cashAccountId: '',
    bankAccountId: '',
    serialNumber: '',
    location: '',
    notes: '',
  });

  const [categoryForm, setCategoryForm] = useState({
    code: '',
    name: '',
    usefulLifeMonths: '60',
    depreciationMethod: 'STRAIGHT_LINE',
    assetAccountCode: '1201',
    accumulatedAccountCode: '1290',
    expenseAccountCode: '5301',
    gainAccountCode: '4103',
    lossAccountCode: '5309',
  });

  const [capitalizeForm, setCapitalizeForm] = useState({
    capitalizationDate: new Date().toISOString().split('T')[0],
  });

  const [depreciateForm, setDepreciateForm] = useState({
    fiscalPeriodId: '',
  });

  const [transferForm, setTransferForm] = useState({
    transferDate: new Date().toISOString().split('T')[0],
    toBranchId: '',
    toCostCenterId: '',
    toLocation: '',
    reason: '',
  });

  const [maintenanceForm, setMaintenanceForm] = useState({
    maintenanceDate: new Date().toISOString().split('T')[0],
    maintenanceType: 'EXPENSE',
    vendorName: '',
    description: '',
    cost: '',
    paymentMethod: 'CASH',
    cashAccountId: '',
    bankAccountId: '',
  });

  const [disposalForm, setDisposalForm] = useState({
    disposalDate: new Date().toISOString().split('T')[0],
    disposalType: 'SALE',
    proceeds: '0',
    paymentMethod: 'BANK',
    cashAccountId: '',
    bankAccountId: '',
    buyerName: '',
    notes: '',
  });

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resAssets, resCats, resPeriods, resBanks, resCash, resBranches, resCC, resRecon] = await Promise.all([
        fetch('/api/assets').then(r => r.json()),
        fetch('/api/assets/categories').then(r => r.json()),
        fetch('/api/accounting/fiscal-periods').then(r => r.json()).catch(() => []),
        fetch('/api/banking/bank-accounts').then(r => r.json()).catch(() => []),
        fetch('/api/banking/cash-accounts').then(r => r.json()).catch(() => []),
        fetch('/api/core/branches').then(r => r.json()).catch(() => []),
        fetch('/api/accounting/cost-centers').then(r => r.json()).catch(() => []),
        fetch('/api/assets/reports/reconciliation').then(r => r.json()).catch(() => null),
      ]);

      setAssets(Array.isArray(resAssets) ? resAssets : []);
      setCategories(Array.isArray(resCats) ? resCats : []);
      setFiscalPeriods(Array.isArray(resPeriods) ? resPeriods : []);
      setBankAccounts(Array.isArray(resBanks) ? resBanks : []);
      setCashAccounts(Array.isArray(resCash) ? resCash : []);
      setBranches(Array.isArray(resBranches) ? resBranches : []);
      setCostCenters(Array.isArray(resCC) ? resCC : []);
      setReconciliation(resRecon);
    } catch (err: any) {
      console.error(err);
      setMessage({ text: 'فشل تحميل بيانات الأصول الثابتة', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const viewAssetDetails = async (asset: FixedAsset) => {
    setSelectedAsset(asset);
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/assets/${asset.id}`).then(r => r.json());
      setAssetDetails(res);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        ...assetForm,
        acquisitionCost: parseFloat(assetForm.acquisitionCost),
        salvageValue: parseFloat(assetForm.salvageValue || '0'),
        usefulLifeMonths: parseInt(assetForm.usefulLifeMonths, 10),
      };
      if (assetForm.paymentMethod === 'NONE') {
        delete payload.paymentMethod;
        delete payload.cashAccountId;
        delete payload.bankAccountId;
      }

      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إضافة الأصل');

      setMessage({ text: `تم إضافة الأصل (${data.asset_name}) بنجاح`, type: 'success' });
      setShowAddModal(false);
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleCapitalize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    try {
      const res = await fetch(`/api/assets/${selectedAsset.id}/capitalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capitalizeForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل رسملة الأصل');

      setMessage({ text: `تمت رسملة الأصل (${selectedAsset.asset_name}) وتحويله إلى نشط بالخدمة بنجاح`, type: 'success' });
      setShowCapitalizeModal(false);
      fetchData();
      if (selectedAsset) viewAssetDetails(selectedAsset);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleDepreciate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    try {
      const res = await fetch(`/api/assets/${selectedAsset.id}/depreciation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(depreciateForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل ترحيل الإهلاك');

      setMessage({ text: `تم ترحيل إهلاك الأصل بقيمة ${data.depreciationAmount?.toLocaleString()} ر.ي (قيد رقم: ${data.journalEntryNumber})`, type: 'success' });
      setShowDepreciateModal(false);
      fetchData();
      if (selectedAsset) viewAssetDetails(selectedAsset);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    try {
      const res = await fetch(`/api/assets/${selectedAsset.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transferForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل نقل الأصل');

      setMessage({ text: 'تم تسجيل النقل الإداري للأصل مع توثيق سجل التدقيق بنجاح', type: 'success' });
      setShowTransferModal(false);
      fetchData();
      if (selectedAsset) viewAssetDetails(selectedAsset);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    try {
      const payload: any = {
        ...maintenanceForm,
        cost: parseFloat(maintenanceForm.cost),
      };
      const res = await fetch(`/api/assets/${selectedAsset.id}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل عملية الصيانة');

      setMessage({ text: `تم تسجيل الصيانة وترحيل القيد المحاسبي (${data.journalEntryNumber || 'تم الترحيل'}) بنجاح`, type: 'success' });
      setShowMaintenanceModal(false);
      fetchData();
      if (selectedAsset) viewAssetDetails(selectedAsset);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleDisposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    try {
      const payload: any = {
        ...disposalForm,
        proceeds: parseFloat(disposalForm.proceeds || '0'),
      };
      const res = await fetch(`/api/assets/${selectedAsset.id}/dispose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل استبعاد الأصل');

      const gainLossStr = data.gainLossAmount >= 0 
        ? `أرباح استبعاد: +${data.gainLossAmount.toLocaleString()} ر.ي`
        : `خسائر استبعاد: ${data.gainLossAmount.toLocaleString()} ر.ي`;

      setMessage({ text: `تم استبعاد الأصل بنجاح (${gainLossStr}) - قيد رقم: ${data.journalEntryNumber}`, type: 'success' });
      setShowDisposalModal(false);
      setSelectedAsset(null);
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...categoryForm,
        usefulLifeMonths: parseInt(categoryForm.usefulLifeMonths, 10),
      };
      const res = await fetch('/api/assets/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إضافة الفئة');

      setMessage({ text: `تم إضافة فئة الأصول (${data.name}) بنجاح`, type: 'success' });
      setShowCategoryModal(false);
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  // KPIs
  const totalAcquisitionCost = assets.reduce((sum, a) => sum + (a.status !== 'DISPOSED' && a.status !== 'SOLD' ? a.acquisition_cost : 0), 0);
  const totalAccDepreciation = assets.reduce((sum, a) => sum + (a.status !== 'DISPOSED' && a.status !== 'SOLD' ? a.accumulatedDepreciation : 0), 0);
  const totalNetBookValue = assets.reduce((sum, a) => sum + (a.status !== 'DISPOSED' && a.status !== 'SOLD' ? a.netBookValue : 0), 0);
  const activeAssetsCount = assets.filter(a => a.status === 'ACTIVE').length;
  const cipAssetsCount = assets.filter(a => a.status === 'UNDER_CONSTRUCTION').length;

  const filteredAssets = assets.filter(a => {
    const matchesSearch = 
      a.asset_name.toLowerCase().includes(search.toLowerCase()) ||
      a.asset_code.toLowerCase().includes(search.toLowerCase()) ||
      (a.serial_number && a.serial_number.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || a.status === statusFilter;
    const matchesCategory = categoryFilter === 'ALL' || a.category_id === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">نشط في الخدمة</span>;
      case 'UNDER_CONSTRUCTION':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">تحت التنفيذ (CIP)</span>;
      case 'DRAFT':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/30">مسودة</span>;
      case 'FULLY_DEPRECIATED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">مكتمل الإهلاك</span>;
      case 'DISPOSED':
      case 'SOLD':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">مستبعد / مبيع</span>;
      case 'RETIRED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">مكهن / خارج الخدمة</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-700 text-slate-300">{status}</span>;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30 shadow-inner">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-wide">إدارة الأصول الثابتة والإهلاك</h1>
              <p className="text-sm text-slate-400">سجل الأصول، الرسملة، الإهلاك الآلي، مجمع الإهلاك، ومطابقة الأستاذ العام</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowCategoryModal(true)}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition flex items-center gap-2"
          >
            <Layers className="w-4 h-4 text-slate-400" />
            فئات الأصول
          </button>
          <button
            onClick={() => {
              setAssetForm({
                assetCode: `AST-${Date.now().toString().slice(-4)}`,
                assetName: '',
                categoryId: categories[0]?.id || '',
                branchId: branches[0]?.id || '',
                costCenterId: costCenters[0]?.id || '',
                acquisitionDate: new Date().toISOString().split('T')[0],
                acquisitionCost: '',
                salvageValue: '0',
                usefulLifeMonths: categories[0]?.useful_life_months?.toString() || '60',
                status: 'ACTIVE',
                paymentMethod: 'BANK',
                cashAccountId: cashAccounts[0]?.id || '',
                bankAccountId: bankAccounts[0]?.id || '',
                serialNumber: '',
                location: '',
                notes: '',
              });
              setShowAddModal(true);
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            إضافة أصل جديد
          </button>
        </div>
      </div>

      {/* Global Alert Notification */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center justify-between gap-3 border ${
          message.type === 'success' 
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200' 
            : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
        }`}>
          <div className="flex items-center gap-2.5">
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5 text-rose-400" />}
            <span className="text-sm font-medium">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111927] border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">إجمالي تكلفة الاقتناء</span>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
              <Coins className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">{totalAcquisitionCost.toLocaleString()} <span className="text-xs font-normal text-slate-400">ر.ي</span></div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
              <span className="text-emerald-400 font-medium">{activeAssetsCount} أصل نشط</span>
              <span>•</span>
              <span className="text-amber-400 font-medium">{cipAssetsCount} قيد الإنشاء</span>
            </div>
          </div>
        </div>

        <div className="bg-[#111927] border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">مجمع الإهلاك التراكمي</span>
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-400">{totalAccDepreciation.toLocaleString()} <span className="text-xs font-normal text-slate-400">ر.ي</span></div>
            <div className="text-xs text-slate-400 mt-1">
              حساب المجمع (1290) - محسوب من الحركات
            </div>
          </div>
        </div>

        <div className="bg-[#111927] border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">صافي القيمة الدفترية (NBV)</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-400">{totalNetBookValue.toLocaleString()} <span className="text-xs font-normal text-slate-400">ر.ي</span></div>
            <div className="text-xs text-slate-400 mt-1">
              التكلفة مطروحاً منها الإهلاك
            </div>
          </div>
        </div>

        <div className="bg-[#111927] border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">مطابقة الأستاذ العام (GL)</span>
            <div className={`p-2 rounded-lg ${reconciliation?.isBalanced ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-black text-white">
              {reconciliation?.isBalanced ? (
                <span className="text-emerald-400">مطابق بنسبة 100%</span>
              ) : (
                <span className="text-amber-400">تحديث مستمر</span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              سجل الأصول الفرعي متطابق مع القيود
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('register')}
          className={`pb-3 px-4 font-semibold text-sm transition border-b-2 flex items-center gap-2 ${
            activeTab === 'register'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          سجل الأصول ودليل الممتلكات ({assets.length})
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`pb-3 px-4 font-semibold text-sm transition border-b-2 flex items-center gap-2 ${
            activeTab === 'categories'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          فئات وقواعد الإهلاك ({categories.length})
        </button>
        <button
          onClick={() => setActiveTab('reconciliation')}
          className={`pb-3 px-4 font-semibold text-sm transition border-b-2 flex items-center gap-2 ${
            activeTab === 'reconciliation'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          تقرير مطابقة الأستاذ العام (Subledger vs GL)
        </button>
      </div>

      {/* Tab Content 1: Asset Register */}
      {activeTab === 'register' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-[#111927] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="بحث برقم الأصل أو الاسم أو الرقم التسلسلي..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-10 pl-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">جميع الحالات</option>
                <option value="ACTIVE">نشط بالخدمة</option>
                <option value="UNDER_CONSTRUCTION">تحت التنفيذ (CIP)</option>
                <option value="DRAFT">مسودة</option>
                <option value="FULLY_DEPRECIATED">مكتمل الإهلاك</option>
                <option value="DISPOSED">مستبعد / مبيع</option>
              </select>

              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">جميع الفئات</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <button
                onClick={fetchData}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                title="تحديث البيانات"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-[#111927] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="py-3.5 px-4">رقم الأصل</th>
                    <th className="py-3.5 px-4">اسم الأصل والمواصفات</th>
                    <th className="py-3.5 px-4">الفئة</th>
                    <th className="py-3.5 px-4">تاريخ الاقتناء</th>
                    <th className="py-3.5 px-4">تكلفة الاقتناء</th>
                    <th className="py-3.5 px-4">مجمع الإهلاك</th>
                    <th className="py-3.5 px-4">القيمة الدفترية (NBV)</th>
                    <th className="py-3.5 px-4">الحالة</th>
                    <th className="py-3.5 px-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">جاري تحميل سجل الأصول...</td>
                    </tr>
                  ) : filteredAssets.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">لا توجد أصول مسجلة مطابقة للبحث</td>
                    </tr>
                  ) : (
                    filteredAssets.map(asset => (
                      <tr key={asset.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-4 font-mono text-blue-400 font-bold">{asset.asset_code}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{asset.asset_name}</div>
                          {asset.serial_number && (
                            <div className="text-xs text-slate-500 font-mono">SN: {asset.serial_number}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">{asset.categoryName || 'عام'}</td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono text-xs">{asset.acquisition_date}</td>
                        <td className="py-3.5 px-4 font-bold text-white">{asset.acquisition_cost?.toLocaleString()} ر.ي</td>
                        <td className="py-3.5 px-4 text-amber-400 font-medium">{asset.accumulatedDepreciation?.toLocaleString()} ر.ي</td>
                        <td className="py-3.5 px-4 font-bold text-emerald-400">{asset.netBookValue?.toLocaleString()} ر.ي</td>
                        <td className="py-3.5 px-4">{getStatusBadge(asset.status)}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => viewAssetDetails(asset)}
                              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                              title="عرض التفاصيل وجدول الإهلاك"
                            >
                              عرض
                            </button>

                            {asset.status === 'UNDER_CONSTRUCTION' && (
                              <button
                                onClick={() => {
                                  setSelectedAsset(asset);
                                  setShowCapitalizeModal(true);
                                }}
                                className="px-2 py-1 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg transition"
                                title="رسملة المشروع إلى أصل نشط"
                              >
                                رسملة
                              </button>
                            )}

                            {asset.status === 'ACTIVE' && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedAsset(asset);
                                    setShowDepreciateModal(true);
                                  }}
                                  className="px-2 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg transition"
                                  title="ترحيل إهلاك فترة"
                                >
                                  إهلاك
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedAsset(asset);
                                    setShowMaintenanceModal(true);
                                  }}
                                  className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                                  title="تسجيل صيانة"
                                >
                                  صيانة
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedAsset(asset);
                                    setShowTransferModal(true);
                                  }}
                                  className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                                  title="نقل إداري"
                                >
                                  نقل
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedAsset(asset);
                                    setShowDisposalModal(true);
                                  }}
                                  className="px-2 py-1 text-xs bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 rounded-lg transition"
                                  title="استبعاد أو بيع الأصل"
                                >
                                  استبعاد
                                </button>
                              </>
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
        </div>
      )}

      {/* Tab Content 2: Categories */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-[#111927] border border-slate-800 rounded-2xl p-4">
            <div>
              <h3 className="font-bold text-white text-base">فئات الأصول الثابتة وقواعد الإهلاك</h3>
              <p className="text-xs text-slate-400">تحديد العمر الإنتاجي وحسابات الأستاذ العام المرتبطة لكل مجموعة أصول</p>
            </div>
            <button
              onClick={() => setShowCategoryModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              إضافة فئة أصول
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map(cat => (
              <div key={cat.id} className="bg-[#111927] border border-slate-800 rounded-2xl p-5 space-y-3 hover:border-slate-700 transition">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 font-mono text-xs font-bold rounded-md">{cat.code}</span>
                  <span className="text-xs text-slate-400">{cat.depreciation_method === 'STRAIGHT_LINE' ? 'القسط الثابت' : cat.depreciation_method}</span>
                </div>
                <h4 className="text-lg font-bold text-white">{cat.name}</h4>
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>العمر الإنتاجي: <strong className="text-slate-200">{cat.useful_life_months} شهراً</strong> ({Math.round(cat.useful_life_months / 12)} سنوات)</span>
                </div>
                <div className="border-t border-slate-800/80 pt-3 space-y-1.5 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>حساب الأصل:</span>
                    <span className="text-slate-200 font-mono">{cat.assetAccountCode || '1201'} - {cat.assetAccountName || 'الأصول'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>مجمع الإهلاك:</span>
                    <span className="text-amber-400 font-mono">{cat.accumulatedAccountCode || '1290'} - {cat.accumulatedAccountName || 'مجمع الإهلاك'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>مصروف الإهلاك:</span>
                    <span className="text-blue-400 font-mono">{cat.expenseAccountCode || '5301'} - {cat.expenseAccountName || 'مصروف إهلاك'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>أرباح الاستبعاد:</span>
                    <span className="text-emerald-400 font-mono">{cat.gainAccountCode || '4103'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>خسائر الاستبعاد:</span>
                    <span className="text-rose-400 font-mono">{cat.lossAccountCode || '5309'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content 3: Reconciliation Report */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">تقرير مطابقة سجل الأصول الثابتة مع الأستاذ العام (GL)</h3>
                <p className="text-xs text-slate-400">فحص التطابق بين الرصيد المحسوب من واقع سجل الأصول وأرصدة قيود اليومية العامة</p>
              </div>
              <button
                onClick={fetchData}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                إعادة التحقق
              </button>
            </div>

            {reconciliation ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Cost Reconciliation */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <Coins className="w-4 h-4 text-blue-400" />
                    مطابقة تكلفة الأصول الثابتة (حساب 1201 وما يرتبط به)
                  </h4>
                  <div className="divide-y divide-slate-800/60 text-sm">
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-400">إجمالي سجل الأصول الفرعي (Subledger):</span>
                      <span className="font-bold text-white">{reconciliation.subledgerCost?.toLocaleString()} ر.ي</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-400">رصيد الأستاذ العام (General Ledger):</span>
                      <span className="font-bold text-white">{reconciliation.glCostBalance?.toLocaleString()} ر.ي</span>
                    </div>
                    <div className="py-2.5 flex justify-between font-bold">
                      <span className="text-slate-300">الفارق (Variance):</span>
                      <span className={reconciliation.costDifference === 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {reconciliation.costDifference === 0 ? '0.00 ر.ي (متطابق)' : `${reconciliation.costDifference?.toLocaleString()} ر.ي`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Accumulated Depreciation Reconciliation */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-amber-400" />
                    مطابقة مجمع الإهلاك (حساب 1290)
                  </h4>
                  <div className="divide-y divide-slate-800/60 text-sm">
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-400">إجمالي إهلاك سجل الأصول (Subledger):</span>
                      <span className="font-bold text-amber-400">{reconciliation.subledgerAccDepreciation?.toLocaleString()} ر.ي</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-400">رصيد الأستاذ العام لمجمع الإهلاك:</span>
                      <span className="font-bold text-amber-400">{reconciliation.glAccDepreciationBalance?.toLocaleString()} ر.ي</span>
                    </div>
                    <div className="py-2.5 flex justify-between font-bold">
                      <span className="text-slate-300">الفارق (Variance):</span>
                      <span className={reconciliation.depreciationDifference === 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {reconciliation.depreciationDifference === 0 ? '0.00 ر.ي (متطابق)' : `${reconciliation.depreciationDifference?.toLocaleString()} ر.ي`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500">جاري إعداد بيانات المطابقة...</div>
            )}
          </div>
        </div>
      )}

      {/* Asset Detail Drawer / Modal */}
      {selectedAsset && !showCapitalizeModal && !showDepreciateModal && !showTransferModal && !showMaintenanceModal && !showDisposalModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{selectedAsset.asset_name}</h3>
                  <p className="text-xs text-slate-400 font-mono">الكود: {selectedAsset.asset_code} | الفئة: {selectedAsset.categoryName}</p>
                </div>
              </div>
              <button onClick={() => setSelectedAsset(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Stats Banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">تكلفة الاقتناء</span>
                <div className="text-lg font-bold text-white">{selectedAsset.acquisition_cost?.toLocaleString()} ر.ي</div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">مجمع الإهلاك</span>
                <div className="text-lg font-bold text-amber-400">{selectedAsset.accumulatedDepreciation?.toLocaleString()} ر.ي</div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">صافي القيمة الدفترية</span>
                <div className="text-lg font-bold text-emerald-400">{selectedAsset.netBookValue?.toLocaleString()} ر.ي</div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">الحالة الحالية</span>
                <div className="mt-0.5">{getStatusBadge(selectedAsset.status)}</div>
              </div>
            </div>

            {/* Details & Schedule */}
            {detailsLoading ? (
              <div className="py-8 text-center text-slate-500">جاري تحميل جدول الإهلاك والحركات...</div>
            ) : assetDetails ? (
              <div className="space-y-4">
                <h4 className="font-bold text-white text-sm border-b border-slate-800 pb-2">جدول الإهلاك (Depreciation Schedule)</h4>
                <div className="overflow-x-auto max-h-60 border border-slate-800 rounded-xl">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-900 sticky top-0 text-slate-400">
                      <tr>
                        <th className="py-2.5 px-3">الشهر</th>
                        <th className="py-2.5 px-3">الفترة المالية</th>
                        <th className="py-2.5 px-3">مبلغ الإهلاك</th>
                        <th className="py-2.5 px-3">المجمع بعدها</th>
                        <th className="py-2.5 px-3">الصافي الدفتري</th>
                        <th className="py-2.5 px-3">حالة الترحيل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {assetDetails.schedule?.map((item: DepreciationScheduleItem) => (
                        <tr key={item.id} className={item.is_posted ? 'bg-emerald-950/20' : ''}>
                          <td className="py-2 px-3 font-mono">شهر {item.period_month_index}</td>
                          <td className="py-2 px-3">{item.periodName}</td>
                          <td className="py-2 px-3 font-bold text-white">{item.depreciation_amount?.toLocaleString()} ر.ي</td>
                          <td className="py-2 px-3 text-amber-400">{item.accumulated_depreciation_after?.toLocaleString()} ر.ي</td>
                          <td className="py-2 px-3 text-emerald-400">{item.net_book_value_after?.toLocaleString()} ر.ي</td>
                          <td className="py-2 px-3">
                            {item.is_posted ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> مرحل (قيد {item.journalEntryNumber})
                              </span>
                            ) : (
                              <span className="text-slate-400">مجدول</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Operations History */}
                {assetDetails.maintenance?.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="font-bold text-slate-300 text-xs">سجل الصيانة والتحسينات</h5>
                    <div className="divide-y divide-slate-800/60 border border-slate-800 rounded-xl p-3 text-xs">
                      {assetDetails.maintenance.map((m: any) => (
                        <div key={m.id} className="py-1.5 flex justify-between items-center">
                          <span>{m.description} ({m.vendor_name})</span>
                          <span className="font-bold text-white">{parseFloat(m.cost).toLocaleString()} ر.ي</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedAsset(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Asset */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">إضافة أصل ثابت جديد</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAsset} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1">كود الأصل *</label>
                  <input
                    type="text"
                    required
                    value={assetForm.assetCode}
                    onChange={e => setAssetForm({ ...assetForm, assetCode: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">اسم الأصل *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: سيارة نقل تويوتا هايلوكس 2026"
                    value={assetForm.assetName}
                    onChange={e => setAssetForm({ ...assetForm, assetName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1">فئة الأصل *</label>
                  <select
                    required
                    value={assetForm.categoryId}
                    onChange={e => {
                      const c = categories.find(cat => cat.id === e.target.value);
                      setAssetForm({
                        ...assetForm,
                        categoryId: e.target.value,
                        usefulLifeMonths: c?.useful_life_months?.toString() || assetForm.usefulLifeMonths,
                      });
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">حالة البداية</label>
                  <select
                    value={assetForm.status}
                    onChange={e => setAssetForm({ ...assetForm, status: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="ACTIVE">نشط مباشرة بالخدمة</option>
                    <option value="UNDER_CONSTRUCTION">مشروع تحت التنفيذ (CIP)</option>
                    <option value="DRAFT">مسودة لا تحسب إهلاكاً</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1">تكلفة الاقتناء (ر.ي) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="1"
                    placeholder="مثال: 50000000"
                    value={assetForm.acquisitionCost}
                    onChange={e => setAssetForm({ ...assetForm, acquisitionCost: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">قيمة الخردة المقدرة (ر.ي)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={assetForm.salvageValue}
                    onChange={e => setAssetForm({ ...assetForm, salvageValue: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">العمر الإنتاجي (شهراً) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={assetForm.usefulLifeMonths}
                    onChange={e => setAssetForm({ ...assetForm, usefulLifeMonths: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1">تاريخ الاقتناء *</label>
                  <input
                    type="date"
                    required
                    value={assetForm.acquisitionDate}
                    onChange={e => setAssetForm({ ...assetForm, acquisitionDate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">طريقة السداد / الشراء</label>
                  <select
                    value={assetForm.paymentMethod}
                    onChange={e => setAssetForm({ ...assetForm, paymentMethod: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="BANK">تحويل بنكي مباشر (توليد قيد وسحب بنكي)</option>
                    <option value="CASH">صرف من الصندوق (توليد قيد وصرف نقدي)</option>
                    <option value="NONE">بدون دفع فوري (رصيد افتتاحي / قيد منفصل)</option>
                  </select>
                </div>
              </div>

              {assetForm.paymentMethod === 'BANK' && (
                <div>
                  <label className="block text-slate-300 mb-1">الحساب البنكي المسدد منه *</label>
                  <select
                    required
                    value={assetForm.bankAccountId}
                    onChange={e => setAssetForm({ ...assetForm, bankAccountId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>{b.bank_name} - {b.account_name} ({b.account_number})</option>
                    ))}
                  </select>
                </div>
              )}

              {assetForm.paymentMethod === 'CASH' && (
                <div>
                  <label className="block text-slate-300 mb-1">الصندوق المسدد منه *</label>
                  <select
                    required
                    value={assetForm.cashAccountId}
                    onChange={e => setAssetForm({ ...assetForm, cashAccountId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    {cashAccounts.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1">الرقم التسلسلي / الشاصي</label>
                  <input
                    type="text"
                    placeholder="SN-..."
                    value={assetForm.serialNumber}
                    onChange={e => setAssetForm({ ...assetForm, serialNumber: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">موقع الأصل</label>
                  <input
                    type="text"
                    placeholder="مثال: صنعاء - الفرع الرئيسي"
                    value={assetForm.location}
                    onChange={e => setAssetForm({ ...assetForm, location: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl"
                >
                  حفظ الأصل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Capitalize Asset */}
      {showCapitalizeModal && selectedAsset && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">رسملة الأصل (Capitalization)</h3>
              <button onClick={() => setShowCapitalizeModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              تحويل الأصل من مشروع تحت التنفيذ (CIP) إلى أصل نشط في الخدمة. سيتم ترحيل قيد إعادة التصنيف وتوليد جدول الإهلاك الشهري.
            </p>
            <form onSubmit={handleCapitalize} className="space-y-4 text-sm">
              <div>
                <label className="block text-slate-300 mb-1">تاريخ الرسملة والبدء في الخدمة *</label>
                <input
                  type="date"
                  required
                  value={capitalizeForm.capitalizationDate}
                  onChange={e => setCapitalizeForm({ capitalizationDate: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCapitalizeModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl"
                >
                  تأكيد الرسملة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Post Depreciation */}
      {showDepreciateModal && selectedAsset && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">ترحيل إهلاك فترة للأصل</h3>
              <button onClick={() => setShowDepreciateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              سيتم ترحيل قيد الإهلاك المحاسبي المتوازن (مدين حساب مصروف الإهلاك / دائن مجمع الإهلاك) وتحديث صافي القيمة الدفترية.
            </p>
            <form onSubmit={handleDepreciate} className="space-y-4 text-sm">
              <div>
                <label className="block text-slate-300 mb-1">الفترة المالية المفتوحة *</label>
                <select
                  required
                  value={depreciateForm.fiscalPeriodId}
                  onChange={e => setDepreciateForm({ fiscalPeriodId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="">-- اختر فترة مالية --</option>
                  {fiscalPeriods.filter(p => p.status === 'OPEN').map(p => (
                    <option key={p.id} value={p.id}>{p.name} (شهر {p.period_number})</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDepreciateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl"
                >
                  ترحيل الإهلاك
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Disposal */}
      {showDisposalModal && selectedAsset && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">استبعاد أو بيع الأصل الثابت</h3>
              <button onClick={() => setShowDisposalModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
              <div>القيمة الدفترية الحالية: <strong className="text-emerald-400">{selectedAsset.netBookValue?.toLocaleString()} ر.ي</strong></div>
              <div>مجمع الإهلاك المحذوف: <strong className="text-amber-400">{selectedAsset.accumulatedDepreciation?.toLocaleString()} ر.ي</strong></div>
            </div>
            <form onSubmit={handleDisposal} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">نوع الاستبعاد *</label>
                  <select
                    value={disposalForm.disposalType}
                    onChange={e => setDisposalForm({ ...disposalForm, disposalType: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="SALE">بيع بمقابل</option>
                    <option value="SCRAP">تكهين وتخريد بدون مقابل</option>
                    <option value="DONATION">تبرع</option>
                    <option value="WRITE_OFF">شطب وإتلاف</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">تاريخ الاستبعاد *</label>
                  <input
                    type="date"
                    required
                    value={disposalForm.disposalDate}
                    onChange={e => setDisposalForm({ ...disposalForm, disposalDate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              {disposalForm.disposalType === 'SALE' && (
                <div>
                  <label className="block text-slate-300 mb-1">متحصلات البيع (Proceeds) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={disposalForm.proceeds}
                    onChange={e => setDisposalForm({ ...disposalForm, proceeds: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                  <span className="text-xs text-slate-400 mt-1 block">
                    إذا كان البيع أعلى من القيمة الدفترية: أرباح رأسمالية (حساب 4103). إذا كان أقل: خسائر استبعاد (حساب 5309).
                  </span>
                </div>
              )}

              <div>
                <label className="block text-slate-300 mb-1">ملاحظات وسبب الاستبعاد</label>
                <textarea
                  rows={2}
                  value={disposalForm.notes}
                  onChange={e => setDisposalForm({ ...disposalForm, notes: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDisposalModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl"
                >
                  تأكيد الاستبعاد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Category */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111927] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">إضافة فئة أصول ثابتة</h3>
              <button onClick={() => setShowCategoryModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCategory} className="space-y-3 text-sm">
              <div>
                <label className="block text-slate-300 mb-1">كود الفئة *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: CAT-VEH"
                  value={categoryForm.code}
                  onChange={e => setCategoryForm({ ...categoryForm, code: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">اسم الفئة *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: وسائل النقل والسيارات"
                  value={categoryForm.name}
                  onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">العمر الإنتاجي الافتراضي (شهراً) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={categoryForm.usefulLifeMonths}
                  onChange={e => setCategoryForm({ ...categoryForm, usefulLifeMonths: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl"
                >
                  حفظ الفئة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
