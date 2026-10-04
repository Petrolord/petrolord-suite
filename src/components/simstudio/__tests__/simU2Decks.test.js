/**
 * SIM-U2 deck items through the Model Builder: the decks the app generates,
 * checked against the checked-in worker fixtures, which the sim-worker image
 * runs in OPM Flow (tests/integration/test_u2_deck.py, the isolated gate).
 *   GEN_SIM_FIXTURE=1 npx jest src/components/simstudio/__tests__/simU2Decks.test.js
 * regenerates the fixtures (a drift between builder and fixture fails here).
 *
 * 001: observed bottomhole pressure through the per-well history door
 * (WCONHIST item 10, WBHPH), and the mismatch the report prints.
 */
import fs from 'fs';
import path from 'path';
import { defaultBuilderForm, buildDeckFromForm, buildPvtFromFluid } from '@/utils/simDeckBuilder';
import { summarizeDeck } from '@/utils/simstudio/deckSummary';
import { threePhaseWords } from '@/utils/simstudio/reportModel';
import { parseWellRateCsv, historyFromWellRows, pressureToPsia } from '@/utils/simWellHistoryImport';
import { bhpMatch, rms } from '@/utils/simstudio/bhpMatch';
import { buildSimReportModel } from '@/utils/simstudio/reportModel';
import { collectSimReportArgs } from '@/utils/simstudio/reportExport';

const GEN = path.join(__dirname, '../../../../worker/sim-worker/tests/integration/fixtures/generated');
const fixture = (name, deck) => {
  const file = path.join(GEN, name);
  if (process.env.GEN_SIM_FIXTURE === '1') fs.writeFileSync(file, deck);
  expect(fs.existsSync(file)).toBe(true);
  expect(fs.readFileSync(file, 'utf8')).toBe(deck);
};

// six monthly periods; PROD1 at its observed rates with a falling observed BHP
// in five of them, INJ1 injecting with an observed BHP in four (blanks left)
export const BHP_CSV = [
  'date, well, oil (STB/d), water (STB/d), gas (Mscf/d), bhp (psia)',
  '2025-01-01, PROD1, 2000, 0, 1600, 3600',
  '2025-01-01, INJ1, , 2500, , 4700',
  '2025-02-01, PROD1, 2000, 0, 1600, 3450',
  '2025-02-01, INJ1, , 2500, , 4750',
  '2025-03-01, PROD1, 1900, 20, 1520, 3330',
  '2025-03-01, INJ1, , 2500, ,',
  '2025-04-01, PROD1, 1800, 40, 1440, 3260',
  '2025-04-01, INJ1, , 2500, , 4800',
  '2025-05-01, PROD1, 1800, 60, 1440,',
  '2025-05-01, INJ1, , 2500, ,',
  '2025-06-01, PROD1, 1700, 80, 1360, 3180',
  '2025-06-01, INJ1, , 2500, , 4820',
].join('\n');

export function bhpForm() {
  const f = defaultBuilderForm();
  f.title = 'U2 BHP history';
  const parsed = parseWellRateCsv(BHP_CSV);
  const h = historyFromWellRows(parsed.rows, f.wells);
  f.history = {
    ...f.history, enabled: true, source: 'perwell', caseName: 'bhp-history.csv',
    startDate: h.startDate, endDate: h.endDate, periods: h.periods, wellSummary: h.wellSummary, predictionYears: '1',
  };
  return f;
}

