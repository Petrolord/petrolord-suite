// Risked Reserves Valuation engine (wired up in R3, Reservoir-ROADMAP.md).
//
// Probabilistic project NPV: triangular sampling of the input variables
// (P10/P50/P90 treated as low/mode/high of a triangular distribution),
// a simple fiscal cash-flow model (royalty, opex, tax, exponential
// production allocated so cumulative production equals the reserves
// exactly over the project life), Monte Carlo percentiles in the
// petroleum convention (P90 = low outcome exceeded with 90%
// probability), and a one-factor-at-a-time P10/P90 tornado.
//
// The RNG is injectable for deterministic tests; production code uses
// Math.random.

// Inverse-CDF triangular sample with low = p10, mode = p50, high = p90.
export const triangularRandom = (p10, p50, p90, rng = Math.random) => {
  const F_p50 = (p90 - p10) > 0 ? (p50 - p10) / (p90 - p10) : 0.5;
  const rand = rng();

  if (rand < F_p50) {
    return p10 + Math.sqrt(rand * (p90 - p10) * (p50 - p10));
  }
  return p90 - Math.sqrt((1 - rand) * (p90 - p10) * (p90 - p50));
};

export const calculateSingleNPV = (params, settings) => {
  const { discountRate, taxRate, royaltyRate, projectLife } = settings;
  const dr = discountRate / 100;
  const tr = taxRate / 100;
  const rr = royaltyRate / 100;

  const reserves = params['Oil Reserves (MMSTB)'] * 1e6;
  const price = params['Initial Oil Price ($/STB)'];
  const capex = params['CAPEX ($MM)'] * 1e6;
  const opexPerBoe = params['OPEX ($/boe)'];
  const declineRate = params['Decline Rate (%/yr)'] / 100;

  let npv = -capex;

  // Geometric-decline first-year rate chosen so that cumulative
  // production over the project life equals the reserves exactly.
  // D -> 0 limit: uniform production of reserves / projectLife.
  const initialProduction = declineRate > 0
    ? reserves * (declineRate / (1 - Math.pow(1 - declineRate, projectLife)))
    : reserves / projectLife;

  for (let year = 1; year <= projectLife; year++) {
    const production = initialProduction * Math.pow(1 - declineRate, year - 1);

    const revenue = production * price;
    const royalty = revenue * rr;
    const opex = production * opexPerBoe;

    const profitBeforeTax = revenue - royalty - opex;
    const tax = profitBeforeTax > 0 ? profitBeforeTax * tr : 0;
    const cashFlow = profitBeforeTax - tax;

    npv += cashFlow / Math.pow(1 + dr, year);
  }

  return npv / 1e6; // Return in $MM
};

export const runSensitivityAnalysis = (baseParams, variables, settings) => {
    const sensitivityData = [];

    variables.forEach(variable => {
        const lowParams = { ...baseParams, [variable.name]: variable.p10 };
        const highParams = { ...baseParams, [variable.name]: variable.p90 };

        const lowNpv = calculateSingleNPV(lowParams, settings);
        const highNpv = calculateSingleNPV(highParams, settings);

        const swing = Math.abs(highNpv - lowNpv);
        sensitivityData.push({
            variable: variable.name.replace(/\s\(.*\)/, ''), // Clean up name for display
            swing: swing,
        });
    });

    return sensitivityData.sort((a, b) => b.swing - a.swing);
};


export const runMonteCarloSimulation = async (inputs, rng = Math.random) => {
  const { variables, simulationSettings, economicSettings } = inputs;
  const iterations = simulationSettings.iterations;
  const npvResults = [];

  for (let i = 0; i < iterations; i++) {
    const iterationParams = {};
    variables.forEach(v => {
      iterationParams[v.name] = triangularRandom(v.p10, v.p50, v.p90, rng);
    });

    const npv = calculateSingleNPV(iterationParams, economicSettings);
    npvResults.push(npv);
  }

  npvResults.sort((a, b) => a - b);

  const p10Index = Math.floor(iterations * 0.1);
  const p50Index = Math.floor(iterations * 0.5);
  const p90Index = Math.floor(iterations * 0.9);

  // Petroleum convention: P90 is the LOW outcome (exceeded with 90%
  // probability), P10 the high one.
  const summary = {
    p90: npvResults[p10Index],
    p50: npvResults[p50Index],
    p10: npvResults[p90Index],
    chanceOfSuccess: (npvResults.filter(n => n > 0).length / iterations) * 100,
  };

  const cdfData = npvResults.map((npv, index) => ({
    npv,
    prob: ((index + 1) / iterations) * 100,
  }));

  const minNpv = Math.min(...npvResults);
  const maxNpv = Math.max(...npvResults);
  const binCount = 20;
  const binSize = (maxNpv - minNpv) / binCount || 1;
  const histogramData = [];
  for (let i = 0; i < binCount; i++) {
    const binStart = minNpv + i * binSize;
    const binEnd = binStart + binSize;
    const last = i === binCount - 1;
    histogramData.push({
      binStart: binStart.toFixed(0),
      binEnd: binEnd.toFixed(0),
      // The last bin is closed on the right so the maximum lands in it.
      count: npvResults.filter(n => n >= binStart && (last ? n <= binEnd : n < binEnd)).length,
    });
  }

  const baseParams = {};
  variables.forEach(v => { baseParams[v.name] = v.p50; });
  const tornadoData = runSensitivityAnalysis(baseParams, variables, economicSettings);

  return {
    summary,
    cdfData,
    histogramData,
    tornadoData,
  };
};
