// Base pricing constants
export const BASE_PLATFORM_FEE = 299; // Monthly base fee for accessing the platform
export const USER_SEAT_PRICE = 49; // Price per user per month
export const STORAGE_GB_PRICE = 0.5; // Price per GB per month
export const VAT_RATE = 0.075; // 7.5% VAT

// Module Pricing (Bundled Price)
export const MODULE_PRICING = {
  geoscience: 899,
  reservoir: 799,
  drilling: 899,
  production: 699,
  economics: 599,
  facilities: 699,
  assurance: 499
};

// Individual App Base Price (if purchased à la carte)
export const APP_BASE_PRICE = 99;

// Special app pricing overrides (A la carte)
export const SPECIAL_APP_PRICING = {
  'earth-model-pro': 499,
  'subsurface-studio': 399,
  'well-planning': 299,
  'material-balance-pro': 299,
  'project-management-pro': 199,
  'basinflow-genesis': 349,
  'network-diagram-pro': 199,
  'petroleum-economics-studio': 399,
  'velocity-model-builder': 249,
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