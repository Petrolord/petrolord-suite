// Provider-agnostic post-payment provisioning.
//
// Both the Stripe and Paystack success paths must end in the SAME state:
//   1. entitlements provisioned via manual_verify_quote() (purchased_modules + seats)
//   2. quote marked payment_verified / ACCEPTED
//   3. organizations.suite_status = 'ACTIVE'
//   4. an active subscriptions row (upsertSuiteSubscription); the expiry on
//      purchased_modules is set by manual_verify_quote itself (2026-09-28)
//
// Stripe (verify + webhook) and the Paystack webhook call provisionPaidQuote;
// verify-paystack-payment keeps its inline flow but shares
// upsertSuiteSubscription, so every rail writes the same rows.

import { redeemBridgeForQuote } from "./nextgen-bridge.ts";
import { redeemPromoForQuote } from "./promo-codes.ts";
import { sendEmail } from "./email.ts";
import { subscriptionWindow, provisionedEnd } from "./billing-term.ts";
import { writeSubscriptionForQuote } from "./subscription-write.ts";

// Coerce the quote's jsonb `modules` (strings or objects) into text[] for
// subscriptions.modules (a NOT NULL text[] column). Mirrors verify-paystack-payment.
function toModuleSlugs(modules: unknown): string[] {
  if (!Array.isArray(modules)) return [];
  return modules
    .map((m) => {
      if (typeof m === "string") return m;
      if (m && typeof m === "object") {
        const o = m as Record<string, unknown>;
        return String(o.id ?? o.key ?? o.slug ?? o.name ?? "").trim();
      }
      return String(m ?? "").trim();
    })
    .filter((s) => s.length > 0);
}

// HSE follows a Suite purchase (owner rule, Breeze Energy onboarding
// 2026-09-07): an organisation that holds an active Suite subscription also
// holds HSE Professional for the same window. The grant is the same row an
// HSE Professional purchase writes (organization_apps app 'hse'), so
// HSEContext, the free-tier limits and the AI quota all key off one thing;
// the Suite subscription row carries 'hse_professional' in its modules so
// the nightly lapse sweep and the expiry reminders retire it on the same
// end date. Best-effort: never blocks Suite provisioning.
// deno-lint-ignore no-explicit-any
export async function grantHseWithSuite(supabase: any, orgId: string, userLimit: number, logPrefix = "[provision]"): Promise<boolean> {
  try {
    const { error } = await supabase.from("organization_apps").upsert({
      organization_id: orgId,
      app_id: "hse",
      module_id: "hse_professional",
      seats_allocated: userLimit,
      status: "ACTIVE",
    }, { onConflict: "organization_id,app_id" });
    if (error) { console.error(`${logPrefix} HSE grant with Suite failed:`, error.message); return false; }
    await supabase.from("organizations").update({ hse_status: "ACTIVE" }).eq("id", orgId);
    return true;
  } catch (e) {
    console.error(`${logPrefix} HSE grant with Suite failed:`, (e as Error).message);
    return false;
  }
}

/** subscriptions.modules for a Suite quote: the quote's modules plus the HSE grant that rides with them. */
export function suiteSubscriptionModules(modules: unknown): string[] {
  const out = toModuleSlugs(modules);
  if (!out.includes("hse_professional")) out.push("hse_professional");
  return out;
}

export interface SuiteSubscriptionOpts {
  orgId: string;
  // deno-lint-ignore no-explicit-any
  quote: any;                   // quotes row: id, total_amount, currency, billing_term, billing_period, modules, apps, seats, user_seats
  quoteTextId: string;
  paidAt: string;               // ISO
  provider: string;             // 'paystack' | 'stripe' | ...
  reference: string;
  rpcResult?: unknown;          // manual_verify_quote's result (carries expiry_date)
  logPrefix?: string;
}

