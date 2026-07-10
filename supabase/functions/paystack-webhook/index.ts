import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
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
    // Idempotency: Check if already processed
    const { data: existing } = await supabase.from('payments').select('status').eq('paystack_reference', reference).single();
    if (existing && existing.status === 'COMPLETED') {
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
      const { data: quote } = await supabase.from('quotes').select('organization_id').eq('quote_id', quote_id).maybeSingle();
      if (quote?.organization_id) {
        await supabase.from('organizations').update({
          suite_status: 'ACTIVE'
        }).eq('id', quote.organization_id);
        // Provision the purchased modules/apps/seats — same RPC the redirect/manual
        // verify path uses. Best-effort: a provisioning error must not fail the webhook.
        const { error: rpcErr } = await supabase.rpc('manual_verify_quote', {
          p_quote_id: quote_id,
          p_organization_id: quote.organization_id
        });
        if (rpcErr) console.error('Webhook provisioning error:', rpcErr.message);
      }
    }
  }
  return new Response("Webhook received", {
    status: 200
  });
});
