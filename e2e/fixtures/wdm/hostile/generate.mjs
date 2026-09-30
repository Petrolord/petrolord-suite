// Hostile import set for Well Data Manager (AppUpgrade PL2). Deterministic:
// `node e2e/fixtures/wdm/hostile/generate.mjs` rewrites every file here.
// Each file imitates a real-world shape practitioners bring, not our own
// harness shape. The large file is NOT committed; the scale test builds it
// in memory with bigLas() from this module.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const f = (x, d = 4) => x.toFixed(d);

// smooth synthetic curves (deterministic, no RNG)
const gr = (i) => 60 + 40 * Math.sin(i / 7);
const rhob = (i) => 2.35 + 0.1 * Math.cos(i / 5);
const nphi = (i) => 0.22 + 0.05 * Math.sin(i / 9);
const dt = (i) => 90 + 10 * Math.cos(i / 11);   // us/ft

function las20({ header = '', curves, rows, version = '2.0', wrap = 'NO', nul = '-999.25', extraWell = '', params = '' }) {
  return `~VERSION INFORMATION
 VERS.                 ${version} :   CWLS LOG ASCII STANDARD -VERSION ${version}
 WRAP.                  ${wrap} :   ONE LINE PER DEPTH STEP
~WELL INFORMATION
${header}
 NULL.            ${nul} :   NULL VALUE
${extraWell}~CURVE INFORMATION
${curves}
${params ? `~PARAMETER INFORMATION\n${params}\n` : ''}~A
${rows}
`;
}

const files = {};

// 1. Logged bottom-up: negative STEP, depth in feet, decreasing index.
{
  const n = 40; const top = 5000; const step = 0.5;
  const rows = [];
  for (let i = n - 1; i >= 0; i--) rows.push(`${f(top + i * step, 2)} ${f(gr(i))} ${f(rhob(i))}`);
  files['las20_upward_feet.las'] = las20({
    header: ` STRT.FT        ${f(top + (n - 1) * step, 2)} :\n STOP.FT        ${f(top, 2)} :\n STEP.FT        -0.5000 :\n WELL.   HOSTILE UP-1 :   WELL`,
    curves: ' DEPT.FT      :   Measured depth\n GR  .GAPI    :   Gamma ray\n RHOB.G/C3    :   Bulk density',
    rows: rows.join('\n'),
  });
}

// 1b. Schlumberger-style: TDEP index in feet, logged bottom-up, 0.5 ft step.
{
  const n = 60; const top = 7000; const step = 0.5;
  const rows = [];
  for (let i = n - 1; i >= 0; i--) rows.push(`${f(top + i * step, 1)} ${f(gr(i))} ${f(rhob(i))} ${f(nphi(i))}`);
  files['las20_slb_tdep_upward.las'] = las20({
    header: ` STRT.F        ${f(top + (n - 1) * step, 1)} :   START DEPTH\n STOP.F        ${f(top, 1)} :   STOP DEPTH\n STEP.F        -0.5 :   STEP\n WELL.   SLB TD-3 :   WELL\n COMP.   Demo :   COMPANY`,
    curves: ' TDEP.F       :   Tool depth\n GR  .GAPI    :   Gamma ray\n RHOZ.G/C3    :   Bulk density\n TNPH.CFCF    :   Thermal neutron porosity',
    params: ' EKB .F        82.0 :   Elevation of kelly bushing',
    rows: rows.join('\n'),
  });
}

// 2. TVDSS-indexed export (Petrel "export logs in TVDSS").
{
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push(`${f(1500 + i * 0.5, 2)} ${f(gr(i))}`);
  files['las20_tvdss_index.las'] = las20({
    header: ' STRT.M        1500.00 :\n STOP.M        1514.50 :\n STEP.M        0.5000 :\n WELL.   HOSTILE TVDSS-1 :   WELL',
    curves: ' TVDSS.M      :   True vertical depth subsea\n GR   .GAPI   :   Gamma ray',
    rows: rows.join('\n'),
  });
}

// 3. Time-indexed LWD file: index in seconds, must be refused with a reason.
{
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(`${f(1000 + i * 10, 1)} ${f(gr(i))}`);
  files['las20_time_index.las'] = las20({
    header: ' STRT.S        1000.0 :\n STOP.S        1190.0 :\n STEP.S        10.0 :\n WELL.   HOSTILE TIME-1 :   WELL',
    curves: ' TIME.S       :   Elapsed time\n GR  .GAPI    :   Gamma ray',
    rows: rows.join('\n'),
  });
}

