/**
 * Material Balance Studio — PDF report export (MB6).
 * jsPDF + autotable, same stack and layout conventions as the Well Test
 * Analysis Studio report (src/utils/wellTestReportExport.js, WT5/WT10).
 * Data in, one PDF out; no fetching here.
 */
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const NAVY = [15, 23, 42];
const SLATE = [100, 116, 139];

const f1 = (v) => (Number.isFinite(v) ? Number(v).toFixed(1) : '-');
const f2 = (v) => (Number.isFinite(v) ? Number(v).toFixed(2) : '-');
const f3 = (v) => (Number.isFinite(v) ? Number(v).toFixed(3) : '-');
const mm = (v, div, unit, digits = 2) =>
  (Number.isFinite(v) ? `${(v / div).toFixed(digits)} ${unit}` : '-');

const TIER_LABELS = {
  benchmark_verified: 'Benchmark verified',
  published_method: 'Published method',
  engineering_basis: 'Engineering basis',
};

const FLUID_LABELS = {
  oil: 'Oil',
  gas: 'Gas',
  oil_with_gas_cap: 'Oil with gas cap',
};

export const exportMbalPdf = ({ caseData, lastResult, defaultCfg }) => {
  const doc = new jsPDF();
  const isGas = caseData?.fluid_system === 'gas';
  const plot = lastResult?.plot_data ?? {};
  const hm = plot.history_match ?? null;
  let y = 20;

  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text('Material Balance Report', 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(...SLATE);
  doc.text(
    [
      caseData?.name || 'Untitled case',
      caseData?.field_name ? `Field ${caseData.field_name}` : null,
      caseData?.reservoir_name ? `Reservoir ${caseData.reservoir_name}` : null,
      FLUID_LABELS[caseData?.fluid_system] ?? caseData?.fluid_system,
    ].filter(Boolean).join('  |  '),
    14, y,
  );
  y += 5;
  doc.text(
    `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}  |  Petrolord Material Balance Studio`,
    14, y,
  );
  y += 4;
  doc.setDrawColor(...SLATE);
  doc.line(14, y, 196, y);
  y += 6;

  const table = (title, head, body) => {
    if (!body.length) return;
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    doc.text(title, 14, y);
    doc.autoTable({
      startY: y + 2,
      head: [head],
      body,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: NAVY },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
    if (y > 260) { doc.addPage(); y = 20; }
  };

  table('Case summary', ['Quantity', 'Value'], [
    ['Initial pressure (psia)', f1(caseData?.initial_pressure_psia)],
    ['Reservoir temperature (F)', f1(caseData?.reservoir_temperature_f)],
    ['Initial water saturation', f3(caseData?.initial_water_saturation)],
    ['Bubble point (psia)', caseData?.bubble_point_psia ? f1(caseData.bubble_point_psia) : '-'],
    ['Production rows', String(caseData?.production_data?.length ?? 0)],
    ['Aquifer model', defaultCfg?.aquifer_model ?? (caseData?.has_aquifer ? 'pot' : 'none')],
    ['Solver method', defaultCfg?.solver_method ?? '-'],
    ['PVT source', defaultCfg?.pvt_source ?? '-'],
  ]);

  if (lastResult) {
    const tierLabel = TIER_LABELS[lastResult.validation_tier] ?? lastResult.validation_tier ?? '-';
    table('Headline results (latest run)', ['Quantity', 'Value'], [
      isGas
        ? ['OGIP', mm(lastResult.estimated_ogip_scf, 1e9, 'Bcf')]
        : ['OOIP', mm(lastResult.estimated_ooip_stb, 1e6, 'MM STB')],
      ['Regression R2', f3(lastResult.r_squared)],
      ['Drive mechanism', (lastResult.drive_mechanism ?? '-').replace(/_/g, ' ')],
      ['Aquifer strength', lastResult.aquifer_strength ?? '-'],
      ['Aquifer W', mm(lastResult.aquifer_owip_rb, 1e6, 'MM rb', 1)],
      ['Cumulative We', mm(lastResult.aquifer_cumulative_we_rb, 1e6, 'MM rb', 1)],
      ['Drive index sum', f3(lastResult.final_drive_index_sum)],
      ['Validation tier', tierLabel],
      ['Validation reference', lastResult.validation_reference ?? '-'],
    ]);

    const di = [];
    if (isGas) {
      di.push(['Gas expansion (GDI)', f3(lastResult.final_gdi)]);
      di.push(['Rock and water (CDI)', f3(lastResult.final_cdi)]);
      di.push(['Water drive (WDI)', f3(lastResult.final_wdi)]);
    } else {
      di.push(['Depletion (DDI)', f3(lastResult.final_ddi)]);
      di.push(['Gas cap (GDI)', f3(lastResult.final_gdi)]);
      di.push(['Water drive (WDI)', f3(lastResult.final_wdi)]);
      di.push(['Segregation (SDI)', f3(lastResult.final_sdi)]);
    }
    table('Drive indices at the final timestep', ['Drive', 'Index'], di);
  }

  if (hm) {
    table(
      `Pressure history match${hm.converged ? ` (converged in ${hm.iterations} iterations)` : ` (stopped at the iteration cap, ${hm.iterations})`}`,
      ['Parameter', 'Start', 'Matched', '95% confidence'],
      (hm.matched_parameters ?? []).map((p) => [
        `${p.label} (${p.unit})${p.at_bound ? ' [at bound]' : ''}`,
        Number(p.initial_value).toPrecision(4),
        Number(p.matched_value).toPrecision(5),
        p.ci95_low != null && p.ci95_high != null
          ? `${Number(p.ci95_low).toPrecision(4)} to ${Number(p.ci95_high).toPrecision(4)}`
          : '-',
      ]),
    );
    table('Match quality', ['Quantity', 'Value'], [
      ['RMS pressure error (psi)', f2(hm.rms_error_psi)],
      ['Largest miss (psi)', f2(hm.max_abs_error_psi)],
      ['Fit points', String((hm.point_in_fit ?? []).filter(Boolean).length)],
    ]);
  }

  const steps = plot.timestep_index ?? [];
  if (steps.length) {
    const MAX_ROWS = 60;
    const body = steps.slice(0, MAX_ROWS).map((step, i) => [
      String(step),
      f1(plot.pressure?.[i]),
      isGas ? mm(plot.cum_gas_scf?.[i], 1e9, 'Bcf', 3) : mm(plot.cum_oil_stb?.[i], 1e6, 'MM STB', 3),
      mm(plot.cum_water_stb?.[i], 1e3, 'M STB', 1),
      mm(plot.We?.[i], 1e6, 'MM rb', 2),
      hm ? f1(hm.simulated_pressure_psia?.[i]) : '-',
    ]);
    table(
      `Pressure and production history${steps.length > MAX_ROWS ? ` (first ${MAX_ROWS} of ${steps.length} rows)` : ''}`,
      ['Step', 'p (psia)', isGas ? 'Gp' : 'Np', 'Wp', 'We', hm ? 'p simulated' : ''],
      body,
    );
  }

  const warnings = lastResult?.warnings ?? [];
  if (warnings.length) {
    table('Engine warnings', ['#', 'Warning'], warnings.map((w, i) => [String(i + 1), w]));
  }

  doc.setFontSize(8);
  doc.setTextColor(...SLATE);
  doc.text(
    'Results computed by the Petrolord material balance engine. The validation tier names the published benchmark backing the specific engine path used.',
    14, 285,
  );

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`mbal-report-${(caseData?.name ?? 'case').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}-${stamp}.pdf`);
  return true;
};

/**
 * CSV of the latest run's per-timestep series (plot_data columns), for
 * spreadsheet work. Returns the CSV string; caller downloads it.
 */
export const buildPlotDataCsv = (lastResult) => {
  const plot = lastResult?.plot_data;
  if (!plot?.timestep_index?.length) return null;
  const hm = plot.history_match ?? null;
  const cols = [
    ['timestep_index', plot.timestep_index],
    ['pressure_psia', plot.pressure],
    ['cum_oil_stb', plot.cum_oil_stb],
    ['cum_gas_scf', plot.cum_gas_scf],
    ['cum_water_stb', plot.cum_water_stb],
    ['F_rb', plot.F],
    ['Et_rb', plot.Et],
    ['Eo_rb_stb', plot.Eo],
    ['Eg_oil_rb_stb', plot.Eg_oil],
    ['Efw_rb', plot.Efw],
    ['We_rb', plot.We],
    ['p_over_z', plot.p_over_z],
    ['ddi', plot.ddi],
    ['gdi', plot.gdi],
    ['wdi', plot.wdi],
    ['cdi', plot.cdi],
    ['sdi', plot.sdi],
    ['simulated_pressure_psia', hm?.simulated_pressure_psia],
    ['pressure_residual_psi', hm?.residual_psi],
  ].filter(([, arr]) => Array.isArray(arr));
  const n = plot.timestep_index.length;
  const lines = [cols.map(([name]) => name).join(',')];
  for (let i = 0; i < n; i++) {
    lines.push(cols.map(([, arr]) => {
      const v = arr[i];
      return v == null || Number.isNaN(v) ? '' : String(v);
    }).join(','));
  }
  return lines.join('\n');
};
