/**
 * AS2 — the create flow.
 *
 * The first test in this file is the one that matters: it pins the
 * insert payload against the actual column list of `risk_register`,
 * read out of the AS1 schema backfill migration rather than restated
 * here. Before AS2, RiskForm collected `tags` and `linked_risks` and
 * NewRiskPage handed the whole form object to an insert, so PostgREST
 * rejected every create with "Could not find the 'tags' column".
 */
import fs from 'fs';
import path from 'path';
import {
  AS2_COLUMNS,
  RISK_REGISTER_WRITABLE_COLUMNS,
  buildRiskWrite,
  nextCodeFromExisting,
  parseRiskCodes,
  parseTags,
  resolveRiskCodes,
} from '../utils/riskPayload';

const ROOT = path.resolve(__dirname, '../../../../..');

/** The columns risk_register really has, from the migrations. */
const liveColumns = () => {
  const backfill = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260916099000_as1_assurance_schema_backfill.sql'),
    'utf8',
  );
  const block = /create table if not exists public\.risk_register \(([\s\S]*?)\n\);/.exec(backfill);
  if (!block) throw new Error('risk_register not found in the AS1 backfill');
  const cols = block[1]
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/)[0]);

  // Plus whatever AS2 adds.
  const as2 = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260916110000_as2_risk_register_residual_appetite.sql'),
    'utf8',
  );
  const added = [...as2.matchAll(/add column if not exists (\w+)/g)].map((m) => m[1]);
  const generated = [...as2.matchAll(/add column (\w+) integer\s+generated/g)].map((m) => m[1]);
  return new Set([...cols, ...added, ...generated]);
};

describe('the insert payload only names columns that exist', () => {
  const columns = liveColumns();

  it('read a plausible column list out of the migrations', () => {
    expect(columns.size).toBeGreaterThan(15);
    expect(columns.has('likelihood')).toBe(true);
    expect(columns.has('risk_score')).toBe(true);
  });

  it('every writable column is a real column', () => {
    const missing = RISK_REGISTER_WRITABLE_COLUMNS.filter((c) => !columns.has(c));
    expect(missing).toEqual([]);
  });

  it('tags and linked_risks are NOT columns, which is why the create failed', () => {
    expect(columns.has('tags')).toBe(false);
    expect(columns.has('linked_risks')).toBe(false);
  });

  it('never sends a generated column', () => {
    expect(RISK_REGISTER_WRITABLE_COLUMNS).not.toContain('risk_score');
    expect(RISK_REGISTER_WRITABLE_COLUMNS).not.toContain('residual_score');
  });

  it('a full form payload produces a row of nothing but real columns', () => {
    const { row, dropped } = buildRiskWrite({
      title: 'Wellbore instability in section 3',
      category: 'Drilling & Completions',
      likelihood: 4,
      impact: 4,
      root_cause: 'shale',
      consequences: 'stuck pipe',
      mitigation_summary: 'raise mud weight',
      tags: 'HSE, Drilling',
      linked_risks: 'RSK-1001',
    });
    Object.keys(row).forEach((k) => expect(columns.has(k)).toBe(true));
    expect(dropped).toEqual([]);
    expect(row.tags).toBeUndefined();
    expect(row.linked_risks).toBeUndefined();
  });

  it('reports a form field that has no home instead of sending it', () => {
    const { row, dropped } = buildRiskWrite({ title: 't', likelihood: 1, impact: 1, invented_field: 'x' });
    expect(row.invented_field).toBeUndefined();
    expect(dropped).toEqual(['invented_field']);
  });
});