// 4. Petrel-style LAS 2.0 export: coordinates and elevations in ~Well,
// lower-case units, mixed unit spellings, -999 null, us/ft sonic.
{
  const rows = [];
  for (let i = 0; i < 50; i++) rows.push(`${f(2000 + i * 0.1524, 4)} ${f(gr(i))} ${f(rhob(i))} ${f(nphi(i))} ${f(dt(i))}`);
  files['las20_petrel_export.las'] = las20({
    nul: '-999',
    header: ` STRT.m        2000.0000 :\n STOP.m        ${f(2000 + 49 * 0.1524, 4)} :\n STEP.m        0.1524 :\n WELL.   OKAN PX-4 :   Well name\n FLD .   OKAN :   Field\n COMP.   Demo Operator :   Company\n UWI .   00-1234-5678 :   Unique well id\n XWELL.m   512345.60 :   Well X (UTM 31N)\n YWELL.m   498765.40 :   Well Y (UTM 31N)\n DATE.   12-03-2019 :   Export date`,
    extraWell: ' EKB .m        25.30 :   Kelly bushing elevation\n EGL .m         4.10 :   Ground level elevation\n',
    curves: ' DEPT.m       :   Depth\n GR  .gAPI    :   Gamma Ray\n RHOB.g/cm3   :   Bulk density\n NPHI.m3/m3   :   Neutron porosity\n DT  .us/ft   :   Compressional slowness',
    rows: rows.join('\n'),
  });
}

// 5. Techlog-style export: DEPTH mnemonic, -9999 null, v/v and b/e units,
// long mnemonics with tool suffixes, tab-separated data in LAS 2.0.
{
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push([f(1200 + i * 0.1, 3), f(gr(i)), f(nphi(i)), i % 9 === 0 ? '-9999' : f(3 + 0.2 * Math.sin(i))].join('\t'));
  files['las20_techlog_tabs.las'] = las20({
    nul: '-9999',
    header: ' STRT.M        1200.000 :\n STOP.M        1203.900 :\n STEP.M        0.100 :\n WELL.   TL-7 :   WELL',
    curves: ' DEPTH.M        :   Depth\n GR_EDTC.GAPI   :   Gamma ray EDTC\n TNPH_LS.V/V    :   Thermal neutron porosity (limestone)\n PEFZ.B/E       :   Photoelectric factor',
    rows: rows.join('\n'),
  });
}

// 6. Windows file: UTF-8 BOM + CRLF line endings.
{
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(`${f(800 + i * 0.5, 2)} ${f(gr(i))}`);
  files['las20_bom_crlf.las'] = '﻿' + las20({
    header: ' STRT.M        800.00 :\n STOP.M        809.50 :\n STEP.M        0.5000 :\n WELL.   WIN-1 :   WELL',
    curves: ' DEPT.M       :   Depth\n GR  .GAPI    :   Gamma ray',
    rows: rows.join('\n'),
  }).replace(/\n/g, '\r\n');
}

// 7. LAS 1.2 wrapped (old wireline archive).
{
  const rows = [];
  for (let i = 0; i < 12; i++) {
    rows.push(`${f(3000 + i * 0.5, 2)}`);
    rows.push(`${f(gr(i))} ${f(rhob(i))} ${f(nphi(i))}`);
    rows.push(`${f(dt(i))} ${f(3 + i / 10)}`);
  }
  files['las12_wrapped.las'] = las20({
    version: '1.20', wrap: 'YES',
    header: ' STRT.M        3000.00 :\n STOP.M        3005.50 :\n STEP.M        0.5000 :\n WELL.   WELL :   ARCHIVE A-1',
    curves: ' DEPT.M       :   Depth\n GR  .GAPI    :   Gamma ray\n RHOB.G/C3    :   Bulk density\n NPHI.V/V     :   Neutron\n DT  .US/F    :   Sonic\n ILD .OHMM    :   Deep resistivity',
    rows: rows.join('\n'),
  });
}

// 8. Comma decimal marks in the data (European locale export).
{
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(`${f(1000 + i * 0.5, 2).replace('.', ',')} ${f(gr(i)).replace('.', ',')}`);
  files['las20_comma_decimal.las'] = las20({
    header: ' STRT.M        1000,00 :\n STOP.M        1004,50 :\n STEP.M        0,5000 :\n WELL.   EU-1 :   WELL',
    curves: ' DEPT.M       :   Depth\n GR  .GAPI    :   Gamma ray',
    rows: rows.join('\n'),
  });
}

