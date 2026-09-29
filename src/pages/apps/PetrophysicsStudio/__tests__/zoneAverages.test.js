/**
 * AppUpgrade PETRO-U1, practitioner lens PL1: the zone numbers mean what a
 * cutoff-and-summation report means. Every case calls the shipped code
 * (zoneReport over the engine's zoneSummary and netPay, or the whole
 * pipeline) on a case where the distinction matters, and asserts the
 * volumetric invariant to numerical precision rather than a band.
 *
 * Negative controls (run 2026-09-28): with zoneReport returning the
 * engine's thickness-weighted sw_avg, four cases fail (hand case, both
 * pipeline invariants, dual water); with vth ignored the TVT case reads
 * the along-hole thickness; with zonePublishProperties on the base
 * parameters the override case publishes 18 m where the card reads 0 m.
 */
import typewell from '../../../../../packages/engines/test-data/petrophysics/typewell.json';
import { computeWell, computeWellZoned, DEFAULT_PARAMS } from '../engine/pipeline';
import { zoneReport, zoneReports, zonePublishProperties, verticalSampleThickness, isTotalSwModel, publishedState } from '../services/zoneAverages';

const F = (a) => Float64Array.from(a);
const curvesOf = () => {
  const c = {};
  for (const [k, v] of Object.entries(typewell.curves)) c[k] = Float64Array.from(v, (x) => (x === null ? NaN : x));
  return c;
};
const SAND_A = { id: 'zA', top_md_m: typewell.params.zones.SAND_A[0], base_md_m: typewell.params.zones.SAND_A[1] };

describe('Sw averages by pore volume, so HCPV survives the averaging', () => {
  // two 1 m pay samples: a porous dry sand and a tight wetter one
  const curves = { DEPT: F([100, 101]) };
  const outputs = { PHIE: F([0.30, 0.10]), PHIT: F([0.30, 0.10]), VSH: F([0.1, 0.1]), SW: F([0.20, 0.50]) };
  const zone = { top_md_m: 99, base_md_m: 102 };

  test('hand case: thickness-weighted 0.35, pore-volume weighted 0.275', () => {
    const r = zoneReport(curves, outputs, { cutPhi: 0.08, cutVsh: 0.5, cutSw: 0.6 }, zone);
    expect(r.net_m).toBe(2);
    expect(r.phi_avg).toBeCloseTo(0.2, 14);
    expect(r.sw_avg_h).toBeCloseTo(0.35, 14);      // the engine's figure, kept
    expect(r.sw_avg).toBeCloseTo(0.11 / 0.4, 14);  // sum(phi Sw h) / sum(phi h)
    expect(r.hcpv_m).toBeCloseTo(0.3 * 0.8 + 0.1 * 0.5, 14);
    // the invariant a volumetric input needs
    expect(r.net_m * r.phi_avg * (1 - r.sw_avg)).toBeCloseTo(r.hcpv_m, 14);
    // and what the thickness-weighted value would have cost: 10 percent
    expect(r.net_m * r.phi_avg * (1 - r.sw_avg_h)).toBeCloseTo(0.26, 14);
  });

  test('type well, Archie: invariant holds on the real pipeline output', () => {
    const curves2 = curvesOf();
    const { outputs: o } = computeWell(curves2, DEFAULT_PARAMS);
    const r = zoneReport(curves2, o, DEFAULT_PARAMS, SAND_A);
    expect(r.net_m).toBeGreaterThan(0);
    expect(r.net_m * r.phi_avg * (1 - r.sw_avg)).toBeCloseTo(r.hcpv_m, 12);
    expect(r.sw_system).toBe('effective');
  });
});

describe('total-porosity Sw models stay in their own porosity system', () => {
  test('dual water: HCPV is PHIT (1 - Swt), sw_avg the effective equivalent', () => {
    const curves = { DEPT: F([100, 101]) };
    const outputs = { PHIT: F([0.25, 0.25]), PHIE: F([0.20, 0.20]), VSH: F([0.2, 0.2]), SW: F([0.4, 0.4]) };
    const r = zoneReport(curves, outputs, { swMethod: 'dual-water', cutPhi: 0.08, cutVsh: 0.5, cutSw: 0.6 }, { top_md_m: 99, base_md_m: 102 });
    expect(r.sw_system).toBe('total');
    expect(r.hcpv_m).toBeCloseTo(2 * 0.25 * 0.6, 14);
    expect(r.sw_avg).toBeCloseTo(0.25, 14); // 1 - 0.15 / 0.20
    // mixing PHIE with Swt (the pre-fix reading) loses PHIE/PHIT = 20 percent
    expect(r.net_m * r.phi_avg * (1 - r.sw_avg_h)).toBeCloseTo(0.24, 14);
    expect(r.net_m * r.phi_avg * (1 - r.sw_avg)).toBeCloseTo(0.30, 14);
  });

  test('type well through the real dual-water pipeline: HCPV = sum h PHIT (1 - Swt)', () => {
    const curves = curvesOf();
    const params = { ...DEFAULT_PARAMS, swMethod: 'dual-water' };
    const { outputs } = computeWell(curves, params);
    const r = zoneReport(curves, outputs, params, SAND_A);
    // independent sum over the engine's own pay flags
    const pay = outputs.PAY;
    let hc = 0;
    for (let i = 0; i < curves.DEPT.length; i++) {
      const d = curves.DEPT[i];
      if (d < SAND_A.top_md_m || d > SAND_A.base_md_m || pay[i] !== 1) continue;
      hc += 0.5 * outputs.PHIT[i] * (1 - Math.min(1, Math.max(0, outputs.SW[i])));
    }
    expect(r.hcpv_m).toBeCloseTo(hc, 10);
    expect(r.net_m * r.phi_avg * (1 - r.sw_avg)).toBeCloseTo(r.hcpv_m, 12);
    expect(isTotalSwModel('waxman-smits')).toBe(true);
    expect(isTotalSwModel('archie')).toBe(false);
  });
});

