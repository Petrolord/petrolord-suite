// The hole/casing sections of a wellbore for the Drilling module (tester
// fix 2026-09-08). Every studio that needs an annulus (Torque & Drag,
// Hydraulics, Cementing, Well Control, Well Cost & Time, Geomechanics) reads
// the shared wp_wellbore_geometry spine, and the ONLY editor that writes it
// is the String & Geometry tab of Torque & Drag Studio. A tester who built
// the casing programme in Casing & Tubing Design Studio and imported the
// T&D drillstring therefore hit "No hole sections defined for this
// wellbore" on every Hydraulics run, with nothing telling them where the
// sections were looked for or where to put them.
//
// This resolver keeps the saved geometry row as the plan of record and falls
// back to the casing programme of the latest Casing & Tubing case (cased
// intervals from the innermost string at each depth, conventional hole size
// per casing OD, open hole to TD through the deepest shoe), and says which
// in `source`, `label` and `note`. Pure; the API layer (tdApi.getGeometry)
// fetches. NO '@/' aliases (jest + e2e import this file directly).

import { CASING_CATALOG } from '../engine/tubulars';

export const HOLE_SECTION_SOURCES = Object.freeze(['geometry', 'casing_programme', 'none']);

const IN = 0.0254;
const LBFT = 1.4881639;

// Standard roller-cone / PDC bit sizes (in), ascending.
export const STANDARD_BIT_SIZES_IN = Object.freeze([
  4.75, 5.875, 6, 6.125, 6.5, 6.75, 7.875, 8.375, 8.5, 8.75, 9.5, 9.875, 10.625,
  12.25, 13.5, 14.75, 16, 17.5, 20, 22, 24, 26, 28, 30, 32, 36, 42,
]);

// Conventional hole size drilled for a casing OD (in). Anything not listed
// takes the smallest standard bit at least 2.5 in over the casing OD.
export const HOLE_FOR_CASING_IN = Object.freeze({
  4.5: 6, 5: 6.125, 5.5: 7.875, 7: 8.5, 7.625: 9.875, 9.625: 12.25, 10.75: 14.75,
  11.75: 14.75, 13.375: 17.5, 16: 20, 18.625: 24, 20: 26, 24: 30, 30: 36,
});

const near = (a, b) => Math.abs(a - b) < 1e-6;

/** Hole size (m) conventionally drilled for a casing OD (m). */
export function holeSizeForCasingM(odM) {
  const odIn = odM / IN;
  const key = Object.keys(HOLE_FOR_CASING_IN).find((k) => near(Number(k), odIn));
  if (key) return HOLE_FOR_CASING_IN[key] * IN;
  const bit = STANDARD_BIT_SIZES_IN.find((b) => b >= odIn + 2.5);
  return (bit || odIn + 2.5) * IN;
}

/** Largest standard bit (m) that passes a casing ID (m), with 1/8 in drift allowance. */
export function bitThroughCasingM(idM) {
  const idIn = idM / IN;
  const fits = STANDARD_BIT_SIZES_IN.filter((b) => b <= idIn - 0.125);
  return (fits.length ? fits[fits.length - 1] : Math.max(idIn - 0.25, 1)) * IN;
}

