// src/components/reservoirbalance/PvtRock.jsx
//
// Reservoir Balance — PVT & Rock Properties component
// =====================================================
//
// Capsule 4C chunk c.2.b — standalone PVT lab table editor
//   - Adds pvt_source radio (Correlated / Lab Table). Lab-table mode shows
//     a row-by-row editable table for user-supplied PVT.
//   - When pvt_source === 'lab_table', the engine interpolates at each
//     timestep's pressure using the rows the user enters. Out-of-range
//     pressures fall through to correlations; this is documented inline.
//   - Client-side validation: at least 2 rows, positive pressures, no
//     pressure twice. The rows may be typed in any order (a lab report runs
//     from the highest pressure down) and are sorted on save. Until MBAL-U1
//     the tab refused a table that was not ascending while it said the rows
//     are sorted on save.
//   - The PVT preview chart and table still show correlation output (preview
//     remains correlation-driven even in lab-table mode). Documented inline
//     so users understand the preview is for reference; runs use the actual
//     lab table.
//
// Capsule 4C chunk c.2.a (carried forward) — correlation library UI exposure:
//   - 7 engine-supported correlations available in dropdowns
//   - CorrelationSelect sub-component with description + inline validity-range
//     hint when a non-default correlation is selected
//   - Single-option correlations (McCain Bw, Lee-Gonzalez-Eakin gas viscosity)
//     surfaced as informational rows

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import {
  AlertTriangle,
  CheckCircle,
  Calculator,
  RefreshCw,
  Save,
  Loader2,
  Info,
  Plus,
  Trash2,
  FlaskConical,
} from 'lucide-react';
import {
  getCaseDefaultConfig,
  getPvtPreview,
  savePvtConfig,
} from '@/pages/apps/reservoir-balance/lib/api';
import ChartLogo from '@/components/charts/ChartLogo';
import { buildPvtPrefillRows } from '@/pages/apps/reservoir-balance/lib/fluidStudioPvtPrefill';
import {
  describePvtSource, markTableEdited, clearTableOrigin, PVT_TABLE_ORIGIN_KEY,
} from '@/pages/apps/reservoir-balance/lib/pvtSource';

