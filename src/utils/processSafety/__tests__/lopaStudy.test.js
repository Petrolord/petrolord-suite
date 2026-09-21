/**
 * LOPA & SIL Studio data shaping (PS1).
 *
 * The engine has its own gate (packages/engines/__tests__/hse.lopa.test.js,
 * 91 tests against an independent oracle and the published Dolan SIF). These
 * pin the layer between the user's text and the engine: that the shim is the
 * vendored engine, that a blank stays absent and is never read as zero, that
 * the verdict is the engine's and the band is not mistaken for the target, and
 * that a saved study reads back.
 */
import * as shim from '@/utils/processSafety/engine/lopa';
import * as vendored from '../../../../packages/engines/engines/hse/lopa';
import {
  LOPA_OUTCOME, blankScenario, defaultStudy, evaluateScenario, exampleScenario, longestInterval,
  newIpl, parseIntervalsMonths, scenarioEngineInput, sensitivitySeries, sifVerdict, studyFromPayload,
  subsystemEngineInput, subsystemTarget, toNumber, formatSci, HOURS_PER_YEAR,
} from '@/utils/processSafety/lopaStudy';

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

describe('the engine shim', () => {
  it('re-exports the vendored engine itself', () => {
    expect(shim.lopaScenario).toBe(vendored.lopaScenario);
    expect(shim.pfdAvgSubsystem).toBe(vendored.pfdAvgSubsystem);
    expect(shim.pfdAvgSif).toBe(vendored.pfdAvgSif);
    expect(shim.maxProofTestInterval).toBe(vendored.maxProofTestInterval);
    expect(shim.proofTestSensitivity).toBe(vendored.proofTestSensitivity);
    expect(shim.LOPA_OUTCOME).toBe(vendored.LOPA_OUTCOME);
  });

  it('reproduces the published Dolan (2024) SIF through the shim', () => {
    // 61508 Association worked SIF, valve row: 1oo2, printed 1.05E-03
    // (FINDINGS-lopa.md section 2), called through the Suite's import path.
    const G = require('../../../../packages/engines/test-data/hse/goldens/lopa_cases.json');
    const valve = G.pfdPublished.find((c) => c.id === 'dolan-valve-1oo2');
    const r = shim.pfdAvgSubsystem(valve.params);
    expect(Number(r.pfdAvg.toPrecision(3))).toBe(1.05e-3);
  });

  it('bands an exact decade in the lower SIL band', () => {
    expect(shim.silFromPfdAvg(1e-2).sil).toBe(1);
    expect(shim.outcomeFromRequiredRrf(100).outcome).toBe(LOPA_OUTCOME.SIL1);
    expect(shim.outcomeFromRequiredRrf(0.1 * 0.1 * 0.1 / 1e-5).outcome).toBe(LOPA_OUTCOME.SIL1);
  });
});

describe('text to engine input', () => {
  it('keeps a blank absent and never turns it into zero', () => {
    expect(toNumber('')).toBeUndefined();
    expect(toNumber('   ')).toBeUndefined();
    expect(toNumber(null)).toBeUndefined();
    expect(toNumber('1e-5')).toBe(1e-5);
    expect(Number.isNaN(toNumber('abc'))).toBe(true);
    expect(Number.isNaN(toNumber('1e-4x'))).toBe(true);
  });

  it('a blank IEF is refused by the engine, which names the field', () => {
    const s = { ...exampleScenario(), iefPerYr: '' };
    const e = evaluateScenario(s);
    expect(e.lopa.error).toBeTruthy();
    expect(e.lopa.field).toBe('initiatingEventFrequencyPerYr');
  });

  it('a blank MTTR with detected failures is refused, where zero would have been accepted', () => {
    const s = exampleScenario();
    const sensor = s.sif.subsystems[0];
    const blank = subsystemEngineInput({ ...sensor, mttrHours: '' });
    expect(blank.mttrHours).toBeUndefined();
    expect(shim.pfdAvgSubsystem(blank).field).toBe('mttrHours');
  });

  it('sends the independence and auditability flags as the engine reads them', () => {
    const s = { ...exampleScenario(), ipls: [newIpl('A', '0.1', false, true), newIpl('B', '0.1', true, false), newIpl('C', '0.1', true, true)] };
    const input = scenarioEngineInput(s);
    expect(input.ipls.map((i) => [i.independent, i.auditable])).toEqual([[false, true], [true, false], [true, true]]);
    const r = shim.lopaScenario(input);
    expect(r.credited.map((c) => c.name)).toEqual(['C']);
    expect(r.notCredited.map((c) => c.reason)).toEqual([
      'not flagged independent (independent must be true to take credit)',
      'flagged not auditable',
    ]);
  });
});

