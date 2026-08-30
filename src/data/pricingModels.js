// Base pricing constants
export const BASE_PLATFORM_FEE = 299; // Monthly base fee for accessing the platform
export const USER_SEAT_PRICE = 49; // Price per user per month (1st tier; see SEAT_TIERS)
export const STORAGE_GB_PRICE = 0.5; // Price per GB per month
export const VAT_RATE = 0.075; // 7.5% VAT

// Graduated PER-APP seat tiers (volume pricing). Each app's seat count is priced
// independently through these brackets — consolidating seats into one app is cheaper
// per seat. MUST stay in sync with SEAT_TIERS in
// supabase/functions/generate-quote/index.ts (server is authoritative).
export const SEAT_TIERS = [
  { upTo: 5, price: 49 },        // seats 1–5
  { upTo: 15, price: 39 },       // seats 6–15
  { upTo: 40, price: 29 },       // seats 16–40
  { upTo: Infinity, price: 19 }, // seats 41+
];

// Total monthly seat cost for `seats` seats in ONE app (graduated/bracketed).
export const computeSeatCost = (seats) => {
  let remaining = Math.max(0, parseInt(seats, 10) || 0);
  let prevCap = 0, cost = 0;
  for (const t of SEAT_TIERS) {
    if (remaining <= 0) break;
    const band = Math.min(remaining, t.upTo - prevCap);
    cost += band * t.price;
    remaining -= band;
    prevCap = t.upTo;
  }
  return cost;
};

// Marginal price of the Nth seat, for UI hints.
export const seatTierRate = (nthSeat) => {
  for (const t of SEAT_TIERS) if (nthSeat <= t.upTo) return t.price;
  return SEAT_TIERS[SEAT_TIERS.length - 1].price;
};

// MODULE PRICING - the client's copy of one table.
//
// THE SERVER IS AUTHORITATIVE. generate-quote reads
// pricing_config.module_pricing from the database and re-prices every
// quote; these values exist so the quote preview shows the same number,
// and they must be kept in step with migration 20260830060000. Change the
// price in pricing_config first: that takes effect without a deploy.
//
// There used to be four numbers for the same thing - this file, GetQuote,
// QuoteEditor and a hardcoded 500 in the edge function - and they all
// disagreed. The other two now import from here.
//
// A MODULE INCLUDES ALL OF ITS APPS. Buying a module grants every app whose
// module_id matches, so a module's price REPLACES its apps' a la carte
// prices rather than adding to them.
//
// The rule behind the numbers: a module costs about 3.3x its own per-app
// price, so it costs roughly what three apps cost and delivers ten to
// fourteen. That keeps the bundle the obvious purchase and keeps a la carte
// an honest convenience premium for someone who wants two tools.
//
// HSE is not here: it is the separate external portal, billed in naira.
export const MODULE_PRICING = {
  geoscience: 2999,
  drilling: 3299,
  reservoir: 3299,
  facilities: 2499,
  production: 2499,
  economics: 1999,
  'midstream-downstream': 1999,
  assurance: 1499
};

// Display metadata for the quote screens, so a module's name and blurb are
// not a fourth thing that can drift.
export const MODULE_META = {
  geoscience: { name: 'Geoscience', description: 'Seismic interpretation, petrophysics, mapping and basin analysis' },
  drilling: { name: 'Drilling & Completion', description: 'Well planning, trajectory, casing, hydraulics and completions' },
  reservoir: { name: 'Reservoir', description: 'Material balance, simulation, decline analysis and waterflood' },
  facilities: { name: 'Facilities', description: 'Separation, relief, compression, pumping, metering and layout' },
  production: { name: 'Production', description: 'Surveillance, nodal analysis, artificial lift and well testing' },
  economics: { name: 'Economics & Project Management', description: 'Fiscal regimes, NPV, Monte Carlo, AFE and field development' },
  'midstream-downstream': { name: 'Midstream & Downstream', description: 'Refining, blending, terminals, fuel supply chain, energy and carbon' },
  assurance: { name: 'Assurance', description: 'Risk, compliance, competency and quality management' }
};

// Individual App Base Price (if purchased à la carte)
export const APP_BASE_PRICE = 99;

// Special app pricing overrides (A la carte)
export const SPECIAL_APP_PRICING = {
  'well-planning': 299,
  'project-management-pro': 199,
  'basinflow-genesis': 349,
  'fracture-prediction': 249
};

// Service Tiers
export const TIERS = [
  { 
    id: 'starter', 
    name: 'Starter', 
    multiplier: 1.0, 
    description: 'Core features, standard support',
    features: ['Standard Support', 'Daily Backups', '99.5% SLA']
  },
  { 
    id: 'growth', 
    name: 'Growth', 
    multiplier: 1.25, 
    description: 'Advanced features, priority support',
    features: ['Priority Support', 'Hourly Backups', '99.9% SLA', 'API Access']
  },
  { 
    id: 'enterprise', 
    name: 'Enterprise', 
    multiplier: 1.5, 
    description: 'All features, dedicated success manager',
    features: ['Dedicated Success Manager', 'Real-time Backups', '99.99% SLA', 'Custom Integrations', 'SSO/SAML']
  },
];

// Bundles
export const BUNDLES = [
  {
    id: 'full_platform',
    name: 'Full Platform Suite',
    discount: 0.20,
    description: 'Get access to all modules at a discounted rate'
  }
];

// Billing Periods
export const BILLING_PERIODS = [
  { id: 'monthly', name: 'Monthly', months: 1, discount: 0, label: '1 Mo', description: 'Standard Billing' },
  { id: 'quarterly', name: 'Quarterly', months: 3, discount: 0.10, label: '3 Mo', description: 'Save 10%' },
  { id: 'annual', name: 'Annual', months: 12, discount: 0.15, label: '12 Mo', description: 'Save 15%' },
  { id: '2year', name: '2 Years', months: 24, discount: 0.20, label: '24 Mo', description: 'Save 20%' },
  { id: '3year', name: '3 Years', months: 36, discount: 0.25, label: '36 Mo', description: 'Save 25%' }
];

export const getAppPrice = (appId) => {
  return SPECIAL_APP_PRICING[appId] || APP_BASE_PRICE;
};