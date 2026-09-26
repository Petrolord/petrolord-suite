// MRF-T1-001: product ids are engine keys ("lpg", "fuelOil"); the screen
// shows the names a refiner uses.
const NAMES = {
  lpg: 'LPG', naphtha: 'Naphtha', gasoline: 'Gasoline', kerosene: 'Kerosene',
  diesel: 'Diesel', fuelOil: 'Fuel oil', gas: 'Fuel gas', loss: 'Loss',
};
export const productLabel = (id) => NAMES[id]
  || String(id).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** Money with the sign before the currency: -$97.4MM, not $-97.4MM. */
export const signedUsd = (v, digits = 2, suffix = '') => (Number.isFinite(v)
  ? `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`
  : 'n/a');
