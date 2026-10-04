// What a Well Test Analysis Studio project says about the reservoir, for the
// apps that read it (WTA-U1-012, contract `wta-1`).
//
// The sender out of Well Test. Its readers are Material Balance Studio
// (average pressure, temperature; k and skin for reference) and Waterflood
// Design Studio (permeability). Before this round the results went through
// router state only, with no method, interval or regression status, and a
// saved project held no results at all (Well Test results are computed from
// the inputs), so Material Balance found no average pressure in a saved
// project. Now every save writes the `wta-1` record of the interpretation on
// screen into the project (payload key `wta`), and a reader opened with
// `?wellTestProject=<id>` reads it by id from the saved row, after a page
// refresh or on a fresh visit. Row level security and the record sharing
// rules decide who can read the row.
//
// Contract wta-1, every field (oilfield units throughout: md, ft, psia, degF):
//   contract       'wta-1'
//   app            'Well Test Analysis Studio'
//   project        { id, name, well, field, zone, analyst, test_type, test_dates }
//   fluid          'oil' | 'gas'
//   permeability   { value (md), kh (md-ft), method (words), ci95: [lo, hi] | null,
//                    window: { from_hr, to_hr, basis } | null }
//   skin           { total, mechanical, partial_penetration, method (words),
//                    apparent (gas: includes rate-dependent skin), withheld: reason | null,
//                    rate_dependent: { D_per_mscfd, Dq, skin_without_rate_part, method } | null (U2-003) }
//   pressure       { initial_psia (entered), p_star_psia (Horner extrapolation or null),
//                    average_psia, average_method (words), basis (words),
//                    gauge_depth_md_ft, gauge_depth_tvd_ft, datum_tvdss_ft,
//                    datum_correction: 'none' | { gradient_psi_ft, gradient_source, gauge_tvdss_ft, delta_psi } (U2-004),
//                    p_star_datum_psia, method_label 'p*' | 'pi' (U2-005); average_psia is at the datum
//                    when a correction was applied, and basis says which }
//   temperature_degF
//   status         { match: 'regression' | 'manual' | 'semilog' | 'none', converged: bool | null,
//                    note: words | null }
//   computed_at    ISO time the record was built (the save)
// A reader converts for display and says so.

export const WTA_CONTRACT = 'wta-1';
export const WTA_APP = 'Well Test Analysis Studio';
export const WTA_PROJECT_PARAM = 'wellTestProject';
export const WTA_TABLE = 'saved_well_test_projects';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const orNull = (v) => (finite(v) ? v : null);
const text = (v) => (v != null && String(v).trim() ? String(v).trim() : null);

/**
 * The wta-1 record of the interpretation the studio holds now.
 * @param {object} ctx the Well Test studio context (or the same fields)
 * @param {{now?: string, projectId?: string}} [o]
 * @returns {?object} null when there is no interpretation to send
 */
export function buildWtaRecord(ctx, { now = new Date().toISOString(), projectId = null } = {}) {
  const r = ctx?.reservoirSpec?.reservoir;
  const k = ctx?.derivedKpis;
  if (!r || !k || !finite(k.k)) return null;
  const cfg = ctx.configSpec?.config;
  const isGas = r.fluid === 'gas';
  const isBuildup = cfg?.family === 'buildup';
  const sl = ctx.semilogResult;
  const mm = ctx.matchMethod?.kind || 'none';
  const fit = mm === 'regression' ? ctx.fitResult : null;
  const fromMatch = k.source === 'match';
  const lineName = isBuildup ? 'Horner straight line' : 'MDH straight line';
  const permMethod = fromMatch
    ? `Model match, ${ctx.model?.label || 'model'}${fit ? (fit.converged ? ' (regression converged)' : ' (regression stopped early)') : ' (manual match)'}`
    : `${lineName}${isGas ? ' in pseudo-pressure' : ''}`;
  const ci = fit?.confidence95?.k;
  const sb = ctx.skinBreakdown;
  const pStar = isBuildup && finite(sl?.pStar) ? sl.pStar : null;
  const comp = ctx.completion || {};
  const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
  const tempF = isGas ? r.tempR - 460 : n(ctx.reservoirInputs?.reservoirTempF);
  const id = ctx.identification || {};
  return {
    contract: WTA_CONTRACT,
    app: WTA_APP,
    project: {
      id: projectId ?? ctx.currentProjectId ?? null,
      name: text(ctx.projectName),
      well: text(ctx.wellName),
      field: text(ctx.fieldName),
      zone: text(id.zone),
      analyst: text(ctx.analyst),
      test_type: cfg?.testType ?? null,
      test_dates: [text(id.testDateStart), text(id.testDateEnd)].filter(Boolean).join(' to ') || null,
    },
    fluid: isGas ? 'gas' : 'oil',
    permeability: {
      value: k.k,
      kh: orNull(k.kh),
      method: permMethod,
      ci95: Array.isArray(ci) && ci.every(finite) ? [ci[0], ci[1]] : null,
      window: !fromMatch && sl && finite(sl.windowMin)
        ? { from_hr: sl.windowMin, to_hr: sl.windowMax, basis: isBuildup ? 'shut-in time dt' : 'elapsed time' }
        : null,
    },
    skin: {
      total: orNull(k.skin),
      mechanical: sb?.status === 'ok' ? orNull(sb.mechanicalSkin) : null,
      partial_penetration: sb?.status === 'ok' ? orNull(sb.spp) : null,
      method: fromMatch ? permMethod : lineName,
      apparent: isGas,
      withheld: ctx.prepared?.skinWithheld || null,
      // WTA-U2-003: the rate-dependent part, when a route gave D
      rate_dependent: isGas && finite(ctx.rateSkin?.D) ? {
        D_per_mscfd: ctx.rateSkin.D,
        Dq: orNull(ctx.rateSkin.Dq),
        skin_without_rate_part: orNull(ctx.rateSkin.trueSkin),
        method: ctx.rateSkin.source === 'multi-rate' ? "multi-rate line of apparent skins, s' = s + D q" : 'pseudo-pressure LIT b as the non-Darcy coefficient F, D = F k h / (1422 T)',
      } : null,
    },
    pressure: (() => {
      // WTA-U2-004: with a stated gradient the average pressure is sent at the datum
      const d = ctx.datum?.ok ? ctx.datum : null;
      const avgGauge = pStar ?? orNull(r.pi);
      const g = n(comp.datumGradient);
      return {
        initial_psia: orNull(r.pi),
        p_star_psia: pStar,
        p_star_datum_psia: d && pStar != null ? d.apply(pStar) : null,
        average_psia: d && avgGauge != null ? d.apply(avgGauge) : avgGauge,
        average_method: pStar != null
          ? 'Extrapolated p* of the Horner straight line. It equals the average drainage pressure only for an infinite-acting reservoir; no MBH or Dietz correction is applied.'
          : 'Initial pressure as entered on the test (no p* from this test).',
        method_label: pStar != null ? 'p*' : 'pi',
        // U2-005: the day the pressure belongs to (the end of the test, else its start), ISO date or null
        date: (() => { const v = text(id.testDateEnd) || text(id.testDateStart); return v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null; })(),
        basis: d
          ? `absolute, at the datum ${n(comp.datumDepthTvdss)} ft TVDSS (corrected from the gauge with ${g} psi/ft, ${text(comp.datumGradientSource) || 'source not stated'})`
          : 'absolute, at the gauge depth (no correction to a datum)',
        gauge_depth_md_ft: n(comp.gaugeDepthMd),
        gauge_depth_tvd_ft: n(comp.gaugeDepthTvd),
        datum_tvdss_ft: n(comp.datumDepthTvdss),
        datum_correction: d
          ? { gradient_psi_ft: g, gradient_source: text(comp.datumGradientSource), gauge_tvdss_ft: d.gaugeTvdss, delta_psi: d.correction }
          : 'none',
      };
    })(),
    temperature_degF: orNull(tempF),
    status: {
      match: fromMatch ? (mm === 'regression' ? 'regression' : 'manual') : (k.source === 'semilog' ? 'semilog' : 'none'),
      converged: fit ? !!fit.converged : null,
      note: ctx.matchMethod?.note || null,
    },
    computed_at: now,
  };
}

