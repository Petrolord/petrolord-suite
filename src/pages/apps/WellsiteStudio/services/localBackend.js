// Wellsite Studio backend over the local database (plan section 4). Every
// write commits locally and queues; reads never touch the network. The
// transport (Supabase or fake) is used only for the online-only edges:
// listing registry wells, creating a well, and (WS6) the sync engine.

import { liveQuery } from 'dexie';
import { wellsiteDb, persistStorage, storageEstimate } from '@/lib/wellsite/db';
import { commitRow, commitMany, commitWellPatch, pendingCount } from '@/lib/wellsite/commit';
import { buildRecord, nextVersion, correction, buildSampleRow, buildStageRow, buildTopRow, buildPrognosisRow, buildReportRow, buildSignoffRow, RecordError } from '@/lib/wellsite/records';
import { canAdvance, statusConfig, DEFAULT_MANDATORY } from '@/lib/wellsite/sampleProgram';
import { derivePhotoVariants } from '@/lib/wellsite/photos/derive';
import { buildPhotoRows, localPhotoUrl } from '@/lib/wellsite/photos/store';
import { fromMetres } from '@/lib/wellsite/depth';
import { makeSyncEngine } from '@/lib/wellsite/sync/engine';
import { getSyncState, subscribeSyncState, syncHeadline } from '@/lib/wellsite/sync/syncStore';
import { detectConflicts } from '@/lib/wellsite/sync/conflicts';
import { pullWell } from '@/lib/wellsite/sync/pull';
import { publishPlan, runPublish, publishFailureText } from './publish';
import { mergeProfile } from '@/lib/wellsite/abbreviations';
import { wellContext, offsetMinOf } from './wellContext';
import { newId } from '@/lib/wellsite/ids';
import { memberChangeError } from './members';
import { prepareEvidenceLogs, staleEvidence } from '@/lib/wellsite/evidence';
import { mudlogSeries } from './mudlogImport';
import { dExponentSeries, currentDxcSettings } from './dexponent';
import { wellWithSurvey, SURVEY_SUBTYPE, activeSurvey, registrySurveyPlan, surveyPublishedParams } from './surveys';

export const WS_ENGINE_VERSION = 'wellsite-0.1.0';

/**
 * @param {Object} p
 * @param {Object} p.transport { currentUser(), online(), listRegistryWells(), createWsWell(row), pullWell(id) }
 * @param {Object} [p.db] Dexie instance (tests)
 */
