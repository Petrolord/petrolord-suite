/**
 * The pure state pipeline of SCAL Studio (SCAL-U1, RL12): the string form
 * state the studio saves, the builders that turn it into engine inputs, and
 * the derivations the screen, the report, the kr-1 block and the tests all
 * run. The provider (contexts/ScalStudioContext) calls the same functions
 * under its memos; tests call deriveScalState, so nothing is hand-made in
 * the engine's shape.
 *
 * buildJSpec and buildReservoirProps are also read by Petrophysics, Earth
 * Modeling, Rock Physics and ReservoirCalc Pro (shmFromScalProject), through
 * the context's re-export.
 *
 * Pure.
 */
import { makeFwFunction } from '@/utils/fractionalFlowCalculations';
import {
  validateCoreyParams,
  buildCoreyOilWater,
  buildCoreyGasOil,
  computeJTable,
  fitCoreyToKrTable,
  fitCoreyGasOilToKrTable,
  averageJCurves,
  pcFromJ,
  swVsHeight,
} from '@/utils/scalCalculations';
import { curveOriginStatus, OW_KEYS, GO_KEYS, identificationOf } from './model.js';
import { deserializeProvenance } from '@/lib/inputProvenance/model';
import { SCAL_UNIT_SYSTEMS } from './units.js';

export const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

export const DEFAULT_CURVES = {
  phase: 'oilwater', // 'oilwater' | 'gasoil'
  ow: { Swc: '0.2', Sor: '0.25', krwMax: '0.35', kroMax: '0.9', nw: '2.5', no: '2.0' },
  go: { Swc: '0.2', Sgc: '0.05', Sorg: '0.15', krgMax: '0.6', krogMax: '0.85', ng: '2.0', nog: '2.5' },
  fwPreviewOn: false,
  muW: '0.5',
  muO: '5.0',
};

// Lab σ·cosθ presets by measurement system (standard SCAL practice values;
// editable per sample). Values in dyn/cm and degrees.
export const LAB_SYSTEM_PRESETS = [
  { key: 'air_brine', label: 'Air-brine', sigma: '72', theta: '0' },
  { key: 'air_mercury', label: 'Air-mercury', sigma: '480', theta: '40' },
  { key: 'oil_brine', label: 'Oil-brine', sigma: '30', theta: '30' },
];

export const DEFAULT_CAPILLARY = {
  jMode: 'manual', // 'manual' (a, b, Swirr typed) | 'samples' (averaged lab J, SC4)
  manual: { a: '0.25', b: '1.4', Swirr: '0.15' },
  SwirrOverride: '',
  includedSampleIds: [],
  reservoir: { k_md: '150', phi: '0.22', sigma_dyncm: '26', thetaDeg: '30' },
};

export const DEFAULT_HEIGHT = {
  gammaW: '1.05',
  gammaHc: '0.80',
  fwl_tvdss: '',
  swMin: '0.2',
  swMax: '0.95',
};

// ---- Pure builders (jest-guarded) ----

export function buildOwParams(ow) {
  const p = {
    Swc: num(ow.Swc), Sor: num(ow.Sor),
    krwMax: num(ow.krwMax), kroMax: num(ow.kroMax),
    nw: num(ow.nw), no: num(ow.no),
  };
  const v = validateCoreyParams(p, 'oilwater');
  return v.ok ? { params: p, error: null } : { params: null, error: v.errors[0] };
}

export function buildGoParams(go) {
  const p = {
    Swc: num(go.Swc), Sgc: num(go.Sgc), Sorg: num(go.Sorg),
    krgMax: num(go.krgMax), krogMax: num(go.krogMax),
    ng: num(go.ng), nog: num(go.nog),
  };
  const v = validateCoreyParams(p, 'gasoil');
  return v.ok ? { params: p, error: null } : { params: null, error: v.errors[0] };
}

export function buildReservoirProps(r) {
  const props = {
    k_md: num(r.k_md), phi: num(r.phi),
    sigma_dyncm: num(r.sigma_dyncm), thetaDeg: num(r.thetaDeg),
  };
  if (!(props.k_md > 0) || !(props.phi > 0 && props.phi < 1) || !(props.sigma_dyncm > 0)
    || !(props.thetaDeg >= 0 && props.thetaDeg < 90)) {
    return { props: null, error: 'Reservoir rock needs positive k and sigma, porosity in (0, 1) and a contact angle below 90 degrees.' };
  }
  return { props, error: null };
}

/**
 * Resolve the working J spec from capillary config + samples.
 * manual mode: power law typed directly. samples mode: geometric-mean
 * average over the included samples' J tables (SC4).
 * -> { jSpec, meta, error }
 */
