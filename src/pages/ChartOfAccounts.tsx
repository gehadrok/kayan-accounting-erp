import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  CheckCircle2,
  X,
  Layers,
  Download,
  Upload,
} from 'lucide-react';

interface Account {
  id: string;
  code: string;
  name: string;
  accountTypeId: string;
  accountTypeName?: string;
  level: number;
  isGroup: boolean;
  normalBalance: 'DEBIT' | 'CREDIT';
  isActive: boolean;
  parent_id?: string | null;
  parentId?: string | null;
  balance?: number;
  currencyCodes?: string | null;
}

interface TreeNode extends Account {
  children: TreeNode[];
}

// ------------------------------------------------------------------
// صيغة القالب المعتمد للاستيراد/التصدير — ورقة «دليل الحسابات»
// بالأعمدة الثمانية بالترتيب تماماً كما في «قالب_دليل_الحسابات.xlsx»:
//   رقم الحساب | العملة | اسم الحساب | المستوى | النوع | الحساب الرئيسي | التضمين | نوع التقرير
// ------------------------------------------------------------------
const TEMPLATE_SHEET_NAME = 'دليل الحسابات';

const TEMPLATE_HEADERS = ['رقم الحساب', 'العملة', 'اسم الحساب', 'المستوى', 'النوع', 'الحساب الرئيسي', 'التضمين', 'نوع التقرير'];

/** صفوف القالب الافتراضي المطابقة تماماً لملف «قالب_دليل_الحسابات.xlsx». */
const TEMPLATE_SAMPLE_ROWS = [
  ['1', 'R.Y,', 'الأصول', '1', 'رئيسي', '0', '=', 'الميزانية العمومية'],
  ['1111', 'R.Y,', 'النقدية', '4', 'رئيسي', '111', '=', 'الميزانية العمومية'],
  ['111101', '$,R.S,R.Y,', 'النقدية في الصناديق', '5', 'رئيسي', '1111', '=', 'الميزانية العمومية'],
  ['1111010002', '$,R.S,R.Y,', 'النقدية لدى الصرافة', '6', 'فرعي', '111101', '=', 'الميزانية العمومية'],
  ['3', 'R.Y,', 'المصاريف', '1', 'رئيسي', '0', '', 'الأرباح والخسائر'],
  ['41', 'R.Y,', 'المبيعات', '2', 'رئيسي', '4', '', 'الأرباح والخسائر'],
];

/** صف بعد قراءته من القالب قبل إرساله للمخدم. */
interface TemplateRow {
  code: string;
  currencyTokens: string[];
  name: string;
  level?: number;
  isGroup?: boolean;
  parentCode: string;
  include: string;
  reportType: string;
}

/** تنظيف خلية من مسافات وعلامات الاتجاه الخفية. */
const cleanCell = (v: unknown): string =>
  String(v ?? '').replace(/\u200f|\u200e/g, '').trim();

/** يقسّم عمود العملة "…$,R.S,R.Y," إلى قائمة رموز نظيفة. */
const splitCurrencyTokens = (raw: string): string[] =>
  raw.split(',').map((t) => t.trim()).filter(Boolean);

/** يبني ورقة القالب بالأعمدة الثمانية (للتصدير وتنزيل القالب على السواء). */
async function buildTemplateWorkbook(values: unknown[][]) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...values]);
  ws['!cols'] = [
    { wch: 14 }, { wch: 14 }, { wch: 34 }, { wch: 8 },
    { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 22 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, TEMPLATE_SHEET_NAME);
  return { wb, XLSX };
}

/** يقرأ ملف إكسل بصيغة القالب بدقة — أي انحراف عن الأعمدة الثمانية يرفض الملف فوراً. */
async function readTemplateFile(file: File): Promise<TemplateRow[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetName =
    wb.SheetNames.find((n) => String(n).trim() === TEMPLATE_SHEET_NAME) || wb.SheetNames[0];
  if (!sheetName) throw new Error('الملف لا يحتوي على أي ورقة عمل.');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false, // القيم كلها نصوص كما في القالب (الأكواد الرقمية تصبح نصاً كاملاً)
  });
  if (matrix.length === 0) throw new Error('ورقة العمل فارغة.');

  // صف العناوين (السطر الأول) يجب أن يطابق أعمدة القالب الثمانية بالترتيب
  const header = ((matrix[0] || []) as unknown[]).map(cleanCell);
  const nonEmpty = header.filter(Boolean);
  if (nonEmpty.length === 0) {
    throw new Error('الملف لا يحتوي صف عناوين — استخدم ملفاً بنفس صيغة «قالب_دليل_الحسابات.xlsx».');
  }
  const headerMatches = nonEmpty.length === TEMPLATE_HEADERS.length && TEMPLATE_HEADERS.every((h, i) => header[i] === h);
  if (!headerMatches) {
    throw new Error(
      'أعمدة الملف لا تطابق صيغة القالب المطلوبة بالترتيب:\n' +
        TEMPLATE_HEADERS.join(' | ') +
        '\nالموجود في الملف: ' +
        nonEmpty.join(' | ')
    );
  }

  const rows: TemplateRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = ((matrix[r] || []) as unknown[]).map(cleanCell);
    if (cells.every((c) => c === '')) continue; // تجاوز الصفوف الفارغة
    const isGroupRaw = cells[4];
    rows.push({
      code: cells[0],
      currencyTokens: splitCurrencyTokens(cells[1]),
      name: cells[2],
      level: /^\d+$/.test(cells[3]) ? Number(cells[3]) : undefined,
      isGroup: isGroupRaw.includes('رئيسي') ? true : isGroupRaw.includes('فرعي') ? false : undefined,
      parentCode: cells[5],
      include: cells[6],
      reportType: cells[7],
    });
  }
  if (rows.length === 0) throw new Error('لا توجد صفوف بيانات أسفل صف العناوين.');
  return rows;
}

