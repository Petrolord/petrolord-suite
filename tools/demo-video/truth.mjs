// Truth zone averages for the Ekene wells, straight from the generator's
// truth rows (before the tool measurements), so a lesson can compare the
// Studio's answer with the field's known value. Depths in feet.
// npx tsx tools/demo-video/truth.mjs Ekene-1 [Ekene-9 ...]
import { buildKit } from '../demo-dataset/build.mjs';

const FT = 3.28084;
const names = process.argv.slice(2);
const { built } = buildKit();
for (const name of names.length ? names : ['Ekene-1']) {
  const b = built.find((x) => x.well.name === name);
  if (!b?.rows.length) { console.log(name, 'no rows'); continue; }
  console.log(`\n${name}  (rows ${b.rows.length}, step ${((b.rows[1].md - b.rows[0].md) * FT).toFixed(2)} ft)`);
  const by = new Map();
  for (const r of b.rows) { if (!by.has(r.layerKey)) by.set(r.layerKey, []); by.get(r.layerKey).push(r); }
  const avg = (rs, k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
  console.log('layer'.padEnd(18), 'top_ft  base_ft  gross   vsh    phit   phie   sw     fluid   dt(us/ft)');
  for (const [k, rs] of by) {
    const top = rs[0].md * FT; const base = rs[rs.length - 1].md * FT;
    const fl = [...new Set(rs.map((r) => r.fluid))].join('/');
    console.log(k.padEnd(18), top.toFixed(1).padStart(7), base.toFixed(1).padStart(8), (base - top).toFixed(1).padStart(6),
      avg(rs, 'vsh').toFixed(3), avg(rs, 'phit').toFixed(3), avg(rs, 'phie').toFixed(3), avg(rs, 'sw').toFixed(3), fl.padEnd(7),
      rs[0].dt ? avg(rs, 'dt').toFixed(1) : '');
  }
  // truth net pay and net reservoir at the Studio's default cutoffs, on the
  // truth curves (phie >= 0.08, Vsh <= 0.5, Sw <= 0.6), 0.5 ft samples
  const dz = (b.rows[1].md - b.rows[0].md) * FT;
  for (const [k, rs] of by) {
    const res = rs.filter((r) => r.phie >= 0.08 && r.vsh <= 0.5);
    const pay = res.filter((r) => r.sw <= 0.6);
    if (pay.length) console.log(`${k} truth net res ${(res.length * dz).toFixed(1)} ft, net pay ${(pay.length * dz).toFixed(1)} ft; pay avg phie ${avg(pay, 'phie').toFixed(3)} sw ${avg(pay, 'sw').toFixed(3)} vsh ${avg(pay, 'vsh').toFixed(3)}`);
  }
  // hydrocarbon legs: averages over the samples above the contact only
  for (const [k, rs] of by) {
    const hc = rs.filter((r) => r.fluid === 'oil' || r.fluid === 'gas');
    if (!hc.length) continue;
    const top = hc[0].md * FT; const base = hc[hc.length - 1].md * FT;
    console.log(`${k} ${hc[0].fluid} leg ${top.toFixed(1)}-${base.toFixed(1)} ft (${(base - top).toFixed(1)} ft): vsh ${avg(hc, 'vsh').toFixed(3)} phit ${avg(hc, 'phit').toFixed(3)} phie ${avg(hc, 'phie').toFixed(3)} sw ${avg(hc, 'sw').toFixed(3)} T ${avg(hc, 'tF').toFixed(1)} F rw ${avg(hc, 'rw').toFixed(4)}`);
    const wet = rs.filter((r) => r.fluid === 'brine');
    if (wet.length) console.log(`${k} water leg ${(wet[0].md * FT).toFixed(1)}-${(wet[wet.length - 1].md * FT).toFixed(1)} ft: T ${avg(wet, 'tF').toFixed(1)} F rw ${avg(wet, 'rw').toFixed(4)} vsh ${avg(wet, 'vsh').toFixed(3)} phie ${avg(wet, 'phie').toFixed(3)}`);
  }
}
