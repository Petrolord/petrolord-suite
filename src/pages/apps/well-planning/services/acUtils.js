// Anti-collision + positional-uncertainty logic for Well Design Studio
// (WD4): resolve the wellbore's geomagnetic reference, run the ISCWSA
// Rev4 error model (optionally through a survey program), assemble
// reference/offset wells in the shared site frame, drive the
// separation-rule scan, and shape chart overlays and wp_ac_runs rows.
// Pure functions over the validated engines — everything works in
// METRES with GRID azimuths (the registry convention); the UI converts
// at the boundary.

import { toLonLat } from '@/lib/crs';
import { isTransformableTag } from '@/lib/crs/tags';
import { fieldAt, decimalYearOf } from '../engine/magnetics';
import { computeWellPath } from '../engine/surveyMath';
import {
  computeErrorModel, horizontalEllipse, hlaSigmas,
} from '../engine/errorModel';
import { compileSurveyProgram, TOOL_LIBRARY } from '../engine/surveyProgram';
import { computeClearance, classifyClearance } from '../engine/antiCollision';

export const AC_ENGINE_VERSION = 'drilling-wd4';

/** Default separation-rule parameters (SPE-187073 conventional values;
 *  radii are 17.5in hole / 12in offset casing equivalents in metres). */
export const DEFAULT_AC_PARAMS = {
  k: 3.5,
  sigmaPa: 0.5,
  Sm: 0.3,
  refRadius: 0.4572,
  offRadius: 0.3048,
  noGo: 1.0,
  review: 1.5,
};

// ---------------------------------------------------------------------------
// geomagnetic reference resolution
// ---------------------------------------------------------------------------

/**
 * The error model needs a real geomagnetic reference (total field +
 * dip + declination). Prefer the wellbore's cached mag_model (stamped
 * on save by WellboreDialog); fall back to a live WMM2025 lookup at
 * the wellhead through the site CRS. Returns
 * {bTotalNT, dipDeg, declinationDeg, convergenceDeg, aziReference,
 *  source: 'cache' | 'live'} or null when neither path is available —
 * callers must surface that loudly, never default silently.
 */
export function resolveMagReference(site, wellbore) {
  // NB Number(null) is 0 — guard the raw values before coercing.
  const finiteOr = (raw, fallback) => (raw != null && Number.isFinite(Number(raw))
    ? Number(raw) : fallback);
  const convergenceDeg = finiteOr(wellbore?.grid_convergence_deg, 0);
  const cached = wellbore?.mag_model;
  if (cached && Number.isFinite(cached.b_total_nt) && Number.isFinite(cached.dip_deg)) {
    return {
      bTotalNT: cached.b_total_nt,
      dipDeg: cached.dip_deg,
      declinationDeg: finiteOr(wellbore?.mag_declination_deg, cached.declination_deg ?? 0),
      convergenceDeg,
      aziReference: 'grid',
      source: 'cache',
    };
  }
  if (!site?.crs || !isTransformableTag(site.crs)
    || !Number.isFinite(wellbore?.head_x) || !Number.isFinite(wellbore?.head_y)) {
    return null;
  }
  try {
    const { lon, lat } = toLonLat(site.crs, wellbore.head_x, wellbore.head_y);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const now = new Date();
    const f = fieldAt({
      latDeg: lat,
      lonDeg: lon,
      decimalYear: decimalYearOf(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()),
    });
    if (!Number.isFinite(f.f) || !Number.isFinite(f.inclinationDeg)) return null;
    return {
      bTotalNT: f.f,
      dipDeg: f.inclinationDeg,
      declinationDeg: f.declinationDeg,
      convergenceDeg,
      aziReference: 'grid',
      source: 'live',
    };
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// survey-program intervals (wp_survey_programs.intervals jsonb)
// ---------------------------------------------------------------------------

/**
 * Validate editor rows [{from_md_m, to_md_m, toolcode}] against the
 * survey extent. Returns {ok, errors, intervals} with intervals
 * normalized (numbers, sorted) — never throws, the editor renders the
 * errors inline.
 */
export function validateProgramIntervals(rows, { tdMdM } = {}) {
  const errors = [];
  const intervals = (rows || []).map((r, i) => ({
    from_md_m: Number(r.from_md_m),
    to_md_m: Number(r.to_md_m),
    toolcode: r.toolcode,
    row: i + 1,
  }));
  if (intervals.length === 0) {
    return { ok: false, errors: ['A survey program needs at least one interval.'], intervals: [] };
  }
  for (const it of intervals) {
    if (!Number.isFinite(it.from_md_m) || !Number.isFinite(it.to_md_m)) {
      errors.push(`Row ${it.row}: MD from/to must be numbers.`);
    } else if (!(it.to_md_m > it.from_md_m)) {
      errors.push(`Row ${it.row}: MD to must exceed MD from.`);
    }
    if (!TOOL_LIBRARY.some((t) => t.id === it.toolcode)) {
      errors.push(`Row ${it.row}: unknown tool.`);
    }
  }
  const sorted = intervals.slice().sort((a, b) => a.from_md_m - b.from_md_m);
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].from_md_m - sorted[i - 1].to_md_m) > 1e-6) {
      errors.push(`Rows must tile with no gaps or overlaps (at MD ${sorted[i].from_md_m}).`);
    }
  }
  if (sorted.length && Math.abs(sorted[0].from_md_m) > 1e-6) {
    errors.push('The first interval must start at MD 0.');
  }
  if (Number.isFinite(tdMdM) && sorted.length
    && sorted[sorted.length - 1].to_md_m < tdMdM - 1e-6) {
    errors.push(`The program ends at ${sorted[sorted.length - 1].to_md_m} m but the design reaches ${Math.round(tdMdM)} m.`);
  }
  return {
    ok: errors.length === 0,
    errors,
    intervals: sorted.map(({ row, ...it }) => it),
  };
}

