// Dev-only seed for the production harness (senior testing, Wave 4,
// 2026-09-26): one field with an oil producer, a gas well and a water
// injector on the po_* spine, with closed-form histories so every figure an
// app shows can be checked by hand.
//
// HP-1 oil: q = 1,200 exp(-0.002 t) stb/d, water cut 20% + 0.1%/day,
//   GOR 800 scf/stb. HP-2G gas: 5,000 exp(-0.0015 t) Mscf/d, CGR 10 stb/MMscf.
// HP-3I injector: 2,000 stb/d. t = days from 2026-03-30 (180 days to
// 2026-09-25). One 3-day HP-1 deferment (2026-06-10 to 12, zero rate),
// allocation factor 0.97 on oil every month, monthly valid tests at the
// daily rate.
import { toWellModelPayload, defaultWellInputs } from '@/utils/production/wellModel';
import { DEV_USER } from './InMemorySupabase';

export const SEED_START = '2026-03-30';
export const SEED_DAYS = 180;
const U = DEV_USER.id;
const TS = '2026-09-26T00:00:00.000Z';
const FIELD = 'po-field-harness';
export const WELL_IDS = { oil: 'po-well-hp1', gas: 'po-well-hp2g', inj: 'po-well-hp3i' };

const day = (i) => {
  const d = new Date(`${SEED_START}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};
const r2 = (v) => Math.round(v * 100) / 100;
const deferred = (i) => i >= 72 && i <= 74; // 2026-06-10 .. 06-12

export const oilRate = (i) => 1200 * Math.exp(-0.002 * i);
export const waterCut = (i) => 0.2 + 0.001 * i;
export const gasRate = (i) => 5000 * Math.exp(-0.0015 * i);

export function productionSeed() {
  const po_fields = [{ id: FIELD, user_id: U, organization_id: null, name: 'Harness Field', description: 'Senior-testing seed', created_at: TS, updated_at: TS }];
  const po_wells = [
    { id: WELL_IDS.oil, user_id: U, field_id: FIELD, name: 'HP-1', uwi: 'HP-0001', geo_well_id: null, well_type: 'producer', is_active: true, created_at: TS, updated_at: TS },
    { id: WELL_IDS.gas, user_id: U, field_id: FIELD, name: 'HP-2G', uwi: 'HP-0002', geo_well_id: null, well_type: 'producer', is_active: true, created_at: TS, updated_at: TS },
    { id: WELL_IDS.inj, user_id: U, field_id: FIELD, name: 'HP-3I', uwi: 'HP-0003', geo_well_id: null, well_type: 'injector', is_active: true, created_at: TS, updated_at: TS },
  ];
  const po_daily_production = [];
  for (let i = 0; i < SEED_DAYS; i += 1) {
    const d = day(i);
    const qo = deferred(i) ? 0 : oilRate(i);
    const wc = waterCut(i);
    const qw = qo * wc / (1 - wc);
    po_daily_production.push({
      id: `po-dp-hp1-${i}`, user_id: U, well_id: WELL_IDS.oil, prod_date: d,
      oil_stb: r2(qo), water_stb: r2(qw), gas_mscf: r2(qo * 0.8), winj_stb: 0, ginj_mscf: 0,
      hours_on: deferred(i) ? 0 : 24, source: 'seed', created_at: TS, updated_at: TS,
    });
    const qg = gasRate(i);
    po_daily_production.push({
      id: `po-dp-hp2g-${i}`, user_id: U, well_id: WELL_IDS.gas, prod_date: d,
      oil_stb: r2(qg * 0.01), water_stb: r2(qg * 0.002), gas_mscf: r2(qg), winj_stb: 0, ginj_mscf: 0,
      hours_on: 24, source: 'seed', created_at: TS, updated_at: TS,
    });
    po_daily_production.push({
      id: `po-dp-hp3i-${i}`, user_id: U, well_id: WELL_IDS.inj, prod_date: d,
      oil_stb: 0, water_stb: 0, gas_mscf: 0, winj_stb: 2000, ginj_mscf: 0,
      hours_on: 24, source: 'seed', created_at: TS, updated_at: TS,
    });
  }
  const po_well_tests = [];
  for (let i = 15; i < SEED_DAYS; i += 30) {
    const qo = oilRate(i);
    const wc = waterCut(i);
    po_well_tests.push({
      id: `po-wt-hp1-${i}`, user_id: U, well_id: WELL_IDS.oil, test_date: day(i), duration_hours: 12,
      oil_rate_stbd: r2(qo), water_rate_stbd: r2(qo * wc / (1 - wc)), gas_rate_mscfd: r2(qo * 0.8),
      thp_psia: 250, is_valid: true, comment: null, created_at: TS, updated_at: TS,
    });
    const qg = gasRate(i);
    po_well_tests.push({
      id: `po-wt-hp2g-${i}`, user_id: U, well_id: WELL_IDS.gas, test_date: day(i), duration_hours: 12,
      oil_rate_stbd: r2(qg * 0.01), water_rate_stbd: r2(qg * 0.002), gas_rate_mscfd: r2(qg),
      thp_psia: 1500, is_valid: true, comment: null, created_at: TS, updated_at: TS,
    });
  }
  const po_deferments = [{
    id: 'po-def-hp1-1', user_id: U, well_id: WELL_IDS.oil, start_date: day(72), end_date: day(74),
    category: 'well', cause: 'ESP trip', oil_deferred_stb: r2(oilRate(72) + oilRate(73) + oilRate(74)),
    water_deferred_stb: 0, gas_deferred_mscf: 0, comment: null, created_at: TS, updated_at: TS,
  }];
  const po_allocation_factors = [];
  for (const m of ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']) {
    for (const w of [WELL_IDS.oil, WELL_IDS.gas]) {
      po_allocation_factors.push({ id: `po-af-${w}-${m}`, user_id: U, well_id: w, period_month: m, oil_factor: 0.97, water_factor: 1, gas_factor: 1, created_at: TS, updated_at: TS });
    }
  }
  const gasInputs = defaultWellInputs();
  gasInputs.well.phase = 'gas';
  gasInputs.well.depthFt = '9000';
  gasInputs.well.surveyText = '';
  const oilInputs = defaultWellInputs();
  oilInputs.well.mode = 'deviated';
  const po_well_models = [
    { id: 'po-wm-hp1', user_id: U, well_id: WELL_IDS.oil, model_data: toWellModelPayload(oilInputs), notes: null, created_at: TS, updated_at: TS },
    { id: 'po-wm-hp2g', user_id: U, well_id: WELL_IDS.gas, model_data: toWellModelPayload(gasInputs), notes: null, created_at: TS, updated_at: TS },
  ];
  return { po_fields, po_wells, po_daily_production, po_well_tests, po_deferments, po_allocation_factors, po_well_models, po_field_totals: [] };
}
