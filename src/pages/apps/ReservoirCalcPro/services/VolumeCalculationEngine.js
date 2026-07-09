import { ContactVolumetricsEngine } from './ContactVolumetricsEngine';

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

    static calculateDeterministic(inputs, unitSystem = 'field', inputMethod = 'simple', surfaces = {}, opts = {}) {
        const validation = this.validateInputs(inputs);

        // Structural methods (top + constant thickness, or top + base) delegate to the
        // rigorous grid-integration engine: GRV is integrated cell-by-cell against the
        // fluid contacts, in the surface's true coordinate units. This is what makes
        // OWC/GOC actually move the volume (the old path ignored contacts entirely and
        // multiplied a bounding box by a mean thickness).
        if (inputMethod === 'hybrid' || inputMethod === 'surfaces') {
            const topSurface = surfaces[inputs.topSurfaceId];
            if (!topSurface) return { error: 'Select a Top structural surface for this input method.' };
            const baseSurface = inputMethod === 'surfaces' ? surfaces[inputs.baseSurfaceId] : null;
            if (inputMethod === 'surfaces' && !baseSurface) {
                return { error: 'Please select both Top and Base surfaces for calculation.' };
            }

            const res = ContactVolumetricsEngine.calculate({
                topSurface,
                baseSurface,
                constantThickness: inputMethod === 'hybrid' ? parseFloat(inputs.thickness) : null,
                inputs,
                unitSystem,
                aoiPolygon: opts.aoiPolygon || null,
                options: opts.contactOptions || {}
            });
            if (res.error) return res;
            return {
                ...res,
                inputMethod,
                warnings: [...(res.warnings || []), ...validation.warnings],
                qualityScore: validation.qualityScore
            };
        }

        try {
            // Simple (analytic) method: Area × Thickness with no structural geometry.
            // Contacts cannot apply here — there is no depth reference — so the whole
            // column is treated as hydrocarbon. Use a structural method for contacts.
            let grv = 0;
            let area = parseFloat(inputs.area) || 0;
            let thickness = parseFloat(inputs.thickness) || 0;
            let calculatedArea = area;
            grv = area * thickness;

            // 2. Petrophysics
            const ntg = parseFloat(inputs.ntg) || 1.0;
            const phi = parseFloat(inputs.porosity) || 0.2;
            const sw = parseFloat(inputs.sw) || 0.3;
            const soi = 1 - sw;

            // 3. Fluid Props
            const fluidType = inputs.fluidType || 'oil';
            const fvf = parseFloat(inputs.fvf) || 1.2; // Bo
            const bg = parseFloat(inputs.bg) || 0.005; // Bg
            
            // Recovery factors — oil and gas are recovered independently (below),
            // so both are read here rather than collapsing to a single figure.
            const oilRecovery = parseFloat(inputs.recovery) || 0;
            const gasRecovery = parseFloat(inputs.recoveryGas) || 0;

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

                // Bg is rcf/scf (e.g. 0.005) so we divide. Oil and gas draw on the
                // same HCPV for oil_gas — a saturated single-cell simplification that
                // matches MonteCarloEngine, not a contact-split gas-cap model.
                const validBo = fvf <= 0 ? 1 : fvf;
                const validBg = bg <= 0 ? 0.001 : bg; // guard div-by-zero
                if (fluidType === 'oil' || fluidType === 'oil_gas') {
                    stooip = (hcPoreVol * OIL_CONST) / validBo; // STB
                    volumeUnit = "STB";
                }
                if (fluidType === 'gas' || fluidType === 'oil_gas') {
                    giip = (hcPoreVol * GAS_CONST) / validBg; // scf
                    if (fluidType === 'gas') {
                        stooip = giip; // pure gas: primary target mirrors GIIP
                        volumeUnit = "scf";
                    }
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

                const validBo = fvf <= 0 ? 1 : fvf;
                const validBg = bg <= 0 ? 0.001 : bg; // rm³/sm³, guard div-by-zero
                if (fluidType === 'oil' || fluidType === 'oil_gas') {
                     stooip = hcPoreVol / validBo; // sm³
                     volumeUnit = "sm³";
                }
                if (fluidType === 'gas' || fluidType === 'oil_gas') {
                     giip = hcPoreVol / validBg; // sm³
                     if (fluidType === 'gas') {
                         stooip = giip; // pure gas: primary target mirrors GIIP
                         volumeUnit = "sm³";
                     }
                }

                volUnit = "m³";
                areaUnit = "km²";
                
                // Adjust GRV for display if it's huge (maybe keep as m3)
                grv = grvM3; 
            }

            const isGasFluid = fluidType === 'gas';
            const hasOil = fluidType === 'oil' || fluidType === 'oil_gas';
            const hasGas = fluidType === 'gas' || fluidType === 'oil_gas';

            // Pure gas carries its volume in `stooip` (the primary target); oil and
            // oil+gas recover oil from STOOIP and gas from GIIP independently.
            const recoverableOil = hasOil ? stooip * (oilRecovery / 100) : 0;
            const recoverableGas = isGasFluid
                ? stooip * (gasRecovery / 100)
                : (hasGas ? giip * (gasRecovery / 100) : 0);
            recoverable = isGasFluid ? recoverableGas : recoverableOil;

            // Return results object. `inputs`/`unitSystem` are echoed back so the
            // results tables can render the case parameters without reaching into
            // live context state (which may have drifted since calculation).
            return {
                stooip,
                giip,
                recoverable,
                recoverableOil,
                recoverableGas,
                grv,
                grvOil: hasOil ? grv : 0,
                grvGas: hasGas ? grv : 0,
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
                unitSystem,
                inputs: {
                    ntg,
                    porosity: phi,
                    sw,
                    fvf,
                    bg,
                    recovery: parseFloat(inputs.recovery) || 0,
                    recoveryGas: parseFloat(inputs.recoveryGas) || 0,
                    owc: inputs.owc,
                    goc: inputs.goc,
                    fluidType
                },
                warnings: validation.warnings,
                qualityScore: validation.qualityScore
            };

        } catch (e) {
            console.error("Calculation Error:", e);
            return { error: e.message };
        }
    }
}