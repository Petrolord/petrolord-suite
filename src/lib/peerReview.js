// PEERREVIEW RE-EXPORT SHIM (Assurance extraction AS12, 2026-09-18).
// The rules written at AS5 now live in the vendored @petrolord/engines
// package (packages/engines/engines/assurance/peerReview.js, from
// Petrolord/petrolord-engines) with committed goldens and an independent
// stdlib oracle. This path keeps every existing import working. The colour
// tokens below are presentation, so they stay in the Suite and are the only
// code in this file. Never edit the vendored copy from the Suite; change it
// in the engines repo and vendor it.
export * from '../../packages/engines/engines/assurance/peerReview.js';

/** CSS tokens for badges inside the app shell. */
export const STAGE_TOKENS = Object.freeze({
  Draft: '--muted-foreground',
  'In Review': '--primary',
  Verification: '--warning',
  Closed: '--success',
  Cancelled: '--muted-foreground',
});

export const PRIORITY_TOKENS = Object.freeze({
  Low: '--muted-foreground',
  Medium: '--primary',
  High: '--warning',
  Critical: '--destructive',
});

export const DECISION_TOKENS = Object.freeze({
  Pending: '--muted-foreground',
  Approved: '--success',
  'Approved with conditions': '--warning',
  Rejected: '--destructive',
});

export const SEVERITY_TOKENS = Object.freeze({
  Critical: '--destructive',
  Major: '--warning',
  Minor: '--primary',
  Editorial: '--muted-foreground',
});

export const COMMENT_STATUS_TOKENS = Object.freeze({
  Open: '--destructive',
  Responded: '--warning',
  Verified: '--primary',
  Closed: '--success',
  Rejected: '--destructive',
  Withdrawn: '--muted-foreground',
});

/** The same values on the white chart surface. */
export const STAGE_CHART_COLORS = Object.freeze({
  Draft: '#94a3b8',
  'In Review': '#2563eb',
  Verification: '#d97706',
  Closed: '#059669',
  Cancelled: '#64748b',
});

export const SEVERITY_CHART_COLORS = Object.freeze({
  Critical: '#dc2626',
  Major: '#d97706',
  Minor: '#2563eb',
  Editorial: '#94a3b8',
});
