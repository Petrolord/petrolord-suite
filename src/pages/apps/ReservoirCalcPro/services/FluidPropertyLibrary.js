/**
 * Standard fluid property correlations and presets.
 * Includes Vasquez-Beggs, Standing, and industry standard presets.
 */

export const FLUID_PRESETS = {
    oil: {
        light: { name: "Light Oil (>35 API)", api: 40, gasGravity: 0.65, rs: 500, temp: 180, bo: 1.25, viscosity: 0.8 },
        medium: { name: "Medium Oil (25-35 API)", api: 30, gasGravity: 0.7, rs: 300, temp: 160, bo: 1.15, viscosity: 2.5 },
        heavy: { name: "Heavy Oil (<25 API)", api: 20, gasGravity: 0.75, rs: 100, temp: 140, bo: 1.05, viscosity: 10.0 }
    },
    gas: {
        dry: { name: "Dry Gas", gasGravity: 0.6, temp: 180, bg: 0.005, zFactor: 0.9, yield: 0 },
        wet: { name: "Wet Gas", gasGravity: 0.75, temp: 200, bg: 0.0045, zFactor: 0.85, yield: 20 },
        condensate: { name: "Gas Condensate", gasGravity: 0.85, temp: 220, bg: 0.004, zFactor: 0.8, yield: 100 }
    }
};

export class FluidPropertyCalculator {
    /**
     * Calculate Oil FVF (Bo) using Standing's Correlation
     * @param {number} rs - Solution Gas-Oil Ratio (scf/stb)
     * @param {number} gasGravity - Specific gravity of gas (air=1)
     * @param {number} oilApi - Oil gravity (API)
     * @param {number} tempF - Temperature (Fahrenheit)
     * @returns {number} Bo (rb/stb)
     */
    static calculateBo(rs, gasGravity, oilApi, tempF) {
        if (!rs || !gasGravity || !oilApi || !tempF) return 1.2; // Default fallback
        
        const oilSg = 141.5 / (131.5 + oilApi);
        // Standing (1947): F = Rs·(γg/γo)^0.5 + 1.25·T ;  Bo = 0.9759 + 0.00012·F^1.2
        // (previously an extra ^0.5 wrapped the whole Rs·√(γg/γo) term, under-predicting Bo).
        const f = rs * Math.sqrt(gasGravity / oilSg) + 1.25 * tempF;
        const bo = 0.9759 + 0.00012 * Math.pow(f, 1.2);
        return Math.max(1.0, parseFloat(bo.toFixed(4)));
    }

    /**
     * Calculate Gas FVF (Bg) using Ideal Gas Law approximation with Z-factor
     * @param {number} pressure - Reservoir Pressure (psi)
     * @param {number} tempF - Temperature (Fahrenheit)
     * @param {number} z - Z-factor (compressibility factor)
     * @returns {number} Bg (rcf/scf) - Note: output is usually very small, or converted to bbl/mscf
     */
    static calculateBg(pressure, tempF, z = 0.9) {
        if (!pressure || !tempF) return 0.005; // Default fallback
        
        const tempRankine = tempF + 459.67;
        const pStd = 14.7;
        const tStd = 520; // 60F in Rankine
        
        // Bg = (Pstd / Tstd) * (z * T / P)
        // Result in res vol / std vol
        const bg = (pStd / tStd) * (z * tempRankine / pressure);
        return parseFloat(bg.toFixed(6));
    }
}