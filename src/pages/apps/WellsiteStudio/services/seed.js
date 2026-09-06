// Harness and test seed (plan section 5, WS0): one registry well, KETA-2,
// vertical to 1400 m then building to 30 degrees, KB 25 m, with the rig
// configuration the lag engine (WS3) needs: 12.25 in hole below a
// 13.375 in shoe at 914.4 m, 5 in drillpipe, 600 ft of 8 in collars,
// 6 x 12 in triplex at 97 percent, and a pump log with one connection.
// The bit is at 10,000 ft MD below RT when the harness opens.

import { M_PER_FT } from '@/lib/wellsite/depth';
import { buildPrognosis } from './prognosis';

export const SEED_USER = { id: 'user-a', email: 'geologist@example.com', name: 'A. Geologist', organization_id: 'org-1', role: 'wellsite_geologist' };

export const SEED_REGISTRY_WELLS = [
  {
    id: 'geo-keta-2', user_id: SEED_USER.id, organization_id: 'org-1', name: 'KETA-2', uwi: null,
    surface_x: 500000, surface_y: 6700000, kb_m: 25, td_md_m: 3200,
    deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1400, inc: 0, azi: 0 }, { md: 1750, inc: 30, azi: 90 }, { md: 3200, inc: 30, azi: 90 }],
    tops: [
      { id: 'top-keta2-agbada', name: 'Top Agbada', md_m: 3100, uncertainty_m: 20, surface_type: 'formation_top' },
      { id: 'top-keta2-akata', name: 'Top Akata', md_m: 3300, uncertainty_m: 30, surface_type: 'formation_top' },
    ],
  },
  { id: 'geo-keta-1', user_id: SEED_USER.id, organization_id: 'org-1', name: 'KETA-1', surface_x: 501000, surface_y: 6700500, kb_m: 24, td_md_m: 3100, deviation: null,
    tops: [{ id: 'top-keta1-agbada', name: 'Top Agbada', md_m: 2690, surface_type: 'formation_top' }, { id: 'top-keta1-akata', name: 'Top Akata', md_m: 2880, surface_type: 'formation_top' }] },
];

export const SEED_RIG_CONFIG = {
  hole_sections: [
    { from_md_m: 0, to_md_m: 914.4, cased: true, casing_id_m: 12.347 * 0.0254, hole_id_m: 17.5 * 0.0254, description: '13.375 in casing to 3000 ft' },
    { from_md_m: 914.4, to_md_m: 3200, cased: false, hole_id_m: 12.25 * 0.0254, description: '12.25 in open hole' },
  ],
  bha: [{ lengthM: 600 * M_PER_FT, odM: 8 * 0.0254, idM: 2.8125 * 0.0254, label: '8 in collars' }],
  drillpipe: { odM: 5 * 0.0254, idM: 4.276 * 0.0254, label: '5 in 19.5 lb/ft' },
  pump: { type: 'triplex', linerIn: 6, strokeIn: 12, rodIn: 0, efficiency: 0.97 },
};

export const SEED_SETTINGS = {
  rig_offset_min: 60,
  tour_starts_local: ['06:00', '18:00'],
  report_day_start_local: '06:00',
  default_depth: { unit: 'ft', reference: 'MD', datum: 'RT' },
  mandatory_sample_stages: ['caught', 'described', 'bagged'],
  approver_roles: ['well_geology_lead', 'administrator'],
  keep_originals: false,
  overdue_tolerance_min: 15,
};

/** Seed the local store through the backend: the well plus its opening records. Idempotent per backend.
 *  Times are relative to `now` (the bit reached 10,000 ft at `now`) so a record made a moment later sorts after them. */
