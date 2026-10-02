/**
 * Input provenance: the words a report prints in its "Source and quality"
 * column. One place, so every Suite report says the same thing the same way.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { INPUT_SOURCES } from './model.js';

const text = (v) => (v != null && String(v).trim() ? String(v).trim() : '');

/** An input that was entered with no source chosen. */
export const SOURCE_NOT_STATED = 'Entered, source not stated';
/** An optional input that was left empty. */
export const NOT_PROVIDED = 'Not provided';

/**
 * The words the Source column prints for one input. `auto` is a source the
 * app itself knows (a value it computed, a default it applied, a handoff
 * from another app); it wins over the selector because it describes what
 * actually happened. The quality note, when there is one, follows as its
 * own sentence.
 * @param {?{source?: string, correlation?: string, note?: string}} meta
 * @param {?string} [auto]
 */
export function sourceText(meta, auto = null) {
  const note = text(meta?.note);
  let base;
  if (auto) base = auto;
  else if (meta?.source === 'correlation') base = text(meta?.correlation) ? `Correlation: ${text(meta.correlation)}` : 'Correlation (not named)';
  else if (meta?.source && INPUT_SOURCES[meta.source]) base = INPUT_SOURCES[meta.source];
  else base = SOURCE_NOT_STATED;
  return note ? `${base}. ${note}` : base;
}

/** The assumption wording for a default the app applied because nothing was entered. */
export const assumedDefaultText = (value) => `Assumed default ${value} (no value entered)`;

/** A value the app computed: "Computed: ct = cf + So co + Sw cw". */
export const computedText = (how) => `Computed: ${how}`;

/**
 * One row of a report's inputs table.
 * @param {{key?: string, label: string, value: ?string, unit?: string,
 *   meta?: object, auto?: ?string, provided?: boolean}} a
 *   `value` is the formatted value; null or '' prints as EMPTY_VALUE and,
 *   unless `provided` says otherwise, the source reads "Not provided".
 * @returns {{key: string, label: string, value: string, unit: string, source: string}}
 */
export function inputRow({ key, label, value, unit = '', meta = null, auto = null, provided }) {
  const has = provided ?? (text(value) !== '' && value !== EMPTY_VALUE);
  return {
    key: key ?? label,
    label,
    value: text(value) || EMPTY_VALUE,
    unit: unit || '',
    source: has || auto ? sourceText(meta, auto) : NOT_PROVIDED,
  };
}
