// Gates for the Ekene demonstration dataset (DemoDataset-PLAN §6).
// The kit is only useful if it agrees with itself and with what the Academy
// already teaches, so every one of these is a statement about agreement.

import { parseLas } from '../../../packages/engines/engines/welldata/lasParse';
import { scanGeometry, readFileHeaders } from '../../../packages/engines/engines/seismolord/segyScan';
import { bufferReader } from '../../../src/pages/apps/Seismolord/engine/reader';
import { pickettFit } from '../../../packages/engines/engines/petrophysics/rw';

import { LOCKED, PETRO, PRESSURE, FRAME, SEISMIC } from '../spine.mjs';
import { buildKit, lockedVolumetrics } from '../build.mjs';
import {
  PRESSURE_MODEL, dtNormal, rwAt, tempF, OIL_SH, OIL_CONTACT_TVDSS,
} from '../rockmodel.mjs';
import { writeLas } from '../writers/las.mjs';
import { writeSegy } from '../writers/segy.mjs';
import { layerPropsFrom, makeGeometry, makeTraceBuilder } from '../seismic.mjs';

const FT_PER_M = 3.280839895013123;

let kit;
beforeAll(() => { kit = buildKit(); });

const wellNamed = (n) => kit.built.find((b) => b.well.name === n);

describe('the locked field survives', () => {
  test('the six-well grid reproduces the NG5 volumetrics exactly', () => {
    const v = lockedVolumetrics();
    expect(v.oilCells).toBe(LOCKED.oil_cells);
    expect(v.maxColumn).toBe(LOCKED.max_oil_column_m);
  });

  test('the Ekene Sand reproduces the locked net to gross and net porosity', () => {
    expect(kit.stats.ntg).toBeCloseTo(LOCKED.ntg, 2);
    expect(kit.stats.phiNet).toBeCloseTo(LOCKED.phi, 5);
  });

  test('the crest drains to the saturation the reservoir fixture documents', () => {
    const sw = OIL_SH.swAtHeightAboveFwl(LOCKED.max_oil_column_m + OIL_SH.entry_m);
    expect(sw).toBeCloseTo(0.3506, 4);
  });

  test('formation temperature at the contact is the locked reservoir temperature', () => {
    expect(tempF(OIL_CONTACT_TVDSS)).toBeCloseTo(LOCKED.temp_f, 9);
  });
});

describe('the logs round trip', () => {
  test('every generated LAS parses back to the values written', () => {
    for (const b of kit.built) {
      if (!b.rows.length) continue;
      const curves = ['CALI', 'GR', 'DT', 'RT'].filter((c) => b.rows[0][
        { CALI: 'cali', GR: 'gr', DT: 'dt', RT: 'rt' }[c]] !== undefined);
      const rows = b.rows.map((r) => ({ md: r.md, CALI: r.cali, GR: r.gr, DT: r.dt, RT: r.rt }));
      const text = writeLas({
        well: b.well.name, curves, rows,
        header: {
          company: 'test', field: LOCKED.field, location: 'x', country: 'x',
          service: 'x', date: '2026-09-11', uwi: 'x', params: {},
        },
      });
      const parsed = parseLas(text);
      expect(parsed.version).toBe(2);
      const gr = parsed.curves.find((c) => c.mnemonic === 'GR');
      expect(gr.nSamples).toBe(rows.length);
      expect(gr.nullCount).toBe(0);
      // spot check three samples against what was written
      for (const i of [0, Math.floor(rows.length / 2), rows.length - 1]) {
        expect(gr.data[i]).toBeCloseTo(Number(rows[i].GR.toFixed(3)), 3);
      }
      const dept = parsed.curves.find((c) => c.mnemonic === 'DEPT');
      expect(dept.data[0]).toBeCloseTo(rows[0].md, 3);
    }
  });
});

