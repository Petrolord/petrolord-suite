// Earth Modeling 3D grid build (2026-10-17): the Seismolord depth surfaces "Ekene Sand (depth ft)"
// and "Ekene Sand Base (depth ft)" carry bullseye cones from bad picks; this writes NEW rows
// "... (depth ft, conditioned)" (originals untouched). Run from the repo root:
//   npx esbuild tools/demo-video/seed/em-condition-surfaces.mjs --bundle --platform=node --format=cjs \
//     --external:@supabase/supabase-js --alias:@=./src --outfile=/tmp/cond.cjs && node /tmp/cond.cjs [go]
// Without "go" it only prints what it would do. Written 2026-10-17: rows daf5905d-... and 780a87e4-...
// Condition the Seismolord depth surfaces (bullseye cones from bad picks) into NEW surfaces.

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { minCurvature, positionAtMd } from '@/pages/apps/EarthModeling/engine/wellties';
import { sampleAtXY } from '@/lib/gridding/gridmath';
const FT = 0.3048; const NULL = 1e30;
(async () => {
const env = Object.fromEntries(fs.readFileSync('/root/.demo-video.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient('https://ssyckywijlrkgcwvkwlr.supabase.co', fs.readFileSync(process.env.SUPABASE_ANON_KEY_FILE || '/tmp/claude-0/emv/anon.key', 'utf8').trim(), { auth: { persistSession: false } });
const { data: auth } = await sb.auth.signInWithPassword({ email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD });
const uid = auth.user.id;
const live = (v) => Number.isFinite(v) && Math.abs(v) < 1e29;

/** Fault blocks: the live nodes connected to each other (the fault gap is null). */
function blocks(z, nx, ny) {
  const lab = new Int32Array(z.length).fill(-1); let n = 0;
  for (let j = 0; j < z.length; j++) {
    if (!live(z[j]) || lab[j] >= 0) continue;
    const st = [j]; lab[j] = n;
    while (st.length) { const q = st.pop(); const r = Math.floor(q / nx); const c = q % nx; for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr; const cc = c + dc; if (rr < 0 || cc < 0 || rr >= ny || cc >= nx) continue; const k = rr * nx + cc; if (live(z[k]) && lab[k] < 0) { lab[k] = n; st.push(k); } } }
    n++;
  }
  return lab;
}
/** Median over a window, from the node's own fault block only (a fault step is not an anomaly). */
function medianFilter(z, nx, ny, R, lab) {
  const out = new Float64Array(z.length).fill(NULL); const buf = [];
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    const j = r * nx + c; if (!live(z[j])) continue; buf.length = 0;
    for (let dr = -R; dr <= R; dr += 2) for (let dc = -R; dc <= R; dc += 2) { const rr = r + dr; const cc = c + dc; if (rr < 0 || cc < 0 || rr >= ny || cc >= nx) continue; const k = rr * nx + cc; const v = z[k]; if (live(v) && lab[k] === lab[j]) buf.push(v); }
    buf.sort((a, b) => a - b); out[j] = buf[buf.length >> 1];
  }
  return out;
}
/**
 * Cone mask: seeds where the surface stands > seedFt above the block's broad
 * median, grown while it stays more than growFt off it either way (the cone and
 * its moat), within the block, then dilated.
 */
function coneMask(z, nx, ny, { R = 14, seedFt = 35, growFt = 6, dilate = 4, maxNodes = 1500 } = {}) {
  const lab = blocks(z, nx, ny);
  const bg = medianFilter(z, nx, ny, R, lab);
  const a = Float64Array.from(z, (v, j) => (live(v) && live(bg[j]) ? v - bg[j] : 0));
  const m = new Uint8Array(z.length);
  const info = []; const seen = new Uint8Array(z.length);
  const order = []; for (let j = 0; j < z.length; j++) if (Math.abs(a[j]) > seedFt) order.push(j);
  order.sort((p, q) => Math.abs(a[q]) - Math.abs(a[p]));
  for (const s0 of order) {
    if (seen[s0]) continue;
    const sgn = Math.sign(a[s0]); const reg = [s0]; seen[s0] = 1; const st = [s0];
    while (st.length) {
      const j = st.pop(); const r = Math.floor(j / nx); const c = j % nx;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const rr = r + dr; const cc = c + dc; if (rr < 0 || cc < 0 || rr >= ny || cc >= nx) continue;
        const k = rr * nx + cc; if (!seen[k] && live(z[k]) && lab[k] === lab[s0] && sgn * a[k] > growFt) { seen[k] = 1; reg.push(k); st.push(k); }
      }
    }
    // a cone is compact; a broad high is structure and stays
    // pits are only removed when small (a bad pick's dimple); a broad low is structure
    if (reg.length > (sgn < 0 ? 300 : maxNodes)) { info.push({ cnt: reg.length, peakFt: a[s0], at: s0, kept: true }); continue; }
    for (const k of reg) m[k] = 1;
    info.push({ cnt: reg.length, peakFt: Math.abs(a[s0]) * sgn, at: s0, kept: false });
  }
  for (let it = 0; it < dilate; it++) {
    const add = [];
    for (let j = 0; j < z.length; j++) if (m[j]) { const r = Math.floor(j / nx); const c = j % nx; for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr; const cc = c + dc; if (rr >= 0 && cc >= 0 && rr < ny && cc < nx) { const k = rr * nx + cc; if (live(z[k]) && lab[k] === lab[j]) add.push(k); } } }
    for (const k of add) m[k] = 1;
  }
  return { m, bg, info: info.filter((c) => !c.kept), kept: info.filter((c) => c.kept), lab };
}
/** Fill masked nodes by the membrane (Laplace) equation from the surrounding surface: smooth, no new extremum. */
function membraneFill(z, nx, ny, m, init, lab) {
  const out = Float64Array.from(z);
  for (let j = 0; j < z.length; j++) if (m[j]) out[j] = init[j];
  for (let it = 0; it < 4000; it++) {
    let dmax = 0;
    for (let j = 0; j < z.length; j++) {
      if (!m[j]) continue; const r = Math.floor(j / nx); const c = j % nx; let s = 0; let k = 0;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr; const cc = c + dc; if (rr < 0 || cc < 0 || rr >= ny || cc >= nx) continue; const kk = rr * nx + cc; const v = out[kk]; if (live(v) && lab[kk] === lab[j]) { s += v; k++; } }
      if (!k) continue; const nv = out[j] + 1.9 * (s / k - out[j]); dmax = Math.max(dmax, Math.abs(nv - out[j])); out[j] = nv;
    }
    if (dmax < 1e-3) break;
  }
  return out;
}
/** Ordinary kriging of the well residuals (spherical, long range): a broad correction that passes through each well with no cone. */
function okResiduals(pts, rangeM) {
  const cov = (h) => (h >= rangeM ? 0 : 1 - (1.5 * h / rangeM - 0.5 * (h / rangeM) ** 3));
  const n = pts.length; const m = n + 1; const A = Array.from({ length: m }, () => new Float64Array(m));
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) A[i][j] = cov(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)) + (i === j ? 1e-9 : 0); A[i][n] = 1; A[n][i] = 1; }
  return (x, y) => {
    const M = A.map((r) => Float64Array.from(r)); const b = new Float64Array(m);
    for (let i = 0; i < n; i++) b[i] = cov(Math.hypot(pts[i].x - x, pts[i].y - y)); b[n] = 1;
    for (let c = 0; c < m; c++) { let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; [b[c], b[p]] = [b[p], b[c]]; for (let r = c + 1; r < m; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k < m; k++) M[r][k] -= f * M[c][k]; b[r] -= f * b[c]; } }
    const w = new Float64Array(m); for (let r = m - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < m; k++) s -= M[r][k] * w[k]; w[r] = s / M[r][r]; }
    let v = 0; for (let i = 0; i < n; i++) v += w[i] * pts[i].r; return v;
  };
}

