// The angle gather Rock Physics Studio publishes for other apps to show
// (AppUpgrade RP-U2-012, 2026-10-01; the second half of Seismolord U2-020).
//
// CONTRACT `rock-physics-gather`, version 1. Rock Physics writes the
// payload into its own project row: rp_projects.avo.published_gathers[well_id]
// (one per well, since 2026-10-09) and avo.published_gather (the latest, as
// before), in an existing jsonb column (owner-only RLS, no schema change). A reader finds
// the newest project of the signed-in user whose well_ids holds the well
// and reads the payload through readGather, which refuses anything it does
// not understand. The payload is self-contained: a reader draws it without
// the Rock Physics engines and without the well's logs.
//
//   {
//     contract: 'rock-physics-gather', version: 1,
//     published_at: ISO time, engine: 'rock-physics-studio',
//     well_id, well_name,
//     zone: { name, top_md_m, base_md_m },      // metres MD
//     pad_m,                                    // rock above and below the zone
//     dt_ms,                                    // two-way time sampling
//     angles_deg: number[],                     // one trace per angle
//     method: 'zoeppritz' | 'aki-richards',
//     wavelet: { source: 'ricker' | 'tie', freq_hz, phase_deg, label },
//     gain,                                     // largest |amplitude| over both cases
//     cases: [{
//       key: 'in-situ' | 'substituted', label,
//       traces: number[][],                     // [angle][time sample], reflection coefficients
//       top_sample, base_sample,                // the zone top and base on the time axis
//       picks: number[],                        // amplitude at the zone top per angle
//       intercept, gradient,                    // least squares on sin^2(theta) to 30 degrees
//     }],
//     vs_source: 'measured' | 'estimated', vp_source: 'measured' | 'estimated',
//     notes: string[]
//   }
//
// Time is two-way time from the top of the window, not absolute: the
// payload carries no time-depth relation, so a reader shows it beside its
// own synthetic and does not overlay it on seismic.
//
// Pure except loadGatherForWell (one read).

export const GATHER_CONTRACT = 'rock-physics-gather';
export const GATHER_CONTRACT_VERSION = 1;
export const MAX_GATHER_SAMPLES = 4000;
export const MAX_GATHER_ANGLES = 61;

const r6 = (v) => (Number.isFinite(v) ? Number(v.toPrecision(6)) : 0);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * The payload for a zone gather (Rock Physics services/gather.zoneGather).
 * @throws when the gather is too large to publish (the reason says what to change)
 */
export function packGather({ well, zone, gather, substitutedLabel, model, now = new Date(), pipelineVersion = null }) {
  if (!gather || gather.error) throw new Error(gather?.error || 'There is no gather to publish.');
  const nS = gather.inSitu.traces[0]?.length || 0;
  if (nS > MAX_GATHER_SAMPLES) throw new Error(`The gather has ${nS} time samples; at most ${MAX_GATHER_SAMPLES} can be published. Shorten the pad or coarsen the sampling.`);
  if (gather.angles.length > MAX_GATHER_ANGLES) throw new Error(`The gather has ${gather.angles.length} angles; at most ${MAX_GATHER_ANGLES} can be published.`);
  const one = (key, label, side) => ({
    key,
    label,
    traces: side.traces.map((tr) => Array.from(tr, r6)),
    top_sample: side.topSample,
    base_sample: side.baseSample,
    picks: side.picks.map(r6),
    intercept: side.fit ? r6(side.fit.a) : null,
    gradient: side.fit ? r6(side.fit.b) : null,
  });
  return {
    contract: GATHER_CONTRACT,
    version: GATHER_CONTRACT_VERSION,
    published_at: now.toISOString(),
    engine: 'rock-physics-studio',
    pipeline_version: pipelineVersion,
    well_id: well?.id || null,
    well_name: well?.name || null,
    zone: { name: zone.name, top_md_m: zone.top_md_m, base_md_m: zone.base_md_m },
    pad_m: gather.config.padM,
    dt_ms: gather.dtMs,
    angles_deg: [...gather.angles],
    method: gather.method,
    wavelet: { source: gather.wavelet.source, freq_hz: gather.wavelet.freqHz, phase_deg: gather.wavelet.phaseDeg, label: gather.wavelet.label },
    gain: r6(gather.gain),
    cases: [one('in-situ', 'In situ', gather.inSitu), ...(gather.substituted ? [one('substituted', substitutedLabel || 'Fluid substituted', gather.substituted)] : [])],
    vs_source: model?.vsSource === 'estimated' ? 'estimated' : 'measured',
    vp_source: model?.vpSource === 'estimated' ? 'estimated' : 'measured',
    notes: [...(gather.notes || [])],
  };
}

/**
 * Validate a payload. Nothing is assumed: a reader gets a gather it can
 * draw, or the reason it cannot.
 * @returns {{ok: true, gather: Object} | {ok: false, reason: string}}
 */
