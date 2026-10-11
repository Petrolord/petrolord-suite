// Project Data Inventory: the notes. Deterministic rules over the built
// inventory (never a language model): each rule looks for one gap or
// limitation and, when it finds it, says which wells or volumes it touches,
// what it does to the analysis (impact), what the Suite can do instead
// (workaround), how far to trust the result (uncertainty) and how to close
// the gap (mitigation). The workarounds name methods the Suite already
// runs: Greenberg-Castagna, the local shear trend and Xu-White in Rock
// Physics Studio, bad-hole repair in Petrophysics Studio, splice and sonic
// drift correction in Well Data Manager, the Seismolord tie, the QI Studio
// prestack chain. Pure.

import { AVAILABLE } from './status';
import { fmtDepth } from './coverage';
import { checkshotPairs, tieRecord, TIE_GOOD, TIE_POOR } from './cells';
import { insidePolygon } from './seismic';

export const SEVERITIES = Object.freeze(['high', 'medium', 'low', 'info']);
export const SEVERITY_LABEL = Object.freeze({ high: 'High', medium: 'Medium', low: 'Low', info: 'Note' });

const st = (row, col) => row.cells[col]?.status;
const absent = (row, col) => ['missing', 'notAcquired'].includes(st(row, col));
const usable = (row, col) => ['complete', 'partial', 'derived'].includes(st(row, col));
const measured = (row, col) => ['complete', 'partial'].includes(st(row, col));
const names = (rows) => rows.map((r) => r.wellName);
const list = (arr, max = 6) => (arr.length <= max ? joinAnd(arr) : `${arr.slice(0, max).join(', ')} and ${arr.length - max} more`);
function joinAnd(a) {
  if (a.length <= 1) return a.join('');
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}
const ofN = (k, n, noun = 'wells') => `${k} of ${n} ${noun}`;
const pct = (f) => `${Math.round(f * 100)}%`;
// a length in the project's depth unit, from feet (the oilfield default)
const len = (ft, unit) => (unit === 'm' ? `${Math.round((ft * 0.3048) / 5) * 5 || Math.round(ft * 0.3048)} m` : `${ft.toLocaleString('en-GB')} ft`);

/**
 * Two-way time at a measured depth from the well's checkshots (linear in
 * MD between levels, extrapolated with the last interval velocity below).
 */
export function twtAtMd(well, md) {
  const cs = checkshotPairs(well).filter((c) => Number.isFinite(c.md)).sort((a, b) => a.md - b.md);
  if (cs.length < 2 || !Number.isFinite(md)) return null;
  for (let i = 1; i < cs.length; i++) {
    if (md <= cs[i].md) {
      const a = cs[i - 1];
      const b = cs[i];
      return a.twt + ((md - a.md) / (b.md - a.md)) * (b.twt - a.twt);
    }
  }
  const a = cs[cs.length - 2];
  const b = cs[cs.length - 1];
  return b.twt + ((md - b.md) / (b.md - a.md)) * (b.twt - a.twt);
}

/**
 * The rule set. Each rule: id, area, workflows it limits, and find(ctx),
 * which returns null or a finding { severity, scope, title, impact,
 * workaround, uncertainty, mitigation }.
 */
