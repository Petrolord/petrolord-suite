// MANAGEMENTOFCHANGE RE-EXPORT SHIM (Assurance extraction AS12, 2026-09-18).
// The rules written at AS6 now live in the vendored @petrolord/engines
// package (packages/engines/engines/assurance/managementOfChange.js, from
// Petrolord/petrolord-engines) with committed goldens and an independent
// stdlib oracle. This path keeps every existing import working. The colour
// tokens below are presentation, so they stay in the Suite and are the only
// code in this file. Never edit the vendored copy from the Suite; change it
// in the engines repo and vendor it.
export * from '../../packages/engines/engines/assurance/managementOfChange.js';
import {
  EXPIRY,
} from '../../packages/engines/engines/assurance/managementOfChange.js';

/** CSS tokens for badges inside the app shell. */
export const STAGE_TOKENS = Object.freeze({
  Draft: '--muted-foreground',
  Screening: '--primary',
  Review: '--primary',
  Approval: '--warning',
  Implementation: '--warning',
  Closed: '--success',
  Rejected: '--destructive',
  Cancelled: '--muted-foreground',
});

export const RISK_TOKENS = Object.freeze({
  Low: '--success',
  Medium: '--warning',
  High: '--destructive',
  Critical: '--destructive',
});

export const TYPE_TOKENS = Object.freeze({
  Permanent: '--muted-foreground',
  Temporary: '--warning',
  Emergency: '--destructive',
});

export const EXPIRY_TOKENS = Object.freeze({
  [EXPIRY.EXPIRED]: '--destructive',
  [EXPIRY.EXPIRING]: '--warning',
  [EXPIRY.WITHIN]: '--success',
  [EXPIRY.NONE]: '--muted-foreground',
  [EXPIRY.NOT_APPLICABLE]: '--muted-foreground',
  [EXPIRY.CLOSED_OUT]: '--muted-foreground',
});

/** The same stages on the white chart surface. */
export const STAGE_CHART_COLORS = Object.freeze({
  Draft: '#94a3b8',
  Screening: '#0891b2',
  Review: '#2563eb',
  Approval: '#d97706',
  Implementation: '#7c3aed',
  Closed: '#059669',
  Rejected: '#dc2626',
  Cancelled: '#64748b',
});

export const RISK_CHART_COLORS = Object.freeze({
  Low: '#059669',
  Medium: '#d97706',
  High: '#dc2626',
  Critical: '#881337',
});
