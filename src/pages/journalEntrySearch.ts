/**
 * PHASE 10.5.2 — journal-entry search predicate.
 *
 * Root cause of the broken search: the LIST endpoint
 * (AccountingService.getJournalEntries) returns camelCase rows
 * (entryNumber / entryDate / ...), while the detail endpoint returns raw
 * snake_case rows. The component filtered on `entry_number` only, so entry
 * numbers from the list were never matchable.
 *
 * The predicate accepts BOTH shapes (list normalized or not), matches on the
 * entry number OR the description, and treats a blank search as "show all".
 * Kept pure so tests can cover both shapes without rendering the page.
 */
export function matchesEntrySearch(
  entry: { entryNumber?: string; entry_number?: string; description?: string } | null | undefined,
  search: string
): boolean {
  const query = (search || '').trim().toLowerCase();
  if (!query) return true;
  const entryNumber = String(entry?.entryNumber ?? entry?.entry_number ?? '').toLowerCase();
  const description = String(entry?.description ?? '').toLowerCase();
  return entryNumber.includes(query) || description.includes(query);
}

export default matchesEntrySearch;
