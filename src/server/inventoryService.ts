import { getDb } from './db.ts';
import { logAudit } from './auditService.ts';
import { AccountingService } from './accountingService.ts';
import { SettingsService } from './settingsService.ts';

export interface CreateItemDto {
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  categoryId?: string;
  unitId?: string;
  purchasePrice?: number;
  salePrice?: number;
  minimumStock?: number;
  reorderPoint?: number;
  inventoryAccountId?: string;
  cogsAccountId?: string;
  salesAccountId?: string;
  isStockItem?: boolean;
  companyId?: string;
  userId?: string;
}

export interface StockTransactionLineDto {
  itemId: string;
  quantity: number;
  unitCost?: number;
  locationId?: string;
  batchId?: string;
  serialNumber?: string;
}

export interface CreateStockTransactionDto {
  transactionType:
    | 'OPENING'
    | 'PURCHASE_RECEIPT'
    | 'SALES_ISSUE'
    | 'TRANSFER_IN'
    | 'TRANSFER_OUT'
    | 'ADJUSTMENT_IN'
    | 'ADJUSTMENT_OUT'
    | 'RETURN_IN'
    | 'RETURN_OUT'
    | 'STOCK_COUNT_ADJUSTMENT';
  transactionDate: string;
  warehouseId: string;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
  lines: StockTransactionLineDto[];
  companyId?: string;
  branchId?: string;
  userId?: string;
}

export interface CreateTransferDto {
  fromWarehouseId: string;
  toWarehouseId: string;
  transferDate: string;
  notes?: string;
  lines: { itemId: string; quantity: number }[];
  companyId?: string;
  userId?: string;
}

export interface CreateStockCountDto {
  warehouseId: string;
  countDate: string;
  notes?: string;
  lines?: { itemId: string; countedQuantity: number; notes?: string }[];
  companyId?: string;
  userId?: string;
}

export class InventoryService {
  // ==========================================
  // 1. Categories & Units & Warehouses
  // ==========================================

  static async getCategories() {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT c.*, p.name as "parentName"
      FROM inventory.categories c
      LEFT JOIN inventory.categories p ON p.id = c.parent_id
      ORDER BY c.created_at ASC
    `);
    return res.rows;
  }

  static async createCategory(dto: { code: string; name: string; description?: string; parentId?: string; companyId?: string }) {
    const db = await getDb();
    let companyId = dto.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }

    const res = await db.query<any>(`
      INSERT INTO inventory.categories (company_id, parent_id, code, name, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [companyId, dto.parentId || null, dto.code, dto.name, dto.description || null]);
    return res.rows[0];
  }

