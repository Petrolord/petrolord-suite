import * as ss from 'simple-statistics';

export class MonteCarloEngine {
    
    // Lightweight Cholesky decomposition
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
                    L[i][j] = (1.0 / L[j][j]) * (matrix[i][j] - sum);
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

    // Normal CDF approx (logistic)
    static normalCDF(x) {
        return 1 / (1 + Math.exp(-1.702 * x));
    }

    // Triangular inverse CDF
    static triInvCDF(u, a, c, b) {
        if (a === b) return a;
        if (u <= (c - a) / (b - a)) return a + Math.sqrt(u * (b - a) * (c - a));
        return b - Math.sqrt((1 - u) * (b - a) * (b - c));
    }

    static async runSimulation(config, inputs, onProgress) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    const iterations = config.iterations || 10000;
                    const results = { stooip: [], giip: [], grv: [], samples: [] };
                    const diagnostics = { rejectedCount: 0, outOfBounds: [], warnings: [], tracking: {} };

                    console.log("[MC] Starting Run. Consistency Mode:", config.consistencyMode);
                    
                    // Identify Variables
                    const params = ['area', 'thickness', 'porosity', 'sw', 'fvf', 'bg', 'ntg'];
                    const varKeys = params.filter(p => inputs[p] && inputs[p].type === 'triangular');
                    const nVars = varKeys.length;

                    // Double counting check (e.g., if user inputs pore volume directly instead of phi)
                    // (Simplified logic: if inputs had 'pore_volume', we'd warn against using 'porosity').
                    if (inputs.pore_volume && inputs.porosity) {
                        diagnostics.warnings.push("Double Counting Warning: Both Porosity and Pore Volume are active uncertainties.");
                        console.warn("[MC] Double counting detected.");
                    }

                    // Setup Correlation Matrix (n x n)
                    const C = Array(nVars).fill(0).map(() => Array(nVars).fill(0));
                    for (let i = 0; i < nVars; i++) C[i][i] = 1.0;

                    // Automatic Domain Knowledge Correlations
                    const idxPhi = varKeys.indexOf('porosity');
                    const idxSw = varKeys.indexOf('sw');
                    if (idxPhi >= 0 && idxSw >= 0) {
                        C[idxPhi][idxSw] = -0.8;
                        C[idxSw][idxPhi] = -0.8;
                    }
                    
                    const L = this.cholesky(C);

                    const isField = config.unitSystem === 'field';
                    const oilFactor = isField ? 7758 : 1000000; 
                    const gasFactor = isField ? 43560 : 1000000;

