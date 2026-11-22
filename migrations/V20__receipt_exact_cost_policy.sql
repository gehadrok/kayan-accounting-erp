-- V20__receipt_exact_cost_policy.sql (PHASE 9.4.4)
-- Allow the explicit 'EXACT_COST' valuation policy on stock movements so that
-- purchase receipts can persist the exact invoice line net (2dp money) as
-- their total instead of re-deriving it from a 4dp-rounded unit cost — which
-- breaks reconciliation past 0.001 for large quantities with fractional nets
-- (e.g. 60 x 4,000 - 1 stored 239,998.998 against a 239,999 journal).
--
-- Safety properties:
--   * Schema-only change: widens the CHECK list, touches NO existing rows.
--   * Legacy receipt rows (valuation_policy NULL or 'WAC') keep the exact
--     historical replay semantics (qty x stored unit) — they are NOT
--     reinterpreted, which is why a distinct policy value (rather than
--     inference) is required.
--   * Re-running this file is harmless (existence guards on the constraint).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_tx_valuation_policy'
  ) THEN
    ALTER TABLE inventory.stock_transactions
      DROP CONSTRAINT chk_stock_tx_valuation_policy;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_tx_valuation_policy'
  ) THEN
    ALTER TABLE inventory.stock_transactions
      ADD CONSTRAINT chk_stock_tx_valuation_policy
      CHECK (valuation_policy IS NULL OR valuation_policy IN ('WAC', 'ORIGINAL_COST', 'TRANSFER_COST', 'EXACT_COST'));
  END IF;
END $$;
