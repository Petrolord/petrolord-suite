// The substitution as a file a reviewer can sign (RP-U1-010, PL7,
// 2026-10-01). A CSV with a header block that names the well, zone, field,
// analyst, date, build, units, conditions, both fluids as used, the
// mineral modulus and its source, the porosity basis, the Vs source, the
// Gassmann limits and the sample counts; then one row per zone sample in
// the display units, with each sample's status. Plain ASCII (Latin-1 safe).
// Pure; the panel hands the text to the browser.

import { buildLabel } from '@/lib/platformBuild';
import { describeFluid } from './publish';
import { velocityToDisplay, densityToDisplay, depthToDisplay } from './units';
import { acousticImpedance, vpVs } from './elastic';

const cell = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '');
const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
const ascii = (s) => String(s ?? '').replace(/[·•]/g, '.').replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '');

/**
 * @param {Object} p
 * @param {{name: string}} p.well
 * @param {{name: string, top_md_m: number, base_md_m: number}} p.zone
 * @param {Object} p.model the SI well model (prep.buildModel)
 * @param {Object} p.sub substituteZone output
 * @param {number[]} p.indices zone sample indices
 * @param {Object} p.scenario @param {Object} p.rock
 * @param {{velocity: string, density: string, depth: string}} p.units display units
 * @param {{field?: string, analyst?: string}} [p.reviewer]
 * @param {Date} [p.now]
 */
export function substitutionCsv({ well, zone, model, sub, indices, scenario, rock, units, reviewer = {}, now = new Date() }) {
  const vU = units.velocity === 'us/ft' || units.velocity === 'us/m' ? 'm/s' : units.velocity;
  const dU = units.density;
  const zU = units.depth;
  const c = scenario.conditions;
  const kmin = sub.kminSource === 'vsh'
    ? `${(sub.kminMin / 1e9).toFixed(3)} to ${(sub.kminMax / 1e9).toFixed(3)} GPa (clay at VSH, Voigt-Reuss-Hill)`
    : `${(sub.kmin / 1e9).toFixed(3)} GPa (${sub.kminSource === 'override' ? 'override' : 'Voigt-Reuss-Hill of the mineral table'})`;
  const minerals = Object.entries(rock.minerals || {}).filter(([, f]) => f > 0).map(([m, f]) => `${m} ${f}`).join(', ');
  const header = [
    ['Report', 'Rock Physics Studio: Gassmann fluid substitution'],
    ['Field', reviewer.field || ''],
    ['Well', well?.name || ''],
    ['Zone', `${zone.name} (MD ${cell(depthToDisplay(zone.top_md_m, zU), 1)} to ${cell(depthToDisplay(zone.base_md_m, zU), 1)} ${zU})`],
    ['Analyst', reviewer.analyst || ''],
    ['Date', now.toISOString().slice(0, 19).replace('T', ' ')],
    ['Software', buildLabel()],
    ['Units', `depth ${zU} MD; velocity ${vU}; density ${dU}; impedance ${vU}*${dU}`],
    ['Conditions', `${cell(c.tC, 1)} degC, pore pressure ${cell(c.pMPa, 2)} MPa, salinity ${c.salinity} weight fraction NaCl (Batzle-Wang 1992)`],
    ['Fluid A (in situ)', `${describeFluid(scenario.fluidA)}${sub.swFromLog ? ' with Sw from the SW log per sample' : ''}: K ${cell(sub.flA.k / 1e9, 4)} GPa, density ${cell(sub.flA.rho, 1)} kg/m3`],
    ['Fluid B (substitute)', `${describeFluid(scenario.fluidB)}: K ${cell(sub.flB.k / 1e9, 4)} GPa, density ${cell(sub.flB.rho, 1)} kg/m3`],
    ['Mineral modulus', `${kmin}; minerals ${minerals || 'none'}`],
    ['Porosity', model.phiCurve ? `${model.phiCurve} (${model.phiBasis === 'total' ? 'total' : 'effective'} porosity)` : `constant ${rock.phiConst}`],
    ['Shear', model.vsSource === 'estimated' ? 'Vs estimated (Greenberg-Castagna on VSH); no shear log' : 'measured shear log'],
    ['Gassmann limits', `substituted where VSH <= ${rock.vshMax ?? 1} and porosity >= ${rock.phiMin ?? 0}`],
    ['Samples', `${indices.length} in zone; ${sub.done} substituted; ${sub.outside || 0} left in situ (outside the limits); ${sub.skipped} skipped${sub.firstError ? ` (${sub.firstError})` : ''}`],
    ['Method', 'Gassmann (1951) through the dry rock; shear modulus unchanged; density by pore-fluid swap'],
  ];
  const lines = header.map(([k, v]) => `# ${ascii(k)}: ${ascii(v)}`);
  lines.push([
    `MD (${zU})`, `Vp in situ (${vU})`, `Vp B (${vU})`, `Vs in situ (${vU})`, `Vs B (${vU})`,
    `Density in situ (${dU})`, `Density B (${dU})`, 'AI in situ', 'AI B', 'Vp/Vs in situ', 'Vp/Vs B',
    'Porosity (v/v)', 'VSH (v/v)', 'SW (v/v)', 'Status',
  ].map(q).join(','));
  const vd = (x) => velocityToDisplay(x, vU);
  const dd = (x) => densityToDisplay(x, dU);
  const vDig = vU === 'ft/s' ? 0 : 1;
  const dDig = dU === 'g/cc' ? 4 : 1;
  const aiF = (vp, rho) => vd(1) * dd(1) * acousticImpedance(vp, rho);
  for (const i of indices) {
    const done = Number.isFinite(sub.vp[i]);
    const phi = model.phi ? model.phi[i] : rock.phiConst;
    const vsh = model.vsh ? model.vsh[i] : NaN;
    const outside = !done && Number.isFinite(phi) && ((Number.isFinite(vsh) && vsh > (rock.vshMax ?? 1)) || phi < (rock.phiMin ?? 0));
    const status = done ? 'substituted' : outside ? 'in situ (outside limits)' : 'skipped';
    lines.push([
      cell(depthToDisplay(model.depth[i], zU), 2),
      cell(vd(model.vp[i]), vDig), cell(vd(sub.vp[i]), vDig),
      cell(vd(model.vs[i]), vDig), cell(vd(sub.vs[i]), vDig),
      cell(dd(model.rho[i]), dDig), cell(dd(sub.rho[i]), dDig),
      cell(aiF(model.vp[i], model.rho[i]), 0), cell(aiF(sub.vp[i], sub.rho[i]), 0),
      cell(vpVs(model.vp[i], model.vs[i]), 4), cell(vpVs(sub.vp[i], sub.vs[i]), 4),
      cell(phi, 4), cell(vsh, 4), cell(model.sw ? model.sw[i] : NaN, 4), status,
    ].map(q).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** File name: rock-physics_<well>_<zone>.csv (safe characters only). */
export const substitutionCsvName = (well, zone) => `rock-physics_${String(well?.name || 'well').replace(/[^A-Za-z0-9-]+/g, '_')}_${String(zone?.name || 'zone').replace(/[^A-Za-z0-9-]+/g, '_')}.csv`;
