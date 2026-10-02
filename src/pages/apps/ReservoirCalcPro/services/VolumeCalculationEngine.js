import { ContactVolumetricsEngine, condensateFrom } from './ContactVolumetricsEngine';
import { checkAreaDepthRows, areaDepthHypsometry } from './areaDepth';
import { solutionGasFrom, applySaturationHeight } from './hydrocarbons';
import { provenanceLines } from './emProvenance';

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
        flag(!(sw >= 0 && sw < 1), 'Water saturation should be a fraction between 0 and 1 (Sw ≥ 1 leaves no hydrocarbon pore volume).', 20);
        flag(!(ntg > 0 && ntg <= 1), 'Net-to-gross should be a fraction between 0 and 1.', 15);
        flag(!(area > 0) || !(h > 0), 'Area and thickness must both be positive.', 25);
        if (ft !== 'gas') flag(!(parseFloat(inputs.fvf) >= 1), 'Oil FVF (Bo) below 1.0 rb/stb is non-physical.', 15);
        if (ft === 'gas' || ft === 'oil_gas') {
            const bgVal = parseFloat(inputs.bg);
            flag(!(bgVal > 0), 'Gas FVF (Bg) must be positive.', 15);
            // Typical Bg is 0.002–0.05 rcf/scf. A value ~100× larger usually means an
            // rb/Mscf number was entered without selecting that unit.
            flag(bgVal > 0.1, 'Gas FVF above 0.1 rcf/scf (rm³/sm³) is non-physical for most reservoirs. If your PVT report quotes Bg in rb/Mscf or rb/scf, select that unit so it converts correctly.', 10);
        }
        if (ft === 'oil_gas') {
            const gcf = parseFloat(inputs.gasCapFraction);
            flag(isFinite(gcf) && !(gcf >= 0 && gcf < 1), 'Gas-cap fraction must be a fraction between 0 and 1 of GRV.', 10);
        }

        return { warnings, qualityScore: Math.max(0, Math.round(score)) };
    }

    /**
     * U2-001: volumes from an area/depth table (inputs.areaDepth.rows) and
     * the contacts, through the same hypsometry the Monte Carlo samples.
     */
    static fromAreaDepth(inputs, unitSystem = 'field') {
        const chk = checkAreaDepthRows(inputs.areaDepth?.rows || []);
        if (!chk.ok) return { error: `Area/depth table: ${chk.reason}` };
        const isField = unitSystem === 'field';
        const hyps = areaDepthHypsometry(chk.rows, {
            unitSystem,
            thickness: chk.hasBase ? null : parseFloat(inputs.thickness),
            spill: inputs.areaDepth?.spill ?? null,
        });
        const fluidType = inputs.fluidType || 'oil';
        const warnings = [...chk.notes];
        const owc = inputs.owc; const goc = inputs.goc;
        const { grvOil, grvGas } = hyps.zoneVolumes(fluidType, owc, fluidType === 'oil' ? null : goc);
        const deepest = fluidType === 'gas' ? (goc ?? owc) : owc;
        const lenU = isField ? 'ft' : 'm';
        if (Number.isFinite(parseFloat(deepest)) && parseFloat(deepest) < hyps.edgeElevation) {
            warnings.push(`The contact (${deepest} ${lenU}) is below the deepest row of the area/depth table (${hyps.edgeElevation} ${lenU}). The area is held at the last row below it, so the volume is a minimum. Extend the table to the contact or the spill point.`);
        }
        if (hyps.belowSpill(deepest)) warnings.push(`The contact is below the spill point (${hyps.spillElevation} ${lenU}); the trap is filled to the spill point.`);
        if (!chk.hasBase && !(parseFloat(inputs.thickness) > 0)) warnings.push('No base column and no gross thickness: the reservoir is taken as filling the whole column from the top down to the contact.');
        const ntg = clamp01(inputs.ntg, 1); const phi = clamp01(inputs.porosity, 0.2); const sw = clamp01(inputs.sw, 0.3);
        const Bo = parseFloat(inputs.fvf) > 0 ? parseFloat(inputs.fvf) : 1.2;
        const Bg = parseFloat(inputs.bg) > 0 ? parseFloat(inputs.bg) : 0.005;
        const hcpvOil = grvOil * ntg * phi * (1 - sw);
        const hcpvGas = grvGas * ntg * phi * (1 - sw);
        const stooip = isField ? hcpvOil * 7758 / Bo : hcpvOil / Bo;
        const giip = isField ? hcpvGas * 43560 / Bg : hcpvGas / Bg;
        const rfO = parseFloat(inputs.recovery) || 0; const rfG = parseFloat(inputs.recoveryGas) || 0;
        const grv = grvOil + grvGas;
        const cond = condensateFrom(giip, inputs.cgr, rfG);
        return {
            method: 'area-depth', fluidType, unitSystem,
            grv, grvOil, grvGas, bulkVolume: grv, netVolume: grv * ntg, poreVolume: grv * ntg * phi, poreVolumeRes: grv * ntg * phi,
            hcPoreVolume: hcpvOil + hcpvGas, hcPoreVolumeOil: hcpvOil, hcPoreVolumeGas: hcpvGas,
            stooip, giip,
            recoverable: fluidType === 'gas' ? giip * rfG / 100 : stooip * rfO / 100,
            recoverableOil: fluidType === 'gas' ? 0 : stooip * rfO / 100, recoverableGas: giip * rfG / 100,
            condensate: cond.inPlace, recoverableCondensate: cond.recoverable, cgr: cond.cgr,
            hcArea: chk.rows[chk.rows.length - 1].areaTop,
            areaDepth: { rows: chk.rows, hasBase: !!chk.hasBase, spill: hyps.spillElevation },
            volumeUnit: isField ? 'STB' : 'sm³', volUnit: isField ? 'Ac-ft' : 'm³', resVolUnit: isField ? 'Ac-ft' : 'm³', areaUnit: isField ? 'Acres' : 'km²',
            warnings,
            inputs: { ntg, porosity: phi, sw, fvf: Bo, bg: Bg, recovery: rfO, recoveryGas: rfG, owc, goc, fluidType, cgr: cond.cgr },
        };
    }

    static calculateDeterministic(inputs, unitSystem = 'field', inputMethod = 'simple', surfaces = {}, opts = {}) {
        const res = this._calculateDeterministic(inputs, unitSystem, inputMethod, surfaces, opts);
        if (!res || res.error) return res;
        return this.completeHydrocarbons(res, inputs, unitSystem, inputMethod, surfaces, opts);
    }

    /**
     * U2-007: Sw per leg from saturation height (structural and area/depth
     * methods), solution gas from Rs, vaporised oil from Rv (the CGR field
     * for an oil with a gas cap), and the totals.
     */
    static completeHydrocarbons(resIn, inputs, unitSystem, inputMethod, surfaces = {}, opts = {}) {
        let res = resIn;
        const fluidType = inputs.fluidType || 'oil';
        const sh = inputs.saturationHeight;
        if (inputs.swSource === 'shm') {
            if (!sh?.jSpec || !Number.isFinite(Number(sh.fwl))) {
                res = { ...res, warnings: [...(res.warnings || []), 'Sw from saturation height is selected but no SCAL project and free-water level are set; the typed Sw was used.'] };
            } else if (inputMethod === 'simple') {
                res = { ...res, warnings: [...(res.warnings || []), 'Saturation height needs depths (Hybrid, Surfaces or Area-depth); the Simple method used the typed Sw.'] };
            } else {
                let hyps = null;
                if (inputMethod === 'areadepth') {
                    const chk = checkAreaDepthRows(inputs.areaDepth?.rows || []);
                    if (chk.ok) hyps = areaDepthHypsometry(chk.rows, { unitSystem, thickness: chk.hasBase ? null : parseFloat(inputs.thickness), spill: inputs.areaDepth?.spill ?? null });
                } else {
                    const top = surfaces[inputs.topSurfaceId];
                    const base = inputMethod === 'surfaces' ? surfaces[inputs.baseSurfaceId] : null;
                    const h = ContactVolumetricsEngine.buildHypsometry({
                        topSurface: top, baseSurface: base,
                        constantThickness: inputMethod === 'hybrid' ? parseFloat(inputs.thickness) : null,
                        unitSystem, aoiPolygon: opts.aoiPolygon || null, options: opts.contactOptions || {},
                    });
                    if (!h.error) hyps = h;
                }
                if (hyps) {
                    const trapOwc = res.trap?.filledToSpill && Number.isFinite(res.trap.spillElevation) ? Math.max(Number(inputs.owc), res.trap.spillElevation) : inputs.owc;
                    res = applySaturationHeight(res, hyps, { shm: sh, fwlElev: Number(sh.fwl), unitSystem, owc: trapOwc, goc: inputs.goc, fluidType });
                }
            }
        }
        const rfG = parseFloat(inputs.recoveryGas) || 0;
        const cond = condensateFrom(res.giip, inputs.cgr, rfG);
        const sg = fluidType === 'gas' ? { inPlace: null, recoverable: null, rs: null } : solutionGasFrom(res.stooip, inputs.rs, res.recoverableOil);
        const out = {
            ...res,
            condensate: cond.inPlace, recoverableCondensate: cond.recoverable, cgr: cond.cgr,
            // the CGR of an oil with a gas cap is the vaporised oil-gas ratio Rv
            condensateKind: fluidType === 'oil_gas' ? 'vaporised oil' : 'condensate',
            solutionGas: sg.inPlace, recoverableSolutionGas: sg.recoverable, rs: sg.rs,
        };
        // U2-004: the Earth Modeling model's provenance and flags travel with the result
        if (inputs.emProspect) out.warnings = [...(out.warnings || []), ...provenanceLines(inputs).filter((l) => !/^Unchanged since/.test(l))];
        if (Number.isFinite(sg.inPlace)) out.totalGasInPlace = (res.giip || 0) + sg.inPlace;
        if (fluidType === 'oil_gas' && Number.isFinite(cond.inPlace)) out.totalOilInPlace = (res.stooip || 0) + cond.inPlace;
        return out;
    }

    static _calculateDeterministic(inputs, unitSystem = 'field', inputMethod = 'simple', surfaces = {}, opts = {}) {
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

        // U2-001: an area/depth table cut by the contacts
        if (inputMethod === 'areadepth') {
            const res = this.fromAreaDepth(inputs, unitSystem);
            if (res.error) return res;
            return { ...res, inputMethod, warnings: [...res.warnings, ...validation.warnings.filter((w) => !/Area and thickness/.test(w))], qualityScore: validation.qualityScore };
        }

        try {
            // Simple (analytic) method: Area × Thickness with no structural geometry.
            // Contacts cannot apply here — there is no depth reference. For oil+gas
            // the GRV is split between the gas cap and the oil leg by an explicit
            // gas-cap fraction (the analytic stand-in for a GOC), so oil and gas
            // never draw on the same pore volume.
            const isField = unitSystem === 'field';
            const area = parseFloat(inputs.area) || 0;
            const thickness = parseFloat(inputs.thickness) || 0;
            const calculatedArea = area;
            // Field: acres × ft → acre-ft. Metric: km² × 1e6 → m², × m → m³.
            const grv = isField ? area * thickness : area * 1_000_000 * thickness;

            const ntg = parseFloat(inputs.ntg) || 1.0;
            const phi = parseFloat(inputs.porosity) || 0.2;
            const sw = parseFloat(inputs.sw) || 0.3;
            const soi = 1 - sw;

            const fluidType = inputs.fluidType || 'oil';
            const fvf = parseFloat(inputs.fvf) || 1.2; // Bo, rb/stb (rm³/sm³ metric)
            const bg = parseFloat(inputs.bg) || 0.005; // Bg, rcf/scf (rm³/sm³ metric)
            const oilRecovery = parseFloat(inputs.recovery) || 0;
            const gasRecovery = parseFloat(inputs.recoveryGas) || 0;

            // Split GRV between the fluid zones.
            const warnings = [...validation.warnings];
            let grvOil = 0;
            let grvGas = 0;
            if (fluidType === 'gas') {
                grvGas = grv;
            } else if (fluidType === 'oil_gas') {
                const gcf = parseFloat(inputs.gasCapFraction);
                if (gcf > 0 && gcf < 1) {
                    grvGas = grv * gcf;
                    grvOil = grv - grvGas;
                } else {
                    grvOil = grv;
                    warnings.push('Oil+gas is selected but no gas-cap fraction is set, so the case is modelled as undersaturated oil with no free-gas cap. Set a gas-cap fraction of GRV, or use a structural method with a GOC, for a rigorous split.');
                }
            } else {
                grvOil = grv;
            }

            // Per-zone roll-up so oil and gas never share pore volume.
            const netVolume = grv * ntg;
            const poreVolume = netVolume * phi;
            const hcpvOil = grvOil * ntg * phi * soi;
            const hcpvGas = grvGas * ntg * phi * soi;
            const hcPoreVolume = hcpvOil + hcpvGas;

            // Field constants fold acre-ft → surface units (7758 bbl/acre-ft,
            // 43560 ft³/acre-ft); metric HCPV is already m³ so only the FVF divides.
            const OIL_CONST = isField ? 7758 : 1;
            const GAS_CONST = isField ? 43560 : 1;
            const validBo = fvf <= 0 ? 1 : fvf;
            const validBg = bg <= 0 ? 0.001 : bg; // guard div-by-zero

            const isGasFluid = fluidType === 'gas';
            const giip = (hcpvGas * GAS_CONST) / validBg;
            let stooip = (hcpvOil * OIL_CONST) / validBo;
            let volumeUnit = isField ? 'STB' : 'sm³';
            if (isGasFluid) {
                stooip = giip; // pure gas: primary target mirrors GIIP
                volumeUnit = isField ? 'scf' : 'sm³';
            }

            // Oil and gas are recovered independently at their own recovery factors.
            const recoverableOil = isGasFluid ? 0 : stooip * (oilRecovery / 100);
            const recoverableGas = giip * (gasRecovery / 100);
            const recoverable = isGasFluid ? recoverableGas : recoverableOil;
            // RCP-U1-017: condensate in place from the CGR (was unused)
            const cond = condensateFrom(giip, inputs.cgr, gasRecovery);

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
                grvOil,
                grvGas,
                bulkVolume: grv,
                netVolume,
                poreVolume,
                poreVolumeRes: poreVolume,
                hcPoreVolume,
                hcPoreVolumeOil: hcpvOil,
                hcPoreVolumeGas: hcpvGas,
                hcArea: calculatedArea,
                condensate: cond.inPlace,
                recoverableCondensate: cond.recoverable,
                cgr: cond.cgr,
                volumeUnit,
                volUnit: isField ? 'Ac-ft' : 'm³',
                resVolUnit: isField ? 'Ac-ft' : 'm³',
                areaUnit: isField ? 'Acres' : 'km²',
                inputMethod,
                fluidType,
                unitSystem,
                inputs: {
                    // RL re-check (RL1): the two inputs the Simple method reads for its rock volume
                    area: parseFloat(inputs.area),
                    thickness: parseFloat(inputs.thickness),
                    ntg,
                    porosity: phi,
                    sw,
                    fvf,
                    bg,
                    recovery: oilRecovery,
                    recoveryGas: gasRecovery,
                    gasCapFraction: parseFloat(inputs.gasCapFraction),
                    owc: inputs.owc,
                    goc: inputs.goc,
                    fluidType,
                    cgr: cond.cgr
                },
                warnings,
                qualityScore: validation.qualityScore
            };

        } catch (e) {
            console.error("Calculation Error:", e);
            return { error: e.message };
        }
    }
}

function clamp01(v, d) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d;
}
