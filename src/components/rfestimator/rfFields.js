// Field specs + formatters shared by the Recovery Factor Estimator panels,
// the report model and the tests. Each field names its quantity kind
// (src/utils/rfestimator/units.js) so it shows and stores in the display
// unit (RF-U1-008).
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { toDisplay, unitLabel } from '@/utils/rfestimator/units';

export { DEFAULT_DRIVE } from '@/utils/rfestimator/model';

// Oil vs gas method menus.
export const METHODS = {
  oil: [
    { code: 'analog', label: 'Drive-mechanism analog' },
    { code: 'api_solution_gas', label: 'API (1967): solution-gas drive' },
    { code: 'api_water_drive', label: 'API (1967): water drive' },
    { code: 'displacement_sweep', label: 'Displacement x sweep (kr-1)' },
  ],
  gas: [
    { code: 'analog', label: 'Drive-mechanism analog' },
    { code: 'gas_pz', label: 'p/z depletion (exact)' },
    { code: 'gas_water_drive', label: 'Water-drive gas (trapping)' },
  ],
};

export const methodLabel = (code) => [...METHODS.oil, ...METHODS.gas].find((m) => m.code === code)?.label || code;

// Correlation input specs per method: [key, label, kind].
export const CORR_FIELDS = {
  api_solution_gas: [
    ['phi', 'Porosity φ', 'fraction'], ['swi', 'Swi', 'fraction'], ['bob', 'Bob', 'fvfOil'],
    ['k', 'Permeability k', 'permeability'], ['muob', 'μob', 'viscosity'], ['pb', 'Bubble-pt pb', 'pressure'], ['pa', 'Abandon pa', 'pressure'],
  ],
  api_water_drive: [
    ['phi', 'Porosity φ', 'fraction'], ['swi', 'Swi', 'fraction'], ['boi', 'Boi', 'fvfOil'],
    ['k', 'Permeability k', 'permeability'], ['muwi', 'μwi', 'viscosity'], ['muoi', 'μoi', 'viscosity'],
    ['pi', 'Initial pi', 'pressure'], ['pa', 'Abandon pa', 'pressure'],
  ],
  displacement_sweep: [
    ['muoi', 'μoi', 'viscosity'], ['muwi', 'μwi', 'viscosity'], ['sweep', 'Sweep Ev = EA x EI', 'fraction'], ['qiPv', 'Pore volumes injected Qi (blank: end point)', 'dimensionless'],
  ],
  gas_pz: [
    ['pi', 'Initial pi', 'pressure'], ['zi', 'zi', 'z'], ['pa', 'Abandon pa', 'pressure'], ['za', 'za', 'z'],
  ],
  gas_water_drive: [
    ['swi', 'Swi', 'fraction'], ['sgr', 'Residual gas Sgr', 'fraction'], ['sweep', 'Sweep efficiency', 'fraction'],
  ],
};

/**
 * The method inputs of a case: CORR_FIELDS of its method, plus pi, zi, pa and
 * za for a water-drive gas case abandoned at pa (RF-U2-010).
 */
export function corrFieldsFor(inputs) {
  const base = CORR_FIELDS[inputs?.method] || [];
  if (inputs?.method === 'gas_water_drive' && inputs?.corr?.gwdMode === 'abandonment') {
    return [...base, ['pi', 'Initial pi', 'pressure'], ['zi', 'zi', 'z'], ['pa', 'Abandon pa', 'pressure'], ['za', 'za', 'z']];
  }
  return base;
}

export const VOL_FIELDS_OIL = [
  ['area', 'Area A', 'area'], ['thickness', 'Net pay h', 'length'], ['phi', 'Porosity φ', 'fraction'],
  ['sw', 'Water sat Sw', 'fraction'], ['ntg', 'Net-to-gross', 'fraction'], ['boi', 'Boi', 'fvfOil'],
];
export const VOL_FIELDS_GAS = [
  ['area', 'Area A', 'area'], ['thickness', 'Net pay h', 'length'], ['phi', 'Porosity φ', 'fraction'],
  ['sw', 'Water sat Sw', 'fraction'], ['ntg', 'Net-to-gross', 'fraction'], ['bgi', 'Bgi', 'fvfGasCf'],
];

/** Plain-text names of the inputs (the report and the source list use them). */
export const PLAIN_LABELS = Object.freeze({
  phi: 'Porosity', swi: 'Initial water saturation Swi', bob: 'Oil FVF at the bubble point Bob', k: 'Permeability k',
  muob: 'Oil viscosity at the bubble point muob', pb: 'Bubble point pressure pb', pa: 'Abandonment pressure pa',
  boi: 'Initial oil FVF Boi', muwi: 'Water viscosity muwi', muoi: 'Initial oil viscosity muoi', pi: 'Initial pressure pi',
  zi: 'Gas deviation factor at pi, zi', za: 'Gas deviation factor at pa, za', sgr: 'Residual gas saturation Sgr',
  sweep: 'Volumetric sweep efficiency Ev', area: 'Area A', thickness: 'Net pay h', sw: 'Water saturation Sw',
  ntg: 'Net-to-gross NTG', bgi: 'Initial gas FVF Bgi',
  qiPv: 'Pore volumes of water injected Qi (blank: the end point)',
  gasGravity: 'Gas gravity (air = 1)', tempF: 'Reservoir temperature',
});

export const fmtPct = (v) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : `${(v * 100).toFixed(1)}%`);

/** A reserves or in-place volume (STB or scf held) in the display multiple. */
export const fmtRes = (v, phase, system = 'oilfield') => {
  if (v == null || !Number.isFinite(v)) return EMPTY_VALUE;
  const kind = phase === 'gas' ? 'gasVolumeB' : 'oilVolumeMM';
  const shown = phase === 'gas' ? toDisplay(kind, v / 1e9, system) : toDisplay(kind, v / 1e6, system);
  return `${shown.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unitLabel(kind, system)}`;
};
