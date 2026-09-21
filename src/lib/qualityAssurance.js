// QUALITYASSURANCE RE-EXPORT SHIM (Assurance extraction AS12, 2026-09-18).
// The rules written at AS7 now live in the vendored @petrolord/engines
// package (packages/engines/engines/assurance/qualityAssurance.js, from
// Petrolord/petrolord-engines) with committed goldens and an independent
// stdlib oracle. This path keeps every existing import working. The colour
// tokens below are presentation, so they stay in the Suite and are the only
// code in this file. Never edit the vendored copy from the Suite; change it
// in the engines repo and vendor it.
export * from '../../packages/engines/engines/assurance/qualityAssurance.js';

export const PLAN_STATUS_TOKENS = Object.freeze({
  Draft: '--muted-foreground',
  'Under review': '--primary',
  Active: '--success',
  Superseded: '--muted-foreground',
  Closed: '--primary',
  Cancelled: '--muted-foreground',
});

export const POINT_TYPE_TOKENS = Object.freeze({
  'Hold point': '--destructive',
  'Witness point': '--warning',
  'Review point': '--primary',
  'Monitor point': '--muted-foreground',
  'Surveillance point': '--muted-foreground',
});

export const CHECKPOINT_STATUS_TOKENS = Object.freeze({
  Pending: '--muted-foreground',
  Notified: '--primary',
  'In progress': '--warning',
  Passed: '--success',
  Failed: '--destructive',
  Waived: '--warning',
  'Not applicable': '--muted-foreground',
});

export const SEVERITY_TOKENS = Object.freeze({
  Critical: '--destructive',
  Major: '--destructive',
  Minor: '--warning',
  Observation: '--muted-foreground',
});

export const NCR_STATUS_TOKENS = Object.freeze({
  Open: '--destructive',
  'Under investigation': '--warning',
  'Disposition agreed': '--warning',
  'Actions in progress': '--warning',
  Verification: '--primary',
  Closed: '--success',
  Voided: '--muted-foreground',
});

export const CAPA_STATUS_TOKENS = Object.freeze({
  Open: '--warning',
  'In progress': '--warning',
  Complete: '--success',
  Cancelled: '--muted-foreground',
});

export const SEVERITY_CHART_COLORS = Object.freeze({
  Critical: '#881337',
  Major: '#dc2626',
  Minor: '#d97706',
  Observation: '#64748b',
});

export const PLAN_STATUS_CHART_COLORS = Object.freeze({
  Draft: '#94a3b8',
  'Under review': '#0891b2',
  Active: '#059669',
  Superseded: '#64748b',
  Closed: '#2563eb',
  Cancelled: '#94a3b8',
});

export const CHECKPOINT_STATUS_CHART_COLORS = Object.freeze({
  Pending: '#94a3b8',
  Notified: '#0891b2',
  'In progress': '#d97706',
  Passed: '#059669',
  Failed: '#dc2626',
  Waived: '#7c3aed',
  'Not applicable': '#64748b',
});