describe('petrophysics recovers the plant', () => {
  test('a Pickett fit over Ekene-1 water leg returns Archie m and the true Rw', () => {
    const b = wellNamed('Ekene-1');
    const base = b.tops.find((t) => t.key === 'BASE_SAND').md;
    const pts = b.rows
      .filter((r) => r.md > LOCKED.owc_m + 2 && r.md < base - 0.5 && r.vsh < 0.12)
      .map((r) => [r.phie, r.rt]);
    expect(pts.length).toBeGreaterThan(40);
    const fit = pickettFit(pts);
    const rwTrue = rwAt(tempF((LOCKED.owc_m + base) / 2 - FRAME.kb_m));
    // Clay conductivity biases a*Rw high even in clean sand. That is real
    // petrophysics, so the band is wide enough to allow it and narrow enough
    // that a presenter still reads the right order of magnitude.
    expect(fit.m).toBeGreaterThan(1.7);
    expect(fit.m).toBeLessThan(PETRO.archie.m + 0.3);
    expect(fit.aRw).toBeGreaterThan(rwTrue * 0.9);
    expect(fit.aRw).toBeLessThan(rwTrue * 1.25);
  });

  test('the gas leg reads a density-neutron crossover and the oil leg does not', () => {
    const b = wellNamed('Ekene-1');
    const gas = b.rows.filter((r) => r.layerKey === 'OBORO' && r.fluid === 'gas' && r.vsh < 0.2);
    const oil = b.rows.filter((r) => r.layerKey === 'EKENE' && r.fluid === 'oil' && r.vsh < 0.2);
    expect(gas.length).toBeGreaterThan(50);
    const phiD = (r) => (PETRO.rho_ma_sand - r.rhob) / (PETRO.rho_ma_sand - PETRO.rho_brine);
    const gasSep = gas.reduce((a, r) => a + (phiD(r) - r.nphi), 0) / gas.length;
    const oilSep = oil.reduce((a, r) => a + (phiD(r) - r.nphi), 0) / oil.length;
    expect(gasSep).toBeGreaterThan(0.06);
    expect(oilSep).toBeLessThan(gasSep / 2);
  });
});

describe('pore pressure lands on the reservoir', () => {
  test('the designed pressure at the contact is the locked initial pressure', () => {
    expect(PRESSURE_MODEL.ppPsi(PRESSURE.datum_md)).toBeCloseTo(LOCKED.pi_psia, 6);
    expect(PRESSURE_MODEL.emwAtDatum).toBeCloseTo(12.0237, 3);
  });

  test('Eaton at exponent 3 on the shale sonic returns the designed pressure', () => {
    const b = wellNamed('Ekene-1');
    let worst = 0;
    let n = 0;
    for (const r of b.rows) {
      if (r.vsh < 0.75) continue;
      n += 1;
      const dtn = dtNormal(r.belowMudline);
      const pp = r.obPsi - (r.obPsi - r.pnPsi) * (dtn / r.dtShale) ** PRESSURE.eaton_exponent;
      worst = Math.max(worst, Math.abs(pp - r.ppPsi));
    }
    expect(n).toBeGreaterThan(1000);
    expect(worst).toBeLessThan(1e-6);
  });

  test('the section is normally pressured above the ramp and overpressured below', () => {
    expect(PRESSURE_MODEL.emwAt(1000)).toBeLessThan(8.6);
    expect(PRESSURE_MODEL.emwAt(PRESSURE.ramp_top_md)).toBeLessThan(8.6);
    expect(PRESSURE_MODEL.emwAt(1500)).toBeGreaterThan(11);
  });

  test('Ekene-9 carries a sonic and no density, for the Gardner beat', () => {
    const b = wellNamed('Ekene-9');
    expect(b.well.curves).toBe('no_density');
    expect(b.rows.length).toBeGreaterThan(1000);
  });
});