// ------------------------------------------------------------------
// العملات المعتمدة للحساب (مطابقة لقائمة النظام المرجعي في الصورة)
// ------------------------------------------------------------------
const CURRENCY_CHOICES = [
  { iso: 'USD', nameAr: 'دولار أمريكي', token: '$' },
  { iso: 'SAR', nameAr: 'ريال سعودي', token: 'R.S' },
  { iso: 'YER', nameAr: 'ريال يمني', token: 'R.Y' },
  { iso: 'GBP', nameAr: 'جنيه استرليني', token: 'G.S' },
  { iso: 'AED', nameAr: 'درهم إماراتي', token: 'AED' },
];

const CURRENCY_NAME_BY_ISO = new Map(CURRENCY_CHOICES.map((c) => [c.iso, c.nameAr]));

/** الطبيعة الافتراضية لكل تصنيف محاسبي (تُستخدم للحسابات الجذرية بلا أب). */
const TYPE_DEFAULT_NATURE: Record<string, 'DEBIT' | 'CREDIT'> = {
  ASSET: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
  EXPENSE: 'DEBIT',
};

/** تسمية عربية للتصنيفات المحاسبية. */
const TYPE_AR_LABEL: Record<string, string> = {
  ASSET: 'أصول',
  LIABILITY: 'خصوم',
  EQUITY: 'حقوق ملكية',
  REVENUE: 'إيرادات',
  EXPENSE: 'مصروفات',
};

/** يبني شجرة حقيقية من قائمة الحسابات المسطحة باستخدام علاقة parent_id في قاعدة البيانات. */
function buildTree(flat: Account[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const acc of flat) {
    byId.set(acc.id, { ...acc, children: [] });
  }

  for (const node of byId.values()) {
    const parentId = node.parentId || node.parent_id || null;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // ترتيب كل مستوى حسب الكود رقمياً
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      const aNum = parseInt(a.code, 10);
      const bNum = parseInt(b.code, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.code.localeCompare(b.code, 'ar');
    });
    for (const n of nodes) {
      if (n.children.length > 0) sortNodes(n.children);
    }
  };
  sortNodes(roots);

  return roots;
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

function findPath(nodes: TreeNode[], id: string, path: string[] = []): string[] | null {
  for (const n of nodes) {
    const newPath = [...path, n.code];
    if (n.id === id) return newPath;
    if (n.children.length > 0) {
      const found = findPath(n.children, id, newPath);
      if (found) return found;
    }
  }
  return null;
}

