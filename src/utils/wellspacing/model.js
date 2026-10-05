/**
 * The Well Spacing Optimizer project (WS-U1): every input with its kind
 * (unit), its group on the form and whether the economics or only the
 * drainage diagnostics read it; the sample; the saved payload.
 *
 * Before this round nothing was saved and a reload lost the case (gap
 * matrix 4.13). The payload is { id, name, schema: 1, inputs, modified };
 * inputs hold the form in OILFIELD units as strings (blank: not given), the
 * display unit system, identification, input sources, the intakes. Results
 * are a pure function of the inputs and are recomputed on load.
 *
 * Pure.
 */
export const SCHEMA = 1;

/**
 * The inputs. `reads`: 'economics' (EUR, NPV and every number of the case
 * table), 'diagnostics' (drainage timing and deliverability only), 'record'
 * (printed, enters no equation). `required` mirrors validateInputs.
 */
export const FIELDS = Object.freeze([
  { key: 'reservoirArea', label: 'Reservoir area', kind: 'area', group: 'reservoir', reads: 'economics', required: true },
  { key: 'avgNetPayThickness', label: 'Average net pay', kind: 'thickness', group: 'reservoir', reads: 'economics', required: true },
  { key: 'porosity', label: 'Porosity', kind: 'percent', group: 'reservoir', reads: 'economics', required: true },
  { key: 'initialWaterSaturation', label: 'Initial water saturation', kind: 'fraction', group: 'reservoir', reads: 'economics', required: true },
  { key: 'recoveryFactor', label: 'Recovery factor (per well, over its drained area)', kind: 'percent', group: 'reservoir', reads: 'economics', required: true },
  { key: 'reservoirTemperature', label: 'Reservoir temperature', kind: 'temperature', group: 'fluid', reads: 'economics' },
  { key: 'oilGravity', label: 'Oil gravity', kind: 'api', group: 'fluid', reads: 'economics' },
  { key: 'gasGravity', label: 'Gas gravity', kind: 'gasGravity', group: 'fluid', reads: 'economics' },
  { key: 'initialSolutionGOR', label: 'Initial solution GOR (also the producing GOR)', kind: 'gor', group: 'fluid', reads: 'economics', required: true },
  { key: 'oilFvf', label: 'Oil FVF Bo (blank: Standing\'s correlation)', kind: 'fvf', group: 'fluid', reads: 'economics' },
  { key: 'wellCost', label: 'Well cost', kind: 'wellCost', group: 'well', reads: 'economics', required: true },
  { key: 'operatingExpense', label: 'Operating expense', kind: 'opex', group: 'well', reads: 'economics', required: true },
  { key: 'minEconomicFlowRate', label: 'Economic limit rate per well', kind: 'rate', group: 'well', reads: 'economics', required: true },
  { key: 'typicalWellDeclineRate', label: 'Well decline rate', kind: 'declinePct', group: 'well', reads: 'economics', required: true },
  { key: 'oilPrice', label: 'Oil price', kind: 'oilPrice', group: 'economics', reads: 'economics', required: true },
  { key: 'gasPrice', label: 'Gas price', kind: 'gasPrice', group: 'economics', reads: 'economics', required: true },
  { key: 'discountRate', label: 'Discount rate', kind: 'percent', group: 'economics', reads: 'economics', required: true },
  { key: 'projectDuration', label: 'Project duration', kind: 'years', group: 'economics', reads: 'economics', required: true },
  { key: 'royaltiesTaxes', label: 'Royalty (on gross revenue)', kind: 'percent', group: 'economics', reads: 'economics', required: true },
  { key: 'minSpacing', label: 'Smallest spacing', kind: 'spacing', group: 'range', reads: 'economics', required: true },
  { key: 'maxSpacing', label: 'Largest spacing', kind: 'spacing', group: 'range', reads: 'economics', required: true },
  { key: 'spacingIncrement', label: 'Spacing step', kind: 'spacing', group: 'range', reads: 'economics', required: true },
  { key: 'wellLayout', label: 'Well layout', kind: null, group: 'range', reads: 'diagnostics', select: true },
  { key: 'reservoirPressure', label: 'Average reservoir pressure', kind: 'pressure', group: 'drainage', reads: 'diagnostics' },
  { key: 'flowingPressure', label: 'Flowing bottomhole pressure', kind: 'pressure', group: 'drainage', reads: 'diagnostics' },
  { key: 'permeability', label: 'Permeability', kind: 'permeability', group: 'drainage', reads: 'diagnostics' },
  { key: 'skin', label: 'Skin', kind: 'skin', group: 'drainage', reads: 'diagnostics' },
  { key: 'oilViscosity', label: 'Oil viscosity at reservoir conditions', kind: 'viscosity', group: 'drainage', reads: 'diagnostics' },
  { key: 'totalCompressibility', label: 'Total compressibility', kind: 'compressibility', group: 'drainage', reads: 'diagnostics' },
  { key: 'wellboreRadius', label: 'Wellbore radius', kind: 'length', group: 'drainage', reads: 'diagnostics' },
]);

