// Gates for the kit v3 QI pack: the shear sonic, the elastic seismic and the
// truth the QI videos quote. Each one calls the engine the apps run.

import { parseLas } from '../../../packages/engines/engines/welldata/lasParse';
import { substituteVels } from '../../../packages/engines/engines/rockphysics/gassmann';
import { gcSandShaleVs, iterativeVs } from '../../../packages/engines/engines/rockphysics/vsEstimate';
import { angleGather, partialStack, velocityOnGrid, waldenAngle } from '../../../packages/engines/engines/qi/prestack';
import { scanGeometry } from '../../../packages/engines/engines/seismolord/segyScan';
import { bufferReader } from '../../../src/pages/apps/Seismolord/engine/reader';

import { LOCKED, OBORO, SEISMIC, CURVES, FRAME } from '../spine.mjs';
import { buildKit } from '../build.mjs';
import { localBrineVs, mineralFor, insituFluid } from '../elastic.mjs';
import {
  elasticPropsFrom, makeElasticModel, makeElasticTracer, stackRpp, rpp, rmsVelocityTable, gatherAngles, muteTrace,
  checkshotDriftOwtMs,
} from '../seismic.mjs';
import { measureLogs } from '../measure.mjs';
import { writeLas } from '../writers/las.mjs';
import { writeSegy } from '../writers/segy.mjs';

let kit;
let e1;
beforeAll(() => {
  kit = buildKit();
  e1 = kit.built.find((b) => b.well.name === 'Ekene-1');
});
const oilRows = () => e1.rows.filter((r) => r.layerKey === 'EKENE' && r.fluid === 'oil');

describe('the shear sonic', () => {
  test('oil-leg rock taken to brine by Gassmann lands on the local shear trend', () => {
    const fl = kit.fluids.EKENE;
    for (const r of oilRows()) {
      const wet = substituteVels(r.vp_m_s, r.vs_m_s, r.rhob * 1000, mineralFor(r.vsh).k, r.phit,
        insituFluid(fl, r.sw), { k: fl.brine.k, rho: fl.brine.rho });
      expect(wet.vs / localBrineVs(wet.vp, r.vsh)).toBeCloseTo(1, 6);
    }
  });

  test('iterative Vs on the local trend recovers the truth; negative control: Greenberg-Castagna misses it', () => {
    const fl = kit.fluids.EKENE;
    const clean = oilRows().filter((r) => r.vsh < 0.2);
    let gcErr = 0;
    for (const r of clean) {
      const args = { vp: r.vp_m_s, rho: r.rhob * 1000, phi: r.phit, kmin: mineralFor(r.vsh).k,
        fluidInSitu: insituFluid(fl, r.sw), fluidBrine: { k: fl.brine.k, rho: fl.brine.rho }, vsh: r.vsh };
      expect(iterativeVs({ ...args, brineVs: localBrineVs }).vs).toBeCloseTo(r.vs_m_s, 3);
      gcErr += iterativeVs(args).vs / r.vs_m_s - 1;
    }
    expect(gcErr / clean.length).toBeLessThan(-0.03);  // GC sandstone reads low by more than 3%
  });

  test('brine rock outside the columns is on the trend exactly, and every Vp/Vs is physical', () => {
    for (const b of kit.built) {
      for (const r of b.rows) {
        if (r.fluid === 'brine') expect(r.vs_m_s).toBe(localBrineVs(r.vp_m_s, r.vsh));
        expect(r.vpvs).toBeGreaterThan(Math.SQRT2);
      }
    }
  });

  test('DTS travels in the LAS in us/ft wherever there is a sonic, and parses back', () => {
    for (const key of ['full', 'full_plus_litho', 'no_density']) expect(CURVES[key]).toContain('DTS');
    const rows = measureLogs(e1.rows, 'Ekene-1').slice(0, 400);
    const text = writeLas({
      well: 'Ekene-1', curves: ['DT', 'DTS'], rows,
      header: { company: 'test', field: LOCKED.field, location: 'x', country: 'x', service: 'x', date: '2026-10-09', uwi: 'x', params: {} },
    });
    const las = parseLas(text);
    const dts = las.curves.find((c) => c.mnemonic === 'DTS');
    expect(dts.unit.toUpperCase()).toBe('US/F');
    const truth = e1.rows.slice(0, 400).map((r) => r.dts);
    const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    expect(dts.nSamples).toBe(400);
    expect(dts.nullCount).toBe(0);
    expect(Math.abs(med(Array.from(dts.data)) / med(truth) - 1)).toBeLessThan(0.02);
  });
});

