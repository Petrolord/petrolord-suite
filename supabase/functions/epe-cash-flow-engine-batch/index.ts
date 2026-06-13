// supabase/functions/epe-cash-flow-engine-batch/index.ts
//
// PETROLORD EPE BATCH ENGINE (Sensitivity / Tornado) — v1, 2026-05-12
//
// Runs the cash-flow engine N times in-process with ±20% variations on key
// inputs, captures NPV deltas, writes them to epe_sensitivity_results.
//
// All math goes through the shared computeCashFlow library, ensuring sensitivity
// runs use identical logic to single-run mode (no math divergence between
// "deterministic NPV" and "sensitivity base NPV").
//
// CONTRACT:
//   POST /functions/v1/epe-cash-flow-engine-batch
//   Body: { run_id, base_run_config_id, sensitivity_run_id }
//   Returns: { success, sensitivity_run_id, base_npv, sweeps_count, results: [...] }
//
// Execution model:
//   - Single Edge Function invocation runs all sweeps in-process
//   - Typical sweep set is 16-18 variables × 2 directions = 32-36 compute runs
//   - Each compute is O(N years × constants); total runtime budget < 30s
//   - Status polling unnecessary at this scale; client awaits the response

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { computeCashFlow } from '../_shared/epe-engine.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// ============================================================================
// SWEEP DEFINITIONS
// ============================================================================
//
// Each sweep specifies:
//   - variable:    the cfg field to modify
//   - label:       human-readable for chart axis
//   - factor_low:  multiplier for "low" variant (default 0.8 = -20%)
//   - factor_high: multiplier for "high" variant (default 1.2 = +20%)
//   - regimes:     which fiscal regimes this sweep applies to
//
// Discount rate is treated specially: a "±20% of 10%" means 8% and 12%, not
// 30% and -10%. This is the convention.
//
// For inflation rate, similarly: ±20% of 3% = 2.4% and 3.6%.
//
// Some variables have absolute floors (e.g., discount rate >= 0).

interface SweepDef {
  variable: string;
  label: string;
  factor_low: number;
  factor_high: number;
  regimes: string[];      // applicable fiscal regimes
  floor?: number;         // optional lower bound
}

const SWEEPS_ALL: SweepDef[] = [
  // Common to every regime
  { variable: 'oil_price_usd_bbl',           label: 'Oil Price',           factor_low: 0.8, factor_high: 1.2, regimes: ['JV', 'PSC', 'PIA'] },
  { variable: 'gas_price_usd_mscf',          label: 'Gas Price',           factor_low: 0.8, factor_high: 1.2, regimes: ['JV', 'PSC', 'PIA'] },
  { variable: 'discount_rate_pct',           label: 'Discount Rate',       factor_low: 0.8, factor_high: 1.2, regimes: ['JV', 'PSC', 'PIA'], floor: 0 },
  { variable: 'inflation_rate_pct',          label: 'Inflation',           factor_low: 0.8, factor_high: 1.2, regimes: ['JV', 'PSC', 'PIA'], floor: 0 },

  // JV-specific
  { variable: 'jv_working_interest_pct',     label: 'Working Interest',    factor_low: 0.8, factor_high: 1.2, regimes: ['JV'] },
  { variable: 'jv_royalty_pct',              label: 'JV Royalty Rate',     factor_low: 0.8, factor_high: 1.2, regimes: ['JV'] },
  { variable: 'jv_tax_rate_pct',             label: 'JV Tax Rate',         factor_low: 0.8, factor_high: 1.2, regimes: ['JV'] },

  // PSC-specific
  { variable: 'psc_royalty_pct',             label: 'PSC Royalty Rate',    factor_low: 0.8, factor_high: 1.2, regimes: ['PSC'] },
  { variable: 'psc_cost_oil_cap_pct',        label: 'Cost Oil Cap',        factor_low: 0.8, factor_high: 1.2, regimes: ['PSC'] },
  { variable: 'psc_contractor_profit_share_pct', label: 'Contractor Profit Share', factor_low: 0.8, factor_high: 1.2, regimes: ['PSC'] },
  { variable: 'psc_tax_rate_pct',            label: 'PSC Tax Rate',        factor_low: 0.8, factor_high: 1.2, regimes: ['PSC'] },

  // PIA-specific
  { variable: 'pia_cit_rate_pct',            label: 'CIT Rate',            factor_low: 0.8, factor_high: 1.2, regimes: ['PIA'] },
  { variable: 'pia_tet_rate_pct',            label: 'TET Rate',            factor_low: 0.8, factor_high: 1.2, regimes: ['PIA'] },
  { variable: 'pia_cpr_limit_pct',           label: 'CPR Cap',             factor_low: 0.8, factor_high: 1.2, regimes: ['PIA'] },
  { variable: 'pia_production_allowance_per_bbl_converted', label: 'Production Allowance ($/bbl)', factor_low: 0.8, factor_high: 1.2, regimes: ['PIA'] },
];

