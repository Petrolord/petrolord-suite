// QI open-dataset benchmark harness (not shipped). Drives the Suite's own
// services in Chromium, as the apps call them, with the QA account:
// well import (WDM registry path), seismic server import with crop
// (Seismolord path), seismic QC, inversion blind check and volume run,
// property calibration (QI Studio paths). Rerunnable; every write is named
// with the prefix "BENCH " so cleanup finds it.
import { supabase } from '@/lib/customSupabaseClient';
import { saveWell, saveLogs, saveZone, listWells, deleteWell, updateWell, updateWellData } from '@/lib/wellsRegistry';
import { buildCheckshotInputs } from '@/lib/wellImport';
import { makeWellFrame } from '@/lib/wellDatum';
import { toStoredCheckshots, makeCheckshotProvenance } from '@/pages/apps/WellDataManager/engine/checkshots';
import { parseLas } from '@/pages/apps/WellDataManager/engine/lasParse';
import { prepareLasForRegistry } from '@/pages/apps/WellDataManager/engine/lasIndex';
import { fileReader } from '@/pages/apps/Seismolord/engine/reader';
import { openSegyDoor } from '@/pages/apps/Seismolord/lib/segyDoor';
import { scanGeometry } from '@/pages/apps/Seismolord/engine/segyScan';
import { planImportCrop, cropSource, spotCheckCrop, conversionView, scanConversionView, cropFileLike, importCropProvenance } from '@/pages/apps/Seismolord/services/cropImport';
import { startServerImport, uploadForQi } from '@/pages/apps/Seismolord/services/serverImport';
import { getProjectCrs, setProjectCrs } from '@/lib/crs/settingsService';
import { isTransformableTag, UNKNOWN } from '@/lib/crs/tags';
import { enqueueJob, getJob, listJobs, cancelJob, listDatasets } from '@/lib/qiService';
import { makeRegistryBackend } from '@/pages/apps/QIStudio/services/registryBackend';
import { prepareWell } from '@/pages/apps/QIStudio/services/inversionWells';
import { packLog } from '@/pages/apps/QIStudio/services/logPacking';
import { getManifest } from '@/pages/apps/Seismolord/services/volumesService';
import { saveDerivedCheckshots } from '@/pages/apps/Seismolord/services/wellsService';
import { saveHorizon } from '@/pages/apps/Seismolord/services/horizonsService';
import { normalizeInputCurve } from '@/components/wells/curveUnits';
import { listLogs, downloadCurve } from '@/lib/wellsRegistry';
import { autoTieWell, tiedCheckshots, fieldTieConvention } from '@/pages/apps/Seismolord/engine/autoTie';
import { rotateConstantPhase, makeTieWarp, warpToCheckshots } from '@/pages/apps/Seismolord/engine/tieWarp';
import { denseTieWarp } from '@/pages/apps/Seismolord/components/SyntheticsPanel';
import { buildSynthetic, extractStatisticalWavelet } from '@/pages/apps/Seismolord/engine/synthetics';
import { effectiveCheckshots } from '@/pages/apps/Seismolord/services/wellsService';
// option 2 (Suite PR #1159, not on main yet): the engine as vendored on that branch
import { suggestTieAnchors } from '@/pages/apps/Seismolord/engine/autoAnchors';
import { makeTvdssToTwt } from '@/pages/apps/Seismolord/engine/wellSection';
import { storageBrickFetcher } from '@/pages/apps/Seismolord/engine/brickCache';
import { v4BrickFetcher } from '@/pages/apps/Seismolord/engine/brickCodecV4';
import { geomFromManifest, brickKey } from '@/pages/apps/Seismolord/engine/sliceAssembly';
import { surveyAffine, worldToIlxl } from '@/pages/apps/Seismolord/engine/surveyGeometry';

const MAP = { ilByte: 189, xlByte: 193 };
const backend = makeRegistryBackend();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ricker = (f, dtMs, n = 61) => Array.from({ length: n }, (_, i) => { const t = ((i - (n - 1) / 2) * dtMs) / 1000; const a = (Math.PI * f * t) ** 2; return (1 - 2 * a) * Math.exp(-a); });

