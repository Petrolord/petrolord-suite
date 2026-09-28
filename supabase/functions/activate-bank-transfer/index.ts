import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";
import { redeemBridgeForQuote } from "../_shared/nextgen-bridge.ts";
import { subscriptionWindow, provisionedEnd } from "../_shared/billing-term.ts";

// activate-bank-transfer
// --------------------------------------------------------------------------
// Admin-side: an admin reviewed the uploaded proof in AdminOrganizations.jsx
// and clicked "Approve & Activate". We:
//   1. mark the subscription active + paid,
//   2. mark the quote payment_verified / ACCEPTED,
//   3. set the organization suite_status = ACTIVE,
//   4. call manual_verify_quote(text quote_id, uuid org_id, paid_at) to
//      provision the purchased modules/apps/seats — the same RPC the Paystack
//      flow uses. It also sets their end dates (renewals stack on a future
//      end, top-ups never shorten); the subscription then ends on that date.

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
    // deno-lint-ignore no-explicit-any
    let quoteRow: any = null;
    if (sub.quote_id) {
      const { data: quote } = await supabase
        .from("quotes")
        .select("id, quote_id, organization_id, billing_term, billing_period")
        .eq("id", sub.quote_id)
        .maybeSingle();
      if (quote) { textQuoteId = quote.quote_id; quoteRow = quote; }
    }

    // 3. Activate the subscription. The window starts today (approval is the
    //    payment date on this rail) and runs for the term paid for, from the
    //    shared term table the RPC also uses (quarterly = 3 months; before
    //    2026-09-28 anything not monthly got a year here).
    const paidAt = new Date().toISOString();
    const { startDate, end } = subscriptionWindow(
      paidAt,
      quoteRow?.billing_term || sub.term,
      quoteRow?.billing_period || sub.billing_period
    );
    let endDate = end.toISOString().slice(0, 10);

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
      const { data: rpcResult, error: rpcErr } = await supabase.rpc("manual_verify_quote", {
        p_quote_id: textQuoteId,
        p_organization_id: orgId,
        p_paid_at: paidAt
      });
      if (rpcErr) {
        console.error("Provisioning error:", rpcErr);
        provisioningWarning = rpcErr.message;
      } else {
        // The RPC set the apps' end dates (a renewal stacks on a future end).
        // The subscription ends on the same date. No purchased_modules update
        // here: the RPC is the only place that sets those end dates.
        const provisioned = provisionedEnd(end, rpcResult).toISOString().slice(0, 10);
        if (provisioned !== endDate) {
          endDate = provisioned;
          const { error: endErr } = await supabase
            .from("subscriptions")
            .update({ end_date: endDate, next_renewal_date: endDate, updated_at: new Date().toISOString() })
            .eq("id", sub.id);
          if (endErr) {
            console.error("Subscription end date sync error:", endErr);
            provisioningWarning = `Access granted but the subscription end date was not updated: ${endErr.message}`;
          }
        }
      }
    } else {
      provisioningWarning =
        "Subscription has no linked quote; modules were not auto-provisioned.";
    }

    // 7. Burn the NextGen bridge code, if the quote carried one. Self-guarding
    //    no-op otherwise; never blocks the activation.
    if (textQuoteId) {
      await redeemBridgeForQuote(supabase, textQuoteId, 'bank_transfer');
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
