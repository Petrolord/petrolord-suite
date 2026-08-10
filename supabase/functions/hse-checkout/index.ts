// HSE Professional checkout — creates a payable quote for a team-size band and
// returns a hosted payment link (Paystack NGN or Stripe USD).
//
// Called by the HSE SPA (hse.petrolord.com) Upgrade page with the signed-in
// org admin's JWT. Prices are resolved SERVER-SIDE from HSE_BANDS (never from
// the client); the band table must stay in sync with the marketing table in
// petrolord-hse src/components/pricing/data.js.
//
// Rails:
//  - paystack: amount charged in NGN = USD total × pricing_config.hse_ngn_per_usd
//    (unlike the Suite quote rail, which deliberately charges $X as ₦X).
//    reference = quote_id so the existing verify-by-reference flow works.
//  - stripe: exact USD total, metadata carries quote_id → the existing
//    verify-stripe-payment / stripe-webhook pair verifies and provisions.
//
// Provisioning happens in _shared/provision-quote.ts, which detects the
// 'hse_professional' module and grants organization_apps hse/hse_professional
// instead of Suite entitlements.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { corsHeaders } from './cors.ts';
import { validatePromoCode } from '../_shared/promo-codes.ts';

// Single source of pricing truth for the paid HSE tier (USD per month).
// 'annual' is the discounted per-month price; an annual purchase charges 12×.
const HSE_BANDS: Record<string, { label: string; maxUsers: number; monthly: number; annual: number }> = {
  band_1_10:      { label: '1-10',        maxUsers: 10,   monthly: 110,  annual: 99 },
  band_11_50:     { label: '11-50',       maxUsers: 50,   monthly: 275,  annual: 249 },
  band_51_100:    { label: '51-100',      maxUsers: 100,  monthly: 555,  annual: 499 },
  band_101_250:   { label: '101-250',     maxUsers: 250,  monthly: 999,  annual: 899 },
  band_251_500:   { label: '251-500',     maxUsers: 500,  monthly: 1665, annual: 1499 },
  band_501_1000:  { label: '501-1,000',   maxUsers: 1000, monthly: 2775, annual: 2499 },
  band_1001_2500: { label: '1,001-2,500', maxUsers: 2500, monthly: 4999, annual: 4499 },
  band_2501_5000: { label: '2,501-5,000', maxUsers: 5000, monthly: 8330, annual: 7499 },
};

