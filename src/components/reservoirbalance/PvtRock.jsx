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
//   - Client-side validation mirrors engine validateLabTable() rules
//     (≥ 2 rows, ascending pressures, positive values). Engine remains the
//     source of truth and emits structured warnings into result.warnings.
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
import {
  CHART_COLORS,
  CHART_TYPOGRAPHY,
  CHART_MARGINS,
  GRID_STYLE,
  TOOLTIP_STYLE,
} from '@/utils/chartTheme';

// =============================================================================
// HELPERS
// =============================================================================

const formatNum = (val, decimals = 2, fallback = '—') => {
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
      description: 'Default. Live-oil μ_o with Vasquez-Beggs undersaturated correction.',
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
    'Training range: p ≤ 5250 psia · 75–294 °F · 15.3–59.5 °API · 0.51–1.35 gas SG · 20–2199 scf/STB Rs. Engine warns if your case exceeds this.',
  glaso:
    'Training range: 150–7127 psia · 80–280 °F · 22.3–48.1 °API · 0.65–1.28 gas SG · 90–2637 scf/STB Rs. Engine warns if your case exceeds this.',
  beggs_robinson: null,
  beal_standing:
    'Dead-oil baseline. Training range: 18–50 °API · 100–220 °F. Use Beggs-Robinson for saturated live-oil cases.',
  hall_yarborough: null,
  dranchuk_abou_kassem:
    'Training range: 0.2 ≤ Ppr ≤ 30 · 1.0 ≤ Tpr ≤ 3.0. Preferred at low Tpr (below ~1.2) where Hall-Yarborough degrades.',
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
    label: 'Lab table',
    description:
      'Engine interpolates PVT from your uploaded lab data at each timestep pressure. Pressures outside the table fall through to correlations.',
  },
];