export function readGather(payload) {
  const bad = (reason) => ({ ok: false, reason });
  if (!payload || typeof payload !== 'object') return bad('No gather has been published.');
  if (payload.contract !== GATHER_CONTRACT) return bad('The stored object is not a Rock Physics gather.');
  if (payload.version !== GATHER_CONTRACT_VERSION) return bad(`This gather was published as contract version ${payload.version}; this reader knows version ${GATHER_CONTRACT_VERSION}. Publish it again from Rock Physics Studio.`);
  const angles = payload.angles_deg;
  if (!Array.isArray(angles) || !angles.length || angles.length > MAX_GATHER_ANGLES || !angles.every((a) => isNum(a) && a >= 0 && a < 90)) return bad('The gather has no usable angle list.');
  if (!isNum(payload.dt_ms) || !(payload.dt_ms > 0)) return bad('The gather has no time sampling.');
  if (!Array.isArray(payload.cases) || !payload.cases.length) return bad('The gather has no traces.');
  const cases = [];
  let nS = null;
  for (const c of payload.cases) {
    if (!c || !Array.isArray(c.traces) || c.traces.length !== angles.length) return bad('A gather case does not have one trace per angle.');
    for (const tr of c.traces) {
      if (!Array.isArray(tr) || !tr.length || tr.length > MAX_GATHER_SAMPLES || !tr.every(isNum)) return bad('A gather trace is empty, too long or not numeric.');
      if (nS === null) nS = tr.length;
    }
    if (!c.traces.every((tr) => tr.length === c.traces[0].length)) return bad('The traces of a gather case differ in length.');
    cases.push({
      key: c.key === 'substituted' ? 'substituted' : 'in-situ',
      label: String(c.label || (c.key === 'substituted' ? 'Fluid substituted' : 'In situ')),
      traces: c.traces,
      topSample: Number.isInteger(c.top_sample) ? c.top_sample : null,
      baseSample: Number.isInteger(c.base_sample) ? c.base_sample : null,
      picks: Array.isArray(c.picks) && c.picks.length === angles.length && c.picks.every(isNum) ? c.picks : null,
      intercept: isNum(c.intercept) ? c.intercept : null,
      gradient: isNum(c.gradient) ? c.gradient : null,
    });
  }
  let gain = isNum(payload.gain) && payload.gain > 0 ? payload.gain : 0;
  if (!gain) for (const c of cases) for (const tr of c.traces) for (const v of tr) gain = Math.max(gain, Math.abs(v));
  return {
    ok: true,
    gather: {
      wellId: payload.well_id || null,
      wellName: payload.well_name || null,
      zone: payload.zone && typeof payload.zone === 'object' ? { name: String(payload.zone.name || ''), top_md_m: payload.zone.top_md_m, base_md_m: payload.zone.base_md_m } : null,
      padM: isNum(payload.pad_m) ? payload.pad_m : null,
      dtMs: payload.dt_ms,
      angles,
      method: payload.method === 'aki-richards' ? 'aki-richards' : 'zoeppritz',
      wavelet: { label: String(payload.wavelet?.label || 'wavelet not recorded'), source: payload.wavelet?.source || null, freqHz: payload.wavelet?.freq_hz ?? null, phaseDeg: payload.wavelet?.phase_deg ?? null },
      gain,
      cases,
      vsSource: payload.vs_source === 'estimated' ? 'estimated' : 'measured',
      vpSource: payload.vp_source === 'estimated' ? 'estimated' : 'measured',
      notes: Array.isArray(payload.notes) ? payload.notes.map(String) : [],
      publishedAt: typeof payload.published_at === 'string' ? payload.published_at : null,
    },
  };
}

/** One line a reader shows above the picture. */
export function describeGather(g) {
  const est = [g.vpSource === 'estimated' ? 'Vp estimated' : null, g.vsSource === 'estimated' ? 'Vs estimated' : null].filter(Boolean);
  return [
    `Rock Physics angle gather${g.zone?.name ? ` of ${g.zone.name}` : ''}`,
    `${g.angles.length} angles to ${g.angles[g.angles.length - 1]} degrees`,
    g.method === 'zoeppritz' ? 'exact Zoeppritz' : 'Aki-Richards',
    g.wavelet.label,
    est.length ? est.join(', ') : null,
    g.publishedAt ? `published ${g.publishedAt.slice(0, 10)}` : null,
  ].filter(Boolean).join(' · ');
}

/**
 * The newest gather the signed-in user has published for a well.
 * @param {Object} supabase client
 * @returns {Promise<{ok: true, gather: Object} | {ok: false, reason: string}>}
 */
export async function loadGatherForWell(supabase, wellId) {
  if (!wellId) return { ok: false, reason: 'No well.' };
  const { data, error } = await supabase.from('rp_projects')
    .select('id, well_ids, avo, updated_at')
    .contains('well_ids', [wellId])
    .order('updated_at', { ascending: false })
    .limit(5);
  if (error) return { ok: false, reason: `Could not read Rock Physics projects: ${error.message}` };
  for (const row of data || []) {
    // this well's own gather first (one per well since 2026-10-09), then the
    // single gather older projects carry
    const p = row?.avo?.published_gathers?.[wellId] || row?.avo?.published_gather;
    if (p && (!p.well_id || p.well_id === wellId)) return readGather(p);
  }
  return { ok: false, reason: 'No gather has been published for this well.' };
}