const { data: rows } = await sb.from('geo_surfaces').select('*').in('name', ['Ekene Sand (depth ft)', 'Ekene Sand Base (depth ft)']).eq('nx', 201);
const { data: wells } = await sb.from('geo_wells').select('*');
const { data: tops } = await sb.from('geo_wells_tops').select('*');
const go = process.argv[2] === 'go';
const done = new Set();
for (const row of rows) {
  if (done.has(row.name)) continue; done.add(row.name);
  const { data: blob } = await sb.storage.from('surfaces').download(row.storage_path);
  const z = Float64Array.from(new Float32Array(await blob.arrayBuffer()));
  const { nx, ny } = row; const spec = { x0: row.origin_x, y0: row.origin_y, dx: row.dx, dy: row.dy, nx, ny };
  const { m, bg, info, kept, lab } = coneMask(z, nx, ny);
  const big = info;
  // fill the departure from the block's broad median, so the refilled patch keeps the slope around it
  // the median is blocky: smooth it within each block before using it as the slope to keep
  let sm = Float64Array.from(bg);
  for (let pass = 0; pass < 4; pass++) {
    const nxt = Float64Array.from(sm);
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      const j = r * nx + c; if (!live(sm[j])) continue; let s = 0; let k = 0;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = r + dr; const cc = c + dc; if (rr < 0 || cc < 0 || rr >= ny || cc >= nx) continue; const q = rr * nx + cc; if (live(sm[q]) && lab[q] === lab[j]) { s += sm[q]; k++; } }
      nxt[j] = s / k;
    }
    sm = nxt;
  }
  bg.set(sm);
  const dep = Float64Array.from(z, (v, j) => (live(v) && live(bg[j]) ? v - bg[j] : NULL));
  const depF = membraneFill(dep, nx, ny, m, new Float64Array(z.length), lab);
  const filled = Float64Array.from(z, (v, j) => (m[j] && live(bg[j]) ? bg[j] + depF[j] : v));
  console.log('kept as structure:', kept.map((c) => `${Math.round(c.peakFt)} ft ${c.cnt} nodes at (${(spec.x0 + (c.at % nx) * spec.dx).toFixed(0)},${(spec.y0 + Math.floor(c.at / nx) * spec.dy).toFixed(0)})`).join('; '));
  // the well ties
  const topName = row.name.startsWith('Ekene Sand Base') ? 'Ekene Sand Base' : 'Ekene Sand';
  const pts = [];
  for (const w of wells.filter((x) => /^Ekene-\d$/.test(x.name))) {
    const t = tops.find((q) => q.well_id === w.id && q.name === topName); if (!t) continue;
    const p = positionAtMd(minCurvature(w.deviation || [], w.depth_ref_elev_m ?? w.kb_m, w.surface_x, w.surface_y), t.md_m);
    const sv = sampleAtXY(filled, spec, p.x, p.y); if (!live(sv)) continue;
    pts.push({ well: w.name, x: p.x, y: p.y, r: (-p.tvdss / FT) - sv, before: (-p.tvdss / FT) - sampleAtXY(z, spec, p.x, p.y) });
  }
  const corr = okResiduals(pts, 2500);
  // the tie correction stays in the fault blocks that hold the wells (the footwall keeps its own depths)
  const wellBlocks = new Set(pts.map((p) => lab[Math.round((p.y - spec.y0) / spec.dy) * nx + Math.round((p.x - spec.x0) / spec.dx)]));
  const out = new Float32Array(z.length);
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) { const j = r * nx + c; out[j] = live(filled[j]) ? filled[j] + (wellBlocks.has(lab[j]) ? corr(spec.x0 + c * spec.dx, spec.y0 + r * spec.dy) : 0) : NULL; }
  const after = pts.map((p) => `${p.well} ${p.before.toFixed(2)} -> ${((-1) * 0 + p.r - corr(p.x, p.y)).toFixed(3)}`);
  const changed = [...m].filter(Boolean).length;
  const { m: m2, info: info2 } = coneMask(Float64Array.from(out), nx, ny);
  console.log(`== ${row.name}: ${big.length} cones removed (${big.map((c) => `${Math.round(c.peakFt)} ft (${Math.sign(c.peakFt) > 0 ? 'bump' : 'pit'}) at (${(spec.x0 + (c.at % nx) * spec.dx).toFixed(0)},${(spec.y0 + Math.floor(c.at / nx) * spec.dy).toFixed(0)}), ${c.cnt} nodes`).join('; ')}); ${changed} nodes refilled; ties ${after.join(', ')}; cones left ${info2.map((c) => `${Math.round(c.peakFt)} ft (${Math.sign(c.peakFt) > 0 ? 'bump' : 'pit'}) at (${(spec.x0 + (c.at % nx) * spec.dx).toFixed(0)},${(spec.y0 + Math.floor(c.at / nx) * spec.dy).toFixed(0)}) ${c.cnt} nodes`).join("; ")}`);
  if (process.env.DUMP) fs.writeFileSync(`${row.name.includes("Base") ? "base" : "top"}.json`, JSON.stringify({ nx, ny, z: Array.from(z), out: Array.from(out) }));
  if (!go) continue;
  const name = row.name.replace('(depth ft)', '(depth ft, conditioned)');
  const { data: exists } = await sb.from('geo_surfaces').select('id').eq('name', name);
  if (exists?.length) { console.log('exists, skipped', name); continue; }
  const id = require('crypto').randomUUID(); const path = `${uid}/${id}/grid.f32`;
  const up = await sb.storage.from('surfaces').upload(path, new Blob([out.buffer], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream', upsert: false });
  if (up.error) throw up.error;
  const { id: _i, created_at: _c, updated_at: _u, storage_path: _s, name: _n, ...rest } = row;
  const prov = { ...(row.provenance || {}), conditioned: { from: row.id, from_name: row.name, at: new Date().toISOString(), by: 'Earth Modeling 3D grid build (Claude agent)', method: 'bullseye cones (peak > 80 ft above a 14-node median, grown to 6 ft, dilated 2 nodes) refilled by the membrane equation; then tied to the Ekene well tops by ordinary kriging of the residuals (spherical 2,500 m), so the correction is broad and passes through every well; the correction stays in the fault block that holds the wells', cones: big.length, nodes_refilled: changed, ties: pts.map((p) => ({ well: p.well, residual_before_ft: Number(p.before.toFixed(2)) })) } };
  const { error } = await sb.from('geo_surfaces').insert({ ...rest, id, name, storage_path: path, provenance: prov });
  if (error) { await sb.storage.from('surfaces').remove([path]); throw error; }
  console.log('inserted', name, id);
}

})().catch((e) => { console.error(e); process.exit(1); });
