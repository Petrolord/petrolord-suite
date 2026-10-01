// ReservoirCalc Pro upgrade U1: saved state from earlier releases (PL5),
// the saved size of a Monte Carlo run (RCP-U1-013, PL10), and the registry
// zone door (RCP-U1-018, 027). Every test goes through the shipped
// context, ProjectService mapping and services.

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ReservoirCalcProvider, useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { makeInMemoryRcpBackend } from '../services/rcpBackend';
import { fromRow, toBlob } from '../services/ProjectService';
import { SAVED_PROJECT_ROWS, SAVED_PROSPECT_ROWS } from '../services/savedFixtures';
import { runContext } from '../services/volumeDisplay';
import { unriskedFromRun } from '../services/prospectVolumes';
import { MonteCarloEngine } from '../services/MonteCarloEngine';
import { compactRun } from '../services/runCompaction';
import { registryPatchForZone, aoiFromBoundary } from '../services/registryDoor';
import { fromRcpProspect } from '@/pages/apps/riskedreserves/services/rrvStore';
import { PRE_PT9A_ZONE_NOTE } from '@/lib/petroProvenance';

jest.setTimeout(120000);

const setup = () => {
  const backend = makeInMemoryRcpBackend();
  const wrapper = ({ children }) => <ReservoirCalcProvider backend={backend}>{children}</ReservoirCalcProvider>;
  return renderHook(() => useReservoirCalc(), { wrapper });
};

describe('PL5 every saved project release opens and recomputes', () => {
  for (const fx of SAVED_PROJECT_ROWS) {
    it(fx.release, async () => {
      const { result } = setup();
      const project = fromRow(JSON.parse(JSON.stringify(fx.row)));
      act(() => result.current.loadProject(project));
      const s = result.current.state;
      expect(s.reservoirs).toHaveLength(fx.expect.reservoirs);
      expect(s.unitSystem).toBe(fx.expect.unitSystem);
      expect(s.project.id).toBe(fx.row.id);
      if (fx.expect.mcUnstamped) {
        // a run saved before U1 has no meta: it reads in the workspace units and says so
        expect(runContext(s.probResults, s)).toMatchObject({ stamped: false, unitSystem: fx.expect.unitSystem });
        expect(unriskedFromRun(s.probResults, s.inputs.fluidType, s.unitSystem).basis).toBe('in-place');
      }
      // recompute the deterministic case on the loaded inputs
      act(() => result.current.setCalcMethod('deterministic'));
      await act(async () => { await result.current.calculate(); });
      const r = result.current.state.results;
      expect(result.current.state.error).toBeNull();
      expect(r.stooip).toBeGreaterThan(0);
      if (fx.expect.stooip) expect(r.stooip).toBeCloseTo(fx.expect.stooip, -2);
      if (fx.expect.structural) {
        expect(r.method).toBe('contact-grid');
        // the dome closes at -1550 m: about 39 million m3 above the contact
        // (the gross column is thicker than the closure), whatever the frame
        const grvM3 = r.unitSystem === 'field' ? r.grv * 1233.48184 : r.grv;
        expect(grvM3 / 39.27e6).toBeGreaterThan(0.9);
        expect(grvM3 / 39.27e6).toBeLessThan(1.1);
      }
    });
  }

  it('the multi-reservoir project switches to its metric case', () => {
    const { result } = setup();
    act(() => result.current.loadProject(fromRow(JSON.parse(JSON.stringify(SAVED_PROJECT_ROWS[1].row)))));
    act(() => result.current.switchReservoir('r-lo'));
    expect(result.current.state.unitSystem).toBe('metric');
    expect(result.current.state.inputs.area).toBe(20);
  });
});

describe('PL5 every saved prospect release reaches Risked Reserves Valuation with its Pg and a basis note', () => {
  for (const fx of SAVED_PROSPECT_ROWS) {
    it(fx.release, () => {
      const p = fromRcpProspect(fx.row);
      expect(p.pg).toBeCloseTo(fx.expect.pg, 9);
      expect(p.p50).toBeCloseTo(fx.expect.p50, 4);
      expect(p.volumeNote).toMatch(fx.expect.note);
    });
  }
});

