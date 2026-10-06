// The Suite pricing rules for the quote screens (the upgrade
// page, QuoteBuilder). generate-quote applies the same rules server side from
// supabase/functions/_shared/suite-pricing.ts and is authoritative;
// quotePricingParity.test.js runs the same scenarios through both.
import {
  SEAT_TIERS, ESSENTIALS_SEAT_TIERS, ESSENTIALS_SEAT_APPS, INCLUDED_WITH,
  ALL_ACCESS_PRICE, PLATFORM_FEE_WAIVED_TERMS, MODULE_PRICING, SEISMIC_STORAGE,
} from '@/data/pricingModels';

export const tieredSeatCost = (seats, tiers) => {
  let remaining = Math.max(0, Math.floor(Number(seats) || 0));
  let prevCap = 0;
  let cost = 0;
  for (const t of tiers) {
    if (remaining <= 0) break;
    const band = Math.min(remaining, t.upTo - prevCap);
    cost += band * t.price;
    remaining -= band;
    prevCap = t.upTo;
  }
  return cost;
};

export const isEssentialsApp = (slug) => ESSENTIALS_SEAT_APPS.includes(slug);

export const appSeatCost = (slug, seats) =>
  tieredSeatCost(seats, isEssentialsApp(slug) ? ESSENTIALS_SEAT_TIERS : SEAT_TIERS);

// The host app this app is included with, when that host is also quoted.
export const includedWithHost = (slug, quotedSlugs) => {
  const host = INCLUDED_WITH[slug];
  return host && quotedSlugs.has(host) ? host : null;
};

export const platformFeeWaived = (moduleSlugs, billingTerm) =>
  (moduleSlugs || []).length > 0 || PLATFORM_FEE_WAIVED_TERMS.includes(String(billingTerm || '').toLowerCase());

// Module licences for the selected slugs; every priced module together is
// the single all-access price.
export const modulesCharge = (moduleSlugs, modulePricing = MODULE_PRICING) => {
  const selected = new Set((moduleSlugs || []).map((m) => String(m).toLowerCase()));
  const priced = Object.keys(modulePricing);
  const allAccess = priced.length > 0 && priced.every((m) => selected.has(m));
  const sum = [...selected].reduce((a, m) => a + (Number(modulePricing[m]) || 0), 0);
  return { allAccess, total: allAccess ? Math.min(ALL_ACCESS_PRICE, sum) : sum };
};

// One app line: licence (0 when a selected module covers it or its host app
// is quoted) and seats (0 when included with its host).
// app = { slug, moduleSlug, price, seats }
export const priceApp = (app, { moduleSlugs = [], quotedSlugs = new Set() } = {}) => {
  const covered = moduleSlugs.map((m) => String(m).toLowerCase()).includes(String(app.moduleSlug || '').toLowerCase());
  const host = includedWithHost(app.slug, quotedSlugs);
  const licence = covered || host ? 0 : Number(app.price) || 0;
  const seatCost = host ? 0 : appSeatCost(app.slug, app.seats || 1);
  return { licence, seatCost, covered, includedWith: host };
};

// The monthly charge for a seismic storage tier (same rule as the server's
// seismicStorageCharge): no tier, nothing; unknown or not yet offered, refused.
export const seismicStorageCharge = (tierKey, catalogue = SEISMIC_STORAGE) => {
  if (!tierKey) return { tier: null, amount: 0 };
  const tier = catalogue.tiers.find((t) => t.key === tierKey);
  if (!tier) throw new Error(`Unknown seismic storage tier: ${tierKey}.`);
  if (!tier.available) throw new Error(`The ${tier.label} seismic storage tier is available on request. Please contact us for a quote.`);
  return { tier, amount: Number(tier.price_usd) };
};
