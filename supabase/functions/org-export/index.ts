// org-export: self-service organization data export (offboarding phase 1).
//
// Actions (POST { action, ... }, caller must be an active admin-role member of
// the organization, or a platform super admin):
//   request    { organization_id }
//     Dumps every org-scoped table (catalog-driven, same discovery as
//     admin_purge_test_orgs), member-owned user-scoped tables, then walks the
//     FK graph so descendant tables with neither organization_id nor user_id
//     (e.g. geo_wells_logs) are included. Verifies org-scoped row counts,
//     zips JSON per table + manifest, uploads to the private org-exports
//     bucket, records an org_export_jobs row, emails the requester.
//     Storage blobs (seismic bricks, log curves) are NOT zipped: they are
//     inventoried in manifest.json and downloaded via sign_blobs.
//   download   { job_id, target: 'zip' | 'manifest' }
//     Mints a fresh 60-minute signed URL. Nothing durable is ever stored or
//     emailed as a URL.
//   sign_blobs { organization_id, paths: [{ bucket, path }] }
//     Signed URLs for up to 200 storage objects from the manifest. A path is
//     signable when its bucket is one of the export buckets and its first
//     folder segment is a member of the caller's organization (blobs are
//     foldered by user id, not org id; membership is the tenancy proof).
//
// Exports expire after 7 days; expired zips are removed opportunistically on
// each request. Known limitation (documented in OrgDataExport-STATUS.md): the
// zip is built in memory in one invocation, which is fine for current org
// sizes; very large orgs will need a chunked/background follow-up.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { zipSync, strToU8 } from 'https://esm.sh/fflate@0.8.2';
import { corsHeaders } from './cors.ts';
import { sendEmail } from '../_shared/email.ts';
import {
  EXPORT_BUCKETS,
  buildReadme,
  chunk,
  collectStorageTargets,
  createRowStore,
  filterUserRowsForOrg,
  mergeRows,
  safeSegment,
  storedIds,
  tableCounts,
  totalBlobBytes,
  verifyCounts,
} from './helpers.js';

const SUPER_ADMIN_EMAILS = ['info@petrolord.com', 'ayoasaolu@gmail.com', 'ayodejiasaolu1@gmail.com', 'support@petrolord.com'];
const ADMIN_ROLES = ['owner', 'admin', 'org_admin', 'super_admin'];

const BUCKET = 'org-exports';
const PAGE = 1000;
const MAX_PAGES_PER_DUMP = 500;        // 500k rows per (table, column) query
const SWEEP_MAX_PASSES = 8;
const PARENT_BATCH = 200;
const STORAGE_ENUM_CAP = 25000;
const SIGN_BLOBS_MAX = 200;
const EXPIRES_DAYS = 7;
const SIGNED_URL_SECONDS = 3600;

