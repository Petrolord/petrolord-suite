// The one glyph the Suite shows when a value is missing in a table cell,
// card or stat tile. Import it; do not type a literal placeholder.
// Guarded by src/__tests__/w10EmptyValue.test.js.
export const EMPTY_VALUE = 'n/a';

// orEmpty(v): v itself, or EMPTY_VALUE when v is null, undefined, '' or NaN.
export const orEmpty = (v) => (v == null || v === '' || (typeof v === 'number' && Number.isNaN(v)) ? EMPTY_VALUE : v);
