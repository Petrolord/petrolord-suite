import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

// verify-bank-transfer
// --------------------------------------------------------------------------
// Buyer-side: a customer who paid by bank transfer uploads their proof of
// payment from the Quote Dashboard ("Upload Payment Proof"). We:
//   1. store the file in the public `quotes` storage bucket,
//   2. upsert a PENDING subscription row carrying the proof URL (this is the
//      row the admin queue reads — AdminOrganizations.jsx),
//   3. move the quote + organization into PENDING_VERIFICATION,
//   4. notify sales so someone reviews and approves it.
// No access is provisioned here — that happens only on admin approval via
// activate-bank-transfer. This intentionally mirrors the manual nature of a
// bank transfer (a human must confirm the funds landed).

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf"
};

function extOf(name: string): string {
  const m = (name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "bin";
}

// Coerce the quote's jsonb `modules` (strings or objects) into a plain text[]
// for subscriptions.modules (a Postgres text[] / NOT NULL column).
function toModuleSlugs(modules: unknown): string[] {
  if (!Array.isArray(modules)) return [];
  return modules
    .map((m) => {
      if (typeof m === "string") return m;
      if (m && typeof m === "object") {
        const o = m as Record<string, unknown>;
        return String(o.id ?? o.key ?? o.slug ?? o.name ?? "").trim();
      }
      return String(m ?? "").trim();
    })
    .filter((s) => s.length > 0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { quote_id, user_id, fileBase64, fileName } = await req.json();

    if (!quote_id) throw new Error("Missing quote_id");
    if (!fileBase64) throw new Error("Missing file data");

    // 1. Resolve the quote (quote_id is the human/text id, e.g. "Q-123").
    const { data: quote, error: quoteErr } = await supabase
      .from("quotes")
      .select(
        "id, quote_id, organization_id, total_amount, currency, billing_term, billing_period, modules, apps, seats, user_seats"
      )
      .eq("quote_id", quote_id)
      .maybeSingle();

    if (quoteErr) throw quoteErr;
    if (!quote) throw new Error(`Quote not found: ${quote_id}`);

    const orgId = quote.organization_id;
    if (!orgId) throw new Error("Quote is not linked to an organization");

    // 2. Decode + upload the proof file to the public `quotes` bucket.
    const ext = extOf(fileName);
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    const binary = atob(fileBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const path = `proofs/${quote.quote_id}-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("quotes")
      .upload(path, bytes, { contentType, upsert: true });
    if (uploadErr) throw uploadErr;

    const { data: pub } = supabase.storage.from("quotes").getPublicUrl(path);
    const proofUrl = pub.publicUrl;

    // 3. Build the subscription payload (respecting NOT NULL columns).
    const term = quote.billing_term || "annual";
    const billingPeriod =
      quote.billing_period || (/month/i.test(term) ? "monthly" : "annual");
    const userLimit = quote.user_seats || quote.seats || 1;

    // Provisional end date (recomputed from the activation date on approval).
    const start = new Date();
    const end = new Date(start);
    if (billingPeriod === "monthly") end.setMonth(end.getMonth() + 1);
    else end.setFullYear(end.getFullYear() + 1);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const quoteDetails = {
      quote_id: quote.quote_id,
      quote_uuid: quote.id,
      total_amount: quote.total_amount,
      currency: quote.currency || "USD",
      billing_term: term,
      apps: quote.apps ?? [],
      modules: quote.modules ?? [],
      seats: userLimit,
      submitted_by: user_id ?? null,
      payment_method: "bank_transfer"
    };

    const subRow = {
      organization_id: orgId,
      quote_id: quote.id, // subscriptions.quote_id is uuid -> quotes.id
      modules: toModuleSlugs(quote.modules),
      user_limit: userLimit,
      term,
      billing_period: billingPeriod,
      start_date: startDate,
      end_date: endDate,
      status: "pending",
      payment_status: "PENDING",
      bank_transfer_proof_url: proofUrl,
      quote_details: quoteDetails,
      updated_at: new Date().toISOString()
    };

    // 4. Upsert: reuse an existing subscription for this quote (e.g. the buyer
    //    re-uploads a clearer receipt) instead of stacking duplicate rows.
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("organization_id", orgId)
      .eq("quote_id", quote.id)
      .limit(1)
      .maybeSingle();

    let subscriptionId: string;
    if (existing?.id) {
      const { error: updErr } = await supabase
        .from("subscriptions")
        .update(subRow)
        .eq("id", existing.id);
      if (updErr) throw updErr;
      subscriptionId = existing.id;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("subscriptions")
        .insert(subRow)
        .select("id")
        .single();
      if (insErr) throw insErr;
      subscriptionId = inserted.id;
    }

    // 5. Move quote + org into the verification queue.
    const { error: quoteUpdErr } = await supabase
      .from("quotes")
      .update({ status: "PENDING_VERIFICATION", updated_at: new Date().toISOString() })
      .eq("id", quote.id);
    if (quoteUpdErr) throw quoteUpdErr;

    const { error: orgUpdErr } = await supabase
      .from("organizations")
      .update({ suite_status: "PENDING_VERIFICATION" })
      .eq("id", orgId);
    if (orgUpdErr) throw orgUpdErr;

    // 6. Notify sales (best-effort — never block the upload on email).
    try {
      await supabase.functions.invoke("send-email-via-smtp", {
        body: JSON.stringify({
          to: "sales@petrolord.com",
          subject: `Payment proof uploaded: ${quote.quote_id}`,
          html:
            `<p>A bank-transfer payment proof was uploaded and needs verification.</p>` +
            `<p><strong>Quote:</strong> ${quote.quote_id}</p>` +
            `<p><strong>Amount:</strong> ${quote.currency || "USD"} ${quote.total_amount}</p>` +
            `<p><a href="${proofUrl}">View proof</a></p>` +
            `<p>Approve it in Admin &rarr; Organizations (Pending Verification).</p>`
        })
      });
    } catch (mailErr) {
      console.error("Sales notification failed (non-fatal):", mailErr);
    }

    return json({
      success: true,
      subscription_id: subscriptionId,
      proof_url: proofUrl
    });
  } catch (error) {
    console.error("verify-bank-transfer error:", error);
    return json({ success: false, error: (error as Error).message }, 400);
  }
});
