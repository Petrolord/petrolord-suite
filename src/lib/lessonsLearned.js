// LESSONSLEARNED RE-EXPORT SHIM (Assurance extraction AS12, 2026-09-18).
// The rules written at AS9 now live in the vendored @petrolord/engines
// package (packages/engines/engines/assurance/lessonsLearned.js, from
// Petrolord/petrolord-engines) with committed goldens and an independent
// stdlib oracle. This path keeps every existing import working. The colour
// tokens below are presentation, so they stay in the Suite and are the only
// code in this file. Never edit the vendored copy from the Suite; change it
// in the engines repo and vendor it.
export * from '../../packages/engines/engines/assurance/lessonsLearned.js';

export const STATUS_TOKENS = Object.freeze({
  Draft: '--muted-foreground',
  Submitted: '--warning',
  Validated: '--primary',
  Published: '--success',
  Embedded: '--success',
  Archived: '--muted-foreground',
  Superseded: '--muted-foreground',
});

export const OUTCOME_TOKENS = Object.freeze({
  Adopted: '--success',
  Adapted: '--primary',
  Rejected: '--destructive',
});

export const SCOPE_TOKENS = Object.freeze({
  'This asset': '--muted-foreground',
  'This discipline': '--primary',
  'This organization': '--success',
  'Industry-wide': '--success',
});

export const STATUS_CHART_COLORS = Object.freeze({
  Draft: '#94a3b8',
  Submitted: '#d97706',
  Validated: '#0891b2',
  Published: '#2563eb',
  Embedded: '#059669',
  Archived: '#64748b',
  Superseded: '#64748b',
});

export const OUTCOME_CHART_COLORS = Object.freeze({
  Adopted: '#059669',
  Adapted: '#0891b2',
  Rejected: '#dc2626',
});