describe('RCP-U1-013 a saved Monte Carlo run is small enough to save', () => {
  const tri = (min, mode, max) => ({ type: 'triangular', min, mode, max });
  it('50,000 realizations save in under 2 MB (it was about 25 MB, twice), statistics whole', async () => {
    const run = await MonteCarloEngine.runSimulation({ fluidType: 'oil', unitSystem: 'field', iterations: 50000, recovery: 25 }, {
      area: tri(800, 1000, 1200), thickness: tri(40, 50, 60), porosity: tri(0.16, 0.2, 0.24), sw: tri(0.24, 0.3, 0.36), fvf: tri(1.1, 1.2, 1.3),
    });
    const full = JSON.stringify(run).length;
    expect(full).toBeGreaterThan(10e6);
    const blob = toBlob({ probResults: run, reservoirs: [{ id: 'r1', name: 'R', probResults: run }] }, 1);
    const size = JSON.stringify(blob).length;
    expect(size).toBeLessThan(2e6);
    expect(blob.probResults.stats).toEqual(run.stats);
    expect(blob.probResults.raw.thinned).toEqual({ kept: 2000, of: 50000 });
    expect(blob.reservoirs[0].probResults.raw.samples).toHaveLength(2000);
    // the thinned realizations still describe the run (median within 2%)
    const sorted = [...blob.probResults.raw.stooip].sort((a, b) => a - b);
    expect(Math.abs(sorted[1000] / run.stats.stooip.p50 - 1)).toBeLessThan(0.02);
    // a small run is saved whole
    expect(compactRun({ raw: { stooip: [1, 2, 3] }, stats: {} }).raw.thinned).toBeUndefined();
  });
});

describe('RCP-U1-018 registry zone averages are volumetric and name total-porosity wells', () => {
  const wells = [
    { name: 'THICK-OIL', zones: [{ name: 'Sand', properties: { phi_avg: 0.25, sw_avg: 0.2, ntg: 0.9, net_m: 45, gross_m: 50, pipeline_version: 6 } }] },
    { name: 'THIN-WET', zones: [{ name: 'Sand', properties: { phi_avg: 0.15, sw_avg: 0.8, ntg: 0.5, net_m: 2, gross_m: 4, pipeline_version: 4 } }] },
  ];
  it('Sw is pore-thickness weighted (a thin wet well no longer counts as much as a thick oil well)', () => {
    const f = registryPatchForZone(wells, 'Sand', 'metric');
    const sw = (45 * 0.25 * 0.2 + 2 * 0.15 * 0.8) / (45 * 0.25 + 2 * 0.15);
    expect(f.patch.sw).toBeCloseTo(sw, 12);
    expect(f.patch.sw).toBeLessThan(0.25); // the plain mean was 0.50
    expect(f.patch.ntg).toBeCloseTo(47 / 54, 12);
    // the product reproduces the wells' total hydrocarbon pore thickness
    const hcpvThick = f.patch.thickness * 2 * f.patch.ntg * f.patch.porosity * (1 - f.patch.sw);
    expect(hcpvThick).toBeCloseTo(45 * 0.25 * 0.8 + 2 * 0.15 * 0.2, 9);
  });
  it('a zone summary published before PT9a is named as total porosity', () => {
    const f = registryPatchForZone(wells, 'Sand', 'metric');
    expect(f.notes[0]).toBe(`THIN-WET: ${PRE_PT9A_ZONE_NOTE}`);
    expect(f.provenance.total_porosity_wells).toEqual(['THIN-WET']);
  });
});

describe('RCP-U1-027 every polygon of a boundary layer becomes an AOI', () => {
  it('a licence block in two parts gives two AOIs, the larger first (it kept the first ring only)', () => {
    const row = { id: 'c2', name: 'Block 7', kind: 'license_block', geometry_type: 'polygon' };
    const small = { type: 'polygon', rings: [[[0, 0], [10, 0], [10, 10], [0, 10]]] };
    const big = { type: 'polygon', rings: [[[100, 100], [200, 100], [200, 200], [100, 200]]] };
    const aois = aoiFromBoundary(row, [small, big]);
    expect(aois).toHaveLength(2);
    expect(aois[0].area).toBeCloseTo(10000, 6);
    expect(aois[0].name).toBe('Block 7 (part 1 of 2)');
    expect(aois[1].source).toMatchObject({ id: 'c2', part: 2, parts: 2 });
  });
});
