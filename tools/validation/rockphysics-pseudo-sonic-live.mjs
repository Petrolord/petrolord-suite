#!/usr/bin/env node
/**
 * Pseudo-sonic check against wells that HAVE a sonic (Rock Physics Studio
 * U2-007). Runs the shipped engines (packages/engines/engines/rockphysics/
 * pseudoSonic.js): Gardner inverse and Faust with the published constants,
 * with constants fitted on the same well (the best case) and with constants
 * fitted on every OTHER well in the set (the honest case: what a well with
 * no sonic would get), sample by sample and on 10 m block means.
 *
 * The curve samples are customer data and are not in the repository. Fetch
 * them read only into a scratch directory, one little-endian float32 file
 * per curve (the registry's own storage format):
 *
 *   supabase db query --linked "select w.name, l.mnemonic, l.unit, l.storage_path
 *     from geo_wells_logs l join geo_wells w on w.id = l.well_id
 *     where l.mnemonic in ('DT','DEPTH','DEPT','RHOB','ZDEN','RES','ILD')"
 *   supabase storage cp --linked --experimental ss:///wells/<storage_path> <dir>/<file>.f32
 *
 * then describe the wells in a JSON file and run:
 *
 *   node tools/validation/rockphysics-pseudo-sonic-live.mjs wells.json
 *
 *   [{ "name": "W-3", "depth": "W-3__DEPT_1.f32", "dt": "W-3__DT.f32", "rho": "W-3__RHOB.f32",
 *      "rt": "W-3__ILD.f32", "depthToMetres": 0.3048 }]
 *
 * `depthToMetres` is 1 unless the depth index is in feet (W-3's index runs
 * to 8806 against a registry TD of 2682 m). The sonic is read as us/ft when
 * its median is below 140 (the shared unit door's rule), else us/m; density
 * as g/cc when its median is below 100, else kg/m3.
 *
 * Result of 2026-10-01 (recorded in docs/upgrade/RockPhysicsStudio-UPGRADE.md):
 *   Alaoma-2  Gardner published: bias -11.3%, RMS 25.3%, corr 0.04   Faust published: bias +59.1%, RMS 69.5%, corr -0.03
 *   W-3       Gardner published: bias  +1.5%, RMS 15.8%, corr 0.53   Faust published: bias  +2.1%, RMS 17.2%, corr  0.26
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  gardnerVp, faustVp, fitGardnerA, fitFaustGamma, velocityMisfit,
} from '../../packages/engines/engines/rockphysics/pseudoSonic.js';

const cfgPath = process.argv[2];
if (!cfgPath) { console.error('usage: node tools/validation/rockphysics-pseudo-sonic-live.mjs <wells.json>'); process.exit(2); }
const dir = path.dirname(path.resolve(cfgPath));
const specs = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const f32 = (file) => { const b = fs.readFileSync(path.resolve(dir, file)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const gap = (v) => !Number.isFinite(v) || Math.abs(v) >= 9e29 || v <= -999;
const median = (a) => { const s = Array.from(a).filter((v) => !gap(v) && v > 0).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

const wells = specs.map((s) => {
  const dt = f32(s.dt); const rho = f32(s.rho); const depth = f32(s.depth); const rt = s.rt ? f32(s.rt) : null;
  const perFoot = median(dt) < 140;
  const gcc = median(rho) < 100;
  return {
    name: s.name,
    z: Array.from(depth, (v) => v * (s.depthToMetres || 1)),
    vp: Array.from(dt, (v) => (gap(v) || !(v > 0) ? NaN : perFoot ? (1e6 / v) * 0.3048 : 1e6 / v)),
    rho: Array.from(rho, (v) => (gap(v) || !(v > 0) ? NaN : gcc ? v * 1000 : v)),
    rt: rt ? Array.from(rt, (v) => (gap(v) || !(v > 0) ? NaN : v)) : null,
    read: `sonic as ${perFoot ? 'us/ft' : 'us/m'}, density as ${gcc ? 'g/cc' : 'kg/m3'}`,
  };
});

const line = (label, est, ref) => {
  const m = velocityMisfit(est, ref);
  console.log(`  ${label}: n ${m.n}, bias ${m.biasPct.toFixed(1)}%, RMS ${m.rmsPct.toFixed(1)}%, median |err| ${m.medianAbsPct.toFixed(1)}%, P90 |err| ${m.p90AbsPct.toFixed(1)}%, corr ${Number.isFinite(m.corr) ? m.corr.toFixed(2) : 'n/a'}`);
};
const block = (arr, z, size) => {
  const o = []; let s = 0; let n = 0; let z0 = null;
  for (let i = 0; i < arr.length; i++) {
    if (z0 === null) z0 = z[i];
    if (arr[i] > 0) { s += arr[i]; n += 1; }
    if (z[i] - z0 >= size) { o.push(n ? s / n : NaN); s = 0; n = 0; z0 = null; }
  }
  return o;
};
const pool = (others, key) => others.flatMap((w) => w[key] || []);

for (const w of wells) {
  const others = wells.filter((x) => x !== w);
  console.log(`${w.name} (${w.read}; median Vp ${median(w.vp).toFixed(0)} m/s)`);
  line('Gardner inverse, published a 0.23', w.rho.map((r) => gardnerVp(r)), w.vp);
  if (w.rt) line('Faust, published 1948', w.z.map((z, i) => faustVp(z, w.rt[i])), w.vp);
  const self = fitGardnerA(w.rho, w.vp).a;
  line(`Gardner inverse, a ${self.toFixed(4)} fitted on this well (best case)`, w.rho.map((r) => gardnerVp(r, { a: self })), w.vp);
  if (w.rt) {
    const g = fitFaustGamma(w.z, w.rt, w.vp).gamma;
    line(`Faust, constant ${g.toFixed(0)} fitted on this well (best case)`, w.z.map((z, i) => faustVp(z, w.rt[i], { gamma: g })), w.vp);
  }
  if (others.length) {
    const a = fitGardnerA(pool(others, 'rho'), pool(others, 'vp')).a;
    line(`Gardner inverse, a ${a.toFixed(4)} fitted on the other well(s)`, w.rho.map((r) => gardnerVp(r, { a })), w.vp);
    if (w.rt && others.every((o) => o.rt)) {
      const g = fitFaustGamma(pool(others, 'z'), pool(others, 'rt'), pool(others, 'vp')).gamma;
      line(`Faust, constant ${g.toFixed(0)} fitted on the other well(s)`, w.z.map((z, i) => faustVp(z, w.rt[i], { gamma: g })), w.vp);
    }
  }
  const both = w.vp.map((v, i) => (v > 0 && w.rho[i] > 0 ? v : NaN));
  line('10 m blocks, Gardner inverse published', block(w.rho.map((r, i) => (both[i] > 0 ? gardnerVp(r) : NaN)), w.z, 10), block(both, w.z, 10));
  if (w.rt) {
    const bothF = w.vp.map((v, i) => (v > 0 && w.rt[i] > 0 ? v : NaN));
    line('10 m blocks, Faust published', block(w.z.map((z, i) => (bothF[i] > 0 ? faustVp(z, w.rt[i]) : NaN)), w.z, 10), block(bothF, w.z, 10));
  }
}