/** Casing ID (m) from OD/weight: the API 5CT catalog row, else the API weight identity. */
export function casingIdM(odIn, weightLbFt) {
  const row = CASING_CATALOG.find((r) => near(r.odIn, odIn) && near(r.weightLbFt, weightLbFt));
  if (row) return row.idM;
  // W[lb/ft] = 10.68 * t * (OD - t), t and OD in inches (API 5CT plain-end weight).
  const disc = odIn * odIn - (4 * weightLbFt) / 10.68;
  const t = disc > 0 ? (odIn - Math.sqrt(disc)) / 2 : odIn * 0.05;
  return Math.max(odIn - 2 * t, odIn * 0.5) * IN;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const fracIn = (odIn) => {
  const whole = Math.floor(odIn);
  const eighths = Math.round((odIn - whole) * 8);
  if (eighths === 0) return `${whole}`;
  if (eighths === 8) return `${whole + 1}`;
  const g = gcd(8, eighths);
  return `${whole}-${eighths / g}/${8 / g}`;
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);

/** The casing sections (not tubing) of a Casing & Tubing case doc, flattened. */
export function casingSectionsOf(strings) {
  const out = [];
  for (const cs of strings?.casingStrings || []) {
    for (const s of cs.sections || []) {
      const top = num(s.topMdM);
      const bottom = num(s.bottomMdM);
      const odIn = num(s.odIn);
      const weightLbFt = num(s.weightLbFt);
      if (!(bottom > top) || !(odIn > 0)) continue;
      out.push({
        stringName: cs.name || 'Casing', top, bottom, odIn,
        weightLbFt: weightLbFt > 0 ? weightLbFt : NaN, grade: s.grade || '',
        odM: odIn * IN, idM: casingIdM(odIn, weightLbFt > 0 ? weightLbFt : odIn * 4.5),
      });
    }
  }
  return out;
}

/**
 * Derive wp_wellbore_geometry hole_sections (SI) from a Casing & Tubing
 * case's strings: the innermost casing governs each cased interval, open
 * hole runs from the deepest shoe to TD with the largest bit that passes
 * the innermost casing above. Empty when the doc has no casing sections.
 */
export function holeSectionsFromCasingStrings(strings, tdM = 0) {
  const secs = casingSectionsOf(strings);
  if (!secs.length) return [];
  const td = Number.isFinite(tdM) && tdM > 0 ? tdM : 0;
  const deepestShoe = Math.max(...secs.map((s) => s.bottom));
  const cuts = new Set([0]);
  for (const s of secs) { cuts.add(s.top); cuts.add(s.bottom); }
  if (td > deepestShoe) cuts.add(td);
  const edges = [...cuts].filter((x) => x >= 0 && (!td || x <= Math.max(td, deepestShoe))).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const a = edges[i];
    const b = edges[i + 1];
    if (!(b > a)) continue;
    const covering = secs.filter((s) => s.top <= a + 1e-9 && s.bottom >= b - 1e-9);
    let row;
    if (covering.length) {
      const inner = covering.reduce((m, s) => (s.idM < m.idM ? s : m));
      row = {
        from_md_m: a, to_md_m: b, cased: true,
        hole_id_m: holeSizeForCasingM(inner.odM),
        casing_od_m: inner.odM, casing_id_m: inner.idM,
        casing_weight_kgm: Number.isFinite(inner.weightLbFt) ? inner.weightLbFt * LBFT : null,
        grade: inner.grade || null,
        description: `${fracIn(inner.odIn)}"${Number.isFinite(inner.weightLbFt) ? ` ${inner.weightLbFt}` : ''}${inner.grade ? ` ${inner.grade}` : ''} (${inner.stringName})`,
      };
    } else {
      const above = secs.filter((s) => s.bottom <= a + 1e-9);
      const inner = above.length ? above.reduce((m, s) => (s.idM < m.idM ? s : m)) : null;
      const holeM = inner ? bitThroughCasingM(inner.idM) : 12.25 * IN;
      row = {
        from_md_m: a, to_md_m: b, cased: false, hole_id_m: holeM,
        description: `${fracIn(holeM / IN)}" open hole`,
      };
    }
    const prev = out[out.length - 1];
    if (prev && prev.cased === row.cased && near(prev.hole_id_m, row.hole_id_m)
      && near(prev.casing_id_m || 0, row.casing_id_m || 0) && near(prev.to_md_m, row.from_md_m)) {
      prev.to_md_m = row.to_md_m;
    } else {
      out.push(row);
    }
  }
  // Clamp to TD when the programme runs past it (a shoe typed as TD + 0.01).
  return out
    .map((r) => (td && r.to_md_m > td ? { ...r, to_md_m: td } : r))
    .filter((r) => r.to_md_m > r.from_md_m + 1e-6);
}

const fmtM = (m) => Math.round(m).toLocaleString('en-US');

