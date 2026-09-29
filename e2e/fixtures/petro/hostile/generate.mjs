// Hostile file set for Petrophysics Studio (AppUpgrade PETRO-U1, PL2).
// Deterministic: `node e2e/fixtures/petro/hostile/generate.mjs` rewrites
// every file here.
//
// One physical well, written the ways vendors write it. The truth is a
// four-layer sequence on 0.5 m sampling from 1500 m MD:
//   samples   0-49  shale        GR 120, RHOB 2.55, NPHI 0.35, RT 2
//   samples  50-99  oil sand     GR 20, phi 0.25, Sw 0.25 (Archie, Rw 0.05)
//   samples 100-149 shale
//   samples 150-199 water sand   GR 20, phi 0.22, Sw 1.0
// RHOB = 2.65 - 1.65 phi, NPHI = phi in the sands, DT Wyllie from phi.
// Every variant must give Petrophysics Studio the same porosity, Sw and
// net pay as reference_si.las. Files that are not logs (zones, core) are
// here because practitioners bring them; see the upgrade doc for what the
// Suite does with each.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FT = 0.3048;
export const N = 200;
export const TOP_M = 1500;
export const STEP_M = 0.5;
export const RW = 0.05;

/** Truth per sample, SI. */
export function truth(i) {
  const layer = i < 50 ? 'shale' : i < 100 ? 'oil' : i < 150 ? 'shale' : 'water';
  if (layer === 'shale') return { layer, md: TOP_M + i * STEP_M, gr: 120, rhob: 2.55, nphi: 0.35, rt: 2, dtUsM: 330 };
  const phi = layer === 'oil' ? 0.25 : 0.22;
  const sw = layer === 'oil' ? 0.25 : 1.0;
  const rt = RW / (phi ** 2 * sw ** 2);
  const dtUsM = 182 + phi * (656 - 182);
  return { layer, md: TOP_M + i * STEP_M, gr: 20, rhob: 2.65 - 1.65 * phi, nphi: phi, rt, dtUsM, phi, sw };
}
export const OIL_SAND = { top_md_m: TOP_M + 50 * STEP_M, base_md_m: TOP_M + 99 * STEP_M };

const f = (x, d = 4) => (typeof x === 'string' ? x : x.toFixed(d));

function las20({ well, depthCurve, curves, rows, nul = '-999.25', version = '2.0', start, stop, step, depthUnit }) {
  return `~VERSION INFORMATION
 VERS.                 ${version} :   CWLS LOG ASCII STANDARD -VERSION ${version}
 WRAP.                  NO :   ONE LINE PER DEPTH STEP
~WELL INFORMATION
 STRT.${depthUnit}        ${start} :   START DEPTH
 STOP.${depthUnit}        ${stop} :   STOP DEPTH
 STEP.${depthUnit}        ${step} :   STEP
 NULL.            ${nul} :   NULL VALUE
 WELL.   ${well} :   WELL
 COMP.   Demo Operator :   COMPANY
~CURVE INFORMATION
 ${depthCurve}
${curves.map((c) => ` ${c}`).join('\n')}
~A
${rows.join('\n')}
`;
}

const files = {};
const idx = [...Array(N).keys()];

// A. The reference: SI, the Suite's own units.
files['reference_si.las'] = las20({
  well: 'PETRO REF-1', depthUnit: 'M', start: f(TOP_M, 2), stop: f(TOP_M + (N - 1) * STEP_M, 2), step: '0.50',
  depthCurve: 'DEPT.M      :   Measured depth',
  curves: ['GR  .GAPI    :   Gamma ray', 'RT  .OHMM    :   Deep resistivity', 'RHOB.G/C3    :   Bulk density', 'NPHI.V/V     :   Neutron porosity', 'DT  .US/M    :   Compressional slowness'],
  rows: idx.map((i) => { const t = truth(i); return [f(t.md, 2), f(t.gr), f(t.rt, 6), f(t.rhob), f(t.nphi), f(t.dtUsM, 3)].join(' '); }),
});

