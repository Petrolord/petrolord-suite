/**
 * The kr-1 writer of SCAL Studio (SCAL-U1, RL11), through buildKrContract
 * in src/lib/inputProvenance/krContract.js. Called with what the studio
 * already derived (the same objects the screen draws), so the block, the
 * report and the screen are one model. Stored with the saved project
 * (payload key `kr`), sent with the Waterflood handoff, and read by id with
 * readScalProjectKr (src/lib/krSource.js).
 *
 * Pure.
 */
import { buildKrContract, KR_PRODUCER } from '@/lib/inputProvenance/krContract';
import { buildCoreyOilWater, buildCoreyGasOil, LEVERETT_C, PSI_PER_FT_WATER } from '@/utils/scalCalculations';
import { curveOriginStatus, pedigreeOf, OW_KEYS, GO_KEYS, identificationOf } from './model.js';

export const OW_NORMALISATION = 'Swn = (Sw - Swc) / (1 - Swc - Sor), held in 0 to 1; krw = krw(Sor) Swn^nw; kro = kro(Swc) (1 - Swn)^no';
export const GO_NORMALISATION = 'Sgn = (Sg - Sgc) / (1 - Swc - Sorg - Sgc), held in 0 to 1; krg = krg(end) Sgn^ng; krog = krog(Swc) (1 - Sgn)^nog; at connate water';
export const J_DEFINITION = `J = ${LEVERETT_C} Pc / (sigma cos theta) sqrt(k / phi), Pc in psi, sigma in dyn/cm, k in md; J = a Sw*^(-b), Sw* = (Sw - Swirr) / (1 - Swirr)`;
export const HEIGHT_DEFINITION = `h = Pc / (${PSI_PER_FT_WATER} (gamma_w - gamma_hc)), h in ft above the free water level, Pc in psi`;

const n = (v) => {
  const x = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(x) ? x : null;
};
const round = (v, d) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

function originBlock(status) {
  if (status.kind === 'entered') return { kind: 'entered' };
  const o = status.origin;
  return {
    kind: status.kind,
    sample_id: o.sampleId,
    sample_name: o.sampleName,
    applied_at: o.at,
    fit: o.fit,
    ...(status.edited.length ? { edited: status.edited } : {}),
  };
}

/** The sample pedigree as the block carries it. */
export function sampleBlock(s) {
  const p = pedigreeOf(s);
  return {
    id: s.id,
    name: s.name,
    depth: n(s.depth_ft),
    depth_ref: p.depthRef || null,
    origin: p.origin || null,
    analog_note: p.analogNote || null,
    laboratory: p.laboratory || null,
    lab_report: p.labReport || null,
    kr_method: p.krMethod || null,
    process_kr: p.krProcess || null,
    pc_method: p.pcMethod || null,
    process_pc: p.pcProcess || null,
    wettability: p.wettability || null,
    condition: p.condition || null,
    temperature_degF: n(p.testTempF),
    fluids: p.fluids || null,
    k_md: n(s.k_md),
    phi: n(s.phi),
    sigma_dyncm: n(s.sigma_dyncm),
    thetaDeg: n(s.thetaDeg),
    kr_points: s.krRows?.length || 0,
    pc_points: s.pcRows?.length || 0,
    go_points: s.goRows?.length || 0,
  };
}

/**
 * @param {{curves: object, ow: object, go: object, capillary: object, jResolved: object, reservoir: object,
 *   height: object, heightProfile: ?object[], samples: object[], identification?: object,
 *   projectId?: ?string, projectName?: ?string, build?: ?string, generatedAt?: Date|string}} a
 */
export function buildScalKrContract(a) {
  const { curves, ow, go, jResolved, reservoir, height, heightProfile, samples } = a;
  const owStatus = curveOriginStatus(curves?.ow, curves?.owOrigin, OW_KEYS);
  const goStatus = curveOriginStatus(curves?.go, curves?.goOrigin, GO_KEYS);
  const oilWater = ow?.params ? {
    model: 'corey',
    params: { ...ow.params },
    origin: originBlock(owStatus),
    normalisation: OW_NORMALISATION,
    table: buildCoreyOilWater(ow.params, { n: 24 }).rows.map((r) => ({ Sw: round(r.Sw, 6), krw: round(r.krw, 8), kro: round(r.kro, 8) })),
  } : null;
  const gasOil = go?.params ? {
    model: 'corey',
    params: { ...go.params },
    origin: originBlock(goStatus),
    normalisation: GO_NORMALISATION,
    table: buildCoreyGasOil(go.params, { n: 24 }).rows.map((r) => ({ Sg: round(r.Sg, 6), krg: round(r.krg, 8), krog: round(r.krog, 8) })),
  } : null;
  let capillary = null;
  if (jResolved?.jSpec && reservoir?.props) {
    const spec = jResolved.jSpec;
    const fromSamples = jResolved.meta?.mode === 'samples';
    const fwl = n(height?.fwl_tvdss);
    capillary = {
      j: {
        type: 'power',
        a: spec.a,
        b: spec.b,
        Swirr: spec.Swirr,
        origin: fromSamples ? 'samples' : 'entered',
        ...(fromSamples ? {
          samples: (samples || []).filter((s) => (a.capillary?.includedSampleIds || []).includes(s.id)).map((s) => s.name),
          swirr_from: jResolved.meta?.swirr?.from || null,
          fit: jResolved.meta?.avg?.fit ? { r2Log: jResolved.meta.avg.fit.r2Log, rmsLog: jResolved.meta.avg.fit.rmsLog, ci95: jResolved.meta.avg.fit.ci95 } : null,
        } : {}),
        definition: J_DEFINITION,
      },
      reservoir: { ...reservoir.props },
      leverett_c: LEVERETT_C,
      height: {
        gammaW: n(height?.gammaW),
        gammaHc: n(height?.gammaHc),
        fwl_tvdss_ft: fwl,
        definition: HEIGHT_DEFINITION,
      },
      table: (heightProfile || []).map((r) => ({ Sw: round(r.Sw, 6), Pc_psi: round(r.Pc_psi, 6), h_ft: round(r.h_ft, 4) })),
    };
  }
  return buildKrContract({
    sourceApp: KR_PRODUCER,
    projectId: a.projectId ?? null,
    projectName: a.projectName || null,
    generatedAt: a.generatedAt,
    appBuild: a.build || null,
    oilWater,
    gasOil,
    capillary,
    samples: (samples || []).map(sampleBlock),
    identification: identificationOf(a),
  });
}

/**
 * The Waterflood handoff (router state `scalKr`): the SC5 version 1 keys,
 * which Waterflood already maps, with the kr-1 block beside them.
 */
export function buildScalKrHandoffV2({ contract, muW, muO }) {
  const ow = contract?.oil_water;
  if (!ow) return null;
  return {
    source: contract.project_name || 'SCAL Studio',
    krSource: 'corey',
    corey: { ...ow.params },
    muW: Number.isFinite(muW) ? muW : null,
    muO: Number.isFinite(muO) ? muO : null,
    contract,
  };
}