export function buildJSpec(capillary, samples) {
  if (capillary.jMode === 'manual') {
    const a = num(capillary.manual.a);
    const b = num(capillary.manual.b);
    const Swirr = num(capillary.manual.Swirr);
    if (!(a > 0) || !(b > 0) || !(Swirr >= 0 && Swirr < 1)) {
      return { jSpec: null, meta: null, error: 'Manual J needs positive a and b and Swirr in [0, 1).' };
    }
    return { jSpec: { type: 'power', a, b, Swirr }, meta: { mode: 'manual' }, error: null };
  }
  const included = (samples ?? []).filter(
    (s) => capillary.includedSampleIds.includes(s.id) && (s.jRows?.length ?? 0) >= 3,
  );
  if (included.length === 0) {
    return { jSpec: null, meta: null, error: 'Include at least one sample with a computed J table, or switch to manual mode.' };
  }
  // SCAL-U1-001: ONE Swirr for every sample, used both to normalise the
  // samples to Sw* and to map the averaged fit back to true Sw. The engine
  // left alone takes each sample's own Swirr, which put the working curve
  // 16 percent low at Sw 0.5 for samples starting at different Sw.
  const swirrOverride = num(capillary.SwirrOverride);
  const lowest = included.map((s) => ({ name: s.name, sw: Math.min(...s.jRows.map((r) => r.Sw)) }));
  if (Number.isFinite(swirrOverride)) {
    const above = lowest.find((l) => !(swirrOverride < l.sw));
    if (swirrOverride < 0 || above) {
      return {
        jSpec: null,
        meta: null,
        error: above
          ? `The shared Swirr ${swirrOverride} must sit below the lowest Sw of sample "${above.name}" (${above.sw}). Lower it, or leave it blank.`
          : 'The shared Swirr cannot be negative.',
      };
    }
  }
  const swirr = Number.isFinite(swirrOverride)
    ? swirrOverride
    : Math.max(0, Math.min(...lowest.map((l) => l.sw)) - 0.02);
  const avg = averageJCurves(included.map((s) => ({ name: s.name, jRows: s.jRows })), { Swirr: swirr });
  if (!avg.ok) return { jSpec: null, meta: null, error: avg.errors[0] };
  const swirrMeta = { value: swirr, from: Number.isFinite(swirrOverride) ? 'override' : 'data' };
  if (!avg.fit) {
    return { jSpec: null, meta: { mode: 'samples', avg, swirr: swirrMeta }, error: 'The averaged J curve could not be fitted; check the sample data.' };
  }
  // The averaged fit lives on the normalized Sw* axis (Swirr 0 there); map
  // it back to true Sw with the same Swirr.
  return {
    jSpec: { type: 'power', a: avg.fit.a, b: avg.fit.b, Swirr: swirr },
    meta: { mode: 'samples', avg, sampleCount: included.length, swirr: swirrMeta },
    error: null,
  };
}


// ---------------------------------------------------------------------------
// Derivations (the provider runs each under its own memo)
// ---------------------------------------------------------------------------

/** Corey sets, their origin and the fw preview. */
export function deriveCurves(curves) {
  const ow = buildOwParams(curves.ow);
  const go = buildGoParams(curves.go);
  const owStatus = curveOriginStatus(curves.ow, curves.owOrigin, OW_KEYS);
  const goStatus = curveOriginStatus(curves.go, curves.goOrigin, GO_KEYS);
  const owCurves = ow.params ? buildCoreyOilWater(ow.params, { n: 101 }) : null;
  const goCurves = go.params ? buildCoreyGasOil(go.params, { n: 101 }) : null;
  return { ow, go, owStatus, goStatus, owCurves, goCurves, fwPreview: deriveFwPreview(curves, ow) };
}

export function deriveFwPreview(curves, ow) {
  if (!curves.fwPreviewOn || !ow.params) return null;
  const muW = num(curves.muW);
  const muO = num(curves.muO);
  if (!(muW > 0) || !(muO > 0)) return null;
  const { fw } = makeFwFunction({ krSpec: { type: 'corey', ...ow.params }, muW, muO });
  const rows = [];
  const lo = ow.params.Swc;
  const hi = 1 - ow.params.Sor;
  for (let i = 0; i <= 101; i++) {
    const Sw = lo + ((hi - lo) * i) / 101;
    rows.push({ Sw, fw: fw(Sw) });
  }
  return { rows, muW, muO };
}

/**
 * The gas-oil fit of one sample (SCAL-U2-004), at the Swc of its test: the
 * sample's own when stated, else the working gas-oil set's.
 */
export function deriveGoFit(s, workingGoSwc) {
  if ((s.goRows?.length ?? 0) < 3) return { goFit: null, goFitError: null };
  const own = num(s.goSwc);
  const Swc = Number.isFinite(own) ? own : num(workingGoSwc);
  const swcFrom = Number.isFinite(own) ? 'stated for the sample' : 'the working gas-oil set';
  // SCAL-U2-003: Sgc and Sorg stated for the sample (both, or neither)
  const sgc = num(s.goSgc);
  const sorg = num(s.goSorg);
  const fixedEndpoints = Number.isFinite(sgc) && Number.isFinite(sorg) ? { Sgc: sgc, Sorg: sorg } : null;
  const res = fitCoreyGasOilToKrTable(s.goRows, { Swc, fixedEndpoints });
  return res.ok ? { goFit: { ...res, swcFrom }, goFitError: null } : { goFit: null, goFitError: res.errors[0] };
}

