// Waterflood Design Studio saved-project model (Waterflood U1). Pure.
//
// Payload version 2 (WF-U1) adds: identification (the report header),
// inputMeta (input provenance, src/lib/inputProvenance), unitSystem (display
// units; storage stays oilfield), pvtIntake (the pvt-1 record taken from a
// Fluid Systems Studio project), the surveillance import record, the last
// Monte Carlo summary and patternInputs.mobilityBasis.
//
// Version 1 projects (no payloadVersion) open with mobilityBasis
// 'endpoint', the M they were computed with before WF-U1-004, so their
// numbers do not move on opening; the Pattern tab says so and offers the
// switch. New projects use Craig's M.
export const WF_PAYLOAD_VERSION = 2;

export const MOBILITY_BASES = Object.freeze({
  craig: 'Craig: krw at the average water saturation behind the front at breakthrough',
  endpoint: 'Endpoint: krw at Sor (the basis before October 2026)',
});

export const DEFAULT_IDENTIFICATION = Object.freeze({
  company: '', field: '', reservoir: '', pattern: '', injectors: '', producers: '',
  licence: '', analyst: '', notes: '',
});

export const IDENTIFICATION_FIELDS = Object.freeze([
  { key: 'company', label: 'Company' },
  { key: 'field', label: 'Field' },
  { key: 'licence', label: 'Licence or block' },
  { key: 'reservoir', label: 'Reservoir or zone' },
  { key: 'pattern', label: 'Pattern or flood element' },
  { key: 'injectors', label: 'Injectors' },
  { key: 'producers', label: 'Producers' },
  { key: 'analyst', label: 'Analyst' },
]);

const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** An older payload brought to version 2 without moving its numbers. */
export function migrateWaterfloodPayload(raw) {
  if (!isRecord(raw)) return raw;
  if (Number(raw.payloadVersion) >= WF_PAYLOAD_VERSION) return raw;
  const patternInputs = { ...(raw.patternInputs || {}) };
  if (!patternInputs.mobilityBasis) patternInputs.mobilityBasis = 'endpoint';
  return { ...raw, patternInputs, payloadVersion: WF_PAYLOAD_VERSION, migratedFrom: Number(raw.payloadVersion) || 1 };
}
