import { makeInterpolator } from './GriddingEngine';
import { PolygonClippingEngine } from './PolygonClippingEngine';

const FT_PER_M = 3.280839895;
const SQFT_PER_ACRE = 43560;
const M2_PER_KM2 = 1_000_000;
// Field unit constants (already fold area×thickness → volume).
const OIL_CONST = 7758;   // bbl per acre-ft
const GAS_CONST = 43560;  // scf per acre-ft

/**
 * Rigorous, contact-based gross-rock-volume and in-place volumetrics.
 *
 * Instead of `mean-thickness × bounding-box`, this integrates numerically over a
 * regular grid draped on the top structural surface:
 *
 *     GRV_zone = Σ_cells  overlap(reservoir_column, fluid_zone_window) · cellArea
 *
 * where the reservoir column at a cell is [topZ, baseZ] (base = a base surface or
 * top + constant gross thickness) and each fluid zone (gas cap, oil leg, gas) is a
 * depth window bounded by GOC / OWC / GWC. Moving a contact changes the volume, and
 * a domed top and a flat top of equal mean depth give different GRV — the physics an
 * industry tool applies.
 *
 * All depths are normalised internally to "depth increases downward" so the interval
 * arithmetic is convention-independent, and stored in the *target* length unit (ft
 * for field, m for metric). Cell areas are carried in the surface's true XY units and
 * converted to acres / m² — fixing the historical bug where a bounding box in
 * UTM-metres² was fed into the acre-ft constant.
 */
export class ContactVolumetricsEngine {

    /**
     * Deterministic contact-based volumetrics.
     * @param {object} p  see {@link ContactVolumetricsEngine._buildCells} for geometry params
     *   plus `inputs` = {ntg,porosity,sw,fvf,bg,fluidType,owc,goc,recovery,recoveryGas}.
     */
    static calculate(p) {
        const built = this._buildCells(p);
        if (built.error) return { error: built.error };
        const { cells, meta } = built;
        const inputs = p.inputs || {};
        const warnings = [...built.warnings];

        const ntg = clampFrac(inputs.ntg, 1.0);
        const phi = clampFrac(inputs.porosity, 0.2);
        const sw = clampFrac(inputs.sw, 0.3);
        const soi = 1 - sw;
        const fluidType = inputs.fluidType || 'oil';
        const Bo = parseFloat(inputs.fvf) > 0 ? parseFloat(inputs.fvf) : 1.2;
        const Bg = parseFloat(inputs.bg) > 0 ? parseFloat(inputs.bg) : 0.005;
        const oilRecovery = parseFloat(inputs.recovery) || 0;
        const gasRecovery = parseFloat(inputs.recoveryGas) || 0;

        // Fluid-zone depth windows (target depth-down). Missing contacts degrade sensibly.
        const zone = fluidZoneWindows(fluidType, inputs.owc, inputs.goc, meta, warnings);

        let grvOil = 0, grvGas = 0;
        let areaOil = 0, areaGas = 0, areaAny = 0;
        for (const c of cells) {
            const gasThk = intervalOverlap(c.td, c.bd, zone.gasTop, zone.gasBot);
            const oilThk = intervalOverlap(c.td, c.bd, zone.oilTop, zone.oilBot);
            grvGas += gasThk * c.area;
            grvOil += oilThk * c.area;
            if (gasThk > 0) areaGas += c.area;
            if (oilThk > 0) areaOil += c.area;
            if (gasThk > 0 || oilThk > 0) areaAny += c.area;
        }

        // Per-zone roll-up so oil and gas never share pore volume.
        const hcpvOil = grvOil * ntg * phi * soi;
        const hcpvGas = grvGas * ntg * phi * soi;
        const grv = grvOil + grvGas;
        const netVolume = grv * ntg;
        const poreVolume = netVolume * phi;
        const hcPoreVolume = hcpvOil + hcpvGas;

        const stooip = meta.isField ? (hcpvOil * OIL_CONST) / Bo : hcpvOil / Bo;
        const giip = meta.isField ? (hcpvGas * GAS_CONST) / Bg : hcpvGas / Bg;
        const recoverableOil = stooip * (oilRecovery / 100);
        const recoverableGas = giip * (gasRecovery / 100);

        // productive area for display: acres (field) or km² (metric)
        const areaDisplay = (a) => meta.isField ? a : a / M2_PER_KM2;

        if (cells.length === 0) warnings.push('No hydrocarbon-bearing cells found — check contacts, surface, and AOI.');
        if (fluidType !== 'gas' && stooip === 0 && giip === 0) {
            warnings.push('Zero in-place volume — the reservoir column may lie entirely below the OWC.');
        }

        return {
            method: 'contact-grid',
            fluidType,
            unitSystem: meta.unitSystem,
            grv, grvOil, grvGas,
            bulkVolume: grv,
            netVolume,
            poreVolume,
            poreVolumeRes: poreVolume,
            hcPoreVolume,
            hcPoreVolumeOil: hcpvOil,
            hcPoreVolumeGas: hcpvGas,
            stooip, giip,
            recoverable: fluidType === 'gas' ? recoverableGas : recoverableOil,
            recoverableOil, recoverableGas,
            area: areaDisplay(areaAny),
            areaOil: areaDisplay(areaOil),
            areaGas: areaDisplay(areaGas),
            hcArea: areaDisplay(areaAny),
            avgNetPayOil: areaOil > 0 ? (grvOil * ntg) / areaOil : 0,
            avgNetPayGas: areaGas > 0 ? (grvGas * ntg) / areaGas : 0,
            volumeUnit: meta.volumeUnit,
            volUnit: meta.volUnit,
            resVolUnit: meta.resVolUnit,
            areaUnit: meta.areaUnit,
            resolution: { nx: meta.nx, ny: meta.ny, dx: meta.dx, dy: meta.dy },
            cellCount: cells.length,
            maskedCount: meta.maskedCount,
            clippedCount: meta.clippedCount,
            xyUnit: meta.xyUnit,
            depthUnit: meta.depthUnit,
            zConvention: meta.zConvention,
            warnings,
            inputs: {
                ntg, porosity: phi, sw, fvf: Bo, bg: Bg,
                recovery: oilRecovery, recoveryGas: gasRecovery,
                owc: inputs.owc, goc: inputs.goc, fluidType
            }
        };
    }