// 9. Short rows: a data line missing its last value (truncated export).
{
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(i === 6 ? `${f(1000 + i * 0.5, 2)} ${f(gr(i))}` : `${f(1000 + i * 0.5, 2)} ${f(gr(i))} ${f(rhob(i))}`);
  files['las20_short_row.las'] = las20({
    header: ' STRT.M        1000.00 :\n STOP.M        1004.50 :\n STEP.M        0.5000 :\n WELL.   SHORT-1 :   WELL',
    curves: ' DEPT.M       :   Depth\n GR  .GAPI    :   Gamma ray\n RHOB.G/C3    :   Bulk density',
    rows: rows.join('\n'),
  });
}

// 10. LAS 3.0 with tops, a string channel and a date-time channel.
{
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(`${f(1500 + i * 0.5, 2)},${f(gr(i))},"SH ${i % 3}",2019-03-12T10:${String(10 + i).padStart(2, '0')}:00`);
  files['las30_tops_strings.las'] = `~Version
VERS.   3.0 : CWLS LOG ASCII STANDARD - VERSION 3.0
WRAP.   NO  : One line per depth step
DLM .   COMMA : Delimiter
~Well
STRT.M  1500.00 : First index value
STOP.M  1504.50 : Last index value
STEP.M  0.5 : Step
NULL.   -999.25 : Null value
WELL.   L3-TOPS : Well name
~Log_Definition
DEPT.M  : Depth {F}
GR  .GAPI : Gamma ray {F}
LITH.   : Lithology code {S}
TIME.   : Acquisition time {DT}
~Log_Data | Log_Definition
${rows.join('\n')}
~Tops_Parameter
TOPS.   Picks : Tops set
~Tops_Definition
TOPN.   : Top name {S}
TOPT.M  : Top depth {F}
~Tops_Data | Tops_Definition
"Upper Sand",1501.00
"Lower Shale",1503.25
`;
}

// Tops as a Petrel well tops export (Surface first, MD in feet, TWT, extra columns).
files['tops_petrel_export_ft.txt'] = `Well\tSurface\tMD (ft)\tTWT (ms)\tZ (ft)\tInterpreter
OKAN PX-4\tTop Agbada\t6565.6\t1402.1\t-6480.0\tama
OKAN PX-4\tBase Seal\t6716.4\t1431.8\t-6630.8\tama
`;

// Deviation survey with a units-in-header, extra TVD column, comma separated.
files['deviation_units_header.csv'] = `MD[ft],INCL[deg],AZIM[deg],TVD[ft]
0,0,0,0
1000,0.5,45,999.99
2000,6.6,45,1998.2
3000,12.1,47,2984.3
`;

// Checkshots from a Petrel export: TVDSS negative (elevation convention), TWT.
files['checkshots_petrel_negative_z.txt'] = `Z (m)\tTWT (ms)
-276.8\t480
-581.6\t880
-1191.2\t1600
`;

export function bigLas({ rows = 60000, curves = 20 } = {}) {
  const names = ['GR', 'RHOB', 'NPHI', 'DT', 'ILD', 'ILM', 'SFL', 'CALI', 'SP', 'PEF', 'DRHO', 'BS', 'TENS', 'MSFL', 'RXO', 'DTS', 'SGR', 'CGR', 'POTA', 'THOR'];
  const cn = names.slice(0, curves - 1);
  const head = las20({
    header: ` STRT.M        500.00 :\n STOP.M        ${f(500 + (rows - 1) * 0.1524, 4)} :\n STEP.M        0.1524 :\n WELL.   BIG-1 :   WELL`,
    curves: [' DEPT.M       :   Depth', ...cn.map((c) => ` ${c}.UNIT :   ${c}`)].join('\n'),
    rows: '',
  });
  const out = [head.trimEnd()];
  for (let i = 0; i < rows; i++) {
    const vals = [f(500 + i * 0.1524, 4)];
    for (let k = 0; k < cn.length; k++) vals.push(f(50 + 30 * Math.sin((i + k * 13) / 17), 3));
    out.push(vals.join(' '));
  }
  return `${out.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [name, body] of Object.entries(files)) writeFileSync(join(here, name), body);
  console.log(`wrote ${Object.keys(files).length} hostile fixtures`);
}