// Lab-table column schema. "show" determines which columns are visible per
// fluid system. All columns except pressure_psia are optional.
const LAB_TABLE_COLUMNS = [
  { key: 'pressure_psia', label: 'Pressure', unit: 'psia', show: 'always', required: true, decimals: 0 },
  { key: 'bo_rb_stb', label: 'Bo', unit: 'rb/STB', show: 'oil', decimals: 4 },
  { key: 'rs_scf_stb', label: 'Rs', unit: 'scf/STB', show: 'oil', decimals: 0 },
  { key: 'oil_viscosity_cp', label: 'μ_o', unit: 'cP', show: 'oil', decimals: 3 },
  { key: 'z_factor', label: 'z', unit: '–', show: 'gas', decimals: 4 },
  { key: 'bg_rb_mscf', label: 'Bg', unit: 'RB/Mscf', show: 'gas', decimals: 4 },
  { key: 'gas_viscosity_cp', label: 'μ_g', unit: 'cP', show: 'gas', decimals: 4 },
  { key: 'bw_rb_stb', label: 'Bw', unit: 'rb/STB', show: 'always', decimals: 4 },
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

// Default form state per fluid system
function defaultFormState(caseData) {
  const isGas = caseData?.fluid_system === 'gas';
  return {
    oil_gravity_api: isGas ? '' : 35,
    gas_specific_gravity: isGas ? 0.65 : 0.75,
    water_salinity_ppm: 50000,
    correlations: {
      pb_rs_bo: 'standing',
      oil_viscosity: 'beggs_robinson',
      z_factor: 'hall_yarborough',
      water: 'mccain',
      gas_viscosity: 'lee_gonzalez_eakin',
    },
    pvt_source: 'correlated',
    pvt_lab_table: [],
    formation_compressibility_psi: 6e-6,
    water_compressibility_psi: 3e-6,
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
    if (i > 0) {
      const prev = parseFloat(rows[i - 1].pressure_psia);
      if (isFinite(p) && isFinite(prev) && p <= prev) {
        errors.push(
          `Row ${i + 1}: pressure (${p}) must be strictly greater than row ${i}'s pressure (${prev}). Rows must be ascending.`,
        );
      }
    }
  }
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
          oil_gravity_api: cfg.oil_gravity_api ?? defaultFormState(caseData).oil_gravity_api,
          gas_specific_gravity: cfg.gas_specific_gravity ?? defaultFormState(caseData).gas_specific_gravity,
          water_salinity_ppm: cfg.water_salinity_ppm ?? 50000,
          correlations: cfg.pvt_correlations ?? defaultFormState(caseData).correlations,
          pvt_source: cfg.pvt_source ?? 'correlated',
          pvt_lab_table: hydratedLabRows,
          formation_compressibility_psi: cfg.formation_compressibility_psi ?? 6e-6,
          water_compressibility_psi: cfg.water_compressibility_psi ?? 3e-6,
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
      return { ...prev, pvt_lab_table: next };
    });
    setDirty(true);
  };

  const labRowAdd = () => {
    setForm((prev) => {
      const blank = {};
      for (const col of LAB_TABLE_COLUMNS) blank[col.key] = '';
      return { ...prev, pvt_lab_table: [...prev.pvt_lab_table, blank] };
    });
    setDirty(true);
  };

  const labRowDelete = (idx) => {
    setForm((prev) => ({
      ...prev,
      pvt_lab_table: prev.pvt_lab_table.filter((_, i) => i !== idx),
    }));
    setDirty(true);
  };

  const labTableClear = () => {
    setForm((prev) => ({ ...prev, pvt_lab_table: [] }));
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
        description: 'Set the reservoir temperature on the case (Overview tab) before generating PVT preview.',
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
      inputs.oil_gravity_api = parseFloat(form.oil_gravity_api);
    }
    if (showGasProps) {
      inputs.gas_specific_gravity = parseFloat(form.gas_specific_gravity);
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
  }, [caseData, fluidSystem, form, showOilProps, showGasProps, toast]);

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
      oil_gravity_api: showOilProps ? parseFloat(form.oil_gravity_api) : null,
      gas_specific_gravity: showGasProps ? parseFloat(form.gas_specific_gravity) : null,
      water_salinity_ppm: parseFloat(form.water_salinity_ppm),
      correlations: form.correlations,
      formation_compressibility_psi: parseFloat(form.formation_compressibility_psi),
      water_compressibility_psi: parseFloat(form.water_compressibility_psi),
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
        z: { dataKey: 'z', name: 'z (compressibility factor)', color: '#a3e635' },
        bg: { dataKey: 'Bg', name: 'Bg (RB/Mscf)', color: '#38bdf8' },
      };
    }
    return {
      bo: { dataKey: 'Bo', name: 'Oil FVF (rb/STB)', color: '#a3e635' },
      rs: { dataKey: 'Rs', name: 'Solution GOR (scf/STB)', color: '#38bdf8' },
      muo: {
        dataKey: 'oil_viscosity_cp',
        name: 'Oil Viscosity (cP)',
        color: '#f87171',
      },
    };
  }, [isGas]);

  const currentPlot = plotConfig[activePlot] ?? Object.values(plotConfig)[0];

  // Loading state
  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  if (!caseData) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="py-12 text-center text-slate-400">
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
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <CardTitle className="text-lime-300">PVT & Rock Properties</CardTitle>
            <CardDescription>
              Configure correlations and fluid properties. Engine uses these for runs and for this preview.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button
                onClick={handleSave}
                disabled={saving || (form.pvt_source === 'lab_table' && labTableErrors.length > 0)}
                className="bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
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
              <span className="text-xs text-green-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Saved
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* ─── Controls Panel ─── */}
          <div className="md:col-span-2 space-y-4">
            <Card className="bg-slate-900/50 border-slate-700 h-full flex flex-col shadow-lg">
              <CardHeader className="border-b border-slate-800 bg-slate-900/80 p-4">
                <CardTitle className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-lime-400" />
                  Correlation Engine
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4 flex-1">
                {/* Read-only case-level facts */}
                <div className="bg-slate-950/50 border border-slate-800 rounded p-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Reservoir temperature</span>
                    <span className="font-mono text-slate-300">
                      {formatNum(caseData.reservoir_temperature_f, 1)} °F
                    </span>
                  </div>
                  {caseData.bubble_point_psia && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Bubble point</span>
                      <span className="font-mono text-slate-300">
                        {formatNum(caseData.bubble_point_psia, 0)} psia
                      </span>
                    </div>
                  )}
                  {caseData.initial_pressure_psia && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Initial pressure</span>
                      <span className="font-mono text-slate-300">
                        {formatNum(caseData.initial_pressure_psia, 0)} psia
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500 pt-1">
                    Edit these on the Overview tab.
                  </p>
                </div>

                {/* PVT source */}
                <div className="pt-2 space-y-2">
                  <Label className="text-xs text-slate-400 uppercase tracking-wider">
                    PVT source
                  </Label>
                  <Select
                    value={form.pvt_source}
                    onValueChange={(v) => updateForm('pvt_source', v)}
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PVT_SOURCE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex flex-col items-start gap-0.5 py-0.5">
                            <span>{opt.label}</span>
                            <span className="text-[10px] text-slate-500 font-normal leading-tight">
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
                      <p className="text-[10px] text-slate-500 italic leading-snug pt-0.5">
                        {opt.description}
                      </p>
                    ) : null;
                  })()}
                </div>

                {/* Editable fluid properties */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {showOilProps && (
                    <InputGroup
                      label="Oil Gravity (°API)"
                      id="api"
                      value={form.oil_gravity_api}
                      onChange={(e) => updateForm('oil_gravity_api', e.target.value)}
                    />
                  )}
                  {showGasProps && (
                    <InputGroup
                      label="Gas Gravity (SG)"
                      id="gasGravity"
                      value={form.gas_specific_gravity}
                      onChange={(e) => updateForm('gas_specific_gravity', e.target.value)}
                    />
                  )}
                  <InputGroup
                    label="Water Salinity (ppm)"
                    id="salinity"
                    value={form.water_salinity_ppm}
                    onChange={(e) => updateForm('water_salinity_ppm', e.target.value)}
                  />
                </div>

                {/* Compressibilities */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
                  <InputGroup
                    label={<>c<sub>f</sub> (1/psi)</>}
                    id="cf"
                    step="1e-7"
                    value={form.formation_compressibility_psi}
                    onChange={(e) => updateForm('formation_compressibility_psi', e.target.value)}
                  />
                  <InputGroup
                    label={<>c<sub>w</sub> (1/psi)</>}
                    id="cw"
                    step="1e-7"
                    value={form.water_compressibility_psi}
                    onChange={(e) => updateForm('water_compressibility_psi', e.target.value)}
                  />
                </div>

                {/* Correlation selects */}
                <div className="space-y-3 pt-3 border-t border-slate-800">
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
                  <div className="pt-2 mt-2 border-t border-slate-800/60 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                      Other correlations in use
                    </p>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Water FVF (Bw)</span>
                      <span className="font-mono text-slate-300">McCain (1990)</span>
                    </div>
                    {showGasProps && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Gas viscosity (μg)</span>
                        <span className="font-mono text-slate-300">Lee-Gonzalez-Eakin (1966)</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 mt-auto">
                  <Button
                    onClick={handleRecalculate}
                    disabled={previewLoading}
                    className="w-full bg-lime-600 hover:bg-lime-500 text-slate-950 font-semibold shadow-md"
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
            <Card className="bg-slate-900/50 border-slate-700 h-full flex flex-col shadow-lg">
              <CardHeader className="border-b border-slate-800 bg-slate-900/80 p-4">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                    PVT Preview Table
                  </CardTitle>
                  <div className="flex items-center text-[11px] uppercase tracking-wide font-semibold text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">
                    <AlertTriangle className="w-3 h-3 mr-1.5" />
                    {form.pvt_source === 'lab_table' ? 'Lab Table' : 'Correlated'}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1">
                {form.pvt_source === 'lab_table' && (
                  <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800">
                    <p className="text-[10px] text-slate-400 leading-snug">
                      <Info className="inline w-3 h-3 mr-1 -mt-0.5 text-sky-400" />
                      This preview shows correlation-derived values for reference. MBAL runs will use the lab table you defined below; engine interpolates at each timestep pressure.
                    </p>
                  </div>
                )}
                <ScrollArea className="h-[320px] w-full">
                  {previewRows.length > 0 ? (
                    <Table>
                      <TableHeader className="bg-slate-950 sticky top-0 z-10">
                        <TableRow className="border-slate-800">
                          <TableHead className="text-xs text-slate-400 font-semibold py-2">
                            Pressure
                            <span className="text-[10px] block font-normal text-slate-500">(psia)</span>
                          </TableHead>
                          {showOilProps && (
                            <>
                              <TableHead className="text-xs text-slate-400 font-semibold py-2 text-right">
                                Bo
                                <span className="text-[10px] block font-normal text-slate-500">(rb/STB)</span>
                              </TableHead>
                              <TableHead className="text-xs text-slate-400 font-semibold py-2 text-right">
                                Rs
                                <span className="text-[10px] block font-normal text-slate-500">(scf/STB)</span>
                              </TableHead>
                            </>
                          )}
                          {showGasProps && (
                            <>
                              <TableHead className="text-xs text-slate-400 font-semibold py-2 text-right">
                                z
                                <span className="text-[10px] block font-normal text-slate-500">(–)</span>
                              </TableHead>
                              <TableHead className="text-xs text-slate-400 font-semibold py-2 text-right">
                                Bg
                                <span className="text-[10px] block font-normal text-slate-500">(RB/Mscf)</span>
                              </TableHead>
                            </>
                          )}
                          {showOilProps && (
                            <TableHead className="text-xs text-slate-400 font-semibold py-2 text-right pr-4">
                              Oil Visc
                              <span className="text-[10px] block font-normal text-slate-500">(cP)</span>
                            </TableHead>
                          )}
                          {showGasProps && (
                            <TableHead className="text-xs text-slate-400 font-semibold py-2 text-right pr-4">
                              Gas Visc
                              <span className="text-[10px] block font-normal text-slate-500">(cP)</span>
                            </TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.map((row, i) => (
                          <TableRow
                            key={i}
                            className={`border-slate-800/50 hover:bg-slate-800/50 ${
                              row.is_above_bubble_point ? 'bg-slate-800/30' : ''
                            }`}
                          >
                            <TableCell className="font-mono text-xs text-slate-300 py-1.5">
                              {formatNum(row.pressure_psia, 0)}
                            </TableCell>
                            {showOilProps && (
                              <>
                                <TableCell className="font-mono text-xs text-lime-400 text-right py-1.5">
                                  {formatNum(row.Bo, 4)}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-sky-400 text-right py-1.5">
                                  {formatNum(row.Rs, 0)}
                                </TableCell>
                              </>
                            )}
                            {showGasProps && (
                              <>
                                <TableCell className="font-mono text-xs text-lime-400 text-right py-1.5">
                                  {formatNum(row.z, 4)}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-sky-400 text-right py-1.5">
                                  {formatNum(row.Bg, 4)}
                                </TableCell>
                              </>
                            )}
                            {showOilProps && (
                              <TableCell className="font-mono text-xs text-rose-400 text-right py-1.5 pr-4">
                                {formatNum(row.oil_viscosity_cp, 3)}
                              </TableCell>
                            )}
                            {showGasProps && (
                              <TableCell className="font-mono text-xs text-rose-400 text-right py-1.5 pr-4">
                                {row.gas_viscosity_cp != null
                                  ? formatNum(row.gas_viscosity_cp, 4)
                                  : '—'}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 text-sm p-8">
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
            <p className="text-[10px] text-slate-500">
              Preview generated for pressure range {formatNum(previewMeta.pressure_range_psia?.[0], 0)} – {formatNum(previewMeta.pressure_range_psia?.[1], 0)} psia
              {previewMeta.pb_psia && ` · Pb = ${formatNum(previewMeta.pb_psia, 0)} psia`}
              {previewWarnings.length > 0 && ` · ${previewWarnings.length} engine note${previewWarnings.length > 1 ? 's' : ''}`}
            </p>
          </div>
        )}
      </Card>

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
        />
      )}

      {/* ─── Property Visualizer ─── */}
      <Card className="bg-white border-slate-200 shadow-lg">
        <CardHeader className="border-b border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Property Visualizer
            </CardTitle>
            <Tabs value={activePlot} onValueChange={setActivePlot} className="w-[300px]">
              <TabsList
                className={`grid w-full bg-slate-100 border border-slate-300 ${
                  isGas ? 'grid-cols-2' : 'grid-cols-3'
                }`}
              >
                {isGas ? (
                  <>
                    <TabsTrigger
                      value="z"
                      className="text-xs data-[state=active]:bg-lime-600 data-[state=active]:text-slate-950"
                    >
                      z
                    </TabsTrigger>
                    <TabsTrigger
                      value="bg"
                      className="text-xs data-[state=active]:bg-sky-600 data-[state=active]:text-white"
                    >
                      Bg
                    </TabsTrigger>
                  </>
                ) : (
                  <>
                    <TabsTrigger
                      value="bo"
                      className="text-xs data-[state=active]:bg-lime-600 data-[state=active]:text-slate-950"
                    >
                      Bo
                    </TabsTrigger>
                    <TabsTrigger
                      value="rs"
                      className="text-xs data-[state=active]:bg-sky-600 data-[state=active]:text-white"
                    >
                      Rs
                    </TabsTrigger>
                    <TabsTrigger
                      value="muo"
                      className="text-xs data-[state=active]:bg-rose-600 data-[state=active]:text-white"
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
                  data={previewRows}
                  margin={CHART_MARGINS.withLegend}
                >
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis
                    dataKey="pressure_psia"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    label={{
                      value: 'Pressure (psia)',
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
              <ChartLogo />
            </div>
          ) : (
            <div className="h-[350px] flex items-center justify-center text-slate-500 bg-white">
              <div className="text-center">
                <Info className="h-5 w-5 mx-auto mb-2 text-slate-400" />
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
    <Label htmlFor={id} className="text-xs text-slate-400">
      {label}
    </Label>
    <Input
      id={id}
      {...props}
      type={props.type || 'number'}
      className="h-9 bg-slate-950 border-slate-700 text-slate-200 focus:border-lime-500 focus:ring-lime-500"
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
      <Label className="text-xs text-slate-400">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-slate-950 border-slate-700">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <div className="flex flex-col items-start gap-0.5 py-0.5">
                <span>{o.label}</span>
                {o.description && (
                  <span className="text-[10px] text-slate-500 font-normal leading-tight">
                    {o.description}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedOption?.description && (
        <p className="text-[10px] text-slate-500 italic leading-snug pt-0.5">
          {selectedOption.description}
        </p>
      )}
      {validityHint && (
        <div className="flex items-start gap-1.5 mt-1 p-2 rounded bg-slate-950/60 border border-slate-800/80">
          <Info className="w-3 h-3 mt-0.5 text-sky-400 flex-shrink-0" />
          <p className="text-[10px] text-slate-400 leading-snug">{validityHint}</p>
        </div>
      )}
    </div>
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
}) => {
  const columns = visibleLabColumns(showOilProps, showGasProps);
  const hasErrors = errors.length > 0;

  return (
    <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
      <CardHeader className="border-b border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-sky-400" />
            <div>
              <CardTitle className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                PVT Lab Table
              </CardTitle>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {rows.length} {rows.length === 1 ? 'row' : 'rows'} ·{' '}
                {hasErrors ? (
                  <span className="text-rose-400">
                    {errors.length} validation issue{errors.length > 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-green-400">valid</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={onRowAdd}
              size="sm"
              className="bg-sky-600 hover:bg-sky-500 text-white"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add row
            </Button>
            {rows.length > 0 && (
              <Button
                onClick={onClear}
                size="sm"
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Clear all
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {hasErrors && (
          <div className="px-4 py-2 bg-rose-950/30 border-b border-rose-900/40">
            <ul className="space-y-0.5">
              {errors.slice(0, 3).map((e, i) => (
                <li key={i} className="text-[11px] text-rose-300 leading-snug flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {e}
                </li>
              ))}
              {errors.length > 3 && (
                <li className="text-[10px] text-rose-400/70 italic pl-5">
                  …and {errors.length - 3} more.
                </li>
              )}
            </ul>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="py-12 text-center">
            <FlaskConical className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p className="text-sm text-slate-400 mb-1">No lab data yet.</p>
            <p className="text-[11px] text-slate-500 mb-4">
              Click <span className="font-semibold">Add row</span> to enter PVT measurements.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px] w-full">
            <Table>
              <TableHeader className="bg-slate-950 sticky top-0 z-10">
                <TableRow className="border-slate-800">
                  {columns.map((col) => (
                    <TableHead
                      key={col.key}
                      className="text-xs text-slate-400 font-semibold py-2"
                    >
                      {col.label}
                      {col.required && <span className="text-rose-400 ml-0.5">*</span>}
                      <span className="text-[10px] block font-normal text-slate-500">
                        ({col.unit})
                      </span>
                    </TableHead>
                  ))}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={idx} className="border-slate-800/50 hover:bg-slate-800/30">
                    {columns.map((col) => (
                      <TableCell key={col.key} className="py-1 px-2">
                        <Input
                          type="number"
                          step={col.decimals >= 4 ? '0.0001' : col.decimals >= 2 ? '0.01' : '1'}
                          value={row[col.key] ?? ''}
                          onChange={(e) => onRowUpdate(idx, col.key, e.target.value)}
                          placeholder={col.required ? '—' : 'optional'}
                          className="h-8 text-xs bg-slate-950 border-slate-700 text-slate-200 font-mono"
                        />
                      </TableCell>
                    ))}
                    <TableCell className="w-10 py-1 px-2">
                      <Button
                        onClick={() => onRowDelete(idx)}
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30"
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

        <div className="px-4 py-3 bg-slate-950/40 border-t border-slate-800">
          <p className="text-[10px] text-slate-500 leading-snug">
            <Info className="inline w-3 h-3 mr-1 -mt-0.5 text-sky-400" />
            Pressure is required for every row. Other columns are optional —
            the engine uses whichever values you supply and falls through to
            correlations for missing fields. Rows are sorted ascending by
            pressure on save. Pressures outside the table's range at run time
            fall through to correlations for those timesteps.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PvtRock;
