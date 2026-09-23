// Wave D8, wellsite domain: Episode 37, Wellsite Studio on Ekene-11.
// ============================================================================
// One report day on the Ekene Alpha platform rig: the first 12-1/4in bit of
// Ekene-11 drills the last of the Ogbia Shale, crosses the Ekene Sand top,
// shows oil above the contact and trips for a bit. Wellsite Studio has no
// file import, so the kit gives the tester what to type and what to replay:
//
//   * the setup sheet (live well, rig geometry and pump, settings, header,
//     sampling programme) in the app's own labels and units, with the rig
//     geometry DERIVED from the drilling domain's casing program and string;
//   * the shift log, time ordered, and at every row what the Lag panel shows,
//     computed through the Wellsite lag engine (the one the app calls);
//   * samples, descriptions and shows DERIVED from the kit's rock model at
//     Ekene-11 (the same facies, saturation and density the LAS files carry),
//     the descriptions in the live vocabulary, the show quality from the
//     shows engine;
//   * the prognosis as the registry holds it (01-wells/tops/Ekene-11-tops.csv,
//     the RBF structural truth) and the call at the drilling break.
//
// The gate that re-reads all of it through the app's own services is
// __tests__/domain.wellsite.test.js.
// ============================================================================

import fs from 'fs';
import path from 'path';

import { FRAME } from '../spine.mjs';
import { EKENE11 } from '../d8spine.mjs';
import { VSH_CUT } from '../build.mjs';
import { synthesiseWell, OIL_CONTACT_TVDSS } from '../rockmodel.mjs';
import { tvdAtMd } from '../geology.mjs';
import { DRILL_PIPE, HWDP, DRILL_COLLARS, CASING_QUICK } from '../../../packages/engines/engines/drilling/data/tubulars.js';
import { evaluateProgram } from '../../../packages/engines/engines/drilling/wellCost.js';
import { displacementFromField, flowRate } from '../../../packages/engines/engines/wellsite/pumps.js';
import { lagReadout, lagStrokesAt, arrivalPrediction } from '../../../packages/engines/engines/wellsite/lag.js';
import { scheduledDepths, validateProgramme, expectedArrivals } from '../../../packages/engines/engines/wellsite/sampleProgram.js';
import { ATTRIBUTES, resolveTerm, resolveColour, validateDescription } from '../../../packages/engines/engines/wellsite/descriptionVocabulary.js';
import { abbreviate } from '../../../packages/engines/engines/wellsite/abbreviations.js';
import { showSummary, showAbbrev, validateShow, SHOW_TABLES } from '../../../packages/engines/engines/wellsite/shows.js';
import { approachPanel } from '../../../packages/engines/engines/wellsite/tops.js';
import { toCanonicalMd, mdToTvd, M_PER_FT } from '../../../packages/engines/engines/wellsite/depth.js';
import { EVENT_TYPES } from '../../../packages/engines/engines/wellsite/events.js';
import { toRigLocal, fromRigLocal } from '../../../packages/engines/engines/wellsite/time.js';
import {
  DIR, DAY, RIG, PROGRAMME, PLAN, DESCRIBE, SILT_MAX, showFor, GAS, totalGasPct,
} from './wellsite/design.mjs';

const IN = 0.0254;
const MIN = 60000;

const q = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvQ = (headers, rows) => `${[headers, ...rows].map((r) => r.map(q).join(',')).join('\n')}\n`;

function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [keys, ...body] = rows;
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]])));
}