export const FORM_KEYS = Object.freeze(['fieldName', 'latitude', 'longitude', ...FIELDS.map((f) => f.key)]);
/** Context values taken from other apps for the cross-checks; they enter no equation of the case. */
export const CONTEXT_KEYS = Object.freeze(['ooipStb', 'dcaEurStb']);

export const LAYOUT_OPTIONS = Object.freeze([
  ['square', 'Square grid'],
  ['triangular', 'Staggered (triangular) grid'],
]);

/** The "Load example field" case: the T1 example plus the drainage inputs, all illustrative. */
export const SAMPLE_FORM = Object.freeze({
  fieldName: 'Example field', latitude: '', longitude: '',
  reservoirArea: '5000', avgNetPayThickness: '60', porosity: '15.2', initialWaterSaturation: '0.25',
  reservoirTemperature: '180', reservoirPressure: '3500', recoveryFactor: '35',
  oilGravity: '35', gasGravity: '0.75', initialSolutionGOR: '500', oilFvf: '',
  wellCost: '5000000', operatingExpense: '200000', minEconomicFlowRate: '10', typicalWellDeclineRate: '15',
  oilPrice: '75', gasPrice: '3.5', discountRate: '10', projectDuration: '20', royaltiesTaxes: '25',
  minSpacing: '20', maxSpacing: '160', spacingIncrement: '10', wellLayout: 'square',
  flowingPressure: '1500', permeability: '50', skin: '2', oilViscosity: '1.2', totalCompressibility: '0.000015', wellboreRadius: '0.354',
});

export const SAMPLE_NOTE = 'Sample inputs: an illustrative example field built into the app. It is not a real field; replace every value before you rely on the case.';

const asStrings = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, v == null ? '' : String(v)]));
export const blankForm = () => ({ ...Object.fromEntries(FORM_KEYS.map((k) => [k, ''])), wellLayout: 'square' });

export const emptyIntakes = () => ({ pvt: null, wta: null, mbal: null, dca: null, wells: null });

export const defaultInputs = (unitSystem = 'oilfield', { sample = false } = {}) => ({
  form: sample ? { ...blankForm(), ...asStrings(SAMPLE_FORM) } : blankForm(),
  context: Object.fromEntries(CONTEXT_KEYS.map((k) => [k, ''])),
  unitSystem: unitSystem === 'si' ? 'si' : 'oilfield',
  identification: {},
  inputMeta: {},
  intakes: emptyIntakes(),
  sampleNote: sample ? SAMPLE_NOTE : null,
});

/** Restore inputs from a payload, tolerating missing keys; the flood-pattern field of earlier builds becomes the layout. */
export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs('oilfield');
  const form = { ...base.form, ...asStrings(raw.form) };
  if (!raw.form?.wellLayout && raw.form?.wellPatternType) form.wellLayout = raw.form.wellPatternType === '7-spot' ? 'triangular' : 'square';
  delete form.wellPatternType;
  return {
    ...base,
    form,
    context: { ...base.context, ...asStrings(raw.context) },
    unitSystem: raw.unitSystem === 'si' ? 'si' : 'oilfield',
    identification: raw.identification && typeof raw.identification === 'object' ? raw.identification : {},
    inputMeta: raw.inputMeta && typeof raw.inputMeta === 'object' ? raw.inputMeta : {},
    intakes: { ...base.intakes, ...(raw.intakes && typeof raw.intakes === 'object' ? raw.intakes : {}) },
    sampleNote: raw.sampleNote || null,
  };
};

export const projectPayload = ({ id, name, inputs }) => ({ id, name, schema: SCHEMA, inputs, modified: new Date().toISOString() });

/** What the engine reads: the form, as evaluateSpacingCases takes it. */
export const engineInputOf = (form) => ({ ...form });
