/**
 * Wellsite domain gate (Wave D8, episode 37): the generated 15-wellsite
 * sheets through Wellsite Studio's OWN services and record builders.
 *
 * Each sheet is read from disk and mapped field by field the way the
 * screen maps it (Config's feet and inches, the Describe screen's
 * parseField, the Shows pickers, the Observations form, DepthEntry), then
 * run through the service the workstation calls (lagNow, sampleBoard,
 * samplesToSchedule, showSummary, formationBoard, abbreviate). The episode
 * note must quote what comes back. Negative controls: a smaller pump liner
 * and a shoe typed in metres into a feet field move the lag past what the
 * note quotes; a faster cut moves a show into another band; a term outside
 * the vocabulary is refused.
 *
 *   npx tsx tools/demo-dataset/generate.mjs && npx jest tools/demo-dataset
 */
import fs from 'fs';
import path from 'path';
import { parseDelimitedText } from '../../../src/lib/tabularFile';
import { guessMapping, buildDeviation } from '../../../src/lib/wellImport';
import { buildRecord } from '../../../src/lib/wellsite/records';
import { toRigLocal } from '../../../src/lib/wellsite/time';
import { toCanonicalMd } from '../../../src/lib/wellsite/depth';
import { validateEvents } from '../../../src/lib/wellsite/events';
import { displacementFromField } from '../../../src/lib/wellsite/pumps';
import {
  lagNow, lagContextOf, isFloater, sampleBoard, samplesToSchedule, scheduleHorizonM, programmeChange,
} from '../../../src/pages/apps/WellsiteStudio/services/samples';
import { parseField, validateDescription, abbreviate, mergeProfile } from '../../../src/pages/apps/WellsiteStudio/services/describe';
import { showSummary, showAbbrev, validateShow, SHOW_TABLES } from '../../../src/pages/apps/WellsiteStudio/services/shows';
import { buildPrognosis } from '../../../src/pages/apps/WellsiteStudio/services/prognosis';
import {
  formationBoard, interpretationParams, callParams, canTransition,
} from '../../../src/pages/apps/WellsiteStudio/services/tops';
import { wellContext } from '../../../src/pages/apps/WellsiteStudio/services/wellContext';
import { observationParams, OBSERVATION_TYPES } from '../../../src/pages/apps/WellsiteStudio/services/observations';
import { EVENT_TYPES } from '../../../src/pages/apps/WellsiteStudio/services/events';
import { RIG_TYPES, WS_ROLES } from '../../../src/pages/apps/WellsiteStudio/services/vocab';
import { fmtDepth } from '../../../src/pages/apps/WellsiteStudio/services/units';
import { ATTRIBUTES } from '../../../src/lib/wellsite/descriptionVocabulary';
import { wellList, VSH_CUT } from '../build.mjs';
import { synthesiseWell } from '../rockmodel.mjs';
import {
  makeGeology, buildSurvey, topsForWell, tvdAtMd,
} from '../geology.mjs';
import { SILT_MAX } from '../domains/wellsite/design.mjs';

