// src/components/reservoirbalance/DataHub.jsx
//
// Reservoir Balance — Data Hub component
// =========================================
//
// Phase 3 Capsule 3A rewrite. Replaces the 224-line Horizons-era version.
//
// Single upload card that maps CSV input to the rb_production_data schema:
//   - Required: timestep_index (auto-assigned), pressure_psia
//   - Cumulatives: cum_oil_stb, cum_gas_scf, cum_water_stb,
//                  cum_water_inj_stb, cum_gas_inj_scf
//   - Per-row PVT overrides: bo_rb_stb, rs_scf_stb, bg_rb_mscf, bw_rb_stb, z_factor
//   - Optional observation_date and observed_we_rb (Phase 4 / for validation)
//
// Features:
//   - Drag-and-drop CSV via react-dropzone + papaparse (preserved from original)
//   - Case-insensitive column-alias matching (preserved + extended)
//   - Unit auto-detection from column headers (new): Mscf/Bscf/MMscf → scf,
//     and similar for oil and Bg
//   - Pre-save validation: row 0 zero cumulatives, pressure matches case
//     initial_pressure_psia, monotone non-increasing pressures, ≥2 rows
//   - Hydrates existing rows from rb_production_data on mount
//   - Saves via replaceProductionData (atomic replace of all case rows)
//
// Data flow:
//   1. On mount: listProductionData(caseId) → display in preview table
//   2. User drops CSV → papaparse → column mapping → unit normalization
//   3. Pre-save validation; show per-row errors if any
//   4. User clicks Save → replaceProductionData(caseId, rows)
//   5. onDataSaved callback fires so parent can refresh

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Table as UiTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  Download,
  Trash2,
  Save,
  Loader2,
  RefreshCw,
  Info,
  X,
} from 'lucide-react';
import {
  listProductionData,
  replaceProductionData,
} from '@/pages/apps/reservoir-balance/lib/api';

// =============================================================================
// CONFIG: COLUMN ALIASES AND UNIT DETECTION
// =============================================================================
//
// Each schema column has a list of header-substring aliases (lowercase).
// findColumnByAliases() returns the original-case header that matches.
// Match is via substring, so "Pressure (psia)" matches "pressure" alias.
//
// Order in the alias list matters: earlier aliases win if multiple match.
// We put more-specific aliases first to avoid false positives.

const COLUMN_ALIASES = {
  pressure_psia: ['pressure_psia', 'pressure (psia)', 'pressure', 'p_psia', 'static pressure', 'reservoir pressure', 'res pressure', 'p (psia)', ' p '],
  cum_oil_stb: ['cum_oil_stb', 'cum oil', 'cumulative oil', 'oil produced', 'np_stb', 'np ', 'oil prod', 'np'],
  cum_gas_scf: ['cum_gas_scf', 'cum_gas_mscf', 'cum_gas_bscf', 'cum_gas_mmscf', 'cum gas', 'cumulative gas', 'gas produced', 'gp_scf', 'gp_mscf', 'gp_bscf', 'gp_mmscf', 'gas prod', 'gp '],
  cum_water_stb: ['cum_water_stb', 'cum water prod', 'cum water produced', 'cumulative water', 'water produced', 'wp_stb', 'wp '],
  cum_water_inj_stb: ['cum_water_inj_stb', 'cum_water_inj', 'water inj', 'water injected', 'winj', 'wi_stb'],
  cum_gas_inj_scf: ['cum_gas_inj_scf', 'cum_gas_inj_mscf', 'cum_gas_inj', 'gas inj', 'gas injected', 'ginj', 'gi_scf', 'gi_mscf'],
  bo_rb_stb: ['bo_rb_stb', 'bo (rb/stb)', 'oil fvf', 'oil formation volume factor', ' bo ', 'bo,'],
  rs_scf_stb: ['rs_scf_stb', 'rs_mscf_stb', 'rs (scf/stb)', 'rs (mscf/stb)', 'solution gor', 'solution gas', ' rs ', 'rs,'],
  bg_rb_mscf: ['bg_rb_mscf', 'bg_rb_scf', 'bg (rb/mscf)', 'bg (rb/scf)', 'gas fvf', ' bg ', 'bg,'],
  bw_rb_stb: ['bw_rb_stb', 'bw (rb/stb)', 'water fvf', ' bw ', 'bw,'],
  z_factor: ['z_factor', 'z factor', 'compressibility factor', 'deviation factor', ' z ', 'z,'],
  observation_date: ['observation_date', 'date', 'observed_date'],
  observed_we_rb: ['observed_we_rb', 'cumulative water influx', 'water influx', 'we_rb', 'we '],
};

