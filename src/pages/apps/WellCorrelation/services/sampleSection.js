// Deterministic synthetic 3-well correlation section (Well Correlation
// G3). Shared by the engine tests, the in-memory backend and the /dev
// harness so the e2e can assert exact geometry off the UI. No RNG:
// tops and curves are closed-form functions of depth.
//
// Geometry by construction (the flatten-on-'Top Dome' acceptance
// anchor): each well penetrates the same three tops at DIFFERENT MDs,
// so structural view shows relief and flattening on any top pins that
// top to a flat line across all three wells.

// well_id -> { name, surface, tops:[{name, md_m}], curves:{GR:[...]} }
const TOPS = {
  'corr-w1': { name: 'KETA-1', surface: [501000, 6700200], tops: [
    { name: 'Top Dome', md_m: 1500 }, { name: 'Mid Shale', md_m: 1580 }, { name: 'Base Sand', md_m: 1660 },
  ] },
  // KETA-2 builds angle below 1400 m (0 to 30 deg over 350 m), so TVD and
  // TVDSS differ from MD there: the depth-reference path has a real case
  'corr-w2': { name: 'KETA-2', surface: [502200, 6700600], deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1400, inc: 0, azi: 0 }, { md: 1750, inc: 30, azi: 90 }], tops: [
    { name: 'Top Dome', md_m: 1540 }, { name: 'Mid Shale', md_m: 1610 }, { name: 'Base Sand', md_m: 1705 },
  ] },
  'corr-w3': { name: 'KETA-3', surface: [503500, 6700400], tops: [
    // deliberately MISSING 'Mid Shale' -> exercises the flag path
    { name: 'Top Dome', md_m: 1470 }, { name: 'Base Sand', md_m: 1612 },
  ] },
};

const STEP = 0.5;
const TOP_MD = 1400;
const BOT_MD = 1750;

/** Shale flag shared by every curve: the interval from halfway between
 *  Top Dome and Base Sand down to Base Sand is shale. */
function lithology(md, tops) {
  const dome = tops.find((t) => t.name === 'Top Dome')?.md_m ?? TOP_MD;
  const base = tops.find((t) => t.name === 'Base Sand')?.md_m ?? BOT_MD;
  const shaleTop = dome + (base - dome) * 0.5;
  return { inShale: md >= shaleTop && md < base, phase: (md - dome) / 7 };
}

/** Closed-form GR: low in sands, high across the shale between Mid
 *  Shale and Base Sand; a clean deterministic wiggle otherwise. */
function grAt(md, tops) {
  const { inShale, phase } = lithology(md, tops);
  return (inShale ? 95 : 35) + 8 * Math.sin(phase);
}

// WC series (2026-09-03): resistivity, density and neutron with the same
// lithology so the quicklook template shows a log-scale RT track and the
// density-neutron crossover (shale: neutron left of density; sand: gas
// separation). Closed-form, no RNG.
function rtAt(md, tops) {
  const { inShale, phase } = lithology(md, tops);
  return (inShale ? 2 : 20) * (1 + 0.1 * Math.sin(phase));
}
function rhobAt(md, tops) {
  const { inShale, phase } = lithology(md, tops);
  return (inShale ? 2.45 : 2.25) + 0.02 * Math.sin(phase);
}
function nphiAt(md, tops) {
  const { inShale, phase } = lithology(md, tops);
  return (inShale ? 0.30 : 0.18) + 0.01 * Math.sin(phase);
}

/** Build the shared section: wells with tops + a synthetic GR curve. */
export function sampleWells() {
  return Object.entries(TOPS).map(([id, w], idx) => {
    const n = Math.round((BOT_MD - TOP_MD) / STEP) + 1;
    const depth = new Float64Array(n);
    const gr = new Float64Array(n);
    const rt = new Float64Array(n);
    const rhob = new Float64Array(n);
    const nphi = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const md = TOP_MD + i * STEP;
      depth[i] = md;
      gr[i] = grAt(md, w.tops);
      rt[i] = rtAt(md, w.tops);
      rhob[i] = rhobAt(md, w.tops);
      nphi[i] = nphiAt(md, w.tops);
    }
    const meta = (unit) => ({ start_md_m: TOP_MD, stop_md_m: BOT_MD, step_m: STEP, n_samples: n, unit });
    return {
      id,
      user_id: idx === 2 ? 'user-other' : 'user-dev', // W3 org-shared read-only
      organization_id: idx === 2 ? 'org-dev' : null,
      is_own: idx !== 2,
      name: w.name,
      surface_x: w.surface[0],
      surface_y: w.surface[1],
      kb_m: 30,
      td_md_m: BOT_MD,
      deviation: w.deviation || null,
      tops: w.tops.map((t, ti) => ({ id: `${id}-top-${ti}`, well_id: id, name: t.name, md_m: t.md_m })),
      curves: { DEPT: depth, GR: gr, RT: rt, RHOB: rhob, NPHI: nphi },
      logMeta: { DEPT: meta('M'), GR: meta('GAPI'), RT: meta('OHMM'), RHOB: meta('G/C3'), NPHI: meta('V/V') },
    };
  });
}

export const SAMPLE_META = { stepM: STEP, topMd: TOP_MD, botMd: BOT_MD };