describe('the seismic is honest', () => {
  const cfg = { nInline: 4, nXline: 4, il0: 1000, xl0: 2000, format: 1 };
  let buf;
  let ns;
  beforeAll(() => {
    const props = layerPropsFrom(wellNamed('Ekene-1').rows);
    ns = Math.round(SEISMIC.t_max_ms / SEISMIC.dt_ms) + 1;
    const coords = makeGeometry(cfg);
    const traceAt = makeTraceBuilder({ geo: kit.geo, props, ns, dtMs: SEISMIC.dt_ms });
    buf = writeSegy({
      nInline: cfg.nInline, nXline: cfg.nXline, il0: cfg.il0, xl0: cfg.xl0,
      formatCode: cfg.format, ns, dtUs: SEISMIC.dt_ms * 1000,
      coords: (il, xl) => { const p = coords(il, xl); return { x: FRAME.origin_e + p.x, y: FRAME.origin_n + p.y }; },
      trace: (il, xl) => { const p = coords(il, xl); return traceAt(p.x, p.y); },
      textLines: ['TEST'],
    });
  });

  const reader = () => bufferReader(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
  );

  test('the file headers say what the generator wrote', async () => {
    const h = await readFileHeaders(reader());
    expect(h.ns).toBe(ns);
    expect(h.dtUs).toBe(SEISMIC.dt_ms * 1000);
    expect(h.formatCode).toBe(1);
  });

  test('the scan measures the geometry the generator intended', async () => {
    const scan = await scanGeometry(reader(), {});
    expect(scan.regular).toBe(true);
    expect(scan.il.count).toBe(cfg.nInline);
    expect(scan.xl.count).toBe(cfg.nXline);
    expect(scan.il.min).toBe(cfg.il0);
    expect(scan.xl.min).toBe(cfg.xl0);
  });

  test('the top of the Ekene Sand arrives where the well says it does', () => {
    const b = wellNamed('Ekene-1');
    const props = layerPropsFrom(b.rows);
    const traceAt = makeTraceBuilder({ geo: kit.geo, props, ns: 601, dtMs: SEISMIC.dt_ms });
    const tr = traceAt(b.well.x, b.well.y);

    // Two way time to the top of the sand, integrated from this well's own
    // sonic — which is the number the tie in Episode 6 has to reproduce.
    const topMd = b.tops.find((t) => t.key === 'TOP_SAND').md;
    let owt = (FRAME.water_depth_m * 1000) / 1500;
    let prev = FRAME.mudline_md;
    for (const r of b.rows) {
      if (r.md > topMd) break;
      owt += ((r.tvd - prev) * 1000) / r.vp_m_s;
      prev = r.tvd;
    }
    const twt = 2 * owt;

    // The strongest peak within one wavelet of that time.
    const i0 = Math.round(twt / SEISMIC.dt_ms);
    let best = i0;
    for (let i = i0 - 6; i <= i0 + 6; i += 1) if (tr[i] > tr[best]) best = i;
    expect(tr[best]).toBeGreaterThan(0);          // SEG normal: top sand is a peak
    expect(Math.abs(best * SEISMIC.dt_ms - twt)).toBeLessThanOrEqual(2 * SEISMIC.dt_ms);
  });
});

describe('the section correlates', () => {
  test('every logged well carries the same nine surfaces in the same order', () => {
    const ref = wellNamed('Ekene-1').tops.map((t) => t.key);
    for (const b of kit.built) {
      if (!b.rows.length) continue;
      const keys = b.tops.map((t) => t.key);
      expect(ref.slice(0, keys.length)).toEqual(keys);
      for (let i = 1; i < b.tops.length; i += 1) {
        expect(b.tops[i].md).toBeGreaterThan(b.tops[i - 1].md);
      }
    }
  });

  test('the growth fault splits the wells four west to three east at the Ekene level', () => {
    const dev = kit.built.filter((b) => /^Ekene-[1-7]$/.test(b.well.name));
    const west = dev.filter((b) => kit.geo.faultSide(b.well.x, b.well.y) === 'west');
    const east = dev.filter((b) => kit.geo.faultSide(b.well.x, b.well.y) === 'east');
    expect(west.map((b) => b.well.name)).toEqual(['Ekene-1', 'Ekene-3', 'Ekene-5', 'Ekene-7']);
    expect(east.map((b) => b.well.name)).toEqual(['Ekene-2', 'Ekene-4', 'Ekene-6']);
  });

  test('the fault has no throw at the Ekene Sand and real throw at the Oboro Sand', () => {
    expect(kit.geo.throwAt(LOCKED.owc_m)).toBe(0);
    expect(kit.geo.throwAt(1845)).toBeGreaterThan(30);
  });
});
