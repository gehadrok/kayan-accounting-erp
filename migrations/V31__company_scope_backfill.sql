-- V31__company_scope_backfill.sql
--
-- PHASE RLS-1 — إصلاح نطاق الشركة المفقود لمستخدمي الفروع.
--
-- المشكلة قبل هذا الترحيل:
--   V26 فرض أماناً على مستوى الصفوف (FORCE ROW LEVEL SECURITY) على جداول
--   core/accounting/sales/... وربط قراءة الصفوف الجماعية بالشركة بدلالة
--   security.user_can_access_company()، وهي تفحص جدول user_company_scopes
--   فقط. لكن محرر «نطاق الوصول» في شاشة المستخدمين يحفظ قائمتي «الشركات»
--   و«الفروع» كقائمتين مستقلتين تماماً، فلا شيء يمنع حفظ فرع بدون شركته.
--
--   النتيجة: مستخدم مُسند لفرع فقط يملك صفاً في user_branch_scopes وبصفر صفوف
--   في user_company_scopes. الحارس يقبل الطلب ويضبط kayan.company_id من
--   معرف الفرع، لكن دالة السياسة تُرجع FALSE لكل صف جماعي:
--     - GET /api/accounts            → []      (دليل الحسابات يظهر فارغاً)
--     - GET /api/company/profile     → 500     «لا توجد بيانات شركة في النظام»
--     - العملاء/الموردون/الفترات المالية → []
--   مع بقاء الجلسة تسجّل دخولاً ناجحاً وتُعيد 200، فتبدو البيانات «مفقودة»
--   لا «محجوبة».
--
-- الإصلاح هنا: كل شركة تملك فرعاً مُسندَّ لهذا المستخدم تُضاف إلى نطاق شركته.
-- الفرع يقع داخل شركته، فلا معنى لقراءة بيانات فرع دون قراءة الشركة التي
-- ينتمي إليها. الترحيلIdempotent (ON CONFLICT DO NOTHING) ويعاد تنفيذه بأمان.
--
-- يرافقه تعديل في src/server/routes.ts يضيف شركة الفروع تلقائياً عند الحفظ،
-- حتى لا تتسرب حالة جديدة بعد هذا الترحيل.

INSERT INTO security.user_company_scopes (user_id, company_id, granted_by)
SELECT DISTINCT ubs.user_id, ubs.company_id, ubs.granted_by
FROM security.user_branch_scopes ubs
WHERE NOT EXISTS (
  SELECT 1
  FROM security.user_company_scopes ucs
  WHERE ucs.user_id = ubs.user_id
    AND ucs.company_id = ubs.company_id
)
ON CONFLICT (user_id, company_id) DO NOTHING;