describe('SIM-U2-001: observed bottomhole pressure through the per-well door', () => {
  it('reads the bhp column, converts gauge and SI to psia (one known value each), and says so', () => {
    const p = parseWellRateCsv(BHP_CSV);
    expect(p.errors).toEqual([]);
    expect(p.columns).toEqual(['date', 'well', 'oil', 'water', 'gas', 'bhp']);
    expect(p.rows[0]).toMatchObject({ well: 'PROD1', oil: 2000, bhp: 3600 });
    expect(p.readBack.join(' ')).toMatch(/bhp: column "bhp \(psia\)" read as psia \(from the header\); written as the observed BHP of the period \(WBHPH\)/);
    expect(pressureToPsia(100, 'psig')).toBeCloseTo(114.696, 9);
    expect(pressureToPsia(100, 'bar')).toBeCloseTo(1450.377, 3); // 100 bar = 10 MPa = 1450.377 psi
    expect(pressureToPsia(0, 'barg')).toBeCloseTo(14.696, 2);
    expect(pressureToPsia(20, 'MPa')).toBeCloseTo(2900.755, 3);
    expect(pressureToPsia(1, 'atm')).toBeNull();
    const g = parseWellRateCsv('date,well,oil,bhp (barg)\n2025-01-01,PROD1,100,200');
    expect(g.rows[0].bhp).toBeCloseTo(pressureToPsia(201.01325, 'bar'), 9);
    expect(g.readBack.join(' ')).toMatch(/gauge made absolute with 1.01325 bar of standard atmosphere/);
  });

  it('refuses a pressure with no rates (it would shut the well) and a unit it does not read', () => {
    const r = parseWellRateCsv('date,well,oil,water,bhp\n2025-01-01,PROD1,,,3000');
    expect(r.errors.join(' ')).toMatch(/Line 2: a bottomhole pressure with no rate/);
    expect(r.rows[0].bhp).toBeUndefined();
    expect(parseWellRateCsv('date,well,oil,bhp (atm)\n2025-01-01,PROD1,100,200').errors.join(' ')).toMatch(/headed "atm", a unit this door does not read/);
    expect(parseWellRateCsv('date,well,oil,bhp\n2025-01-01,PROD1,100,-5').errors.join(' ')).toMatch(/not a positive absolute pressure/);
  });

  it('the periods carry the pressure; the deck writes WCONHIST item 10, WCONINJH item 5 and asks for WBHPH', () => {
    const f = bhpForm();
    expect(f.history.wellSummary.map((w) => [w.name, w.bhpPoints])).toEqual([['PROD1', 5], ['INJ1', 4]]);
    const out = buildDeckFromForm(f);
    expect(out.ok).toBe(true);
    expect(out.deck).toContain("'PROD1' 'OPEN' 'ORAT' 2000 0 1600 3* 3600 /");
    expect(out.deck).toContain("'INJ1' 'WATER' 'OPEN' 2500 4700 /");
    expect(out.deck).toContain("'INJ1' 'WATER' 'OPEN' 2500 /");
    expect(out.deck).toMatch(/\nWBHPH\n\/\n/);
    fixture('BUILT_BHP.DATA', out.deck);
    // negative control: the same history without the pressure column has no WBHPH
    const noP = bhpForm();
    noP.history.periods = noP.history.periods.map((p) => ({ ...p, prod: p.prod.map(({ bhp, ...r }) => r), inj: p.inj.map(({ bhp, ...r }) => r) }));
    const d2 = buildDeckFromForm(noP).deck;
    expect(d2).not.toContain('WBHPH');
    expect(d2).not.toContain('3* 3600');
  });
});

// a summary shaped as the worker writes it (FIELD): two steps per period
const DAYS = [15, 31, 45, 59, 75, 90, 120, 151];
const summaryOf = (wbhph = true) => ({
  start_date: '2025-01-01', unit_system: 'FIELD', days: DAYS, field: { FOPR: DAYS.map(() => 2000) },
  wells: {
    PROD1: { WBHP: [3610, 3590, 3470, 3440, 3350, 3320, 3000, 2950], ...(wbhph ? { WBHPH: [3600, 3600, 3450, 3450, 3330, 3330, 0, 0] } : {}) },
    INJ1: { WBHP: [4690, 4710, 4760, 4770, 4800, 4790, 4900, 4910], ...(wbhph ? { WBHPH: [4700, 4700, 4750, 4750, 0, 0, 0, 0] } : {}) },
  },
});
const OPTS = { deckSystem: 'FIELD', system: 'oilfield' };

