// Pure geomechanics orchestration (D5): profile assembly, MEM computation
// and mud windows on plain arrays. NO '@/' aliases (e2e imports this file
// directly). Registry plumbing (curve download, mnemonic mapping, pp-1.0.0
// pickers) lives in prepGm/backends; this file never touches Supabase.
//
// Case shapes (jsonb):
//   case.source  {geoWellId, ppSource: 'published'|'computed'|'hydrostatic',
//                 mudlineMdM, rhoFluidKgM3, nct/eaton params for the
//                 computed path}
//   case.params  {nu, alphaBiot, frictionAngleDeg, tensileStrengthPa,
//                 epsX, epsY, shmaxAzimuthDeg, regime, k0Override,
//                 ucs: {correlation, params}}

import {
  horizontalStresses, ucsFromDt, mudWindowAlongWell, qualityScore,
} from '../engine/geomech';
import { computeProfile } from '../engine/ppProfile';
import { hydrostatic, overburden } from '../engine/ppPressures';
import { tvdAt } from '../../../../../packages/engines/engines/drilling/wellControl.js';

export const GM_ENGINE_VERSION = 'geomech-1.0.0';

const PPG = 119.826;
const FT = 0.3048;

export function emwLabel(depthUnit) { return depthUnit === 'ft' ? 'ppg' : 'g/cc'; }
export function emwOut(kgM3, depthUnit) { return depthUnit === 'ft' ? kgM3 / PPG : kgM3 / 1000; }
export function depthOut(m, depthUnit) { return depthUnit === 'ft' ? m / FT : m; }
export function depthLabel(depthUnit) { return depthUnit === 'ft' ? 'ft' : 'm'; }
export function pressureOutMPa(pa) { return pa / 1e6; }

// PP-U2-013 (fixes PP-U1-018): the registry curves (published PP/OBG and the
// raw logs) are indexed by MD below the rotary table. The MEM and the mud
// window are indexed by TVD, so on a deviated well every MD is carried to
// TVD through the definitive trajectory (exact minimum curvature, the
// engine's tvdAt); samples where the hole turns back up (or runs past the
// last station) are dropped and counted. With no trajectory the well is
// taken as vertical, and the provenance says so. The wellbore's rotary
// table is taken to be the registry well's.
export function mdToTvdOnTrajectory(mdM, stations) {
  const ok = Array.isArray(stations) && stations.length >= 2;
  const keep = []; const tvd = [];
  let last = -Infinity; let dropped = 0;
  const top = ok ? stations[0].md : -Infinity; const td = ok ? stations[stations.length - 1].md : Infinity;
  for (let i = 0; i < mdM.length; i++) {
    const md = mdM[i];
    if (!Number.isFinite(md) || md < top - 1e-9 || md > td + 1e-9) { dropped += 1; continue; }
    const t = ok ? tvdAt(stations, md) : md;
    if (!(t > last)) { dropped += 1; continue; }
    last = t; keep.push(i); tvd.push(t);
  }
  return { keep, tvdM: tvd, dropped, onTrajectory: ok };
}

const pick = (arr, keep) => (arr ? keep.map((i) => arr[i]) : arr);
const frameNote = (t) => (t.onTrajectory
  ? ` at TVD through the definitive trajectory${t.dropped ? ` (${t.dropped} samples off the trajectory or where the hole turns up left out)` : ''}`
  : ' (no trajectory: MD taken as TVD, a vertical well)');

