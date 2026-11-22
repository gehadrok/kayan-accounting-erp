/**
 * PHASE 10.5.3 — classification of core.settings keys for PUBLIC READS.
 *
 * GET /api/settings stays open so the application can boot (theme, formats
 * and module defaults are legitimately client-side). But core.settings is a
 * shared store: a FUTURE key that holds a credential (API token, SMTP
 * password, private key...) must never be echoed to an unauthenticated
 * client — not even as a "default value".
 *
 * Classification used across the system:
 *   * personal (ui.*)     — readable by all; writable by any signed-in user
 *                            (write gate: phase 10.5.2);
 *   * administrative      — readable by all (the settings hub displays them);
 *                            writable only with system.settings.manage
 *                            (write gate: phase 10.5.2);
 *   * SECRET              — NEVER returned by the HTTP settings read APIs.
 *                            Matched by credential-shaped patterns so any
 *                            future secret-like key is hidden by DEFAULT,
 *                            without waiting for a code change.
 *
 * Scope: this filter applies to HTTP responses only. Server-side consumers
 * (SettingsService.getSetting, module services) still see every key — they
 * run inside the trusted process.
 */

const SECRET_KEY_PATTERN = /(password|passwd|secret|token|api[_-]?key|private[_-]?key|credential|smtp_)/i;

/** True when a settings key must never be returned by settings read APIs. */
export function isSecretSettingKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(String(key || ''));
}

/**
 * Drops secret rows from a module-grouped settings payload
 * (shape: { MODULE: [{ key, value, ... }, ...] }). Returns a new object;
 * the input is not mutated. Empty groups are omitted.
 */
export function stripSecretSettings<T extends { key: string }>(
  grouped: Record<string, T[]> | null | undefined
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const [mod, rows] of Object.entries(grouped || {})) {
    const kept = (Array.isArray(rows) ? rows : []).filter((row) => row && !isSecretSettingKey(row.key));
    if (kept.length > 0) out[mod] = kept;
  }
  return out;
}
