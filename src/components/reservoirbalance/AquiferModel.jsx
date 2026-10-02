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
// Units (MBAL-U1, PL3): every field shows and takes its value in the display
// unit and holds it in the engine unit (UnitField, lib/mbalUnits.js). W is
// typed in millions (MMRB or 10^6 rm3).
//
// MBAL-U1-003: saving a model also sets the case flag has_aquifer, which the
// engine's history match reads. The tab used to leave it false.
// MBAL-U1-005: the Carter-Tracy form now shows the reservoir radius, the
// reservoir area, the water viscosity and the aquifer salinity. They were
// read by the engine, written by the Screening segment, invisible here, and
// DROPPED by this tab's Save, after which the engine fell back on a 2,980 ft
// radius (the aquifer constant goes with the square of that radius).

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
  updateCase,
} from '@/pages/apps/reservoir-balance/lib/api';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import UnitField from './UnitField';

// =============================================================================
// CONFIG
// =============================================================================
//
// Pre-run tier badges read lib/tierMatrix.json, which is GENERATED from the
// engine's resolveValidationTier() (npx tsx
// tools/validation/gen-tier-matrix-golden.ts). MB7 closed the Capsule 4B
// carry-over: the hand-maintained mirror here had drifted (it still showed
// Carter-Tracy as published_method after the Phase 5 benchmark promotion).
// Never hand-edit tiers again; regenerate after engine tier changes.

import tierMatrixJson from '@/pages/apps/reservoir-balance/lib/tierMatrix.json';

const TIER_MATRIX = tierMatrixJson.matrix;

const AQUIFER_MODEL_OPTIONS = [
  {
    value: 'none',
    label: 'None (closed system)',
    description:
      'A closed tank with no aquifer. Pressure falls with production and is held only by the expansion of the fluids, the rock and the connate water.',
  },
  {
    value: 'pot',
    label: 'Pot aquifer',
    description:
      'Small bounded aquifer that follows the reservoir pressure at once (Pletcher Eq. 12). The regression estimates its water in place (W); nothing is entered. For a high-permeability reservoir with an aquifer bounded by faults or a pinch-out.',
  },
  {
    value: 'fetkovich',
    label: 'Fetkovich',
    description:
      'Finite aquifer with a productivity index, marched through time (Fetkovich 1971). For an aquifer whose inflow is limited by its rate. Needs W and J.',
  },
  {
    value: 'carter_tracy',
    label: 'Carter-Tracy',
    description:
      'Unsteady-state radial aquifer (Carter-Tracy 1960, with the Lee-Wattenbarger fit to the van Everdingen-Hurst functions). For a large aquifer whose response lags the pressure, where the pseudo-steady state of Fetkovich does not hold.',
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
    aquifer_radius_ft: null,
    reservoir_area_acres: null,
    aquifer_water_viscosity_cp: null,
    water_salinity_ppm: null,
    // Shared optional override
    aquifer_total_compressibility_psi: null,
  },
};

/** The parameters each model keeps when the tab saves: every one the engine reads for it. */
export const MODEL_PARAM_KEYS = Object.freeze({
  none: [],
  pot: [],
  fetkovich: ['initial_aquifer_water_in_place_rb', 'aquifer_pi_rb_d_psi', 'aquifer_total_compressibility_psi'],
  carter_tracy: [
    'aquifer_permeability_md', 'aquifer_thickness_ft', 'aquifer_porosity', 'theta_degrees', 'radius_ratio',
    'aquifer_radius_ft', 'reservoir_area_acres', 'aquifer_water_viscosity_cp', 'water_salinity_ppm', 'aquifer_total_compressibility_psi',
  ],
});

