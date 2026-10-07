import { getDb } from './db.ts';
import { logAudit } from './auditService.ts';

export type SettingType = 
  | 'STRING' 
  | 'INTEGER' 
  | 'DECIMAL' 
  | 'BOOLEAN' 
  | 'DATE' 
  | 'JSON' 
  | 'ACCOUNT_ID' 
  | 'CURRENCY_ID' 
  | 'BRANCH_ID';

export type SettingModule = 
  | 'CORE' 
  | 'ACCOUNTING' 
  | 'SALES' 
  | 'PURCHASING' 
  | 'INVENTORY' 
  | 'CASH' 
  | 'BANKING' 
  | 'ASSETS' 
  | 'EXPENSES' 
  | 'TAX' 
  | 'REPORTS' 
  | 'UI';

export interface SettingDefinition {
  id: string;
  companyId: string;
  key: string;
  value: any;
  defaultValue: any;
  valueType: SettingType;
  module: SettingModule;
  description: string;
  isSystem: boolean;
  isEditable: boolean;
  scope: 'SYSTEM' | 'COMPANY' | 'BRANCH' | 'USER';
  branchId?: string;
  userId?: string;
  updatedBy?: string;
  updatedAt: string;
}

// In-Memory Configuration Cache for high performance (Runtime resolution)
const settingsCache = new Map<string, { value: any; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute TTL with proactive invalidation on updates

export class SettingsService {
  /**
   * Clear or invalidate in-memory cache
   */
  static clearCache(key?: string) {
    if (key) {
      settingsCache.delete(key);
      // Delete any hierarchical keys starting with the key
      for (const k of settingsCache.keys()) {
        if (k.startsWith(key)) settingsCache.delete(k);
      }
    } else {
      settingsCache.clear();
    }
  }

  /**
   * Get typed setting value with hierarchical resolution (User -> Branch -> Company -> System Default)
   */
  static async getSetting<T = any>(
    key: string,
    options?: { companyId?: string; branchId?: string; userId?: string; bypassCache?: boolean }
  ): Promise<T> {
    const cacheKey = `${key}:${options?.companyId || 'default'}:${options?.branchId || ''}:${options?.userId || ''}`;

    if (!options?.bypassCache) {
      const cached = settingsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.value as T;
      }
    }

    const db = await getDb();
    let compId = options?.companyId;
    if (!compId) {
      const compRes = await db.query<any>('SELECT id FROM core.companies LIMIT 1');
      compId = compRes.rows[0]?.id;
    }

    // 1. If user ID provided and setting has USER scope
    if (options?.userId) {
      const userRes = await db.query<any>(
        'SELECT value, value_type FROM core.settings WHERE key = $1 AND user_id = $2 LIMIT 1',
        [key, options.userId]
      );
      if (userRes.rows.length > 0) {
        const val = this.castSettingValue(userRes.rows[0].value, userRes.rows[0].value_type);
        settingsCache.set(cacheKey, { value: val, timestamp: Date.now() });
        return val as T;
      }
    }

    // 2. If branch ID provided and setting has BRANCH scope
    if (options?.branchId) {
      const branchRes = await db.query<any>(
        'SELECT value, value_type FROM core.settings WHERE key = $1 AND branch_id = $2 LIMIT 1',
        [key, options.branchId]
      );
      if (branchRes.rows.length > 0) {
        const val = this.castSettingValue(branchRes.rows[0].value, branchRes.rows[0].value_type);
        settingsCache.set(cacheKey, { value: val, timestamp: Date.now() });
        return val as T;
      }
    }

    // 3. Company-level setting
    const compRes = await db.query<any>(
      'SELECT value, default_value, value_type FROM core.settings WHERE key = $1 AND company_id = $2 LIMIT 1',
      [key, compId]
    );

    if (compRes.rows.length > 0) {
      const row = compRes.rows[0];
      const rawVal = row.value !== null && row.value !== undefined ? row.value : row.default_value;
      const val = this.castSettingValue(rawVal, row.value_type);
      settingsCache.set(cacheKey, { value: val, timestamp: Date.now() });
      return val as T;
    }

    // 4. Fallback search by key without company filter
    const fallbackRes = await db.query<any>(
      'SELECT value, default_value, value_type FROM core.settings WHERE key = $1 LIMIT 1',
      [key]
    );

    if (fallbackRes.rows.length > 0) {
      const row = fallbackRes.rows[0];
      const rawVal = row.value !== null && row.value !== undefined ? row.value : row.default_value;
      const val = this.castSettingValue(rawVal, row.value_type);
      settingsCache.set(cacheKey, { value: val, timestamp: Date.now() });
      return val as T;
    }

    return undefined as unknown as T;
  }

  /**
   * Resolve an Account ID dynamically from Settings, with fallback to default code lookup
   */
  static async getAccountMapping(
    key: string,
    defaultFallbackCode: string,
    companyId?: string
  ): Promise<string> {
    const db = await getDb();
    try {
      const settingVal = await this.getSetting<string>(key, { companyId });
      if (settingVal && typeof settingVal === 'string' && settingVal.length > 10) {
        // Verify account exists in database
        const check = await db.query<any>('SELECT id FROM accounting.accounts WHERE id = $1 LIMIT 1', [settingVal]);
        if (check.rows.length > 0) {
          return check.rows[0].id;
        }
      }
    } catch {
      // Fallback
    }

    // Default code fallback
    const res = await db.query<any>('SELECT id FROM accounting.accounts WHERE code = $1 LIMIT 1', [defaultFallbackCode]);
    if (res.rows.length > 0) {
      return res.rows[0].id;
    }
    throw new Error(`تعذر العثور على الحساب المالي المرتبط بالإعداد (${key}) أو الكود الافتراضي (${defaultFallbackCode})`);
  }

  /**
   * Set or update setting with strict dependency validation and audit tracking
   */
  static async setSetting(
    key: string,
    value: any,
    options?: {
      companyId?: string;
      userId?: string;
      username?: string;
      reason?: string;
      branchId?: string;
    }
  ) {
    const db = await getDb();
    let compId = options?.companyId;
    if (!compId) {
      const compRes = await db.query<any>('SELECT id FROM core.companies LIMIT 1');
      compId = compRes.rows[0]?.id;
    }

    // Find existing setting definition
    const existRes = await db.query<any>(
      'SELECT * FROM core.settings WHERE key = $1 AND company_id = $2 LIMIT 1',
      [key, compId]
    );

    let settingDef = existRes.rows[0];
    if (!settingDef) {
      // Check if setting exists in another company or general schema
      const anyRes = await db.query<any>('SELECT * FROM core.settings WHERE key = $1 LIMIT 1', [key]);
      settingDef = anyRes.rows[0];
    }

    if (!settingDef) {
      throw new Error(`الإعداد المطلوب غير موجود في النظام: ${key}`);
    }

    if (settingDef.is_editable === false) {
      throw new Error(`هذا الإعداد (${key}) محمي بواسطة النظام ولا يمكن تعديله يدوياً`);
    }

    // 1. Validate setting value according to type and dependency constraints
    await this.validateSetting(key, value, settingDef.value_type);

    const oldValue = settingDef.value;
    const formattedValue = JSON.stringify(value);

    // 2. Update database
    await db.query(
      `UPDATE core.settings 
       SET value = $1::jsonb, updated_at = NOW(), updated_by = $2 
       WHERE key = $3 AND company_id = $4`,
      [formattedValue, options?.userId || null, key, compId]
    );

    // 3. Record in core.settings_audit
    await db.query(
      `INSERT INTO core.settings_audit (setting_key, old_value, new_value, user_id, username, reason)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6)`,
      [
        key,
        JSON.stringify(oldValue),
        formattedValue,
        options?.userId || null,
        options?.username || 'SYSTEM_ADMIN',
        options?.reason || 'تحديث عبر مركز الإعدادات المركزي',
      ]
    );

    // 4. Log to global audit trail
    await logAudit({
      userId: options?.userId,
      username: options?.username,
      action: 'UPDATE_SETTING',
      entityType: 'CENTRAL_SETTINGS',
      entityId: key,
      oldData: { key, value: oldValue },
      newData: { key, value },
    });

    // 5. Invalidate runtime configuration cache
    this.clearCache(key);

    return {
      success: true,
      key,
      oldValue,
      newValue: value,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate setting value based on type and business dependencies
   */
  static async validateSetting(key: string, value: any, valueType?: SettingType) {
    const db = await getDb();

    if (!valueType) {
      const defRes = await db.query<any>('SELECT value_type FROM core.settings WHERE key = $1 LIMIT 1', [key]);
      valueType = defRes.rows[0]?.value_type || 'STRING';
    }

    if (value === null || value === undefined) {
      throw new Error(`قيمة الإعداد (${key}) لا يمكن أن تكون فارغة`);
    }

    switch (valueType) {
      case 'BOOLEAN':
        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
          throw new Error(`القيمة المحددة للإعداد ${key} يجب أن تكون منطقية (true/false)`);
        }
        break;

      case 'INTEGER':
        const intVal = parseInt(value, 10);
        if (isNaN(intVal)) {
          throw new Error(`القيمة المحددة للإعداد ${key} يجب أن تكون رقماً صحيحاً`);
        }
        break;

      case 'DECIMAL':
        const decVal = parseFloat(value);
        if (isNaN(decVal)) {
          throw new Error(`القيمة المحددة للإعداد ${key} يجب أن تكون قيمة رقمية صحيحة`);
        }
        break;

      case 'ACCOUNT_ID':
        // Check account existence and active status in chart of accounts
        const accRes = await db.query<any>(
          'SELECT id, code, name, is_active, is_group, account_type_id FROM accounting.accounts WHERE id = $1',
          [value]
        );
        if (accRes.rows.length === 0) {
          throw new Error(`الحساب المالي المحدد غير موجود في شجرة الحسابات (معرف: ${value})`);
        }
        const acc = accRes.rows[0];
        if (!acc.is_active) {
          throw new Error(`الحساب المالي المحدد (${acc.code} - ${acc.name}) موقوف وغير نشط`);
        }
        if (acc.is_group) {
          throw new Error(`لا يمكن ربط إعداد بحساب رئيسي/تجميعي (${acc.code} - ${acc.name}). يجب اختيار حساب فرعي تحليلي.`);
        }

        // Domain-specific account type sanity checks
        if (key.includes('cogs') && !acc.code.startsWith('5')) {
          throw new Error(`حساب تكلفة المبيعات (COGS) يجب أن يكون ضمن حسابات المصروفات والتكاليف (المجموعة 5)`);
        }
        if (key.includes('inventory') && !acc.code.startsWith('1')) {
          throw new Error(`حساب مراقبة المخزون يجب أن يكون ضمن حسابات الأصول المتداولة (المجموعة 1)`);
        }
        if (key.includes('revenue') && !acc.code.startsWith('4')) {
          throw new Error(`حساب إيرادات المبيعات يجب أن يكون ضمن حسابات الإيرادات (المجموعة 4)`);
        }
        if (key.includes('ar_account') && !acc.code.startsWith('11')) {
          throw new Error(`حساب مراقبة ذمم العملاء يجب أن يكون ضمن الأصول المتداولة (1103)`);
        }
        if (key.includes('ap_account') && !acc.code.startsWith('21')) {
          throw new Error(`�?�?�?�?�?�? �?�?�?�?�?�?�?�?�? �?�?�? ��? �?�?�?�? �?�?�?�?�?�?�?�?�? �?�?�?�?�?�?�?�?�?�?�? (2101)`);
        }

        // Banking default account must be a GL account actually linked to a bank account
        if (key === 'banking.default_bank_account') {
          const bankRes = await db.query<any>(
            'SELECT id FROM banking.bank_accounts WHERE gl_account_id = $1 AND is_active = true LIMIT 1',
            [value]
          );
          if (bankRes.rows.length === 0) {
            throw new Error(`الحساب المختار ليس مرتبطاً بحساب بنكي فعال في وحدة البنوك (Banking).`);
          }
        }
        if (key === 'cash.default_cash_account') {
          const cashRes = await db.query<any>(
            'SELECT id FROM banking.cash_accounts WHERE gl_account_id = $1 AND is_active = true LIMIT 1',
            [value]
          );
          if (cashRes.rows.length === 0) {
            throw new Error(`الحساب المختار ليس مرتبطاً بحساب نقدي (صندوق) فعال في وحدة النقدية (Cash).`);
          }
        }
        break;

      case 'CURRENCY_ID':
        const currRes = await db.query<any>('SELECT id FROM core.currencies WHERE id = $1', [value]);
        if (currRes.rows.length === 0) {
          throw new Error(`العملة المحددة غير معرفة في النظام`);
        }
        break;

      case 'BRANCH_ID':
        const branchRes = await db.query<any>('SELECT id FROM core.branches WHERE id = $1', [value]);
        if (branchRes.rows.length === 0) {
          throw new Error(`الفرع المحدد غير معرف في النظام`);
        }
        break;
    }

    return true;
  }

  /**
   * Reset setting to default value
   */
  static async resetSetting(key: string, companyId?: string, userId?: string) {
    const db = await getDb();
    let compId = companyId;
    if (!compId) {
      const compRes = await db.query<any>('SELECT id FROM core.companies LIMIT 1');
      compId = compRes.rows[0]?.id;
    }

    const defRes = await db.query<any>(
      'SELECT default_value, value FROM core.settings WHERE key = $1 AND company_id = $2 LIMIT 1',
      [key, compId]
    );

    if (defRes.rows.length > 0) {
      const defaultValue = defRes.rows[0].default_value;
      await this.setSetting(key, defaultValue, {
        companyId: compId,
        userId,
        reason: 'استعادة القيمة الافتراضية للإعداد',
      });
    }
  }

  /**
   * Get all settings grouped by module with metadata
   */
  static async getAllSettings(companyId?: string) {
    const db = await getDb();
    let compId = companyId;
    if (!compId) {
      const compRes = await db.query<any>('SELECT id FROM core.companies LIMIT 1');
      compId = compRes.rows[0]?.id;
    }

    const res = await db.query<any>(`
      SELECT 
        s.id,
        s.company_id as "companyId",
        s.key,
        s.value,
        s.default_value as "defaultValue",
        s.value_type as "valueType",
        s.module,
        s.description,
        s.is_system as "isSystem",
        s.is_editable as "isEditable",
        s.scope,
        s.updated_at as "updatedAt",
        a.code as "accountCode",
        a.name as "accountName"
      FROM core.settings s
      LEFT JOIN accounting.accounts a ON a.id::text = (s.value #>> '{}')
      WHERE s.company_id = $1 OR s.company_id IS NULL
      ORDER BY s.module ASC, s.key ASC
    `, [compId]);

    // Group by module
    const grouped: Record<string, any[]> = {};
    for (const row of res.rows) {
      const mod = row.module || 'CORE';
      if (!grouped[mod]) grouped[mod] = [];
      grouped[mod].push({
        ...row,
        value: this.castSettingValue(row.value, row.valueType),
        defaultValue: this.castSettingValue(row.defaultValue, row.valueType),
      });
    }

    return grouped;
  }

  /**
   * Get settings for a specific module
   */
  static async getModuleSettings(module: string, companyId?: string) {
    const db = await getDb();
    let compId = companyId;
    if (!compId) {
      const compRes = await db.query<any>('SELECT id FROM core.companies LIMIT 1');
      compId = compRes.rows[0]?.id;
    }

    const res = await db.query<any>(`
      SELECT 
        s.*,
        a.code as "accountCode",
        a.name as "accountName"
      FROM core.settings s
      LEFT JOIN accounting.accounts a ON a.id::text = (s.value #>> '{}')
      WHERE s.module = $1 AND (s.company_id = $2 OR s.company_id IS NULL)
      ORDER BY s.key ASC
    `, [module.toUpperCase(), compId]);

    return res.rows.map(row => ({
      ...row,
      value: this.castSettingValue(row.value, row.value_type),
      defaultValue: this.castSettingValue(row.default_value, row.value_type),
    }));
  }

  /**
   * System Configuration Health Check & Missing Settings Detector
   */
  static async getSystemConfigurationHealth(companyId?: string) {
    const db = await getDb();
    let compId = companyId;
    if (!compId) {
      const compRes = await db.query<any>('SELECT id FROM core.companies LIMIT 1');
      compId = compRes.rows[0]?.id;
    }

    // Required Core Keys for System Health
    const requiredSettings = [
      { key: 'accounting.default_cash_account', module: 'ACCOUNTING', label: 'حساب الصندوق الرئيسي (1101)' },
      { key: 'accounting.default_bank_account', module: 'ACCOUNTING', label: 'حساب البنك الرئيسي (1102)' },
      { key: 'sales.default_revenue_account', module: 'SALES', label: 'حساب إيرادات المبيعات (41)' },
      { key: 'sales.default_ar_account', module: 'SALES', label: 'حساب مراقبة العملاء (1103)' },
      { key: 'purchasing.default_ap_account', module: 'PURCHASING', label: 'حساب مراقبة الموردين (2101)' },
      { key: 'inventory.default_inventory_account', module: 'INVENTORY', label: 'حساب المخزون (1104)' },
      { key: 'inventory.default_cogs_account', module: 'INVENTORY', label: 'حساب تكلفة المبيعات COGS (5001)' },
      { key: 'inventory.valuation_method', module: 'INVENTORY', label: 'طريقة تقييم المخزون (WAC)' },
      { key: 'assets.default_fixed_asset_account', module: 'ASSETS', label: 'حساب الأصول الثابتة (1201)' },
      { key: 'assets.default_accumulated_depreciation_account', module: 'ASSETS', label: 'حساب مجمع الإهلاك (1290)' },
    ];

    const currentSettingsRes = await db.query<any>(
      'SELECT key, value, value_type, module FROM core.settings WHERE company_id = $1',
      [compId]
    );

    const currentSettingsMap = new Map<string, any>();
    for (const r of currentSettingsRes.rows) {
      currentSettingsMap.set(r.key, this.castSettingValue(r.value, r.value_type));
    }

    const missingSettings: Array<{ key: string; module: string; label: string; reason: string }> = [];
    const healthChecks: Array<{ module: string; label: string; status: 'VALID' | 'WARNING' | 'ERROR'; message: string }> = [];

    for (const req of requiredSettings) {
      const val = currentSettingsMap.get(req.key);
      if (val === undefined || val === null || val === '') {
        missingSettings.push({
          key: req.key,
          module: req.module,
          label: req.label,
          reason: 'الإعداد غير معرف أو قيمته فارغة',
        });
        healthChecks.push({
          module: req.module,
          label: req.label,
          status: 'ERROR',
          message: 'إعداد مفقود أو غير مكتمل',
        });
      } else {
        // If it's an account ID, verify the account exists in DB
        if (req.key.includes('account')) {
          const accCheck = await db.query<any>('SELECT code, name, is_active FROM accounting.accounts WHERE id = $1', [val]);
          if (accCheck.rows.length === 0) {
            missingSettings.push({
              key: req.key,
              module: req.module,
              label: req.label,
              reason: 'الحساب المالي المرتبط غير موجود في الدليل',
            });
            healthChecks.push({
              module: req.module,
              label: req.label,
              status: 'ERROR',
              message: 'الحساب المحدد محذوف أو غير موجود',
            });
          } else if (!accCheck.rows[0].is_active) {
            healthChecks.push({
              module: req.module,
              label: req.label,
              status: 'WARNING',
              message: 'الحساب المحدد موقوف عن الحركة',
            });
          } else {
            healthChecks.push({
              module: req.module,
              label: req.label,
              status: 'VALID',
              message: `الحساب سليم (${accCheck.rows[0].code} - ${accCheck.rows[0].name})`,
            });
          }
        } else {
          healthChecks.push({
            module: req.module,
            label: req.label,
            status: 'VALID',
            message: `مضبوط على: ${val}`,
          });
        }
      }
    }

    // Fiscal Period check
    const openPeriodRes = await db.query<any>("SELECT COUNT(*) as count FROM accounting.fiscal_periods WHERE status = 'OPEN'");
    const openPeriodCount = parseInt(openPeriodRes.rows[0]?.count || '0', 10);
    if (openPeriodCount === 0) {
      healthChecks.push({
        module: 'ACCOUNTING',
        label: 'الفترات المالية المفتوحة',
        status: 'WARNING',
        message: 'لا توجد فترات مالية مفتوحة حالياً، ترحيل القيود متوقف',
      });
    } else {
      healthChecks.push({
        module: 'ACCOUNTING',
        label: 'الفترات المالية المفتوحة',
        status: 'VALID',
        message: `يوجد ${openPeriodCount} فترة مالية مفتوحة للترحيل`,
      });
    }

    const totalSettingsCount = currentSettingsRes.rows.length;
    const isHealthy = missingSettings.length === 0;

    return {
      status: isHealthy ? 'HEALTHY' : 'NEEDS_ATTENTION',
      totalActiveSettings: totalSettingsCount,
      missingSettingsCount: missingSettings.length,
      missingSettings,
      healthChecks,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Helper to cast raw JSONB value to native JS typed value
   */
  private static castSettingValue(raw: any, type: SettingType): any {
    if (raw === null || raw === undefined) return raw;

    switch (type) {
      case 'BOOLEAN':
        return raw === true || raw === 'true';
      case 'INTEGER':
        return typeof raw === 'number' ? Math.round(raw) : parseInt(raw, 10);
      case 'DECIMAL':
        return typeof raw === 'number' ? raw : parseFloat(raw);
      case 'STRING':
      case 'ACCOUNT_ID':
      case 'CURRENCY_ID':
      case 'BRANCH_ID':
      case 'DATE':
        return typeof raw === 'string' ? raw : String(raw);
      case 'JSON':
      default:
        return raw;
    }
  }
}
