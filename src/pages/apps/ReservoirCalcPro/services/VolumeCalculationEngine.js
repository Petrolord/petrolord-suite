import { SurfaceCalculationEngine } from './SurfaceCalculationEngine';

export class VolumeCalculationEngine {
    // Physical-consistency check on the deterministic inputs. Returns human
    // warnings + a 0–100 quality score (ported from the retired QuickVol tool).
    static validateInputs(inputs) {
        const warnings = [];
        let score = 100;
        const phi = parseFloat(inputs.porosity);
        const sw = parseFloat(inputs.sw);
        const ntg = parseFloat(inputs.ntg);
        const area = parseFloat(inputs.area);
        const h = parseFloat(inputs.thickness);
        const ft = inputs.fluidType || 'oil';
        const flag = (cond, msg, penalty) => { if (cond) { warnings.push(msg); score -= penalty; } };

        flag(!(phi > 0 && phi < 1), 'Porosity should be a fraction between 0 and 1.', 20);
        flag(phi > 0.4, 'Porosity above 40% is unusually high — verify the input.', 10);
        flag(!(sw >= 0 && sw < 1), 'Water saturation should be a fraction between 0 and 1.', 20);
        flag(sw >= 1, 'Water saturation ≥ 1 leaves no hydrocarbon pore volume.', 25);
        flag(!(ntg > 0 && ntg <= 1), 'Net-to-gross should be a fraction between 0 and 1.', 15);
        flag(!(area > 0) || !(h > 0), 'Area and thickness must both be positive.', 25);
        if (ft !== 'gas') flag(!(parseFloat(inputs.fvf) >= 1), 'Oil FVF (Bo) below 1.0 rb/stb is non-physical.', 15);
        if (ft === 'gas' || ft === 'oil_gas') flag(!(parseFloat(inputs.bg) > 0), 'Gas FVF (Bg) must be positive.', 15);

        return { warnings, qualityScore: Math.max(0, Math.round(score)) };
    }

