// Runs a benchmark plan (JSON list of steps) through qibench.js in Chromium.
// usage: node drive-qi.mjs <plan.json> <results.json>
// steps: {op:'signIn'} | {op:'ensureCrs', tag} | {op:'importWells', wells:'f3/wells.json', lasDir, addPhid}
//        {op:'importSeismic', file, def, name} | {op:'qc', volume} | {op:'inversion', volume, opts}
//        {op:'property', ai, volume, opts} | {op:'listMine'} | {op:'removeVolumes', prefix} | {op:'removeWells', prefix}
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const [planFile, outFile] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const dir = path.dirname(new URL(import.meta.url).pathname);
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/qibench.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(fs.readFileSync(path.join(dir, 'qibench.js'))); return; }
  if (p.startsWith('/file/')) { const f = p.slice(5); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': 'text/plain' }); fs.createReadStream(f).pipe(res); return; }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><meta charset="utf-8"><input type="file" id="f"><script type="module" src="/qibench.js"></script>');
}).listen(8330, '127.0.0.1');
const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=6144'] });
const page = await browser.newPage();
page.setDefaultTimeout(0);
page.on('console', (m) => { if (m.type() === 'error') console.log('page error:', m.text().slice(0, 300)); });
await page.goto('http://127.0.0.1:8330/');
await page.waitForFunction(() => document.title === 'qibench ready');
const results = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
const save = () => fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
// "@key:path.to.value" in a step's params takes that value from an earlier step's result
const resolveRefs = (v) => {
  if (typeof v === 'string' && v.startsWith('@')) { const [k, p] = v.slice(1).split(':'); return (p || '').split('.').filter(Boolean).reduce((o, f) => (o == null ? o : o[f]), results[k]?.r); }
  if (Array.isArray(v)) return v.map(resolveRefs);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveRefs(x)]));
  return v;
};
for (const [k, st] of plan.entries()) {
  const key = st.key || `${k}:${st.op}`;
  const t0 = Date.now();
  console.log(`step ${key} ...`);
  try {
    let r;
    if (st.op === 'signIn') r = await page.evaluate(([e, p]) => window.qb.signIn(e, p), [process.env.QA_EMAIL, process.env.QA_PASSWORD]);
    else if (st.op === 'ensureCrs') r = await page.evaluate((t) => window.qb.ensureCrs(t), st.tag);
    else if (st.op === 'importWells') {
      const wells = JSON.parse(fs.readFileSync(path.resolve(dir, st.wells), 'utf8'));
      r = [];
      for (const w of wells) {
        const las = fs.readFileSync(path.join(st.lasDir, w.las), 'utf8');
        r.push({ name: w.name, ...(await page.evaluate(([ww, t]) => window.qb.importWell(ww, t), [{ ...w, addPhid: !!st.addPhid }, las])) });
      }
    } else if (st.op === 'importSeismic') {
      await page.setInputFiles('#f', st.file);
      r = await page.evaluate(([d, n, c]) => window.qb.importSeismic(document.getElementById('f').files[0], d, n, c), [st.def, st.name, st.crs || null]);
      if (st.wait && r.jobId) r.job = await page.evaluate((id) => window.qb.wait(id).then((j) => ({ status: j.status, error: j.error_message, result: j.result_refs })), r.jobId);
    } else if (st.op === 'qc') r = await page.evaluate((v) => window.qb.qc(v), st.volume);
    else if (st.op === 'inversion') r = await page.evaluate(([v, o]) => window.qb.inversion(v, o), [st.volume, st.opts || {}]);
    else if (st.op === 'property') r = await page.evaluate(([a, v, o]) => window.qb.property(a, v, o), [st.ai, st.volume, st.opts || {}]);
    else if (st.op === 'wells') r = await page.evaluate(([v, n]) => window.qb.wells(v, n).then((x) => x.wells.map((w) => ({ name: w.name, ok: w.ok, reason: w.reason, il: w.il, xl: w.xl, samples: w.samples, timeControl: w.timeControl }))), [st.volume, st.names || null]);
    else if (st.op === 'tie') r = await page.evaluate(([v, o]) => window.qb.tie(v, o), [st.volume, st.opts || {}]);
    else if (st.op === 'setWellCoords') r = await page.evaluate((l) => window.qb.setWellCoords(l), st.list);
    else if (st.op === 'flatHorizon') r = await page.evaluate(([v, n, t]) => window.qb.flatHorizon(v, n, t), [st.volume, st.name, st.tMs]);
    else if (st.op === 'zoneMaps') r = await page.evaluate(([a, b, c, d2, e]) => window.qb.zoneMaps(a, b, c, d2, e), [st.volumes, st.horizonVolume, st.horizon, st.windowMs, st.products]);
    else if (st.op === 'importCheckshots') r = await page.evaluate(([n, rows, c, note]) => window.qb.importCheckshots(n, rows, c, note), [st.name, JSON.parse(fs.readFileSync(st.rowsFile, 'utf8')), st.conv, st.note || null]);
    else if (st.op === 'suggestAnchors') r = await page.evaluate(([v, o]) => window.qb.suggestAnchors(v, o), [st.volume, st.opts || {}]);
    else if (st.op === 'cancelActive') r = await page.evaluate(() => window.qb.cancelActive());
    else if (st.op === 'clearTies') r = await page.evaluate((n) => window.qb.clearTies(n), st.names || null);
    // QI round 3: prestack conditioning live check. Params may name an earlier result as "@key:path.to.value".
    else if (st.op === 'uploadRaw') { await page.setInputFiles('#f', st.file); r = await page.evaluate((n) => window.qb.uploadRaw(document.getElementById('f').files[0], n), st.name); }
    else if (st.op === 'job') r = await page.evaluate(([k, p, m]) => window.qb.job(k, p, m), [st.kind, resolveRefs(st.params || {}), st.maxMin || 240]);
    else if (st.op === 'datasets') r = await page.evaluate((p) => window.qb.datasets(p), st.prefix || 'BENCH');
    else if (st.op === 'panel') { const pr = await page.evaluate((p) => window.qb.panel(p), resolveRefs(st.params)); if (st.out && pr.data) fs.writeFileSync(st.out, JSON.stringify(pr)); r = pr.data ? { meta: pr.meta, floats: pr.data.length, out: st.out } : pr; }
    else if (st.op === 'fetchLink') r = await page.evaluate((u) => window.qb.fetchLink(u), resolveRefs(st.url));
    else if (st.op === 'listMine') r = await page.evaluate(() => window.qb.listMine());
    else if (st.op === 'removeVolumes') r = await page.evaluate((p) => window.qb.removeVolumes(p), st.prefix);
    else if (st.op === 'removeWells') r = await page.evaluate((p) => window.qb.removeWells(p), st.prefix);
    else throw new Error(`unknown op ${st.op}`);
    results[key] = { ok: true, s: (Date.now() - t0) / 1000, at: new Date().toISOString(), r };
  } catch (e) {
    results[key] = { ok: false, s: (Date.now() - t0) / 1000, at: new Date().toISOString(), error: String(e.message || e) };
    console.log(`  failed: ${e.message}`);
    if (st.stopOnError !== false) { save(); break; }
  }
  save();
  console.log(`  done in ${(Date.now() - t0) / 1000} s`);
}
await browser.close(); srv.close();
