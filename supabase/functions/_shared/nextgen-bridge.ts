// Cross-project bridge to the NextGen Academy Supabase project.
//
// Owner Q3 (locked 2026-07-15): an Expert certification in the Academy
// auto-issues a personal, single-use discount code (PLB-..., default
// 50%) for the certified Suite module, valid for the certificate's
// 12-month window. The code lives in the NextGen project
// (academy_suite_bridge_codes); the Suite is a remote caller:
//   * quote time  -> academy_verify_bridge_code (anon-grade RPC)
//   * paid        -> academy_redeem_bridge_code (service-role RPC,
//                    single use, idempotent on re-calls)
//
// Secrets (Suite edge functions): NEXTGEN_SUPABASE_URL,
// NEXTGEN_ANON_KEY (verify), NEXTGEN_SERVICE_ROLE_KEY (redeem).

const NEXTGEN_URL = (Deno.env.get("NEXTGEN_SUPABASE_URL") ?? "").replace(/\/$/, "");
const NEXTGEN_ANON_KEY = Deno.env.get("NEXTGEN_ANON_KEY") ?? "";
const NEXTGEN_SERVICE_ROLE_KEY = Deno.env.get("NEXTGEN_SERVICE_ROLE_KEY") ?? "";

export interface BridgeVerification {
  code: string;
  holder: string;
  app_slug: string;
  suite_module: string;
  discount_pct: number;
  certificate_number: string;
  valid_until: string;
  status: "valid" | "redeemed" | "expired" | "voided";
}

async function nextgenRpc(fn: string, body: unknown, key: string): Promise<unknown> {
  const res = await fetch(`${NEXTGEN_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NextGen ${fn} responded ${res.status}: ${text.slice(0, 300)}`);
  }
  return await res.json();
}

export function bridgeVerifyConfigured(): boolean {
  return Boolean(NEXTGEN_URL && NEXTGEN_ANON_KEY);
}

export function bridgeRedeemConfigured(): boolean {
  return Boolean(NEXTGEN_URL && NEXTGEN_SERVICE_ROLE_KEY);
}

// Returns null when the code is unknown (the RPC yields SQL NULL).
export async function verifyBridgeCode(code: string): Promise<BridgeVerification | null> {
  const data = await nextgenRpc(
    "academy_verify_bridge_code",
    { p_code: code.trim() },
    NEXTGEN_ANON_KEY,
  );
  return (data as BridgeVerification | null) ?? null;
}

// Post-payment redemption for a paid quote. Self-guarding and
// non-throwing: provisioning must never fail because the Academy is
// unreachable. Idempotency is quote-side (bridge_redemption written
// exactly once) AND code-side (the RPC reports already_redeemed
// instead of failing a retry). Every finalizer calls this; extra
// calls are no-ops.
// deno-lint-ignore no-explicit-any
export async function redeemBridgeForQuote(supabase: any, quoteTextId: string, provider: string): Promise<void> {
  try {
    if (!quoteTextId) return;
    const { data: q } = await supabase.from("quotes")
      .select("id, quote_id, organization_id, bridge_code, bridge_redemption")
      .eq("quote_id", quoteTextId)
      .maybeSingle();
    if (!q?.bridge_code || q.bridge_redemption) return;
    if (!bridgeRedeemConfigured()) {
      console.error(`[Bridge] quote ${q.quote_id} has code ${q.bridge_code} but redeem secrets are missing`);
      return;
    }
    const note = `suite quote ${q.quote_id} org ${q.organization_id ?? "none"} via ${provider}`;
    const result = await nextgenRpc(
      "academy_redeem_bridge_code",
      { p_code: q.bridge_code, p_note: note },
      NEXTGEN_SERVICE_ROLE_KEY,
    ) as Record<string, unknown>;
    await supabase.from("quotes").update({
      bridge_redemption: result,
      bridge_redeemed_at: result?.status === "redeemed" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", q.id);
    // A clean first redemption ends here. Anything else (code burned by
    // another checkout, voided by cert revocation, expired between quote
    // and payment) means the discount was honored without a live code:
    // flag it for the commercial follow-up the NG7 spine defers to humans.
    if (result?.status !== "redeemed" || result?.already_redeemed) {
      console.warn(`[Bridge] abnormal redemption on ${q.quote_id}: ${JSON.stringify(result)}`);
      try {
        await supabase.from("payment_audit_log").insert({
          action: "bridge_redemption_flagged",
          details: {
            quote_id: q.quote_id,
            organization_id: q.organization_id,
            bridge_code: q.bridge_code,
            provider,
            redemption: result,
          },
        });
      } catch (auditErr) {
        console.error(`[Bridge] audit log insert failed: ${auditErr?.message ?? auditErr}`);
      }
    } else {
      console.log(`[Bridge] redeemed ${q.bridge_code} for ${q.quote_id}`);
    }
  } catch (e) {
    // Leave bridge_redemption null so the next finalizer retries.
    console.error(`[Bridge] redemption attempt failed for ${quoteTextId}: ${e?.message ?? e}`);
  }
}
