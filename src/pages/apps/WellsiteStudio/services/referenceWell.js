// The Reference Well (spec section 43): 15,000 ft drilled, 2,000
// samples, 10,000 observations, 1,500 photographs (rows; the blobs are
// not part of the performance case), 500 events, 100 interpretations
// and 50 top versions, generated deterministically into a backend so
// the performance gate and the `?seed=reference` harness measure the
// same well. Written straight through the local store's builders.

import { buildRecord, buildSampleRow, buildStageRow, buildTopRow } from '@/lib/wellsite/records';
import { buildPhotoRows } from '@/lib/wellsite/photos/store';
import { commitMany } from '@/lib/wellsite/commit';
import { wellContext, offsetMinOf } from './wellContext';
import { M_PER_FT } from '@/lib/wellsite/depth';
import { SEED_RIG_CONFIG } from './seed';

export const REFERENCE = Object.freeze({ tdFt: 15000, samples: 2000, observations: 10000, photos: 1500, events: 500, interpretations: 100, topVersions: 50 });
const EVENT_CYCLE = ['drilling', 'connection', 'circulation', 'sweep', 'trip_out', 'trip_in', 'losses', 'gas_event', 'cavings', 'bottoms_up'];
const OBS_CYCLE = ['total_gas', 'connection_gas', 'rop_change', 'shale_density', 'cavings', 'mud', 'lwd', 'drilling_parameter', 'note', 'trip_gas'];

/** Deterministic pseudo-random in [0, 1). */
function rng(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }

/**
 * Populate `backend` (a local backend whose well exists) with the reference well. Returns counts.
 * @param {Object} backend
 * @param {Object} well the ws_wells row
 * @param {Object} [o] { startUtcMs, ftPerHour = 40 }
 */
