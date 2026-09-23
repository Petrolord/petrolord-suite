/**
 * Process safety (Wave D8, episodes 34 to 36): the kit's input sheets through
 * the apps' OWN study code into the engines.
 *
 * Each sheet in 14-process-safety/ is applied to the app's default study the
 * way a presenter types it (labels resolved against the app's own option
 * lists), then evaluated by the app's evaluateStudy / evaluateScenario, which
 * turn the typed text into engine inputs and call the vendored engines. The
 * numbers checked are the ones the episode notes quote, and each app has a
 * negative control: a wrong input moves the answer beyond the tolerance.
 * The consequence results feed the QRA; the chain is checked from the
 * consequence app's own outputs, never from retyped numbers.
 *
 * It reads the generated kit, so run the generator first:
 *
 *   npx tsx tools/demo-dataset/generate.mjs && npx jest tools/demo-dataset
 */
import fs from 'fs';
import path from 'path';
import * as CS from '../../../src/utils/processSafety/consequenceStudy';
import * as LS from '../../../src/utils/processSafety/lopaStudy';
import * as QS from '../../../src/utils/processSafety/qraStudy';
import {
  CONSEQUENCE_FIELDS, LOPA_FIELDS, QRA_FIELDS, QRA_SCENARIOS, FLASH_OPTIONS, ABOUT_SECTION,
  readCsv, applySheet,
} from '../domains/processsafety/sheets.mjs';

const KIT = path.join(__dirname, '..', '..', '..', 'dist-demo', 'ekene-demo-v1');
const read = (rel) => {
  const p = path.join(KIT, rel);
  if (!fs.existsSync(p)) {
    throw new Error(`${rel} is missing: run npx tsx tools/demo-dataset/generate.mjs first.`);
  }
  return fs.readFileSync(p, 'utf8');
};
const DIR = '14-process-safety';
const clone = (x) => JSON.parse(JSON.stringify(x));

/** |actual - quoted| within half a unit of the quoted number's last digit. */
const quoted = (actual, text) => {
  const s = String(text);
  const [mant, exp] = s.toLowerCase().split('e');
  const decimals = (mant.split('.')[1] || '').length;
  const half = 0.5 * 10 ** (-decimals) * (exp ? 10 ** Number(exp) : 1);
  expect(Math.abs(actual - Number(s))).toBeLessThanOrEqual(half * (1 + 1e-9));
};

/** Option label to the app's id, against the app module's own export. */
const resolver = (mod) => (name, label, kind) => {
  if (name === 'FLASH_OPTIONS') {
    const o = FLASH_OPTIONS.find((x) => x.label === label);
    if (!o) throw new Error(`no flash fire option '${label}'`);
    return o.value;
  }
  if (kind === 'preset') {
    const id = label.split(':')[0];
    if (!Object.prototype.hasOwnProperty.call(mod[name], id)) throw new Error(`no ${name} preset '${id}'`);
    return id;
  }
  const list = name.split('.').reduce((o, k) => o[k], mod);
  if (!Array.isArray(list)) throw new Error(`${name} is not an option list the app exports`);
  const hit = list.find((o) => (typeof o === 'string' ? o === label : o.label === label));
  if (hit === undefined) throw new Error(`'${label}' is not one of the app's ${name}`);
  return typeof hit === 'string' ? hit : hit.id;
};

const sheet = (name) => readCsv(read(`${DIR}/${name}`));
const note = (n, slug) => read(`episodes/episode-${n}-${slug}.md`);
const basis = () => readCsv(read(`${DIR}/ekene-alpha-scenario-basis.csv`));
const basisValue = (param) => {
  const row = basis().find((r) => r.parameter === param);
  if (!row) throw new Error(`the scenario basis has no '${param}'`);
  return row.value;
};

// -------------------------------------------------------------- 34

const consequenceStudy = () => applySheet(clone(CS.defaultStudy()), CONSEQUENCE_FIELDS, sheet('consequence-studio-inputs.csv'), resolver(CS));

