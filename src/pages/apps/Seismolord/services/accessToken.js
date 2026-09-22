// In-memory access token for brick reads (tester feedback 2026-09-22,
// stability). Every brick GET used to call supabase.auth.getSession(),
// which takes the auth client's lock: a slice of 100+ bricks queued 100+
// lock acquisitions behind each other (and behind any token refresh), a
// real source of the intermittent stalls. The token now lives here:
// read once, kept current by onAuthStateChange, refreshed early when it
// is about to expire, and force-refreshed exactly once for a burst of
// 401/403s (storageBrickFetcher calls getToken(true) on those).

import { supabase } from '@/lib/customSupabaseClient';

const EARLY_REFRESH_S = 60;      // refresh when under a minute remains

let cached = null;               // {token, expiresAt (epoch s)}
let inflight = null;             // single-flight read / refresh
let subscribed = false;
let refreshedAt = 0;             // ms; a 401 burst refreshes only once
const FORCE_DEDUPE_MS = 5000;

const adopt = (session) => {
  cached = session?.access_token
    ? { token: session.access_token, expiresAt: session.expires_at || 0 }
    : null;
};

function subscribe() {
  if (subscribed) return;
  subscribed = true;
  try {
    supabase.auth.onAuthStateChange((_event, session) => adopt(session));
  } catch { /* the harness client may lack auth events */ }
}

const fresh = () => cached && (!cached.expiresAt
  || cached.expiresAt - Date.now() / 1000 > EARLY_REFRESH_S);

/**
 * @param {boolean} [force] refresh even if the cached token looks valid
 *   (a 401/403 on a brick read)
 * @returns {Promise<string>}
 */
export async function getAccessToken(force = false) {
  subscribe();
  if (!force && fresh()) return cached.token;
  if (force && cached && Date.now() - refreshedAt < FORCE_DEDUPE_MS) return cached.token;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      let session = null;
      if (force || cached) {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error) session = data?.session || null;
        if (session) refreshedAt = Date.now();
      }
      if (!session) {
        const { data } = await supabase.auth.getSession();
        session = data?.session || null;
      }
      adopt(session);
      if (!cached) throw new Error('Not signed in');
      return cached.token;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Test hook: forget the cached token and subscription. */
export function resetAccessTokenCache() {
  cached = null;
  inflight = null;
  subscribed = false;
  refreshedAt = 0;
}
