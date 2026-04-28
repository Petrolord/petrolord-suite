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
      // Sync quote and org status
      await supabase.from('quotes').update({
        status: 'ACCEPTED',
        payment_verified: true,
        paystack_reference: reference
      }).eq('id', quote_id);
      const { data: quote } = await supabase.from('quotes').select('organization_id').eq('id', quote_id).single();
      if (quote) {
        await supabase.from('organizations').update({
          suite_status: 'ACTIVE'
        }).eq('id', quote.organization_id);
      // Note: Full subscription creation logic should ideally be triggered here too, 
      // or via the 'verify-paystack-payment' function which can be called internally or by the client.
      // For robustness, we rely on the client redirect or manual verification for the subscription row creation
      // unless we duplicate the logic here.
      }
    }
  }
  return new Response("Webhook received", {
    status: 200
  });
});
