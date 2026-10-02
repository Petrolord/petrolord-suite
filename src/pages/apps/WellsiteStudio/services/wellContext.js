// The depth context of a well for the engine (depth.js): elevations and the
// survey snapshot the rig calculates TVD with. KB comes from the registry
// row at well creation and lives in ws_wells.header with the fields the
// registry lacks (GL, RT offset). Pure.

export function wellContext(well) {
  const h = (well && well.header) || {};
  const kb = Number.isFinite(h.kb_elev_m) ? h.kb_elev_m : (Number.isFinite(well?.kb_m) ? well.kb_m : null);
  const ctx = { kbElevM: kb };
  if (Number.isFinite(h.gl_elev_m)) ctx.glElevM = h.gl_elev_m;
  if (Number.isFinite(h.rt_offset_m)) ctx.rtElevM = kb + h.rt_offset_m;
  const s = well && well.survey;
  ctx.survey = s && Array.isArray(s.stations) && s.stations.length >= 2 ? { stations: s.stations, version: s.version || 'v1', method: s.method || 'minimum_curvature' } : null;
  return ctx;
}

export function offsetMinOf(well) {
  const v = well && well.settings && well.settings.rig_offset_min;
  return Number.isInteger(v) ? v : 0;
}

/**
 * The depth entry form a new entry starts from: the well's own default when an
 * administrator set one, otherwise the display unit (WS-U1-012: a metric user
 * was handed a feet entry form on every well without a default).
 */
export function defaultDepthEntry(well, fallbackUnit = 'ft') {
  const d = (well && well.settings && well.settings.default_depth) || {};
  return { unit: d.unit || fallbackUnit || 'ft', reference: d.reference || 'MD', datum: d.datum || 'RT' };
}

/**
 * Is the well's KB elevation one a subsea depth can rest on? The registry
 * stores 0 when no KB was entered (WS-U1-010), and an offshore KB is 20 to
 * 40 m, so a zero is said rather than used silently.
 */
export function kbStatus(kbM) {
  if (!Number.isFinite(kbM)) return { ok: false, note: 'This well has no KB elevation. TVDSS and the offset comparison need one: enter KB in Well Data Manager.', enterHere: true };
  if (kbM === 0) return { ok: false, note: 'KB elevation is 0 m above MSL (the registry default when none was entered). TVDSS then equals TVD below KB; if the real KB is not 0, correct it in Well Data Manager before drilling.' };
  return { ok: true, note: '' };
}

export function tourConfigOf(well) {
  const s = (well && well.settings) || {};
  return {
    offsetMin: offsetMinOf(well),
    tourStartsLocal: s.tour_starts_local || ['06:00', '18:00'],
    reportDayStartLocal: s.report_day_start_local || '06:00',
  };
}
