/**
 * FC1-0 (engines #188) in the Separator & Slug Catcher Studio state.
 *
 * The engine now throws a SeparatorInputError naming the input it refuses,
 * retires the single `dropletMicron` in favour of the two droplet sizes that
 * are two different jobs, and reports why no vessel could be preferred.
 */
import fs from 'fs';
import path from 'path';
import {
  defaultInputs, inputsFromPayload, missingVesselInputs, selectVessel,
  runRefusable, ENGINE_INPUT_LABELS,
} from '../SeparatorStudioContext';
import { ldSweep, kValue, horizontalThreePhase } from '@/utils/facilities/engine/separatorSizing';

const COMMON = {
  qGasActFt3S: 2, vTerminalFtS: 0.5, qLiquidBpd: 5000, retentionMin: 3, liquidLevelFrac: 0.5,
};

describe('the two droplet sizes', () => {
  it('are separate inputs, and the retired single size is gone', () => {
    const p = defaultInputs().process;
    expect(p.waterDropletMicron).toBe('500');
    expect(p.oilDropletMicron).toBe('200');
    expect(p.dropletMicron).toBeUndefined();
  });

  it('are both required for a three-phase vessel, by the label the user sees', () => {
    const i = defaultInputs();
    i.vessel = { ...i.vessel, type: 'horizontal3' };
    i.process = { ...i.process, waterDropletMicron: '', oilDropletMicron: '' };
    expect(missingVesselInputs(i)).toEqual(['Water droplet in oil (um)', 'Oil droplet in water (um)']);
  });

  it('carry a study saved before FC1-0 into both, which is what the old engine did', () => {
    const restored = inputsFromPayload({ process: { dropletMicron: '400' } });
    expect(restored.process.waterDropletMicron).toBe('400');
    expect(restored.process.oilDropletMicron).toBe('400');
    expect(restored.process.dropletMicron).toBeUndefined();
    // Negative control: a study saved with the new keys keeps them.
    const modern = inputsFromPayload({ process: { waterDropletMicron: '300', oilDropletMicron: '150' } });
    expect([modern.process.waterDropletMicron, modern.process.oilDropletMicron]).toEqual(['300', '150']);
  });

  it('reach the engine, which refuses either one by name', () => {
    const refused = runRefusable(() => horizontalThreePhase({
      diameterFt: 8, qGasActFt3S: 2, vTerminalFtS: 0.5,
      qOilBpd: 6000, qWaterBpd: 4000, oilRetentionMin: 3, waterRetentionMin: 5,
      sgOil: 0.85, sgWater: 1.05, muOilCp: 2, muWaterCp: 0.7,
      waterDropletMicron: 500,
    }));
    expect(refused.input).toBe('oilDropletMicron');
    expect(refused.error).toMatch(/^Oil droplet in water \(um\): /);
  });
});

describe('a refused input is named, never substituted', () => {
  it('turns a SeparatorInputError into the field label plus the engine message', () => {
    const refused = runRefusable(() => kValue({ internalsId: 'horizontalMesh', pPsig: 985, kOverride: 0 }));
    expect(refused.input).toBe('kOverride');
    expect(refused.error).toMatch(/^K override \(ft\/s\): kOverride must be a positive K/);
    expect(ENGINE_INPUT_LABELS.diametersFt).toBe('Candidate diameters (ft)');
  });

  it('negative control: an accepted call passes its result straight through', () => {
    const ok = runRefusable(() => kValue({ internalsId: 'horizontalMesh', pPsig: 985 }));
    expect(ok.error).toBeUndefined();
    expect(ok.k).toBeGreaterThan(0);
  });

  it('a blank K override reaches the engine as undefined, not as zero', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../SeparatorStudioContext.jsx'), 'utf8');
    expect(source).toMatch(/kOverride: isBlank\(v\.kOverride\) \? undefined : num\(v\.kOverride\)/);
    // What that avoids: a zero override is refused rather than used.
    expect(runRefusable(() => kValue({ internalsId: 'horizontalMesh', pPsig: 985, kOverride: 0 })).error)
      .toBeTruthy();
  });
});

describe('selection follows the engine preference and its status', () => {
  it('selects the engine preferred row', () => {
    const sweep = ldSweep({ ...COMMON, mode: 'horizontal2', diametersFt: [4, 6, 8], ldMin: 0.1, ldMax: 100 });
    expect(sweep.preferredStatus).toBe('selected');
    expect(selectVessel(sweep).diameterFt).toBe(sweep.preferred.diameterFt);
    expect(selectVessel(sweep).error).toBeUndefined();
  });

  it('says nothing is feasible when no candidate can carry the gas', () => {
    const sweep = ldSweep({
      ...COMMON, mode: 'horizontal2', qGasActFt3S: 500, diametersFt: [4, 6], ldMin: 0.1, ldMax: 1000,
    });
    expect(sweep.preferred).toBeNull();
    expect(sweep.preferredStatus).toBe('none-feasible');
    const sel = selectVessel(sweep);
    expect(sel.noCandidate).toBe(true);
    expect(sel.preferredStatus).toBe('none-feasible');
    expect(sel.error).toMatch(/No candidate diameter is feasible \(cannot carry the gas\)/);
    expect(sel.diameterFt).toBeUndefined();
  });

  it('keeps the out-of-band message when the feasible rows are all outside the band', () => {
    const sweep = ldSweep({ ...COMMON, mode: 'vertical2', diametersFt: [40, 50], ldMin: 2, ldMax: 4, allowanceFt: 6 });
    expect(sweep.preferredStatus).toBe('none-in-band');
    const sel = selectVessel(sweep);
    expect(sel.preferredStatus).toBe('none-in-band');
    expect(sel.error).toBe(
      'No candidate in the L/D band (2 to 4), so no vessel is selected. Add candidate diameters or revise the band.',
    );
  });
});

describe('the renamed three-phase result fields', () => {
  const run = () => horizontalThreePhase({
    diameterFt: 10, qGasActFt3S: 2, vTerminalFtS: 0.5,
    qOilBpd: 6000, qWaterBpd: 4000, oilRetentionMin: 3, waterRetentionMin: 5,
    sgOil: 0.85, sgWater: 1.05, muOilCp: 2, muWaterCp: 0.7,
    waterDropletMicron: 500, oilDropletMicron: 200,
  });

  it('carries one retention length, the interface and the layers, and drops the old names', () => {
    const r = run();
    expect(Number.isFinite(r.liquidRetentionLengthFt)).toBe(true);
    expect(r.lengthOilFt).toBeUndefined();
    expect(r.lengthWaterFt).toBeUndefined();
    expect(r.interfaceChordFt).toBeUndefined();
    expect(Number.isFinite(r.gasLiquidChordFt)).toBe(true);
    expect(Number.isFinite(r.interfaceHeightFt)).toBe(true);
    expect(r.waterLayerFt + r.oilLayerFt).toBeCloseTo(r.liquidLevelFt, 9);
    expect(['gas', 'liquid-retention']).toContain(r.controlling);
    expect(Array.isArray(r.warnings)).toBe(true);
  });
});