const KIT = path.join(__dirname, '..', '..', '..', 'dist-demo', 'ekene-demo-v1');
const DIR = '15-wellsite';
const read = (rel) => {
  const p = path.join(KIT, rel);
  if (!fs.existsSync(p)) throw new Error(`${rel} is missing: run the generator first (npx tsx tools/demo-dataset/generate.mjs).`);
  return fs.readFileSync(p, 'utf8');
};
function parseCsv(text) {
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const sheet = (name) => parseCsv(read(`${DIR}/${name}`));
const NOTE = read('episodes/episode-37-wellsite-studio.md');
const IN = 0.0254;
const OFFSET = 60;
/** LagPanel's minutes. */
const fmtMin = (m) => (m == null ? 'undefined' : m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
const approachText = (t) => t.replace(/(\d+\.\d{2})\d+/g, '$1');     // ApproachPanel's rendering

// ---- the setup sheet, as Config stores it -----------------------------------
const SETUP = sheet('ekene-11-wellsite-setup.csv');
const val = (section, field) => {
  const r = SETUP.find((x) => x.section === section && x.field === field);
  if (!r) throw new Error(`setup sheet has no ${section} / ${field}`);
  return r.value;
};
const rows = (prefix) => {
  const out = [];
  for (let i = 1; SETUP.some((x) => x.section === `${prefix} > row ${i}`); i += 1) {
    out.push(Object.fromEntries(SETUP.filter((x) => x.section === `${prefix} > row ${i}`).map((x) => [x.field, x.value])));
  }
  return out;
};
const RIG_GEOM = 'Config > Rig geometry and pump';
/** ConfigView.saveRig: feet times 0.3048, inches times 0.0254, the select's labels. */
function rigConfigFromSheet(over = {}) {
  const pump = {
    type: val(RIG_GEOM, 'Pump'), linerIn: Number(val(RIG_GEOM, 'Liner (in)')), strokeIn: Number(val(RIG_GEOM, 'Stroke (in)')),
    rodIn: 0, efficiency: Number(val(RIG_GEOM, 'Efficiency')), ...(over.pump || {}),
  };
  const sections = rows('Config > Hole sections').map((r, i) => {
    const cased = r.Cased === 'cased';
    const idM = Number(r['ID (in)']) * IN;
    const toFt = over.toFt && over.toFt[i] != null ? over.toFt[i] : Number(r['To (ft)']);
    const fromFt = over.fromFt && over.fromFt[i] != null ? over.fromFt[i] : Number(r['From (ft)']);
    return { from_md_m: fromFt * 0.3048, to_md_m: toFt * 0.3048, cased, hole_id_m: cased ? null : idM, casing_id_m: cased ? idM : null, description: r.Description };
  });
  const bha = rows('Config > Bottom hole assembly (bit up)').map((r) => ({ label: r.Component, lengthM: Number(r['Length (ft)']) * 0.3048, odM: Number(r['OD (in)']) * IN, idM: Number(r['ID (in)']) * IN }));
  const typeName = val(RIG_GEOM, 'Rig type');
  return {
    rig_type: RIG_TYPES.find((t) => t.name === typeName).code,
    hole_sections: sections, bha,
    drillpipe: { odM: Number(val(RIG_GEOM, 'Drillpipe OD (in)')) * IN, idM: Number(val(RIG_GEOM, 'Drillpipe ID (in)')) * IN },
    pump, riser: null, booster: null,
  };
}
const RIG = rigConfigFromSheet();

// ---- the registry well: headers, the survey as Well Data Manager takes it ---
const HEADER = parseCsv(read('01-wells/well-headers.csv')).find((r) => r.well === 'Ekene-11');
const surveyTable = parseDelimitedText(read('01-wells/surveys/Ekene-11-survey.csv'), { delimiter: 'auto' });
const STATIONS = buildDeviation(surveyTable.rows, guessMapping(surveyTable.header, ['md', 'inc', 'azi']));
const WELL = {
  id: 'ws-ekene-11', name: 'Ekene-11',
  header: { kb_elev_m: Number(HEADER.kb_m), rt_offset_m: 0 },
  survey: { version: 'registry-1', method: 'minimum_curvature', stations: STATIONS },
  settings: { rig_offset_min: OFFSET, mandatory_sample_stages: ['caught', 'described', 'bagged'], overdue_tolerance_min: 15 },
};
const CTX = wellContext(WELL);
const common = { wellId: WELL.id, userId: 'tester', offsetMin: OFFSET, ctx: CTX };
const bitRecord = (iso, md) => buildRecord({ ...common, kind: 'observation', subtype: 'bit_depth', occurredAt: iso, depth: { value: md, unit: 'm', reference: 'MD', datum: 'KB', kind: 'bit_depth' }, payload: { source: 'manual' } }).row;
const pumpRecord = (iso, spm) => buildRecord({ ...common, kind: 'observation', subtype: 'pump_rate', occurredAt: iso, payload: { spm, boosterSpm: 0, note: null, source: 'manual' } }).row;

// ---- the shift log, replayed as records --------------------------------------
const LOG = sheet('ekene-11-shift-log.csv');
const BITS = LOG.filter((r) => r.action === 'Record bit depth').map((r) => bitRecord(r.utc, Number(r.bit_md_m)));
const PUMPS = LOG.filter((r) => r.action === 'Pump rate change' || r.action === 'Pumps off').map((r) => pumpRecord(r.utc, Number(r.spm)));
const upTo = (list, ms) => list.filter((x) => Date.parse(x.occurred_at) <= ms);
const lagAt = (ms, rigConfig = RIG) => lagNow({ well: WELL, rigConfig, bitDepths: upTo(BITS, ms), pumpEvents: upTo(PUMPS, ms), nowUtcMs: ms });
const lagAtBit = (md, spm, rigConfig = RIG) => {
  const t = Date.parse('2027-01-23T05:00:00Z');
  return lagNow({ well: WELL, rigConfig, bitDepths: [bitRecord('2027-01-23T05:00:00Z', md)], pumpEvents: [pumpRecord('2027-01-23T05:00:00Z', spm)], nowUtcMs: t });
};
const LAG = sheet('ekene-11-lag-checks.csv');

describe('Episode 37: the setup sheet through Config', () => {
  test('a Platform rig: no riser, no booster, the land-rig lag', () => {
    expect(RIG.rig_type).toBe('platform');
    expect(isFloater(RIG)).toBe(false);
    const ctx = lagContextOf(WELL, RIG);
    expect(ctx.riser).toBeNull();
    expect(ctx.boosterM3PerStroke).toBe(0);
  });

  test('the pump output the screen reads, and the note quotes it', () => {
    const d = displacementFromField(RIG.pump);
    const screen = `${d.bblPerStroke.toFixed(4)} bbl/stk (${(d.m3PerStroke * 1000).toFixed(2)} L/stk)`;
    expect(screen).toBe('0.1194 bbl/stk (18.99 L/stk)');
    expect(val(RIG_GEOM, 'pump output (read only)')).toBe(screen);
    expect(NOTE).toContain(`the pump output reads ${screen}`);
  });

  test('the geometry is the drilling domain casing program, in whole feet', () => {
    const program = parseCsv(read('10-drilling/ekene-11-casing-program.csv'));
    const c1338 = program.find((r) => r.string.startsWith('13-3/8in'));
    const c958 = program.find((r) => r.string.startsWith('9-5/8in'));
    const [cased, open] = RIG.hole_sections;
    expect(Math.abs(cased.to_md_m - Number(c1338.shoe_md_m))).toBeLessThan(0.5 * 0.3048);
    expect(Math.abs(open.to_md_m - Number(c958.shoe_md_m))).toBeLessThan(0.5 * 0.3048);
    expect(open.hole_id_m / IN).toBeCloseTo(Number(c958.hole_in), 9);
    expect(cased.casing_id_m / IN).toBeCloseTo(12.415, 9);
    for (const r of [...rows('Config > Hole sections'), ...rows('Config > Bottom hole assembly (bit up)')]) {
      for (const k of ['From (ft)', 'To (ft)', 'Length (ft)']) if (r[k] != null) expect(Number.isInteger(Number(r[k]))).toBe(true);
    }
  });

  test('approver roles and depth entry are values the screens offer', () => {
    for (const name of val('Config > Well settings', 'Roles that may approve').split(', ')) expect(WS_ROLES.some((r) => r.name === name)).toBe(true);
    expect(val('Config > Well settings', 'Default depth entry')).toBe('m, MD, KB');
    expect(Number(val('Start a live well', 'Rig local offset from UTC (minutes)'))).toBe(OFFSET);
  });
});

describe('Episode 37: the lag, through the app\'s lagNow', () => {
  test.each(LAG.map((r) => [r.moment, r]))('%s: strokes and time at the rate', (_, r) => {
    const l = lagAtBit(Number(r.bit_md_m), Number(r.spm));
    expect(l.available).toBe(true);
    expect(Math.round(l.lagStrokes)).toBe(Number(r.lag_strokes));
    expect(fmtMin(l.lagTimeMin)).toBe(r.lag_time_at_this_rate);
    expect(l.lagTimeMin).toBeCloseTo(Number(r.lag_time_min), 2);
    const off = lagAtBit(Number(r.bit_md_m), 0);
    expect(off.spmNow).toBe(0);
    expect(off.lagTimeMin).toBeNull();
    expect(off.bottomsUpUtcMs).toBeNull();
  });

  test('the note quotes the strokes and the times', () => {
    const at = (m) => LAG.find((r) => r.moment === m);
    expect(NOTE).toContain(`The Lag panel reads ${at('start of the day').lag_strokes} stk, lag time at this rate ${at('start of the day').lag_time_at_this_rate}`);
    expect(NOTE).toContain(`${at('drilling break, Ekene Sand top').lag_strokes} stk at the 1635.1 m break`);
    expect(NOTE).toContain(`${at('stop on the break').lag_strokes} stk at 1638.0 m`);
    const td = at('end of the bit run');
    expect(NOTE).toContain(`${td.lag_strokes} stk (${td.lag_time_at_this_rate}) at 1650.0 m, where the annulus holds ${Number(td.annulus_m3).toFixed(1)} m3`);
    expect(NOTE).toContain(`keep 180 spm and wait ${td.lag_time_at_this_rate}: the lagged sample depth reaches 1650.0 m`);
  });

  test('every row of the shift log: what the Lag panel shows at the log\'s own pace', () => {
    for (const r of LOG) {
      const ms = Date.parse(r.utc);
      const l = lagAt(ms);
      expect(l.available).toBe(true);
      expect(Math.round(l.lagStrokes)).toBe(Number(r.lag_strokes));
      expect(l.spmNow > 0 ? `${l.spmNow} spm` : 'off').toBe(r.pumps);
      expect(fmtMin(l.lagTimeMin)).toBe(r.lag_time_at_this_rate);
      expect(Number.isFinite(l.laggedMdM) ? fmtDepth(l.laggedMdM, 'm') : 'not yet at surface').toBe(r.lagged_sample_depth_at_log_pace);
      expect(l.bottomsUpUtcMs ? toRigLocal(l.bottomsUpUtcMs, OFFSET).hhmm : 'undefined').toBe(r.bottoms_up_from_now_at_log_pace);
    }
  });

  test('at the first connection the panel says the pumps are off', () => {
    const r = LOG.find((x) => x.action === 'Pumps off' && x.text === 'Connection');
    expect(lagAt(Date.parse(r.utc)).note).toBe('Pumps are off, lag time is undefined until circulation restarts.');
    expect(NOTE).toContain('Pumps row reads off and Lag time at this rate reads undefined');
  });

  test('the clock check: circulating at 1650.0 m, the lagged depth reaches the bit one lag later', () => {
    const t0 = Date.parse('2027-01-23T05:00:00Z');
    const iso = (min) => new Date(t0 + min * 60000).toISOString();
    const bits = [bitRecord(iso(0), 1640), bitRecord(iso(20), 1650)];
    const pumps = [pumpRecord(iso(0), 180)];
    const td = LAG.find((r) => r.moment === 'end of the bit run');
    const wait = Number(td.lag_time_min);
    const before = lagNow({ well: WELL, rigConfig: RIG, bitDepths: bits, pumpEvents: pumps, nowUtcMs: t0 + (20 + wait - 0.2) * 60000 });
    const after = lagNow({ well: WELL, rigConfig: RIG, bitDepths: bits, pumpEvents: pumps, nowUtcMs: t0 + (20 + wait + 0.01) * 60000 });
    expect(before.laggedMdM).toBeLessThan(1650 - 0.01);
    expect(after.laggedMdM).toBeCloseTo(1650, 6);
  });

  test('negative control: a 6in liner (the app default) moves the lag past what the note quotes', () => {
    const r = LAG.find((x) => x.moment === 'drilling break, Ekene Sand top');
    const wrong = lagAtBit(Number(r.bit_md_m), 180, rigConfigFromSheet({ pump: { linerIn: 6 } }));
    expect(Math.abs(Math.round(wrong.lagStrokes) - Number(r.lag_strokes))).toBeGreaterThan(100);
    expect(fmtMin(wrong.lagTimeMin)).not.toBe(r.lag_time_at_this_rate);
  });

  test('negative control: the 13-3/8in shoe typed in metres into the feet field moves the lag', () => {
    const r = LAG.find((x) => x.moment === 'end of the bit run');
    const wrong = lagAtBit(1650, 180, rigConfigFromSheet({ toFt: [1530], fromFt: [null, 1530] }));
    expect(Math.abs(Math.round(wrong.lagStrokes) - Number(r.lag_strokes))).toBeGreaterThan(5);
  });
});

describe('Episode 37: the events, samples and sample schedule', () => {
  test('every event is in the app vocabulary and the rig events never overlap', () => {
    const events = [];
    const open = new Map();
    for (const r of LOG.filter((x) => x.event)) {
      const other = r.event === 'Flow check';
      const t = other ? EVENT_TYPES.find((e) => e.code === 'user_defined') : EVENT_TYPES.find((e) => e.name === r.event);
      expect(t).toBeTruthy();
      const ms = Date.parse(r.utc);
      if (r.action.startsWith('Start event')) open.set(r.event, { type: t.code, label: r.event, startUtcMs: ms, endUtcMs: null, duration: t.duration, family: t.family });
      else if (r.action.startsWith('End event')) { const e = open.get(r.event); e.endUtcMs = ms; events.push(e); open.delete(r.event); } else events.push({ type: t.code, label: r.event, startUtcMs: ms, endUtcMs: ms, duration: false, family: t.family });
    }
    events.push(...open.values());
    expect([...open.keys()]).toEqual(['Trip out']);           // still pulling out at the handover
    expect(validateEvents(events)).toEqual([]);
  });

  test('the programme schedules the 19 samples the sheet lists, three ahead of the bit', () => {
    const p = programmeChange(null, rows('Samples > Sampling programme').map((r) => ({
      fromMdM: Number(r['From (m)']), toMdM: r['To (m, empty for TD)'] === '' ? null : Number(r['To (m, empty for TD)']), intervalM: Number(r['Every (m)']),
    })), { authorisedBy: val('Samples > Sampling programme', 'authorised by'), atUtc: '2027-01-23T05:00:00Z', reason: val('Samples > Sampling programme', 'reason') });
    const programme = { ...p.payload };
    const S = sheet('ekene-11-samples.csv');
    const todo = samplesToSchedule(programme, [], { toMdM: 1650 });
    expect(todo.map((s) => [s.sample_no, Number(s.mdM.toFixed(1)), s.intervalM])).toEqual(S.map((s) => [Number(s.sample_no), Number(s.md_m), Number(s.interval_m)]));
    // at 06:00 the bit is at 1575.0 m: only the 1580 m sample is ahead of it
    expect(samplesToSchedule(programme, [], { toMdM: scheduleHorizonM(programme, 1575) }).map((s) => s.mdM)).toEqual([1580]);
    expect(NOTE).toContain(`The programme schedules ${S.length} samples, No 1 (1580.0 m) to No ${S.length} (1650.0 m)`);
  });

  test('the sample board: cut and arrival times at the log\'s pace', () => {
    const S = sheet('ekene-11-samples.csv');
    const samples = S.map((s) => ({ id: `s${s.sample_no}`, sample_no: Number(s.sample_no), md_calc_m: Number(s.md_m), interval_m: Number(s.interval_m) }));
    const end = Date.parse(LOG[LOG.length - 1].utc);
    const board = sampleBoard({ samples, stages: [], well: WELL, rigConfig: RIG, bitDepths: BITS, pumpEvents: PUMPS, nowUtcMs: end });
    for (const s of S) {
      const r = board.rows.find((x) => x.sample.sample_no === Number(s.sample_no));
      expect(toRigLocal(r.arrival.cutUtcMs, OFFSET).hhmm).toBe(s.cut_rig_time);
      expect(toRigLocal(r.arrival.arrivalUtcMs, OFFSET).hhmm).toBe(s.arrives_rig_time_at_log_pace);
      // the log catches each sample at or after it arrives, never before
      const c = LOG.find((x) => x.action === `Catch sample No ${s.sample_no} (${fmtDepth(Number(s.md_m), 'm')})`);
      expect(Date.parse(c.utc)).toBeGreaterThanOrEqual(r.arrival.arrivalUtcMs);
      expect(Date.parse(c.utc) - r.arrival.arrivalUtcMs).toBeLessThan(60000);
    }
  });

  test('the lithology in every sample is the kit rock model at Ekene-11', () => {
    // Ekene-11 exactly as buildKit builds it, with the facies tuning the kit recorded in its manifest
    const { tuning } = JSON.parse(read('MANIFEST.json'));
    const geo = makeGeology();
    const well = wellList(geo).find((w) => w.name === 'Ekene-11');
    const survey = buildSurvey(well, geo);
    const rock = synthesiseWell({ well, tops: topsForWell(well, survey, geo), survey, tvdAtMd, geo, tuning });
    for (const s of sheet('ekene-11-samples.csv')) {
      const md = Number(s.md_m); const top = Number(s.interval_top_m);
      const rs = rock.filter((r) => r.md > top + 1e-9 && r.md <= md + 1e-9);
      const f = (pred) => rs.filter(pred).length / rs.length;
      const sand = f((r) => r.vsh < VSH_CUT); const silt = f((r) => r.vsh >= VSH_CUT && r.vsh < SILT_MAX); const shale = f((r) => r.vsh >= SILT_MAX);
      expect(Math.abs(Number(s.sandstone_pct) - sand * 100)).toBeLessThanOrEqual(10);
      expect(Math.abs(Number(s.siltstone_pct) - silt * 100)).toBeLessThanOrEqual(10);
      expect(Math.abs(Number(s.shale_pct) - shale * 100)).toBeLessThanOrEqual(10);
      expect(Number(s.sandstone_pct) + Number(s.siltstone_pct) + Number(s.shale_pct)).toBe(100);
      expect(Number(s.oil_fraction_of_cuttings)).toBeCloseTo(f((r) => r.vsh < VSH_CUT && r.fluid === 'oil'), 2);
      // shale above the Ekene Sand top (1635.13 m), sand from the first sample below it
      if (md < 1635.13) expect(Number(s.shale_pct)).toBe(100); else expect(Number(s.sandstone_pct)).toBeGreaterThan(50);
    }
  });
});

describe('Episode 37: descriptions through the Describe screen', () => {
  const D = sheet('ekene-11-descriptions.csv');
  const bySample = new Map();
  for (const r of D) { if (!bySample.has(r.sample_no)) bySample.set(r.sample_no, []); bySample.get(r.sample_no).push(r); }
  const describe = (list) => ({
    components: list.map((r) => {
      const c = {};
      for (const a of ATTRIBUTES) {
        const p = parseField(a.key, r[a.label]);
        if (!p.ok) throw new Error(`sample ${r.sample_no} ${a.label} "${r[a.label]}": ${p.error}`);
        c[a.key] = p.value;
      }
      return c;
    }),
    comment: '',
  });

  test.each([...bySample.keys()])('sample No %s: every term is in the live vocabulary, and the abbreviation matches', (no) => {
    const list = bySample.get(no);
    const d = describe(list);
    const v = validateDescription(d);
    expect(v.errors).toEqual([]);
    expect(v.percentSum).toBe(100);
    expect(abbreviate(d, mergeProfile(null)).text).toBe(list[0].abbreviation);
  });

  test('the note quotes the first shale and the first sand', () => {
    expect(NOTE).toContain(`the first reads "${bySample.get('1')[0].abbreviation}"`);
    expect(NOTE).toContain(`Sample No 15 (1638.0 m) is the first sand: "${bySample.get('15')[0].abbreviation}"`);
    expect(bySample.get('15')[0].Lithology).toBe('sst');
    for (let i = 1; i < 15; i += 1) expect(bySample.get(String(i)).map((r) => r.Lithology)).toEqual(['sh']);
  });

  test('negative control: a term outside the vocabulary is refused', () => {
    expect(parseField('rounding', 'glassy').ok).toBe(false);
    expect(parseField('porosity', 'excellent').ok).toBe(false);
    expect(parseField('hardness', 'crumbly').ok).toBe(false);
  });
});

describe('Episode 37: shows, observations and tops', () => {
  const SH = sheet('ekene-11-shows.csv');
  const codeOf = (table, name) => SHOW_TABLES[table].find((t) => t.name === name).code;
  const showOf = (r, over = {}) => ({
    fluorescence: { colour: codeOf('fluorescenceColour', r['Fluorescence colour']), intensity: codeOf('fluorescenceIntensity', r['Fluorescence intensity']), distributionPct: Number(r['Fluorescence distribution'].replace(' percent', '')) },
    cut: { speed: codeOf('cutSpeed', r['Cut speed']), colour: codeOf('cutColour', r['Cut colour']), type: codeOf('cutType', r['Cut type']), ...(over.cut || {}) },
    stain: codeOf('stain', r.Stain), odour: codeOf('odour', r.Odour), residue: codeOf('residue', r.Residue), comment: '',
  });

  test.each(SH.map((r) => [r.sample_no, r]))('show on sample No %s: the derived quality', (_, r) => {
    const s = showOf(r);
    expect(validateShow(s)).toEqual([]);
    const q = showSummary(s);
    expect(q.qualityName).toBe(r.derived_quality);
    expect(q.score).toBe(Number(r.score));
    expect(q.text).toBe(r.summary);
    expect(showAbbrev(s)).toBe(r.table_abbreviation);
  });

  test('the note quotes the qualities; the shows sit above the oil water contact', () => {
    const at = (n) => SH.find((r) => r.sample_no === n);
    expect(NOTE).toContain(`the derived quality reads ${at('15').derived_quality} (score ${at('15').score} of 12)`);
    expect(NOTE).toContain(`The best is No 16 (1641.0 m), ${at('16').derived_quality} (${at('16').score})`);
    expect(NOTE).toContain(`No 17 (1644.0 m) fades to a ${at('17').derived_quality}`);
    expect(SH.map((r) => r.sample_no)).toEqual(['15', '16', '17']);
  });

  test('negative control: a fast cut on sample No 17 is another band', () => {
    const r = SH.find((x) => x.sample_no === '17');
    const q = showSummary(showOf(r, { cut: { speed: 'fast', type: 'streaming' } }));
    expect(q.qualityName).not.toBe(r.derived_quality);
  });

  test('every observation is one the Observations form accepts, with its depth', () => {
    const O = sheet('ekene-11-observations.csv');
    for (const r of O) {
      const t = OBSERVATION_TYPES.find((x) => x.name === r.type);
      expect(t).toBeTruthy();
      const depthEntry = r.depth_md_m ? { value: Number(r.depth_md_m), unit: 'm', reference: 'MD', datum: 'KB' } : null;
      const p = observationParams({ type: t.code, value: t.numeric ? Number(r.value) : null, unit: t.numeric ? r.unit : null, text: r.text, source: r.source, depthEntry, depthKind: r.depth === 'bit depth now' ? 'bit_depth' : 'lagged_sample' });
      const rec = buildRecord({ ...common, ...p, occurredAt: '2027-01-23T05:00:00Z' }).row;
      if (depthEntry) expect(rec.md_calc_m).toBeCloseTo(Number(r.depth_md_m), 9);
    }
    expect(O.some((r) => r.type === 'Total gas' && r.value === '1.7' && r.depth_md_m === '1638.0')).toBe(true);
    expect(O.some((r) => r.type === 'Geological note')).toBe(true);
    expect(NOTE).toContain('Total gas 1.7 percent on sample No 15 (1638.0 m)');
  });

  test('the prognosis Load from registry gives, the approach panel, and the call', () => {
    const regTops = parseCsv(read('01-wells/tops/Ekene-11-tops.csv')).map((r) => ({ id: r.top_name, name: r.top_name, md_m: Number(r.md_m), surface_type: 'formation_top' }));
    const prognosis = buildPrognosis({ wellId: WELL.id, version: 1, sources: { tops: regTops, geoWell: { id: 'geo-ekene-11' } }, offsetWells: [] });
    const T = sheet('ekene-11-tops.csv');
    for (const p of T.filter((r) => r.kind === 'prognosis')) {
      const pt = prognosis.tops.find((x) => x.name === p.formation);
      expect(`${fmtDepth(pt.md_m, 'm')} ±${fmtDepth(pt.uncertainty_m, 'm')}`).toBe(p.tops_table_shows);
    }
    expect(prognosis.offset_tops).toHaveLength(0);
    expect(NOTE).toContain(`prognosis version 1 with ${regTops.length} tops and 0 offset tops. The Ekene Sand reads 1635.1 m ±15.0 m`);
    // the approach panel at the first bit depth and at 11:00
    const at = (md) => formationBoard({ tops: [], prognosis, bitMdM: md, ctx: CTX });
    const b0 = at(1575.0);
    expect(b0.next.key).toBe('ekene_sand');
    expect(NOTE).toContain(`The approach panel reads: ${approachText(b0.next.panel.text)}`);
    expect(NOTE).toContain(`At 1631.8 m it reads: ${approachText(at(1631.8).next.panel.text)}`);
    // the interpretation, the call and its revision
    const depth = { value: 1635.1, unit: 'm', reference: 'MD', datum: 'KB' };
    expect(() => interpretationParams({ name: 'Ekene Sand', rangeTop: depth, rangeBase: { ...depth, value: 1638.0 }, confidence: 'high', basis: 'drilling break' })).not.toThrow();
    const v1 = callParams({ name: 'Ekene Sand', depth, status: 'preliminary', basis: 'drilling break at 1635.1 m' });
    expect(v1.formationKey).toBe('ekene_sand');
    expect(canTransition('preliminary', 'confirmed').ok).toBe(true);
    const c = toCanonicalMd({ ...depth, kind: 'logged' }, CTX);
    const stored = `Stored as ${fmtDepth(c.mdM, 'm')} MD below KB (${(c.mdM / 0.3048).toFixed(0)} ft); TVD ${fmtDepth(c.calculated.tvdM, 'm')}, subsea ${fmtDepth(c.calculated.tvdssM, 'm')} by minimum curvature on survey registry-1`;
    expect(NOTE).toContain(`The depth line reads: ${stored}.`);
    // the called top is the structural truth the kit carries for Ekene-11
    const truth = regTops.find((t) => t.name === 'Ekene Sand').md_m;
    expect(Math.abs(c.mdM - truth)).toBeLessThan(0.05);
    const calls = T.filter((r) => r.kind === 'call');
    expect(calls.map((r) => [r.md_m, r.status_or_confidence])).toEqual([['1635.1', 'preliminary'], ['1635.1', 'confirmed']]);
    expect(Number(calls[0].tvd_m)).toBeCloseTo(c.calculated.tvdM, 1);
  });
});

describe('Episode 37: the note and the folder', () => {
  test('copy rule: no em or en dashes, no "X, not Y" contrastives', () => {
    const texts = [NOTE, ...fs.readdirSync(path.join(KIT, DIR)).map((f) => read(`${DIR}/${f}`))];
    for (const t of texts) {
      expect(t).not.toMatch(/[—–]/);
      expect(t).not.toMatch(/, not /);
    }
  });

  test('the front page lists the folder and the chain reaches episode 37', () => {
    const start = read('00-START-HERE.md');
    expect(start).toContain('| `15-wellsite` |');
    expect(start).toContain('37 drills');
  });
});
