// Dev-only: what the Recovery Factor harness (/dev/studio/recovery-factor)
// can read by id (RF-U1-010): the Fluid Systems projects saved on the Fluid
// harness in this tab (pvt-1), the ReservoirCalc Pro saved-project fixtures
// (the shapes earlier releases saved) and Material Balance rows (a case, its
// completed run and result, mbal-1) that the e2e puts in sessionStorage from
// e2e/fixtures/recovery-factor/mbal-rows.json. Never imported by production routes.
import { loadFluidRows, FLUID_TABLE } from './fluidProjectsStore';
import { SAVED_PROJECT_ROWS } from '@/pages/apps/ReservoirCalcPro/services/savedFixtures';

const KEY = 'harness.rf.mbal_rows.v1';
export const RF_MBAL_KEY = KEY;

const store = () => { try { return window.sessionStorage; } catch { return null; } };

export function loadRfMbalRows() {
  try { return JSON.parse(store()?.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export function rfHarnessSeed(userId) {
  return {
    [FLUID_TABLE]: loadFluidRows(),
    saved_quickvol_projects: SAVED_PROJECT_ROWS.map((r) => ({ ...r.row, user_id: userId })),
    ...loadRfMbalRows(),
  };
}
