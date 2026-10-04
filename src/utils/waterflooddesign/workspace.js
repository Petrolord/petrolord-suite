/**
 * The derived state of a Waterflood Design project from its saved inputs
 * (WF-U1, RL12): the same engine calls the studio context makes, in one
 * pure function, so a test, the sample report and a saved-project fixture
 * reach the numbers the screen shows. The context uses `layeredFrom` and the
 * builders it already exports; this function strings them together.
 */
import { analyzeDisplacement } from '@/utils/fractionalFlowCalculations';
import { analyzeLayeredSweep } from '@/utils/layeredSweepCalculations';
import { forecastPattern } from '@/utils/patternForecastCalculations';
import { analyzeWaterflood } from '@/utils/waterfloodCalculations';
import { applyHallWindows } from './hallWindows';

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

/** The layered sweep result, with M from the displacement or entered and A entered or derived (M x Bo / Bw). */
export function layeredFrom(layers, layeredConfig, displacement, patternInputs) {
  const L = (layers || []).map((l) => ({ h: num(l.h), k: num(l.k) })).filter((l) => l.h > 0 && l.k > 0);
  if (L.length < 2) return null;
  const M = layeredConfig.mSource === 'displacement' && displacement ? displacement.M : num(layeredConfig.M);
  const A = layeredConfig.aSource === 'derived' ? (M * num(patternInputs?.Bo)) / num(patternInputs?.Bw) : num(layeredConfig.A);
  if (!(M > 0) || !(A > 0)) return null;
  return { ...analyzeLayeredSweep({ layers: L, M, A }), M, A };
}

/**
 * @param {object} payload a saved project payload (version 2 keys)
 * @param {{buildDisplacementSpec: function, buildPatternInputs: function, buildSurveillanceConfig: function}} builders the context's exported builders
 */
export function deriveWaterfloodState(payload, { buildDisplacementSpec, buildPatternInputs, buildSurveillanceConfig }) {
  const displacementInputs = payload.displacementInputs;
  const displacementSpec = buildDisplacementSpec(displacementInputs);
  const displacement = displacementSpec.spec ? analyzeDisplacement(displacementSpec.spec) : null;
  const pattern = buildPatternInputs(payload.patternInputs);
  const patternResult = displacementSpec.spec && pattern ? forecastPattern({ displacementSpec: displacementSpec.spec, pattern }) : null;
  const rows = payload.surveillance?.rows || [];
  let surveillanceResult = null;
  if (rows.length) {
    try { surveillanceResult = applyHallWindows(analyzeWaterflood(rows, buildSurveillanceConfig(payload.surveillance.config)), payload.hallWindows); } catch (e) { surveillanceResult = { error: e.message }; }
  }
  return {
    displacementInputs,
    displacementSpec,
    displacement,
    layers: payload.layers,
    layeredConfig: payload.layeredConfig,
    layeredResult: layeredFrom(payload.layers, payload.layeredConfig, displacement, payload.patternInputs),
    patternInputs: payload.patternInputs,
    patternResult,
    surveillanceRows: rows,
    surveillanceConfig: payload.surveillance?.config || {},
    surveillanceResult,
    surveillanceImport: payload.surveillance?.import || null,
    hallWindows: payload.hallWindows || {},
    uncertaintyConfig: payload.uncertaintyConfig,
    mcSummary: payload.mcSummary || null,
    identification: payload.identification || {},
    inputMeta: payload.inputMeta || {},
    pvtIntake: payload.pvtIntake || null,
    migratedFrom: payload.migratedFrom || null,
  };
}
