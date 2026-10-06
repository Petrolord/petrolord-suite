// Seismic storage tiers on paid quotes (owner-approved 2026-10-06). A quote
// carries its tier in pricing_breakdown.seismic_storage (generate-quote);
// every payment rail grants it through upsertSuiteSubscription, and
// process-subscription-renewals extends it with the subscription.

/** The seismic storage tier a quote paid for (pricing_breakdown.seismic_storage.tier_key), or null. */
// deno-lint-ignore no-explicit-any
export function seismicTierOf(quote: any): string | null {
  const key = quote?.pricing_breakdown?.seismic_storage?.tier_key;
  return typeof key === "string" && key ? key : null;
}

/**
 * Grant or extend an organisation's seismic storage tier until the end of the
 * paid term (the last moment of endDate, UTC). seismic_storage_set_tier reads
 * the size from the catalogue and never shortens a later end date, so a second
 * finalizer or a renewal is safe. Best-effort: logged, never throws.
 */
// deno-lint-ignore no-explicit-any
export async function grantSeismicStorage(supabase: any, orgId: string, tierKey: string | null, endDate: string, quoteUuid: string | null, logPrefix = "[provision]"): Promise<boolean> {
  if (!tierKey || !orgId) return false;
  try {
    const { error } = await supabase.rpc("seismic_storage_set_tier", {
      p_organization_id: orgId,
      p_tier_key: tierKey,
      p_active_until: `${endDate.slice(0, 10)}T23:59:59Z`,
      p_source_quote_id: quoteUuid,
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.error(`${logPrefix} seismic storage tier grant failed (non-fatal, staff can set it):`, (e as Error).message);
    return false;
  }
}