window.qb = {
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data.user.id;
  },
  async ensureCrs(tag) {
    const cur = await getProjectCrs();
    if (cur?.tag === tag) return { tag, changed: false };
    await setProjectCrs({ tag, allowWithData: true });
    return { tag, changed: true, was: cur?.tag || null };
  },
  /** One well: header, every LAS curve, zones, and the time-depth table as checkshots (provenance says how it was made). */
  async importWell(w, lasText) {
    const existing = (await listWells()).find((x) => x.name === w.name && x.is_own !== false);
    if (existing) return { skipped: true, id: existing.id };
    const parsed = parseLas(lasText);
    const { prep } = prepareLasForRegistry(parsed, { sourceFile: w.las });
    const logs = prep.logs.filter((l) => l.kind !== 'depth' && l.mnemonic !== 'DEPT');
    // density porosity as the dGB F3 demo states it: (2.65 - RHOB) / (2.65 - 1.05)
    const rhob = logs.find((l) => l.mnemonic === 'RHOB');
    if (rhob && w.addPhid) {
      const data = Float32Array.from(rhob.data, (v) => (Number.isFinite(v) && v > 1 ? (2.65 - v) / 1.6 : NaN));
      logs.push({ ...rhob, mnemonic: 'PHID', description: 'Density porosity (2.65 - RHOB) / 1.6, benchmark', unit: 'V/V', sourceUnit: 'V/V', converted: false, kind: 'porosity', data, provenance: { ...rhob.provenance, derived: 'PHID = (2.65 - RHOB) / (2.65 - 1.05), dGB F3 demo convention' } });
    }
    const well = await saveWell({
      name: w.name, uwi: w.nlog, surfaceX: w.x, surfaceY: w.y, crs: w.crs, xyUnit: 'm',
      crsNote: 'NLOG xcoordUTM / ycoordUTM (ED50 / UTM 31N)', kbM: w.kbM, refElevM: w.kbM, refType: 'RT', tdMdM: w.tdMdM,
      checkshots: w.checkshots, checkshotsProvenance: { source: 'sonic-integrated', note: w.tdrNote },
      unitsNote: `NLOG ${w.las}; benchmark import`,
    });
    const saved = await saveLogs(well.id, logs);
    for (const z of w.zones) await saveZone(well.id, { name: z.name, topMdM: z.topMdM, baseMdM: z.baseMdM });
    return { id: well.id, curves: saved.map((l) => l.mnemonic), zones: w.zones.length };
  },
  async scan(file) {
    const { reader } = await openSegyDoor(fileReader(file));
    return scanGeometry(reader, MAP, { maxTraces: 20000 });
  },
  /** Seismolord's server import with a crop, as ImportPanel.startServer does it. */
  async importSeismic(file, def, name, crsOverride = null) {
    const scan = await this.scan(file);
    const project = await getProjectCrs();
    // the file's own CRS when the plan states it (F3 and Volve are ED50 / UTM 31N, EPSG:23031)
    const nativeCrs = crsOverride || (project?.tag && isTransformableTag(project.tag) ? project.tag : UNKNOWN);
    const raw = fileReader(file);
    const prep = await planImportCrop({ raw, scan, def, mapping: MAP });
    const cropped = cropSource(raw, prep, { sourceName: file.name, mapping: MAP });
    await spotCheckCrop(cropped, prep.plan);
    const view = await conversionView(cropped, prep.crop);
    const convScan = await scanConversionView(view, MAP);
    convScan.coordScalar = convScan.coordScalar ?? scan.coordScalar;
    const provenance = importCropProvenance(prep, { file, mode: 'upload', definitionId: null });
    const fileLike = cropFileLike(cropped, { file, crop: prep.crop });
    const t0 = performance.now();
    const out = await startServerImport({ file, mapping: MAP, scan, nativeCrs, name, crop: { fileLike, scan: convScan, padTop: prep.crop.samples.first, provenance } });
    return { ...out, nativeCrs, bytes: fileLike.size, uploadS: (performance.now() - t0) / 1000, crop: prep.crop, scan: { il: scan.il, xl: scan.xl, ns: scan.ns, dtUs: scan.dtUs } };
  },
  async wait(id, maxMin = 240) {
    const t0 = Date.now();
    for (;;) {
      const j = await getJob(id);
      if (j && !['queued', 'running'].includes(j.status)) return j;
      if (Date.now() - t0 > maxMin * 60000) return { ...j, timedOut: true };
      await sleep(10000);
    }
  },
  async volumeByName(name) {
    const v = (await backend.listVolumes()).find((x) => x.name === name);
    if (!v) throw new Error(`No volume named ${name}`);
    return v;
  },
  async qc(volumeName) {
    const v = await this.volumeByName(volumeName);
    const id = await enqueueJob('seismic_qc', { volume_id: v.id });
    const j = await this.wait(id);
    return { jobId: id, status: j.status, error: j.error_message, result: j.result_refs };
  },
  /** The wells as the Inversion tab prepares them. */
  async wells(volumeName, names = null) {
    const v = await this.volumeByName(volumeName);
    const frame = await backend.loadVolumeFrame(v);
    const out = [];
    for (const w of await listWells()) {
      if (names && !names.includes(w.name)) continue;
      if (!names && !w.name.startsWith('F3 ') && !w.name.startsWith('Volve ')) continue;
      out.push(await prepareWell(await backend.loadWell(w), frame, backend.downloadCurve));
    }
    return { volume: v, frame, wells: out };
  },
  /** poststack_inversion in blind mode (and optionally volume mode), with the tab's defaults. */
  async inversion(volumeName, opts = {}) {
    const { volume, frame, wells } = await this.wells(volumeName, opts.wells || null);
    const ok = wells.filter((w) => w.ok);
    const horizonIds = [];
    if (opts.horizons?.length) {
      const hs = await backend.listHorizons(volume.id);
      for (const n of opts.horizons) { const h = hs.find((x) => x.name === n); if (h) horizonIds.push(h.id); }
    }
    let wavelet = opts.wavelet && opts.wavelet !== 'tie' ? opts.wavelet : { samples: ricker(opts.rickerHz || 25, frame.dtMs), dt_ms: frame.dtMs };
    if (opts.wavelet === 'tie') {
      const ws = Object.values(window.__tieW || {});
      if (!ws.length) throw new Error('no tie wavelets in this session: run a tie step first');
      const n = Math.min(...ws.map((x) => x.samples.length));
      const avg = Array.from({ length: n }, (_, i) => ws.reduce((a, x) => a + x.samples[i + (x.samples.length - n) / 2], 0) / ws.length);
      wavelet = { samples: avg, dt_ms: ws[0].dt_ms };
    }
    // an inversion window: logs outside it are left out of the scaling and the check
    if (opts.windowMs) for (const w of ok) w.ln_ai = w.ln_ai.map((v, i) => (i * frame.dtMs >= opts.windowMs[0] && i * frame.dtMs <= opts.windowMs[1] ? v : NaN));
    const inversion = { method: opts.method || 'model_based', wavelet, wells: ok.map((w) => ({ name: w.name, il: w.il, xl: w.xl, ln_ai: packLog(w.ln_ai) })), horizon_ids: horizonIds, ...(opts.settings || {}) };
    const res = { wells: wells.map((w) => ({ name: w.name, ok: w.ok, reason: w.reason, il: w.il, xl: w.xl, timeSource: w.timeSource, curves: w.curves })) };
    if (ok.length < 2) return { ...res, error: 'fewer than two usable wells' };
    const jb = await enqueueJob('poststack_inversion', { mode: 'blind', parent_volume_id: volume.id, inversion });
    const rb = await this.wait(jb);
    res.blind = { jobId: jb, status: rb.status, error: rb.error_message, stage: rb.failure_stage, table: rb.result_refs?.blind, settings: rb.result_refs?.settings, protocol: rb.result_refs?.blind_protocol, residualAtWells: rb.result_refs?.residual_at_wells, engine: rb.engine_commit };
    if (opts.volume && rb.status === 'succeeded') {
      const summary = { qi_class: 'elastic_estimate', method: inversion.method, wells: ok.map((w) => w.name), horizon_ids: horizonIds };
      const row = await backend.registerInversionVolume({ volume, name: opts.volumeName || `BENCH ${volumeName} AI`, summary });
      const resRow = opts.residual ? await backend.registerInversionVolume({ volume, name: `${row.name} residual`, summary: { ...summary, product: 'residual' } }) : null;
      const jv = await enqueueJob('poststack_inversion', { mode: 'volume', parent_volume_id: volume.id, volume_id: row.id, name: row.name, inversion: { ...inversion, ...(resRow ? { residual: true } : {}) }, ...(resRow ? { residual_volume_id: resRow.id } : {}) });
      const rv = await this.wait(jv);
      res.volume = { jobId: jv, status: rv.status, error: rv.error_message, volumeId: row.id, name: row.name, traces: rv.result_refs?.trace_count, residual: rv.result_refs?.residual, residualVolumeId: rv.result_refs?.residual_volume_id, blind: rv.result_refs?.blind, settings: rv.result_refs?.settings };
    }
    return res;
  },
  /** property_prediction calibrate (and optionally volume) on an AI volume. */
  async property(aiVolumeName, seismicName, opts = {}) {
    const kind = opts.kind || 'porosity';
    const v = await this.volumeByName(seismicName);
    const frame = await backend.loadVolumeFrame(v);
    const prepared = [];
    for (const w of await listWells()) {
      if (opts.wells ? !opts.wells.includes(w.name) : !w.name.startsWith('F3 ') && !w.name.startsWith('Volve ')) continue;
      prepared.push(await prepareWell(await backend.loadWell(w), frame, backend.downloadCurve, { extras: [kind] }));
    }
    const { data: ai } = await supabase.from('seismic_volumes').select('id,name').eq('name', aiVolumeName).maybeSingle();
    if (!ai) throw new Error(`No AI volume ${aiVolumeName}`);
    const ok = prepared.filter((w) => w.ok && w[kind]?.values);
    const property = { kind, wells: ok.map((w) => ({ name: w.name, il: w.il, xl: w.xl, ln_ai: packLog(w.ln_ai), target: packLog(w[kind].values) })), ...(opts.window_ms ? { window_ms: opts.window_ms } : {}) };
    const j = await enqueueJob('property_prediction', { mode: 'calibrate', ai_volume_id: ai.id, property });
    const r = await this.wait(j);
    return { jobId: j, status: r.status, error: r.error_message, summary: r.result_refs?.summary, rows: r.result_refs?.rows, dtMs: frame.dtMs, skipped: prepared.filter((w) => !ok.includes(w)).map((w) => [w.name, w.reason || w[kind]?.reason]) };
  },
  /** Seismolord's automatic tie (engines autoTie, as Tops to Horizons runs it) for each benchmark well; commit=true saves the tied relation as derived checkshots, as Commit tie does. */
  async tie(volumeName, { commit = false, commitAny = false, names = null, maxShiftMs = 60, mdRange = null, effective = false } = {}) {
    const volume = await this.volumeByName(volumeName);
    const manifest = await getManifest(volume);
    const geom = geomFromManifest(manifest);
    const affine = surveyAffine(manifest.geometry);
    const dtUs = Number(manifest.geometry.dt_us);
    const { data: sess } = await supabase.auth.getSession();
    const fetcher = v4BrickFetcher(storageBrickFetcher({ supabaseUrl: supabase.supabaseUrl, getToken: async () => sess.session.access_token, bucket: 'seismic' }), manifest);
    const b = geom.brickSize; const nk = geom.grid[2];
    const cache = new Map();
    const brick = async (i, j, k) => { const key = `${i}-${j}-${k}`; if (!cache.has(key)) { if (cache.size > 400) cache.clear(); cache.set(key, new Float32Array(await fetcher(brickKey(volume.storage_path, i, j, k)))); } return cache.get(key); };
    const getTrace = async (il, xl) => {
      const bricks = await Promise.all(Array.from({ length: nk }, (_, k) => brick(Math.floor(il / b), Math.floor(xl / b), k)));
      const base = ((il % b) * b + (xl % b)) * b;
      return Float32Array.from({ length: geom.ns }, (_, s2) => { const v = bricks[Math.floor(s2 / b)][base + (s2 % b)]; return Math.abs(v) > 1e29 ? 0 : v; });
    };
    const out = [];
    const ties = [];
    for (const w of await listWells()) {
      if (names ? !names.includes(w.name) : !w.name.startsWith('F3 ') && !w.name.startsWith('Volve ')) continue;
      const logs = await listLogs(w.id);
      const sonic = logs.find((l) => l.mnemonic === 'DT'); const dens = logs.find((l) => l.mnemonic === 'RHOB');
      if (!sonic) { out.push({ name: w.name, error: 'no DT' }); ties.push(null); continue; }
      const dt = Float64Array.from(normalizeInputCurve('DT', sonic, await downloadCurve(sonic)).data);
      let rho = dens ? Float64Array.from(normalizeInputCurve('RHOB', dens, await downloadCurve(dens)).data) : null;
      if (rho && (rho.length !== dt.length || dens.start_md_m !== sonic.start_md_m)) rho = null;
      const md = Float64Array.from({ length: dt.length }, (_, i) => Number(sonic.start_md_m) + i * Number(sonic.step_m));
      // a tie window: logs outside the MD range are left out (NaN), as a user trims the tie interval
      if (mdRange) for (let i = 0; i < md.length; i++) if (md[i] < mdRange[0] || md[i] > mdRange[1]) { dt[i] = NaN; if (rho) rho[i] = NaN; }
      const rows = effective ? effectiveCheckshots(w).rows : (w.checkshots || []);
      const timeConv = makeTvdssToTwt({ checkshots: rows, dtUs, maxTwtMs: geom.ns * dtUs / 1000 });
      const well = { name: w.name, surfaceX: w.surface_x, surfaceY: w.surface_y, kbM: w.ref_elev_m ?? w.kb_m, tdMdM: w.td_md_m, deviation: w.deviation, logs: { md, dtUsPerM: Float32Array.from(dt, (v) => (Number.isFinite(v) ? v : NaN)), rho: rho ? Float32Array.from(rho, (v) => (Number.isFinite(v) ? v : NaN)) : null } };
      let t = null; let err = null;
      try { t = await autoTieWell({ well, timeConv, affine, geom, dtUs, getTrace, maxShiftMs }); } catch (e) { err = e.message; }
      ties.push(t);
      if (!t) { out.push({ name: w.name, error: err || 'not tied (off survey or no overlap)' }); continue; }
      // the tie's own wavelet with its phase and polarity, as the inversion should see it (seismic = rotated synthetic)
      {
        const wav = Array.from(t.wavelet); const pad = wav.length; const z = new Float32Array(3 * pad); z.set(wav, pad);
        const phi = ((t.phaseDeg + (t.polarity === 'reverse' ? 180 : 0)) * Math.PI) / 180;
        const rot = Array.from(rotateConstantPhase(z, phi).slice(pad, 2 * pad));
        const mx = Math.max(...rot.map(Math.abs)) || 1;
        const odd = rot.length % 2 ? rot : rot.slice(0, -1);
        window.__tieW = window.__tieW || {}; window.__tieW[w.name] = { samples: odd.map((v) => v / mx), dt_ms: dtUs / 1000 };
      }
      const rec = { name: w.name, mdRange, shiftMs: t.shiftMs, polarity: t.polarity, phaseDeg: t.phaseDeg, corr: t.corr, corr0: t.corr0, quality: t.quality, cells: t.cells?.length ?? null };
      if ((commit && t.quality !== 'poor') || commitAny) {
        await saveDerivedCheckshots(w.id, { rows: tiedCheckshots(rows, t), provenance: { method: 'auto_tie_benchmark', shift_ms: t.shiftMs, corr: t.corr, phase_deg: t.phaseDeg, polarity: t.polarity, volume_id: volume.id, at: new Date().toISOString() } });
        rec.committed = true;
      }
      out.push(rec);
    }
    return { ties: out, convention: fieldTieConvention(ties) };
  },
  /** Put a well in another CRS with coordinates the source gives for it (no transform here). */
  async setWellCoords(list) {
    const out = [];
    const wells = await listWells();
    for (const c of list) {
      const w = wells.find((x) => x.name === c.name);
      if (!w) { out.push({ name: c.name, error: 'not found' }); continue; }
      await updateWell(w.id, { surface_x: c.x, surface_y: c.y, crs: c.crs, crs_note: c.note || null });
      out.push({ name: c.name, from: [w.surface_x, w.surface_y, w.crs], to: [c.x, c.y, c.crs] });
    }
    return out;
  },
  /** A flat 'horizon' at a constant time on a volume (stands in where no interpreted horizon exists; named as such). */
  async flatHorizon(volumeName, name, tMs) {
    const volume = await this.volumeByName(volumeName);
    const manifest = await getManifest(volume);
    const g = manifest.geometry; const dtUs = Number(g.dt_us);
    const hs = await backend.listHorizons(volume.id);
    const old = hs.find((h) => h.name === name);
    if (old) return { id: old.id, existing: true };
    const picks = new Float32Array(g.il.count * g.xl.count).fill(tMs * 1000 / dtUs);
    const h = await saveHorizon({ volume, name, picks, seed: { ilIdx: 0, xlIdx: 0, sample: tMs * 1000 / dtUs }, params: { mode: 'flat', note: 'constant-time window top, benchmark' }, dtUs });
    return { id: h.id };
  },
  /** zone_maps on volumes (by name) between a horizon and a window below it; the lattice files are removed after reading their stats. */
  async zoneMaps(volumeNames, horizonOnVolume, horizonName, windowMs, products) {
    const ids = [];
    for (const n of volumeNames) { const { data } = await supabase.from('seismic_volumes').select('id').eq('name', n).maybeSingle(); if (!data) throw new Error(`No volume ${n}`); ids.push(data.id); }
    const hv = await this.volumeByName(horizonOnVolume);
    const h = (await backend.listHorizons(hv.id)).find((x) => x.name === horizonName);
    if (!h) throw new Error(`No horizon ${horizonName}`);
    const j = await enqueueJob('zone_maps', { volume_ids: ids, top_horizon_id: h.id, window_ms: windowMs, products, name: 'BENCH zone maps' });
    const r = await this.wait(j);
    const out = { jobId: j, status: r.status, error: r.error_message, result: r.result_refs };
    const files = JSON.stringify(r.result_refs || {}).match(/[0-9a-f-]{36}\/qi-zone-maps\/[^"]+\.f32/g) || [];
    if (files.length) { const { error } = await supabase.storage.from('seismic').remove(files); out.removed = error ? error.message : files.length; }
    return out;
  },
  /** Well Data Manager's checkshot save (WellDetail, Checkshots tab, paste mode): the pasted rows through
   *  buildCheckshotInputs, toStoredCheckshots on the well frame, makeCheckshotProvenance, updateWellData. */
  async importCheckshots(name, rows, conv, note) {
    const w = (await listWells()).find((x) => x.name === name);
    if (!w) throw new Error(`No well ${name}`);
    const inputs = buildCheckshotInputs(rows, { depth: 0, time: 1 });
    const frame = makeWellFrame(w);
    const res = toStoredCheckshots(inputs, conv, frame);
    const prov = makeCheckshotProvenance(conv, { source: 'wdm-edit', kbM: frame.kbM, stations: frame.stations ? frame.stations.length : 0, note });
    await updateWellData(w.id, { checkshots: res.rows, checkshotsProvenance: prov }, { versioned: true, note: 'Checkshots edited' });
    return { name, rows: res.rows.length, first: res.rows[0], last: res.rows[res.rows.length - 1], warnings: res.warnings };
  },
  async cancelActive() {
    const jobs = (await listJobs({ limit: 50 })).filter((j) => ['queued', 'running'].includes(j.status));
    for (const j of jobs) await cancelJob(j.id);
    return jobs.map((j) => [j.id, j.kind, j.status]);
  },
  /** Option 2: the Synthetics "Suggest anchors" on each well (synthetic from the well's current time-depth and the
   *  statistical wavelet of the traces around it, against the centre trace), then the Synthetics commit:
   *  warpToCheckshots(denseTieWarp(warp, range)) through the well's own TWT -> TVDSS, saved as derived checkshots. */
  async suggestAnchors(volumeName, { names = null, commit = false } = {}) {
    const volume = await this.volumeByName(volumeName);
    const manifest = await getManifest(volume);
    const geom = geomFromManifest(manifest);
    const affine = surveyAffine(manifest.geometry);
    const dtUs = Number(manifest.geometry.dt_us); const dtMs = dtUs / 1000;
    const { data: sess } = await supabase.auth.getSession();
    const fetcher = v4BrickFetcher(storageBrickFetcher({ supabaseUrl: supabase.supabaseUrl, getToken: async () => sess.session.access_token, bucket: 'seismic' }), manifest);
    const b = geom.brickSize; const nk = geom.grid[2];
    const cache = new Map();
    const brick = async (i, j, k) => { const key = `${i}-${j}-${k}`; if (!cache.has(key)) { if (cache.size > 400) cache.clear(); cache.set(key, new Float32Array(await fetcher(brickKey(volume.storage_path, i, j, k)))); } return cache.get(key); };
    const getTrace = async (il, xl) => {
      const bricks = await Promise.all(Array.from({ length: nk }, (_, k) => brick(Math.floor(il / b), Math.floor(xl / b), k)));
      const base = ((il % b) * b + (xl % b)) * b;
      return Float32Array.from({ length: geom.ns }, (_, s2) => { const v = bricks[Math.floor(s2 / b)][base + (s2 % b)]; return Math.abs(v) > 1e29 ? 0 : v; });
    };
    const frame = await backend.loadVolumeFrame(volume);
    const out = [];
    for (const w of await listWells()) {
      if (names ? !names.includes(w.name) : !w.name.startsWith('F3 ')) continue;
      const rec = { name: w.name };
      try {
        const rows = effectiveCheckshots(w).rows;
        rec.timeDepth = effectiveCheckshots(w).derived ? 'derived' : (w.checkshots_provenance?.source === 'wdm-edit' ? 'NLOG checkshots' : 'sonic-integrated');
        const tc = makeTvdssToTwt({ checkshots: rows, dtUs, maxTwtMs: geom.ns * dtMs });
        const logs = await listLogs(w.id);
        const sonic = logs.find((l) => l.mnemonic === 'DT'); const dens = logs.find((l) => l.mnemonic === 'RHOB');
        const dt = Float64Array.from(normalizeInputCurve('DT', sonic, await downloadCurve(sonic)).data);
        let rho = dens ? Float64Array.from(normalizeInputCurve('RHOB', dens, await downloadCurve(dens)).data) : null;
        if (rho && (rho.length !== dt.length || dens.start_md_m !== sonic.start_md_m)) rho = null;
        const md = Float64Array.from({ length: dt.length }, (_, i) => Number(sonic.start_md_m) + i * Number(sonic.step_m));
        const kb = w.ref_elev_m ?? w.kb_m;
        // vertical wells (no deviation loaded): TVDSS = MD - KB; the trace the well sits on, as QI's prepareWell places it
        const ij = worldToIlxl(frame.affine, w.surface_x, w.surface_y);
        const il = Math.round(ij.i); const xl = Math.round(ij.j);
        if (!(il >= 0 && il < geom.nIl && xl >= 0 && xl < geom.nXl)) { rec.error = 'outside the survey'; out.push(rec); continue; }
        const centre = await getTrace(il, xl);
        const around = [];
        for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = il + di; const c = xl + dj; if (a >= 0 && c >= 0 && a < geom.nIl && c < geom.nXl) around.push(await getTrace(a, c)); }
        const wav = extractStatisticalWavelet(around, dtMs);
        const syn = buildSynthetic({ dtCurve: Float32Array.from(dt, (v) => (Number.isFinite(v) ? v : NaN)), rhobCurve: rho ? Float32Array.from(rho, (v) => (Number.isFinite(v) ? v : NaN)) : null, mdArray: md, mdToTvdss: (m) => m - kb, tvdssToTwt: (z) => tc.toTwtMs(z), dtMs, ns: geom.ns, wavelet: wav });
        // the synthetic as the Synthetics panel passes it (result.synthetic, unmasked; NaN would poison the phase rotation)
        const synN = Float32Array.from(syn.synthetic, (v) => (Number.isFinite(v) ? v : 0));
        // the panel's "SEG normal polarity" box: both settings tried, the better kept (as an interpreter toggles it)
        const tries = [['normal', synN], ['reverse', synN.map((v) => -v)]].map(([pol, sy]) => ({ pol, sy, sg: suggestTieAnchors(sy, centre, dtMs) }));
        rec.tries = tries.map((t) => ({ polarity: t.pol, ok: t.sg.ok, anchors: t.sg.anchors?.length || 0, phiDeg: t.sg.phiDeg, corrBefore: t.sg.corrBefore, corrAfter: t.sg.corrAfter, bulkShiftMs: t.sg.bulkShiftMs }));
        const best = tries.filter((t) => t.sg.ok).sort((a, b) => b.sg.corrAfter - a.sg.corrAfter)[0] || tries[0];
        const synthetic = best.sy; const sg = best.sg; rec.polarity = best.pol;
        Object.assign(rec, { il: il + 0, xl: xl + 0, ok: sg.ok, anchors: sg.anchors?.length || 0, phiDeg: sg.phiDeg, corrBefore: sg.corrBefore, corrAfter: sg.corrAfter, reason: sg.reason || null });
        if (sg.ok && commit) {
          // the run's TWT -> TVDSS through its own T(z): invert the checkshot table over the logged span
          const live = []; for (let i = 0; i < synthetic.length; i++) if (syn.validity[i]) live.push(i * dtMs);
          const toTvdss = (t) => { for (let k = 1; k < rows.length; k++) if (rows[k].twt_ms >= t) { const a = rows[k - 1]; const c = rows[k]; return a.tvdss_m + ((t - a.twt_ms) * (c.tvdss_m - a.tvdss_m)) / (c.twt_ms - a.twt_ms); } return null; };
          toTvdss.range = live.length ? [live[0], live[live.length - 1]] : null;
          const warp = makeTieWarp(sg.anchors);
          const csRows = warpToCheckshots(denseTieWarp(warp, toTvdss.range), toTvdss).map((r) => ({ tvdss_m: r.tvdssM, twt_ms: r.twtMs }));
          await saveDerivedCheckshots(w.id, { rows: csRows, provenance: { source: 'well_tie_warp', anchors: sg.anchors.length, phi_deg: Math.round(sg.phiDeg * 10) / 10, created_at: new Date().toISOString(), qc: { corr_before: sg.corrBefore, corr_after: sg.corrAfter, benchmark: 'suggested anchors' }, volume_id: volume.id } });
          rec.committed = csRows.length;
        }
      } catch (e) { rec.error = e.message; }
      out.push(rec);
    }
    return out;
  },
  async clearTies(names = null) {
    const out = [];
    for (const w of await listWells()) {
      if (names ? !names.includes(w.name) : !w.name.startsWith('F3 ') && !w.name.startsWith('Volve ')) continue;
      await saveDerivedCheckshots(w.id, null); out.push(w.name);
    }
    return out;
  },
  // QI round 3, prestack conditioning live check: a raw upload to the worker
  // store (Seismolord's upload-only path), any job by kind, and a gather
  // panel read back through its link
  async uploadRaw(file, name) { return uploadForQi({ file, name }); },
  async job(kind, params, maxMin = 240) {
    const id = await enqueueJob(kind, params);
    const j = await this.wait(id, maxMin);
    return { id, status: j.status, error: j.error_message || null, result: j.result_refs || null, warnings: j.warnings || null, cost_seconds: j.cost_seconds ?? null };
  },
  async datasets(prefix = 'BENCH') { return (await listDatasets({ allProjects: true })).filter((d) => d.name?.startsWith(prefix)).map((d) => ({ id: d.id, name: d.name, kind: d.kind, status: d.status, bytes: d.bytes, meta: d.meta })); },
  async panel(params) {
    const j = await this.job('gather_panel', params, 30);
    if (j.status !== 'succeeded') return j;
    const r = await fetch(j.result.url);
    const data = Array.from(new Float32Array(await r.arrayBuffer()));
    return { meta: j.result, data };
  },
  /** Download a link the worker returned, as the app's own download would: status, bytes and the first bytes as text. */
  async fetchLink(url) {
    const r = await fetch(url);
    const buf = new Uint8Array(await r.arrayBuffer());
    // the SEG-Y textual header is EBCDIC or ASCII; return both readings of its first 80 bytes
    const head = buf.subarray(0, 80);
    const E = ' '.repeat(64) + ' ' + '.'.repeat(9) + '.<(+|&' + '.'.repeat(9) + '!$*);^-/' + '.'.repeat(8) + '|,%_>?' + '.'.repeat(9) + '`:#@\'="' + ' abcdefghi' + '.'.repeat(7) + 'jklmnopqr' + '.'.repeat(7) + '~stuvwxyz' + '.'.repeat(22) + '{ABCDEFGHI' + '.'.repeat(6) + '}JKLMNOPQR' + '.'.repeat(6) + '\\ STUVWXYZ' + '.'.repeat(6) + '0123456789' + '.'.repeat(6);
    return { status: r.status, ok: r.ok, host: new URL(url).host, bytes: buf.length, ascii: String.fromCharCode(...head), ebcdic: Array.from(head, (c) => E[c] || '.').join('') };
  },
  async listMine() {
    const { data: vols } = await supabase.from('seismic_volumes').select('id,name,status,kind,survey_meta').order('created_at');
    const wells = await listWells();
    return { volumes: (vols || []).map((v) => ({ id: v.id, name: v.name, status: v.status, kind: v.kind, bytes: v.survey_meta?.storage_bytes })), wells: wells.map((w) => ({ id: w.id, name: w.name })) };
  },
  async removeVolumes(prefix) {
    const { data } = await supabase.from('seismic_volumes').select('*').like('name', `${prefix}%`);
    const out = [];
    for (const v of data || []) { try { await backend.removeVolume(v); out.push(v.name); } catch (e) { out.push(`${v.name}: ${e.message}`); } }
    return out;
  },
  async removeWells(prefix) {
    const out = [];
    for (const w of await listWells()) if (w.name.startsWith(prefix) && w.is_own !== false) { await deleteWell(w); out.push(w.name); }
    return out;
  },
};
document.title = 'qibench ready';
