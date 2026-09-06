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

export function defaultDepthEntry(well) {
  const d = (well && well.settings && well.settings.default_depth) || {};
  return { unit: d.unit || 'ft', reference: d.reference || 'MD', datum: d.datum || 'RT' };
}

export function tourConfigOf(well) {
  const s = (well && well.settings) || {};
  return {
    offsetMin: offsetMinOf(well),
    tourStartsLocal: s.tour_starts_local || ['06:00', '18:00'],
    reportDayStartLocal: s.report_day_start_local || '06:00',
  };
}