    /**
     * Precompute a hypsometric (area–depth) rock-volume model so a Monte Carlo loop
     * can evaluate GRV as a function of *sampled* contact depths in O(1) — building
     * the grid once instead of per realisation. Returns an object exposing:
     *   rockToContact(userZ) → rock volume between the top surface and depth z
     *                          (capped at base), in acre-ft or m³.
     *   zoneVolumes(fluidType, owc, goc) → { grvOil, grvGas }.
     */
    static buildHypsometry(p) {
        const built = this._buildCells(p);
        if (built.error) return { error: built.error };
        const { cells, meta } = built;

        if (cells.length === 0) return { error: 'No cells inside the surveyed area / AOI to integrate.' };

        // Depth range spanned by the reservoir columns (target depth-down units).
        let zLo = Infinity, zHi = -Infinity, totalArea = 0;
        for (const c of cells) {
            if (c.td < zLo) zLo = c.td;
            if (c.bd > zHi) zHi = c.bd;
            totalArea += c.area;
        }

        // Cumulative rock volume between the top surface and depth level z_k.
        // V(z) is piecewise-linear (breakpoints at each cell's td/bd); a fine table
        // reproduces it to well under a percent.
        const N = 1024;
        const levels = new Float64Array(N);
        const volume = new Float64Array(N);
        const span = Math.max(zHi - zLo, 1e-9);
        for (let k = 0; k < N; k++) {
            const z = zLo + (span * k) / (N - 1);
            levels[k] = z;
            let v = 0;
            for (const c of cells) v += Math.max(0, Math.min(c.bd, z) - c.td) * c.area;
            volume[k] = v;
        }
        const vTotal = volume[N - 1];

        // z in *user* convention/units → target depth-down.
        const toTargetDepth = (userZ) => (meta.zConvention === 'elevation' ? -userZ : userZ) * meta.depthToTargetLen;

        const rockToContact = (userZ) => {
            if (userZ === null || userZ === undefined || userZ === '' || isNaN(parseFloat(userZ))) return vTotal;
            const z = toTargetDepth(parseFloat(userZ));
            if (z <= zLo) return 0;
            if (z >= zHi) return vTotal;
            const t = ((z - zLo) / span) * (N - 1);
            const i = Math.floor(t);
            const frac = t - i;
            return volume[i] + (volume[i + 1] - volume[i]) * frac;
        };

        const zoneVolumes = (fluidType, owc, goc) => {
            if (fluidType === 'gas') {
                const gwc = isNum(goc) ? goc : owc;             // gas-water contact
                return { grvOil: 0, grvGas: rockToContact(gwc) };
            }
            if (fluidType === 'oil_gas' && isNum(goc)) {
                const vGoc = rockToContact(goc);
                const vOwc = rockToContact(owc);
                return { grvGas: vGoc, grvOil: Math.max(0, vOwc - vGoc) };
            }
            // oil (or oil_gas with no GOC → undersaturated oil, no gas cap)
            return { grvOil: rockToContact(owc), grvGas: 0 };
        };

        return {
            meta,
            vTotal,
            totalArea,
            zLo, zHi,
            rockToContact,
            zoneVolumes,
            isField: meta.isField,
            volUnit: meta.volUnit,
            areaUnit: meta.areaUnit,
        };
    }

