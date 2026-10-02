// Surveys on the rig (upgrade U2-005, closes WS-U1-022). The live well was
// created with a snapshot of the registry survey, and every depth past its
// last station was extrapolated for the rest of the well. MWD stations are
// now recorded as they are taken:
//
//   observation 'survey_run'  stations {md, inc, azi} in metres and grid
//                             degrees, from a tie-in station down
//
// A run replaces the survey from its first station down and keeps what is
// above it, so a single new station is the run [last station, new
// station], and a corrected station is a run that starts above it. Runs
// apply in the order they were recorded (a later correction wins). The
// composite is then resolved through the Drilling module's shared
// trajectory resolver (well-planning/services/trajectorySource.js: an
// actual survey composite first, the registry survey when there is none)
// and listed with the shared minimum curvature survey table
// (computeActualTable). Records are ws_records rows: stored offline,
// queued, shared and packaged like the rest; any member can record one.
//
// Stored depths keep the survey version they were calculated with. With a
// new survey the screens recalculate TVD and subsea depth from the stored
// MD; a depth that was ENTERED as TVD or TVDSS is listed with the MD the
// current survey would give it (engine recalculate), never moved silently.
// Pure.

import { resolveTrajectory } from '@/pages/apps/well-planning/services/trajectorySource';
import { computeActualTable } from '@/pages/apps/well-planning/services/surveyUtils';
import { mdToTvd, recalculate, M_PER_FT } from '@/lib/wellsite/depth';
import { parseFieldNumber } from './units';
import { registrySurveySourceText, SURVEY_SOURCE } from '@/lib/wellsite/registrySurveySource';

export { SURVEY_SOURCE };

export const SURVEY_SUBTYPE = 'survey_run';
export const AZIMUTH_REFS = Object.freeze([
  { code: 'grid', name: 'grid north' },
  { code: 'true', name: 'true north (enter the convergence to grid)' },
  { code: 'magnetic', name: 'magnetic north (enter the total correction to grid)' },
]);

const usable = (st) => Array.isArray(st) && st.length >= 2;
const normAzi = (a) => ((a % 360) + 360) % 360;

/** Current run records (not superseded), in the order they were recorded. */
export function surveyRuns(records) {
  const runs = (records || []).filter((r) => r.subtype === SURVEY_SUBTYPE);
  const superseded = new Set(runs.map((r) => r.supersedes_id).filter(Boolean));
  return runs.filter((r) => !superseded.has(r.id) && r.payload && usable(r.payload.stations))
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || String(a.id).localeCompare(String(b.id)));
}

/** The composite of a base survey and runs applied in order: each run replaces everything from its first station down. */
export function compositeOf(baseStations, runs) {
  let out = usable(baseStations) ? baseStations.map((s) => ({ md: Number(s.md), inc: Number(s.inc), azi: Number(s.azi) })) : [];
  for (const run of runs) {
    const st = run.payload.stations;
    out = out.filter((s) => s.md < st[0].md - 1e-9).concat(st.map((s) => ({ md: s.md, inc: s.inc, azi: s.azi })));
  }
  return out;
}

/**
 * The survey in use for a well: the registry snapshot taken at creation
 * with the rig's runs applied, through the shared trajectory resolver.
 * @returns {{ survey: ?{stations, version, method, source}, source: 'actual'|'registry'|'none', label, runs: number, lastRun: ?Object }}
 */
export function activeSurvey(well, records) {
  const runs = surveyRuns(records);
  const base = well && well.survey && usable(well.survey.stations) ? well.survey : null;
  const composite = runs.length ? compositeOf(base ? base.stations : [], runs) : [];
  const resolved = resolveTrajectory({
    wellbore: { id: well ? well.id : null },
    surveys: usable(composite) ? [{ is_in_definitive: true, stations: composite }] : [],
    geoWell: base ? { name: well.name, deviation: base.stations } : null,
  });
  if (resolved.source === 'actual') {
    return {
      survey: { stations: resolved.stations, version: `rig-${runs.length}`, method: 'minimum_curvature', source: 'rig surveys' },
      source: 'actual', label: `Rig survey, ${runs.length} run(s), ${resolved.stations.length} stations`, runs: runs.length, lastRun: runs[runs.length - 1],
    };
  }
  if (resolved.source === 'registry') {
    return { survey: { stations: resolved.stations, version: base.version || 'registry-1', method: base.method || 'minimum_curvature', source: base.source || 'geo_wells.deviation' }, source: 'registry', label: `Registry survey taken when the live well was created, ${resolved.stations.length} stations`, runs: 0, lastRun: null };
  }
  return { survey: null, source: 'none', label: 'No survey: the well is treated as vertical', runs: 0, lastRun: null };
}

