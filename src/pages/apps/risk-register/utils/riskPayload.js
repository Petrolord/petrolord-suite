/**
 * AS2 — what may actually be written to `risk_register`, and what has to
 * go somewhere else.
 *
 * The register's create flow was broken outright. RiskForm collects
 * `tags` and `linked_risks`; NewRiskPage passed the whole form object
 * into an insert; and neither is a column on `risk_register`. PostgREST
 * rejects an insert naming a column that does not exist, so every
 * attempt to log a risk from the UI failed with "Could not find the
 * 'tags' column of 'risk_register' in the schema cache". The four rows
 * in the live register were seeded, not created through the form.
 *
 * Tags and links have real homes: `risk_tags` and `risk_links`. This
 * module splits a form payload into the three writes that actually
 * exist, and refuses to invent a column.
 */
import { deriveRiskFields } from '@/lib/riskScoring';

/**
 * Every column a client may write on risk_register. `risk_score` and
 * `residual_score` are generated and are NOT here: sending them is an
 * error, not a no-op. `org_id`, `risk_id` and `created_by` are set by
 * the hook, not by the form.
 */
export const RISK_REGISTER_WRITABLE_COLUMNS = Object.freeze([
  'title',
  'description',
  'category',
  'status',
  'likelihood',
  'impact',
  'residual_likelihood',
  'residual_impact',
  'target_score',
  'next_review_date',
  'owner_id',
  'root_cause',
  'consequences',
  'mitigation_summary',
  'rating',
  'appetite_status',
]);

/** Columns added by migration 20260916110000, omitted while it is unapplied. */
export const AS2_COLUMNS = Object.freeze([
  'residual_likelihood',
  'residual_impact',
  'target_score',
  'next_review_date',
]);

/** "HSE, Q3 , ,drilling" -> ['HSE', 'Q3', 'drilling'], de-duplicated. */
export const parseTags = (raw) => {
  if (Array.isArray(raw)) return [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))];
  if (typeof raw !== 'string') return [];
  return [...new Set(raw.split(',').map((t) => t.trim()).filter(Boolean))];
};

/** "RSK-1001, rsk-1002" -> ['RSK-1001', 'RSK-1002'], upper-cased, de-duplicated. */
export const parseRiskCodes = (raw) => {
  if (Array.isArray(raw)) raw = raw.join(',');
  if (typeof raw !== 'string') return [];
  return [...new Set(
    raw.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean),
  )];
};

/**
 * Split a form payload into the row, its tags and its links.
 *
 * `hasAs2Columns` is false while migration 20260916110000 is unapplied,
 * which is the state the front end ships in: go-lives are held until the
 * owner runs the applies. The new fields are dropped rather than sent,
 * so the app works before and after, on the PT1 checkshots precedent.
 */
export const buildRiskWrite = (form = {}, { hasAs2Columns = true } = {}) => {
  const allowed = hasAs2Columns
    ? RISK_REGISTER_WRITABLE_COLUMNS
    : RISK_REGISTER_WRITABLE_COLUMNS.filter((c) => !AS2_COLUMNS.includes(c));

  const derived = deriveRiskFields(form);
  const source = { ...form, rating: derived.rating, appetite_status: derived.appetite_status };

  const row = {};
  allowed.forEach((col) => {
    const value = source[col];
    if (value === undefined || value === '') return;
    row[col] = value;
  });

  return {
    row,
    tags: parseTags(form.tags),
    linkedCodes: parseRiskCodes(form.linked_risks),
    derived,
    // Anything the form collected that has no home at all. Empty today;
    // it exists so the next field someone adds to the form fails loudly
    // in a test instead of silently at the database.
    dropped: Object.keys(form).filter(
      (k) => !allowed.includes(k)
        && !['tags', 'linked_risks', 'id', 'org_id', 'risk_id', 'created_by',
             'created_at', 'updated_at', 'risk_score', 'residual_score'].includes(k),
    ),
  };
};

/**
 * Resolve risk codes to row ids inside one organization. Codes that do
 * not resolve are RETURNED, not dropped: telling someone their risk is
 * linked to RSK-9999 when no such risk exists is the kind of quiet lie
 * this module is being rebuilt to remove.
 */
export const resolveRiskCodes = (codes = [], risks = []) => {
  const byCode = new Map(risks.map((r) => [String(r.risk_id).toUpperCase(), r.id]));
  const resolved = [];
  const unresolved = [];
  codes.forEach((code) => {
    const id = byCode.get(code);
    if (id) resolved.push({ code, id });
    else unresolved.push(code);
  });
  return { resolved, unresolved };
};

/** Fallback code when `next_risk_code` is not deployed yet. */
export const nextCodeFromExisting = (risks = []) => {
  const numbers = risks
    .map((r) => /^RSK-(\d+)$/i.exec(String(r.risk_id || '')))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = (numbers.length ? Math.max(...numbers) : 1000) + 1;
  return `RSK-${String(next).padStart(4, '0')}`;
};
