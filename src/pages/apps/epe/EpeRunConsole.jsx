import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayCircle, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/customSupabaseClient';

// ----------------------------------------------------------------------------
// Defaults match the schema column defaults in epe_run_configs
// ----------------------------------------------------------------------------
const DEFAULT_CONFIG = {
  oil_price_usd_bbl: 75,
  gas_price_usd_mscf: 4.5,
  condensate_price_usd_bbl: 70,
  discount_rate_pct: 10,
  inflation_rate_pct: 3,
  base_year: 2027,
  // ---- B1: escalators (default mirror inflation_rate_pct except capex) ----
  oil_price_escalator_pct: 3,
  gas_price_escalator_pct: 3,
  condensate_price_escalator_pct: 3,
  opex_escalator_pct: 3,
  capex_escalator_pct: 0,
  present_value_basis: 'real',
  // ---- B2: PIA 2021 fiscal regime ----
  pia_terrain: 'shallow_water',
  pia_license_type: 'PML',
  pia_lease_status: 'converted',
  pia_water_depth_m: 100,
  pia_marginal_field_pre_2021: false,
  pia_hct_rate_override_pct: null,
  pia_cit_rate_pct: 30,
  pia_tet_rate_pct: 2.5,
  pia_nddc_levy_pct_of_opex: 3,
  pia_nddc_levy_fixed_usd: null,
  pia_prior_year_opex_usd: null,
  pia_capex_recovery_years: 5,
  pia_cpr_limit_pct: 65,
  pia_production_allowance_per_bbl_converted: 2.50,
  pia_production_allowance_per_bbl_new: 8.00,
  pia_production_allowance_pct_of_price: 20,
  // ---- B2.5: NTA 2025 fiscal framework ----
  pia_under_nta_2025_override: 'auto',
  pia_deep_offshore_hct_interpretation: 'conservative_zero',
  pia_deep_offshore_hct_custom_rate_pct: null,
  pia_development_levy_rate_pct: 4.0,
  pia_new_lease_prod_alw_cap_onshore_bbl: 50000000,
  pia_new_lease_prod_alw_cap_shallow_bbl: 100000000,
  pia_new_lease_prod_alw_cap_deep_bbl: 500000000,
  pia_prior_cumulative_oil_bbl: 0,
  // ---- v3.4: field life ----
  apply_economic_limit: false,
  abandonment_cost_usd: null,
  abandonment_year: null,
  fiscal_regime: 'JV',
  // JV
  jv_working_interest_pct: 100,
  jv_royalty_pct: 10,
  jv_tax_rate_pct: 50,
  // PSC
  psc_royalty_pct: 10,
  psc_cost_oil_cap_pct: 80,
  psc_contractor_profit_share_pct: 50,
  psc_tax_rate_pct: 50,
};