// CAPEX and OPEX are swept by varying the escalators rather than the CSV totals.
// This is a v1 simplification: the actual CAPEX/OPEX amounts live in CSVs and
// modifying them mid-run is more invasive. The escalator sweep approximates
// the same effect on multi-year runs but has near-zero effect on year-0-only
// runs (like the PIA validation case).
//
// A future enhancement could let the batch function scale prodRows/capexRows/
// opexRows directly. For now we sweep what's in the config.
const CAPEX_OPEX_SWEEPS: SweepDef[] = [
  // Inline-multiply CSV totals using a special handling path below
  { variable: '__capex_multiplier',          label: 'CAPEX',               factor_low: 0.8, factor_high: 1.2, regimes: ['JV', 'PSC', 'PIA'] },
  { variable: '__opex_multiplier',           label: 'OPEX',                factor_low: 0.8, factor_high: 1.2, regimes: ['JV', 'PSC', 'PIA'] },
];

// ============================================================================
// MAIN
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startTs = Date.now();
  let sensitivityRunId: string | null = null;
  let supabase: any = null;

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Missing Supabase environment configuration.');
    supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { run_id, base_run_config_id, sensitivity_run_id } = await req.json();
    if (!run_id || !base_run_config_id || !sensitivity_run_id) {
      throw new Error('Missing run_id, base_run_config_id, or sensitivity_run_id.');
    }
    sensitivityRunId = sensitivity_run_id;

    // Mark sensitivity run as 'running'
    await supabase.from('epe_sensitivity_runs')
      .update({ status: 'running' })
      .eq('id', sensitivity_run_id);

    // Load base run + config
    const { data: run, error: runErr } = await supabase
      .from('epe_runs').select('id, case_id, user_id').eq('id', run_id).single();
    if (runErr) throw new Error(`Run lookup failed: ${runErr.message}`);

    const { data: baseCfg, error: cfgErr } = await supabase
      .from('epe_run_configs').select('*').eq('id', base_run_config_id).single();
    if (cfgErr) throw new Error(`Run config lookup failed: ${cfgErr.message}`);

    // Load CSV data once
    const [prodRes, capexRes, opexRes] = await Promise.all([
      supabase.from('epe_production_volumes').select('data').eq('case_id', run.case_id),
      supabase.from('epe_capex').select('data').eq('case_id', run.case_id),
      supabase.from('epe_opex').select('data').eq('case_id', run.case_id),
    ]);
    if (prodRes.error) throw new Error(`Production lookup failed: ${prodRes.error.message}`);
    if (capexRes.error) throw new Error(`Capex lookup failed: ${capexRes.error.message}`);
    if (opexRes.error) throw new Error(`Opex lookup failed: ${opexRes.error.message}`);

    const prodRows = (prodRes.data || []).flatMap((r: any) => Array.isArray(r.data) ? r.data : []);
    const capexRows = (capexRes.data || []).flatMap((r: any) => Array.isArray(r.data) ? r.data : []);
    const opexRows = (opexRes.data || []).flatMap((r: any) => Array.isArray(r.data) ? r.data : []);

    if (prodRows.length === 0) throw new Error('No production data found.');

    // -------------------------------------------------------------------
    // Base run: compute NPV with unmodified config
    // -------------------------------------------------------------------
    const baseResult = computeCashFlow({ cfg: baseCfg, prodRows, capexRows, opexRows });
    const baseNpv = baseResult.kpis.npv;

    // Update sensitivity_runs with base_npv
    await supabase.from('epe_sensitivity_runs')
      .update({ base_npv: baseNpv })
      .eq('id', sensitivity_run_id);

    // -------------------------------------------------------------------
    // Build the regime-specific sweep list
    // -------------------------------------------------------------------
    const regime = baseCfg.fiscal_regime;
    const applicableSweeps = SWEEPS_ALL.filter(s => s.regimes.includes(regime));
    const applicableCapexOpex = CAPEX_OPEX_SWEEPS.filter(s => s.regimes.includes(regime));

    const sweepResults: any[] = [];

    // -------------------------------------------------------------------
    // Config-field sweeps: clone cfg, override the variable, run engine twice
    // -------------------------------------------------------------------
    for (const sweep of applicableSweeps) {
      const baseValue = Number(baseCfg[sweep.variable]);
      if (baseValue === null || baseValue === undefined || isNaN(baseValue)) {
        // Skip sweeps where the base config has no usable value
        continue;
      }
      let lowValue = baseValue * sweep.factor_low;
      let highValue = baseValue * sweep.factor_high;
      if (sweep.floor !== undefined) {
        lowValue = Math.max(lowValue, sweep.floor);
        highValue = Math.max(highValue, sweep.floor);
      }

      // Low variant
      const lowCfg = { ...baseCfg, [sweep.variable]: lowValue };
      const lowResult = computeCashFlow({ cfg: lowCfg, prodRows, capexRows, opexRows });
      const lowNpv = lowResult.kpis.npv;

      // High variant
      const highCfg = { ...baseCfg, [sweep.variable]: highValue };
      const highResult = computeCashFlow({ cfg: highCfg, prodRows, capexRows, opexRows });
      const highNpv = highResult.kpis.npv;

      const deltaLow = lowNpv - baseNpv;
      const deltaHigh = highNpv - baseNpv;

      sweepResults.push({
        sensitivity_run_id,
        variable: sweep.variable,
        variable_label: sweep.label,
        base_value: baseValue,
        low_factor: sweep.factor_low,
        high_factor: sweep.factor_high,
        low_value: lowValue,
        high_value: highValue,
        base_npv: baseNpv,
        low_npv: lowNpv,
        high_npv: highNpv,
        delta_low_npv: deltaLow,
        delta_high_npv: deltaHigh,
        max_abs_delta: Math.max(Math.abs(deltaLow), Math.abs(deltaHigh)),
      });
    }

    // -------------------------------------------------------------------
    // CAPEX/OPEX sweeps: scale the CSV totals before passing to engine
    // -------------------------------------------------------------------
    for (const sweep of applicableCapexOpex) {
      const isCapex = sweep.variable === '__capex_multiplier';
      const isOpex = sweep.variable === '__opex_multiplier';

      const scaleRows = (rows: any[], factor: number): any[] => {
        return rows.map((r: any) => {
          const cloned = { ...r };
          // Scale all USD-denominated numeric fields
          for (const k of Object.keys(cloned)) {
            if (k.endsWith('_usd') || k === 'amount_usd' || k === 'total_opex_usd') {
              const v = Number(cloned[k]);
              if (!isNaN(v)) cloned[k] = v * factor;
            }
          }
          return cloned;
        });
      };

      const lowCapex = isCapex ? scaleRows(capexRows, sweep.factor_low) : capexRows;
      const highCapex = isCapex ? scaleRows(capexRows, sweep.factor_high) : capexRows;
      const lowOpex = isOpex ? scaleRows(opexRows, sweep.factor_low) : opexRows;
      const highOpex = isOpex ? scaleRows(opexRows, sweep.factor_high) : opexRows;

      const lowResult = computeCashFlow({ cfg: baseCfg, prodRows, capexRows: lowCapex, opexRows: lowOpex });
      const highResult = computeCashFlow({ cfg: baseCfg, prodRows, capexRows: highCapex, opexRows: highOpex });
      const lowNpv = lowResult.kpis.npv;
      const highNpv = highResult.kpis.npv;
      const deltaLow = lowNpv - baseNpv;
      const deltaHigh = highNpv - baseNpv;

      // base_value for CAPEX/OPEX: total $ across years
      const baseTotal = isCapex
        ? capexRows.reduce((s, r) => s + (Number(r.amount_usd) || 0), 0)
        : opexRows.reduce((s, r) => s + (Number(r.total_opex_usd) || 0), 0);

      sweepResults.push({
        sensitivity_run_id,
        variable: sweep.variable,
        variable_label: sweep.label,
        base_value: baseTotal,
        low_factor: sweep.factor_low,
        high_factor: sweep.factor_high,
        low_value: baseTotal * sweep.factor_low,
        high_value: baseTotal * sweep.factor_high,
        base_npv: baseNpv,
        low_npv: lowNpv,
        high_npv: highNpv,
        delta_low_npv: deltaLow,
        delta_high_npv: deltaHigh,
        max_abs_delta: Math.max(Math.abs(deltaLow), Math.abs(deltaHigh)),
      });
    }

    // -------------------------------------------------------------------
    // Sort by max_abs_delta DESC and assign ordinals (biggest first = top of tornado)
    // -------------------------------------------------------------------
    sweepResults.sort((a, b) => b.max_abs_delta - a.max_abs_delta);
    sweepResults.forEach((r, i) => { r.ordinal = i; });

    // Write results to DB
    const { error: insertErr } = await supabase
      .from('epe_sensitivity_results')
      .insert(sweepResults);
    if (insertErr) throw new Error(`Result insert failed: ${insertErr.message}`);

    // Mark sensitivity run complete
    const durationMs = Date.now() - startTs;
    await supabase.from('epe_sensitivity_runs')
      .update({
        status: 'complete',
        sweeps_count: sweepResults.length,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq('id', sensitivity_run_id);

    return new Response(
      JSON.stringify({
        success: true,
        sensitivity_run_id,
        base_npv: baseNpv,
        sweeps_count: sweepResults.length,
        duration_ms: durationMs,
        results: sweepResults,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[epe-cash-flow-engine-batch] error:', err);

    // Mark the sensitivity run as failed if we got far enough to know its ID
    if (supabase && sensitivityRunId) {
      try {
        await supabase.from('epe_sensitivity_runs')
          .update({
            status: 'failed',
            error_message: err?.message || 'Unknown error',
            duration_ms: Date.now() - startTs,
          })
          .eq('id', sensitivityRunId);
      } catch (_) { /* swallow */ }
    }

    return new Response(
      JSON.stringify({ error: err?.message || 'Batch engine failed.', stack: err?.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