/** aquifer_params as saved for a model: its own keys, the ones that hold a value. */
export function paramsToSaveFor(model, params) {
  const keys = MODEL_PARAM_KEYS[model] ?? [];
  if (!keys.length) return null;
  const out = {};
  for (const key of keys) if (params?.[key] != null && Number.isFinite(Number(params[key]))) out[key] = Number(params[key]);
  return out;
}

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
      errors.push({ field: 'theta_degrees', message: 'The encroachment angle must be above 0 and at most 360 degrees.' });
    }
  }
  return errors;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const AquiferModel = ({ caseId, caseData, onConfigChange }) => {
  const { toast } = useToast();
  const { units, applyCasePatch } = useMaterialBalanceStudio();
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

  // ── Param input change: UnitField commits a number in the engine unit, or null ──
  const handleParamChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      aquifer_params: {
        ...prev.aquifer_params,
        [field]: value == null || !Number.isFinite(Number(value)) ? null : Number(value),
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

    const paramsToSave = paramsToSaveFor(form.aquifer_model, form.aquifer_params);

    setSaving(true);
    const { data, error } = await upsertCaseDefaultConfig(caseId, {
      aquifer_model: form.aquifer_model,
      aquifer_history_match: form.aquifer_history_match,
      aquifer_params: paramsToSave,
    });
    // the case flag follows the model: the engine's history match reads it
    const flag = form.aquifer_model !== 'none';
    let flagError = null;
    if (!error && Boolean(caseData?.has_aquifer) !== flag) {
      const res = await updateCase(caseId, { has_aquifer: flag });
      flagError = res?.error ?? null;
      if (!flagError) applyCasePatch?.({ has_aquifer: flag });
    }
    setSaving(false);

    if (error || flagError) {
      toast({
        title: 'Save failed',
        description: (error || flagError).message,
        variant: 'destructive',
      });
      return;
    }

    setLoadedConfigId(data.id);
    setDirty(false);
    toast({
      title: 'Aquifer config saved',
      description: `The next run uses ${form.aquifer_model === 'none' ? 'no aquifer' : `the ${AQUIFER_MODEL_OPTIONS.find((o) => o.value === form.aquifer_model)?.label ?? form.aquifer_model} model`}.`,
    });
    onConfigChange?.(data);
  };

  // ── Derived values ──
  const currentOption = useMemo(
    () => AQUIFER_MODEL_OPTIONS.find((o) => o.value === form.aquifer_model),
    [form.aquifer_model],
  );
  const currentTier = TIER_MATRIX?.[fluidSystem]?.[form.aquifer_model]?.[
    caseData?.has_gas_cap ? 'with_gas_cap' : 'no_gas_cap'
  ];
  const errors = useMemo(() => validateForm(form), [form]);

  // ── Loading ──
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-pl-muted" />
        </CardContent>
      </Card>
    );
  }

  const needsObservationDate = form.aquifer_model === 'fetkovich' || form.aquifer_model === 'carter_tracy';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
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
            className="font-semibold"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* ── Model dropdown ── */}
          <div className="space-y-2">
            <Label htmlFor="aquifer-model-select" className="text-sm text-pl-text">
              Model
            </Label>
            <Select value={form.aquifer_model} onValueChange={handleModelChange}>
              <SelectTrigger id="aquifer-model-select">
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
                <p className="text-[11px] text-pl-muted leading-relaxed flex-1">
                  {currentOption.description}
                </p>
              </div>
            )}
          </div>

          {/* ── Observation date precondition (Fetkovich / CT) ── */}
          {needsObservationDate && (
            <div className="bg-pl-warning-bg border border-pl-warning/40 rounded p-3 flex gap-3">
              <Calendar className="w-4 h-4 text-pl-warning-text flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs text-pl-warning-text font-medium">
                  The data rows need dates
                </p>
                <p className="text-[11px] text-pl-muted leading-relaxed">
                  The {currentOption.label} model marches the water influx through time, so it needs the time between timesteps. Give every row of the Data tab a date. The engine stops with a message that names the row when a date is missing.
                </p>
              </div>
            </div>
          )}

          {/* ── Per-model parameter sections ── */}
          {form.aquifer_model === 'none' && (
            <div className="bg-pl-surface border border-pl-border rounded p-4">
              <p className="text-xs text-pl-muted">No parameters required.</p>
            </div>
          )}

          {form.aquifer_model === 'pot' && (
            <Card>
              <CardHeader className="border-b border-pl-border p-4">
                <CardTitle className="text-sm font-bold text-pl-text uppercase tracking-wider">
                  Pot Aquifer Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="bg-pl-success-bg border border-pl-success/40 rounded p-3 flex gap-3">
                  <CheckCircle className="w-4 h-4 text-pl-success-text flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs text-pl-success-text font-medium">
                      Aquifer size (W) is estimated automatically
                    </p>
                    <p className="text-[11px] text-pl-muted leading-relaxed">
                      The engine takes the water in place (W) from the slope of the pot aquifer plot during the run. The water influx at each timestep then follows Pletcher Eq. 12: We = (cw + cf) W (pi - p).
                    </p>
                    <p className="text-[11px] text-pl-muted leading-relaxed pt-1">
                      Nothing to enter. After a run the estimated W is on the result card and in the report.
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-pl-muted italic pt-1">
                  Checked against Pletcher SPE 75354: 0.19 percent on OGIP for gas (Tables 1 to 3) and 0.13 percent on OOIP for oil (Tables 10 to 13). Early points taken before the line has developed can be left out of the fit on the Data tab.
                </p>
              </CardContent>
            </Card>
          )}

          {form.aquifer_model === 'fetkovich' && (
            <FetkovichParams form={form} errors={errors} onChange={handleParamChange} units={units} />
          )}

          {form.aquifer_model === 'carter_tracy' && (
            <CarterTracyParams form={form} errors={errors} onChange={handleParamChange} units={units} />
          )}

          {/* ── Form errors summary ── */}
          {errors.length > 0 && (
            <div className="bg-pl-danger-bg border border-pl-danger/40 rounded p-3 space-y-1">
              <p className="text-xs text-pl-danger-text font-medium">
                Fix before saving:
              </p>
              {errors.map((err, i) => (
                <p key={i} className="text-[11px] text-pl-danger-text">
                  {err.message}
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

const FetkovichParams = ({ form, errors, onChange, units }) => {
  const p = form.aquifer_params;
  const errOf = (field) => errors.find((e) => e.field === field)?.message;
  return (
    <Card>
      <CardHeader className="border-b border-pl-border p-4">
        <CardTitle className="text-sm font-bold text-pl-text uppercase tracking-wider">
          Fetkovich Parameters
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UnitField
            label="Initial aquifer water in place (W)" quantity="resVolumeMM" units={units} required testId="mbal-aq-w"
            value={p.initial_aquifer_water_in_place_rb}
            onCommit={(v) => onChange('initial_aquifer_water_in_place_rb', v)}
            placeholder="e.g. 633"
            hint="Water originally in the aquifer, in millions of reservoir volume. Pletcher's modified Roach example uses 633 MMRB, ten times the hydrocarbon pore volume."
            error={errOf('initial_aquifer_water_in_place_rb')}
          />
          <UnitField
            label="Aquifer productivity index (J)" quantity="aquiferIndex" units={units} required testId="mbal-aq-j"
            value={p.aquifer_pi_rb_d_psi}
            onCommit={(v) => onChange('aquifer_pi_rb_d_psi', v)}
            placeholder="e.g. 485"
            hint="Pseudo-steady-state flow capacity of the aquifer. A higher J answers a pressure drop faster."
            error={errOf('aquifer_pi_rb_d_psi')}
          />
        </div>
        <UnitField
          label="Total compressibility (ct)" quantity="compressibility" units={units} testId="mbal-aq-ct"
          value={p.aquifer_total_compressibility_psi}
          onCommit={(v) => onChange('aquifer_total_compressibility_psi', v)}
          placeholder="blank: cw + cf"
          hint="Optional. Blank uses the sum of the water and formation compressibilities of the PVT tab. Enter a value when the aquifer rock differs from the reservoir rock."
        />
        <div className="bg-pl-sunken border border-pl-border rounded p-3 mt-2">
          <p className="text-[10px] text-pl-muted leading-relaxed">
            <span className="font-semibold text-pl-muted">How it works.</span>{' '}
            The engine marches the Fetkovich recurrence through the dates of the Data tab: the influx of a step is (Wei / pi) times (average aquifer pressure minus boundary pressure) times (1 minus exp(minus J pi dt / Wei)), with Wei = ct W pi. The boundary pressure is the mean of the reservoir pressures at the two ends of the step.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

const CarterTracyParams = ({ form, errors, onChange, units }) => {
  const p = form.aquifer_params;
  const errOf = (field) => errors.find((e) => e.field === field)?.message;

  return (
    <Card>
      <CardHeader className="border-b border-pl-border p-4">
        <CardTitle className="text-sm font-bold text-pl-text uppercase tracking-wider">
          Carter-Tracy Parameters
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UnitField
            label="Aquifer permeability (k)" unitText="mD" required testId="mbal-aq-k"
            value={p.aquifer_permeability_md}
            onCommit={(v) => onChange('aquifer_permeability_md', v)}
            placeholder="e.g. 100"
            error={errOf('aquifer_permeability_md')}
          />
          <UnitField
            label="Aquifer thickness (h)" quantity="depth" units={units} required testId="mbal-aq-h"
            value={p.aquifer_thickness_ft}
            onCommit={(v) => onChange('aquifer_thickness_ft', v)}
            placeholder="e.g. 50"
            error={errOf('aquifer_thickness_ft')}
          />
          <UnitField
            label="Aquifer porosity" unitText="fraction" required testId="mbal-aq-phi"
            value={p.aquifer_porosity}
            onCommit={(v) => onChange('aquifer_porosity', v)}
            placeholder="e.g. 0.18"
            hint="Between 0 and 1."
            error={errOf('aquifer_porosity')}
          />
          <UnitField
            label="Encroachment angle" unitText="degrees" required testId="mbal-aq-theta"
            value={p.theta_degrees}
            onCommit={(v) => onChange('theta_degrees', v)}
            placeholder="360 for a full circle"
            hint="360 for an aquifer all round the reservoir, 180 for an edge aquifer on one side."
            error={errOf('theta_degrees')}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UnitField
            label="Reservoir radius at the contact (r_R)" quantity="depth" units={units} testId="mbal-aq-radius"
            value={p.aquifer_radius_ft}
            onCommit={(v) => onChange('aquifer_radius_ft', v)}
            placeholder="blank: from the area, else 2,980 ft"
            hint="The aquifer constant goes with the square of this radius. Blank takes it from the reservoir area and the angle, and with no area the engine uses 2,980 ft, the radius of a 640 acre cell."
          />
          <UnitField
            label="Reservoir area" quantity="area" units={units} testId="mbal-aq-area"
            value={p.reservoir_area_acres}
            onCommit={(v) => onChange('reservoir_area_acres', v)}
            placeholder="used when no radius is entered"
            hint="Optional. Gives the radius when none is entered."
          />
          <UnitField
            label="Radius ratio (aquifer over reservoir)" unitText="dimensionless" testId="mbal-aq-red"
            value={p.radius_ratio}
            onCommit={(v) => onChange('radius_ratio', v)}
            placeholder="blank: infinite aquifer"
            hint="Optional. With a value the engine moves to the bounded aquifer solution at late time; blank keeps the infinite-acting one."
          />
          <UnitField
            label="Total compressibility (ct)" quantity="compressibility" units={units} testId="mbal-aq-ct"
            value={p.aquifer_total_compressibility_psi}
            onCommit={(v) => onChange('aquifer_total_compressibility_psi', v)}
            placeholder="blank: cw + cf"
            hint="Optional. Blank uses the sum of the water and formation compressibilities of the PVT tab."
          />
          <UnitField
            label="Aquifer water viscosity" quantity="viscosity" units={units} testId="mbal-aq-muw"
            value={p.aquifer_water_viscosity_cp}
            onCommit={(v) => onChange('aquifer_water_viscosity_cp', v)}
            placeholder="blank: McCain (1991)"
            hint="Optional. Blank uses the McCain correlation at the initial pressure, the reservoir temperature and the salinity."
          />
          <UnitField
            label="Aquifer water salinity" unitText="ppm" testId="mbal-aq-salinity"
            value={p.water_salinity_ppm}
            onCommit={(v) => onChange('water_salinity_ppm', v)}
            placeholder="blank: the salinity of the PVT tab"
            hint="Optional. Read only when the water viscosity is left blank."
          />
        </div>
        <div className="bg-pl-sunken border border-pl-border rounded p-3 mt-2 space-y-2">
          <p className="text-[10px] text-pl-muted leading-relaxed">
            <span className="font-semibold text-pl-muted">How it works.</span>{' '}
            The engine uses the Carter-Tracy approximation of the van Everdingen-Hurst solution for a radial aquifer. The aquifer constant comes from the porosity, the thickness, ct, the radius and the angle; dimensionless time scales with k and with time.
          </p>
          <p className="text-[10px] text-pl-muted leading-relaxed">
            <span className="font-semibold text-pl-muted">What a blank means.</span>{' '}
            Every value the engine fills in for a blank is named in the run warnings and printed in the report as a default.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AquiferModel;
