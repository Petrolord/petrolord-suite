// src/components/reservoirbalance/AquiferModel.jsx
//
// Reservoir Balance — Aquifer Model Configuration
// =================================================
//
// Phase 3 Capsule 3A → Capsule 4B (2026-05-15).
//
// Wires the case's aquifer_model and aquifer_params to the engine. Supports
// all four engine-implemented models:
//
//   none           — closed system, no aquifer support
//   pot            — Pletcher pot aquifer, W estimated by regression
//   fetkovich      — time-dependent, user-supplied W and J
//   carter_tracy   — radial diffusion, user-supplied geometry
//
// Each model displays its validation tier via <ValidationTierBadge /> so the
// user sees the evidence behind the method before they run.
//
// Flow:
//   - Mount → load existing rb_run_configs row via getCaseDefaultConfig
//   - User picks model + (if needed) enters parameter values
//   - Save → upsertCaseDefaultConfig with aquifer_model + aquifer_params
//
// Unit conventions on inputs:
//   - W shown to user in MM rb (millions of reservoir barrels); engine takes raw rb
//   - All other inputs are in engine-native units (mD, ft, fraction, degrees)

import React, { useEffect, useState, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Save,
  Loader2,
  CheckCircle,
  Info,
  Waves,
  Calendar,
} from 'lucide-react';
import ValidationTierBadge from '@/components/reservoirbalance/ValidationTierBadge';
import {
  getCaseDefaultConfig,
  upsertCaseDefaultConfig,
} from '@/pages/apps/reservoir-balance/lib/api';

// =============================================================================
// CONFIG
// =============================================================================
//
// Tier mapping mirrors the engine's resolveValidationTier() so the UI can show
// what tier the user will get *before* running. Keep in sync with
// supabase/functions/_shared/mbal-engine.ts. Phase 7 polish: consolidate via
// a /tier-info Edge Function that returns the engine's tier mapping at runtime.

const AQUIFER_MODEL_OPTIONS = [
  {
    value: 'none',
    label: 'None (closed system)',
    description:
      'Reservoir treated as a closed tank with no aquifer support. Pressure declines only from production and rock+water expansion.',
    tier: {
      gas: { tier: 'published_method', reference: 'Standard p/z material balance formulation (Havlena-Odeh 1963). Documented calculation logic and internal checks.' },
      oil: { tier: 'published_method', reference: 'Standard oil material balance formulation (Havlena-Odeh 1963). Documented calculation logic and internal checks.' },
    },
  },
  {
    value: 'pot',
    label: 'Pot aquifer',
    description:
      'Small bounded aquifer with instantaneous pressure communication (Pletcher Eq. 12). Aquifer water-in-place (W) is estimated automatically by regression — no manual entry. Best for high-permeability reservoirs with bounded aquifer (faulting, pinchout).',
    tier: {
      gas: { tier: 'benchmark_verified', reference: 'Pletcher SPE 75354 (2002) Tables 1-3, two-cell gas simulation. Matched within stated tolerance.', tolerance_pct: 0.19 },
      oil: { tier: 'benchmark_verified', reference: 'Pletcher SPE 75354 (2002) Tables 10-13, multicell oil with pot aquifer. Matched within stated tolerance.', tolerance_pct: 0.13 },
    },
  },
  {
    value: 'fetkovich',
    label: 'Fetkovich',
    description:
      'Time-dependent aquifer with productivity-index marching scheme (Fetkovich 1971). Suitable for finite aquifers where flow is rate-limited rather than instantaneous. Requires W and J as user inputs.',
    tier: {
      gas: { tier: 'benchmark_verified', reference: 'Pletcher SPE 75354 (2002) Tables 9 / Fig. 8, single-cell gas with finite-aquifer Fetkovich support. Matched within stated tolerance.', tolerance_pct: 0.76 },
      oil: { tier: 'published_method', reference: 'Standard Fetkovich aquifer formulation (Fetkovich SPE 2603, 1971) applied to oil material balance. Calculation traceability and internal checks.' },
    },
  },
  {
    value: 'carter_tracy',
    label: 'Carter-Tracy',
    description:
      'Radial-diffusion aquifer model (Carter-Tracy 1960) with Lee-Wattenbarger pD/pD\u2032 polynomial fit to the infinite-aquifer pressure transient. Best for large/effectively-infinite aquifers where the marching-scheme limit of Fetkovich is unrealistic.',
    tier: {
      gas: { tier: 'published_method', reference: 'Carter-Tracy (1960) with Lee-Wattenbarger pD/pD\' polynomial formulation. Implements documented assumptions and calculation traceability.' },
      oil: { tier: 'published_method', reference: 'Carter-Tracy (1960) aquifer formulation applied to oil material balance with Lee-Wattenbarger pD/pD\' polynomial. Documented assumptions and internal checks.' },
    },
  },
];

