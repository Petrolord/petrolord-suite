// Suite promo codes (early-adopter discounts), modeled on the NextGen
// bridge-code flow: validate at quote time, burn at payment provisioning.
// The table is service-role only; these helpers are the only access path.
//
// Lifecycle:
//   * quote time -> validatePromoCode() inside generate-quote (and the
//     verify-promo-code function for the checkout UI's Apply button)
//   * paid       -> redeemPromoForQuote() from the payment finalizers,
//     idempotent via quotes.promo_redeemed_at

export interface PromoValidation {
  code: string;
  percent: number;
  scope: string; // 'all' or a master_apps.module name
  status: "valid" | "inactive" | "expired" | "exhausted";
}

// Returns null when the code is unknown.
// deno-lint-ignore no-explicit-any
export async function validatePromoCode(supabase: any, rawCode: string): Promise<PromoValidation | null> {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return null;

  const { data: row, error } = await supabase.from("suite_promo_codes")
    .select("code, percent, scope, max_redemptions, redeemed_count, expires_at, active")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  let status: PromoValidation["status"] = "valid";
  if (!row.active) status = "inactive";
  else if (row.expires_at && new Date(row.expires_at) < new Date()) status = "expired";
  else if (row.max_redemptions != null && row.redeemed_count >= row.max_redemptions) status = "exhausted";

  return { code: row.code, percent: Number(row.percent), scope: row.scope || "all", status };
}

// Burn the quote's promo code after payment. Self-guarding no-op when the
// quote carries no code or was already redeemed; never blocks provisioning.
// The count increment is atomic; a cap reached between quote and payment is
// honored anyway (the customer already paid the discounted total) and only
// stops NEW quotes from using the code.
// deno-lint-ignore no-explicit-any
export async function redeemPromoForQuote(supabase: any, quoteTextId: string, provider: string): Promise<void> {
  try {
    const { data: quote } = await supabase.from("quotes")
      .select("id, promo_code, promo_redeemed_at")
      .eq("quote_id", quoteTextId)
      .maybeSingle();
    if (!quote?.promo_code || quote.promo_redeemed_at) return;

    const { error: incrError } = await supabase.rpc("increment_promo_redemption", { p_code: quote.promo_code });
    if (incrError) console.error(`[promo] counter increment failed for ${quote.promo_code}:`, incrError.message);

    await supabase.from("quotes").update({
      promo_redeemed_at: new Date().toISOString(),
    }).eq("id", quote.id);
    console.log(`[promo] ${quote.promo_code} redeemed for ${quoteTextId} via ${provider}`);
  } catch (err) {
    console.error(`[promo] redemption failed for ${quoteTextId} (non-fatal):`, (err as Error).message);
  }
}
