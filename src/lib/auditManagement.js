// AUDITMANAGEMENT RE-EXPORT SHIM (Assurance extraction AS12, 2026-09-18).
// The rules written at AS10 now live in the vendored @petrolord/engines
// package (packages/engines/engines/assurance/auditManagement.js, from
// Petrolord/petrolord-engines) with committed goldens and an independent
// stdlib oracle. This path keeps every existing import working. The colour
// tokens below are presentation, so they stay in the Suite and are the only
// code in this file. Never edit the vendored copy from the Suite; change it
// in the engines repo and vendor it.
export * from '../../packages/engines/engines/assurance/auditManagement.js';

// The ISO finding tokens this app's pages import through it (AS10).
export {
  ACTION_STATUS_TOKENS,
  AUDIT_STATUS_CHART_COLORS,
  AUDIT_STATUS_TOKENS,
  FINDING_STATUS_TOKENS,
  FINDING_TYPE_CHART_COLORS,
  FINDING_TYPE_TOKENS,
} from './isoCompliance';

export const PROGRAMME_STATUS_TOKENS = Object.freeze({
  Draft: '--muted-foreground',
  Approved: '--primary',
  'In progress': '--warning',
  Complete: '--success',
  Cancelled: '--muted-foreground',
});

export const CRITICALITY_TOKENS = Object.freeze({
  Critical: '--destructive',
  Major: '--warning',
  Minor: '--muted-foreground',
});

export const RESULT_TOKENS = Object.freeze({
  'Not examined': '--muted-foreground',
  Conformant: '--success',
  Nonconformant: '--destructive',
  Observation: '--primary',
  'Not applicable': '--muted-foreground',
});

export const RESULT_CHART_COLORS = Object.freeze({
  'Not examined': '#94a3b8',
  Conformant: '#059669',
  Nonconformant: '#dc2626',
  Observation: '#0891b2',
  'Not applicable': '#64748b',
});
