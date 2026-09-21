// ISOCOMPLIANCE RE-EXPORT SHIM (Assurance extraction AS12, 2026-09-18).
// The rules written at AS8 now live in the vendored @petrolord/engines
// package (packages/engines/engines/assurance/isoCompliance.js, from
// Petrolord/petrolord-engines) with committed goldens and an independent
// stdlib oracle. This path keeps every existing import working. The colour
// tokens below are presentation, so they stay in the Suite and are the only
// code in this file. Never edit the vendored copy from the Suite; change it
// in the engines repo and vendor it.
export * from '../../packages/engines/engines/assurance/isoCompliance.js';

export const CLAUSE_STATUS_TOKENS = Object.freeze({
  'Not assessed': '--muted-foreground',
  Conformant: '--success',
  'Partially conformant': '--warning',
  Nonconformant: '--destructive',
  'Not applicable': '--muted-foreground',
});

export const FINDING_TYPE_TOKENS = Object.freeze({
  'Major nonconformity': '--destructive',
  'Minor nonconformity': '--warning',
  Observation: '--primary',
  'Opportunity for improvement': '--muted-foreground',
});

export const FINDING_STATUS_TOKENS = Object.freeze({
  Open: '--destructive',
  'Correction proposed': '--warning',
  'Action in progress': '--warning',
  Verification: '--primary',
  Closed: '--success',
  Voided: '--muted-foreground',
});

export const AUDIT_STATUS_TOKENS = Object.freeze({
  Planned: '--muted-foreground',
  'In progress': '--warning',
  'Fieldwork complete': '--primary',
  Reported: '--primary',
  Closed: '--success',
  Cancelled: '--muted-foreground',
});

export const ACTION_STATUS_TOKENS = Object.freeze({
  Open: '--destructive',
  'In progress': '--warning',
  Complete: '--success',
  Cancelled: '--muted-foreground',
});

export const CERTIFICATION_TOKENS = Object.freeze({
  'Not certified': '--muted-foreground',
  'Seeking certification': '--warning',
  Certified: '--success',
  Suspended: '--destructive',
  Withdrawn: '--destructive',
});

export const CLAUSE_STATUS_CHART_COLORS = Object.freeze({
  'Not assessed': '#94a3b8',
  Conformant: '#059669',
  'Partially conformant': '#d97706',
  Nonconformant: '#dc2626',
  'Not applicable': '#64748b',
});

export const FINDING_TYPE_CHART_COLORS = Object.freeze({
  'Major nonconformity': '#881337',
  'Minor nonconformity': '#dc2626',
  Observation: '#0891b2',
  'Opportunity for improvement': '#64748b',
});

export const AUDIT_STATUS_CHART_COLORS = Object.freeze({
  Planned: '#94a3b8',
  'In progress': '#d97706',
  'Fieldwork complete': '#0891b2',
  Reported: '#2563eb',
  Closed: '#059669',
  Cancelled: '#94a3b8',
});

export const COVERAGE_CHART_COLORS = Object.freeze({
  Covered: '#059669',
  'Audited before this cycle': '#d97706',
  'Never audited': '#dc2626',
});