const ADMIN_ROLES = ['owner', 'admin', 'super_admin', 'org_admin'];
const DEFAULT_NGN_PER_USD = 1500;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { organization_id, band_id, billing_term = 'annual', provider = 'paystack', promo_code = null, origin = null } = await req.json();

    if (!organization_id) throw new Error('organization_id is required');
    const band = HSE_BANDS[band_id];
    if (!band) throw new Error(`Unknown team size band: ${band_id}`);
    if (!['monthly', 'annual'].includes(billing_term)) throw new Error(`Unknown billing term: ${billing_term}`);
    if (!['paystack', 'stripe'].includes(provider)) throw new Error(`Unknown payment provider: ${provider}`);

    // Caller must be a signed-in admin of the org (resolved from the JWT, never
    // from client-sent ids) — mirrors generate-quote's manual_discount guard.
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) throw new Error('Sign in to upgrade your organization.');
    const { data: authData } = await supabase.auth.getUser(jwt);
    const caller = authData?.user;
    if (!caller) throw new Error('Sign in to upgrade your organization.');

    const { data: omRows } = await supabase.from('organization_members')
      .select('role, status')
      .eq('organization_id', organization_id).eq('user_id', caller.id);
    const isAdmin = (omRows ?? []).some((om: { role: string; status: string | null }) =>
      (om.status ?? 'active').toLowerCase() === 'active' && ADMIN_ROLES.includes(om.role));
    if (!isAdmin) throw new Error('Only an organization admin can upgrade the plan.');

    const { data: org, error: orgError } = await supabase.from('organizations')
      .select('id, name').eq('id', organization_id).single();
    if (orgError || !org) throw new Error('Organization not found');

    // Price (USD). Listed prices are charged as-is (VAT-inclusive).
    const perMonth = billing_term === 'annual' ? band.annual : band.monthly;
    const months = billing_term === 'annual' ? 12 : 1;
    let usdTotal = perMonth * months;

    // Optional promo code (scope 'all' only — HSE has no Suite module scopes).
    let promo = null;
    let promoDiscountVal = 0;
    if (promo_code && String(promo_code).trim()) {
      promo = await validatePromoCode(supabase, String(promo_code));
      if (!promo) throw new Error('Promo code not recognized. Check the code and try again.');
      if (promo.status !== 'valid') {
        const why = { inactive: 'is no longer active', expired: 'has expired', exhausted: 'has been fully redeemed' }[promo.status as string] || 'is not valid';
        throw new Error(`Promo code ${promo.code} ${why}.`);
      }
      if (promo.scope !== 'all') {
        throw new Error(`Promo code ${promo.code} applies to the ${promo.scope} module and cannot be used for HSE Professional.`);
      }
      promoDiscountVal = usdTotal * (Number(promo.percent) / 100);
      usdTotal = usdTotal - promoDiscountVal;
    }
    usdTotal = Math.round(usdTotal * 100) / 100;

    // NGN conversion rate for the Paystack rail (owner-tunable, no redeploy).
    const { data: fxRow } = await supabase.from('pricing_config')
      .select('value').eq('key', 'hse_ngn_per_usd').maybeSingle();
    const ngnPerUsd = Number(fxRow?.value) > 0 ? Number(fxRow.value) : DEFAULT_NGN_PER_USD;
    const ngnTotal = Math.round(usdTotal * ngnPerUsd);

    // Quote row — the same rails the Suite uses key off this record.
    const dateStr = new Date().toISOString().slice(0, 10);
    const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
    const quoteId = `QT-HSE-${dateStr}-${randomStr}`;
    const validityPeriod = new Date();
    validityPeriod.setDate(validityPeriod.getDate() + 3); // payment links, not sales quotes

    const appOrigin = (origin || req.headers.get('origin') || 'https://hse.petrolord.com').replace(/\/$/, '');

    const { data: quoteRow, error: quoteInsertError } = await supabase.from('quotes').insert({
      quote_id: quoteId,
      organization_id,
      modules: ['hse_professional'],
      apps: [],
      seats: band.maxUsers,
      user_seats: band.maxUsers,
      billing_term,
      billing_period: billing_term,
      add_ons: [],
      total_amount: usdTotal,
      currency: 'USD',
      org_admin_email: caller.email,
      user_id: caller.id,
      validity_period: validityPeriod.toISOString(),
      status: 'PENDING',
      created_at: new Date().toISOString(),
      pricing_breakdown: {
        product: 'hse_professional',
        band_id,
        band_label: band.label,
        max_users: band.maxUsers,
        per_month_usd: perMonth,
        months,
        usd_total: usdTotal,
        ngn_total: provider === 'paystack' ? ngnTotal : null,
        ngn_per_usd: provider === 'paystack' ? ngnPerUsd : null,
      },
      promo_code: promo ? promo.code : null,
      promo_scope: promo ? promo.scope : null,
      promo_discount_pct: promo ? promo.percent : null,
      promo_discount_amount: promo ? promoDiscountVal : null,
    }).select('id').single();
    if (quoteInsertError) throw quoteInsertError;

    let payUrl: string | null = null;

    if (provider === 'paystack') {
      const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
      if (!PAYSTACK_SECRET_KEY) throw new Error('Paystack is not configured.');
      const initRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: caller.email,
          amount: ngnTotal * 100, // kobo
          reference: quoteId,
          metadata: { quote_id: quoteId, organization_id, product: 'hse_professional' },
          callback_url: `${appOrigin}/payment/verify?provider=paystack&quote_id=${encodeURIComponent(quoteId)}`,
        }),
      });
      const initJson = await initRes.json();
      if (!initJson?.status || !initJson?.data?.authorization_url) {
        console.error('[hse-checkout] Paystack initialize failed:', JSON.stringify(initJson));
        throw new Error('Could not start the Paystack payment. Try again or use the card (USD) option.');
      }
      payUrl = initJson.data.authorization_url;
      await supabase.from('quotes').update({
        paystack_link: payUrl,
        paystack_reference: initJson.data.reference || quoteId,
        updated_at: new Date().toISOString(),
      }).eq('quote_id', quoteId);
    } else {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
        apiVersion: '2024-06-20',
        httpClient: Stripe.createFetchHttpClient(),
      });
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(usdTotal * 100),
            product_data: {
              name: `Petrolord HSE Professional — ${band.label} users, ${billing_term}`,
            },
          },
        }],
        customer_email: caller.email || undefined,
        metadata: {
          quote_id: quoteId,
          quote_uuid: quoteRow.id,
          organization_id,
          product: 'hse_professional',
        },
        success_url: `${appOrigin}/payment/verify?provider=stripe&session_id={CHECKOUT_SESSION_ID}&quote_id=${encodeURIComponent(quoteId)}`,
        cancel_url: `${appOrigin}/dashboard/upgrade`,
      });
      payUrl = session.url;
      await supabase.from('quotes').update({
        stripe_session_id: session.id,
        stripe_checkout_url: session.url,
        updated_at: new Date().toISOString(),
      }).eq('quote_id', quoteId);
    }

    return new Response(JSON.stringify({
      success: true,
      quote_id: quoteId,
      provider,
      url: payUrl,
      usd_total: usdTotal,
      ngn_total: provider === 'paystack' ? ngnTotal : null,
      band: { id: band_id, label: band.label, max_users: band.maxUsers },
      billing_term,
      promo: promo ? { code: promo.code, percent: promo.percent, discount_usd: promoDiscountVal } : null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