// The active Suite subscriptions row for a paid quote, identical on every rail
// (Paystack verify page, Paystack webhook, Stripe). Keyed by (org, quote): a
// second finalizer for the same quote updates the row, never adds another.
// The end date is the one manual_verify_quote set on the entitlements (a
// renewal stacks on the old end), so the subscription and the apps agree.
// No purchased_modules update here: manual_verify_quote alone sets those end
// dates (2026-09-28). HSE rides with the Suite subscription for the same window.
// Best-effort: never throws.
// deno-lint-ignore no-explicit-any
export async function upsertSuiteSubscription(supabase: any, o: SuiteSubscriptionOpts): Promise<{ ok: boolean; endDate?: string }> {
  const logPrefix = o.logPrefix || "[provision]";
  try {
    const quote = o.quote;
    const term = quote.billing_term || "annual";
    const userLimit = quote.user_seats || quote.seats || 1;
    // The term paid for is the term granted (quarterly = 3 months): shared table.
    const { billingPeriod, startDate, end } = subscriptionWindow(o.paidAt, term, quote.billing_period);
    const endDate = provisionedEnd(end, o.rpcResult).toISOString().slice(0, 10);

    const subRow = {
      organization_id: o.orgId,
      quote_id: quote.id, // subscriptions.quote_id is uuid -> quotes.id
      modules: suiteSubscriptionModules(quote.modules),
      user_limit: userLimit,
      term,
      billing_period: billingPeriod,
      start_date: startDate,
      end_date: endDate,
      next_renewal_date: endDate,
      renewal_status: "pending",
      status: "active",
      payment_status: "COMPLETED",
      quote_details: {
        quote_id: o.quoteTextId,
        quote_uuid: quote.id,
        total_amount: quote.total_amount,
        currency: quote.currency || "USD",
        billing_term: term,
        apps: quote.apps ?? [],
        modules: quote.modules ?? [],
        seats: userLimit,
        payment_method: o.provider,
        provider_reference: o.reference,
        ...(o.provider === "paystack" ? { paystack_reference: o.reference } : {}),
      },
      updated_at: new Date().toISOString(),
    };

    // Update the (org, quote) row or insert it; a lost insert race (23505 on
    // subscriptions_org_quote_key) updates the winner's row instead.
    await writeSubscriptionForQuote(supabase, subRow);

    await grantHseWithSuite(supabase, o.orgId, userLimit, logPrefix);
    return { ok: true, endDate };
  } catch (subErr) {
    console.error(`${logPrefix} subscription sync failed (non-fatal):`, (subErr as Error).message);
    return { ok: false };
  }
}

export interface ProvisionOpts {
  quoteTextId: string;          // e.g. "QT-2026-07-07-ABCDE" (quotes.quote_id)
  provider: string;             // 'stripe' | 'paystack' | 'bank_transfer'
  reference: string;            // provider reference (stripe session id, paystack ref, ...)
  amountPaid?: number;          // major units, for the confirmation email
  currency?: string;
  paidAt?: string;              // ISO
  customerEmail?: string | null;
  appOrigin?: string;           // for the "view your subscription" link + email
  sendEmail?: boolean;          // default true
}

export interface ProvisionResult {
  ok: boolean;
  orgId: string | null;
  quoteUuid: string | null;
  error?: string;
}

// An HSE Professional quote (sold from hse.petrolord.com via hse-checkout).
// These provision the HSE app grant, NOT Suite entitlements.
export function isHseQuote(modules: unknown): boolean {
  return toModuleSlugs(modules).includes("hse_professional");
}

