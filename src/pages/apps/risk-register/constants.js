export const RISK_CATEGORIES = [
  'Operational',
  'Health, Safety & Environment (HSE)',
  'Financial',
  'Strategic',
  'Compliance & Regulatory',
  'IT & Cybersecurity',
  'Subsurface & Reservoir',
  'Drilling & Completions',
  'Facilities & Production',
  'Supply Chain & Logistics',
  'Human Resources'
];

export const RISK_STATUSES = [
  'Draft',
  'Open',
  'Under Review',
  'Mitigated',
  'Closed',
  'Realized'
];

export const LIKELIHOOD_LEVELS = [
  { value: 1, label: '1 - Rare', description: 'Highly unlikely to occur' },
  { value: 2, label: '2 - Unlikely', description: 'Not expected to occur' },
  { value: 3, label: '3 - Possible', description: 'Might occur at some time' },
  { value: 4, label: '4 - Likely', description: 'Will probably occur' },
  { value: 5, label: '5 - Almost Certain', description: 'Expected to occur' }
];

export const IMPACT_LEVELS = [
  { value: 1, label: '1 - Negligible', description: 'Minimal impact, easily handled' },
  { value: 2, label: '2 - Minor', description: 'Minor disruption, manageable' },
  { value: 3, label: '3 - Moderate', description: 'Significant disruption, requires effort' },
  { value: 4, label: '4 - Major', description: 'Severe disruption, high cost' },
  { value: 5, label: '5 - Catastrophic', description: 'Disastrous impact, existential threat' }
];