// Assemble the Sv/Pp base profile from one of three sources.
//   published:   {tvdM (the curves' MD grid), ppPa, obgPa} from pp-1.x curves
//   computed:    porepressure computeProfile over the DT/RHOB logs
//   hydrostatic: density-integrated Sv + hydrostatic Pp
// stations: the definitive trajectory (MD to TVD, PP-U2-013)
export function assembleBaseProfile({ source = {}, logs = null, published = null, stations = null }) {
  const mode = source.ppSource || 'hydrostatic';
  if (mode === 'published') {
    if (!published?.tvdM?.length || !published.ppPa || !published.obgPa) {
      throw new Error('No published pp-1.x PP/OBG curves (Pore Pressure Studio) found for this well.');
    }
    const t = mdToTvdOnTrajectory(published.tvdM, stations);
    return {
      tvdM: t.tvdM,
      mdM: pick(published.tvdM, t.keep),
      svPa: pick(published.obgPa, t.keep),
      ppPa: pick(published.ppPa, t.keep),
      ...(published.dtAligned ? { dtAligned: pick(published.dtAligned, t.keep) } : {}),
      depthFrame: t.onTrajectory ? 'trajectory' : 'md-as-tvd',
      provenance: `published Pore Pressure Studio curves${frameNote(t)}`,
    };
  }
  if (!logs?.depthM?.length || !logs.dtUsPerM) {
    throw new Error('Need DEPT and DT curves from the source well.');
  }
  const mudline = source.mudlineMdM ?? 0;
  const t = mdToTvdOnTrajectory(logs.depthM, stations);
  const mudTvd = t.onTrajectory ? tvdAt(stations, Math.max(mudline, stations[0].md)) : mudline;
  const tvdAll = t.tvdM;
  const inBml = tvdAll.map((v, k) => (v - mudTvd >= 0 ? k : -1)).filter((k) => k >= 0);
  const keep = inBml.map((k) => t.keep[k]);
  const zBmlM = inBml.map((k) => tvdAll[k] - mudTvd);
  const dt = pick(logs.dtUsPerM, keep);
  const rho = logs.rhoKgM3 ? pick(logs.rhoKgM3, keep) : null;
  const note = frameNote(t);
  if (mode === 'computed') {
    const res = computeProfile({
      zBmlM,
      dtUsPerM: dt,
      rhoKgM3: rho,
      params: {
        waterDepthM: source.waterDepthM ?? 0,
        rhoSeawaterKgM3: source.rhoSeawaterKgM3 ?? 1025,
        rhoFluidKgM3: source.rhoFluidKgM3 ?? 1030,
        nct: source.nct ?? { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 0.0005 },
        method: source.method ?? 'eaton',
        eatonN: source.eatonN ?? 3,
        nu: source.nuFrac ?? 0.4,
      },
    });
    return {
      tvdM: zBmlM.map((z) => z + mudTvd),
      svPa: res.overburdenPa,
      ppPa: res.porePressurePa,
      dtAligned: dt,
      depthFrame: t.onTrajectory ? 'trajectory' : 'md-as-tvd',
      provenance: `computed (${source.method ?? 'eaton'})${note}`,
    };
  }
  // hydrostatic fallback
  const sv = overburden(zBmlM, rho ?? zBmlM.map(() => 2300), source.waterDepthM ?? 0, source.rhoSeawaterKgM3 ?? 1025);
  const pp = zBmlM.map((z) => hydrostatic(z, source.waterDepthM ?? 0, source.rhoFluidKgM3 ?? 1030, source.rhoSeawaterKgM3 ?? 1025));
  return {
    tvdM: zBmlM.map((z) => z + mudTvd),
    svPa: sv,
    ppPa: pp,
    dtAligned: dt,
    depthFrame: t.onTrajectory ? 'trajectory' : 'md-as-tvd',
    provenance: `hydrostatic PP + density overburden${note}`,
  };
}

const interp = (xs, ys, x) => {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i += 1) {
    if (x <= xs[i]) {
      const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + f * (ys[i] - ys[i - 1]);
    }
  }
  return ys[ys.length - 1];
};

// Full MEM: base profile + horizontal stresses + UCS + quality.
export function runMem({ base, dtUsPerM = null, params = {} }) {
  const hs = horizontalStresses({
    svPa: base.svPa,
    ppPa: base.ppPa,
    nu: params.nu ?? 0.25,
    alphaBiot: params.alphaBiot ?? 1,
    ePa: params.ePa ?? null,
    epsX: params.epsX ?? 0,
    epsY: params.epsY ?? 0,
    k0Override: params.k0Override ?? null,
    frictionAngleDeg: params.frictionAngleDeg ?? 30,
    regime: params.regime ?? 'NF',
  });
  const ucsCfg = params.ucs ?? { correlation: 'horsrud' };
  let dt = dtUsPerM ?? base.dtAligned ?? null;
  if (ucsCfg.correlation !== 'constant' && (!dt || dt.length !== base.tvdM.length)) {
    throw new Error('The chosen UCS correlation needs a DT curve aligned with the profile.');
  }
  if (ucsCfg.correlation === 'constant') dt = base.tvdM.map(() => 1);
  const ucs = ucsFromDt({ dtUsPerM: dt, correlation: ucsCfg.correlation, params: ucsCfg.params ?? {} });
  const quality = qualityScore({
    svPa: base.svPa, shmaxPa: hs.shmaxPa, shminPa: hs.shminPa, ppPa: base.ppPa,
    regime: params.regime ?? 'NF',
  });
  return {
    profile: {
      tvdM: base.tvdM,
      svPa: base.svPa,
      ppPa: base.ppPa,
      shminPa: hs.shminPa,
      shmaxPa: hs.shmaxPa,
      ucsPa: ucs.ucsPa,
    },
    ucsProvenance: ucs.provenance,
    baseProvenance: base.provenance,
    clampedCount: hs.clampedCount,
    warnings: [...hs.warnings, ...quality.warnings],
    quality,
  };
}

export function runWindow({ stations, mem, params = {} }) {
  return mudWindowAlongWell({
    stations,
    profile: mem.profile,
    params: {
      shmaxAzimuthDeg: params.shmaxAzimuthDeg ?? 0,
      frictionAngleDeg: params.frictionAngleDeg ?? 30,
      nu: params.nu ?? 0.25,
      tensileStrengthPa: params.tensileStrengthPa ?? 0,
      alphaBiot: params.alphaBiot ?? 1,
    },
    stepMdM: params.stepMdM ?? 30,
  });
}

export { interp as interpProfile };
