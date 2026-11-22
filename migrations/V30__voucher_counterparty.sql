-- V30__voucher_counterparty.sql
-- تطوير اختيار الحسابات في سندات القبض والصرف.
--
-- الوضع قبل هذا الترحيل:
--   sales.receipts.customer_id      NOT NULL  → سند القبض يقبل العميل فقط.
--   purchasing.payments.supplier_id NOT NULL  → سند الصرف يقبل المورد فقط.
--
-- المطلوب: اختيار الطرف المقابل على مرحلتين (نوع الحساب ثم الحساب) من ستة
-- أنواع: عميل / مورد / موظف / حساب عام / صندوق / بنك.
--   - أنواع العملاء والموردين تستمر بتخزين هوية الطرف في الأعمدة الأصلية
--     (customer_id / supplier_id) لتظل بطاقات الأطراف وكشوف الحسابات تعمل.
--   - الأنواع الأخرى تُخزَّن في counterparty_account_id (الحساب المحاسبي
--     المربوطة به الطرف من العلاقات المعتمدة: gl_account_id للصناديق/البنوك،
--     حساب تفصيلي من دليل الحسابات للـ«حساب عام»).
--
-- ملاحظة تطبيقية: هذا الترحيل مُختبَر على قاعدة معزولة فقط. تطبيقه على قاعدة
-- التشغيل يحتاج موافقة المستخدم (انظر REPORT_RECEIPT_PAYMENT_ACCOUNT_SELECTOR.md).

ALTER TABLE sales.receipts
  ADD COLUMN IF NOT EXISTS counterparty_type VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER'
    CHECK (counterparty_type IN ('CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'GENERAL', 'CASH', 'BANK'));

ALTER TABLE sales.receipts
  ADD COLUMN IF NOT EXISTS counterparty_account_id UUID REFERENCES accounting.accounts(id);

-- سندات القبض على مستلزمات أخرى غير العميل (مورد/موظف إذا توفّر سجله/حساب عام/صندوق/بنك)
ALTER TABLE sales.receipts
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE purchasing.payments
  ADD COLUMN IF NOT EXISTS counterparty_type VARCHAR(20) NOT NULL DEFAULT 'SUPPLIER'
    CHECK (counterparty_type IN ('CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'GENERAL', 'CASH', 'BANK'));

ALTER TABLE purchasing.payments
  ADD COLUMN IF NOT EXISTS counterparty_account_id UUID REFERENCES accounting.accounts(id);

-- سندات الصرف لأطراف غير المورد (عميل = مردود نقدية/موظف إذا توفّر سجله/حساب عام/صندوق/بنك)
ALTER TABLE purchasing.payments
  ALTER COLUMN supplier_id DROP NOT NULL;

COMMENT ON COLUMN sales.receipts.counterparty_type IS
  'نوع الطرف المقابل لسند القبض: CUSTOMER/SUPPLIER/EMPLOYEE/GENERAL/CASH/BANK. الافتراضي CUSTOMER للسندات السابقة.';
COMMENT ON COLUMN sales.receipts.counterparty_account_id IS
  'الحساب المحاسبي المقابل (يُملأ للأنواع غير عميل/مورد: حساب عام، أو حساب GL مربوط بصندوق/بنك).';
COMMENT ON COLUMN purchasing.payments.counterparty_type IS
  'نوع الطرف المقابل لسند الصرف: CUSTOMER/SUPPLIER/EMPLOYEE/GENERAL/CASH/BANK. الافتراضي SUPPLIER للسندات السابقة.';
COMMENT ON COLUMN purchasing.payments.counterparty_account_id IS
  'الحساب المحاسبي المقابل (يُملأ للأنواع غير عميل/مورد).';
