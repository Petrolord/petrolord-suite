// pld-sign: signatures and Certificates of Export for .pld packages
// (Project Portability PP5, docs/scope/ProjectPortability-PLAN.md §4.7).
//
// Actions (POST JSON { action, ... }):
//   sign               caller JWT required. Body: { manifest, exporter_email?, organization_name? }.
//                      Canonicalises the manifest (helpers.canonicalJson, byte-identical
//                      to the SPA), signs its bytes with ECDSA P-256 / SHA-256 using
//                      the private JWK in PLD_SIGNING_PRIVATE_JWK, records the export in
//                      pld_exports (certificate number PLD-EX-<year>-<id8>, a
//                      verification code), renders the Certificate of Export PDF into
//                      the private org-exports bucket, and returns
//                      { signature: { alg, key_id, value }, certificate: { certificate_no,
//                        verification_code, download_url } }.
//                      When the signing secret is not configured the response is
//                      { signature: null, reason: 'unconfigured' } and nothing is recorded:
//                      the package stays unsigned and the SPA says so.
//   certificate        caller JWT required. Body: { package_id }. A fresh signed URL for
//                      the caller's own certificate PDF.
//   verify_certificate public. Body: { certificate_no, verification_code, download? }.
//                      { valid, certificate: fields } plus a signed URL when asked.
//
// Conventions follow org-offboard: per-function cors.ts, pure helpers.js,
// service-role client after our own auth check, pdf-lib 1.17.1.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from './cors.ts';
import { canonicalJson, makeExportCertificateNo, buildExportCertificateFields, manifestLooksSane } from './helpers.js';
import { renderExportCertificatePdf } from './certificate.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://petrolord.com';
const PRIVATE_JWK = Deno.env.get('PLD_SIGNING_PRIVATE_JWK') ?? '';
const KEY_ID = Deno.env.get('PLD_SIGNING_KEY_ID') ?? '';
const BUCKET = 'org-exports';
const SIGNATURE_ALG = 'ECDSA-P256-SHA256';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const bad = (message: string, status = 400) => json({ error: message }, status);

const b64 = (u8: Uint8Array) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

async function signBytes(bytes: Uint8Array): Promise<string> {
  const jwk = JSON.parse(PRIVATE_JWK);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const raw = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes);
  return b64(new Uint8Array(raw));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return bad('POST only', 405);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  // ---- public ----
  if (action === 'verify_certificate') {
    const no = String(body.certificate_no || '').trim().toUpperCase();
    const code = String(body.verification_code || '').trim();
    if (!no || !code) return bad('certificate_no and verification_code are required');
    const { data: row } = await admin.from('pld_exports').select('*').eq('certificate_no', no).maybeSingle();
    if (!row || row.verification_code !== code) return json({ valid: false });
    const out: Record<string, unknown> = { valid: true, certificate: buildExportCertificateFields(row) };
    if (body.download && row.certificate_path) {
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(row.certificate_path, 600);
      if (signed?.signedUrl) out.download_url = signed.signedUrl;
    }
    return json(out);
  }

  // ---- authenticated ----
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return bad('Sign in first', 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return bad('Sign in first', 401);
  const user = userData.user;

  if (action === 'certificate') {
    const packageId = String(body.package_id || '');
    const { data: row } = await admin.from('pld_exports').select('certificate_path, certificate_no').eq('package_id', packageId).eq('user_id', user.id).maybeSingle();
    if (!row?.certificate_path) return json({ found: false });
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(row.certificate_path, 600);
    return json({ found: true, certificate_no: row.certificate_no, download_url: signed?.signedUrl ?? null });
  }

  if (action === 'sign') {
    const manifest = body.manifest;
    if (!manifestLooksSane(manifest)) return bad('manifest missing or malformed');
    if (!PRIVATE_JWK || !KEY_ID) return json({ signature: null, reason: 'unconfigured' });
    if (manifest.source?.user_id && manifest.source.user_id !== user.id) return bad('The manifest names a different exporter', 403);

    const canonical = new TextEncoder().encode(canonicalJson(manifest));
    const digest = await sha256Hex(canonical);
    const value = await signBytes(canonical);
    const signature = { alg: SIGNATURE_ALG, key_id: KEY_ID, value };

    const exportedAt = manifest.created_at || new Date().toISOString();
    const certificateNo = makeExportCertificateNo(manifest.package_id, exportedAt);
    const tables = Object.fromEntries(Object.entries(manifest.tables || {}).map(([t, info]) => [t, Number((info as { rows?: number })?.rows) || 0]));
    const record = {
      package_id: manifest.package_id,
      user_id: user.id,
      organization_id: manifest.source?.organization_id ?? null,
      organization_name: body.organization_name ?? manifest.source?.organization_name ?? null,
      exporter_email: body.exporter_email ?? user.email ?? null,
      package_name: manifest.name ?? null,
      exported_at: exportedAt,
      platform_sha: manifest.platform?.sha ?? null,
      manifest_digest: digest,
      signature_key_id: KEY_ID,
      signature_value: value,
      certificate_no: certificateNo,
      tables,
      blobs: Array.isArray(manifest.blobs) ? manifest.blobs.length : 0,
      parts: Array.isArray(manifest.parts) ? manifest.parts.length : 1,
    };
    // idempotent per package: re-signing the same manifest keeps the first certificate
    const { data: existing } = await admin.from('pld_exports').select('id, verification_code, certificate_path').eq('package_id', manifest.package_id).maybeSingle();
    let verificationCode = existing?.verification_code || crypto.randomUUID();
    let certificatePath = existing?.certificate_path || `pld-certificates/${manifest.package_id}.pdf`;
    if (existing) {
      await admin.from('pld_exports').update({ ...record, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      const { error: insErr } = await admin.from('pld_exports').insert({ ...record, verification_code: verificationCode, certificate_path: certificatePath });
      if (insErr) return bad(`Could not record the export: ${insErr.message}`, 500);
    }

    // certificate PDF (its failure never fails the signature)
    let downloadUrl: string | null = null;
    try {
      const fields = buildExportCertificateFields({ ...record, verification_code: verificationCode });
      const pdf = await renderExportCertificatePdf(fields, APP_URL);
      const { error: upErr } = await admin.storage.from(BUCKET).upload(certificatePath, pdf, { contentType: 'application/pdf', upsert: true });
      if (!upErr) {
        const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(certificatePath, 600);
        downloadUrl = signed?.signedUrl ?? null;
      }
    } catch (e) {
      console.error('certificate render failed', e);
    }

    return json({ signature, certificate: { certificate_no: certificateNo, verification_code: verificationCode, download_url: downloadUrl, manifest_digest: digest } });
  }

  return bad(`unknown action ${action}`);
});
