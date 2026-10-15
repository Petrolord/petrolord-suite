// Maps from volumes (QI upgrade P1.5, 2026-10-15): the browser side of the
// seismic worker's zone_maps job. Which of the study's volumes can be mapped
// (stacks, inversion products, uncertainty triples, property and facies
// probability volumes), the map products each offers (property maps, zone
// statistics, confidence maps from the Q10 to Q90 spread, facies probability
// maps), the job's settings, and the words and units each map carries into
// the shared surface registry. Pure.

export const FAMILY_LABEL = {
  seismic: 'Seismic',
  value: 'Volume',
  triple: 'Q10, Q50 and Q90',
  probability: 'Facies probability',
  avo: 'AVO classes',
};

const isUuidish = (v) => typeof v === 'string' && v.length > 0;

/**
 * The volumes a study can map, each with the stack whose lattice and
 * horizons it shares (seismicId). Uncertainty runs come as one triple.
 * @returns {Array<{key, family, name, seismicId, ids: Object<string,string>, unit, kind?}>}
 */
export function mapInputs(project, volumes = []) {
  const out = [];
  const has = (id) => isUuidish(id);
  for (const v of volumes.filter((x) => (project.volumeIds || []).includes(x.id))) {
    out.push({ key: `seismic:${v.id}`, family: 'seismic', name: v.name, seismicId: v.id, ids: { value: v.id }, unit: 'amplitude' });
  }
  for (const [seismicId, rec] of Object.entries(project.inversion || {})) {
    for (const r of rec.runs || []) {
      if (r.status !== 'ready') continue;
      if (r.volumeIds?.q10 && r.volumeIds?.q50 && r.volumeIds?.q90) {
        out.push({ key: `inv3:${r.jobId}`, family: 'triple', name: r.name, seismicId, ids: { q10: r.volumeIds.q10, q50: r.volumeIds.q50, q90: r.volumeIds.q90 }, unit: 'AI', kind: 'impedance' });
      } else if (has(r.volumeId)) {
        out.push({ key: `inv:${r.jobId}`, family: 'value', name: r.name, seismicId, ids: { value: r.volumeId }, unit: r.method === 'coloured' ? 'relative AI' : 'AI', kind: 'impedance' });
      }
    }
  }
  for (const r of project.simultaneous?.runs || []) {
    if (r.status !== 'ready' || !r.volumeIds) continue;
    for (const [k, label, unit] of [['ai', 'AI', 'AI'], ['si', 'SI', 'SI'], ['rho', 'density', 'g/cc'], ['vpvs', 'Vp/Vs', 'ratio']]) {
      if (has(r.volumeIds[k])) out.push({ key: `sim:${r.jobId}:${k}`, family: 'value', name: `${r.name}: ${label}`, seismicId: r.firstVolumeId, ids: { value: r.volumeIds[k] }, unit, kind: k });
    }
  }
  // QI upgrade P2.10: AVO runs, each product a volume, and A with B for class maps
  for (const r of project.avo?.runs || []) {
    if (r.status !== 'ready' || !r.volumeIds) continue;
    const seismicId = r.stacks?.[0]?.volumeId;
    for (const [k, id] of Object.entries(r.volumeIds)) {
      if (k === 'class' || !has(id)) continue;
      out.push({ key: `avo:${r.jobId}:${k}`, family: 'value', name: `${r.name}: ${k}`, seismicId, ids: { value: id }, unit: r.calibration ? 'reflectivity' : 'amplitude', kind: 'avo' });
    }
    if (has(r.volumeIds.A) && has(r.volumeIds.B)) {
      const scale = r.calibration ? 1 : project.avo?.wells?.runJobId === r.jobId ? project.avo.wells.scale : null;
      out.push({ key: `avoAB:${r.jobId}`, family: 'avo', name: `${r.name}: intercept and gradient`, seismicId, ids: { a: r.volumeIds.A, b: r.volumeIds.B }, unit: 'class', kind: 'avo', calibrated: !!r.calibration, scale });
    }
  }
  for (const [aiId, rec] of Object.entries(project.properties || {})) {
    const seismicId = seismicOfImpedance(project, aiId);
    for (const kind of Object.keys(rec || {})) {
      const faciesNames = rec[kind]?.calibration?.result?.settings?.names || {};
      for (const r of rec[kind]?.runs || []) {
        if (r.status !== 'ready' || !r.volumeIds) continue;
        if (r.volumeIds.q10 && r.volumeIds.q50 && r.volumeIds.q90) {
          out.push({ key: `prop3:${r.jobId}`, family: 'triple', name: r.name, seismicId, ids: { q10: r.volumeIds.q10, q50: r.volumeIds.q50, q90: r.volumeIds.q90 }, unit: 'fraction', kind });
        }
        for (const [k, id] of Object.entries(r.volumeIds)) {
          if (k.startsWith('p:')) out.push({ key: `prob:${r.jobId}:${k}`, family: 'probability', name: `${r.name}: probability of ${faciesNames[k.slice(2)] || `facies ${k.slice(2)}`}`, seismicId, ids: { value: id }, unit: 'probability', kind: 'facies' });
        }
      }
    }
  }
  return out.filter((x) => x.seismicId);
}