const round1 = (x) => Math.round(x * 10) / 10;
const m1 = (x) => `${x.toFixed(1)} m`;                       // the app's fmtDepth in metres
const eventName = (code) => EVENT_TYPES.find((e) => e.code === code).name;
/** The Lag panel's minutes (LagPanel fmtMin). */
const fmtMin = (m) => (m == null ? 'undefined' : m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
/** The approach panel's text as ApproachPanel renders it. */
const approachText = (t) => t.replace(/(\d+\.\d{2})\d+/g, '$1');

/** Typed text to the stored value, the Describe screen's rule (services/describe.js parseField). */
function typedToValue(key, text) {
  const a = ATTRIBUTES.find((x) => x.key === key);
  const t = String(text ?? '').trim();
  if (!t) return a.multi ? [] : null;
  if (key === 'percent') return Number(t);
  if (key === 'colour') return resolveColour(t);
  if (a.range || key === 'rounding') {
    const parts = t.split(/\s*(?:-|to)\s*/).filter(Boolean);
    const from = resolveTerm(a.table, parts[0]);
    const to = parts.length > 1 ? resolveTerm(a.table, parts[1]) : null;
    if (!from || (parts.length > 1 && !to)) throw new Error(`ASSERT wellsite: ${a.label} "${t}" is not in the vocabulary.`);
    if (a.range) return { from: from.code, to: to ? to.code : null };
    return to ? { from: from.code, to: to.code } : from.code;
  }
  if (a.multi) {
    return t.split(/\s*[,;]\s*/).filter(Boolean).map((piece) => {
      if (a.amount) {
        const words = piece.split(/\s+/);
        const amount = words.length > 1 ? resolveTerm('amount', words[0]) : null;
        const r = resolveTerm(a.table, amount ? words.slice(1).join(' ') : piece);
        if (!r) throw new Error(`ASSERT wellsite: ${a.label} "${piece}" is not in the vocabulary.`);
        return amount ? { code: r.code, amount: amount.code } : r.code;
      }
      const r = resolveTerm(a.table, piece);
      if (!r) throw new Error(`ASSERT wellsite: ${a.label} "${piece}" is not in the vocabulary.`);
      return r.code;
    });
  }
  const r = resolveTerm(a.table, t);
  if (!r) throw new Error(`ASSERT wellsite: ${a.label} "${t}" is not in the vocabulary.`);
  return r.code;
}

/** Fractions to whole tens that sum to 100 (largest remainder, ties to the larger fraction). */
function tens(fracs) {
  const raw = fracs.map((f, i) => ({ i, f, v: f * 10 }));
  const out = raw.map((r) => Math.floor(r.v + 1e-9));
  let left = 10 - out.reduce((a, b) => a + b, 0);
  const order = [...raw].sort((a, b) => (b.v - Math.floor(b.v + 1e-9)) - (a.v - Math.floor(a.v + 1e-9)) || b.f - a.f);
  for (const r of order) { if (left <= 0) break; out[r.i] += 1; left -= 1; }
  return out.map((x) => x * 10);
}

export async function build(ctx) {
  const { write, say, assertClose, OUT, built, tuning } = ctx;
  if (!tuning) throw new Error('ASSERT wellsite: generate.mjs must pass the rock model tuning in ctx.');

  // ==========================================================================
  // 1. What the rest of the kit fixes: casing program, string, tops, survey
  // ==========================================================================
  const e11 = built.find((b) => b.well.name === 'Ekene-11');
  const program = readCsv(path.join(OUT, '10-drilling/ekene-11-casing-program.csv'));
  const cs1338 = program.find((r) => r.string.startsWith('13-3/8in'));
  const cs958 = program.find((r) => r.string.startsWith('9-5/8in'));
  const shoe1338 = Number(cs1338.shoe_md_m);
  const shoe958 = Number(cs958.shoe_md_m);
  const holeIn = Number(cs958.hole_in);                       // the 12-1/4in hole drilled to the 9-5/8in shoe
  const mudPpg = Number(cs958.hole_mud_ppg);
  const mudKg = Number(cs958.hole_mud_kg_m3);
  const csg = CASING_QUICK.find((c) => c.designation === `13-3/8" ${cs1338.weight_lb_ft} ${cs1338.grade}`);
  if (!csg) throw new Error('ASSERT wellsite: the 13-3/8in string of the casing program is not in the casing catalogue.');
  const mudHist = readCsv(path.join(OUT, '05-pressure/ekene-mud-weights.csv'))
    .find((r) => Number(r.from_md_m) <= 1635 && Number(r.to_md_m) >= 1650 && r.outcome === 'held');
  assertClose('Ekene-11 12-1/4in mud against the mud Ekene-1 drilled the reservoir with (ppg)', mudPpg, Number(mudHist.mud_weight_ppg), 1e-9);

  const header = readCsv(path.join(OUT, '01-wells/well-headers.csv')).find((r) => r.well === 'Ekene-11');
  const kb = Number(header.kb_m);
  const registryTops = readCsv(path.join(OUT, '01-wells/tops/Ekene-11-tops.csv'))
    .map((r) => ({ name: r.top_name, md_m: Number(r.md_m), tvd_m: Number(r.tvd_m), tvdss_m: Number(r.tvdss_m) }));
  const sandTop = registryTops.find((t) => t.name === 'Ekene Sand');
  const truthTop = e11.tops.find((t) => t.key === 'TOP_SAND').md;
  assertClose('Ekene Sand top in the registry tops file against the structural truth (m)', sandTop.md_m, truthTop, 0.005);
  // The survey the registry holds: 01-wells/surveys/Ekene-11-survey.csv as pasted
  // on the Well Data Manager Deviation tab (MD, inclination, grid azimuth).
  const stations = readCsv(path.join(OUT, '01-wells/surveys/Ekene-11-survey.csv'))
    .map((r) => ({ md: Number(r.md_m), inc: Number(r.inclination_deg), azi: Number(r.azimuth_deg_grid) }));
  const wellCtx = { kbElevM: kb, rtElevM: kb, survey: { stations, version: 'registry-1', method: 'minimum_curvature' } };
  assertClose('registry survey TVD at the Ekene Sand top against the tops file (m)', mdToTvd(sandTop.md_m, wellCtx).tvdM, sandTop.tvd_m, 0.02);

  // ==========================================================================
  // 2. The rig configuration exactly as Config stores it from the typed values
  // ==========================================================================
  const wholeFt = (m) => Math.round(m / M_PER_FT);
  const shoeFt = wholeFt(shoe1338);
  const sectionFt = wholeFt(shoe958);
  if (!(Math.abs(shoeFt * M_PER_FT - shoe1338) < 0.5 * M_PER_FT)) throw new Error('ASSERT wellsite: the 13-3/8in shoe does not round to a whole foot.');
  const dc = DRILL_COLLARS.find((d) => Math.abs(d.odM - 8 * IN) < 1e-9);   // 8in collars for 12-1/4in hole
  const hw = HWDP[3]; const dp = DRILL_PIPE[3];                              // the drilling domain's HWDP and drill pipe
  const idIn = (m) => Number((m / IN).toFixed(4));
  const CFG = {
    sections: [
      { from_ft: 0, to_ft: shoeFt, cased: 'yes', id_in: Number((csg.idM / IN).toFixed(3)), description: `13-3/8in ${cs1338.weight_lb_ft} lb/ft ${cs1338.grade} casing, shoe at ${shoe1338.toFixed(1)} m` },
      { from_ft: shoeFt, to_ft: sectionFt, cased: 'no', id_in: holeIn, description: `${cs958.hole_in === '12.25' ? '12-1/4in' : `${holeIn}in`} open hole to the planned 9-5/8in shoe at ${shoe958.toFixed(1)} m` },
    ],
    bha: [
      { label: '8in drill collars', length_ft: RIG.bhaFt.collars, od_in: idIn(dc.odM), id_in: idIn(dc.idM) },
      { label: '5in HWDP', length_ft: RIG.bhaFt.hwdp, od_in: idIn(hw.odM), id_in: idIn(hw.idM) },
    ],
    dp: { od_in: idIn(dp.odM), id_in: idIn(dp.idM) },
  };
  // ConfigView rowsToSections / rowsToBha: feet times 0.3048, inches times 0.0254.
  const rigConfig = {
    rig_type: RIG.type,
    hole_sections: CFG.sections.map((r) => {
      const cased = r.cased === 'yes';
      return { from_md_m: r.from_ft * 0.3048, to_md_m: r.to_ft * 0.3048, cased, hole_id_m: cased ? null : r.id_in * IN, casing_id_m: cased ? r.id_in * IN : null, description: r.description };
    }),
    bha: CFG.bha.map((r) => ({ label: r.label, lengthM: r.length_ft * 0.3048, odM: r.od_in * IN, idM: r.id_in * IN })),
    drillpipe: { odM: CFG.dp.od_in * IN, idM: CFG.dp.id_in * IN, label: `${CFG.dp.od_in} in drillpipe` },
    pump: { ...RIG.pump },
    riser: null,
    booster: null,
  };
  const disp = displacementFromField(RIG.pump);
  const flow = flowRate({ m3PerStroke: disp.m3PerStroke, spm: RIG.drillingSpm });
  const lagCtx = { geometry: rigConfig.hole_sections, bha: rigConfig.bha, drillpipe: rigConfig.drillpipe, stations, riser: null, m3PerStroke: disp.m3PerStroke, boosterM3PerStroke: 0 };
  const PUMP = {
    bbl: disp.bblPerStroke.toFixed(4), lpm: (disp.m3PerStroke * 1000).toFixed(2),
    screen: `${disp.bblPerStroke.toFixed(4)} bbl/stk (${(disp.m3PerStroke * 1000).toFixed(2)} L/stk)`,
    gpm: Math.round(flow.gpm), lmin: Math.round(flow.lPerMin),
  };

  // ==========================================================================
  // 3. The day, sequenced; every arrival from the lag engine
  // ==========================================================================
  const T0 = fromRigLocal(`${DAY.date}T${DAY.startLocal}`, DAY.offsetMin);
  const utc = (t) => T0 + t * MIN;
  const hhmm = (t) => toRigLocal(utc(t), DAY.offsetMin).hhmm;
  const bitHist = [];
  const pumpLog = [];
  const LOG = [];            // { t, screen, action, bit, spm, event, value, unit, text, kind, ref }
  let t = 0;
  let bit = PLAN.startBitMdM;
  let bitExact = bit;
  const recBit = (tt, md, text = '') => { bitHist.push({ utcMs: utc(tt), mdM: md }); LOG.push({ t: tt, screen: 'Live', action: 'Record bit depth', bit: md, text, kind: 'bit' }); };
  const recPump = (tt, spm, text) => { pumpLog.push({ utcMs: utc(tt), spm, boosterSpm: 0 }); LOG.push({ t: tt, screen: 'Live', action: spm > 0 ? 'Pump rate change' : 'Pumps off', spm, text, kind: 'pump' }); };
  const evStart = (tt, code, label = null) => LOG.push({ t: tt, screen: 'Live', action: code === 'user_defined' ? `Start event: Other event, label "${label}"` : `Start event: ${eventName(code)}`, event: label || eventName(code), kind: 'event' });
  const evEnd = (tt, code, label = null) => LOG.push({ t: tt, screen: 'Live', action: `End event: ${label || eventName(code)}`, event: label || eventName(code), kind: 'event' });
  const evPoint = (tt, code) => LOG.push({ t: tt, screen: 'Live', action: `Event: ${eventName(code)}`, event: eventName(code), kind: 'event' });
  const obs = (tt, type, value, unit, text, depthMode, depthMdM) => LOG.push({ t: tt, screen: 'Observations', action: `Observation: ${type}`, value, unit, text, depthMode, depthMdM, kind: 'obs', type });
  // Whole-hour bit records while drilling or tripping, as a driller reads them out.
  const hourly = (tFrom, tTo, depthAt) => {
    for (let h = Math.floor(tFrom / 60 + 1e-9) + 1; h * 60 < tTo - 1e-9; h += 1) recBit(h * 60, round1(depthAt(h * 60)));
  };
  const drillTo = (target, rop) => {
    const t1 = Math.round((t + ((target - bitExact) / rop) * 60) * 60) / 60;   // whole seconds
    const d0 = bitExact; const t0 = t;
    hourly(t0, t1, (tt) => d0 + (rop * (tt - t0)) / 60);
    t = t1; bitExact = target; bit = round1(target);
  };
  const arrivalMin = (cutT, md) => (arrivalPrediction({ cutUtcMs: utc(cutT), cutMdM: md, lagCtx, pumpLog, nowUtcMs: utc(cutT) }).arrivalUtcMs - T0) / MIN;
  const upMin = (x) => Math.ceil(x - 1e-9);

  // 06:00
  recBit(0, bit, 'Start of the day tour: 12-1/4in hole in the Ogbia Shale');
  recPump(0, RIG.drillingSpm, `Drilling ahead, ${RIG.pumpsOnLine} pumps at ${RIG.drillingSpm / RIG.pumpsOnLine} spm`);
  evStart(0, 'drilling');
  obs(0, 'Mud observation', null, null, `${mudPpg.toFixed(1)} ppg (${mudKg} kg/m3) in and out, no losses, no gains`, 'bit depth now', bit);
  const connGas = [];
  const connection = (depth) => {
    drillTo(depth, PLAN.rop.shale > 0 && depth <= truthTop ? PLAN.rop.shale : PLAN.rop.sand);
    recBit(t, bit, 'Stand down');
    evEnd(t, 'drilling'); recPump(t, 0, 'Connection'); evStart(t, 'connection');
    t += PLAN.connectionMin;
    recBit(t, bit, 'Back on bottom');
    evEnd(t, 'connection'); recPump(t, RIG.drillingSpm, 'Back on bottom'); evStart(t, 'drilling');
    connGas.push({ depth: bit, resumeT: t });
  };
  connection(PLAN.connections[0]);
  connection(PLAN.connections[1]);
  // The drilling break at the Ekene Sand top.
  drillTo(truthTop, PLAN.rop.shale);
  const breakT = t;
  const breakMd = bit;                                        // 1635.1, the driller's read-out
  recBit(t, bit, 'Drilling break: the rate doubles');
  obs(t, 'ROP change', PLAN.rop.sand, 'm/hr', `drilling break at ${breakMd.toFixed(1)} m, was ${PLAN.rop.shale} m/hr`, 'bit depth now', breakMd);
  drillTo(PLAN.breakStopMdM, PLAN.rop.sand);
  const stopT = t;
  recBit(t, bit, 'Stop on the break');
  evEnd(t, 'drilling'); recPump(t, 0, 'Flow check on the drilling break'); evStart(t, 'user_defined', 'Flow check');
  t += PLAN.breakFlowCheckMin;
  evEnd(t, 'user_defined', 'Flow check');
  obs(t, 'Mud observation', null, null, `flow check ${PLAN.breakFlowCheckMin} min at ${bit.toFixed(1)} m: well static`, 'bit depth now', bit);
  recPump(t, RIG.drillingSpm, 'Circulate bottoms up from the break'); evStart(t, 'circulation');
  const bu1Arrival = arrivalMin(stopT, PLAN.breakStopMdM);
  t = upMin(bu1Arrival);
  const bu1T = t;
  evPoint(t, 'bottoms_up');
  t += PLAN.lookMin;                                          // circulate while the sample is looked at
  evEnd(t, 'circulation');
  recBit(t, bit, 'Back on bottom, drill ahead');
  evStart(t, 'drilling');
  connection(PLAN.connections[2]);
  drillTo(PLAN.bitRunEndMdM, PLAN.rop.sand);
  const tdT = t;
  recBit(t, bit, 'End of the first 12-1/4in bit run');
  evEnd(t, 'drilling'); evStart(t, 'circulation');
  const bu2Single = arrivalMin(tdT, PLAN.bitRunEndMdM) - tdT;
  t = upMin(tdT + PLAN.bottomsUpBeforeTrip * bu2Single);
  evEnd(t, 'circulation'); recPump(t, 0, 'Flow check before the trip'); evStart(t, 'user_defined', 'Flow check');
  t += PLAN.tripFlowCheckMin;
  evEnd(t, 'user_defined', 'Flow check');
  obs(t, 'Mud observation', null, null, `flow check ${PLAN.tripFlowCheckMin} min at ${bit.toFixed(1)} m: well static; pull out of hole for a bit change`, 'bit depth now', bit);
  recBit(t, bit, 'Start pulling out of hole');
  evStart(t, 'trip_out');
  const tripT = t;
  const tripAt = (tt) => PLAN.bitRunEndMdM - (PLAN.tripMPerHr * (tt - tripT)) / 60;
  hourly(tripT, PLAN.tourEndMin + 1e-6, tripAt);
  const tourEndBit = round1(tripAt(PLAN.tourEndMin));
  if (!(tourEndBit > 0)) throw new Error('ASSERT wellsite: the trip reaches surface before the handover.');

  // Connection gas: the swab at the bit arrives one lag after the pumps resume.
  for (const c of connGas) {
    const at = upMin(arrivalMin(c.resumeT, c.depth));
    obs(at, 'Connection gas', Number((GAS.backgroundPct + GAS.connectionOverPct).toFixed(1)), '%', `connection at ${c.depth.toFixed(1)} m, background ${GAS.backgroundPct} %`, 'typed', c.depth);
  }

  // ==========================================================================
  // 4. Samples: the programme, the rock model, the arrivals
  // ==========================================================================
  const programme = { version: 1, rows: PROGRAMME.rows, authorisedBy: PROGRAMME.authorisedBy };
  const perr = validateProgramme(programme);
  if (perr.length) throw new Error(`ASSERT wellsite: ${perr[0]}`);
  const sched = scheduledDepths(programme, { fromMdM: 0, toMdM: PLAN.bitRunEndMdM });
  const samples = sched.map((s, i) => ({ id: `s${i + 1}`, no: i + 1, mdM: s.mdM, intervalM: programme.rows[s.rowIndex].intervalM, rowIndex: s.rowIndex }));
  const endT = PLAN.tourEndMin;
  const arrivals = expectedArrivals(samples.map((s) => ({ id: s.id, mdM: s.mdM })), { bitDepthHistory: bitHist, pumpLog, lagCtx, nowUtcMs: utc(endT) });

  const rock = synthesiseWell({ well: e11.well, tops: e11.tops, survey: e11.survey, tvdAtMd, geo: null, tuning });
  const inSample = (s) => rock.filter((r) => r.md > s.mdM - s.intervalM + 1e-9 && r.md <= s.mdM + 1e-9);
  for (const s of samples) {
    const rows = inSample(s);
    const n = rows.length;
    const sand = rows.filter((r) => r.vsh < VSH_CUT);
    const silt = rows.filter((r) => r.vsh >= VSH_CUT && r.vsh < SILT_MAX);
    const shale = rows.filter((r) => r.vsh >= SILT_MAX);
    const oil = sand.filter((r) => r.fluid === 'oil');
    const [pSand, pSilt, pShale] = tens([sand.length / n, silt.length / n, shale.length / n]);
    s.pct = { sand: pSand, silt: pSilt, shale: pShale };
    s.oilFrac = oil.length / n;
    s.so = oil.length ? oil.reduce((a, r) => a + (1 - r.sw), 0) / oil.length : 0;
    s.phi = oil.length ? oil.reduce((a, r) => a + r.phit, 0) / oil.length : 0;
    s.shaleRho = shale.length ? shale.reduce((a, r) => a + r.rhob, 0) / shale.length : null;
    s.layer = rows[rows.length - 1].layerKey;
    s.formation = s.layer === 'EKENE' || sand.length ? 'Ekene Sand' : 'Ogbia Shale';
    s.tvd = mdToTvd(s.mdM, wellCtx).tvdM;
    const a = arrivals.find((x) => x.sampleId === s.id);
    s.cutT = (a.cutUtcMs - T0) / MIN;
    s.arrivalT = (a.arrivalUtcMs - T0) / MIN;
    s.catchT = upMin(s.arrivalT);
  }
  const sampleAt = (md) => samples.find((s) => Math.abs(s.mdM - md) < 1e-9);
  const s1638 = sampleAt(PLAN.breakStopMdM);
  assertClose('the 1638 m sample arrives at the bottoms up the log circulates (min)', s1638.catchT, bu1T, 1e-9);
  if (samples.some((s) => s.arrivalT > endT)) throw new Error('ASSERT wellsite: a sample is still in the hole at the handover.');
  // The rock model carries the geology the note states.
  if (samples.filter((s) => s.mdM < truthTop).some((s) => s.pct.shale !== 100)) throw new Error('ASSERT wellsite: an Ogbia sample above the top is not all shale.');
  const firstSand = samples.find((s) => s.pct.sand > 0);
  if (firstSand !== s1638) throw new Error(`ASSERT wellsite: the first sand is in the ${firstSand.mdM} m sample, not the ${s1638.mdM} m sample the break is circulated up for.`);
  const contactMd = (() => { let lo = truthTop; let hi = PLAN.bitRunEndMdM; for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (mdToTvd(mid, wellCtx).tvdssM < OIL_CONTACT_TVDSS) lo = mid; else hi = mid; } return (lo + hi) / 2; })();

  // Descriptions: typed terms in the live vocabulary, percentages from the rock.
  const component = (terms, percent) => {
    const c = { percent };
    for (const a of ATTRIBUTES) {
      if (a.key === 'percent') continue;
      c[a.key] = typedToValue(a.key, terms[a.key]);
    }
    return c;
  };
  for (const s of samples) {
    const sandTerms = s.oilFrac > 0 ? DESCRIBE.sandOil : DESCRIBE.sandWater;
    const parts = [
      { terms: sandTerms, pct: s.pct.sand }, { terms: DESCRIBE.siltstone, pct: s.pct.silt }, { terms: DESCRIBE.shale, pct: s.pct.shale },
    ].filter((p) => p.pct > 0).sort((a, b) => b.pct - a.pct);
    s.parts = parts;
    s.description = { components: parts.map((p) => component(p.terms, p.pct)), comment: '' };
    const v = validateDescription(s.description);
    if (!v.ok) throw new Error(`ASSERT wellsite: the ${s.mdM} m description does not validate: ${v.errors[0]}`);
    s.abbrev = abbreviate(s.description).text;
    s.show = showFor({ oilFrac: s.oilFrac, so: s.so });
    if (s.show) {
      const err = validateShow(s.show);
      if (err.length) throw new Error(`ASSERT wellsite: the ${s.mdM} m show is invalid: ${err[0]}`);
      s.showSummary = showSummary(s.show);
      s.showAbbrev = showAbbrev(s.show);
    }
    s.gasPct = totalGasPct({ oilFrac: s.oilFrac, so: s.so, phi: s.phi });
  }
  const showSamples = samples.filter((s) => s.show);
  if (!showSamples.length || showSamples.some((s) => s.formation !== 'Ekene Sand')) throw new Error('ASSERT wellsite: the shows are not in the Ekene Sand.');
  const bestShow = [...showSamples].sort((a, b) => b.showSummary.score - a.showSummary.score)[0];

  // Sample catch, describe, show and gas rows.
  const gasAt = new Set([1620, 1635, 1638, 1641, 1644, 1650]);
  const rhoAt = new Set([1620, 1635]);
  for (const s of samples) {
    LOG.push({ t: s.catchT, screen: 'Samples', action: `Catch sample No ${s.no} (${m1(s.mdM)})`, kind: 'catch', ref: s.no });
    LOG.push({ t: s.catchT, screen: 'Describe', action: `Describe sample No ${s.no}, ${m1(s.mdM - s.intervalM)} to ${m1(s.mdM)}`, text: s.abbrev, kind: 'describe', ref: s.no });
    if (s.show) LOG.push({ t: s.catchT, screen: 'Shows', action: `Show on sample No ${s.no}`, text: `${s.showAbbrev}: ${s.showSummary.qualityName}`, kind: 'show', ref: s.no });
    if (gasAt.has(s.mdM)) obs(s.catchT, 'Total gas', s.gasPct, '%', `sample No ${s.no}`, 'typed', s.mdM);
    if (rhoAt.has(s.mdM)) obs(s.catchT, 'Shale density', Number(s.shaleRho.toFixed(2)), 'g/cc', `Ogbia Shale, sample No ${s.no}`, 'typed', s.mdM);
  }

  // ==========================================================================
  // 5. Tops: prognosis from the registry, the call on the break
  // ==========================================================================
  const UNC = 15;                                             // prognosisTopsFrom's default when the registry has none
  const approachAt = (bitMd) => approachPanel({ formation: 'Ekene Sand', prognosis: { mdM: sandTop.md_m, uncertaintyM: UNC }, bitMdM: bitMd, ctx: wellCtx, offsetTops: [] });
  const APPROACH = [0, 240, 300].map((tt) => {
    const b = [...bitHist].reverse().find((h) => h.utcMs <= utc(tt)).mdM;
    const p = approachAt(b);
    return { t: tt, bit: b, text: approachText(p.text), dMd: m1(p.distanceMdM), dTvd: m1(p.distanceTvdM), inWindow: p.inWindow };
  });
  const callDepth = { value: breakMd, unit: 'm', reference: 'MD', datum: 'KB', kind: 'logged' };
  const callCalc = toCanonicalMd(callDepth, wellCtx);
  if (!callCalc.ok) throw new Error(`ASSERT wellsite: the call depth does not store: ${callCalc.errors[0]}`);
  assertClose('the called Ekene Sand top against the structural truth (m)', callCalc.mdM, truthTop, 0.05);
  const CALL = {
    md: breakMd.toFixed(1), tvd: callCalc.calculated.tvdM.toFixed(1), tvdss: callCalc.calculated.tvdssM.toFixed(1),
    stored: `Stored as ${m1(callCalc.mdM)} MD below KB (${(callCalc.mdM / M_PER_FT).toFixed(0)} ft); TVD ${m1(callCalc.calculated.tvdM)}, subsea ${m1(callCalc.calculated.tvdssM)} by minimum curvature on survey registry-1`,
  };
  const s1644 = sampleAt(1644);
  LOG.push({ t: 0, screen: 'Tops', action: 'Load from registry', text: `Prognosis version 1: ${registryTops.length} tops, 0 offset tops; Ekene Sand ${m1(sandTop.md_m)} ±${m1(UNC)}`, kind: 'top' });
  LOG.push({ t: bu1T, screen: 'Tops', action: 'Interpret: Ekene Sand', text: `range ${m1(breakMd)} to ${m1(PLAN.breakStopMdM)}, high; drilling break at ${breakMd.toFixed(1)} m and sandstone with a ${s1638.showSummary.qualityName} in sample No ${s1638.no}`, kind: 'top' });
  LOG.push({ t: bu1T, screen: 'Tops', action: 'Call: Ekene Sand', text: `${m1(breakMd)} MD KB, preliminary; basis: drilling break at ${breakMd.toFixed(1)} m, first sandstone in the ${PLAN.breakStopMdM.toFixed(1)} m sample`, kind: 'top' });
  obs(bu1T, 'Geological note', null, null, `Ekene Sand top called preliminary at the ${breakMd.toFixed(1)} m drilling break; oil show in sample No ${s1638.no}`, 'none', null);
  LOG.push({ t: s1644.catchT, screen: 'Tops', action: 'Revise call: Ekene Sand', text: `${m1(breakMd)} MD KB, confirmed; basis: drilling break at ${breakMd.toFixed(1)} m, shows in samples No ${showSamples.map((s) => s.no).join(', ')} fading to the contact`, kind: 'top' });
  LOG.push({ t: PLAN.tourEndMin, screen: 'Handover', action: 'Write the summary, sign, export', kind: 'handover' });

  // ==========================================================================
  // 6. What the Lag panel shows at every row
  // ==========================================================================
  LOG.forEach((r, i) => { r.seq = i; });
  LOG.sort((a, b) => a.t - b.t || a.seq - b.seq);
  const readout = (tt) => {
    const now = utc(tt);
    const hist = bitHist.filter((h) => h.utcMs <= now);
    const pumps = pumpLog.filter((p) => p.utcMs <= now);
    return lagReadout({ nowUtcMs: now, bitMdM: hist[hist.length - 1].mdM, bitDepthHistory: hist, pumpLog: pumps, lagCtx });
  };
  for (const r of LOG) {
    const l = readout(r.t);
    r.lag = {
      strokes: Math.round(l.lagStrokes), time: fmtMin(l.lagTimeMin), spm: l.spmNow,
      lagged: Number.isFinite(l.laggedMdM) ? m1(l.laggedMdM) : 'not yet at surface',
      bu: l.bottomsUpUtcMs ? toRigLocal(l.bottomsUpUtcMs, DAY.offsetMin).hhmm : 'undefined',
      note: l.note,
    };
  }

  // Lag checks at the key depths (clock independent: strokes and time at the rate).
  const LAG = [
    ['start of the day', PLAN.startBitMdM], ['first connection', PLAN.connections[0]], ['second connection', PLAN.connections[1]],
    ['drilling break, Ekene Sand top', breakMd], ['stop on the break', PLAN.breakStopMdM], ['third connection', PLAN.connections[2]],
    ['end of the bit run', PLAN.bitRunEndMdM],
  ].map(([moment, md]) => {
    const l = lagStrokesAt(lagCtx, md, { spm: RIG.drillingSpm });
    const tm = l.lagStrokes / RIG.drillingSpm;
    return { moment, md, strokes: Math.round(l.lagStrokes), strokesExact: l.lagStrokes, timeMin: tm, time: fmtMin(tm), annulusM3: l.annulusVolumeM3, bbl: l.annulusVolumeM3 / 0.158987294928 };
  });
  const lagOf = (md) => LAG.find((x) => Math.abs(x.md - md) < 1e-9);
  const L = { start: lagOf(PLAN.startBitMdM), brk: lagOf(breakMd), stop: lagOf(PLAN.breakStopMdM), td: lagOf(PLAN.bitRunEndMdM) };
  // The story's clock readings (true when the log is replayed at its own pace).
  const firstLagged = LOG.find((r) => r.lag.lagged !== 'not yet at surface');
  const buRow = LOG.find((r) => r.t === bu1T && r.kind === 'event');

  // Well Cost & Time: this report day is the day the program crosses the sand.
  const wct = JSON.parse(fs.readFileSync(path.join(OUT, '10-drilling/ekene-11-well-cost.wct.json'), 'utf8'));
  const ev = evaluateProgram(wct.program);
  const bitRun = ev.rows.find((r) => r.kind === 'drill' && r.fromMdM <= truthTop && r.toMdM >= truthTop);
  const tripRow = ev.rows.find((r) => r.kind === 'trip');
  if (bitRun.toMdM !== PLAN.bitRunEndMdM || tripRow.tripSpeedMPerHr !== PLAN.tripMPerHr) throw new Error('ASSERT wellsite: the bit run or the trip speed no longer matches the Well Cost & Time program.');
  const p0 = fromRigLocal(`${EKENE11.spud}T${DAY.programStartLocal}`, DAY.offsetMin);
  const plannedCross = p0 + (bitRun.startHr + ((truthTop - bitRun.fromMdM) / (bitRun.toMdM - bitRun.fromMdM)) * bitRun.durationHr) * 3600000;
  if (!(plannedCross >= T0 && plannedCross < T0 + 24 * 3600000)) throw new Error('ASSERT wellsite: the Well Cost & Time program crosses the Ekene Sand outside this report day.');
  const planned = toRigLocal(plannedCross, DAY.offsetMin);
  const dayNo = Math.floor((T0 - p0) / 86400000) + 1;
  const ppTop = rock.find((r) => r.md >= truthTop).ppEmw;
  const ppContact = rock.find((r) => r.tvdss >= OIL_CONTACT_TVDSS).ppEmw;

  // ==========================================================================
  // 7. The files
  // ==========================================================================
  const SETUP = [
    ['Well Data Manager (once)', 'Registry well', 'Ekene-11', '', 'must exist in the registry with its survey and tops; see the note if it does not'],
    ['Start a live well', 'Registry well', `Ekene-11 (KB ${kb} m)`, '', '01-wells/well-headers.csv: KB 25 m above MSL'],
    ['Start a live well', 'Field', 'Ekene', '', '00-START-HERE.md'],
    ['Start a live well', 'Operator', FRAME.operator, '', 'spine FRAME.operator'],
    ['Start a live well', 'Rig', RIG.name, '', 'Ekene-11 is drilled from the Ekene Alpha platform (Episode 10)'],
    ['Start a live well', 'Country', FRAME.country, '', 'spine FRAME.country'],
    ['Start a live well', 'Ground level above MSL (m)', '', 'm', 'leave empty: an offshore well has no ground level (water depth 35 m, mudline 60 m below KB)'],
    ['Start a live well', 'RT above KB (m, 0 when RT is KB)', 0, 'm', 'the rotary table is the kelly bushing datum of the kit'],
    ['Start a live well', 'Rig local offset from UTC (minutes)', DAY.offsetMin, 'min', 'West Africa Time, UTC plus one hour'],
    ['Ribbon', 'Depth unit', 'm', '', 'the display unit; the Samples programme and every depth readout follow it'],
    ['Config > Rig geometry and pump', 'Rig type', RIG.typeName, '', 'a fixed platform: returns come up the casing, no riser, no booster'],
    ...CFG.sections.flatMap((r, i) => [
      [`Config > Hole sections > row ${i + 1}`, 'From (ft)', r.from_ft, 'ft', i === 0 ? 'from the rotary table' : 'the 13-3/8in shoe'],
      [`Config > Hole sections > row ${i + 1}`, 'To (ft)', r.to_ft, 'ft', i === 0 ? `ekene-11-casing-program.csv: 13-3/8in shoe ${shoe1338.toFixed(1)} m, to the whole foot` : `ekene-11-casing-program.csv: planned 9-5/8in shoe ${shoe958.toFixed(1)} m, to the whole foot`],
      [`Config > Hole sections > row ${i + 1}`, 'Cased', r.cased === 'yes' ? 'cased' : 'open hole', '', ''],
      [`Config > Hole sections > row ${i + 1}`, 'ID (in)', r.id_in, 'in', i === 0 ? `13-3/8in ${cs1338.weight_lb_ft} lb/ft ${cs1338.grade}, the casing catalogue's inside diameter` : 'bit size, gauge hole'],
      [`Config > Hole sections > row ${i + 1}`, 'Description', r.description, '', ''],
    ]),
    ...CFG.bha.flatMap((r, i) => [
      [`Config > Bottom hole assembly (bit up) > row ${i + 1}`, 'Component', r.label, '', i === 0 ? `${dc.designation}, the drilling studios' catalogue collar for 12-1/4in hole` : `${hw.designation}, the drilling domain's HWDP`],
      [`Config > Bottom hole assembly (bit up) > row ${i + 1}`, 'Length (ft)', r.length_ft, 'ft', '150 m, the drilling domain\'s BHA lengths'],
      [`Config > Bottom hole assembly (bit up) > row ${i + 1}`, 'OD (in)', r.od_in, 'in', ''],
      [`Config > Bottom hole assembly (bit up) > row ${i + 1}`, 'ID (in)', r.id_in, 'in', ''],
    ]),
    ['Config > Rig geometry and pump', 'Drillpipe OD (in)', CFG.dp.od_in, 'in', `the drilling domain's ${dp.designation}`],
    ['Config > Rig geometry and pump', 'Drillpipe ID (in)', CFG.dp.id_in, 'in', ''],
    ['Config > Rig geometry and pump', 'Pump', RIG.pump.type, '', `two identical pumps; the pump log carries their combined rate (${RIG.drillingSpm} spm is ${RIG.drillingSpm / RIG.pumpsOnLine} on each)`],
    ['Config > Rig geometry and pump', 'Liner (in)', RIG.pump.linerIn, 'in', '6-1/2in liners'],
    ['Config > Rig geometry and pump', 'Stroke (in)', RIG.pump.strokeIn, 'in', ''],
    ['Config > Rig geometry and pump', 'Efficiency', RIG.pump.efficiency, '', 'the app default'],
    ['Config > Rig geometry and pump', 'pump output (read only)', PUMP.screen, '', `the screen reads this; at ${RIG.drillingSpm} spm that is ${PUMP.lmin} L/min, about ${PUMP.gpm} gpm`],
    ['Config > Well settings', 'Rig offset from UTC (min)', DAY.offsetMin, 'min', 'already set at Start a live well'],
    ['Config > Well settings', 'Tour starts (local, comma separated)', DAY.tours.join(','), '', 'two 12 hour tours'],
    ['Config > Well settings', 'Report day starts (local)', DAY.startLocal, '', ''],
    ['Config > Well settings', 'Overdue tolerance (min)', 15, 'min', 'the default'],
    ['Config > Well settings', 'Default depth entry', 'm, MD, KB', '', 'the kit is metric and every depth in it is MD below KB (the app default is ft, MD, RT)'],
    ['Config > Well settings', 'Keep original photos', 'no, working copies only', '', 'the default'],
    ['Config > Well settings', 'Mandatory sample stages', 'caught, described, bagged', '', 'the defaults, ticked'],
    ['Config > Well settings', 'Roles that may approve', 'Well geology lead, Administrator', '', 'you created the well, so you are its Administrator and can make a final call'],
    ['Samples > Sampling programme > row 1', `From (m)`, PROGRAMME.rows[0].fromMdM, 'm', 'the bit depth at the start of this report day'],
    ['Samples > Sampling programme > row 1', `To (m, empty for TD)`, PROGRAMME.rows[0].toMdM, 'm', '15 m above the prognosed Ekene Sand (its uncertainty)'],
    ['Samples > Sampling programme > row 1', `Every (m)`, PROGRAMME.rows[0].intervalM, 'm', 'Ogbia Shale'],
    ['Samples > Sampling programme > row 2', `From (m)`, PROGRAMME.rows[1].fromMdM, 'm', ''],
    ['Samples > Sampling programme > row 2', `To (m, empty for TD)`, '', 'm', 'to TD'],
    ['Samples > Sampling programme > row 2', `Every (m)`, PROGRAMME.rows[1].intervalM, 'm', 'through the Ekene Sand'],
    ['Samples > Sampling programme', 'authorised by', PROGRAMME.authorisedBy, '', ''],
    ['Samples > Sampling programme', 'reason', PROGRAMME.reason, '', ''],
  ];
  write(`${DIR}/ekene-11-wellsite-setup.csv`, csvQ(['section', 'field', 'value', 'unit', 'source'], SETUP));

  const logRows = LOG.map((r) => [
    hhmm(r.t), new Date(utc(r.t)).toISOString().replace('.000Z', 'Z'), r.screen, r.action,
    r.bit != null ? r.bit.toFixed(1) : '', r.spm != null ? r.spm : '', r.event || '',
    r.value != null ? r.value : '', r.unit || '', r.text || '',
    r.lag.strokes, r.lag.spm > 0 ? `${r.lag.spm} spm` : 'off', r.lag.time, r.lag.lagged, r.lag.bu,
  ]);
  write(`${DIR}/ekene-11-shift-log.csv`, csvQ(
    ['rig_time', 'utc', 'screen', 'action', 'bit_md_m', 'spm', 'event', 'value', 'unit', 'text',
      'lag_strokes', 'pumps', 'lag_time_at_this_rate', 'lagged_sample_depth_at_log_pace', 'bottoms_up_from_now_at_log_pace'],
    logRows,
  ));

  write(`${DIR}/ekene-11-lag-checks.csv`, csvQ(
    ['moment', 'bit_md_m', 'spm', 'lag_strokes', 'lag_time_at_this_rate', 'lag_time_min', 'annulus_m3', 'annulus_bbl', 'pumps_off_reads'],
    LAG.map((x) => [x.moment, x.md.toFixed(1), RIG.drillingSpm, x.strokes, x.time, x.timeMin.toFixed(2), x.annulusM3.toFixed(3), x.bbl.toFixed(1), 'Lag time at this rate: undefined (pumps off)']),
  ));

  write(`${DIR}/ekene-11-samples.csv`, csvQ(
    ['sample_no', 'md_m', 'interval_top_m', 'interval_m', 'tvd_m', 'formation', 'cut_rig_time', 'arrives_rig_time_at_log_pace', 'sandstone_pct', 'siltstone_pct', 'shale_pct', 'oil_fraction_of_cuttings', 'oil_saturation', 'show_quality', 'total_gas_pct'],
    samples.map((s) => [s.no, s.mdM.toFixed(1), (s.mdM - s.intervalM).toFixed(1), s.intervalM, s.tvd.toFixed(1), s.formation, hhmm(s.cutT), hhmm(s.arrivalT),
      s.pct.sand, s.pct.silt, s.pct.shale, s.oilFrac.toFixed(2), s.so.toFixed(3), s.show ? s.showSummary.qualityName : 'no show', s.gasPct.toFixed(1)]),
  ));

  const DESC_COLS = ATTRIBUTES.map((a) => a.label);
  write(`${DIR}/ekene-11-descriptions.csv`, csvQ(
    ['sample_no', 'top_md_m', 'base_md_m', 'component', ...DESC_COLS, 'abbreviation'],
    samples.flatMap((s) => s.parts.map((p, i) => [s.no, (s.mdM - s.intervalM).toFixed(1), s.mdM.toFixed(1), i + 1,
      ...ATTRIBUTES.map((a) => (a.key === 'percent' ? p.pct : (p.terms[a.key] ?? ''))), s.abbrev])),
  ));

  const SHOW_COLS = [
    ['Fluorescence colour', (s) => SHOW_TABLES.fluorescenceColour.find((x) => x.code === s.fluorescence.colour).name],
    ['Fluorescence intensity', (s) => SHOW_TABLES.fluorescenceIntensity.find((x) => x.code === s.fluorescence.intensity).name],
    ['Cut speed', (s) => SHOW_TABLES.cutSpeed.find((x) => x.code === s.cut.speed).name],
    ['Cut type', (s) => SHOW_TABLES.cutType.find((x) => x.code === s.cut.type).name],
    ['Cut colour', (s) => SHOW_TABLES.cutColour.find((x) => x.code === s.cut.colour).name],
    ['Stain', (s) => SHOW_TABLES.stain.find((x) => x.code === s.stain).name],
    ['Odour', (s) => SHOW_TABLES.odour.find((x) => x.code === s.odour).name],
    ['Residue', (s) => SHOW_TABLES.residue.find((x) => x.code === s.residue).name],
    ['Fluorescence distribution', (s) => `${s.fluorescence.distributionPct} percent`],
  ];
  write(`${DIR}/ekene-11-shows.csv`, csvQ(
    ['sample_no', 'md_m', ...SHOW_COLS.map(([c]) => c), 'score', 'derived_quality', 'summary', 'table_abbreviation'],
    showSamples.map((s) => [s.no, s.mdM.toFixed(1), ...SHOW_COLS.map(([, f]) => f(s.show)), s.showSummary.score, s.showSummary.qualityName, s.showSummary.text, s.showAbbrev]),
  ));

  write(`${DIR}/ekene-11-observations.csv`, csvQ(
    ['rig_time', 'type', 'value', 'unit', 'text', 'source', 'depth', 'depth_md_m'],
    LOG.filter((r) => r.kind === 'obs').map((r) => [hhmm(r.t), r.type, r.value ?? '', r.unit ?? '', r.text, 'manual', r.depthMode, r.depthMdM != null ? r.depthMdM.toFixed(1) : '']),
  ));

  write(`${DIR}/ekene-11-tops.csv`, csvQ(
    ['kind', 'formation', 'md_m', 'uncertainty_m', 'tvd_m', 'tvdss_m', 'status_or_confidence', 'tops_table_shows', 'basis'],
    [
      ...registryTops.map((tp) => ['prognosis', tp.name, tp.md_m.toFixed(2), UNC, tp.tvd_m.toFixed(2), tp.tvdss_m.toFixed(2), '', `${m1(tp.md_m)} ±${m1(UNC)}`, '01-wells/tops/Ekene-11-tops.csv through the registry']),
      ['interpretation', 'Ekene Sand', `${breakMd.toFixed(1)} to ${PLAN.breakStopMdM.toFixed(1)}`, '', '', '', 'high', `${m1(breakMd)} to ${m1(PLAN.breakStopMdM)}, high`, `drilling break at ${breakMd.toFixed(1)} m and sandstone with a ${s1638.showSummary.qualityName} in sample No ${s1638.no}`],
      ['call', 'Ekene Sand', breakMd.toFixed(1), '', CALL.tvd, CALL.tvdss, 'preliminary', `${m1(breakMd)} preliminary v1`, `drilling break at ${breakMd.toFixed(1)} m, first sandstone in the ${PLAN.breakStopMdM.toFixed(1)} m sample`],
      ['call', 'Ekene Sand', breakMd.toFixed(1), '', CALL.tvd, CALL.tvdss, 'confirmed', `${m1(breakMd)} confirmed v2`, `drilling break at ${breakMd.toFixed(1)} m, shows in samples No ${showSamples.map((s) => s.no).join(', ')} fading to the contact`],
    ],
  ));

  write(`${DIR}/README-wellsite.md`, [
    '# Wellsite: Ekene-11, one report day', '',
    `Episode 37. The first 12-1/4in bit of Ekene-11 on ${DAY.date} (day ${dayNo} of the Well Cost & Time program that`,
    `starts on the ${EKENE11.spud} spud): the last of the Ogbia Shale, the Ekene Sand top at the drilling break,`,
    'an oil show above the contact, then a trip for a bit. Wellsite Studio has no file import, so everything',
    'here is typed or replayed by hand. Every number the episode note quotes is what the Wellsite engines',
    'return for these inputs, and `__tests__/domain.wellsite.test.js` checks them again through the app\'s',
    'own services.', '',
    '| File | What it is |', '|---|---|',
    '| `ekene-11-wellsite-setup.csv` | the live well, rig geometry and pump, well settings and the sampling programme, in the app\'s labels and units |',
    '| `ekene-11-shift-log.csv` | the day tour, 06:00 to 18:00, time ordered: every entry and what the Lag panel shows after it |',
    '| `ekene-11-lag-checks.csv` | lag strokes and lag time at the rate for the key bit depths (these do not depend on the clock) |',
    '| `ekene-11-samples.csv` | the 19 scheduled samples: depth, cut and arrival, lithology from the rock model, show and gas |',
    '| `ekene-11-descriptions.csv` | what to type on the Describe screen for each sample, and the abbreviation it gives |',
    '| `ekene-11-shows.csv` | the shows, the values to pick and the quality the app derives |',
    '| `ekene-11-observations.csv` | gas, shale density, ROP, mud and a geological note, with the depth each refers to |',
    '| `ekene-11-tops.csv` | the prognosis as loaded from the registry, the interpretation and the two call versions |', '',
    'The setup sheet has the columns `section, field, value, unit, source`: section and field are the labels',
    'on the app\'s own screen.', '',
    '## Where the numbers come from', '',
    `- Rig geometry: \`10-drilling/ekene-11-casing-program.csv\`. The 13-3/8in casing (ID ${CFG.sections[0].id_in} in) to its`,
    `  ${shoe1338.toFixed(1)} m shoe, then ${holeIn} in (12-1/4in) open hole. Config takes feet, so the shoe is typed as ${shoeFt} ft.`,
    `- String: 150 m of 8in collars, 150 m of 5in HWDP and 5in drill pipe (the drilling domain's HWDP and pipe).`,
    `- Pump: triplex, 6-1/2 x 12in at 97 percent, ${PUMP.screen}. Two pumps on line; the log carries their combined rate.`,
    `- Mud: ${mudPpg.toFixed(1)} ppg (${mudKg} kg/m3), the casing program's 12-1/4in mud and the weight Ekene-1 drilled the`,
    `  reservoir with. The designed pore pressure is ${ppTop.toFixed(2)} ppg at the Ekene Sand top and ${ppContact.toFixed(2)} ppg at the contact`,
    `  (${FRAME.water_depth_m} m of water; 3200 psia at the contact), so the mud is ${(mudPpg - ppTop).toFixed(2)} ppg over.`,
    `- Lithology, oil and shale density: the kit's rock model at Ekene-11 (the facies, saturation and density the LAS files`,
    `  carry at every other well), averaged over each sample interval. Clay fraction under ${VSH_CUT} is sandstone, under ${SILT_MAX}`,
    '  siltstone, above it shale; percentages are rounded to tens.',
    `- Tops: \`01-wells/tops/Ekene-11-tops.csv\`, the structural truth along the Ekene-11 survey. The Ekene Sand is at`,
    `  ${sandTop.md_m.toFixed(2)} m MD (${sandTop.tvd_m.toFixed(2)} m TVD). The oil water contact (${OIL_CONTACT_TVDSS} m subsea) crosses the well at`,
    `  ${contactMd.toFixed(1)} m MD, so only the top ${(contactMd - truthTop).toFixed(1)} m of the sand carries oil here.`,
    '- Shows follow a stated observation rule (design.mjs) from the oil saturation; the QUALITY is the shows engine\'s.',
    '- Gas is a stated rule too (no gas data exists for the field): 0.4 percent background, 0.9 percent on connections,',
    '  and the oil-filled pore volume of the cuttings on top in the sand.', '',
    '## Replaying the log', '',
    'The app stamps every entry at the moment you press Record, so a hand replay compresses the day. What does',
    'not depend on the clock matches this folder exactly: pump output, lag strokes, lag time at the rate, the',
    'sample schedule, descriptions and abbreviations, show quality, the tops and their depths. What depends on',
    'the clock (the lagged sample depth, arrival times, the bottoms up clock time) follows your pace; the log gives',
    'the values at its own pace, which is what a real day would show.', '',
    'The harness at `/dev/wellsite-studio` exists only in development builds (the staging server) and seeds its',
    'own well, KETA-2; use a real live well on Ekene-11 for this episode.',
  ].join('\n'));

  const Q = {
    pump: PUMP, lag: L, call: CALL, approach: APPROACH, samples: samples.length, s1638, bestShow, s1644,
    breakT, bu1T, tdT, contactMd, firstLagged, buRow, planned, tourEndBit,
  };
  say(`  wellsite: pump ${PUMP.screen}; lag at ${breakMd} m ${L.brk.strokes} stk (${L.brk.time} at ${RIG.drillingSpm} spm), at ${PLAN.bitRunEndMdM} m ${L.td.strokes} stk; `
    + `Ekene Sand called at ${CALL.md} m MD (${CALL.tvd} m TVD); ${samples.length} samples; best show ${bestShow.showSummary.qualityName} in No ${bestShow.no}`);

  // ==========================================================================
  // 8. Episode 37
  // ==========================================================================
  const sd = (s) => `No ${s.no} (${m1(s.mdM)})`;
  const note = [
    'Ekene-11 must be in the registry first, with its survey and tops. No earlier episode creates it on camera: in Well Data Manager add the well Ekene-11 '
      + `(KB ${kb} m, water depth 35 m, surface ${Number(header.surface_easting_m).toFixed(2)} E ${Number(header.surface_northing_m).toFixed(2)} N, from \`01-wells/well-headers.csv\`), `
      + 'paste `01-wells/surveys/Ekene-11-survey.csv` on the Deviation tab and `01-wells/tops/Ekene-11-tops.csv` on the Tops tab, the way Episode 1 builds Ekene-1. '
      + 'If Episodes 16 and 17 were recorded, it is already there. It has no logs, which is right: it is the well being drilled. '
      + `The day is ${DAY.date}, day ${dayNo} of the Well Cost & Time program (Episode 20), which has this bit crossing the Ekene Sand at ${planned.hhmm}; this tour runs about two hours ahead of it.`,
    '',
    `1. New well. Start a live well, pick Ekene-11 (KB ${kb} m) and type the header from \`ekene-11-wellsite-setup.csv\` (offset 60 minutes, RT above KB 0, ground level empty: it is offshore).`,
    `2. Tops. Load from registry: prognosis version 1 with ${registryTops.length} tops and 0 offset tops. The Ekene Sand reads ${m1(sandTop.md_m)} ±${m1(UNC)} (the app's default uncertainty when the registry carries none).`,
    `3. Config. Set the ribbon's depth unit to m. Rig type Platform rig, the two hole sections and the BHA in feet, drill pipe, pump 6.5 x 12 triplex at 0.97: the pump output reads ${PUMP.screen}. `
      + 'Record the rig configuration, then save the well settings with the default depth entry m, MD, KB and the two approver roles. On Samples, record the two row programme, authorised by the Operations geologist.',
    `4. Live. Record bit depth ${m1(PLAN.startBitMdM)} (m, MD, KB; TVD ${m1(mdToTvd(PLAN.startBitMdM, wellCtx).tvdM)}) and pumps ${RIG.drillingSpm} spm (both pumps). The Lag panel reads ${L.start.strokes} stk, lag time at this rate ${L.start.time}, lagged sample depth not yet at surface, and Bottoms up from now shows the rig time ${L.start.time} ahead. `
      + `Lag strokes grow with the hole: ${L.brk.strokes} stk at the ${m1(breakMd)} break, ${L.stop.strokes} stk at ${m1(PLAN.breakStopMdM)}, ${L.td.strokes} stk (${L.td.time}) at ${m1(PLAN.bitRunEndMdM)}, where the annulus holds ${L.td.annulusM3.toFixed(1)} m3. `
      + `The approach panel reads: ${APPROACH[0].text} At ${m1(APPROACH[2].bit)} it reads: ${APPROACH[2].text} Replay \`ekene-11-shift-log.csv\` row by row (see Caveats for the clock).`,
    `5. Samples and Describe. The programme schedules ${samples.length} samples, ${sd(samples[0])} to ${sd(samples[samples.length - 1])}. Catch each one on the Samples view (the Live catch prompt appears only when a sample is due by the clock) and describe it from \`ekene-11-descriptions.csv\`. `
      + `The Ogbia samples are all shale: the first reads "${samples[0].abbrev}", and Ctrl+D repeats it for the next. Sample ${sd(s1638)} is the first sand: "${s1638.abbrev}".`,
    `6. Shows. On sample ${sd(s1638)} pick the values in \`ekene-11-shows.csv\`: the derived quality reads ${s1638.showSummary.qualityName} (score ${s1638.showSummary.score} of 12). `
      + `The best is ${sd(bestShow)}, ${bestShow.showSummary.qualityName} (${bestShow.showSummary.score}); ${sd(s1644)} fades to a ${s1644.showSummary.qualityName} across the contact at ${m1(contactMd)}, and the water sand below has none.`,
    '7. Photos. Attach any cuttings photograph you have the right to show to that sample: the kit ships none, because a synthetic field has no cuttings.',
    `8. Connection. Start and end a Connection at ${m1(PLAN.connections[0])} with the pumps off between: the Pumps row reads off and Lag time at this rate reads undefined (once the first cuttings of the day are at surface the panel also says the pumps are off), and the lag time returns once ${RIG.drillingSpm} spm is recorded again.`,
    `9. Tops. At the drilling break (${m1(breakMd)}) record the ROP change, drill to ${m1(PLAN.breakStopMdM)}, flow check and circulate it up. Interpret the Ekene Sand ${m1(breakMd)} to ${m1(PLAN.breakStopMdM)}, high, then Call it at ${m1(breakMd)} preliminary. `
      + `The depth line reads: ${CALL.stored}. Revise the call to confirmed at the same depth after sample ${sd(s1644)}, then read History: v1 preliminary, v2 confirmed.`,
    `10. Observations. Total gas ${s1638.gasPct.toFixed(1)} percent on sample ${sd(s1638)} (Depth: typed, the sample depth) and a Geological note. The rest are in \`ekene-11-observations.csv\`.`,
    `11. Handover at 18:00: write the summary, sign, export. The bit is at about ${m1(tourEndBit)} pulling out of hole.`,
    '12. Report: export the daily report.',
    '',
    `Caveats. The app stamps each entry when you press Record, so a hand replay compresses the day: pump output, lag strokes, lag time at the rate, the schedule, descriptions, shows and tops match this note exactly; the lagged depth and the clock times follow your pace (the log's own values are in its last two columns). `
      + `For one clock check, record the bit at ${m1(PLAN.bitRunEndMdM)}, keep ${RIG.drillingSpm} spm and wait ${L.td.time}: the lagged sample depth reaches ${m1(PLAN.bitRunEndMdM)}. `
      + 'Record a bit depth whenever the bit stops or starts moving (the log does): the lag engine takes the bit as moving in a straight line between two records. '
      + 'The programme starts at 1575 m on purpose: the app schedules every depth of the programme from its first row, drilled or not, so a programme started at the shoe would fill the board with samples overdue for review. '
      + 'Config takes hole sections and the BHA in feet whatever the depth unit, and shows them back to the whole foot, which is why every length in the sheet is whole feet. '
      + 'Load from registry brings no offset wells (there is no control to choose them yet), so the approach panel reads Offsets none. '
      + 'The pump rate is the combined rate of both pumps against one pump\'s displacement. The harness at /dev/wellsite-studio is staging only and seeds its own well, KETA-2; record this episode on a live Ekene-11.',
  ].join('\n');

  const episodes = [{
    n: 37,
    app: 'Wellsite Studio',
    files: [
      [`${DIR}/ekene-11-wellsite-setup.csv`, 'the live well, rig geometry and pump, settings and the sampling programme, by screen and field'],
      [`${DIR}/ekene-11-shift-log.csv`, 'the day tour, time ordered, with what the Lag panel shows after every entry'],
      [`${DIR}/ekene-11-lag-checks.csv`, 'lag strokes and lag time at the key bit depths'],
      [`${DIR}/ekene-11-samples.csv`, 'the 19 samples: schedule, arrivals, lithology, show and gas'],
      [`${DIR}/ekene-11-descriptions.csv`, 'what to type on Describe for each sample, and the abbreviation it gives'],
      [`${DIR}/ekene-11-shows.csv`, 'the show values to pick and the quality the app derives'],
      [`${DIR}/ekene-11-observations.csv`, 'gas, shale density, ROP, mud and a note, with their depths'],
      [`${DIR}/ekene-11-tops.csv`, 'the prognosis from the registry, the interpretation and the call versions'],
      ['01-wells/tops/Ekene-11-tops.csv', 'the Ekene-11 tops for the registry (Well Data Manager Tops tab), if Ekene-11 is not there yet'],
      ['01-wells/surveys/Ekene-11-survey.csv', 'the Ekene-11 survey for the registry (Deviation tab), the same way'],
      [`${DIR}/README-wellsite.md`, 'where every number comes from, and how to replay the log'],
    ],
    note,
  }];

  return {
    episodes,
    folders: [[DIR, 'Ekene-11 wellsite day: setup sheet, shift log with lag checks, samples, descriptions, shows, observations, tops']],
    quoted: Q,
  };
}
