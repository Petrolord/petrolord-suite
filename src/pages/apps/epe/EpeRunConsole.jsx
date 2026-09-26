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
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { payloadEscalators, followsInflation, simpleEscalators } from '@/pages/apps/epe/epeEscalation';
import { labelForConfigKey } from '@/pages/apps/epe/epeConfigLabels';
import {
  LEGACY_TOGGLE_LABEL, PIA_INPUT_HELP, piaPreflight, piaRefusal, piaCompliancePayload,
  isLegacyPia, mayHaveNtaYear,
} from '@/pages/apps/epe/epePiaCompliance';

// Wave E (audit 4.3): the pricing + economics subset an assumption set pins.
// Regime terms and case-specific dates (base/valuation year) stay out.
const ASSUMPTION_SET_KEYS = [
  'oil_price_usd_bbl', 'gas_price_usd_mscf', 'condensate_price_usd_bbl',
  'oil_price_differential_usd_bbl', 'gas_price_differential_usd_mscf', 'condensate_price_differential_usd_bbl',
  'price_deck',
  'oil_price_escalator_pct', 'gas_price_escalator_pct', 'condensate_price_escalator_pct',
  'opex_escalator_pct', 'capex_escalator_pct',
  'discount_rate_pct', 'inflation_rate_pct',
  'present_value_basis', 'discounting_convention',
];

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
  // EC7 (engines 3.12.0): blank = the statutory TET by year (3% from 2023)
  pia_tet_rate_pct: null,
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
  // EC7 decision D5: a stated reading with no default (required for a deep
  // offshore year under the NTA)
  pia_deep_offshore_hct_interpretation: null,
  pia_deep_offshore_hct_custom_rate_pct: null,
  pia_development_levy_rate_pct: 4.0,
  pia_new_lease_prod_alw_cap_onshore_bbl: 50000000,
  pia_new_lease_prod_alw_cap_shallow_bbl: 100000000,
  pia_new_lease_prod_alw_cap_deep_bbl: 500000000,
  pia_prior_cumulative_oil_bbl: 0,
  // ---- EC7 (engines 3.12.0): PIA 2021 / NTA 2025 compliance inputs ----
  // Mirror migration 20260926150000 and epePiaCompliance.PIA_2021_INPUT_DEFAULTS.
  pia_legacy_pre_audit: false,
  pia_new_pml_hct_rate_pct: null,
  pia_gas_in_country_share_pct: 0,
  pia_price_royalty_base: 'regulations_2021',
  pia_nddc_levy_base: 'total_budget',
  pia_nddc_levy_pct: 3,
  pia_production_allowance_per_bbl_new_after_cap: 4.00,
  pia_cit_company_gas_operations: false,
  pia_decom_escrow_condition_met: null,
  // ---- v3.4: field life ----
  apply_economic_limit: false,
  abandonment_cost_usd: null,
  abandonment_year: null,
  // ---- v3.6 Wave B: equity + price realism ----
  psc_working_interest_pct: 100,
  pia_working_interest_pct: 100,
  price_deck: [],
  oil_price_differential_usd_bbl: 0,
  gas_price_differential_usd_mscf: 0,
  condensate_price_differential_usd_bbl: 0,
  discounting_convention: 'end_year',
  valuation_year: '',
  treat_prior_as_sunk: false,
  // ---- v3.9 Wave F: fiscal depth ----
  production_scenario: '',
  fx_ngn_per_usd: '',
  depreciation_method: 'straight_line',
  jv_psc_depr_years: 10,
  psc_profit_split_mode: 'flat',
  psc_profit_tranches: [],
  psc_itc_pct: 0,
  psc_prior_cumulative_liquids_bbl: 0,
  abandonment_funding_mode: 'lump_sum',
  abandonment_fund_start_year: '',
  pia_apply_minimum_etr: false,
  pia_minimum_etr_pct: 15,
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
  const { user } = useAuth();

  const [isRunning, setIsRunning] = useState(false);
  // Wave E: shared-case guard + assumption library
  const [caseRow, setCaseRow] = useState(null);
  const [activeOrgId, setActiveOrgId] = useState(null);
  const [assumptionSets, setAssumptionSets] = useState([]);
  const [selectedSetId, setSelectedSetId] = useState('');
  const [showSaveSet, setShowSaveSet] = useState(false);
  const [setName, setSetName] = useState('');
  const [shareSetWithOrg, setShareSetWithOrg] = useState(false);
  const [savingSet, setSavingSet] = useState(false);
  const [runName, setRunName] = useState(`Run ${formatTimestampForName()}`);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [saveAsScenario, setSaveAsScenario] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  // EC7: an engine refusal of the PIA inputs, kept on screen with its fixes
  const [engineRefusal, setEngineRefusal] = useState(null);
  const [showAdvancedEscalation, setShowAdvancedEscalation] = useState(false);
  const [showPiaAdvancedRates, setShowPiaAdvancedRates] = useState(false);
  const [showPiaAdvancedLevies, setShowPiaAdvancedLevies] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [loadedConfigId, setLoadedConfigId] = useState('');
  // Wave F (3.6): scenario tags present on this case's production files
  const [scenarioLabels, setScenarioLabels] = useState([]);

  // Copy a saved epe_run_configs row into the form. Only keys the form knows
  // about are taken; DB nulls fall back to the field's default so a partial
  // legacy row cannot blank out required inputs.
  const applyConfigRow = useCallback((row) => {
    const next = { ...DEFAULT_CONFIG };
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (row[key] !== null && row[key] !== undefined) next[key] = row[key];
    }
    setConfig(next);
    // a configuration saved with its own escalators opens per stream, so
    // simple mode never overwrites them on the next run
    setShowAdvancedEscalation(!followsInflation(next));
    setValidationErrors({});
    setEngineRefusal(null);
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
          // EC7: "Run as legacy" from a refused run (Results Viewer, Case Detail)
          if (searchParams.get('legacy') === '1') {
            setConfig((p) => ({ ...p, pia_legacy_pre_audit: true }));
          }
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [caseId, searchParams, applyConfigRow]);

  // Wave E: case ownership (shared cases are read-only here), the user's
  // active org (for sharing assumption sets), and the visible library.
  const loadAssumptionSets = useCallback(async () => {
    const { data } = await supabase
      .from('epe_assumption_sets')
      .select('id, user_id, organization_id, name, description, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    setAssumptionSets(data || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: cRow } = await supabase
        .from('epe_cases').select('id, user_id, case_name').eq('id', caseId).maybeSingle();
      if (!cancelled) setCaseRow(cRow || null);
      // Wave F (3.6): distinct scenario tags on this case's production files
      const { data: prodTags } = await supabase
        .from('epe_production_volumes').select('scenario_label').eq('case_id', caseId);
      if (!cancelled) {
        const tags = Array.from(new Set((prodTags || [])
          .map((r) => r.scenario_label)
          .filter((t) => t !== null && t !== undefined && t !== '')));
        tags.sort();
        setScenarioLabels(tags);
      }
      if (user?.id) {
        const { data: mem } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('joined_at', { ascending: true, nullsFirst: false })
          .limit(1);
        if (!cancelled) setActiveOrgId(mem?.[0]?.organization_id ?? null);
      }
      if (!cancelled) await loadAssumptionSets();
    };
    load();
    return () => { cancelled = true; };
  }, [caseId, user, loadAssumptionSets]);

  const isSharedReadOnly = Boolean(caseRow && user && caseRow.user_id !== user.id);

  const applyAssumptionSet = (id) => {
    setSelectedSetId(id);
    if (!id) return;
    const row = assumptionSets.find((s) => s.id === id);
    if (!row) return;
    supabase.from('epe_assumption_sets').select('payload').eq('id', id).maybeSingle().then(({ data }) => {
      const payload = data?.payload;
      if (!payload || typeof payload !== 'object') {
        toast({ variant: 'destructive', title: 'Could not load the assumption set' });
        return;
      }
      const appliedKeys = [];
      setConfig((prev) => {
        const next = { ...prev };
        for (const key of ASSUMPTION_SET_KEYS) {
          if (payload[key] !== undefined && payload[key] !== null) {
            next[key] = payload[key];
            appliedKeys.push(key);
          }
        }
        return next;
      });
      if (!followsInflation(payload, config)) setShowAdvancedEscalation(true);
      setValidationErrors({});
      toast({
        title: `Applied "${row.name}"`,
        description: appliedKeys.length > 0
          ? `Set: ${appliedKeys.map((k) => labelForConfigKey(k)).join(', ')}`
          : 'The set carried no recognized fields.',
      });
    });
  };

  const saveAssumptionSet = async () => {
    if (!setName.trim()) {
      toast({ variant: 'destructive', title: 'Name the assumption set first' });
      return;
    }
    setSavingSet(true);
    try {
      const payload = {};
      for (const key of ASSUMPTION_SET_KEYS) {
        const v = config[key];
        if (v !== undefined && v !== null && v !== '') payload[key] = v;
      }
      const { error } = await supabase.from('epe_assumption_sets').insert({
        user_id: user.id,
        organization_id: shareSetWithOrg && activeOrgId ? activeOrgId : null,
        name: setName.trim(),
        description: 'Saved from the Run Console',
        payload,
      });
      if (error) throw error;
      toast({
        title: 'Assumption set saved',
        description: shareSetWithOrg && activeOrgId
          ? 'Shared with your organization.' : 'Saved to your personal library.',
      });
      setSetName('');
      setShowSaveSet(false);
      setShareSetWithOrg(false);
      await loadAssumptionSets();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Save failed', description: err.message });
    } finally {
      setSavingSet(false);
    }
  };

  const deleteAssumptionSet = async (row) => {
    if (!window.confirm(`Delete assumption set "${row.name}"?`)) return;
    const { error } = await supabase.from('epe_assumption_sets').delete().eq('id', row.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Delete failed', description: error.message });
      return;
    }
    if (selectedSetId === row.id) setSelectedSetId('');
    toast({ title: 'Assumption set deleted' });
    await loadAssumptionSets();
  };

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

    // EC7: inputs the compliant engine will certainly refuse, found before the run
    if (config.fiscal_regime === 'PIA') {
      const { certain } = piaPreflight(config);
      if (certain.length > 0) errors.pia_compliance = certain.map((r) => r.title).join('; ');
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
    setEngineRefusal(null);
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
        // simple mode sends what it says on screen: inflation for the four
        // streams, capex nominal (epeEscalation)
        ...payloadEscalators(config, showAdvancedEscalation),
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
        // ---- EC7 (engines 3.12.0): compliance inputs and the legacy switch.
        // Overrides pia_tet_rate_pct, pia_nddc_levy_pct_of_opex and
        // pia_deep_offshore_hct_interpretation above with the values each
        // engine path reads (epePiaCompliance.piaCompliancePayload).
        ...piaCompliancePayload(config),
        // ---- v3.6 Wave B: equity + price realism ----
        psc_working_interest_pct: config.psc_working_interest_pct === '' ? 100 : config.psc_working_interest_pct,
        pia_working_interest_pct: config.pia_working_interest_pct === '' ? 100 : config.pia_working_interest_pct,
        price_deck: (() => {
          const rows = (config.price_deck || [])
            .map((r) => {
              const year = parseInt(String(r.year));
              const out = { year };
              for (const k of ['oil', 'gas', 'condensate']) {
                const v = Number(r[k]);
                if (r[k] !== '' && r[k] !== null && r[k] !== undefined && Number.isFinite(v)) out[k] = v;
              }
              return out;
            })
            .filter((r) => Number.isFinite(r.year) && Object.keys(r).length > 1);
          return rows.length > 0 ? rows : null;
        })(),
        oil_price_differential_usd_bbl: config.oil_price_differential_usd_bbl === '' ? 0 : config.oil_price_differential_usd_bbl,
        gas_price_differential_usd_mscf: config.gas_price_differential_usd_mscf === '' ? 0 : config.gas_price_differential_usd_mscf,
        condensate_price_differential_usd_bbl: config.condensate_price_differential_usd_bbl === '' ? 0 : config.condensate_price_differential_usd_bbl,
        discounting_convention: config.discounting_convention || 'end_year',
        valuation_year: config.valuation_year === '' ? null : config.valuation_year,
        treat_prior_as_sunk: config.treat_prior_as_sunk === true,
        // ---- v3.4: field life ----
        apply_economic_limit: config.apply_economic_limit === true,
        abandonment_cost_usd: config.abandonment_cost_usd === '' ? null : config.abandonment_cost_usd,
        abandonment_year: config.abandonment_year === '' ? null : config.abandonment_year,
        // ---- v3.9 Wave F: fiscal depth ----
        production_scenario: config.production_scenario === '' ? null : config.production_scenario,
        fx_ngn_per_usd: config.fx_ngn_per_usd === '' || config.fx_ngn_per_usd === null ? null : config.fx_ngn_per_usd,
        depreciation_method: config.depreciation_method || 'straight_line',
        jv_psc_depr_years: config.jv_psc_depr_years === '' ? 10 : config.jv_psc_depr_years,
        psc_profit_split_mode: config.psc_profit_split_mode || 'flat',
        psc_profit_tranches: (() => {
          const rows = (config.psc_profit_tranches || [])
            .map((r) => ({
              from_cum_mmbbl: Number(r.from_cum_mmbbl),
              contractor_share_pct: Number(r.contractor_share_pct),
            }))
            .filter((r) => Number.isFinite(r.from_cum_mmbbl) && Number.isFinite(r.contractor_share_pct));
          return rows.length > 0 ? rows : null;
        })(),
        psc_itc_pct: config.psc_itc_pct === '' ? 0 : config.psc_itc_pct,
        psc_prior_cumulative_liquids_bbl: config.psc_prior_cumulative_liquids_bbl === '' ? 0 : config.psc_prior_cumulative_liquids_bbl,
        abandonment_funding_mode: config.abandonment_funding_mode || 'lump_sum',
        abandonment_fund_start_year: config.abandonment_fund_start_year === '' || config.abandonment_fund_start_year === null ? null : config.abandonment_fund_start_year,
        pia_apply_minimum_etr: config.pia_apply_minimum_etr === true,
        pia_minimum_etr_pct: config.pia_minimum_etr_pct === '' ? 15 : config.pia_minimum_etr_pct,
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
          setEngineRefusal(piaRefusal(detail));
          throw new Error(`Engine failed: ${detail}`);
        }
        setEngineRefusal(piaRefusal(engineData.error));
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
  // v3.6 Wave B: yearly price deck editor state helpers
  const addDeckRow = () => setConfig((p) => ({
    ...p, price_deck: [...(p.price_deck || []), { year: '', oil: '', gas: '', condensate: '' }],
  }));
  const setDeckCell = (i, key, v) => setConfig((p) => ({
    ...p, price_deck: (p.price_deck || []).map((r, idx) => (idx === i ? { ...r, [key]: v } : r)),
  }));
  const delDeckRow = (i) => setConfig((p) => ({
    ...p, price_deck: (p.price_deck || []).filter((_, idx) => idx !== i),
  }));

  // v3.9 Wave F: PSC profit-oil tranche editor helpers
  const addTrancheRow = () => setConfig((p) => ({
    ...p, psc_profit_tranches: [...(p.psc_profit_tranches || []), { from_cum_mmbbl: '', contractor_share_pct: '' }],
  }));
  const setTrancheCell = (i, key, v) => setConfig((p) => ({
    ...p, psc_profit_tranches: (p.psc_profit_tranches || []).map((r, idx) => (idx === i ? { ...r, [key]: v } : r)),
  }));
  const delTrancheRow = (i) => setConfig((p) => ({
    ...p, psc_profit_tranches: (p.psc_profit_tranches || []).filter((_, idx) => idx !== i),
  }));

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
          {/* Wave E: shared-case read-only banner */}
          {isSharedReadOnly && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded text-amber-200 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                This case is shared with you read-only. Clone it from the case list to run your own economics.
              </span>
            </div>
          )}

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

          {/* Wave F (3.6): reserves scenario the run should price */}
          {scenarioLabels.length > 0 && (
            <div>
              <Label htmlFor="production_scenario" className="text-white text-sm">Reserves scenario</Label>
              <select
                id="production_scenario"
                value={config.production_scenario || ''}
                onChange={(e) => setConfig((p) => ({ ...p, production_scenario: e.target.value }))}
                className="w-full bg-gray-800 border border-slate-600 rounded px-2 py-2 text-sm text-white"
              >
                <option value="">Base (untagged files)</option>
                {scenarioLabels.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                The run uses only the production files tagged with the chosen scenario.
              </p>
            </div>
          )}

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

          {/* Wave E (audit 4.3): corporate assumption library */}
          <section>
            <h2 className="text-white text-lg font-semibold mb-3 border-b border-white/20 pb-1">Assumption library</h2>
            {assumptionSets.length === 0 ? (
              <p className="text-sm text-slate-400">
                No assumption sets yet. Save your corporate price deck once and reuse it on every case.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <select
                    value={selectedSetId}
                    onChange={(e) => applyAssumptionSet(e.target.value)}
                    className="flex-1 bg-gray-800 border border-slate-600 rounded px-2 py-2 text-sm text-white"
                  >
                    <option value="">Apply an assumption set...</option>
                    {assumptionSets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.organization_id ? ' [org]' : ''}
                        {user && s.user_id !== user.id ? ' (teammate)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {assumptionSets.filter((s) => user && s.user_id === user.id).map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1 text-xs text-slate-300 bg-slate-800 border border-slate-700 rounded px-2 py-0.5">
                      {s.name}
                      <button
                        type="button"
                        onClick={() => deleteAssumptionSet(s)}
                        className="text-slate-500 hover:text-red-400"
                        title={`Delete "${s.name}"`}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3">
              {!showSaveSet ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowSaveSet(true)}>
                  Save current as assumption set
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={setName}
                    onChange={(e) => setSetName(e.target.value)}
                    placeholder="e.g. Corporate deck Q3 2026"
                    className="bg-gray-800 border-slate-600 text-white w-64"
                  />
                  <label className={`text-sm flex items-center gap-2 ${activeOrgId ? 'text-white cursor-pointer' : 'text-slate-500'}`}>
                    <input
                      type="checkbox"
                      checked={shareSetWithOrg}
                      disabled={!activeOrgId}
                      onChange={(e) => setShareSetWithOrg(e.target.checked)}
                      className="accent-lime-400"
                    />
                    Share with my organization
                  </label>
                  <Button type="button" size="sm" onClick={saveAssumptionSet} disabled={savingSet}>
                    {savingSet ? 'Saving...' : 'Save'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setShowSaveSet(false); setSetName(''); }}>
                    Cancel
                  </Button>
                </div>
              )}
              <p className="text-xs text-slate-500 mt-1">
                An assumption set pins pricing and economics (prices, differentials, deck, escalation, discounting). Regime terms and case dates stay with the case.
              </p>
            </div>
          </section>

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
            {/* v3.6 Wave B: differentials to marker prices */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
              <NumField
                id="oil_price_differential_usd_bbl"
                label="Oil differential"
                suffix="USD/bbl"
                value={config.oil_price_differential_usd_bbl}
                onChange={(v) => handleNumberChange('oil_price_differential_usd_bbl', v)}
              />
              <NumField
                id="gas_price_differential_usd_mscf"
                label="Gas differential"
                suffix="USD/mscf"
                value={config.gas_price_differential_usd_mscf}
                onChange={(v) => handleNumberChange('gas_price_differential_usd_mscf', v)}
              />
              <NumField
                id="condensate_price_differential_usd_bbl"
                label="Condensate differential"
                suffix="USD/bbl"
                value={config.condensate_price_differential_usd_bbl}
                onChange={(v) => handleNumberChange('condensate_price_differential_usd_bbl', v)}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Differentials adjust the realized price against the marker (negative for a discount). They apply to deck prices too.
            </p>
            {/* v3.9 Wave F: NGN mirror rate */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
              <NumField
                id="fx_ngn_per_usd"
                label="NGN per USD"
                suffix="optional"
                value={config.fx_ngn_per_usd ?? ''}
                onChange={(v) => handleNumberChange('fx_ngn_per_usd', v)}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Flat rate. When set, the results carry NGN figures as mirrors of the USD economics; leave blank for USD only.
            </p>
            {/* v3.6 Wave B: yearly price deck */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <Label className="text-white text-sm">
                  Yearly price deck <span className="text-slate-400">(optional)</span>
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={addDeckRow}>
                  Add year
                </Button>
              </div>
              {(config.price_deck || []).length > 0 && (
                <div className="mt-2 overflow-x-auto rounded border border-white/10">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800 text-slate-300">
                      <tr>
                        <th className="px-2 py-1 text-left">Year</th>
                        <th className="px-2 py-1 text-left">Oil USD/bbl</th>
                        <th className="px-2 py-1 text-left">Gas USD/mscf</th>
                        <th className="px-2 py-1 text-left">Cond. USD/bbl</th>
                        <th className="px-2 py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {(config.price_deck || []).map((row, i) => (
                        <tr key={i} className="border-t border-white/5">
                          {['year', 'oil', 'gas', 'condensate'].map((key) => (
                            <td key={key} className="px-1 py-1">
                              <Input
                                type="number"
                                step={key === 'year' ? '1' : 'any'}
                                value={row[key] ?? ''}
                                onChange={(e) => setDeckCell(i, key, e.target.value)}
                                className="bg-gray-800 border-slate-600 text-white h-7 text-xs"
                              />
                            </td>
                          ))}
                          <td className="px-1 py-1 text-center">
                            <button type="button" onClick={() => delDeckRow(i)} className="text-slate-400 hover:text-red-400 text-sm" title="Remove year">
                              &times;
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-slate-500 mt-1">
                A deck year overrides the flat price for the streams it fills. Prices hold flat between listed years; beyond the last year the deck escalates at the stream escalator. Blank cells keep the flat price for that stream.
              </p>
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
              {/* v3.6 Wave B */}
              <div>
                <Label htmlFor="discounting_convention" className="text-white text-sm">Discounting convention</Label>
                <select
                  id="discounting_convention"
                  value={config.discounting_convention || 'end_year'}
                  onChange={(e) => setConfig((p) => ({ ...p, discounting_convention: e.target.value }))}
                  className="w-full bg-gray-800 border border-slate-600 rounded px-2 py-2 text-sm text-white"
                >
                  <option value="end_year">End of year</option>
                  <option value="mid_year">Mid-year</option>
                </select>
              </div>
              <NumField
                id="valuation_year"
                label="Valuation year"
                suffix="blank = base year"
                value={config.valuation_year}
                onChange={(v) => handleNumberChange('valuation_year', v)}
                step="1"
              />
              <label className="flex items-end gap-2 pb-2 text-sm text-white cursor-pointer" title="Years before the valuation year stay in the model (allowances and pools accrue) but are excluded from NPV, IRR and payback.">
                <input
                  type="checkbox"
                  checked={config.treat_prior_as_sunk === true}
                  onChange={(e) => setConfig((p) => ({ ...p, treat_prior_as_sunk: e.target.checked }))}
                  className="accent-lime-400 mb-1"
                />
                Treat years before valuation as sunk
              </label>
            </div>
            {/* v3.9 Wave F: depreciation controls (JV/PSC; PIA uses its own
                capex recovery period) */}
            {config.fiscal_regime !== 'PIA' && (
              <div className="mt-4">
                <Label className="text-white text-sm mb-1 block">Depreciation (JV and PSC)</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <select
                      id="depreciation_method"
                      value={config.depreciation_method || 'straight_line'}
                      onChange={(e) => setConfig((p) => ({ ...p, depreciation_method: e.target.value }))}
                      className="w-full bg-gray-800 border border-slate-600 rounded px-2 py-2 text-sm text-white"
                    >
                      <option value="straight_line">Straight line</option>
                      <option value="nigeria_ppt">Nigeria PPT schedule (20/20/20/20/19)</option>
                    </select>
                  </div>
                  {(config.depreciation_method || 'straight_line') === 'straight_line' && (
                    <NumField
                      id="jv_psc_depr_years"
                      label="Depreciation life"
                      suffix="years"
                      step="1"
                      value={config.jv_psc_depr_years}
                      onChange={(v) => handleNumberChange('jv_psc_depr_years', v)}
                    />
                  )}
                </div>
                {config.depreciation_method === 'nigeria_ppt' && (
                  <p className="text-xs text-slate-500 mt-1">
                    Statutory PPT-era annual allowances. The 1 percent retention is held until disposal and is not claimed in the model.
                  </p>
                )}
              </div>
            )}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <Label htmlFor="abandonment_funding_mode" className="text-white text-sm">Abandonment funding</Label>
                <select
                  id="abandonment_funding_mode"
                  value={config.abandonment_funding_mode || 'lump_sum'}
                  onChange={(e) => setConfig((p) => ({ ...p, abandonment_funding_mode: e.target.value }))}
                  className="w-full bg-gray-800 border border-slate-600 rounded px-2 py-2 text-sm text-white"
                >
                  <option value="lump_sum">Post-tax lump sum</option>
                  <option value="sinking_fund">Sinking fund</option>
                </select>
              </div>
              {config.abandonment_funding_mode === 'sinking_fund' && (
                <NumField
                  id="abandonment_fund_start_year"
                  label="Fund start year"
                  suffix="blank = first modeled year"
                  step="1"
                  value={config.abandonment_fund_start_year ?? ''}
                  onChange={(v) => handleNumberChange('abandonment_fund_start_year', v === '' ? '' : v)}
                />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {config.abandonment_funding_mode === 'sinking_fund'
                ? 'Equal annual contributions from the start year through the abandonment year. Contributions are tax-deductible and the fund pays the final spend, so there is no second cash hit at end of life.'
                : 'Applied as a post-tax cash outflow in that year. It is not tax-deducted, not depreciated, and excluded from cost recovery.'}
            </p>
          </section>

          {/* Escalation & PV Basis */}
          <section>
            <div className="flex items-center justify-between border-b border-white/20 pb-1 mb-3">
              <h2 className="text-white text-lg font-semibold">Escalation & PV Basis</h2>
              <button
                type="button"
                onClick={() => {
                  // opening per-stream starts from the rates simple mode was
                  // using, so the fields show what the last run would send
                  if (!showAdvancedEscalation) {
                    setConfig((prev) => ({ ...prev, ...simpleEscalators(prev.inflation_rate_pct) }));
                  }
                  setShowAdvancedEscalation((v) => !v);
                }}
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
                  id="psc_working_interest_pct"
                  label="Working interest"
                  suffix="% of contractor group"
                  value={config.psc_working_interest_pct}
                  onChange={(v) => handleNumberChange('psc_working_interest_pct', v)}
                />
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
                <NumField
                  id="psc_itc_pct"
                  label="Investment tax credit"
                  suffix="% of CAPEX, credited against tax"
                  value={config.psc_itc_pct}
                  onChange={(v) => handleNumberChange('psc_itc_pct', v)}
                />
                {/* v3.9 Wave F: profit split mode */}
                <div>
                  <Label htmlFor="psc_profit_split_mode" className="text-white text-sm">Profit split</Label>
                  <select
                    id="psc_profit_split_mode"
                    value={config.psc_profit_split_mode || 'flat'}
                    onChange={(e) => setConfig((p) => ({ ...p, psc_profit_split_mode: e.target.value }))}
                    className="w-full bg-gray-800 border border-slate-600 rounded px-2 py-2 text-sm text-white"
                  >
                    <option value="flat">Flat share</option>
                    <option value="tranches">Production tranches</option>
                  </select>
                </div>
                {config.psc_profit_split_mode === 'tranches' && (
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-white text-sm">Profit-oil tranches</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addTrancheRow}>
                        Add tranche
                      </Button>
                    </div>
                    {(config.psc_profit_tranches || []).length > 0 && (
                      <div className="mt-2 overflow-x-auto rounded border border-white/10">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-800 text-slate-300">
                            <tr>
                              <th className="px-2 py-1 text-left">From cumulative MMbbl</th>
                              <th className="px-2 py-1 text-left">Contractor share %</th>
                              <th className="px-2 py-1" />
                            </tr>
                          </thead>
                          <tbody>
                            {(config.psc_profit_tranches || []).map((row, i) => (
                              <tr key={i} className="border-t border-white/5">
                                {['from_cum_mmbbl', 'contractor_share_pct'].map((key) => (
                                  <td key={key} className="px-1 py-1">
                                    <Input
                                      type="number"
                                      step="any"
                                      value={row[key] ?? ''}
                                      onChange={(e) => setTrancheCell(i, key, e.target.value)}
                                      className="bg-gray-800 border-slate-600 text-white h-7 text-xs"
                                    />
                                  </td>
                                ))}
                                <td className="px-1 py-1 text-center">
                                  <button type="button" onClick={() => delTrancheRow(i)} className="text-slate-400 hover:text-red-400 text-sm" title="Remove tranche">
                                    &times;
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      <NumField
                        id="psc_prior_cumulative_liquids_bbl"
                        label="Prior cumulative liquids"
                        suffix="bbl (brownfield start)"
                        value={config.psc_prior_cumulative_liquids_bbl}
                        onChange={(v) => handleNumberChange('psc_prior_cumulative_liquids_bbl', v)}
                      />
                    </div>
                    <p className="text-xs text-amber-300/80 mt-2">
                      The tranche whose threshold is met at the start of a year applies for that whole year. Verify tranche breakpoints against your PSC. Presets vary by contract round.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {/* EC7 (engines 3.12.0): the legacy switch and the refusals of
                    the compliant engine, each with its one-click fixes. */}
                {(() => {
                  const legacy = isLegacyPia(config);
                  const pre = piaPreflight(config);
                  const issues = [...pre.certain];
                  if (engineRefusal && !issues.some((r) => r.code === engineRefusal.code)) issues.unshift(engineRefusal);
                  if (!legacy && issues.length === 0) return null;
                  return (
                    <div className={`rounded p-3 border ${legacy ? 'bg-slate-900/60 border-slate-500/40' : 'bg-red-950/40 border-red-500/40'}`} data-testid="pia-compliance-panel">
                      {!legacy && issues.map((r) => (
                        <div key={r.code} className="mb-3">
                          <p className="text-red-200 text-sm font-semibold flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" /> {r.title}
                          </p>
                          {r.message && <p className="text-red-200/80 text-xs mt-1 font-mono break-words">{r.message}</p>}
                          <p className="text-slate-300 text-xs mt-1">{r.explain}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {r.fixes.map((f) => (
                              <Button key={f.label} type="button" size="sm" variant="outline" className="text-xs"
                                onClick={() => { setConfig((p) => ({ ...p, ...f.patch })); setEngineRefusal(null); }}>
                                {f.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id="pia_legacy_pre_audit"
                          checked={legacy}
                          onCheckedChange={(v) => { setConfig((p) => ({ ...p, pia_legacy_pre_audit: v === true })); setEngineRefusal(null); }}
                          className="border-slate-400 mt-0.5"
                        />
                        <div>
                          <Label htmlFor="pia_legacy_pre_audit" className="text-white text-sm cursor-pointer">{LEGACY_TOGGLE_LABEL}</Label>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {legacy
                              ? 'This run uses the engine as it stood before PIA figures were corrected on 26 September 2026, so it reproduces results saved before that date. Clear the box to run it on the Act, the Nigeria Tax Act 2025 and the Royalty Regulations.'
                              : 'Tick to reproduce a run saved before 26 September 2026 on the earlier engine. The fixes above run it on the Act.'}
                          </p>
                        </div>
                      </div>
                      {validationErrors.pia_compliance && (
                        <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Fix these inputs or run as legacy: {validationErrors.pia_compliance}
                        </p>
                      )}
                    </div>
                  );
                })()}
                {/* v3.6 Wave B: lessee equity share */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <NumField
                    id="pia_working_interest_pct"
                    label="Working interest"
                    suffix="% of lessee; royalty tiers and caps stay field-level"
                    value={config.pia_working_interest_pct}
                    onChange={(v) => handleNumberChange('pia_working_interest_pct', v)}
                  />
                </div>
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
                          // EC7: a marginal field is onshore or shallow water under
                          // the Act; the old terrain stays for legacy runs only
                          ...(isLegacyPia(config) || config.pia_terrain === 'marginal_field' ? [['marginal_field', 'Marginal Field (legacy)']] : []),
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
                      Marginal field declared before Jan 1, 2021 (15% HCT rate, PIA s.94(1))
                    </Label>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{PIA_INPUT_HELP.pia_terrain}</p>
                </div>

                {/* ── EC7: inputs the Act leaves to a stated choice (required, no default) ── */}
                {!isLegacyPia(config) && (() => {
                  const shelf = config.pia_terrain === 'onshore' || config.pia_terrain === 'shallow_water';
                  const needRate = shelf && config.pia_license_type === 'PML' && config.pia_lease_status === 'new'
                    && config.pia_marginal_field_pre_2021 !== true;
                  const needDeep = config.pia_terrain === 'deep_offshore' && mayHaveNtaYear(config);
                  const needEscrow = config.abandonment_funding_mode === 'sinking_fund' && Number(config.abandonment_cost_usd) > 0
                    && mayHaveNtaYear(config);
                  if (!needRate && !needDeep && !needEscrow) return null;
                  const req = <span className="text-red-400 ml-1" title="Required">* required</span>;
                  const selectCls = 'w-full bg-slate-900/60 border border-white/20 rounded px-2 py-1.5 text-sm text-white';
                  return (
                    <div className="bg-amber-900/20 border border-amber-500/30 rounded p-3 space-y-3" data-testid="pia-required-inputs">
                      <h3 className="text-white text-sm font-semibold">Stated choices the Act requires</h3>
                      {needRate && (
                        <div>
                          <Label htmlFor="pia_new_pml_hct_rate_pct" className="text-white text-xs mb-1 block">New lease hydrocarbon tax rate{req}</Label>
                          <select id="pia_new_pml_hct_rate_pct" className={selectCls}
                            value={config.pia_new_pml_hct_rate_pct ?? ''}
                            onChange={(e) => setConfig((p) => ({ ...p, pia_new_pml_hct_rate_pct: e.target.value === '' ? null : Number(e.target.value) }))}>
                            <option value="">Choose 15% or 30%</option>
                            <option value="15">15%</option>
                            <option value="30">30%</option>
                          </select>
                          <p className="text-xs text-amber-200/80 mt-1">{PIA_INPUT_HELP.pia_new_pml_hct_rate_pct}</p>
                        </div>
                      )}
                      {needDeep && (
                        <div>
                          <Label htmlFor="pia_deep_offshore_hct_interpretation" className="text-white text-xs mb-1 block">Deep offshore HCT reading (years from 2026){req}</Label>
                          <select id="pia_deep_offshore_hct_interpretation" className={selectCls}
                            value={config.pia_deep_offshore_hct_interpretation ?? ''}
                            onChange={(e) => setConfig((p) => ({ ...p, pia_deep_offshore_hct_interpretation: e.target.value === '' ? null : e.target.value }))}>
                            <option value="">Choose a reading</option>
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
                          <p className="text-xs text-amber-200/80 mt-1">{PIA_INPUT_HELP.pia_deep_offshore_hct_interpretation}</p>
                        </div>
                      )}
                      {needEscrow && (
                        <div>
                          <Label htmlFor="pia_decom_escrow_condition_met" className="text-white text-xs mb-1 block">Decommissioning escrow condition (years from 2026){req}</Label>
                          <select id="pia_decom_escrow_condition_met" className={selectCls}
                            value={config.pia_decom_escrow_condition_met === true ? 'yes' : config.pia_decom_escrow_condition_met === false ? 'no' : ''}
                            onChange={(e) => setConfig((p) => ({ ...p, pia_decom_escrow_condition_met: e.target.value === '' ? null : e.target.value === 'yes' }))}>
                            <option value="">Choose</option>
                            <option value="yes">Met: at least 30% of the fund in an accredited escrow</option>
                            <option value="no">Not met: contributions are not deductible</option>
                          </select>
                          <p className="text-xs text-amber-200/80 mt-1">{PIA_INPUT_HELP.pia_decom_escrow_condition_met}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

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
                      Auto-derived HCT (terrain/license), CIT <span className="font-mono text-cyan-300">{config.pia_cit_rate_pct}%</span>, TET <span className="font-mono text-cyan-300">{config.pia_tet_rate_pct === null || config.pia_tet_rate_pct === '' ? (isLegacyPia(config) ? '2.5%' : 'statutory (3% from 2023)') : `${config.pia_tet_rate_pct}%`}</span>
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
                          suffix="% (blank = statute)"
                          value={config.pia_tet_rate_pct ?? ''}
                          onChange={(v) => handleNumberChange('pia_tet_rate_pct', v === '' ? null : v)}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-2">{PIA_INPUT_HELP.pia_tet_rate_pct}</p>
                      {!isLegacyPia(config) && (
                        <div className="flex items-start gap-2 mt-3">
                          <Checkbox
                            id="pia_cit_company_gas_operations"
                            checked={config.pia_cit_company_gas_operations === true}
                            onCheckedChange={(v) => setConfig((p) => ({ ...p, pia_cit_company_gas_operations: v === true }))}
                            className="border-slate-400 mt-0.5"
                          />
                          <div>
                            <Label htmlFor="pia_cit_company_gas_operations" className="text-white text-xs cursor-pointer">
                              Company in upstream or midstream gas operations
                            </Label>
                            <p className="text-xs text-slate-500">{PIA_INPUT_HELP.pia_cit_company_gas_operations}</p>
                          </div>
                        </div>
                      )}
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
                      {isLegacyPia(config)
                        ? <>NDDC <span className="font-mono text-cyan-300">{config.pia_nddc_levy_pct_of_opex}%</span> of OPEX</>
                        : <>NDDC <span className="font-mono text-cyan-300">{config.pia_nddc_levy_pct ?? 3}%</span> of {config.pia_nddc_levy_base === 'opex' ? 'OPEX' : 'OPEX plus CAPEX'}, gas royalty in-country share <span className="font-mono text-cyan-300">{config.pia_gas_in_country_share_pct ?? 0}%</span>, price royalty base <span className="font-mono text-cyan-300">{config.pia_price_royalty_base === 'act_2020' ? 'Act (2020)' : 'Regulations (2021)'}</span></>}, CPR cap <span className="font-mono text-cyan-300">{config.pia_cpr_limit_pct}%</span>, Capex recovery <span className="font-mono text-cyan-300">{config.pia_capex_recovery_years}yr</span>, Prod. allowance <span className="font-mono text-cyan-300">${config.pia_lease_status === 'new' ? config.pia_production_allowance_per_bbl_new : config.pia_production_allowance_per_bbl_converted}/bbl</span>
                    </p>
                  )}
                  {showPiaAdvancedLevies && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {isLegacyPia(config) ? (
                          <NumField
                            id="pia_nddc_levy_pct_of_opex"
                            label="NDDC levy"
                            suffix="% of OPEX"
                            value={config.pia_nddc_levy_pct_of_opex}
                            onChange={(v) => handleNumberChange('pia_nddc_levy_pct_of_opex', v)}
                          />
                        ) : (
                          <>
                            <NumField
                              id="pia_nddc_levy_pct"
                              label="NDDC levy"
                              suffix={`% of ${config.pia_nddc_levy_base === 'opex' ? 'OPEX' : 'OPEX plus CAPEX'}`}
                              value={config.pia_nddc_levy_pct ?? ''}
                              onChange={(v) => handleNumberChange('pia_nddc_levy_pct', v === '' ? null : v)}
                            />
                            <div>
                              <Label htmlFor="pia_nddc_levy_base" className="text-white text-sm">NDDC levy base</Label>
                              <select id="pia_nddc_levy_base"
                                value={config.pia_nddc_levy_base || 'total_budget'}
                                onChange={(e) => setConfig((p) => ({ ...p, pia_nddc_levy_base: e.target.value }))}
                                className="w-full bg-gray-800 border border-slate-600 rounded px-2 py-2 text-sm text-white">
                                <option value="total_budget">Total annual budget (OPEX plus CAPEX)</option>
                                <option value="opex">OPEX only (earlier base)</option>
                              </select>
                              <p className="text-xs text-slate-500 mt-1">{PIA_INPUT_HELP.pia_nddc_levy_base}</p>
                            </div>
                            <NumField
                              id="pia_gas_in_country_share_pct"
                              label="Gas utilised in Nigeria"
                              suffix="% of gas revenue (2.5% royalty)"
                              value={config.pia_gas_in_country_share_pct ?? 0}
                              onChange={(v) => handleNumberChange('pia_gas_in_country_share_pct', v)}
                            />
                            <div>
                              <Label htmlFor="pia_price_royalty_base" className="text-white text-sm">Royalty by price: benchmark base</Label>
                              <select id="pia_price_royalty_base"
                                value={config.pia_price_royalty_base || 'regulations_2021'}
                                onChange={(e) => setConfig((p) => ({ ...p, pia_price_royalty_base: e.target.value }))}
                                className="w-full bg-gray-800 border border-slate-600 rounded px-2 py-2 text-sm text-white">
                                <option value="regulations_2021">Royalty Regulations 2022 (2021 base)</option>
                                <option value="act_2020">PIA Seventh Schedule para 11(1) (2020 base)</option>
                              </select>
                              <p className="text-xs text-slate-500 mt-1">{PIA_INPUT_HELP.pia_price_royalty_base}</p>
                            </div>
                          </>
                        )}
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
                        {isLegacyPia(config) ? (
                          <NumField
                            id="pia_capex_recovery_years"
                            label="Capex recovery"
                            suffix="years"
                            value={config.pia_capex_recovery_years}
                            onChange={(v) => handleNumberChange('pia_capex_recovery_years', v)}
                          />
                        ) : (
                          <div>
                            <Label className="text-white text-sm">Capex recovery <span className="text-slate-400">(years)</span></Label>
                            <p className="text-white text-sm font-mono mt-2">5</p>
                            <p className="text-xs text-slate-500 mt-1">{PIA_INPUT_HELP.pia_capex_recovery_years}</p>
                          </div>
                        )}
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
                        {!isLegacyPia(config) && (
                          <div>
                            <NumField
                              id="pia_production_allowance_per_bbl_new_after_cap"
                              label="Allowance (new, after the cap)"
                              suffix="USD/bbl"
                              value={config.pia_production_allowance_per_bbl_new_after_cap}
                              onChange={(v) => handleNumberChange('pia_production_allowance_per_bbl_new_after_cap', v)}
                            />
                            <p className="text-xs text-slate-500 mt-1">{PIA_INPUT_HELP.pia_production_allowance_per_bbl_new_after_cap}</p>
                          </div>
                        )}

                      {/* ─── B2.5: Nigeria Tax Act 2025 Framework ─── */}
                      <div className="col-span-2 mt-4 pt-4 border-t border-white/10">
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-white text-sm font-semibold">Nigeria Tax Act 2025 Framework</Label>
                          <span className="text-xs px-2 py-0.5 rounded bg-cyan-900/50 text-cyan-200">
                            {(() => {
                              const ovr = config.pia_under_nta_2025_override;
                              if (ovr === 'force_pia') return 'PIA-only (forced)';
                              if (ovr === 'force_nta') return 'NTA-2025 (forced)';
                              if (isLegacyPia(config)) return (config.base_year >= 2026) ? 'NTA-2025 (auto)' : 'PIA-only (auto)';
                              return 'Per year: PIA to 2025, NTA from 2026 (auto)';
                            })()}
                          </span>
                        </div>
                        <p className="text-xs text-lime-200/60 mb-2">
                          {isLegacyPia(config)
                            ? 'Legacy engine: one framework for the whole run, chosen from the base year (2026 or later reads as NTA 2025).'
                            : 'The Nigeria Tax Act 2025 applies from 1 January 2026. Under Auto each year of assessment takes its own framework: PIA 2021 years pay TET, NTA years pay the 4% development levy (NTA s.59(1)) and take 20% capital allowances.'}
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

                        {config.pia_terrain === 'deep_offshore' && isLegacyPia(config) && (
                          <div className="bg-amber-900/20 border border-amber-500/30 rounded p-2 mb-3">
                            <p className="text-amber-200 text-xs mb-2">
                              NTA s.65(1) brings deep offshore into HCT and s.72 states no deep offshore rate. Industry interpretation is unsettled (Olaniwun Ajayi, Fortrose, October 2025 to January 2026).
                            </p>
                            <Label className="text-white text-xs mb-1 block">Deep Offshore HCT Interpretation</Label>
                            <select
                              value={config.pia_deep_offshore_hct_interpretation ?? 'conservative_zero'}
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

                        {/* v3.9 Wave F: minimum ETR restored now that the engine
                            implements the top-up math. */}
                        <div className="mt-2 pt-3 border-t border-white/10">
                          <div className="flex items-center gap-2 mb-2">
                            <Checkbox
                              id="pia_apply_minimum_etr"
                              checked={config.pia_apply_minimum_etr === true}
                              onCheckedChange={(v) => setConfig((p) => ({ ...p, pia_apply_minimum_etr: v === true }))}
                              className="border-slate-400"
                            />
                            <Label htmlFor="pia_apply_minimum_etr" className="text-white text-sm cursor-pointer">
                              Apply minimum effective tax rate (NTA s.57)
                            </Label>
                          </div>
                          {config.pia_apply_minimum_etr === true && (
                            <div className="grid grid-cols-2 gap-3 mb-2">
                              <NumField
                                id="pia_minimum_etr_pct"
                                label="Minimum ETR"
                                suffix="%"
                                value={config.pia_minimum_etr_pct}
                                onChange={(v) => handleNumberChange('pia_minimum_etr_pct', v)}
                              />
                            </div>
                          )}
                          <div className="bg-amber-900/20 border border-amber-500/30 rounded p-2">
                            <p className="text-amber-200 text-xs">
                              Project-level approximation of NTA s.57. The statutory test is company-level (a member of a multinational group, or turnover of 20 billion naira or more) and this model tops up per year when the taxes fall short of the rate times CIT assessable profit. The top-up applies only to years under the NTA (a legacy run applies it every year) and is reported as its own line in results so reviewers can strip it.
                            </p>
                          </div>
                        </div>
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

          {/* Run button (Wave E: disabled on shared read-only cases) */}
          <Button
            onClick={handleRun}
            disabled={isRunning || isSharedReadOnly}
            className="w-full text-lg py-6 bg-gradient-to-r from-green-500 to-cyan-500 hover:from-green-600 hover:to-cyan-600"
          >
            {isRunning
              ? <><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Running Analysis...</>
              : <><PlayCircle className="mr-2 h-6 w-6" /> Run Economic Analysis</>}
          </Button>
          {isSharedReadOnly && (
            <p className="text-xs text-amber-300 text-center">
              Running is disabled on shared cases.
            </p>
          )}
        </motion.div>
      </div>
    </>
  );
};

export default EpeRunConsole;

