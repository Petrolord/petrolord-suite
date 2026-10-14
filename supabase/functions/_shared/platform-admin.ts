// Platform super admin: ONE server-controlled source of truth (security fix
// 2026-09-19, refreshed 2026-10-14).
//
// A caller is a platform super admin when, and only when, the database
// function public.is_super_admin() answers true for THEIR OWN session. The
// helper calls it through PostgREST with the caller's verified JWT, so
// auth.uid() inside the function is the caller. This works with both
// definitions of is_super_admin():
//   * before the 2026-10 security migration: a fixed list of three emails;
//   * after it: a row in public.platform_admins (RLS on, no client grants).
// So these functions can be deployed before the migration is applied.
//
// NOT authority, ever (each one is user-controlled):
//   * user.user_metadata.*          anyone can set it: auth.updateUser({ data })
//   * public.users.is_super_admin   was self-updatable under the "Users can
//                                   update their own data" policy
//   * a user id taken from the request body ("super_admin_id")
//   * a role string anywhere the user can write
//
// Every helper here fails CLOSED: a lookup error, a missing env var or a
// non-boolean answer means "not an admin".
//
// Pure TypeScript with no Deno or esm.sh imports so jest can exercise it with
// mocked clients and a mocked fetch
// (supabase/functions/_shared/__tests__/platform-admin.test.ts).

export const ORG_ADMIN_ROLES = ['owner', 'admin', 'org_admin', 'super_admin'];

// deno-lint-ignore no-explicit-any
type Client = any;

export interface Caller {
  id: string;
  /** The verified bearer token, kept so is_super_admin() can run as this user. */
  jwt?: string;
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
    return { id: user.id, jwt, email: user.email ?? null, email_confirmed_at: user.email_confirmed_at ?? null };
  } catch {
    return null;
  }
}

function env(name: string): string {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  try {
    const v = g.Deno?.env?.get?.(name);
    if (v) return String(v);
  } catch { /* fall through */ }
  return String(g.process?.env?.[name] ?? '');
}

/**
 * True only when public.is_super_admin() returns true for the caller's own
 * session. Pass the Caller from getCaller() (it carries the verified JWT).
 * The first argument is unused and kept so call sites read the same as the
 * org-admin check. Fails closed.
 */
export async function isPlatformAdmin(_admin: Client, caller: Caller | null | undefined): Promise<boolean> {
  const jwt = caller?.jwt;
  if (!caller?.id || !jwt || typeof jwt !== 'string') return false;
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const apikey = env('SUPABASE_ANON_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !apikey) return false;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/is_super_admin`, {
      method: 'POST',
      headers: { apikey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return false;
    const value = await res.json();
    return value === true;
  } catch {
    return false;
  }
}

/**
 * True only when the caller's own session can SELECT the row `id` of
 * `table` under row-level security: the database's sharing rules decide,
 * not this function. Used by service-role engines that take a row id from
 * the body. Fails closed.
 */
export async function callerCanSeeRow(caller: Caller | null | undefined, table: string, id: unknown): Promise<boolean> {
  const jwt = caller?.jwt;
  if (!caller?.id || !jwt) return false;
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table)) return false;
  const rowId = String(id ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rowId)) return false;
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const apikey = env('SUPABASE_ANON_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !apikey) return false;
  try {
    const res = await fetch(`${url}/rest/v1/${table}?select=id&id=eq.${rowId}`, {
      headers: { apikey, Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
    });
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.some((r: { id?: string }) => r?.id === rowId);
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

/** Active member (any role) of orgId. Fails closed. */
export async function isOrgMember(admin: Client, userId: string | null | undefined, orgId: string | null | undefined): Promise<boolean> {
  if (!userId || !orgId) return false;
  try {
    const { data, error } = await admin.from('organization_members')
      .select('role, status').eq('organization_id', orgId).eq('user_id', userId);
    if (error) return false;
    return (data ?? []).some((m: { status?: string | null }) =>
      String(m.status ?? 'active').toLowerCase() === 'active');
  } catch {
    return false;
  }
}

/** Constant-time string compare (no early exit on the first differing byte). */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * True only when the request's bearer token IS this project's service-role
 * key: a call from another edge function, never from a browser. Used by the
 * mail and notification functions that other functions call. Fails closed
 * when the key is not configured.
 */
export function isServiceRoleRequest(req: { headers: { get(name: string): string | null } }): boolean {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const token = bearerToken(req);
  if (!key || !token) return false;
  return safeEqual(token, key);
}

export type GuardResult =
  | { ok: true; caller: Caller }
  | { ok: false; status: 401 | 403; error: string };

/** Signed-in caller who is a platform super admin, or a 401/403 to return. */
export async function requirePlatformAdmin(admin: Client, req: { headers: { get(name: string): string | null } }): Promise<GuardResult> {
  const caller = await getCaller(admin, req);
  if (!caller) return { ok: false, status: 401, error: 'Sign in required.' };
  if (!(await isPlatformAdmin(admin, caller))) {
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