// ---------------------------------------------------------------------------
// uncertainty over a station set
// ---------------------------------------------------------------------------

/**
 * Station covariances for grid-metre stations. When a valid survey
 * program covers the stations it composites per tool run; otherwise a
 * single ISCWSA MWD Rev4 run. Returns {totalCov, sources|null,
 * programUsed} — sources only for the single-run path (they feed KOP
 * slicing).
 */
export function computeStationUncertainty(stations, magRef, { programIntervals = null } = {}) {
  if (!magRef) throw new Error('No geomagnetic reference for the error model.');
  const header = {
    bTotalNT: magRef.bTotalNT,
    dipDeg: magRef.dipDeg,
    declinationDeg: magRef.declinationDeg,
    convergenceDeg: magRef.convergenceDeg,
    aziReference: 'grid',
  };
  const td = stations[stations.length - 1].md;
  const usable = Array.isArray(programIntervals) && programIntervals.length > 0
    && validateProgramIntervals(programIntervals, { tdMdM: td }).ok;
  if (usable) {
    const program = programIntervals.map((it) => ({
      fromMd: it.from_md_m, toMd: it.to_md_m, toolId: it.toolcode,
    }));
    const res = compileSurveyProgram(stations, header, program);
    return { totalCov: res.totalCov, sources: null, programUsed: res.runs.map((r) => r.toolId) };
  }
  const res = computeErrorModel(stations, header);
  return { totalCov: res.totalCov, sources: res.sources, programUsed: null };
}

/**
 * Plan-view EOU ellipse overlays in the caller's unit, every `every`th
 * station plus TD. rows are survey-table rows (e/n wellhead-relative,
 * user units) aligned 1:1 with covs (metres).
 */
export function eouPlanEllipses(rows, covs, { k = 2, every = 8, metersToUser = (v) => v } = {}) {
  if (!rows || !covs || rows.length !== covs.length) return [];
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    if (i !== rows.length - 1 && (i === 0 || i % every !== 0)) continue;
    const ell = horizontalEllipse(covs[i], { k });
    if (!(ell.semiMajor > 0)) continue;
    out.push({
      e: rows[i].e,
      n: rows[i].n,
      semiMajor: metersToUser(ell.semiMajor),
      semiMinor: metersToUser(ell.semiMinor),
      azimuthDeg: ell.azimuthDeg,
      md: rows[i].md,
    });
  }
  return out;
}

/**
 * Section-view uncertainty band: two overlay row sets (TVD ± k·σ_V)
 * in the same VS/TVD frame as the plan rows.
 */
export function eouSectionBand(rows, covs, { k = 2, metersToUser = (v) => v } = {}) {
  if (!rows || !covs || rows.length !== covs.length) return null;
  const up = [];
  const down = [];
  for (let i = 0; i < rows.length; i++) {
    const sv = metersToUser(k * Math.sqrt(Math.max(0, covs[i][2][2])));
    up.push({ vs: rows[i].vs, tvd: rows[i].tvd - sv });
    down.push({ vs: rows[i].vs, tvd: rows[i].tvd + sv });
  }
  return { up, down };
}

// ---------------------------------------------------------------------------
// AC well assembly (shared site frame)
// ---------------------------------------------------------------------------

/**
 * Build one well for the clearance engine from grid-metre stations.
 * Positions are absolute site-frame [site-CRS northing/easting] with
 * TVDSS as the shared vertical (KB elevations differ between wells).
 * kbElevM is the wellbore's KB elevation above the site vertical datum.
 */