type Catalog = Map<string, { table_name: string; pk_column: string | null; org_column: string | null; user_column: string | null }>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    const caller = authData?.user ?? null;
    if (authError || !caller) return json({ error: 'Unauthorized: invalid or expired session.' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'request') {
      const orgId = String(body.organization_id || '');
      if (!orgId) return json({ error: 'organization_id is required.' }, 400);
      if (!(await isOrgAdmin(admin, caller, orgId))) {
        return json({ error: 'Only organization admins can export organization data.' }, 403);
      }

      await cleanupExpired(admin);

      // One export at a time per org; a processing job younger than 15 minutes
      // blocks a second one (older ones are treated as crashed and failed out).
      const { data: running } = await admin.from('org_export_jobs')
        .select('id, created_at').eq('organization_id', orgId).eq('status', 'processing');
      const cutoff = Date.now() - 15 * 60 * 1000;
      for (const j of running ?? []) {
        if (new Date(j.created_at).getTime() >= cutoff) {
          return json({ error: 'An export is already running for this organization. Try again in a few minutes.' }, 409);
        }
        await admin.from('org_export_jobs')
          .update({ status: 'failed', error_message: 'Timed out (superseded by a newer export request).' })
          .eq('id', j.id);
      }

      const { data: orgRow } = await admin.from('organizations').select('name').eq('id', orgId).maybeSingle();
      if (!orgRow) return json({ error: 'Organization not found.' }, 404);

      const { data: job, error: jobError } = await admin.from('org_export_jobs')
        .insert({ organization_id: orgId, requested_by: caller.id, status: 'processing' })
        .select().single();
      if (jobError || !job) return json({ error: `Could not create export job: ${jobError?.message}` }, 500);

      try {
        const result = await runExport(admin, job.id, orgId, orgRow.name || 'organization');
        const expiresAt = new Date(Date.now() + EXPIRES_DAYS * 24 * 3600 * 1000).toISOString();
        await admin.from('org_export_jobs').update({
          status: 'completed',
          table_counts: result.counts,
          total_rows: result.rowTotal,
          blob_count: result.blobCount,
          blob_bytes: result.blobBytes,
          file_path: result.zipPath,
          manifest_path: result.manifestPath,
          completed_at: new Date().toISOString(),
          expires_at: expiresAt,
        }).eq('id', job.id);

        if (caller.email) {
          const emailSent = await sendEmail({
            to: caller.email,
            subject: `Your ${orgRow.name || 'organization'} data export is ready`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                <h2 style="color: #111827;">Data export ready</h2>
                <p style="color: #4b5563;">The data export you requested for <strong>${orgRow.name || 'your organization'}</strong> is ready.</p>
                <p style="color: #4b5563;">Sign in to Petrolord and open <strong>Dashboard &rarr; Data Export</strong> to download it. It contains ${result.rowTotal} database records across ${Object.keys(result.counts).length} tables, plus a manifest of ${result.blobCount} stored files.</p>
                <p style="color: #9ca3af; font-size: 12px;">For security this email contains no download link. The export is available for ${EXPIRES_DAYS} days.</p>
              </div>`,
            logPrefix: '[org-export]',
          });
          console.log(`[org-export] completion email to ${caller.email}: ${emailSent}`);
        }

        console.log(`[org-export] ${caller.email} exported org ${orgId}: ${result.rowTotal} rows, ${result.blobCount} blobs`);
        return json({
          success: true,
          job_id: job.id,
          tables: Object.keys(result.counts).length,
          total_rows: result.rowTotal,
          blob_count: result.blobCount,
        });
      } catch (e) {
        const message = (e as Error).message;
        console.error(`[org-export] job ${job.id} failed:`, message);
        await admin.from('org_export_jobs')
          .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
          .eq('id', job.id);
        return json({ error: `Export failed: ${message}` }, 500);
      }
    }

    if (action === 'download') {
      const jobId = String(body.job_id || '');
      const target = body.target === 'manifest' ? 'manifest_path' : 'file_path';
      if (!jobId) return json({ error: 'job_id is required.' }, 400);
      const { data: job } = await admin.from('org_export_jobs').select('*').eq('id', jobId).maybeSingle();
      if (!job) return json({ error: 'Export job not found.' }, 404);
      if (!(await isOrgAdmin(admin, caller, job.organization_id))) {
        return json({ error: 'Only organization admins can download exports.' }, 403);
      }
      if (job.status !== 'completed' || !job[target]) return json({ error: 'This export is not available.' }, 404);
      if (job.expires_at && new Date(job.expires_at).getTime() < Date.now()) {
        return json({ error: 'This export has expired. Request a new one.' }, 410);
      }
      const { data: signed, error: signError } = await admin.storage.from(BUCKET)
        .createSignedUrl(job[target], SIGNED_URL_SECONDS, target === 'file_path'
          ? { download: `petrolord-export-${jobId.slice(0, 8)}.zip` }
          : undefined);
      if (signError || !signed?.signedUrl) return json({ error: `Could not create download link: ${signError?.message}` }, 500);
      return json({ url: signed.signedUrl, expires_in: SIGNED_URL_SECONDS });
    }

    if (action === 'sign_blobs') {
      const orgId = String(body.organization_id || '');
      const paths = Array.isArray(body.paths) ? body.paths.slice(0, SIGN_BLOBS_MAX) : [];
      if (!orgId || !paths.length) return json({ error: 'organization_id and paths are required.' }, 400);
      if (!(await isOrgAdmin(admin, caller, orgId))) {
        return json({ error: 'Only organization admins can download organization files.' }, 403);
      }
      const { data: memberRows } = await admin.from('organization_members')
        .select('user_id').eq('organization_id', orgId);
      const memberIds = new Set((memberRows ?? []).map((m) => m.user_id).filter(Boolean));

      const byBucket = new Map<string, string[]>();
      const results: Array<{ bucket: string; path: string; url?: string; error?: string }> = [];
      for (const p of paths) {
        const bucket = String(p?.bucket || '');
        const path = String(p?.path || '').replace(/^\/+/, '');
        if (!EXPORT_BUCKETS.includes(bucket)) {
          results.push({ bucket, path, error: 'Bucket is not part of exports.' });
          continue;
        }
        const owner = path.split('/')[0];
        if (!owner || !memberIds.has(owner)) {
          results.push({ bucket, path, error: 'File does not belong to a member of this organization.' });
          continue;
        }
        if (!byBucket.has(bucket)) byBucket.set(bucket, []);
        byBucket.get(bucket)!.push(path);
      }
      for (const [bucket, bucketPaths] of byBucket) {
        const { data: signed, error: signError } = await admin.storage.from(bucket)
          .createSignedUrls(bucketPaths, SIGNED_URL_SECONDS);
        if (signError || !signed) {
          for (const path of bucketPaths) results.push({ bucket, path, error: signError?.message || 'signing failed' });
          continue;
        }
        for (const s of signed) {
          results.push({ bucket, path: s.path ?? '', url: s.signedUrl ?? undefined, error: s.error ?? undefined });
        }
      }
      return json({ results, expires_in: SIGNED_URL_SECONDS });
    }

    return json({ error: `Unknown action '${action}'.` }, 400);
  } catch (error) {
    console.error('[org-export] Unhandled:', (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Active admin-role member of the org, or platform super admin
// (invite-employee pattern).
async function isOrgAdmin(admin: ReturnType<typeof createClient>, caller: { id: string; email?: string; user_metadata?: Record<string, unknown> }, orgId: string): Promise<boolean> {
  const { data: rows } = await admin.from('organization_members')
    .select('role, status').eq('organization_id', orgId).eq('user_id', caller.id);
  const isAdmin = (rows ?? []).some((m) =>
    (m.status ?? 'active').toLowerCase() === 'active' && ADMIN_ROLES.includes(m.role));
  if (isAdmin) return true;
  if (caller.user_metadata?.is_super_admin === true) return true;
  if (SUPER_ADMIN_EMAILS.includes(String(caller.email || '').toLowerCase())) return true;
  const { data: urow } = await admin.from('users').select('is_super_admin').eq('id', caller.id).maybeSingle();
  return urow?.is_super_admin === true;
}

async function dumpAll(admin: ReturnType<typeof createClient>, table: string, column: string, ids: string[]): Promise<Record<string, unknown>[]> {
  if (!ids.length) return [];
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < MAX_PAGES_PER_DUMP; page++) {
    const { data, error } = await admin.rpc('export_dump_rows', {
      p_table: table, p_column: column, p_ids: ids, p_offset: page * PAGE, p_limit: PAGE,
    });
    if (error) throw new Error(`dump of ${table}.${column} failed: ${error.message}`);
    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
  throw new Error(`dump of ${table}.${column} exceeded ${MAX_PAGES_PER_DUMP * PAGE} rows; export aborted rather than truncated.`);
}

async function runExport(admin: ReturnType<typeof createClient>, jobId: string, orgId: string, orgName: string) {
  const notes: string[] = [];

  const { data: catalogData, error: catError } = await admin.rpc('export_table_catalog');
  if (catError) throw new Error(`table catalog failed: ${catError.message}`);
  const { data: edges, error: edgeError } = await admin.rpc('export_fk_edges');
  if (edgeError) throw new Error(`fk graph failed: ${edgeError.message}`);
  const catalog: Catalog = new Map((catalogData ?? []).map((r: { table_name: string }) => [r.table_name, r]));

  const store = createRowStore();
  const seedTallies: Array<{ table: string; column: string; rows: number }> = [];

  // The organization row itself, then membership (drives the user-scoped pass).
  mergeRows(store, 'organizations', await dumpAll(admin, 'organizations', 'id', [orgId]), 'id');
  const memberRows = await dumpAll(admin, 'organization_members', 'organization_id', [orgId]);
  mergeRows(store, 'organization_members', memberRows, catalog.get('organization_members')?.pk_column ?? 'id');
  seedTallies.push({ table: 'organization_members', column: 'organization_id', rows: memberRows.length });
  const memberIds = [...new Set(memberRows.map((r) => r.user_id).filter(Boolean))] as string[];

  // Pass 1: every org-scoped table.
  for (const t of catalog.values()) {
    if (!t.org_column || t.table_name === 'organization_members') continue;
    const rows = await dumpAll(admin, t.table_name, t.org_column, [orgId]);
    mergeRows(store, t.table_name, rows, t.pk_column);
    seedTallies.push({ table: t.table_name, column: t.org_column, rows: rows.length });
  }

  // Pass 2: user-scoped tables for every member (private wells, seismic
  // projects, etc.). Overlap with pass 1 is deduplicated by primary key, and
  // rows scoped to ANOTHER org (two-org members) are dropped.
  if (memberIds.length) {
    for (const t of catalog.values()) {
      if (!t.user_column) continue;
      const rows = await dumpAll(admin, t.table_name, t.user_column, memberIds);
      mergeRows(store, t.table_name, filterUserRowsForOrg(rows, t.org_column, orgId), t.pk_column);
    }
  }

  // Verification: independently recount every org-scoped table and fail the
  // job on any drift (validation-first; a mismatch means data changed
  // mid-export and the archive would be internally inconsistent).
  const recounts: Record<string, number> = {};
  for (const t of seedTallies) {
    const { data: c, error } = await admin.rpc('export_count_rows', {
      p_table: t.table, p_column: t.column, p_ids: [orgId],
    });
    if (error) throw new Error(`recount of ${t.table} failed: ${error.message}`);
    recounts[`${t.table}:${t.column}`] = Number(c);
  }
  const mismatches = verifyCounts(seedTallies, recounts);
  if (mismatches.length) {
    throw new Error(`row counts changed during export (${mismatches.map((m) => m.table).join(', ')}); request the export again.`);
  }

  // Pass 3: descendant sweep. Follow single-column FKs from rows we already
  // hold to child tables that carry neither organization_id nor user_id
  // (geo_wells_logs -> geo_wells and the like), to a fixpoint.
  const processed = new Map<string, Set<string>>();
  for (let pass = 1; pass <= SWEEP_MAX_PASSES; pass++) {
    let newRows = 0;
    for (const e of (edges ?? []) as Array<{ child_table: string; child_column: string; parent_table: string; parent_column: string }>) {
      const parentCat = catalog.get(e.parent_table);
      const childCat = catalog.get(e.child_table);
      if (!parentCat || !childCat) continue;
      if (parentCat.pk_column !== e.parent_column) continue;
      // Only descend into tables with no scoping of their own. Scoped tables
      // were fully covered by passes 1-2, and following FK edges into them
      // could drag in another org's rows via members who belong to two orgs.
      if (childCat.org_column || childCat.user_column) continue;
      if (e.child_table === e.parent_table && e.child_column === e.parent_column) continue;
      const parentIds = storedIds(store, e.parent_table);
      if (!parentIds.length) continue;
      const key = `${e.child_table}.${e.child_column}->${e.parent_table}`;
      let done = processed.get(key);
      if (!done) { done = new Set(); processed.set(key, done); }
      const fresh = parentIds.filter((id) => !done.has(id));
      for (const batch of chunk(fresh, PARENT_BATCH)) {
        const rows = await dumpAll(admin, e.child_table, e.child_column, batch);
        newRows += mergeRows(store, e.child_table, rows, childCat.pk_column);
        for (const id of batch) done.add(id);
      }
    }
    if (!newRows) break;
    if (pass === SWEEP_MAX_PASSES) {
      notes.push(`Relationship sweep stopped after ${SWEEP_MAX_PASSES} passes; rows nested deeper than that are not included.`);
    }
  }

  // Storage inventory: enumerate volume prefixes (brick pyramids), then fetch
  // sizes for single-object pointers one folder listing at a time.
  const { objects, prefixes } = collectStorageTargets(store);
  const storageEntries: Array<Record<string, unknown>> = [];
  let truncated = false;
  for (const p of prefixes) {
    if (storageEntries.length >= STORAGE_ENUM_CAP) { truncated = true; break; }
    await walkStorage(admin, p, storageEntries, STORAGE_ENUM_CAP);
  }
  if (truncated) notes.push(`Storage listing capped at ${STORAGE_ENUM_CAP} objects; remaining objects live under the prefixes already listed.`);

  const folders = new Map<string, { bucket: string; folder: string; items: typeof objects }>();
  for (const o of objects) {
    const idx = o.path.lastIndexOf('/');
    const folder = idx >= 0 ? o.path.slice(0, idx) : '';
    const key = `${o.bucket}:${folder}`;
    if (!folders.has(key)) folders.set(key, { bucket: o.bucket, folder, items: [] });
    folders.get(key)!.items.push(o);
  }
  if (folders.size <= 500) {
    for (const f of folders.values()) {
      const { data: listing } = await admin.storage.from(f.bucket).list(f.folder, { limit: 1000 });
      const sizeByName = new Map((listing ?? []).filter((i) => i.id).map((i) => [i.name, i.metadata?.size ?? null]));
      for (const o of f.items) {
        const name = o.path.slice(o.path.lastIndexOf('/') + 1);
        storageEntries.push({ ...o, size: sizeByName.get(name) ?? null });
      }
    }
  } else {
    for (const o of objects) storageEntries.push({ ...o, size: null });
    notes.push('File sizes omitted for single files (too many folders to enumerate).');
  }

  // Assemble and upload the archive.
  const counts = tableCounts(store);
  const rowTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const blobBytes = totalBlobBytes(storageEntries as Array<{ size?: number }>);
  const generatedAt = new Date().toISOString();
  const manifest = {
    export_version: 1,
    job_id: jobId,
    organization: { id: orgId, name: orgName },
    generated_at: generatedAt,
    tables: counts,
    total_rows: rowTotal,
    verification: { org_scoped_tables_checked: seedTallies.length, status: 'passed' },
    storage: { entries: storageEntries, total_bytes: blobBytes, truncated },
    notes,
  };
  const readme = buildReadme({
    orgName, jobId, generatedAt,
    tableCount: Object.keys(counts).length, rowTotal,
    blobCount: storageEntries.length, notes,
  });

  const files: Record<string, Uint8Array> = {
    'README.txt': strToU8(readme),
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
  };
  for (const [table, entry] of store) {
    if (entry.rows.length) files[`data/${safeSegment(table)}.json`] = strToU8(JSON.stringify(entry.rows));
  }
  const zipBytes = zipSync(files, { level: 3 });

  const zipPath = `${orgId}/${jobId}.zip`;
  const manifestPath = `${orgId}/${jobId}.manifest.json`;
  const { error: zipUpError } = await admin.storage.from(BUCKET)
    .upload(zipPath, zipBytes, { contentType: 'application/zip', upsert: true });
  if (zipUpError) throw new Error(`archive upload failed: ${zipUpError.message}`);
  const { error: manUpError } = await admin.storage.from(BUCKET)
    .upload(manifestPath, strToU8(JSON.stringify(manifest, null, 2)), { contentType: 'application/json', upsert: true });
  if (manUpError) throw new Error(`manifest upload failed: ${manUpError.message}`);

  return { counts, rowTotal, blobCount: storageEntries.length, blobBytes, zipPath, manifestPath };
}

async function walkStorage(
  admin: ReturnType<typeof createClient>,
  target: { bucket: string; path: string; source_table: string; source_id: unknown; owner_user_id: string | null },
  out: Array<Record<string, unknown>>,
  cap: number,
) {
  let offset = 0;
  while (out.length < cap) {
    const { data, error } = await admin.storage.from(target.bucket).list(target.path, { limit: 1000, offset });
    if (error) throw new Error(`storage listing of ${target.bucket}/${target.path} failed: ${error.message}`);
    if (!data?.length) break;
    for (const item of data) {
      if (out.length >= cap) return;
      if (!item.id) {
        await walkStorage(admin, { ...target, path: `${target.path}/${item.name}` }, out, cap);
      } else {
        out.push({
          bucket: target.bucket,
          path: `${target.path}/${item.name}`,
          size: item.metadata?.size ?? null,
          source_table: target.source_table,
          source_id: target.source_id,
          owner_user_id: target.owner_user_id,
        });
      }
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
}

async function cleanupExpired(admin: ReturnType<typeof createClient>) {
  try {
    const { data: expired } = await admin.from('org_export_jobs')
      .select('id, file_path, manifest_path')
      .eq('status', 'completed')
      .not('file_path', 'is', null)
      .lt('expires_at', new Date().toISOString())
      .limit(20);
    if (!expired?.length) return;
    const paths = expired.flatMap((j) => [j.file_path, j.manifest_path]).filter(Boolean) as string[];
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
    await admin.from('org_export_jobs')
      .update({ file_path: null, manifest_path: null })
      .in('id', expired.map((j) => j.id));
    console.log(`[org-export] cleaned up ${expired.length} expired export(s)`);
  } catch (e) {
    console.warn('[org-export] expired-export cleanup failed:', (e as Error).message);
  }
}
