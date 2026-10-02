// Wellsite evidence for Pore Pressure Studio (Wellsite Studio U2-008; PP
// 2c "mud weights, gas, kicks and losses as calibration"). The live well
// publishes what it measured while drilling as ordinary registry curves
// (geo_wells_logs), so Pore Pressure Studio, Petrophysics and Well
// Correlation read them like any other log:
//
//   DXC   corrected d-exponent (no unit)     DEXP  d-exponent (no unit)
//   TGAS  total gas (%)                      ROP   rate of penetration (m/hr)
//   MWIN  mud weight in (kg/m3)              ECD   ECD at the bit (kg/m3)
//
// Curves carry provenance (engine wellsite-studio, pipeline
// ws-evidence-1.x, the live well, the d-exponent settings); a republish
// replaces only this live well's own curves. Pore Pressure Studio turns
// MWIN or ECD into "mud weight used" calibration points through its own
// import door (mudWeightTable writes the table that door reads, with the
// units in its header). Kept free of both apps' imports. Pure.

export const WS_EVIDENCE_ENGINE = 'wellsite-studio';
export const WS_EVIDENCE_PIPELINE = 'ws-evidence-1.0.0';
export const WS_EVIDENCE_MAJOR = /^ws-evidence-1\./;
export const EVIDENCE_CURVES = Object.freeze([
  { mnemonic: 'DXC', unit: '', description: 'Corrected d-exponent (Rehm and McClendon)' },
  { mnemonic: 'DEXP', unit: '', description: 'd-exponent (Jorden and Shirley)' },
  { mnemonic: 'TGAS', unit: '%', description: 'Total gas' },
  { mnemonic: 'ROP', unit: 'm/hr', description: 'Rate of penetration' },
  { mnemonic: 'MWIN', unit: 'kg/m3', description: 'Mud weight in' },
  { mnemonic: 'ECD', unit: 'kg/m3', description: 'ECD at the bit' },
]);

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };

/**
 * Depth points to the regular MD grid a registry curve needs: the typical
 * spacing as the step, linear interpolation between neighbours, and a null
 * wherever the neighbours are more than three steps apart (a gap stays a gap).
 * @param {{mdM:number, v:number}[]} points
 */
export function regularGrid(points) {
  const byMd = new Map();
  for (const p of points || []) if (Number.isFinite(p.mdM) && Number.isFinite(p.v)) byMd.set(Number(p.mdM.toFixed(4)), p.v);
  const pts = [...byMd.entries()].map(([mdM, v]) => ({ mdM, v })).sort((a, b) => a.mdM - b.mdM);
  if (pts.length < 2) return null;
  const diffs = [];
  for (let i = 1; i < pts.length; i += 1) diffs.push(pts[i].mdM - pts[i - 1].mdM);
  const step = Number(median(diffs).toFixed(4));
  if (!(step > 0)) return null;
  const start = pts[0].mdM;
  const count = Math.floor((pts[pts.length - 1].mdM - start) / step + 1e-6) + 1;
  if (count > 200000) return null;
  const data = new Float32Array(count);
  let j = 0; let nullCount = 0;
  for (let k = 0; k < count; k += 1) {
    const md = start + k * step;
    while (j < pts.length - 2 && pts[j + 1].mdM < md - 1e-9) j += 1;
    const a = pts[j]; const b = pts[Math.min(j + 1, pts.length - 1)];
    let v = NaN;
    if (Math.abs(a.mdM - md) < 1e-6) v = a.v;
    else if (Math.abs(b.mdM - md) < 1e-6) v = b.v;
    else if (md > a.mdM && md < b.mdM && b.mdM - a.mdM <= 3 * step + 1e-9) v = a.v + ((md - a.mdM) / (b.mdM - a.mdM)) * (b.v - a.v);
    data[k] = v;
    if (!Number.isFinite(v)) nullCount += 1;
  }
  return { startMdM: start, stepM: step, stopMdM: start + (count - 1) * step, nSamples: count, nullCount, data };
}

/**
 * The curves a live well publishes, in the registry's prepared-log shape.
 * @param {Object} p { points (mudlog series points), dxcRows (dExponentSeries rows), wsWell: {id, name}, settings (d-exponent settings or null), at }
 */