export async function seedReferenceWell(backend, well, { nowMs = Date.now(), ftPerHour = 40, chunk = 500 } = {}) {
  // the bit reaches TD one hour before now, so the reference well is the live state of the screens
  const startUtcMs = nowMs - (REFERENCE.tdFt / ftPerHour) * 3600000 - 3600000;
  const db = backend.db;
  const u = await backend.currentUser();
  const ctx = wellContext(well);
  const offsetMin = offsetMinOf(well);
  const rand = rng(42);
  const msPerFt = 3600000 / ftPerHour;
  const at = (ft) => new Date(startUtcMs + ft * msPerFt).toISOString();
  const common = { wellId: well.id, ctx, offsetMin, userId: u.id };
  const items = [];
  const flush = async () => { if (items.length) { await commitMany(db, items.splice(0, items.length)); } };
  const push = async (it) => { items.push(it); if (items.length >= chunk) await flush(); };
  const dep = (ft, kind = 'bit_depth') => ({ value: ft, unit: 'ft', reference: 'MD', datum: 'RT', kind });

  // the rig configuration, then bit depth every 100 ft
  await push({ store: 'records', row: buildRecord({ ...common, kind: 'observation', subtype: 'rig_config', occurredAt: at(0), payload: { ...SEED_RIG_CONFIG, hole_sections: [{ from_md_m: 0, to_md_m: 914.4, cased: true, casing_id_m: 12.347 * 0.0254, hole_id_m: 17.5 * 0.0254, description: '13.375 in casing to 3000 ft' }, { from_md_m: 914.4, to_md_m: 4700, cased: false, hole_id_m: 12.25 * 0.0254, description: '12.25 in open hole' }] } }).row });
  for (let ft = 100; ft <= REFERENCE.tdFt; ft += 100) await push({ store: 'records', row: buildRecord({ ...common, kind: 'observation', subtype: 'bit_depth', occurredAt: at(ft), depth: dep(ft), payload: { source: 'manual' } }).row });
  await push({ store: 'records', row: buildRecord({ ...common, kind: 'observation', subtype: 'pump_rate', occurredAt: at(0), payload: { spm: 60 } }).row });
  // samples every 7.5 ft (2000 over 15,000 ft) with caught and described stages
  const sampleIds = [];
  for (let i = 0; i < REFERENCE.samples; i += 1) {
    const ft = 7.5 * (i + 1);
    const { row } = buildSampleRow({ ...common, sampleNo: i + 1, mdM: ft * M_PER_FT, intervalM: 7.5 * M_PER_FT, programmeVersion: 1 });
    sampleIds.push(row.id);
    await push({ store: 'samples', row });
    await push({ store: 'sample_stages', row: buildStageRow({ ...common, sampleId: row.id, stage: 'caught', atUtc: at(ft + 50) }).row });
    if (i % 2 === 0) await push({ store: 'sample_stages', row: buildStageRow({ ...common, sampleId: row.id, stage: 'described', atUtc: at(ft + 60) }).row });
  }
  // observations: descriptions every 30 ft (500), shows every 150 ft (100), the rest manual observations
  let obs = 0;
  for (let ft = 30; ft <= REFERENCE.tdFt && obs < 500; ft += 30, obs += 1) {
    const sandy = (Math.floor(ft / 30) % 3) !== 0;
    const comps = sandy ? [{ lithology: 'sandstone', percent: 70, colour: { hue: 'grey', modifier: 'light' }, grainSize: { from: 'f_sand', to: 'm_sand' }, texture: [], cement: [], accessories: [], fossils: [], porosityTypes: [] }, { lithology: 'shale', percent: 30, colour: { hue: 'grey', modifier: 'dark' }, texture: ['fissile'], cement: [], accessories: [], fossils: [], porosityTypes: [] }]
      : [{ lithology: 'shale', percent: 100, colour: { hue: 'grey', modifier: 'dark' }, hardness: 'firm', texture: ['fissile'], cement: [], accessories: [], fossils: [], porosityTypes: [] }];
    await push({ store: 'records', row: buildRecord({ ...common, kind: 'observation', subtype: 'cuttings_description', occurredAt: at(ft + 55), depth: dep(ft - 30, 'lagged_sample'), depth2: dep(ft, 'lagged_sample'), sampleId: sampleIds[Math.min(sampleIds.length - 1, Math.floor(ft / 7.5) - 1)], payload: { components: comps, comment: '', mode: 'quick' } }).row });
  }
  for (let ft = 150; ft <= REFERENCE.tdFt && obs < 600; ft += 150, obs += 1) {
    await push({ store: 'records', row: buildRecord({ ...common, kind: 'observation', subtype: 'show', occurredAt: at(ft + 58), depth: dep(ft, 'lagged_sample'), payload: { fluorescence: { colour: 'yellow', intensity: 'moderate', distributionPct: 25 }, cut: { speed: 'moderate', colour: 'yellow', type: 'streaming' }, stain: 'spotty', odour: 'none', residue: 'none' } }).row });
  }
  const remaining = REFERENCE.observations - obs;
  for (let i = 0; i < remaining; i += 1) {
    const ft = Math.min(REFERENCE.tdFt, 1 + Math.floor(rand() * REFERENCE.tdFt));
    const type = OBS_CYCLE[i % OBS_CYCLE.length];
    const numeric = ['total_gas', 'connection_gas', 'trip_gas', 'rop_change', 'shale_density'].includes(type);
    await push({ store: 'records', row: buildRecord({ ...common, kind: 'observation', subtype: type, occurredAt: at(ft), depth: dep(ft), payload: numeric ? { value: Math.round(rand() * 500) / 100, unit: type === 'rop_change' ? 'ft/hr' : type === 'shale_density' ? 'g/cc' : '%', text: null, source: 'external' } : { value: null, unit: null, text: `Observation ${i}`, source: 'manual' } }).row });
  }
  // events: 500 across the well, duration events ended 15 minutes later
  for (let i = 0; i < REFERENCE.events; i += 1) {
    const ft = Math.round((i + 1) * REFERENCE.tdFt / REFERENCE.events);
    const type = EVENT_CYCLE[i % EVENT_CYCLE.length];
    const duration = !['bottoms_up', 'cavings'].includes(type);
    const start = at(ft);
    await push({ store: 'records', row: buildRecord({ ...common, kind: 'event', subtype: type, occurredAt: start, endedAt: duration ? new Date(Date.parse(start) + 15 * 60000).toISOString() : start, depth: dep(ft, 'event'), payload: { label: type.replace(/_/g, ' '), duration, family: 'rig' } }).row });
  }
  // photos: 1500 rows with variant sizes (no blobs), one per 10 ft
  for (let i = 0; i < REFERENCE.photos; i += 1) {
    const ft = 10 * (i + 1);
    const derived = { thumb: { blob: null, bytes: 24000, width: 320, height: 240 }, working: { blob: null, bytes: 300000, width: 2048, height: 1536 }, original: null, sha256: `ref-${i}`, contentType: 'image/webp' };
    const { row } = buildPhotoRows({ wellId: well.id, organizationId: well.organization_id, sampleId: sampleIds[Math.min(sampleIds.length - 1, Math.floor(ft / 7.5) - 1)], depth: dep(ft, 'lagged_sample'), ctx, caption: `Tray ${i + 1}`, tags: [], capturedAt: at(ft + 62), offsetMin, userId: u.id, derived });
    row.upload_state = 'remote';
    await push({ store: 'photos', row });
  }
  // interpretations and top versions: 100 formations interpreted, 25 of them called with a two-version chain (50 versions)
  for (let i = 0; i < REFERENCE.interpretations; i += 1) {
    const ft = 1000 + i * 140;
    const name = `Formation ${i + 1}`;
    const key = `formation_${i + 1}`;
    await push({ store: 'tops', row: buildTopRow({ ...common, role: 'interpretation', status: 'preliminary', name, formationKey: key, confidence: 'medium', basis: 'GR and cuttings', evidenceIds: [], depth: dep(ft - 10, 'logged'), rangeBase: dep(ft + 10, 'logged'), occurredAt: at(ft + 20) }).row });
    if (i % 4 === 0) {
      const v1 = buildTopRow({ ...common, role: 'official', status: 'preliminary', name, formationKey: key, basis: 'Called on cuttings', evidenceIds: [], depth: dep(ft, 'logged'), occurredAt: at(ft + 30) }).row;
      const v2 = buildTopRow({ ...common, role: 'official', status: 'confirmed', name, formationKey: key, basis: 'Confirmed on LWD', evidenceIds: [], depth: dep(ft + 2, 'logged'), occurredAt: at(ft + 90), chainId: v1.chain_id, versionNo: 2, previousVersionId: v1.id }).row;
      await push({ store: 'tops', row: v1 });
      await push({ store: 'tops', row: v2 });
    }
  }
  await flush();
  return { records: await db.records.where('[well_id+kind+occurred_at]').between([well.id, ''], [well.id, '￿']).count(), samples: await db.samples.where('[well_id+sample_no]').between([well.id, 0], [well.id, Infinity]).count(), photos: await db.photos.where('[well_id+captured_at]').between([well.id, ''], [well.id, '￿']).count(), tops: await db.tops.where('[well_id+formation_key]').between([well.id, ''], [well.id, '￿']).count() };
}
