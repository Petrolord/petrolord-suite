// Verify a Stripe Checkout Session and provision the quote.
//
// Called by the /payment/verify page after Stripe redirects back with
// ?provider=stripe&session_id=... It retrieves the session server-side, requires
// it to be actually paid, validates the amount/currency against the quote (a gap
// the Paystack path never closed), then provisions via the shared helper.
// Idempotent on the session id, so the redirect page can poll safely.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { corsHeaders } from "./cors.ts";
import { provisionPaidQuote } from "../_shared/provision-quote.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { session_id, quote_id: quoteIdParam } = await req.json();
    if (!session_id) throw new Error("session_id is required");

    // Idempotency: already provisioned this session?
    const { data: existingPayment } = await supabase.from("payments")
      .select("id, status").eq("stripe_session_id", session_id).maybeSingle();
    if (existingPayment && (existingPayment.status === "success" || existingPayment.status === "paid")) {
      return new Response(JSON.stringify({ success: true, status: "success", message: "Payment already verified" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Retrieve the session (source of truth) with its payment intent.
    const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ["payment_intent"] });

    const quoteTextId = (session.metadata?.quote_id as string) || quoteIdParam;
    const orgId = session.metadata?.organization_id as string | undefined;
    const isPaid = session.payment_status === "paid";
    const amountTotal = (session.amount_total ?? 0) / 100; // cents -> major
    const currency = (session.currency ?? "usd").toUpperCase();
    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
    const customerEmail = session.customer_details?.email || session.customer_email || null;
    const paidAt = new Date().toISOString();

    if (!quoteTextId) throw new Error("Session is missing quote_id metadata");

    // Validate amount + currency against the quote BEFORE provisioning.
    // (Closes the underpay/wrong-currency gap the Paystack path left open.)
    let amountOk = true;
    let amountNote = "";
    if (isPaid) {
      const { data: quoteForCheck } = await supabase.from("quotes")
        .select("total_amount").eq("quote_id", quoteTextId).maybeSingle();
      const expected = Number(quoteForCheck?.total_amount ?? 0);
      // 1-cent tolerance for rounding; Stripe is real USD.
      if (currency !== "USD") { amountOk = false; amountNote = `currency ${currency} != USD`; }
      else if (Math.abs(amountTotal - expected) > 0.01) {
        amountOk = false;
        amountNote = `paid ${amountTotal} != quote total ${expected}`;
      }
    }

    // Upsert the payment record (unique on stripe_session_id).
    const paymentStatus = isPaid ? (amountOk ? "success" : "amount_mismatch") : (session.payment_status ?? "unpaid");
    const paymentRow = {
      stripe_session_id: session_id,
      stripe_payment_intent: paymentIntentId,
      stripe_customer_id: (session.customer as string) ?? null,
      provider: "stripe",
      quote_id: null as string | null, // set to quotes.id (uuid) below
      amount: amountTotal,
      currency,
      status: paymentStatus,
      local_status: paymentStatus,
      payment_method: "stripe",
      paid_at: isPaid ? paidAt : null,
      updated_at: new Date().toISOString(),
    };

    // Resolve quotes.id (uuid) for the FK.
    const { data: quoteRow } = await supabase.from("quotes")
      .select("id, organization_id").eq("quote_id", quoteTextId).maybeSingle();
    paymentRow.quote_id = quoteRow?.id ?? null;

    if (existingPayment?.id) {
      await supabase.from("payments").update(paymentRow).eq("id", existingPayment.id);
    } else {
      await supabase.from("payments").insert({ ...paymentRow, created_at: new Date().toISOString() });
    }

    if (!isPaid) {
      return new Response(JSON.stringify({ success: false, status: session.payment_status, message: `Payment status: ${session.payment_status}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!amountOk) {
      // Paid, but not what the quote demanded — do NOT provision. Flag for review.
      console.error(`[verify-stripe-payment] amount/currency mismatch for ${quoteTextId}: ${amountNote}`);
      return new Response(JSON.stringify({ success: false, status: "amount_mismatch", message: `Payment received but did not match the quote (${amountNote}). Our team will reconcile this — please contact support.` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Provision (shared with the webhook path).
    const appOrigin = req.headers.get("origin") || Deno.env.get("APP_URL") || "";
    const result = await provisionPaidQuote(supabase, {
      quoteTextId,
      provider: "stripe",
      reference: session_id,
      amountPaid: amountTotal,
      currency,
      paidAt,
      customerEmail,
      appOrigin,
    });

    if (!result.ok) throw new Error(result.error || "Provisioning failed");

    return new Response(JSON.stringify({ success: true, status: "success", message: "Payment verified successfully" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[verify-stripe-payment] error:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message, details: "Please contact support." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
