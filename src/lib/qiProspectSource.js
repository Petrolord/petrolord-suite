// What a QI Studio study says about a prospect, for the apps that risk and
// value it (QI programme Q10, contract `qi-prospect-1`, 2026-10-07).
//
// The sender out of QI Studio's Prospects tab. Its first reader is Risked
// Reserves Valuation, which shows the QI evidence beside the prospect while
// Pg is set and the prospect valued: the seismic support, the
// recommendation and its reasons, and the gross rock volume between the
// contact the anomaly implies and the spill point. QI never sets Pg: the
// record carries no chance of any kind, and a reader moves no number of
// its own on reading it.
//
// QI Studio saves the record of each analysed prospect into its project
// (payload key `prospects`, item `record`); a reader opened with
// `?qiProject=<id>&qiProspect=<prospect id>` reads it by id from the saved
// row. Row level security and the record sharing rules decide who can read
// the row.
//
// Contract qi-prospect-1, every field:
//   contract      'qi-prospect-1'
//   app           'QI Studio'
//   project       { id, name }
//   prospect      { id, name, target }
//   trap          { crest_depth_m, spill_depth_m, column_m, area_km2, grv_spill_m3,
//                   limited_by_edge (the spill on the map edge: GRV at spill is a lower bound),
//                   surface (name) }
//   anomaly       { present, conformance (0..1), inside_closure (0..1), implied_contact_depth_m,
//                   grv_implied_m3, source (attribute map name), threshold, sense } | { present: false }
//   evidence      { independent (distinct supporting responses), items: [{name, source, supports}] }
//   competing     [{ name, status ('open' | 'ruled-out' | 'likely') }]
//   feasibility   the target's Package 1 verdict ('feasible' | 'conditional' | 'not-feasible' | '')
//   assessment    { recommendation ('mature' | 'retain' | 'investigate' | 'downgrade'), label,
//                   seismic_support ('supports' | 'neutral' | 'against'), reasons [words] }
//   qi_class      'interpretation'
//   computed_at   ISO time
// Depths in metres, positive down; volumes in cubic metres.
//
// Pure apart from `readQiProspect`, which takes the Supabase client.

export const QI_PROSPECT_CONTRACT = 'qi-prospect-1';
export const QI_APP = 'QI Studio';
export const QI_PROJECT_PARAM = 'qiProject';
export const QI_PROSPECT_PARAM = 'qiProspect';
export const QI_TABLE = 'saved_qi_studio_projects';
export const QI_ROUTE = '/dashboard/apps/geoscience/qi-studio';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The qi-prospect-1 record of one analysed prospect. */
export function buildQiProspectRecord({ prospect, analysis, projectId = null, projectName = null, surfaceName = null, attributeName = null, feasibility = '', now = new Date().toISOString() }) {
  const t = analysis.trap; const a = analysis.anomaly;
  return {
    contract: QI_PROSPECT_CONTRACT,
    app: QI_APP,
    project: { id: projectId, name: projectName },
    prospect: { id: prospect.id, name: prospect.name, target: prospect.target || null },
    trap: {
      crest_depth_m: num(t.crest.depthM), spill_depth_m: num(t.spill.depthM), column_m: num(t.columnM),
      area_km2: num(t.areaKm2), grv_spill_m3: num(t.grvSpillM3), limited_by_edge: !!t.limitedByEdge, surface: surfaceName,
    },
    anomaly: a ? {
      present: true, conformance: num(a.conformance), inside_closure: num(a.insideClosure),
      implied_contact_depth_m: num(a.impliedContactDepthM), grv_implied_m3: num(a.grvImpliedM3),
      source: attributeName, threshold: num(prospect.anomaly?.threshold), sense: prospect.anomaly?.sense || 'high',
    } : { present: false },
    evidence: { independent: analysis.evidence.independent, items: (prospect.evidence || []).map((e) => ({ name: e.name, source: e.source, supports: e.supports !== false })) },
    competing: (prospect.competing || []).map((c) => ({ name: c.name, status: c.status })),
    feasibility: feasibility || '',
    assessment: {
      recommendation: analysis.assessment.recommendation, label: analysis.assessment.label,
      seismic_support: analysis.assessment.seismicSupport, reasons: analysis.assessment.reasons.slice(),
    },
    qi_class: 'interpretation',
    computed_at: now,
  };
}

/** Why a record cannot be read as qi-prospect-1, or null. */
export function qiProspectProblem(r) {
  if (!r || typeof r !== 'object') return 'There is no QI record for this prospect.';
  if (r.contract !== QI_PROSPECT_CONTRACT) return `The record is ${r.contract || 'of no known contract'}; this reader takes ${QI_PROSPECT_CONTRACT}.`;
  if (!r.assessment?.recommendation) return 'The record has no assessment.';
  return null;
}

/** A link from QI Studio to a reader app with the record by id. */
export const qiProspectLink = (route, projectId, prospectId) => `${route}?${QI_PROJECT_PARAM}=${encodeURIComponent(projectId)}&${QI_PROSPECT_PARAM}=${encodeURIComponent(prospectId)}`;

/**
 * Read a prospect's record from a saved QI Studio project.
 * @returns {Promise<{ok: true, record} | {ok: false, reason}>}
 */
export async function readQiProspect(supabase, projectId, prospectId) {
  const { data, error } = await supabase.from(QI_TABLE).select('id, project_name, inputs_data').eq('id', projectId).maybeSingle();
  if (error) return { ok: false, reason: /does not exist|42P01/.test(`${error.code} ${error.message}`) ? 'QI Studio saving is not switched on for this database yet.' : error.message };
  if (!data) return { ok: false, reason: 'The QI Studio project was not found, or it is not shared with you.' };
  const p = (data.inputs_data?.prospects || []).find((x) => x.id === prospectId);
  const record = p?.record || null;
  const why = qiProspectProblem(record);
  return why ? { ok: false, reason: why } : { ok: true, record };
}