describe('SIM-U2-001: the mismatch by well and the RMS', () => {
  it('one point per observed period: the observation against the time-weighted simulated WBHP of its steps', () => {
    const m = bhpMatch({ summary: summaryOf(), opts: OPTS, historyEnd: '2025-04-01' });
    expect(m.applies).toBe(true);
    expect(m.source).toBe('WBHPH');
    const p = m.wells.find((w) => w.well === 'PROD1');
    expect(p.points).toBe(3);
    // hand: January steps of 15 and 16 days, (3610 x 15 + 3590 x 16) / 31 against 3600
    expect(p.pairs[0]).toMatchObject({ day: 31, obs: 3600, steps: 2 });
    expect(p.pairs[0].sim).toBeCloseTo(111590 / 31, 9);
    const res = [111590 / 31 - 3600, 3455 - 3450, 103400 / 31 - 3330];
    expect(p.rms).toBeCloseTo(rms(res), 12);
    expect(p.bias).toBeCloseTo((res[0] + res[1] + res[2]) / 3, 12);
    expect(p.maxAbs).toBeCloseTo(103400 / 31 - 3330, 12);
    const i = m.wells.find((w) => w.well === 'INJ1');
    expect(i.points).toBe(2);
    expect(m.overall.points).toBe(5);
    expect(m.overall.rms).toBeCloseTo(rms([...res, 145710 / 31 - 4700, 4765 - 4750]), 12);
    expect(m.overall.rms).toBeCloseTo(7.487, 3);
    // SI display: kPa (1 psi = 6.894757 kPa)
    const si = bhpMatch({ summary: summaryOf(), opts: { deckSystem: 'FIELD', system: 'si' }, historyEnd: '2025-04-01' });
    expect(si.unit).toBe('kPa');
    expect(si.wells[0].maxAbs).toBeCloseTo((103400 / 31 - 3330) * 6.894757, 3);
  });

  it('negative controls: no observation does not apply; a time step after the history end is never matched; zero WBHPH is no observation', () => {
    const none = bhpMatch({ summary: summaryOf(false), opts: OPTS, historyEnd: '2025-04-01' });
    expect(none.applies).toBe(false);
    expect(none.reason).toMatch(/no observed bottomhole pressure/);
    // the H value the simulator keeps after the history end is not an observation
    const s = summaryOf();
    s.wells.PROD1.WBHPH = [3600, 3600, 3450, 3450, 3330, 3330, 3330, 3330];
    expect(bhpMatch({ summary: s, opts: OPTS, historyEnd: '2025-04-01' }).wells[0].pairs[2].steps).toBe(2);
    expect(bhpMatch({ summary: s, opts: OPTS, historyEnd: null }).wells[0].pairs[2].steps).toBe(4);
    expect(bhpMatch({ summary: summaryOf(), opts: OPTS, historyEnd: null }).wells[0].points).toBe(3);
  });

  it('falls back to the builder form that made the deck when the run has no WBHPH, and says so', () => {
    const f = bhpForm();
    const s = summaryOf(false);
    const m = bhpMatch({ summary: s, opts: OPTS, historyEnd: f.history.endDate, form: f, formApplies: true });
    expect(m.source).toBe('form');
    expect(m.echo).toBeNull();
    const p = m.wells.find((w) => w.well === 'PROD1');
    // January, February, March and April observed; May left blank in the file
    expect(p.points).toBe(4);
    expect(p.pairs[0].obs).toBe(3600);
    expect(p.pairs[0].sim).toBeCloseTo(111590 / 31, 9);
    expect(p.pairs[1].obs).toBe(3450);
    // a form that did not make the deck is never used
    expect(bhpMatch({ summary: s, opts: OPTS, historyEnd: f.history.endDate, form: f, formApplies: false }).applies).toBe(false);
  });

  it('the form is the source when it made the deck; the run\'s WBHPH is checked against it, and a carried value is not an observation', () => {
    const f = bhpForm();
    // as OPM Flow reports it (isolated gate): the April observation carried through May for PROD1
    const s = summaryOf(true);
    s.days = [31, 59, 90, 120, 151, 181];
    s.wells = {
      PROD1: { WBHP: [3590, 3440, 3320, 3250, 3200, 3170], WBHPH: [3600, 3450, 3330, 3260, 3260, 3180] },
      INJ1: { WBHP: [4710, 4770, 4790, 4805, 4810, 4815], WBHPH: [4700, 4750, 4750, 4800, 4800, 4820] },
    };
    const m = bhpMatch({ summary: s, opts: OPTS, historyEnd: f.history.endDate, form: f, formApplies: true });
    expect(m.source).toBe('form');
    expect(m.wells.find((w) => w.well === 'PROD1').points).toBe(5);
    expect(m.wells.find((w) => w.well === 'INJ1').points).toBe(4);
    expect(m.echo).toEqual({ checked: 9, differ: 0 });
    // negative control: WBHPH alone takes the carried May value as part of the April observation
    const alone = bhpMatch({ summary: s, opts: OPTS, historyEnd: f.history.endDate }).wells.find((w) => w.well === 'PROD1');
    expect(alone.pairs[3]).toMatchObject({ obs: 3260, steps: 2 });
    expect(m.wells.find((w) => w.well === 'PROD1').pairs[3]).toMatchObject({ obs: 3260, steps: 1, sim: 3250 });
    // a simulator that read another pressure is caught
    s.wells.PROD1.WBHPH[0] = 3500;
    expect(bhpMatch({ summary: s, opts: OPTS, historyEnd: f.history.endDate, form: f, formApplies: true }).echo).toEqual({ checked: 9, differ: 1 });
  });

  it('the report prints the table, the RMS and the figure', () => {
    const run = { id: 'r1', status: 'complete', deck_sha256: 'x' };
    const deckText = buildDeckFromForm(bhpForm()).deck;
    const summary = summaryOf();
    const model = buildSimReportModel({ caseRow: { name: 'BHP case', deck_source: 'generated' }, run, summary, deckText, system: 'oilfield' });
    expect(model.bhpMatch.applies).toBe(true);
    expect(model.bhpMatch.rows[0]).toEqual(['PROD1', '3', '3,330.0 to 3,600.0', '4.3', '3.4', '5.5']);
    expect(model.bhpMatch.rows[2]).toEqual(['All wells', '5', 'n/a', '7.5', 'n/a', 'n/a']);
    expect(model.bhpMatch.text).toMatch(/^RMS mismatch 7\.5 psia over 5 points in 2 wells/);
    expect(model.limits.assumptions.join(' ')).toMatch(/the bottomhole pressure is the test of the match, observed as WBHPH, RMS 7\.5 psia/);
    const { figures } = collectSimReportArgs({ caseRow: { name: 'BHP case', deck_source: 'generated' }, run, summary, deckText, system: 'oilfield' });
    const fig = figures.find((x) => x.id === 'bhp-match');
    expect(fig.panels.length).toBe(2);
    expect(fig.panels[0].spec.series[1].pts.length).toBe(3);
    expect(fig.caption).toMatch(/RMS 7\.5 psia over 5 points/);
    // a deck with no history: the figure says why
    const plain = collectSimReportArgs({ caseRow: { name: 'x', deck_source: 'generated' }, run, summary: { ...summary, wells: {} }, deckText: buildDeckFromForm(defaultBuilderForm()).deck, system: 'oilfield' });
    expect(plain.figures.find((x) => x.id === 'bhp-match').statement).toMatch(/^Does not apply: The deck carries no observed bottomhole pressure/);
  });
});

