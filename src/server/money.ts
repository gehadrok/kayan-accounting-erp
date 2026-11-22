/**
 * Central monetary rounding rules (PHASE 9.4.2).
 *
 * The database persists money at NUMERIC(18,4) for stock costs and at whole
 * currency units (2 decimals) for invoice/journal economics. All rounding in
 * services must go through these helpers so that:
 * - a persisted stock line always satisfies total == round4(quantity * unit)
 *   with the STORED (rounded) unit — the same numbers the ledger replay
 *   consumes — instead of a raw float product that the database then rounds
 *   across an integer boundary (e.g. 29999.999999999996 -> 30000.0000);
 * - invoice/journal amounts keep exact decimal semantics at 2 decimals.
 *
 * What this does NOT promise: making a persisted movement total exactly equal
 * a journal amount when the true net unit cost is fractional beyond 4dp
 * (e.g. a discount of 1 spread over 3 units). That residual is bounded by
 * (qty + 1) * 5e-5 — outer rounding (<= 5e-5) plus per-unit rounding carried
 * over qty (<= qty * 5e-5), plus float dust — and is documented at the call
 * sites, never auto-posted to any expense/income account.
 *
 * PHASE 9.4.4 exception: PURCHASE_RECEIPT lines may carry an explicit
 * totalCost (the exact invoice line net); the engine then persists and
 * replays that total verbatim, so movement == journal exactly and the
 * residual above does not apply.
 */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
