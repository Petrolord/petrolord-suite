// Gates for the kit v4 structure: the Niger Delta growth fault, its rollover
// trap, and the wells that must not move. Each one measures the model (or
// the generated kit); none restates a design constant.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { LOCKED, FRAME, STRUCTURE, KIT, SEISMIC, OBORO } from '../spine.mjs';
import { buildKit } from '../build.mjs';
import { topsForWell, tvdAtMd, xyAtMd } from '../geology.mjs';
import {
  structureTruth, ekeneClosure, cutoffsOnLine, mainFaultDipAt, SURVEY, inSurvey,
} from '../structureTruth.mjs';
import { elasticPropsFrom, makeTimeDepth, makeElasticModel } from '../seismic.mjs';
import { scanGeometry } from '../../../packages/engines/engines/seismolord/segyScan';
import { bufferReader } from '../../../src/pages/apps/Seismolord/engine/reader';

const KIT_DIR = path.join(__dirname, '..', '..', '..', 'dist-demo', `${KIT.name}-${KIT.version}`);
const V3_WELLS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ekene-v3-wells.sha256.json'), 'utf8')).files;

let kit;
let geo;
beforeAll(() => { kit = buildKit(); geo = kit.geo; });

describe('the wells did not move (kit v4 against kit v3)', () => {
  test('every file in 01-wells is byte-identical to the v3 release, by SHA-256', () => {
    const names = Object.keys(V3_WELLS);
    expect(names.length).toBe(52);
    for (const rel of names) {
      const p = path.join(KIT_DIR, rel);
      if (!fs.existsSync(p)) throw new Error(`${rel} is missing: run npx tsx tools/demo-dataset/generate.mjs first.`);
      const h = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
      expect([rel, h]).toEqual([rel, V3_WELLS[rel]]);
    }
  });

  test('negative control: a one-byte change is caught', () => {
    const rel = '01-wells/tops/Ekene-1-tops.csv';
    const buf = Buffer.from(fs.readFileSync(path.join(KIT_DIR, rel)));
    buf[buf.length - 2] ^= 1;
    expect(crypto.createHash('sha256').update(buf).digest('hex')).not.toBe(V3_WELLS[rel]);
  });

  test('the contacts are the v3 contacts', () => {
    expect(LOCKED.owc_m).toBe(1560);
    expect(LOCKED.owc_m - FRAME.kb_m).toBe(1535);
    expect(OBORO.gwc_m).toBe(1935);
  });
});

