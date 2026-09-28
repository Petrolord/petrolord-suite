import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { isHseQuote, provisionPaidQuote } from "../_shared/provision-quote.ts";
import { loadNgnPerUsd, expectedNgnForQuote, checkPaystackAmount } from "../_shared/paystack-ngn.ts";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { paymentAlreadyProcessed } from "../_shared/payment-status.ts";
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: corsHeaders
  });
  // 1. Verify Signature
  const signature = req.headers.get('x-paystack-signature');
  if (!signature) return new Response("No signature", {
    status: 400
  });
  const bodyText = await req.text();
  const encoder = new TextEncoder();
  const keyData = encoder.encode(PAYSTACK_SECRET_KEY);
  const key = await crypto.subtle.importKey("raw", keyData, {
    name: "HMAC",
    hash: "SHA-512"
  }, false, [
    "verify"
  ]);
  const signatureBytes = Uint8Array.from(signature.match(/.{1,2}/g).map((byte)=>parseInt(byte, 16)));
  const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(bodyText));
  if (!isValid) {
    return new Response("Invalid signature", {
      status: 401
    });
  }
  const event = JSON.parse(bodyText);
  // 2. Handle Event
  if (event.event === 'charge.success') {
    const { reference, metadata, status, paid_at, channel, amount } = event.data;
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Idempotency: already processed by this webhook ('COMPLETED') or by the
    // verify page ('success'). Before 2026-09-28 only 'COMPLETED' counted, so a
    // webhook landing after the verify page re-ran provisioning.
    const { data: existing } = await supabase.from('payments').select('status, local_status').eq('paystack_reference', reference).maybeSingle();
    if (paymentAlreadyProcessed(existing)) {
      return new Response("Already processed", {
        status: 200
      });
    }
    await supabase.from('payments').update({
      status: 'COMPLETED',
      paid_at: paid_at,
      payment_method: channel,
      updated_at: new Date()
    }).eq('paystack_reference', reference);
    const quote_id = metadata?.quote_id;
    if (quote_id) {
      // HSE Professional quotes provision an HSE app grant instead of Suite
      // entitlements — the shared helper branches on the quote's modules (it
      // also marks the quote paid). Suite quotes continue below untouched.
      const { data: quoteForRouting } = await supabase.from('quotes')
        .select('modules, payment_verified, total_amount, pricing_breakdown').eq('quote_id', quote_id).maybeSingle();
      // Grant nothing unless Paystack collected the naira the quote asks for
      // (see _shared/paystack-ngn.ts). Acknowledge with 200 so Paystack does
      // not retry; the mismatch is logged for support to resolve.
      if (quoteForRouting) {
        let check;
        try {
          const expectedNgn = expectedNgnForQuote(quoteForRouting, await loadNgnPerUsd(supabase));
          check = checkPaystackAmount({ paidKobo: Number(amount), currency: event.data?.currency, expectedNgn });
        } catch (e) {
          check = { ok: false, reason: e.message };
        }
        if (!check.ok) {
          console.error(`[paystack-webhook] amount mismatch on ${quote_id}: ${check.reason}`);
          const { data: pay } = await supabase.from('payments').select('id').eq('paystack_reference', reference).maybeSingle();
          await supabase.from('payments').update({ local_status: 'amount_mismatch', updated_at: new Date() }).eq('paystack_reference', reference);
          await supabase.from('payment_audit_log').insert({
            payment_id: pay?.id ?? null,
            action: 'amount_mismatch',
            details: { quote_id, reason: check.reason, paid_kobo: amount, currency: event.data?.currency, source: 'webhook' }
          });
          return new Response("Amount mismatch recorded", { status: 200 });
        }
      }
      if (quoteForRouting && isHseQuote(quoteForRouting.modules)) {
        // Idempotency: the redirect verify path may have provisioned already.
        if (quoteForRouting.payment_verified) {
          return new Response("Already processed", { status: 200 });
        }
        const result = await provisionPaidQuote(supabase, {
          quoteTextId: quote_id,
          provider: 'paystack',
          reference,
          amountPaid: (amount ?? 0) / 100,
          currency: event.data?.currency,
          paidAt: paid_at || new Date().toISOString(),
          customerEmail: event.data?.customer?.email || null,
          appOrigin: ''
        });
        if (!result.ok) console.error('[paystack-webhook] HSE provisioning error:', result.error);
        return new Response("Webhook received", { status: 200 });
      }
      // The Paystack reference IS the text quote_id (e.g. "QT-..."), so match the
      // quote on quote_id — NOT on id (a uuid). The previous .eq('id', quote_id)
      // matched zero rows, so the webhook never actually marked quotes paid.
      await supabase.from('quotes').update({
        status: 'ACCEPTED',
        payment_verified: true,
        payment_verified_at: paid_at || new Date().toISOString(),
        paystack_reference: reference,
        updated_at: new Date().toISOString()
      }).eq('quote_id', quote_id);
      // Everything else is the same provisioning the verify page and Stripe
      // run (2026-09-28): manual_verify_quote with the paid date (it sets the
      // end dates: renewals stack, top-ups never shorten, re-runs change
      // nothing), quote paid, org active, bridge and promo codes burned, the
      // subscriptions row keyed by org + quote (no duplicate if the verify
      // page also runs), HSE with Suite, and the confirmation email. Before,
      // a payer who never returned to the verify page got no subscription row
      // and no end dates.
      const customerEmail = event.data?.customer?.email || null;
      const result = await provisionPaidQuote(supabase, {
        quoteTextId: quote_id,
        provider: 'paystack',
        reference,
        amountPaid: (amount ?? 0) / 100,
        currency: event.data?.currency,
        paidAt: paid_at || new Date().toISOString(),
        customerEmail,
        appOrigin: Deno.env.get('APP_URL') || ''
      });
      if (!result.ok) console.error('[paystack-webhook] Suite provisioning error:', result.error);
      else if (customerEmail) {
        // provisionPaidQuote sent the email; the verify page checks this flag.
        await supabase.from('payments').update({ notification_sent: true }).eq('paystack_reference', reference);
      }
    }
  }
  return new Response("Webhook received", {
    status: 200
  });
});
