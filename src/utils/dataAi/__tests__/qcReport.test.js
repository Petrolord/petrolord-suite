/**
 * The QC report (D1): the CSV carries every flag with the engine's rule and
 * reason, the scorecard and every parameter the run used.
 */
import { buildReportCsv, flattenProfile, CSV_COLUMNS } from '@/utils/dataAi/qcReport';
import { defaultProfile, runQcProfile, indexLabel, flagAtLabel } from '@/utils/dataAi/qcProfile';

// RFC 4180 reader for the check, written here so the witness is
// independent of the shared tabularFile reader.
function readCsv(text) {
  const rows = [];
  let row = [];
  let cellText = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cellText += '"'; i += 1; } else if (ch === '"') quoted = false; else cellText += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cellText); cellText = ''; } else if (ch === '\n') { row.push(cellText); rows.push(row); row = []; cellText = ''; } else cellText += ch;
  }
  if (cellText !== '' || row.length) { row.push(cellText); rows.push(row); }
  return { header: rows[0], rows: rows.slice(1) };
}

const ds = {
  source: 'upload', label: 'rhob, "quoted", test', ref: {},
  index: { name: 'depth', unit: 'm', kind: 'number', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], labels: null },
  channels: [{ key: 'rhob', name: 'RHOB', unit: 'g/cm3', values: [2.3, 2.31, 2.29, 2.3, 2.32, 3.9, 2.3, 2.28, null, 2.31, 2.3], notes: [] }],
  identifiers: { name: 'well', values: ['Ekene-1', 'EKENE 1'], note: '' },
  notes: [],
};

describe('the CSV report', () => {
  const profile = defaultProfile();
  profile.limits.rhob = { mode: 'definitional', channel: 'bulkDensity', unit: 'g/cm3' };
  const run = runQcProfile(ds, profile);
  const csv = buildReportCsv({ runName: 'RHOB check', dataset: ds, profile, run });
  const table = readCsv(csv);

  it('has one header and a record column that separates the parts', () => {
    expect(table.header).toEqual(CSV_COLUMNS);
    const kinds = new Set(table.rows.map((r) => r[0]));
    expect([...kinds]).toEqual(expect.arrayContaining(['meta', 'parameter', 'score', 'flag']));
  });

  it('writes every flag with its rule and reason exactly as the engine gave them', () => {
    const flags = table.rows.filter((r) => r[0] === 'flag');
    expect(flags).toHaveLength(run.flags.length);
    expect(run.flags.length).toBeGreaterThan(0);
    run.flags.forEach((f, i) => {
      expect(flags[i][6]).toBe(f.rule);
      expect(flags[i][7]).toBe(f.reason);
    });
  });

  it('writes each flag entry counted from 0, as the engine reasons count', () => {
    const flags = table.rows.filter((r) => r[0] === 'flag');
    const col = CSV_COLUMNS.indexOf('entry');
    expect(col).toBe(5);
    expect(CSV_COLUMNS).not.toContain('sample');
    run.flags.forEach((f, i) => {
      expect(flags[i][col]).toBe(Number.isInteger(f.index) ? String(f.index) : '');
    });
    // the density spike is the sixth value, entry 5
    expect(flags.some((r) => r[col] === '5' && r[3] === 'RHOB')).toBe(true);
  });

  it('writes each flag value at the engine precision, unrounded', () => {
    const flags = table.rows.filter((r) => r[0] === 'flag');
    run.flags.forEach((f, i) => {
      expect(flags[i][8]).toBe(f.value === null || f.value === undefined ? '' : String(f.value));
    });
    expect(flags.some((r) => r[8] !== '')).toBe(true);
  });

  it('writes the scorecard and every parameter the run used', () => {
    const total = table.rows.find((r) => r[0] === 'score' && r[1] === 'total');
    expect(Number(total[8])).toBe(run.scorecard.total);
    const params = table.rows.filter((r) => r[0] === 'parameter');
    expect(params).toHaveLength(flattenProfile(profile).length);
    expect(params.find((r) => r[6] === 'outliers.hampel.halfWindow')[8]).toBe('5');
  });

  it('quotes a label with commas and quotes so the file still parses', () => {
    const label = table.rows.find((r) => r[0] === 'meta' && r[6] === 'dataset');
    expect(label[8]).toBe('rhob, "quoted", test');
  });
});

describe('entry numbering on a dataset with no index', () => {
  // No index column: the flag's place is labelled as the engine counts it
  // (entry 3), never as a 1-based row, so the table, the export and the
  // reason text quote one number.
  const noIndex = {
    source: 'upload', label: 'cum', ref: {}, index: null,
    channels: [{ key: 'cum', name: 'CUM', unit: 'stb', values: [100, 110, 120, 115, 130, 140], notes: [] }],
    identifiers: null, notes: [],
  };
  const profile = defaultProfile();
  profile.consistency.cumulative = { ...profile.consistency.cumulative, key: 'cum' };
  const run = runQcProfile(noIndex, profile);

  it('labels the flag and the entry it was compared with from 0', () => {
    const f = run.flags.find((x) => x.rule === 'cumulative-decrease');
    expect(f).toBeDefined();
    expect(f.index).toBe(3);
    expect(f.at).toBe('entry 3');
    expect(f.previousAt).toBe('entry 2');
    expect(f.reason).toMatch(/at entry 2 to/);
    const csv = readCsv(buildReportCsv({ runName: 'n', dataset: noIndex, profile, run }));
    const row = csv.rows.find((r) => r[0] === 'flag' && r[6] === 'cumulative-decrease');
    expect(row[4]).toBe('entry 3');
    expect(row[5]).toBe('3');
  });

  it('keeps the chart axis labels unchanged', () => {
    expect(indexLabel(noIndex, 3)).toBe('row 4');
    expect(flagAtLabel(noIndex, 3)).toBe('entry 3');
    expect(flagAtLabel(ds, 3)).toBe('4');
  });
});
