// The math primitives live in the canonical Suite Monte Carlo module
// (src/lib/monteCarlo.js, extracted from this engine). This class keeps its
// static API for existing callers and delegates every primitive there; only
// the volumetrics-specific runSimulation stays local.
import * as mc from '@/lib/monteCarlo';

export class MonteCarloEngine {

    static cholesky(matrix) {
        return mc.cholesky(matrix);
    }

    static randomNormal() {
        return mc.randomNormal();
    }

    static erf(x) {
        return mc.erf(x);
    }

    static normalCDF(x) {
        return mc.normalCDF(x);
    }

    static triInvCDF(u, a, c, b) {
        return mc.triInvCDF(u, a, c, b);
    }

    static isVariable(dist) {
        return mc.isVariable(dist);
    }

    static representativeValue(dist) {
        return mc.representativeValue(dist);
    }

    static marginalValue(dist, x) {
        return mc.marginalValue(dist, x);
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
        return mc.basicStats(data);
    }

    static calculateVarianceDecomposition(samples) {
        return mc.varianceDecomposition(samples);
    }
}
