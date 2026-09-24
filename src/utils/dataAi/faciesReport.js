// Electrofacies Studio (Data & AI D3): the run report as CSV.
//
// Layout only. Every eigenvalue, loading, inertia, silhouette, label,
// confusion count and score is the engine's, taken from the results the
// workflows returned. The CSV keeps every number at full round-trip
// precision (String(x)); the screen rounds for reading, the export does not.
// Engine refusals are written as the engine wrote them.
import { ENGINE_VERSION, methodText } from '@/utils/dataAi/faciesWorkflows';

const q = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_COLUMNS = ['record', 'method', 'well', 'depth', 'name', 'value', 'detail'];

const reportRows = (row, method, report) => {
  if (!report) return;
  if (report.error) { row({ record: 'refused', method, name: 'report', detail: report.error }); return; }
  row({ record: 'score', method, name: 'accuracy', value: report.accuracy });
  report.perClass.forEach((c) => {
    row({ record: 'score', method, name: `precision ${c.label}`, value: c.precision });
    row({ record: 'score', method, name: `recall ${c.label}`, value: c.recall });
    row({ record: 'score', method, name: `f1 ${c.label}`, value: c.f1 });
    row({ record: 'score', method, name: `support ${c.label}`, value: c.support });
  });
  row({ record: 'score', method, name: 'macro f1', value: report.macro.f1 });
  row({ record: 'score', method, name: 'weighted f1', value: report.weighted.f1 });
  report.labels.forEach((t, i) => report.labels.forEach((p, j) => {
    row({ record: 'confusion', method, name: `core ${t} predicted ${p}`, value: report.matrix[i][j] });
  }));
};

const compareRows = (row, method, cmp) => {
  if (!cmp || cmp.none) { if (cmp?.none) row({ record: 'note', method, name: 'core comparison', detail: cmp.none }); return; }
  if (cmp.match.error) { row({ record: 'refused', method, name: 'matching', detail: cmp.match.error }); return; }
  row({ record: 'meta', method, name: 'matching', value: cmp.mode, detail: cmp.modeText });
  row({ record: 'score', method, name: 'cored rows compared', value: cmp.rows });
  row({ record: 'score', method, name: 'adjusted rand index', value: cmp.match.ari });
  row({ record: 'score', method, name: 'matched rows', value: cmp.match.matchedRows });
  cmp.match.mapping.forEach((m) => row({ record: 'mapping', method, name: `cluster ${m.cluster}`, value: m.facies, detail: `${m.rows} of ${m.clusterSize} rows` }));
  reportRows(row, method, cmp.match.report);
};

/**
 * One CSV, one row per record under a shared header: meta, pca, elbow,
 * per-method scores, confusion counts, mappings, refusals, and a label row
 * per design row and method (with the core facies as method "core").
 */
