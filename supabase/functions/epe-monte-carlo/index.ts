// supabase/functions/epe-monte-carlo/index.ts
//
// PETROLORD EPE MONTE CARLO ENDPOINT (D2, docs/scope/Economics-ROADMAP.md)
//
// Thin I/O orchestration in the epe-cash-flow-engine pattern: all math lives
// in _shared/epe-mc.ts (sampling) and _shared/epe-engine.ts (fiscal compute).
//
// CONTRACT:
//   POST /functions/v1/epe-monte-carlo
//   Body: { run_config_id, mc_config }
//     mc_config: { iterations?, seed?, variables?, correlations? } — see
//     McConfig in _shared/epe-mc.ts.
//   Returns: { success, mc_run_id, results }
//   Writes: epe_mc_runs(case_id, run_config_id, user_id, mc_config, results)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { runEpeMonteCarlo } from '../_shared/epe-mc.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Missing Supabase environment configuration.');
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Resolve the calling user so the persisted run row carries ownership
    // (epe_mc_runs RLS is auth.uid() = user_id).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header.');
    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !user) throw new Error('Invalid user token.');

    const { run_config_id, mc_config } = await req.json();
    if (!run_config_id) throw new Error('Missing run_config_id.');

    const { data: cfg, error: cfgErr } = await supabase
      .from('epe_run_configs').select('*').eq('id', run_config_id).single();
    if (cfgErr) throw new Error(`Run config lookup failed: ${cfgErr.message}`);

    // Wave E: org sharing is read-only. Only the config's owner may launch
    // a Monte Carlo run on it (this function writes with the service role,
    // so RLS alone cannot enforce it).
    if (cfg.user_id && cfg.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'This case is shared with you read-only. Clone it to run your own simulations.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const [prodRes, capexRes, opexRes] = await Promise.all([
      supabase.from('epe_production_volumes').select('data').eq('case_id', cfg.case_id),
      supabase.from('epe_capex').select('data').eq('case_id', cfg.case_id),
      supabase.from('epe_opex').select('data').eq('case_id', cfg.case_id),
    ]);
    if (prodRes.error) throw new Error(`Production lookup failed: ${prodRes.error.message}`);
    if (capexRes.error) throw new Error(`Capex lookup failed: ${capexRes.error.message}`);
    if (opexRes.error) throw new Error(`Opex lookup failed: ${opexRes.error.message}`);

    const prodRows = (prodRes.data || []).flatMap((r) => Array.isArray(r.data) ? r.data : []);
    const capexRows = (capexRes.data || []).flatMap((r) => Array.isArray(r.data) ? r.data : []);
    const opexRows = (opexRes.data || []).flatMap((r) => Array.isArray(r.data) ? r.data : []);

    const results = runEpeMonteCarlo({ cfg, prodRows, capexRows, opexRows, mcConfig: mc_config ?? {} });

    const { data: runRow, error: insErr } = await supabase
      .from('epe_mc_runs')
      .insert({
        case_id: cfg.case_id,
        run_config_id,
        user_id: user.id,
        mc_config: mc_config ?? {},
        results,
      })
      .select('id').single();
    if (insErr) throw new Error(`MC run save failed: ${insErr.message}`);

    return new Response(
      JSON.stringify({ success: true, mc_run_id: runRow.id, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[epe-monte-carlo] error:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Monte Carlo run failed.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
