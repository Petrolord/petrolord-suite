/**
 * Fluid Systems Studio as the WRITER of the pvt-1 contract (FLUID-U1,
 * RL11; plan Step 0c). Everything in the block is read from what the
 * engine calls reported (results.meta of analyzeFluidSystem, or the methods
 * and model of runEosPvtTable); this file names no correlation.
 *
 * The same block goes three ways: with the handoff (router state,
 * `fluidStudioData.contract`), into the saved project payload (`pvt`), so a
 * consumer can read it by project id after a refresh, and into the header
 * of both CSV exports and the report.
 *
 * Pure.
 */
import { buildPvtContract } from '@/lib/inputProvenance/pvtContract';
import { blackOilRangeFlags } from '@/utils/fluidStudioCalculations';
import { tuningState, isActiveStage } from '@/utils/fluidstudio/eosAnalysis';
import { labContractBlock } from '@/utils/fluidstudio/labReport';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The enabled separator stages as the contract states them. */
export const separatorConditions = (stages) => (stages || []).filter(isActiveStage).map((s) => ({
  pressure_psia: Number(s.pressure),
  temperature_degF: Number.isFinite(Number(s.temperature)) ? Number(s.temperature) : 60,
}));

/** True when the compositional table is what the app hands over. */
export const isEosHandoff = (inputs, eos) => inputs?.fluidModel === 'eos' && !!eos?.pvtTable?.table;

/** The lab tuning of the compositional fluid, as the contract carries it. */
export function tuningBlock(composition, stages) {
  const t = tuningState(composition, stages);
  if (t.status === 'none') return { status: 'none' };
  const block = { status: t.status, parameters: { ...t.applied }, variables: 'C7+ Tc and Pc multipliers, methane to C7+ interaction, C7+ volume shift' };
  if (t.status === 'tuned') {
    block.at = t.fit.at;
    block.converged = t.fit.converged;
    block.iterations = t.fit.iterations;
    block.bounds_hit = t.fit.boundsHit;
    block.saturation_temperature_degF = t.fit.psatTF;
    block.matched = t.fit.report.map((r) => ({
      target: r.name, unit: r.unit, measured: r.measured, untuned: r.untuned, tuned: r.tuned,
      error_before: r.untunedErr, error_after: r.tunedErr, error_unit: r.name === 'stoApi' ? 'degAPI' : 'percent',
    }));
  }
  return block;
}

/**
 * Range flags of the compositional path: what the composition parser says
 * about the C7+ description, and the water correlations against the table.
 */
export function eosRangeFlags(inputs, eos) {
  const pvt = eos?.pvtTable;
  if (!pvt?.table) return [];
  const fluidForWater = { temp: pvt.model?.tempF, salinity: Number(inputs?.streamA?.blackOil?.salinity) || 0 };
  const waterFlags = blackOilRangeFlags(fluidForWater, pvt.methods.filter((m) => m.key === 'bw' || m.key === 'mu_w'), pvt.table.rows);
  const parseFlags = (pvt.parsed?.warnings || []).map((text) => ({ method: 'C7+ characterisation', variable: 'C7+ description', scope: 'input', value: null, low: null, high: null, unit: '', family: null, properties: [], text }));
  return [...parseFlags, ...waterFlags];
}

/**
 * The pvt-1 block of the current analysis.
 * @param {{inputs: object, results: object, eos: ?object, projectId?: ?string, projectName?: ?string,
 *   generatedAt?: Date, appBuild?: ?string, identification?: object}} a
 * @returns {?object} null when there is no result to hand over
 */
