// The math primitives live in the canonical Suite Monte Carlo module
// (src/lib/monteCarlo.js, extracted from this engine). This class keeps its
// static API for existing callers and delegates every primitive there; only
// the volumetrics-specific runSimulation stays local.
import * as mc from '@/lib/monteCarlo';
import { asHypsometry } from './hypsometry';

const CLAMP_LABEL = { ntg: 'net-to-gross', porosity: 'porosity', sw: 'water saturation', gasCapFraction: 'the gas-cap fraction' };
const BBL_PER_SM3 = 6.289811;
const SCF_PER_SM3 = 35.3147;

/** Barrels of oil equivalent of an oil and a gas volume (6 Mscf per boe). */
export function toBoe(oil, gas, isField) {
    const oilBbl = isField ? oil : oil * BBL_PER_SM3;
    const gasScf = isField ? gas : gas * SCF_PER_SM3;
    return oilBbl + gasScf / 6000;
}

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

    /**
     * The volumetric Monte Carlo itself, synchronous (U2-006). The page's
     * runSimulation and the Web Worker both call this one function, so a
     * run in the worker is the canonical engine, not a copy of it.
     * @param {Object} config  as runSimulation; `seed` (integer) makes the run reproducible
     * @param {Object} inputs  distributions per key
     * @param {{rng?: Function, onProgress?: (done:number, total:number) => void, progressEvery?: number}} [opts]
     */
    static simulate(config, inputs, opts = {}) {
        const iterations = Math.max(100, Math.floor(config.iterations || 10000));
        const results = { stooip: [], giip: [], grv: [], recOil: [], recGas: [], recBoe: [], samples: [] };
        const diagnostics = { rejectedCount: 0, outOfBounds: [], warnings: [], tracking: {}, clamped: {}, gocBelowOwc: 0 };
        const noteClamp = (key) => { diagnostics.clamped[key] = (diagnostics.clamped[key] || 0) + 1; };

        // Structural mode: GRV comes from integrating the top surface against
        // sampled fluid contacts (via a precomputed hypsometric curve), so the
        // geometric uncertainty lives in the CONTACTS + an optional GRV factor —
        // area and thickness are consequences of the structure, not free inputs.
        const hyps = asHypsometry(config.hypsometry);
        const structural = config.grvMode === 'structural' && !!hyps;
        // U2-006: one random stream per run. A seed makes it reproducible
        // (the worker and the page give the same realizations); without
        // one the stream is Math.random, as before.
        const seed = Number.isFinite(Number(config.seed)) && config.seed !== null && config.seed !== '' ? (Number(config.seed) >>> 0) : null;
        const rng = opts.rng || (seed !== null ? mc.mulberry32(seed) : Math.random);
        const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
        const progressEvery = Math.max(1, Math.floor(opts.progressEvery || 2000));

        // Identify the active uncertainty variables (any spread distribution).
        // U1: the recovery factors (percent) and, for the analytic oil+gas
        // split, the gas-cap fraction are uncertainties too (RCP-U1-003,
        // RCP-U1-014); constants when the caller passes no spread.
        const params = structural
            ? ['owc', 'goc', 'grvFactor', 'porosity', 'sw', 'fvf', 'bg', 'ntg', 'recovery', 'recoveryGas']
            : ['area', 'thickness', 'porosity', 'sw', 'fvf', 'bg', 'ntg', 'gasCapFraction', 'recovery', 'recoveryGas'];
        const varKeys = params.filter((p) => this.isVariable(inputs[p]));
        const nVars = varKeys.length;
        const clamp01 = (v) => Math.min(1, Math.max(0, v));

        if (inputs.pore_volume && inputs.porosity) {
            diagnostics.warnings.push('Double Counting Warning: Both Porosity and Pore Volume are active uncertainties.');
        }

        // Analytic oil+gas: split GRV by the gas-cap fraction (mirrors
        // VolumeCalculationEngine) so oil and gas never share pore volume.
        // A sampled gas-cap fraction (inputs.gasCapFraction as a
        // distribution) wins over the deterministic one in config.
        const gcfSampled = !structural && this.isVariable(inputs.gasCapFraction);
        const gcfRep = this.representativeValue(inputs.gasCapFraction);
        const gcf = parseFloat(gcfSampled || Number.isFinite(gcfRep) ? gcfRep : config.gasCapFraction);
        const gcfValid = gcfSampled || (gcf > 0 && gcf < 1);
        let fracOil = 1, fracGas = 0;
        if (config.fluidType === 'gas') { fracOil = 0; fracGas = 1; }
        else if (config.fluidType === 'oil_gas') {
            if (gcfValid) { fracGas = gcf; fracOil = 1 - gcf; }
            else if (!structural) {
                diagnostics.warnings.push('Oil+gas without a gas-cap fraction is modelled as undersaturated oil (GIIP = 0). Set a gas-cap fraction of GRV, or run a structural study with a GOC.');
            }
        }
        const recoveryDefault = { oil: parseFloat(config.recovery), gas: parseFloat(config.recoveryGas) };

        // Correlation matrix (identity + domain-knowledge / caller-supplied entries).
        const C = Array(nVars).fill(0).map(() => Array(nVars).fill(0));
        for (let i = 0; i < nVars; i++) C[i][i] = 1.0;
        const setCorr = (a, b, rho) => {
            const ia = varKeys.indexOf(a), ib = varKeys.indexOf(b);
            if (ia >= 0 && ib >= 0) { C[ia][ib] = rho; C[ib][ia] = rho; }
        };
        // U2-002: the correlations are the user's list when one is given
        // (the editor starts from porosity-Sw -0.8); with none, the
        // long-standing default holds (porosity rises as Sw falls).
        const userCorr = Array.isArray(config.correlations);
        const pairs = userCorr ? config.correlations : [{ a: 'porosity', b: 'sw', rho: -0.8 }];
        const applied = [];
        for (const { a, b, rho } of pairs) {
            const r = Number(rho);
            if (!Number.isFinite(r) || r <= -1 || r >= 1) {
                if (userCorr) throw new Error(`The correlation of ${a} with ${b} must be between -1 and 1 (not inclusive); it is ${rho}.`);
                continue;
            }
            if (a === b) {
                if (userCorr) throw new Error(`A variable cannot be correlated with itself (${a}).`);
                continue;
            }
            if (varKeys.indexOf(a) < 0 || varKeys.indexOf(b) < 0) {
                if (userCorr && r !== 0) diagnostics.warnings.push(`The correlation of ${a} with ${b} (${r}) was not applied: ${varKeys.indexOf(a) < 0 ? a : b} has no spread in this run.`);
                continue;
            }
            setCorr(a, b, r);
            applied.push({ a, b, rho: r });
        }
        // a matrix that is not positive semidefinite is refused, not clamped
        const corrProblem = mc.correlationMatrixProblem(C, varKeys);
        if (corrProblem) throw new Error(corrProblem);
        const L = this.cholesky(C);

        const isField = config.unitSystem === 'field';
        // Field: acre-ft × 7758 → STB, × 43560 → scf. Metric: area(km²)·thick(m)
        // × 1e6 → m³, then / Bo|Bg → sm³ (mirrors VolumeCalculationEngine).
        const oilFactor = isField ? 7758 : 1_000_000;
        const gasFactor = isField ? 43560 : 1_000_000;

        for (let i = 0; i < iterations; i++) {
            if (onProgress && i > 0 && i % progressEvery === 0) onProgress(i, iterations);
            // Correlated standard normals X = L · Z
            const Z = Array.from({ length: nVars }, () => mc.randomNormal(rng));
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
            // Physical [0,1] clamps (no negative HCPV); every clamp is
            // counted so the result can say how often it happened.
            const clampNoted = (key, dflt) => {
                const raw = resolve1(key, dflt);
                const v = clamp01(raw);
                if (v !== raw) noteClamp(key);
                return v;
            };
            const ntg = clampNoted('ntg', 1.0);
            const phi = clampNoted('porosity', 0.20);
            const sw = clampNoted('sw', 0.30);
            const fvf = resolve1('fvf', 1.2);
            const bg = resolve1('bg', 0.005);
            const rfOil = Math.min(100, Math.max(0, resolve1('recovery', Number.isFinite(recoveryDefault.oil) ? recoveryDefault.oil : 0)));
            const rfGas = Math.min(100, Math.max(0, resolve1('recoveryGas', Number.isFinite(recoveryDefault.gas) ? recoveryDefault.gas : 0)));

            if (isRejected) {
                diagnostics.rejectedCount++;
                continue;
            }

            let grv, stooip = 0, giip = 0, sampleInputs;
            if (structural) {
                // GRV per zone from the hypsometric curve, using sampled contacts.
                const owc = resolve1('owc', config.deterministicContacts?.owc);
                let goc = resolve1('goc', config.deterministicContacts?.goc);
                // RCP-U1-007: a sampled GOC below the sampled OWC would put
                // gas under the water leg; the gas cap stops at the OWC
                // (no oil leg) and the run counts how often that happened.
                if (config.fluidType === 'oil_gas' && Number.isFinite(goc) && Number.isFinite(owc) && goc < owc) {
                    goc = owc;
                    diagnostics.gocBelowOwc++;
                }
                const grvFactor = Math.max(0, resolve1('grvFactor', 1));
                const { grvOil, grvGas } = hyps.zoneVolumes(config.fluidType, owc, goc);
                // RCP-U1-012: the deepest contact below the shallowest
                // edge of the mapped surface leaves the closure open
                const edge = hyps.edgeElevation;
                const deepest = config.fluidType === 'gas' ? (Number.isFinite(goc) ? goc : owc) : owc;
                if (Number.isFinite(edge) && Number.isFinite(deepest) && deepest < edge) diagnostics.openRealizations = (diagnostics.openRealizations || 0) + 1;
                // U2-008: a sampled contact below the spill point fills to the spill
                if (hyps.belowSpill && hyps.belowSpill(deepest)) diagnostics.filledToSpill = (diagnostics.filledToSpill || 0) + 1;
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
                let fOil = fracOil, fGas = fracGas;
                if (gcfSampled && config.fluidType === 'oil_gas') {
                    const g = resolve1('gasCapFraction', gcf);
                    const gc = Math.min(1, Math.max(0, g));
                    if (gc !== g) noteClamp('gasCapFraction');
                    fGas = gc; fOil = 1 - gc;
                }
                if (fOil > 0) stooip = (hcpv * fOil * oilFactor) / (fvf > 0 ? fvf : 1);
                if (fGas > 0) giip = (hcpv * fGas * gasFactor) / (bg > 0 ? bg : 0.001);
                sampleInputs = { area, thickness, ntg, phi, sw, fvf, bg, ...(gcfSampled ? { gasCapFraction: fGas } : {}) };
            }
            const targetVol = config.fluidType === 'gas' ? giip : stooip;
            if (sampleVals.recovery !== undefined) sampleInputs.recovery = rfOil;
            if (sampleVals.recoveryGas !== undefined) sampleInputs.recoveryGas = rfGas;
            // Recoverable volumes per realisation (RCP-U1-003): the
            // prospective-resource basis PRMS and the valuation read.
            const recOil = config.fluidType === 'gas' ? 0 : stooip * rfOil / 100;
            const recGas = giip * rfGas / 100;

            results.stooip.push(stooip);
            results.giip.push(giip);
            results.grv.push(grv);
            results.recOil.push(recOil);
            results.recGas.push(recGas);
            results.recBoe.push(toBoe(recOil, recGas, isField));
            results.samples.push({ index: i, targetVol, inputs: sampleInputs });
        }

        // RCP-U1-009: the run carries what it was computed under, so a
        // later unit or fluid toggle cannot relabel its numbers.
        const meta = {
            unitSystem: isField ? 'field' : 'metric',
            fluidType: config.fluidType || 'oil',
            grvMode: structural ? 'structural' : 'analytic',
            iterations,
            ranAt: new Date().toISOString(),
            signature: config.signature || null,
            seed,
            correlations: applied,
            boeBasis: '6 Mscf per boe',
        };
        if (onProgress) onProgress(iterations, iterations);

        if (results.samples.length === 0) {
            diagnostics.warnings.push('No valid realizations were generated. Check the distribution bounds.');
            return { raw: results, stats: { stooip: {}, giip: {}, sensitivity: [] }, diagnostics, meta };
        }

        for (const [key, n] of Object.entries(diagnostics.clamped)) {
            diagnostics.warnings.push(`${n.toLocaleString('en-US')} of ${iterations.toLocaleString('en-US')} realizations drew ${CLAMP_LABEL[key] || key} outside 0 to 1 and were held at the bound; the distribution is truncated there. Narrow it or add Min/Max bounds.`);
        }
        if (diagnostics.openRealizations) {
            diagnostics.warnings.push(`${diagnostics.openRealizations.toLocaleString('en-US')} of ${iterations.toLocaleString('en-US')} realizations put the contact below the shallowest edge of the mapped surface (${Math.round(hyps.edgeElevation).toLocaleString('en-US')} TVDSS): the closure is open there, so those volumes are minimums, not trap volumes.`);
        }
        if (diagnostics.filledToSpill) {
            diagnostics.warnings.push(`${diagnostics.filledToSpill.toLocaleString('en-US')} of ${iterations.toLocaleString('en-US')} realizations drew the contact below the spill point (${Math.round(hyps.spillElevation).toLocaleString('en-US')} TVDSS); the trap was filled to the spill point in those.`);
        }
        if (diagnostics.gocBelowOwc) {
            diagnostics.warnings.push(`${diagnostics.gocBelowOwc.toLocaleString('en-US')} realizations drew the GOC below the OWC; the gas cap was stopped at the OWC (no oil leg) in those. Check that the contact ranges do not overlap.`);
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

        const stats = {
            stooip: this.calculateBasicStats(results.stooip),
            giip: this.calculateBasicStats(results.giip),
            recoverableOil: this.calculateBasicStats(results.recOil),
            recoverableGas: this.calculateBasicStats(results.recGas),
            recoverableBoe: this.calculateBasicStats(results.recBoe),
            sensitivity: this.calculateVarianceDecomposition(results.samples),
            baseCaseValue: config.fluidType === 'gas' ? config.baseCase?.results?.giip : config.baseCase?.results?.stooip,
            iterations,
            validCount: validLen,
        };

        return { raw: results, stats, diagnostics, meta };
    }

    static async runSimulation(config, inputs, onProgress) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    const res = this.simulate(config, inputs);
                    if (typeof onProgress === 'function') onProgress(100);
                    resolve(res);
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