describe('the elastic seismic', () => {
  let props;
  let model;
  let table;
  beforeAll(() => {
    props = elasticPropsFrom(e1.rows);
    model = makeElasticModel({ geo: kit.geo, props, contacts: { EKENE: { depth: LOCKED.owc_m, upper: 'oil' }, OBORO: { depth: OBORO.gwc_m, upper: 'gas' } } });
    table = rmsVelocityTable({ geo: kit.geo, props, x: e1.well.x, y: e1.well.y });
  });

  test('the oil leg dims the top of the Ekene Sand and the contact is a flat event below it', () => {
    const ifs = model(e1.well.x, e1.well.y);
    const top = ifs.find((i) => i.layerKey === 'EKENE');
    const contact = ifs.find((i) => i.contact === 'EKENE');
    const wetTop = { ...top, lower: props['EKENE:brine'] };
    expect(rpp(top, 0)).toBeLessThan(rpp(wetTop, 0));
    expect(contact.t).toBeGreaterThan(top.t);
    expect(rpp(contact, 0)).toBeGreaterThan(0);
    // the contact is flat: same depth, so same time below the top at a well whose top sits higher
    const e3 = kit.built.find((b) => b.well.name === 'Ekene-3');
    const ifs3 = model(e3.well.x, e3.well.y);
    const dt3 = ifs3.find((i) => i.contact === 'EKENE').t - ifs3.find((i) => i.layerKey === 'EKENE').t;
    const dt1 = contact.t - top.t;
    expect(dt3).toBeGreaterThan(dt1);  // Ekene-3 is higher on structure: a longer oil column above the same contact
  });

  test('the Oboro gas sand changes polarity between the near and far stacks', () => {
    const ob = model(e1.well.x, e1.well.y).find((i) => i.layerKey === 'OBORO');
    expect(stackRpp(ob, 5, 15)).toBeGreaterThan(0);
    expect(stackRpp(ob, 25, 35)).toBeLessThan(0);
  });

  test('stacking the gathers over 5 to 15 degrees with the published velocity gives the near stack back', () => {
    const G = SEISMIC.qi.gathers;
    const nsG = Math.round(G.t_max_ms / SEISMIC.dt_ms) + 1;
    const offsets = Array.from({ length: G.nOffset }, (_, k) => G.offset0_m + k * G.offsetStep_m);
    const tracer = makeElasticTracer({ ns: nsG, dtMs: SEISMIC.dt_ms });
    const ifs = model(e1.well.x, e1.well.y);
    const traces = offsets.map((o) => {
      const ang = gatherAngles(ifs, o, table, SEISMIC.dt_ms, nsG);
      return tracer(ifs, (i) => rpp(i, ang[ifs.indexOf(i)], SEISMIC.qi.mute_deg) ?? 0, { x: 0, y: 0, seed: 0, noise: false });
    });
    const { vrms, vint } = velocityOnGrid(table.t_ms, table.vrms, nsG, SEISMIC.dt_ms);
    const ag = angleGather({ traces, offsets, vrms, vint, dtMs: SEISMIC.dt_ms, edges: [5, 15] });
    const fromGathers = partialStack(ag, 0, 1);
    const near = tracer(ifs, (i) => stackRpp(i, 5, 15), { x: 0, y: 0, seed: 0, noise: false });
    const k = Math.round(ifs.find((i) => i.layerKey === 'EKENE').t / SEISMIC.dt_ms);
    expect(fromGathers[k] / near[k]).toBeGreaterThan(0.93);
    expect(fromGathers[k] / near[k]).toBeLessThan(1.07);
    // negative control: the far range of the same gathers is clearly dimmer
    const far = partialStack(angleGather({ traces, offsets, vrms, vint, dtMs: SEISMIC.dt_ms, edges: [25, 35] }), 0, 1);
    expect(far[k]).toBeLessThan(0.6 * fromGathers[k]);
  });

  test('the far offsets are muted to exact zeros beyond the mute angle, noise and all', () => {
    const G = SEISMIC.qi.gathers;
    const nsG = Math.round(G.t_max_ms / SEISMIC.dt_ms) + 1;
    const far = G.offset0_m + (G.nOffset - 1) * G.offsetStep_m;
    const tracer = makeElasticTracer({ ns: nsG, dtMs: SEISMIC.dt_ms, noiseRef: 0.03 });
    const tr = muteTrace(tracer(model(e1.well.x, e1.well.y), () => 0, { x: 1, y: 2, seed: 9 }), far, table, SEISMIC.dt_ms, SEISMIC.qi.mute_deg);
    const { vrms, vint } = velocityOnGrid(table.t_ms, table.vrms, nsG, SEISMIC.dt_ms);
    let muted = 0; let live = 0;
    for (let k = 1; k < nsG; k += 1) {
      const a = waldenAngle(far, (k * SEISMIC.dt_ms) / 1000, vrms[k], vint[k]);
      if (a > SEISMIC.qi.mute_deg) { expect(tr[k]).toBe(0); muted += 1; } else if (tr[k] !== 0) live += 1;
    }
    expect(muted).toBeGreaterThan(50);   // the shallow part of the far trace
    expect(live).toBeGreaterThan(50);    // negative control: inside the mute the noise is still there
  });

  test('a synthetic on the checkshot time-depth ties with no bulk shift; negative control: on the sonic alone it needs one', () => {
    const ns = 601; const dt = SEISMIC.dt_ms;
    const [a, b] = SEISMIC.qi.full_deg;
    const seis = makeElasticTracer({ ns, dtMs: dt })(model(e1.well.x, e1.well.y), (i) => stackRpp(i, a, b), { x: 0, y: 0, seed: 0, noise: false });
    // a 25 Hz Ricker synthetic from the truth logs
    const rows = e1.rows;
    let owt = (FRAME.water_depth_m * 1000) / 1500; let prev = FRAME.mudline_md;
    const sonicTwt = rows.map((r) => { owt += ((r.tvd - prev) * 1000) / r.vp_m_s; prev = r.tvd; return 2 * owt; });
    const synth = (twt) => {
      const refl = new Float64Array(ns);
      for (let k = 1; k < rows.length; k++) {
        const z1 = rows[k - 1].vp_m_s * rows[k - 1].rhob; const z2 = rows[k].vp_m_s * rows[k].rhob;
        const i = Math.round(twt[k] / dt); if (i > 0 && i < ns) refl[i] += (z2 - z1) / (z2 + z1);
      }
      const out = new Float64Array(ns);
      for (let i = 0; i < ns; i++) {
        if (!refl[i]) continue;
        for (let j = Math.max(0, i - 15); j <= Math.min(ns - 1, i + 15); j++) { const x = (Math.PI * 25 * (j - i) * dt / 1000) ** 2; out[j] += refl[i] * (1 - 2 * x) * Math.exp(-x); }
      }
      return out;
    };
    const bestShift = (s) => {
      const i0 = Math.round(900 / dt); const i1 = Math.round(1800 / dt);
      let best = { shift: 0, r: -2 };
      for (let sh = -8; sh <= 8; sh++) {
        let sxy = 0; let sxx = 0; let syy = 0;
        for (let i = i0; i < i1; i++) { const x = s[i - sh] || 0; const y = seis[i]; sxy += x * y; sxx += x * x; syy += y * y; }
        const r = sxy / Math.sqrt(sxx * syy);
        if (r > best.r) best = { shift: sh * dt, r };
      }
      return best;
    };
    const onCheckshots = bestShift(synth(sonicTwt.map((t, k) => t + 2 * checkshotDriftOwtMs(rows[k].tvd))));
    const onSonic = bestShift(synth(sonicTwt));
    expect(Math.abs(onCheckshots.shift)).toBeLessThanOrEqual(dt);
    expect(onCheckshots.r).toBeGreaterThan(0.6);
    expect(Math.abs(onSonic.shift)).toBeGreaterThanOrEqual(8);
  });

  test('a gather file scans as one cell per CDP with the offsets in bytes 37-40', async () => {
    const offsets = [100, 300, 500];
    const buf = writeSegy({
      nInline: 2, nXline: 3, ns: 10, dtUs: 4000, formatCode: 5, il0: 1020, xl0: 2030, offsets,
      coords: (il, xl) => ({ x: 400000 + il, y: 500000 + xl }),
      trace: () => new Float32Array(10), textLines: ['TEST'],
    });
    for (let t = 0; t < 6 * offsets.length; t += 1) {
      expect(buf.readInt32BE(3600 + t * (240 + 40) + 36)).toBe(offsets[t % 3]);
    }
    const scan = await scanGeometry(bufferReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)), {});
    expect(scan.il.count).toBe(2);
    expect(scan.xl.count).toBe(3);
  });
});