describe('Episode 34: Consequence Modelling Studio takes its sheet', () => {
  const study = consequenceStudy();
  const ev = CS.evaluateStudy(study);
  const text = note(34, 'consequence-modelling-studio');

  test('every sheet is labelled a synthetic teaching case', () => {
    for (const f of ['consequence-studio-inputs.csv', 'lopa-sil-studio-inputs.csv', 'qra-studio-inputs.csv']) {
      expect(sheet(f)[0].section).toBe(ABOUT_SECTION);
      expect(sheet(f)[0].source).toMatch(/Synthetic teaching case/);
    }
    expect(basis()[0].basis).toMatch(/Synthetic teaching case/);
    for (const [n, slug] of [[34, 'consequence-modelling-studio'], [35, 'lopa-sil-studio'], [36, 'qra-studio']]) {
      const t = note(n, slug);
      expect(t).toMatch(/Synthetic teaching case/);
      expect(t).not.toMatch(/—|–/);
    }
    expect(read(`${DIR}/README.md`)).not.toMatch(/—|–/);
  });

  test('the source terms: 0.640 kg/s of gas, choked; 12.9 kg/s of oil; a 9.57 m pool', () => {
    expect(ev.source.gas.regime).toBe('CHOKED');
    quoted(ev.source.gas.massRateKgS, '0.640');
    quoted(ev.source.liquid.massRateKgS, '12.9');
    quoted(ev.source.volume.volumeM3, '2.70');
    quoted(ev.source.pool.equivalentDiameterM, '9.57');
    for (const s of ['0.640 kg/s', 'CHOKED', '12.9 kg/s', '2.70 m3', '9.57 m pool']) expect(text).toContain(s);
  });

  test('negative control: a 50 mm hole quadruples both rates (area, d squared) and moves the LFL distance', () => {
    const big = clone(study);
    big.source.gas.holeDiameterMm = '50';
    big.source.liquid.holeDiameterMm = '50';
    const e2 = CS.evaluateStudy(big);
    expect(e2.source.gas.massRateKgS / ev.source.gas.massRateKgS).toBeCloseTo(4, 12);
    expect(e2.source.liquid.massRateKgS / ev.source.liquid.massRateKgS).toBeCloseTo(4, 12);
    quoted(e2.source.gas.massRateKgS, '2.56');
    expect(text).toContain('2.56 kg/s');
    expect(Math.abs(e2.dispersion.distance.farDistanceM - 14.9)).toBeGreaterThan(5);
  });

  test('dispersion: the LFL is reached at 14.9 m; 97,000 ppm at the operator 10 m away', () => {
    expect(ev.dispersion.rate.from).toBe('gas-release');
    expect(ev.dispersion.distance.state).toBe('REACHED');
    quoted(ev.dispersion.distance.farDistanceM, '14.9');
    expect(Math.abs(ev.dispersion.centreline.concentrationPpm - 97000)).toBeLessThan(500);
    expect(text).toContain('LFL of 44,000 ppm at 14.9 m');
  });

  test('the pool fire: 6.92 kW/m2 at 15 m, 12.5 kW/m2 at 12.1 m, 4.7 at 16.9 m, 37.5 nowhere; 10 m is under the flame', () => {
    expect(ev.fire.burning.burningFluxKgM2S).toBeCloseTo(0.035 * (1 - Math.exp(-2.8 * ev.source.pool.equivalentDiameterM)), 12);
    quoted(ev.fire.flame.heatFluxWM2 / 1000, '6.92');
    quoted(ev.fire.flame.flameLengthM, '8.4');
    quoted(ev.fire.flame.tiltDeg, '54.8');
    quoted(ev.fire.distance.distanceFromCentreM, '12.1');
    const at = (patch) => CS.evaluateFire({ ...study.fire, ...patch }, ev.source);
    quoted(at({ targetHeatFluxKWM2: '4.7' }).distance.distanceFromCentreM, '16.9');
    expect(at({ targetHeatFluxKWM2: '37.5' }).distance.state).toBe('NOT_REACHED');
    const under = at({ distanceFromCentreM: '10' }).flame;
    expect(under.error).toBeTruthy();
    expect(under.field).toBe('tiltDeg');
    for (const s of ['8.4 m long', '54.8 degrees', '11.6 m', '6.92 kW/m2', '12.1 m', '16.9 m']) expect(text).toContain(s);
  });

  test('the explosion and the harm: 1.92 kg TNT, 13.5 kPa at 10 m, 10 kPa at 12.4 m; P = 2.1e-4 for 20 s at 15 m', () => {
    // the typed cloud mass is the app's own gas rate x distance to LFL / wind
    const cloud = ev.source.gas.massRateKgS * (ev.dispersion.distance.farDistanceM / Number(study.dispersion.windSpeedMS));
    quoted(cloud, study.explosion.fuelMassKg);
    quoted(ev.explosion.tnt.tntMassKg, '1.92');
    quoted(ev.explosion.overpressure.overpressurePa / 1000, '13.5');
    quoted(ev.explosion.distance.distanceM, '12.4');
    expect(ev.harm.flux.from).toBe('fire');
    quoted(ev.harm.thermal.probability, '2.1e-4');
    expect(ev.harm.op.from).toBe('explosion');
    for (const s of ['1.92 kg of TNT', '13.5 kPa at 10 m', '12.4 m', '2.1e-4']) expect(text).toContain(s);
  });
});

// -------------------------------------------------------------- 35

const lopaScenario = () => applySheet(clone(LS.blankScenario(2)), LOPA_FIELDS, sheet('lopa-sil-studio-inputs.csv'), resolver(LS));

