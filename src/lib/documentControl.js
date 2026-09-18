// DOCUMENTCONTROL RE-EXPORT SHIM (Assurance extraction AS12, 2026-09-18).
// The rules written at AS4 now live in the vendored @petrolord/engines
// package (packages/engines/engines/assurance/documentControl.js, from
// Petrolord/petrolord-engines) with committed goldens and an independent
// stdlib oracle. This path keeps every existing import working. The colour
// tokens below are presentation, so they stay in the Suite and are the only
// code in this file. Never edit the vendored copy from the Suite; change it
// in the engines repo and vendor it.
export * from '../../packages/engines/engines/assurance/documentControl.js';

/** CSS tokens, for badges inside the app shell. */
export const STATUS_TOKENS = Object.freeze({
  Draft: '--muted-foreground',
  'In Review': '--warning',
  Approved: '--primary',
  Published: '--success',
  Superseded: '--muted-foreground',
  Obsolete: '--muted-foreground',
  Rejected: '--destructive',
});

export const CONFIDENTIALITY_TOKENS = Object.freeze({
  Public: '--primary',
  Internal: '--muted-foreground',
  Confidential: '--warning',
  Restricted: '--destructive',
});

/**
 * The same statuses on the white chart surface, where a token taking
 * its lightness from a dark app theme would vanish. Colour is never the
 * only carrier; every consumer prints the word too.
 */
export const STATUS_CHART_COLORS = Object.freeze({
  Draft: '#94a3b8',        // slate-400
  'In Review': '#d97706',  // amber-600
  Approved: '#2563eb',     // blue-600
  Published: '#059669',    // emerald-600
  Superseded: '#64748b',   // slate-500
  Obsolete: '#475569',     // slate-600
  Rejected: '#dc2626',     // red-600
});
