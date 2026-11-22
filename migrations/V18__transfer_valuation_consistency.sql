-- V18__transfer_valuation_consistency.sql (PHASE 9.4.1)
-- Allow the explicit 'TRANSFER_COST' valuation policy on stock movements so
-- that both legs of an internal transfer persist and replay the SAME stored
-- value (at NUMERIC precision), instead of replaying the outbound leg from a
-- higher-precision running average and the inbound leg from a rounded cost.
--
-- Safety properties:
--   * Schema-only change: widens the CHECK list, touches NO existing rows.
--   * Legacy transfer rows (valuation_policy NULL or 'WAC') keep the exact
--     historical replay semantics — they are NOT reinterpreted.
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
      CHECK (valuation_policy IS NULL OR valuation_policy IN ('WAC', 'ORIGINAL_COST', 'TRANSFER_COST'));
  END IF;
END $$;