// Display labels for the preview table
const SCHEMA_DISPLAY = [
  { col: 'timestep_index', label: '#', unit: '' },
  { col: 'pressure_psia', label: 'Pressure', unit: 'psia' },
  { col: 'cum_oil_stb', label: 'Np', unit: 'STB' },
  { col: 'cum_gas_scf', label: 'Gp', unit: 'scf' },
  { col: 'cum_water_stb', label: 'Wp', unit: 'STB' },
  { col: 'cum_water_inj_stb', label: 'Winj', unit: 'STB' },
  { col: 'cum_gas_inj_scf', label: 'Ginj', unit: 'scf' },
  { col: 'bo_rb_stb', label: 'Bo', unit: 'RB/STB' },
  { col: 'rs_scf_stb', label: 'Rs', unit: 'scf/STB' },
  { col: 'bg_rb_mscf', label: 'Bg', unit: 'RB/Mscf' },
  { col: 'bw_rb_stb', label: 'Bw', unit: 'RB/STB' },
  { col: 'z_factor', label: 'z', unit: '' },
];

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Find the original-case header that matches any alias for a given schema column.
 * Match is via case-insensitive substring of the lowercased header.
 */
function findColumnByAliases(headers, aliases) {
  for (const alias of aliases) {
    const normalizedAlias = alias.toLowerCase().trim();
    const idx = headers.findIndex((h) => {
      const norm = ` ${h.toLowerCase()} `; // pad to allow word-boundary-ish matches
      return norm.includes(` ${normalizedAlias} `) || norm.includes(normalizedAlias);
    });
    if (idx !== -1) return headers[idx];
  }
  return null;
}

/**
 * Detect unit scale factor from column header (substring matching).
 * Returns multiplier to convert to base unit (scf for gas, stb for oil).
 */
function detectUnitScale(header, type) {
  const h = header.toLowerCase();
  if (type === 'gas') {
    if (h.includes('bscf')) return 1e9;
    if (h.includes('mmscf')) return 1e6;
    if (h.includes('mscf')) return 1e3;
    return 1; // assume scf
  }
  if (type === 'oil') {
    if (h.includes('mmstb') || h.includes('mmbbl')) return 1e6;
    if (h.includes('mstb') || h.includes('mbbl')) return 1e3;
    return 1; // assume stb
  }
  if (type === 'bg') {
    // bg_rb_scf in CSV → multiply by 1000 to get RB/Mscf (schema unit)
    if (h.includes('rb/scf') || h.includes('rb_scf')) return 1e3;
    return 1; // assume RB/Mscf
  }
  if (type === 'rs') {
    // rs_mscf in CSV → multiply by 1000 to get scf/STB
    if (h.includes('mscf')) return 1e3;
    return 1; // assume scf
  }
  return 1;
}

function safeParseFloat(val) {
  if (val === null || val === undefined || val === '') return null;
  const parsed = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(parsed) ? null : parsed;
}

/**
 * Map a raw papaparse row to a schema row, using the column alias map.
 * Returns { row: schemaRow, warnings: string[] } where warnings flag missing
 * recommended columns.
 */