export function buildFaciesCsv({
  runName, table, design, parsed, results,
}) {
  const lines = [CSV_COLUMNS.join(',')];
  const row = (cells) => lines.push(CSV_COLUMNS.map((c) => q(cells[c])).join(','));
  row({ record: 'meta', name: 'run', value: runName || 'Unsaved facies run' });
  row({ record: 'meta', name: 'data', value: table?.label || '' });
  row({ record: 'meta', name: 'logs', value: (design?.names || []).join(' ') });
  row({ record: 'meta', name: 'scaling', value: parsed?.scale });
  row({ record: 'meta', name: 'core facies', value: design?.faciesText || 'none' });
  row({ record: 'meta', name: 'rows', value: design?.X?.length ?? '' });
  row({ record: 'meta', name: 'wells', value: (design?.wells || []).map((w) => `${w.name} (${w.rows})`).join(' ') });
  row({ record: 'meta', name: 'engine', value: ENGINE_VERSION });
  row({ record: 'meta', name: 'generated', value: new Date().toISOString() });

  const pca = results.pca?.result;
  if (pca?.error) row({ record: 'refused', method: 'pca', detail: pca.error });
  else if (pca) {
    row({ record: 'meta', method: 'pca', name: 'matrix', value: pca.matrix });
    pca.eigenvalues.forEach((v, k) => row({ record: 'pca', method: 'pca', name: `eigenvalue PC${k + 1}`, value: v }));
    pca.explainedVarianceRatio.forEach((v, k) => row({ record: 'pca', method: 'pca', name: `explained ratio PC${k + 1}`, value: v }));
    pca.loadings.forEach((l, k) => l.forEach((v, j) => row({ record: 'pca', method: 'pca', name: `loading PC${k + 1} ${pca.names[j]}`, value: v })));
  }

  const el = results.elbow?.result;
  if (el?.error) row({ record: 'refused', method: 'elbow', detail: el.error });
  else if (el) {
    row({ record: 'meta', method: 'elbow', name: 'rows', value: el.n, detail: el.sampled ? `seeded sample, seed ${el.seed}` : 'every row' });
    el.table.forEach((r) => {
      row({ record: 'elbow', method: 'elbow', name: `inertia k ${r.k}`, value: r.inertia });
      row({ record: 'elbow', method: 'elbow', name: `silhouette k ${r.k}`, value: r.silhouette });
    });
  }

  const km = results.kmeans?.result;
  if (km?.kmeans?.error) row({ record: 'refused', method: 'kmeans', detail: km.kmeans.error });
  else if (km) {
    row({ record: 'meta', method: 'kmeans', name: 'method', value: methodText('kmeans', km, parsed) });
    row({ record: 'score', method: 'kmeans', name: 'inertia', value: km.kmeans.inertia });
    if (km.silhouette?.error) row({ record: 'refused', method: 'kmeans', name: 'silhouette', detail: km.silhouette.error });
    else row({ record: 'score', method: 'kmeans', name: 'mean silhouette', value: km.silhouette.mean, detail: km.silhouette.sampled ? `seeded sample of ${km.silhouette.n} rows` : 'every row' });
    km.kmeans.centresOriginal.forEach((c, i) => c.forEach((v, j) => row({ record: 'centre', method: 'kmeans', name: `cluster ${i} ${km.kmeans.names[j]}`, value: v })));
    compareRows(row, 'kmeans', km.compare);
  }

  const ag = results.agglomerative?.result;
  if (ag?.agglomerative?.error) row({ record: 'refused', method: 'agglomerative', detail: ag.agglomerative.error });
  else if (ag) {
    row({ record: 'meta', method: 'agglomerative', name: 'method', value: methodText('agglomerative', ag, parsed) });
    if (ag.silhouette?.error) row({ record: 'refused', method: 'agglomerative', name: 'silhouette', detail: ag.silhouette.error });
    else if (ag.silhouette) row({ record: 'score', method: 'agglomerative', name: 'mean silhouette', value: ag.silhouette.mean });
    compareRows(row, 'agglomerative', ag.compare);
  }

  ['knn', 'cart'].forEach((key) => {
    const r = results[key]?.result;
    if (!r) return;
    const refused = r.error || r.blind?.error || r.blindTree?.error;
    if (refused) { row({ record: 'refused', method: key, detail: refused }); return; }
    row({ record: 'meta', method: key, name: 'method', value: methodText(key, r, parsed) });
    row({ record: 'meta', method: key, name: 'held-out wells', value: r.split.testGroups.join(' '), detail: r.split.scheme === 'seeded' ? `engine group split, seed ${r.split.seed}` : 'chosen' });
    reportRows(row, key, r.scores.report);
    if (r.scores.ari.error) row({ record: 'refused', method: key, name: 'adjusted rand index', detail: r.scores.ari.error });
    else row({ record: 'score', method: key, name: 'adjusted rand index', value: r.scores.ari.ari });
    if (r.finalRefusal) row({ record: 'refused', method: key, name: 'final model', detail: r.finalRefusal });
    if (r.final?.error) row({ record: 'refused', method: key, name: 'final model', detail: r.final.error });
    if (key === 'cart' && r.finalTree && !r.finalTree.error) row({ record: 'tree', method: key, name: 'final tree', detail: r.finalTree.printed });
  });

  if (design && !design.error) {
    const keyed = ['kmeans', 'agglomerative', 'knn', 'cart'].filter((k) => Array.isArray(results[k]?.result?.labels));
    for (let j = 0; j < design.X.length; j += 1) {
      const base = { record: 'row', well: design.groups[j], depth: design.depth[j] };
      if (design.facies) row({ ...base, method: 'core', value: design.facies[j] });
      keyed.forEach((k) => row({ ...base, method: k, value: results[k].result.labels[j] }));
    }
  }
  return `${lines.join('\n')}\n`;
}
