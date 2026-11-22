-- V16__purchase_return_integrity.sql (PHASE 9.3)
-- Link purchase return lines to their original purchase invoice lines so that
-- returnable quantities can be enforced (originalQty - previouslyPostedReturns).
--
-- Safety properties:
--   * Purely additive: one nullable column + indexes. No data deleted or altered.
--   * Legacy documents keep original_line_id NULL and remain untouched.
--   * Re-running this file is harmless (IF NOT EXISTS guards + constraint check).

-- 1. Link column (nullable: legacy rows stay NULL)
ALTER TABLE purchasing.purchase_return_lines
  ADD COLUMN IF NOT EXISTS original_line_id UUID;

-- 2. Referential integrity: keys must point at existing invoice lines.
--    Guarded so a second apply does not raise "duplicate constraint".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_prl_original_line'
  ) THEN
    ALTER TABLE purchasing.purchase_return_lines
      ADD CONSTRAINT fk_prl_original_line
      FOREIGN KEY (original_line_id)
      REFERENCES purchasing.purchase_invoice_lines(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- 3. Index for "sum of posted returns per original line" lookups
CREATE INDEX IF NOT EXISTS idx_prl_original_line
  ON purchasing.purchase_return_lines(original_line_id);

-- 4. Index for filtering return headers by posting status
CREATE INDEX IF NOT EXISTS idx_pr_returns_status
  ON purchasing.purchase_returns(status);
