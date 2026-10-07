-- V4__audit.sql: Audit Trail schema for Kayan Accounting ERP
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  username VARCHAR(100),
  action VARCHAR(50) NOT NULL, -- LOGIN, CREATE, UPDATE, POST, REVERSE, DELETE_ATTEMPT, EXPORT, PRINT
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100),
  old_data JSONB,
  new_data JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit.audit_logs (timestamp DESC);
