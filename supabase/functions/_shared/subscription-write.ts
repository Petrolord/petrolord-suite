// One subscriptions row per (organization_id, quote_id), race-safe.
//
// Migration 20260929140000 adds the unique index subscriptions_org_quote_key
// on public.subscriptions (organization_id, quote_id). Every writer keyed by
// org + quote (the Suite and HSE provisioning in provision-quote.ts, and the
// bank-transfer proof upload in verify-bank-transfer) goes through here:
//
//   1. select the row for (org, quote); if found, update it by id;
//   2. otherwise insert;
//   3. if the insert loses a race (a concurrent finalizer inserted the same
//      org + quote between our select and our insert), Postgres answers 23505
//      on subscriptions_org_quote_key. Re-select the winner's row and update
//      it with the same row, so the loser's write lands and nothing throws.
//
// Before the index exists the insert never raises 23505, so this behaves
// exactly like the old select-then-update-or-insert (safe to deploy first).
// Rows with a NULL quote_id are never unique-checked (NULLs are distinct).
// Plain insert + fallback rather than upsert(onConflict): see PR notes. Never
// throws; the caller decides what an error means.

export const SUBSCRIPTIONS_ORG_QUOTE_KEY = "subscriptions_org_quote_key";

/** True when a PostgREST error is a unique violation on (organization_id, quote_id). */
export function isOrgQuoteConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  if (String(e.code ?? "") !== "23505") return false;
  const text = `${e.message ?? ""} ${e.details ?? ""}`;
  return text.includes(SUBSCRIPTIONS_ORG_QUOTE_KEY);
}

export interface SubscriptionWriteResult {
  id: string | null;       // the row written (inserted, or updated by id)
  error: unknown | null;   // the error that stopped the write, if any
  raced: boolean;          // true when the insert lost a race and we updated the winner
}

// deno-lint-ignore no-explicit-any
export async function writeSubscriptionForQuote(supabase: any, subRow: Record<string, any>): Promise<SubscriptionWriteResult> {
  const byOrgQuote = () => supabase.from("subscriptions")
    .select("id").eq("organization_id", subRow.organization_id).eq("quote_id", subRow.quote_id)
    .limit(1).maybeSingle();
  const updateById = async (id: string, raced: boolean): Promise<SubscriptionWriteResult> => {
    const { error } = await supabase.from("subscriptions").update(subRow).eq("id", id);
    return { id, error: error ?? null, raced };
  };

  const { data: existing } = await byOrgQuote();
  if (existing?.id) return updateById(existing.id, false);

  const { data: inserted, error: insErr } = await supabase.from("subscriptions").insert(subRow).select("id");
  if (!insErr) {
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return { id: row?.id ?? null, error: null, raced: false };
  }
  if (!isOrgQuoteConflict(insErr)) return { id: null, error: insErr, raced: false };

  // Lost the race: the winner's row exists now. Update it with our row.
  const { data: winner, error: reErr } = await byOrgQuote();
  if (reErr) return { id: null, error: reErr, raced: true };
  if (!winner?.id) return { id: null, error: insErr, raced: true };
  return updateById(winner.id, true);
}
