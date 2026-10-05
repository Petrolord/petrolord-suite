// qi-upload-url: resumable multipart uploads of large seismic files straight
// from the browser to the seismic worker's S3 store (QI programme Q0,
// docs/scope/QI-PLAN.md). The browser never holds a storage key: it asks this
// function for presigned part URLs, PUTs the bytes, and asks it to complete.
//
// POST JSON, signed in (Authorization: Bearer <user JWT>):
//   { action: 'start', filename, bytes, name?, organization_id?, fingerprint? }
//        -> { dataset_id, part_size, part_count, resumed? }
//        (with a fingerprint, the user's unfinished upload of the same file
//        is returned with resumed: true, from any browser)
//   { action: 'sign', dataset_id, part_numbers: [..<=100] } -> { urls: { n: url } }
//   { action: 'parts', dataset_id } -> { parts: [{ partNumber, size, etag }] }   (resume)
//   { action: 'complete', dataset_id } -> { dataset }
//   { action: 'abort', dataset_id } -> { ok: true }
//
// Status codes: 200; 400 bad request; 401 not signed in; 403 not yours or not
// an organization member; 404 no such upload; 409 wrong state or incomplete;
// 413 over the storage allowance; 502 the store failed; 503 not configured.
//
// Secrets: QI_S3_ENDPOINT (https://storage.petrolord.com), QI_S3_ACCESS_KEY_ID,
// QI_S3_SECRET_ACCESS_KEY (the store's `uploader` identity: seismic-raw only),
// QI_S3_BUCKET (default seismic-raw), QI_S3_REGION (default us-east-1),
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Deploy (owner), after migration 20261005130000: supabase functions deploy qi-upload-url

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';
import {
  URL_TTL_S, USER_RAW_QUOTA_BYTES, presignUrl, partPlan, objectKeyFor, validateStart,
  validatePartNumbers, parseUploadId, parseListParts, completeXml, checkPartsComplete,
} from './logic.ts';

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);

  const env = (k: string, d = '') => Deno.env.get(k) ?? d;
  const s3 = {
    endpoint: env('QI_S3_ENDPOINT').replace(/\/+$/, ''),
    accessKeyId: env('QI_S3_ACCESS_KEY_ID'),
    secretAccessKey: env('QI_S3_SECRET_ACCESS_KEY'),
    bucket: env('QI_S3_BUCKET', 'seismic-raw'),
    region: env('QI_S3_REGION', 'us-east-1'),
  };
  const url = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!s3.endpoint || !s3.accessKeyId || !s3.secretAccessKey || !url || !anonKey || !serviceKey) {
    return json({ error: 'Large-file upload is not configured on this server yet.' }, 503);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: 'Sign in to upload.' }, 401);
  const admin = createClient(url, serviceKey);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Send a JSON body.' }, 400); }
  const action = String(body.action ?? '');

  const sign = (method: string, key: string, query: Record<string, string> = {}) =>
    presignUrl({ ...s3, method, key, query, expires: URL_TTL_S, now: new Date() });

  async function loadOwned(status?: string) {
    const id = String(body.dataset_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: json({ error: 'dataset_id is required.' }, 400) };
    const { data: row, error } = await admin.from('qi_datasets').select('*').eq('id', id).maybeSingle();
    if (error) return { error: json({ error: 'Could not read the upload.' }, 502) };
    if (!row) return { error: json({ error: 'No such upload.' }, 404) };
    if (row.user_id !== user!.id) return { error: json({ error: 'This upload belongs to someone else.' }, 403) };
    if (status && row.status !== status) return { error: json({ error: `This upload is ${row.status}.` }, 409) };
    return { row };
  }

  async function listAllParts(key: string, uploadId: string) {
    const all: { partNumber: number; etag: string; size: number }[] = [];
    let marker: string | null = null;
    for (let guard = 0; guard < 20; guard += 1) {
      const q: Record<string, string> = { uploadId, 'max-parts': '1000' };
      if (marker) q['part-number-marker'] = marker;
      const r = await fetch(await sign('GET', key, q));
      if (!r.ok) throw new Error(`list parts ${r.status}`);
      const page = parseListParts(await r.text());
      all.push(...page.parts);
      if (!page.truncated || !page.nextMarker) break;
      marker = page.nextMarker;
    }
    return all;
  }

  try {
    if (action === 'start') {
      const v = validateStart(body);
      if (!v.ok) return json({ error: v.error }, 400);
      const { filename, bytes, name, organization_id, fingerprint } = v.value;
      if (organization_id) {
        const { data: member } = await userClient.rpc('is_org_member', { org_id: organization_id });
        if (member !== true) return json({ error: 'You are not a member of that organization.' }, 403);
      }
      // Resume across browsers and computers: this user's unfinished upload of
      // the same file (same size and content fingerprint) carries on instead of
      // a second upload starting. The caller then asks for 'parts'.
      if (fingerprint) {
        const { data: open } = await admin.from('qi_datasets').select('id,part_size,part_count,upload_id')
          .eq('user_id', user.id).eq('status', 'uploading').eq('bytes', bytes)
          .eq('meta->fingerprint->>hash', fingerprint.hash)
          .order('created_at', { ascending: false }).limit(1);
        const hit = open && open[0];
        if (hit && hit.upload_id) {
          return json({ dataset_id: hit.id, part_size: hit.part_size, part_count: hit.part_count, resumed: true });
        }
      }
      const { data: used, error: qErr } = await admin.rpc('qi_user_storage_bytes', { p_user_id: user.id });
      if (qErr) return json({ error: 'Could not check your storage allowance.' }, 502);
      if (Number(used) + bytes > USER_RAW_QUOTA_BYTES) {
        return json({ error: `This upload would take you past your ${USER_RAW_QUOTA_BYTES / 1024 ** 3} GiB allowance in the worker store.` }, 413);
      }
      const id = crypto.randomUUID();
      const key = objectKeyFor(user.id, id, filename);
      const { partSize, parts } = partPlan(bytes);
      const init = await fetch(await sign('POST', key, { uploads: '' }), { method: 'POST' });
      const uploadId = init.ok ? parseUploadId(await init.text()) : null;
      if (!uploadId) return json({ error: `The store refused to start the upload (${init.status}).` }, 502);
      const { error: insErr } = await admin.from('qi_datasets').insert({
        id, user_id: user.id, organization_id, name, kind: 'segy_upload', status: 'uploading',
        original_filename: filename.slice(0, 500), bucket: s3.bucket, object_key: key,
        bytes, part_size: partSize, part_count: parts, upload_id: uploadId,
        meta: fingerprint ? { fingerprint } : {},
      });
      if (insErr) {
        await fetch(await sign('DELETE', key, { uploadId }), { method: 'DELETE' });
        return json({ error: 'Could not register the upload.' }, 502);
      }
      return json({ dataset_id: id, part_size: partSize, part_count: parts });
    }

    if (action === 'sign') {
      const { row, error } = await loadOwned('uploading');
      if (error) return error;
      const nums = validatePartNumbers(body.part_numbers, row.part_count);
      if (typeof nums === 'string') return json({ error: nums }, 400);
      const urls: Record<number, string> = {};
      for (const n of nums) urls[n] = await sign('PUT', row.object_key, { partNumber: String(n), uploadId: row.upload_id });
      return json({ urls, expires_in: URL_TTL_S });
    }

    if (action === 'parts') {
      const { row, error } = await loadOwned('uploading');
      if (error) return error;
      return json({ parts: await listAllParts(row.object_key, row.upload_id), part_count: row.part_count, part_size: row.part_size });
    }

    if (action === 'complete') {
      const { row, error } = await loadOwned('uploading');
      if (error) return error;
      const parts = await listAllParts(row.object_key, row.upload_id);
      const problem = checkPartsComplete(parts, Number(row.bytes));
      if (problem) return json({ error: problem, parts }, 409);
      const done = await fetch(await sign('POST', row.object_key, { uploadId: row.upload_id }), { method: 'POST', body: completeXml(parts) });
      const doneText = await done.text();
      if (!done.ok || !doneText.includes('CompleteMultipartUploadResult')) {
        return json({ error: `The store could not assemble the file (${done.status}).` }, 502);
      }
      const head = await fetch(await sign('HEAD', row.object_key), { method: 'HEAD' });
      const size = Number(head.headers.get('content-length'));
      if (!head.ok || size !== Number(row.bytes)) {
        await admin.from('qi_datasets').update({ status: 'failed', meta: { ...row.meta, failure: `size ${size} vs ${row.bytes}` } }).eq('id', row.id);
        return json({ error: `The assembled file is ${size} bytes; expected ${row.bytes}.` }, 502);
      }
      const { data: updated, error: upErr } = await admin.from('qi_datasets')
        .update({ status: 'uploaded', uploaded_at: new Date().toISOString(), upload_id: null })
        .eq('id', row.id).select('*').single();
      if (upErr) return json({ error: 'The file is stored but could not be marked complete. Try complete again.' }, 502);
      return json({ dataset: updated });
    }

    if (action === 'abort') {
      const { row, error } = await loadOwned('uploading');
      if (error) return error;
      await fetch(await sign('DELETE', row.object_key, { uploadId: row.upload_id }), { method: 'DELETE' });
      await admin.from('qi_datasets').update({ status: 'deleted', upload_id: null }).eq('id', row.id);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: `The upload service failed: ${(e as Error).message}` }, 502);
  }
});
