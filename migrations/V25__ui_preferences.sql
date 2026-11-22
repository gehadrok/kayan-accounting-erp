-- V25__ui_preferences.sql — Phase 10.5.1: System & UI Preferences
--
-- The System & UI screen had 12 controls that saved NOTHING because no key
-- existed for them (SettingsService.setSetting refuses unknown keys). This
-- migration seeds exactly ONE key per control that has a real consumer wired
-- in the client/server (theme, density, date/number formats in reports,
-- currency position, post-confirmation, F9 debounce, save notifications).
--
-- Keys deliberately NOT created here (no consumer exists, so a key would be a
-- fake setting): ui.session_lock_minutes, ui.notify_low_stock,
-- ui.notify_credit_limit, ui.confirm_before_delete_draft (the app has no
-- draft-delete flow at all).

DO $$
DECLARE
  v_comp_id UUID;
BEGIN
  SELECT id INTO v_comp_id FROM core.companies LIMIT 1;

  INSERT INTO core.settings (company_id, key, value, default_value, value_type, module, description, is_system, is_editable, scope)
  VALUES
    -- Appearance (applied to <html class="dark"> via SettingsContext)
    (v_comp_id, 'ui.theme', to_jsonb('light'::text), to_jsonb('light'::text), 'STRING', 'UI',
     'مظهر الواجهة العام: light / dark / system', FALSE, TRUE, 'USER'),
    -- Table density (applied to <html class="compact"> via SettingsContext)
    (v_comp_id, 'ui.density', to_jsonb('comfortable'::text), to_jsonb('comfortable'::text), 'STRING', 'UI',
     'كثافة عرض الجداول: comfortable / compact', FALSE, TRUE, 'USER'),
    -- Report formatting (read by reportRegistry helpers → center + print)
    (v_comp_id, 'ui.date_format', to_jsonb('YYYY-MM-DD'::text), to_jsonb('YYYY-MM-DD'::text), 'STRING', 'UI',
     'تنسيق التاريخ المعروض في التقارير: YYYY-MM-DD / DD/MM/YYYY', FALSE, TRUE, 'USER'),
    (v_comp_id, 'ui.thousands_separator', to_jsonb('comma'::text), to_jsonb('comma'::text), 'STRING', 'UI',
     'فاصل الآلاف في التقارير: comma (1,000) / space (1 000)', FALSE, TRUE, 'USER'),
    (v_comp_id, 'ui.decimal_separator', to_jsonb('dot'::text), to_jsonb('dot'::text), 'STRING', 'UI',
     'الفاصل العشري في التقارير: dot (0.00) / comma (0,00)', FALSE, TRUE, 'USER'),
    (v_comp_id, 'reports.currency_position', to_jsonb('after'::text), to_jsonb('after'::text), 'STRING', 'REPORTS',
     'موضع رمز العملة في الكشوفات: after / before', FALSE, TRUE, 'COMPANY'),
    -- Document workflow
    (v_comp_id, 'ui.confirm_before_post', to_jsonb(true), to_jsonb(true), 'BOOLEAN', 'UI',
     'عرض نافذة تأكيد قبل ترحيل القيود وفواتير المبيعات والمشتريات', FALSE, TRUE, 'USER'),
    -- F9 lookup engine
    (v_comp_id, 'ui.lookup_debounce_ms', to_jsonb(200), to_jsonb(200), 'INTEGER', 'UI',
     'زمن تأخير البحث الفوري F9 بالميلي ثانية', FALSE, TRUE, 'USER'),
    -- Notifications that DO exist (banners inside the settings hub)
    (v_comp_id, 'ui.notify_save_success', to_jsonb(true), to_jsonb(true), 'BOOLEAN', 'UI',
     'إظهار إشعار نجاح الحفظ بعد تحديث أي إعداد', FALSE, TRUE, 'USER')
  ON CONFLICT (company_id, key) DO NOTHING;
END $$;