// deno-lint-ignore no-explicit-any
export async function provisionPaidQuote(supabase: any, opts: ProvisionOpts): Promise<ProvisionResult> {
  const paidAt = opts.paidAt || new Date().toISOString();

  const { data: quote } = await supabase.from("quotes")
    .select("id, organization_id, total_amount, currency, billing_term, billing_period, modules, apps, seats, user_seats")
    .eq("quote_id", opts.quoteTextId)
    .maybeSingle();

  if (!quote) return { ok: false, orgId: null, quoteUuid: null, error: `Quote ${opts.quoteTextId} not found` };

  if (isHseQuote(quote.modules)) {
    return provisionPaidHseQuote(supabase, quote, opts, paidAt);
  }

  const orgId: string = quote.organization_id;
  const quoteUuid: string = quote.id;

  // 1. Provision entitlements (purchased_modules + seat caps).
  // It also sets every end date for this quote's rows (renewals stack, top-ups
  // never shorten, a re-run changes nothing), from the paid date given here.
  const { data: rpcResult, error: rpcError } = await supabase.rpc("manual_verify_quote", {
    p_quote_id: opts.quoteTextId,
    p_organization_id: orgId,
    p_paid_at: paidAt,
  });
  if (rpcError) {
    console.error("[provision] manual_verify_quote failed:", rpcError.message);
    return { ok: false, orgId, quoteUuid, error: rpcError.message };
  }

  // 2. Mark the quote paid so the dashboard reflects it (UI keys off payment_verified).
  await supabase.from("quotes").update({
    payment_verified: true,
    payment_verified_at: paidAt,
    status: "ACCEPTED",
    updated_at: new Date().toISOString(),
  }).eq("quote_id", opts.quoteTextId);

  // 3. Flip the org active.
  await supabase.from("organizations").update({ suite_status: "ACTIVE" }).eq("id", orgId);

  // 3b. Burn the NextGen bridge code and/or Suite promo code, if the quote
  // carried one. Self-guarding no-ops otherwise; never block provisioning.
  await redeemBridgeForQuote(supabase, opts.quoteTextId, opts.provider);
  await redeemPromoForQuote(supabase, opts.quoteTextId, opts.provider);

  // 4. Active subscription row (end date = the one the RPC set) + HSE grant.
  await upsertSuiteSubscription(supabase, {
    orgId, quote, quoteTextId: opts.quoteTextId, paidAt,
    provider: opts.provider, reference: opts.reference, rpcResult,
  });

  // 5. Confirmation email (best-effort, provider-neutral copy).
  if (opts.sendEmail !== false && opts.customerEmail) {
    try {
      const quoteUrl = opts.appOrigin ? `${opts.appOrigin}/dashboard/quote/${opts.quoteTextId}` : "";
      const prettyAmount = `${opts.currency || ""} ${(opts.amountPaid ?? 0).toLocaleString()}`.trim();
      await supabase.functions.invoke("send-email-via-smtp", {
        body: JSON.stringify({
          to: opts.customerEmail,
          subject: `Payment received — ${opts.quoteTextId}`,
          html:
            `<p>Thank you! We've received your payment and your Petrolord subscription is now active.</p>` +
            `<p><strong>Quote:</strong> ${opts.quoteTextId}<br/>` +
            `<strong>Amount paid:</strong> ${prettyAmount}<br/>` +
            `<strong>Reference:</strong> ${opts.reference}</p>` +
            (quoteUrl ? `<p><a href="${quoteUrl}">View your subscription &amp; what you paid for</a></p>` : ""),
        }),
      });
    } catch (mailErr) {
      console.error("[provision] confirmation email failed (non-fatal):", (mailErr as Error).message);
    }
  }

  return { ok: true, orgId, quoteUuid };
}