function describe(sections) {
  return sections.map((s) => (s.cased
    ? `${fracIn((s.casing_od_m || 0) / IN)}" casing to ${fmtM(s.to_md_m)} m`
    : `${fracIn((s.hole_id_m || 0) / IN)}" open hole to ${fmtM(s.to_md_m)} m`)).join(', ');
}

/** The latest Casing & Tubing case with casing sections. */
export function latestCasingCase(ctCases) {
  return (ctCases || [])
    .filter((c) => casingSectionsOf(c.strings).length)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0] || null;
}

const planName = (trajectory) => {
  if (trajectory?.design?.name) return `${trajectory.design.name} r${trajectory.design.revision ?? 1}`;
  return trajectory?.label || 'no trajectory';
};

/**
 * Resolve the hole sections a downstream studio should use.
 * @param {Object} p
 * @param {Object} [p.geometry] wp_wellbore_geometry row (or null)
 * @param {Array} [p.ctCases] wp_ct_cases rows of the wellbore
 * @param {Object} [p.trajectory] the resolved trajectory ({design, label, stations}) for TD and naming
 * @param {Object} [p.wellbore] wp_wellbores row for naming
 * @returns {{hole_sections: Array, source: string, label: string, note: string, wellbore_id: string}}
 *   plus the geometry row's own columns when it exists.
 */
export function resolveHoleSections({ geometry = null, ctCases = [], trajectory = null, wellbore = null } = {}) {
  const wellboreId = geometry?.wellbore_id || wellbore?.id || trajectory?.wellbore?.id || null;
  const wb = wellbore || trajectory?.wellbore || null;
  const wellName = wb?.name ? `wellbore '${wb.name}'` : 'this wellbore';
  const plan = planName(trajectory);
  const saved = Array.isArray(geometry?.hole_sections) ? geometry.hole_sections : [];
  if (saved.length) {
    return {
      ...geometry, wellbore_id: wellboreId, hole_sections: saved, source: 'geometry',
      label: `${saved.length} hole section${saved.length === 1 ? '' : 's'} from the String & Geometry tab (Torque & Drag Studio): ${describe(saved)}`,
      note: '',
    };
  }
  const stations = Array.isArray(trajectory?.stations) ? trajectory.stations : [];
  const tdM = stations.length ? Number(stations[stations.length - 1].md) : 0;
  const ct = latestCasingCase(ctCases);
  if (ct) {
    const derived = holeSectionsFromCasingStrings(ct.strings, tdM);
    if (derived.length) {
      return {
        ...(geometry || {}), wellbore_id: wellboreId, hole_sections: derived, source: 'casing_programme',
        label: `${derived.length} hole section${derived.length === 1 ? '' : 's'} derived from Casing & Tubing case '${ct.name}': ${describe(derived)}`,
        note: `Nothing is saved on the String & Geometry tab in Torque & Drag Studio for ${wellName}, so the hole sections were derived from the casing programme of Casing & Tubing case '${ct.name}' (hole sizes are the conventional ones for each casing OD). Review them on that tab and Save to make them the plan of record.`,
      };
    }
  }
  return {
    ...(geometry || {}), wellbore_id: wellboreId, hole_sections: [], source: 'none',
    label: 'No hole sections',
    note: `No hole sections found for ${wellName} on ${plan}: nothing saved on the String & Geometry tab in Torque & Drag Studio and no casing strings in Casing & Tubing Design Studio. Define casing and open hole sections on that tab (Save case writes them for every Drilling studio), or build the casing programme in Casing & Tubing Design Studio.`,
  };
}

/** The error a run service throws when a geometry row carries no sections. */
export function missingHoleSectionsMessage(geometryRow) {
  if (geometryRow?.source === 'none' && geometryRow.note) return geometryRow.note;
  return 'No hole sections found for this wellbore: nothing saved on the String & Geometry tab in Torque & Drag Studio and no casing strings in Casing & Tubing Design Studio. Define casing and open hole sections on that tab and Save.';
}
