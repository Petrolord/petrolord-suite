// Daily HSE Professional expiry reminders (invoked by the pg_cron job
// 'hse-expiry-reminders', see migration 20260811090000).
//
// For each org's LATEST active hse_professional subscription:
//   - end_date within the next 7 days and renewal_reminder_sent_at unset
//     → "your plan expires on X, renew" email
//   - end_date passed (3-day grace before the lapse sweep downgrades) and
//     expiry_notice_sent_at unset → "expired, renew before Y" email
// Stamps are written only after a provider accepts the email, so failed
// sends retry on the next daily run. Safe to invoke repeatedly.
//
// Recipient: the buying admin (quotes.org_admin_email), falling back to
// organizations.contact_email.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendEmail } from "../_shared/email.ts";

const APP_URL = "https://hse.petrolord.com";
const REMINDER_DAYS = 7;
const GRACE_DAYS = 3;

function fmt(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + REMINDER_DAYS);
    const horizonDate = horizon.toISOString().slice(0, 10);

    // All active professional subs (small set) — latest end_date wins per org,
    // so a renewed org is judged by its new subscription, not the old one.
    const { data: subs, error } = await supabase.from("subscriptions")
      .select("id, organization_id, quote_id, end_date, renewal_reminder_sent_at, expiry_notice_sent_at, organizations(name, contact_email)")
      .eq("status", "active")
      .contains("modules", ["hse_professional"]);
    if (error) throw error;

    const latestByOrg = new Map<string, typeof subs[number]>();
    for (const sub of subs ?? []) {
      const prev = latestByOrg.get(sub.organization_id);
      if (!prev || sub.end_date > prev.end_date) latestByOrg.set(sub.organization_id, sub);
    }

    // Buyer emails from the originating quotes.
    const quoteIds = [...latestByOrg.values()].map((s) => s.quote_id).filter(Boolean);
    const emailByQuote = new Map<string, string>();
    if (quoteIds.length) {
      const { data: quotes } = await supabase.from("quotes")
        .select("id, org_admin_email").in("id", quoteIds);
      for (const q of quotes ?? []) {
        if (q.org_admin_email) emailByQuote.set(q.id, q.org_admin_email);
      }
    }

    const results = { reminded: 0, expiry_noticed: 0, skipped_no_email: 0, send_failed: 0 };

    for (const sub of latestByOrg.values()) {
      const orgName = sub.organizations?.name || "your organization";
      const to = emailByQuote.get(sub.quote_id) || sub.organizations?.contact_email;
      const upcoming = sub.end_date >= today && sub.end_date <= horizonDate && !sub.renewal_reminder_sent_at;
      const expired = sub.end_date < today && !sub.expiry_notice_sent_at;
      if (!upcoming && !expired) continue;
      if (!to) { results.skipped_no_email++; continue; }

      let subject: string, html: string, stampCol: string;
      if (upcoming) {
        subject = `Your HSE Professional plan expires on ${fmt(sub.end_date)}`;
        html =
          `<p>Hello,</p>` +
          `<p>The Petrolord HSE Professional plan for <strong>${orgName}</strong> expires on <strong>${fmt(sub.end_date)}</strong>.</p>` +
          `<p>Renew before then to keep unlimited reports, email notifications, and your 500/month AI quota. ` +
          `If the plan lapses, your organization moves back to the Free tier and its limits.</p>` +
          `<p><a href="${APP_URL}/dashboard/upgrade">Renew now</a> (takes about a minute; pay in Naira or USD).</p>` +
          `<p>Questions? Reply to this email or write to support@petrolord.com.</p>`;
        stampCol = "renewal_reminder_sent_at";
      } else {
        const graceEnd = new Date(sub.end_date + "T00:00:00Z");
        graceEnd.setDate(graceEnd.getDate() + GRACE_DAYS);
        subject = `Your HSE Professional plan has expired`;
        html =
          `<p>Hello,</p>` +
          `<p>The Petrolord HSE Professional plan for <strong>${orgName}</strong> expired on <strong>${fmt(sub.end_date)}</strong>.</p>` +
          `<p>You have until <strong>${fmt(graceEnd.toISOString().slice(0, 10))}</strong> before your organization moves back to the Free tier. ` +
          `Your data is never deleted, but free-tier limits will apply.</p>` +
          `<p><a href="${APP_URL}/dashboard/upgrade">Renew now</a> to keep Professional without interruption.</p>` +
          `<p>Questions? Reply to this email or write to support@petrolord.com.</p>`;
        stampCol = "expiry_notice_sent_at";
      }

      const sent = await sendEmail({ to, subject, html, logPrefix: "[hse-expiry]" });
      if (!sent) { results.send_failed++; continue; }
      await supabase.from("subscriptions")
        .update({ [stampCol]: new Date().toISOString() })
        .eq("id", sub.id);
      if (upcoming) results.reminded++;
      else results.expiry_noticed++;
    }

    return new Response(JSON.stringify({ ok: true, today, ...results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[hse-expiry-reminders] error:", (error as Error).message);
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