const formatTimestampForName = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const EpeRunConsole = () => {
  const { caseId } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [isRunning, setIsRunning] = useState(false);
  const [runName, setRunName] = useState(`Run ${formatTimestampForName()}`);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [saveAsScenario, setSaveAsScenario] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const [showAdvancedEscalation, setShowAdvancedEscalation] = useState(false);
  const [showPiaAdvancedRates, setShowPiaAdvancedRates] = useState(false);
  const [showPiaAdvancedLevies, setShowPiaAdvancedLevies] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [loadedConfigId, setLoadedConfigId] = useState('');

  // Copy a saved epe_run_configs row into the form. Only keys the form knows
  // about are taken; DB nulls fall back to the field's default so a partial
  // legacy row cannot blank out required inputs.
  const applyConfigRow = useCallback((row) => {
    setConfig(() => {
      const next = { ...DEFAULT_CONFIG };
      for (const key of Object.keys(DEFAULT_CONFIG)) {
        if (row[key] !== null && row[key] !== undefined) next[key] = row[key];
      }
      return next;
    });
    setValidationErrors({});
  }, []);

  // Saved scenarios for this case, newest first; also honors ?fromConfig=<id>
  // ("re-run with edits" from the results viewer).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from('epe_run_configs')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled || error || !data) return;
      setSavedConfigs(data);
      const fromConfig = searchParams.get('fromConfig');
      if (fromConfig) {
        const row = data.find((r) => r.id === fromConfig);
        if (row) {
          applyConfigRow(row);
          setLoadedConfigId(row.id);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [caseId, searchParams, applyConfigRow]);

  const handleNumberChange = (key, value) => {
    // null = "cleared optional field" (HCT override, NDDC fixed, abandonment):
    // it must stay null, not become Number(null) === 0 — an explicit 0 means
    // something different for these fields (e.g. a 0% HCT override).
    setConfig((prev) => ({ ...prev, [key]: value === null ? null : (value === '' ? '' : Number(value)) }));
    if (validationErrors[key]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const setRegime = (regime) => {
    setConfig((prev) => ({ ...prev, fiscal_regime: regime }));
  };

  const validate = () => {
    const errors = {};
    const nonNegative = [
      'oil_price_usd_bbl', 'gas_price_usd_mscf', 'condensate_price_usd_bbl',
    ];
    const percentFields = [
      'discount_rate_pct', 'inflation_rate_pct',
    ];

    nonNegative.forEach((k) => {
      if (config[k] === '' || isNaN(config[k]) || config[k] < 0) {
        errors[k] = 'Must be a non-negative number';
      }
    });
    // A $0 oil price silently produces a $0-revenue run; require a real price.
    if (!errors.oil_price_usd_bbl && Number(config.oil_price_usd_bbl) <= 0) {
      errors.oil_price_usd_bbl = 'Oil price must be greater than zero';
    }
    percentFields.forEach((k) => {
      if (config[k] === '' || isNaN(config[k]) || config[k] < 0 || config[k] > 100) {
        errors[k] = 'Must be 0–100';
      }
    });
    if (!Number.isInteger(Number(config.base_year)) || config.base_year < 1990 || config.base_year > 2100) {
      errors.base_year = 'Enter a 4-digit year';
    }
    if (config.abandonment_cost_usd !== null && config.abandonment_cost_usd !== '' &&
        (isNaN(config.abandonment_cost_usd) || config.abandonment_cost_usd < 0)) {
      errors.abandonment_cost_usd = 'Must be a non-negative amount';
    }
    if (config.abandonment_year !== null && config.abandonment_year !== '' &&
        (!Number.isInteger(Number(config.abandonment_year)) || config.abandonment_year < 1990 || config.abandonment_year > 2100)) {
      errors.abandonment_year = 'Enter a 4-digit year (or leave blank for the final year)';
    }

    if (config.fiscal_regime === 'JV') {
      ['jv_working_interest_pct', 'jv_royalty_pct', 'jv_tax_rate_pct'].forEach((k) => {
        if (config[k] === '' || isNaN(config[k]) || config[k] < 0 || config[k] > 100) {
          errors[k] = 'Must be 0–100';
        }
      });
    } else {
      ['psc_royalty_pct', 'psc_cost_oil_cap_pct', 'psc_contractor_profit_share_pct', 'psc_tax_rate_pct'].forEach((k) => {
        if (config[k] === '' || isNaN(config[k]) || config[k] < 0 || config[k] > 100) {
          errors[k] = 'Must be 0–100';
        }
      });
    }

    if (saveAsScenario && !scenarioName.trim()) {
      errors.scenarioName = 'Provide a scenario name or uncheck the box';
    }
    if (!runName.trim()) {
      errors.runName = 'Run name required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRun = async () => {
    if (!validate()) {
      toast({
        title: 'Check your inputs',
        description: 'One or more fields need attention.',
        variant: 'destructive',
      });
      return;
    }

    setIsRunning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated.');

      // Build config payload — only include params relevant to selected regime
      // (DB has columns for both, but we keep payload tidy; defaults apply for the inactive set)
      const configPayload = {
        case_id: caseId,
        user_id: user.id,
        config_name: saveAsScenario && scenarioName.trim()
          ? scenarioName.trim()
          : `Run-Config ${formatTimestampForName()}`,
        description: saveAsScenario ? `Reusable scenario: ${scenarioName.trim()}` : 'Inline run config',
        oil_price_usd_bbl: config.oil_price_usd_bbl,
        gas_price_usd_mscf: config.gas_price_usd_mscf,
        condensate_price_usd_bbl: config.condensate_price_usd_bbl,
        discount_rate_pct: config.discount_rate_pct,
        inflation_rate_pct: config.inflation_rate_pct,
        base_year: config.base_year,
        fiscal_regime: config.fiscal_regime,
        jv_working_interest_pct: config.jv_working_interest_pct,
        jv_royalty_pct: config.jv_royalty_pct,
        jv_tax_rate_pct: config.jv_tax_rate_pct,
        psc_royalty_pct: config.psc_royalty_pct,
        psc_cost_oil_cap_pct: config.psc_cost_oil_cap_pct,
        psc_contractor_profit_share_pct: config.psc_contractor_profit_share_pct,
        psc_tax_rate_pct: config.psc_tax_rate_pct,
        // ---- B1 additions ----
        oil_price_escalator_pct: config.oil_price_escalator_pct,
        gas_price_escalator_pct: config.gas_price_escalator_pct,
        condensate_price_escalator_pct: config.condensate_price_escalator_pct,
        opex_escalator_pct: config.opex_escalator_pct,
        capex_escalator_pct: config.capex_escalator_pct,
        present_value_basis: config.present_value_basis,
        // ---- B2 PIA additions ----
        pia_terrain: config.pia_terrain,
        pia_license_type: config.pia_license_type,
        pia_lease_status: config.pia_lease_status,
        pia_water_depth_m: config.pia_water_depth_m,
        pia_marginal_field_pre_2021: config.pia_marginal_field_pre_2021,
        pia_hct_rate_override_pct: config.pia_hct_rate_override_pct,
        pia_cit_rate_pct: config.pia_cit_rate_pct,
        pia_tet_rate_pct: config.pia_tet_rate_pct,
        pia_nddc_levy_pct_of_opex: config.pia_nddc_levy_pct_of_opex,
        pia_nddc_levy_fixed_usd: config.pia_nddc_levy_fixed_usd,
        pia_prior_year_opex_usd: config.pia_prior_year_opex_usd,
        pia_capex_recovery_years: config.pia_capex_recovery_years,
        pia_cpr_limit_pct: config.pia_cpr_limit_pct,
        pia_production_allowance_per_bbl_converted: config.pia_production_allowance_per_bbl_converted,
        pia_production_allowance_per_bbl_new: config.pia_production_allowance_per_bbl_new,
        pia_production_allowance_pct_of_price: config.pia_production_allowance_pct_of_price,
        // ---- B2.5 NTA additions ----
        pia_under_nta_2025_override: config.pia_under_nta_2025_override,
        pia_deep_offshore_hct_interpretation: config.pia_deep_offshore_hct_interpretation,
        pia_deep_offshore_hct_custom_rate_pct: config.pia_deep_offshore_hct_custom_rate_pct,
        pia_development_levy_rate_pct: config.pia_development_levy_rate_pct,
        pia_new_lease_prod_alw_cap_onshore_bbl: config.pia_new_lease_prod_alw_cap_onshore_bbl,
        pia_new_lease_prod_alw_cap_shallow_bbl: config.pia_new_lease_prod_alw_cap_shallow_bbl,
        pia_new_lease_prod_alw_cap_deep_bbl: config.pia_new_lease_prod_alw_cap_deep_bbl,
        pia_prior_cumulative_oil_bbl: config.pia_prior_cumulative_oil_bbl,
        // ---- v3.4: field life ----
        apply_economic_limit: config.apply_economic_limit === true,
        abandonment_cost_usd: config.abandonment_cost_usd === '' ? null : config.abandonment_cost_usd,
        abandonment_year: config.abandonment_year === '' ? null : config.abandonment_year,
      };

      // 1. Insert config
      const { data: cfgRow, error: cfgErr } = await supabase
        .from('epe_run_configs')
        .insert(configPayload)
        .select('id')
        .single();
      if (cfgErr) throw new Error(`Saving run config failed: ${cfgErr.message}`);

      // 2. Insert run record (engine reads case_id via run_id lookup)
      const { data: runRow, error: runErr } = await supabase
        .from('epe_runs')
        .insert({
          case_id: caseId,
          user_id: user.id,
          run_name: runName.trim(),
          parameters: { source: 'EpeRunConsole', regime: config.fiscal_regime },
          run_config_id: cfgRow.id,
          status: 'running',
        })
        .select('id')
        .single();
      if (runErr) throw new Error(`Creating run record failed: ${runErr.message}`);

      // 3. Invoke engine — it writes epe_results itself
      const { data: engineData, error: engineErr } = await supabase.functions.invoke(
        'epe-cash-flow-engine',
        { body: { run_id: runRow.id, run_config_id: cfgRow.id } }
      );
      if (engineErr || engineData?.error) {
        // Wave A: the failed run row is KEPT (the engine marks it status
        // 'failed' with the error message) so the failure stays auditable in
        // Run History.
        if (engineErr) {
          // On a non-2xx the invoke error message is generic ("Edge Function
          // returned a non-2xx status code") — pull the engine's real message
          // (e.g. ingestion validation failures) out of the response body.
          let detail = engineErr.message;
          try {
            const body = await engineErr.context?.json?.();
            if (body?.error) detail = body.error;
          } catch (_) { /* keep generic message */ }
          // Best effort, only if the engine never got to stamp it itself
          // (e.g. network failure before the function ran).
          await supabase.from('epe_runs')
            .update({ status: 'failed', error_message: detail })
            .eq('id', runRow.id).eq('status', 'running')
            .then(() => {}, () => {});
          throw new Error(`Engine failed: ${detail}`);
        }
        throw new Error(`Engine error: ${engineData.error}`);
      }

      toast({
        title: 'Analysis complete',
        description: `NPV: $${Number(engineData?.kpis?.npv || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      });

      navigate(`/dashboard/apps/economics/epe/runs/${runRow.id}`);
    } catch (error) {
      console.error('Economic run failed:', error);
      toast({
        title: 'Run failed',
        description: error?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsRunning(false);
    }
  };

  // -------------------------------------------------------------------------
  // Reusable input field with error display
  // -------------------------------------------------------------------------
  const NumField = ({ id, label, suffix, value, onChange, step = 'any' }) => (
    <div>
      <Label htmlFor={id} className="text-white text-sm">
        {label} {suffix && <span className="text-slate-400">({suffix})</span>}
      </Label>
      <Input
        id={id}
        type="number"
        step={step}
        value={value === '' ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        className={`bg-gray-800 border-slate-600 text-white ${validationErrors[id] ? 'border-red-500' : ''}`}
      />
      {validationErrors[id] && (
        <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {validationErrors[id]}
        </p>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>{`Run Console - Petroleum Economics Studio`}</title>
      </Helmet>

      <div className="p-8 max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <Link to={`/dashboard/apps/economics/epe/cases/${caseId}`} className="mb-4 inline-block">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Case Details
            </Button>
          </Link>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-orange-500 to-red-500 p-3 rounded-xl">
              <PlayCircle className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Run Console</h1>
              <p className="text-lime-200 text-lg">Configure economic parameters and run the analysis</p>
            </div>
          </div>
        </motion.div>

        {/* Form card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6 space-y-8"
        >
          {/* Run Name */}
          <div>
            <Label htmlFor="runName" className="text-white text-sm">Run Name</Label>
            <Input
              id="runName"
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
              className={`bg-gray-800 border-slate-600 text-white ${validationErrors.runName ? 'border-red-500' : ''}`}
            />
            {validationErrors.runName && (
              <p className="text-red-400 text-xs mt-1">{validationErrors.runName}</p>
            )}
          </div>

          {/* Start from a saved scenario (fixes the write-only scenario gap:
              every prior run's config is now one click away) */}
          {savedConfigs.length > 0 && (
            <div>
              <Label htmlFor="loadScenario" className="text-white text-sm">Start from saved scenario</Label>
              <select
                id="loadScenario"
                value={loadedConfigId}
                onChange={(e) => {
                  const id = e.target.value;
                  setLoadedConfigId(id);
                  if (!id) {
                    setConfig(DEFAULT_CONFIG);
                    setValidationErrors({});
                    return;
                  }
                  const row = savedConfigs.find((r) => r.id === id);
                  if (row) applyConfigRow(row);
                }}
                className="w-full bg-gray-800 border border-slate-600 rounded px-2 py-2 text-sm text-white"
              >
                <option value="">Defaults (start fresh)</option>
                {savedConfigs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.config_name}{r.created_at ? ` (${new Date(r.created_at).toLocaleDateString()})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Loads that run's full configuration into the form. Edit anything, then run.
              </p>
            </div>
          )}

          {/* Pricing */}
          <section>
            <h2 className="text-white text-lg font-semibold mb-3 border-b border-white/20 pb-1">Pricing</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <NumField
                id="oil_price_usd_bbl"
                label="Oil price"
                suffix="USD/bbl"
                value={config.oil_price_usd_bbl}
                onChange={(v) => handleNumberChange('oil_price_usd_bbl', v)}
              />
              <NumField
                id="gas_price_usd_mscf"
                label="Gas price"
                suffix="USD/mscf"
                value={config.gas_price_usd_mscf}
                onChange={(v) => handleNumberChange('gas_price_usd_mscf', v)}
              />
              <NumField
                id="condensate_price_usd_bbl"
                label="Condensate price"
                suffix="USD/bbl"
                value={config.condensate_price_usd_bbl}
                onChange={(v) => handleNumberChange('condensate_price_usd_bbl', v)}
              />
            </div>
          </section>

          {/* Discounting */}
          <section>
            <h2 className="text-white text-lg font-semibold mb-3 border-b border-white/20 pb-1">Discounting & Inflation</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <NumField
                id="discount_rate_pct"
                label="Discount rate"
                suffix="%"
                value={config.discount_rate_pct}
                onChange={(v) => handleNumberChange('discount_rate_pct', v)}
              />
              <NumField
                id="inflation_rate_pct"
                label="Inflation rate"
                suffix="%"
                value={config.inflation_rate_pct}
                onChange={(v) => handleNumberChange('inflation_rate_pct', v)}
              />
              <NumField
                id="base_year"
                label="Base year"
                value={config.base_year}
                onChange={(v) => handleNumberChange('base_year', v)}
                step="1"
              />
            </div>
          </section>

          {/* Field Life (v3.4) */}
          <section>
            <h2 className="text-white text-lg font-semibold mb-3 border-b border-white/20 pb-1">Field Life</h2>
            <div className="flex items-center gap-2 mb-3">
              <Checkbox
                id="apply_economic_limit"
                checked={config.apply_economic_limit === true}
                onCheckedChange={(v) => setConfig((p) => ({ ...p, apply_economic_limit: v === true }))}
                className="border-slate-400"
              />
              <Label htmlFor="apply_economic_limit" className="text-white text-sm cursor-pointer">
                Apply economic limit test
              </Label>
            </div>
            <p className="text-xs text-slate-400 mb-4 -mt-2">
              Trims trailing years whose revenue no longer covers operating costs, so taxes and
              royalties never accrue on an uneconomic tail. The last economic year is reported in the KPIs.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumField
                id="abandonment_cost_usd"
                label="Abandonment cost"
                suffix="USD (blank = none)"
                value={config.abandonment_cost_usd ?? ''}
                onChange={(v) => handleNumberChange('abandonment_cost_usd', v === '' ? null : v)}
              />
              <NumField
                id="abandonment_year"
                label="Abandonment year"
                suffix="blank = final year"
                step="1"
                value={config.abandonment_year ?? ''}
                onChange={(v) => handleNumberChange('abandonment_year', v === '' ? null : v)}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Applied as a post-tax cash outflow in that year. It is not tax-deducted, not
              depreciated, and excluded from cost recovery.
            </p>
          </section>

          {/* Escalation & PV Basis */}
          <section>
            <div className="flex items-center justify-between border-b border-white/20 pb-1 mb-3">
              <h2 className="text-white text-lg font-semibold">Escalation & PV Basis</h2>
              <button
                type="button"
                onClick={() => setShowAdvancedEscalation((v) => !v)}
                className="text-xs text-cyan-300 hover:text-cyan-200 underline"
              >
                {showAdvancedEscalation ? 'Use simple inflation' : 'Customize per stream'}
              </button>
            </div>

            {!showAdvancedEscalation && (
              <p className="text-xs text-slate-400 mb-3">
                Using <span className="font-mono text-cyan-300">{config.inflation_rate_pct}%</span> as
                inflation/escalation for oil, gas, condensate, and opex. Capex assumed nominal
                (no escalation). NPV reported in real (base-year) dollars.
              </p>
            )}

            {showAdvancedEscalation && (
              <>
                <p className="text-xs text-slate-400 mb-3">
                  Override each stream's annual escalation rate. Cash flows are computed in
                  nominal terms then deflated to the chosen basis for NPV.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                  <NumField
                    id="oil_price_escalator_pct"
                    label="Oil price escalator"
                    suffix="%/yr"
                    value={config.oil_price_escalator_pct}
                    onChange={(v) => handleNumberChange('oil_price_escalator_pct', v)}
                  />
                  <NumField
                    id="gas_price_escalator_pct"
                    label="Gas price escalator"
                    suffix="%/yr"
                    value={config.gas_price_escalator_pct}
                    onChange={(v) => handleNumberChange('gas_price_escalator_pct', v)}
                  />
                  <NumField
                    id="condensate_price_escalator_pct"
                    label="Condensate escalator"
                    suffix="%/yr"
                    value={config.condensate_price_escalator_pct}
                    onChange={(v) => handleNumberChange('condensate_price_escalator_pct', v)}
                  />
                  <NumField
                    id="opex_escalator_pct"
                    label="OPEX escalator"
                    suffix="%/yr"
                    value={config.opex_escalator_pct}
                    onChange={(v) => handleNumberChange('opex_escalator_pct', v)}
                  />
                  <NumField
                    id="capex_escalator_pct"
                    label="CAPEX escalator"
                    suffix="%/yr"
                    value={config.capex_escalator_pct}
                    onChange={(v) => handleNumberChange('capex_escalator_pct', v)}
                  />
                </div>
              </>
            )}

            <div>
              <Label className="text-white text-sm mb-1 block">Present Value basis</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setConfig((p) => ({ ...p, present_value_basis: 'real' }))}
                  className={config.present_value_basis === 'real'
                    ? 'bg-gradient-to-r from-green-500 to-cyan-500 text-white'
                    : 'bg-gray-700 text-slate-300 hover:bg-gray-600'}
                >
                  Real (base-year)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setConfig((p) => ({ ...p, present_value_basis: 'nominal' }))}
                  className={config.present_value_basis === 'nominal'
                    ? 'bg-gradient-to-r from-green-500 to-cyan-500 text-white'
                    : 'bg-gray-700 text-slate-300 hover:bg-gray-600'}
                >
                  Nominal
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {config.present_value_basis === 'real'
                  ? 'NPV in base-year dollars (deflated using inflation rate).'
                  : 'NPV in then-current dollars (no deflation applied).'}
              </p>
            </div>
          </section>

          {/* Fiscal Regime */}
          <section>
            <h2 className="text-white text-lg font-semibold mb-3 border-b border-white/20 pb-1">Fiscal Regime</h2>
            <div className="flex gap-3 mb-4">
              <Button
                type="button"
                onClick={() => setRegime('JV')}
                className={config.fiscal_regime === 'JV'
                  ? 'bg-gradient-to-r from-green-500 to-cyan-500 text-white'
                  : 'bg-gray-700 text-slate-300 hover:bg-gray-600'}
              >
                Joint Venture (JV)
              </Button>
              <Button
                type="button"
                onClick={() => setRegime('PSC')}
                className={config.fiscal_regime === 'PSC'
                  ? 'bg-gradient-to-r from-green-500 to-cyan-500 text-white'
                  : 'bg-gray-700 text-slate-300 hover:bg-gray-600'}
              >
                Production Sharing (PSC)
              </Button>
              <Button
                type="button"
                onClick={() => setRegime('PIA')}
                className={config.fiscal_regime === 'PIA'
                  ? 'bg-gradient-to-r from-green-500 to-cyan-500 text-white'
                  : 'bg-gray-700 text-slate-300 hover:bg-gray-600'}
              >
                PIA 2021 (Nigeria)
              </Button>
            </div>

            {config.fiscal_regime === 'JV' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <NumField
                  id="jv_working_interest_pct"
                  label="Working interest"
                  suffix="%"
                  value={config.jv_working_interest_pct}
                  onChange={(v) => handleNumberChange('jv_working_interest_pct', v)}
                />
                <NumField
                  id="jv_royalty_pct"
                  label="Royalty"
                  suffix="%"
                  value={config.jv_royalty_pct}
                  onChange={(v) => handleNumberChange('jv_royalty_pct', v)}
                />
                <NumField
                  id="jv_tax_rate_pct"
                  label="Tax rate"
                  suffix="%"
                  value={config.jv_tax_rate_pct}
                  onChange={(v) => handleNumberChange('jv_tax_rate_pct', v)}
                />
              </div>
            ) : config.fiscal_regime === 'PSC' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NumField
                  id="psc_royalty_pct"
                  label="Royalty"
                  suffix="%"
                  value={config.psc_royalty_pct}
                  onChange={(v) => handleNumberChange('psc_royalty_pct', v)}
                />
                <NumField
                  id="psc_cost_oil_cap_pct"
                  label="Cost-oil cap"
                  suffix="% of revenue"
                  value={config.psc_cost_oil_cap_pct}
                  onChange={(v) => handleNumberChange('psc_cost_oil_cap_pct', v)}
                />
                <NumField
                  id="psc_contractor_profit_share_pct"
                  label="Contractor profit share"
                  suffix="%"
                  value={config.psc_contractor_profit_share_pct}
                  onChange={(v) => handleNumberChange('psc_contractor_profit_share_pct', v)}
                />
                <NumField
                  id="psc_tax_rate_pct"
                  label="Tax rate"
                  suffix="%"
                  value={config.psc_tax_rate_pct}
                  onChange={(v) => handleNumberChange('psc_tax_rate_pct', v)}
                />
              </div>
            ) : (
              <div className="space-y-6">
                {/* ── PIA Asset Profile ── */}
                <div>
                  <h3 className="text-white text-sm font-semibold mb-2">Asset Profile</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <Label className="text-white text-xs mb-1 block">Terrain</Label>
                      <div className="flex flex-wrap gap-1">
                        {[
                          ['onshore', 'Onshore'],
                          ['shallow_water', 'Shallow Water'],
                          ['deep_offshore', 'Deep Offshore'],
                          ['frontier', 'Frontier'],
                          ['marginal_field', 'Marginal Field'],
                        ].map(([key, label]) => (
                          <Button
                            key={key}
                            type="button"
                            size="sm"
                            onClick={() => setConfig((p) => ({ ...p, pia_terrain: key }))}
                            className={config.pia_terrain === key
                              ? 'bg-gradient-to-r from-green-500 to-cyan-500 text-white text-xs'
                              : 'bg-gray-700 text-slate-300 hover:bg-gray-600 text-xs'}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-white text-xs mb-1 block">License Type</Label>
                      <div className="flex gap-1">
                        {[['PML', 'PML'], ['PPL', 'PPL']].map(([key, label]) => (
                          <Button
                            key={key}
                            type="button"
                            size="sm"
                            onClick={() => setConfig((p) => ({ ...p, pia_license_type: key }))}
                            className={config.pia_license_type === key
                              ? 'bg-gradient-to-r from-green-500 to-cyan-500 text-white text-xs'
                              : 'bg-gray-700 text-slate-300 hover:bg-gray-600 text-xs'}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-white text-xs mb-1 block">Lease Status</Label>
                      <div className="flex gap-1">
                        {[['converted', 'Converted'], ['new', 'New']].map(([key, label]) => (
                          <Button
                            key={key}
                            type="button"
                            size="sm"
                            onClick={() => setConfig((p) => ({ ...p, pia_lease_status: key }))}
                            className={config.pia_lease_status === key
                              ? 'bg-gradient-to-r from-green-500 to-cyan-500 text-white text-xs'
                              : 'bg-gray-700 text-slate-300 hover:bg-gray-600 text-xs'}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <NumField
                      id="pia_water_depth_m"
                      label="Water depth"
                      suffix="m"
                      value={config.pia_water_depth_m}
                      onChange={(v) => handleNumberChange('pia_water_depth_m', v)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pia_marginal_field_pre_2021"
                      checked={config.pia_marginal_field_pre_2021}
                      onCheckedChange={(v) => setConfig((p) => ({ ...p, pia_marginal_field_pre_2021: v }))}
                      className="border-slate-400"
                    />
                    <Label htmlFor="pia_marginal_field_pre_2021" className="text-white text-xs cursor-pointer">
                      Marginal field declared before Jan 1, 2021 (15% HCT rate)
                    </Label>
                  </div>
                </div>

                {/* ── Tax Rates (collapsible advanced) ── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white text-sm font-semibold">Tax Rates</h3>
                    <button
                      type="button"
                      onClick={() => setShowPiaAdvancedRates((v) => !v)}
                      className="text-xs text-cyan-300 hover:text-cyan-200 underline"
                    >
                      {showPiaAdvancedRates ? 'Hide overrides' : 'Customize rates'}
                    </button>
                  </div>
                  {!showPiaAdvancedRates && (
                    <p className="text-xs text-slate-400">
                      Auto-derived HCT (terrain/license), CIT <span className="font-mono text-cyan-300">30%</span>, TET <span className="font-mono text-cyan-300">{config.pia_tet_rate_pct}%</span>
                    </p>
                  )}
                  {showPiaAdvancedRates && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <NumField
                          id="pia_hct_rate_override_pct"
                          label="HCT override"
                          suffix="% (blank = auto)"
                          value={config.pia_hct_rate_override_pct ?? ''}
                          onChange={(v) => handleNumberChange('pia_hct_rate_override_pct', v === '' ? null : v)}
                        />
                        <NumField
                          id="pia_cit_rate_pct"
                          label="CIT rate"
                          suffix="%"
                          value={config.pia_cit_rate_pct}
                          onChange={(v) => handleNumberChange('pia_cit_rate_pct', v)}
                        />
                        <NumField
                          id="pia_tet_rate_pct"
                          label="TET rate"
                          suffix="%"
                          value={config.pia_tet_rate_pct}
                          onChange={(v) => handleNumberChange('pia_tet_rate_pct', v)}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        TET default 2.5% per PIA transition. Later Finance Acts raised statutory rate to 3%.
                      </p>
                    </>
                  )}
                </div>

                {/* ── Levies & Allowances (collapsible advanced) ── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white text-sm font-semibold">Levies & Allowances</h3>
                    <button
                      type="button"
                      onClick={() => setShowPiaAdvancedLevies((v) => !v)}
                      className="text-xs text-cyan-300 hover:text-cyan-200 underline"
                    >
                      {showPiaAdvancedLevies ? 'Hide overrides' : 'Customize levies'}
                    </button>
                  </div>
                  {!showPiaAdvancedLevies && (
                    <p className="text-xs text-slate-400">
                      NDDC <span className="font-mono text-cyan-300">{config.pia_nddc_levy_pct_of_opex}%</span> of OPEX, CPR cap <span className="font-mono text-cyan-300">{config.pia_cpr_limit_pct}%</span>, Capex recovery <span className="font-mono text-cyan-300">{config.pia_capex_recovery_years}yr</span>, Prod. allowance <span className="font-mono text-cyan-300">${config.pia_lease_status === 'new' ? config.pia_production_allowance_per_bbl_new : config.pia_production_allowance_per_bbl_converted}/bbl</span>
                    </p>
                  )}
                  {showPiaAdvancedLevies && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <NumField
                          id="pia_nddc_levy_pct_of_opex"
                          label="NDDC levy"
                          suffix="% of OPEX"
                          value={config.pia_nddc_levy_pct_of_opex}
                          onChange={(v) => handleNumberChange('pia_nddc_levy_pct_of_opex', v)}
                        />
                        <NumField
                          id="pia_nddc_levy_fixed_usd"
                          label="NDDC fixed amount"
                          suffix="USD/yr (blank = use %)"
                          value={config.pia_nddc_levy_fixed_usd ?? ''}
                          onChange={(v) => handleNumberChange('pia_nddc_levy_fixed_usd', v === '' ? null : v)}
                        />
                        <NumField
                          id="pia_prior_year_opex_usd"
                          label="Prior-year OPEX"
                          suffix="USD (for yr-1 HCDT)"
                          value={config.pia_prior_year_opex_usd ?? ''}
                          onChange={(v) => handleNumberChange('pia_prior_year_opex_usd', v === '' ? null : v)}
                        />
                        <NumField
                          id="pia_capex_recovery_years"
                          label="Capex recovery"
                          suffix="years"
                          value={config.pia_capex_recovery_years}
                          onChange={(v) => handleNumberChange('pia_capex_recovery_years', v)}
                        />
                        <NumField
                          id="pia_cpr_limit_pct"
                          label="CPR cap"
                          suffix="% of revenue"
                          value={config.pia_cpr_limit_pct}
                          onChange={(v) => handleNumberChange('pia_cpr_limit_pct', v)}
                        />
                        <NumField
                          id="pia_production_allowance_pct_of_price"
                          label="Prod. allowance"
                          suffix="% of price (cap)"
                          value={config.pia_production_allowance_pct_of_price}
                          onChange={(v) => handleNumberChange('pia_production_allowance_pct_of_price', v)}
                        />
                        <NumField
                          id="pia_production_allowance_per_bbl_converted"
                          label="Allowance (converted)"
                          suffix="USD/bbl"
                          value={config.pia_production_allowance_per_bbl_converted}
                          onChange={(v) => handleNumberChange('pia_production_allowance_per_bbl_converted', v)}
                        />
                        <NumField
                          id="pia_production_allowance_per_bbl_new"
                          label="Allowance (new)"
                          suffix="USD/bbl"
                          value={config.pia_production_allowance_per_bbl_new}
                          onChange={(v) => handleNumberChange('pia_production_allowance_per_bbl_new', v)}
                        />

                      {/* ─── B2.5: Nigeria Tax Act 2025 Framework ─── */}
                      <div className="col-span-2 mt-4 pt-4 border-t border-white/10">
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-white text-sm font-semibold">Nigeria Tax Act 2025 Framework</Label>
                          <span className="text-xs px-2 py-0.5 rounded bg-cyan-900/50 text-cyan-200">
                            {(() => {
                              const ovr = config.pia_under_nta_2025_override;
                              if (ovr === 'force_pia') return 'PIA-only (forced)';
                              if (ovr === 'force_nta') return 'NTA-2025 (forced)';
                              return (config.base_year >= 2026) ? 'NTA-2025 (auto)' : 'PIA-only (auto)';
                            })()}
                          </span>
                        </div>
                        <p className="text-xs text-lime-200/60 mb-2">
                          NTA 2025 (in force since Jan 2026) introduces Development Levy 4% in place of TET 2.5%, and extends HCT to deep offshore. Auto-detection uses base_year ≥ 2026.
                        </p>

                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <Label className="text-white text-xs mb-1 block">Framework Override</Label>
                            <select
                              value={config.pia_under_nta_2025_override}
                              onChange={(e) => setConfig((p) => ({ ...p, pia_under_nta_2025_override: e.target.value }))}
                              className="w-full bg-slate-900/60 border border-white/20 rounded px-2 py-1.5 text-sm text-white"
                            >
                              <option value="auto">Auto (date-based)</option>
                              <option value="force_pia">Force PIA-only (pre-NTA)</option>
                              <option value="force_nta">Force NTA-2025</option>
                            </select>
                          </div>
                          <NumField
                            id="pia_development_levy_rate_pct"
                            label="Development Levy rate"
                            suffix="% (NTA only)"
                            value={config.pia_development_levy_rate_pct}
                            onChange={(v) => handleNumberChange('pia_development_levy_rate_pct', v)}
                          />
                        </div>

                        {config.pia_terrain === 'deep_offshore' && (
                          <div className="bg-amber-900/20 border border-amber-500/30 rounded p-2 mb-3">
                            <p className="text-amber-200 text-xs mb-2">
                              ⚠ NTA Section 65(4) extends HCT to deep offshore but specifies no rate. Industry interpretation is unsettled (Olaniwun Ajayi, Fortrose, Oct 2025–Jan 2026).
                            </p>
                            <Label className="text-white text-xs mb-1 block">Deep Offshore HCT Interpretation</Label>
                            <select
                              value={config.pia_deep_offshore_hct_interpretation}
                              onChange={(e) => setConfig((p) => ({ ...p, pia_deep_offshore_hct_interpretation: e.target.value }))}
                              className="w-full bg-slate-900/60 border border-white/20 rounded px-2 py-1.5 text-sm text-white"
                            >
                              <option value="conservative_zero">Conservative: 0% (effectively exempt)</option>
                              <option value="aggressive_pml_30">Aggressive: 30% (treat as PML)</option>
                              <option value="custom">Custom rate</option>
                            </select>
                            {config.pia_deep_offshore_hct_interpretation === 'custom' && (
                              <div className="mt-2">
                                <NumField
                                  id="pia_deep_offshore_hct_custom_rate_pct"
                                  label="Custom HCT rate"
                                  suffix="%"
                                  value={config.pia_deep_offshore_hct_custom_rate_pct ?? ''}
                                  onChange={(v) => handleNumberChange('pia_deep_offshore_hct_custom_rate_pct', v === '' ? null : v)}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 mb-3">
                          {config.pia_lease_status === 'new' && (
                            <NumField
                              id="pia_new_lease_volume_cap_bbl"
                              label={`Volume cap (${config.pia_terrain.replace('_', ' ')})`}
                              suffix="bbl (new leases only)"
                              value={
                                config.pia_terrain === 'onshore' ? config.pia_new_lease_prod_alw_cap_onshore_bbl :
                                (config.pia_terrain === 'deep_offshore' || config.pia_terrain === 'frontier') ? config.pia_new_lease_prod_alw_cap_deep_bbl :
                                config.pia_new_lease_prod_alw_cap_shallow_bbl
                              }
                              onChange={(v) => {
                                const fieldName = config.pia_terrain === 'onshore' ? 'pia_new_lease_prod_alw_cap_onshore_bbl' :
                                                  (config.pia_terrain === 'deep_offshore' || config.pia_terrain === 'frontier') ? 'pia_new_lease_prod_alw_cap_deep_bbl' :
                                                  'pia_new_lease_prod_alw_cap_shallow_bbl';
                                handleNumberChange(fieldName, v);
                              }}
                            />
                          )}
                          <NumField
                            id="pia_prior_cumulative_oil_bbl"
                            label="Prior cumulative oil"
                            suffix="bbl (brownfield start)"
                            value={config.pia_prior_cumulative_oil_bbl}
                            onChange={(v) => handleNumberChange('pia_prior_cumulative_oil_bbl', v)}
                          />
                        </div>

                        {/* Minimum ETR (NTA §57): the toggle shipped here before the
                            engine implemented the math, so checking it changed
                            nothing. Removed until the engine supports it (tracked in
                            docs/scope/EPE.md §4.2); the schema columns remain. */}
                        <p className="text-xs text-lime-200/50 mt-2">
                          Minimum Effective Tax Rate (NTA §57) is not modeled yet. It applies to MNE
                          groups (turnover above €750m) or NGN 50bn+ turnover and rarely binds for petroleum.
                        </p>
                      </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Save as scenario */}
          <section className="pt-2 border-t border-white/20">
            <div className="flex items-center gap-2 mb-2">
              <Checkbox
                id="saveAsScenario"
                checked={saveAsScenario}
                onCheckedChange={setSaveAsScenario}
                className="border-slate-400"
              />
              <Label htmlFor="saveAsScenario" className="text-white text-sm cursor-pointer">
                Save as reusable scenario
              </Label>
            </div>
            {saveAsScenario && (
              <div>
                <Label htmlFor="scenarioName" className="text-white text-sm">Scenario name</Label>
                <Input
                  id="scenarioName"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder="e.g. Base Case JV $75 oil"
                  className={`bg-gray-800 border-slate-600 text-white ${validationErrors.scenarioName ? 'border-red-500' : ''}`}
                />
                {validationErrors.scenarioName && (
                  <p className="text-red-400 text-xs mt-1">{validationErrors.scenarioName}</p>
                )}
              </div>
            )}
          </section>

          {/* Run button */}
          <Button
            onClick={handleRun}
            disabled={isRunning}
            className="w-full text-lg py-6 bg-gradient-to-r from-green-500 to-cyan-500 hover:from-green-600 hover:to-cyan-600"
          >
            {isRunning
              ? <><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Running Analysis...</>
              : <><PlayCircle className="mr-2 h-6 w-6" /> Run Economic Analysis</>}
          </Button>
        </motion.div>
      </div>
    </>
  );
};

export default EpeRunConsole;

