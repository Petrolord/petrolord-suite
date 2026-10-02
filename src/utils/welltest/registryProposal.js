/**
 * What the shared wells registry can propose for a well test report
 * (tester round 2, 2026-10-02, item 4): the well's name and identifier, its
 * zones (name, top and base, and the net pay, porosity and water saturation
 * a Petrophysics Studio zone summary published), and the true vertical
 * depths of the perforated interval through the well's deviation survey.
 *
 * It only proposes. The studio shows the values and the user applies them;
 * nothing is written to the registry and nothing changes until then.
 *
 * The registry holds metres; the studio state is feet. TVD is true vertical
 * depth below the well's depth reference, read through the Suite's one
 * depth-frame door (lib/wellDatum makeWellFrame), which needs no datum for
 * MD to TVD.
 */
import { makeWellFrame } from '@/lib/wellDatum';

const M_PER_FT = 0.3048;
const num = (v) => {
  if (v == null || v === '') return NaN;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};
const round = (v, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)) : NaN);

/**
 * @param {{well: object, zones?: object[], completion?: object}} a
 *   well: geo_wells row; zones: its geo_wells_zones rows; completion: the
 *   studio's completion state (MD in ft, strings) to convert to TVD
 * @returns {{wellId, wellName, uwi, hasSurvey: boolean, zones: Array,
 *   tvd: {perfTopTvd, perfBaseTvd, payTopTvd} (ft, NaN where there is no MD),
 *   tvdSource: string, tvdNote: ?string}}
 */
export function proposeFromRegistry({ well, zones = [], completion = {} }) {
  if (!well) return null;
  let frame = null;
  let frameError = null;
  try { frame = makeWellFrame(well); } catch (e) { frameError = e.message; }
  const hasSurvey = !!frame && !frame.isVertical;
  const notes = [];
  const tvdOf = (mdFt) => {
    if (!frame || !Number.isFinite(mdFt)) return NaN;
    try {
      const p = frame.mdToPosition(mdFt * M_PER_FT);
      if (p.extrapolated) notes.push('below the last survey station, so the last inclination is carried on');
      return round(p.tvd / M_PER_FT);
    } catch (e) {
      notes.push(e.message);
      return NaN;
    }
  };
  const tvd = {
    perfTopTvd: tvdOf(num(completion.perfTopMd)),
    perfBaseTvd: tvdOf(num(completion.perfBaseMd)),
    payTopTvd: tvdOf(num(completion.payTopMd)),
  };
  const name = well.name || 'registry well';
  return {
    wellId: well.id || null,
    wellName: well.name || '',
    uwi: well.uwi || '',
    hasSurvey,
    zones: (zones || []).map((z) => {
      const p = z.properties || {};
      return {
        id: z.id || `${z.name}-${z.top_md_m}`,
        name: z.name,
        topMdFt: round(num(z.top_md_m) / M_PER_FT),
        baseMdFt: round(num(z.base_md_m) / M_PER_FT),
        // a published Petrophysics zone summary, when there is one
        netFt: Number.isFinite(num(p.net_tvt_m)) ? round(num(p.net_tvt_m) / M_PER_FT) : round(num(p.net_m) / M_PER_FT),
        netBasis: Number.isFinite(num(p.net_tvt_m)) ? 'true vertical' : (Number.isFinite(num(p.net_m)) ? 'along hole' : null),
        phi: Number.isFinite(num(p.phi_avg)) ? round(num(p.phi_avg), 4) : NaN,
        sw: Number.isFinite(num(p.sw_avg)) ? round(num(p.sw_avg), 4) : NaN,
      };
    }),
    tvd,
    tvdSource: frameError
      ? ''
      : (hasSurvey ? `Deviation survey of registry well ${name}` : `Registry well ${name} has no deviation survey: taken as vertical`),
    tvdNote: frameError || (notes.length ? [...new Set(notes)].join('; ') : null),
  };
}

/** The completion fields a proposal would set (strings, ft), only where it has a value. */
export function completionPatchFromProposal(proposal) {
  if (!proposal) return {};
  const patch = {};
  for (const k of ['perfTopTvd', 'perfBaseTvd', 'payTopTvd']) {
    if (Number.isFinite(proposal.tvd[k])) patch[k] = String(proposal.tvd[k]);
  }
  if (Object.keys(patch).length) patch.tvdSource = proposal.tvdSource;
  return patch;
}

/** What applying a zone would set: its name, and h, phi, Sw where the zone summary carries them. */
export function zonePatchFromProposal(zone, wellName) {
  if (!zone) return { identification: {}, reservoir: {}, inputMeta: {} };
  const reservoir = {};
  const inputMeta = {};
  const src = { source: 'lab', note: `Petrophysics zone summary of ${wellName || 'the registry well'}, zone ${zone.name}` };
  if (Number.isFinite(zone.netFt) && zone.netFt > 0) { reservoir.h = String(zone.netFt); inputMeta.h = { ...src, note: `${src.note} (net pay, ${zone.netBasis})` }; }
  if (Number.isFinite(zone.phi)) { reservoir.phi = String(zone.phi); inputMeta.phi = src; }
  if (Number.isFinite(zone.sw)) { reservoir.sw = String(zone.sw); inputMeta.sw = src; }
  return { identification: { zone: zone.name }, reservoir, inputMeta };
}
