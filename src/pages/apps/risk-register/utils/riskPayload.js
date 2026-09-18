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
import { deriveRiskFields, getAppetiteStatus } from '@/lib/riskScoring';

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

/**
 * Columns the database refuses a null in. A blank form value for one of
 * these is left out of the row (the form requires them), rather than
 * sent as null and refused.
 */
const NOT_NULL_COLUMNS = Object.freeze(['title', 'category']);

/**
 * The fields a user sets in the "After controls" part of the form, which
 * are exactly the AS2 columns. Used to tell the user when a value they
 * entered could not be saved because the migration is unapplied.
 */
export const as2ValuesEntered = (form = {}) => AS2_COLUMNS.filter((c) => {
  const v = form[c];
  return v !== undefined && v !== null && v !== '';
});

/** Said on every save that drops AS2 values, and on the form itself. */
export const AS2_SCHEMA_MESSAGE =
  'This database does not have the residual, target and review date columns yet, so residual likelihood, residual impact, target score and next review date cannot be saved. Ask your administrator to apply migration 20260916110000.';

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
    if (value === undefined) return;
    // A blank field means "not set", which is null. It used to be
    // skipped, so on an edit choosing "Not assessed" or clearing the
    // target or the review date left the old value in the database while
    // the save reported success (AS13).
    if (value === '' || value === null) {
      if (!NOT_NULL_COLUMNS.includes(col)) row[col] = null;
      return;
    }
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

/**
 * What an edit has to do to a risk's links.
 *
 * A link is stored once, with a direction (`source_risk_id` ->
 * `target_risk_id`), and the edit page shows links in BOTH directions as
 * one list of codes. The old save deleted only the links this risk was
 * the source of and re-inserted every code as an outgoing link, so every
 * edit of a risk that another risk linked to added a duplicate link
 * pointing back the other way (AS13).
 *
 * Here a link that is still wanted is left exactly as stored, whichever
 * way it points; a link no longer wanted is deleted; and only a risk that
 * is not linked in either direction gets a new, outgoing link.
 */
export const planLinkChanges = (riskId, existingLinks = [], wantedIds = []) => {
  const wanted = new Set(wantedIds.filter((id) => id && id !== riskId));
  const linkedTo = new Set();
  const toDelete = [];
  existingLinks.forEach((l) => {
    const other = l.source_risk_id === riskId ? l.target_risk_id : l.source_risk_id;
    if (!wanted.has(other) || linkedTo.has(other)) {
      // Not wanted any more, or a duplicate of a link already kept.
      toDelete.push(l.id);
      return;
    }
    linkedTo.add(other);
  });
  const toInsert = [...wanted].filter((id) => !linkedTo.has(id));
  return { toDelete, toInsert };
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

/**
 * AS13 hardening: the appetite line on the form's preview.
 *
 * With a target and no residual assessment the form read "Not assessed"
 * and showed no appetite at all, while the detail page and the stored
 * appetite_status judge the same risk on its inherent score. The answer
 * comes from getAppetiteStatus, the one authority, in both places.
 */
export const appetitePreview = (form = {}) => {
  const appetite = getAppetiteStatus(form);
  const target = Number(form.target_score);
  const hasResidual = Boolean(form.residual_likelihood || form.residual_impact);
  const judged = hasResidual ? '' : 'Not assessed, so this risk is carried at its inherent score. ';
  const suffix = Number.isFinite(target) && target > 0 ? ` (target ${target})` : '';
  return `${judged}Appetite: ${appetite}${suffix}`;
};
