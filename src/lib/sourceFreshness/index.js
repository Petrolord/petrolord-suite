/**
 * Source freshness: the "Source changed" notice for inputs pulled from the
 * typed registries. Model (pure) in model.js, the hook in
 * useSourceFreshness.js, the notice in SourceChangedNotice.jsx. Design and
 * the apps that adopt it: docs/scope/ReportKit-DESIGN-AND-STATUS.md
 * (section "Source freshness").
 */
export {
  SOURCE_KINDS, kindLabel, stableJson, fingerprintOf, snapshotOf, sourceRef, keepToken, describeChange,
  compareSource, needsAttention, keepSource, pruneKept, whenText, noticeText, staleResultsText,
} from './model.js';
export { useSourceFreshness } from './useSourceFreshness.js';
export { default as SourceChangedNotice, StaleResultsMark } from './SourceChangedNotice.jsx';
