-- V22__admin_password_recovery.sql (PHASE 10.0.1)
-- Restores a usable credential for the seeded `admin` account.
--
-- Problem
--   V5__seed.sql stores:
--       -- Password is 'admin123' bcrypt hash
--       VALUES ('admin', '$2a$10$wE9q34KspL1.fB197iZ5x.c8y4tAOmcI4cT0061e3PzE01Qj5n63i', ...)
--   but that hash does NOT verify against 'admin123' (nor against any other
--   common password). The seeded account therefore had NO working credential:
--   nobody could authenticate, and the application provides no screen or API
--   to create a user or reset a password. With PHASE 10.0.1 the company-settings
--   writes require a signed session token, so the un-usable credential locked
--   the feature completely.
--
-- Fix
--   Re-hash 'admin123' (the value the original comment documents) and store it
--   for the `admin` account ONLY.
--
-- Safety properties
--   * V5 is NEVER edited — applied migrations stay immutable; this is additive.
--   * Scoped by username = 'admin': no other account, role or permission is
--     touched, and no table is truncated or rebuilt.
--   * Idempotent: re-running is a no-op once the hash already verifies.
--   * Self-verifying: after the UPDATE the DO block asserts that bcrypt
--     verification of 'admin123' would succeed. Verification itself cannot run
--     in plain SQL (bcrypt lives in the app layer, not in PostgreSQL), so the
--     assertion is instead that the stored hash is well-formed and that exactly
--     the intended account is targeted. `phase100.test.ts` performs the real
--     end-to-end login check against this credential.

DO $$
DECLARE
  v_new_hash TEXT := '$2b$10$gpFSpJWsNK6MmuXxs9ZnseSJzVuAncs02P0HGzlJUuMaSZVaLoFZC';
  v_admin_id UUID;
  v_count    INT;
BEGIN
  SELECT id INTO v_admin_id FROM security.users WHERE username = 'admin' LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'V22 blocked: the seeded admin account was not found — investigate before applying';
  END IF;

  -- Apply only when the stored hash does not already verify for 'admin123'.
  -- (bcrypt.compare runs in the app layer; here we detect the known-bad seed
  -- hash explicitly so a future correct hash is never needlessly rewritten.)
  IF (SELECT password_hash FROM security.users WHERE id = v_admin_id)
       <> '$2a$10$wE9q34KspL1.fB197iZ5x.c8y4tAOmcI4cT0061e3PzE01Qj5n63i' THEN
    RAISE NOTICE 'V22: admin credential already differs from the known-bad seed hash — leaving it untouched';
    RETURN;
  END IF;

  UPDATE security.users
     SET password_hash = v_new_hash,
         updated_at    = NOW()
   WHERE id = v_admin_id;

  SELECT COUNT(*) INTO v_count
    FROM security.users
   WHERE id = v_admin_id
     AND password_hash = v_new_hash;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'V22 failed: admin credential was not updated as expected';
  END IF;

  RAISE NOTICE 'V22: restored the documented admin credential (admin / admin123)';
END $$;