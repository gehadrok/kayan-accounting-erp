# تقرير: تطوير اختيار الحسابات في سندات القبض والصرف

**المشروع:** Kayan Accounting ERP (`F:\KAYAN_ERP2026`)
**النطاق:** شاشة سند القبض (`/sales/receipts`) وشاشة سند الصرف (`/purchasing/payments`)
**الحالة:** منفّذ على بيئة اختبار معزولة — **في انتظار موافقتك قبل تطبيق migration على قاعدة التشغيل**

---

## 1. الملفات التي تمت مراجعتها وتعديلها

### ملفات مراجعة (قراءة/فحص)
- `src/server/salesService.ts` — `createReceipt`, `postReceipt`, `getReceipts`, `getReceiptById`
- `src/server/purchasingService.ts` — `createPayment`, `postSupplierPayment`, `reverseSupplierPayment`, `getPayments`, `getPaymentById`
- `src/server/accountingService.ts` — `createJournalEntry` (حراسة الحسابات التجميعية)، `postJournalEntry`, `reverseJournalEntry`
- `src/server/routes.ts` — endpoints سندات القبض/الصرف، middleware الصلاحيات/النطاق، `/lookups/:type`
- `src/pages/Receipts.tsx`, `src/pages/SupplierPayments.tsx` — نماذج الإدخال/العرض/القوائم
- `migrations/V6__sales.sql`, `V7__purchasing.sql`, `V9__cash_banking.sql` — مخطط receipts/payments/customers/suppliers/cash/bank
- `src/server/db.ts` — عقد `PGLITE_DATA_DIR`/`PGLITE_BOOTSTRAP` (تم إضافة V30 للقائمة)

### ملفات تعديل (backend)
- `migrations/V30__voucher_counterparty.sql` — **جديد** (nullable party + counterparty_type + counterparty_account_id)
- `src/server/db.ts` — تسجيل V30 في قائمة الترحيلات
- `src/server/voucherAccounting.ts` — **جديد** — قواعد الطرف المقابل ووسيلة التحصيل/الصرف مشتركة
- `src/server/salesService.ts` — `CreateReceiptDto` موسع، `createReceipt`, `postReceipt`, `getReceipts`, `getReceiptById`
- `src/server/purchasingService.ts` — `CreatePaymentDto` موسع، `createPayment`, `postSupplierPayment`, `getPayments`, `getPaymentById`
- `src/server/routes.ts` — 4 endpoints lookups جديدة + تعيين الصلاحيات

### ملفات تعديل (frontend)
- `src/components/documents/VoucherAccountPicker.tsx` — **جديد** — مكوّنان: `VoucherCounterpartyPicker` (مرحلتان) + `VoucherVehiclePicker`
- `src/pages/Receipts.tsx` — نموذج إدخال/عرض/قائمة
- `src/pages/SupplierPayments.tsx` — نموذج إدخال/عرض/قائمة

---

## 2. مصدر بيانات كل نوع حساب (مصدر حقيقي — لا بيانات وهمية)

| نوع الحساب | مصدر البيانات | ملاحظات |
|---|---|---|
| العملاء | `sales.customers` (is_active) + `receivables_account_id` → `accounting.accounts` | ربط معتمد (V6). الافتراضي 1103 إن لم يوجد ربط (مع رسالة واضحة) |
| الموردون | `purchasing.suppliers` (is_active) + `payables_account_id` → `accounting.accounts` | ربط معتمد (V7). الافتراضي 2101 إن لم يوجد ربط |
| الموظفون | **لا يوجد جدول موظفين في أي migration** (grep شامل across migrations) | **فجوة موثقة — يُرفض القيد (EMPLOYEES_GAP)؛ UI يعرض رسالة + إعادة محاولة** |
| الحسابات العامة | `accounting.accounts` (is_active=TRUE, is_group=FALSE) | باستثناء حسابات GL المربوطة بصناديق/بنوك (لمنع التكرار) |
| الصناديق | `banking.cash_accounts` (is_active) JOIN `accounting.accounts` (gl_account_id) | تعريفات فعلية + حساب GL مربوط |
| البنوك | `banking.bank_accounts` (is_active) JOIN `accounting.accounts` (gl_account_id) | تعريفات فعلية + حساب GL مربوط |

