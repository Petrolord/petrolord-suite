import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // 1. Query eligible subscriptions
    // Conditions: renewal_date <= today, status is active or past_due
    const today = new Date().toISOString().split('T')[0];
    const { data: dueSubscriptions, error: fetchError } = await supabase.from('subscriptions').select(`
        *,
        organizations (
            id,
            name,
            contact_email
        )
      `).in('status', [
      'active',
      'past_due'
    ]).lte('renewal_date', today).eq('renewal_status', 'pending'); // Or 'failed' if retrying
    if (fetchError) throw fetchError;
    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      suspended: 0
    };
    for (const sub of dueSubscriptions){
      results.processed++;
      try {
        // Idempotency check: verify we haven't already processed this today successfully
        const { data: existingSuccess } = await supabase.from('renewal_audit_log').select('id').eq('subscription_id', sub.id).eq('action', 'success').gte('created_at', today + 'T00:00:00Z').maybeSingle();
        if (existingSuccess) {
          console.log(`Subscription ${sub.id} already renewed today.`);
          continue;
        }
        // Get default payment method
        const { data: paymentMethod } = await supabase.from('payment_methods').select('*').eq('organization_id', sub.organization_id).eq('is_default', true).eq('is_active', true).single();
        if (!paymentMethod) {
          throw new Error('No active default payment method found');
        }
        // Calculate amount (This is simplified, logic should match your billing engine)
        // Assuming subscription stores the recurring amount or fetching from related quote
        let amount = 0;
        if (sub.quote_details?.total_amount) {
          amount = sub.quote_details.total_amount;
        } else {
          // Fallback or detailed calculation logic
          throw new Error('Could not determine renewal amount from subscription details');
        }
        // Create Payment Record (Pending)
        const { data: payment, error: paymentError } = await supabase.from('payments').insert({
          organization_id: sub.organization_id,
          subscription_id: sub.id,
          amount: amount,
          currency: sub.quote_details?.currency || 'NGN',
          status: 'pending',
          payment_type: 'renewal',
          renewal_attempt_number: (sub.renewal_attempt_count || 0) + 1,
          paystack_reference: `renew_${sub.id}_${Date.now()}` // Temporary ref
        }).select().single();
        if (paymentError) throw paymentError;
        // Charge Authorization via Paystack
        const chargeResponse = await fetch("https://api.paystack.co/transaction/charge_authorization", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: paymentMethod.paystack_email,
            amount: amount * 100,
            authorization_code: paymentMethod.paystack_auth_code,
            reference: payment.paystack_reference,
            metadata: {
              custom_fields: [
                {
                  display_name: "Payment Type",
                  variable_name: "payment_type",
                  value: "renewal"
                },
                {
                  display_name: "Subscription ID",
                  variable_name: "subscription_id",
                  value: sub.id
                }
              ]
            }
          })
        });
        const chargeResult = await chargeResponse.json();
        if (!chargeResponse.ok || !chargeResult.status) {
          throw new Error(chargeResult.message || "Charge attempt failed");
        }
        if (chargeResult.data.status === 'success') {
          // Success Logic
          const nextRenewal = new Date();
          // Add billing period logic (e.g. +1 year or +1 month)
          if (sub.billing_period === 'monthly') nextRenewal.setMonth(nextRenewal.getMonth() + 1);
          else nextRenewal.setFullYear(nextRenewal.getFullYear() + 1); // Default annual
          await supabase.from('subscriptions').update({
            renewal_date: nextRenewal.toISOString().split('T')[0],
            renewal_status: 'active',
            renewal_attempt_count: 0,
            last_renewal_error: null,
            status: 'active',
            updated_at: new Date().toISOString()
          }).eq('id', sub.id);
          await supabase.from('payments').update({
            status: 'success',
            paid_at: new Date().toISOString(),
            paystack_status: 'success'
          }).eq('id', payment.id);
          // Audit
          await supabase.from('renewal_audit_log').insert({
            subscription_id: sub.id,
            organization_id: sub.organization_id,
            action: 'success',
            details: {
              amount,
              currency: sub.quote_details?.currency,
              reference: payment.paystack_reference
            }
          });
          // Notify
          await supabase.functions.invoke('send-renewal-notification', {
            body: {
              subscription_id: sub.id,
              type: 'success',
              recipient_email: sub.organizations.contact_email,
              context: {
                amount,
                date: nextRenewal.toISOString().split('T')[0]
              }
            }
          });
          results.succeeded++;
        } else {
          // Paystack might return 'failed' or 'pending' (if async) immediately
          throw new Error(`Charge status: ${chargeResult.data.status} - ${chargeResult.data.gateway_response || ''}`);
        }
      } catch (err) {
        console.error(`Renewal failed for sub ${sub.id}:`, err);
        results.failed++;
        const attemptCount = (sub.renewal_attempt_count || 0) + 1;
        const maxRetries = 3;
        let newStatus = sub.status;
        let renewalStatus = 'failed';
        let suspensionReason = sub.suspension_reason;
        // Handle Max Retries / Suspension
        if (attemptCount >= maxRetries) {
          newStatus = 'suspended';
          suspensionReason = 'Max renewal attempts reached. Payment failed.';
          renewalStatus = 'suspended';
          results.suspended++;
          // Notify Suspension
          await supabase.functions.invoke('send-renewal-notification', {
            body: {
              subscription_id: sub.id,
              type: 'suspension',
              recipient_email: sub.organizations.contact_email,
              context: {
                reason: err.message
              }
            }
          });
        } else {
          // Notify Failure (Retry coming)
          await supabase.functions.invoke('send-renewal-notification', {
            body: {
              subscription_id: sub.id,
              type: 'failure',
              recipient_email: sub.organizations.contact_email,
              context: {
                error: err.message,
                attempt: attemptCount
              }
            }
          });
        }
        // Update Subscription with Error
        await supabase.from('subscriptions').update({
          renewal_attempt_count: attemptCount,
          last_renewal_attempt_at: new Date().toISOString(),
          last_renewal_error: err.message,
          status: newStatus,
          renewal_status: renewalStatus,
          suspension_reason: suspensionReason,
          requires_manual_intervention: attemptCount >= maxRetries
        }).eq('id', sub.id);
        // Audit Log Failure
        await supabase.from('renewal_audit_log').insert({
          subscription_id: sub.id,
          organization_id: sub.organization_id,
          action: attemptCount >= maxRetries ? 'suspend' : 'retry_scheduled',
          details: {
            error: err.message,
            attempt: attemptCount
          }
        });
      }
    }
    return new Response(JSON.stringify(results), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Process renewals error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