export function buildAcWell({
  stations, headX = 0, headY = 0, kbElevM = 0, magRef, radius,
  programIntervals = null,
}) {
  if (!Array.isArray(stations) || stations.length < 2) {
    throw new Error('An anti-collision well needs at least 2 survey stations.');
  }
  const path = computeWellPath(stations, { surfaceX: headX, surfaceY: headY, kb: kbElevM });
  const positions = path.map((p) => ({ n: p.y, e: p.x, tvd: p.tvdss }));
  const { totalCov, sources } = computeStationUncertainty(stations, magRef, { programIntervals });
  return {
    stations, positions, cov: totalCov, sources, radius,
  };
}

/**
 * Run the separation-rule scan of a reference well against offsets:
 * [{id, label, kind, well}] where well is a buildAcWell result. Returns
 * [{id, label, kind, clearance, classification}] sorted worst-first.
 */
export function runAntiCollisionScan(referenceWell, offsets, params = DEFAULT_AC_PARAMS) {
  const results = offsets.map(({ id, label, kind, well }) => {
    const clearance = computeClearance(referenceWell, well, {
      k: params.k, sigmaPa: params.sigmaPa, Sm: params.Sm,
    });
    const classification = classifyClearance(clearance, {
      noGo: params.noGo, review: params.review,
    });
    return { id, label, kind, clearance, classification };
  });
  return results.sort((a, b) => a.clearance.summary.minSf - b.clearance.summary.minSf);
}

const round = (x, dp) => (Number.isFinite(x) ? +x.toFixed(dp) : null);

/**
 * Shape a scan into the immutable wp_ac_runs row (offsets, params,
 * results, summary). Series are rounded to keep the jsonb compact.
 */
export function serializeAcRun({ designId, reference = 'plan', results, params }) {
  const offsets = results.map((r) => ({ id: r.id, label: r.label, kind: r.kind }));
  const perOffset = results.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    status: r.classification.status,
    minSf: round(r.clearance.summary.minSf, 4),
    minSfMd: round(r.clearance.summary.minSfMd, 2),
    md: r.clearance.md.map((v) => round(v, 2)),
    sf: r.clearance.sf.map((v) => round(v, 4)),
    distanceCC: r.clearance.distanceCC.map((v) => round(v, 3)),
    masd: r.clearance.masd.map((v) => round(v, 3)),
    travCylAziDeg: r.clearance.travCylAziDeg.map((v) => round(v, 2)),
    toolfaceBearingDeg: r.clearance.toolfaceBearingDeg.map((v) => round(v, 2)),
  }));
  const statuses = results.map((r) => r.classification.status);
  const worst = results[0] || null;
  return {
    design_id: designId,
    reference,
    offsets,
    params,
    results: perOffset,
    summary: {
      offsetCount: results.length,
      overallMinSf: worst ? round(worst.clearance.summary.minSf, 4) : null,
      worstOffset: worst ? { id: worst.id, label: worst.label } : null,
      status: statuses.includes('no-go') ? 'no-go' : statuses.includes('review') ? 'review' : 'clear',
      counts: {
        noGo: statuses.filter((s) => s === 'no-go').length,
        review: statuses.filter((s) => s === 'review').length,
        clear: statuses.filter((s) => s === 'clear').length,
      },
    },
    engine_version: AC_ENGINE_VERSION,
  };
}

/**
 * Rebuild chart-ready results from a stored wp_ac_runs row (the
 * inverse of serializeAcRun, minus the fields charts don't need).
 */
export function deserializeAcRun(row) {
  return (row?.results || []).map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    classification: {
      status: r.status,
      minSf: r.minSf,
      thresholds: { noGo: row.params?.noGo ?? 1.0, review: row.params?.review ?? 1.5 },
    },
    clearance: {
      md: r.md,
      sf: r.sf,
      distanceCC: r.distanceCC,
      masd: r.masd,
      travCylAziDeg: r.travCylAziDeg,
      toolfaceBearingDeg: r.toolfaceBearingDeg,
      summary: { minSf: r.minSf, minSfMd: r.minSfMd },
    },
  }));
}

/** Per-station uncertainty listing rows (user units) for tables:
 *  {md, sigmaH, sigmaL, sigmaA, semiMajor, semiMinor, azimuthDeg}. */
export function uncertaintyTable(stations, covs, { k = 1, metersToUser = (v) => v } = {}) {
  const DEGR = Math.PI / 180;
  return stations.map((s, i) => {
    const sig = hlaSigmas(s.inc * DEGR, s.azi * DEGR, covs[i]);
    const ell = horizontalEllipse(covs[i], { k });
    return {
      md: s.md,
      sigmaH: metersToUser(k * sig.sigmaH),
      sigmaL: metersToUser(k * sig.sigmaL),
      sigmaA: metersToUser(k * sig.sigmaA),
      semiMajor: metersToUser(ell.semiMajor),
      semiMinor: metersToUser(ell.semiMinor),
      azimuthDeg: ell.azimuthDeg,
    };
  });
}
