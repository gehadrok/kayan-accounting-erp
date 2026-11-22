import React from 'react';
import { cn } from 'cn';
import { Search, X, Calendar, ChevronDown } from 'lucide-react';

/**
 * KAYAN ENTERPRISE UI — form controls
 * ============================================================
 * حقول الإدخال الموحّدة. جميعها تشترك في نفس فئات
 * `controlBase` أدناه، فتبقى متساوية الارتفاع والمسافات والحدود
 * والتركيز عبر كل النماذج في النظام.
 *
 * ملاحظات مقصودة (من المواصفة §6):
 *  - الحقول المالية تحتفظ بقيمة `string` في الحالة وتُحوَّل إلى
 *    رقم عند الإرسال فقط، فلا يحدث تحويل نصي مبكر يقتل
 *    الدقة. NumberInput هنا يعرض النص كما هو.
 *  - لا تُقرِض هذه المكوّنات أي قاعدة تحقق جديدة؛ هي تمرّر
 *    `required`/`min`/`step` كما هي إلى العنصر الأصلي.
 */

/* الفئة المشتركة — مصدر الحقيقة الوحيد لارتفاع الحقل وحدوده. */
export const controlBase =
  'w-full rounded-control border bg-surface text-sm text-ink transition-[border-color,box-shadow] duration-150 ' +
  'placeholder:text-ink-muted/70 outline-none ' +
  'focus:border-brand focus:shadow-[0_0_0_3px_var(--kayan-primary-ring)] ' +
  'disabled:bg-surface-sunken disabled:text-ink-muted disabled:cursor-not-allowed disabled:border-line-soft ' +
  'read-only:bg-surface-muted read-only:text-ink-muted';

/* حالة الخطأ تُضاف من FormField عبر prop، لا من داخل المكوّن، حتى
   لا يتكرر تعريف aria-invalid في كل حقل على حدة. */
const errorRing = 'border-state-danger focus:border-state-danger focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--kayan-danger)_22%,transparent)]';

const sizes = {
  md: 'h-[42px] px-3.5',
  sm: 'h-9 px-3 text-[13px]',
  xs: 'h-8 px-2.5 text-xs',
} as const;

export type ControlSize = keyof typeof sizes;

/* ملاحظة أصيلة: HTML تعرف `size` على `<input>` كـ number (عدد
   الأحرف)، لذلك نُسقطها من الواجهة قبل إعادة تعريفها كمقاس
   بصري. بدون هذا السقوط كان تعريف الواجهة سيتعارض مع نوع
   HTML نفسه ويوقف البناء. */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: ControlSize;
  invalid?: boolean;
  /** أيقونة داخل الحقل على جهة البداية (يمين في RTL). */
  icon?: React.ReactNode;
  /** حقل بحث بزر مسح. */
  onClear?: () => void;
  /** محاذاة رقمية للجداول المالية. */
  numeric?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid, icon, onClear, numeric, className, ...rest },
  ref
) {
  const hasAffix = Boolean(icon || onClear);
  return (
    <div className="relative w-full">
      {icon && (
        <span
          className="pointer-events-none absolute inset-y-0 start-0 flex w-10 items-center justify-center text-ink-muted"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          controlBase,
          sizes[size],
          invalid && errorRing,
          hasAffix && 'ps-10',
          onClear && 'pe-10',
          numeric && 'kayan-numeric text-end',
          className
        )}
        {...rest}
      />
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="مسح"
          className="absolute inset-y-0 end-0 flex w-9 items-center justify-center text-ink-muted transition-colors hover:text-ink"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
});

/* ------------------------------------------------------------
   SearchInput — حقل البحث الموحّد (يُستخدم في PageToolbar
   وفي DataTable). نصوصه عربية لأن التطبيق عربي افتراضياً.
   ------------------------------------------------------------ */
export interface SearchInputProps extends Omit<InputProps, 'icon' | 'onClear'> {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onValueChange,
  placeholder = 'بحث...',
  size = 'md',
  className,
  ...rest
}) => (
  <Input
    size={size}
    type="search"
    role="searchbox"
    icon={<Search size={16} />}
    value={value}
    onChange={(e) => onValueChange(e.target.value)}
    onClear={value ? () => onValueChange('') : undefined}
    placeholder={placeholder}
    className={className}
    {...rest}
  />
);

