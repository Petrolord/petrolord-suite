// ws-sign: the platform countersignature of a Wellsite Studio report
// sign-off (docs/scope/WellsiteStudio-PLAN.md section 4, spec section 32).
//
// Actions (POST JSON { action, ... }):
//   countersign { signoff_id }  member JWT: recompute the report's hash from its stored
//                               canonical model, refuse on mismatch, sign the sign-off's
//                               identity plus that hash with the platform key, store it on
//                               the ws_signoffs row (service role: no client may update).
//   verify { signoff_id }       member JWT: recompute and verify; { valid, key_id, ... }.
//
// Conventions follow pld-sign: per-function cors.ts, pure helpers.js,
// service-role client after our own auth check, ECDSA P-256 / SHA-256,
// the same PLD_SIGNING_PRIVATE_JWK and PLD_SIGNING_KEY_ID secrets (one
// platform key; verification keys ship in the client). Unconfigured
// returns { countersigned: false, reason: 'unconfigured' } and records
// nothing, so a sign-off is never blocked by the platform.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from './cors.ts';
import { canonicalJson, countersignPayload, makeCertificateNo } from './helpers.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PRIVATE_JWK = Deno.env.get('PLD_SIGNING_PRIVATE_JWK') ?? '';
const KEY_ID = Deno.env.get('PLD_SIGNING_KEY_ID') ?? '';
const SIGNATURE_ALG = 'ECDSA-P256-SHA256';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const bad = (message: string, status = 400) => json({ error: message }, status);

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function signBytes(bytes: Uint8Array): Promise<string> {
  const jwk = JSON.parse(PRIVATE_JWK);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const raw = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}
async function verifyBytes(bytes: Uint8Array, signatureB64: string): Promise<boolean> {
  const jwk = JSON.parse(PRIVATE_JWK);
  const pub = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  const key = await crypto.subtle.importKey('jwk', pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const sig = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, bytes);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return bad('POST only', 405);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return bad('Sign in first', 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return bad('Sign in first', 401);
  const user = userData.user;

  const signoffId = String(body.signoff_id || '');
  if (!signoffId) return bad('signoff_id is required');
  const { data: so } = await admin.from('ws_signoffs').select('*').eq('id', signoffId).maybeSingle();
  if (!so) return bad('Sign-off not found', 404);
  // the caller must be a member of the well (the same rule the RLS applies)
  const { data: member } = await admin.from('ws_well_members').select('id').eq('well_id', so.well_id).eq('user_id', user.id).eq('status', 'active').maybeSingle();
  if (!member) return bad('Not a member of this well', 403);
  const { data: report } = await admin.from('ws_reports').select('id, well_id, kind, version_no, content_hash, canonical').eq('id', so.report_id).maybeSingle();
  if (!report) return bad('Report not found', 404);

  // the hash the client wrote must be the hash of what the server holds
  const canonical = canonicalJson(report.canonical);
  const digest = await sha256Hex(new TextEncoder().encode(canonical));
  const expected = `sha256:${digest}`;
  if (so.content_hash !== expected || report.content_hash !== expected) {
    return json({ countersigned: false, reason: 'hash_mismatch', expected, signoff_hash: so.content_hash, report_hash: report.content_hash });
  }

  const payloadBytes = new TextEncoder().encode(canonicalJson(countersignPayload(so, report)));

  if (action === 'verify') {
    if (!so.countersignature?.value || !PRIVATE_JWK) return json({ valid: false, reason: so.countersignature ? 'unconfigured' : 'not_countersigned', hash_ok: true });
    const valid = await verifyBytes(payloadBytes, so.countersignature.value);
    return json({ valid, hash_ok: true, key_id: so.countersignature.key_id, signed_at: so.signed_at, countersigned_at: so.countersigned_at, certificate_no: so.countersignature.certificate_no });
  }

  if (action === 'countersign') {
    if (so.countersignature?.value) return json({ countersigned: true, already: true, countersignature: so.countersignature, countersigned_at: so.countersigned_at });
    if (!PRIVATE_JWK || !KEY_ID) return json({ countersigned: false, reason: 'unconfigured' });
    const value = await signBytes(payloadBytes);
    const countersignature = { alg: SIGNATURE_ALG, key_id: KEY_ID, value, digest: await sha256Hex(payloadBytes), certificate_no: makeCertificateNo(so.id, so.signed_at), countersigned_by: 'petrolord' };
    const countersignedAt = new Date().toISOString();
    const { error } = await admin.from('ws_signoffs').update({ countersignature, countersigned_at: countersignedAt }).eq('id', so.id);
    if (error) return bad(`Could not record the countersignature: ${error.message}`, 500);
    return json({ countersigned: true, countersignature, countersigned_at: countersignedAt });
  }

  return bad(`Unknown action ${String(action)}`);
});