export const RULES = Object.freeze([
  // ---------------------------------------------------------------- wells
  {
    id: 'datum-none', area: 'Wells', workflows: ['tie', 'depth', 'avo', 'inversion'],
    find({ rows }) {
      const hit = rows.filter((r) => absent(r, 'datum'));
      if (!hit.length) return null;
      return {
        severity: 'high', scope: names(hit),
        title: `Depth reference not set on ${list(names(hit))}`,
        impact: 'TVDSS is unknown at these wells, so their tops, the time-depth relation and every map or tie that uses them carry the datum error.',
        workaround: 'None that is safe. A guessed elevation shifts every depth at the well by the guess.',
        uncertainty: 'Unbounded until the elevation is known; an onshore KB is typically 5 to 15 m above ground, an offshore RT 20 to 40 m above sea level.',
        mitigation: 'Take the KB or RT elevation from the final well report and set it in Well Data Manager (Header, Depth reference).',
      };
    },
  },
  {
    id: 'shear-none', area: 'Wells', workflows: ['rockphysics', 'avo', 'simultaneous'],
    find({ rows, audience }) {
      const hit = rows.filter((r) => absent(r, 'dts'));
      if (!hit.length) return null;
      const withShear = rows.filter((r) => measured(r, 'dts'));
      const all = hit.length === rows.length;
      return {
        severity: all || audience === 'qi' ? 'high' : 'medium', scope: names(hit),
        title: `No shear sonic at ${ofN(hit.length, rows.length)}${all ? '' : ` (${list(names(hit))})`}`,
        impact: 'Vp/Vs, Poisson\'s ratio, the AVO gradient and any shear impedance at these wells rest on an estimated Vs, so fluid and lithology separation in the elastic domain is indicative at best.',
        workaround: withShear.length
          ? `Estimate Vs in Rock Physics Studio with the local shear trend calibrated on ${list(names(withShear), 4)} (wells with dipole shear), falling back to Greenberg-Castagna; use Xu-White for shaly or cemented intervals.`
          : 'Estimate Vs in Rock Physics Studio with Greenberg-Castagna on the Vsh sand and shale split, or with Xu-White inclusion modelling where porosity and clay volume are known.',
        uncertainty: withShear.length
          ? 'A locally calibrated trend typically predicts brine-sand Vs within 3 to 5 percent; uncertainty grows in gas sands and in shales outside the calibration range.'
          : 'Greenberg-Castagna typically predicts brine-sand Vs within 5 to 10 percent; Vp/Vs carries roughly plus or minus 0.1, which can hide a hydrocarbon effect of the same size.',
        mitigation: withShear.length
          ? 'Blind-test the trend: leave one shear well out, predict it and quote the misfit. Acquire dipole sonic in the next well.'
          : 'Acquire a dipole sonic in the next well or a re-entry; until then treat AVO and simultaneous inversion results as qualitative.',
      };
    },
  },
  {
    id: 'shear-estimated', area: 'Wells', workflows: ['rockphysics', 'avo', 'simultaneous'],
    find({ rows }) {
      const hit = rows.filter((r) => st(r, 'dts') === 'derived');
      if (!hit.length) return null;
      const how = [...new Set(hit.map((r) => r.cells.dts.derivedHow).filter(Boolean))];
      return {
        severity: 'medium', scope: names(hit),
        title: `Shear is an estimate at ${list(names(hit))}`,
        impact: `The DTS on these wells is ${how.join('; ') || 'estimated'}. Anything calibrated on it (rock physics templates, AVO class, inversion low-frequency model) inherits the estimator\'s error.`,
        workaround: 'Keep these wells out of the shear calibration; use them for validation of P-impedance only.',
        uncertainty: 'Typically 5 to 10 percent in Vs for brine sands, more in gas sands and soft shales.',
        mitigation: 'Replace with a measured dipole shear when one is available, and record the estimator in the study report.',
      };
    },
  },
  {
    id: 'sonic-none', area: 'Wells', workflows: ['tie', 'rockphysics', 'inversion', 'avo', 'simultaneous'],
    find({ rows }) {
      const hit = rows.filter((r) => absent(r, 'dtc'));
      if (!hit.length) return null;
      return {
        severity: 'high', scope: names(hit),
        title: `No compressional sonic at ${list(names(hit))}`,
        impact: 'No synthetic seismogram, no acoustic impedance and no velocity for fluid substitution at these wells; they cannot anchor a tie or an inversion.',
        workaround: 'Estimate a pseudo-sonic (Rock Physics Studio: Gardner from density, or Faust from deep resistivity) and use the well for qualitative correlation only.',
        uncertainty: 'Pseudo-sonics commonly miss by 10 percent or more in velocity, and they cannot be trusted across lithology changes.',
        mitigation: 'Request the sonic from the operator\'s archive; a VSP or checkshot survey constrains time-depth even without it.',
      };
    },
  },
  {
    id: 'density-none', area: 'Wells', workflows: ['petro', 'rockphysics', 'inversion', 'avo', 'simultaneous'],
    find({ rows }) {
      const hit = rows.filter((r) => absent(r, 'rhob'));
      if (!hit.length) return null;
      return {
        severity: 'high', scope: names(hit),
        title: `No bulk density at ${list(names(hit))}`,
        impact: 'Acoustic impedance, density porosity and Gassmann fluid substitution cannot be computed at these wells, and their synthetics rest on the sonic alone.',
        workaround: 'Pseudo-density from the sonic (Gardner) for the tie only; porosity from neutron or sonic (Wyllie or Raymer-Hunt-Gardner) in Petrophysics Studio.',
        uncertainty: 'Gardner density is typically within 0.05 to 0.1 g/cc in clastics, enough to blur a 5 percent impedance contrast.',
        mitigation: 'Request the density log; leave these wells out of rock physics calibration until it is loaded.',
      };
    },
  },
  {
    id: 'neutron-none', area: 'Wells', workflows: ['petro'],
    find({ rows }) {
      const hit = rows.filter((r) => absent(r, 'nphi'));
      if (!hit.length) return null;
      return {
        severity: 'medium', scope: names(hit),
        title: `No neutron porosity at ${list(names(hit))}`,
        impact: 'No neutron-density crossplot at these wells, so lithology, gas crossover and the shale correction rely on other curves.',
        workaround: 'Density porosity with a matrix density chosen from core or offset wells; Vsh from gamma ray; flag possible gas from the resistivity profile.',
        uncertainty: 'Single-curve porosity carries about plus or minus 0.02 to 0.03 v/v from the matrix and fluid density choice.',
        mitigation: 'Calibrate the matrix density to core where there is any; request the neutron log.',
      };
    },
  },
  {
    id: 'deepres-none', area: 'Wells', workflows: ['petro', 'rockphysics'],
    find({ rows, audience }) {
      const hit = rows.filter((r) => absent(r, 'rdeep'));
      if (!hit.length) return null;
      return {
        severity: audience === 'petro' ? 'high' : 'medium', scope: names(hit),
        title: `No deep resistivity at ${list(names(hit))}`,
        impact: 'Water saturation cannot be computed from logs at these wells, so hydrocarbon pore volume and the fluid case for substitution are unconstrained.',
        workaround: 'Use a saturation-height function from SCAL Studio, or carry the field\'s average Sw by zone from offset wells.',
        uncertainty: 'Saturation-height Sw is typically within 0.05 to 0.1 of log Sw where the free-water level is known; much wider where it is not.',
        mitigation: 'Request the resistivity log; confirm the free-water level from pressure data.',
      };
    },
  },
  {
    id: 'shallowres-none', area: 'Wells', workflows: ['petro'],
    find({ rows }) {
      const hit = rows.filter((r) => absent(r, 'rshallow') && usable(r, 'rdeep'));
      if (!hit.length) return null;
      return {
        severity: 'low', scope: names(hit),
        title: `No shallow resistivity at ${list(names(hit))}`,
        impact: 'No invasion profile, so the deep reading is taken as Rt without correction and movable hydrocarbons cannot be seen.',
        workaround: 'Take Rt equal to the deep reading; where invasion is deep, expect Rt to be understated.',
        uncertainty: 'In deeply invaded permeable sands, uncorrected Rt can overstate Sw by 0.05 or more.',
        mitigation: 'Check the mud type and invasion diameter in the final well report.',
      };
    },
  },
  {
    id: 'gr-none', area: 'Wells', workflows: ['petro'],
    find({ rows }) {
      const hit = rows.filter((r) => absent(r, 'gr'));
      if (!hit.length) return null;
      const withSp = hit.filter((r) => usable(r, 'sp'));
      return {
        severity: 'medium', scope: names(hit),
        title: `No gamma ray at ${list(names(hit))}`,
        impact: 'Shale volume and correlation at these wells lose their primary curve.',
        workaround: withSp.length ? `SP-derived Vsh on ${list(names(withSp))}; neutron-density Vsh elsewhere.` : 'Neutron-density or resistivity-derived Vsh in Petrophysics Studio.',
        uncertainty: 'Alternative Vsh indicators commonly differ from gamma-ray Vsh by 0.1 or more.',
        mitigation: 'Request the gamma ray; it is almost always run and often sits in a separate composite file.',
      };
    },
  },
  {
    id: 'caliper-none', area: 'Wells', workflows: ['petro'],
    find({ rows }) {
      const hit = rows.filter((r) => absent(r, 'cal'));
      if (!hit.length) return null;
      const drho = hit.filter((r) => st(r, 'hole') !== 'missing');
      return {
        severity: 'low', scope: names(hit),
        title: `No caliper at ${list(names(hit))}`,
        impact: 'Washouts cannot be seen directly, so pad-tool readings (density, neutron, PEF) in enlarged hole may pass unflagged.',
        workaround: drho.length ? `Screen with the density correction (|DRHO| above 0.15 g/cc) on ${list(names(drho))}.` : 'Screen for unrealistically low density and high neutron against offset wells.',
        uncertainty: 'Undetected washouts commonly bias density porosity high by 0.02 to 0.05 v/v over the affected intervals.',
        mitigation: 'Request the caliper (it is usually on the density run).',
      };
    },
  },
  {
    id: 'badhole', area: 'Wells', workflows: ['petro', 'rockphysics', 'tie'],
    find({ rows }) {
      const hit = rows.filter((r) => st(r, 'hole') === 'partial' && Number.isFinite(r.cells.hole.badShare));
      if (!hit.length) return null;
      return {
        severity: hit.some((r) => r.cells.hole.badShare > 0.2) ? 'high' : 'medium', scope: names(hit),
        title: `Bad hole over part of the interval at ${list(hit.map((r) => `${r.wellName} (${pct(r.cells.hole.badShare)})`))}`,
        impact: 'Density, neutron and PEF read the borehole over these intervals, so porosity, impedance and synthetic amplitudes are biased there.',
        workaround: 'Flag bad hole in Petrophysics Studio (Condition, bad-hole repair), replace density over the flagged intervals with a sonic- or resistivity-based reconstruction, and exclude them from rock physics calibration.',
        uncertainty: 'Reconstructed density typically carries 0.03 to 0.06 g/cc over repaired intervals.',
        mitigation: 'Report the repaired footage per zone; where bad hole covers a reservoir, prefer sidewall core porosity there.',
      };
    },
  },
  {
    id: 'coverage-partial', area: 'Wells', workflows: ['petro', 'rockphysics'],
    find({ rows, columns }) {
      const items = [];
      for (const r of rows) {
        for (const c of columns) {
          if (c.source !== 'curve' || c.sparse || c.kind !== 'measured') continue;
          const cell = r.cells[c.key];
          if (cell.status === 'partial' && !cell.overridden && Number.isFinite(cell.coverage)) items.push({ r, c, cell });
        }
      }
      if (!items.length) return null;
      const wells = [...new Set(items.map((i) => i.r.wellName))];
      return {
        severity: items.some((i) => ['rhob', 'dtc', 'rdeep'].includes(i.c.key) && i.cell.coverage < 0.8) ? 'high' : 'medium', scope: wells,
        title: `Partial curve coverage over the interval: ${list(items.map((i) => `${i.r.wellName} ${i.c.label} ${pct(i.cell.coverage)}`), 5)}`,
        impact: 'Results computed over the interval only cover the logged part; zone averages and net-to-gross from these curves are biased toward the covered section.',
        workaround: 'Splice a second run in Well Data Manager (Edit logs, Splice) where one exists; otherwise predict the missing section from the other curves and mark it as estimated.',
        uncertainty: 'Predicted sections typically carry 5 to 15 percent error in the predicted property.',
        mitigation: 'Check the final well report for a second logging run or a repeat section.',
      };
    },
  },
  {
    id: 'digitized', area: 'Wells', workflows: ['petro', 'rockphysics'],
    find({ rows, columns }) {
      const items = [];
      for (const r of rows) for (const c of columns) if (/digitized/.test(r.cells[c.key]?.curve?.derived || '')) items.push(`${r.wellName} ${c.label}`);
      if (!items.length) return null;
      return {
        severity: 'low', scope: [...new Set(items.map((s) => s.split(' ')[0]))],
        title: `Digitized curves in use: ${list(items, 5)}`,
        impact: 'Digitized curves are utility grade: vertical resolution and scale accuracy are limited by the raster.',
        workaround: 'Use them for correlation and zonation; keep them out of quantitative calibration where a recorded curve exists.',
        uncertainty: 'Typically 2 to 5 percent of scale in value and a sample or two in depth.',
        mitigation: 'Request the recorded LAS or DLIS from the archive.',
      };
    },
  },
  {
    id: 'petro-none', area: 'Wells', workflows: ['rockphysics', 'inversion'],
    find({ rows, audience }) {
      const hit = rows.filter((r) => absent(r, 'phi') || absent(r, 'sw'));
      if (!hit.length) return null;
      const canRun = hit.filter((r) => usable(r, 'rdeep') && (usable(r, 'rhob') || usable(r, 'nphi')));
      return {
        severity: audience === 'qi' ? 'medium' : 'low', scope: names(hit),
        title: `No published porosity or saturation at ${list(names(hit))}`,
        impact: 'Fluid substitution falls back to a constant porosity and typed fluid states at these wells, and property prediction has no target curve there.',
        workaround: canRun.length ? `Run Petrophysics Studio on ${list(names(canRun))} (the inputs are loaded) and publish VSH, PHIE and SW.` : 'Carry zone-average porosity and saturation from the nearest interpreted well, and say so.',
        uncertainty: 'Constant-porosity substitution misstates the impedance change by up to a third in heterogeneous sands.',
        mitigation: 'Publish an interpretation for every well before the rock physics step.',
      };
    },
  },
  {
    id: 'survey-none', area: 'Wells', workflows: ['tie', 'depth'],
    find({ rows, unit }) {
      const hit = rows.filter((r) => absent(r, 'survey') || st(r, 'survey') === 'partial');
      if (!hit.length) return null;
      return {
        severity: 'medium', scope: names(hit),
        title: `Deviation survey missing or short at ${list(names(hit))}`,
        impact: 'These wells are taken as vertical below the last station, so TVD, the well track in the seismic and the position of tops on maps may be wrong.',
        workaround: 'Accept vertical if the final well report says so; otherwise extrapolate the last station\'s inclination and azimuth.',
        uncertainty: `For a well at 30 degrees, a vertical assumption misplaces ${len(1000, unit)} of hole by about ${len(130, unit)} in TVD and ${len(500, unit)} laterally.`,
        mitigation: 'Load the definitive survey from the final well report in Well Data Manager.',
      };
    },
  },
  {
    id: 'checkshots-none', area: 'Wells', workflows: ['tie', 'depth', 'inversion'],
    find({ rows, seismic, unit }) {
      const hit = rows.filter((r) => absent(r, 'checkshots'));
      if (!hit.length) return null;
      const anySeismic = seismic.stacks.length > 0;
      return {
        severity: anySeismic ? 'high' : 'medium', scope: names(hit),
        title: `No checkshots at ${ofN(hit.length, rows.length)}${hit.length === rows.length ? '' : ` (${list(names(hit))})`}`,
        impact: 'Time-depth at these wells comes from the integrated sonic alone, which drifts with depth (dispersion, washouts, invasion), so ties and depth conversion carry that drift.',
        workaround: 'Build a sonic-integrated time-depth relation and tie it to seismic markers in Seismolord (Synthetics: bulk shift plus stretch anchors); borrow the drift from the nearest well with checkshots.',
        uncertainty: `Sonic drift is commonly 10 to 30 ms over a ${len(5000, unit)} section, which is ${len(50, unit).replace(/ (ft|m)$/, '')} to ${len(150, unit)} of depth at reservoir velocities.`,
        mitigation: 'Drift-correct the sonic in Well Data Manager once any checkshot or VSP is found; acquire checkshots in future wells.',
      };
    },
  },
  {
    id: 'checkshots-shallow', area: 'Wells', workflows: ['tie', 'depth'],
    find({ rows }) {
      const hit = rows.filter((r) => st(r, 'checkshots') === 'partial');
      if (!hit.length) return null;
      return {
        severity: 'medium', scope: names(hit),
        title: `Checkshots stop above the target at ${list(names(hit))}`,
        impact: 'Time-depth over the target is extrapolated from the deepest level.',
        workaround: 'Extend with the drift-corrected sonic below the last level.',
        uncertainty: 'Grows with the extrapolated thickness; a few milliseconds per thousand feet is typical.',
        mitigation: 'Look for a VSP or a deeper checkshot run in the well file.',
      };
    },
  },
  {
    id: 'tie-none', area: 'Wells', workflows: ['tie', 'inversion', 'simultaneous'],
    find({ rows, seismic }) {
      if (!seismic.stacks.length) return null;
      const hit = rows.filter((r) => absent(r, 'tie') && usable(r, 'dtc') && usable(r, 'rhob'));
      if (!hit.length) return null;
      return {
        severity: 'medium', scope: names(hit),
        title: `Wells with sonic and density but no tie: ${list(names(hit))}`,
        impact: 'No extracted wavelet and no verified time-depth at these wells, so they cannot calibrate the inversion or the amplitude scale.',
        workaround: 'Tie them in Seismolord (Synthetics) with the drift-corrected sonic, and commit the tie so QI Studio reads it.',
        uncertainty: 'An untied well can sit a quarter-period or more off the seismic, enough to put a top on the wrong trough.',
        mitigation: 'Tie every well with sonic and density before inversion; quote the correlation per well.',
      };
    },
  },
  {
    id: 'tie-fair', area: 'Wells', workflows: ['tie', 'inversion', 'avo'],
    find({ rows }) {
      const hit = rows.map((r) => ({ r, t: tieRecord(r.well) })).filter(({ t }) => t && t.meanCorr !== null && t.meanCorr < TIE_GOOD);
      if (!hit.length) return null;
      return {
        severity: hit.some(({ t }) => t.meanCorr < TIE_POOR) ? 'high' : 'medium', scope: hit.map(({ r }) => r.wellName),
        title: `Weak ties: ${list(hit.map(({ r, t }) => `${r.wellName} ${t.meanCorr.toFixed(2)}`))}`,
        impact: 'Wavelets extracted at weak ties are unreliable in phase and amplitude, and inversion calibrated on them inherits the error.',
        workaround: 'Use a statistical or field-average wavelet (QI Studio, Well ties) and give the weak wells low weight.',
        uncertainty: 'Below a correlation of 0.7, wavelet phase is commonly uncertain by 20 to 40 degrees.',
        mitigation: 'Re-tie with the drift-corrected sonic, edit bad-hole density first, and check the bulk shift against the checkshots.',
      };
    },
  },
  {
    id: 'tops-none', area: 'Wells', workflows: ['petro', 'depth', 'inversion'],
    find({ rows, unit }) {
      const hit = rows.filter((r) => absent(r, 'tops') || st(r, 'tops') === 'partial');
      if (!hit.length) return null;
      return {
        severity: 'medium', scope: names(hit),
        title: `Tops or target zones missing at ${list(names(hit))}`,
        impact: 'The interval of interest falls back to the logged interval at these wells, so zone statistics and horizon-to-well checks are not like for like.',
        workaround: 'Pick the zones in Petrophysics Studio or propagate tops from the correlation in Well Correlation.',
        uncertainty: `Tops correlated by eye are commonly within ${len(10, unit).replace(/ (ft|m)$/, '')} to ${len(30, unit)}.`,
        mitigation: 'Agree one stratigraphic scheme for the project and pick every well to it.',
      };
    },
  },
  {
    id: 'core-none', area: 'Wells', workflows: ['petro'],
    find({ rows, manualHas, audience }) {
      const plugs = rows.filter((r) => AVAILABLE.has(st(r, 'plugs')));
      const manualCore = rows.filter((r) => AVAILABLE.has(st(r, 'swc')) || AVAILABLE.has(st(r, 'wholecore')));
      if (plugs.length || manualCore.length || manualHas('core')) return null;
      return {
        severity: audience === 'petro' ? 'medium' : 'low', scope: [],
        title: 'No core data in the project',
        impact: 'Porosity, matrix density, cementation exponent and the porosity-permeability transform cannot be calibrated, so permeability is a correlation (Timur or Coates) with no local check.',
        workaround: 'Use regional or analogue core parameters, state them, and carry low, mid and high cases (Petrophysics Studio, Low/High).',
        uncertainty: 'Uncalibrated log permeability is often wrong by an order of magnitude; porosity by 0.02 to 0.03 v/v.',
        mitigation: 'Load routine core analysis (CPOR, CKH) in Well Data Manager, or record the core report below if it exists only on paper.',
      };
    },
  },
  {
    id: 'pressure-none', area: 'Wells', workflows: ['petro', 'rockphysics'],
    find({ rows, manualHas }) {
      if (rows.some((r) => AVAILABLE.has(st(r, 'pressure'))) || manualHas('pressure')) return null;
      return {
        severity: 'medium', scope: [],
        title: 'No formation pressure data recorded',
        impact: 'Fluid gradients and contacts cannot be confirmed, and the pore pressure used in fluid substitution (Batzle-Wang) and in effective stress is assumed.',
        workaround: 'Assume a hydrostatic gradient (about 0.433 to 0.45 psi/ft for brine) and test the result with plus or minus 10 percent pressure.',
        uncertainty: 'Unknown overpressure changes brine and gas moduli and the dry-rock stiffness; contacts may be wrong by the height of a transition zone.',
        mitigation: 'Record any RFT, MDT or XPT data per well (set the Pressure cell) and add the pressure report below.',
      };
    },
  },
  {
    id: 'pvt-none', area: 'Wells', workflows: ['rockphysics', 'avo'],
    find({ rows, manualHas }) {
      if (rows.some((r) => AVAILABLE.has(st(r, 'samples'))) || manualHas('pvt')) return null;
      return {
        severity: 'medium', scope: [],
        title: 'No fluid samples or PVT recorded',
        impact: 'Oil gravity, gas-oil ratio and gas gravity for Batzle-Wang fluid properties are assumed, which sets the size of the fluid effect being modelled.',
        workaround: 'Use regional fluid properties or Fluid Studio correlations, and run the substitution for a light and a heavy fluid case.',
        uncertainty: 'Live-oil bulk modulus can vary by a factor of two across plausible GOR, enough to change the AVO response class.',
        mitigation: 'Record the PVT report below; load the fluid properties into Fluid Studio.',
      };
    },
  },
  {
    id: 'unrecorded', area: 'Project', workflows: [],
    find({ rows, columns }) {
      const manualCols = columns.filter((c) => c.source === 'manual');
      let n = 0;
      for (const r of rows) for (const c of manualCols) if (st(r, c.key) === 'unrecorded') n += 1;
      if (!n) return null;
      return {
        severity: 'info', scope: [],
        title: `${n} items to confirm (${manualCols.map((c) => c.label).join(', ')})`,
        impact: 'Petrolord cannot see core, pressure, samples or production logs held outside it, so the readiness above assumes they do not exist.',
        workaround: 'Set each cell from the well files (provided outside Petrolord, not acquired, or requested).',
        uncertainty: 'None once confirmed.',
        mitigation: 'Confirm against the final well reports and the data room index.',
      };
    },
  },
  // -------------------------------------------------------------- seismic
  {
    id: 'seismic-none', area: 'Seismic', workflows: ['tie', 'avo', 'inversion', 'simultaneous', 'depth'],
    find({ seismic, audience }) {
      if (seismic.stacks.length || seismic.gathers.length) return null;
      return {
        severity: audience === 'qi' ? 'high' : 'low', scope: [],
        title: 'No seismic volumes in the project',
        impact: 'No tie, no mapping of the well results away from the wells and no quantitative interpretation.',
        workaround: 'Work from the wells alone; map with well control only.',
        uncertainty: 'Maps from well control alone cannot see faults or closures between wells.',
        mitigation: 'Load the post-stack volumes in Seismolord (SEG-Y import).',
      };
    },
  },
  {
    id: 'angle-none', area: 'Seismic', workflows: ['avo', 'simultaneous'],
    find({ seismic }) {
      if (!seismic.stacks.length || seismic.angle.length || seismic.gathers.length) return null;
      return {
        severity: 'high', scope: [],
        title: 'Full stack only: no angle stacks or gathers',
        impact: 'AVO analysis and simultaneous (prestack) inversion are not possible; only post-stack inversion and amplitude mapping can be done.',
        workaround: 'Post-stack inversion for acoustic impedance, with the fluid question answered only where impedance alone separates the cases.',
        uncertainty: 'Where brine and hydrocarbon sands overlap in impedance, the fluid call from a full stack is ambiguous.',
        mitigation: 'Request near, mid and far angle stacks (with their angle ranges) or the NMO-corrected gathers and the velocity field.',
      };
    },
  },
  {
    id: 'angle-from-gathers', area: 'Seismic', workflows: ['avo', 'simultaneous'],
    find({ seismic }) {
      if (!seismic.gathers.length || seismic.angle.length >= 2) return null;
      return {
        severity: 'medium', scope: [],
        title: 'Gathers loaded, angle stacks not yet built',
        impact: 'AVO and simultaneous inversion need angle stacks; the gathers hold the information but are not yet in that form.',
        workaround: 'Build near, mid and far stacks from the gathers in QI Studio (Prestack) with the stacking velocity.',
        uncertainty: 'Angle limits depend on the velocity field; a 10 percent velocity error shifts the angles by a few degrees.',
        mitigation: 'Run prestack QC (residual moveout, NMO stretch) before stacking.',
      };
    },
  },
  {
    id: 'angle-few', area: 'Seismic', workflows: ['simultaneous'],
    find({ seismic }) {
      const n = seismic.angle.length;
      if (!n || n >= 3) return null;
      return {
        severity: 'medium', scope: [],
        title: `Only ${n} angle stack${n === 1 ? '' : 's'}`,
        impact: 'Two-term AVO (intercept and gradient) is possible with two stacks, but simultaneous inversion for density needs at least three and a far angle beyond about 30 degrees.',
        workaround: 'Invert for P- and S-impedance only, with density tied to P-impedance through Gardner.',
        uncertainty: 'Density from fewer than three stacks is unresolved.',
        mitigation: 'Request a far stack, or build more partial stacks from gathers.',
      };
    },
  },
  {
    id: 'gathers-none', area: 'Seismic', workflows: ['avo'],
    find({ seismic }) {
      if (!seismic.angle.length || seismic.gathers.length) return null;
      return {
        severity: 'low', scope: [],
        title: 'Angle stacks without gathers',
        impact: 'Residual moveout and NMO stretch cannot be checked, and the stacks cannot be rebuilt with other angle limits.',
        workaround: 'Accept the processor\'s angle ranges; check stack-to-stack alignment and amplitude balance in QI Studio (Seismic QC).',
        uncertainty: 'Misalignment of a few ms between stacks distorts the gradient.',
        mitigation: 'Request the gathers and the processing report with the angle-range definition.',
      };
    },
  },
  {
    id: 'geometry-mismatch', area: 'Seismic', workflows: ['avo', 'simultaneous'],
    find({ seismic }) {
      if (!seismic.geometryMismatch) return null;
      return {
        severity: 'medium', scope: [],
        title: 'Stacks differ in survey geometry',
        impact: 'The stacks do not share inline and crossline ranges, sample rate or record length, so they cannot be combined sample for sample.',
        workaround: 'Work in the overlap; the Suite crops to the common survey when stacks are combined.',
        uncertainty: 'None inside the overlap.',
        mitigation: 'Request all stacks on one grid from the processor.',
      };
    },
  },
  {
    id: 'low-bits', area: 'Seismic', workflows: ['avo', 'inversion', 'simultaneous'],
    find({ seismic }) {
      if (!seismic.lowBits.length) return null;
      return {
        severity: 'medium', scope: seismic.lowBits.map((v) => v.name),
        title: `Low bit depth: ${list(seismic.lowBits.map((v) => `${v.name} (${v.bits}-bit)`))}`,
        impact: 'Integer samples below 32 bits limit dynamic range, so weak amplitudes are quantised and strong ones may be clipped; AVO gradients suffer most.',
        workaround: 'Use them for structure; check clipping on the amplitude histogram before any quantitative use.',
        uncertainty: 'Quantisation noise sets a floor on usable reflectivity, roughly 1 part in 2 to the power of the bits.',
        mitigation: 'Request 32-bit floating point volumes.',
      };
    },
  },
  {
    id: 'crs-none', area: 'Seismic', workflows: ['tie', 'depth'],
    find({ seismic }) {
      if (!seismic.noCrs.length) return null;
      return {
        severity: 'high', scope: seismic.noCrs.map((v) => v.name),
        title: `No CRS on ${list(seismic.noCrs.map((v) => v.name))}`,
        impact: 'Wells cannot be placed in these volumes with confidence, so ties and well-based calibration may use the wrong traces.',
        workaround: 'Assign the CRS in Seismolord if the processing report states it.',
        uncertainty: 'Unbounded until the CRS is known.',
        mitigation: 'Take the CRS and datum from the processing report.',
      };
    },
  },
  {
    id: 'wells-outside', area: 'Seismic', workflows: ['tie', 'inversion'],
    find({ rows, seismic }) {
      const polys = seismic.delivered.filter((v) => v.outline && v.crs);
      if (!polys.length) return null;
      const hit = rows.filter((r) => {
        const w = r.well;
        const x = Number(w.surface_x);
        const y = Number(w.surface_y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !w.crs) return false;
        const same = polys.filter((v) => v.crs === w.crs);
        return same.length > 0 && !same.some((v) => insidePolygon({ x, y }, v.outline));
      });
      if (!hit.length) return null;
      return {
        severity: 'high', scope: names(hit),
        title: `Outside the seismic survey: ${list(names(hit))}`,
        impact: 'These wells have no traces at their location, so they cannot be tied or used to calibrate the seismic.',
        workaround: 'Use them for rock physics and as blind checks on trends only.',
        uncertainty: 'Positions are from the surface location; a deviated well may still enter the survey at depth.',
        mitigation: 'Check the deviated well path, or request a larger survey extent.',
      };
    },
  },
  {
    id: 'record-short', area: 'Seismic', workflows: ['tie', 'inversion'],
    find({ rows, seismic }) {
      const timeStacks = seismic.stacks.filter((v) => v.domain === 'Time' && Number.isFinite(v.recordMs));
      if (!timeStacks.length) return null;
      const record = Math.min(...timeStacks.map((v) => v.recordMs));
      const hit = rows.map((r) => ({ r, twt: r.interval ? twtAtMd(r.well, r.interval.base) : null })).filter(({ twt }) => Number.isFinite(twt) && twt + 100 > record);
      if (!hit.length) return null;
      return {
        severity: 'medium', scope: hit.map(({ r }) => r.wellName),
        title: `Record length (${Math.round(record)} ms) is close to the target at ${list(hit.map(({ r, twt }) => `${r.wellName} (${Math.round(twt)} ms)`))}`,
        impact: 'Less than 100 ms of data below the target leaves no room for the wavelet tail or for the inversion to settle.',
        workaround: 'Restrict the analysis window to end above the record limit.',
        uncertainty: 'Edge effects in the last half wavelet below the target.',
        mitigation: 'Request a longer record from the processor.',
      };
    },
  },
  // ------------------------------------------------------ interpretation
  {
    id: 'horizons-none', area: 'Interpretation', workflows: ['inversion', 'simultaneous', 'depth'],
    find({ seismic, interp }) {
      if (!seismic.stacks.length || interp.horizons?.count) return null;
      return {
        severity: 'medium', scope: [],
        title: 'No interpreted horizons',
        impact: 'The inversion low-frequency model has no structural frame, and nothing can be mapped or depth-converted.',
        workaround: 'Build the low-frequency model from the wells with a single trend (QI Studio, Inversion), or pick the key horizons in Seismolord first.',
        uncertainty: 'A frame-free low-frequency model can bias absolute impedance by 5 to 10 percent away from the wells.',
        mitigation: 'Interpret at least the top and base of the target and one regional marker above and below.',
      };
    },
  },
  {
    id: 'depthmaps-none', area: 'Interpretation', workflows: ['depth'],
    find({ interp }) {
      if (!interp.horizons?.count || interp.surfaces?.depthMaps) return null;
      return {
        severity: 'low', scope: [],
        title: 'Horizons in time only: no depth maps',
        impact: 'Closure, spill point and gross rock volume need depth maps.',
        workaround: 'Depth-convert in Seismolord with the checkshot-based velocity function.',
        uncertainty: 'Depth-conversion error grows away from the wells; quote it at the crest and the spill point.',
        mitigation: 'Tie the depth maps back to the well tops and report the residuals.',
      };
    },
  },
  {
    id: 'wavelet-none', area: 'Interpretation', workflows: ['inversion', 'simultaneous'],
    find({ seismic, interp }) {
      if (!seismic.stacks.length || interp.ties?.wavelets) return null;
      return {
        severity: 'medium', scope: [],
        title: 'No well-extracted wavelet',
        impact: 'Inversion has to use a statistical wavelet, whose phase is assumed.',
        workaround: 'Use a zero-phase statistical wavelet from the seismic spectrum, and test 0 and 90 degree phase.',
        uncertainty: 'An unknown phase of 30 degrees or more shifts thin-bed impedance and timing.',
        mitigation: 'Tie at least two wells and extract the wavelet in Seismolord.',
      };
    },
  },
  {
    id: 'velocity-none', area: 'Interpretation', workflows: ['avo', 'simultaneous'],
    find({ seismic, interp }) {
      if (!seismic.gathers.length || interp.velocity?.count) return null;
      return {
        severity: 'medium', scope: [],
        title: 'Gathers without a stacking velocity',
        impact: 'Offset cannot be converted to incidence angle, so angle stacks and AVO angles are undefined.',
        workaround: 'Use an interval velocity function from the checkshots, converted to RMS.',
        uncertainty: 'Angles from a well-derived velocity can be off by a few degrees away from the wells.',
        mitigation: 'Request the processor\'s RMS velocity field.',
      };
    },
  },
]);

/** Run every rule; findings sorted by severity, then by area. */
export function runRules(ctx) {
  const rank = { high: 0, medium: 1, low: 2, info: 3 };
  const area = { Wells: 0, Seismic: 1, Interpretation: 2, Project: 3 };
  const out = [];
  for (const rule of RULES) {
    const f = rule.find(ctx);
    if (f) out.push({ id: rule.id, area: rule.area, workflows: rule.workflows, ...f });
  }
  return out.sort((a, b) => (rank[a.severity] - rank[b.severity]) || (area[a.area] - area[b.area]));
}

export { fmtDepth };
