// Petroleum Economics Studio on the design system (pilot 3, 2026-09-27).
//
// The class recipes every EPE page shares, written only with the theme roles
// of src/design/tokens.js (bg-pl-*, text-pl-*, border-pl-*). They resolve
// inside the <ThemedApp> scope that wraps the EPE routes in App.jsx, so the
// same string reads correctly in light and in dark. Keep hues out of this
// file: status colour goes through the status roles only.
//
// See docs/scope/DesignSystem-example-EPE.md for the worked example. The
// Checkbox now themes itself; the select, dense-cell and signed-number
// recipes live in the shared ui pieces and are re-exported here.
import { NATIVE_SELECT_THEMED, COMPACT_FIELD_THEMED } from '@/components/ui/native-select';
import { signedTone } from '@/components/ui/numeric-table';

/** Page body under the AppHeader. */
export const epePage = 'mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8';

/** A top-level panel (card) on the page canvas. */
export const epePanel = 'rounded-xl border border-pl-border bg-pl-surface p-4 shadow-pl-sm sm:p-6';

/** A group inside a panel (form sections, sub-results). */
export const epeSubPanel = 'rounded-lg border border-pl-border bg-pl-sunken/60 p-4';

/** A small KPI or summary tile. */
export const epeTile = 'rounded-lg border border-pl-border bg-pl-surface px-3 py-2';

/** A clickable list row (cases, runs, files). */
export const epeRow = 'rounded-lg border border-pl-border bg-pl-surface p-4 transition-colors hover:bg-pl-sunken';

/** Section heading inside a panel. */
export const epeH2 = 'text-lg font-semibold text-pl-text sm:text-xl';
export const epeH3 = 'text-base font-semibold text-pl-text';

/** A small uppercase group label. */
export const epeEyebrow = 'text-xs font-semibold uppercase tracking-wide text-pl-muted';

/** Numbers in tables and tiles: mono, tabular, right aligned where columnar. */
export const epeNum = 'font-pl-mono tabular-nums';
export const epeNumCell = 'text-right font-pl-mono tabular-nums whitespace-nowrap';

/** Negative money reads in the danger text colour next to its minus sign (shared: ui/numeric-table). */
export const epeSigned = signedTone;

/** A native <select>, matched to the themed Input (shared: ui/native-select). */
export const epeSelect = NATIVE_SELECT_THEMED;

/** A compact native <input> or <select> inside dense editor tables (shared). */
export const epeCellInput = COMPACT_FIELD_THEMED;

/** Native checkbox and radio. */
export const epeNativeCheck = 'accent-pl-primary';

/** Pill tabs and segmented choices (fiscal regime, results tabs). */
export const epePill = (active) => (
  'rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus '
  + (active
    ? 'bg-pl-primary text-pl-primary-fg shadow-pl-sm'
    : 'border border-pl-border bg-pl-sunken text-pl-text hover:bg-pl-border')
);

/** Status callouts and small badges: colour carries a word with it. */
const TONES = {
  info: 'border-pl-info/40 bg-pl-info-bg text-pl-info-text',
  success: 'border-pl-success/40 bg-pl-success-bg text-pl-success-text',
  warning: 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text',
  danger: 'border-pl-danger/40 bg-pl-danger-bg text-pl-danger-text',
  neutral: 'border-pl-border bg-pl-sunken text-pl-muted',
};
export const epeCallout = (tone = 'info') => `rounded-md border p-3 text-sm ${TONES[tone] || TONES.info}`;
export const epeBadge = (tone = 'neutral') =>
  `inline-block rounded border px-2 py-0.5 text-xs font-medium ${TONES[tone] || TONES.neutral}`;

/** Themed table pieces for hand-written <table> markup. */
export const epeTable = 'w-full border-collapse text-sm';
export const epeTh = 'border-b border-pl-border bg-pl-sunken px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-pl-muted';
export const epeThNum = 'border-b border-pl-border bg-pl-sunken px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-pl-muted';
export const epeTd = 'border-b border-pl-border px-3 py-2 text-pl-text';