                    for (let i = 0; i < iterations; i++) {
                        // 1. Generate independent normals
                        const Z = Array(nVars).fill(0).map(() => this.randomNormal());
                        
                        // 2. Correlate normals X = L * Z
                        const X = Array(nVars).fill(0);
                        for (let r = 0; r < nVars; r++) {
                            for (let c = 0; c <= r; c++) {
                                X[r] += L[r][c] * Z[c];
                            }
                        }

                        // 3. Transform to uniform and then triangular
                        const sampleVals = {};
                        let isRejected = false;

                        for (let v = 0; v < nVars; v++) {
                            const key = varKeys[v];
                            const U = this.normalCDF(X[v]);
                            const dist = inputs[key];
                            const val = this.triInvCDF(U, dist.min, dist.mode, dist.max);
                            
                            // Bounds Check Validation
                            if (val < dist.min || val > dist.max) {
                                isRejected = true;
                                if (diagnostics.outOfBounds.length < 10) {
                                    diagnostics.outOfBounds.push({ iter: i, key, val, bounds: [dist.min, dist.max] });
                                }
                            }
                            sampleVals[key] = val;
                        }

                        // Constants mapped
                        const area = sampleVals.area || inputs.area?.value || 1000;
                        const thickness = sampleVals.thickness || inputs.thickness?.value || 50;
                        const ntg = sampleVals.ntg || inputs.ntg?.value || 1.0;
                        const phi = sampleVals.porosity || inputs.porosity?.value || 0.20;
                        const sw = sampleVals.sw || inputs.sw?.value || 0.30;
                        const fvf = sampleVals.fvf || inputs.fvf?.value || 1.2;
                        const bg = sampleVals.bg || inputs.bg?.value || 0.005;

                        if (isRejected) {
                            diagnostics.rejectedCount++;
                            continue; // skip rejected
                        }

                        // Calculate Volumes
                        const grv = area * thickness;
                        const poreVol = grv * ntg * phi;
                        const hcpv = poreVol * (1 - sw);

                        let stooip = 0;
                        let giip = 0;

                        if (config.fluidType === 'oil' || config.fluidType === 'oil_gas') {
                            stooip = (hcpv * oilFactor) / (fvf > 0 ? fvf : 1);
                        }
                        if (config.fluidType === 'gas' || config.fluidType === 'oil_gas') {
                            giip = (hcpv * gasFactor) / (bg > 0 ? bg : 0.001);
                        }

                        const targetVol = config.fluidType === 'gas' ? giip : stooip;

                        results.stooip.push(stooip);
                        results.giip.push(giip);
                        results.grv.push(grv);
                        
                        results.samples.push({
                            index: i,
                            targetVol,
                            inputs: { area, thickness, ntg, phi, sw, fvf, bg }
                        });
                    }

                    const rejectionRate = (diagnostics.rejectedCount / iterations) * 100;
                    if (rejectionRate > 5) {
                        diagnostics.warnings.push(`High rejection rate: ${rejectionRate.toFixed(2)}% of samples exceeded bounds or limits.`);
                    }

                    // Sort to find percentiles & their exact realizations
                    results.samples.sort((a, b) => a.targetVol - b.targetVol);
                    const validLen = results.samples.length;
                    
                    const p90Realization = results.samples[Math.floor(0.1 * validLen)];
                    const p50Realization = results.samples[Math.floor(0.5 * validLen)];
                    const p10Realization = results.samples[Math.floor(0.9 * validLen)];

                    diagnostics.tracking = {
                        P90: p90Realization,
                        P50: p50Realization,
                        P10: p10Realization
                    };

                    console.log("[MC] First 3 Samples: ", results.samples.slice(0,3));

                    const stats = {
                        stooip: this.calculateBasicStats(results.stooip),
                        giip: this.calculateBasicStats(results.giip),
                        sensitivity: this.calculateVarianceDecomposition(results.samples),
                        baseCaseValue: config.fluidType === 'gas' ? config.baseCase?.results?.giip : config.baseCase?.results?.stooip
                    };

                    resolve({ raw: results, stats, diagnostics });

                } catch (e) {
                    console.error("[MC] Engine Error:", e);
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
            cdf: cdfPoints
        };
    }

    static calculateVarianceDecomposition(samples) {
        if (!samples || samples.length === 0) return [];
        const parameters = ['area', 'thickness', 'ntg', 'phi', 'sw', 'fvf', 'bg'];
        const results = [];

        const outputs = samples.map(s => s.targetVol); 
        const varOut = ss.variance(outputs);
        if (varOut === 0) return [];

        let totalR2 = 0;
        parameters.forEach(param => {
            const inputs = samples.map(s => s.inputs[param]);
            if (ss.standardDeviation(inputs) > 0) {
                const r = ss.sampleCorrelation(inputs, outputs);
                const r2 = r * r;
                totalR2 += r2;
                results.push({ parameter: param, r2, r });
            }
        });

        // Normalize to % contribution
        return results.map(r => ({
            parameter: r.parameter,
            contribution: (r.r2 / totalR2) * 100,
            impactDirection: r.r > 0 ? 1 : -1
        })).sort((a, b) => b.contribution - a.contribution);
    }
}