// B. Interactive Petrophysics export: feet, NPHI in PU (percent), sonic in
// us/ft, IP's own interpretation curves riding along (PHIE, SW, VSH), a
// caliper, and one RHOB sample written -999.00 in a -999.25 file (an
// undeclared vendor null inside the oil sand) plus one declared null GR.
files['ip_export_ft_percent.las'] = las20({
  well: 'PETRO IP-2', depthUnit: 'F', start: f(TOP_M / FT, 4), stop: f((TOP_M + (N - 1) * STEP_M) / FT, 4), step: f(STEP_M / FT, 4),
  depthCurve: 'DEPTH.F     :   Depth',
  curves: ['GR  .GAPI    :   Gamma Ray', 'ILD .OHMM    :   Deep Induction', 'RHOB.G/CC    :   Bulk Density', 'NPHI.PU      :   Neutron Porosity (limestone)', 'DT  .US/F    :   Sonic', 'CALI.IN      :   Caliper', 'PHIE.DEC     :   IP effective porosity', 'SW  .DEC     :   IP water saturation', 'VSH .DEC     :   IP clay volume'],
  rows: idx.map((i) => {
    const t = truth(i);
    const rhob = i === 70 ? '-999.00' : f(t.rhob);
    const gr = i === 10 ? '-999.25' : f(t.gr);
    return [f(t.md / FT, 4), gr, f(t.rt, 6), rhob, f(t.nphi * 100, 3), f(t.dtUsM * FT, 4), '8.5000', f(t.phi ?? 0.02), f(t.sw ?? 1), f(t.layer === 'shale' ? 0.9 : 0.05)].join(' ');
  }),
});

// C. Techlog export: TDEP index, SI density in kg/m3 (RHOZ K/M3),
// TNPH in m3/m3, AT90 array induction, -9999 nulls.
files['techlog_tdep_kgm3.las'] = las20({
  well: 'PETRO TL-3', depthUnit: 'M', start: f(TOP_M, 2), stop: f(TOP_M + (N - 1) * STEP_M, 2), step: '0.50', nul: '-9999',
  depthCurve: 'TDEP.M      :   Tool depth',
  curves: ['GR_EDTC.GAPI :   Gamma ray (EDTC)', 'AT90.OHMM    :   Array induction 90 in', 'RHOZ.K/M3    :   Standard resolution density', 'TNPH.M3/M3   :   Thermal neutron porosity', 'DTCO.US/M    :   Delta-T compressional', 'HCAL.IN      :   Caliper'],
  rows: idx.map((i) => { const t = truth(i); return [f(t.md, 2), f(t.gr), f(t.rt, 6), f(t.rhob * 1000, 2), f(t.nphi), f(t.dtUsM, 3), i === 20 ? '-9999' : '8.6000'].join(' '); }),
});

// D. Petrel export with the units lost or wrong: density with no unit,
// NPHI labelled V/V but written in percent, -999 nulls.
files['petrel_mislabelled_units.las'] = las20({
  well: 'PETRO PE-4', depthUnit: 'M', start: f(TOP_M, 2), stop: f(TOP_M + (N - 1) * STEP_M, 2), step: '0.50', nul: '-999',
  depthCurve: 'DEPT.M      :   MD',
  curves: ['GR  .gAPI    :   Gamma Ray', 'RDEP.ohmm    :   Deep resistivity', 'RHOB.        :   Bulk density', 'NPHI.v/v     :   Neutron porosity'],
  rows: idx.map((i) => { const t = truth(i); return [f(t.md, 2), f(t.gr), f(t.rt, 6), f(t.rhob), f(t.nphi * 100, 3)].join(' '); }),
});

// E. LAS 3.0, comma delimited, NPHI {F} in PU.
{
  const rows = idx.map((i) => { const t = truth(i); return [f(t.md, 2), f(t.gr), f(t.rt, 6), f(t.rhob), f(t.nphi * 100, 3)].join(','); });
  files['las30_comma_pu.las'] = `~Version
VERS.  3.0 : CWLS LOG ASCII STANDARD -VERSION 3.0
WRAP.  NO  : ONE LINE PER DEPTH STEP
DLM .  COMMA : DELIMITING CHARACTER
~Well
STRT.M  ${f(TOP_M, 2)} : START DEPTH
STOP.M  ${f(TOP_M + (N - 1) * STEP_M, 2)} : STOP DEPTH
STEP.M  0.50 : STEP
NULL.   -999.25 : NULL VALUE
WELL.   PETRO L3-5 : WELL
~Log_Definition
DEPT.M     : Depth {F}
GR  .GAPI  : Gamma ray {F}
RT  .OHMM  : Deep resistivity {F}
RHOB.G/C3  : Bulk density {F}
NPHI.PU    : Neutron porosity {F}
~Log_Data | Log_Definition
${rows.join('\n')}
`;
}