  static async getUnits() {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT u.*, bu.name as "baseUnitName"
      FROM inventory.units u
      LEFT JOIN inventory.units bu ON bu.id = u.base_unit_id
      ORDER BY u.created_at ASC
    `);
    return res.rows;
  }

  static async createUnit(dto: { code: string; name: string; symbol?: string; baseUnitId?: string; conversionFactor?: number; companyId?: string }) {
    const db = await getDb();
    let companyId = dto.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }

    const res = await db.query<any>(`
      INSERT INTO inventory.units (company_id, code, name, symbol, base_unit_id, conversion_factor)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [companyId, dto.code, dto.name, dto.symbol || null, dto.baseUnitId || null, dto.conversionFactor || 1.0]);
    return res.rows[0];
  }

  static async getWarehouses() {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT w.*, b.name as "branchName", a.name as "inventoryAccountName"
      FROM inventory.warehouses w
      LEFT JOIN core.branches b ON b.id = w.branch_id
      LEFT JOIN accounting.accounts a ON a.id = w.inventory_account_id
      ORDER BY w.created_at ASC
    `);
    return res.rows;
  }

  static async createWarehouse(dto: { code: string; name: string; address?: string; branchId?: string; inventoryAccountId?: string; companyId?: string }) {
    const db = await getDb();
    let companyId = dto.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }

    let branchId = dto.branchId;
    if (!branchId) {
      const branchRes = await db.query<{ id: string }>('SELECT id FROM core.branches LIMIT 1');
      branchId = branchRes.rows[0]?.id;
    }

    let invAccId = dto.inventoryAccountId;
    if (!invAccId) {
      const accRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1104' LIMIT 1");
      invAccId = accRes.rows[0]?.id;
    }

    const res = await db.query<any>(`
      INSERT INTO inventory.warehouses (company_id, branch_id, code, name, address, inventory_account_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [companyId, branchId, dto.code, dto.name, dto.address || null, invAccId]);

    const wh = res.rows[0];
    await logAudit({
      action: 'CREATE',
      entityType: 'WAREHOUSE',
      entityId: wh.id,
      newData: wh,
    });
    return wh;
  }

  // ==========================================
  // 2. Items Master
  // ==========================================

  static async getItems(search?: string, categoryId?: string) {
    const db = await getDb();
    let query = `
      SELECT 
        i.*,
        c.name as "categoryName",
        u.name as "unitName",
        u.symbol as "unitSymbol"
      FROM inventory.items i
      LEFT JOIN inventory.categories c ON c.id = i.category_id
      LEFT JOIN inventory.units u ON u.id = i.unit_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (i.name ILIKE $${params.length} OR i.sku ILIKE $${params.length} OR i.barcode ILIKE $${params.length})`;
    }
    if (categoryId) {
      params.push(categoryId);
      query += ` AND i.category_id = $${params.length}`;
    }

    query += ` ORDER BY i.created_at DESC`;
    const res = await db.query<any>(query, params);

    // Compute live stock metrics from transactions for each item
    const itemsWithStock = await Promise.all(
      res.rows.map(async (item: any) => {
        const metrics = await this.getItemStock(item.id);
        const currentStock = metrics.currentStock;
        const averageCost = metrics.averageCost;
        const stockValue = currentStock * averageCost;

        let stockStatus = 'IN_STOCK';
        if (currentStock <= 0) {
          stockStatus = 'OUT_OF_STOCK';
        } else if (parseFloat(item.reorder_point) > 0 && currentStock <= parseFloat(item.reorder_point)) {
          stockStatus = 'LOW_STOCK';
        }

        return {
          ...item,
          currentStock,
          averageCost,
          stockValue,
          stockStatus,
        };
      })
    );

    return itemsWithStock;
  }

  static async getItemById(id: string) {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        i.*,
        c.name as "categoryName",
        u.name as "unitName",
        u.symbol as "unitSymbol"
      FROM inventory.items i
      LEFT JOIN inventory.categories c ON c.id = i.category_id
      LEFT JOIN inventory.units u ON u.id = i.unit_id
      WHERE i.id = $1
    `, [id]);

    if (res.rows.length === 0) {
      throw new Error(`الصنف برقم ${id} غير موجود`);
    }

    const item = res.rows[0];
    const metrics = await this.getItemStock(item.id);
    const currentStock = metrics.currentStock;
    const averageCost = metrics.averageCost;
    const stockValue = currentStock * averageCost;

    let stockStatus = 'IN_STOCK';
    if (currentStock <= 0) {
      stockStatus = 'OUT_OF_STOCK';
    } else if (parseFloat(item.reorder_point) > 0 && currentStock <= parseFloat(item.reorder_point)) {
      stockStatus = 'LOW_STOCK';
    }

    return {
      ...item,
      currentStock,
      averageCost,
      stockValue,
      stockStatus,
    };
  }

  static async createItem(dto: CreateItemDto) {
    const db = await getDb();

    let companyId = dto.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }

    // 1. Validation: SKU uniqueness
    const skuCheck = await db.query<any>(
      'SELECT id FROM inventory.items WHERE company_id = $1 AND sku = $2 LIMIT 1',
      [companyId, dto.sku]
    );
    if (skuCheck.rows.length > 0) {
      throw new Error(`رمز الصنف (SKU: ${dto.sku}) مستخدم بالفعل، يجب أن يكون الرمز فريداً`);
    }

    // 2. Validation: Barcode uniqueness if provided
    if (dto.barcode) {
      const barcodeCheck = await db.query<any>(
        'SELECT id FROM inventory.items WHERE company_id = $1 AND barcode = $2 LIMIT 1',
        [companyId, dto.barcode]
      );
      if (barcodeCheck.rows.length > 0) {
        throw new Error(`الباركود (${dto.barcode}) مستخدم مسبقاً لصنف آخر`);
      }
    }

    // Default accounts via Central Settings Mapping
    let invAccId = dto.inventoryAccountId;
    if (!invAccId) {
      invAccId = await SettingsService.getAccountMapping('inventory.default_inventory_account', '1104', companyId);
    }

    let cogsAccId = dto.cogsAccountId;
    if (!cogsAccId) {
      cogsAccId = await SettingsService.getAccountMapping('inventory.cogs_account', '5001', companyId);
    }

    let salesAccId = dto.salesAccountId;
    if (!salesAccId) {
      salesAccId = await SettingsService.getAccountMapping('sales.default_revenue_account', '41', companyId);
    }

    const res = await db.query<any>(`
      INSERT INTO inventory.items (
        company_id, sku, barcode, name, description, category_id, unit_id,
        purchase_price, sale_price, minimum_stock, reorder_point,
        inventory_account_id, cogs_account_id, sales_account_id, is_stock_item
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      companyId,
      dto.sku,
      dto.barcode || null,
      dto.name,
      dto.description || null,
      dto.categoryId || null,
      dto.unitId || null,
      dto.purchasePrice || 0,
      dto.salePrice || 0,
      dto.minimumStock || 0,
      dto.reorderPoint || 0,
      invAccId,
      cogsAccId,
      salesAccId,
      dto.isStockItem !== undefined ? dto.isStockItem : true,
    ]);

    const item = res.rows[0];
    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'ITEM',
      entityId: item.id,
      newData: item,
    });

    return item;
  }

  static async updateItem(id: string, dto: Partial<CreateItemDto> & { isActive?: boolean }) {
    const db = await getDb();
    const existing = await this.getItemById(id);

    const res = await db.query<any>(`
      UPDATE inventory.items
      SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        category_id = COALESCE($3, category_id),
        unit_id = COALESCE($4, unit_id),
        purchase_price = COALESCE($5, purchase_price),
        sale_price = COALESCE($6, sale_price),
        minimum_stock = COALESCE($7, minimum_stock),
        reorder_point = COALESCE($8, reorder_point),
        is_active = COALESCE($9, is_active),
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [
      dto.name,
      dto.description,
      dto.categoryId,
      dto.unitId,
      dto.purchasePrice,
      dto.salePrice,
      dto.minimumStock,
      dto.reorderPoint,
      dto.isActive !== undefined ? dto.isActive : (dto as any).is_active,
      id,
    ]);

    const updated = res.rows[0];
    await logAudit({
      userId: dto.userId,
      action: 'UPDATE',
      entityType: 'ITEM',
      entityId: id,
      oldData: existing,
      newData: updated,
    });

    return updated;
  }

  static async deleteItem(id: string, userId?: string) {
    const db = await getDb();
    const existing = await this.getItemById(id);

    // Guard: Prevent deletion of items with posted transactions
    const txCheck = await db.query<any>(
      'SELECT id FROM inventory.stock_transaction_lines WHERE item_id = $1 LIMIT 1',
      [id]
    );
    if (txCheck.rows.length > 0) {
      throw new Error(
        `لا يمكن حذف الصنف "${existing.name}" لوجود حركات مخزنية مرتبطة به. يرجى إلغاء تفعيل الصنف (Deactivate) بدلاً من حذفه.`
      );
    }

    // Check sales/purchase invoice lines
    const salesCheck = await db.query<any>(
      'SELECT id FROM sales.sales_invoice_lines WHERE item_code = $1 LIMIT 1',
      [existing.sku]
    );
    if (salesCheck.rows.length > 0) {
      throw new Error(`لا يمكن حذف الصنف "${existing.name}" لوجود فواتير مبيعات مرتبطة به.`);
    }

    await db.query('DELETE FROM inventory.items WHERE id = $1', [id]);

    await logAudit({
      userId,
      action: 'DELETE',
      entityType: 'ITEM',
      entityId: id,
      oldData: existing,
    });

    return { success: true, message: `تم حذف الصنف ${existing.name} بنجاح` };
  }

  // ==========================================
  // 3. Stock Ledger & Weighted Average Valuation Engine
  // ==========================================

  /**
   * Calculates current stock and perpetual Weighted Average Cost (WAC)
   * strictly from posted stock transactions.
   */
  static async getItemStock(itemId: string, warehouseId?: string) {
    const db = await getDb();
    let query = `
      SELECT 
        tx.transaction_type,
        tx.transaction_date,
        tx.created_at,
        l.quantity,
        l.unit_cost,
        l.total_cost
      FROM inventory.stock_transaction_lines l
      JOIN inventory.stock_transactions tx ON tx.id = l.transaction_id
      WHERE l.item_id = $1 AND tx.status = 'POSTED'
    `;
    const params: any[] = [itemId];

    if (warehouseId) {
      params.push(warehouseId);
      query += ` AND tx.warehouse_id = $2`;
    }

    query += ` ORDER BY tx.transaction_date ASC, tx.created_at ASC`;
    const res = await db.query<any>(query, params);

    let runningQty = 0;
    let runningVal = 0;
    let avgCost = 0;

    const inflowTypes = [
      'OPENING',
      'PURCHASE_RECEIPT',
      'TRANSFER_IN',
      'ADJUSTMENT_IN',
      'RETURN_IN',
    ];

    for (const row of res.rows) {
      const qty = parseFloat(row.quantity);
      const cost = parseFloat(row.unit_cost || '0');

      if (inflowTypes.includes(row.transaction_type)) {
        // Inflow increases stock and recalibrates weighted average cost
        runningVal = (runningQty * avgCost) + (qty * cost);
        runningQty += qty;
        if (runningQty > 0) {
          avgCost = runningVal / runningQty;
        }
      } else {
        // Outflow decreases stock at current average cost
        runningQty -= qty;
        runningVal = runningQty * avgCost;
      }
    }

    // Default to purchase_price if no transactions yet
    if (avgCost === 0) {
      const itemRes = await db.query<any>('SELECT purchase_price FROM inventory.items WHERE id = $1', [itemId]);
      avgCost = parseFloat(itemRes.rows[0]?.purchase_price || '0');
    }

    return {
      currentStock: runningQty,
      averageCost: avgCost,
      stockValue: runningQty * avgCost,
    };
  }

  /**
   * Item Ledger History (Audit trail of all movements with running balance)
   */
  static async getItemLedger(itemId: string, warehouseId?: string) {
    const db = await getDb();
    const item = await this.getItemById(itemId);

    let query = `
      SELECT 
        tx.id as "transactionId",
        tx.transaction_number as "transactionNumber",
        tx.transaction_type as "transactionType",
        tx.transaction_date as "transactionDate",
        tx.reference_type as "referenceType",
        tx.notes as "notes",
        w.name as "warehouseName",
        l.quantity,
        l.unit_cost as "unitCost",
        l.total_cost as "totalCost"
      FROM inventory.stock_transaction_lines l
      JOIN inventory.stock_transactions tx ON tx.id = l.transaction_id
      JOIN inventory.warehouses w ON w.id = tx.warehouse_id
      WHERE l.item_id = $1 AND tx.status = 'POSTED'
    `;
    const params: any[] = [itemId];

    if (warehouseId) {
      params.push(warehouseId);
      query += ` AND tx.warehouse_id = $2`;
    }

    query += ` ORDER BY tx.transaction_date ASC, tx.created_at ASC`;
    const res = await db.query<any>(query, params);

    const inflowTypes = ['OPENING', 'PURCHASE_RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'RETURN_IN'];

    let runningStock = 0;
    let runningVal = 0;
    let avgCost = 0;

    const entries = res.rows.map((row: any) => {
      const qty = parseFloat(row.quantity);
      const cost = parseFloat(row.unitCost || '0');
      const isInflow = inflowTypes.includes(row.transactionType);

      let inQty = 0;
      let outQty = 0;

      if (isInflow) {
        inQty = qty;
        runningVal = (runningStock * avgCost) + (qty * cost);
        runningStock += qty;
        if (runningStock > 0) {
          avgCost = runningVal / runningStock;
        }
      } else {
        outQty = qty;
        runningStock -= qty;
        runningVal = runningStock * avgCost;
      }

      return {
        ...row,
        isInflow,
        inQty,
        outQty,
        runningStock,
        unitCost: cost > 0 ? cost : avgCost,
        currentAvgCost: avgCost,
        runningValue: runningStock * avgCost,
      };
    });

    return {
      item,
      entries,
      finalStock: runningStock,
      finalAverageCost: avgCost,
      finalValue: runningStock * avgCost,
    };
  }

  // ==========================================
  // 4. Stock Transactions & Negative Stock Protection
  // ==========================================

  static async getStockTransactions(limit = 100, warehouseId?: string) {
    const db = await getDb();
    let query = `
      SELECT 
        tx.*,
        w.name as "warehouseName",
        u.username as "createdByUsername",
        (SELECT COUNT(*) FROM inventory.stock_transaction_lines l WHERE l.transaction_id = tx.id) as "linesCount",
        (SELECT COALESCE(SUM(l.total_cost), 0) FROM inventory.stock_transaction_lines l WHERE l.transaction_id = tx.id) as "totalCost"
      FROM inventory.stock_transactions tx
      JOIN inventory.warehouses w ON w.id = tx.warehouse_id
      LEFT JOIN security.users u ON u.id = tx.created_by
      WHERE 1=1
    `;
    const params: any[] = [];
    if (warehouseId) {
      params.push(warehouseId);
      query += ` AND tx.warehouse_id = $${params.length}`;
    }
    query += ` ORDER BY tx.transaction_date DESC, tx.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const res = await db.query<any>(query, params);
    return res.rows;
  }

  static async getStockTransactionDetails(txId: string) {
    const db = await getDb();
    const txRes = await db.query<any>(`
      SELECT 
        tx.*,
        w.name as "warehouseName",
        u.username as "createdByUsername"
      FROM inventory.stock_transactions tx
      JOIN inventory.warehouses w ON w.id = tx.warehouse_id
      LEFT JOIN security.users u ON u.id = tx.created_by
      WHERE tx.id = $1
    `, [txId]);

    if (txRes.rows.length === 0) {
      throw new Error(`حركة المخزون برقم ${txId} غير موجودة`);
    }

    const tx = txRes.rows[0];
    const linesRes = await db.query<any>(`
      SELECT 
        l.*,
        i.name as "itemName",
        i.sku as "itemSku",
        u.symbol as "unitSymbol",
        loc.name as "locationName"
      FROM inventory.stock_transaction_lines l
      JOIN inventory.items i ON i.id = l.item_id
      LEFT JOIN inventory.units u ON u.id = i.unit_id
      LEFT JOIN inventory.warehouse_locations loc ON loc.id = l.location_id
      WHERE l.transaction_id = $1
      ORDER BY l.line_number ASC
    `, [txId]);

    return { ...tx, lines: linesRes.rows };
  }

  static async createStockTransaction(dto: CreateStockTransactionDto) {
    const db = await getDb();

    if (!dto.lines || dto.lines.length === 0) {
      throw new Error('يجب أن تحتوي حركة المخزون على صنف واحد على الأقل');
    }

    const outflowTypes = ['SALES_ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT', 'RETURN_OUT'];
    const isOutflow = outflowTypes.includes(dto.transactionType);

    // Negative stock check
    if (isOutflow) {
      for (const line of dto.lines) {
        const itemStock = await this.getItemStock(line.itemId, dto.warehouseId);
        if (itemStock.currentStock < line.quantity) {
          const item = await this.getItemById(line.itemId);
          await logAudit({
            action: 'NEGATIVE_STOCK_REJECTED',
            entityType: 'INVENTORY',
            entityId: line.itemId,
            newData: { requestedQty: line.quantity, availableStock: itemStock.currentStock },
          });
          throw new Error(
            `المخزون المتوفر للصنف "${item.name}" في المستودع المحدد (${itemStock.currentStock}) غير كافٍ لصرف كمية (${line.quantity}). غير مسموح بالرصيد السالب.`
          );
        }
      }
    }

    let companyId = dto.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }

    let branchId = dto.branchId;
    if (!branchId) {
      const branchRes = await db.query<{ id: string }>('SELECT id FROM core.branches LIMIT 1');
      branchId = branchRes.rows[0]?.id;
    }

    // Generate Transaction Number
    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM inventory.stock_transactions');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const txNumber = `STK-2026-${seq.toString().padStart(5, '0')}`;

    const txRes = await db.query<any>(`
      INSERT INTO inventory.stock_transactions (
        company_id, branch_id, transaction_number, transaction_type,
        transaction_date, warehouse_id, reference_type, reference_id,
        status, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'POSTED', $9, $10)
      RETURNING *
    `, [
      companyId,
      branchId,
      txNumber,
      dto.transactionType,
      dto.transactionDate,
      dto.warehouseId,
      dto.referenceType || null,
      dto.referenceId || null,
      dto.notes || null,
      dto.userId || null,
    ]);

    const tx = txRes.rows[0];

    // Insert lines with valuation
    for (let idx = 0; idx < dto.lines.length; idx++) {
      const line = dto.lines[idx];
      let unitCost = line.unitCost || 0;

      // If outflow or no unitCost given, use current weighted average cost!
      if (unitCost === 0 || isOutflow) {
        const stockData = await this.getItemStock(line.itemId, dto.warehouseId);
        unitCost = stockData.averageCost;
      }

      const totalCost = line.quantity * unitCost;

      await db.query(`
        INSERT INTO inventory.stock_transaction_lines (
          transaction_id, item_id, quantity, unit_cost, total_cost, location_id, line_number
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        tx.id,
        line.itemId,
        line.quantity,
        unitCost,
        totalCost,
        line.locationId || null,
        idx + 1,
      ]);
    }

    await logAudit({
      userId: dto.userId,
      action: dto.transactionType,
      entityType: 'STOCK_TRANSACTION',
      entityId: tx.id,
      newData: { tx, linesCount: dto.lines.length },
    });

    return tx;
  }

  // ==========================================
  // 5. Warehouse Transfers (Atomic Double-Movement)
  // ==========================================

  static async createStockTransfer(dto: CreateTransferDto) {
    const db = await getDb();

    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new Error('لا يمكن التحويل لنفس المستودع');
    }
    if (!dto.lines || dto.lines.length === 0) {
      throw new Error('يجب اختيار صنف واحد على الأقل للتحويل');
    }

    let companyId = dto.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }

    // 1. Check stock in source warehouse
    for (const line of dto.lines) {
      const stock = await this.getItemStock(line.itemId, dto.fromWarehouseId);
      if (stock.currentStock < line.quantity) {
        const item = await this.getItemById(line.itemId);
        throw new Error(
          `رصيد الصنف "${item.name}" في مستودع المصدر (${stock.currentStock}) غير كافٍ لتحويل (${line.quantity})`
        );
      }
    }

    // Generate transfer number
    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM inventory.stock_transfers');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const transferNumber = `TRF-2026-${seq.toString().padStart(4, '0')}`;

    // 2. Perform Outflow from Source Warehouse
    const outTx = await this.createStockTransaction({
      transactionType: 'TRANSFER_OUT',
      transactionDate: dto.transferDate,
      warehouseId: dto.fromWarehouseId,
      referenceType: 'STOCK_TRANSFER',
      notes: `تحويل صادر برقم ${transferNumber} إلى المستودع الهدف`,
      lines: dto.lines.map(l => ({ itemId: l.itemId, quantity: l.quantity })),
      companyId,
      userId: dto.userId,
    });

    // 3. Perform Inflow to Target Warehouse using same cost
    const inLinesWithCost: StockTransactionLineDto[] = [];
    for (const l of dto.lines) {
      const stock = await this.getItemStock(l.itemId, dto.fromWarehouseId);
      inLinesWithCost.push({
        itemId: l.itemId,
        quantity: l.quantity,
        unitCost: stock.averageCost,
      });
    }

    const inTx = await this.createStockTransaction({
      transactionType: 'TRANSFER_IN',
      transactionDate: dto.transferDate,
      warehouseId: dto.toWarehouseId,
      referenceType: 'STOCK_TRANSFER',
      notes: `تحويل وارد برقم ${transferNumber} من مستودع المصدر`,
      lines: inLinesWithCost,
      companyId,
      userId: dto.userId,
    });

    // 4. Save transfer record
    const trfRes = await db.query<any>(`
      INSERT INTO inventory.stock_transfers (
        company_id, transfer_number, from_warehouse_id, to_warehouse_id,
        transfer_date, status, out_transaction_id, in_transaction_id, notes, created_by, posted_at
      )
      VALUES ($1, $2, $3, $4, $5, 'POSTED', $6, $7, $8, $9, NOW())
      RETURNING *
    `, [
      companyId,
      transferNumber,
      dto.fromWarehouseId,
      dto.toWarehouseId,
      dto.transferDate,
      outTx.id,
      inTx.id,
      dto.notes || null,
      dto.userId || null,
    ]);

    const transfer = trfRes.rows[0];

    for (let i = 0; i < dto.lines.length; i++) {
      const l = dto.lines[i];
      await db.query(`
        INSERT INTO inventory.stock_transfer_lines (transfer_id, item_id, quantity, line_number)
        VALUES ($1, $2, $3, $4)
      `, [transfer.id, l.itemId, l.quantity, i + 1]);
    }

    await logAudit({
      userId: dto.userId,
      action: 'STOCK_TRANSFER',
      entityType: 'STOCK_TRANSFER',
      entityId: transfer.id,
      newData: { transfer, outTxId: outTx.id, inTxId: inTx.id },
    });

    return transfer;
  }

  static async getStockTransfers() {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        t.*,
        w1.name as "fromWarehouseName",
        w2.name as "toWarehouseName"
      FROM inventory.stock_transfers t
      JOIN inventory.warehouses w1 ON w1.id = t.from_warehouse_id
      JOIN inventory.warehouses w2 ON w2.id = t.to_warehouse_id
      ORDER BY t.transfer_date DESC, t.created_at DESC
    `);
    return res.rows;
  }

  // ==========================================
  // 6. Physical Stock Counts (الجرد الفعلي)
  // ==========================================

  static async getStockCounts() {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        c.*,
        w.name as "warehouseName",
        u.username as "approvedByUsername"
      FROM inventory.stock_counts c
      JOIN inventory.warehouses w ON w.id = c.warehouse_id
      LEFT JOIN security.users u ON u.id = c.approved_by
      ORDER BY c.count_date DESC, c.created_at DESC
    `);
    return res.rows;
  }

  static async createStockCount(dto: CreateStockCountDto) {
    const db = await getDb();

    let companyId = dto.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }

    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM inventory.stock_counts');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const countNumber = `CNT-2026-${seq.toString().padStart(4, '0')}`;

    const scRes = await db.query<any>(`
      INSERT INTO inventory.stock_counts (
        company_id, count_number, warehouse_id, count_date, status, notes, created_by
      )
      VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6)
      RETURNING *
    `, [companyId, countNumber, dto.warehouseId, dto.countDate, dto.notes || null, dto.userId || null]);

    const count = scRes.rows[0];

    // If lines provided, snapshot system quantity and save
    if (dto.lines && dto.lines.length > 0) {
      for (let i = 0; i < dto.lines.length; i++) {
        const l = dto.lines[i];
        const stockData = await this.getItemStock(l.itemId, dto.warehouseId);
        const sysQty = stockData.currentStock;
        const countedQty = l.countedQuantity;
        const diffQty = countedQty - sysQty;
        const unitCost = stockData.averageCost;
        const totalDiffCost = diffQty * unitCost;

        await db.query(`
          INSERT INTO inventory.stock_count_lines (
            count_id, item_id, system_quantity, counted_quantity, difference_quantity, unit_cost, total_difference_cost, line_number, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          count.id,
          l.itemId,
          sysQty,
          countedQty,
          diffQty,
          unitCost,
          totalDiffCost,
          i + 1,
          l.notes || null,
        ]);
      }
    }

    await logAudit({
      userId: dto.userId,
      action: 'STOCK_COUNT_CREATED',
      entityType: 'STOCK_COUNT',
      entityId: count.id,
      newData: count,
    });

    return count;
  }

  /**
   * Approving a Stock Count automatically creates inventory adjustments:
   * System 100, Actual 96 -> Difference -4 -> Creates ADJUSTMENT_OUT of 4!
   */
  static async approveStockCount(countId: string, approvedBy?: string) {
    const db = await getDb();
    const countRes = await db.query<any>('SELECT * FROM inventory.stock_counts WHERE id = $1', [countId]);
    if (countRes.rows.length === 0) {
      throw new Error(`محضر الجرد برقم ${countId} غير موجود`);
    }

    const count = countRes.rows[0];
    if (count.status === 'APPROVED') {
      throw new Error('محضر الجرد معتمد بالفعل');
    }

    const linesRes = await db.query<any>(`
      SELECT * FROM inventory.stock_count_lines WHERE count_id = $1 ORDER BY line_number ASC
    `, [countId]);

    const adjustmentsIn: StockTransactionLineDto[] = [];
    const adjustmentsOut: StockTransactionLineDto[] = [];

    for (const line of linesRes.rows) {
      const diff = parseFloat(line.difference_quantity);
      if (diff > 0) {
        // Surplus: Adjustment IN
        adjustmentsIn.push({
          itemId: line.item_id,
          quantity: diff,
          unitCost: parseFloat(line.unit_cost),
        });
      } else if (diff < 0) {
        // Shortage: Adjustment OUT
        adjustmentsOut.push({
          itemId: line.item_id,
          quantity: Math.abs(diff),
          unitCost: parseFloat(line.unit_cost),
        });
      }
    }

    let lastTxId = null;

    if (adjustmentsIn.length > 0) {
      const tx = await this.createStockTransaction({
        transactionType: 'ADJUSTMENT_IN',
        transactionDate: count.count_date,
        warehouseId: count.warehouse_id,
        referenceType: 'STOCK_COUNT',
        referenceId: count.id,
        notes: `تسوية فروقات جرد (زيادة) بموجب محضر رقم ${count.count_number}`,
        lines: adjustmentsIn,
        userId: approvedBy,
      });
      lastTxId = tx.id;
    }

    if (adjustmentsOut.length > 0) {
      const tx = await this.createStockTransaction({
        transactionType: 'ADJUSTMENT_OUT',
        transactionDate: count.count_date,
        warehouseId: count.warehouse_id,
        referenceType: 'STOCK_COUNT',
        referenceId: count.id,
        notes: `تسوية فروقات جرد (عجز) بموجب محضر رقم ${count.count_number}`,
        lines: adjustmentsOut,
        userId: approvedBy,
      });
      lastTxId = tx.id;
    }

    await db.query(`
      UPDATE inventory.stock_counts
      SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), adjustment_transaction_id = $2
      WHERE id = $3
    `, [approvedBy || null, lastTxId, countId]);

    await logAudit({
      userId: approvedBy,
      action: 'STOCK_COUNT_APPROVED',
      entityType: 'STOCK_COUNT',
      entityId: countId,
      newData: { countNumber: count.count_number, lastTxId },
    });

    return { success: true, message: 'تم اعتماد محضر الجرد وتطبيق التسويات المخزنية تلقائياً' };
  }

  // ==========================================
  // 7. Inventory Reconciliation (Subledger vs GL Control Account 1104)
  // ==========================================

  static async getInventoryReconciliation() {
    const db = await getDb();

    // 1. Subledger Valuation: Sum of (CurrentStock * AverageCost) for all items
    const items = await this.getItems();
    const subledgerValue = items.reduce((sum, item) => sum + (item.stockValue || 0), 0);

    // 2. General Ledger Control Account (1104) Balance
    // In double entry, Account 1104 normal balance is DEBIT: Debits - Credits
    const glRes = await db.query<any>(`
      SELECT 
        COALESCE(SUM(jl.debit - jl.credit), 0) as gl_balance,
        COALESCE(SUM(jl.debit), 0) as total_debits,
        COALESCE(SUM(jl.credit), 0) as total_credits
      FROM accounting.journal_entry_lines jl
      JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounting.accounts a ON a.id = jl.account_id
      WHERE a.code = '1104' AND je.status = 'POSTED'
    `);
    const glBalance = parseFloat(glRes.rows[0]?.gl_balance || '0');

    const difference = Math.abs(subledgerValue - glBalance);
    const status = difference < 0.001 ? 'RECONCILED' : 'OUT_OF_BALANCE';

    return {
      subledgerValue,
      glBalance,
      difference,
      status,
      glAccountCode: '1104',
      glAccountName: 'المخزون السلعي (حساب الرقابة)',
      itemCount: items.length,
      reconciledAt: new Date().toISOString(),
    };
  }

  // ==========================================
  // 8. Inventory Dashboard & KPI Metrics
  // ==========================================

  static async getInventoryDashboardSummary() {
    const db = await getDb();
    const items = await this.getItems();
    const warehouses = await this.getWarehouses();

    const totalItems = items.length;
    const totalInventoryValue = items.reduce((sum, i) => sum + i.stockValue, 0);
    const lowStockItems = items.filter(i => i.stockStatus === 'LOW_STOCK').length;
    const outOfStockItems = items.filter(i => i.stockStatus === 'OUT_OF_STOCK').length;

    const todayRes = await db.query<{ count: string }>(`
      SELECT COUNT(*) as count 
      FROM inventory.stock_transactions 
      WHERE transaction_date = CURRENT_DATE AND status = 'POSTED'
    `);
    const todayMovements = parseInt(todayRes.rows[0]?.count || '0', 10);

    // Today's purchase receipts & sales issues
    const todayPurRes = await db.query<{ count: string; val: string }>(`
      SELECT COUNT(*) as count, COALESCE(SUM(l.total_cost), 0) as val
      FROM inventory.stock_transactions tx
      JOIN inventory.stock_transaction_lines l ON l.transaction_id = tx.id
      WHERE tx.transaction_date = CURRENT_DATE AND tx.transaction_type = 'PURCHASE_RECEIPT' AND tx.status = 'POSTED'
    `);
    const todayPurchases = {
      count: parseInt(todayPurRes.rows[0]?.count || '0', 10),
      value: parseFloat(todayPurRes.rows[0]?.val || '0'),
    };

    const todaySalesRes = await db.query<{ count: string; val: string }>(`
      SELECT COUNT(*) as count, COALESCE(SUM(l.total_cost), 0) as val
      FROM inventory.stock_transactions tx
      JOIN inventory.stock_transaction_lines l ON l.transaction_id = tx.id
      WHERE tx.transaction_date = CURRENT_DATE AND tx.transaction_type = 'SALES_ISSUE' AND tx.status = 'POSTED'
    `);
    const todaySales = {
      count: parseInt(todaySalesRes.rows[0]?.count || '0', 10),
      value: parseFloat(todaySalesRes.rows[0]?.val || '0'),
    };

    // Top value items
    const topValueItems = [...items]
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 5)
      .map(i => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        currentStock: i.currentStock,
        averageCost: i.averageCost,
        stockValue: i.stockValue,
        categoryName: i.categoryName,
      }));

    // Recent 5 transactions
    const recentTransactions = await this.getStockTransactions(5);

    return {
      totalItems,
      totalInventoryValue,
      lowStockItems,
      outOfStockItems,
      warehousesCount: warehouses.length,
      todayMovements,
      todayPurchases,
      todaySales,
      topValueItems,
      recentTransactions,
    };
  }
}