export function buildFluidPvtContract({ inputs, results, eos, projectId = null, projectName = null, generatedAt = new Date(), appBuild = null, identification = null }) {
  const stages = inputs?.separatorTrain?.stages;
  const common = { projectId, projectName, generatedAt, appBuild, separatorConditions: separatorConditions(stages), ...(identification ? { identification } : {}) };

  if (isEosHandoff(inputs, eos)) {
    const pvt = eos.pvtTable;
    const composition = inputs.streamA?.composition;
    const t = pvt.table;
    const pbRow = t.rows.find((r) => r.phase === 'saturated');
    const fluidForWater = { temp: pvt.model?.tempF, salinity: Number(inputs.streamA?.blackOil?.salinity) || 0 };
    return buildPvtContract({
      ...common,
      model: 'eos',
      modelDetail: {
        eos: pvt.model?.eos, c7plus: pvt.model?.c7plus, viscosity: pvt.model?.viscosity,
        components: pvt.parsed.keys.map((k, i) => ({ component: k, mole_fraction: Number(pvt.parsed.z[i].toFixed(6)) })),
        plus_fraction: pvt.parsed.plus ? { molecular_weight: pvt.parsed.plus.mw, specific_gravity: pvt.parsed.plus.sg } : null,
        saturation_kind: t.satKind,
      },
      methods: pvt.methods,
      basis: pvt.basis,
      pbSource: 'eos',
      tuning: tuningBlock(composition, stages),
      rangeFlags: eosRangeFlags(inputs, eos),
      standardConditions: pvt.standardConditions,
      inputs: {
        oil_gravity: t.kpis.stoApi, gas_gravity: t.kpis.surfaceGasGravity, rsb: t.kpis.rsfb,
        temperature: pvt.model?.tempF, salinity: fluidForWater.salinity,
      },
      atSaturation: {
        pressure: t.pb, Rs: t.kpis.rsfb, Bo: t.kpis.bofb, mu_o: pbRow?.mu_o ?? null, Bg: pbRow?.Bg ?? null, Z: pbRow?.Z ?? null,
        Bw: pbRow?.Bw ?? null, mu_w: pbRow?.mu_w ?? null, Bod: t.kpis.bodb, Rsd: t.kpis.rsdb,
      },
      labData: labContractBlock({ inputs, rows: t.rows, pb: t.pb }),
      table: t.rows,
    });
  }

  const meta = results?.meta;
  const k = results?.pvt?.kpis;
  if (!k || !meta?.methods) return null;
  return buildPvtContract({
    ...common,
    model: 'black-oil-correlations',
    modelDetail: {
      blended: !!meta.blended,
      ...(meta.pbSource === 'entered' ? { rs_scale: meta.pbDetail?.rsScale, correlation_pb: meta.pbDetail?.correlationPb } : {}),
    },
    methods: meta.methods,
    basis: meta.basis,
    pbSource: meta.pbSource,
    tuning: { status: 'none' },
    rangeFlags: meta.rangeFlags,
    standardConditions: meta.standardConditions,
    inputs: {
      oil_gravity: meta.fluid.api, gas_gravity: meta.fluid.gasGravity, rsb: meta.fluid.rsb,
      temperature: meta.fluid.temp, salinity: meta.fluid.salinity,
    },
    atSaturation: {
      pressure: k.pb, Rs: k.rsb, Bo: k.bo_at_pb, mu_o: k.mu_o_at_pb, co: k.co_at_pb, Bg: k.bg_at_pb, Z: k.z_at_pb,
      Bw: k.bw_at_pb, mu_w: k.mu_w_at_pb, mu_od: k.mu_od,
    },
    labData: labContractBlock({ inputs, rows: results.pvt.table, pb: k.pb }),
    table: results.pvt.table,
  });
}

/**
 * The handoff a consumer receives through router state: the version-1
 * backbone keys where they always were, with the pvt-1 block beside them.
 */
export function buildFluidHandoff(args) {
  const { inputs, results, eos } = args;
  const backbone = isEosHandoff(inputs, eos) ? eos.pvtTable.backbone : results?.backbone;
  if (!backbone) return null;
  const contract = buildFluidPvtContract(args);
  return contract ? { ...backbone, contract } : { ...backbone };
}

/** A number the block holds, or null: for readers that print it. */
export const contractNumber = (v) => (finite(v) ? v : null);
