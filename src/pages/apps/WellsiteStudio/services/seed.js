// Harness and test seed (plan section 5, WS0): one registry well, KETA-2,
// vertical to 1400 m then building to 30 degrees, KB 25 m, with the rig
// configuration the lag engine (WS3) needs: 12.25 in hole below a
// 13.375 in shoe at 914.4 m, 5 in drillpipe, 600 ft of 8 in collars,
// 6 x 12 in triplex at 97 percent, and a pump log with one connection.
// The bit is at 10,000 ft MD below RT when the harness opens.

import { M_PER_FT } from '@/lib/wellsite/depth';

export const SEED_USER = { id: 'user-a', email: 'geologist@example.com', name: 'A. Geologist', organization_id: 'org-1', role: 'wellsite_geologist' };

export const SEED_REGISTRY_WELLS = [
  {
    id: 'geo-keta-2', user_id: SEED_USER.id, organization_id: 'org-1', name: 'KETA-2', uwi: null,
    surface_x: 500000, surface_y: 6700000, kb_m: 25, td_md_m: 3200,
    deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1400, inc: 0, azi: 0 }, { md: 1750, inc: 30, azi: 90 }, { md: 3200, inc: 30, azi: 90 }],
  },
  { id: 'geo-keta-1', user_id: SEED_USER.id, organization_id: 'org-1', name: 'KETA-1', surface_x: 501000, surface_y: 6700500, kb_m: 24, td_md_m: 3100, deviation: null },
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
  return well;
}