describe('the example scenario', () => {
  const e = evaluateScenario(exampleScenario());

  it('works through to a SIL 1 requirement, with the uncredited alarm left out', () => {
    // 0.1 /yr x 0.5 x 0.01 (relief valve; the alarm is not independent) = 5e-4 /yr
    expect(rel(e.withoutSif.mitigatedFrequencyWithoutSifPerYr, 5e-4)).toBeLessThan(1e-12);
    expect(rel(e.withoutSif.requiredRrf, 50)).toBeLessThan(1e-12);
    expect(e.withoutSif.outcome).toBe(LOPA_OUTCOME.SIL1);
    expect(e.withoutSif.notCredited).toHaveLength(1);
  });

  it('the SIF total is the engine series sum of its subsystems', () => {
    const sum = e.subsystems.reduce((a, s) => a + s.result.pfdAvg, 0);
    expect(rel(e.sif.pfdAvg, sum)).toBeLessThan(1e-12);
    expect(e.sif.pfdAvg).toBeLessThan(e.withoutSif.requiredSifPfdAvg);
  });

  it('closes the loop: the SIF PFDavg goes back into the LOPA', () => {
    expect(e.lopa.sifPfdAvg).toBe(e.sif.pfdAvg);
    expect(rel(e.lopa.mitigatedFrequencyPerYr, 5e-4 * e.sif.pfdAvg)).toBeLessThan(1e-12);
    expect(e.verdict.kind).toBe('meets');
    expect(e.verdict.meetsTmel).toBe(true);
  });
});

describe('the verdict', () => {
  it('is taken on the required PFDavg: a SIF in the right band can still fall short', () => {
    // The engine's own sif-just-short case: SIL 2 band at 5e-3 against a
    // required 3.33e-3 (RRF 300).
    const lopa = shim.lopaScenario({ initiatingEventFrequencyPerYr: 3e-3, tmelPerYr: 1e-5, sifPfdAvg: 5e-3 });
    expect(lopa.outcome).toBe(LOPA_OUTCOME.SIL2);
    const v = sifVerdict(lopa, { pfdAvg: 5e-3, sil: 2 });
    expect(v.meetsSilBand).toBe(true);
    expect(v.meetsRequiredPfd).toBe(false);
    expect(v.kind).toBe('short');
  });

  it('names a redesign and never verifies a SIF against it', () => {
    const lopa = shim.lopaScenario({ initiatingEventFrequencyPerYr: 1, tmelPerYr: 1e-6 });
    expect(lopa.outcome).toBe(LOPA_OUTCOME.BEYOND_SIL3);
    expect(sifVerdict(lopa, { pfdAvg: 1e-4, sil: 3 }).kind).toBe('redesign');
  });

  it('has no SIL band to meet below SIL 1', () => {
    const lopa = shim.lopaScenario({ initiatingEventFrequencyPerYr: 5e-5, tmelPerYr: 1e-5, sifPfdAvg: 0.15 });
    expect(lopa.outcome).toBe(LOPA_OUTCOME.BELOW_SIL1);
    const v = sifVerdict(lopa, { pfdAvg: 0.15, sil: null });
    expect(v.meetsSilBand).toBeNull();
    expect(v.meetsRequiredPfd).toBe(true);
  });

  it('is absent while the SIF is switched off', () => {
    const s = exampleScenario();
    s.sif.enabled = false;
    const e = evaluateScenario(s);
    expect(e.verdict).toBeNull();
    expect(e.lopa.sifPfdAvg).toBeUndefined();
  });
});

