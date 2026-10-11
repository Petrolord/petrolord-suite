// Project Data Inventory: the cell states. Each state has a colour, an icon
// shape and a fill pattern, so the matrix reads in greyscale, on a projector
// and for colour-blind readers (the owner's sample used colour alone).
// Colours are dark enough for white paper (the chart template standard);
// the screen view takes the same hues. Pure.

export const STATUS = Object.freeze({
  complete: {
    key: 'complete', label: 'Complete', short: 'Complete',
    meaning: 'Loaded in Petrolord and covers the interval of interest (95 percent or more).',
    icon: 'check', pattern: 'solid', rgb: [5, 150, 105], fill: [209, 250, 229], ink: [6, 95, 70], rank: 0,
  },
  partial: {
    key: 'partial', label: 'Partial', short: 'Partial',
    meaning: 'Loaded, with gaps, nulls or short coverage over the interval.',
    icon: 'half', pattern: 'hatch', rgb: [217, 119, 6], fill: [254, 243, 199], ink: [146, 64, 14], rank: 1,
  },
  derived: {
    key: 'derived', label: 'Derived', short: 'Derived',
    meaning: 'An estimate or a computed curve standing in for a measurement (for example a pseudo-shear).',
    icon: 'spark', pattern: 'dots', rgb: [124, 58, 237], fill: [237, 233, 254], ink: [91, 33, 182], rank: 2,
  },
  external: {
    key: 'external', label: 'Outside Petrolord', short: 'External',
    meaning: 'Provided to the project (a report, hard copy or file) but not loaded into Petrolord.',
    icon: 'doc', pattern: 'lines', rgb: [8, 145, 178], fill: [207, 250, 254], ink: [21, 94, 117], rank: 3,
  },
  missing: {
    key: 'missing', label: 'Not loaded', short: 'Not loaded',
    meaning: 'Petrolord holds nothing for it over the interval.',
    icon: 'cross', pattern: 'cross', rgb: [220, 38, 38], fill: [254, 226, 226], ink: [153, 27, 27], rank: 4,
  },
  notAcquired: {
    key: 'notAcquired', label: 'Not acquired', short: 'Not acquired',
    meaning: 'Never recorded in this well, per the records (set by the user).',
    icon: 'dash', pattern: 'grey', rgb: [100, 116, 139], fill: [226, 232, 240], ink: [51, 65, 85], rank: 5,
  },
  unrecorded: {
    key: 'unrecorded', label: 'Not recorded yet', short: 'To confirm',
    meaning: 'Petrolord cannot see this kind of data; confirm whether it exists.',
    icon: 'ring', pattern: 'none', rgb: [148, 163, 184], fill: [255, 255, 255], ink: [100, 116, 139], rank: 6,
  },
  pending: {
    key: 'pending', label: 'Scanning', short: 'Scanning',
    meaning: 'Judged from the curve samples, which are still being read.',
    icon: 'clock', pattern: 'none', rgb: [148, 163, 184], fill: [248, 250, 252], ink: [100, 116, 139], rank: 7,
  },
});

export const STATUS_ORDER = Object.freeze(['complete', 'partial', 'derived', 'external', 'missing', 'notAcquired', 'unrecorded']);

/** The states a user may set on a cell; 'auto' clears the override. */
export const OVERRIDE_CHOICES = Object.freeze([
  { key: 'auto', label: 'As found in Petrolord' },
  { key: 'external', label: 'Provided outside Petrolord' },
  { key: 'notAcquired', label: 'Not acquired' },
  { key: 'partial', label: 'Incomplete' },
  { key: 'missing', label: 'Requested, not received' },
]);

/** Manual (report) row states, mapped onto the cell states. */
export const MANUAL_STATES = Object.freeze([
  { key: 'received', label: 'Received', status: 'external' },
  { key: 'incomplete', label: 'Incomplete', status: 'partial' },
  { key: 'awaited', label: 'Requested, awaited', status: 'missing' },
  { key: 'notAcquired', label: 'Not acquired', status: 'notAcquired' },
  { key: 'loaded', label: 'Loaded in Petrolord', status: 'complete' },
]);
export const MANUAL_STATE_BY_KEY = Object.freeze(Object.fromEntries(MANUAL_STATES.map((s) => [s.key, s])));

/** States that count as "the data exists and can be used". */
export const AVAILABLE = Object.freeze(new Set(['complete', 'partial', 'derived', 'external']));

export const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
