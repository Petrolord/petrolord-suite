import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";
import { redeemBridgeForQuote } from "../_shared/nextgen-bridge.ts";
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");

// Coerce the quote's jsonb `modules` (strings or objects) into a plain text[]
// for subscriptions.modules (a Postgres text[] / NOT NULL column). Mirrors
// verify-bank-transfer so both payment paths produce identical subscription rows.
function toModuleSlugs(modules) {
  if (!Array.isArray(modules)) return [];
  return modules
    .map((m) => {
      if (typeof m === "string") return m;
      if (m && typeof m === "object") return String(m.id ?? m.key ?? m.slug ?? m.name ?? "").trim();
      return String(m ?? "").trim();
    })
    .filter((s) => s.length > 0);
}

serve(async (req)=>{
  // 1. Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { reference, quote_id, user_email } = await req.json();
    if (!reference) {
      throw new Error("No transaction reference provided");
    }
    // --- Task 5: Idempotency & Initial DB Check ---
    // Check if this reference has already been successfully processed locally
    const { data: existingPayment } = await supabase.from("payments").select("*").eq("paystack_reference", reference).maybeSingle();
    if (existingPayment) {
      // Task 8: Enhanced Audit Log
      await supabase.from("payment_audit_log").insert({
        payment_id: existingPayment.id,
        action: 'verification_started',
        details: {
          reference,
          quote_id,
          attempt_type: 'frontend_polling'
        }
      });
      // If already successful, return immediately (Idempotency)
      if (existingPayment.status === 'success' || existingPayment.local_status === 'success') {
        await supabase.from("payment_audit_log").insert({
          payment_id: existingPayment.id,
          action: 'idempotency_check',
          details: {
            message: 'Payment already verified previously',
            status: 'success'
          }
        });
        return new Response(JSON.stringify({
          success: true,
          message: "Payment already verified",
          payment: existingPayment
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
    } else {
      // If payment record doesn't exist yet, we might need to create it or it's a ghost reference
      // Ideally, generate-paystack-link creates the pending record.
      console.warn(`Payment record for reference ${reference} not found. Proceeding to verify with Paystack to potentially recover.`);
    }
    // --- Task 4 & 6: Verification with Retry Logic & Reconciliation ---
    let paystackData = null;
    let retryCount = 0;
    const maxRetries = 5;
    const backoffDelays = [
      1000,
      2000,
      4000,
      8000,
      16000
    ]; // ms
    // Retry Loop
    while(retryCount < maxRetries){
      try {
        const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
          }
        });
        if (paystackResponse.ok) {
          const result = await paystackResponse.json();
          if (result.status === true) {
            paystackData = result.data;
            break; // Success, exit loop
          }
        }
        // If we get here, response wasn't OK or status wasn't true.
        throw new Error(`Paystack verification failed with status: ${paystackResponse.status}`);
      } catch (err) {
        console.error(`Paystack verification attempt ${retryCount + 1} failed:`, err);
        // Log retry to audit
        if (existingPayment) {
          await supabase.from("payment_audit_log").insert({
            payment_id: existingPayment.id,
            action: 'verification_retry',
            details: {
              attempt: retryCount + 1,
              error: err.message
            }
          });
          // Update payment record with retry stats
          await supabase.from("payments").update({
            webhook_retry_count: (existingPayment.webhook_retry_count || 0) + 1,
            webhook_last_retry_at: new Date().toISOString(),
            webhook_error_message: err.message
          }).eq('id', existingPayment.id);
        }
        retryCount++;
        if (retryCount < maxRetries) {
          const delay = backoffDelays[retryCount - 1] || 5000;
          await new Promise((resolve)=>setTimeout(resolve, delay));
        }
      }
    }
    if (!paystackData) {
      throw new Error("Failed to verify transaction with Paystack after multiple attempts.");
    }
    // --- Task 6: Reconciliation ---
    const paystackStatus = paystackData.status; // 'success', 'failed', 'abandoned'
    const isSuccess = paystackStatus === "success";
    const amountPaid = paystackData.amount / 100; // Paystack is in kobo
    const paymentDate = paystackData.paid_at || new Date().toISOString();
    // Find organization + the quote's uuid id from the text quote_id. The Paystack
    // reference is the TEXT quote_id (e.g. "QT-..."), but payments.quote_id is a
    // uuid FK to quotes.id — so we must resolve and store the uuid, not the text.
    let orgId = existingPayment?.organization_id;
    let paymentId = existingPayment?.id;
    let quoteUuid = null;
    let quoteRow = null;
    if (quote_id) {
      const { data: quote } = await supabase.from('quotes')
        .select('id, organization_id, total_amount, currency, billing_term, billing_period, modules, apps, seats, user_seats')
        .eq('quote_id', quote_id).maybeSingle();
      if (quote) {
        quoteRow = quote;
        quoteUuid = quote.id;
        if (!orgId) orgId = quote.organization_id;
      }
    }
    // Insert or Update Payment Record
    if (!existingPayment) {
      // Create new record if missing (Recovery scenario)
      const { data: newPayment, error: insertError } = await supabase.from('payments').insert({
        paystack_reference: reference,
        quote_id: quoteUuid,
        amount: amountPaid,
        currency: paystackData.currency,
        status: paystackStatus,
        local_status: paystackStatus,
        paystack_status: paystackStatus,
        organization_id: orgId,
        paid_at: isSuccess ? paymentDate : null,
        payment_method: paystackData.channel,
        created_at: new Date().toISOString()
      }).select().single();
      if (insertError) throw insertError;
      paymentId = newPayment.id;
    } else {
      // Check for mismatch
      const statusMismatch = existingPayment.local_status !== paystackStatus;
      await supabase.from('payments').update({
        status: paystackStatus,
        local_status: paystackStatus,
        paystack_status: paystackStatus,
        amount: amountPaid,
        payment_method: paystackData.channel,
        paid_at: isSuccess ? paymentDate : null,
        status_mismatch_detected: statusMismatch,
        updated_at: new Date().toISOString()
      }).eq('id', existingPayment.id);
      if (statusMismatch) {
        await supabase.from("payment_audit_log").insert({
          payment_id: existingPayment.id,
          action: 'status_reconciliation',
          details: {
            old_status: existingPayment.local_status,
            new_status: paystackStatus,
            paystack_response_status: paystackStatus
          }
        });
      }
    }
    // --- Process Success Logic ---
    if (isSuccess) {
      // 1. Call manual_verify_quote to provision access (Legacy/Existing logic support)
      if (orgId && quote_id) {
        // We need to fetch the numeric quote id? Or text? 
        // manual_verify_quote takes (p_quote_id text, p_organization_id uuid)
        // We assume quote_id passed in body is the text ID (e.g. Q-123)
        // First ensure we have the correct text ID. If `quote_id` is UUID, we need to fetch text ID.
        // The param named `quote_id` in request often comes from URL param which is text ID in previous context.
        const { error: rpcError } = await supabase.rpc('manual_verify_quote', {
          p_quote_id: quote_id,
          p_organization_id: orgId
        });
        if (rpcError) {
          console.error("Provisioning error:", rpcError);
          await supabase.from("payment_audit_log").insert({
            payment_id: paymentId,
            action: 'provisioning_failed',
            details: {
              error: rpcError.message
            }
          });
        } else {
          await supabase.from("payment_audit_log").insert({
            payment_id: paymentId,
            action: 'provisioning_success',
            details: {
              quote_id,
              org_id: orgId
            }
          });
        }
      }
      // Mark the quote PAID so the dashboard reflects it. manual_verify_quote only
      // flips status to ENTITLEMENTS_CREATED; the UI keys off payment_verified.
      // Mirrors the proven activate-bank-transfer path. Matched on the text
      // quote_id (e.g. "QT-...") since that's what the Paystack reference carries.
      if (quote_id) {
        await supabase.from('quotes').update({
          payment_verified: true,
          payment_verified_at: paymentDate,
          status: 'ACCEPTED',
          paystack_reference: reference,
          updated_at: new Date().toISOString()
        }).eq('quote_id', quote_id);
      }
      if (orgId) {
        await supabase.from('organizations').update({ suite_status: 'ACTIVE' }).eq('id', orgId);
      }

      // Burn the NextGen bridge code, if the quote carried one. Self-guarding
      // no-op otherwise; never blocks the payment acknowledgement.
      if (quote_id) {
        await redeemBridgeForQuote(supabase, quote_id, 'paystack');
      }

      // Create/refresh an ACTIVE subscription row + a real expiry. The Paystack
      // flow previously created no subscription (so Subscription Management read
      // empty) and manual_verify_quote left purchased_modules.expiry_date NULL.
      // Best-effort: a failure here must not undo the payment acknowledgement.
      if (orgId && quoteRow) {
        try {
          const term = quoteRow.billing_term || 'annual';
          const billingPeriod = quoteRow.billing_period || (/month/i.test(term) ? 'monthly' : 'annual');
          const userLimit = quoteRow.user_seats || quoteRow.seats || 1;
          const start = new Date(paymentDate);
          const end = new Date(start);
          if (billingPeriod === 'monthly') end.setMonth(end.getMonth() + 1);
          else end.setFullYear(end.getFullYear() + 1);
          const startDate = start.toISOString().slice(0, 10);
          const endDate = end.toISOString().slice(0, 10);

          const subRow = {
            organization_id: orgId,
            quote_id: quoteRow.id, // subscriptions.quote_id is uuid -> quotes.id
            modules: toModuleSlugs(quoteRow.modules),
            user_limit: userLimit,
            term,
            billing_period: billingPeriod,
            start_date: startDate,
            end_date: endDate,
            next_renewal_date: endDate,
            renewal_status: 'pending',
            status: 'active',
            payment_status: 'COMPLETED',
            quote_details: {
              quote_id: quote_id,
              quote_uuid: quoteRow.id,
              total_amount: quoteRow.total_amount,
              currency: quoteRow.currency || 'USD',
              billing_term: term,
              apps: quoteRow.apps ?? [],
              modules: quoteRow.modules ?? [],
              seats: userLimit,
              payment_method: 'paystack',
              paystack_reference: reference
            },
            updated_at: new Date().toISOString()
          };

          const { data: existingSub } = await supabase.from('subscriptions')
            .select('id').eq('organization_id', orgId).eq('quote_id', quoteRow.id).limit(1).maybeSingle();
          if (existingSub?.id) {
            await supabase.from('subscriptions').update(subRow).eq('id', existingSub.id);
          } else {
            await supabase.from('subscriptions').insert(subRow);
          }

          // Give the freshly provisioned entitlements a real end date (they were
          // provisioned with a NULL expiry by manual_verify_quote).
          await supabase.from('purchased_modules')
            .update({ expiry_date: end.toISOString() })
            .eq('organization_id', orgId)
            .eq('quote_id', quoteRow.id);
        } catch (subErr) {
          console.error('Subscription/expiry sync failed (non-fatal):', subErr.message);
        }
      }

      // --- Task 7: Trigger Notification (best-effort, idempotent) ---
      // The dedicated send-payment-notification function does not exist; use the
      // generic send-email-via-smtp path the rest of the app relies on so the
      // payer actually receives a confirmation.
      const { data: currentPayment } = await supabase.from('payments').select('notification_sent').eq('id', paymentId).maybeSingle();
      if (!currentPayment?.notification_sent) {
        const customerEmail = paystackData.customer?.email || user_email;
        if (customerEmail) {
          const appOrigin = req.headers.get('origin') || Deno.env.get('APP_URL') || '';
          const quoteUrl = appOrigin ? `${appOrigin}/dashboard/quote/${quote_id}` : '';
          const prettyAmount = `${paystackData.currency || ''} ${amountPaid.toLocaleString()}`.trim();
          try {
            await supabase.functions.invoke('send-email-via-smtp', {
              body: JSON.stringify({
                to: customerEmail,
                subject: `Payment received — ${quote_id}`,
                html:
                  `<p>Thank you! We've received your payment and your Petrolord subscription is now active.</p>` +
                  `<p><strong>Quote:</strong> ${quote_id}<br/>` +
                  `<strong>Amount paid:</strong> ${prettyAmount}<br/>` +
                  `<strong>Reference:</strong> ${reference}</p>` +
                  (quoteUrl ? `<p><a href="${quoteUrl}">View your subscription &amp; what you paid for</a></p>` : '') +
                  `<p>A receipt for this transaction is also available from Paystack.</p>`
              })
            });
            await supabase.from('payments').update({ notification_sent: true }).eq('id', paymentId);
          } catch (mailErr) {
            console.error("Payment confirmation email failed (non-fatal):", mailErr);
          }
        }
      }
    }
    return new Response(JSON.stringify({
      success: isSuccess,
      status: paystackStatus,
      message: isSuccess ? "Payment verified successfully" : "Payment verification complete but status is " + paystackStatus
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    return new Response(JSON.stringify({
      error: error.message,
      details: "Please contact support."
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
