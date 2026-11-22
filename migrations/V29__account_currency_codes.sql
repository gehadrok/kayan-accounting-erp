-- V29__account_currency_codes.sql
--
-- PHASE 11.0 — Excel chart-of-accounts import (@Column العملة).
--
-- The reference chart file (دليل.xlsx) produced by the legacy system carries
-- a per-account multi-currency token list (e.g. "$,R.S,R.Y," = USD/SAR/YER).
-- The imported accounts keep that value in a single normalized string
-- ("USD,SAR,YER") purely as chart metadata: it never couples into journal
-- lines or posting rules — the base ledger currency remains core.currencies.

ALTER TABLE accounting.accounts
  ADD COLUMN IF NOT EXISTS currency_codes TEXT;

COMMENT ON COLUMN accounting.accounts.currency_codes IS
  'Via Excel import: normalized currency tokens allowed for the account (e.g. USD,SAR,YER). Metadata only.';
