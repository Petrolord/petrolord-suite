// Stripe webhook — reliability backstop for provisioning.
//
// verify-stripe-payment handles the happy path (buyer redirects back and the
// page verifies). But if the buyer closes the tab before redirect, this webhook
// still provisions. It is signature-verified and idempotent on the session id,
// so it is safe for it and verify-stripe-payment to both fire.
//
// Requires STRIPE_WEBHOOK_SECRET (the whsec_... from the endpoint you create in
// the Stripe dashboard). Until that secret is set, this function rejects events.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { provisionPaidQuote } from "../_shared/provision-quote.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  if (!WEBHOOK_SECRET) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set");
    return new Response("Webhook secret not configured", { status: 500 });
  }
  if (!sig) return new Response("Missing stripe-signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", (err as Error).message);
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.payment_status !== "paid") {
        return new Response(JSON.stringify({ received: true, skipped: "not paid" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      // Idempotency: skip if verify-stripe-payment (or an earlier delivery) already provisioned.
      const { data: existing } = await supabase.from("payments")
        .select("id, status").eq("stripe_session_id", session.id).maybeSingle();
      if (existing && (existing.status === "success" || existing.status === "paid")) {
        return new Response(JSON.stringify({ received: true, deduped: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const quoteTextId = session.metadata?.quote_id as string | undefined;
      if (!quoteTextId) {
        console.error("[stripe-webhook] session missing quote_id metadata:", session.id);
        return new Response(JSON.stringify({ received: true, error: "no quote_id" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const amountTotal = (session.amount_total ?? 0) / 100;
      const currency = (session.currency ?? "usd").toUpperCase();
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;

      // Validate amount/currency against the quote before provisioning.
      const { data: quoteRow } = await supabase.from("quotes")
        .select("id, total_amount").eq("quote_id", quoteTextId).maybeSingle();
      const expected = Number(quoteRow?.total_amount ?? 0);
      const amountOk = currency === "USD" && Math.abs(amountTotal - expected) <= 0.01;

      const paymentRow = {
        stripe_session_id: session.id,
        stripe_payment_intent: paymentIntentId,
        stripe_customer_id: (session.customer as string) ?? null,
        provider: "stripe",
        quote_id: quoteRow?.id ?? null,
        amount: amountTotal,
        currency,
        status: amountOk ? "success" : "amount_mismatch",
        local_status: amountOk ? "success" : "amount_mismatch",
        payment_method: "stripe",
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (existing?.id) {
        await supabase.from("payments").update(paymentRow).eq("id", existing.id);
      } else {
        await supabase.from("payments").insert({ ...paymentRow, created_at: new Date().toISOString() });
      }

      if (!amountOk) {
        console.error(`[stripe-webhook] amount/currency mismatch for ${quoteTextId}: paid ${amountTotal} ${currency} vs ${expected} USD`);
        return new Response(JSON.stringify({ received: true, flagged: "amount_mismatch" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      await provisionPaidQuote(supabase, {
        quoteTextId,
        provider: "stripe",
        reference: session.id,
        amountPaid: amountTotal,
        currency,
        paidAt: new Date().toISOString(),
        customerEmail: session.customer_details?.email || session.customer_email || null,
        appOrigin: Deno.env.get("APP_URL") || "",
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[stripe-webhook] handler error:", (error as Error).message);
    // 500 so Stripe retries.
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
});
