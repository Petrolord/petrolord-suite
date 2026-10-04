// EOR-U2-005: remaining oil saturation from Material Balance (mbal-1: N, Np,
// the initial and last pressures, the drive) with Bo from the Fluid project
// (pvt-1 table) and a stated initial water saturation:
//   So = (1 - Np/N) (Bo/Boi) (1 - Swi)
// the volumetric material balance form (no water influx, no injection, no
// gas cap: the remaining oil's reservoir volume over the unchanged pore
// volume). The gate calls the engine and checks it against the pore-volume
// statement computed independently, with negative controls.
import { remainingOilEstimate } from '../remainingOil';
import { eorMbalIntake, eorPvtIntake, tableAt } from '../intakes';
import { fluidBlock, MBAL_RECORD } from './eorTestKit';

const rec = (over = {}) => ({
  ...MBAL_RECORD,
  pressure: { ...MBAL_RECORD.pressure, series: [
    { timestep_index: 0, date: '2024-06-30', pressure_psia: 4100, cum_oil_stb: 0, cum_gas_scf: 0 },
    { timestep_index: 1, date: '2026-06-30', pressure_psia: 3420, cum_oil_stb: 15200000, cum_gas_scf: 0 },
  ] },
  drive: { mechanism: 'solution_gas_drive', aquifer_model: 'none', indices: { wdi: 0, winj_di: 0, ginj_di: 0 } },
  ...over,
});
const intakesOf = (mbalRecord) => ({
  pvt: eorPvtIntake(fluidBlock(), { pressurePsia: 3400, at: 'x' }).intake,
  mbal: eorMbalIntake(mbalRecord, { at: 'x' }).intake,
});

describe('remaining oil saturation from material balance', () => {
  it('equals the remaining oil reservoir volume over the pore volume (independent statement)', () => {
    const intakes = intakesOf(rec());
    const r = remainingOilEstimate({ intakes, context: { swiPct: '20' } });
    expect(r.ok).toBe(true);
    const block = fluidBlock();
    const Boi = tableAt(block.table, 'Bo', 4100);
    const Bo = tableAt(block.table, 'Bo', 3420);
    expect(Boi).not.toBeNull();
    const N = 152000000; const Np = 15200000; const swi = 0.2;
    const poreVolume = (N * Boi) / (1 - swi); // RB
    const oilLeft = (N - Np) * Bo; // RB
    expect(r.soPct).toBeCloseTo((100 * oilLeft) / poreVolume, 9);
    expect(r.terms).toMatchObject({ N, Np, swi });
    expect(r.method).toMatch(/So = \(1 - Np\/N\) \(Bo\/Boi\) \(1 - Swi\)/);
    expect(r.method).toMatch(/case "Ekene E-2000"/);
    expect(r.method).toMatch(/Good Oil Well No. 4 PVT/);
  });
  it('negative controls: an aquifer, injection, no Swi, no series, or a pressure outside the PVT table give no estimate', () => {
    expect(remainingOilEstimate({ intakes: intakesOf(rec({ drive: { mechanism: 'water_drive', aquifer_model: 'fetkovich', indices: { wdi: 0.4 } } })), context: { swiPct: '20' } }).reason).toMatch(/aquifer/);
    expect(remainingOilEstimate({ intakes: intakesOf(rec({ drive: { mechanism: 'x', aquifer_model: 'none', indices: { winj_di: 0.3 } } })), context: { swiPct: '20' } }).reason).toMatch(/injection/);
    expect(remainingOilEstimate({ intakes: intakesOf(rec()), context: {} }).reason).toMatch(/initial water saturation/);
    expect(remainingOilEstimate({ intakes: intakesOf(MBAL_RECORD), context: { swiPct: '20' } }).reason).toMatch(/cumulative oil/);
    const far = rec({ pressure: { ...rec().pressure, initial_psia: 99999 } });
    expect(remainingOilEstimate({ intakes: intakesOf(far), context: { swiPct: '20' } }).reason).toMatch(/outside the PVT table/);
    expect(remainingOilEstimate({ intakes: { pvt: null, mbal: intakesOf(rec()).mbal }, context: { swiPct: '20' } }).ok).toBe(false);
  });
});