describe('net reservoir and net pay are both reported', () => {
  test('net reservoir >= net pay; with Sw <= 1 they differ only where Sw is missing', () => {
    const curves = curvesOf();
    const { outputs } = computeWell(curves, DEFAULT_PARAMS);
    const zone = { top_md_m: 2000, base_md_m: 2100 };
    const r = zoneReport(curves, outputs, DEFAULT_PARAMS, zone);
    expect(r.net_res_m).toBeGreaterThan(r.net_m); // SAND B's water leg is reservoir, not pay
    const wide = zoneReport(curves, outputs, { ...DEFAULT_PARAMS, cutSw: 1 }, zone);
    // what still separates them is reservoir rock with no Sw (the type
    // well's RT gap): reservoir, never pay
    let noSw = 0;
    for (let i = 0; i < curves.DEPT.length; i++) {
      if (outputs.PHIE[i] >= DEFAULT_PARAMS.cutPhi && outputs.VSH[i] <= DEFAULT_PARAMS.cutVsh && !Number.isFinite(outputs.SW[i])) noSw += 0.5;
    }
    expect(noSw).toBeGreaterThan(0);
    expect(wide.net_res_m - wide.net_m).toBeCloseTo(noSw, 12);
  });
});

describe('true vertical thickness through the survey', () => {
  const well = { kb_m: 30, deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 500, inc: 30, azi: 90 }, { md: 3000, inc: 30, azi: 90 }] };

  test('a hold at 30 degrees: TVT = MD thickness x cos 30', () => {
    const depth = F(Array.from({ length: 201 }, (_, i) => 1000 + i * 0.5));
    const vth = verticalSampleThickness(depth, well);
    for (const v of vth) expect(v).toBeCloseTo(0.5 * Math.cos(Math.PI / 6), 9);
    const outputs = {
      PHIE: new Float64Array(201).fill(0.2), PHIT: new Float64Array(201).fill(0.2),
      VSH: new Float64Array(201).fill(0.1), SW: new Float64Array(201).fill(0.3),
    };
    const r = zoneReport({ DEPT: depth }, outputs, DEFAULT_PARAMS, { top_md_m: 1000, base_md_m: 1100 }, { vth });
    expect(r.gross_m).toBeCloseTo(100.5, 9); // endpoints carry half a step each side
    expect(r.gross_tvt_m / r.gross_m).toBeCloseTo(Math.cos(Math.PI / 6), 9);
    expect(r.net_tvt_m / r.net_m).toBeCloseTo(Math.cos(Math.PI / 6), 9);
    expect(r.tvt_source).toBe('deviation survey');
  });

  test('a vertical well reports TVT equal to MD', () => {
    const curves = curvesOf();
    const { outputs } = computeWell(curves, DEFAULT_PARAMS);
    expect(verticalSampleThickness(curves.DEPT, { kb_m: 30, deviation: [] })).toBeNull();
    const r = zoneReports({ curves, outputs, params: DEFAULT_PARAMS, zones: [SAND_A], well: { kb_m: 30 } }).zA;
    expect(r.net_tvt_m).toBeCloseTo(r.net_m, 12);
    expect(r.tvt_source).toBe('vertical well');
  });
});

describe('a zone publish carries the zone\'s own cutoffs', () => {
  test('override cutPhi: the published net is the card\'s net, not the base parameters\'', () => {
    const curves = curvesOf();
    const zoneParams = { zA: { cutPhi: 0.26 } };
    const { outputs } = computeWellZoned(curves, DEFAULT_PARAMS, [{ top: SAND_A.top_md_m, base: SAND_A.base_md_m, params: zoneParams.zA }]);
    const card = zoneReports({ curves, outputs, params: DEFAULT_PARAMS, zones: [SAND_A], zoneParams }).zA;
    const base = zoneReport(curves, outputs, DEFAULT_PARAMS, SAND_A);
    expect(card.net_m).toBeLessThan(base.net_m); // the override bites
    const props = zonePublishProperties({
      curves, outputs, params: DEFAULT_PARAMS, zoneParams, zone: { ...SAND_A, properties: { from_tops: { top: 'Top Sand A' } } },
      meta: { projectId: 'p1', interpretationName: 'Base case', publishedAt: '2026-09-28T00:00:00Z' },
    });
    expect(props.net_m).toBeCloseTo(card.net_m, 12);
    expect(props.cutoffs.phi_min).toBe(0.26);
    expect(props.sw_avg_weighting).toBe('pore-volume');
    expect(props.from_tops).toEqual({ top: 'Top Sand A' });
  });
});

describe('the zone card only claims a publish the row records (PL4)', () => {
  const summary = { gross_m: 20, net_m: 18, phi_avg: 0.2, sw_avg: 0.3, vsh_avg: 0.1 };
  test('a zone cut from tops carries from_tops only: nothing was published', () => {
    // negative control: the pre-fix card said "published summary on record" for any non-empty properties
    expect(publishedState({ properties: { from_tops: { top: 'A', base: 'B' } } }, summary).state).toBe('none');
    expect(publishedState({ properties: {} }, summary).state).toBe('none');
  });
  test('current until the numbers move, then stale', () => {
    const zone = { properties: { ...summary, published_at: '2026-09-28T09:00:00Z' } };
    expect(publishedState(zone, summary)).toEqual({ state: 'current', at: '2026-09-28' });
    expect(publishedState(zone, { ...summary, net_m: 17.5 }).state).toBe('stale');
    expect(publishedState(zone, null).state).toBe('stale');
  });
});
