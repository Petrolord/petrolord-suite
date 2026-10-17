// Guided Journey: the journey record's RPCs (migration 20261017100000).
import { supabase } from '@/lib/customSupabaseClient';

/** Everything the guide needs in one round trip; `apps` limits the work probes. */
export async function fetchJourneyState({ projectId = null, apps = null } = {}, client = supabase) {
  const { data, error } = await client.rpc('suite_journey_state', { p_project: projectId, p_apps: apps });
  if (error) throw error;
  return data;
}

/** Guidance mode ('guide' | 'quiet') and/or disciplines ('chosen' | 'inferred'). */
export async function setJourney({ guidance = null, disciplines = null, source = null } = {}, client = supabase) {
  const { data, error } = await client.rpc('suite_journey_set', { p_guidance: guidance, p_disciplines: disciplines, p_source: source });
  if (error) throw error;
  return data;
}

/** Record a welcome seen ('welcomed_org'), a dismissed step, an answered prompt or a greeting. */
export async function markJourney(kind, key = null, client = supabase) {
  const { data, error } = await client.rpc('suite_journey_mark', { p_kind: kind, p_key: key });
  if (error) throw error;
  return data;
}
