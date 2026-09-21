// The government take (undiscounted) vs oil price chart, as a model (EC2-1,
// 2026-09-14; renamed in the naming wave the same day).
//
// The engine's price sweep used to return EXACTLY 0 when the project's profit
// was not positive, and this chart drew that zero on the same line as real
// shares. On the published never-recovers case six regimes sat flat on zero
// while the government collected 700 to 1663 million USD; with capex tripled
// the same line ran to 2223 percent. Every point now carries a state and this
// model turns the three states into three different marks:
//
//   share      the line runs through it
//   exceeds    no line; an open marker pinned to the top of the axis, with the
//              true value in the tooltip. It never sets the axis scale.
//   undefined  no line and no marker; the price band is shaded and labelled
//              "project uneconomic at this price"
//
// Profit here is government take plus contractor net cash flow, which is
// revenue less opex less capex, so it does not depend on the regime: a price
// at which the project is uneconomic is uneconomic under every regime. The band
// is therefore drawn where every series is undefined.
//
// Pure data in, pure data out, so the rules are tested without rendering.
import { GOVERNMENT_SHARE_STATES } from '@/utils/fiscalDesignerCalculations';
import { FISCAL_METRIC_KEYS } from '@/utils/fiscalConventions';

const S = GOVERNMENT_SHARE_STATES;

export const UNECONOMIC_BAND_LABEL = 'project uneconomic at this price';

/** The chart's metric, with its basis, from the shared conventions. */
export const PRICE_CHART_METRIC = { key: FISCAL_METRIC_KEYS.GOVERNMENT_TAKE, discountRatePct: null };

const stateAt = (series, i) => {
  if (Array.isArray(series.states) && series.states[i]) return series.states[i];
  const v = series.values[i];
  if (!Number.isFinite(v)) return S.UNDEFINED;
  return v > 100 ? S.EXCEEDS : S.SHARE;
};

/**
 * @param {{labels: number[], data: {regimeId: string, values: (number|null)[], states?: string[]}[]}} price
 * @param {{id: string, name: string}[]} summary
 */
export const buildPriceShareChart = (price, summary) => {
  const labels = price?.labels || [];
  const series = (price?.data || [])
    .map((d) => {
      const regime = (summary || []).find((r) => r.id === d.regimeId);
      return regime ? { name: regime.name, values: d.values || [], states: d.states } : null;
    })
    .filter(Boolean);

  const rows = labels.map((label, i) => {
    const row = { price: label, meta: {} };
    series.forEach((s) => {
      const state = stateAt(s, i);
      const value = state === S.UNDEFINED ? null : s.values[i];
      row[s.name] = state === S.SHARE ? value : null;
      row.meta[s.name] = { state, value };
    });
    return row;
  });

  // The scale comes from share points only.
  const shares = rows.flatMap((row) => series.map((s) => row[s.name]).filter((v) => v !== null));
  const domain = shares.length
    ? [
      Math.max(0, Math.floor((Math.min(...shares) - 5) / 10) * 10),
      Math.min(100, Math.ceil((Math.max(...shares) + 5) / 10) * 10),
    ]
    : [0, 100];

  const pinned = series.map((s) => ({
    name: s.name,
    points: rows
      .filter((row) => row.meta[s.name].state === S.EXCEEDS)
      .map((row) => ({ price: row.price, pinnedAt: domain[1], value: row.meta[s.name].value })),
  })).filter((p) => p.points.length > 0);

  const step = labels.length > 1 ? labels[1] - labels[0] : 10;
  const bands = [];
  let start = -1;
  for (let i = 0; i <= rows.length; i++) {
    const uneconomic = i < rows.length && series.length > 0
      && series.every((s) => rows[i].meta[s.name].state === S.UNDEFINED);
    if (uneconomic && start < 0) start = i;
    if (!uneconomic && start >= 0) {
      bands.push({ x1: labels[start] - step / 2, x2: labels[i - 1] + step / 2, from: labels[start], to: labels[i - 1] });
      start = -1;
    }
  }

  return {
    rows,
    names: series.map((s) => s.name),
    domain,
    xDomain: labels.length ? [labels[0] - step / 2, labels[labels.length - 1] + step / 2] : [0, 1],
    ticks: labels,
    pinned,
    bands,
    hasShareLine: shares.length > 0,
  };
};

/** The tooltip line for one regime at one price. */
export const describePoint = ({ state, value }) => {
  if (state === S.UNDEFINED) return `no government take: ${UNECONOMIC_BAND_LABEL}`;
  const pct = `${value.toFixed(1)} %`;
  return state === S.EXCEEDS
    ? `${pct}, above 100 percent: the government collects more than the project makes`
    : pct;
};