/** The stack an impedance volume was inverted from (post-stack run or simultaneous AI). */
export function seismicOfImpedance(project, aiId) {
  for (const [seismicId, rec] of Object.entries(project.inversion || {})) {
    for (const r of rec.runs || []) if (r.volumeId === aiId || Object.values(r.volumeIds || {}).includes(aiId)) return seismicId;
  }
  for (const r of project.simultaneous?.runs || []) if (r.volumeIds?.ai === aiId) return r.firstVolumeId;
  return null;
}

/** The products an input offers: [{key, label, kind, stat?, needsCutoff?, defaultOn}] (key is unique per input). */
export function productChoices(input) {
  if (!input) return [];
  if (input.family === 'triple') {
    return [
      { key: 'q50_mean', label: 'Property map: zone mean of Q50', kind: 'stat', input: 'q50', stat: 'mean', defaultOn: true },
      { key: 'spread', label: 'Confidence map: zone mean of Q90 minus Q10 (narrower is more confident)', kind: 'spread', defaultOn: true },
      { key: 'rel_spread', label: 'Relative spread: zone mean of (Q90 minus Q10) / Q50', kind: 'spread', relative: true, defaultOn: false },
      { key: 'q10_mean', label: 'Zone mean of Q10', kind: 'stat', input: 'q10', stat: 'mean', defaultOn: false },
      { key: 'q90_mean', label: 'Zone mean of Q90', kind: 'stat', input: 'q90', stat: 'mean', defaultOn: false },
      { key: 'q50_frac', label: 'Share of the zone where Q50 is beyond the cutoff', kind: 'stat', input: 'q50', stat: 'frac', needsCutoff: true, defaultOn: false },
    ];
  }
  if (input.family === 'avo') {
    return [{ key: 'avo_class', label: input.calibrated ? 'AVO class map: the class (I to IV) of the zone means of A and B' : 'AVO class map: the class (I to IV) of the zone means of A and B, taken to reflectivity by the wells\' scale', kind: 'avo_class', defaultOn: true }];
  }
  if (input.family === 'probability') {
    return [
      { key: 'p_mean', label: 'Probability map: zone mean probability (the expected share of the zone)', kind: 'stat', input: 'value', stat: 'mean', defaultOn: true },
      { key: 'p_max', label: 'Highest probability in the zone', kind: 'stat', input: 'value', stat: 'max', defaultOn: false },
      { key: 'p_frac', label: 'Share of the zone where the probability is over the cutoff', kind: 'stat', input: 'value', stat: 'frac', needsCutoff: true, cutoff: 0.5, defaultOn: false },
    ];
  }
  return [
    { key: 'mean', label: 'Zone mean', kind: 'stat', input: 'value', stat: 'mean', defaultOn: true },
    { key: 'rms', label: 'Zone RMS', kind: 'stat', input: 'value', stat: 'rms', defaultOn: input.family === 'seismic' },
    { key: 'min', label: 'Zone minimum', kind: 'stat', input: 'value', stat: 'min', defaultOn: false },
    { key: 'max', label: 'Zone maximum', kind: 'stat', input: 'value', stat: 'max', defaultOn: false },
    { key: 'frac', label: 'Share of the zone beyond the cutoff', kind: 'stat', input: 'value', stat: 'frac', needsCutoff: true, defaultOn: false },
  ];
}

