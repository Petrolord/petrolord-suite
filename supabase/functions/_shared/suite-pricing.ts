// Suite pricing rules shared by generate-quote (authoritative). The quote
// screens implement the same rules in src/data/quotePricing.js, and
// src/data/__tests__/quotePricingParity.test.js runs the same scenarios
// through both so they cannot drift.
//
// Every value here is a FALLBACK. The live values come from pricing_config
// (keys named below), so an owner can change them without a deploy; these
// constants apply only if a row is missing. Keep them equal to the seeding
// migration 20260927120000_suite_pricing_2026_09.sql.

export type SeatTier = { upTo: number; price: number };

// Standard seats (pricing_config.seat_tiers).
export const SEAT_TIERS_FALLBACK: SeatTier[] = [
  { upTo: 5, price: 49 },
  { upTo: 15, price: 39 },
  { upTo: 40, price: 29 },
  { upTo: Infinity, price: 19 },
];

// Essentials seats (pricing_config.essentials_seat_tiers) for light apps:
// compliance registers, decision tools, simple calculators.
export const ESSENTIALS_SEAT_TIERS_FALLBACK: SeatTier[] = [
  { upTo: 5, price: 19 },
  { upTo: 15, price: 15 },
  { upTo: 40, price: 12 },
  { upTo: Infinity, price: 9 },
];

// pricing_config.essentials_seat_apps: master_apps.slug values.
export const ESSENTIALS_SEAT_APPS_FALLBACK: string[] = [
  'ai-evaluation-studio', 'audit-findings-manager', 'control-valve-sizing', 'data-quality-studio',
  'decision-studio', 'decision-tree-builder', 'document-control', 'energy-utilities-efficiency',
  'eor-screening', 'facility-layout-mapper', 'flow-metering-designer', 'iso-compliance-tool',
  'lesson-learned-db', 'management-of-change', 'npv-scenario-builder', 'peer-review-manager',
  'project-management-pro', 'quality-assurance-plan', 'recovery-factor-estimator', 'regulatory-compliance',
  'risk-heatmap', 'risk-register', 'technical-report-autopilot', 'value-of-information-analyzer',
];

// pricing_config.bundle_included_with: app slug -> host app slug. Quoted
// together, the included app carries no licence and no seat charge.
export const INCLUDED_WITH_FALLBACK: Record<string, string> = {
  'risk-heatmap': 'risk-register',
  'lesson-learned-db': 'audit-findings-manager',
};

// pricing_config.all_access_price: every priced module together, per month.
export const ALL_ACCESS_PRICE_FALLBACK = 12990;

// The platform fee is waived when a module is licensed or the term is a
// year or longer.
export const PLATFORM_FEE_WAIVED_TERMS = ['annual', '2year', '3year'];

const asTiers = (v: unknown): SeatTier[] | null => {
  const arr = typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const tiers = arr.map((t: { upTo: number | null; price: number }) => ({ upTo: t.upTo === null ? Infinity : Number(t.upTo), price: Number(t.price) }));
  return tiers.every((t) => t.upTo > 0 && t.price >= 0) ? tiers : null;
};
const asJson = (v: unknown) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);

export type PricingRules = {
  seatTiers: SeatTier[];
  essentialsSeatTiers: SeatTier[];
  essentialsApps: Set<string>;
  includedWith: Record<string, string>;
  allAccessPrice: number;
};

// Reads the rules from pricing_config rows loaded as { key: value }.
export function pricingRulesFromConfig(configMap: Record<string, unknown>): PricingRules {
  const ess = asJson(configMap?.['essentials_seat_apps']);
  const inc = asJson(configMap?.['bundle_included_with']);
  const all = Number(asJson(configMap?.['all_access_price']));
  return {
    seatTiers: asTiers(configMap?.['seat_tiers']) ?? SEAT_TIERS_FALLBACK,
    essentialsSeatTiers: asTiers(configMap?.['essentials_seat_tiers']) ?? ESSENTIALS_SEAT_TIERS_FALLBACK,
    essentialsApps: new Set(Array.isArray(ess) ? ess.map(String) : ESSENTIALS_SEAT_APPS_FALLBACK),
    includedWith: inc && typeof inc === 'object' && !Array.isArray(inc) ? (inc as Record<string, string>) : INCLUDED_WITH_FALLBACK,
    allAccessPrice: Number.isFinite(all) && all > 0 ? all : ALL_ACCESS_PRICE_FALLBACK,
  };
}

// Graduated cost of `seats` seats on one app.
export function tieredSeatCost(seats: number, tiers: SeatTier[]): number {
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
}

export function appSeatCost(slug: string, seats: number, rules: PricingRules): number {
  return tieredSeatCost(seats, rules.essentialsApps.has(slug) ? rules.essentialsSeatTiers : rules.seatTiers);
}

// The host app this app is included with, when that host is also on the quote.
export function includedWithHost(slug: string, quotedSlugs: Set<string>, rules: PricingRules): string | null {
  const host = rules.includedWith[slug];
  return host && quotedSlugs.has(host) ? host : null;
}

export function platformFeeWaived(moduleSlugs: string[], billingTerm: string): boolean {
  return (moduleSlugs || []).length > 0 || PLATFORM_FEE_WAIVED_TERMS.includes(String(billingTerm || '').toLowerCase());
}

// Module licences for the selected module slugs. Selecting every priced
// module replaces them with the single all-access price.
export function modulesCharge(moduleSlugs: string[], modulePricing: Record<string, number>, rules: PricingRules):
  { allAccess: boolean; total: number } {
  const selected = new Set((moduleSlugs || []).map((m) => String(m).toLowerCase()));
  const priced = Object.keys(modulePricing || {});
  const allAccess = priced.length > 0 && priced.every((m) => selected.has(m));
  const sum = [...selected].reduce((a, m) => a + (Number(modulePricing[m]) || 0), 0);
  return { allAccess, total: allAccess ? Math.min(rules.allAccessPrice, sum) : sum };
}