export function makeLocalBackend({ transport, db = wellsiteDb(), autoSync = true }) {
  let user = null;
  let currentWellId = null;
  const listeners = new Set();
  const engine = makeSyncEngine({ db, transport, wellIdOf: () => currentWellId });
  const notify = () => {
    for (const l of listeners) { try { l(); } catch { /* listener error is not ours */ } }
    if (autoSync) engine.touch();
  };

  async function currentUser() {
    if (!user) user = await transport.currentUser();
    return user;
  }

  async function getWell(id) {
    const w = await db.wells.get(id);
    return w || null;
  }

  async function requireWellRow(id) {
    const w = await getWell(id);
    if (!w) throw new Error('Well not found locally. Open it while online once so it is cached.');
    return w;
  }
  // U2-005: every depth is calculated with the survey in use, the registry snapshot with the rig's
  // survey runs applied, so a record made after an MWD station carries its true TVD and version
  async function requireWell(id) {
    const w = await requireWellRow(id);
    const runs = await db.records.where('[well_id+subtype+occurred_at]').between([id, SURVEY_SUBTYPE, ''], [id, SURVEY_SUBTYPE, '\uffff']).toArray();
    return runs.length ? wellWithSurvey(w, runs) : w;
  }

  async function addRecord(wellId, p) {
    const well = await requireWell(wellId);
    const u = await currentUser();
    const { row, warnings } = buildRecord({
      ...p, wellId, ctx: wellContext(well), offsetMin: offsetMinOf(well), userId: u.id,
    });
    row.engine_version = WS_ENGINE_VERSION;
    await commitRow(db, 'records', row);
    notify();
    return { row, warnings };
  }

  return {
    db,
    transport,
    currentUser,
    online: () => transport.online(),

    // ---- wells ----
    async listWells() { return db.wells.orderBy('updated_at').reverse().toArray(); },
    getWell,
    /** Pull the well rows this user can see (online); harmless offline. */
    async refreshWells() {
      if (!transport.online()) return db.wells.toArray();
      const rows = await transport.listWsWells();
      await db.transaction('rw', db.wells, db.members, async () => {
        for (const r of rows) {
          const local = await db.wells.get(r.well.id);
          // a local pending settings patch must not be clobbered by a stale server row
          if (local && local.sync_state === 'pending') continue;
          await db.wells.put({ ...r.well, sync_state: 'synced' });
          for (const m of r.members || []) await db.members.put(m);
        }
      });
      notify();
      return db.wells.toArray();
    },
    listRegistryWells: () => transport.listRegistryWells(),
    /** Create the live-well record from a registry well (online only). */
    async createWell({ geoWell, name, header = {}, settings = {}, survey = null }) {
      if (!transport.online()) throw new Error('Creating a well needs a connection; the record is shared with the office.');
      const u = await currentUser();
      const row = {
        id: newId(),
        geo_well_id: geoWell.id,
        organization_id: geoWell.organization_id || u.organization_id,
        created_by: u.id,
        name: name || geoWell.name,
        header: { kb_elev_m: geoWell.kb_m ?? 0, ...header },
        survey: survey || (Array.isArray(geoWell.deviation) && geoWell.deviation.length >= 2
          ? { version: 'registry-1', method: 'minimum_curvature', stations: geoWell.deviation, source: 'geo_wells.deviation' } : null),
        settings,
        status: 'active',
      };
      if (!row.organization_id) throw new Error('The well needs an organisation; join one before creating a live well.');
      const saved = await transport.createWsWell(row);
      await db.transaction('rw', db.wells, db.members, async () => {
        await db.wells.put({ ...saved.well, sync_state: 'synced' });
        for (const m of saved.members || []) await db.members.put(m);
      });
      await persistStorage();
      notify();
      return saved.well;
    },
    async updateWellSettings(wellId, patch) {
      const w = await requireWellRow(wellId);
      await commitWellPatch(db, wellId, { settings: { ...(w.settings || {}), ...patch } });
      notify();
      return getWell(wellId);
    },
    async updateWellHeader(wellId, patch) {
      const w = await requireWellRow(wellId);
      await commitWellPatch(db, wellId, { header: { ...(w.header || {}), ...patch } });
      notify();
      return getWell(wellId);
    },
    async listMembers(wellId) { return db.members.where('well_id').equals(wellId).toArray(); },
    /** The organisation's active people, to add as members (online only). */
    async listOrgPeople(wellId) {
      const w = await requireWell(wellId);
      if (!transport.online()) throw new Error('Listing the organisation needs a connection.');
      return transport.listOrgPeople(w.organization_id);
    },
    /** Add a member, or change a member's role or status (online only; the server checks the caller is an administrator). */
    async setMember(wellId, { userId, role, status = 'active' }) {
      await requireWell(wellId);
      if (!transport.online()) throw new Error('Changing members needs a connection; membership is checked on the server.');
      const members = await db.members.where('well_id').equals(wellId).toArray();
      const refused = memberChangeError(members, { userId, role, status });
      if (refused) throw new Error(refused);
      const existing = members.find((m) => m.user_id === userId);
      const saved = existing
        ? await transport.updateMember(existing.id, { role, status })
        : await transport.insertMember({ well_id: wellId, user_id: userId, role, status });
      await db.members.put(saved);
      notify();
      return saved;
    },

    // ---- records ----
    addRecord,
    async addRecords(wellId, list) {
      const well = await requireWell(wellId);
      const u = await currentUser();
      const built = list.map((p) => buildRecord({ ...p, wellId, ctx: wellContext(well), offsetMin: offsetMinOf(well), userId: u.id }));
      for (const b of built) b.row.engine_version = WS_ENGINE_VERSION;
      await commitMany(db, built.map((b) => ({ store: 'records', row: b.row })));
      notify();
      return built;
    },
    async addVersion(prev, p) {
      const well = await requireWell(prev.well_id);
      const u = await currentUser();
      const { row, warnings } = nextVersion(prev, { ...p, ctx: wellContext(well), offsetMin: offsetMinOf(well), userId: u.id });
      row.engine_version = WS_ENGINE_VERSION;
      await commitRow(db, 'records', row);
      notify();
      return { row, warnings };
    },
    async correctObservation(prev, p) {
      const well = await requireWell(prev.well_id);
      const u = await currentUser();
      const { row, warnings } = correction(prev, { ...p, ctx: wellContext(well), offsetMin: offsetMinOf(well), userId: u.id });
      row.engine_version = WS_ENGINE_VERSION;
      await commitRow(db, 'records', row);
      notify();
      return { row, warnings };
    },
    /**
     * @param {string} wellId
     * @param {Object} [f] { kind, subtype, fromUtc, toUtc, fromMd, toMd, limit, newestFirst }
     */
    async listRecords(wellId, f = {}) {
      let coll;
      if (f.subtype) {
        coll = db.records.where('[well_id+subtype+occurred_at]').between([wellId, f.subtype, f.fromUtc || ''], [wellId, f.subtype, f.toUtc || '￿']);
      } else if (f.kind && (f.fromMd != null || f.toMd != null)) {
        coll = db.records.where('[well_id+kind+md_calc_m]').between([wellId, f.kind, f.fromMd ?? -Infinity], [wellId, f.kind, f.toMd ?? Infinity], true, true);
      } else if (f.kind) {
        coll = db.records.where('[well_id+kind+occurred_at]').between([wellId, f.kind, f.fromUtc || ''], [wellId, f.kind, f.toUtc || '￿']);
      } else {
        coll = db.records.where('[well_id+kind+occurred_at]').between([wellId, ''], [wellId, '￿']);
      }
      if (f.newestFirst) coll = coll.reverse();
      if (f.limit) coll = coll.limit(f.limit);
      let rows = await coll.toArray();
      if (!f.subtype && f.kind && f.fromUtc) rows = rows.filter((r) => r.occurred_at >= f.fromUtc);
      return rows;
    },
    async latestRecord(wellId, subtype) {
      const rows = await db.records.where('[well_id+subtype+occurred_at]').between([wellId, subtype, ''], [wellId, subtype, '￿']).reverse().limit(1).toArray();
      return rows[0] || null;
    },
    async getRecord(id) { return (await db.records.get(id)) || null; },
    /** Live query of records by subtype (the screens subscribe). */
    liveRecords(wellId, subtype) {
      return liveQuery(() => db.records.where('[well_id+subtype+occurred_at]').between([wellId, subtype, ''], [wellId, subtype, '￿']).toArray());
    },

    // ---- samples (WS3) ----
    async listSamples(wellId) { return db.samples.where('[well_id+md_calc_m]').between([wellId, -Infinity], [wellId, Infinity]).toArray(); },
    /** rows: [{ sampleNo, mdM, intervalM, programmeVersion }] */
    async addSamples(wellId, rows) {
      const well = await requireWell(wellId);
      const u = await currentUser();
      const built = rows.map((r) => buildSampleRow({ ...r, wellId, ctx: wellContext(well), offsetMin: offsetMinOf(well), userId: u.id }));
      for (const b of built) b.row.engine_version = WS_ENGINE_VERSION;
      await commitMany(db, built.map((b) => ({ store: 'samples', row: b.row })));
      notify();
      return built.map((b) => b.row);
    },
    async listStages(wellId) { return db.sample_stages.where('[well_id+at_utc]').between([wellId, ''], [wellId, '￿']).toArray(); },
    /** Records a stage; the mandatory order of the well's settings is enforced here as on the server. */
    async addStage(wellId, sampleId, stage, { note = null } = {}) {
      const well = await requireWell(wellId);
      const u = await currentUser();
      const have = await db.sample_stages.where('sample_id').equals(sampleId).toArray();
      const cfg = statusConfig({ mandatory: (well.settings && well.settings.mandatory_sample_stages) || DEFAULT_MANDATORY });
      const c = canAdvance(have, stage, cfg);
      if (!c.ok) throw new Error(c.reason);
      const { row } = buildStageRow({ wellId, sampleId, stage, note, offsetMin: offsetMinOf(well), userId: u.id });
      row.engine_version = WS_ENGINE_VERSION;
      await commitRow(db, 'sample_stages', row);
      notify();
      return row;
    },

    // ---- photos (WS4) ----
    async listPhotos(wellId, { sampleId = null } = {}) {
      const rows = await db.photos.where('[well_id+captured_at]').between([wellId, ''], [wellId, '￿']).toArray();
      return sampleId ? rows.filter((p) => p.sample_id === sampleId) : rows;
    },
    /**
     * Attach a photo: derive the variants on the device, store the row and blobs together, queue the uploads.
     * meta: { sampleId, recordId, caption, tags, depthEntry (entered), depthKind }
     */
    async addPhoto(wellId, file, meta = {}) {
      const well = await requireWell(wellId);
      const u = await currentUser();
      const keepOriginal = !!(well.settings && well.settings.keep_originals);
      const derived = await derivePhotoVariants(file, { keepOriginal });
      let depth = meta.depthEntry || null;
      let depthKind = meta.depthKind || 'lagged_sample';
      if (!depth && meta.sampleId) {
        const smp = await db.samples.get(meta.sampleId);
        if (smp) depth = { value: fromMetres(smp.md_calc_m, 'm'), unit: 'm', reference: 'MD', datum: 'KB' };
      }
      if (!depth) {
        const bit = await this.latestRecord(wellId, 'bit_depth');
        if (bit) { depth = { value: bit.depth_value, unit: bit.depth_unit, reference: bit.depth_ref, datum: bit.depth_datum }; depthKind = 'bit_depth'; }
      }
      const { row, blobs, warnings } = buildPhotoRows({
        wellId, organizationId: well.organization_id, sampleId: meta.sampleId || null, recordId: meta.recordId || null, holeSection: meta.holeSection || null,
        depth: depth ? { ...depth, kind: depthKind } : null, ctx: wellContext(well), caption: meta.caption || null, tags: meta.tags || [],
        capturedAt: meta.capturedAt || (file.lastModified ? new Date(file.lastModified).toISOString() : null), offsetMin: offsetMinOf(well), userId: u.id, derived,
      });
      row.engine_version = WS_ENGINE_VERSION;
      await commitMany(db, [{ store: 'photos', row, blobs }]);
      // a photographed sample advances when the mandatory chain allows it
      if (meta.sampleId) {
        try { await this.addStage(wellId, meta.sampleId, 'photographed'); } catch { /* the stage waits for its predecessors */ }
      }
      notify();
      return { row, warnings };
    },
    photoUrl: (photo, variant = 'thumb') => localPhotoUrl(db, photo.id, variant),

    // ---- tops and prognosis (WS5) ----
    async listTops(wellId) { return db.tops.where('[well_id+formation_key]').between([wellId, ''], [wellId, '￿']).toArray(); },
    /** p: { role, status, name, formationKey, confidence, basis, evidenceIds, unitId, depth, rangeBase } */
    async addTop(wellId, p) {
      const well = await requireWell(wellId);
      const u = await currentUser();
      const { row, warnings } = buildTopRow({ ...p, wellId, ctx: wellContext(well), offsetMin: offsetMinOf(well), userId: u.id });
      row.engine_version = WS_ENGINE_VERSION;
      await commitRow(db, 'tops', row);
      notify();
      return { row, warnings };
    },
    /** A new version on the same chain (revise, confirm, withdraw, finalise, or resolve competing heads). */
    async addTopVersion(prev, p) {
      const well = await requireWell(prev.well_id);
      const u = await currentUser();
      const { row, warnings } = buildTopRow({
        role: prev.role, name: prev.name, formationKey: prev.formation_key, unitId: prev.unit_id, ...p,
        wellId: prev.well_id, chainId: prev.chain_id, versionNo: (prev.version_no || 1) + 1, previousVersionId: prev.id,
        ctx: wellContext(well), offsetMin: offsetMinOf(well), userId: u.id,
      });
      row.engine_version = WS_ENGINE_VERSION;
      await commitRow(db, 'tops', row);
      notify();
      return { row, warnings };
    },
    async listPrognosis(wellId) { return db.prognosis.where('[well_id+version]').between([wellId, -Infinity], [wellId, Infinity]).toArray(); },
    async addPrognosis(wellId, p) {
      const well = await requireWell(wellId);
      const u = await currentUser();
      const existing = await this.listPrognosis(wellId);
      const version = existing.reduce((m, r) => Math.max(m, r.version || 0), 0) + 1;
      const { row } = buildPrognosisRow({ ...p, version, wellId, offsetMin: offsetMinOf(well), userId: u.id });
      row.engine_version = WS_ENGINE_VERSION;
      await commitRow(db, 'prognosis', row);
      notify();
      return row;
    },
    /** Online: the registry sources of a prognosis for this well. */
    async loadPrognosisSources(wellId, { offsetWellIds = [] } = {}) {
      if (!transport.online()) throw new Error('Loading the prognosis needs a connection.');
      const well = await requireWell(wellId);
      return transport.loadPrognosisSources(well.geo_well_id, { offsetWellIds });
    },
    /** Rows arriving from elsewhere (the sync engine, or a test standing in for the office): stored as synced, no outbox. */
    async _pullRows(store, rows) {
      await db[store].bulkPut(rows.map((r) => ({ ...r, sync_state: 'synced' })));
      notify();
    },

    // ---- reports and sign-off (WS7, WS8) ----
    async listReports(wellId) { return db.reports.where('[well_id+chain_id]').between([wellId, ''], [wellId, '￿']).toArray(); },
    /** A new version of the report for its kind and period (chains on `previous` when given). */
    async saveReport(wellId, params, previous = null) {
      const well = await requireWell(wellId);
      const u = await currentUser();
      const { row } = buildReportRow({ ...params, wellId, chainId: previous ? previous.chain_id : null, versionNo: previous ? (previous.version_no || 1) + 1 : 1, previousVersionId: previous ? previous.id : null, offsetMin: offsetMinOf(well), userId: u.id });
      row.engine_version = WS_ENGINE_VERSION;
      await commitRow(db, 'reports', row);
      notify();
      return row;
    },
    async listSignoffs(wellId) { return db.signoffs.where('[well_id+signed_at]').between([wellId, ''], [wellId, '￿']).toArray(); },
    /** The current user's role on the well (null when not an active member). */
    async memberRole(wellId) {
      const u = await currentUser();
      const m = (await db.members.where('well_id').equals(wellId).toArray()).find((x) => x.user_id === u.id && x.status === 'active');
      return m ? m.role : null;
    },
    async addSignoff(wellId, report, { role = null, statement }) {
      const well = await requireWell(wellId);
      const u = await currentUser();
      const r = role || (await this.memberRole(wellId));
      const { row } = buildSignoffRow({ wellId, report, role: r, statement, offsetMin: offsetMinOf(well), userId: u.id });
      row.engine_version = WS_ENGINE_VERSION;
      await commitRow(db, 'signoffs', row);
      // the platform countersigns once the row is on the server (an outbox op behind the insert)
      await db.outbox.add({ well_id: wellId, store: 'signoffs', table: 'ws_signoffs', op: 'countersign', entity_id: row.id, status: 'pending', attempts: 0, next_attempt_at: 0, last_error: null, queued_at: Date.now() });
      notify();
      return row;
    },
    /** Ask the platform to verify a countersignature (online); the client verifies offline through signClient. */
    verifyCountersign: (signoffId) => (transport.verifyCountersign ? transport.verifyCountersign(signoffId) : Promise.resolve({ valid: false, reason: 'no transport' })),

    // ---- registry publish (WS9): explicit, online, owner-only, overwrite-own ----
    /** What the registry holds for this well now (online). */
    async registryState(wellId) {
      const well = await requireWell(wellId);
      return transport.registryState(well.geo_well_id);
    },
    /**
     * Publish final calls and current descriptions (and chosen photos) to the registry.
     * @returns {{ plan, result }} result: { tops:{inserted, replaced}, intervals:{inserted, replaced}, photos:{inserted} }
     */
    /** U2-010: what a publish would do now, for the plan the user confirms (online; writes nothing). */
    async publishPlanFor(wellId) {
      if (!transport.online()) throw new Error('Publishing to the registry needs a connection.');
      const well = await requireWellRow(wellId);
      const state = await transport.registryState(well.geo_well_id);
      if (!state.ownedByMe) throw new Error('Only the owner of the registry well can publish to it (org sharing is read-only).');
      const tops = await this.listTops(wellId);
      const records = await db.records.where('[well_id+kind+occurred_at]').between([wellId, 'observation', ''], [wellId, 'observation', '\uffff']).toArray();
      const profile = mergeProfile(well.settings && well.settings.abbreviation_profile ? well.settings.abbreviation_profile : null);
      return { well, plan: publishPlan({ tops, records, profile, existingTops: state.tops, existingIntervals: state.intervals }) };
    },
    /**
     * Publish final calls and current descriptions (and chosen photos) to the registry, staged so the
     * well is never left without its tops and undone if a step fails (services/publish.js runPublish).
     * renameIds: the same-name tops from other sources to keep apart as "... (prognosis)".
     * @returns {{ plan, result }} result: { tops:{ids, replaced}, intervals:{ids, replaced}, renamed, photos:{ids, failed} }
     */
    async publishToRegistry(wellId, { photoIds = [], renameIds = [] } = {}) {
      const u = await currentUser();
      const { well, plan } = await this.publishPlanFor(wellId);
      const photos = photoIds.length ? (await this.listPhotos(wellId)).filter((p) => photoIds.includes(p.id)) : [];
      const blobs = [];
      for (const p of photos) { const b = await db.blobs.get(`${p.id}:working`); if (b && b.blob) blobs.push({ photo: p, blob: b.blob }); }
      const result = await runPublish({ plan, ops: transport.registryOps(well.geo_well_id), renameIds, photos: blobs, interpreter: u.name || u.email || null });
      if (!result.ok) { const e = new Error(publishFailureText(result)); e.report = result; throw e; }
      const pub = { id: newId(), well_id: wellId, kind: 'tops', source_ids: plan.tops.map((t) => t.source.id), target_ids: result.tops.ids || [], published_by: u.id, published_at: new Date().toISOString(), notes: `${plan.tops.length} tops, ${plan.intervals.length} intervals, ${result.photos.ids.length} photos${result.renamed.length ? `, ${result.renamed.length} earlier tops renamed as the prognosis` : ''}` };
      await db.transaction('rw', db.outbox, async () => {
        await db.outbox.add({ well_id: wellId, store: 'publications', table: 'ws_publications', op: 'insert', entity_id: pub.id, status: 'pending', attempts: 0, next_attempt_at: 0, last_error: null, queued_at: Date.now(), row: pub });
      });
      notify();
      return { plan, result };
    },

    // ---- U2-008: the d-exponent, gas, ROP and mud weight curves to the registry for Pore Pressure Studio ----
    /** Publish the evidence curves of this live well (explicit, online, registry owner only; replaces only its own). */
    async publishEvidenceToRegistry(wellId) {
      if (!transport.online()) throw new Error('Sending curves to the registry needs a connection.');
      const well = await requireWell(wellId);
      const records = await db.records.where('[well_id+kind+occurred_at]').between([wellId, ''], [wellId, '\uffff']).toArray();
      const series = mudlogSeries(records.filter((r) => r.kind === 'observation'));
      const cfgs = records.filter((r) => r.subtype === 'rig_config').sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
      const settings = currentDxcSettings(records.filter((r) => r.kind === 'decision'));
      const dxc = dExponentSeries({ points: series.points, rigConfig: cfgs.length ? cfgs[cfgs.length - 1].payload : null, ctx: wellContext(well), settings });
      const prepared = prepareEvidenceLogs({ points: series.points, dxcRows: dxc.rows, wsWell: { id: well.id, name: well.name }, settings });
      if (!prepared.length) throw new Error('There is nothing to send yet: import the mudlogging data or type at least two rows of drilling parameters.');
      const state = await transport.registryLogs(well.geo_well_id);
      if (!state.ownedByMe) throw new Error('Only the owner of the registry well can add curves to it (org sharing is read-only).');
      const stale = staleEvidence(state.logs, prepared, well.id);
      const result = await transport.writeEvidenceLogs(well.geo_well_id, prepared, stale);
      const names = prepared.map((l) => l.mnemonic);
      const { row } = await addRecord(wellId, { kind: 'observation', subtype: 'evidence_published', payload: { geo_well_id: well.geo_well_id, curves: names, replaced: result.replaced, text: `Curves sent to the well registry for Pore Pressure Studio: ${names.join(', ')}${result.replaced ? ` (${result.replaced} earlier curve(s) of this live well replaced)` : ''}.` } });
      return { curves: names, result, record: row };
    },

    // ---- U2-009: the rig survey to the shared wells registry (explicit, online, owner only) ----
    /** What sending the survey in use would do (reads only). */
    async registrySurveyPlanFor(wellId) {
      if (!transport.online()) throw new Error('Comparing with the registry needs a connection.');
      const well = await requireWellRow(wellId);
      const u = await currentUser();
      const runs = await db.records.where('[well_id+subtype+occurred_at]').between([wellId, SURVEY_SUBTYPE, ''], [wellId, SURVEY_SUBTYPE, '\uffff']).toArray();
      const registryWell = await transport.registryWell(well.geo_well_id);
      return { well, plan: registrySurveyPlan({ well, inUse: activeSurvey(well, runs), registryWell, user: u }) };
    },
    /** Replace the registry survey with the survey in use and record that it was sent. */
    async publishSurveyToRegistry(wellId) {
      const { well, plan } = await this.registrySurveyPlanFor(wellId);
      if (!plan.can) throw new Error(plan.reason);
      const res = await transport.writeRegistrySurvey(well.geo_well_id, { stations: plan.stations, provenance: plan.provenance });
      const { row } = await addRecord(wellId, surveyPublishedParams(plan, well.geo_well_id));
      return { plan, result: res, record: row };
    },

    // ---- office view (U2-007): read-only follow of the wells this user can see ----
    /** Everything the office summary reads for a well, from the local store. Writes nothing. */
    async wellSnapshot(wellId) {
      const well = await requireWellRow(wellId);
      const [records, samples, stages, tops, prognoses, reports, signoffs, follow] = await Promise.all([
        db.records.where('[well_id+kind+occurred_at]').between([wellId, ''], [wellId, '\uffff']).toArray(),
        this.listSamples(wellId), this.listStages(wellId), this.listTops(wellId), this.listPrognosis(wellId), this.listReports(wellId), this.listSignoffs(wellId),
        db.meta.get(`follow:${wellId}`),
      ]);
      return { well, records, samples, stages, tops, prognoses, reports, signoffs, follow: follow ? follow.value : null };
    },
    /**
     * Bring in what the rig has shared for a well (pull only; nothing of this device is pushed and
     * no record is written). The outcome is kept so the screen can say when a well was last followed
     * and whether that try worked.
     */
    async followWell(wellId) {
      const atUtc = new Date().toISOString();
      let value;
      if (!transport.online()) value = { atUtc: null, error: null, received: 0, offline: true };
      else {
        try { const r = await pullWell({ db, transport, wellId }); value = { atUtc, error: null, received: r.received }; }
        catch (e) { const prev = await db.meta.get(`follow:${wellId}`); value = { atUtc: prev && prev.value ? prev.value.atUtc : atUtc, error: String(e && e.message ? e.message : e), received: 0 }; }
      }
      if (!value.offline) await db.meta.put({ key: `follow:${wellId}`, value });
      return value;
    },

    // ---- sync surface (WS6) ----
    /** The well the engine pushes and pulls for; starts the engine on first use. */
    setCurrentWell(wellId) {
      const changed = wellId !== currentWellId;
      currentWellId = wellId || null;
      if (autoSync) { engine.start(); if (changed) engine.flush('well'); }
      else engine.refreshCounts(currentWellId).catch(() => {});
    },
    async syncStatus(wellId) {
      await engine.refreshCounts(wellId || currentWellId);
      const st = getSyncState();
      const pending = wellId ? await pendingCount(db, wellId) : st.pending;
      return { ...st, pending, ...syncHeadline({ ...st, pending }), lastSyncUtc: st.lastSyncUtc };
    },
    /** Fires on every local commit and whenever a sync cycle completed (new rows may have arrived), not on every counter tick. */
    subscribeSync(cb) {
      listeners.add(cb);
      let lastSync = getSyncState().lastSyncUtc;
      const off = subscribeSyncState((st) => { if (st.lastSyncUtc !== lastSync) { lastSync = st.lastSyncUtc; cb(); } });
      return () => { listeners.delete(cb); off(); };
    },
    flush: (reason) => engine.flush(reason),
    retryRejected: (wellId) => engine.retryRejected(wellId || currentWellId),
    detectConflicts: (wellId) => detectConflicts(db, wellId || currentWellId),
    listConflicts: (wellId) => db.conflicts.where('well_id').equals(wellId || currentWellId).toArray(),
    stopSync: () => engine.stop(),
    engine,
    async storageInfo() { return storageEstimate(); },
    notify,
    RecordError,
  };
}
