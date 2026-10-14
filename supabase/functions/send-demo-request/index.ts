// send-demo-request: the public Book a Demo form (BookDemoModal on the
// homepage and dashboard). Anonymous by design.
// Deployed from the Horizons era and never committed; brought into the repo
// by the 2026-10 security sweep. Before: the confirmation mail echoed the
// visitor's own name, company and message into HTML sent from the Petrolord
// sender to any address, unescaped and without limits. Now: values are
// length-capped and escaped, the email address is validated, the company
// name no longer appears in the visitor's copy, and each address gets at
// most three requests a day.

import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { escapeHtml } from "../_shared/platform-admin.ts";

const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,255}\.[a-z]{2,24}$/i;
const clip = (v: unknown, n: number) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, n);
// At most this many requests per email address per day (spam guard).
const PER_EMAIL_PER_DAY = 3;

const ADMIN_EMAIL = "sales@petrolord.com";
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

Deno.serve(async (req) => {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. Parse Request
    const body = await req.json();
    const full_name = clip(body?.full_name, 120);
    const email = clip(body?.email, 254).toLowerCase();
    const company_name = clip(body?.company_name, 160);
    const message = String(body?.message ?? "").slice(0, 4000);

    // 3. Validation
    if (!full_name || !email || !company_name) {
      throw new Error("Missing required fields: full_name, email, or company_name");
    }
    if (!EMAIL_RE.test(email)) {
      throw new Error("Please enter a valid email address.");
    }

    // 4. Initialize Supabase Client (Service Role for DB insert)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 4b. Spam guard: this is a public form, so cap requests per address.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recent } = await supabase
      .from('demo_requests')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', since);
    if ((recent ?? 0) >= PER_EMAIL_PER_DAY) {
      return new Response(
        JSON.stringify({ success: true, message: "Demo request already received. We will be in touch." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // 5. Insert into Database (unchanged logic)
    const { error: dbError } = await supabase
      .from('demo_requests')
      .insert([
        {
          full_name,
          email,
          company_name,
          message,
          status: 'PENDING'
        }
      ]);

    if (dbError) {
      console.error("Database Error:", dbError);
      throw new Error("Failed to save request to database");
    }

    // 6. Get Brevo Config
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") || "noreply@petrolord.com";
    const senderName = Deno.env.get("BREVO_SENDER_NAME") || "Petrolord Team";

    if (!brevoApiKey) {
      console.error("BREVO_API_KEY is missing");
      throw new Error("Email service configuration error");
    }

    // --- Helper to Send Email via Brevo ---
    const sendBrevoEmail = async (toEmail, toName, subject, htmlContent) => {
      const response = await fetch(BREVO_API_URL, {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": brevoApiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { email: senderEmail, name: senderName },
          to: [{ email: toEmail, name: toName }],
          subject: subject,
          htmlContent: htmlContent,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Brevo Error (${toEmail}):`, errorText);
        throw new Error(`Failed to send email to ${toEmail}: ${response.statusText}`);
      }
      return response;
    };

    // 7. Prepare & Send Admin Email
    const timestamp = new Date().toLocaleString("en-US", { timeZone: "UTC" });
    const adminHtml = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; border: 1px solid #e0e0e0;">
          <h1 style="color: #1e293b; border-bottom: 2px solid #FCD34D; padding-bottom: 10px; margin-top: 0;">New Demo Request</h1>
          
          <div style="background-color: #f8fafc; border-left: 4px solid #FCD34D; padding: 15px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Company:</strong> ${escapeHtml(company_name)}</p>
            <p style="margin: 5px 0;"><strong>Contact:</strong> ${escapeHtml(full_name)}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}" style="color: #2563eb;">${escapeHtml(email)}</a></p>
            <p style="margin: 5px 0;"><strong>Received:</strong> ${timestamp} (UTC)</p>
          </div>

          <h3 style="color: #1e293b; margin-top: 25px;">Message:</h3>
          <p style="background: #fff; padding: 15px; border: 1px solid #e2e8f0; border-radius: 4px;">
            ${message ? escapeHtml(message).replace(/\n/g, '<br>') : "<em>No message provided.</em>"}
          </p>

          <div style="margin-top: 30px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px;">
            Petrolord Suite Automated System
          </div>
        </div>
      </body>
      </html>
    `;

    // 8. Prepare & Send User Confirmation Email
    const userHtml = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; border: 1px solid #e0e0e0;">
          <div style="text-align: center; margin-bottom: 20px;">
             <h2 style="color: #1e293b; margin: 0;">Petrolord Suite</h2>
          </div>
          
          <h1 style="color: #1e293b; font-size: 24px;">Demo Request Received</h1>
          
          <p>Hi ${escapeHtml(full_name.split(' ')[0])},</p>
          
          <p>Thank you for your interest in <strong>Petrolord Suite</strong>. We have successfully received your request for a platform demo.</p>
          
          <p>Our team is currently reviewing your requirements. You can expect to hear from one of our solution specialists within <strong>24 hours</strong> to schedule a personalized walkthrough tailored to your team's needs.</p>
          
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 25px 0;">
            <p style="margin: 0; font-weight: bold; color: #475569;">While you wait:</p>
            <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #475569;">
              <li>Visit our <a href="https://petrolord.com/solutions" style="color: #2563eb;">Solutions Page</a> to learn more about our modules.</li>
              <li>Check out our latest <a href="https://petrolord.com/case-studies" style="color: #2563eb;">Case Studies</a>.</li>
            </ul>
          </div>

          <p>If you have any urgent questions, please don't hesitate to reach out to us directly.</p>
          
          <br>
          <p style="margin-bottom: 0;">Best regards,</p>
          <p style="margin-top: 5px; font-weight: bold; color: #1e293b;">The Petrolord Team</p>
          
          <div style="margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
            <p>
              Petrolord Suite | Enterprise Energy Solutions<br>
              <a href="mailto:support@petrolord.com" style="color: #94a3b8; text-decoration: none;">support@petrolord.com</a> | <a href="https://petrolord.com" style="color: #94a3b8; text-decoration: none;">www.petrolord.com</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Execute sends in parallel for speed
    await Promise.all([
      sendBrevoEmail(ADMIN_EMAIL, "Sales Team", `New Demo Request from ${company_name}`, adminHtml),
      sendBrevoEmail(email, full_name, "Demo Request Received - Petrolord Suite", userHtml)
    ]);

    return new Response(
      JSON.stringify({ success: true, message: "Demo request submitted successfully" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("Edge Function Error:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
