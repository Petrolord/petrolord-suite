// Dev-only: the records the Well Spacing harness can read by id (WS-U1 chain
// e2e): the Well Test project (wta-1) and Material Balance case (mbal-1) of
// the EOR harness, a Decline Curve Analysis project with a current oil fit
// and forecast on the built-in sample well (dca-forecast-1), and four wells
// on a 40-acre square grid in the registry. Never imported by production
// routes.
import { eorHarnessTables } from './eorHarnessRows';
import { sampleWell } from '@/utils/declineCurve/sampleWell';
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';

const TS = '2026-10-03T09:00:00.000Z';
export const WS_HARNESS_DCA_ID = 'dc0e0000-0000-4000-8000-0000000e0e01';

function dcaRow(userId) {
  const at = new Date(TS);
  let w = { ...sampleWell('ws-p1'), id: 'ws-s1' };
  w = withStreamResults(w, 'oil', { fitResults: fitWell(w, 'oil', { now: at }).fit });
  w = withStreamResults(w, 'oil', { forecastResults: forecastWell(w, 'oil', { now: at }) });
  return {
    id: WS_HARNESS_DCA_ID, user_id: userId, project_name: 'Ekene decline',
    inputs_data: { name: 'Ekene decline', payloadVersion: 2, wells: { 'ws-s1': w } }, created_at: TS, updated_at: TS,
  };
}

// 1,320 ft apart on a square: 40 acres per well (registry coordinates in ft)
const WELLS = [['EK-1', 0, 0], ['EK-2', 1320, 0], ['EK-3', 0, 1320], ['EK-4', 1320, 1320]];

export function wsHarnessTables(userId) {
  return {
    ...eorHarnessTables(userId),
    saved_dca_projects: [dcaRow(userId)],
    geo_wells: WELLS.map(([name, dx, dy], i) => ({
      id: `ws-gw-${i + 1}`, user_id: userId, organization_id: null, name, uwi: null,
      surface_x: 500000 + dx, surface_y: 300000 + dy, kb_m: 0, xy_unit: 'ft', crs: 'EPSG:26191',
      deviation: [], checkshots: [], created_at: TS, updated_at: TS,
    })),
  };
}