export function prepareEvidenceLogs({ points = [], dxcRows = [], wsWell, settings = null, at = new Date().toISOString() }) {
  const series = {
    DXC: dxcRows.filter((r) => r.dc != null).map((r) => ({ mdM: r.mdM, v: r.dc })),
    DEXP: dxcRows.map((r) => ({ mdM: r.mdM, v: r.d })),
    TGAS: points.filter((p) => Number.isFinite(p.values.total_gas)).map((p) => ({ mdM: p.mdM, v: p.values.total_gas })),
    ROP: points.filter((p) => Number.isFinite(p.values.rop)).map((p) => ({ mdM: p.mdM, v: p.values.rop })),
    MWIN: points.filter((p) => Number.isFinite(p.values.mw)).map((p) => ({ mdM: p.mdM, v: p.values.mw })),
    ECD: points.filter((p) => Number.isFinite(p.values.ecd)).map((p) => ({ mdM: p.mdM, v: p.values.ecd })),
  };
  const out = [];
  for (const c of EVIDENCE_CURVES) {
    const grid = regularGrid(series[c.mnemonic]);
    if (!grid) continue;
    out.push({
      mnemonic: c.mnemonic, description: `${c.description}, Wellsite Studio live well ${wsWell.name}`, unit: c.unit, ...grid,
      provenance: {
        computed: true, engine: WS_EVIDENCE_ENGINE, pipeline_version: WS_EVIDENCE_PIPELINE, ws_well_id: wsWell.id, ws_well_name: wsWell.name, published_at: at,
        source_points: series[c.mnemonic].length, index: 'MD below KB',
        ...(c.mnemonic === 'DXC' && settings ? { normal_mud_weight_kg_m3: settings.normalMwKgM3, normal_declared: `${settings.normalValue} ${settings.normalUnit}`, trend_from_md_m: settings.trendFromMdM ?? null, trend_to_md_m: settings.trendToMdM ?? null } : {}),
      },
    });
  }
  return out;
}

/** Is this registry log a curve a Wellsite live well published? */
export const isWellsiteEvidence = (log) => !!(log && log.provenance && log.provenance.engine === WS_EVIDENCE_ENGINE && WS_EVIDENCE_MAJOR.test(String(log.provenance.pipeline_version || '')));

/** The registry curves a republish replaces: this live well's own, of the mnemonics going out. */
export function staleEvidence(existingLogs, prepared, wsWellId) {
  const m = new Set(prepared.map((l) => l.mnemonic));
  return (existingLogs || []).filter((l) => isWellsiteEvidence(l) && l.provenance.ws_well_id === wsWellId && m.has(String(l.mnemonic).toUpperCase()));
}

/** The latest Wellsite evidence curve per mnemonic on a registry well (rows arrive oldest first). */
export function pickEvidence(logs) {
  const out = {};
  for (const l of logs || []) if (isWellsiteEvidence(l)) out[String(l.mnemonic).toUpperCase()] = l;
  return out;
}

/**
 * A mud weight curve as the table Pore Pressure Studio's calibration door
 * reads: one row each time the mud weight changes by `minChange` kg/m3, and
 * at least one every `everyM` metres, units in the header.
 */
export function mudWeightTable(log, values, { minChange = 10, everyM = 150, maxRows = 80 } = {}) {
  const rows = [];
  let lastV = null; let lastMd = -Infinity;
  for (let i = 0; i < log.n_samples; i += 1) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const md = log.start_md_m + i * log.step_m;
    if (lastV == null || Math.abs(v - lastV) >= minChange || md - lastMd >= everyM) { rows.push([md, v]); lastV = v; lastMd = md; }
  }
  const step = Math.max(1, Math.ceil(rows.length / maxRows));
  const kept = rows.filter((_, i) => i % step === 0 || i === rows.length - 1);
  return { text: ['MD (m),Mud weight (kg/m3)', ...kept.map(([md, v]) => `${md.toFixed(1)},${v.toFixed(1)}`)].join('\n'), rows: kept.length, from: kept.length ? kept[0][0] : null, to: kept.length ? kept[kept.length - 1][0] : null };
}

/** One line on what Wellsite evidence a registry well carries (null when none). */
export function evidenceText(logs) {
  const e = pickEvidence(logs);
  const names = Object.keys(e);
  if (!names.length) return null;
  const any = e[names[0]].provenance;
  return `Wellsite Studio live well ${any.ws_well_name || ''} published ${names.join(', ')} on ${String(any.published_at).slice(0, 10)}. They are registry curves: open them beside the prognosis in Well Data Manager or Petrophysics.`.replace('  ', ' ');
}