/* ------------------------------------------------------------
   NumberInput
   ------------------------------------------------------------
   لا يحوّل القيمة إلى `number` أثناء الكتابة: الدورة الرقمية
   على float تفقد الدقة التي تعتمد عليها NUMERIC(18,4) في قاعدة
   البيانات. القيمة تبقى string وتُرسل كما هي؛ الصفحة هي التي
   تحوّلها عند بناء الـ payload.
   ------------------------------------------------------------ */
export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'size'> {
  value: string | number;
  onValueChange: (value: string) => void;
  size?: ControlSize;
  invalid?: boolean;
  numeric?: boolean;
}

/* ------------------------------------------------------------
   NumericInput — تجربة: عرض لاتيني (0–9) (type="text").
   ------------------------------------------------------------
   حقل رقمي يعرض الأرقام اللاتينية دائماً بغض النظر عن لغة
   المستند، مع الحفاظ على عقد NumberInput (value string،
   onValueChange). التحقق min/max/step/required يُعاد
   تنفيذه عبر setCustomValidity لأن حقول النص لا تطبقها أصلياً.
   الأرقام العربية الهندية/الفارسية المدخلة أو الملصقة تُحوَّل
   إلى لاتينية. القيمة تبقى نصاً حتى التحويل في الصفحة.
   ------------------------------------------------------------ */
export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'size'> {
  value: string | number;
  onValueChange: (value: string) => void;
  size?: ControlSize;
  invalid?: boolean;
  numeric?: boolean;
  /** تحويل الأرقام العربية الهندية/الفارسية إلى لاتينية. */
  normalizeDigits?: boolean;
}

const ARABIC_INDIC = /[٠-٩]/g;
const PERSIAN = /[۰-۹]/g;

function toLatinDigits(s: string): string {
  return s
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN, (d) => String(d.charCodeAt(0) - 0x06f0))
    // Arabic decimal separator → ASCII dot (preserves fractional part).
    .replace(/\u066B/g, '.')
    // Arabic thousands separator → remove (avoid breaking Number()).
    .replace(/\u066C/g, '');
}

function validateNumeric(
  value: string,
  min: unknown,
  max: unknown,
  step: unknown,
  required: boolean | undefined
): string {
  const v = String(value ?? '').trim();
  if (v === '') {
    return required ? 'هذا الحقل مطلوب' : '';
  }
  const norm = toLatinDigits(v);
  const n = Number(norm);
  if (!Number.isFinite(n)) {
    return 'أدخل رقماً صالحاً';
  }
  if (min !== undefined && min !== null && min !== '') {
    const mn = Number(min);
    if (Number.isFinite(mn) && n < mn) {
      return 'يجب أن تكون القيمة ' + min + ' على الأقل';
    }
  }
  if (max !== undefined && max !== null && max !== '') {
    const mx = Number(max);
    if (Number.isFinite(mx) && n > mx) {
      return 'يجب أن تكون القيمة ' + max + ' على الأكثر';
    }
  }
  if (step !== undefined && step !== null && step !== '' && step !== 'any') {
    const st = Number(step);
    if (Number.isFinite(st) && st > 0) {
      const base =
        min !== undefined && min !== null && min !== '' && Number.isFinite(Number(min))
          ? Number(min)
          : 0;
      const remainder = Math.abs((n - base) - Math.round((n - base) / st) * st);
      const tolerance = 1e-9 * Math.max(1, Math.abs(n));
      if (remainder > tolerance) {
        return 'يجب أن تكون القيمة من مضاعفات ' + step;
      }
    }
  }
  return '';
}

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onValueChange,
  size = 'md',
  invalid,
  numeric = true,
  className,
  ...rest
}) => (
  <input
    type="number"
    inputMode="decimal"
    value={value}
    onChange={(e) => onValueChange(e.target.value)}
    aria-invalid={invalid || undefined}
    className={cn(
      controlBase,
      sizes[size],
      invalid && errorRing,
      numeric && 'kayan-numeric',
      /* spinner الافتراضي يربك الحقول المالية ويأخذ
         مساحة من الرقم؛ نُخفيه ونُبقي التحكم بالأسهم. */
      '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
      className
    )}
    {...rest}
  />
);