/** The well with the survey in use in place of its creation snapshot (what every depth calculation reads). */
export function wellWithSurvey(well, records) {
  if (!well) return well;
  const a = activeSurvey(well, records);
  return a.source === 'actual' ? { ...well, survey: a.survey } : well;
}

/**
 * Pasted or imported stations: MD, inclination, azimuth in the first three
 * numeric columns, any separator, comma decimals, an optional header line
 * (its MD unit, when written, is returned as a guess only).
 */
export function parseStationTable(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map((l, i) => ({ text: l.trim(), line: i + 1 })).filter((l) => l.text && !/^(#|\/\/|~)/.test(l.text));
  if (!lines.length) throw new Error('No stations were given.');
  const semis = lines.some((l) => l.text.includes(';'));
  const tabs = lines.some((l) => l.text.includes('\t'));
  const split = (t) => (semis ? t.split(';') : tabs ? t.split('\t') : /,\s*\d/.test(t) && !/\d\s+\d/.test(t) && !/\d,\d+\s/.test(t) ? t.split(',') : t.split(/\s+/)).map((c) => c.trim()).filter((c) => c !== '');
  const num = (c) => { const v = parseFieldNumber(c); return Number.isFinite(v) ? v : NaN; };
  const stations = []; const skipped = [];
  let unitGuess = null; let headerSeen = false;
  for (const l of lines) {
    const cells = split(l.text);
    const nums = cells.map(num);
    if (nums.slice(0, 3).some((v) => !Number.isFinite(v))) {
      if (!stations.length && !headerSeen && cells.some((c) => /[A-Za-z]/.test(c))) {
        headerSeen = true;
        const m = l.text.match(/\b(?:md|depth)\b[^A-Za-z]*\(?\s*(ft|feet|m|metres|meters)\b/i);
        if (m) unitGuess = /^f/i.test(m[1]) ? 'ft' : 'm';
        continue;
      }
      skipped.push({ line: l.line, text: l.text.slice(0, 80), reason: cells.length < 3 ? 'fewer than three values (MD, inclination, azimuth)' : 'a value is not a number' });
      continue;
    }
    stations.push({ line: l.line, md: nums[0], inc: nums[1], azi: nums[2] });
  }
  return { stations, skipped, unitGuess };
}

/**
 * A run ready to record: stations to metres and grid azimuth, checked, tied in to the survey in use.
 * @param {Object} p { stations:[{md,inc,azi}], mdUnit, azimuthRef, gridCorrectionDeg, current: stations in use, source }
 */
export function buildRun({ stations, mdUnit, azimuthRef, gridCorrectionDeg = 0, current = [], source = 'manual', note = null }) {
  if (!['m', 'ft'].includes(mdUnit)) throw new Error('Declare the unit of the measured depths (m or ft).');
  if (!AZIMUTH_REFS.some((r) => r.code === azimuthRef)) throw new Error('Declare what the azimuths are measured from (grid, true or magnetic north).');
  const corr = azimuthRef === 'grid' ? 0 : Number(gridCorrectionDeg);
  if (!Number.isFinite(corr)) throw new Error('Enter the correction from the azimuths as given to grid north, in degrees.');
  if (!Array.isArray(stations) || !stations.length) throw new Error('Enter at least one station.');
  const f = mdUnit === 'ft' ? M_PER_FT : 1;
  const out = [];
  stations.forEach((s, i) => {
    const where = s.line ? `Line ${s.line}` : `Station ${i + 1}`;
    if (![s.md, s.inc, s.azi].every(Number.isFinite)) throw new Error(`${where}: MD, inclination and azimuth must be numbers.`);
    if (s.md < 0) throw new Error(`${where}: MD ${s.md} is negative.`);
    if (s.inc < 0 || s.inc > 180) throw new Error(`${where}: inclination ${s.inc} is outside 0 to 180 degrees.`);
    if (s.azi < -360 || s.azi > 720) throw new Error(`${where}: azimuth ${s.azi} is not a compass bearing.`);
    const md = s.md * f;
    if (out.length && !(md > out[out.length - 1].md)) throw new Error(`${where}: MD ${s.md} ${mdUnit} does not increase (the station before is at ${stations[i - 1].md} ${mdUnit}).`);
    out.push({ md: Number(md.toFixed(4)), inc: s.inc, azi: Number(normAzi(s.azi + corr).toFixed(4)) });
  });
  if (out[out.length - 1].md > 15000) throw new Error(`The deepest station is at ${stations[stations.length - 1].md} ${mdUnit}, beyond 15,000 m. Check the declared unit.`);
  const cur = usable(current) ? current : [];
  const last = cur.length ? cur[cur.length - 1] : null;
  let tieIn = null;
  let replaced = 0;
  if (last && out[0].md > last.md + 1e-9) {
    // below the survey in use: tie in at its last station
    tieIn = { md: last.md, inc: last.inc, azi: last.azi };
    out.unshift(tieIn);
  } else if (cur.length) {
    replaced = cur.filter((s) => s.md >= out[0].md - 1e-9).length;
  }
  if (out.length < 2) throw new Error('A first survey needs at least two stations (a surface station at MD 0 and one below it).');
  const added = out.length - (tieIn ? 1 : 0);
  const text = `Survey run: ${added} station(s) from ${out[tieIn ? 1 : 0].md.toFixed(1)} to ${out[out.length - 1].md.toFixed(1)} m MD${replaced ? `, replacing ${replaced} earlier station(s) from ${out[0].md.toFixed(1)} m down` : ''}; azimuths from ${azimuthRef} north${corr ? `, corrected ${corr} degrees to grid` : ''}.`;
  return {
    kind: 'observation', subtype: SURVEY_SUBTYPE,
    depth: { value: out[out.length - 1].md, unit: 'm', reference: 'MD', datum: 'KB', kind: 'logged' },
    payload: { text, stations: out, tie_in: tieIn, replaced, added, md_unit_entered: mdUnit, azimuth_ref: azimuthRef, grid_correction_deg: corr, source, note },
  };
}

/** A run in words, in the depth unit of the view (the stored text is in metres, the unit of the record). */
export function runText(payload, fmt = (m) => `${m.toFixed(1)} m`) {
  const st = payload.stations; const first = st[payload.tie_in ? 1 : 0];
  return `Survey run: ${payload.added} station(s) from ${fmt(first.md)} to ${fmt(st[st.length - 1].md)} MD${payload.replaced ? `, replacing ${payload.replaced} earlier station(s) from ${fmt(st[0].md)} down` : ''}.`;
}

/** The survey listing through the shared minimum curvature table (TVD, TVDSS, north, east, dogleg severity). */
export function surveyListing(stations, kbM) {
  if (!usable(stations)) return [];
  return computeActualTable(stations, { kbM: Number.isFinite(kbM) ? kbM : 0 }) || [];
}

/**
 * Stored depths against the survey in use (PL4, PL5): rows calculated with
 * another survey version, what their TVD is now, and, for rows entered as
 * TVD or TVDSS, the MD the current survey gives them.
 */
export function staleDepths(rows, ctx) {
  const current = (ctx && ctx.survey && ctx.survey.version) || null;
  const out = [];
  for (const r of rows || []) {
    if (!Number.isFinite(r.md_calc_m)) continue;
    if ((r.survey_version || null) === current) continue;
    const now = mdToTvd(r.md_calc_m, ctx);
    const item = { id: r.id, subtype: r.subtype || r.role || 'record', name: r.name || null, mdM: r.md_calc_m, storedTvdM: r.tvd_calc_m, tvdNowM: now.tvdM, tvdDiffM: Number.isFinite(r.tvd_calc_m) ? now.tvdM - r.tvd_calc_m : null, storedVersion: r.survey_version || null, enteredAs: r.depth_ref, mdNowM: null, mdDiffM: null, note: '' };
    if (r.depth_ref === 'TVD' || r.depth_ref === 'TVDSS') {
      const rec = recalculate({ original: { value: r.depth_value, unit: r.depth_unit, reference: r.depth_ref, datum: r.depth_datum, kind: r.depth_kind }, calculated: { surveyVersion: r.survey_version } }, ctx);
      if (rec.ok) { item.mdNowM = rec.mdM; item.mdDiffM = rec.mdM - r.md_calc_m; } else item.note = rec.errors[0];
    }
    out.push(item);
  }
  const maxTvd = out.reduce((m, x) => Math.max(m, Math.abs(x.tvdDiffM || 0)), 0);
  const moved = out.filter((x) => Number.isFinite(x.mdDiffM) && Math.abs(x.mdDiffM) > 0.05);
  return { rows: out, count: out.length, maxTvdDiffM: maxTvd, moved, currentVersion: current };
}

// ---- U2-009: the rig survey to the shared wells registry (closes Well Data Manager U2-009) ----

export const SURVEY_PUBLISHED_SUBTYPE = 'survey_published';

const sameStations = (a, b) => a.length === b.length && a.every((s, i) => Math.abs(s.md - b[i].md) < 1e-6 && Math.abs(s.inc - b[i].inc) < 1e-9 && Math.abs(s.azi - b[i].azi) < 1e-9);

/**
 * What sending the survey in use to the registry would do. Only a rig
 * survey is offered (the snapshot came from the registry in the first
 * place), and only to the registry well's owner.
 * @param {Object} p { well, inUse (activeSurvey), registryWell: {id, name, deviation, ownedByMe}, user }
 */
export function registrySurveyPlan({ well, inUse, registryWell, user = null, at = new Date().toISOString() }) {
  const reg = registryWell && Array.isArray(registryWell.deviation) ? registryWell.deviation : [];
  const base = { can: false, reason: '', lines: [], stations: [], provenance: null, registryStations: reg.length };
  if (!registryWell) return { ...base, reason: 'The registry well could not be read.' };
  if (!inUse || inUse.source !== 'actual') return { ...base, reason: 'No rig survey has been recorded: the survey in use is the one the registry already holds.' };
  const stations = inUse.survey.stations.map((s) => ({ md: s.md, inc: s.inc, azi: s.azi }));
  if (sameStations(stations, reg)) return { ...base, reason: `The registry already holds this survey (${reg.length} stations).` };
  if (!registryWell.ownedByMe) return { ...base, stations, reason: 'Only the owner of the registry well can update its survey (org sharing is read-only). Ask the owner to open this view and send it.' };
  const td = (st) => (st.length ? st[st.length - 1].md : null);
  const provenance = {
    source: SURVEY_SOURCE, ws_well_id: well.id, ws_well_name: well.name, survey_version: inUse.survey.version, runs: inUse.runs, stations: stations.length, td_md_m: td(stations),
    method: 'minimum_curvature', azimuth_reference: 'grid', published_at: at, published_by: user ? user.name || user.email || user.id : null,
    previous: { stations: reg.length, td_md_m: td(reg) },
  };
  const lines = [
    `The registry holds ${reg.length ? `${reg.length} station(s) to ${td(reg).toFixed(1)} m MD` : 'no survey'}.`,
    `The rig survey in use (${inUse.survey.version}, ${inUse.runs} run(s)) holds ${stations.length} station(s) to ${td(stations).toFixed(1)} m MD.`,
    'Sending it replaces the registry survey for every app that reads this well (Well Data Manager, Well Correlation, Petrophysics, Seismolord, the Drilling studios).',
  ];
  return { can: true, reason: '', lines, stations, provenance, registryStations: reg.length };
}

/** The record of a survey sent to the registry (shared with every device on the well). */
export function surveyPublishedParams(plan, geoWellId) {
  const p = plan.provenance;
  return {
    kind: 'observation', subtype: SURVEY_PUBLISHED_SUBTYPE,
    payload: { ...p, geo_well_id: geoWellId, text: `Survey ${p.survey_version} sent to the well registry: ${p.stations} station(s) to ${p.td_md_m.toFixed(1)} m MD, replacing ${p.previous.stations} station(s).` },
  };
}

export { registrySurveySourceText };
