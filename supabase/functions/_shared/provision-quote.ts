// Provider-agnostic post-payment provisioning.
//
// Both the Stripe and Paystack success paths must end in the SAME state:
//   1. entitlements provisioned via manual_verify_quote() (purchased_modules + seats)
//   2. quote marked payment_verified / ACCEPTED
//   3. organizations.suite_status = 'ACTIVE'
//   4. an active subscriptions row + a real expiry on purchased_modules
//
// verify-paystack-payment inlines this (kept as-is so the live Paystack flow is
// untouched). New rails (Stripe) call this helper so the two never drift.

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

// deno-lint-ignore no-explicit-any
export async function provisionPaidQuote(supabase: any, opts: ProvisionOpts): Promise<ProvisionResult> {
  const paidAt = opts.paidAt || new Date().toISOString();

  const { data: quote } = await supabase.from("quotes")
    .select("id, organization_id, total_amount, currency, billing_term, billing_period, modules, apps, seats, user_seats")
    .eq("quote_id", opts.quoteTextId)
    .maybeSingle();

  if (!quote) return { ok: false, orgId: null, quoteUuid: null, error: `Quote ${opts.quoteTextId} not found` };

  const orgId: string = quote.organization_id;
  const quoteUuid: string = quote.id;

  // 1. Provision entitlements (purchased_modules + seat caps).
  const { error: rpcError } = await supabase.rpc("manual_verify_quote", {
    p_quote_id: opts.quoteTextId,
    p_organization_id: orgId,
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

  // 4. Active subscription row + real expiry. Best-effort: never undo the payment.
  try {
    const term = quote.billing_term || "annual";
    const billingPeriod = quote.billing_period || (/month/i.test(term) ? "monthly" : "annual");
    const userLimit = quote.user_seats || quote.seats || 1;
    const start = new Date(paidAt);
    const end = new Date(start);
    if (billingPeriod === "monthly") end.setMonth(end.getMonth() + 1);
    else end.setFullYear(end.getFullYear() + 1);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const subRow = {
      organization_id: orgId,
      quote_id: quoteUuid,
      modules: toModuleSlugs(quote.modules),
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
        quote_id: opts.quoteTextId,
        quote_uuid: quoteUuid,
        total_amount: quote.total_amount,
        currency: quote.currency || "USD",
        billing_term: term,
        apps: quote.apps ?? [],
        modules: quote.modules ?? [],
        seats: userLimit,
        payment_method: opts.provider,
        provider_reference: opts.reference,
      },
      updated_at: new Date().toISOString(),
    };

    const { data: existingSub } = await supabase.from("subscriptions")
      .select("id").eq("organization_id", orgId).eq("quote_id", quoteUuid).limit(1).maybeSingle();
    if (existingSub?.id) {
      await supabase.from("subscriptions").update(subRow).eq("id", existingSub.id);
    } else {
      await supabase.from("subscriptions").insert(subRow);
    }

    // Give the freshly provisioned entitlements a real end date (manual_verify_quote leaves NULL).
    await supabase.from("purchased_modules")
      .update({ expiry_date: end.toISOString() })
      .eq("organization_id", orgId)
      .eq("quote_id", quoteUuid);
  } catch (subErr) {
    console.error("[provision] subscription/expiry sync failed (non-fatal):", (subErr as Error).message);
  }

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
