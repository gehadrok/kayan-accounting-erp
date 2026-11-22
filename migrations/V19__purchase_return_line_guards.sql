-- V19__purchase_return_line_guards.sql (PHASE 9.4.3-D)
-- Defense-in-depth for purchasing.purchase_return_lines.discount (added by
-- V17 without a CHECK, unlike its V12 siblings quantity / unit_price / tax).
--
-- Need assessment: the sole application writer (POST /purchasing/returns)
-- derives discountShare = allocateCumulative(origDiscount, ...) over an
-- original discount that the schema already constrains to >= 0, and the
-- cumulative round2 difference of a monotonic sequence is provably
-- non-negative — so no application path can persist a negative share.
-- Only out-of-band SQL could. This guard closes that hole at the DB level.
--
-- Handling of pre-existing data: any discount < 0 aborts the migration
-- LOUDLY with a clear message. Nothing is silently repaired or deleted;
-- the operator investigates and cleanses, then re-runs. Application-written
-- histories (including legacy rows defaulting to 0) can contain no
-- negatives, so compliant databases apply cleanly.
-- Re-running this file is harmless (violation check + existence guards).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM purchasing.purchase_return_lines WHERE discount < 0
  ) THEN
    RAISE EXCEPTION 'V19 blocked: negative purchasing.purchase_return_lines.discount rows exist — investigate and cleanse before applying';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_prl_discount_nonnegative'
  ) THEN
    ALTER TABLE purchasing.purchase_return_lines
      ADD CONSTRAINT chk_prl_discount_nonnegative
      CHECK (discount >= 0);
  END IF;
END $$;
