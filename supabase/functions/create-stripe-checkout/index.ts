// Create a Stripe Checkout Session for a quote (USD, international rail).
//
// Called by QuoteDashboard when the buyer chooses "Pay with card (USD)". The
// session is created at pay-time (not at quote-time) because Checkout Sessions
// expire; this also means the buyer always pays the current quote total.
//
// On success the buyer is redirected to Stripe's hosted page; when they finish,
// Stripe redirects to /payment/verify?provider=stripe&session_id=... which calls
// verify-stripe-payment. The stripe-webhook is the reliability backstop.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { corsHeaders } from "./cors.ts";

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

    const { quote_id, origin } = await req.json();
    if (!quote_id) throw new Error("quote_id is required");

    // Load the quote (quote_id is the human text id, e.g. "QT-...").
    const { data: quote, error: quoteError } = await supabase.from("quotes")
      .select("id, quote_id, organization_id, total_amount, currency, org_admin_email")
      .eq("quote_id", quote_id)
      .maybeSingle();
    if (quoteError) throw quoteError;
    if (!quote) throw new Error(`Quote ${quote_id} not found`);

    const total = Number(quote.total_amount);
    if (!(total > 0)) throw new Error(`Quote ${quote_id} has no positive total to charge`);

    // Stripe (foreign entity) charges real USD. Amount in cents.
    const unitAmount = Math.round(total * 100);
    const appOrigin = (origin || req.headers.get("origin") || Deno.env.get("APP_URL") || "").replace(/\/$/, "");
    const customerEmail = quote.org_admin_email || undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: unitAmount,
          product_data: {
            name: `Petrolord Suite subscription — ${quote.quote_id}`,
          },
        },
      }],
      customer_email: customerEmail,
      // Everything provisioning needs travels in metadata so the webhook is self-sufficient.
      metadata: {
        quote_id: quote.quote_id,
        quote_uuid: quote.id,
        organization_id: quote.organization_id,
      },
      success_url: `${appOrigin}/payment/verify?provider=stripe&session_id={CHECKOUT_SESSION_ID}&quote_id=${encodeURIComponent(quote.quote_id)}`,
      cancel_url: `${appOrigin}/dashboard/quote/${encodeURIComponent(quote.quote_id)}`,
    });

    // Record the session on the quote (mirrors paystack_link / paystack_reference).
    await supabase.from("quotes").update({
      stripe_session_id: session.id,
      stripe_checkout_url: session.url,
      updated_at: new Date().toISOString(),
    }).eq("quote_id", quote_id);

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[create-stripe-checkout] error:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