export const ChartOfAccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // حالة الشجرة
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // نموذج إضافة حساب فرعي — يرتبط بالأب حسب التسلسل الرقمي (مثل الصورة المرجعية)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addParentId, setAddParentId] = useState('');
  const [addCode, setAddCode] = useState('');
  // هل كتب المستخدم الرقم يدوياً؟ (غير مدوخ من اقتراح التسلسل)
  const [codeTouched, setCodeTouched] = useState(false);
  const [addName, setAddName] = useState('');
  const [addTypeId, setAddTypeId] = useState('ASSET');
  const [typeTouched, setTypeTouched] = useState(false);
  const [addIsGroup, setAddIsGroup] = useState(false);
  const [addNature, setAddNature] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  // هل غيّر المستخدم طبيعة الرصيد يدوياً؟ (لعرض تحذير التغيير عن الافتراضي)
  const [natureTouched, setNatureTouched] = useState(false);
  const [addCurrencies, setAddCurrencies] = useState<string[]>([]);

  // ----------------------------------------------------------------
  // جلب الحسابات
  // ----------------------------------------------------------------
  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/accounts', {
        headers: {
          'x-kayan-company-id': localStorage.getItem('kayan_company_scope') || '',
          'x-kayan-branch-id': localStorage.getItem('kayan_branch_scope') || '',
        },
      });
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (err) {
      console.error('Error fetching chart of accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  // ----------------------------------------------------------------
  // بناء الشجرة
  // ----------------------------------------------------------------
  const tree = useMemo(() => buildTree(accounts), [accounts]);

  // ----------------------------------------------------------------
  // ربط الحساب الجديد بأبيه حسب التسلسل الرقمي (مثل النظام المرجعي)
  // ----------------------------------------------------------------
  /** الرقم التالي لكود أب معطى: كود الأب + تسلسل أبنائه بنفس عدد خاناتهم. */
  const nextCodeSuggestionFor = useCallback(
    (parentId: string | null): string => {
      if (!parentId) return '';
      const parent = accounts.find((a) => a.id === parentId);
      if (!parent) return '';
      const prefix = parent.code;
      const children = accounts.filter((a) => (a.parentId || a.parent_id) === parentId);
      if (children.length === 0) return prefix + '0001'; // أول ابن: 4 خانات مثل النظام المرجعي
      const longest = Math.max(...children.map((c) => c.code.length));
      const seqLen = Math.max(1, longest - prefix.length);
      const maxSeq = Math.max(
        0,
        ...children.filter((c) => c.code.length === longest).map((c) => Number(c.code.slice(prefix.length)))
      );
      return prefix + String(maxSeq + 1).padStart(seqLen, '0');
    },
    [accounts]
  );

  const effectiveParent = useMemo(() => {
    if (addParentId) return accounts.find((a) => a.id === addParentId) || null;
    // لا أب مختار → اشتقّه من أطول بادئة صحيحة للرقم المكتوب
    const clean = addCode.trim();
    if (!/^\d+$/.test(clean) || clean.length < 2) return null;
    let ancestor = clean.slice(0, -1);
    while (ancestor.length >= 1) {
      const hit = accounts.find((a) => a.code === ancestor);
      if (hit) return hit;
      ancestor = ancestor.slice(0, -1);
    }
    return null;
  }, [addParentId, addCode, accounts]);

  /** الرقم المقترح التالي (يُعرض كـ placeholder ولا يلغي ما كتبه المستخدم يدوياً). */
  const suggestedCode = useMemo(
    () => nextCodeSuggestionFor(effectiveParent ? effectiveParent.id : null),
    [effectiveParent, nextCodeSuggestionFor]
  );

  /** الطبيعة الافتراضية الموروثة: من الأب، وللجذري من تصنيف الحساب. */
  const inheritedNature: 'DEBIT' | 'CREDIT' = effectiveParent
    ? effectiveParent.normalBalance
    : TYPE_DEFAULT_NATURE[addTypeId] || 'DEBIT';

  /** التصنيف الموروث من الأب (للجذري يبقى اختيار المستخدم). */
  const inheritedTypeId = effectiveParent ? effectiveParent.accountTypeId : addTypeId;

  // مزامنة تلقائية: طبيعة الرصيد والتصنيف يُورثان فقط ما لم متّس المستخدم بتعديلهما يدوياً
  useEffect(() => {
    if (!natureTouched) setAddNature(inheritedNature);
  }, [inheritedNature, natureTouched]);
  useEffect(() => {
    if (!typeTouched && effectiveParent) setAddTypeId(effectiveParent.accountTypeId);
  }, [effectiveParent, typeTouched]);

  /** انحراف الطبيعة عن الافتراضي الموروث → تحذير المستخدم. */
  const natureDeviation = natureTouched && addNature !== inheritedNature;
  const typeDeviation = typeTouched && effectiveParent && addTypeId !== effectiveParent.accountTypeId;

  /** سلسلة الأب صعوداً حتى الجذر — هذه هي الحسابات التي تتأثر مجاميعها الإجمالية بالحساب الجديد. */
  const affectedPath = useMemo(() => {
    const path: Account[] = [];
    let cur: Account | null = effectiveParent;
    while (cur) {
      path.unshift(cur);
      const pid: string | null = cur.parentId || cur.parent_id || null;
      cur = pid ? accounts.find((a) => a.id === pid) || null : null;
    }
    return path;
  }, [effectiveParent, accounts]);

  // ----------------------------------------------------------------
  // التحكم في التوسيع والطي
  // ----------------------------------------------------------------
  const toggleNode = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const all = new Set<string>();
    const collect = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) {
          all.add(n.id);
          collect(n.children);
        }
      }
    };
    collect(tree);
    setExpandedIds(all);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const isExpanded = (id: string) => expandedIds.has(id);

  // ----------------------------------------------------------------
  // البحث — مع إظهار المسار الهرمي وتوسيع الفروع المطوية
  // ----------------------------------------------------------------
  const searchMatches = useMemo(() => {
    if (!search.trim()) return null;

    const q = search.trim().toLowerCase();
    const matches: { node: TreeNode; path: string[] }[] = [];

    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        const matchesCode = n.code.includes(q);
        const matchesName = n.name.toLowerCase().includes(q);
        if (matchesCode || matchesName) {
          const path = findPath(tree, n.id);
          if (path) matches.push({ node: n, path });
        }
        if (n.children.length > 0) walk(n.children);
      }
    };
    walk(tree);

    return matches.length > 0 ? matches : null;
  }, [search, tree]);

  useEffect(() => {
    if (!searchMatches || searchMatches.length === 0) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const expandIdsOnPath = (nodes: TreeNode[], targetId: string) => {
        for (const n of nodes) {
          if (n.id === targetId) return true;
          if (n.children.length > 0) {
            if (expandIdsOnPath(n.children, targetId)) {
              next.add(n.id);
              return true;
            }
          }
        }
        return false;
      };
      for (const m of searchMatches) {
        expandIdsOnPath(tree, m.node.id);
      }
      return next;
    });
  }, [searchMatches, tree]);

  // ----------------------------------------------------------------
  // إنشاء حساب فرعي جديد (يرتبط بالأب حسب التسلسل الرقمي)
  // ----------------------------------------------------------------
  /** يصفّر حالة النموذج إلى القيم الافتراضية (دون إغلاقه). */
  const resetAddModal = () => {
    setError(null);
    setAddParentId('');
    setAddCode('');
    setCodeTouched(false);
    setAddName('');
    setAddTypeId('ASSET');
    setTypeTouched(false);
    setAddIsGroup(false);
    setAddNature(TYPE_DEFAULT_NATURE.ASSET);
    setNatureTouched(false);
    setAddCurrencies([]);
  };

  /** يفتح النموذج فارغاً كل مرة. */
  const openAddModal = () => {
    resetAddModal();
    setIsModalOpen(true);
  };

  /** اختيار الأب يدوياً: يعيد اقتراح الرقم التالي حسب تسلسل أبنائه. */
  const handleParentChange = (id: string) => {
    setAddParentId(id);
    setCodeTouched(false);
    if (id) setAddCode(nextCodeSuggestionFor(id) || '');
    else setAddCode('');
  };

  /** كتابة الرقم يدوياً: يُربط تلقائياً بأطول بادئة صحيحة (نفس تسلسل الدليل). */
  const handleCodeChange = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '');
    setAddCode(digits);
    setCodeTouched(true);
    if (addParentId) return; // الأب مختار يدوياً هو المرجع
    if (/^\d\d+$/.test(digits)) {
      let ancestor = digits.slice(0, -1);
      while (ancestor.length >= 1) {
        const hit = accounts.find((a) => a.code === ancestor);
        if (hit) {
          setAddParentId(hit.id);
          break;
        }
        ancestor = ancestor.slice(0, -1);
      }
    }
  };

  /** تغيير طبيعة الرصيد يدوياً — يفعّل تحذير الانحراف عن الافتراضي. */
  const handleNatureChange = (val: 'DEBIT' | 'CREDIT') => {
    setNatureTouched(true);
    setAddNature(val);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!addCode || !addName) {
      setError('رقم الحساب واسمه مطلوبان.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: addCode,
          name: addName,
          accountTypeId: addTypeId,
          parentId: effectiveParent ? effectiveParent.id : undefined,
          isGroup: addIsGroup,
          normalBalance: addNature,
          currencyCodes: addCurrencies.length ? addCurrencies.join(',') : undefined,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل في إنشاء الحساب');
      }
      const created = await res.json();
      setIsModalOpen(false);
      resetAddModal();
      await fetchAccounts();
      // افتح فرع الأب وحدّد الحساب الجديد في الشجرة
      if (created?.id) {
        const ancestorIds = affectedPath.map((p) => p.id);
        setExpandedIds((prev) => {
          const next = new Set(prev);
          for (const id of ancestorIds) next.add(id);
          return next;
        });
        setSelectedId(created.id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ----------------------------------------------------------------
  // استيراد / تصدير من ملف إكسل — بصيغة القالب المعتمد تماماً
  // ----------------------------------------------------------------
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<TemplateRow[] | null>(null);
  const [importParseError, setImportParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const [exporting, setExporting] = useState(false);

  /** عند اختيار الملف: قراءة فورية بالصيغة الصارمة لعرض عدد الصفوف أو خطأ الصيغة قبل الاستيراد. */
  const handleImportFileChange = async (file: File | null) => {
    setImportFile(file);
    setImportRows(null);
    setImportParseError(null);
    if (!file) return;
    try {
      const rows = await readTemplateFile(file);
      setImportRows(rows);
    } catch (err: any) {
      setImportParseError(err.message || String(err));
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile || !importRows || importRows.length === 0) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/accounts/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kayan-company-id': localStorage.getItem('kayan_company_scope') || '',
          'x-kayan-branch-id': localStorage.getItem('kayan_branch_scope') || '',
        },
        body: JSON.stringify({
          rows: importRows.map((r) => ({
            code: r.code,
            name: r.name,
            level: r.level,
            isGroup: r.isGroup,
            parentCode: r.parentCode && r.parentCode !== '0' ? r.parentCode : '',
            currencyTokens: r.currencyTokens,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportResult({ success: false, message: data.error || 'فشل في الاستيراد', details: data.details });
      } else {
        setImportResult({
          success: true,
          message: `تم الاستيراد بنجاح: ${data.inserted ?? 0} حساب جديد، ${data.updated ?? 0} حساب محدَّث.`,
          details: null,
        });
        await fetchAccounts();
      }
    } catch (err: any) {
      setImportResult({ success: false, message: err.message || 'فشل في الاستيراد' });
    } finally {
      setImporting(false);
    }
  };

  /** تصدير الدليل الحالي بنفس صيغة القالب تماماً (الأعمدة الثمانية، ورقة «دليل الحسابات»). */
  const handleExportExcel = async () => {
    if (accounts.length === 0) return;
    setExporting(true);
    try {
      const byId = new Map(accounts.map((a) => [a.id, a]));
      const isPLType = (t: string) => t === 'REVENUE' || t === 'EXPENSE';
      const values = accounts.map((a) => {
        const pid = a.parentId || a.parent_id || null;
        const parent = pid ? byId.get(pid) : null;
        return [
          a.code,
          a.currencyCodes || '',
          a.name,
          String(a.level || 1),
          a.isGroup ? 'رئيسي' : 'فرعي',
          parent ? parent.code : '0',
          isPLType(a.accountTypeId) ? '' : '=',
          isPLType(a.accountTypeId) ? 'الأرباح والخسائر' : 'الميزانية العمومية',
        ];
      });
      const built = await buildTemplateWorkbook(values);
      built.XLSX.writeFile(built.wb, `دليل_الحسابات_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err: any) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  /** تنزيل القالب الافتراضي المطابق تماماً لملف «قالب_دليل_الحسابات.xlsx». */
  const handleDownloadTemplate = async () => {
    try {
      const built = await buildTemplateWorkbook(TEMPLATE_SAMPLE_ROWS);
      built.XLSX.writeFile(built.wb, 'قالب_دليل_الحسابات.xlsx');
    } catch (err: any) {
      console.error('Template download failed:', err);
    }
  };

  // ----------------------------------------------------------------
  // تحديد الحساب المراد عرض تفاصيله
  // ----------------------------------------------------------------
  const selectAccount = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedId(id);
  };

  const selectedNode = useMemo(() => {
    if (!selectedId) return null;
    return findNode(tree, selectedId);
  }, [tree, selectedId]);

  const tableAccounts = useMemo(() => {
    if (!selectedNode) return tree;
    return selectedNode.children;
  }, [selectedNode, tree]);

  const filteredTableAccounts = useMemo(() => {
    return tableAccounts.filter((acc) => {
      return selectedType === 'ALL' || acc.accountTypeId === selectedType;
    });
  }, [tableAccounts, selectedType]);

  // ----------------------------------------------------------------
  // Darstellung الشجرة (مثل الصورة المرجعية - شريط تنقل على اليسار)
  // ----------------------------------------------------------------
  const renderTreeNode = useCallback(
    (node: TreeNode, level: number): React.ReactNode => {
      const hasChildren = node.children.length > 0;
      const expanded = isExpanded(node.id);
      const isSelected = selectedId === node.id;
      const indent = level * 20; // إزاحة متدرجة لكل مستوى

      return (
        <div
          key={node.id}
          className="flex items-center gap-1 mb-1.5 select-none"
          style={{ paddingRight: indent }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                toggleNode(node.id);
                e.stopPropagation();
              }}
              aria-expanded={expanded}
              className="flex shrink-0 items-center justify-center w-5 h-5 text-[10px] font-bold rounded-md transition border border-slate-300/60 bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 active:scale-95"
            >
              {expanded ? (
                <ChevronDown size={10} strokeWidth={2} />
              ) : (
                <ChevronRight size={10} strokeWidth={2} />
              )}
            </button>
          ) : (
            <div className="w-5 h-5 flex shrink-0 items-center justify-center text-transparent" />
          )}

          {node.isGroup ? (
            <Folder size={12} className="text-amber-500 fill-amber-500/20 shrink-0" aria-hidden="true" />
          ) : (
            <FileText size={12} className="text-blue-500 shrink-0" aria-hidden="true" />
          )}

          <button
            type="button"
            onClick={(e) => selectAccount(node.id, e)}
            className={`flex items-center gap-1 text-sm font-medium truncate w-full transition ${
              isSelected
                ? 'bg-blue-50 text-blue-700 border border-blue-100 rounded-md px-2 py-0.5 shadow-sm'
                : 'text-slate-800 hover:bg-slate-100/60 rounded-md px-2 py-0.5 hover:text-slate-900'
            }`}
          >
            <span dir="rtl" className={node.isGroup ? 'font-bold' : 'font-normal'}>
              {node.code} — {node.name}
            </span>
          </button>
        </div>
      );
    },
    [tree, selectedId, expandedIds, toggleNode, selectAccount, isExpanded]
  );

  const renderTree = useCallback(
    (nodes: TreeNode[], level: number): React.ReactNode[] => {
      return nodes.map((node) => (
        <React.Fragment key={node.id}>
          {renderTreeNode(node, level)}
          {isExpanded(node.id) && node.children.length > 0 && (
            <div className="pl-2">{renderTree(node.children, level + 1)}</div>
          )}
        </React.Fragment>
      ));
    },
    [renderTreeNode, isExpanded]
  );

  // ----------------------------------------------------------------
  // نموذج إضافة حساب فرعي — مثل الصورة المرجعية:
  // الأب يُشتق من التسلسل، الرقم التالي يُقترح تلقائياً، الطبيعة تُورث
  // افتراضياً وتظهر رسالة تحذير عند تغييرها عن الافتراضي.
  // ----------------------------------------------------------------
  const renderAddModal = () => {
    if (!isModalOpen) return null;
    const levelPreview = effectiveParent ? (effectiveParent.level || 1) + 1 : 1;
    const natureIsDebit = addNature === 'DEBIT';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl w-full max-w-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* رأس النافذة */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen size={18} className="text-blue-600" />
              <div>
                <h3 className="font-bold text-slate-800 text-sm">إضافة حساب جديد في الشجرة المحاسبية</h3>
                <p className="text-[10px] text-slate-500">يرتبط تلقائياً بالأب حسب تسلسل الرقم — الطبيعة والتصنيف يُورثان افتراضياً</p>
              </div>
            </div>
            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition">
              <X size={18} />
            </button>
          </div>

          {/* حقلان علويان مثل الصورة: رقم الحساب | الحساب الأب */}
          <div className="overflow-y-auto p-5 space-y-4 flex-1">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">{error}</div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم الحساب *</label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  placeholder={suggestedCode || 'مثال: 1111010013'}
                  value={addCode}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono font-bold"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  {codeTouched
                    ? 'رقم مكتوب يدوياً — سيُربط بأطول بادئة صحيحة في الدليل.'
                    : suggestedCode
                      ? `مُقترح تلقائياً: كود الأب (${effectiveParent?.code}) + التسلسل التالي.`
                      : 'اختر الحساب الأب ليُقترح الرقم التالي تلقائياً.'}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الحساب الأب</label>
                <select value={addParentId} onChange={(e) => handleParentChange(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                  <option value="">-- حساب جذري بدون أب --</option>
                  {accounts.filter((a) => a.isGroup).sort((a, b) => parseInt(a.code) - parseInt(b.code)).map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
                {effectiveParent && (
                  <div className="text-[10px] text-emerald-700 mt-1 font-medium">
                    ✓ مشتق تلقائياً من الرقم: {effectiveParent.code} — {effectiveParent.name}
                  </div>
                )}
              </div>
            </div>

            {/* اسم الحساب */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم الحساب بالعربية *</label>
              <input
                type="text"
                required
                placeholder="مثال: النقدية لدى الصرافة"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* صف خصائص الحساب */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المستوى</label>
                <input
                  type="text"
                  readOnly
                  value={`مستوى ${levelPreview}${effectiveParent ? ` (أبناء ${effectiveParent.code})` : ' (جذري)'}`}
                  className="w-full text-xs p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">طبيعة الحساب الهيكلي</label>
                <select value={addIsGroup ? 'GROUP' : 'DETAIL'} onChange={(e) => setAddIsGroup(e.target.value === 'GROUP')}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                  <option value="DETAIL">حساب فرعي (تفصيلي)</option>
                  <option value="GROUP">حساب رئيسي (تجميعي)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تصنيف الحساب *</label>
                <select value={addTypeId} onChange={(e) => { setTypeTouched(true); setAddTypeId(e.target.value); }}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                  <option value="ASSET">أصول (Asset)</option>
                  <option value="LIABILITY">خصوم (Liability)</option>
                  <option value="EQUITY">حقوق ملكية (Equity)</option>
                  <option value="REVENUE">إيرادات (Revenue)</option>
                  <option value="EXPENSE">مصروفات (Expense)</option>
                </select>
                {effectiveParent && !typeTouched && (
                  <div className="text-[10px] text-slate-500 mt-1">موروث من الأب: {effectiveParent.name} = {TYPE_AR_LABEL[effectiveParent.accountTypeId] || effectiveParent.accountTypeId}</div>
                )}
                {effectiveParent && (
                  <div className={`text-[10px] mt-0.5 font-medium ${typeDeviation ? 'text-amber-600' : 'text-slate-400'}`}>
                    الافتراضي الموروث: {TYPE_AR_LABEL[effectiveParent.accountTypeId] || effectiveParent.accountTypeId}
                    {typeDeviation && ' — مُغيّر يدوياً!'}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  طبيعة الرصيد (مدين / دائن) *
                </label>
                <select value={addNature} onChange={(e) => handleNatureChange(e.target.value as 'DEBIT' | 'CREDIT')}
                  className={`w-full text-xs p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 border ${
                    natureDeviation ? 'bg-amber-50 border-amber-300 font-bold text-amber-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                  <option value="DEBIT">مدين طبيعياً (مدين)</option>
                  <option value="CREDIT">دائن طبيعياً (دائن)</option>
                </select>
                {!natureDeviation ? (
                  <div className="text-[10px] text-slate-500 mt-1">
                    افتراضي موروث {effectiveParent ? `من «${effectiveParent.name}»` : 'من تصنيف الحساب'}: {inheritedNature === 'DEBIT' ? 'مدين' : 'دائن'}
                  </div>
                ) : (
                  <div className="text-[10px] text-amber-600 mt-1 font-medium">
                    الافتراضي الموروث: {inheritedNature === 'DEBIT' ? 'مدين' : 'دائن'}
                  </div>
                )}
              </div>
            </div>

            {/* تحذير تغيير الطبيعة عن الافتراضي */}
            {natureDeviation && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl border-l-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs text-amber-800">
                    <div className="font-bold mb-1">⚠️ تنبيه: غيّرت طبيعة الرصيد عن الافتراضي</div>
                    <div className="leading-relaxed">
                      الافتراضي الموروث «{inheritedNature === 'DEBIT' ? 'مدين' : 'دائن'}» قلبته إلى «{natureIsDebit ? 'مدين' : 'دائن'}».
                      الحسابات التي تتأثر بهذا التغيير:
                      <ul className="list-disc pr-4 mt-1 space-y-0.5 text-[11px]">
                        <li>الحساب الجديد نفسه — أرصدته ستُعرض عمود {natureIsDebit ? 'المدين' : 'الدائن'} في ميزان المراجعة.</li>
                        <li>أبناؤه المستقبليون — سيورثون طبيعتك المعدّلة بدل موروث الدليل.</li>
                        <li>
                          مجاميع الحسابات الرئيسية أعلاه (أعمدة الأرصدة المجمّعة):
                          {affectedPath.length > 0
                            ? ' ' + affectedPath.map((p) => `${p.code} ${p.name}`).join(' ← ')
                            : ' الحساب جذري بلا أعلى.'}
                        </li>
                        <li>التقارير المرتبطة (الأستاذ العام، ميزان المراجعة، قوائم المالية) لذلك الفرع.</li>
                      </ul>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setNatureTouched(false); setAddNature(inheritedNature); }}
                    className="shrink-0 px-3 py-2 bg-white text-amber-700 border border-amber-300 hover:bg-amber-100 rounded-lg text-[11px] font-bold whitespace-nowrap"
                  >
                    استعادة الافتراضي ({inheritedNature === 'DEBIT' ? 'مدين' : 'دائن'})
                  </button>
                </div>
              </div>
            )}

            {/* عملات الحساب — مثل قائمة العملات في الصورة المرجعية */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">عملات الحساب المسسموحة</label>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {CURRENCY_CHOICES.map((c) => (
                  <label key={c.iso} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:bg-white rounded-lg px-2 py-1 transition">
                    <input
                      type="checkbox"
                      checked={addCurrencies.includes(c.iso)}
                      onChange={(e) => {
                        setAddCurrencies((prev) => (e.target.checked ? [...prev, c.iso] : prev.filter((x) => x !== c.iso)));
                      }}
                      className="rounded text-blue-600"
                    />
                    <span className="font-mono font-bold text-blue-600">{c.token}</span>
                    <span className="font-medium">{c.nameAr}</span>
                  </label>
                ))}
                {addCurrencies.length === 0 && (
                  <div className="text-[10px] text-slate-400 sm:col-span-2">بدون تحديد — الحساب متاح بعملة الدليل الافتراضية.</div>
                )}
              </div>
            </div>

            {/* أين سيرتبط + الحسابات المتأثرة */}
            <div className="bg-blue-50/50 border border-blue-100/60 rounded-xl p-3">
              <div className="text-[10px] text-blue-600 font-bold uppercase mb-1.5">أين سيرتبط وكيف يُبنى رقمه</div>
              <div className="space-y-1 text-xs text-slate-700">
                {effectiveParent ? (
                  <>
                    <div>
                      <span className="font-bold">الربط: </span>
                      سيُدرج الحساب تحت «<span className="font-bold text-blue-700">{effectiveParent.code} — {effectiveParent.name}</span>» (مستوى {effectiveParent.level}).
                    </div>
                    <div>
                      <span className="font-bold">بناء الرقم: </span>
                      كود الأب <span className="font-mono font-bold">{effectiveParent.code}</span> + التسلسل التالي
                      <span className="font-mono font-bold"> {suggestedCode.slice(effectiveParent.code.length) || '؟'} </span>
                      = <span className="font-mono font-bold text-blue-700">{suggestedCode || '؟'}</span>
                    </div>
                    <div>
                      <span className="font-bold">الحسابات المتأثرة بمجاميعها: </span>
                      {affectedPath.length > 0
                        ? affectedPath.map((p) => `${p.code} ${p.name}`).join(' ← ')
                        : '—'}
                    </div>
                  </>
                ) : (
                  <div>الحساب سيكون جذرياً في المستوى الأول — اختر أب أو اكتب رقماً بدءاً ببادئة موجودة ليُشتق ارتباطه تلقائياً.</div>
                )}
              </div>
            </div>
          </div>

          {/* أزرار النافذة */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 px-5 pb-4 shrink-0">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition">إلغاء</button>
            <button
              type="submit"
              form="add-account-form"
              disabled={submitting || !addCode || !addName}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-xs disabled:opacity-50"
            >
              {submitting ? 'جاري الإضافة...' : 'حفظ الحساب في الدليل'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ----------------------------------------------------------------
  // نموذج الاستيراد من إكسل (بصيغة القالب المعتمد)
  // ----------------------------------------------------------------
  const renderImportModal = () => {
    if (!isImportModalOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
            <div className="flex items-center gap-2">
              <Upload size={18} className="text-amber-600" />
              <h3 className="font-bold text-slate-800 text-sm">استيراد دليل الحسابات من ملف إكسل</h3>
            </div>
            <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition">
              <X size={18} />
            </button>
          </div>
          <div className="overflow-y-auto p-5 space-y-4 shrink-0 flex-1">
            {importResult && importResult.success && (
              <div className="p-3 rounded-xl text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700">
                {importResult.message}
              </div>
            )}
            {importResult && !importResult.success && (
              <div className="p-3 rounded-xl text-xs font-medium bg-rose-50 border border-rose-200 text-rose-700 space-y-1">
                <div>{importResult.message}</div>
                {Array.isArray(importResult.details) && importResult.details.length > 0 && (
                  <ul className="list-disc pr-4 space-y-0.5 text-[11px] text-rose-600">
                    {importResult.details.slice(0, 8).map((d: any, i: number) => (
                      <li key={i}>{d.code ? `الكود ${d.code}: ` : ''}{d.message}</li>
                    ))}
                    {importResult.details.length > 8 && <li>… و{importResult.details.length - 8} أخطاء أخرى</li>}
                  </ul>
                )}
              </div>
            )}
            {importParseError && (
              <div className="p-3 rounded-xl text-xs font-medium bg-rose-50 border border-rose-200 text-rose-700 whitespace-pre-line">
                {importParseError}
              </div>
            )}
            {!importParseError && importRows && (
              <div className="p-3 rounded-xl text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700">
                تم قراءة الملف بنجاح — {importRows.length} صف من صيغة القالب جاهز للاستيراد.
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اختر ملف إكسل بصيغة القالب (*.xlsx)</label>
              <input
                type="file" accept=".xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  handleImportFileChange(f);
                }}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg border border-blue-200 transition"
            >
              <Download size={14} /> تنزيل قالب الاستيراد (قالب_دليل_الحسابات.xlsx)
            </button>
            <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-600 space-y-1">
              <div>• ورقة العمل: «دليل الحسابات» — الأعمدة الثمانية بهذا الترتيب:</div>
              <div className="font-mono text-[10px] leading-relaxed">رقم الحساب | العملة | اسم الحساب | المستوى | النوع | الحساب الرئيسي | التضمين | نوع التقرير</div>
              <div>• «النوع»: رئيسي = حساب تجميعي، فرعي = حساب تفصيلي</div>
              <div>• «الحساب الرئيسي»: كود الحساب الأب مباشرة، واكتب 0 للحسابات الجذرية</div>
              <div>• «نوع التقرير»: الميزانية العمومية أو الأرباح والخسائر</div>
              <div>• الكود هو مفتاح الدمج: الحساب الموجود يُحدَّث والجديد يُنشأ</div>
              <div>• لا يُحذف أي حساب حالي؛ العملية ذرّية (أي خطأ يُجهض الاستيراد كله)</div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 px-5 pb-4 shrink-0">
            <button type="button" onClick={() => setIsImportModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition">إلغاء</button>
            <button type="submit" form="import-account-form" disabled={importing || !importRows || importRows.length === 0} className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition shadow-xs disabled:opacity-50">
              {importing ? 'جاري الاستيراد...' : 'استيراد من ملف إكسل'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ----------------------------------------------------------------
  // لوحة تفاصيل الحساب المختار (الجهة اليمنى مثل الصورة المرجعية)
  // ----------------------------------------------------------------
  const renderDetailPanel = () => {
    if (!selectedId) return null;
    const node = findNode(tree, selectedId);
    if (!node) return null;
    const path = findPath(tree, selectedId) || [];

    return (
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-4 flex flex-col h-full">
        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-blue-600" />
            <h3 className="font-bold text-slate-800 text-sm">تفاصيل الحساب المحدد</h3>
          </div>
          <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 p-2 rounded-lg">
              <div className="text-[10px] text-slate-500 font-bold uppercase">كود الحساب</div>
              <div className="font-mono font-bold text-slate-800">{node.code}</div>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <div className="text-[10px] text-slate-500 font-bold uppercase">المستوى</div>
              <div className="font-bold text-slate-800">مستوى {node.level || 1}</div>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <div className="text-[10px] text-slate-500 font-bold uppercase">النوع</div>
              <div className="font-bold text-slate-800">{node.accountTypeId}</div>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <div className="text-[10px] text-slate-500 font-bold uppercase">طبيعة الرصيد</div>
              <div className={`font-bold text-slate-800 ${node.normalBalance === 'DEBIT' ? 'text-blue-600' : 'text-purple-600'}`}>
                {node.normalBalance === 'DEBIT' ? 'مدين (Debit)' : 'دائن (Credit)'}
              </div>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <div className="text-[10px] text-slate-500 font-bold uppercase">النوع الهيكلي</div>
              <div className="font-bold text-slate-800">{node.isGroup ? 'رئيسي / تجميعي' : 'تفصيلي / فرعي'}</div>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <div className="text-[10px] text-slate-500 font-bold uppercase">الحالة</div>
              <div className="inline-flex items-center gap-1 font-bold text-emerald-600">
                <CheckCircle2 size={11} /> نشط
              </div>
            </div>
          </div>
          <div className="bg-blue-50/50 border border-blue-100/60 rounded-lg p-2">
            <div className="text-[10px] text-blue-600 font-bold uppercase mb-1">المسار الهرمي</div>
            <div className="text-xs text-slate-700 font-medium break-all">{path.join(' › ')}</div>
          </div>
          <div className="bg-purple-50/50 border border-purple-100/60 rounded-lg p-2">
            <div className="text-[10px] text-purple-600 font-bold uppercase mb-1">عملات الحساب</div>
            <div className="text-xs text-slate-700 font-medium">
              {node.currencyCodes
                ? node.currencyCodes.split(',').filter(Boolean).map((iso) => CURRENCY_NAME_BY_ISO.get(iso.trim()) || iso.trim()).join('، ')
                : 'بدون تحديد — عملة الدليل الافتراضية'}
            </div>
          </div>
          <div className="bg-amber-50/50 border border-amber-100/60 rounded-lg p-2">
            <div className="text-[10px] text-amber-600 font-bold uppercase mb-1">الأبناء المباشرون</div>
            <div className="text-xs text-slate-700 font-medium">
              {node.children.length === 0 ? 'لا يوجد أبناء (حساب تفصيلي)' : node.children.map((c) => c.code + ' — ' + c.name).join('، ')}
            </div>
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-slate-100 flex justify-end">
          <button onClick={() => setSelectedId(null)} className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition">إغلاق التفاصيل</button>
        </div>
      </div>
    );
  };

  // ----------------------------------------------------------------
  // واجهة المستخدم — مثل الصورة المرجعية: شجرة على اليسار، تفاصيل على اليمين
  // ----------------------------------------------------------------
  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-blue-600 to-cyan-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <BookOpen size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">دليل الحسابات الشامل (Chart of Accounts)</h1>
            <p className="text-xs text-slate-500 font-medium">شجرة حسابات هرمية متعددة المستويات تعتمد على علاقة الحساب الأب</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={expandAll}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition"
          >
            <ChevronDown size={14} className="mr-1" /> توسيع الكل
          </button>
          <button
            onClick={collapseAll}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition"
          >
            <ChevronRight size={14} className="mr-1" /> طي الكل
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exporting || accounts.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition disabled:opacity-50"
          >
            <Download size={16} className="mr-1" /> {exporting ? 'جاري التصدير...' : 'تصدير إلى إكسل'}
          </button>
          <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs rounded-xl border border-amber-200 transition">
            <Upload size={16} className="mr-1" /> استيراد من إكسل
          </button>
          <button onClick={openAddModal} className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow-xs">
            <Plus size={16} /> <span>إضافة حساب جديد</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400">1. الأصول (Assets)</span>
          <p className="text-xl font-black text-blue-600 font-mono mt-1">{accounts.filter((a) => a.code.startsWith('1')).length} حساب</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400">2. الخصوم (Liabilities)</span>
          <p className="text-xl font-black text-rose-600 font-mono mt-1">{accounts.filter((a) => a.code.startsWith('2')).length} حساب</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400">3. حقوق الملكية (Equity)</span>
          <p className="text-xl font-black text-purple-600 font-mono mt-1">{accounts.filter((a) => a.code.startsWith('3')).length} حساب</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400">4. الإيرادات (Revenue)</span>
          <p className="text-xl font-black text-emerald-600 font-mono mt-1">{accounts.filter((a) => a.code.startsWith('4')).length} حساب</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400">5. المصروفات (Expenses)</span>
          <p className="text-xl font-black text-amber-600 font-mono mt-1">{accounts.filter((a) => a.code.startsWith('5')).length} حساب</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="بحث برقم الحساب أو اسم الحساب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          {['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((type) => (
            <button key={type} onClick={() => setSelectedType(type)}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${selectedType === type ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
              {type === 'ALL' && 'الكل'}
              {type === 'ASSET' && 'الأصول'}
              {type === 'LIABILITY' && 'الخصوم'}
              {type === 'EQUITY' && 'الملكية'}
              {type === 'REVENUE' && 'الإيرادات'}
              {type === 'EXPENSE' && 'المصروفات'}
            </button>
          ))}
        </div>
      </div>

      {/* Search Results with Hierarchical Path */}
      {searchMatches && searchMatches.length > 0 && (
        <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Search size={14} className="text-amber-600" />
            <span className="text-xs font-bold text-amber-700">نتائج البحث ({searchMatches.length})</span>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {searchMatches.map(({ node, path }) => (
              <div key={node.id} onClick={(e) => selectAccount(node.id, e)} className="cursor-pointer px-2 py-1.5 rounded-lg bg-white/60 border border-amber-100/60 text-xs hover:bg-amber-100/40 transition group">
                <div className="text-[10px] text-amber-500 font-bold mb-0.5">{path.join(' › ')}</div>
                <div className="flex items-center gap-1">
                  {node.isGroup ? <Folder size={11} className="text-amber-500 fill-amber-500/20" aria-hidden="true" /> : <FileText size={12} className="text-blue-500" aria-hidden="true" />}
                  <span className={node.isGroup ? 'font-bold text-slate-900' : 'text-slate-700'}>{node.code} — {node.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content: Tree (Left) + Details/Table (Right) */}
      <div className="flex flex-col lg:flex-row gap-4 min-h-[500px]">
        {/* Tree Navigation Panel — مثل الصورة المرجعية */}
        <div className="flex-1 lg:w-2/5 bg-white rounded-xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-100/60 bg-slate-50/60">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide">
              <Layers size={12} className="text-slate-400" />
              شجرة الحسابات
            </div>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">
            {loading ? (
              <div className="p-6 text-center text-slate-400 text-xs">جاري تحميل شجرة الحسابات...</div>
            ) : tree.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">لا توجد حسابات للعرض</div>
            ) : (
              renderTree(tree, 0)
            )}
          </div>
          {selectedNode && (
            <div className="p-3 border-t border-slate-100/60 bg-slate-50/40 text-xs">
              <span className="font-bold text-slate-700">المحدد:</span>{' '}
              <span className="text-slate-500 truncate block">{selectedNode.code} — {selectedNode.name}</span>
            </div>
          )}
        </div>

        {/* Right Panel: Account Details + Table of Children */}
        <div className="flex-1 lg:w-3/5 bg-white rounded-xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden">
          {/* Account Details Panel */}
          {renderDetailPanel()}

          {/* Accounts Table — الجدول الأصلي يعرض أبناء الفرع المحدد */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-3 border-t border-slate-100/60 bg-slate-50/60 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide">
                <FileText size={12} className="text-slate-400" />
                {selectedNode ? `أبناء الحساب: ${selectedNode.code} — ${selectedNode.name}` : 'الحسابات الرئيسية (الجذور)'}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">{filteredTableAccounts.length} حساب</div>
            </div>
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200/70">
                  <tr>
                    <th className="py-3 px-4">كود الحساب</th>
                    <th className="py-3 px-4">اسم الحساب</th>
                    <th className="py-3 px-4">نوع الحساب</th>
                    <th className="py-3 px-4">طبيعة الرصيد</th>
                    <th className="py-3 px-4 text-center">المستوى</th>
                    <th className="py-3 px-4 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-400">جاري التحميل...</td></tr>
                  ) : filteredTableAccounts.length === 0 ? (
                    <tr><td colSpan={6} className="py-10 text-center text-slate-400">لا توجد حسابات مطابقة</td></tr>
                  ) : (
                    filteredTableAccounts.map((acc) => (
                      <tr key={acc.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-800">{acc.code}</td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            {acc.isGroup ? (
                              <>
                                <Folder size={12} className="text-amber-500 fill-amber-500/20" aria-hidden="true" />
                                <span className="font-bold text-slate-900">{acc.name}</span>
                              </>
                            ) : (
                              <>
                                <FileText size={14} className="text-blue-500" />
                                <span className="text-slate-700">{acc.name}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{acc.accountTypeId}</span>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={`text-[10px] font-bold ${acc.normalBalance === 'DEBIT' ? 'text-blue-600' : 'text-purple-600'}`}>
                            {acc.normalBalance === 'DEBIT' ? 'مدين' : 'دائن'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className="font-mono text-slate-400 text-[11px]">مستوى {acc.level || 1}</span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                            <CheckCircle2 size={11} /> نشط
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <form id="add-account-form" onSubmit={handleCreateAccount}>
        {renderAddModal()}
      </form>
      <form id="import-account-form" onSubmit={handleImport}>
        {renderImportModal()}
      </form>
    </div>
  );
};