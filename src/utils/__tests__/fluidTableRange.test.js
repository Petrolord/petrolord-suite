/**
 * FLUID-U2-026 (programme lead, 2026-10-03, from the Material Balance
 * round): the PVT table topped out at max(1.4 Pb, Pb + 2,000 psi), so a
 * deeply undersaturated reservoir could not take its PVT. The top of the
 * table can now be set (the default is unchanged), by the user or at the
 * request of a consuming app (?pvtPMax=), and the pvt-1 block says which.
 */
import { analyzeFluidSystem, sampleFluidStudioData, normalizeFluid } from '../fluidStudioCalculations';
import { tableRangeOf, PVT_RANGE_PARAM, rangeRequestFromSearch } from '../fluidstudio/tableRange';
import { buildFluidPvtContract } from '../fluidstudio/pvtHandoff';
import { validatePvtContract } from '../../lib/inputProvenance/pvtContract';

const withTop = (pMax, from = 'entered', extra = {}) => ({ ...sampleFluidStudioData(), tableRange: { pMax, from, ...extra } });

describe('the top of the table', () => {
  it('default unchanged: max(1.4 Pb, Pb + 2,000 psi)', () => {
    const r = analyzeFluidSystem(sampleFluidStudioData());
    expect(Math.max(...r.pvt.table.map((x) => x.pressure))).toBe(Math.round(Math.max(1.4 * r.pvt.pb, r.pvt.pb + 2000)));
    expect(normalizeFluid(sampleFluidStudioData()).sweep).toBeUndefined();
  });

  it('an entered top carries the table to it (Ahmed-style deep undersaturation, 9,000 psia)', () => {
    const r = analyzeFluidSystem(withTop(9000));
    expect(Math.max(...r.pvt.table.map((x) => x.pressure))).toBe(9000);
    // undersaturated rows continue the Bo and viscosity relations; Bo still falls with pressure
    const top = r.pvt.table[0];
    expect(top.phase).toBe('undersaturated');
    expect(top.Bo).toBeLessThan(r.pvt.kpis.bo_at_pb);
  });

  it('a top below the default never shortens the table', () => {
    const r = analyzeFluidSystem(withTop(3200));
    const d = analyzeFluidSystem(sampleFluidStudioData());
    expect(r.pvt.table).toEqual(d.pvt.table);
  });

  it('the published pressure ranges still flag the rows above them', () => {
    const r = analyzeFluidSystem(withTop(9000));
    const ids = r.meta.rangeFlags.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['standing:pressure', 'mccain_bw:pressure', 'lee_gonzalez_eakin:pressure']));
    const st = r.meta.rangeFlags.find((f) => f.id === 'standing:pressure');
    expect(st.valueHigh).toBe(9000);
    const vb = analyzeFluidSystem({ ...withTop(9000), correlations: { pb_rs_bo: 'vasquez_beggs', viscosity: 'beggs_robinson' } });
    expect(vb.meta.rangeFlags.find((f) => f.id === 'vasquez_beggs:pressure').valueHigh).toBe(9000);
  });

  it('a request from a consumer reads from the address, and refuses nonsense', () => {
    expect(PVT_RANGE_PARAM).toBe('pvtPMax');
    expect(rangeRequestFromSearch('?fluidProject=abc&pvtPMax=8500&pvtFor=Material%20Balance%20Studio')).toEqual({ pMax: 8500, from: 'consumer', requestedBy: 'Material Balance Studio' });
    expect(rangeRequestFromSearch('?pvtPMax=-5')).toBeNull();
    expect(rangeRequestFromSearch('?pvtPMax=abc')).toBeNull();
    expect(rangeRequestFromSearch('?pvtPMax=99999')).toBeNull(); // beyond 30,000 psia is refused
    expect(rangeRequestFromSearch('')).toBeNull();
  });

  it('the pvt-1 block states the range, its source and who asked, by addition', () => {
    const inputs = withTop(8500, 'consumer', { requestedBy: 'Material Balance Studio' });
    const results = analyzeFluidSystem(inputs);
    const b = buildFluidPvtContract({ inputs, results, eos: null, projectId: 'p1', projectName: 'X' });
    expect(validatePvtContract(b).ok).toBe(true);
    expect(b.pressure_range).toEqual({ min_psia: 15, max_psia: 8500, requested_max_psia: 8500, source: 'consumer', requested_by: 'Material Balance Studio' });
    const d = buildFluidPvtContract({ inputs: sampleFluidStudioData(), results: analyzeFluidSystem(sampleFluidStudioData()), eos: null });
    expect(d.pressure_range.source).toBe('default');
    expect(d.pressure_range.requested_max_psia).toBeNull();
    expect(tableRangeOf({})).toEqual({ pMax: null, from: 'default', requestedBy: null });
  });
});
