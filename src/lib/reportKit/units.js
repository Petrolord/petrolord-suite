/**
 * Report Kit: unit labels and display values through the Suite unit profile
 * (lib/units, docs/scope/SuiteUnits-DESIGN-AND-STATUS.md).
 *
 * A report states the units it prints in. An app that follows the Suite
 * unit profile hands the resolved units ({ family: unit }, the `units` of
 * resolveProfile or of useUnitProfile) to reportUnits and gets back the
 * label, the converted value and the column head for each quantity family,
 * plus the one line the header prints under "Display units".
 *
 * Only the pure modules of lib/units are imported (registry, presets,
 * vocabulary), so this stays free of React.
 */
import { FAMILIES, unitInfo, toDisplay, convert } from '@/lib/units/registry';
import { PRESETS, BUILT_IN_PRESET } from '@/lib/units/presets';
import { systemFor } from '@/lib/units/vocabulary';
import { pdfText } from './text.js';
import { withUnit } from './format.js';

const SYSTEM_WORDS = Object.freeze({ oilfield: 'Oilfield', metric: 'SI / metric' });

/** The header's "Display units" line for a unit system by name ('oilfield', 'metric' or an app's 'si'). */
export const displayUnitsText = (system) => (system === 'si' || system === 'metric' ? SYSTEM_WORDS.metric : SYSTEM_WORDS.oilfield);

/**
 * @param {Object<string, string>} [units] resolved profile units, { family: unit };
 *   a family that is missing falls back to the built-in preset
 * @returns {{unit: function(string): string, label: function(string): string,
 *   value: function(string, number): number, convert: function(string, number, string): number,
 *   head: function(string, string): string, system: function(string[]): string,
 *   displayUnits: function(string[]): string}}
 */
export function reportUnits(units = {}) {
  const built = PRESETS[BUILT_IN_PRESET];
  const unit = (family) => {
    if (!FAMILIES[family]) throw new Error(`Report Kit: unknown unit family "${family}".`);
    return unitInfo(family, units?.[family]) ? units[family] : built[family];
  };
  // the unit key is the short form ("psi"); the registry label can carry a gloss
  const label = (family) => pdfText(unit(family));
  const resolved = (families) => Object.fromEntries(families.map((f) => [f, unit(f)]));
  return {
    /** The unit key the report prints this family in. */
    unit,
    /** The same, safe for the PDF fonts. */
    label,
    /** A stored (canonical) value in the report's unit for the family. */
    value: (family, canonicalValue) => toDisplay(family, canonicalValue, unit(family)),
    /** A value held in another unit of the family, in the report's unit. */
    convert: (family, value, from) => convert(family, value, from, unit(family)),
    /** "Pressure (psi)": a column head or an axis title. */
    head: (text, family) => withUnit(text, label(family)),
    /** 'oilfield' or 'metric': what the listed families lean to. */
    system: (families) => systemFor(resolved(families), families),
    /** The header line: the system word, then the units of the listed families. */
    displayUnits: (families) => {
      const sys = systemFor(resolved(families), families);
      const list = [...new Set(families.map(label))].join(', ');
      return list ? `${SYSTEM_WORDS[sys]} (${list})` : SYSTEM_WORDS[sys];
    },
  };
}
