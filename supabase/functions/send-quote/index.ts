// send-quote: the admin console's Send Quote page (OrgSendQuote).
// Deployed from the Horizons era and never committed; brought into the repo
// by the 2026-10 security sweep. Before: verify_jwt off and no caller check,
// so anyone could write a quote with any total for any organization and
// email any address from the sales sender with their own HTML. Now: the
// caller must be a platform super admin; interpolated values are escaped.
import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { escapeHtml, requirePlatformAdmin } from "../_shared/platform-admin.ts";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Platform super admins only (the admin console's Send Quote page).
    const guard = await requirePlatformAdmin(supabase, req);
    if (!guard.ok) {
      return new Response(JSON.stringify({ success: false, message: guard.error }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: guard.status,
      });
    }

    const { organization_id, org_name, email, quote_details, pricing } = await req.json();

    if (!organization_id || !email || !pricing) {
        throw new Error("Missing required fields");
    }

    // 2. Generate Quote ID
    const quoteId = `QT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 3. Insert into DB
    const { error: dbError } = await supabase
      .from('quotes')
      .insert([{
        organization_id,
        quote_id: quoteId,
        modules: quote_details, // storing full details json here for simplicity
        apps: {}, // Can break down if needed
        seats: quote_details.user_count,
        billing_term: `${quote_details.duration} Months`,
        total_amount: pricing.total,
        currency: 'USD',
        validity_period: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: 'PENDING',
        created_at: new Date()
      }]);

    if (dbError) throw dbError;

    // 4. Send Email via Brevo
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") || "sales@petrolord.com";
    const senderName = Deno.env.get("BREVO_SENDER_NAME") || "Petrolord Sales";

    if (brevoApiKey) {
        const htmlContent = `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #1e293b;">New Quote from Petrolord Suite</h1>
                <p>Hello <strong>${escapeHtml(org_name)}</strong>,</p>
                <p>We are pleased to share the following quote for your Petrolord Suite subscription.</p>
                
                <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FCD34D;">
                    <h3 style="margin-top: 0;">Quote #${quoteId}</h3>
                    <p><strong>Deployment:</strong> ${escapeHtml(String(quote_details.deployment ?? '').toUpperCase())}</p>
                    <p><strong>Users:</strong> ${escapeHtml(quote_details.user_count)}</p>
                    <p><strong>Apps:</strong> ${escapeHtml(quote_details.app_count)}</p>
                    <p><strong>Duration:</strong> ${escapeHtml(quote_details.duration)} Months</p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                    <h2 style="color: #0f172a; margin-bottom: 0;">Total: $${Number(pricing.total).toFixed(2)}</h2>
                </div>

                <p>You can view and accept this quote by logging into your <a href="https://suite.petrolord.com/dashboard" style="color: #2563eb;">Dashboard</a>.</p>
                
                <p>Best regards,<br/>The Petrolord Sales Team</p>
            </div>
        `;

        const emailResponse = await fetch(BREVO_API_URL, {
            method: "POST",
            headers: {
                "accept": "application/json",
                "api-key": brevoApiKey,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                sender: { email: senderEmail, name: senderName },
                to: [{ email: email, name: org_name }],
                subject: `Your Quote #${quoteId} from Petrolord Suite`,
                htmlContent: htmlContent,
            }),
        });

        if (!emailResponse.ok) {
            console.error("Brevo Error:", await emailResponse.text());
            // Don't fail the request if email fails, but log it.
        }
    } else {
        console.warn("BREVO_API_KEY missing, skipping email.");
    }

    return new Response(JSON.stringify({ success: true, message: "Quote generated and sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400
    });
  }
});