function mapAndScaleRows(rawRows) {
  if (!rawRows || rawRows.length === 0) {
    throw new Error('CSV is empty.');
  }
  const headers = Object.keys(rawRows[0]);

  // Resolve each schema column to a CSV header (or null)
  const colMap = {};
  for (const [schemaCol, aliases] of Object.entries(COLUMN_ALIASES)) {
    colMap[schemaCol] = findColumnByAliases(headers, aliases);
  }

  if (!colMap.pressure_psia) {
    throw new Error(
      'No pressure column detected. CSV must include a "Pressure" column (or alias: P, P_psia, pressure_psia, etc.).',
    );
  }

  // Detect unit scaling for cumulatives and PVT
  const scales = {
    cum_oil_stb: colMap.cum_oil_stb ? detectUnitScale(colMap.cum_oil_stb, 'oil') : 1,
    cum_gas_scf: colMap.cum_gas_scf ? detectUnitScale(colMap.cum_gas_scf, 'gas') : 1,
    cum_water_stb: colMap.cum_water_stb ? detectUnitScale(colMap.cum_water_stb, 'oil') : 1,
    cum_water_inj_stb: colMap.cum_water_inj_stb ? detectUnitScale(colMap.cum_water_inj_stb, 'oil') : 1,
    cum_gas_inj_scf: colMap.cum_gas_inj_scf ? detectUnitScale(colMap.cum_gas_inj_scf, 'gas') : 1,
    bg_rb_mscf: colMap.bg_rb_mscf ? detectUnitScale(colMap.bg_rb_mscf, 'bg') : 1,
    rs_scf_stb: colMap.rs_scf_stb ? detectUnitScale(colMap.rs_scf_stb, 'rs') : 1,
  };

  // Map each row
  const rows = rawRows.map((raw, idx) => {
    const row = { timestep_index: idx };
    for (const [schemaCol, header] of Object.entries(colMap)) {
      if (header == null) continue;
      const rawVal = raw[header];
      const num = safeParseFloat(rawVal);
      if (num == null) {
        row[schemaCol] = null;
        continue;
      }
      const scale = scales[schemaCol] ?? 1;
      row[schemaCol] = num * scale;
    }
    // Date handling — keep as string (the API helper will pass through; postgres will coerce)
    if (colMap.observation_date && raw[colMap.observation_date]) {
      row.observation_date = String(raw[colMap.observation_date]);
    }
    return row;
  });

  // Filter out completely blank rows (no pressure)
  const filtered = rows.filter(
    (r) => r.pressure_psia != null && !isNaN(r.pressure_psia),
  );

  // Reassign timestep_index sequentially after filtering
  filtered.forEach((r, i) => {
    r.timestep_index = i;
  });

  const warnings = [];
  if (!colMap.cum_oil_stb && !colMap.cum_gas_scf) {
    warnings.push(
      'No cumulative oil or gas column detected. At least one is needed for material balance.',
    );
  }

  return { rows: filtered, warnings, colMap, scales };
}

/**
 * Validate parsed rows against engine invariants.
 * Returns array of {row, message} errors. Empty array = valid.
 */
function validateRows(rows, caseData) {
  const errors = [];

  if (rows.length < 2) {
    errors.push({ row: null, message: `Need at least 2 rows; got ${rows.length}.` });
    return errors;
  }

  // Row 0: zero cumulatives
  const r0 = rows[0];
  for (const cum of ['cum_oil_stb', 'cum_gas_scf', 'cum_water_stb', 'cum_water_inj_stb', 'cum_gas_inj_scf']) {
    if (r0[cum] != null && r0[cum] > 0) {
      errors.push({
        row: 0,
        message: `Row 0 must have zero cumulative production. ${cum} = ${r0[cum]}.`,
      });
    }
  }

  // Row 0: pressure matches case initial pressure
  if (caseData?.initial_pressure_psia != null) {
    const diff = Math.abs(r0.pressure_psia - caseData.initial_pressure_psia);
    if (diff > 1) {
      errors.push({
        row: 0,
        message: `Row 0 pressure (${r0.pressure_psia} psia) doesn't match the case initial pressure (${caseData.initial_pressure_psia} psia). Either update one or update the Overview tab.`,
      });
    }
  }

  // Monotone non-increasing pressures
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].pressure_psia > rows[i - 1].pressure_psia + 0.5) {
      errors.push({
        row: i,
        message: `Row ${i} pressure (${rows[i].pressure_psia}) is higher than row ${i - 1} (${rows[i - 1].pressure_psia}). Pressures must be non-increasing.`,
      });
    }
  }

  // Required cumulatives by fluid system
  if (caseData?.fluid_system === 'gas') {
    const hasGas = rows.some((r) => r.cum_gas_scf != null && r.cum_gas_scf > 0);
    if (!hasGas) {
      errors.push({
        row: null,
        message: 'Gas case but no gas production found. CSV must include a cum_gas column.',
      });
    }
  } else {
    const hasOil = rows.some((r) => r.cum_oil_stb != null && r.cum_oil_stb > 0);
    if (!hasOil) {
      errors.push({
        row: null,
        message: 'Oil case but no oil production found. CSV must include a cum_oil column.',
      });
    }
  }

  return errors;
}