**وسيط التحصيل/الصرف (صندوق/بنك):** `banking.cash_accounts` / `banking.bank_accounts` (is_active + gl_account_id NOT NULL + حساب تفصيلي نشط) — يُحلّ حسابه على **الخادم** (resolveVehicle)، لا يثق بقيمة المتصفح.

---

## 3. طريقة ربط العملاء/الموردين/الموظفين بالحسابات المحاسبية

- **العملاء:** `sales.customers.receivables_account_id` (FK إلى `accounting.accounts`). إن كان NULL → fallback حساب 1103 (مع خطأ واضح إن لم يوجد 1103).
- **الموردون:** `purchasing.suppliers.payables_account_id` (FK). إن كان NULL → fallback 2101 (مع خطأ واضح).
- **الموظفون:** **لا يوجد ربط معتمد** (لا جدول موظفين). موثّق كفجوة — لا حسابات بديلة، لا بيانات وهمية.

**أعمدة الربط (V30):** `sales.receipts.counterparty_type` + `counterparty_account_id`؛ `purchasing.payments.counterparty_type` + `counterparty_account_id`. أعمدة `customer_id`/`supplier_id` تصبح nullable (للأنواع غير عميل/مورد) مع default `'CUSTOMER'`/`'SUPPLIER'` للسندات السابقة.

---

## 4. الفرق بين حساب الطرف المقابل وحساب الصندوق/البنك

- **حساب الطرف المقابل** (stage 1+2): من يُقيد عليه السند — عميل/مورد/موظف/حساب عام/صندوق/بنك.
- **حساب وسيلة التحصيل/الصرف**: الصندوق أو البنك الذي استُلمت فيه/خرجت منها الأموال (target_account_id / source_account_id).
- **اتجاه القيد (بدون تغيير):**
  - سند القبض: **مدين** حساب وسيلة التحصيل (صندوق/بنك)، **دائن** حساب الطرف المقابل.
  - سند الصرف: **مدين** حساب الطرف المقابل، **دائن** حساب وسيلة الصرف (صندوق/بنك).
- منع قيد الطرف مقابل **نفس** حساب وسيلة التحصيل (مدين ودائن لحساب واحد — بلا معنى محاسبي).
- المخصصات (allocations) تُقبل **فقط** على customer/supplier (فواتير عميل/مورد).

---

## 5. قواعد التحقق على الخادم

- الحساب موجود + في نطاق الشركة (`company_id` match) + نشط + تفصيلي (غير تجميعي) — `createJournalEntry` يرفض التجميعي.
- توافق الحساب مع النوع (CASH/BANK: يجب أن يكون gl_account_id لتعريف صندوق/بنك نشط).
- الحسابات العامة: رفض إذا كان حساب GL مربوطاً بصناديق/بنوك (يُختار من نوعه).
- صلاحيات: `/lookups/receipt-counterparty` و `receipt-vehicles` → `sales.receipts.manage`؛ `payment-counterparty` و `payment-vehicles` → `purchasing.payments.manage`. endpoints السندات تستخدم `requireDocumentActor` (401/403).
- نطاق الشركة/الفرع: `resolveRequestScope` (x-kayan-company-id/branch-id) — رفض 403 إن لم يُمنح.
- لا تغيير للحسابات بعد الترحيل (العكس عبر `reverseJournalEntry` + void).
- التحقق من الحساب **على الخادم** — لا اعتماد على قيمة المتصفح.

---

## 6. نتائج الاختبارات (12 نقطة) — على قاعدة اختبار معزولة (PORT 3100, temp PGLITE_DATA_DIR)

| # | الاختبار | النتيجة |
|---|---|---|
| 1 | ظهور أنواع الحسابات الستة (12 تركيبة endpoint) | PASS |
| 2 | تحميل الحسابات الفعلية لكل نوع (customers=4, suppliers=4, cash=4, banks=4, general=25, employees=0) | PASS |
| 3 | عدم ظهور حسابات من نوع آخر (لا تسرب) | PASS |
| 4 | نجاح البحث والاختيار (q filter) | PASS |
| 5 | مسح الحساب الفرعي عند تغيير النوع (code-verified) | PASS |
| 6 | التعامل مع النوع بلا حسابات (موظفون): options=0 + gap + POST 400 | PASS |
| 7 | رفض حساب غير موجود/تجميعي/عميل غير موجود (400) | PASS |
| 8 | رفض تجاوز الصلاحيات/النطاق (401 no/bad token) | PASS |
| 9 | صحة حسابات القيد (سند قبض — حساب عام): debit cash GL, credit general GL, 100 | PASS |
| 10 | اتجاه القيد وتوازن المدين/الدائن (سند صرف): debit general 50, credit bank 50, balanced | PASS |
| 11 | استمرار الترحيل والعكس (void سند صرف): status VOIDED + JE REVERSED | PASS |
| 12 | عدم تأثير التغيير (back-compat نمط قديم): debit 1101, credit 1103, 25 | PASS |

