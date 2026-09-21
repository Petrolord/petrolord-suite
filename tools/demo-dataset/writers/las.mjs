// LAS 2.0 writer for the demonstration kit.
// Round-tripped by the D1 gate through the central lasParse engine.

const NULL_VALUE = -999.25;

const pad = (s, n) => String(s).padEnd(n);

function line(mnem, unit, data, descr) {
  // Always leave at least one space before the colon: a long value that runs
  // straight into it parses here but trips other packages.
  return `${pad(mnem, 5)}.${pad(unit, 6)}${pad(`${data} `, 22)}: ${descr}`;
}

export const CURVE_META = {
  DEPT: { unit: 'M',     descr: 'Depth', dp: 4 },
  CALI: { unit: 'IN',    descr: 'Caliper', dp: 3 },
  GR:   { unit: 'GAPI',  descr: 'Gamma Ray', dp: 3 },
  SP:   { unit: 'MV',    descr: 'Spontaneous Potential', dp: 3 },
  RHOB: { unit: 'G/C3',  descr: 'Bulk Density', dp: 4 },
  NPHI: { unit: 'V/V',   descr: 'Thermal Neutron Porosity (sandstone matrix)', dp: 4 },
  DT:   { unit: 'US/F',  descr: 'Compressional Transit Time', dp: 3 },
  RT:   { unit: 'OHMM',  descr: 'Deep Resistivity', dp: 4 },
  RXO:  { unit: 'OHMM',  descr: 'Flushed Zone Resistivity', dp: 4 },
  PEF:  { unit: 'B/E',   descr: 'Photoelectric Factor', dp: 3 },
  LITH: { unit: '',      descr: 'Lithology code (1 sand 2 interbedded 3 shale 4 clay-sand)', dp: 0 },
};

/**
 * @param {object} o
 * @param {string} o.well          well name
 * @param {Array<string>} o.curves mnemonics, in track order (DEPT is added)
 * @param {Array<object>} o.rows   sample rows carrying `md` and each mnemonic
 * @param {object} o.header        COMP/FLD/LOC/SRVC/DATE/UWI/params
 */
export function writeLas({ well, curves, rows, header }) {
  const step = rows.length > 1 ? rows[1].md - rows[0].md : 0;
  const out = [];
  out.push('~Version Information');
  out.push(line('VERS', '', '2.0', 'CWLS LOG ASCII STANDARD - VERSION 2.0'));
  out.push(line('WRAP', '', 'NO', 'ONE LINE PER DEPTH STEP'));
  out.push('~Well Information');
  out.push('#MNEM.UNIT              DATA               : DESCRIPTION');
  out.push(line('STRT', 'M', rows[0].md.toFixed(4), 'START DEPTH'));
  out.push(line('STOP', 'M', rows[rows.length - 1].md.toFixed(4), 'STOP DEPTH'));
  out.push(line('STEP', 'M', step.toFixed(4), 'STEP'));
  out.push(line('NULL', '', NULL_VALUE.toFixed(2), 'NULL VALUE'));
  out.push(line('COMP', '', header.company, 'COMPANY'));
  out.push(line('WELL', '', well, 'WELL'));
  out.push(line('FLD', '', header.field, 'FIELD'));
  out.push(line('LOC', '', header.location, 'LOCATION'));
  out.push(line('CTRY', '', header.country, 'COUNTRY'));
  out.push(line('SRVC', '', header.service, 'SERVICE COMPANY'));
  out.push(line('DATE', '', header.date, 'LOG DATE'));
  out.push(line('UWI', '', header.uwi, 'UNIQUE WELL ID'));
  out.push('~Parameter Information');
  for (const [mnem, p] of Object.entries(header.params ?? {})) {
    out.push(line(mnem, p.unit ?? '', String(p.value), p.descr ?? ''));
  }
  out.push('~Curve Information');
  const all = ['DEPT', ...curves];
  for (const c of all) {
    const m = CURVE_META[c];
    out.push(line(c, m.unit, '', m.descr));
  }
  out.push('~Ascii');
  for (const r of rows) {
    const vals = all.map((c) => {
      const v = c === 'DEPT' ? r.md : r[c];
      if (v === null || v === undefined || !Number.isFinite(v)) return NULL_VALUE.toFixed(4);
      return v.toFixed(CURVE_META[c].dp);
    });
    out.push(vals.map((v) => v.padStart(12)).join(' '));
  }
  return `${out.join('\n')}\n`;
}

export { NULL_VALUE };