/** The block of a saved payload, or null. */
export function wtaContractOf(payload) {
  const b = payload?.contract === WTA_CONTRACT ? payload : payload?.wta;
  return b && b.contract === WTA_CONTRACT ? b : null;
}

/** What a reader may rely on: { ok, errors }. */
export function validateWtaContract(b) {
  const errors = [];
  if (!b || b.contract !== WTA_CONTRACT) errors.push('Not a wta-1 block.');
  else {
    if (!finite(b.permeability?.value) || !(b.permeability.value > 0)) errors.push('No permeability.');
    if (!b.pressure || !('average_psia' in b.pressure)) errors.push('No pressure block.');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * The router-state handoff the receivers already read (wellTestData), built
 * from a block, with the block beside it. One intake for both routes.
 */
export function wellTestDataFromContract(b) {
  if (!b) return null;
  const record = [b.project?.name ? `project ${b.project.name}` : null].filter(Boolean).join('');
  return {
    source: b.project?.name || b.project?.well || WTA_APP,
    wellName: b.project?.well || '',
    pAvg_psia: b.pressure?.average_psia ?? undefined,
    pressureMethod: b.pressure?.average_method ? b.pressure.average_method.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase()) : undefined,
    sentAt: b.computed_at,
    k_md: b.permeability?.value,
    kMethod: b.permeability?.method,
    skin: b.skin?.total ?? undefined,
    fluid: b.fluid,
    tempF: b.temperature_degF ?? undefined,
    record,
    contract: b,
  };
}

/**
 * Read a saved Well Test project by id and return its wta-1 block.
 * @param {object} supabase the client
 * @param {string} projectId
 * @returns {Promise<{ok: boolean, contract: ?object, projectName: ?string, updatedAt: ?string, reason: ?string}>}
 */
export async function readWellTestProject(supabase, projectId) {
  const none = (reason, extra = {}) => ({ ok: false, contract: null, projectName: null, updatedAt: null, reason, ...extra });
  if (!projectId) return none('No Well Test Analysis Studio project was named.');
  let data;
  try {
    const res = await supabase.from(WTA_TABLE).select('*').eq('id', projectId).maybeSingle();
    if (res.error) return none(`The Well Test Analysis Studio project could not be read: ${res.error.message}`);
    data = res.data;
  } catch (e) {
    return none(`The Well Test Analysis Studio project could not be read: ${e?.message || e}`);
  }
  if (!data) return none('The Well Test Analysis Studio project was not found, or it is not yours to read.');
  const projectName = data.project_name || data.inputs_data?.name || null;
  const contract = wtaContractOf(data.inputs_data);
  if (!contract) {
    return none('This Well Test Analysis Studio project was saved before it carried its results (wta-1). Open it in Well Test Analysis Studio and save it once.', { projectName, updatedAt: data.updated_at || null });
  }
  const check = validateWtaContract(contract);
  if (!check.ok) return none(`The results block of the project is incomplete: ${check.errors.join(' ')}`, { projectName, updatedAt: data.updated_at || null });
  return { ok: true, contract, projectName, updatedAt: data.updated_at || null, reason: null };
}