/** Per-sample J tables and Corey fits (oil-water, and gas-oil at the given working Swc). */
export function deriveSamples(samples, { goSwc = null } = {}) {
  return (samples || []).map((s) => {
    const props = {
      k_md: num(s.k_md), phi: num(s.phi),
      sigma_dyncm: num(s.sigma_dyncm), thetaDeg: num(s.thetaDeg),
    };
    const jTable = (s.pcRows?.length ?? 0) >= 3 ? computeJTable(s.pcRows, props) : null;
    // SCAL-U2-003: Swc and Sor stated for the sample (both, or neither) let a
    // table that stops short of an end point be fitted
    const fSwc = num(s.fitSwc);
    const fSor = num(s.fitSor);
    const fixedEndpoints = Number.isFinite(fSwc) && Number.isFinite(fSor) ? { Swc: fSwc, Sor: fSor } : null;
    const krFit = (s.krRows?.length ?? 0) >= 3 ? fitCoreyToKrTable(s.krRows, fixedEndpoints ? { fixedEndpoints } : {}) : null;
    return {
      ...s,
      jRows: jTable?.ok ? jTable.rows.map((r) => ({ Sw: r.Sw, J: r.J })) : [],
      jError: jTable && !jTable.ok ? jTable.errors[0] : null,
      krFit: krFit?.ok ? krFit : null,
      krFitError: krFit && !krFit.ok ? krFit.errors[0] : null,
      ...deriveGoFit(s, goSwc),
    };
  });
}

const windowOf = (height) => {
  const swMin = num(height.swMin);
  const swMax = num(height.swMax);
  return { SwMin: Number.isFinite(swMin) ? swMin : null, SwMax: Number.isFinite(swMax) ? swMax : null };
};

/** Reservoir Pc of the working J (61 intervals over the Sw window). */
export function deriveReservoirPc(jResolved, reservoir, height) {
  if (!jResolved.jSpec || !reservoir.props) return null;
  const res = pcFromJ(jResolved.jSpec, reservoir.props, { n: 61, ...windowOf(height) });
  return res.ok ? res.rows : null;
}

/** The saturation-height profile (61 intervals over the Sw window). */
export function deriveHeightProfile(jResolved, reservoir, height) {
  if (!jResolved.jSpec || !reservoir.props) return null;
  const gammaW = num(height.gammaW);
  const gammaHc = num(height.gammaHc);
  if (!(gammaW > gammaHc)) return null;
  const res = swVsHeight(jResolved.jSpec, reservoir.props, { gammaW, gammaHc }, { n: 61, ...windowOf(height) });
  return res.ok ? res.rows : null;
}

/** Every derived object of the studio from its saved inputs, in one call. */
export function deriveScalState(inputs) {
  const curves = deriveCurves(inputs.curves);
  const samplesDerived = deriveSamples(inputs.samples, { goSwc: inputs.curves?.go?.Swc });
  const jResolved = buildJSpec(inputs.capillary, samplesDerived);
  const reservoir = buildReservoirProps(inputs.capillary.reservoir);
  return {
    ...inputs,
    ...curves,
    samplesDerived,
    jResolved,
    reservoir,
    reservoirPc: deriveReservoirPc(jResolved, reservoir, inputs.height),
    heightProfile: deriveHeightProfile(jResolved, reservoir, inputs.height),
  };
}

/** Saved inputs from a payload of any schema, with the defaults filled in (the provider's hydrate, pure). */
export function inputsFromPayload(payload) {
  return {
    curves: {
      ...DEFAULT_CURVES,
      ...(payload?.curves || {}),
      ow: { ...DEFAULT_CURVES.ow, ...(payload?.curves?.ow || {}) },
      go: { ...DEFAULT_CURVES.go, ...(payload?.curves?.go || {}) },
    },
    samples: Array.isArray(payload?.samples) ? payload.samples : [],
    capillary: {
      ...DEFAULT_CAPILLARY,
      ...(payload?.capillary || {}),
      manual: { ...DEFAULT_CAPILLARY.manual, ...(payload?.capillary?.manual || {}) },
      reservoir: { ...DEFAULT_CAPILLARY.reservoir, ...(payload?.capillary?.reservoir || {}) },
      includedSampleIds: Array.isArray(payload?.capillary?.includedSampleIds) ? payload.capillary.includedSampleIds : [],
    },
    height: { ...DEFAULT_HEIGHT, ...(payload?.height || {}) },
    notes: typeof payload?.notes === 'string' ? payload.notes : '',
    identification: identificationOf(payload),
    inputMeta: deserializeProvenance(payload?.inputMeta),
    // a saved project keeps its own system; one saved before the upgrade is oilfield
    unitSystem: SCAL_UNIT_SYSTEMS.includes(payload?.unitSystem) ? payload.unitSystem : 'oilfield',
  };
}