// F. Logged bottom-up in feet (negative STEP), NPHI in percent.
files['bottom_up_ft_percent.las'] = las20({
  well: 'PETRO UP-6', depthUnit: 'F', start: f((TOP_M + (N - 1) * STEP_M) / FT, 4), stop: f(TOP_M / FT, 4), step: f(-STEP_M / FT, 4),
  depthCurve: 'DEPT.F      :   Depth',
  curves: ['GR  .GAPI    :   Gamma ray', 'LLD .OHMM    :   Laterolog deep', 'RHOB.G/C3    :   Bulk density', 'NPHI.%       :   Neutron porosity'],
  rows: [...idx].reverse().map((i) => { const t = truth(i); return [f(t.md / FT, 4), f(t.gr), f(t.rt, 6), f(t.rhob), f(t.nphi * 100, 3)].join(' '); }),
});

// G. Geolog / Paradigm style names the alias table may not know.
files['geolog_names.las'] = las20({
  well: 'PETRO GL-7', depthUnit: 'M', start: f(TOP_M, 2), stop: f(TOP_M + (N - 1) * STEP_M, 2), step: '0.50',
  depthCurve: 'DEPTH.M     :   Depth',
  curves: ['GR  .GAPI    :   Gamma ray', 'RES_DEEP.OHMM :   Deep resistivity', 'DEN .G/C3    :   Bulk density', 'NEU .V/V     :   Neutron porosity', 'SONIC.US/M   :   Sonic slowness'],
  rows: idx.map((i) => { const t = truth(i); return [f(t.md, 2), f(t.gr), f(t.rt, 6), f(t.rhob), f(t.nphi), f(t.dtUsM, 3)].join(' '); }),
});

// H. Routine core analysis as a LAS: plug depths only (irregular),
// core porosity in percent, horizontal permeability in mD, grain density.
{
  const plugs = [1525.23, 1525.61, 1526.4, 1527.18, 1528.55, 1530.02, 1531.4, 1533.9, 1536.35, 1540.1, 1545.05, 1548.8];
  const rows = plugs.map((d, k) => [f(d, 2), f(25 + (k % 3) - 1, 2), f(300 + 40 * (k % 4), 1), f(2.65 + 0.01 * (k % 2), 3)].join(' '));
  files['core_routine_plugs.las'] = las20({
    well: 'PETRO REF-1', depthUnit: 'M', start: f(plugs[0], 2), stop: f(plugs[plugs.length - 1], 2), step: '0.0',
    depthCurve: 'DEPT.M      :   Core depth (driller)',
    curves: ['CPOR.%       :   Core porosity (helium)', 'CKH .MD      :   Core permeability, horizontal', 'CGD .G/C3    :   Grain density'],
    rows,
  });
}

// I. A Techlog zonation export: base before top, feet, a unit column, a
// comment line and a trailing blank row.
files['zones_techlog_export_ft.csv'] = [
  '# Zonation exported from Techlog, well PETRO REF-1',
  'Zone,Bottom (ft),Top (ft),Unit',
  `Oil sand,${f(OIL_SAND.base_md_m / FT, 2)},${f(OIL_SAND.top_md_m / FT, 2)},ft MD`,
  `Water sand,${f((TOP_M + 199 * STEP_M) / FT, 2)},${f((TOP_M + 150 * STEP_M) / FT, 2)},ft MD`,
  '',
].join('\n');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, text] of Object.entries(files)) writeFileSync(join(here, name), text);
  console.log(`wrote ${Object.keys(files).length} files to ${here}`);
}

export const HOSTILE_FILES = Object.keys(files);