describe('Episode 35: LOPA & SIL Studio takes its sheet', () => {
  const sc = lopaScenario();
  const ev = LS.evaluateScenario(sc);
  const text = note(35, 'lopa-sil-studio');

  test('the worksheet: 2.5e-4 per year without a SIF, RRF 25, SIL 1, required PFDavg 0.04; the alarm is not credited', () => {
    const w = ev.withoutSif;
    quoted(w.mitigatedFrequencyWithoutSifPerYr, '2.5e-4');
    expect(w.requiredRrf).toBeCloseTo(25, 9);
    expect(w.outcome).toBe('SIL1');
    expect(w.requiredSifPfdAvg).toBeCloseTo(0.04, 12);
    expect(w.notCredited.map((x) => x.name)).toEqual(['High pressure alarm and operator response']);
    for (const s of ['2.5e-4 per year', 'RRF of 25', 'PFDavg of 0.04']) expect(text).toContain(s);
  });

  test('the presence modifier is the QRA manning (the deck is occupied through the day shift)', () => {
    expect(sc.conditionalModifiers[0].probability).toBe(basisValue('Process deck occupied'));
  });

  test('the SIF: PFDavg 1.13e-2, RRF 88.6, SIL 1, the valve 1.1e-2 of it; 2.82e-6 per year meets the TMEL', () => {
    quoted(ev.sif.pfdAvg, '1.13e-2');
    quoted(ev.sif.rrf, '88.6');
    expect(ev.sif.sil).toBe(1);
    quoted(ev.subsystems[2].result.pfdAvg, '1.1e-2');
    quoted(ev.lopa.mitigatedFrequencyPerYr, '2.82e-6');
    expect(ev.lopa.meetsTmel).toBe(true);
    expect(ev.verdict.kind).toBe('meets');
    for (const s of ['1.13e-2', 'RRF 88.6', '2.82e-6']) expect(text).toContain(s);
  });

  test('negative control: ticking the alarm independent drops the requirement below SIL 1', () => {
    const wrong = clone(sc);
    wrong.ipls[1].independent = true;
    const w = LS.evaluateScenario(wrong).withoutSif;
    expect(w.outcome).toBe('RISK_REDUCTION_BELOW_SIL1');
    expect(w.requiredRrf).toBeCloseTo(2.5, 9);
    expect(text).toContain('falls to 2.5');
  });

  test('negative control: an 8 year valve proof test takes the SIF to 8.79e-2 and fails the TMEL', () => {
    const wrong = clone(sc);
    wrong.sif.subsystems[2].proofTestIntervalHours = '70080';
    const e2 = LS.evaluateScenario(wrong);
    quoted(e2.sif.pfdAvg, '8.79e-2');
    expect(e2.lopa.meetsTmel).toBe(false);
    expect(e2.verdict.kind).toBe('short');
    expect(text).toContain('8.79e-2');
  });
});

// -------------------------------------------------------------- 36

const places = () => ['Process deck', 'Control room', 'Accommodation'].map((name, j) => ({
  id: `l${j + 1}`,
  name,
  distanceM: Number(basisValue(`${name}: distance from the separator`)),
  people: Number(basisValue(`${name}: average people present`)),
}));

const qraStudy = () => {
  const s = clone(QS.defaultStudy());
  s.scenarios = QRA_SCENARIOS.map((x) => QS.blankScenario(x.id));
  s.locations = places().map((p) => QS.blankLocation(p.id));
  s.cells = {};
  for (const x of QRA_SCENARIOS) {
    s.cells[x.id] = {};
    for (const p of places()) s.cells[x.id][p.id] = QS.blankCell();
  }
  return applySheet(s, QRA_FIELDS, sheet('qra-studio-inputs.csv'), resolver(QS));
};