// ---- SIM-U2-003: three-phase oil relative permeability --------------------

/**
 * A model where oil, water and gas all flow: the reservoir starts 150 psi
 * above the bubble point, the producer draws it below (free gas) while a
 * water leg in the bottom layer and a water injector bring water to it.
 */
export function threePhaseForm(model) {
  const f = defaultBuilderForm();
  f.title = 'U2 three-phase kr';
  const { pb } = buildPvtFromFluid(f.fluid);
  f.equil = { ...f.equil, datumPressure: String(Math.round(pb + 150)), owc: '8070', goc: '' };
  f.wells = f.wells.map((w) => (w.type === 'producer' ? { ...w, rate: '6000', bhp: '800' } : { ...w, rate: '6000', bhp: '6000' }));
  f.schedule = { years: '3', reportDays: '30.4375' };
  f.scal = { ...f.scal, threePhase: model };
  return f;
}

describe('SIM-U2-003: the three-phase oil kr model in the deck and the report', () => {
  it('STONE1 and STONE2 are written after the two-phase tables and stated in the deck; the default writes no keyword', () => {
    const decks = {};
    for (const [model, file] of [['', 'BUILT_3PH_DEFAULT.DATA'], ['stone1', 'BUILT_3PH_STONE1.DATA'], ['stone2', 'BUILT_3PH_STONE2.DATA']]) {
      const out = buildDeckFromForm(threePhaseForm(model));
      expect(out.ok).toBe(true);
      decks[model] = out.deck;
      fixture(file, out.deck);
    }
    expect(decks.stone1).toMatch(/\nSTONE1\n\nDENSITY/);
    expect(decks.stone1).toContain('-- Three-phase oil kr: STONE1 (Stone 1970, the first model), chosen in the deck builder; built from the two-phase sets above (SWOF krow, SGOF krog)');
    expect(decks.stone2).toMatch(/\nSTONE2\n\nDENSITY/);
    expect(decks['']).not.toMatch(/STONE/);
    // negative control: the explicit default writes no keyword, only the comment that says so
    const explicit = buildDeckFromForm(threePhaseForm('default')).deck;
    expect(explicit).not.toMatch(/^STONE/m);
    expect(explicit.replace(/-- Three-phase oil kr: .*\n/, '')).toBe(decks['']);
    expect(summarizeDeck(decks.stone2).threePhase).toBe('STONE2');
    expect(summarizeDeck(decks['']).threePhase).toBeNull();
    // the report words follow the deck that ran, not the form
    expect(threePhaseWords(summarizeDeck(decks.stone1), threePhaseForm('stone1'), true)).toBe("Stone's first model (Stone 1970, STONE1), as the deck asks (chosen in the Model Builder)");
    expect(threePhaseWords(summarizeDeck(decks['']), threePhaseForm('stone1'), true)).toMatch(/^OPM Flow's default three-phase model/);
    expect(() => buildDeckFromForm(threePhaseForm('stone3'))).not.toThrow();
    expect(buildDeckFromForm(threePhaseForm('stone3')).errors.join(' ')).toMatch(/unknown three-phase model/);
  });
});