const fmt = (v, decimals = 2) => {
  if (v == null || v === '' || (typeof v === 'number' && isNaN(v))) return '—';
  if (typeof v !== 'number') return String(v);
  if (Math.abs(v) >= 1e6) return v.toExponential(2);
  return v.toFixed(decimals);
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const DataHub = ({ caseId, caseData, onDataSaved }) => {
  const { toast } = useToast();

  // Server state
  const [serverRows, setServerRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Parsed-but-unsaved state
  const [pendingRows, setPendingRows] = useState(null); // null = no upload pending
  const [pendingFileName, setPendingFileName] = useState(null);
  const [parseWarnings, setParseWarnings] = useState([]);
  const [colMap, setColMap] = useState(null);

  // Save state
  const [saving, setSaving] = useState(false);

  // ── Initial hydrate ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!caseId) {
        setLoading(false);
        return;
      }
      const { data, error } = await listProductionData(caseId);
      if (cancelled) return;
      if (error) {
        toast({
          title: 'Could not load production data',
          description: error.message,
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }
      setServerRows(data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, toast]);

  // ── Computed: validation errors on pending rows ──
  const validationErrors = useMemo(() => {
    if (!pendingRows || !caseData) return [];
    return validateRows(pendingRows, caseData);
  }, [pendingRows, caseData]);

  const canSave = pendingRows && validationErrors.length === 0;

  // ── CSV drop handler ──
  const onDrop = useCallback(
    (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false, // we'll parse numbers ourselves with safeParseFloat
        complete: (results) => {
          if (results.errors.length > 0) {
            toast({
              title: 'CSV parse error',
              description: results.errors[0].message,
              variant: 'destructive',
            });
            return;
          }
          try {
            const { rows, warnings, colMap: cm } = mapAndScaleRows(results.data);
            setPendingRows(rows);
            setPendingFileName(file.name);
            setParseWarnings(warnings);
            setColMap(cm);
            toast({
              title: 'CSV parsed',
              description: `${rows.length} rows mapped. Review and save below.`,
            });
          } catch (err) {
            toast({
              title: 'Column mapping failed',
              description: err.message,
              variant: 'destructive',
            });
          }
        },
        error: (err) => {
          toast({
            title: 'File read error',
            description: err.message,
            variant: 'destructive',
          });
        },
      });
    },
    [toast],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
  });

  // ── Discard pending upload ──
  const discardPending = () => {
    setPendingRows(null);
    setPendingFileName(null);
    setParseWarnings([]);
    setColMap(null);
  };

  // ── Save pending rows ──
  const handleSave = async () => {
    if (!canSave || !caseId) return;
    setSaving(true);
    const { error } = await replaceProductionData(caseId, pendingRows);
    setSaving(false);
    if (error) {
      toast({
        title: 'Save failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setServerRows(pendingRows);
    discardPending();
    toast({
      title: 'Production data saved',
      description: `${pendingRows.length} rows written to the case.`,
    });
    onDataSaved?.();
  };

  // ── Download current server data as CSV ──
  const downloadServerData = () => {
    if (serverRows.length === 0) return;
    const cleaned = serverRows.map((r) => {
      const out = {};
      for (const { col } of SCHEMA_DISPLAY) {
        if (r[col] != null) out[col] = r[col];
      }
      return out;
    });
    const csv = Papa.unparse(cleaned);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `case_${caseId}_production_data.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Clear all server data ──
  const clearServerData = async () => {
    if (!caseId) return;
    if (!confirm(`Delete all ${serverRows.length} rows of production data for this case? This cannot be undone.`)) return;
    setSaving(true);
    const { error } = await replaceProductionData(caseId, []);
    setSaving(false);
    if (error) {
      toast({
        title: 'Clear failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setServerRows([]);
    toast({
      title: 'Cleared',
      description: 'All production data deleted for this case.',
    });
    onDataSaved?.();
  };

  // ── Loading state ──
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
          No case data. DataHub must be mounted inside a case detail page.
        </CardContent>
      </Card>
    );
  }

  const visibleRows = pendingRows ?? serverRows;
  const visibleSchemaCols = SCHEMA_DISPLAY.filter(({ col }) =>
    col === 'timestep_index' || col === 'pressure_psia' ||
    visibleRows.some((r) => r[col] != null && r[col] !== 0)
  );

  // =============================================================================
  // RENDER
  // =============================================================================
  return (
    <div className="space-y-6">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <CardTitle className="text-lime-300">Data Hub</CardTitle>
            <CardDescription>
              Upload production history as CSV. Columns are auto-mapped to the case schema; units (Mscf, Bscf) auto-converted.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {serverRows.length > 0 && !pendingRows && (
              <>
                <Button
                  onClick={downloadServerData}
                  variant="outline"
                  size="sm"
                  className="border-slate-600"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download CSV
                </Button>
                <Button
                  onClick={clearServerData}
                  disabled={saving}
                  variant="outline"
                  size="sm"
                  className="border-rose-700 text-rose-400 hover:bg-rose-950/50"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear all
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload zone — shown when no pending upload */}
          {!pendingRows && (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-lime-400 bg-lime-900/20'
                  : 'border-slate-700 hover:border-slate-600 bg-slate-900/30'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 mx-auto mb-3 text-lime-400" />
              <p className="text-slate-200 font-medium mb-1">
                {isDragActive ? 'Drop the CSV file here…' : 'Drag a CSV file here, or click to select'}
              </p>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Required column: <span className="font-mono">Pressure</span> (psia).
                Recommended: <span className="font-mono">Np / Gp / Wp</span> (cumulative oil/gas/water).
                Optional per-row PVT: <span className="font-mono">Bo, Rs, Bg, Bw, z</span>.
                Units auto-detect from headers (Mscf, Bscf, MMscf for gas; Mstb for oil).
              </p>
            </div>
          )}

          {/* Pending upload summary */}
          {pendingRows && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-900/70 border border-amber-700/50 rounded p-4">
                <div className="flex items-center gap-3">
                  <Info className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-slate-200 font-medium">
                      Pending: {pendingFileName}
                    </p>
                    <p className="text-xs text-slate-400">
                      {pendingRows.length} rows parsed. {validationErrors.length === 0 ? 'Ready to save.' : `${validationErrors.length} validation error(s) — fix and re-upload.`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={discardPending}
                    variant="outline"
                    size="sm"
                    className="border-slate-600"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Discard
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!canSave || saving}
                    className="bg-lime-600 hover:bg-lime-500 text-slate-950 font-semibold"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save to case
                  </Button>
                </div>
              </div>

              {/* Column mapping report */}
              {colMap && (
                <div className="bg-slate-900/40 border border-slate-700 rounded p-3">
                  <p className="text-xs font-medium text-slate-300 mb-2">
                    Column mapping
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                    {Object.entries(colMap).map(([schemaCol, header]) => (
                      <div key={schemaCol} className="flex justify-between gap-2">
                        <span className="text-slate-500">{schemaCol}</span>
                        <span className={header ? 'text-lime-400' : 'text-slate-600'}>
                          {header ?? '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Parse warnings */}
              {parseWarnings.length > 0 && (
                <div className="bg-amber-950/30 border border-amber-800/50 rounded p-3 space-y-1">
                  {parseWarnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="bg-rose-950/40 border border-rose-700/50 rounded p-3 space-y-1">
                  <p className="text-xs font-medium text-rose-300 mb-2">
                    Validation errors ({validationErrors.length})
                  </p>
                  {validationErrors.map((err, i) => (
                    <p key={i} className="text-xs text-rose-300 flex items-start gap-2">
                      <X className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      {err.row != null && (
                        <span className="font-mono text-rose-400 flex-shrink-0">
                          Row {err.row}:
                        </span>
                      )}
                      <span>{err.message}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preview table — shows pending OR server rows */}
          {visibleRows.length > 0 && (
            <Card className="bg-slate-900/50 border-slate-700">
              <CardHeader className="border-b border-slate-800 p-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    {pendingRows ? (
                      <>
                        <RefreshCw className="w-3 h-3 text-amber-400" />
                        Pending preview
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3 h-3 text-green-400" />
                        Saved data
                      </>
                    )}
                  </CardTitle>
                  <span className="text-[10px] text-slate-500">
                    {visibleRows.length} rows · {visibleSchemaCols.length} columns
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[360px] w-full">
                  <UiTable>
                    <TableHeader className="bg-slate-950 sticky top-0 z-10">
                      <TableRow className="border-slate-800">
                        {visibleSchemaCols.map(({ col, label, unit }) => (
                          <TableHead
                            key={col}
                            className="text-xs text-slate-400 font-semibold py-2 whitespace-nowrap"
                          >
                            {label}
                            {unit && (
                              <span className="text-[10px] block font-normal text-slate-500">
                                ({unit})
                              </span>
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((r, i) => (
                        <TableRow
                          key={i}
                          className="border-slate-800/50 hover:bg-slate-800/30"
                        >
                          {visibleSchemaCols.map(({ col }) => (
                            <TableCell
                              key={col}
                              className="font-mono text-xs text-slate-300 py-1.5 whitespace-nowrap"
                            >
                              {col === 'timestep_index'
                                ? r[col]
                                : col === 'pressure_psia'
                                ? fmt(r[col], 0)
                                : col === 'z_factor' || col === 'bo_rb_stb' || col === 'bg_rb_mscf' || col === 'bw_rb_stb'
                                ? fmt(r[col], 4)
                                : col === 'rs_scf_stb'
                                ? fmt(r[col], 0)
                                : fmt(r[col], 0)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </UiTable>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!pendingRows && serverRows.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <p className="text-sm">No production data yet.</p>
              <p className="text-xs mt-1">Upload a CSV above to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DataHub;
