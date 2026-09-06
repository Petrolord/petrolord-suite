// Report glue (WS7, WS8): the data a report model is built from, the
// narrative records the free-text sections edit, and the report and
// sign-off rows. The engine builds the model; nothing here types a fact.
import { buildReportModel, handoverPeriod, dailyPeriod, HANDOVER_TEMPLATE, DEFAULT_DAILY_TEMPLATE, validateTemplate, citedIds } from '@/lib/wellsite/reports';
import { chainHeads } from '@/lib/wellsite/records';
import { hashModel } from '@/lib/wellsite/reportHash';
import { mergeProfile } from '@/lib/wellsite/abbreviations';

export { buildReportModel, handoverPeriod, dailyPeriod, HANDOVER_TEMPLATE, DEFAULT_DAILY_TEMPLATE, validateTemplate, citedIds, hashModel };
export const NARRATIVE_KEYS = Object.freeze(['geological_summary', 'watch_items', 'outstanding_items', 'remarks', 'forecast']);

/** The current narrative record for a key and period (head of its chain), or null. */
export function currentNarrative(records, key, periodStartIso) {
  const heads = chainHeads(records.filter((r) => r.kind === 'narrative' && r.subtype === key && (r.payload || {}).period_start === periodStartIso));
  return heads.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0] || null;
}

/** Record parameters for a narrative (a new record, or a new version on the existing chain through backend.addVersion). */
export function narrativeParams(key, text, periodStartIso) {
  if (!NARRATIVE_KEYS.includes(key)) throw new Error(`Unknown narrative section ${key}.`);
  return { kind: 'narrative', subtype: key, payload: { text: String(text || ''), period_start: periodStartIso } };
}

/** The abbreviation profile of the well. */
export function profileOf(well) { return mergeProfile(well && well.settings && well.settings.abbreviation_profile ? well.settings.abbreviation_profile : null); }

/** Build a model from the workstation's loaded data. */
export function buildModel({ kind, period, well, records, samples, stages, tops, photos, events, lag, template = null, nowMs, offsetMin }) {
  return buildReportModel({
    kind, period, well, template,
    data: { records, samples, stages, tops, photos, events, lagReadout: lag && lag.available ? lag : null },
    profile: profileOf(well), nowUtcMs: nowMs, offsetMin,
  });
}

/** The ws_reports row parameters for a model (the backend stamps and chains it). */
export async function reportRowParams(model, { templateId }) {
  const { hash, algorithm } = await hashModel(model);
  return {
    kind: model.kind, reportDate: model.period.start.slice(0, 10), periodStart: model.period.start, periodEnd: model.period.end,
    templateId: templateId || model.template.id, canonical: model, contentHash: `${algorithm}:${hash}`, generatedAt: model.generated_at,
  };
}

/** The operator daily template from the well settings, validated, else the generic one. */
export function dailyTemplateOf(well) {
  const t = well && well.settings && well.settings.daily_template;
  return t && validateTemplate(t).length === 0 ? t : DEFAULT_DAILY_TEMPLATE;
}