describe('derived columns are written, not left null', () => {
  it('writes rating from the scoring authority on every save', () => {
    // `rating` was null on all four live rows because nothing ever wrote
    // it, and the hub then fell back to its own copy of the thresholds.
    expect(buildRiskWrite({ title: 't', likelihood: 4, impact: 4 }).row.rating).toBe('Critical');
    expect(buildRiskWrite({ title: 't', likelihood: 1, impact: 2 }).row.rating).toBe('Low');
  });

  it('writes appetite_status from residual against the target', () => {
    const { row } = buildRiskWrite({
      title: 't', likelihood: 5, impact: 5, residual_likelihood: 2, residual_impact: 2, target_score: 6,
    });
    expect(row.appetite_status).toBe('Within appetite');
  });

  it('a risk with no target reads Not set rather than passing', () => {
    expect(buildRiskWrite({ title: 't', likelihood: 5, impact: 5 }).row.appetite_status)
      .toBe('Not set');
  });
});

describe('the front end ships before the migration is applied', () => {
  it('omits the AS2 columns while they do not exist', () => {
    const { row } = buildRiskWrite(
      { title: 't', likelihood: 4, impact: 4, residual_likelihood: 2, target_score: 6, next_review_date: '2026-12-01' },
      { hasAs2Columns: false },
    );
    AS2_COLUMNS.forEach((c) => expect(row[c]).toBeUndefined());
    // and still writes the ones that have always existed
    expect(row.rating).toBe('Critical');
    expect(row.likelihood).toBe(4);
  });

  it('sends them once the migration is applied', () => {
    const { row } = buildRiskWrite(
      { title: 't', likelihood: 4, impact: 4, residual_likelihood: 2, next_review_date: '2026-12-01' },
      { hasAs2Columns: true },
    );
    expect(row.residual_likelihood).toBe(2);
    expect(row.next_review_date).toBe('2026-12-01');
  });
});

describe('tags and links', () => {
  it('parses, trims and de-duplicates tags', () => {
    expect(parseTags('HSE, Q3 , ,drilling, HSE')).toEqual(['HSE', 'Q3', 'drilling']);
  });

  it('accepts an array as well as the form string', () => {
    expect(parseTags(['a', ' b ', 'a'])).toEqual(['a', 'b']);
  });

  it('parses risk codes case-insensitively', () => {
    expect(parseRiskCodes('rsk-1001, RSK-1002 , rsk-1001')).toEqual(['RSK-1001', 'RSK-1002']);
  });

  it('returns nothing for empty input rather than one empty tag', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseRiskCodes(', ,')).toEqual([]);
  });

  const register = [
    { id: 'id-1', risk_id: 'RSK-1001' },
    { id: 'id-2', risk_id: 'RSK-1002' },
  ];

  it('resolves codes to ids', () => {
    const { resolved, unresolved } = resolveRiskCodes(['RSK-1001', 'RSK-1002'], register);
    expect(resolved.map((r) => r.id)).toEqual(['id-1', 'id-2']);
    expect(unresolved).toEqual([]);
  });

  it('REPORTS a code it cannot resolve instead of dropping it', () => {
    // Telling someone their risk is linked to RSK-9999 when no such risk
    // exists is exactly the quiet lie this module is being rebuilt to
    // remove.
    const { resolved, unresolved } = resolveRiskCodes(['RSK-1001', 'RSK-9999'], register);
    expect(resolved).toHaveLength(1);
    expect(unresolved).toEqual(['RSK-9999']);
  });
});

describe('risk codes', () => {
  it('follows the highest existing code', () => {
    expect(nextCodeFromExisting([
      { risk_id: 'RSK-1001' }, { risk_id: 'RSK-1004' }, { risk_id: 'RSK-1002' },
    ])).toBe('RSK-1005');
  });

  it('starts at 1001 in an empty register', () => {
    expect(nextCodeFromExisting([])).toBe('RSK-1001');
  });

  it('ignores codes that are not in the RSK- form', () => {
    expect(nextCodeFromExisting([{ risk_id: 'LEGACY-7' }, { risk_id: 'RSK-1001' }]))
      .toBe('RSK-1002');
  });

  it('never returns a code that already exists in the register', () => {
    const register = Array.from({ length: 30 }, (_, i) => ({ risk_id: `RSK-${1001 + i}` }));
    const issued = nextCodeFromExisting(register);
    expect(register.map((r) => r.risk_id)).not.toContain(issued);
  });
});
