// Heat-flow history and erosion helpers (BF1, 2026-09-06). Pure: the
// editors and the wizard call these; the engine reads the shapes they
// return (heatFlow {type, value, history[{age, value}]}, erosionEvents
// [{age, amount}]) exactly as before.

/** Sorted (oldest first), finite, de-duplicated by age. */
export function normalizeHistory(history) {
  const pts = (history || [])
    .map((p) => ({ age: Number(p.age), value: Number(p.value) }))
    .filter((p) => Number.isFinite(p.age) && Number.isFinite(p.value) && p.age >= 0);
  const byAge = new Map();
  for (const p of pts) byAge.set(p.age, p);
  return [...byAge.values()].sort((a, b) => b.age - a.age);
}

/** Chart rows for a heat-flow model over the basin's age span. */
export function heatFlowSeries(heatFlow, maxAge = 200) {
  if (!heatFlow) return [];
  if (heatFlow.type === 'variable' && Array.isArray(heatFlow.history) && heatFlow.history.length) {
    const h = normalizeHistory(heatFlow.history);
    const rows = h.map((p) => ({ age: p.age, value: p.value }));
    if (rows.length && rows[rows.length - 1].age > 0) rows.push({ age: 0, value: rows[rows.length - 1].value });
    return rows.sort((a, b) => a.age - b.age);
  }
  const v = Number(heatFlow.value) || 0;
  return [{ age: 0, value: v }, { age: Math.max(1, maxAge), value: v }];
}

/** The present-day value of a model (what the calibration slider edits). */
export function presentDayHeatFlow(heatFlow) {
  if (heatFlow?.type === 'variable' && heatFlow.history?.length) {
    const h = normalizeHistory(heatFlow.history);
    return h[h.length - 1].value;
  }
  return Number(heatFlow?.value) || 0;
}

/** Problems a tester should see before a run; [] when fine. */
export function heatFlowProblems(heatFlow, maxAge) {
  const out = [];
  if (!heatFlow) return ['No heat-flow model.'];
  if (heatFlow.type === 'variable') {
    const h = normalizeHistory(heatFlow.history);
    if (h.length < 2) out.push('A variable history needs at least two points.');
    if (h.some((p) => p.value <= 0)) out.push('Heat flow must be positive at every point.');
    if (h.length && maxAge > 0 && h[0].age < maxAge) out.push(`The history starts at ${h[0].age} Ma; the basin is ${maxAge} Ma old, so the oldest value is held before it.`);
  } else if (!(Number(heatFlow.value) > 0)) {
    out.push('Heat flow must be positive.');
  }
  return out;
}

/** Sorted (oldest first), finite events with a positive amount. */
export function normalizeErosion(events) {
  return (events || [])
    .map((e) => ({ age: Number(e.age), amount: Number(e.amount) }))
    .filter((e) => Number.isFinite(e.age) && Number.isFinite(e.amount) && e.age >= 0 && e.amount > 0)
    .sort((a, b) => b.age - a.age);
}

export function erosionProblems(events, maxAge) {
  const out = [];
  for (const e of events || []) {
    if (!(Number(e.amount) > 0)) out.push(`Erosion at ${e.age} Ma needs a positive amount.`);
    if (Number(e.age) < 0) out.push('Erosion age cannot be negative.');
    if (maxAge > 0 && Number(e.age) > maxAge) out.push(`Erosion at ${e.age} Ma is older than the basin (${maxAge} Ma).`);
  }
  return out;
}
