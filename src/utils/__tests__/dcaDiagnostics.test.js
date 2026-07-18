/**
 * dcaDiagnostics smoke suite (SC1 sibling coverage). Hand-computed pins for
 * the fit-quality numbers the DCA UI displays. dcaMonteCarlo and
 * dcaSegmentDetection are explicitly deferred (grandfathered per
 * ReservoirEngineering-Module.md §5; consolidation happens at engine
 * extraction) — recorded in docs/scope/SCALStudio-STATUS.md.
 */
import {
  calculateR2,
  calculateRMSE,
  calculateResiduals,
  getVerdictInfo,
} from '../dcaDiagnostics';

const actual = [{ rate: 10 }, { rate: 20 }, { rate: 30 }, { rate: 40 }];
const predicted = [{ rate: 12 }, { rate: 18 }, { rate: 33 }, { rate: 37 }];
// residuals: -2, +2, -3, +3; SSE = 4+4+9+9 = 26
// mean(actual) = 25; SST = 225+25+25+225 = 500
// R2 = 1 - 26/500 = 0.948 ; RMSE = sqrt(26/4) = 2.5495

describe('dcaDiagnostics hand-computed pins', () => {
  test('R2 = 1 - SSE/SST on a 4-point hand case', () => {
    expect(calculateR2(actual, predicted)).toBeCloseTo(0.948, 10);
  });

  test('perfect prediction gives R2 = 1, mismatched lengths give 0', () => {
    expect(calculateR2(actual, actual)).toBe(1);
    expect(calculateR2(actual, predicted.slice(0, 3))).toBe(0);
  });

  test('RMSE = sqrt(SSE/n) on the same hand case', () => {
    expect(calculateRMSE(actual, predicted)).toBeCloseTo(Math.sqrt(26 / 4), 10);
  });

  test('residuals are NORMALIZED (residual/predicted) with absolute magnitudes, in order', () => {
    const res = calculateResiduals(actual, predicted);
    expect(res.map((r) => r.residual)).toEqual([-2 / 12, 2 / 18, -3 / 33, 3 / 37]);
    expect(res.map((r) => r.absolute)).toEqual([2, 2, 3, 3]);
  });

  test('verdict bands: >=0.95 excellent, >=0.85 caution, below poor', () => {
    expect(getVerdictInfo(0.99).title).toMatch(/Excellent/);
    expect(getVerdictInfo(0.99).icon).toBe('check');
    expect(getVerdictInfo(0.9).title).toMatch(/Caution/);
    expect(getVerdictInfo(0.2).title).toMatch(/Poor/);
    // band edges belong to the higher verdict
    expect(getVerdictInfo(0.95).title).toMatch(/Excellent/);
    expect(getVerdictInfo(0.85).title).toMatch(/Caution/);
  });
});
