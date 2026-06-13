// supabase/functions/epe-cash-flow-engine/index.ts
//
// PETROLORD EPE CASH FLOW ENGINE v3.1 (2026-05-12)
// Single-run deterministic engine. The compute logic was extracted to
// _shared/epe-engine.ts so the batch (sensitivity) endpoint can reuse it
// without duplicating the engine code.
//
// This file is now thin: Supabase I/O orchestration + a single computeCashFlow
// call. No business logic lives here anymore.
//
// CONTRACT (unchanged):
//   POST /functions/v1/epe-cash-flow-engine
//   Body: { run_id, run_config_id }
//   Returns: { success, result_id, kpis, years_modeled }
//   Writes: epe_results(run_id) with { kpis, cash_flow_data }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { computeCashFlow } from '../_shared/epe-engine.ts';

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
    const { run_id, run_config_id } = await req.json();
    if (!run_id || !run_config_id) throw new Error('Missing run_id or run_config_id.');

    const { data: run, error: runErr } = await supabase
      .from('epe_runs').select('id, case_id, user_id').eq('id', run_id).single();
    if (runErr) throw new Error(`Run lookup failed: ${runErr.message}`);

    const { data: cfg, error: cfgErr } = await supabase
      .from('epe_run_configs').select('*').eq('id', run_config_id).single();
    if (cfgErr) throw new Error(`Run config lookup failed: ${cfgErr.message}`);

    const [prodRes, capexRes, opexRes] = await Promise.all([
      supabase.from('epe_production_volumes').select('data').eq('case_id', run.case_id),
      supabase.from('epe_capex').select('data').eq('case_id', run.case_id),
      supabase.from('epe_opex').select('data').eq('case_id', run.case_id),
    ]);
    if (prodRes.error) throw new Error(`Production lookup failed: ${prodRes.error.message}`);
    if (capexRes.error) throw new Error(`Capex lookup failed: ${capexRes.error.message}`);
    if (opexRes.error) throw new Error(`Opex lookup failed: ${opexRes.error.message}`);

    const prodRows = (prodRes.data || []).flatMap(r => Array.isArray(r.data) ? r.data : []);
    const capexRows = (capexRes.data || []).flatMap(r => Array.isArray(r.data) ? r.data : []);
    const opexRows = (opexRes.data || []).flatMap(r => Array.isArray(r.data) ? r.data : []);

    // ====================================================================
    // Delegate all math to the shared library
    // ====================================================================
    const { cashFlowData, kpis } = computeCashFlow({ cfg, prodRows, capexRows, opexRows });

    // Replace any prior result for this run
    await supabase.from('epe_results').delete().eq('run_id', run_id);
    const { data: resultRow, error: resInsErr } = await supabase
      .from('epe_results')
      .insert({ run_id, user_id: run.user_id, kpis, cash_flow_data: cashFlowData })
      .select('id').single();
    if (resInsErr) throw new Error(`Result save failed: ${resInsErr.message}`);

    return new Response(
      JSON.stringify({ success: true, result_id: resultRow.id, kpis, years_modeled: cashFlowData.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[epe-cash-flow-engine] error:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Engine failed.', stack: err?.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