    /**
     * Build the integration cells shared by calculate() and buildHypsometry().
     * Each cell = { td, bd, area } with td/bd the top/base depths in *target* length
     * units (depth increases downward) and area the cell footprint in acres (field)
     * or m² (metric), already reduced by AOI coverage and hull masking.
     */
    static _buildCells(p) {
        const {
            topSurface,
            baseSurface = null,
            constantThickness = null,
            unitSystem = 'field',
            aoiPolygon = null,
            options = {}
        } = p;
        const warnings = [];

        if (!topSurface || !Array.isArray(topSurface.points) || topSurface.points.length < 3) {
            return { error: 'A top surface with at least 3 points is required for contact-based volumetrics.' };
        }
        const hasBaseSurface = !!(baseSurface && Array.isArray(baseSurface.points) && baseSurface.points.length >= 3);
        const constThick = parseFloat(constantThickness);
        if (!hasBaseSurface && !(constThick > 0)) {
            return { error: 'Provide either a base surface or a positive gross thickness.' };
        }

        const isField = unitSystem === 'field';
        const xyUnit = options.xyUnit || topSurface.xyUnit || (isField ? 'ft' : 'm');
        const depthUnit = options.depthUnit || topSurface.depthUnit || (isField ? 'ft' : 'm');
        const zConvention = options.zConvention || topSurface.zConvention || 'elevation';
        const toDepth = (z) => (zConvention === 'elevation' ? -z : z);

        // Interpolation method: 'idw' (default, fast — keeps engine tests deterministic)
        // or 'kriging' when the caller opts in via options.interpolation.
        const method = options.interpolation || 'idw';
        const topInterp = makeInterpolator(topSurface.points, method);
        const baseInterp = hasBaseSurface ? makeInterpolator(baseSurface.points, method) : null;
        const b = topInterp.bounds;
        const width = Math.max(b.maxX - b.minX, 1e-9);
        const height = Math.max(b.maxY - b.minY, 1e-9);

        const nx = Math.max(20, Math.min(600, Math.round(options.resolution || 150)));
        const ny = Math.max(20, Math.min(600, Math.round(nx * (height / width)) || nx));
        const dx = width / nx;
        const dy = height / ny;
        const cellAreaXY = dx * dy;

        const hullMask = options.hullMask !== false;
        const sampleSpacing = Math.sqrt((width * height) / topSurface.points.length);
        const hullRadius = (options.hullFactor || 2.0) * sampleSpacing;

        // XY→(acres|m²) and depth→(ft|m) conversions.
        const xyToTargetLen = xyUnit === 'm' ? (isField ? FT_PER_M : 1) : (isField ? 1 : 1 / FT_PER_M);
        const depthToTargetLen = depthUnit === 'm' ? (isField ? FT_PER_M : 1) : (isField ? 1 : 1 / FT_PER_M);
        const cellAreaTargetRaw = cellAreaXY * xyToTargetLen * xyToTargetLen; // ft² or m²
        const cellArea = isField ? cellAreaTargetRaw / SQFT_PER_ACRE : cellAreaTargetRaw; // acres or m²

        const cells = [];
        let maskedCount = 0, clippedCount = 0;
        for (let j = 0; j < ny; j++) {
            const cy = b.minY + (j + 0.5) * dy;
            for (let i = 0; i < nx; i++) {
                const cx = b.minX + (i + 0.5) * dx;

                let coverage = 1;
                if (aoiPolygon && Array.isArray(aoiPolygon.vertices) && aoiPolygon.vertices.length >= 3) {
                    coverage = cellCoverage(cx, cy, dx, dy, aoiPolygon.vertices);
                    if (coverage <= 0) { clippedCount++; continue; }
                }
                if (hullMask && nearestDist(topInterp, cx, cy) > hullRadius) { maskedCount++; continue; }

                const tdNative = toDepth(topInterp.predict(cx, cy));
                const bdNative = baseInterp ? toDepth(baseInterp.predict(cx, cy)) : tdNative + constThick;
                const td = Math.min(tdNative, bdNative) * depthToTargetLen; // shallow, target units
                const bd = Math.max(tdNative, bdNative) * depthToTargetLen; // deep
                if (bd - td <= 0) continue;
                cells.push({ td, bd, area: cellArea * coverage });
            }
        }

        return {
            cells,
            warnings,
            meta: {
                isField,
                unitSystem,
                xyUnit, depthUnit, zConvention, depthToTargetLen,
                nx, ny, dx, dy, maskedCount, clippedCount,
                volumeUnit: isField ? 'STB' : 'sm³',
                volUnit: isField ? 'Ac-ft' : 'm³',
                resVolUnit: isField ? 'Ac-ft' : 'm³',
                areaUnit: isField ? 'Acres' : 'km²',
            }
        };
    }
}

