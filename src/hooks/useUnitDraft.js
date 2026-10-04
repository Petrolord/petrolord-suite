/**
 * Decimal-safe unit inputs, shared across the Suite.
 *
 * The defect this guards (WTA-U1-017, WTA-U1-021): a controlled input whose
 * value is a unit conversion of the stored value re-renders the stored value
 * converted back on every key, so the decimal point vanishes. "13." becomes
 * "13" and "13.7" m is stored as 137 m. The same happens when the box shows
 * a rounded or Number()-parsed copy of state ("2." shows as "2").
 *
 * The text being typed is kept as typed while it is the source of the
 * stored value; the converted value shows again on blur or when the stored
 * value changes from elsewhere (a sample, a project, an intake, a preset).
 *
 * `useDraftInput(value, onChange, { toDisplay, toStored })` is the generic
 * core:
 *   toDisplay(stored) -> the text the box shows when no draft is live
 *   toStored(text)    -> the value to store, or `undefined` to refuse the
 *                        text (incomplete or invalid: "", "-", "abc"). A
 *                        refused text stays in the box while typing and is
 *                        not stored (`refused` is true); blur restores the
 *                        stored value.
 *   unit              -> optional display unit; a draft typed in one unit
 *                        gives way when the unit changes.
 *
 * `createUnitDraft(units)` binds it to an app's unit module (one exposing
 * displayInputString / storeInputString over oilfield state strings) and
 * returns a `useUnitDraft(kind, value, system, onChange)` hook, the
 * signature Well Test and Nodal use.
 */
import { useState } from 'react';

const sameStored = (a, b) => String(a ?? '') === String(b ?? '');

/**
 * @param {*} value the stored value
 * @param {function(*)} onChange called with the converted value to store
 * @param {{toDisplay: function(*): string, toStored: function(string): *, unit?: string}} conv
 * @returns {{value: string, refused: boolean, onChange: function(string), onBlur: function}}
 */
export function useDraftInput(value, onChange, { toDisplay, toStored, unit = '' }) {
  // draft = { text, stored, unit, refused }: `stored` is the value the draft
  // stands for (what it committed, or the value it was refused against), so
  // a change from elsewhere no longer matches and the draft gives way. A
  // change of display unit drops the draft too: its text is in the old unit.
  const [draft, setDraft] = useState(null);
  const live = draft != null && draft.unit === unit && sameStored(draft.stored, value);
  return {
    value: live ? draft.text : toDisplay(value),
    refused: live && draft.refused,
    onChange: (text) => {
      const next = toStored(text);
      if (next === undefined) {
        setDraft({ text, stored: value, unit, refused: true });
        return;
      }
      setDraft({ text, stored: next, unit, refused: false });
      onChange(next);
    },
    onBlur: () => setDraft(null),
  };
}

/**
 * Bind the draft to an app unit module.
 * @param {{displayInputString: function, storeInputString: function}} units
 */
export function createUnitDraft({ displayInputString, storeInputString }) {
  return function useUnitDraft(kind, value, system, onChange) {
    return useDraftInput(value ?? '', onChange, {
      toDisplay: (stored) => displayInputString(kind, stored, system),
      toStored: (text) => storeInputString(kind, text, system),
    });
  };
}

/**
 * A finite number parsed from typed text, or undefined when the text is not
 * a complete number yet ("", "-", ".", "2e"). "2." parses as 2.
 */
export const parseTypedNumber = (text) => {
  const s = String(text ?? '').trim();
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};