// Default form values. Fetkovich/Carter-Tracy fields stay in state across model
// switches so users don't lose their typed values when toggling.
const DEFAULT_FORM = {
  aquifer_model: 'none',
  aquifer_history_match: false,
  aquifer_params: {
    // Fetkovich
    initial_aquifer_water_in_place_rb: null,
    aquifer_pi_rb_d_psi: null,
    // Carter-Tracy
    aquifer_permeability_md: null,
    aquifer_thickness_ft: null,
    aquifer_porosity: null,
    theta_degrees: null,
    radius_ratio: null,
    // Shared optional override
    aquifer_total_compressibility_psi: null,
  },
};

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate the form for the currently-selected model. Returns an array of
 * { field, message } errors; empty array means form is valid.
 */
function validateForm(form) {
  const errors = [];
  const p = form.aquifer_params || {};
  const model = form.aquifer_model;

  const reqPositive = (key, label) => {
    const v = p[key];
    if (v == null || !isFinite(v) || v <= 0) {
      errors.push({ field: key, message: `${label} is required and must be positive.` });
    }
  };

  if (model === 'fetkovich') {
    reqPositive('initial_aquifer_water_in_place_rb', 'Initial aquifer water in place (W)');
    reqPositive('aquifer_pi_rb_d_psi', 'Aquifer productivity index (J)');
  } else if (model === 'carter_tracy') {
    reqPositive('aquifer_permeability_md', 'Aquifer permeability');
    reqPositive('aquifer_thickness_ft', 'Aquifer thickness');
    if (p.aquifer_porosity == null || !isFinite(p.aquifer_porosity) || p.aquifer_porosity <= 0 || p.aquifer_porosity >= 1) {
      errors.push({ field: 'aquifer_porosity', message: 'Aquifer porosity must be between 0 and 1.' });
    }
    if (p.theta_degrees == null || !isFinite(p.theta_degrees) || p.theta_degrees <= 0 || p.theta_degrees > 360) {
      errors.push({ field: 'theta_degrees', message: '\u03b8 must be between 0 and 360 degrees.' });
    }
  }
  return errors;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const AquiferModel = ({ caseId, caseData, onConfigChange }) => {
  const { toast } = useToast();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadedConfigId, setLoadedConfigId] = useState(null);

  const fluidSystem = caseData?.fluid_system === 'gas' ? 'gas' : 'oil';

  // ── Hydrate from server ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!caseId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: cfg, error } = await getCaseDefaultConfig(caseId);
      if (cancelled) return;
      if (error) {
        toast({
          title: 'Could not load aquifer config',
          description: error.message,
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }
      if (cfg) {
        setForm({
          aquifer_model: cfg.aquifer_model ?? 'none',
          aquifer_history_match: cfg.aquifer_history_match ?? false,
          aquifer_params: {
            ...DEFAULT_FORM.aquifer_params,
            ...(cfg.aquifer_params ?? {}),
          },
        });
        setLoadedConfigId(cfg.id);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, toast]);

  // ── Model change ──
  const handleModelChange = (value) => {
    setForm((prev) => ({ ...prev, aquifer_model: value }));
    setDirty(true);
  };

  // ── Param input change ──
  const handleParamChange = (field, raw) => {
    const parsed = raw === '' ? null : Number(raw);
    setForm((prev) => ({
      ...prev,
      aquifer_params: {
        ...prev.aquifer_params,
        [field]: Number.isNaN(parsed) ? null : parsed,
      },
    }));
    setDirty(true);
  };

  // ── Save ──
  const handleSave = async () => {
    if (!caseId) return;

    const errors = validateForm(form);
    if (errors.length > 0) {
      toast({
        title: 'Aquifer parameters invalid',
        description: errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    // For Fetkovich/CT, only save the params that model needs.
    let paramsToSave = null;
    const p = form.aquifer_params;
    if (form.aquifer_model === 'fetkovich') {
      paramsToSave = {
        initial_aquifer_water_in_place_rb: p.initial_aquifer_water_in_place_rb,
        aquifer_pi_rb_d_psi: p.aquifer_pi_rb_d_psi,
      };
      if (p.aquifer_total_compressibility_psi != null) {
        paramsToSave.aquifer_total_compressibility_psi = p.aquifer_total_compressibility_psi;
      }
    } else if (form.aquifer_model === 'carter_tracy') {
      paramsToSave = {
        aquifer_permeability_md: p.aquifer_permeability_md,
        aquifer_thickness_ft: p.aquifer_thickness_ft,
        aquifer_porosity: p.aquifer_porosity,
        theta_degrees: p.theta_degrees,
      };
      if (p.radius_ratio != null) {
        paramsToSave.radius_ratio = p.radius_ratio;
      }
      if (p.aquifer_total_compressibility_psi != null) {
        paramsToSave.aquifer_total_compressibility_psi = p.aquifer_total_compressibility_psi;
      }
    }

    setSaving(true);
    const { data, error } = await upsertCaseDefaultConfig(caseId, {
      aquifer_model: form.aquifer_model,
      aquifer_history_match: form.aquifer_history_match,
      aquifer_params: paramsToSave,
    });
    setSaving(false);

    if (error) {
      toast({
        title: 'Save failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setLoadedConfigId(data.id);
    setDirty(false);
    toast({
      title: 'Aquifer config saved',
      description: `Run MBAL will use the ${form.aquifer_model === 'none' ? 'no-aquifer' : form.aquifer_model.replace('_', '-')} model.`,
    });
    onConfigChange?.(data);
  };

  // ── Derived values ──
  const currentOption = useMemo(
    () => AQUIFER_MODEL_OPTIONS.find((o) => o.value === form.aquifer_model),
    [form.aquifer_model],
  );
  const currentTier = currentOption?.tier?.[fluidSystem];
  const errors = useMemo(() => validateForm(form), [form]);

  // ── Loading ──
  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  const needsObservationDate = form.aquifer_model === 'fetkovich' || form.aquifer_model === 'carter_tracy';

  return (
    <div className="space-y-4">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <CardTitle className="text-lime-300 flex items-center gap-2">
              <Waves className="w-5 h-5" />
              Aquifer model
            </CardTitle>
            <CardDescription>
              Choose how the engine treats water influx during the material balance. Each model lists its validation tier and the published reference it follows.
            </CardDescription>
          </div>
          <Button
            onClick={handleSave}
            disabled={!dirty || saving || errors.length > 0}
            className="bg-lime-600 hover:bg-lime-500 text-slate-950 font-semibold"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* ── Model dropdown ── */}
          <div className="space-y-2">
            <Label htmlFor="aquifer-model-select" className="text-sm text-slate-300">
              Model
            </Label>
            <Select value={form.aquifer_model} onValueChange={handleModelChange}>
              <SelectTrigger id="aquifer-model-select" className="bg-slate-900 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AQUIFER_MODEL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentOption && (
              <div className="flex items-start gap-3 pt-2">
                {currentTier && (
                  <ValidationTierBadge
                    tier={currentTier.tier}
                    reference={currentTier.reference}
                    tolerancePct={currentTier.tolerance_pct}
                    size="sm"
                  />
                )}
                <p className="text-[11px] text-slate-400 leading-relaxed flex-1">
                  {currentOption.description}
                </p>
              </div>
            )}
          </div>

          {/* ── Observation date precondition (Fetkovich / CT) ── */}
          {needsObservationDate && (
            <div className="bg-amber-950/30 border border-amber-800/50 rounded p-3 flex gap-3">
              <Calendar className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs text-amber-300 font-medium">
                  Production data must include observation_date
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {currentOption.label} aquifer models need \u0394t between timesteps to march the water-influx solution forward in time. Open the Data tab and ensure every row has a date set; the engine will report a clear error at run time if a date is missing.
                </p>
              </div>
            </div>
          )}

          {/* ── Per-model parameter sections ── */}
          {form.aquifer_model === 'none' && (
            <div className="bg-slate-900/30 border border-slate-800 rounded p-4">
              <p className="text-xs text-slate-500">No parameters required.</p>
            </div>
          )}

          {form.aquifer_model === 'pot' && (
            <Card className="bg-slate-900/50 border-slate-700">
              <CardHeader className="border-b border-slate-800 p-4">
                <CardTitle className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Pot Aquifer Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="bg-lime-900/20 border border-lime-800/50 rounded p-3 flex gap-3">
                  <CheckCircle className="w-4 h-4 text-lime-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs text-lime-300 font-medium">
                      Aquifer size (W) is estimated automatically
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      The engine derives the original water in place (W) from the slope of the pot aquifer plot during the run. Cumulative water influx (We) is then computed at each timestep via Pletcher Eq. 12: We = (cw + cf) \u00b7 W \u00b7 (pi \u2212 p).
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                      No manual parameter entry required. After running MBAL, the estimated W appears in the result card.
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 italic pt-1">
                  Validated against Pletcher SPE 75354: 0.19% OGIP error for gas (Tables 1-3) and 0.13% OOIP error for oil (Tables 10-13). For best results, exclude very early-time data points where the line hasn't fully developed (the engine's excluded_timesteps field).
                </p>
              </CardContent>
            </Card>
          )}

          {form.aquifer_model === 'fetkovich' && (
            <FetkovichParams form={form} errors={errors} onChange={handleParamChange} />
          )}

          {form.aquifer_model === 'carter_tracy' && (
            <CarterTracyParams form={form} errors={errors} onChange={handleParamChange} />
          )}

          {/* ── Form errors summary ── */}
          {errors.length > 0 && (
            <div className="bg-rose-950/30 border border-rose-700/50 rounded p-3 space-y-1">
              <p className="text-xs text-rose-300 font-medium">
                Fix before saving:
              </p>
              {errors.map((err, i) => (
                <p key={i} className="text-[11px] text-rose-300">
                  \u2022 {err.message}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// =============================================================================
// PARAMETER SUB-COMPONENTS
// =============================================================================

const NumericField = ({
  label,
  unit,
  value,
  onChange,
  placeholder,
  hint,
  error,
  step = 'any',
}) => (
  <div className="space-y-1.5">
    <Label className="text-xs text-slate-300 flex items-center justify-between">
      <span>{label}</span>
      {unit && <span className="text-[10px] text-slate-500 font-mono">{unit}</span>}
    </Label>
    <Input
      type="number"
      step={step}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`h-9 bg-slate-900 border-slate-700 text-slate-200 ${
        error ? 'border-rose-700' : ''
      }`}
    />
    {hint && !error && (
      <p className="text-[10px] text-slate-500 leading-relaxed">{hint}</p>
    )}
    {error && (
      <p className="text-[10px] text-rose-400 leading-relaxed">{error}</p>
    )}
  </div>
);

const FetkovichParams = ({ form, errors, onChange }) => {
  const p = form.aquifer_params;
  const errOf = (field) => errors.find((e) => e.field === field)?.message;

  // W is shown in MM rb but stored in raw rb in state.
  const W_MMrb = p.initial_aquifer_water_in_place_rb != null
    ? p.initial_aquifer_water_in_place_rb / 1e6
    : null;

  const handleW = (raw) => {
    const v = raw === '' ? null : Number(raw);
    if (v == null || Number.isNaN(v)) {
      onChange('initial_aquifer_water_in_place_rb', '');
    } else {
      // Convert MM rb → raw rb on the way into state
      onChange('initial_aquifer_water_in_place_rb', (v * 1e6).toString());
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="border-b border-slate-800 p-4">
        <CardTitle className="text-sm font-bold text-slate-200 uppercase tracking-wider">
          Fetkovich Parameters
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumericField
            label="Initial aquifer water in place (W)"
            unit="MM rb"
            value={W_MMrb}
            onChange={handleW}
            placeholder="e.g. 633"
            hint="Total water originally in the aquifer, in millions of reservoir barrels. Pletcher's modified Roach example uses 633 MM rb (10\u00d7 the hydrocarbon pore volume)."
            error={errOf('initial_aquifer_water_in_place_rb')}
          />
          <NumericField
            label="Aquifer productivity index (J)"
            unit="rb/D/psi"
            value={p.aquifer_pi_rb_d_psi}
            onChange={(v) => onChange('aquifer_pi_rb_d_psi', v)}
            placeholder="e.g. 485"
            hint="Quasi-steady-state aquifer flow capacity. Higher J = stronger waterdrive response per unit pressure drawdown."
            error={errOf('aquifer_pi_rb_d_psi')}
          />
        </div>
        <NumericField
          label="Total compressibility (ct)"
          unit="1/psi"
          value={p.aquifer_total_compressibility_psi}
          onChange={(v) => onChange('aquifer_total_compressibility_psi', v)}
          placeholder="leave blank to use cw + cf"
          hint="Optional. If blank, the engine uses the sum of water and formation compressibilities from the Rock + Water section. Override when the aquifer rock differs materially from the reservoir rock."
        />
        <div className="bg-slate-950/50 border border-slate-800 rounded p-3 mt-2">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-400">How it works.</span>{' '}
            The engine marches the Fetkovich recurrence forward in time using \u0394t between successive observation_date values: \u0394We[n] = (Wei / pi) \u00b7 (p\u0304_aq[n\u22121] \u2212 p_wf[n]) \u00b7 (1 \u2212 exp(\u2212J \u00b7 pi \u00b7 \u0394t / Wei)), where Wei = ct \u00b7 W \u00b7 pi. The reservoir-aquifer interface pressure p_wf is taken as the midpoint of successive reservoir pressures.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

const CarterTracyParams = ({ form, errors, onChange }) => {
  const p = form.aquifer_params;
  const errOf = (field) => errors.find((e) => e.field === field)?.message;

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="border-b border-slate-800 p-4">
        <CardTitle className="text-sm font-bold text-slate-200 uppercase tracking-wider">
          Carter-Tracy Parameters
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumericField
            label="Aquifer permeability (k)"
            unit="mD"
            value={p.aquifer_permeability_md}
            onChange={(v) => onChange('aquifer_permeability_md', v)}
            placeholder="e.g. 100"
            error={errOf('aquifer_permeability_md')}
          />
          <NumericField
            label="Aquifer thickness (h)"
            unit="ft"
            value={p.aquifer_thickness_ft}
            onChange={(v) => onChange('aquifer_thickness_ft', v)}
            placeholder="e.g. 50"
            error={errOf('aquifer_thickness_ft')}
          />
          <NumericField
            label="Aquifer porosity (\u03c6)"
            unit="fraction"
            value={p.aquifer_porosity}
            onChange={(v) => onChange('aquifer_porosity', v)}
            placeholder="e.g. 0.18"
            hint="Between 0 and 1."
            error={errOf('aquifer_porosity')}
          />
          <NumericField
            label="Aquifer angle (\u03b8)"
            unit="degrees"
            value={p.theta_degrees}
            onChange={(v) => onChange('theta_degrees', v)}
            placeholder="360 (full encircling)"
            hint="Use 360\u00b0 for a fully encircling aquifer, 180\u00b0 for a half-circle edge aquifer, etc."
            error={errOf('theta_degrees')}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumericField
            label="Radius ratio (r\u2090 / r_R)"
            unit="dimensionless"
            value={p.radius_ratio}
            onChange={(v) => onChange('radius_ratio', v)}
            placeholder="leave blank for infinite aquifer"
            hint="Optional. The current engine implementation uses the infinite-aquifer pD function regardless. A future update will enforce a finite-aquifer cap when this is set."
          />
          <NumericField
            label="Total compressibility (ct)"
            unit="1/psi"
            value={p.aquifer_total_compressibility_psi}
            onChange={(v) => onChange('aquifer_total_compressibility_psi', v)}
            placeholder="leave blank to use cw + cf"
            hint="Optional. Defaults to the sum of water and formation compressibilities from the Rock + Water section."
          />
        </div>
        <div className="bg-slate-950/50 border border-slate-800 rounded p-3 mt-2 space-y-2">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-400">How it works.</span>{' '}
            The engine uses the Carter-Tracy van Everdingen-Hurst approximation with the Lee-Wattenbarger pD/pD\u2032 polynomial for an infinite radial aquifer. Aquifer constant U is derived from \u03c6, h, ct, and a reservoir radius r_R; dimensionless time tD scales with k and t.
          </p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-400">Current assumptions you inherit.</span>{' '}
            Reservoir radius r_R is treated as 2,980 ft (the 640-acre single-cell convention used in Pletcher's modified Roach example). Water viscosity \u03bc_w is taken as 0.5 cP. A future update will refine both: r_R will be derived from your reservoir geometry, and \u03bc_w will be computed from temperature and salinity. For now, override only if your case differs materially.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AquiferModel;
