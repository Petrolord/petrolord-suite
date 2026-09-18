// COMPLIANCESTATUS RE-EXPORT SHIM (Assurance extraction AS12, 2026-09-18).
// The rules written at AS3 now live in the vendored @petrolord/engines
// package (packages/engines/engines/assurance/complianceStatus.js, from
// Petrolord/petrolord-engines) with committed goldens and an independent
// stdlib oracle. This path keeps every existing import working. The colour
// tokens below are presentation, so they stay in the Suite and are the only
// code in this file. Never edit the vendored copy from the Suite; change it
// in the engines repo and vendor it.
export * from '../../packages/engines/engines/assurance/complianceStatus.js';
import {
  STATUS,
} from '../../packages/engines/engines/assurance/complianceStatus.js';

/**
 * Which CSS token each status paints with. Named here so a badge, a
 * chart slice and a KPI tile cannot disagree about whether Due soon is
 * amber. Identity is never colour alone; every consumer prints the word
 * as well.
 */
export const STATUS_TOKENS = Object.freeze({
  [STATUS.EXPIRED]: '--destructive',
  [STATUS.OVERDUE]: '--destructive',
  [STATUS.DUE_SOON]: '--warning',
  [STATUS.ON_TRACK]: '--primary',
  [STATUS.COMPLIANT]: '--success',
  [STATUS.NO_DATE]: '--muted-foreground',
  [STATUS.DRAFT]: '--muted-foreground',
  [STATUS.SUPERSEDED]: '--muted-foreground',
  [STATUS.NOT_APPLICABLE]: '--muted-foreground',
});

/**
 * The same statuses on the white chart surface.
 *
 * The CSS tokens above are for badges inside the app shell, which
 * follows the user's theme. Charts do not: the Suite standard is a
 * white chart background with the 40px ChartLogo watermark, so a slice
 * painted `hsl(var(--success))` would take its lightness from a dark
 * app theme and vanish. These are the validated hexes on white, and
 * they live here rather than in the chart file so a slice and the badge
 * beside it cannot come to mean different things.
 *
 * Colour is never the only carrier: every consumer prints the word too.
 */
export const STATUS_CHART_COLORS = Object.freeze({
  [STATUS.EXPIRED]: '#881337',   // rose-900
  [STATUS.OVERDUE]: '#dc2626',   // red-600
  [STATUS.DUE_SOON]: '#d97706',  // amber-600
  [STATUS.ON_TRACK]: '#2563eb',  // blue-600
  [STATUS.COMPLIANT]: '#059669', // emerald-600
  [STATUS.NO_DATE]: '#64748b',   // slate-500
  [STATUS.DRAFT]: '#94a3b8',     // slate-400
  [STATUS.SUPERSEDED]: '#cbd5e1',// slate-300
  [STATUS.NOT_APPLICABLE]: '#e2e8f0', // slate-200
});