// ---- helpers ----

function isNum(v) { return v !== null && v !== undefined && v !== '' && !isNaN(parseFloat(v)); }

function clampFrac(v, dflt) {
    const n = parseFloat(v);
    if (!isFinite(n)) return dflt;
    return Math.min(1, Math.max(0, n));
}

// Fluid-zone depth windows in target depth-down units, from user-convention contacts.
function fluidZoneWindows(fluidType, owc, goc, meta, warnings) {
    const toTargetDepth = (z) => (meta.zConvention === 'elevation' ? -z : z) * meta.depthToTargetLen;
    const owcD = isNum(owc) ? toTargetDepth(parseFloat(owc)) : Infinity;
    const gocD = isNum(goc) ? toTargetDepth(parseFloat(goc)) : null;

    let gasTop = Infinity, gasBot = -Infinity, oilTop = Infinity, oilBot = -Infinity;
    if (fluidType === 'gas') {
        const gwc = gocD != null ? gocD : owcD;
        gasTop = -Infinity; gasBot = gwc;
    } else if (fluidType === 'oil') {
        oilTop = -Infinity; oilBot = owcD;
    } else if (fluidType === 'oil_gas') {
        if (gocD == null) {
            if (warnings) warnings.push('Oil+gas selected but no GOC provided — modelled as undersaturated oil (no gas cap).');
            oilTop = -Infinity; oilBot = owcD;
        } else {
            gasTop = -Infinity; gasBot = gocD;
            oilTop = gocD; oilBot = owcD;
            if (owcD !== Infinity && owcD < gocD && warnings) {
                warnings.push('OWC is shallower than GOC — check contact depths (expected GOC above OWC).');
            }
        }
    }
    return { gasTop, gasBot, oilTop, oilBot };
}

// Length of the overlap of reservoir column [rTop,rBot] with a zone window [zTop,zBot]
// (all depth-down, never negative).
function intervalOverlap(rTop, rBot, zTop, zBot) {
    return Math.max(0, Math.min(rBot, zBot) - Math.max(rTop, zTop));
}

// Nearest control-point distance to (x,y), using the interpolator's spatial index.
function nearestDist(interp, x, y) {
    const pts = interp.getNeighbors(x, y);
    let best = Infinity;
    for (const pt of pts) {
        const d = Math.hypot(x - pt.x, y - pt.y);
        if (d < best) best = d;
    }
    return best;
}

// Fraction of a cell (centre cx,cy; size dx×dy) inside the polygon. Fast paths for
// fully-in / fully-out via corner+centre test; otherwise a 4×4 sub-sample estimate.
function cellCoverage(cx, cy, dx, dy, verts) {
    const hx = dx / 2, hy = dy / 2;
    const probes = [
        [cx - hx, cy - hy], [cx + hx, cy - hy], [cx - hx, cy + hy], [cx + hx, cy + hy], [cx, cy]
    ];
    let inside = 0;
    for (const [px, py] of probes) {
        if (PolygonClippingEngine.isPointInPolygon({ x: px, y: py }, verts)) inside++;
    }
    if (inside === 5) return 1;
    if (inside === 0) return 0;
    const K = 4;
    let hit = 0;
    for (let a = 0; a < K; a++) {
        for (let bb = 0; bb < K; bb++) {
            const px = cx - hx + (a + 0.5) * (dx / K);
            const py = cy - hy + (bb + 0.5) * (dy / K);
            if (PolygonClippingEngine.isPointInPolygon({ x: px, y: py }, verts)) hit++;
        }
    }
    return hit / (K * K);
}
