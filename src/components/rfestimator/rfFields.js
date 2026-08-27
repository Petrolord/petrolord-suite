// Field specs + formatters shared by the Recovery Factor Estimator
// panels. Moved verbatim from the pre-Studio page; the engine
// (recoveryFactorCalculations.js) is untouched.

// Oil vs gas method menus.
export const METHODS = {
  oil: [
    { code: 'analog', label: 'Drive-mechanism analog' },
    { code: 'api_solution_gas', label: 'API — solution-gas drive' },
    { code: 'api_water_drive', label: 'API — water drive' },
  ],
  gas: [
    { code: 'analog', label: 'Drive-mechanism analog' },
    { code: 'gas_pz', label: 'p/z depletion (exact)' },
    { code: 'gas_water_drive', label: 'Water-drive gas (trapping)' },
  ],
};

export const DEFAULT_DRIVE = { oil: 'water_drive', gas: 'gas_volumetric' };

// Correlation input specs per method (key, label, unit).
export const CORR_FIELDS = {
  api_solution_gas: [
    ['phi', 'Porosity φ', 'frac'], ['swi', 'Swi', 'frac'], ['bob', 'Bob', 'RB/STB'],
    ['k', 'Permeability k', 'md'], ['muob', 'μob', 'cp'], ['pb', 'Bubble-pt pb', 'psia'], ['pa', 'Abandon pa', 'psia'],
  ],
  api_water_drive: [
    ['phi', 'Porosity φ', 'frac'], ['swi', 'Swi', 'frac'], ['boi', 'Boi', 'RB/STB'],
    ['k', 'Permeability k', 'md'], ['muwi', 'μwi', 'cp'], ['muoi', 'μoi', 'cp'],
    ['pi', 'Initial pi', 'psia'], ['pa', 'Abandon pa', 'psia'],
  ],
  gas_pz: [
    ['pi', 'Initial pi', 'psia'], ['zi', 'zi', '—'], ['pa', 'Abandon pa', 'psia'], ['za', 'za', '—'],
  ],
  gas_water_drive: [
    ['swi', 'Swi', 'frac'], ['sgr', 'Residual gas Sgr', 'frac'], ['sweep', 'Sweep efficiency', 'frac'],
  ],
};

export const VOL_FIELDS_OIL = [
  ['area', 'Area A', 'acres'], ['thickness', 'Net pay h', 'ft'], ['phi', 'Porosity φ', 'frac'],
  ['sw', 'Water sat Sw', 'frac'], ['ntg', 'Net-to-gross', 'frac'], ['boi', 'Boi', 'RB/STB'],
];
export const VOL_FIELDS_GAS = [
  ['area', 'Area A', 'acres'], ['thickness', 'Net pay h', 'ft'], ['phi', 'Porosity φ', 'frac'],
  ['sw', 'Water sat Sw', 'frac'], ['ntg', 'Net-to-gross', 'frac'], ['bgi', 'Bgi', 'ft³/scf'],
];

export const fmtPct = (v) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`);

export const fmtRes = (v, phase) => {
  if (v == null || !Number.isFinite(v)) return '—';
  return phase === 'gas'
    ? `${(v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })} Bscf`
    : `${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })} MMSTB`;
};