export async function seedWellsite(backend, { now = Date.now() } = {}) {
  const existing = await backend.listWells();
  if (existing.length) return existing[0];
  const iso = (min) => new Date(now + min * 60000).toISOString();
  const well = await backend.createWell({
    geoWell: SEED_REGISTRY_WELLS[0],
    name: 'KETA-2',
    header: { kb_elev_m: 25, gl_elev_m: 4, rt_offset_m: 0, field: 'Keta', operator: 'Petrolord E&P', rig: 'Rig 12', country: 'Ghana' },
    settings: SEED_SETTINGS,
  });
  const ft = (v) => ({ value: v, unit: 'ft', reference: 'MD', datum: 'RT', kind: 'bit_depth' });
  await backend.addRecords(well.id, [
    { kind: 'observation', subtype: 'rig_config', occurredAt: iso(-600), payload: SEED_RIG_CONFIG },
    { kind: 'observation', subtype: 'bit_depth', occurredAt: iso(-240), depth: ft(9800), payload: { source: 'manual' } },
    { kind: 'observation', subtype: 'bit_depth', occurredAt: iso(-120), depth: ft(9900), payload: { source: 'manual' } },
    { kind: 'observation', subtype: 'bit_depth', occurredAt: iso(0), depth: ft(10000), payload: { source: 'manual' } },
    { kind: 'observation', subtype: 'pump_rate', occurredAt: iso(-240), payload: { spm: 60, note: 'Drilling ahead' } },
    { kind: 'observation', subtype: 'pump_rate', occurredAt: iso(-130), payload: { spm: 0, note: 'Connection' } },
    { kind: 'observation', subtype: 'pump_rate', occurredAt: iso(-120), payload: { spm: 60, note: 'Back on bottom' } },
    // the sampling programme: every 10 ft from 9,800 ft, authorised by the operations geologist
    { kind: 'decision', subtype: 'sample_programme', occurredAt: iso(-600), payload: {
      version: 1, rows: [{ fromMdM: 9800 * M_PER_FT, toMdM: null, intervalM: 10 * M_PER_FT }], authorisedBy: 'Operations geologist', authorisedAtUtc: iso(-600), reason: 'Section programme',
      basis: 'Section programme', statement: 'Sampling programme version 1', person: 'Operations geologist', communication: null } },
  ]);
  // the prognosis, version 1, from the fake registry (own tops, KETA-1 as the offset)
  const sources = await backend.loadPrognosisSources(well.id, { offsetWellIds: ['geo-keta-1'] });
  await backend.addPrognosis(well.id, buildPrognosis({ wellId: well.id, version: 1, sources, offsetWells: sources.offsetWells, offsetMin: SEED_SETTINGS.rig_offset_min, notes: 'Pre-drill prognosis' }));
  return well;
}

/**
 * Stand in for the office: a competing version of the current Agbada call (or interpretation),
 * arriving as if pulled by the sync engine. Returns the branch row. Used by the harness (?conflict=1) and tests.
 */
export async function seedCompetingTop(backend, well) {
  const tops = await backend.listTops(well.id);
  const heads = tops.filter((t) => t.formation_key === 'top_agbada' && t.role === 'official' && !tops.some((n) => n.previous_version_id === t.id));
  const base = heads.find((h) => h.version_no >= 1) || null;
  if (!base) return null;
  // with two or more versions the office branches from the head's parent (two heads on one chain);
  // with a single version the office called the top fresh (two chains for one formation)
  const prev = base.previous_version_id ? tops.find((t) => t.id === base.previous_version_id) : null;
  const branch = {
    ...base, id: `office-${base.id}`, chain_id: prev ? base.chain_id : `office-chain-${base.id}`,
    previous_version_id: prev ? prev.id : null, version_no: prev ? (prev.version_no || 1) + 1 : 1, resolves_ids: null,
    status: 'confirmed', basis: 'Office pick on the LWD gamma ray', md_calc_m: base.md_calc_m + 1.5, tvd_calc_m: (base.tvd_calc_m || 0) + 1.3, depth_value: base.depth_value + 5,
    created_by: 'user-office', device_id: 'office-desk', occurred_at: new Date(Date.parse(base.occurred_at) + 60000).toISOString(), client_created_at: new Date().toISOString(),
  };
  await backend._pullRows('tops', [branch]);
  return branch;
}
