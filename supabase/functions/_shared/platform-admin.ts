// Platform super admin: ONE server-controlled source of truth (security fix
// 2026-09-19, migration 20260919195000_security_platform_admin_source).
//
// A caller is a platform super admin when, and only when, their auth user id
// has a row in public.platform_admins. That table has RLS on, no policies and
// no grants to anon/authenticated, so only the service role (and SECURITY
// DEFINER SQL such as public.is_super_admin()) can read or write it.
//
// NOT authority, ever (each one is user-controlled):
//   * user.user_metadata.*          anyone can set it: auth.updateUser({ data })
//   * public.users.is_super_admin   was self-updatable under the "Users can
//                                   update their own data" policy
//   * a user id taken from the request body ("super_admin_id")
//   * a role string anywhere the user can write
// The email allow-lists that used to live in each function are gone too, so
// granting or revoking an admin is one row, not a redeploy of every function.
//
// Every helper here fails CLOSED: a lookup error or a missing table answers
// "not an admin".
//
// Pure TypeScript with no Deno or esm.sh imports so jest can exercise it with
// mocked clients (supabase/functions/_shared/__tests__/platform-admin.test.ts).

export const ORG_ADMIN_ROLES = ['owner', 'admin', 'org_admin', 'super_admin'];

// deno-lint-ignore no-explicit-any
type Client = any;

export interface Caller {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}

/** The bearer token of the request, or '' when there is none. */
export function bearerToken(req: { headers: { get(name: string): string | null } }): string {
  const h = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : '';
}

/**
 * The signed-in user behind the request, verified by the auth server.
 * Returns null for no token, the anon key (not a user), a service-role key,
 * an expired or forged token.
 */
export async function getCaller(admin: Client, req: { headers: { get(name: string): string | null } }): Promise<Caller | null> {
  const jwt = bearerToken(req);
  if (!jwt) return null;
  try {
    const { data, error } = await admin.auth.getUser(jwt);
    const user = data?.user;
    if (error || !user?.id) return null;
    return { id: user.id, email: user.email ?? null, email_confirmed_at: user.email_confirmed_at ?? null };
  } catch {
    return null;
  }
}

/** True only when public.platform_admins holds a row for userId. Fails closed. */
export async function isPlatformAdmin(admin: Client, userId: string | null | undefined): Promise<boolean> {
  if (!userId || typeof userId !== 'string') return false;
  try {
    const { data, error } = await admin.from('platform_admins')
      .select('user_id').eq('user_id', userId).maybeSingle();
    if (error) return false;
    return !!data && data.user_id === userId;
  } catch {
    return false;
  }
}

/** Active owner/admin/org_admin/super_admin member of orgId. Fails closed. */
export async function isOrgAdmin(admin: Client, userId: string | null | undefined, orgId: string | null | undefined): Promise<boolean> {
  if (!userId || !orgId) return false;
  try {
    const { data, error } = await admin.from('organization_members')
      .select('role, status').eq('organization_id', orgId).eq('user_id', userId);
    if (error) return false;
    return (data ?? []).some((m: { role?: string; status?: string | null }) =>
      String(m.status ?? 'active').toLowerCase() === 'active' && ORG_ADMIN_ROLES.includes(String(m.role)));
  } catch {
    return false;
  }
}

export type GuardResult =
  | { ok: true; caller: Caller }
  | { ok: false; status: 401 | 403; error: string };

/** Signed-in caller who is a platform super admin, or a 401/403 to return. */
export async function requirePlatformAdmin(admin: Client, req: { headers: { get(name: string): string | null } }): Promise<GuardResult> {
  const caller = await getCaller(admin, req);
  if (!caller) return { ok: false, status: 401, error: 'Sign in required.' };
  if (!(await isPlatformAdmin(admin, caller.id))) {
    return { ok: false, status: 403, error: 'Forbidden: platform super admin required.' };
  }
  return { ok: true, caller };
}

/**
 * Accepting an organization invitation for an email that ALREADY has an
 * account (security fix 2026-09-19). The token alone is not enough: the
 * request must carry a signed-in session for that same, confirmed email, and
 * the membership is linked to the SESSION's user id (never to an id looked
 * up by email, since the public.users email column was self-editable).
 *
 *   existingAccount  an account for the invited email is known to exist
 *   caller           getCaller(...) for the request (null when signed out)
 *   inviteEmail      organization_members.email of the invited row
 *
 * Returns one of:
 *   { kind: 'link', userId }         link the invited row to userId
 *   { kind: 'new' }                  no account yet: the new-account path
 *   { kind: 'deny', status, error, requires_sign_in }
 */
export type ExistingAccountDecision =
  | { kind: 'link'; userId: string }
  | { kind: 'new' }
  | { kind: 'deny'; status: 401 | 403; error: string; requires_sign_in: true };

export function decideInvitationAcceptance(existingAccount: boolean, caller: Caller | null, inviteEmail: string | null | undefined): ExistingAccountDecision {
  const want = String(inviteEmail ?? '').trim().toLowerCase();
  const have = String(caller?.email ?? '').trim().toLowerCase();
  const sessionMatches = !!caller && !!want && have === want && !!caller.email_confirmed_at;
  if (sessionMatches) return { kind: 'link', userId: caller!.id };
  if (!existingAccount) return { kind: 'new' };
  if (!caller) {
    return {
      kind: 'deny', status: 401, requires_sign_in: true,
      error: 'This email already has a Petrolord account. Sign in to that account, then open the invitation link again.',
    };
  }
  return {
    kind: 'deny', status: 403, requires_sign_in: true,
    error: 'This invitation was sent to a different email address. Sign in as the invited account, then open the link again.',
  };
}

/** Escape text for interpolation into an HTML email body. */
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}
