// org-offboard: grace-period organization deletion (offboarding phase 2).
//
// Actions (POST { action, ... }):
//   request  { organization_id, confirm_name, reason? }   [org admin]
//     Schedules closure: 30-day grace window, typed-name confirmation,
//     internal orgs refused, one live schedule per org. Access is KEPT during
//     the grace window on purpose: members can still export their data and
//     any admin can cancel; a dashboard banner warns the whole org.
//   cancel   { request_id }                               [org admin]
//     Cancels a scheduled closure any time before execution.
//   execute_due { request_id? }                           [platform super
//     admin, or the service-role key for a future scheduler; pg_cron is not
//     installed on this project, so execution is human-triggered]
//     Purges every due request: dry-run RPC (re-validates guards) -> live
//     admin_purge_org (rows, verified, transactional) -> storage folders of
//     deleted members + the org's export archive -> auth accounts via the
//     Admin API (never SQL: manual auth.users deletes orphan identities).
//     Partial failures mark the request 'failed' with a report; execute_due
//     retries failed requests idempotently. Success stores the purge report
//     on the surviving org_closure_requests row, issues the Certificate of
//     Data Deletion (PDF in org-exports/certificates/) and emails it to the
//     requester with the verification code.
//   issue_certificate { request_id }                      [super admin or
//     service key] Re-issues the certificate for a purged request
//     (idempotent: number and code stay stable).
//   verify_certificate { certificate_no, verification_code, download? }
//     PUBLIC. Confirms the attested facts straight from the deletion record;
//     with download: true also mints a 10-minute link to the PDF. Possession
//     of both the number and the 128-bit code is the capability.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from './cors.ts';
import { sendEmail } from '../_shared/email.ts';
import {
  buildCertificateFields,
  chunk,
  confirmNameMatches,
  isUserGoneError,
  makeCertificateNo,
  storagePrefixTargets,
  summarizeReport,
} from './helpers.js';
import { renderCertificatePdf, toBase64 } from './certificate.ts';

