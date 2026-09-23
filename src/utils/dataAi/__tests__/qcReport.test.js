/**
 * The QC report (D1): the CSV carries every flag with the engine's rule and
 * reason, the scorecard and every parameter the run used.
 */
import { buildReportCsv, flattenProfile, CSV_COLUMNS } from '@/utils/dataAi/qcReport';
import { defaultProfile, runQcProfile } from '@/utils/dataAi/qcProfile';

// RFC 4180 reader for the check. The shared tabularFile reader splits on
// every delimiter and does not unquote, so it is not the witness here.
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