/* ------------------------------------------------------------
   NumericInput — تجربة: عرض لاتيني (0–9) (type="text").
   ------------------------------------------------------------
   حقل رقمي يعرض الأرقام اللاتينية دائماً بغض النظر عن لغة
   المستند، مع الحفاظ على عقد NumberInput (value string،
   onValueChange). التحقق min/max/step/required يُعاد
   تنفيذه عبر setCustomValidity لأن حقول النص لا تطبقها أصلياً.
   الأرقام العربية الهندية/الفارسية المدخلة أو الملصقة تُحوَّل
   إلى لاتينية. القيمة تبقى نصاً حتى التحويل في الصفحة.
   ------------------------------------------------------------ */
export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(function NumericInput(
  {
    value,
    onValueChange,
    size = 'md',
    invalid,
    numeric = true,
    normalizeDigits = true,
    className,
    ...rest
  },
  ref
) {
  const innerRef = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

  const min = rest.min;
  const max = rest.max;
  const step = rest.step;
  const required = rest.required;

  const [validationMessage, setValidationMessage] = React.useState('');

  const applyValidation = React.useCallback(
    (v: string) => {
      const msg = validateNumeric(v, min, max, step, Boolean(required));
      setValidationMessage(msg);
      if (innerRef.current) innerRef.current.setCustomValidity(msg);
    },
    [min, max, step, required]
  );

  React.useEffect(() => {
    applyValidation(String(value ?? ''));
  }, [value, applyValidation]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    if (normalizeDigits) v = toLatinDigits(v);
    onValueChange(v);
    applyValidation(v);
  };

  const isInvalid = Boolean(invalid) || Boolean(validationMessage);

  return (
    <input
      ref={innerRef}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={handleChange}
      required={required}
      aria-invalid={isInvalid || undefined}
      className={cn(
        controlBase,
        sizes[size],
        isInvalid && errorRing,
        numeric && 'kayan-numeric',
        className
      )}
      {...rest}
    />
  );
});

/* ------------------------------------------------------------
   Textarea
   ------------------------------------------------------------ */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea: React.FC<TextareaProps> = ({ invalid, className, rows = 3, ...rest }) => (
  <textarea
    rows={rows}
    aria-invalid={invalid || undefined}
    className={cn(controlBase, 'px-3.5 py-2.5 leading-relaxed', invalid && errorRing, className)}
    {...rest}
  />
);

/* ------------------------------------------------------------
   Select
   ------------------------------------------------------------ */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[];
  size?: ControlSize;
  invalid?: boolean;
  /** عنصر يظهر كخيار أول غير قابل للاختيار (placeholder). */
  placeholder?: string;
}

export const Select: React.FC<SelectProps> = ({
  options,
  size = 'md',
  invalid,
  placeholder,
  className,
  ...rest
}) => (
  <div className="relative w-full">
    <select
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        sizes[size],
        'appearance-none pe-10',
        invalid && errorRing,
        className
      )}
      {...rest}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
    <ChevronDown
      size={16}
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 end-3 my-auto text-ink-muted"
    />
  </div>
);

/* ------------------------------------------------------------
   SearchSelect — قائمة قابلة للبحث.
   ------------------------------------------------------------
   ملاحظة مقصودة: هذا المكوّن للاختيار من قائمة صغيرة أو متوسطة
 *المحمّلة مسبقاً. للبحث عبر الـ API (ابحث عن صنف من الآلاف)
   نكتفي بالنموذج المحمّل مسبقاً. للبحث عبر الـ API (ابحث عن صنف
   من آلاف) نستخدم LookupDialog الموجود في المشروع — لا نكرره ولا
   نستبدله، لأن LookupDialog يحمل سلوكاً محفوظاً ومعتمداً.
   ------------------------------------------------------------ */
export interface SearchSelectProps {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  size?: ControlSize;
  invalid?: boolean;
  id?: string;
  disabled?: boolean;
}