describe('Episode 36: QRA Studio takes its sheet, and Episode 34 feeds it', () => {
  const study = qraStudy();
  const ev = QS.evaluateStudy(study);
  const text = note(36, 'qra-studio');
  const cStudy = consequenceStudy();
  const cEv = CS.evaluateStudy(cStudy);
  const P = places();

  test('the chain: rate, flash fire envelope, heat flux, overpressure and fire duration are Episode 34\'s outputs', () => {
    quoted(cEv.source.gas.massRateKgS, study.eventTree.massRateKgS);
    const lfl = cEv.dispersion.distance.farDistanceM;
    for (const p of P) {
      expect(study.cells.s2[p.id].inFlame).toBe(p.distanceM < lfl);
      const fire = CS.evaluateFire({ ...cStudy.fire, distanceFromCentreM: String(p.distanceM) }, cEv.source).flame;
      if (fire.error) {
        expect(fire.field).toBe('tiltDeg');
        expect(study.cells.s4[p.id].inFlame).toBe(true);
      } else {
        expect(study.cells.s4[p.id].inFlame).toBe(false);
        quoted(fire.heatFluxWM2 / 1000, study.cells.s4[p.id].dose);
      }
      const blast = CS.evaluateExplosion({ ...cStudy.explosion, distanceM: String(p.distanceM) }).overpressure;
      quoted(blast.overpressurePa / 1000, study.cells.s3[p.id].dose);
    }
    // the pool burns out: spill mass / (burning flux x pool area)
    const burnOut = (cEv.source.volume.massKg) / (cEv.fire.burning.burningFluxKgM2S * cEv.source.pool.areaM2);
    quoted(burnOut, study.scenarios[3].fireDurationS);
    // the oil pool fire frequency is the oil release x Table 4.5 immediate ignition, which the studio looks up
    const oilIgnition = QS.evaluateIgnition({
      immediateMode: 'pb-table', releaseType: 'continuous', massRateKgS: String(cEv.source.liquid.massRateKgS), substance: 'k1-liquid',
    });
    expect(Number(study.scenarios[3].frequencyPerYr)).toBeCloseTo(Number(basisValue('Oil release, 25 mm, separator oil outlet')) * oilIgnition.probability, 15);
  });

  test('expected deaths N = people present x the app\'s probability of death, summed', () => {
    for (const s of study.scenarios) {
      const n = P.reduce((a, p) => a + p.people * ev.register.cells[s.id][p.id].probabilityOfDeath, 0);
      quoted(n, s.fatalities);
    }
  });

  test('the event tree: ignition 0.02; jet fire 4e-6, flash fire 1.18e-5, explosion 7.84e-6, no ignition 1.764e-4', () => {
    expect(ev.eventTree.ignition.probability).toBe(0.02);
    const t = ev.eventTree.tree.outcomeTotalsPerYr;
    quoted(t['jet or pool fire'], '4e-6');
    quoted(t['flash fire'], '1.18e-5');
    quoted(t.explosion, '7.84e-6');
    quoted(t['no ignition'], '1.764e-4');
    for (const s of ['0.6404 kg/s', 'immediate ignition 0.02', '1.18e-5', '7.84e-6', '1.764e-4', '6.5e-6']) expect(text).toContain(s);
  });

  test('risk: deck LSIR 2.026e-5, IRPA 2.53e-6 TOLERABLE, PLL 2.026e-5, FAR 0.0193, F-N below R2P2', () => {
    quoted(ev.register.locations[0].lsir.lsirPerYr, '2.026e-5');
    expect(ev.register.locations[1].lsir.lsirPerYr).toBeLessThan(1e-9);
    quoted(ev.individual.irpa.irpaPerYr, '2.53e-6');
    expect(ev.individual.irpaBand.band).toBe('TOLERABLE');
    quoted(ev.societal.pll.pllPerYr, '2.026e-5');
    quoted(ev.societal.far.far, '0.0193');
    const pts = ev.societal.curve.points;
    expect(pts.map((p) => p.fatalities)).toEqual([0.5, 1]);
    quoted(pts[0].cumulativeFrequencyPerYr, '2.23e-5');
    quoted(pts[1].cumulativeFrequencyPerYr, '1.83e-5');
    expect(ev.societal.comparison.state).toBe('BELOW');
    for (const s of ['2.026e-5', '2.53e-6', 'TOLERABLE', '0.0193', 'N 0.5 at 2.23e-5', 'N 1 at 1.83e-5']) expect(text).toContain(s);
  });

  test('negative control: delayed ignition 0.3 raises the IRPA to 5.47e-6', () => {
    const wrong = clone(study);
    wrong.eventTree.delayedIgnitionProbability = '0.3';
    const irpa = QS.evaluateStudy(wrong).individual.irpa.irpaPerYr;
    quoted(irpa, '5.47e-6');
    expect(Math.abs(irpa - ev.individual.irpa.irpaPerYr) / ev.individual.irpa.irpaPerYr).toBeGreaterThan(1);
    expect(text).toContain('5.47e-6');
  });

  test('cost-benefit: the PLL after is the same register at delayed ignition 0.05; USD 235 of benefit, GROSSLY_DISPROPORTIONATE', () => {
    const after = clone(study);
    after.eventTree.delayedIgnitionProbability = '0.05';
    quoted(QS.evaluateStudy(after).societal.pll.pllPerYr, study.costBenefit.pllAfterPerYr);
    const r = ev.costBenefit.result;
    expect(r.verdict).toBe('GROSSLY_DISPROPORTIONATE');
    quoted(r.presentValueBenefit, '235');
    quoted(r.costToBenefitRatio, '638');
    quoted(r.maximumReasonablyPracticableCost, '706');
    for (const s of ['USD 235', 'ratio 638', 'USD 706', 'GROSSLY_DISPROPORTIONATE']) expect(text).toContain(s);
  });
});
