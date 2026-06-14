import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

// reject-bank-transfer
// --------------------------------------------------------------------------
// Admin-side: the uploaded proof was not valid. We mark the subscription
// rejected and roll the quote + organization back to "awaiting payment" so the
// buyer can pay again (Paystack) or re-upload a correct proof. No access is
// granted/removed here.

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

    const { subscription_id, reason } = await req.json();
    if (!subscription_id) throw new Error("Missing subscription_id");

    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("id, organization_id, quote_id")
      .eq("id", subscription_id)
      .maybeSingle();
    if (subErr) throw subErr;
    if (!sub) throw new Error(`Subscription not found: ${subscription_id}`);

    const { error: subUpdErr } = await supabase
      .from("subscriptions")
      .update({
        status: "rejected",
        payment_status: "REJECTED",
        suspension_reason: reason || "Bank transfer proof rejected by admin",
        updated_at: new Date().toISOString()
      })
      .eq("id", sub.id);
    if (subUpdErr) throw subUpdErr;

    // Roll the quote back to payable so the buyer can retry.
    if (sub.quote_id) {
      const { error: quoteUpdErr } = await supabase
        .from("quotes")
        .update({ status: "PENDING", updated_at: new Date().toISOString() })
        .eq("id", sub.quote_id);
      if (quoteUpdErr) throw quoteUpdErr;
    }

    const { error: orgUpdErr } = await supabase
      .from("organizations")
      .update({ suite_status: "PENDING_PAYMENT" })
      .eq("id", sub.organization_id);
    if (orgUpdErr) throw orgUpdErr;

    return json({ success: true, subscription_id: sub.id });
  } catch (error) {
    console.error("reject-bank-transfer error:", error);
    return json({ success: false, error: (error as Error).message }, 400);
  }
});