describe('the structure honours every top', () => {
  test('at every pick, the horizon passes through the published depth', () => {
    let n = 0;
    for (const b of kit.built) {
      for (const t of b.tops) {
        if (t.key === 'SEABED') continue;
        const z = geo.horizonDepthAt(t.key, t.x, t.y);
        expect([b.well.name, t.key, Math.abs(z - t.tvd) < 1e-3]).toEqual([b.well.name, t.key, true]);
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(70);
  });

  test('walking each well path through the v4 structure finds the same tops, and no others', () => {
    for (const b of kit.built) {
      const again = topsForWell(b.well, b.survey, geo);
      expect(again.map((t) => t.key)).toEqual(b.tops.map((t) => t.key));
      again.forEach((t, i) => expect(Math.abs(t.md - b.tops[i].md)).toBeLessThan(0.05));
    }
  });
});

describe('no well crosses a fault', () => {
  test('every well path stays in one fault block from surface to TD, well clear of every plane', () => {
    for (const b of kit.built) {
      const st = b.survey.stations;
      const td = st[st.length - 1].md;
      const ids = new Set();
      let nearest = Infinity;
      for (let md = 0; md <= td; md += 1) {
        const z = tvdAtMd(st, md);
        const { x, y } = xyAtMd(st, md);
        // above its tip the Ekene East Fault does not exist: no side to be on
        ids.add(geo.blockAt(x, y, z).id.replace('/above-ekene-east', ''));
        for (const zf of Object.values(geo.faultDepthsAt(x, y))) if (zf !== null) nearest = Math.min(nearest, Math.abs(zf - z));
      }
      const blocks = [...ids].filter((id) => !(id === 'main-hangingwall' && ids.size > 1));
      expect([b.well.name, blocks.length]).toEqual([b.well.name, 1]);
      expect([b.well.name, blocks[0].startsWith('main-hangingwall')]).toEqual([b.well.name, true]);
      expect([b.well.name, nearest > 40]).toEqual([b.well.name, true]);
    }
  });

  test('negative control: a vertical path through the footwall cutoff does cross the main fault', () => {
    const { x, y } = geo.frame.toXY(0, geo.traceB(0) + 200);
    const above = geo.blockAt(x, y, 300).id;
    const below = geo.blockAt(x, y, 2500).id;
    expect(above.startsWith('main-hangingwall')).toBe(true);
    expect(below).toBe('main-footwall');
  });

  test('the development wells sit on the rollover and Ekene-2 and Ekene-4 down dip, below the contact', () => {
    const cl = ekeneClosure(geo);
    const top = (n) => kit.built.find((b) => b.well.name === n).tops.find((t) => t.key === 'TOP_SAND').tvdss;
    for (const n of ['Ekene-1', 'Ekene-3', 'Ekene-5', 'Ekene-6', 'Ekene-7']) expect(top(n)).toBeLessThan(cl.contact_tvdss_m);
    for (const n of ['Ekene-2', 'Ekene-4']) expect(top(n)).toBeGreaterThan(cl.contact_tvdss_m);
  });
});

describe('the Ekene Growth Fault is listric', () => {
  test('its dip falls with depth, from steep near the top to nearly flat at the detachment', () => {
    const depths = [150, 500, 1000, 1500, 1800, 2000, 2200, 2400, 2600, STRUCTURE.main_fault.sole_md - 20];
    const dips = depths.map((z) => mainFaultDipAt(geo, z));
    for (let i = 1; i < dips.length; i += 1) expect(dips[i]).toBeLessThan(dips[i - 1]);
    expect(dips[0]).toBeGreaterThan(70);
    expect(dips[dips.length - 1]).toBeLessThan(12);
  });

  test('it soles out inside the record: its deepest point is above the last sample', () => {
    const props = elasticPropsFrom(kit.built[0].rows);
    const twt = makeTimeDepth({ geo, props });
    const { x, y } = geo.frame.toXY(0, SURVEY.bMax);
    expect(twt(x, y, STRUCTURE.main_fault.sole_md + 50)).toBeLessThan(SEISMIC.t_max_ms - 400);
  });

  test('its shallowest offset is at or above about 100 ms', () => {
    const props = elasticPropsFrom(kit.built[0].rows);
    const twt = makeTimeDepth({ geo, props });
    const a = 0;
    const b0 = geo.traceB(a);
    const tip = geo.fault.Z(0);
    const p = geo.frame.toXY(a, b0 + 1);
    expect(twt(p.x, p.y, tip)).toBeLessThanOrEqual(105);
    // a bedding plane in the Seabed sequence, 30 m under the tip: offset across the plane
    const z0 = tip + 30;
    const west = geo.frame.toXY(a, b0 - 2); const east = geo.frame.toXY(a, b0 + 30);
    const colW = geo.blocksAt(west.x, west.y).blocks[0].z;
    const colE = geo.blocksAt(east.x, east.y).blocks[0].z;
    const uW = (z0 - FRAME.mudline_md) / (colW.BENIN - FRAME.mudline_md);
    const zE = FRAME.mudline_md + uW * (colE.BENIN - FRAME.mudline_md);
    expect(zE - z0).toBeGreaterThan(0.5);
    expect(twt(east.x, east.y, zE)).toBeLessThan(150);
  });
});

describe('it is a growth fault', () => {
  test('throw increases with the age of the horizon', () => {
    const throws = structureTruth(geo).main_fault.throw_by_horizon_at_survey_centre;
    expect(throws.length).toBe(geo.keys.length);
    for (let i = 1; i < throws.length; i += 1) expect(throws[i].throw_m).toBeGreaterThan(throws[i - 1].throw_m);
    expect(throws[0].throw_m).toBeGreaterThan(5);           // Benin: small but there
    expect(throws[throws.length - 1].throw_m).toBeGreaterThan(150);
  });

  test('the hanging-wall packages thicken toward the fault; negative control: the footwall ones do not', () => {
    const a = 0;
    const thick = (top, base, b, hw) => {
      const { x, y } = geo.frame.toXY(a, b);
      const bl = geo.blocksAt(x, y).blocks.find((q) => q.block.hw === hw);
      return bl.z[base] - bl.z[top];
    };
    for (const [top, base] of [['OGBIA', 'TOP_SAND'], ['BASE_SAND', 'OBORO_U'], ['OBORO_U', 'OBORO_B'], ['OBORO_B', 'AKATA']]) {
      const cut = cutoffsOnLine(geo, base, a);
      const near = thick(top, base, cut.hw.b + 60, true);
      const mid = thick(top, base, cut.hw.b + 600, true);
      // a kilometre down dip: still west of the Ekene East Fault, whose
      // hanging wall thickens the deep packages again
      const far = thick(top, base, cut.hw.b + 1000, true);
      expect([top, near > mid]).toEqual([top, true]);
      // the late, shallow package grows least; the deep ones by a fifth or more
      expect(near / far).toBeGreaterThan(top === 'OGBIA' ? 1.04 : 1.15);
      const fwNear = thick(top, base, cut.fw.b - 20, false);
      const fwFar = thick(top, base, cut.fw.b - 300, false);
      expect(Math.abs(fwNear / fwFar - 1)).toBeLessThan(0.05);
    }
  });

  // regression (checkpoint 3, 2026-10-11): a footwall-only change once
  // flattened the hanging wall too and the reverse drag disappeared
  test('near the fault the hanging-wall Oboro horizons dip back toward it, steeply', () => {
    for (const key of ['OBORO_U', 'OBORO', 'OBORO_B']) {
      for (const a of [-600, 0, 600]) {
        const cut = cutoffsOnLine(geo, key, a);
        const z = (b) => geo.hangingWallDepthAt(key, ...Object.values(geo.frame.toXY(a, b)));
        const drop = z(cut.hw.b + 30) - z(cut.hw.b + 230);
        expect([key, a, drop > 20]).toEqual([key, a, true]);   // more than about 6 degrees toward the fault
      }
    }
  });

  test('the low-angle fault cuts and offsets the section at 2000, 2200 and 2400 m', () => {
    for (const a of [-600, 0, 600]) {
      for (const zq of [2000, 2200, 2400]) {
        let lo = 0; let hi = 6000;
        for (let i = 0; i < 60; i += 1) { const m = (lo + hi) / 2; if (geo.fault.Z(m) < zq) lo = m; else hi = m; }
        const { x, y } = geo.frame.toXY(a, geo.traceB(a) + lo);
        const col = geo.blocksAt(x, y);
        const hwB = col.blocks.find((q) => q.block.hw && q.zBot === col.zf);
        const fwB = col.blocks.find((q) => !q.block.hw);
        expect(Math.abs(col.zf - zq)).toBeLessThan(1);
        // the same horizon sits at different depths on the two sides of the plane
        for (const key of ['OBORO_B', 'AKATA']) expect([a, zq, key, Math.abs(hwB.z[key] - fwB.z[key]) > 25]).toEqual([a, zq, key, true]);
      }
    }
  });

  test('the footwall is flat and parallel, landward and under the hanging wall (about 0.7 degrees)', () => {
    const fwDepth = (key, b) => { const { x, y } = geo.frame.toXY(0, b); return geo.blocksAt(x, y).blocks.find((q) => !q.block.hw).z[key]; };
    const dip = (fwDepth('AKATA', 800) - fwDepth('AKATA', -2400)) / 3200;
    expect(Math.abs(dip)).toBeLessThan(0.03);
    const iso = (b) => fwDepth('AKATA', b) - fwDepth('OBORO', b);
    expect(Math.abs(iso(-2400) / iso(-1500) - 1)).toBeLessThan(0.05);
  });

  test('the hanging-wall beds bend back toward the fault: an asymmetric rollover', () => {
    const a = 0;
    const cut = cutoffsOnLine(geo, 'TOP_SAND', a);
    const z = (b) => geo.hangingWallDepthAt('TOP_SAND', ...Object.values(geo.frame.toXY(a, b)));
    let crestB = cut.hw.b; let crestZ = Infinity;
    for (let b = cut.hw.b; b <= SURVEY.bMax; b += 10) if (z(b) < crestZ) { crestZ = z(b); crestB = b; }
    const backLimb = (z(cut.hw.b + 20) - crestZ) / (crestB - cut.hw.b - 20);
    const foreLimb = (z(SURVEY.bMax) - crestZ) / (SURVEY.bMax - crestB);
    expect(crestB - cut.hw.b).toBeGreaterThan(200);          // the crest is off the fault
    expect(backLimb).toBeGreaterThan(0);
    expect(foreLimb).toBeGreaterThan(0);
    expect(backLimb).toBeGreaterThan(2 * foreLimb);           // steep toward the fault, gentle basinward
  });

  test('the secondary faults are there: a synthetic and antithetic faults around the crest', () => {
    const t = structureTruth(geo);
    expect(t.crestal.some((c) => c.dips === 'west')).toBe(true);
    expect(t.crestal.some((c) => c.dips === 'east')).toBe(true);
    // each one really offsets something: a horizon at its centre steps across it
    for (const c of STRUCTURE.crestal) {
      const zc = c.z_mid;
      const dir = c.dips === 'east' ? 1 : -1;
      const hwSide = geo.frame.toXY(c.a_mid, c.b_mid + dir * 15);
      const fwSide = geo.frame.toXY(c.a_mid, c.b_mid - dir * 15);
      const depthsOf = (p) => geo.faultDepthsAt(p.x, p.y)[c.name];
      expect(depthsOf(hwSide)).not.toBeNull();
      expect(depthsOf(fwSide)).not.toBeNull();
      expect(Math.abs(depthsOf(hwSide) - zc)).toBeLessThan(80);
    }
    expect(geo.f2Throw('TOP_SAND', 0)).toBe(0);
    expect(geo.f2Throw('OBORO', 0)).toBeGreaterThan(30);
  });
});

describe('the trap closes inside the survey', () => {
  let cl;
  beforeAll(() => { cl = ekeneClosure(geo); });

  test('the Ekene Sand rollover spills below the contact', () => {
    expect(cl.closedAtContact).toBe(true);
    expect(cl.spillPoint.tvdss_m).toBeGreaterThan(cl.contact_tvdss_m + 10);
    expect(cl.crest.tvdss_m).toBeLessThan(cl.contact_tvdss_m);
  });

  test('crest and spill are inside the survey, not on its edge', () => {
    for (const p of [cl.crest, cl.spillPoint]) {
      const { a, b } = geo.frame.toAB(p.x, p.y);
      expect(inSurvey(a, b, 50)).toBe(true);
    }
    expect(cl.area_km2).toBeGreaterThan(1);
    expect(cl.grv_m3).toBeGreaterThan(1e7);
  });

  test('the generated truth file quotes the closure the model measures', () => {
    const t = JSON.parse(fs.readFileSync(path.join(KIT_DIR, '04-seismic', 'truth', 'ekene-structure-truth.json'), 'utf8'));
    expect(t.ekene_sand_closure.spill_point.tvdss_m).toBeCloseTo(cl.spillPoint.tvdss_m, 1);
    expect(t.ekene_sand_closure.area_above_contact_km2).toBeCloseTo(cl.area_km2, 2);
  });
});

describe('the seismic carries the faults', () => {
  test('a trace in the hanging wall near the fault crosses the main fault plane as an interface', () => {
    const props = elasticPropsFrom(kit.built[0].rows);
    const model = makeElasticModel({ geo, props, contacts: { EKENE: { depth: LOCKED.owc_m, upper: 'oil' } } });
    const { x, y } = geo.frame.toXY(0, geo.traceB(0) + 400);
    expect(model(x, y).some((i) => i.fault)).toBe(true);
    // negative control: west of the trace there is no fault in the column
    const w = geo.frame.toXY(0, geo.traceB(0) - 100);
    expect(model(w.x, w.y).some((i) => i.fault)).toBe(false);
  });

  test('the v4 volumes carry the version in their names', () => {
    for (const v of ['full', 'small', 'near', 'mid', 'far']) {
      expect(fs.existsSync(path.join(KIT_DIR, '04-seismic', `${SEISMIC.file_prefix}-${v}.sgy`))).toBe(true);
    }
    expect(fs.existsSync(path.join(KIT_DIR, '04-seismic', 'gathers', `${SEISMIC.file_prefix}-gathers-nmo.sgy`))).toBe(true);
    expect(SEISMIC.file_prefix).toBe('EKENE3D-v4');
  });
});

describe('the survey reaches landward, on the v3 lattice', () => {
  const read = (rel) => {
    const buf = fs.readFileSync(path.join(KIT_DIR, '04-seismic', rel));
    return { buf, reader: bufferReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)) };
  };
  // trace header CDP X/Y (bytes 181-188, scalar -100) of a trace by its inline and crossline
  const cdpOf = (buf, il, xl) => {
    const ns = buf.readUInt16BE(3220);
    for (let o = 3600; o < buf.length; o += 240 + ns * 4) {
      if (buf.readInt32BE(o + 188) === il && buf.readInt32BE(o + 192) === xl) return { x: buf.readInt32BE(o + 180) / 100, y: buf.readInt32BE(o + 184) / 100 };
    }
    return null;
  };
  test.each([['full', SEISMIC.full], ['small', SEISMIC.small]])('%s scans as the lattice the spine names', async (label, cfg) => {
    const { reader } = read(`${SEISMIC.file_prefix}-${label}.sgy`);
    const scan = await scanGeometry(reader, {});
    expect(scan.regular).toBe(true);
    expect([scan.il.min, scan.il.count, scan.xl.min, scan.xl.count]).toEqual([cfg.il0, cfg.nInline, cfg.xl0, cfg.nXline]);
  });

  test('inline 1000, crossline 2000 sits where it did in v3, and the footwall is a third of a dip line', () => {
    const { buf } = read(`${SEISMIC.file_prefix}-full.sgy`);
    const p = cdpOf(buf, 1000, 2000);
    // v3: a 128 x 128 survey centred on (1600, 1750), azimuth 20 degrees, 25 m bins
    const az = (20 * Math.PI) / 180; const h = 1587.5;
    expect(p.x).toBeCloseTo(FRAME.origin_e + 1600 - Math.sin(az) * h - Math.cos(az) * h, 1);
    expect(p.y).toBeCloseTo(FRAME.origin_n + 1750 - Math.cos(az) * h + Math.sin(az) * h, 1);
    const cut = cutoffsOnLine(geo, 'TOP_SAND', 0);
    expect((cut.fw.b - SURVEY.bMin) / (SURVEY.bMax - SURVEY.bMin)).toBeGreaterThan(0.25);
  });
});
