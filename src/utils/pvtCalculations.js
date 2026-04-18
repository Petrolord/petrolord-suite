export const pvtCalcs = {
    /**
     * Calculate bubble point pressure using Standing's correlation.
     */
    standing_pb: (rs, api, gasGravity, temp) => {
        const yo = 141.5 / (Math.max(api, 0.1) + 131.5);
        const f_val = Math.pow(Math.max(rs, 0) / Math.max(gasGravity, 0.1), 0.83) * Math.pow(10, 0.00091 * temp - 0.0125 * api);
        return 18.2 * (f_val - 1.4);
    },

    /**
     * Calculate solution GOR using Standing's correlation.
     */
    standing_rs: (p, api, gasGravity, temp) => {
        const f_val = (Math.max(p, 0) / 18.2) + 1.4;
        if (f_val <= 0) return 0;
        const exponent = 1 / 0.83;
        const term1 = Math.pow(f_val * Math.pow(10, 0.0125 * api - 0.00091 * temp), exponent);
        return gasGravity * term1;
    },

    /**
     * Calculate oil FVF using Standing's correlation.
     */
    standing_bo: (rs, api, gasGravity, temp) => {
        const yo = 141.5 / (Math.max(api, 0.1) + 131.5);
        const f_val = Math.max(rs, 0) * Math.sqrt(Math.max(gasGravity, 0.1) / yo) + 1.25 * temp;
        return 0.9759 + 0.000120 * Math.pow(f_val, 1.2);
    },

    vasquez_beggs_rs: (p, api, gasGravity, temp, separator_p = 100) => {
        const C1 = (api <= 30) ? 0.0362 : 0.0178;
        const C2 = (api <= 30) ? 1.0937 : 1.1870;
        const C3 = (api <= 30) ? 25.724 : 23.931;

        const yh_28_96 = gasGravity * (1 + 5.912e-5 * api * temp * Math.log10(Math.max(separator_p, 1) / 114.7));
        return C1 * yh_28_96 * Math.pow(Math.max(p, 0), C2) * Math.exp(C3 * (api / (temp + 460)));
    },

    vasquez_beggs_bo: (rs, api, gasGravity, temp, separator_p = 100) => {
        const C1 = (api <= 30) ? 4.677e-4 : 4.670e-4;
        const C2 = (api <= 30) ? 1.751e-5 : 1.100e-5;
        const C3 = (api <= 30) ? -1.811e-8 : 1.337e-9;
        const yh_28_96 = gasGravity * (1 + 5.912e-5 * api * temp * Math.log10(Math.max(separator_p, 1) / 114.7));
        
        return 1 + C1*Math.max(rs, 0) + C2*(temp-60)*(api/yh_28_96) + C3*Math.max(rs, 0)*(temp-60)*(api/yh_28_96);
    },

    glaso_rs: (p, api, gasGravity, temp) => {
        const f_val = Math.pow(Math.max(p, 0), 1.1856) * Math.pow(10, -0.00396 * temp) * Math.pow(Math.max(api, 0.1), 0.2855);
        const bottom = Math.pow(10, 2.8869) * Math.pow(Math.max(gasGravity, 0.1), -1.0544);
        return gasGravity * Math.pow( f_val / bottom, 1/0.89 );
    },

    glaso_bo: (rs, api, gasGravity, temp) => {
        const yo = 141.5 / (Math.max(api, 0.1) + 131.5);
        const B_ob = Math.max(rs, 0) * Math.pow(Math.max(gasGravity, 0.1)/yo, 0.526) + 0.968 * temp;
        const log_Bo_star = -6.58511 + 2.91329*Math.log10(Math.max(B_ob, 0.1)) - 0.27683*Math.pow(Math.log10(Math.max(B_ob, 0.1)), 2);
        return Math.pow(10, log_Bo_star) + 1;
    },

    beal_cook_spillman_viscosity: (api, temp, isSaturated, gasFreeVisc, rs) => {
        const a = Math.pow(10, 0.43 + (8.33 / Math.max(api, 0.1)));
        const dead_oil_visc = (0.32 + (1.8e7 / Math.pow(Math.max(api, 0.1), 4.53))) * Math.pow( (360 / (temp + 200)), a );

        if (!isSaturated) {
            return dead_oil_visc;
        }
        
        const b = 5.44 * Math.pow(Math.max(rs, 0) + 150, -0.338) + 0.38;
        return 1.08 * Math.pow(10, b) * Math.pow(dead_oil_visc, 0.62 * Math.pow(10, -2.45 * b));
    },

    beggs_robinson_viscosity: (api, temp, isSaturated, rs) => {
        const z = 3.0324 - 0.02023 * api;
        const y = Math.pow(10, z);
        const x = y * Math.pow(temp, -1.163);
        const dead_oil_visc = Math.pow(10, x) - 1;
        
        if (!isSaturated) {
            return dead_oil_visc;
        }
        
        const a = 10.715 * Math.pow(Math.max(rs, 0) + 100, -0.515);
        const b = 5.44 * Math.pow(Math.max(rs, 0) + 150, -0.338);
        
        return a * Math.pow(Math.max(dead_oil_visc, 0.001), b);
    },

    /**
     * Generate a full PVT table based on input parameters and correlations.
     * @param {object} inputs - The input parameters object.
     * @returns {array} An array of PVT data points.
     */
    generatePvtTable: function(inputs) {
        console.log("PVT Engine: Starting generation with inputs:", inputs);
        
        const { api, gasGravity, temp, pb, correlations } = inputs;
        const pvtTable = [];
        
        // Generate a smooth pressure array from Pb up to initial pressure and down to 14.7
        const maxP = Math.max(pb + 2000, 6000);
        const pressureSteps = [];
        for (let p = maxP; p >= 14.7; p -= (p > 1000 ? 500 : 250)) {
            pressureSteps.push(p);
        }
        if (!pressureSteps.includes(pb)) pressureSteps.push(pb);
        if (!pressureSteps.includes(14.7)) pressureSteps.push(14.7);
        pressureSteps.sort((a,b) => b - a);

        for (const p of pressureSteps) {
            let rs, bo, muo;
            const isSaturated = p <= pb;

            try {
                // --- Rs and Bo Calculations ---
                if (correlations.pb_rs_bo === 'standing') {
                    rs = isSaturated ? pvtCalcs.standing_rs(p, api, gasGravity, temp) : pvtCalcs.standing_rs(pb, api, gasGravity, temp);
                    bo = pvtCalcs.standing_bo(rs, api, gasGravity, temp);
                } else if (correlations.pb_rs_bo === 'vasquez_beggs') {
                    rs = isSaturated ? pvtCalcs.vasquez_beggs_rs(p, api, gasGravity, temp) : pvtCalcs.vasquez_beggs_rs(pb, api, gasGravity, temp);
                    bo = pvtCalcs.vasquez_beggs_bo(rs, api, gasGravity, temp);
                } else { 
                    rs = isSaturated ? pvtCalcs.glaso_rs(p, api, gasGravity, temp) : pvtCalcs.glaso_rs(pb, api, gasGravity, temp);
                    bo = pvtCalcs.glaso_bo(rs, api, gasGravity, temp);
                }

                // Adjust undersaturated Bo slightly for compressibility
                if (!isSaturated) {
                    const co = 1.5e-5; // typical oil compressibility 1/psi
                    bo = bo * Math.exp(-co * (p - pb));
                }

                // --- Oil Viscosity Calculation ---
                if (correlations.viscosity === 'beal_cook_spillman') {
                    muo = pvtCalcs.beal_cook_spillman_viscosity(api, temp, isSaturated, null, rs);
                } else {
                    muo = pvtCalcs.beggs_robinson_viscosity(api, temp, isSaturated, rs);
                }

                // Simplified Gas FVF & Viscosity
                const Z = 0.9; // Constant Z-factor assumption
                const bg = p > 0 ? (0.02827 * Z * (temp + 460) / p) : 0;
                const mug = 0.015 + 1e-5 * p; // simplified gas viscosity correlation

                pvtTable.push({
                    pressure: Math.round(p),
                    Rs: isNaN(rs) ? 0 : Math.max(0, Number(rs.toFixed(2))),
                    Bo: isNaN(bo) ? 1.0 : Number(bo.toFixed(4)),
                    Bg: isNaN(bg) ? 0.0 : Number(bg.toFixed(5)),
                    mu_o: isNaN(muo) ? 1.0 : Number(muo.toFixed(3)),
                    mu_g: isNaN(mug) ? 0.02 : Number(mug.toFixed(4)),
                });
            } catch (err) {
                console.error(`PVT Engine Error at pressure ${p}:`, err);
                // Push a zeroed row to avoid breaking the chart completely
                pvtTable.push({
                    pressure: Math.round(p), Rs: 0, Bo: 1.0, Bg: 0, mu_o: 1.0, mu_g: 0.02
                });
            }
        }

        const sortedTable = pvtTable.sort((a,b) => b.pressure - a.pressure);
        console.log(`PVT Engine: Successfully generated ${sortedTable.length} points.`);
        return sortedTable;
    },
};