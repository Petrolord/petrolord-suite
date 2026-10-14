// send-renewal-notification: renewal reminder / failure emails.
// Deployed from the Horizons era and never committed; brought into the repo
// by the 2026-10 security sweep. Before: verify_jwt off and no caller check,
// so anyone could send renewal emails to any address. Now: callable only by
// other edge functions holding the service-role key
// (process-subscription-renewals).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";
import { isServiceRoleRequest } from "../_shared/platform-admin.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Called only by process-subscription-renewals with the service-role key.
  if (!isServiceRoleRequest(req)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { subscription_id, type, recipient_email, context } = await req.json();

    if (!subscription_id || !recipient_email || !type) {
        throw new Error('Missing required fields');
    }

    // Template Logic
    let subject = '';
    let htmlContent = '';

    switch (type) {
        case 'reminder_7_days':
            subject = 'Upcoming Renewal Reminder - Petrolord';
            htmlContent = `
                <h1>Your Subscription is Renewing Soon</h1>
                <p>Hello,</p>
                <p>This is a reminder that your subscription for <strong>${context?.org_name || 'Petrolord Suite'}</strong> will automatically renew on <strong>${context?.renewal_date}</strong>.</p>
                <p>Expected Amount: ${context?.currency || 'NGN'} ${context?.amount}</p>
                <p>Please ensure your payment method is up to date.</p>
                <br/>
                <a href="https://petrolord.com/dashboard/billing" style="background:#2563eb;color:white;padding:10px 20px;text-decoration:none;">Manage Subscription</a>
            `;
            break;
        case 'success':
            subject = 'Subscription Renewed Successfully';
            htmlContent = `
                <h1>Payment Successful</h1>
                <p>We have successfully processed your renewal payment of ${context?.currency || 'NGN'} ${context?.amount}.</p>
                <p>Your subscription is active until: ${context?.date}</p>
                <p>Thank you for continuing with Petrolord!</p>
            `;
            break;
        case 'failure':
            subject = 'Action Required: Renewal Payment Failed';
            htmlContent = `
                <h1>Payment Failed</h1>
                <p>We were unable to process your renewal payment. Reason: ${context?.error}</p>
                <p>We will retry shortly (Attempt ${context?.attempt || 1}). Please update your payment method to avoid service interruption.</p>
                <br/>
                <a href="https://petrolord.com/dashboard/billing" style="background:#dc2626;color:white;padding:10px 20px;text-decoration:none;">Update Payment Method</a>
            `;
            break;
        case 'suspension':
            subject = 'Urgent: Subscription Suspended';
            htmlContent = `
                <h1>Service Suspended</h1>
                <p>Due to repeated failed payment attempts, your subscription has been suspended.</p>
                <p>Reason: ${context?.reason}</p>
                <p>To reactivate your access immediately, please make a payment manually.</p>
                <br/>
                <a href="https://petrolord.com/dashboard/billing" style="background:#dc2626;color:white;padding:10px 20px;text-decoration:none;">Reactivate Now</a>
            `;
            break;
        default:
            subject = 'Subscription Notification';
            htmlContent = '<p>You have a new notification regarding your subscription.</p>';
    }

    // Send via Resend (or fallback)
    let emailSent = false;
    if (RESEND_API_KEY) {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
            },
            body: JSON.stringify({
                from: 'Petrolord Billing <billing@petrolord.com>',
                to: [recipient_email],
                subject: subject,
                html: htmlContent
            })
        });
        emailSent = res.ok;
    }

    // Log to DB
    const { data: logData, error: logError } = await supabase.from('renewal_notifications').insert({
        subscription_id,
        // We need organization_id usually, fetching if not passed, but let's assume valid FK or null is okay if sub exists
        notification_type: type,
        recipient_email,
        subject,
        content_html: htmlContent,
        status: emailSent ? 'sent' : 'failed',
        error_message: emailSent ? null : 'Email provider error or misconfig'
    }).select();

    if (logError) {
        console.error("DB Log Error:", logError);
        // Don't fail the request if just logging fails, but it's risky
    }

    return new Response(JSON.stringify({ success: emailSent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Notification error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