// MBAL charts overlay the logo directly on the plot area, so the suite
// default (180px) overflows them; keep the mark small in this app.
const MBAL_LOGO_STYLE = { height: '40px' };
import {
  CHART_COLORS,
  CHART_TYPOGRAPHY,
  CHART_MARGINS,
  GRID_STYLE,
  TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import { engineSideCorrelations } from '@/pages/apps/reservoir-balance/lib/studyMeta';
import UnitField from './UnitField';
import { supabase } from '@/lib/customSupabaseClient';
import { useSearchParams } from 'react-router-dom';
import {
  listFluidProjects, readFluidProjectBlock, tableFromPvtBlock, FLUID_PROJECT_PARAM,
} from '@/pages/apps/reservoir-balance/lib/pvtIntake';
import { COMPACT_FIELD_THEMED } from '@/components/ui/native-select';
import { RUN_INPUT_DEFAULTS } from '@/pages/apps/reservoir-balance/lib/runStaleness';

// =============================================================================
// HELPERS
// =============================================================================

// What a run assumes for a blank (lib/runStaleness.js RUN_INPUT_DEFAULTS; the engine takes 35 degAPI).
const RUN_DEFAULT_API = 35;
const numOr = (v, fallback) => {
  if (v === '' || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const formatNum = (val, decimals = 2, fallback = EMPTY_VALUE) => {
  if (val === null || val === undefined) return fallback;
  const num = parseFloat(val);
  return isNaN(num) ? fallback : num.toFixed(decimals);
};

// Correlation choices. Every entry below is implemented in the engine
// and dispatched at runtime via inputs.pvt_correlations.
const CORRELATION_OPTIONS = {
  pb_rs_bo: [
    {
      value: 'standing',
      label: 'Standing (1947)',
      description: 'Default. Broad applicability; California crudes basis.',
    },
    {
      value: 'vasquez_beggs',
      label: 'Vasquez-Beggs (1980)',
      description: 'Alternative formulation; coefficients split at 30 °API.',
    },
    {
      value: 'glaso',
      label: 'Glaso (1980)',
      description: 'North Sea / Niger Delta lighter crudes.',
    },
  ],
  oil_viscosity: [
    {
      value: 'beggs_robinson',
      label: 'Beggs-Robinson (1975)',
      description: 'Default. Live-oil viscosity, with the Vasquez-Beggs correction above the bubble point.',
    },
    {
      value: 'beal_standing',
      label: 'Beal / Standing dead-oil (1946)',
      description: 'Dead-oil baseline only.',
    },
  ],
  z_factor: [
    {
      value: 'hall_yarborough',
      label: 'Hall-Yarborough (1973)',
      description: 'Default. Implicit equation; quick.',
    },
    {
      value: 'dranchuk_abou_kassem',
      label: 'Dranchuk-Abou-Kassem (1975)',
      description: 'More accurate at low Tpr and very high Ppr.',
    },
  ],
};

// Validity-range information per correlation, from each primary publication.
const CORRELATION_VALIDITY = {
  standing: null,
  vasquez_beggs:
    'Published range: pressure to 5,250 psia; 75 to 294 degF; 15.3 to 59.5 degAPI; gas gravity 0.51 to 1.35; Rs 20 to 2,199 scf/STB. The engine warns when the case is outside it, and the report flags it.',
  glaso:
    'Published range: 150 to 7,127 psia; 80 to 280 degF; 22.3 to 48.1 degAPI; gas gravity 0.65 to 1.28; Rs 90 to 2,637 scf/STB. The engine warns when the case is outside it, and the report flags it.',
  beggs_robinson: null,
  beal_standing:
    'Dead-oil baseline. Published range: 18 to 50 degAPI; 100 to 220 degF. Use Beggs-Robinson for a saturated live oil.',
  hall_yarborough: null,
  dranchuk_abou_kassem:
    'Published range: pseudo-reduced pressure 0.2 to 30, pseudo-reduced temperature 1.0 to 3.0. Preferred below a pseudo-reduced temperature of about 1.2, where Hall-Yarborough loses accuracy.',
};

// PVT source options. Engine respects this as input validation: lab_table
// requires either pvt_lab_table or per-row PVT in production_data.
const PVT_SOURCE_OPTIONS = [
  {
    value: 'correlated',
    label: 'Correlated',
    description: 'Engine computes PVT from the selected correlations.',
  },
  {
    value: 'lab_table',
    label: 'PVT table',
    description:
      'Engine interpolates PVT from the table on this tab at each timestep pressure: measured lab data, or a table built from correlations and named as such in the report. Pressures outside the table fall through to correlations.',
  },
];

// Lab-table column schema. "show" determines which columns are visible per
// fluid system. All columns except pressure_psia are optional.
// `quantity` is the key of lib/mbalUnits the column is shown and typed in;
// the row itself holds the engine unit named in its key.
const LAB_TABLE_COLUMNS = [
  { key: 'pressure_psia', label: 'Pressure', quantity: 'pressure', show: 'always', required: true },
  { key: 'bo_rb_stb', label: 'Bo', quantity: 'fvfOil', show: 'oil' },
  { key: 'rs_scf_stb', label: 'Rs', quantity: 'gor', show: 'oil' },
  { key: 'oil_viscosity_cp', label: 'Oil viscosity', quantity: 'viscosity', show: 'oil' },
  { key: 'z_factor', label: 'Z', quantity: null, show: 'gas' },
  { key: 'bg_rb_mscf', label: 'Bg', quantity: 'fvfGas', show: 'gas' },
  { key: 'gas_viscosity_cp', label: 'Gas viscosity', quantity: 'viscosity', show: 'gas' },
  { key: 'bw_rb_stb', label: 'Bw', quantity: 'fvfOil', show: 'always' },
];

// Filter columns by fluid system. Returns the visible columns in stable order.
function visibleLabColumns(showOilProps, showGasProps) {
  return LAB_TABLE_COLUMNS.filter((c) => {
    if (c.show === 'always') return true;
    if (c.show === 'oil') return showOilProps;
    if (c.show === 'gas') return showGasProps;
    return false;
  });
}

/**
 * Parse the gas cap ratio field.
 *
 * Blank means "not stated" and must reach the engine as null, not 0: m = 0 is
 * the undersaturated material balance (the m·Eg term vanishes), so writing a 0
 * for an empty field would record a decision the user never made and silence
 * the engine warning that exists to catch exactly that.
 */
export function parseGasCapM(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const v = parseFloat(raw);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

// Default form state per fluid system
function defaultFormState(caseData) {
  const isGas = caseData?.fluid_system === 'gas';
  return {
    // Blank until the user states a value (MBAL-U1-007). The tab used to
    // open on 35 degAPI, 0.75 and 50,000 ppm as though they were the case's
    // values, beside a "Saved" mark, while a run with nothing saved used
    // 0.7 and no salinity. A blank is now a blank, the placeholder names
    // what a run assumes for it, and the report prints it as an assumption.
    oil_gravity_api: '',
    gas_specific_gravity: '',
    water_salinity_ppm: '',
    correlations: {
      pb_rs_bo: 'standing',
      oil_viscosity: 'beggs_robinson',
      z_factor: 'hall_yarborough',
      water: 'mccain',
      gas_viscosity: 'lee_gonzalez_eakin',
    },
    pvt_source: 'correlated',
    pvt_lab_table: [],
    formation_compressibility_psi: '',
    water_compressibility_psi: '',
    // Blank, not 0: an empty field is "not stated yet" and the engine warns
    // about it, whereas a pre-filled 0 would look like a decision the user made.
    gas_cap_ratio_m: '',
  };
}

// Client-side validation matching engine's validateLabTable. Returns an
// array of human-readable error messages (empty if the table is valid for
// engine use).
function validateLabTableClient(rows) {
  const errors = [];
  if (rows.length === 0) {
    errors.push('Lab table is empty. Add at least 2 rows or switch back to Correlated.');
    return errors;
  }
  if (rows.length < 2) {
    errors.push('At least 2 rows are required for interpolation.');
  }
  for (let i = 0; i < rows.length; i++) {
    const p = parseFloat(rows[i].pressure_psia);
    if (!isFinite(p) || p <= 0) {
      errors.push(`Row ${i + 1}: pressure must be a positive number.`);
    }
  }
  // Order is free: a lab report prints the table from the highest pressure
  // down, and the rows are sorted when the table is saved. A pressure given
  // twice cannot be interpolated.
  const seen = new Map();
  rows.forEach((row, i) => {
    const p = parseFloat(row.pressure_psia);
    if (!isFinite(p)) return;
    if (seen.has(p)) errors.push(`Rows ${seen.get(p) + 1} and ${i + 1} hold the same pressure. Keep one of them.`);
    else seen.set(p, i);
  });
  return errors;
}

// Coerce a row from form state (string values from <Input>) into the
// engine's expected numeric shape. Empty/blank values become undefined so
// the engine treats them as "missing for this row" rather than zero.
function rowToEnginePayload(row) {
  const out = {};
  for (const col of LAB_TABLE_COLUMNS) {
    const v = row[col.key];
    if (v === '' || v === null || v === undefined) continue;
    const n = parseFloat(v);
    if (!isNaN(n)) out[col.key] = n;
  }
  return out;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const PvtRock = ({ caseId, caseData, onConfigChange }) => {
  const { toast } = useToast();
  const { units } = useMaterialBalanceStudio();

  const fluidSystem = caseData?.fluid_system ?? 'oil';
  const isGas = fluidSystem === 'gas';
  const isOilWithGasCap = fluidSystem === 'oil_with_gas_cap';
  const showOilProps = !isGas;
  const showGasProps = isGas || isOilWithGasCap;

  // ── State ──
  const [form, setForm] = useState(() => defaultFormState(caseData));
  const [loadedConfigId, setLoadedConfigId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [previewRows, setPreviewRows] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMeta, setPreviewMeta] = useState(null);
  const [previewWarnings, setPreviewWarnings] = useState([]);
  const [activePlot, setActivePlot] = useState(isGas ? 'z' : 'bo');

  // ── Initial hydrate ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!caseId) {
        setLoading(false);
        return;
      }
      const { data: cfg, error } = await getCaseDefaultConfig(caseId);
      if (cancelled) return;
      if (error) {
        toast({
          title: 'Could not load PVT config',
          description: error.message,
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }
      if (cfg) {
        setLoadedConfigId(cfg.id);
        // Hydrate pvt_lab_table from DB. Each row may be a sparse object —
        // we coerce numeric fields back to strings so <Input value> works
        // cleanly (controlled inputs require strings).
        const rawLabRows = Array.isArray(cfg.pvt_lab_table) ? cfg.pvt_lab_table : [];
        const hydratedLabRows = rawLabRows.map((row) => {
          const out = {};
          for (const col of LAB_TABLE_COLUMNS) {
            const v = row?.[col.key];
            out[col.key] = v == null ? '' : String(v);
          }
          return out;
        });
        setForm({
          oil_gravity_api: cfg.oil_gravity_api ?? '',
          gas_specific_gravity: cfg.gas_specific_gravity ?? '',
          water_salinity_ppm: cfg.water_salinity_ppm ?? '',
          // the study record (identification, datum, sources) is the Report tab's; this tab never sends it back
          correlations: engineSideCorrelations(cfg.pvt_correlations) ?? defaultFormState(caseData).correlations,
          pvt_source: cfg.pvt_source ?? 'correlated',
          pvt_lab_table: hydratedLabRows,
          formation_compressibility_psi: cfg.formation_compressibility_psi ?? '',
          water_compressibility_psi: cfg.water_compressibility_psi ?? '',
          gas_cap_ratio_m: cfg.gas_cap_ratio_m == null ? '' : String(cfg.gas_cap_ratio_m),
        });
      }
      setDirty(false);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, caseData, toast]);

  // ── Form mutators ──
  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const updateCorrelation = (key, value) => {
    setForm((prev) => ({
      ...prev,
      correlations: { ...prev.correlations, [key]: value },
    }));
    setDirty(true);
  };

  // ── Lab table mutators ──
  // Note: rows are kept as user types (no auto-sort during edit), so the user
  // doesn't fight the cursor jumping. Final sort happens on save.
  const labRowUpdate = (idx, key, value) => {
    setForm((prev) => {
      const next = [...prev.pvt_lab_table];
      next[idx] = { ...next[idx], [key]: value };
      // H5: a generated table that is then edited says so in the report
      return { ...prev, pvt_lab_table: next, correlations: markTableEdited(prev.correlations) };
    });
    setDirty(true);
  };

  const labRowAdd = () => {
    setForm((prev) => {
      const blank = {};
      for (const col of LAB_TABLE_COLUMNS) blank[col.key] = '';
      return { ...prev, pvt_lab_table: [...prev.pvt_lab_table, blank], correlations: markTableEdited(prev.correlations) };
    });
    setDirty(true);
  };

  const labRowDelete = (idx) => {
    setForm((prev) => ({
      ...prev,
      pvt_lab_table: prev.pvt_lab_table.filter((_, i) => i !== idx),
      correlations: markTableEdited(prev.correlations),
    }));
    setDirty(true);
  };

  const labTableClear = () => {
    // a cleared table is no longer the generated one: its origin goes with it
    setForm((prev) => ({ ...prev, pvt_lab_table: [], correlations: clearTableOrigin(prev.correlations) }));
    setDirty(true);
  };

  // ── Validation feedback for lab table ──
  const labTableErrors = useMemo(() => {
    if (form.pvt_source !== 'lab_table') return [];
    return validateLabTableClient(form.pvt_lab_table);
  }, [form.pvt_source, form.pvt_lab_table]);

  // ── Recalculate preview ──
  const handleRecalculate = useCallback(async () => {
    if (!caseData) return;
    const reservoirTemp = parseFloat(caseData.reservoir_temperature_f);
    if (!reservoirTemp || isNaN(reservoirTemp)) {
      toast({
        title: 'Missing reservoir temperature',
        description: 'Set the reservoir temperature on the case (Edit case on the case card) before generating the PVT preview.',
        variant: 'destructive',
      });
      return;
    }

    setPreviewLoading(true);
    const inputs = {
      fluid_system: fluidSystem,
      reservoir_temperature_f: reservoirTemp,
      pvt_correlations: form.correlations,
      n_steps: 30,
    };
    if (showOilProps) {
      inputs.oil_gravity_api = numOr(form.oil_gravity_api, RUN_DEFAULT_API);
    }
    if (showGasProps) {
      inputs.gas_specific_gravity = numOr(form.gas_specific_gravity, isGas ? RUN_INPUT_DEFAULTS.gas_specific_gravity_gas : RUN_INPUT_DEFAULTS.gas_specific_gravity_oil);
    }
    if (caseData.bubble_point_psia) {
      inputs.bubble_point_psia = parseFloat(caseData.bubble_point_psia);
    }
    if (caseData.initial_pressure_psia) {
      inputs.initial_pressure_psia = parseFloat(caseData.initial_pressure_psia);
    }

    const { data, error } = await getPvtPreview(inputs);
    setPreviewLoading(false);

    if (error) {
      toast({
        title: 'PVT preview failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setPreviewRows(data?.rows ?? []);
    setPreviewMeta(data?.metadata ?? null);
    setPreviewWarnings(data?.warnings ?? []);

    toast({
      title: 'PVT preview updated',
      description: `${data?.rows?.length ?? 0} rows generated.`,
    });

    (data?.warnings ?? []).forEach((w) =>
      toast({
        title: 'Engine note',
        description: w,
        duration: 6000,
      }),
    );
  }, [caseData, fluidSystem, form, showOilProps, showGasProps, isGas, toast]);

  // ── Save config ──
  const handleSave = async () => {
    if (!caseId) return;

    // Pre-flight: if lab-table mode is selected, run client-side validation
    // first. Engine will also validate, but failing fast here saves a round
    // trip and gives clearer line-level feedback.
    if (form.pvt_source === 'lab_table' && labTableErrors.length > 0) {
      toast({
        title: 'Lab table has errors',
        description: labTableErrors[0] + (labTableErrors.length > 1 ? ` (and ${labTableErrors.length - 1} more)` : ''),
        variant: 'destructive',
      });
      return;
    }

    // Build the payload. Lab table is normalized: numeric coercion + sort
    // ascending by pressure_psia. Sort happens here (not during edit) so
    // we don't fight the user's cursor.
    let labTablePayload = null;
    if (form.pvt_source === 'lab_table' && form.pvt_lab_table.length > 0) {
      labTablePayload = form.pvt_lab_table
        .map(rowToEnginePayload)
        .filter((r) => isFinite(r.pressure_psia) && r.pressure_psia > 0)
        .sort((a, b) => a.pressure_psia - b.pressure_psia);
    }

    setSaving(true);
    const { data, error } = await savePvtConfig(caseId, {
      pvt_source: form.pvt_source,
      pvt_lab_table: labTablePayload,
      // a blank is saved as "not stated" (null), never as a number nobody typed
      oil_gravity_api: showOilProps ? numOr(form.oil_gravity_api, null) : null,
      gas_specific_gravity: numOr(form.gas_specific_gravity, null),
      water_salinity_ppm: numOr(form.water_salinity_ppm, null),
      correlations: form.correlations,
      formation_compressibility_psi: numOr(form.formation_compressibility_psi, null),
      water_compressibility_psi: numOr(form.water_compressibility_psi, null),
      // Only oil-with-gas-cap cases carry m. Blank saves as null rather than 0
      // so the engine can tell "not stated" from "stated as none".
      gas_cap_ratio_m: isOilWithGasCap ? parseGasCapM(form.gas_cap_ratio_m) : null,
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
      title: 'PVT config saved',
      description: 'Run MBAL will use these settings.',
    });
    onConfigChange?.(data);
  };

  // ── Auto-generate preview once on mount (or after first hydrate) ──
  useEffect(() => {
    if (!loading && previewRows.length === 0 && caseData) {
      handleRecalculate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Chart configuration ──
  const plotConfig = useMemo(() => {
    if (isGas) {
      return {
        z: { dataKey: 'z', name: 'Z (gas deviation factor)', color: '#059669', quantity: null },
        bg: { dataKey: 'Bg', name: `Bg (${units.label('fvfGas')})`, color: '#2563eb', quantity: 'fvfGas' },
      };
    }
    return {
      bo: { dataKey: 'Bo', name: `Bo (${units.label('fvfOil')})`, color: '#059669', quantity: 'fvfOil' },
      rs: { dataKey: 'Rs', name: `Solution GOR Rs (${units.label('gor')})`, color: '#2563eb', quantity: 'gor' },
      muo: {
        dataKey: 'oil_viscosity_cp',
        name: `Oil viscosity (${units.label('viscosity')})`,
        color: '#dc2626',
        quantity: 'viscosity',
      },
    };
  }, [isGas, units]);

  const currentPlot = plotConfig[activePlot] ?? Object.values(plotConfig)[0];
  // the preview in the display units: the chart and the table read these rows
  const viewRows = useMemo(() => previewRows.map((row) => ({
    ...row,
    pressure_view: units.to('pressure', Number(row.pressure_psia)),
    Bo: row.Bo == null ? null : units.to('fvfOil', Number(row.Bo)),
    Rs: row.Rs == null ? null : units.to('gor', Number(row.Rs)),
    Bg: row.Bg == null ? null : units.to('fvfGas', Number(row.Bg)),
    oil_viscosity_cp: row.oil_viscosity_cp == null ? null : units.to('viscosity', Number(row.oil_viscosity_cp)),
    gas_viscosity_cp: row.gas_viscosity_cp == null ? null : units.to('viscosity', Number(row.gas_viscosity_cp)),
  })), [previewRows, units]);
  const pDigits = units.unit('pressure') === 'psi' || units.unit('pressure') === 'kPa' ? 0 : 2;

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-pl-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!caseData) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-pl-muted">
          No case data. PvtRock must be mounted inside a case detail page.
        </CardContent>
      </Card>
    );
  }

  // =============================================================================
  // RENDER
  // =============================================================================
  return (
    <div className="space-y-6">
      {/* Header card with controls and save state */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <CardTitle>PVT & Rock Properties</CardTitle>
            <CardDescription>
              Configure correlations and fluid properties. Engine uses these for runs and for this preview.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button
                onClick={handleSave}
                disabled={saving || (form.pvt_source === 'lab_table' && labTableErrors.length > 0)}
                variant="accent"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save changes
              </Button>
            )}
            {!dirty && loadedConfigId && (
              <span className="text-xs text-pl-success-text flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Saved
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* ─── Controls Panel ─── */}
          <div className="md:col-span-2 space-y-4">
            <Card className="h-full flex flex-col">
              <CardHeader className="border-b border-pl-border p-4">
                <CardTitle className="text-sm font-bold text-pl-text uppercase tracking-wider flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-pl-muted" />
                  Correlation Engine
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4 flex-1">
                {/* Read-only case-level facts */}
                <div className="bg-pl-sunken border border-pl-border rounded p-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-pl-muted">Reservoir temperature</span>
                    <span className="font-mono text-pl-text">
                      {formatNum(units.to('temperature', Number(caseData.reservoir_temperature_f)), 1)} {units.label('temperature')}
                    </span>
                  </div>
                  {caseData.bubble_point_psia && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-pl-muted">Bubble point</span>
                      <span className="font-mono text-pl-text">
                        {formatNum(units.to('pressure', Number(caseData.bubble_point_psia)), pDigits)} {units.label('pressure')}
                      </span>
                    </div>
                  )}
                  {caseData.initial_pressure_psia && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-pl-muted">Initial pressure</span>
                      <span className="font-mono text-pl-text">
                        {formatNum(units.to('pressure', Number(caseData.initial_pressure_psia)), pDigits)} {units.label('pressure')}
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-pl-muted pt-1">
                    Edit these with Edit case on the case card.
                  </p>
                </div>

                {/* PVT source */}
                <div className="pt-2 space-y-2">
                  <Label className="text-xs text-pl-muted uppercase tracking-wider">
                    PVT source
                  </Label>
                  <Select
                    value={form.pvt_source}
                    onValueChange={(v) => updateForm('pvt_source', v)}
                  >
                    <SelectTrigger>
                      {/* the label only; the description shows under the field */}
                      <SelectValue>{PVT_SOURCE_OPTIONS.find((o) => o.value === form.pvt_source)?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PVT_SOURCE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex flex-col items-start gap-0.5 py-0.5">
                            <span>{opt.label}</span>
                            <span className="text-[10px] text-pl-muted font-normal leading-tight">
                              {opt.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(() => {
                    const opt = PVT_SOURCE_OPTIONS.find((o) => o.value === form.pvt_source);
                    return opt ? (
                      <p className="text-[10px] text-pl-muted italic leading-snug pt-0.5">
                        {opt.description}
                      </p>
                    ) : null;
                  })()}
                </div>

                {/* Editable fluid properties */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {showOilProps && (
                    <UnitField
                      id="api" testId="mbal-pvt-api" label="Oil gravity" unitText="degAPI" placeholder={`blank: ${RUN_DEFAULT_API}`}
                      value={form.oil_gravity_api === '' ? null : Number(form.oil_gravity_api)}
                      onCommit={(v) => updateForm('oil_gravity_api', v == null ? '' : v)}
                    />
                  )}
                  {showGasProps && (
                    <UnitField
                      id="gasGravity" testId="mbal-pvt-sg" label="Gas gravity" unitText="air = 1"
                      placeholder={`blank: ${isGas ? RUN_INPUT_DEFAULTS.gas_specific_gravity_gas : RUN_INPUT_DEFAULTS.gas_specific_gravity_oil}`}
                      value={form.gas_specific_gravity === '' ? null : Number(form.gas_specific_gravity)}
                      onCommit={(v) => updateForm('gas_specific_gravity', v == null ? '' : v)}
                    />
                  )}
                  <UnitField
                    id="salinity" testId="mbal-pvt-salinity" label="Water salinity" unitText="ppm" placeholder="blank: fresh water"
                    value={form.water_salinity_ppm === '' ? null : Number(form.water_salinity_ppm)}
                    onCommit={(v) => updateForm('water_salinity_ppm', v == null ? '' : v)}
                  />
                </div>

                {/* Compressibilities */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-pl-border">
                  <UnitField
                    id="cf" testId="mbal-pvt-cf" label="Formation compressibility cf" quantity="compressibility" units={units}
                    placeholder={`blank: ${formatNum(units.to('compressibility', RUN_INPUT_DEFAULTS.formation_compressibility_psi) * 1e6, 3)}e-6`}
                    value={form.formation_compressibility_psi === '' ? null : Number(form.formation_compressibility_psi)}
                    onCommit={(v) => updateForm('formation_compressibility_psi', v == null ? '' : v)}
                  />
                  <UnitField
                    id="cw" testId="mbal-pvt-cw" label="Water compressibility cw" quantity="compressibility" units={units}
                    placeholder={`blank: ${formatNum(units.to('compressibility', RUN_INPUT_DEFAULTS.water_compressibility_psi) * 1e6, 3)}e-6`}
                    value={form.water_compressibility_psi === '' ? null : Number(form.water_compressibility_psi)}
                    onCommit={(v) => updateForm('water_compressibility_psi', v == null ? '' : v)}
                  />
                </div>

                {/* Gas cap ratio m. The only field in the studio that writes it
                    directly; before 2026-09-11 fitting it in a history match was
                    the only route, so a gas-cap case that skipped the match ran
                    as an undersaturated one. */}
                {isOilWithGasCap && (
                  <div className="pt-3 border-t border-pl-border space-y-1.5">
                    <InputGroup
                      label={<>Gas cap ratio m (gas cap volume over oil volume, both at reservoir conditions)</>}
                      id="gasCapM"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 0.3"
                      value={form.gas_cap_ratio_m}
                      onChange={(e) => updateForm('gas_cap_ratio_m', e.target.value)}
                    />
                    <p className="text-[10px] text-pl-muted italic leading-snug">
                      {parseGasCapM(form.gas_cap_ratio_m) > 0 ? (
                        <>
                          Adds the m·E<sub>g</sub> gas cap expansion term to the material balance.
                          A history match can fit m instead if you would rather solve for it.
                        </>
                      ) : (
                        <>
                          Leave blank only if you intend to solve for m in a history match.
                          This case is flagged as having a gas cap, and a run with no m uses
                          m = 0, which is the undersaturated material balance with no gas cap at all: the gas cap drive disappears and the OOIP is the
                          no-gas-cap answer.
                        </>
                      )}
                    </p>
                  </div>
                )}

                {/* Correlation selects */}
                <div className="space-y-3 pt-3 border-t border-pl-border">
                  {showOilProps && (
                    <>
                      <CorrelationSelect
                        label="Pb, Rs, Bo"
                        value={form.correlations.pb_rs_bo}
                        options={CORRELATION_OPTIONS.pb_rs_bo}
                        onChange={(v) => updateCorrelation('pb_rs_bo', v)}
                      />
                      <CorrelationSelect
                        label="Oil Viscosity"
                        value={form.correlations.oil_viscosity}
                        options={CORRELATION_OPTIONS.oil_viscosity}
                        onChange={(v) => updateCorrelation('oil_viscosity', v)}
                      />
                    </>
                  )}
                  {showGasProps && (
                    <CorrelationSelect
                      label="z-factor"
                      value={form.correlations.z_factor}
                      options={CORRELATION_OPTIONS.z_factor}
                      onChange={(v) => updateCorrelation('z_factor', v)}
                    />
                  )}

                  {/* Single-option correlations — surfaced as informational rows */}
                  <div className="pt-2 mt-2 border-t border-pl-border space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-pl-muted">
                      Other correlations in use
                    </p>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-pl-muted">Water FVF (Bw)</span>
                      <span className="font-mono text-pl-text">McCain (1990)</span>
                    </div>
                    {showGasProps && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-pl-muted">Gas viscosity</span>
                        <span className="font-mono text-pl-text">Lee-Gonzalez-Eakin (1966)</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 mt-auto">
                  <Button
                    onClick={handleRecalculate}
                    disabled={previewLoading}
                    className="w-full font-semibold"
                  >
                    {previewLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Recalculate PVT Table
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Preview Table ─── */}
          <div className="md:col-span-3 space-y-4">
            <Card className="h-full flex flex-col">
              <CardHeader className="border-b border-pl-border p-4">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-sm font-bold text-pl-text uppercase tracking-wider">
                    PVT Preview Table
                  </CardTitle>
                  <div className="flex items-center text-[11px] uppercase tracking-wide font-semibold text-pl-warning-text bg-pl-warning-bg px-2 py-1 rounded">
                    <AlertTriangle className="w-3 h-3 mr-1.5" />
                    {form.pvt_source === 'lab_table' ? 'Lab Table' : 'Correlated'}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1">
                {form.pvt_source === 'lab_table' && (
                  <div className="px-4 py-2 bg-pl-sunken border-b border-pl-border">
                    <p className="text-[10px] text-pl-muted leading-snug">
                      <Info className="inline w-3 h-3 mr-1 -mt-0.5 text-pl-info-text" />
                      This preview shows correlation-derived values for reference. MBAL runs will use the lab table you defined below; engine interpolates at each timestep pressure.
                    </p>
                  </div>
                )}
                <ScrollArea className="h-[320px] w-full">
                  {previewRows.length > 0 ? (
                    <Table>
                      <TableHeader className="bg-pl-sunken sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="text-xs text-pl-muted font-semibold py-2">
                            Pressure
                            <span className="text-[10px] block font-normal normal-case text-pl-muted">({units.label('pressure')})</span>
                          </TableHead>
                          {showOilProps && (
                            <>
                              <TableHead className="text-xs text-pl-muted font-semibold py-2 text-right normal-case">
                                Bo
                                <span className="text-[10px] block font-normal normal-case text-pl-muted">({units.label('fvfOil')})</span>
                              </TableHead>
                              <TableHead className="text-xs text-pl-muted font-semibold py-2 text-right normal-case">
                                Rs
                                <span className="text-[10px] block font-normal normal-case text-pl-muted">({units.label('gor')})</span>
                              </TableHead>
                            </>
                          )}
                          {showGasProps && (
                            <>
                              <TableHead className="text-xs text-pl-muted font-semibold py-2 text-right normal-case">
                                Z
                              </TableHead>
                              <TableHead className="text-xs text-pl-muted font-semibold py-2 text-right normal-case">
                                Bg
                                <span className="text-[10px] block font-normal normal-case text-pl-muted">({units.label('fvfGas')})</span>
                              </TableHead>
                            </>
                          )}
                          {showOilProps && (
                            <TableHead className="text-xs text-pl-muted font-semibold py-2 text-right pr-4 normal-case">
                              Oil viscosity
                              <span className="text-[10px] block font-normal normal-case text-pl-muted">({units.label('viscosity')})</span>
                            </TableHead>
                          )}
                          {showGasProps && (
                            <TableHead className="text-xs text-pl-muted font-semibold py-2 text-right pr-4 normal-case">
                              Gas viscosity
                              <span className="text-[10px] block font-normal normal-case text-pl-muted">({units.label('viscosity')})</span>
                            </TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewRows.map((row, i) => (
                          <TableRow
                            key={i}
                            className={`border-pl-border hover:bg-pl-sunken ${
                              row.is_above_bubble_point ? 'bg-pl-sunken' : ''
                            }`}
                          >
                            <TableCell className="font-mono text-xs text-pl-text py-1.5">
                              {formatNum(row.pressure_view, pDigits)}
                            </TableCell>
                            {showOilProps && (
                              <>
                                <TableCell className="font-mono text-xs text-pl-text text-right py-1.5">
                                  {formatNum(row.Bo, 4)}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-pl-text text-right py-1.5">
                                  {formatNum(row.Rs, units.unit('gor') === 'scf/STB' ? 0 : 2)}
                                </TableCell>
                              </>
                            )}
                            {showGasProps && (
                              <>
                                <TableCell className="font-mono text-xs text-pl-text text-right py-1.5">
                                  {formatNum(row.z, 4)}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-pl-text text-right py-1.5">
                                  {formatNum(row.Bg, units.unit('fvfGas') === 'RB/Mscf' ? 4 : 6)}
                                </TableCell>
                              </>
                            )}
                            {showOilProps && (
                              <TableCell className="font-mono text-xs text-pl-text text-right py-1.5 pr-4">
                                {formatNum(row.oil_viscosity_cp, 3)}
                              </TableCell>
                            )}
                            {showGasProps && (
                              <TableCell className="font-mono text-xs text-pl-text text-right py-1.5 pr-4">
                                {row.gas_viscosity_cp != null
                                  ? formatNum(row.gas_viscosity_cp, 4)
                                  : EMPTY_VALUE}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="h-full flex items-center justify-center text-pl-muted text-sm p-8">
                      No preview yet. Click "Recalculate PVT Table" to generate.
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </CardContent>

        {previewMeta && (
          <div className="px-6 pb-4 -mt-2">
            <p className="text-[10px] text-pl-muted">
              Preview from {formatNum(units.to('pressure', Number(previewMeta.pressure_range_psia?.[0])), pDigits)} to {formatNum(units.to('pressure', Number(previewMeta.pressure_range_psia?.[1])), pDigits)} {units.label('pressure')}
              {previewMeta.pb_psia && `. Pb = ${formatNum(units.to('pressure', Number(previewMeta.pb_psia)), pDigits)} ${units.label('pressure')}`}
              {previewWarnings.length > 0 && `. ${previewWarnings.length} engine note${previewWarnings.length > 1 ? 's' : ''}`}
            </p>
          </div>
        )}
      </Card>

      {/* ─── PVT intake from a Fluid Systems Studio project (pvt-1) ─── */}
      {form.pvt_source === 'lab_table' && (
        <PvtIntakeCard
          caseData={caseData}
          onTaken={(rows, note, origin) => {
            setForm((prev) => ({
              ...prev,
              correlations: { ...clearTableOrigin(prev.correlations), [PVT_TABLE_ORIGIN_KEY]: origin },
              pvt_lab_table: rows.map((row) => {
                const out = {};
                for (const col of LAB_TABLE_COLUMNS) {
                  const v = row[col.key];
                  out[col.key] = v == null ? '' : String(v);
                }
                return out;
              }),
            }));
            setDirty(true);
            toast({ title: 'PVT taken from Fluid Systems Studio', description: note, duration: 9000 });
          }}
        />
      )}

      {/* ─── Lab Table Prefill (MB7) ─── */}
      {form.pvt_source === 'lab_table' && (
        <PvtPrefillCard
          units={units}
          caseData={caseData}
          form={form}
          isGas={isGas}
          onGenerated={(rows, note, origin) => {
            setForm((prev) => ({
              ...prev,
              // H5: the table carries how it was built, so the report never
              // calls a correlation estimate a lab table
              correlations: { ...clearTableOrigin(prev.correlations), [PVT_TABLE_ORIGIN_KEY]: origin },
              pvt_lab_table: rows.map((row) => {
                const out = {};
                for (const col of LAB_TABLE_COLUMNS) {
                  const v = row[col.key];
                  out[col.key] = v == null ? '' : String(v);
                }
                return out;
              }),
            }));
            setDirty(true);
            toast({ title: 'Table generated from correlations', description: note });
          }}
        />
      )}
      {form.pvt_source === 'lab_table' && form.pvt_lab_table.length > 0 && (
        <p className="text-[11px] text-pl-muted" data-testid="mbal-pvt-table-origin">
          Source as the report will state it: {describePvtSource({
            pvt_source: form.pvt_source, pvt_lab_table: form.pvt_lab_table, pvt_correlations: form.correlations,
          }, { isGas })}
        </p>
      )}

      {/* ─── Lab Table Editor ─── */}
      {form.pvt_source === 'lab_table' && (
        <LabTableEditor
          rows={form.pvt_lab_table}
          onRowUpdate={labRowUpdate}
          onRowAdd={labRowAdd}
          onRowDelete={labRowDelete}
          onClear={labTableClear}
          errors={labTableErrors}
          showOilProps={showOilProps}
          showGasProps={showGasProps}
          units={units}
        />
      )}

      {/* ─── Property Visualizer ─── */}
      <Card data-canvas="chart" className="bg-pl-chart-surface">
        <CardHeader className="border-b border-pl-border p-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-sm font-bold text-pl-text uppercase tracking-wider">
              Property Visualizer
            </CardTitle>
            <Tabs value={activePlot} onValueChange={setActivePlot} className="w-full sm:w-[300px]">
              <TabsList
                className={`grid w-full ${
                  isGas ? 'grid-cols-2' : 'grid-cols-3'
                }`}
              >
                {isGas ? (
                  <>
                    <TabsTrigger
                      value="z"
                      className="text-xs"
                    >
                      z
                    </TabsTrigger>
                    <TabsTrigger
                      value="bg"
                      className="text-xs"
                    >
                      Bg
                    </TabsTrigger>
                  </>
                ) : (
                  <>
                    <TabsTrigger
                      value="bo"
                      className="text-xs"
                    >
                      Bo
                    </TabsTrigger>
                    <TabsTrigger
                      value="rs"
                      className="text-xs"
                    >
                      Rs
                    </TabsTrigger>
                    <TabsTrigger
                      value="muo"
                      className="text-xs"
                    >
                      Visc.
                    </TabsTrigger>
                  </>
                )}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-6">
          {previewRows.length > 0 ? (
            <div className="relative h-[350px] bg-white">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={viewRows}
                  margin={CHART_MARGINS.withLegend}
                >
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis
                    dataKey="pressure_view"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(v) => formatNum(v, pDigits)}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    label={{
                      value: `Pressure (${units.label('pressure')})`,
                      position: 'bottom',
                      offset: 0,
                      style: { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize },
                    }}
                  />
                  <YAxis
                    yAxisId="left"
                    domain={['auto', 'auto']}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    label={{
                      value: currentPlot.name,
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize },
                    }}
                  />
                  <RechartsTooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: CHART_COLORS.tooltipText }}
                    itemStyle={{ color: currentPlot.color, fontWeight: 'bold' }}
                    formatter={(value) => formatNum(value, 4)}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    wrapperStyle={{
                      fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`,
                      color: CHART_COLORS.legendText,
                    }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey={currentPlot.dataKey}
                    name={currentPlot.name}
                    stroke={currentPlot.color}
                    strokeWidth={3}
                    dot={false}
                    activeDot={{
                      r: 6,
                      fill: currentPlot.color,
                      stroke: '#fff',
                      strokeWidth: 2,
                    }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <ChartLogo style={MBAL_LOGO_STYLE} />
            </div>
          ) : (
            <div className="h-[350px] flex items-center justify-center text-pl-muted bg-white">
              <div className="text-center">
                <Info className="h-5 w-5 mx-auto mb-2 text-pl-muted" />
                <p className="text-sm">No preview yet. Click Recalculate to generate.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// =============================================================================
// SMALL SUB-COMPONENTS
// =============================================================================

const InputGroup = ({ label, id, ...props }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="text-xs text-pl-muted">
      {label}
    </Label>
    <Input
      id={id}
      {...props}
      type={props.type || 'number'}
      className="h-9"
    />
  </div>
);

// Renders a correlation Select with an inline validity-range hint when a
// non-default correlation is selected. Matches AquiferModel.jsx's "current
// assumptions you inherit" disclosure pattern.
const CorrelationSelect = ({ label, value, options, onChange }) => {
  const selectedOption = options.find((o) => o.value === value);
  const validityHint = CORRELATION_VALIDITY[value];

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-pl-muted">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          {/* the label only; the description shows under the field */}
          <SelectValue>{selectedOption?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <div className="flex flex-col items-start gap-0.5 py-0.5">
                <span>{o.label}</span>
                {o.description && (
                  <span className="text-[10px] text-pl-muted font-normal leading-tight">
                    {o.description}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedOption?.description && (
        <p className="text-[10px] text-pl-muted italic leading-snug pt-0.5">
          {selectedOption.description}
        </p>
      )}
      {validityHint && (
        <div className="flex items-start gap-1.5 mt-1 p-2 rounded bg-pl-sunken border border-pl-border">
          <Info className="w-3 h-3 mt-0.5 text-pl-info-text flex-shrink-0" />
          <p className="text-[10px] text-pl-muted leading-snug">{validityHint}</p>
        </div>
      )}
    </div>
  );
};

// PVT intake (MBAL-U1, RL11): the table of a saved Fluid Systems Studio
// project, with what that study says about itself (the pvt-1 contract,
// lib/pvtIntake.js). The report prints the source and the method of each
// property; nothing is recalculated here.
const PvtIntakeCard = ({ caseData, onTaken }) => {
  const [searchParams] = useSearchParams();
  const named = searchParams.get(FLUID_PROJECT_PARAM) || '';
  const [projects, setProjects] = useState(null);
  const [listError, setListError] = useState(null);
  const [projectId, setProjectId] = useState(named);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let alive = true;
    listFluidProjects(supabase).then(({ data, error }) => {
      if (!alive) return;
      setProjects(data);
      setListError(error ? error.message : null);
    });
    return () => { alive = false; };
  }, []);

  const take = async () => {
    setBusy(true);
    setMessage(null);
    const read = await readFluidProjectBlock(supabase, projectId);
    setBusy(false);
    if (!read.ok) { setMessage({ kind: 'error', text: read.reason }); return; }
    const made = tableFromPvtBlock(read.block, { fluidSystem: caseData?.fluid_system, temperatureF: Number(caseData?.reservoir_temperature_f) });
    if (!made.ok) { setMessage({ kind: 'error', text: made.error }); return; }
    const note = [`${made.rows.length} rows taken from "${read.projectName ?? 'the project'}".`, ...made.warnings, 'Save the PVT tab to keep it.'].join(' ');
    setMessage(made.warnings.length ? { kind: 'warning', text: made.warnings.join(' ') } : null);
    onTaken(made.rows, note, made.origin);
  };

  return (
    <Card data-testid="mbal-pvt-intake">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-bold text-pl-text uppercase tracking-wider">
          Take the PVT of a Fluid Systems Studio project
        </CardTitle>
        <p className="text-[11px] text-pl-muted mt-0.5">
          Fills the table from a saved fluid study and keeps what that study says about itself: the project, the fluid model, the method of every property, the liberation basis, the lab tuning and the range flags. The report prints them as the source of the PVT.
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 min-w-[14rem] flex-1">
            <Label htmlFor="mbal-pvt-intake-project" className="text-[11px] text-pl-muted">Saved project</Label>
            <select id="mbal-pvt-intake-project" data-testid="mbal-pvt-intake-project" className={`${COMPACT_FIELD_THEMED} h-9 w-full text-xs`}
              value={projectId} onChange={(e) => { setProjectId(e.target.value); setMessage(null); }}>
              <option value="">{projects == null ? 'Loading the projects' : (projects.length ? 'Choose a project' : 'No saved Fluid Systems Studio project')}</option>
              {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.updatedAt ? ` (saved ${String(p.updatedAt).slice(0, 10)})` : ''}</option>)}
            </select>
          </div>
          <Button size="sm" className="h-9" onClick={take} disabled={!projectId || busy} data-testid="mbal-pvt-intake-take">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Take its PVT
          </Button>
        </div>
        {listError && <p className="text-xs text-pl-danger-text">The projects could not be listed: {listError}</p>}
        {message && (
          <p className={`text-xs ${message.kind === 'error' ? 'text-pl-danger-text' : 'text-pl-warning-text'}`} data-testid="mbal-pvt-intake-message">{message.text}</p>
        )}
      </CardContent>
    </Card>
  );
};

// Lab table prefill (MB7) — generates the table from the Fluid Systems
// Studio client black-oil engine at the case conditions (jest-guarded
// mapping in lib/fluidStudioPvtPrefill.js). A starting grid to review and
// overwrite with measured data, not a lab report.
const PvtPrefillCard = ({ caseData, form, isGas, onGenerated, units }) => {
  // both held in engine units (scf/STB, psia); the fields show the display units
  const [gor, setGor] = useState(null);
  const [maxP, setMaxP] = useState(() => {
    const pi = Number(caseData?.initial_pressure_psia);
    return Number.isFinite(pi) ? Math.round(pi * 1.1) : null;
  });
  const [error, setError] = useState(null);

  const generate = () => {
    const result = buildPvtPrefillRows({
      fluidSystem: caseData?.fluid_system,
      apiGravity: numOr(form.oil_gravity_api, NaN),
      gasSg: numOr(form.gas_specific_gravity, NaN),
      temperatureF: caseData?.reservoir_temperature_f,
      bubblePointPsia: caseData?.bubble_point_psia ?? null,
      gorScfStb: gor == null ? null : Number(gor),
      maxPressurePsia: maxP == null ? NaN : Number(maxP),
      nPoints: 20,
      // H5: the correlations selected on this tab, where the builder has them
      correlations: form.correlations,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    const m = result.origin.methods;
    const used = [m.pb_rs_bo?.label, m.oil_viscosity?.label, m.z_factor?.label, m.gas_viscosity?.label].filter(Boolean).join(', ');
    const notes = [`${result.rows.length} rows generated at case conditions with ${used}.`, ...result.origin.substitutions];
    if (result.derivedGor != null) {
      notes.push(`Solution GOR ${formatNum(units.to('gor', result.derivedGor), units.unit('gor') === 'scf/STB' ? 0 : 1)} ${units.label('gor')} derived from the case bubble point.`);
    }
    notes.push('Review the rows and replace them with measured data where you have it, then save.');
    onGenerated(result.rows, notes.join(' '), result.origin);
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-bold text-pl-text uppercase tracking-wider">
          Prefill from correlations
        </CardTitle>
        <p className="text-[11px] text-pl-muted mt-0.5">
          Generates the table with the Fluid Systems Studio black-oil engine at this case&apos;s temperature and
          gravity, using the Pb, Rs and Bo correlation selected on this tab, so the editor starts filled with a
          consistent grid. Generated values are correlation estimates and the report says so; overwrite them
          with measured lab data wherever you have it.
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="flex flex-wrap items-end gap-3">
          {!isGas && (
            <UnitField className="w-48" testId="mbal-prefill-gor" label="Solution GOR" quantity="gor" units={units}
              value={gor} onCommit={setGor} placeholder="blank: from the bubble point" />
          )}
          <UnitField className="w-48" testId="mbal-prefill-pmax" label="Highest table pressure" quantity="pressure" units={units}
            value={maxP} onCommit={setMaxP} />
          <Button size="sm" onClick={generate} className="h-8">
            Generate table
          </Button>
        </div>
        {error && <p className="text-xs text-pl-danger-text mt-2">{error}</p>}
      </CardContent>
    </Card>
  );
};

// Lab table editor — shown when pvt_source === 'lab_table'.
// Row-by-row editable PVT table. Columns adapt to fluid system. Engine
// interpolates from these rows at each timestep's pressure.
const LabTableEditor = ({
  rows,
  onRowUpdate,
  onRowAdd,
  onRowDelete,
  onClear,
  errors,
  showOilProps,
  showGasProps,
  units,
}) => {
  const columns = visibleLabColumns(showOilProps, showGasProps);
  const hasErrors = errors.length > 0;

  return (
    <Card>
      <CardHeader className="border-b border-pl-border p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-pl-muted" />
            <div>
              <CardTitle className="text-sm font-bold text-pl-text uppercase tracking-wider">
                PVT Lab Table
              </CardTitle>
              <p className="text-[11px] text-pl-muted mt-0.5">
                {rows.length} {rows.length === 1 ? 'row' : 'rows'},{' '}
                {hasErrors ? (
                  <span className="text-pl-danger-text">
                    {errors.length} validation issue{errors.length > 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-pl-success-text">valid</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={onRowAdd}
              size="sm"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add row
            </Button>
            {rows.length > 0 && (
              <Button
                onClick={onClear}
                size="sm"
                variant="outline"
              >
                Clear all
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {hasErrors && (
          <div className="px-4 py-2 bg-pl-danger-bg border-b border-pl-danger/40">
            <ul className="space-y-0.5">
              {errors.slice(0, 3).map((e, i) => (
                <li key={i} className="text-[11px] text-pl-danger-text leading-snug flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {e}
                </li>
              ))}
              {errors.length > 3 && (
                <li className="text-[10px] text-pl-danger-text italic pl-5">
                  and {errors.length - 3} more.
                </li>
              )}
            </ul>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="py-12 text-center">
            <FlaskConical className="w-8 h-8 mx-auto mb-2 text-pl-muted" />
            <p className="text-sm text-pl-muted mb-1">No lab data yet.</p>
            <p className="text-[11px] text-pl-muted mb-4">
              Click <span className="font-semibold">Add row</span> to enter PVT measurements.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px] w-full">
            <Table>
              <TableHeader className="bg-pl-sunken sticky top-0 z-10">
                <TableRow>
                  {columns.map((col) => (
                    <TableHead
                      key={col.key}
                      className="text-xs text-pl-muted font-semibold py-2 normal-case"
                    >
                      {col.label}
                      {col.required && <span className="text-pl-danger-text ml-0.5">*</span>}
                      {col.quantity && (
                        <span className="text-[10px] block font-normal normal-case text-pl-muted">
                          ({units.label(col.quantity)})
                        </span>
                      )}
                    </TableHead>
                  ))}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={idx} className="border-pl-border hover:bg-pl-sunken">
                    {columns.map((col) => (
                      <TableCell key={col.key} className="py-1 px-2">
                        <UnitField
                          bare label={`${col.label}, row ${idx + 1}`} quantity={col.quantity} units={units}
                          testId={`mbal-lab-${col.key}-${idx}`}
                          value={row[col.key] === '' || row[col.key] == null ? null : Number(row[col.key])}
                          onCommit={(v) => onRowUpdate(idx, col.key, v == null ? '' : String(v))}
                          placeholder={col.required ? 'required' : 'optional'}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="w-10 py-1 px-2">
                      <Button
                        onClick={() => onRowDelete(idx)}
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-pl-muted hover:text-pl-danger-text hover:bg-pl-danger-bg"
                        aria-label="Delete row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        <div className="px-4 py-3 bg-pl-sunken border-t border-pl-border">
          <p className="text-[10px] text-pl-muted leading-snug">
            <Info className="inline w-3 h-3 mr-1 -mt-0.5 text-pl-info-text" />
            Pressure is required for every row and the other columns are optional. Type the rows in any order: they are sorted by pressure when the table is saved. Where the table gives no value, or a timestep pressure lies outside it, the engine uses the correlations selected above.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PvtRock;