// HSE Professional provisioning. Both payment rails (and both delivery paths —
// redirect verify and webhook backstop) must end in the SAME state:
//   1. organization_apps (org, 'hse') → module_id 'hse_professional', ACTIVE,
//      seats_allocated = band cap. This is THE grant: HSEContext accessLevel,
//      the free-tier limits, and hse_check_and_increment_ai_usage all key off it.
//   2. organizations.hse_status = 'ACTIVE' (suite_status is NOT touched).
//   3. quote marked paid; promo code burned.
//   4. an active subscriptions row whose end_date drives the nightly
//      hse-professional-lapse cron sweep (downgrade back to hse_free on expiry).
// deno-lint-ignore no-explicit-any
async function provisionPaidHseQuote(supabase: any, quote: any, opts: ProvisionOpts, paidAt: string): Promise<ProvisionResult> {
  const orgId: string = quote.organization_id;
  const quoteUuid: string = quote.id;
  const userLimit = quote.user_seats || quote.seats || 10;

  // 1. The grant. organization_apps is unique on (organization_id, app_id).
  const { error: grantError } = await supabase.from("organization_apps").upsert({
    organization_id: orgId,
    app_id: "hse",
    module_id: "hse_professional",
    seats_allocated: userLimit,
    status: "ACTIVE",
  }, { onConflict: "organization_id,app_id" });
  if (grantError) {
    console.error("[provision-hse] organization_apps grant failed:", grantError.message);
    return { ok: false, orgId, quoteUuid, error: grantError.message };
  }

  // 2. Org status + quote paid.
  await supabase.from("organizations").update({ hse_status: "ACTIVE" }).eq("id", orgId);
  await supabase.from("quotes").update({
    payment_verified: true,
    payment_verified_at: paidAt,
    status: "ACCEPTED",
    updated_at: new Date().toISOString(),
  }).eq("quote_id", opts.quoteTextId);

  // 3. Burn the promo code if the quote carried one (self-guarding no-op).
  await redeemPromoForQuote(supabase, opts.quoteTextId, opts.provider);

  // 4. Subscription row: its end_date is what the lapse sweep enforces.
  try {
    const { billingPeriod, startDate, endDate } = subscriptionWindow(paidAt, quote.billing_term, quote.billing_period);

    const subRow = {
      organization_id: orgId,
      quote_id: quoteUuid,
      modules: ["hse_professional"],
      user_limit: userLimit,
      term: quote.billing_term || billingPeriod,
      billing_period: billingPeriod,
      start_date: startDate,
      end_date: endDate,
      next_renewal_date: endDate,
      renewal_status: "pending",
      status: "active",
      payment_status: "COMPLETED",
      quote_details: {
        quote_id: opts.quoteTextId,
        quote_uuid: quoteUuid,
        total_amount: quote.total_amount,
        currency: quote.currency || "USD",
        billing_term: quote.billing_term,
        modules: ["hse_professional"],
        seats: userLimit,
        payment_method: opts.provider,
        provider_reference: opts.reference,
      },
      updated_at: new Date().toISOString(),
    };

    // Same race-safe write as the Suite row (see subscription-write.ts).
    await writeSubscriptionForQuote(supabase, subRow);
  } catch (subErr) {
    console.error("[provision-hse] subscription sync failed (non-fatal):", (subErr as Error).message);
  }

  // 5. Confirmation email (best-effort, via the shared Resend→Brevo helper —
  // the legacy send-email-via-smtp function is deployed-but-unversioned and
  // must not gain new callers).
  if (opts.sendEmail !== false && opts.customerEmail) {
    const appOrigin = opts.appOrigin || "https://hse.petrolord.com";
    const prettyAmount = `${opts.currency || ""} ${(opts.amountPaid ?? 0).toLocaleString()}`.trim();
    await sendEmail({
      to: opts.customerEmail,
      subject: `Payment received — Petrolord HSE Professional`,
      html:
        `<p>Thank you! We've received your payment and Petrolord HSE Professional is now active for your organization.</p>` +
        `<p><strong>Reference:</strong> ${opts.quoteTextId}<br/>` +
        `<strong>Amount paid:</strong> ${prettyAmount}<br/>` +
        `<strong>Team size:</strong> up to ${userLimit} users</p>` +
        `<p><a href="${appOrigin}/dashboard">Open your HSE dashboard</a></p>`,
      logPrefix: "[provision-hse]",
    });
  }

  return { ok: true, orgId, quoteUuid };
}
