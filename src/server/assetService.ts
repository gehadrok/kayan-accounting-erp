import { getDb } from './db.ts';
import { logAudit } from './auditService.ts';
import { AccountingService } from './accountingService.ts';

export interface CreateAssetCategoryDto {
  code: string;
  name: string;
  usefulLifeMonths: number;
  depreciationMethod?: 'STRAIGHT_LINE' | 'NONE';
  assetAccountId?: string;
  accumulatedDepreciationAccountId?: string;
  depreciationExpenseAccountId?: string;
  disposalGainAccountId?: string;
  disposalLossAccountId?: string;
  companyId?: string;
  userId?: string;
}

export interface CreateAssetDto {
  assetCode: string;
  assetName: string;
  categoryId: string;
  branchId?: string;
  costCenterId?: string;
  acquisitionDate: string;
  capitalizationDate?: string;
  acquisitionCost: number;
  salvageValue?: number;
  usefulLifeMonths?: number;
  depreciationMethod?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'UNDER_CONSTRUCTION';
  serialNumber?: string;
  location?: string;
  supplierId?: string;
  paymentMethod?: 'CASH' | 'BANK' | 'AP';
  cashAccountId?: string;
  bankAccountId?: string;
  notes?: string;
  companyId?: string;
  userId?: string;
}

export interface TransferAssetDto {
  assetId: string;
  transferDate: string;
  toBranchId?: string;
  toCostCenterId?: string;
  toLocation?: string;
  reason: string;
  userId?: string;
}

export interface AssetMaintenanceDto {
  assetId: string;
  maintenanceDate: string;
  maintenanceType: 'EXPENSE' | 'CAPITAL_IMPROVEMENT';
  vendorName?: string;
  supplierId?: string;
  description: string;
  cost: number;
  paymentMethod: 'CASH' | 'BANK' | 'AP';
  cashAccountId?: string;
  bankAccountId?: string;
  userId?: string;
}

export interface DisposeAssetDto {
  assetId: string;
  disposalDate: string;
  disposalType: 'SALE' | 'SCRAP' | 'RETIREMENT' | 'LOSS';
  proceeds: number;
  paymentMethod?: 'CASH' | 'BANK' | 'RECEIVABLE' | 'NONE';
  cashAccountId?: string;
  bankAccountId?: string;
  notes?: string;
  userId?: string;
}

export class AssetService {
  private static async getDefaults(companyId?: string, branchId?: string) {
    const db = await getDb();
    let compId = companyId;
    if (!compId) {
      const cRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      compId = cRes.rows[0]?.id;
    }
    let brId = branchId;
    if (!brId) {
      const bRes = await db.query<{ id: string }>('SELECT id FROM core.branches LIMIT 1');
      brId = bRes.rows[0]?.id;
    }
    return { companyId: compId, branchId: brId };
  }

  // ==========================================
  // 1. Asset Categories (فئات وتصنيفات الأصول)
  // ==========================================

  static async getCategories() {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        c.*,
        aa.name as "assetAccountName",
        aa.code as "assetAccountCode",
        ada.name as "accumulatedDepreciationAccountName",
        ada.code as "accumulatedDepreciationAccountCode",
        dea.name as "depreciationExpenseAccountName",
        dea.code as "depreciationExpenseAccountCode",
        (SELECT COUNT(*) FROM assets.fixed_assets fa WHERE fa.category_id = c.id) as "assetsCount"
      FROM assets.asset_categories c
      LEFT JOIN accounting.accounts aa ON aa.id = c.asset_account_id
      LEFT JOIN accounting.accounts ada ON ada.id = c.accumulated_depreciation_account_id
      LEFT JOIN accounting.accounts dea ON dea.id = c.depreciation_expense_account_id
      ORDER BY c.code ASC
    `);
    return res.rows.map((r: any) => ({
      ...r,
      assetsCount: parseInt(r.assetsCount || '0', 10),
    }));
  }

  static async createCategory(dto: CreateAssetCategoryDto) {
    const db = await getDb();
    const { companyId } = await this.getDefaults(dto.companyId);

    const dup = await db.query<any>(
      'SELECT id FROM assets.asset_categories WHERE company_id = $1 AND code = $2 LIMIT 1',
      [companyId, dto.code]
    );
    if (dup.rows.length > 0) {
      throw new Error(`كود فئة الأصول (${dto.code}) مسجل مسبقاً`);
    }

    // Default accounts if not explicitly passed
    let assetAcc = dto.assetAccountId;
    let accDeprAcc = dto.accumulatedDepreciationAccountId;
    let deprExpAcc = dto.depreciationExpenseAccountId;
    let gainAcc = dto.disposalGainAccountId;
    let lossAcc = dto.disposalLossAccountId;

    if (!assetAcc) {
      const r = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1203' LIMIT 1");
      assetAcc = r.rows[0]?.id;
    }
    if (!accDeprAcc) {
      const r = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1290' LIMIT 1");
      accDeprAcc = r.rows[0]?.id;
    }
    if (!deprExpAcc) {
      const r = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '5301' LIMIT 1");
      deprExpAcc = r.rows[0]?.id;
    }
    if (!gainAcc) {
      const r = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '4103' LIMIT 1");
      gainAcc = r.rows[0]?.id;
    }
    if (!lossAcc) {
      const r = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '5309' LIMIT 1");
      lossAcc = r.rows[0]?.id;
    }

    const res = await db.query<any>(`
      INSERT INTO assets.asset_categories 
      (company_id, code, name, useful_life_months, depreciation_method, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, disposal_gain_account_id, disposal_loss_account_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      companyId,
      dto.code,
      dto.name,
      dto.usefulLifeMonths,
      dto.depreciationMethod || 'STRAIGHT_LINE',
      assetAcc,
      accDeprAcc,
      deprExpAcc,
      gainAcc,
      lossAcc,
    ]);

