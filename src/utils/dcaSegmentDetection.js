// Multi-segment detection for Decline Curve Analysis
// Phase 3a (v2): Piecewise regression approach
//
// Algorithm: Test candidate split points across the data. At each split,
// fit two separate exponential decline models (one per side). Compare the
// weighted combined R² of two fits vs the R² of a single fit over the whole
// range. Declare a breakpoint only if the improvement exceeds a threshold.
// Recurse on each side to find up to 3 breakpoints total.
//
// This method asks the right question — "does splitting actually help?" —
// rather than looking for noisy slope changes in log-log derivatives.

/**
 * Simple linear regression. Returns {slope, intercept, r2}.
 */
function linearRegression(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i], 0);
  const sumXX = xs.reduce((sum, x) => sum + x * x, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: meanY, r2: 0 };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * xs[i];
    ssRes += Math.pow(ys[i] - predicted, 2);
    ssTot += Math.pow(ys[i] - meanY, 2);
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { slope, intercept, r2 };
}

/**
 * Fit an exponential decline q = qi * exp(-D*t) to a slice.
 * Uses log-linear regression. Returns {qi, D, r2, rmse}.
 * Linear in log space → fast, no iteration needed.
 */
function fitExponentialSlice(slice) {
  const xs = slice.map(d => d.time);
  const ys = slice.map(d => Math.log(d.rate));
  const { slope, intercept, r2: logR2 } = linearRegression(xs, ys);
  const qi = Math.exp(intercept);
  const D = -slope;

  // Recompute R² on original scale for fair comparison across slices
  const meanRate = slice.reduce((a, b) => a + b.rate, 0) / slice.length;
  let ssRes = 0, ssTot = 0;
  for (const d of slice) {
    const predicted = qi * Math.exp(-D * d.time);
    ssRes += Math.pow(d.rate - predicted, 2);
    ssTot += Math.pow(d.rate - meanRate, 2);
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  const rmse = Math.sqrt(ssRes / slice.length);
  return { qi, D, r2, rmse };
}

/**
 * Find the single best split point in [minIdx, maxIdx] that maximizes
 * the weighted combined R² of two exponential fits (left + right).
 * Returns {splitIdx, improvement} or null if no split helps.
 */
function findBestSplit(data, minSegmentSize, improvementThreshold) {
  if (data.length < 2 * minSegmentSize) return null;

  // Baseline: single exponential over entire range
  const baseline = fitExponentialSlice(data);
  const baselineR2 = baseline.r2;

  let bestSplit = -1;
  let bestCombinedR2 = baselineR2;

  // Scan candidate split points. Step in 2% increments for performance.
  const step = Math.max(1, Math.floor(data.length / 50));
  for (let i = minSegmentSize; i < data.length - minSegmentSize; i += step) {
    const left = data.slice(0, i);
    const right = data.slice(i);

    const leftFit = fitExponentialSlice(left);
    const rightFit = fitExponentialSlice(right);

    // Weighted combined R² (sample-size weighted)
    const combined = (left.length * leftFit.r2 + right.length * rightFit.r2) / data.length;

    if (combined > bestCombinedR2) {
      bestCombinedR2 = combined;
      bestSplit = i;
    }
  }

  const improvement = bestCombinedR2 - baselineR2;
  if (bestSplit === -1 || improvement < improvementThreshold) {
    return null;
  }
  return { splitIdx: bestSplit, improvement };
}

/**
 * Recursively find up to maxBreakpoints by splitting the worst-fitting segment.
 */
function recursiveSegment(data, minSegmentSize, improvementThreshold, maxBreakpoints) {
  const breakpoints = [];

  // Keep a working list of segments as [startIdx, endIdx] in original data
  const segments = [{ start: 0, end: data.length, slice: data }];

  while (breakpoints.length < maxBreakpoints) {
    // Find the segment whose best split gives the biggest improvement
    let bestIdx = -1;
    let bestSplit = null;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const result = findBestSplit(seg.slice, minSegmentSize, improvementThreshold);
      if (result && (!bestSplit || result.improvement > bestSplit.improvement)) {
        bestIdx = i;
        bestSplit = result;
      }
    }

    if (bestIdx === -1) break; // no further improvement available anywhere

    // Commit this split
    const target = segments[bestIdx];
    const globalSplitIdx = target.start + bestSplit.splitIdx;
    breakpoints.push({
      index: globalSplitIdx,
      improvement: bestSplit.improvement
    });

    // Replace target segment with its two halves
    const leftSlice = target.slice.slice(0, bestSplit.splitIdx);
    const rightSlice = target.slice.slice(bestSplit.splitIdx);
    segments.splice(bestIdx, 1,
      { start: target.start, end: globalSplitIdx, slice: leftSlice },
      { start: globalSplitIdx, end: target.end, slice: rightSlice }
    );
  }

  // Sort by time index for display
  breakpoints.sort((a, b) => a.index - b.index);
  return breakpoints;
}

/**
 * Main export. Detects up to 3 breakpoints in production data using
 * piecewise exponential regression. Returns breakpoints with {date, rate, slopeChange}
 * fields for backward compatibility with the existing UI.
 */
export function detectSegmentBreakpoints(productionData, options = {}) {
  const {
    minSegmentSize = 30,          // minimum points per segment
    improvementThreshold = 0.03,  // R² must improve by at least 3% to accept a split
    maxBreakpoints = 3
  } = options;

  if (!productionData || productionData.length < 90) return [];

  // Filter to positive rates, require numeric time field
  const validData = productionData
    .filter(d => d.rate > 0 && typeof d.time === 'number' && d.time >= 0)
    .sort((a, b) => a.time - b.time);

  if (validData.length < 60) return [];

  // Run recursive piecewise regression
  const bps = recursiveSegment(validData, minSegmentSize, improvementThreshold, maxBreakpoints);

  // Format for UI: each breakpoint needs date, rate, slopeChange
  return bps.map(bp => {
    const point = validData[bp.index];
    return {
      index: bp.index,
      date: point.date instanceof Date ? point.date : new Date(point.date),
      rate: point.rate,
      slopeChange: bp.improvement * 100  // repurpose slopeChange as R² improvement %
    };
  });
}
