// EOR-U2-008: the oil composition from a compositional Fluid Systems Studio
// project, for the CO2 MMP correlation. C1 + N2 is taken (normalised to
// 100 mol %). C2 to C10 is NOT taken: the Fluid composition lumps C7 and
// heavier into C7+, so C7 to C10 cannot be separated; the known part
// (C2 to C6 with CO2) is printed as a lower bound, never assumed to be the
// whole. Read by id from the saved project.
import { SCHEMA_1_TUNED_EOS } from '@/components/fluidstudio/__fixtures__/savedProjects';
import { eorCompositionIntake } from '../intakes';
import { eorMmpCheck } from '../mmp';

const AT = '2026-10-04T11:00:00.000Z';

describe('composition from a compositional pvt project', () => {
  it('takes C1 + N2 from the feed, normalised, and names the project and the method', () => {
    const r = eorCompositionIntake(SCHEMA_1_TUNED_EOS.inputs, { recordId: 'f-9', recordName: 'Ekene E-2000 oil', at: AT });
    expect(r.ok).toBe(true);
    expect(r.context).toEqual({ volatilesMolPct: '40' });
    expect(r.methods.volatilesMolPct).toMatch(/C1 40 \+ N2 0 mol %/);
    expect(r.methods.volatilesMolPct).toMatch(/Fluid Systems Studio, project "Ekene E-2000 oil"/);
    // C2..nC6 + CO2 = 7+6+5+6+2 = 26: a lower bound of C2 to C10, not taken
    expect(r.intermediatesLowerBound).toBe(26);
    expect(r.notTaken).toMatch(/C7\+ \(34 mol %\)/);
    expect(r.context.intermediatesMolPct).toBeUndefined();
  });
  it('normalises a feed that does not sum to 100', () => {
    const inputs = { fluidModel: 'eos', streamA: { composition: { zPct: { N2: 1, C1: 39, C2: 10, 'C7+': 50 } } } };
    const r = eorCompositionIntake({ ...inputs, streamA: { composition: { zPct: { N2: 2, C1: 78, C2: 20, 'C7+': 100 } } } }, { at: AT });
    expect(r.context.volatilesMolPct).toBe('40');
    expect(eorCompositionIntake(inputs, { at: AT }).context.volatilesMolPct).toBe('40');
  });
  it('negative controls: a black-oil project or an empty feed gives nothing; the MMP is not made from C1 + N2 alone', () => {
    expect(eorCompositionIntake({ ...SCHEMA_1_TUNED_EOS.inputs, fluidModel: 'black-oil' }).ok).toBe(false);
    expect(eorCompositionIntake({ fluidModel: 'eos', streamA: { composition: { zPct: {} } } }).ok).toBe(false);
    const r = eorCompositionIntake(SCHEMA_1_TUNED_EOS.inputs, { at: AT });
    expect(eorMmpCheck({ form: { temperatureF: '200' }, context: { ...r.context } }).status).toBe('not made');
  });
});

describe('withComposition', () => {
  // eslint-disable-next-line global-require
  const { eorPvtIntake, withComposition: wc, intakeSourceText } = require('../intakes');
  // eslint-disable-next-line global-require
  const { fluidBlock } = require('./eorTestKit');
  it('adds C1 + N2 to the pvt intake with its source; the source column names the feed', () => {
    const pvt = eorPvtIntake(fluidBlock(), { pressurePsia: 3400, at: AT });
    const comp = eorCompositionIntake(SCHEMA_1_TUNED_EOS.inputs, { recordName: 'Ekene E-2000 oil' });
    const both = wc(pvt, comp);
    expect(both.context.volatilesMolPct).toBe('40');
    expect(both.intake.fields).toEqual(pvt.intake.fields);
    expect(intakeSourceText({ pvt: both.intake }, 'volatilesMolPct', '40')).toMatch(/Feed composition of the equation-of-state model/);
    expect(both.intake.composition.not_taken).toMatch(/not taken/);
    // negative control: no composition leaves the intake as it was
    expect(wc(pvt, { ok: false })).toBe(pvt);
  });
});
