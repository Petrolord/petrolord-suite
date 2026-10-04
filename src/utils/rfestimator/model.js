/**
 * Recovery Factor Estimator saved-project model (RF-U1). Pure.
 *
 * Payload version 2 (RF-U1) adds to version 1 ({ id, name, schema: 1,
 * inputs, modified }): identification (the report header), inputMeta (input
 * provenance, src/lib/inputProvenance), unitSystem (display units; storage
 * stays oilfield), pvtIntake (the pvt-1 values taken from a Fluid Systems
 * Studio project), inPlaceIntake (the OOIP or OGIP taken from a Material
 * Balance case, mbal-1, or a ReservoirCalc Pro project), and inputs.origin
 * ('sample' while the case is the shipped sample, 'sample-edited' once a
 * value of it was changed, 'entered' otherwise; RF-U1-006).
 *
 * A version 1 project opens with its inputs unchanged. Its numbers move only
 * where the engine was wrong (RF-U1-001, the API correlations now read k in
 * darcies as published): `apiBasisNote` says so on the page and in the report.
 */
import { sampleRecoveryData } from '@/utils/recoveryFactorCalculations';
import { RF_MC_DEFAULTS } from './uncertainty.js';
import { Z_METHODS, Z_METHOD_DAK, Z_METHOD_TYPED, Z_KEPT_NOTE } from './gasZ.js';

export const RF_PAYLOAD_VERSION = 2;
export const RF_PROJECTS_TABLE = 'saved_rf_projects';

export const DEFAULT_DRIVE = Object.freeze({ oil: 'water_drive', gas: 'gas_volumetric' });

export const DEFAULT_IDENTIFICATION = Object.freeze({
  company: '', field: '', licence: '', reservoir: '', wells: '', analyst: '', dataDate: '', notes: '',
});

export const IDENTIFICATION_FIELDS = Object.freeze([
  { key: 'company', label: 'Company' },
  { key: 'field', label: 'Field' },
  { key: 'licence', label: 'Licence or block' },
  { key: 'reservoir', label: 'Reservoir or zone' },
  { key: 'wells', label: 'Wells or area' },
  { key: 'analyst', label: 'Analyst' },
  { key: 'dataDate', label: 'Data as of' },
]);

const asStrings = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, String(v)]));
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** The sample case as stored strings. */
export function sampleInputs() {
  const d = sampleRecoveryData();
  return {
    phase: 'oil',
    method: 'analog',
    driveCode: DEFAULT_DRIVE.oil,
    inPlaceMode: 'volumetric',
    ooipDirect: '',
    vol: asStrings(d.volumetric),
    // RF-U2-003: gas gravity and temperature for z by Dranchuk-Abou-Kassem
    corr: { ...asStrings(d.correlationInputs), gasGravity: '0.65', tempF: '180' },
    zMethod: Z_METHOD_DAK,
    // RF-U2-002: the uncertainty run (off until asked for; the seed is drawn when it is switched on)
    mc: { ...RF_MC_DEFAULTS },
    origin: 'sample',
  };
}

/** A new case opens on the sample, labelled as the sample (RF-U1-006). */
export const defaultInputs = () => sampleInputs();

/** Restore inputs from a payload, tolerating missing keys from older rows. */
export function inputsFromPayload(payload) {
  if (!isRecord(payload)) return null;
  const raw = isRecord(payload.inputs) ? payload.inputs : payload;
  const base = sampleInputs();
  return {
    ...base,
    ...raw,
    phase: raw.phase === 'gas' ? 'gas' : 'oil',
    inPlaceMode: raw.inPlaceMode === 'direct' ? 'direct' : 'volumetric',
    ooipDirect: typeof raw.ooipDirect === 'string' ? raw.ooipDirect : '',
    vol: { ...base.vol, ...(raw.vol || {}) },
    corr: { ...base.corr, ...(raw.corr || {}) },
    mc: { ...RF_MC_DEFAULTS, ...(isRecord(raw.mc) ? raw.mc : {}) },
    // RF-U2-003: a project saved before the z method existed keeps its typed z
    zMethod: Z_METHODS.includes(raw.zMethod) ? raw.zMethod : Z_METHOD_TYPED,
    // a project saved before RF-U1 cannot say whether it still holds the sample
    origin: ['sample', 'sample-edited'].includes(raw.origin) ? raw.origin : 'entered',
  };
}

/** An older payload brought to version 2 without moving its inputs. */
export function migrateRfPayload(raw) {
  if (!isRecord(raw)) return raw;
  if (Number(raw.payloadVersion) >= RF_PAYLOAD_VERSION) return raw;
  const inputs = inputsFromPayload(raw);
  const api = /^api_/.test(inputs?.method || '');
  return {
    ...raw,
    inputs,
    payloadVersion: RF_PAYLOAD_VERSION,
    migratedFrom: Number(raw.payloadVersion) || 1,
    apiBasisNote: api
      ? 'Saved before October 2026: the API correlation then read permeability in md where the published equation takes darcies, so the estimate it showed was too high (RF-U1-001). The value shown now is the published form.'
      : null,
  };
}

/** Which stored inputs still hold the sample value, as "group.key" (vol.area, corr.k). */
export function sampleKeysInUse(inputs) {
  if (!['sample', 'sample-edited'].includes(inputs?.origin)) return new Set();
  const s = sampleInputs();
  const out = new Set();
  for (const group of ['vol', 'corr']) {
    for (const [k, v] of Object.entries(s[group])) if (String(inputs[group]?.[k] ?? '') === v) out.add(`${group}.${k}`);
  }
  return out;
}

/** RF-U2-003: the note of a saved project that keeps its typed z (null when it chose a method). */
export function zKeptNote(payload) {
  if (!isRecord(payload)) return null;
  const raw = isRecord(payload.inputs) ? payload.inputs : payload;
  // an oil case reads no z: nothing to say
  return raw.phase !== 'gas' || Z_METHODS.includes(raw.zMethod) ? null : Z_KEPT_NOTE;
}
