// Scale wells for PL10 (AppUpgrade WC-U1, 2026-09-29): n located wells on
// one CRS, each logged 1,000 to 3,000 m at the 0.1524 m (half-foot) wireline
// step with ten curves (GR, RT, RHOB, NPHI, DT, CALI, SP, PEF, DRHO, RXO) and
// eight tops on a gentle anticline, so a 30 to 50 well section is the size a
// field study has. Closed-form, no RNG; the harness adds them with
// ?scaleWells=<n>.

const STEP = 0.1524;
const TOP = 1000;
const BASE = 3000;
const TOPS = ['Top Agbada', 'Sand A', 'Shale A', 'Sand B', 'Shale B', 'Sand C', 'Top Akata', 'Marker K'];

/** @param {number} n wells @returns {Object[]} wells in the in-memory seed shape */
export function scaleWells(n) {
  const count = Math.max(0, Math.min(200, Math.floor(n)));
  const samples = Math.round((BASE - TOP) / STEP) + 1;
  const out = [];
  for (let k = 0; k < count; k++) {
    const relief = 60 * Math.cos(((k - count / 2) / Math.max(1, count)) * Math.PI);
    const tops = TOPS.map((name, i) => ({ id: `scale-${k}-top-${i}`, well_id: `scale-${k}`, name, md_m: 1200 + i * 220 - relief + (k % 3) * 4, surface_type: 'formation_top' }));
    const curves = { DEPT: new Float32Array(samples) };
    const names = ['GR', 'RT', 'RHOB', 'NPHI', 'DT', 'CALI', 'SP', 'PEF', 'DRHO', 'RXO'];
    for (const c of names) curves[c] = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const md = TOP + i * STEP;
      curves.DEPT[i] = md;
      const zone = tops.filter((t) => t.md_m <= md).length;
      const sand = zone % 2 === 1;
      const w = Math.sin(md / 3 + k);
      curves.GR[i] = (sand ? 40 : 105) + 8 * w;
      curves.RT[i] = (sand ? 25 : 2.5) * (1 + 0.1 * w);
      curves.RHOB[i] = (sand ? 2.25 : 2.48) + 0.02 * w;
      curves.NPHI[i] = (sand ? 0.2 : 0.32) + 0.01 * w;
      curves.DT[i] = (sand ? 290 : 360) + 5 * w;
      curves.CALI[i] = 8.5 + (sand ? 0 : 0.6) + 0.1 * w;
      curves.SP[i] = (sand ? -60 : -10) + 3 * w;
      curves.PEF[i] = (sand ? 1.9 : 3.2) + 0.1 * w;
      curves.DRHO[i] = 0.01 * w;
      curves.RXO[i] = (sand ? 8 : 2) * (1 + 0.05 * w);
    }
    const meta = (unit) => ({ start_md_m: TOP, stop_md_m: BASE, step_m: STEP, n_samples: samples, unit });
    const units = { DEPT: 'M', GR: 'GAPI', RT: 'OHMM', RHOB: 'G/C3', NPHI: 'V/V', DT: 'US/M', CALI: 'IN', SP: 'MV', PEF: 'B/E', DRHO: 'G/C3', RXO: 'OHMM' };
    out.push({
      id: `scale-${k}`, user_id: 'user-dev', organization_id: null, is_own: true,
      name: `FIELD-${String(k + 1).padStart(2, '0')}`, uwi: `SC-${1000 + k}`,
      surface_x: 480000 + k * 800, surface_y: 6710000 + 300 * Math.sin(k / 3),
      crs: 'EPSG:32632', xy_unit: 'm', kb_m: 28, td_md_m: BASE, deviation: null,
      tops, curves, logMeta: Object.fromEntries(Object.entries(units).map(([c, u]) => [c, meta(u)])),
    });
  }
  return out;
}