    static calculateDeterministic(inputs, unitSystem = 'field', inputMethod = 'simple', surfaces = {}) {
        const validation = this.validateInputs(inputs);
        try {
            // 1. Calculate GRV (Gross Rock Volume)
            let grv = 0; 
            let area = parseFloat(inputs.area) || 0;
            let thickness = parseFloat(inputs.thickness) || 0;
            let calculatedArea = area;

            if (inputMethod === 'simple') {
                // Simple: Area * Thickness
                grv = area * thickness;
            } else if (inputMethod === 'hybrid') {
                // Hybrid: Top Surface Area * Constant Thickness
                const topSurface = surfaces[inputs.topSurfaceId];
                if (topSurface) {
                    // Use estimated area from surface if available
                    calculatedArea = topSurface.estimatedArea || area;
                    // GRV
                    grv = calculatedArea * thickness;
                } else {
                    // Fallback if surface missing
                    console.warn("Hybrid method selected but Top Surface missing. Using manual area.");
                    grv = area * thickness;
                }
            } else if (inputMethod === 'surfaces') {
                // Surfaces: Top vs Base
                const topSurface = surfaces[inputs.topSurfaceId];
                const baseSurface = surfaces[inputs.baseSurfaceId];
                
                if (topSurface && baseSurface) {
                    // Use Surface Engine if simplified, or just diff of averages for MVP
                    // Assuming robust SurfaceCalculationEngine handles interpolation or grid diff
                    // Here we use a simplified approach for robustness:
                    const avgTop = topSurface.avgZ || 0;
                    const avgBase = baseSurface.avgZ || 0;
                    const avgThick = Math.abs(avgBase - avgTop); // Absolute diff
                    
                    calculatedArea = topSurface.estimatedArea || area;
                    grv = calculatedArea * avgThick;
                } else {
                     return { error: "Please select both Top and Base surfaces for calculation." };
                }
            }

            // 2. Petrophysics
            const ntg = parseFloat(inputs.ntg) || 1.0;
            const phi = parseFloat(inputs.porosity) || 0.2;
            const sw = parseFloat(inputs.sw) || 0.3;
            const soi = 1 - sw;

            // 3. Fluid Props
            const fluidType = inputs.fluidType || 'oil';
            const fvf = parseFloat(inputs.fvf) || 1.2; // Bo
            const bg = parseFloat(inputs.bg) || 0.005; // Bg
            
            // Recovery Factor (handle oil vs gas)
            let recovery = parseFloat(inputs.recovery) || 0;
            if ((fluidType === 'gas' || fluidType === 'oil_gas') && inputs.recoveryGas) {
                // If purely gas, use gas recovery. If both, this simplistic model might split, 
                // but usually we calc oil in place for oil fields.
                // Let's stick to primary fluid type logic.
                if (fluidType === 'gas') recovery = parseFloat(inputs.recoveryGas) || 0;
            }

            // 4. Volumetrics Calculation
            
            let stooip = 0; // Stock Tank Oil Originally In Place (or Gas)
            let recoverable = 0;
            let volumeUnit = "STB";
            let volUnit = "Ac-ft";
            let areaUnit = "Acres";
            let poreVolume = 0;   // PV (reservoir volume units)
            let hcPoreVolume = 0; // HCPV
            let giip = 0;         // gas-in-place, when applicable

            if (unitSystem === 'field') {
                // Field Units
                // Area: Acres
                // Thickness: ft
                // GRV: Acre-feet
                
                // Constants
                const OIL_CONST = 7758; // bbl/acre-ft
                const GAS_CONST = 43560; // ft3/acre-ft

                const netRockVol = grv * ntg; // Acre-ft
                const poreVol = netRockVol * phi; // Acre-ft (PV)
                const hcPoreVol = poreVol * soi; // Acre-ft (HCPV)
                poreVolume = poreVol;
                hcPoreVolume = hcPoreVol;

                if (fluidType === 'gas') {
                    // Gas: HCPV * 43560 / Bg
                    // Bg usually rcf/scf -> so divide. 
                    // If Bg is scf/rcf (Expansion factor), then multiply. 
                    // Standard input says "Gas FVF (Bg) ... rcf/scf" e.g. 0.005. So Divide.
                    const validBg = bg <= 0 ? 0.001 : bg; // Prevent div by zero
                    stooip = (hcPoreVol * GAS_CONST) / validBg; // scf
                    giip = stooip;
                    volumeUnit = "scf";
                } else {
                    // Oil: HCPV * 7758 / Bo
                    const validBo = fvf <= 0 ? 1 : fvf;
                    stooip = (hcPoreVol * OIL_CONST) / validBo; // STB
                    volumeUnit = "STB";
                }
                
                volUnit = "Ac-ft";
                areaUnit = "Acres";
            } else {
                // Metric Units
                // Area Input: km² (usually for user convenience) -> convert to m²
                // Thickness: m
                
                let areaM2 = calculatedArea;
                if (inputMethod === 'simple' || inputMethod === 'hybrid') {
                     // Assume input is km2, convert to m2
                     areaM2 = calculatedArea * 1_000_000; 
                }
                
                const grvM3 = areaM2 * thickness; // m³
                const netRockVol = grvM3 * ntg;
                const poreVol = netRockVol * phi;
                const hcPoreVol = poreVol * soi;
                poreVolume = poreVol;
                hcPoreVolume = hcPoreVol;

                if (fluidType === 'gas') {
                     const validBg = bg <= 0 ? 0.001 : bg; // rm3/sm3
                     stooip = hcPoreVol / validBg; // sm³
                     giip = stooip;
                     volumeUnit = "sm³";
                } else {
                     const validBo = fvf <= 0 ? 1 : fvf;
                     stooip = hcPoreVol / validBo; // sm³
                     volumeUnit = "sm³";
                }
                
                volUnit = "m³";
                areaUnit = "km²";
                
                // Adjust GRV for display if it's huge (maybe keep as m3)
                grv = grvM3; 
            }

            recoverable = stooip * (recovery / 100);
            const isGasFluid = fluidType === 'gas';

            // Return results object
            return {
                stooip,
                giip,
                recoverable,
                recoverableOil: isGasFluid ? 0 : recoverable,
                recoverableGas: isGasFluid ? recoverable : 0,
                grv,
                bulkVolume: grv,
                netVolume: grv * ntg,
                poreVolume,
                poreVolumeRes: poreVolume,
                hcPoreVolume,
                hcArea: calculatedArea,
                volumeUnit,
                volUnit,
                resVolUnit: volUnit,
                areaUnit,
                inputMethod,
                fluidType,
                warnings: validation.warnings,
                qualityScore: validation.qualityScore
            };

        } catch (e) {
            console.error("Calculation Error:", e);
            return { error: e.message };
        }
    }
}