import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

// activate-bank-transfer
// --------------------------------------------------------------------------
// Admin-side: an admin reviewed the uploaded proof in AdminOrganizations.jsx
// and clicked "Approve & Activate". We:
//   1. mark the subscription active + paid,
//   2. mark the quote payment_verified / ACCEPTED,
//   3. set the organization suite_status = ACTIVE,
//   4. call manual_verify_quote(text quote_id, uuid org_id) to provision the
//      purchased modules/apps/seats — the same RPC the Paystack flow uses.

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

    const { subscription_id } = await req.json();
    if (!subscription_id) throw new Error("Missing subscription_id");

    // 1. Load the subscription.
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("id, organization_id, quote_id, term, billing_period")
      .eq("id", subscription_id)
      .maybeSingle();
    if (subErr) throw subErr;
    if (!sub) throw new Error(`Subscription not found: ${subscription_id}`);

    const orgId = sub.organization_id;

    // 2. Load the linked quote (subscriptions.quote_id is the quotes.id uuid;
    //    manual_verify_quote needs the text quote_id, e.g. "Q-123").
    let textQuoteId: string | null = null;
    if (sub.quote_id) {
      const { data: quote } = await supabase
        .from("quotes")
        .select("id, quote_id, organization_id")
        .eq("id", sub.quote_id)
        .maybeSingle();
      if (quote) textQuoteId = quote.quote_id;
    }

    // 3. Activate the subscription. Recompute the billing window from today.
    const billingPeriod =
      sub.billing_period || (/month/i.test(sub.term || "") ? "monthly" : "annual");
    const start = new Date();
    const end = new Date(start);
    if (billingPeriod === "monthly") end.setMonth(end.getMonth() + 1);
    else end.setFullYear(end.getFullYear() + 1);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const { error: subUpdErr } = await supabase
      .from("subscriptions")
      .update({
        status: "active",
        payment_status: "COMPLETED",
        start_date: startDate,
        end_date: endDate,
        next_renewal_date: endDate,
        renewal_status: "pending",
        updated_at: new Date().toISOString()
      })
      .eq("id", sub.id);
    if (subUpdErr) throw subUpdErr;

    // 4. Mark the quote verified + accepted.
    if (sub.quote_id) {
      const { error: quoteUpdErr } = await supabase
        .from("quotes")
        .update({
          payment_verified: true,
          payment_verified_at: new Date().toISOString(),
          status: "ACCEPTED",
          updated_at: new Date().toISOString()
        })
        .eq("id", sub.quote_id);
      if (quoteUpdErr) throw quoteUpdErr;
    }

    // 5. Activate the organization's suite access.
    const { error: orgUpdErr } = await supabase
      .from("organizations")
      .update({ suite_status: "ACTIVE" })
      .eq("id", orgId);
    if (orgUpdErr) throw orgUpdErr;

    // 6. Provision modules/apps/seats. A failure here does NOT roll back the
    //    activation (payment is real) — we surface a warning so the admin can
    //    re-run provisioning, mirroring the Paystack path's log-and-continue.
    let provisioningWarning: string | null = null;
    if (textQuoteId && orgId) {
      const { error: rpcErr } = await supabase.rpc("manual_verify_quote", {
        p_quote_id: textQuoteId,
        p_organization_id: orgId
      });
      if (rpcErr) {
        console.error("Provisioning error:", rpcErr);
        provisioningWarning = rpcErr.message;
      }
    } else {
      provisioningWarning =
        "Subscription has no linked quote; modules were not auto-provisioned.";
    }

    return json({
      success: true,
      subscription_id: sub.id,
      provisioning_warning: provisioningWarning
    });
  } catch (error) {
    console.error("activate-bank-transfer error:", error);
    return json({ success: false, error: (error as Error).message }, 400);
  }
});