describe('proof test interval', () => {
  const s = exampleScenario();
  const valve = s.sif.subsystems.find((x) => x.role === 'final');

  it('parses months, sorts them and reports what it ignored', () => {
    const p = parseIntervalsMonths('12, 3, x, 3, -1, 6');
    expect(p.months).toEqual([3, 6, 12]);
    expect(p.hours).toEqual([2190, 4380, 8760]);
    expect(p.bad).toEqual(['x', '-1']);
  });

  it('the series is engine values: subsystem from pfdAvgSubsystem, SIF from pfdAvgSif', () => {
    const hours = [4380, 8760, 17520];
    const r = sensitivitySeries(s, valve.id, hours);
    expect(r.rows).toHaveLength(3);
    r.rows.forEach((row, i) => {
      const sub = shim.pfdAvgSubsystem(subsystemEngineInput(valve, { proofTestIntervalHours: hours[i] }));
      expect(row.subsystemPfd).toBe(sub.pfdAvg);
      const sif = shim.pfdAvgSif(s.sif.subsystems.map((x) => subsystemEngineInput(
        x, x.id === valve.id ? { proofTestIntervalHours: hours[i] } : {},
      )));
      expect(row.sifPfd).toBe(sif.pfdAvg);
    });
    expect(r.rows[2].sifPfd).toBeGreaterThan(r.rows[0].sifPfd);
  });

  it('carries the lambda x T warning from the engine', () => {
    const r = sensitivitySeries(s, valve.id, [HOURS_PER_YEAR * 10]);
    expect(r.rows[0].warnings.join(' ')).toMatch(/exceeds 0\.1/);
  });

  it('the share target is the required PFDavg less the other subsystems', () => {
    const e = evaluateScenario(s);
    const t = subsystemTarget(s, e, valve.id);
    const others = e.subsystems.filter((x) => x.id !== valve.id).reduce((a, x) => a + x.result.pfdAvg, 0);
    expect(rel(t.target, e.withoutSif.requiredSifPfdAvg - others)).toBeLessThan(1e-12);
    const found = longestInterval(s, valve.id, t.target);
    expect(found.state).toBe('FOUND');
    // at the interval found, the subsystem sits on its share
    expect(rel(found.pfdAvg, t.target)).toBeLessThan(1e-9);
    expect(found.proofTestIntervalHours).toBeGreaterThan(HOURS_PER_YEAR);
  });

  it('reports UNACHIEVABLE when the interval independent floor is above the target', () => {
    const r = longestInterval(s, s.sif.subsystems[0].id, 1e-7);
    expect(r.state).toBe('UNACHIEVABLE');
    expect(r.floorPfdAvg).toBeGreaterThan(1e-7);
  });

  it('reports INTERVAL_INDEPENDENT when lambda DU is zero', () => {
    const t = { ...s, sif: { ...s.sif, subsystems: [{ ...valve, lambdaDuPerHour: '0', lambdaDdPerHour: '1e-6', mttrHours: '8' }] } };
    expect(longestInterval(t, valve.id, 1e-3).state).toBe('INTERVAL_INDEPENDENT');
  });

  it('refuses, with the field, a subsystem whose interval independent floor reaches a PFDavg of 1', () => {
    // engines #232, golden maxT-refused-floor: the search used to report this
    // as UNACHIEVABLE; it now refuses as pfdAvgSubsystem does, so the panel
    // shows the engine's refusal (EngineError) and never a blank state.
    const t = { ...s, sif: { ...s.sif, subsystems: [{ ...valve, architecture: '1oo1', lambdaDuPerHour: '1e-6', lambdaDdPerHour: '1e-3', mttrHours: '2000' }] } };
    const r = longestInterval(t, valve.id, 1e-2);
    expect(r.state).toBeUndefined();
    expect(r.field).toBe('lambdaDdPerHour');
    expect(r.error).toMatch(/^lambdaDdPerHour: the simplified equations give a floor of 2\.0000\d* here/);
    expect(r.error).toMatch(/use an exact \(Markov\) model$/);
  });

  it('reports CAPPED_AT_LIFETIME under imperfect proof testing', () => {
    const t = { ...s, sif: { ...s.sif, subsystems: [{ ...valve, lambdaDuPerHour: '1e-8', proofTestCoverage: '0.9', lifetimeHours: '87600' }] } };
    expect(longestInterval(t, valve.id, 1e-2).state).toBe('CAPPED_AT_LIFETIME');
  });

  it('says so when no SIF PFDavg is required to share out', () => {
    const t = { ...s, tmelPerYr: '1' };
    const e = evaluateScenario(t);
    expect(e.withoutSif.outcome).toBe(LOPA_OUTCOME.NO_SIF_REQUIRED);
    expect(subsystemTarget(t, e, valve.id).error).toMatch(/no required SIF PFDavg/);
  });
});

describe('a saved study', () => {
  it('reads back what it wrote', () => {
    const study = defaultStudy();
    const back = studyFromPayload(JSON.parse(JSON.stringify({ name: 'x', schema: 1, study })));
    expect(back).toEqual(study);
  });

  it('fills fields a study saved before they existed', () => {
    const s = blankScenario(2);
    delete s.sensitivity;
    delete s.enablingConditions;
    const back = studyFromPayload({ study: { scenarios: [s], activeScenarioId: 'gone' } });
    expect(back.scenarios[0].enablingConditions).toEqual([]);
    expect(back.scenarios[0].sensitivity.targetMode).toBe('share');
    expect(back.activeScenarioId).toBe(s.id);
  });

  it('refuses a payload that is not a study', () => {
    expect(studyFromPayload(null)).toBeNull();
    expect(studyFromPayload({ inputs: {} })).toBeNull();
    expect(studyFromPayload({ study: { scenarios: [] } })).toBeNull();
  });
});

describe('number display', () => {
  it('prints small values in scientific form and never invents a value', () => {
    expect(formatSci(1.286431e-3)).toBe('1.29e-3');
    expect(formatSci(50)).toBe('50');
    expect(formatSci(NaN)).toBe('n/a');
    expect(formatSci(undefined)).toBe('n/a');
  });
});