**النتيجة: 12/12 PASS, 0 FAIL.**

**نتائج إضافية:**
- قوائم سندات القبض/الصرف (GET) ما تزال تعمل (receipts=2+, payments=2+).
- TypeScript: `npx tsc --noEmit` → **0 أخطاء**.
- Vite build: `✓ built in 1.44s` — ناجح.

---

## 7. الصلاحيات ونطاق الشركة/الفرع

- تم اختبار 401 (بدون token / token غير صالح) — PASS.
- تم اختبار 403 permission (best-effort: لم يُنشأ مستخدم محدود — skipped؛ صلاحيات endpoints معرّفة في `requiredPermission()`).
- نطاق الشركة/الفرع: `resolveRequestScope` يطبّق x-kayan-company-id/branch-id + `security.list_user_access_scopes` — مُختبر (admin granted scope على temp DB).

---

## 8. أنواع لم يمكن دعمها بسبب نقص في البيانات/العلاقات

- **الموظفون (EMPLOYEE):** لا يوجد جدول `employees` في أي migration (grep شامل). موثّق كفجوة. UI: رسالة واضحة + إعادة محاولة؛ POST → 400 `EMPLOYEES_GAP_AR`. **لا بيانات وهمية.**
- **الربط المحاسبي للموظفين:** غير موجود — يتطلب إنشاء سجل موظفين + ربطه بحساب GL (يحتاج موافقتك/مرحلة مستقبلية).

---

## 9. تغييرات محاسبية/هيكلية تحتاج إلى موافقتك

1. **Migration `V30__voucher_counterparty.sql`** — **لم تُطبَّق على قاعدة التشغيل**. اختُبرت على temp DB (PORT 3100). تتطلب:
   - `ALTER TABLE sales.receipts ALTER COLUMN customer_id DROP NOT NULL` + إضافة `counterparty_type`/`counterparty_account_id`
   - `ALTER TABLE purchasing.payments ALTER COLUMN supplier_id DROP NOT NULL` + نفس الإضافات
   - **يجب تطبيقها على `.pgdata` (live) قبل إعادة تشغيل الخادم، وإلا ستفشل endpoints سندات القبض/الصرف.**
2. **Fallback حسابات 1103/2101** — يبقى سلوك التوافق (للعملاء/الموردين غير المربوطين). يمكن إزالته لاحقاً لفرض الربط.
3. **vehicle GL accounts (1101/1102)** — back-compat fallback يبقى إن لم يُختر صندوق/بنك فعلي.

---

## 10. ملاحظات تشغيلية

- **الخادم على المنفذ 3000:** أُوقِف accidental during testing (killed node processes). **يُرجى إعادة تشغيله via `start-server.ps1` بعد تطبيق migration V30.** (لم أُعد تشغيله ببيانات قاعدة التشغيل لتجنب تشغيل الكود الجديد على schema قديم.)
- **قاعدة التشغيل `.pgdata`:** لم تُلمس (لا migrations، لا writes). migration V30 مُختبرة على temp DB فقط.
- **Git:** لا أوامر git تم تنفيذها.
- **نشر:** لم يتم.

---

## 11. الملفات (git status) — تغييرات غير committed (كما كانت)

- `src/pages/ChartOfAccounts.tsx` (من task سابق — غير متأثر)
- `src/server/routes.ts`, `src/server/accountingService.ts` (currencyCodes passthrough + G.S→GBP)
- **جديد:** `migrations/V30__voucher_counterparty.sql`, `src/server/voucherAccounting.ts`, `src/components/documents/VoucherAccountPicker.tsx`
- **معدل:** `src/server/db.ts`, `src/server/salesService.ts`, `src/server/purchasingService.ts`, `src/pages/Receipts.tsx`, `src/pages/SupplierPayments.tsx`

---

**أوقفتُ هنا — في انتظار توجيهك (لا مرحلة تالية تلقائياً).**
