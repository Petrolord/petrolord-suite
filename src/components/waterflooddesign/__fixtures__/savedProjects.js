// Waterflood Design projects as earlier releases saved them (WF-U1, PL5):
// version 1 payloads (no payloadVersion, no identification, sources, unit
// system, intakes or import record). Used by the harness (?saved=1), the
// e2e and the jest tests.
export const V1_PAYLOAD = Object.freeze({
  id: 'wf-v1-1',
  name: 'Saved before October 2026',
  displacementInputs: {
    krSource: 'corey', Swc: '0.2', Sor: '0.2', krwMax: '0.4', kroMax: '1.0', nw: '2', no: '2', krTable: [],
    muW: '0.5', muO: '5.0', gravityOn: false, k_md: '500', A_ft2: '50000', qt_rbd: '1000', dipDeg: '0', gammaW: '1.05', gammaO: '0.85',
    polymerOn: false, polymerMuMult: '4',
  },
  layers: [{ h: '10', k: '500' }, { h: '8', k: '250' }, { h: '12', k: '120' }],
  layeredConfig: { mSource: 'displacement', M: '2.0', A: '1.5' },
  patternInputs: { area_acres: '40', h_ft: '25', phi: '0.22', Bo: '1.25', Bw: '1.02', iw_bpd: '800', Sgi: '0', EV: '1', worLimit: '25', maxYears: '30' },
  scenarios: [],
  uncertaintyConfig: { iterations: '1000', params: {} },
  surveillance: { rows: [], config: { start_date: '', end_date: '', bo: '1.25', bw: '1.02', bg: '0.9', rs: '500', smooth_window_days: '5', vrr_window_days: '30', target_vrr: '1.0' } },
  modified: '2026-08-01T10:00:00.000Z',
});

export const savedWaterfloodRows = (userId) => [{
  id: V1_PAYLOAD.id, user_id: userId, project_name: V1_PAYLOAD.name, inputs_data: V1_PAYLOAD,
  created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z',
}];
