import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Barcode,
  CheckCircle2,
  CreditCard,
  Delete,
  DollarSign,
  HelpCircle,
  Layers,
  Minus,
  Package,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Trash2,
  User,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { useSettings } from '../context/SettingsContext';
import { Button, Card, StatusBadge, useToast } from '../components/ui';

interface PosItem {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  salePrice: number;
  availableQty: number;
  categoryId?: string;
  categoryName?: string;
  unitName?: string;
}

interface PosLine {
  item: PosItem;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export const PointOfSalePage: React.FC = () => {
  const { company } = useCompanyProfile();
  const toast = useToast();
  const showToast = (message: string, tone: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    toast[tone](message);
  };

  const [items, setItems] = useState<PosItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active selections
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  // Cart
  const [cart, setCart] = useState<PosLine[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cashTendered, setCashTendered] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);

  // Success / Receipt Modal
  const [completedInvoice, setCompletedInvoice] = useState<any | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Play cashier beep using Web Audio API
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz (A5)
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } catch {
      // AudioContext not allowed or unsupported
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [resItems, resCats, resWhs, resCusts] = await Promise.all([
        fetch('/api/inventory/items'),
        fetch('/api/inventory/categories'),
        fetch('/api/inventory/warehouses'),
        fetch('/api/customers'),
      ]);

      if (resItems.ok) {
        const rawItems = await resItems.json();
        setItems(
          rawItems.map((r: any) => ({
            id: r.id,
            sku: r.sku || '',
            barcode: r.barcode || '',
            name: r.name || '',
            salePrice: parseFloat(r.salePrice || r.sale_price) || 0,
            availableQty: parseFloat(r.currentStock || r.current_stock || r.stockQuantity) || 0,
            categoryId: r.categoryId || r.category_id,
            categoryName: r.categoryName || r.category_name,
            unitName: r.unitName || r.unit_name || 'حبة',
          }))
        );
      }

      if (resCats.ok) {
        setCategories(await resCats.json());
      }

      if (resWhs.ok) {
        const whs = await resWhs.json();
        setWarehouses(whs);
        if (whs.length > 0) {
          // Select POS warehouse (WH-02) if found, else first
          const posWh = whs.find((w: any) => w.code === 'WH-02') || whs[0];
          setSelectedWarehouseId(posWh.id);
        }
      }

      if (resCusts.ok) {
        const custs = await resCusts.json();
        setCustomers(custs);
        // Default to cash customer (CUST-003)
        const cashCust = custs.find((c: any) => c.code === 'CUST-003' || c.name.includes('نقدي')) || custs[0];
        if (cashCust) {
          setSelectedCustomerId(cashCust.id);
        }
      }
    } catch (err) {
      console.error('POS data load error:', err);
    } finally {
      setLoading(false);
      barcodeInputRef.current?.focus();
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory =
        selectedCategoryId === 'ALL' || item.categoryId === selectedCategoryId;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [items, selectedCategoryId, searchQuery]);

  // Add Item to Cart
  const addItemToCart = (item: PosItem) => {
    playBeep();
    setCart((prev) => {
      const existingIdx = prev.findIndex((l) => l.item.id === item.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const currentQty = updated[existingIdx].quantity;
        const newQty = currentQty + 1;
        const lineTotal = newQty * updated[existingIdx].unitPrice - updated[existingIdx].discount;
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty,
          lineTotal: Math.max(0, lineTotal),
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            item,
            quantity: 1,
            unitPrice: item.salePrice,
            discount: 0,
            lineTotal: item.salePrice,
          },
        ];
      }
    });
  };

  // Barcode Scan Handler
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    const matched = items.find(
      (it) =>
        it.barcode.toLowerCase() === code.toLowerCase() ||
        it.sku.toLowerCase() === code.toLowerCase()
    );

    if (matched) {
      addItemToCart(matched);
      setBarcodeInput('');
    } else {
      showToast('الصنف غير موجود بالباركود المدخل', 'error');
    }
  };

  // Adjust quantity
  const updateQuantity = (idx: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const newQty = updated[idx].quantity + delta;
      if (newQty <= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      const lineTotal = newQty * updated[idx].unitPrice - updated[idx].discount;
      updated[idx] = {
        ...updated[idx],
        quantity: newQty,
        lineTotal: Math.max(0, lineTotal),
      };
      return updated;
    });
  };

  // Remove line
  const removeCartLine = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  // Totals
  const subtotal = useMemo(() => {
    return cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  }, [cart]);

  const totalDiscount = useMemo(() => {
    return cart.reduce((sum, line) => sum + (line.discount || 0), 0);
  }, [cart]);

  const netTotal = Math.max(0, subtotal - totalDiscount);

  // Change Return
  const tenderedNum = typeof cashTendered === 'number' ? cashTendered : 0;
  const changeDue = Math.max(0, tenderedNum - netTotal);

  // Quick cash preset button
  const setExactCash = () => {
    setCashTendered(netTotal);
  };

  // Clear Cart
  const handleClearCart = () => {
    if (cart.length === 0) return;
    if (confirm('هل أنت متأكد من مسح الفاتورة الحالية؟')) {
      setCart([]);
      setCashTendered('');
      barcodeInputRef.current?.focus();
    }
  };

  // Checkout and Post
  const handleCheckoutAndPost = async () => {
    if (cart.length === 0) {
      showToast('سلة المبيعات فارغة!', 'error');
      return;
    }
    if (!selectedWarehouseId) {
      showToast('يرجى اختيار المستودع!', 'error');
      return;
    }
    if (!selectedCustomerId) {
      showToast('يرجى اختيار العميل!', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const invoicePayload = {
        customerId: selectedCustomerId,
        invoiceDate: today,
        dueDate: today,
        warehouseId: selectedWarehouseId,
        paymentType: 'CASH',
        notes: 'فاتورة نقطة بيع سريعة (POS)',
        lines: cart.map((l) => ({
          itemId: l.item.id,
          description: l.item.name,
          warehouseId: selectedWarehouseId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
        })),
      };

      // 1. Create Invoice
      const createRes = await fetch('/api/sales/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoicePayload),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || 'فشل في حفظ فاتورة المبيعات');
      }

      const createdInvoice = await createRes.json();

      // 2. Post Invoice Immediately
      const postRes = await fetch(`/api/sales/invoices/${createdInvoice.id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!postRes.ok) {
        const err = await postRes.json();
        throw new Error(err.error || 'فشل في ترحيل الفاتورة');
      }

      const postedInvoice = await postRes.json();

      // Show completed invoice modal for printing
      setCompletedInvoice({
        ...createdInvoice,
        ...postedInvoice,
        lines: cart,
        subtotal,
        totalDiscount,
        netTotal,
        tendered: tenderedNum || netTotal,
        change: changeDue,
        cashier: 'كاشير نقطة البيع',
        date: new Date().toLocaleString('ar-YE'),
      });

      showToast('تم حفظ وترحيل فاتورة المبيعات بنجاح!', 'success');
      setCart([]);
      setCashTendered('');
    } catch (err: any) {
      console.error('POS Checkout failed:', err);
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-3 pb-3">
      {/* POS Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-2.5 shadow-k-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-control bg-brand text-white shadow-xs">
            <Zap size={20} />
          </div>
          <div>
            <h1 className="text-base font-black text-ink">نقطة البيع السريعة (POS)</h1>
            <p className="text-[11px] text-ink-muted">إصدار وترحيل الفواتير مع دعم الباركود والطباعة الفورية</p>
          </div>
        </div>

        {/* Barcode scanner quick input */}
        <form onSubmit={handleBarcodeSubmit} className="flex min-w-[280px] max-w-md flex-1 items-center gap-2">
          <div className="relative w-full">
            <input
              ref={barcodeInputRef}
              type="text"
              placeholder="امسح الباركود أو أدخل كود الصنف..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              className="h-9 w-full rounded-control border border-brand bg-brand-soft/20 pe-9 ps-3 text-xs font-semibold text-ink transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <div className="pointer-events-none absolute end-2.5 top-2.5 text-brand">
              <Barcode size={17} />
            </div>
          </div>
          <Button type="submit" variant="primary" size="sm" icon={<Plus size={14} />}>
            إضافة
          </Button>
        </form>

        <div className="flex items-center gap-2">
          {/* Warehouse Selector */}
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="h-8 rounded-control border border-line bg-surface px-2.5 text-xs text-ink focus:border-brand focus:outline-none"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                مستودع: {w.name}
              </option>
            ))}
          </select>

          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
          >
            تحديث
          </Button>
        </div>
      </div>

      {/* Main POS Interface (Grid + Cart) */}
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
        {/* Products Catalogue Column (7 cols) */}
        <div className="flex flex-col gap-2.5 overflow-hidden rounded-card border border-line bg-surface p-3 shadow-k-xs lg:col-span-7">
          {/* Category Pills & Search */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('ALL')}
                className={`rounded-pill px-3 py-1 text-xs font-bold transition-colors ${
                  selectedCategoryId === 'ALL'
                    ? 'bg-brand text-white shadow-xs'
                    : 'bg-surface-muted text-ink-muted hover:bg-surface-hover hover:text-ink'
                }`}
              >
                كافة الأصناف
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(c.id)}
                  className={`rounded-pill px-3 py-1 text-xs font-bold transition-colors ${
                    selectedCategoryId === c.id
                      ? 'bg-brand text-white shadow-xs'
                      : 'bg-surface-muted text-ink-muted hover:bg-surface-hover hover:text-ink'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <div className="relative w-44">
              <input
                type="text"
                placeholder="بحث بالاسم..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 w-full rounded-control border border-line bg-surface pe-7 ps-2 text-[11px] text-ink focus:border-brand focus:outline-none"
              />
              <Search size={13} className="pointer-events-none absolute end-2 top-2 text-ink-muted" />
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="grid flex-1 auto-rows-max content-start grid-cols-2 gap-2.5 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => addItemToCart(item)}
                className="group flex cursor-pointer flex-col justify-between rounded-card border border-line bg-surface p-2.5 transition-all hover:border-brand hover:shadow-k-sm active:scale-[0.98]"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 text-[10px] text-ink-muted">
                    <span className="font-mono">{item.sku}</span>
                    <span
                      className={`rounded px-1 font-bold ${
                        item.availableQty > 0
                          ? 'bg-state-success-soft text-state-success'
                          : 'bg-state-danger-soft text-state-danger'
                      }`}
                    >
                      {item.availableQty} {item.unitName}
                    </span>
                  </div>

                  <h3 className="mt-1.5 line-clamp-2 text-xs font-bold text-ink transition-colors group-hover:text-brand">
                    {item.name}
                  </h3>
                </div>

                <div className="mt-2.5 flex items-center justify-between border-t border-line-soft pt-1.5">
                  <span className="font-mono text-xs font-black text-brand">
                    {item.salePrice.toLocaleString()} ر.ي
                  </span>
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                    <Plus size={12} />
                  </div>
                </div>
              </div>
            ))}

            {filteredItems.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-ink-muted">
                <Package size={36} className="opacity-40" />
                <p className="mt-2 text-xs font-semibold">لا توجد أصناف مطابقة</p>
              </div>
            )}
          </div>
        </div>

        {/* Cart & Billing Column (5 cols) */}
        <div className="flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-k-xs lg:col-span-5">
          {/* Cart Header */}
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5 bg-surface-muted/30">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} className="text-brand" />
              <h2 className="text-xs font-bold text-ink">سلة الفاتورة ({cart.length} أصناف)</h2>
            </div>

            {/* Customer Selector */}
            <div className="flex items-center gap-1.5">
              <User size={13} className="text-ink-muted" />
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="h-7 rounded border border-line bg-surface px-2 text-[11px] text-ink focus:border-brand focus:outline-none"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="rounded p-1 text-state-danger hover:bg-state-danger-soft"
                  title="مسح السلة"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto divide-y divide-line-soft p-2">
            {cart.map((line, idx) => (
              <div key={line.item.id} className="flex items-center justify-between gap-2 py-2 px-1 hover:bg-surface-hover/40 rounded">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-xs font-bold text-ink">{line.item.name}</h4>
                  <div className="flex items-center gap-2 text-[10px] text-ink-muted">
                    <span className="font-mono">{line.unitPrice.toLocaleString()} ر.ي</span>
                    <span>×</span>
                    <span className="font-bold text-ink">{line.quantity}</span>
                  </div>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateQuantity(idx, -1)}
                    className="flex h-6 w-6 items-center justify-center rounded border border-line bg-surface text-ink hover:bg-surface-muted active:scale-95"
                  >
                    <Minus size={11} />
                  </button>
                  <span className="w-7 text-center font-mono text-xs font-bold text-ink">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(idx, 1)}
                    className="flex h-6 w-6 items-center justify-center rounded border border-line bg-surface text-ink hover:bg-surface-muted active:scale-95"
                  >
                    <Plus size={11} />
                  </button>
                </div>

                {/* Line Total */}
                <div className="w-20 text-end">
                  <span className="font-mono text-xs font-bold text-brand">
                    {line.lineTotal.toLocaleString()}
                  </span>
                </div>

                {/* Delete line */}
                <button
                  type="button"
                  onClick={() => removeCartLine(idx)}
                  className="text-ink-muted hover:text-state-danger"
                >
                  <X size={13} />
                </button>
              </div>
            ))}

            {cart.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center py-16 text-ink-muted">
                <ShoppingCart size={36} className="opacity-30" />
                <p className="mt-2 text-xs font-semibold">السلة فارغة</p>
                <p className="text-[10px]">امسح الباركود أو انقر على صنف لإضافته</p>
              </div>
            )}
          </div>

          {/* Payment & Cashier Checkout Footer */}
          <div className="border-t border-line bg-surface-muted/50 p-3 space-y-2.5">
            {/* Totals */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-ink-muted">
                <span>المجموع الفرعي:</span>
                <span className="font-mono font-semibold">{subtotal.toLocaleString()} ر.ي</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-state-danger">
                  <span>الخصم:</span>
                  <span className="font-mono font-semibold">-{totalDiscount.toLocaleString()} ر.ي</span>
                </div>
              )}
              <div className="flex justify-between border-t border-line-soft pt-1.5 text-sm font-black text-ink">
                <span>الإجمالي الصافي:</span>
                <span className="font-mono text-base text-brand">{netTotal.toLocaleString()} ر.ي</span>
              </div>
            </div>

            {/* Quick Cash Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={setExactCash}
                disabled={cart.length === 0}
                className="rounded border border-brand bg-brand-soft px-2 py-1 text-[11px] font-bold text-brand hover:bg-brand hover:text-white transition-colors"
              >
                المبلغ تماماً
              </button>
              {[1000, 5000, 10000, 20000, 50000, 100000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setCashTendered(amt)}
                  disabled={cart.length === 0}
                  className="rounded border border-line bg-surface px-1.5 py-1 text-[10px] font-semibold text-ink hover:bg-surface-hover"
                >
                  {amt.toLocaleString()}
                </button>
              ))}
            </div>

            {/* Cash Input & Change Return */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-ink-muted">المدفوع نقداً</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(parseFloat(e.target.value) || '')}
                  className="h-8 w-full rounded border border-line bg-surface px-2 font-mono text-xs font-bold text-ink focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-ink-muted">المتبقي للعميل</label>
                <div
                  className={`flex h-8 items-center rounded border px-2 font-mono text-xs font-bold ${
                    changeDue > 0
                      ? 'border-state-success/40 bg-state-success-soft text-state-success'
                      : 'border-line bg-surface text-ink-muted'
                  }`}
                >
                  {changeDue.toLocaleString()} ر.ي
                </div>
              </div>
            </div>

            {/* Complete Invoice Action Button */}
            <Button
              variant="success"
              size="lg"
              className="w-full text-sm font-bold shadow-xs py-3"
              disabled={cart.length === 0 || submitting}
              onClick={handleCheckoutAndPost}
              icon={<Printer size={18} />}
            >
              {submitting ? 'جارٍ الترحيل...' : `اعتماد وطباعة الفاتورة (${netTotal.toLocaleString()} ر.ي)`}
            </Button>
          </div>
        </div>
      </div>

      {/* 80mm Thermal Receipt Dialog */}
      {completedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-card bg-surface shadow-k-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-bold text-ink">إيصال المبيعات (80mm)</h3>
              <button
                type="button"
                onClick={() => setCompletedInvoice(null)}
                className="text-ink-muted hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>

            {/* Printable Receipt Area */}
            <div id="pos-receipt-print" className="flex-1 overflow-y-auto p-4 text-xs font-mono text-black bg-white">
              <div className="text-center space-y-1 border-b border-dashed border-gray-400 pb-3">
                <h2 className="text-sm font-bold">{company?.nameAr || 'مؤسسة كايان التجارية'}</h2>
                <p className="text-[10px]">{company?.taxNumber ? `الرقم الضريبي: ${company.taxNumber}` : ''}</p>
                <p className="text-[10px]">فاتورة ضريبية مبسطة - نقدي</p>
                <p className="text-[10px]">{completedInvoice.date}</p>
                <p className="text-[10px] font-bold">رقم الفاتورة: {completedInvoice.invoice_number || completedInvoice.invoiceNumber}</p>
              </div>

              <div className="py-2.5 border-b border-dashed border-gray-400 space-y-1">
                <div className="flex justify-between font-bold text-[10px]">
                  <span>الصنف</span>
                  <span>الكمية × السعر</span>
                  <span>المجموع</span>
                </div>
                {completedInvoice.lines?.map((line: PosLine, i: number) => (
                  <div key={i} className="flex justify-between text-[10px] pt-1">
                    <span className="truncate max-w-[120px]">{line.item.name}</span>
                    <span>{line.quantity} × {line.unitPrice.toLocaleString()}</span>
                    <span className="font-bold">{line.lineTotal.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="py-2 border-b border-dashed border-gray-400 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>المجموع:</span>
                  <span>{completedInvoice.subtotal?.toLocaleString()} ر.ي</span>
                </div>
                {completedInvoice.totalDiscount > 0 && (
                  <div className="flex justify-between">
                    <span>الخصم:</span>
                    <span>-{completedInvoice.totalDiscount?.toLocaleString()} ر.ي</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-xs pt-1 border-t border-gray-300">
                  <span>الصافي النهائي:</span>
                  <span>{completedInvoice.netTotal?.toLocaleString()} ر.ي</span>
                </div>
                <div className="flex justify-between text-[10px] pt-1">
                  <span>المدفوع:</span>
                  <span>{completedInvoice.tendered?.toLocaleString()} ر.ي</span>
                </div>
                <div className="flex justify-between text-[10px] font-bold">
                  <span>المتبقي:</span>
                  <span>{completedInvoice.change?.toLocaleString()} ر.ي</span>
                </div>
              </div>

              <div className="pt-3 text-center text-[10px] text-gray-600 space-y-1">
                <p>شكراً لزيارتكم!</p>
                <p className="text-[9px]">نظام كايان المحاسبي ERP 2026</p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-2 border-t border-line p-3">
              <Button
                variant="primary"
                size="md"
                className="flex-1 font-bold"
                icon={<Printer size={16} />}
                onClick={() => {
                  window.print();
                }}
              >
                طباعة الإيصال
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setCompletedInvoice(null);
                  barcodeInputRef.current?.focus();
                }}
              >
                إغلاق (فاتورة جديدة)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
