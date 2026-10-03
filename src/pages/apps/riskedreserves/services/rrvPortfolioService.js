// Reads saved Risked Reserves valuations and publishes each as the
// `rrv-portfolio-candidate-1` contract (./rrvPortfolioCandidate.js). The
// receiving app (Capital Portfolio Studio) calls these with its Supabase
// client. The reads are plain selects on the valuations the signed-in user
// may read (their own, and those colleagues shared with their organisation,
// under the rules of 20261002151500_rrv_valuations.sql), so no policy
// changes.

import { buildRrvPortfolioCandidate } from './rrvPortfolioCandidate';

const isMissingTable = (error) => !!error && (['42P01', 'PGRST205'].includes(String(error.code))
  || /relation .* does not exist|Could not find the table/i.test(String(error.message || '')));

const fail = (error) => {
  if (isMissingTable(error)) {
    return new Error('Risked Reserves valuations cannot be read on this database yet (the rrv_valuations table has not been created).');
  }
  return new Error(`Could not read Risked Reserves valuations: ${error.message}`);
};

async function readerId(supabase) {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
  } catch { return null; }
}

const assemble = (rows, userId, build) => rows.map((row) => ({
  valuationId: row.id, name: row.name ?? null, savedAt: row.updated_at ?? null, ownerId: row.user_id ?? null,
  ...buildRrvPortfolioCandidate({ row, userId, build }),
}));

/**
 * Every valuation the user may read, newest first, each as a contract or a refusal.
 * @returns {Promise<Array<{valuationId: string, name: ?string, savedAt: ?string, ownerId: ?string, ok: boolean, contract?: object, reason?: string}>>}
 */
export async function listRrvPortfolioCandidates(supabase, { limit = 100, build = null } = {}) {
  const userId = await readerId(supabase);
  const { data, error } = await supabase.from('rrv_valuations').select('*').order('updated_at', { ascending: false }).limit(limit);
  if (error) throw fail(error);
  return assemble(data || [], userId, build);
}

/** One valuation by id: its contract or refusal, or null when it is gone (or no longer readable). */
export async function getRrvPortfolioCandidate(supabase, valuationId, { build = null } = {}) {
  const userId = await readerId(supabase);
  const { data, error } = await supabase.from('rrv_valuations').select('*').eq('id', valuationId).limit(1);
  if (error) throw fail(error);
  if (!data || !data.length) return null;
  return assemble(data, userId, build)[0];
}