const SUPER_ADMIN_EMAILS = ['info@petrolord.com', 'ayoasaolu@gmail.com', 'ayodejiasaolu1@gmail.com', 'support@petrolord.com'];
const ADMIN_ROLES = ['owner', 'admin', 'org_admin', 'super_admin'];
const GRACE_DAYS = 30;
const STORAGE_WALK_CAP = 100000;
const REMOVE_BATCH = 500;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const isServiceCall = bearer.length > 0 && bearer === serviceKey;
    let caller: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null;
    if (!isServiceCall) {
      const { data: authData } = await admin.auth.getUser(bearer);
      caller = authData?.user ?? null;
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'request') {
      if (!caller) return json({ error: 'Unauthorized: invalid or expired session.' }, 401);
      const orgId = String(body.organization_id || '');
      if (!orgId) return json({ error: 'organization_id is required.' }, 400);
      if (!(await isOrgAdmin(admin, caller, orgId))) {
        return json({ error: 'Only organization admins can request account closure.' }, 403);
      }

      const { data: org } = await admin.from('organizations')
        .select('id, name, organization_type, is_internal').eq('id', orgId).maybeSingle();
      if (!org) return json({ error: 'Organization not found.' }, 404);
      if (org.organization_type === 'internal' || org.is_internal === true) {
        return json({ error: 'Internal organizations cannot be closed.' }, 403);
      }
      if (!confirmNameMatches(org.name, body.confirm_name)) {
        return json({ error: 'The organization name you typed does not match. Nothing was scheduled.' }, 400);
      }

      const effectiveAt = new Date(Date.now() + GRACE_DAYS * 24 * 3600 * 1000).toISOString();
      const { data: request, error: insertError } = await admin.from('org_closure_requests')
        .insert({
          organization_id: orgId,
          org_name: org.name,
          requested_by: caller.id,
          requested_by_email: caller.email ?? '',
          reason: body.reason ? String(body.reason).slice(0, 2000) : null,
          status: 'scheduled',
          grace_days: GRACE_DAYS,
          effective_at: effectiveAt,
        })
        .select().single();
      if (insertError) {
        if (insertError.code === '23505') {
          return json({ error: 'A closure is already scheduled for this organization.' }, 409);
        }
        return json({ error: `Could not schedule the closure: ${insertError.message}` }, 500);
      }

      if (caller.email) {
        await sendEmail({
          to: caller.email,
          subject: `${org.name}: account closure scheduled for ${effectiveAt.slice(0, 10)}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
              <h2 style="color: #b91c1c;">Account closure scheduled</h2>
              <p style="color: #4b5563;">The Petrolord account for <strong>${org.name}</strong> is scheduled for permanent deletion on <strong>${effectiveAt.slice(0, 10)}</strong>.</p>
              <p style="color: #4b5563;">Until then everything keeps working. We recommend downloading a full data export from <strong>Dashboard &rarr; Data Export</strong> before that date.</p>
              <p style="color: #4b5563;">Any organization admin can cancel this from the same page at any time before the deletion date.</p>
              <p style="color: #9ca3af; font-size: 12px;">If you did not request this, cancel it now and review your organization's admin accounts.</p>
            </div>`,
          logPrefix: '[org-offboard]',
        });
      }
      console.log(`[org-offboard] ${caller.email} scheduled closure of org ${orgId} (${org.name}) for ${effectiveAt}`);
      return json({ success: true, request_id: request.id, effective_at: effectiveAt, grace_days: GRACE_DAYS });
    }

    if (action === 'cancel') {
      if (!caller) return json({ error: 'Unauthorized: invalid or expired session.' }, 401);
      const requestId = String(body.request_id || '');
      if (!requestId) return json({ error: 'request_id is required.' }, 400);
      const { data: request } = await admin.from('org_closure_requests')
        .select('*').eq('id', requestId).maybeSingle();
      if (!request) return json({ error: 'Closure request not found.' }, 404);
      if (request.status !== 'scheduled') {
        return json({ error: `This closure is ${request.status} and can no longer be cancelled.` }, 409);
      }
      if (!(await isOrgAdmin(admin, caller, request.organization_id))) {
        return json({ error: 'Only organization admins can cancel a closure.' }, 403);
      }
      const { error: updateError } = await admin.from('org_closure_requests')
        .update({
          status: 'cancelled',
          cancelled_by: caller.id,
          cancelled_by_email: caller.email ?? '',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId).eq('status', 'scheduled');
      if (updateError) return json({ error: `Could not cancel: ${updateError.message}` }, 500);

      if (request.requested_by_email) {
        await sendEmail({
          to: request.requested_by_email,
          subject: `${request.org_name}: account closure cancelled`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
              <h2 style="color: #111827;">Closure cancelled</h2>
              <p style="color: #4b5563;">The scheduled deletion of <strong>${request.org_name}</strong> was cancelled by ${caller.email ?? 'an organization admin'}. Your account continues unchanged.</p>
            </div>`,
          logPrefix: '[org-offboard]',
        });
      }
      console.log(`[org-offboard] ${caller.email} cancelled closure request ${requestId}`);
      return json({ success: true });
    }

    if (action === 'execute_due') {
      const isSuperAdmin = caller ? await isPlatformSuperAdmin(admin, caller) : false;
      if (!isServiceCall && !isSuperAdmin) {
        return json({ error: 'Only platform super admins can execute due closures.' }, 403);
      }
      let query = admin.from('org_closure_requests')
        .select('*')
        .in('status', ['scheduled', 'failed'])
        .lte('effective_at', new Date().toISOString())
        .order('effective_at', { ascending: true })
        .limit(5);
      if (body.request_id) query = query.eq('id', String(body.request_id));
      const { data: due, error: dueError } = await query;
      if (dueError) return json({ error: dueError.message }, 500);

      const results = [];
      for (const request of due ?? []) {
        try {
          results.push(await executeRequest(admin, request));
        } catch (e) {
          const message = (e as Error).message;
          console.error(`[org-offboard] request ${request.id} failed:`, message);
          await admin.from('org_closure_requests')
            .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
            .eq('id', request.id);
          results.push({ request_id: request.id, org_name: request.org_name, status: 'failed', error: message });
        }
      }
      return json({ processed: results.length, results });
    }

    if (action === 'issue_certificate') {
      const isSuperAdmin = caller ? await isPlatformSuperAdmin(admin, caller) : false;
      if (!isServiceCall && !isSuperAdmin) {
        return json({ error: 'Only platform super admins can issue certificates.' }, 403);
      }
      const requestId = String(body.request_id || '');
      if (!requestId) return json({ error: 'request_id is required.' }, 400);
      const { data: request } = await admin.from('org_closure_requests')
        .select('*').eq('id', requestId).maybeSingle();
      if (!request) return json({ error: 'Closure request not found.' }, 404);
      if (request.status !== 'purged') {
        return json({ error: 'A certificate can only be issued after the deletion has completed.' }, 409);
      }
      const certificate = await issueCertificate(admin, request);
      return json({ success: true, ...certificate });
    }

    if (action === 'verify_certificate') {
      // Deliberately public: anyone holding BOTH the certificate number and
      // the 128-bit verification code may confirm the attested facts.
      const certNo = String(body.certificate_no || '').trim().toUpperCase();
      const code = String(body.verification_code || '').trim().toLowerCase();
      if (!certNo || !code) return json({ error: 'certificate_no and verification_code are required.' }, 400);
      const { data: request } = await admin.from('org_closure_requests')
        .select('*').eq('certificate_no', certNo).maybeSingle();
      if (!request || String(request.verification_code || '').toLowerCase() !== code || request.status !== 'purged') {
        return json({ valid: false, error: 'No deletion record matches that certificate number and verification code.' }, 404);
      }
      const payload: Record<string, unknown> = {
        valid: true,
        certificate: buildCertificateFields(request, request.certificate_no),
      };
      if (body.download === true && request.certificate_path) {
        const { data: signed } = await admin.storage.from('org-exports')
          .createSignedUrl(request.certificate_path, 600);
        if (signed?.signedUrl) payload.download_url = signed.signedUrl;
      }
      return json(payload);
    }

    return json({ error: `Unknown action '${action}'.` }, 400);
  } catch (error) {
    console.error('[org-offboard] Unhandled:', (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function isOrgAdmin(admin: ReturnType<typeof createClient>, caller: { id: string; email?: string; user_metadata?: Record<string, unknown> }, orgId: string): Promise<boolean> {
  const { data: rows } = await admin.from('organization_members')
    .select('role, status').eq('organization_id', orgId).eq('user_id', caller.id);
  const isAdmin = (rows ?? []).some((m) =>
    (m.status ?? 'active').toLowerCase() === 'active' && ADMIN_ROLES.includes(m.role));
  if (isAdmin) return true;
  return isPlatformSuperAdmin(admin, caller);
}

async function isPlatformSuperAdmin(admin: ReturnType<typeof createClient>, caller: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Promise<boolean> {
  if (caller.user_metadata?.is_super_admin === true) return true;
  if (SUPER_ADMIN_EMAILS.includes(String(caller.email || '').toLowerCase())) return true;
  const { data: urow } = await admin.from('users').select('is_super_admin').eq('id', caller.id).maybeSingle();
  return urow?.is_super_admin === true;
}

async function executeRequest(admin: ReturnType<typeof createClient>, request: Record<string, unknown>) {
  const orgId = String(request.organization_id);
  const { data: org } = await admin.from('organizations').select('id').eq('id', orgId).maybeSingle();

  let rpcReport: Record<string, unknown>;
  if (org) {
    // Dry run first: re-validates every guard (due request, not internal, no
    // protected members) and produces the report shape without touching data.
    const { error: dryError } = await admin.rpc('admin_purge_org', { p_org_id: orgId, p_dry_run: true });
    if (dryError) throw new Error(`purge dry-run refused: ${dryError.message}`);
    const { data: live, error: liveError } = await admin.rpc('admin_purge_org', { p_org_id: orgId, p_dry_run: false });
    if (liveError) throw new Error(`purge failed (rolled back): ${liveError.message}`);
    rpcReport = live as Record<string, unknown>;
  } else {
    // Retry path: a previous run purged the rows but failed later (storage or
    // auth). Reuse the stored report so the remaining steps can finish.
    const prior = (request.purge_report as Record<string, unknown> | null)?.rpc as Record<string, unknown> | undefined;
    if (!prior) throw new Error('organization rows are gone but no prior purge report exists; manual review required.');
    rpcReport = { ...prior, note: 'rows purged in a previous attempt; this run completed storage/auth cleanup' };
  }

  const authUsers = (rpcReport.auth_users_to_delete ?? []) as Array<{ id: string; email: string }>;
  const extraOrgIds = ((rpcReport.extra_orgs ?? []) as Array<{ id: string }>).map((o) => o.id);

  // Storage: the export archives of every purged org + each deleted member's
  // data folders.
  const storageReport = { objects_removed: 0, errors: [] as string[] };
  for (const target of storagePrefixTargets(orgId, authUsers.map((u) => u.id), extraOrgIds)) {
    try {
      storageReport.objects_removed += await removePrefix(admin, target.bucket, target.prefix);
    } catch (e) {
      storageReport.errors.push(`${target.bucket}/${target.prefix}: ${(e as Error).message}`);
    }
  }

  // Auth accounts via the Admin API (never SQL: orphaned-identities gotcha).
  const authReport = { deleted: [] as string[], failed: [] as Array<{ id: string; error: string }> };
  for (const user of authUsers) {
    const { error: delError } = await admin.auth.admin.deleteUser(user.id);
    if (!delError || isUserGoneError(delError.message)) authReport.deleted.push(user.email);
    else authReport.failed.push({ id: user.id, error: delError.message });
  }

  const report = {
    rpc: rpcReport,
    storage: storageReport,
    auth: authReport,
    executed_at: new Date().toISOString(),
  };

  if (authReport.failed.length > 0 || storageReport.errors.length > 0) {
    const message = `partial purge: ${authReport.failed.length} auth deletion(s) and ${storageReport.errors.length} storage prefix(es) failed; re-run execute_due to retry.`;
    await admin.from('org_closure_requests')
      .update({ status: 'failed', purge_report: report, error_message: message, updated_at: new Date().toISOString() })
      .eq('id', request.id);
    return { request_id: request.id, org_name: request.org_name, status: 'failed', error: message };
  }

  await admin.from('org_closure_requests')
    .update({
      status: 'purged',
      purged_at: new Date().toISOString(),
      purge_report: report,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.id);

  // Certificate of Data Deletion (phase 3). A certificate failure never
  // fails the purge: the data is already gone, and issue_certificate can
  // re-issue later.
  let certificate: Record<string, unknown> | null = null;
  const { data: purgedRow } = await admin.from('org_closure_requests')
    .select('*').eq('id', request.id).single();
  try {
    certificate = await issueCertificate(admin, purgedRow);
  } catch (e) {
    console.error(`[org-offboard] certificate issuance failed for ${request.id}:`, (e as Error).message);
    certificate = { error: (e as Error).message };
  }

  const s = summarizeReport(report);
  console.log(`[org-offboard] purged org ${orgId} (${request.org_name}): ${s.totalRows} rows, ${s.objectsRemoved} objects, ${s.accountsDeleted} accounts`);
  return { request_id: request.id, org_name: request.org_name, status: 'purged', summary: s, certificate };
}

// Render, store and email the Certificate of Data Deletion for a purged
// request. Idempotent: the certificate number and verification code are kept
// stable across re-issues.
async function issueCertificate(admin: ReturnType<typeof createClient>, request: Record<string, unknown>) {
  if (!request || request.status !== 'purged') {
    throw new Error('certificate can only be issued for a purged closure request.');
  }
  const certificateNo = String(request.certificate_no ||
    makeCertificateNo(request.id, request.purged_at || new Date().toISOString()));
  const verificationCode = String(request.verification_code || crypto.randomUUID());
  const fields = buildCertificateFields(request, certificateNo);
  const pdfBytes = await renderCertificatePdf(fields, verificationCode);

  const certificatePath = `certificates/${request.id}.pdf`;
  const { error: upError } = await admin.storage.from('org-exports')
    .upload(certificatePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (upError) throw new Error(`certificate upload failed: ${upError.message}`);

  const { error: updateError } = await admin.from('org_closure_requests')
    .update({
      certificate_no: certificateNo,
      verification_code: verificationCode,
      certificate_path: certificatePath,
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.id);
  if (updateError) throw new Error(`certificate record update failed: ${updateError.message}`);

  let emailed = false;
  if (request.requested_by_email) {
    const s = fields.summary;
    emailed = await sendEmail({
      to: String(request.requested_by_email),
      subject: `${fields.organization_name}: certificate of data deletion ${certificateNo}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #111827;">Deletion completed</h2>
          <p style="color: #4b5563;">As scheduled, all data belonging to <strong>${fields.organization_name}</strong> has been permanently removed from Petrolord's live systems. Your Certificate of Data Deletion is attached.</p>
          <ul style="color: #4b5563;">
            <li>${s.totalRows} database records across ${s.tablesAffected} tables deleted</li>
            <li>${s.objectsRemoved} stored files removed</li>
            <li>${s.accountsDeleted} member account(s) deleted</li>
            <li>${s.rowsUnshared} records owned by members of other organizations were detached, not deleted</li>
          </ul>
          <p style="color: #4b5563;">The certificate can be verified at any time at <a href="https://petrolord.com/legal/verify-deletion">petrolord.com/legal/verify-deletion</a> using certificate number <strong>${certificateNo}</strong> and verification code <strong>${verificationCode}</strong>. The same page can re-download the certificate.</p>
          <p style="color: #9ca3af; font-size: 12px;">Keep this email for your records. Copies inside encrypted database backups age out automatically as backups rotate.</p>
        </div>`,
      attachments: [{
        filename: `${certificateNo}.pdf`,
        content: toBase64(pdfBytes),
        contentType: 'application/pdf',
      }],
      logPrefix: '[org-offboard]',
    });
  }

  console.log(`[org-offboard] certificate ${certificateNo} issued for request ${request.id} (emailed: ${emailed})`);
  return { certificate_no: certificateNo, certificate_path: certificatePath, emailed };
}

async function removePrefix(admin: ReturnType<typeof createClient>, bucket: string, prefix: string): Promise<number> {
  const paths: string[] = [];
  await walk(admin, bucket, prefix, paths);
  for (const batch of chunk(paths, REMOVE_BATCH)) {
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) throw new Error(error.message);
  }
  return paths.length;
}

async function walk(admin: ReturnType<typeof createClient>, bucket: string, prefix: string, out: string[]) {
  let offset = 0;
  while (out.length < STORAGE_WALK_CAP) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;
    for (const item of data) {
      if (!item.id) await walk(admin, bucket, `${prefix}/${item.name}`, out);
      else out.push(`${prefix}/${item.name}`);
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
}
