// Decompacted accumulation rates for Stratigraphy Studio, on Basin &
// Charge Modeling's engine (AppUpgrade BF-U2-016, STRAT-U2-020).
//
// The contract (schema 'bf-decompaction/1'): one decompaction in the
// Suite. Basin owns burial history; Stratigraphy's age-depth rates are
// compacted rates (a metre of shale at 3 km was nearly two metres of mud
// when it was laid down). This module turns an age-depth segment into the
// thickness it had at deposition with Basin's own Athy decompaction
// (BurialCompactionEngine: Sclater and Christie porosity-depth constants,
// solid thickness conserved), and its rates:
//
//   input   segments [{top_m, base_m, age_top_ma, age_base_ma, upper?, lower?}]
//           depths are vertical below the depth datum (TVD below KB in
//           Stratigraphy), ages in Ma
//   options lithology (a Basin lithology key, default 'shale'; 'mixed'
//           with lithologyMix), datumM (depth of the sediment surface below
//           the datum: the seabed offshore, about 0 onshore; default 0)
//   output  per segment: presentM, decompactedM (at the surface), solidM
//           (grain thickness), compactedRate, decompactedRate and solidRate
//           in m/Ma (null for an event bed of no duration), plus the basis
//           text the reader shows.
//
// Each segment is decompacted as if alone at its present burial depth:
// the standard single-layer backstripping step, exact for the porosity
// law. Elastic compaction (porosity follows present depth), as Basin's
// default. Pure; no app imports this module's internals but the function.

import { BurialCompactionEngine } from '../../packages/engines/engines/basin/BurialCompactionEngine';

export const DECOMPACTION_SCHEMA = 'bf-decompaction/1';
export const DECOMPACTION_LITHOLOGIES = Object.freeze(['shale', 'sandstone', 'limestone']);

/**
 * @param {Array<{top_m:number, base_m:number, age_top_ma:number, age_base_ma:number, upper?:string, lower?:string}>} segments
 * @param {{lithology?: string, lithologyMix?: object, datumM?: number}} [opts]
 */
export function decompactedRates(segments, { lithology = 'shale', lithologyMix = null, datumM = 0 } = {}) {
  const layer = { lithology, ...(lithology === 'mixed' && lithologyMix ? { lithologyMix } : {}) };
  const { phi0, c } = BurialCompactionEngine.resolveParams(layer);
  const datum = Number.isFinite(Number(datumM)) ? Number(datumM) : 0;
  const rows = (segments || []).map((s) => {
    const top = Math.max(0, Number(s.top_m) - datum);
    const present = Number(s.base_m) - Number(s.top_m);
    const dt = Number(s.age_base_ma) - Number(s.age_top_ma);
    if (!(present > 0) || !Number.isFinite(top)) return { ...s, presentM: present, decompactedM: null, solidM: null, compactedRate: null, decompactedRate: null, solidRate: null };
    const solid = BurialCompactionEngine.solidThickness(top, present, phi0, c);
    const atSurface = BurialCompactionEngine.calculateLayerProperties({ ...layer, solidThickness: solid }, 0).thickness;
    const rate = (h) => (dt > 1e-9 ? h / dt : null);
    return { ...s, presentM: present, decompactedM: atSurface, solidM: solid, compactedRate: rate(present), decompactedRate: rate(atSurface), solidRate: rate(solid) };
  });
  return {
    schema: DECOMPACTION_SCHEMA,
    rows,
    params: { lithology, phi0, c, datumM: datum },
    basis: `Decompacted on Basin & Charge Modeling's engine as ${lithology} (Athy, surface porosity ${phi0.toFixed(2)}, ${(c * 1000).toFixed(2)} per km), each interval at its present burial depth${datum ? ` below a sediment surface ${datum} m under the datum` : ' below the depth datum'}.`,
  };
}
