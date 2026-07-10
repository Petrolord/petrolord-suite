import * as ss from 'simple-statistics';

// Distribution types that carry genuine uncertainty (a "constant" does not).
const SPREAD_TYPES = new Set(['triangular', 'normal', 'lognormal', 'uniform']);

export class MonteCarloEngine {

    // Lightweight Cholesky decomposition (lower triangular). Clamps the diagonal
    // at 0 so a slightly non-positive-definite correlation matrix degrades
    // gracefully instead of producing NaNs.
    static cholesky(matrix) {
        const n = matrix.length;
        const L = Array(n).fill(0).map(() => Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            for (let j = 0; j <= i; j++) {
                let sum = 0;
                for (let k = 0; k < j; k++) {
                    sum += L[i][k] * L[j][k];
                }
                if (i === j) {
                    L[i][j] = Math.sqrt(Math.max(matrix[i][i] - sum, 0));
                } else {
                    L[i][j] = L[j][j] === 0 ? 0 : (1.0 / L[j][j]) * (matrix[i][j] - sum);
                }
            }
        }
        return L;
    }

    // Box-Muller standard normal
    static randomNormal() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    // Error function — Abramowitz & Stegun 7.1.26 (max abs error 1.5e-7).
    static erf(x) {
        const sign = x < 0 ? -1 : 1;
        const ax = Math.abs(x);
        const t = 1 / (1 + 0.3275911 * ax);
        const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592)
            * t * Math.exp(-ax * ax);
        return sign * y;
    }

    // Standard-normal CDF Φ(x). Accurate erf form — replaces the old logistic
    // approximation which biased the Gaussian copula.
    static normalCDF(x) {
        return 0.5 * (1 + this.erf(x / Math.SQRT2));
    }

    // Triangular inverse CDF
    static triInvCDF(u, a, c, b) {
        if (a === b) return a;
        if (u <= (c - a) / (b - a)) return a + Math.sqrt(u * (b - a) * (c - a));
        return b - Math.sqrt((1 - u) * (b - a) * (b - c));
    }

    // Does this input carry real uncertainty (vs. a constant / degenerate range)?
    static isVariable(dist) {
        if (!dist || !SPREAD_TYPES.has(dist.type)) return false;
        if (dist.type === 'triangular' || dist.type === 'uniform') {
            return Number(dist.max) > Number(dist.min);
        }
        return Number(dist.stdDev) > 0; // normal / lognormal
    }

    // Deterministic representative value (used for non-varying params and fallbacks).
    static representativeValue(dist) {
        if (!dist) return undefined;
        switch (dist.type) {
            case 'triangular': return Number(dist.mode);
            case 'uniform': return (Number(dist.min) + Number(dist.max)) / 2;
            case 'normal':
            case 'lognormal': return Number(dist.mean);
            case 'constant': return parseFloat(dist.value);
            default: {
                const v = dist.value ?? dist.mode ?? dist.mean;
                return v == null ? undefined : Number(v);
            }
        }
    }

    // Map a correlated standard-normal variate x to a value from the marginal
    // distribution (the Gaussian-copula transform). For normal/lognormal
    // marginals x IS the standard-normal quantile, so no Φ⁻¹ is needed; for
    // triangular/uniform we push x through Φ then the marginal inverse-CDF.
    static marginalValue(dist, x) {
        switch (dist.type) {
            case 'normal':
                return Number(dist.mean) + Number(dist.stdDev) * x;
            case 'lognormal': {
                const m = Number(dist.mean), sd = Number(dist.stdDev);
                const m2 = m * m, sd2 = sd * sd;
                const mu = Math.log(m2 / Math.sqrt(m2 + sd2));
                const sigma = Math.sqrt(Math.log(1 + sd2 / m2));
                return Math.exp(mu + sigma * x);
            }
            case 'triangular':
                return this.triInvCDF(this.normalCDF(x), Number(dist.min), Number(dist.mode), Number(dist.max));
            case 'uniform':
                return Number(dist.min) + this.normalCDF(x) * (Number(dist.max) - Number(dist.min));
            default:
                return this.representativeValue(dist);
        }
    }

    static async runSimulation(config, inputs, onProgress) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    const iterations = Math.max(100, Math.floor(config.iterations || 10000));
                    const results = { stooip: [], giip: [], grv: [], samples: [] };
                    const diagnostics = { rejectedCount: 0, outOfBounds: [], warnings: [], tracking: {} };

                    // Structural mode: GRV comes from integrating the top surface against
                    // sampled fluid contacts (via a precomputed hypsometric curve), so the
                    // geometric uncertainty lives in the CONTACTS + an optional GRV factor —
                    // area and thickness are consequences of the structure, not free inputs.
                    const structural = config.grvMode === 'structural' && !!config.hypsometry;

                    // Identify the active uncertainty variables (any spread distribution).
                    const params = structural
                        ? ['owc', 'goc', 'grvFactor', 'porosity', 'sw', 'fvf', 'bg', 'ntg']
                        : ['area', 'thickness', 'porosity', 'sw', 'fvf', 'bg', 'ntg'];
                    const varKeys = params.filter((p) => this.isVariable(inputs[p]));
                    const nVars = varKeys.length;
                    const clamp01 = (v) => Math.min(1, Math.max(0, v));

                    if (inputs.pore_volume && inputs.porosity) {
                        diagnostics.warnings.push('Double Counting Warning: Both Porosity and Pore Volume are active uncertainties.');
                    }

                    // Correlation matrix (identity + domain-knowledge / caller-supplied entries).
                    const C = Array(nVars).fill(0).map(() => Array(nVars).fill(0));
                    for (let i = 0; i < nVars; i++) C[i][i] = 1.0;
                    const setCorr = (a, b, rho) => {
                        const ia = varKeys.indexOf(a), ib = varKeys.indexOf(b);
                        if (ia >= 0 && ib >= 0) { C[ia][ib] = rho; C[ib][ia] = rho; }
                    };
                    // Default: porosity rises as water saturation falls.
                    setCorr('porosity', 'sw', -0.8);
                    if (Array.isArray(config.correlations)) {
                        config.correlations.forEach(({ a, b, rho }) => {
                            if (Number.isFinite(rho) && rho > -1 && rho < 1) setCorr(a, b, rho);
                        });
                    }
                    const L = this.cholesky(C);

                    const isField = config.unitSystem === 'field';
                    // Field: acre-ft × 7758 → STB, × 43560 → scf. Metric: area(km²)·thick(m)
                    // × 1e6 → m³, then / Bo|Bg → sm³ (mirrors VolumeCalculationEngine).
                    const oilFactor = isField ? 7758 : 1_000_000;
                    const gasFactor = isField ? 43560 : 1_000_000;

                    for (let i = 0; i < iterations; i++) {
                        // Correlated standard normals X = L · Z
                        const Z = Array.from({ length: nVars }, () => this.randomNormal());
                        const X = Array(nVars).fill(0);
                        for (let r = 0; r < nVars; r++) {
                            for (let c = 0; c <= r; c++) X[r] += L[r][c] * Z[c];
                        }

                        // Transform each correlated normal through its marginal.
                        const sampleVals = {};
                        let isRejected = false;
                        for (let v = 0; v < nVars; v++) {
                            const key = varKeys[v];
                            const dist = inputs[key];
                            const val = this.marginalValue(dist, X[v]);
                            // Optional truncation for unbounded (normal/lognormal) marginals.
                            if (dist.type === 'normal' || dist.type === 'lognormal') {
                                const lo = Number(dist.min), hi = Number(dist.max);
                                if ((Number.isFinite(lo) && val < lo) || (Number.isFinite(hi) && val > hi)) {
                                    isRejected = true;
                                    if (diagnostics.outOfBounds.length < 10) {
                                        diagnostics.outOfBounds.push({ iter: i, key, val, bounds: [lo, hi] });
                                    }
                                }
                            }
                            sampleVals[key] = val;
                        }

                        // Resolve every parameter: sampled value, else its deterministic representative.
                        const resolve1 = (key, dflt) => {
                            const v = sampleVals[key] ?? this.representativeValue(inputs[key]);
                            return Number.isFinite(v) ? v : dflt;
                        };
                        const ntg = clamp01(resolve1('ntg', 1.0));
                        const phi = clamp01(resolve1('porosity', 0.20));   // physical [0,1] clamp
                        const sw = clamp01(resolve1('sw', 0.30));          // prevents negative HCPV
                        const fvf = resolve1('fvf', 1.2);
                        const bg = resolve1('bg', 0.005);

                        if (isRejected) {
                            diagnostics.rejectedCount++;
                            continue;
                        }

                        let grv, stooip = 0, giip = 0, sampleInputs;
                        if (structural) {
                            // GRV per zone from the hypsometric curve, using sampled contacts.
                            const owc = resolve1('owc', config.deterministicContacts?.owc);
                            const goc = resolve1('goc', config.deterministicContacts?.goc);
                            const grvFactor = Math.max(0, resolve1('grvFactor', 1));
                            const { grvOil, grvGas } = config.hypsometry.zoneVolumes(config.fluidType, owc, goc);
                            const gOil = grvOil * grvFactor;
                            const gGas = grvGas * grvFactor;
                            grv = gOil + gGas;
                            const hcpvOil = gOil * ntg * phi * (1 - sw);
                            const hcpvGas = gGas * ntg * phi * (1 - sw);
                            // Hypsometric volumes are already acre-ft (field) / m³ (metric).
                            stooip = isField ? (hcpvOil * 7758) / (fvf > 0 ? fvf : 1) : hcpvOil / (fvf > 0 ? fvf : 1);
                            giip = isField ? (hcpvGas * 43560) / (bg > 0 ? bg : 0.001) : hcpvGas / (bg > 0 ? bg : 0.001);
                            sampleInputs = { owc, goc, grvFactor, ntg, phi, sw, fvf, bg };
                        } else {
                            const area = resolve1('area', 1000);
                            const thickness = resolve1('thickness', 50);
                            grv = area * thickness;
                            const hcpv = grv * ntg * phi * (1 - sw);
                            if (config.fluidType === 'oil' || config.fluidType === 'oil_gas') {
                                stooip = (hcpv * oilFactor) / (fvf > 0 ? fvf : 1);
                            }
                            if (config.fluidType === 'gas' || config.fluidType === 'oil_gas') {
                                giip = (hcpv * gasFactor) / (bg > 0 ? bg : 0.001);
                            }
                            sampleInputs = { area, thickness, ntg, phi, sw, fvf, bg };
                        }
                        const targetVol = config.fluidType === 'gas' ? giip : stooip;

                        results.stooip.push(stooip);
                        results.giip.push(giip);
                        results.grv.push(grv);
                        results.samples.push({ index: i, targetVol, inputs: sampleInputs });
                    }

                    if (results.samples.length === 0) {
                        diagnostics.warnings.push('No valid realizations were generated — check distribution bounds.');
                        resolve({ raw: results, stats: { stooip: {}, giip: {}, sensitivity: [] }, diagnostics });
                        return;
                    }

                    const rejectionRate = (diagnostics.rejectedCount / iterations) * 100;
                    if (rejectionRate > 5) {
                        diagnostics.warnings.push(`High rejection rate: ${rejectionRate.toFixed(2)}% of samples exceeded truncation bounds.`);
                    }

                    // Percentile realizations (P90 low, P10 high — petroleum convention).
                    results.samples.sort((a, b) => a.targetVol - b.targetVol);
                    const validLen = results.samples.length;
                    diagnostics.tracking = {
                        P90: results.samples[Math.floor(0.1 * validLen)],
                        P50: results.samples[Math.floor(0.5 * validLen)],
                        P10: results.samples[Math.floor(0.9 * validLen)],
                    };

                    if (typeof onProgress === 'function') onProgress(100);

                    const stats = {
                        stooip: this.calculateBasicStats(results.stooip),
                        giip: this.calculateBasicStats(results.giip),
                        sensitivity: this.calculateVarianceDecomposition(results.samples),
                        baseCaseValue: config.fluidType === 'gas' ? config.baseCase?.results?.giip : config.baseCase?.results?.stooip,
                        iterations,
                        validCount: validLen,
                    };

                    resolve({ raw: results, stats, diagnostics });

                } catch (e) {
                    reject(e);
                }
            }, 50);
        });
    }

    static calculateBasicStats(data) {
        if (!data || data.length === 0) return {};
        const validData = [...data].sort((a, b) => a - b);

        const getP = (p) => validData[Math.min(Math.floor(p * validData.length), validData.length - 1)];

        const cdfPoints = [];
        const step = Math.max(1, Math.floor(validData.length / 100));
        for (let i = 0; i < validData.length; i += step) {
            cdfPoints.push({ x: validData[i], y: (i / validData.length) * 100 });
        }
        cdfPoints.push({ x: validData[validData.length - 1], y: 100 });

        return {
            p90: getP(0.1),
            p50: getP(0.5),
            p10: getP(0.9),
            mean: ss.mean(validData),
            min: validData[0],
            max: validData[validData.length - 1],
            stdDev: ss.standardDeviation(validData),
            cdf: cdfPoints,
        };
    }

    static calculateVarianceDecomposition(samples) {
        if (!samples || samples.length === 0) return [];
        // Derive the parameter set from what was actually sampled, so structural runs
        // (owc/goc/grvFactor) and analytic runs (area/thickness) both decompose correctly.
        const parameters = Object.keys(samples[0].inputs || {});
        const results = [];

        const outputs = samples.map((s) => s.targetVol);
        const varOut = ss.variance(outputs);
        if (varOut === 0) return [];

        let totalR2 = 0;
        parameters.forEach((param) => {
            const inputs = samples.map((s) => s.inputs[param]);
            if (ss.standardDeviation(inputs) > 0) {
                const r = ss.sampleCorrelation(inputs, outputs);
                const r2 = r * r;
                totalR2 += r2;
                results.push({ parameter: param, r2, r });
            }
        });
        if (totalR2 === 0) return [];

        return results.map((r) => ({
            parameter: r.parameter,
            contribution: (r.r2 / totalR2) * 100,
            impactDirection: r.r > 0 ? 1 : -1,
        })).sort((a, b) => b.contribution - a.contribution);
    }
}
