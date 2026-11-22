-- V17__return_economics_integrity.sql (PHASE 9.4)
-- Valuation integrity for purchase returns linked to original invoice lines.
--
-- 1. inventory.stock_transactions.valuation_policy
--    Explicit per-movement valuation discriminator:
--      'WAC'           — ordinary perpetual weighted-average costing (default).
--      'ORIGINAL_COST' — linked purchase RETURN_OUT valued at the original
--                         invoice line's net unit cost after discount.
--    Legacy rows keep NULL and are treated exactly as 'WAC' (no reinterpretation
--    of historical movements). The policy is NEVER inferred from the free-text
--    reference_type column.
--
-- 2. purchasing.purchase_return_lines.discount
--    Persisted discount share allocated to the return line (proportional,
--    cumulative allocation — see Phase 9.4 endpoint). Legacy rows default to 0.
--
-- Safety properties:
--   * Purely additive: nullable/defaulted columns only. No data deleted or altered.
--   * No fabricated original-line links and no invented historical discounts.
--   * Re-running this file is harmless (IF NOT EXISTS guards + checks).
--
-- NOTE (documented scope decision): sales_return_lines intentionally receives
-- NO new linkage/discount columns here. Sales-return valuation and behavior are
-- frozen by design in Phase 9.4, so an unused FK column would be dead schema.

-- 1. Valuation policy discriminator on stock movements
ALTER TABLE inventory.stock_transactions
  ADD COLUMN IF NOT EXISTS valuation_policy VARCHAR(20) DEFAULT 'WAC';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_tx_valuation_policy'
  ) THEN
    ALTER TABLE inventory.stock_transactions
      ADD CONSTRAINT chk_stock_tx_valuation_policy
      CHECK (valuation_policy IS NULL OR valuation_policy IN ('WAC', 'ORIGINAL_COST'));
  END IF;
END $$;

-- 2. Persisted discount share on purchase return lines
ALTER TABLE purchasing.purchase_return_lines
  ADD COLUMN IF NOT EXISTS discount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000;