/** Why the choices cannot run, or null. */
export function zoneMapProblem({ input, picked, zone, cutoffs = {} }) {
  if (!input) return 'Choose a volume to map.';
  if (input.family === 'avo' && !(Number.isFinite(input.scale) && input.scale !== 0)) return 'Compare this AVO run at the wells first (AVO tab), or compute it calibrated: the class needs A and B in reflectivity.';
  if (!picked?.length) return 'Tick at least one map.';
  if (!zone?.topId) return 'Choose the top horizon of the zone.';
  if (zone.mode === 'base') {
    if (!zone.baseId) return 'Choose the base horizon, or map a window below the top.';
    if (zone.baseId === zone.topId) return 'Choose a base horizon other than the top.';
  } else if (String(zone.windowMs ?? '').trim() === '' || !(Number(zone.windowMs) > 0 && Number(zone.windowMs) <= 2000)) return 'Give the window below the top, 1 to 2000 ms.';
  const choices = productChoices(input);
  for (const k of picked) {
    const c = choices.find((x) => x.key === k);
    if (!c) return 'Unknown map.';
    if (c.needsCutoff && (String(cutoffs[k] ?? c.cutoff ?? '').trim() === '' || !Number.isFinite(Number(cutoffs[k] ?? c.cutoff)))) return `Give the cutoff for "${c.label}".`;
  }
  return null;
}

/** The zone_maps job's settings. */
export function zoneMapParams({ input, picked, zone, cutoffs = {}, above = {}, name = '' }) {
  const choices = productChoices(input);
  const volumeIds = [];
  const idx = (role) => {
    const id = input.ids[role];
    let i = volumeIds.indexOf(id);
    if (i < 0) { volumeIds.push(id); i = volumeIds.length - 1; }
    return i;
  };
  const products = picked.map((k) => {
    const c = choices.find((x) => x.key === k);
    if (c.kind === 'spread') return { key: k, kind: 'spread', q10: idx('q10'), q50: idx('q50'), q90: idx('q90'), ...(c.relative ? { relative: true } : {}) };
    if (c.kind === 'avo_class') return { key: k, kind: 'avo_class', a: idx('a'), b: idx('b'), scale: input.scale };
    return { key: k, kind: 'stat', input: idx(c.input), stat: c.stat, ...(c.needsCutoff ? { cutoff: Number(cutoffs[k] ?? c.cutoff), above: above[k] !== false } : {}) };
  });
  return {
    volume_ids: volumeIds,
    top_horizon_id: zone.topId,
    ...(zone.mode === 'base' ? { base_horizon_id: zone.baseId } : { window_ms: Number(zone.windowMs) }),
    products,
    name: name || `${input.name} zone maps`,
  };
}

/** The unit and the words of one map, for the surface registry and the report. */
export function zoneMapLabel(input, product, zoneText) {
  const c = productChoices(input).find((x) => x.key === product.key) || {};
  const frac = product.stat === 'frac';
  const unit = product.kind === 'avo_class' ? 'class (1 I, 2 II, 3 III, 4 IV)' : product.kind === 'spread' ? (product.relative ? 'ratio' : input.unit) : frac ? 'fraction' : input.unit;
  const cut = frac ? ` (${product.above === false ? 'below' : 'above'} ${product.cutoff})` : '';
  return {
    unit,
    name: `${input.name}: ${shortLabel(c, product)}${cut}, ${zoneText}`,
    qiClass: product.kind === 'avo_class' ? 'interpretation' : input.family === 'seismic' ? 'elastic_estimate' : input.kind === 'facies' || input.family === 'probability' ? 'calibrated_prediction' : input.kind === 'impedance' || ['ai', 'si', 'rho', 'vpvs'].includes(input.kind) ? 'elastic_estimate' : 'calibrated_prediction',
  };
}

function shortLabel(c, product) {
  if (product.kind === 'spread') return product.relative ? 'relative spread' : 'confidence (Q90 minus Q10)';
  if (product.kind === 'avo_class') return 'AVO class';
  return {
    q50_mean: 'Q50 mean', q10_mean: 'Q10 mean', q90_mean: 'Q90 mean', q50_frac: 'Q50 share beyond cutoff',
    p_mean: 'mean probability', p_max: 'highest probability', p_frac: 'share with probability over cutoff',
    mean: 'zone mean', rms: 'zone RMS', min: 'zone minimum', max: 'zone maximum', frac: 'share beyond cutoff',
  }[product.key] || c.label || product.key;
}

/** The zone in words. */
export function zoneText(zone, horizons = []) {
  const n = (id) => horizons.find((h) => h.id === id)?.name || 'a horizon';
  return zone.mode === 'base' ? `${n(zone.topId)} to ${n(zone.baseId)}` : `${n(zone.topId)} plus ${zone.windowMs} ms`;
}