export const SearchSelect: React.FC<SearchSelectProps> = ({
  options,
  value,
  onValueChange,
  placeholder = 'اختر...',
  searchPlaceholder = 'اكتب للبحث...',
  emptyLabel = 'لا توجد نتائج',
  size = 'md',
  invalid,
  id,
  disabled,
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const boxRef = React.useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  React.useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const heightClass = sizes[size];

  return (
    <div ref={boxRef} className="relative w-full">
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          controlBase,
          heightClass,
          'flex items-center justify-between gap-2 text-start',
          invalid && errorRing,
          disabled && 'cursor-not-allowed'
        )}
      >
        <span className={cn('truncate', !selected && 'text-ink-muted/70')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-ink-muted" />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-control border border-line bg-surface shadow-k-lg">
          <div className="border-b border-line-soft p-2">
            <Input
              size="sm"
              autoFocus
              icon={<Search size={14} />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-ink-muted">{emptyLabel}</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    disabled={o.disabled}
                    onClick={() => {
                      onValueChange(o.value);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm transition-colors',
                      o.value === value
                        ? 'bg-brand-soft font-semibold text-brand'
                        : 'text-ink hover:bg-surface-hover',
                      o.disabled && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------
   DatePicker
   ------------------------------------------------------------
   غلاف حول <input type="date"> الأصلي. السبب: العنصر الأصلي
   يعطي لوحة مفاتيح كاملة، ويدعم اللغات والاتجاهات، ويخرج
   بصيغة ISO مطابقة تماماً لما تتوقعه واجهة الـ API
   (YYYY-MM-DD)، ولا يحتاج مكتبة خارجية ولا يحمل حالة تاريخ
   داخلية قد تغيّر القيمة المرسلة للخادم. أي مكتبة تقويم كانت
   ستحوّل التاريخ إلى طابع زمني ثم تعيد صياغته — مصدر أخطاء
   كلاسيبي في التطبيقات المالية.
   ------------------------------------------------------------ */
export interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  size?: ControlSize;
  invalid?: boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({ size = 'md', invalid, className, ...rest }) => (
  <div className="relative w-full">
    <input
      type="date"
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        sizes[size],
        'pe-10',
        invalid && errorRing,
        '[&::-webkit-calendar-picker-indicator]:opacity-0',
        className
      )}
      {...rest}
    />
    <Calendar
      size={16}
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 end-3 my-auto text-ink-muted"
    />
  </div>
);

/* ------------------------------------------------------------
   Checkbox / RadioGroup
   ------------------------------------------------------------ */
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  /** نص ثابت بجانب المؤشر (بدل label) عندما يكون الترتيب مهماً. */
  hint?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, hint, className, id, ...rest }) => {
  const inputId = id || React.useId();
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        id={inputId}
        type="checkbox"
        className={cn(
          'h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface transition-colors',
          'checked:border-brand checked:bg-brand',
          "checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%2220 6 9 17 4 12%22/></svg>')] checked:bg-center checked:bg-no-repeat",
          'focus-visible:ring-[3px] focus-visible:ring-brand/25 outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
        {...rest}
      />
      {(label || hint) && (
        <label htmlFor={inputId} className="cursor-pointer select-none text-sm text-ink">
          {label || hint}
        </label>
      )}
    </div>
  );
};

export interface RadioOption {
  value: string;
  label: string;
  hint?: string;
}

export interface RadioGroupProps {
  options: RadioOption[];
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  options,
  value,
  onValueChange,
  name,
  disabled,
  className,
}) => {
  const autoName = React.useId();
  const groupName = name || autoName;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-2', className)} role="radiogroup">
      {options.map((o) => {
        const id = `${groupName}-${o.value}`;
        return (
          <div key={o.value} className="flex items-center gap-2">
            <input
              id={id}
              type="radio"
              name={groupName}
              value={o.value}
              checked={value === o.value}
              disabled={disabled}
              onChange={() => onValueChange(o.value)}
              className={cn(
                'h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border border-line-strong bg-surface transition-colors',
                'checked:border-[5px] checked:border-brand',
                'focus-visible:ring-[3px] focus-visible:ring-brand/25 outline-none',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            />
            <label htmlFor={id} className="cursor-pointer select-none text-sm text-ink">
              {o.label}
            </label>
            {o.hint && <span className="text-xs text-ink-muted">{o.hint}</span>}
          </div>
        );
      })}
    </div>
  );
};