    const created = res.rows[0];

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'ASSET_CATEGORY',
      entityId: created.id,
      newData: created,
    });

    return created;
  }

  // ==========================================
  // 2. Fixed Assets Master (سجل الأصول والرسملة)
  // ==========================================

  static async getAssets(filters: {
    status?: string;
    categoryId?: string;
    branchId?: string;
    search?: string;
    limit?: number;
  } = {}) {
    const db = await getDb();
    let query = `
      SELECT 
        fa.*,
        cat.name as "categoryName",
        cat.code as "categoryCode",
        cat.depreciation_method as "categoryMethod",
        br.name as "branchName",
        cc.name as "costCenterName",
        cc.code as "costCenterCode",
        aa.name as "assetAccountName",
        aa.code as "assetAccountCode",
        ada.name as "accumulatedDepreciationAccountName",
        ada.code as "accumulatedDepreciationAccountCode",
        dea.name as "depreciationExpenseAccountName",
        dea.code as "depreciationExpenseAccountCode",
        COALESCE(
          (SELECT SUM(de.depreciation_amount) 
           FROM assets.depreciation_entries de 
           WHERE de.asset_id = fa.id AND de.is_posted = TRUE), 0.0000
        ) as "accumulatedDepreciation",
        (SELECT COUNT(*) FROM assets.depreciation_entries de WHERE de.asset_id = fa.id AND de.is_posted = TRUE) as "postedPeriodsCount"
      FROM assets.fixed_assets fa
      JOIN assets.asset_categories cat ON cat.id = fa.category_id
      LEFT JOIN core.branches br ON br.id = fa.branch_id
      LEFT JOIN accounting.cost_centers cc ON cc.id = fa.cost_center_id
      LEFT JOIN accounting.accounts aa ON aa.id = fa.asset_account_id
      LEFT JOIN accounting.accounts ada ON ada.id = fa.accumulated_depreciation_account_id
      LEFT JOIN accounting.accounts dea ON dea.id = fa.depreciation_expense_account_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (filters.status) {
      query += ` AND fa.status = $${pIdx++}`;
      params.push(filters.status);
    }
    if (filters.categoryId) {
      query += ` AND fa.category_id = $${pIdx++}`;
      params.push(filters.categoryId);
    }
    if (filters.branchId) {
      query += ` AND fa.branch_id = $${pIdx++}`;
      params.push(filters.branchId);
    }
    if (filters.search) {
      query += ` AND (fa.asset_name ILIKE $${pIdx} OR fa.asset_code ILIKE $${pIdx} OR fa.serial_number ILIKE $${pIdx})`;
      params.push(`%${filters.search}%`);
      pIdx++;
    }

    query += ` ORDER BY fa.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${pIdx++}`;
      params.push(filters.limit);
    }

    const res = await db.query<any>(query, params);
    return res.rows.map((row: any) => {
      const cost = parseFloat(row.acquisition_cost || '0');
      const accDepr = parseFloat(row.accumulatedDepreciation || '0');
      const nbv = Math.max(0, cost - accDepr);
      return {
        ...row,
        acquisition_cost: cost,
        salvage_value: parseFloat(row.salvage_value || '0'),
        accumulatedDepreciation: accDepr,
        netBookValue: nbv,
        postedPeriodsCount: parseInt(row.postedPeriodsCount || '0', 10),
      };
    });
  }

  static async getAssetById(id: string) {
    const db = await getDb();
    const assets = await this.getAssets();
    const asset = assets.find(a => a.id === id);

    if (!asset) {
      throw new Error(`الأصل الثابت برقم ${id} غير موجود`);
    }

    // Schedule & posted entries
    const scheduleRes = await db.query<any>(`
      SELECT 
        de.*,
        fp.name as "periodName",
        fp.status as "periodStatus",
        je.entry_number as "journalEntryNumber"
      FROM assets.depreciation_entries de
      JOIN accounting.fiscal_periods fp ON fp.id = de.fiscal_period_id
      LEFT JOIN accounting.journal_entries je ON je.id = de.journal_entry_id
      WHERE de.asset_id = $1
      ORDER BY de.period_month_index ASC
    `, [id]);

    // Transfers
    const transfersRes = await db.query<any>(`
      SELECT 
        tr.*,
        fb.name as "fromBranchName",
        tb.name as "toBranchName",
        fcc.name as "fromCostCenterName",
        tcc.name as "toCostCenterName"
      FROM assets.asset_transfers tr
      LEFT JOIN core.branches fb ON fb.id = tr.from_branch_id
      LEFT JOIN core.branches tb ON tb.id = tr.to_branch_id
      LEFT JOIN accounting.cost_centers fcc ON fcc.id = tr.from_cost_center_id
      LEFT JOIN accounting.cost_centers tcc ON tcc.id = tr.to_cost_center_id
      WHERE tr.asset_id = $1
      ORDER BY tr.transfer_date DESC
    `, [id]);

    // Maintenance
    const maintRes = await db.query<any>(`
      SELECT * FROM assets.maintenance
      WHERE asset_id = $1
      ORDER BY maintenance_date DESC
    `, [id]);

    // Disposal
    const dispRes = await db.query<any>(`
      SELECT * FROM assets.disposals
      WHERE asset_id = $1
      LIMIT 1
    `, [id]);

    return {
      ...asset,
      schedule: scheduleRes.rows.map((s: any) => ({
        ...s,
        opening_nbv: parseFloat(s.opening_nbv || '0'),
        depreciation_amount: parseFloat(s.depreciation_amount || '0'),
        accumulated_depreciation_after: parseFloat(s.accumulated_depreciation_after || '0'),
        closing_nbv: parseFloat(s.closing_nbv || '0'),
      })),
      transfers: transfersRes.rows,
      maintenance: maintRes.rows.map((m: any) => ({
        ...m,
        cost: parseFloat(m.cost || '0'),
      })),
      disposal: dispRes.rows[0] ? {
        ...dispRes.rows[0],
        cost_at_disposal: parseFloat(dispRes.rows[0].cost_at_disposal || '0'),
        accumulated_depreciation_at_disposal: parseFloat(dispRes.rows[0].accumulated_depreciation_at_disposal || '0'),
        nbv_at_disposal: parseFloat(dispRes.rows[0].nbv_at_disposal || '0'),
        proceeds: parseFloat(dispRes.rows[0].proceeds || '0'),
        gain_loss_amount: parseFloat(dispRes.rows[0].gain_loss_amount || '0'),
      } : null,
    };
  }

  static async createAsset(dto: CreateAssetDto) {
    const db = await getDb();
    const { companyId, branchId } = await this.getDefaults(dto.companyId, dto.branchId);

    // Validate Code Uniqueness
    const dup = await db.query<any>(
      'SELECT id FROM assets.fixed_assets WHERE company_id = $1 AND asset_code = $2 LIMIT 1',
      [companyId, dto.assetCode]
    );
    if (dup.rows.length > 0) {
      throw new Error(`كود الأصل (${dto.assetCode}) مسجل بالفعل، يرجى استخدام كود فريد`);
    }

    if (dto.acquisitionCost <= 0) {
      throw new Error('تكلفة اقتناء الأصل يجب أن تكون أكبر من صفر');
    }

    // Category
    const catRes = await db.query<any>('SELECT * FROM assets.asset_categories WHERE id = $1', [dto.categoryId]);
    if (catRes.rows.length === 0) {
      throw new Error('فئة الأصول المحددة غير موجودة');
    }
    const cat = catRes.rows[0];

    const usefulLife = dto.usefulLifeMonths || cat.useful_life_months || 60;
    const salvageValue = dto.salvageValue || 0;
    const initialStatus = dto.status || 'DRAFT';

    // Target GL accounts
    const assetAccId = initialStatus === 'UNDER_CONSTRUCTION'
      ? (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1209' LIMIT 1")).rows[0]?.id || cat.asset_account_id
      : cat.asset_account_id;

    const accDeprAccId = cat.accumulated_depreciation_account_id;
    const deprExpAccId = cat.depreciation_expense_account_id;

    let acquisitionJeId: string | null = null;

    // Optional acquisition accounting integration if paid via Cash/Bank/AP
    if (dto.paymentMethod) {
      let creditAccountId: string;
      let creditDescription: string;

      if (dto.paymentMethod === 'CASH') {
        if (!dto.cashAccountId) {
          const defCash = await db.query<any>('SELECT id, gl_account_id FROM banking.cash_accounts LIMIT 1');
          dto.cashAccountId = defCash.rows[0]?.id;
        }
        const cashAcc = (await db.query<any>('SELECT gl_account_id, name FROM banking.cash_accounts WHERE id = $1', [dto.cashAccountId])).rows[0];
        creditAccountId = cashAcc.gl_account_id;
        creditDescription = `دائن: الصندوق (${cashAcc.name}) - شراء أصل ثابت ${dto.assetName}`;
      } else if (dto.paymentMethod === 'BANK') {
        if (!dto.bankAccountId) {
          const defBank = await db.query<any>('SELECT id, gl_account_id FROM banking.bank_accounts LIMIT 1');
          dto.bankAccountId = defBank.rows[0]?.id;
        }
        const bankAcc = (await db.query<any>('SELECT gl_account_id, bank_name FROM banking.bank_accounts WHERE id = $1', [dto.bankAccountId])).rows[0];
        creditAccountId = bankAcc.gl_account_id;
        creditDescription = `دائن: البنك (${bankAcc.bank_name}) - شراء أصل ثابت ${dto.assetName}`;
      } else {
        // AP
        const apRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '2101' LIMIT 1");
        creditAccountId = apRes.rows[0]?.id;
        creditDescription = `دائن: الموردون والدائنون - استحقاق شراء أصل ثابت ${dto.assetName}`;
      }

      const je = await AccountingService.createJournalEntry({
        companyId,
        branchId,
        entryDate: dto.acquisitionDate,
        sourceId: 'GL',
        description: `قيد شراء واقتناء أصل ثابت (${dto.assetCode} - ${dto.assetName}) بقيمة ${dto.acquisitionCost.toLocaleString()} ر.ي`,
        lines: [
          {
            accountId: assetAccId,
            costCenterId: dto.costCenterId || undefined,
            debit: dto.acquisitionCost,
            credit: 0,
            description: `مدين: حساب الأصل الثابت (${dto.assetName})`,
          },
          {
            accountId: creditAccountId,
            debit: 0,
            credit: dto.acquisitionCost,
            description: creditDescription,
          },
        ],
        userId: dto.userId,
      });

      const postedJe = await AccountingService.postJournalEntry(je.id, dto.userId);
      acquisitionJeId = postedJe.id;

      // Banking ledger outflow if Cash or Bank
      if (dto.paymentMethod === 'CASH' && dto.cashAccountId) {
        const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
        await db.query(`
          INSERT INTO banking.transactions 
          (company_id, branch_id, transaction_number, transaction_date, account_category, cash_account_id, transaction_type, direction, amount, currency_id, reference_type, description, journal_entry_id, is_reconciled, created_by)
          VALUES ($1, $2, $3, $4, 'CASH', $5, 'PAYMENT', 'OUTFLOW', $6, $7, 'PAYMENT', $8, $9, FALSE, $10)
        `, [
          companyId,
          branchId,
          `TXN-ACQ-${Date.now().toString().slice(-6)}`,
          dto.acquisitionDate,
          dto.cashAccountId,
          dto.acquisitionCost,
          curRes.rows[0]?.id,
          `سداد شراء أصل ثابت: ${dto.assetName}`,
          postedJe.id,
          dto.userId || null,
        ]);
      } else if (dto.paymentMethod === 'BANK' && dto.bankAccountId) {
        const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
        await db.query(`
          INSERT INTO banking.transactions 
          (company_id, branch_id, transaction_number, transaction_date, account_category, bank_account_id, transaction_type, direction, amount, currency_id, reference_type, description, journal_entry_id, is_reconciled, created_by)
          VALUES ($1, $2, $3, $4, 'BANK', $5, 'PAYMENT', 'OUTFLOW', $6, $7, 'PAYMENT', $8, $9, FALSE, $10)
        `, [
          companyId,
          branchId,
          `TXN-ACQ-${Date.now().toString().slice(-6)}`,
          dto.acquisitionDate,
          dto.bankAccountId,
          dto.acquisitionCost,
          curRes.rows[0]?.id,
          `سداد شراء أصل ثابت: ${dto.assetName}`,
          postedJe.id,
          dto.userId || null,
        ]);
      }
    }

    const insRes = await db.query<any>(`
      INSERT INTO assets.fixed_assets 
      (company_id, branch_id, cost_center_id, asset_code, asset_name, category_id, acquisition_date, capitalization_date, acquisition_cost, salvage_value, useful_life_months, depreciation_method, status, serial_number, location, supplier_id, acquisition_journal_entry_id, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *
    `, [
      companyId,
      branchId,
      dto.costCenterId || null,
      dto.assetCode,
      dto.assetName,
      dto.categoryId,
      dto.acquisitionDate,
      dto.capitalizationDate || (initialStatus === 'ACTIVE' ? dto.acquisitionDate : null),
      dto.acquisitionCost,
      salvageValue,
      usefulLife,
      dto.depreciationMethod || cat.depreciation_method || 'STRAIGHT_LINE',
      initialStatus,
      dto.serialNumber || null,
      dto.location || null,
      dto.supplierId || null,
      acquisitionJeId,
      assetAccId,
      accDeprAccId,
      deprExpAccId,
      dto.notes || null,
      dto.userId || null,
    ]);

    const created = insRes.rows[0];

    // If initial status is ACTIVE, generate depreciation schedule
    if (initialStatus === 'ACTIVE') {
      await this.generateDepreciationSchedule(created.id);
    }

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'FIXED_ASSET',
      entityId: created.id,
      newData: created,
    });

    return await this.getAssetById(created.id);
  }

  /**
   * Capitalizes an asset (transitions from DRAFT or UNDER_CONSTRUCTION to ACTIVE)
   * If UNDER_CONSTRUCTION, posts CIP -> Fixed Asset reclassification journal entry.
   * Generates the monthly Straight-Line depreciation schedule.
   */
  static async capitalizeAsset(assetId: string, capitalizationDate: string, userId?: string) {
    const db = await getDb();
    const asset = await this.getAssetById(assetId);

    if (asset.status === 'ACTIVE') {
      throw new Error('الأصل مرسمل ونشط بالفعل في الخدمة');
    }
    if (['DISPOSED', 'SOLD', 'RETIRED'].includes(asset.status)) {
      throw new Error('لا يمكن رسملة أصل تم استبعاده أو بيعه');
    }

    const { companyId, branchId } = await this.getDefaults(asset.company_id, asset.branch_id);

    // If UNDER_CONSTRUCTION, reclassify CIP (1209) -> Target Category Asset Account
    if (asset.status === 'UNDER_CONSTRUCTION') {
      const catRes = await db.query<any>('SELECT * FROM assets.asset_categories WHERE id = $1', [asset.category_id]);
      const cat = catRes.rows[0];
      const cipAcc = (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1209' LIMIT 1")).rows[0]?.id;
      const targetAssetAcc = cat.asset_account_id;

      if (cipAcc && targetAssetAcc && cipAcc !== targetAssetAcc) {
        const je = await AccountingService.createJournalEntry({
          companyId,
          branchId,
          entryDate: capitalizationDate,
          sourceId: 'SYSTEM',
          description: `رسملة مشروع تحت التنفيذ وإدخال الأصل الثابت في الخدمة (${asset.asset_code} - ${asset.asset_name})`,
          lines: [
            {
              accountId: targetAssetAcc,
              costCenterId: asset.cost_center_id || null,
              debit: asset.acquisition_cost,
              credit: 0,
              description: `مدين: حساب الأصل الثابت الرأسمالي (${asset.asset_name})`,
            },
            {
              accountId: cipAcc,
              debit: 0,
              credit: asset.acquisition_cost,
              description: `دائن: إقفال حساب مشروعات تحت التنفيذ CIP (${asset.asset_name})`,
            },
          ],
          userId,
        });
        await AccountingService.postJournalEntry(je.id, userId);

        // Update target asset account on the asset
        await db.query('UPDATE assets.fixed_assets SET asset_account_id = $1 WHERE id = $2', [targetAssetAcc, assetId]);
      }
    }

    // Set status to ACTIVE and save capitalization date
    await db.query(`
      UPDATE assets.fixed_assets 
      SET status = 'ACTIVE', capitalization_date = $1, updated_at = NOW()
      WHERE id = $2
    `, [capitalizationDate, assetId]);

    // Generate schedule
    await this.generateDepreciationSchedule(assetId);

    await logAudit({
      userId,
      action: 'CAPITALIZE',
      entityType: 'FIXED_ASSET',
      entityId: assetId,
      newData: { status: 'ACTIVE', capitalizationDate },
    });

    return await this.getAssetById(assetId);
  }

  // ==========================================
  // 3. Depreciation Engine (محرك الإهلاك والجدولة)
  // ==========================================

  /**
   * Generates or regenerates straight-line depreciation schedule for useful_life_months
   * Depreciable Base = acquisition_cost - salvage_value
   * Monthly = Depreciable Base / useful_life_months (decimal-safe)
   */
  static async generateDepreciationSchedule(assetId: string) {
    const db = await getDb();
    const asset = await this.getAssetById(assetId);

    if (asset.depreciation_method === 'NONE') {
      return []; // e.g. Land
    }

    const cost = parseFloat(asset.acquisition_cost);
    const salvage = parseFloat(asset.salvage_value);
    const depreciableBase = Math.max(0, cost - salvage);
    const months = asset.useful_life_months;

    if (months <= 0 || depreciableBase <= 0) return [];

    // Clear unposted schedule entries if any
    await db.query('DELETE FROM assets.depreciation_entries WHERE asset_id = $1 AND is_posted = FALSE', [assetId]);

    // Retrieve open/future fiscal periods starting from capitalization date
    const capDate = new Date(asset.capitalization_date || asset.acquisition_date);
    const periodsRes = await db.query<any>(`
      SELECT * FROM accounting.fiscal_periods
      WHERE end_date >= $1::date
      ORDER BY start_date ASC
      LIMIT $2
    `, [capDate.toISOString().split('T')[0], months]);

    const periods = periodsRes.rows;

    const monthlyAmount = Math.round((depreciableBase / months) * 100) / 100;
    let accumulated = asset.accumulatedDepreciation || 0;
    let currentNbv = cost - accumulated;

    const createdEntries = [];

    for (let i = 1; i <= Math.min(months, periods.length); i++) {
      const period = periods[i - 1];

      // Check if already posted for this period
      const checkPosted = await db.query<any>(
        'SELECT id FROM assets.depreciation_entries WHERE asset_id = $1 AND fiscal_period_id = $2 AND is_posted = TRUE',
        [assetId, period.id]
      );
      if (checkPosted.rows.length > 0) continue;

      let deprForPeriod = monthlyAmount;
      if (accumulated + deprForPeriod > depreciableBase) {
        deprForPeriod = Math.max(0, depreciableBase - accumulated);
      }

      const openingNbv = currentNbv;
      const closingNbv = Math.max(salvage, openingNbv - deprForPeriod);
      const accAfter = accumulated + deprForPeriod;

      const entryNum = `DEP-${asset.asset_code}-${period.name.replace(/\s+/g, '')}`;

      const res = await db.query<any>(`
        INSERT INTO assets.depreciation_entries 
        (asset_id, fiscal_period_id, entry_number, period_date, period_month_index, opening_nbv, depreciation_amount, accumulated_depreciation_after, closing_nbv, is_posted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
        ON CONFLICT (asset_id, fiscal_period_id) DO NOTHING
        RETURNING *
      `, [
        assetId,
        period.id,
        entryNum,
        period.end_date,
        i,
        openingNbv,
        deprForPeriod,
        accAfter,
        closingNbv,
      ]);

      if (res.rows.length > 0) {
        createdEntries.push(res.rows[0]);
      }

      accumulated = accAfter;
      currentNbv = closingNbv;
    }

    return createdEntries;
  }

  /**
   * Posts monthly depreciation for a specific asset in an open fiscal period:
   * 1. Validates status is ACTIVE
   * 2. Validates fiscal period is OPEN (rejects CLOSED/LOCKED)
   * 3. Prevents duplicate posting for same period
   * 4. Double-Entry Balanced Journal Entry:
   *    Debit: Depreciation Expense (5301)
   *    Credit: Accumulated Depreciation (1290 or sub-account)
   * 5. If fully depreciated, marks asset as FULLY_DEPRECIATED
   */
  static async postDepreciationEntry(assetId: string, fiscalPeriodId: string, userId?: string) {
    const db = await getDb();
    const asset = await this.getAssetById(assetId);

    if (asset.status !== 'ACTIVE') {
      throw new Error(`لا يمكن ترحيل إهلاك للأصل بحالته الحالية (${asset.status})، يجب أن يكون ACTIVE`);
    }

    // Fiscal period status check
    const periodRes = await db.query<any>('SELECT * FROM accounting.fiscal_periods WHERE id = $1', [fiscalPeriodId]);
    if (periodRes.rows.length === 0) {
      throw new Error('الفترة المالية المحددة غير موجودة');
    }
    const period = periodRes.rows[0];
    if (period.status !== 'OPEN') {
      throw new Error(`لا يمكن ترحيل الإهلاك: الفترة المالية "${period.name}" مغلقة أو مقفلة (${period.status})`);
    }

    // Find schedule entry
    let entryRes = await db.query<any>(
      'SELECT * FROM assets.depreciation_entries WHERE asset_id = $1 AND fiscal_period_id = $2',
      [assetId, fiscalPeriodId]
    );

    let entry: any = entryRes.rows[0];

    if (entry && entry.is_posted) {
      throw new Error(`تم ترحيل إهلاك الأصل للفترة (${period.name}) مسبقاً، ممنوع التكرار`);
    }

    const { companyId, branchId } = await this.getDefaults(asset.company_id, asset.branch_id);

    // Calculate monthly depreciation if not yet scheduled
    let deprAmount = entry ? parseFloat(entry.depreciation_amount) : 0;
    if (!entry || deprAmount <= 0) {
      const cost = parseFloat(asset.acquisition_cost);
      const salvage = parseFloat(asset.salvage_value);
      const base = Math.max(0, cost - salvage);
      deprAmount = Math.round((base / asset.useful_life_months) * 100) / 100;

      const openingNbv = asset.netBookValue;
      const closingNbv = Math.max(salvage, openingNbv - deprAmount);
      const accAfter = asset.accumulatedDepreciation + deprAmount;

      const countPrev = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM assets.depreciation_entries WHERE asset_id = $1', [assetId]);
      const monthIdx = parseInt(countPrev.rows[0].count, 10) + 1;

      const insRes = await db.query<any>(`
        INSERT INTO assets.depreciation_entries 
        (asset_id, fiscal_period_id, entry_number, period_date, period_month_index, opening_nbv, depreciation_amount, accumulated_depreciation_after, closing_nbv, is_posted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
        ON CONFLICT (asset_id, fiscal_period_id) DO UPDATE SET depreciation_amount = EXCLUDED.depreciation_amount
        RETURNING *
      `, [
        assetId,
        fiscalPeriodId,
        `DEP-${asset.asset_code}-${period.period_number}`,
        period.end_date,
        monthIdx,
        openingNbv,
        deprAmount,
        accAfter,
        closingNbv,
      ]);
      entry = insRes.rows[0];
    }

    // 1. Create Double-Entry Balanced Journal Entry
    const je = await AccountingService.createJournalEntry({
      companyId,
      branchId,
      entryDate: period.end_date,
      sourceId: 'SYSTEM',
      description: `إثبات إهلاك الأصل الثابت (${asset.asset_code} - ${asset.asset_name}) لشهر ${period.name}`,
      lines: [
        {
          accountId: asset.depreciation_expense_account_id,
          costCenterId: asset.cost_center_id || null,
          debit: deprAmount,
          credit: 0,
          description: `مدين: مصروف إهلاك ${asset.asset_name} - ${period.name}`,
        },
        {
          accountId: asset.accumulated_depreciation_account_id,
          debit: 0,
          credit: deprAmount,
          description: `دائن: مجمع إهلاك ${asset.asset_name} - ${period.name}`,
        },
      ],
      userId,
    });

    const postedJe = await AccountingService.postJournalEntry(je.id, userId);

    // 2. Mark schedule entry as posted
    await db.query(`
      UPDATE assets.depreciation_entries
      SET is_posted = TRUE, posted_at = NOW(), journal_entry_id = $1
      WHERE id = $2
    `, [postedJe.id, entry.id]);

    // 3. Check if asset reached fully depreciated
    const updatedAsset = await this.getAssetById(assetId);
    if (updatedAsset.netBookValue <= updatedAsset.salvage_value) {
      await db.query("UPDATE assets.fixed_assets SET status = 'FULLY_DEPRECIATED' WHERE id = $1", [assetId]);
    }

    await logAudit({
      userId,
      action: 'DEPRECIATE',
      entityType: 'FIXED_ASSET',
      entityId: assetId,
      newData: { fiscalPeriodId, depreciationAmount: deprAmount, journalEntryId: postedJe.id },
    });

    return {
      success: true,
      depreciationAmount: deprAmount,
      journalEntryNumber: postedJe.entry_number,
      accumulatedDepreciation: updatedAsset.accumulatedDepreciation,
      netBookValue: updatedAsset.netBookValue,
    };
  }

  // ==========================================
  // 4. Asset Transfers (نقل الأصول إدارياً وجغرافياً)
  // ==========================================

  static async transferAsset(dto: TransferAssetDto) {
    const db = await getDb();
    const asset = await this.getAssetById(dto.assetId);

    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM assets.asset_transfers');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const trfNum = `TRF-AST-${seq.toString().padStart(4, '0')}`;

    const res = await db.query<any>(`
      INSERT INTO assets.asset_transfers 
      (asset_id, transfer_number, transfer_date, from_branch_id, to_branch_id, from_cost_center_id, to_cost_center_id, from_location, to_location, reason, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      dto.assetId,
      trfNum,
      dto.transferDate,
      asset.branch_id || null,
      dto.toBranchId || asset.branch_id || null,
      asset.cost_center_id || null,
      dto.toCostCenterId || asset.cost_center_id || null,
      asset.location || null,
      dto.toLocation || asset.location || null,
      dto.reason,
      dto.userId || null,
    ]);

    // Update current asset location, branch, and cost center
    await db.query(`
      UPDATE assets.fixed_assets 
      SET branch_id = COALESCE($1, branch_id),
          cost_center_id = COALESCE($2, cost_center_id),
          location = COALESCE($3, location),
          updated_at = NOW()
      WHERE id = $4
    `, [dto.toBranchId || null, dto.toCostCenterId || null, dto.toLocation || null, dto.assetId]);

    await logAudit({
      userId: dto.userId,
      action: 'TRANSFER',
      entityType: 'FIXED_ASSET',
      entityId: dto.assetId,
      newData: res.rows[0],
    });

    return res.rows[0];
  }

  // ==========================================
  // 5. Asset Maintenance & Improvements (صيانة ورسملة تحسينات)
  // ==========================================

  static async recordMaintenance(dto: AssetMaintenanceDto) {
    const db = await getDb();
    const asset = await this.getAssetById(dto.assetId);
    const { companyId, branchId } = await this.getDefaults(asset.company_id, asset.branch_id);

    if (dto.cost <= 0) {
      throw new Error('تكلفة الصيانة أو التحسين يجب أن تكون أكبر من صفر');
    }

    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM assets.maintenance');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const maintNum = `MNT-${seq.toString().padStart(4, '0')}`;

    let creditAccountId: string;
    let creditDescription: string;

    if (dto.paymentMethod === 'CASH') {
      const cashAcc = (await db.query<any>('SELECT gl_account_id, name FROM banking.cash_accounts WHERE id = $1', [dto.cashAccountId])).rows[0];
      creditAccountId = cashAcc?.gl_account_id || (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1101' LIMIT 1")).rows[0].id;
      creditDescription = `دائن: الصندوق - صيانة ${asset.asset_name}`;
    } else if (dto.paymentMethod === 'BANK') {
      const bankAcc = (await db.query<any>('SELECT gl_account_id, bank_name FROM banking.bank_accounts WHERE id = $1', [dto.bankAccountId])).rows[0];
      creditAccountId = bankAcc?.gl_account_id || (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1102' LIMIT 1")).rows[0].id;
      creditDescription = `دائن: البنك - صيانة ${asset.asset_name}`;
    } else {
      creditAccountId = (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '2101' LIMIT 1")).rows[0].id;
      creditDescription = `دائن: الموردون والدائنون - استحقاق صيانة ${asset.asset_name}`;
    }

    let debitAccountId: string;
    let debitDescription: string;

    if (dto.maintenanceType === 'CAPITAL_IMPROVEMENT') {
      // Capitalize to asset account!
      debitAccountId = asset.asset_account_id;
      debitDescription = `مدين: رسملة تحسينات وإضافات على الأصل ${asset.asset_name}`;

      // Update acquisition cost of the asset
      await db.query(`
        UPDATE assets.fixed_assets 
        SET acquisition_cost = acquisition_cost + $1, updated_at = NOW()
        WHERE id = $2
      `, [dto.cost, dto.assetId]);

      // Regenerate depreciation schedule
      await this.generateDepreciationSchedule(dto.assetId);
    } else {
      // Routine expense (5306)
      debitAccountId = (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '5306' LIMIT 1")).rows[0]?.id;
      debitDescription = `مدين: مصروفات صيانة وإصلاحات (${asset.asset_name})`;
    }

    // Journal Entry
    const je = await AccountingService.createJournalEntry({
      companyId,
      branchId,
      entryDate: dto.maintenanceDate,
      sourceId: 'GL',
      description: `صيانة أصل ثابت (${asset.asset_code} - ${asset.asset_name}): ${dto.description}`,
      lines: [
        {
          accountId: debitAccountId,
          costCenterId: asset.cost_center_id || null,
          debit: dto.cost,
          credit: 0,
          description: debitDescription,
        },
        {
          accountId: creditAccountId,
          debit: 0,
          credit: dto.cost,
          description: creditDescription,
        },
      ],
      userId: dto.userId,
    });

    const postedJe = await AccountingService.postJournalEntry(je.id, dto.userId);

    const res = await db.query<any>(`
      INSERT INTO assets.maintenance 
      (asset_id, maintenance_number, maintenance_date, maintenance_type, vendor_name, supplier_id, description, cost, expense_account_id, payment_method, cash_account_id, bank_account_id, journal_entry_id, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'POSTED', $14)
      RETURNING *
    `, [
      dto.assetId,
      maintNum,
      dto.maintenanceDate,
      dto.maintenanceType,
      dto.vendorName || null,
      dto.supplierId || null,
      dto.description,
      dto.cost,
      debitAccountId,
      dto.paymentMethod,
      dto.cashAccountId || null,
      dto.bankAccountId || null,
      postedJe.id,
      dto.userId || null,
    ]);

    await logAudit({
      userId: dto.userId,
      action: 'MAINTENANCE',
      entityType: 'FIXED_ASSET',
      entityId: dto.assetId,
      newData: res.rows[0],
    });

    return {
      ...res.rows[0],
      journalEntryNumber: postedJe.entry_number,
    };
  }

  // ==========================================
  // 6. Asset Disposal & Sale (استبعاد وبيع الأصول)
  // ==========================================

  /**
   * Disposes of or sells an asset:
   * NBV = Cost - Accumulated Depreciation
   * Gain/Loss = Proceeds - NBV
   * Balanced Double-Entry Journal Entry:
   *   Debit: Accumulated Depreciation (removes accumulated depreciation)
   *   Debit: Cash / Bank (for proceeds, if proceeds > 0)
   *   Debit: Loss on Disposal (if proceeds < NBV)
   *   Credit: Gain on Disposal (if proceeds > NBV)
   *   Credit: Asset Account (removes original acquisition cost)
   */
  static async disposeAsset(dto: DisposeAssetDto) {
    const db = await getDb();
    const asset = await this.getAssetById(dto.assetId);

    if (['DISPOSED', 'SOLD', 'RETIRED'].includes(asset.status)) {
      throw new Error(`الأصل مستبعد بالفعل بحالة ${asset.status}`);
    }

    const { companyId, branchId } = await this.getDefaults(asset.company_id, asset.branch_id);

    const cost = parseFloat(asset.acquisition_cost);
    const accDepr = asset.accumulatedDepreciation;
    const nbv = Math.max(0, cost - accDepr);
    const proceeds = Math.max(0, dto.proceeds || 0);
    const gainLoss = proceeds - nbv; // Positive = Gain, Negative = Loss

    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM assets.disposals');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const dispNum = `DSP-${seq.toString().padStart(4, '0')}`;

    // Category accounts for gain / loss
    const catRes = await db.query<any>('SELECT * FROM assets.asset_categories WHERE id = $1', [asset.category_id]);
    const cat = catRes.rows[0];
    const gainAccId = cat.disposal_gain_account_id;
    const lossAccId = cat.disposal_loss_account_id;

    // Journal Entry Lines
    const lines = [];

    // 1. Remove Accumulated Depreciation (Debit)
    if (accDepr > 0) {
      lines.push({
        accountId: asset.accumulated_depreciation_account_id,
        debit: accDepr,
        credit: 0,
        description: `مدين: إقفال مجمع إهلاك ${asset.asset_name} عند الاستبعاد`,
      });
    }

    // 2. Debit Proceeds (Cash / Bank) if any
    let proceedAccountId: string | null = null;
    if (proceeds > 0) {
      if (dto.paymentMethod === 'CASH') {
        const cashAcc = (await db.query<any>('SELECT gl_account_id FROM banking.cash_accounts WHERE id = $1', [dto.cashAccountId])).rows[0];
        proceedAccountId = cashAcc?.gl_account_id || (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1101' LIMIT 1")).rows[0].id;
      } else {
        const bankAcc = (await db.query<any>('SELECT gl_account_id FROM banking.bank_accounts WHERE id = $1', [dto.bankAccountId])).rows[0];
        proceedAccountId = bankAcc?.gl_account_id || (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1102' LIMIT 1")).rows[0].id;
      }

      lines.push({
        accountId: proceedAccountId,
        debit: proceeds,
        credit: 0,
        description: `مدين: متحصلات بيع الأصل ${asset.asset_name}`,
      });
    }

    // 3. Loss (Debit) or Gain (Credit)
    if (gainLoss < 0) {
      const lossAmt = Math.abs(gainLoss);
      lines.push({
        accountId: lossAccId,
        costCenterId: asset.cost_center_id || null,
        debit: lossAmt,
        credit: 0,
        description: `مدين: خسائر بيع واستبعاد الأصل الثابت ${asset.asset_name}`,
      });
    } else if (gainLoss > 0) {
      lines.push({
        accountId: gainAccId,
        costCenterId: asset.cost_center_id || null,
        debit: 0,
        credit: gainLoss,
        description: `دائن: أرباح بيع واستبعاد الأصل الثابت ${asset.asset_name}`,
      });
    }

    // 4. Remove Asset Cost (Credit)
    lines.push({
      accountId: asset.asset_account_id,
      debit: 0,
      credit: cost,
      description: `دائن: إخراج تكلفة الأصل الثابت ${asset.asset_name} من السجلات`,
    });

    const je = await AccountingService.createJournalEntry({
      companyId,
      branchId,
      entryDate: dto.disposalDate,
      sourceId: 'SYSTEM',
      description: `قيد استبعاد وتصفية الأصل الثابت (${asset.asset_code} - ${asset.asset_name}) بموجب ${dispNum}`,
      lines,
      userId: dto.userId,
    });

    const postedJe = await AccountingService.postJournalEntry(je.id, dto.userId);

    // Save Disposal Record
    const dispRes = await db.query<any>(`
      INSERT INTO assets.disposals 
      (asset_id, disposal_number, disposal_date, disposal_type, cost_at_disposal, accumulated_depreciation_at_disposal, nbv_at_disposal, proceeds, gain_loss_amount, payment_method, cash_account_id, bank_account_id, journal_entry_id, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      dto.assetId,
      dispNum,
      dto.disposalDate,
      dto.disposalType,
      cost,
      accDepr,
      nbv,
      proceeds,
      gainLoss,
      dto.paymentMethod || 'NONE',
      dto.cashAccountId || null,
      dto.bankAccountId || null,
      postedJe.id,
      dto.notes || null,
      dto.userId || null,
    ]);

    // Update asset status
    const newStatus = dto.disposalType === 'SALE' ? 'SOLD' : 'DISPOSED';
    await db.query('UPDATE assets.fixed_assets SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, dto.assetId]);

    // If proceeds received in cash/bank, log banking transaction
    if (proceeds > 0) {
      const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
      const currencyId = curRes.rows[0]?.id;
      if (dto.paymentMethod === 'CASH' && dto.cashAccountId) {
        await db.query(`
          INSERT INTO banking.transactions 
          (company_id, branch_id, transaction_number, transaction_date, account_category, cash_account_id, transaction_type, direction, amount, currency_id, reference_type, description, journal_entry_id, is_reconciled, created_by)
          VALUES ($1, $2, $3, $4, 'CASH', $5, 'RECEIPT', 'INFLOW', $6, $7, 'RECEIPT', $8, $9, FALSE, $10)
        `, [
          companyId,
          branchId,
          `TXN-${dispNum}`,
          dto.disposalDate,
          dto.cashAccountId,
          proceeds,
          currencyId,
          `متحصلات بيع الأصل الثابت: ${asset.asset_name}`,
          postedJe.id,
          dto.userId || null,
        ]);
      } else if (dto.bankAccountId) {
        await db.query(`
          INSERT INTO banking.transactions 
          (company_id, branch_id, transaction_number, transaction_date, account_category, bank_account_id, transaction_type, direction, amount, currency_id, reference_type, description, journal_entry_id, is_reconciled, created_by)
          VALUES ($1, $2, $3, $4, 'BANK', $5, 'RECEIPT', 'INFLOW', $6, $7, 'RECEIPT', $8, $9, FALSE, $10)
        `, [
          companyId,
          branchId,
          `TXN-${dispNum}`,
          dto.disposalDate,
          dto.bankAccountId,
          proceeds,
          currencyId,
          `متحصلات بيع الأصل الثابت: ${asset.asset_name}`,
          postedJe.id,
          dto.userId || null,
        ]);
      }
    }

    await logAudit({
      userId: dto.userId,
      action: 'DISPOSE',
      entityType: 'FIXED_ASSET',
      entityId: dto.assetId,
      newData: { disposal: dispRes.rows[0], journalEntryId: postedJe.id },
    });

    return {
      disposal: dispRes.rows[0],
      journalEntryNumber: postedJe.entry_number,
      gainLossAmount: gainLoss,
    };
  }

  // ==========================================
  // 7. Summaries & Subledger Reconciliations
  // ==========================================

  static async getAssetSummary() {
    const assets = await this.getAssets();

    const totalCount = assets.length;
    const activeCount = assets.filter(a => a.status === 'ACTIVE').length;
    const fullyDepreciatedCount = assets.filter(a => a.status === 'FULLY_DEPRECIATED').length;
    const disposedCount = assets.filter(a => ['DISPOSED', 'SOLD', 'RETIRED'].includes(a.status)).length;
    const draftCount = assets.filter(a => ['DRAFT', 'UNDER_CONSTRUCTION'].includes(a.status)).length;

    const totalCost = assets
      .filter(a => !['DISPOSED', 'SOLD', 'RETIRED'].includes(a.status))
      .reduce((sum, a) => sum + a.acquisition_cost, 0);

    const totalAccumulatedDepreciation = assets
      .filter(a => !['DISPOSED', 'SOLD', 'RETIRED'].includes(a.status))
      .reduce((sum, a) => sum + a.accumulatedDepreciation, 0);

    const totalNetBookValue = Math.max(0, totalCost - totalAccumulatedDepreciation);

    return {
      totalCount,
      activeCount,
      fullyDepreciatedCount,
      disposedCount,
      draftCount,
      totalCost,
      totalAccumulatedDepreciation,
      totalNetBookValue,
    };
  }

  static async getAssetGlReconciliation() {
    const db = await getDb();
    const summary = await this.getAssetSummary();

    // Sum of GL Fixed Asset Accounts (1201..1209)
    const glAssetCostRes = await db.query<any>(`
      SELECT COALESCE(SUM(jl.debit - jl.credit), 0) as balance
      FROM accounting.journal_entry_lines jl
      JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounting.accounts a ON a.id = jl.account_id
      WHERE a.code LIKE '120%' AND je.status = 'POSTED'
    `);
    const glAssetCost = parseFloat(glAssetCostRes.rows[0]?.balance || '0');

    // Sum of GL Accumulated Depreciation (1290..1296)
    const glAccDeprRes = await db.query<any>(`
      SELECT COALESCE(SUM(jl.credit - jl.debit), 0) as balance
      FROM accounting.journal_entry_lines jl
      JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounting.accounts a ON a.id = jl.account_id
      WHERE (a.code LIKE '129%' OR a.code = '1290') AND je.status = 'POSTED'
    `);
    const glAccDepr = parseFloat(glAccDeprRes.rows[0]?.balance || '0');

    return {
      subledgerCost: summary.totalCost,
      glCost: glAssetCost,
      costDifference: summary.totalCost - glAssetCost,
      subledgerAccDepreciation: summary.totalAccumulatedDepreciation,
      glAccDepreciation: glAccDepr,
      depreciationDifference: summary.totalAccumulatedDepreciation - glAccDepr,
      isBalanced: Math.abs(summary.totalCost - glAssetCost) < 0.01 && Math.abs(summary.totalAccumulatedDepreciation - glAccDepr) < 0.01,
    };
  }
}
