// send-invite authorization (security fix 2026-09-19).
//
// send-invite used to be an open mail relay: verify_jwt off, no caller check,
// and the recipient, link, organization name and inviter name all came from
// the request body, interpolated unescaped into HTML sent from Petrolord's
// sender. Anyone could send Petrolord-branded mail with any link to anyone.
//
// Now the body only NAMES an invitation (invite_id or token). Everything that
// ends up in the email comes from the database row, and the caller must be a
// signed-in admin of that invitation's organization (or a platform super
// admin). The link is built server-side from an allow-listed origin.
//
// Pure TypeScript (no Deno / esm.sh imports) so jest can test it with mocked
// clients: supabase/functions/_shared/__tests__/platform-admin.test.ts.

import { isOrgAdmin, isPlatformAdmin } from './platform-admin.ts';

// deno-lint-ignore no-explicit-any
type Client = any;

export const INVITE_ORIGINS = [
  'https://hse.petrolord.com',
  'https://petrolord-hse.com',
  'https://www.petrolord-hse.com',
  'https://petrolord.com',
  'https://www.petrolord.com',
  'https://suite.studio.petrolord.com',
];
export const DEFAULT_INVITE_ORIGIN = 'https://hse.petrolord.com';

export interface SendableInvite {
  id: string;
  email: string;
  role: string | null;
  token: string;
  org_id: string;
  first_name: string | null;
}

export type SendDecision =
  | { ok: true; invite: SendableInvite; orgName: string }
  | { ok: false; status: 400 | 401 | 403 | 404 | 409; error: string };

/** Origin for the invite link: the request's own, if allow-listed. */
export function inviteOrigin(requestOrigin: string | null | undefined): string {
  const o = String(requestOrigin ?? '').trim().replace(/\/+$/, '');
  return INVITE_ORIGINS.includes(o) ? o : DEFAULT_INVITE_ORIGIN;
}

export async function resolveSendableInvitation(
  admin: Client,
  callerId: string | null | undefined,
  body: { invite_id?: unknown; token?: unknown },
): Promise<SendDecision> {
  if (!callerId) return { ok: false, status: 401, error: 'Sign in required.' };
  const inviteId = typeof body?.invite_id === 'string' ? body.invite_id.trim() : '';
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!inviteId && !token) return { ok: false, status: 400, error: 'invite_id or token is required.' };

  let q = admin.from('invitations').select('id, email, role, token, org_id, status, first_name');
  q = inviteId ? q.eq('id', inviteId) : q.eq('token', token);
  const { data: inv, error } = await q.maybeSingle();
  if (error || !inv) return { ok: false, status: 404, error: 'Invitation not found.' };
  if (token && inviteId && String(inv.token) !== token) return { ok: false, status: 404, error: 'Invitation not found.' };
  if (String(inv.status ?? '').toLowerCase() !== 'pending') {
    return { ok: false, status: 409, error: 'This invitation is no longer pending.' };
  }

  const allowed = (await isOrgAdmin(admin, callerId, inv.org_id)) || (await isPlatformAdmin(admin, callerId));
  if (!allowed) return { ok: false, status: 403, error: 'Only organization admins can send invitations.' };

  const { data: org } = await admin.from('organizations').select('name').eq('id', inv.org_id).maybeSingle();
  return {
    ok: true,
    invite: {
      id: String(inv.id), email: String(inv.email), role: inv.role ?? null, token: String(inv.token),
      org_id: String(inv.org_id), first_name: inv.first_name ?? null,
    },
    orgName: String(org?.name || 'your organization'),
  };
}
