import { PolygonClippingEngine } from './PolygonClippingEngine';
import { makeInterpolator } from './GriddingEngine';

export class MapGenerationEngine {
    /**
     * Generates regular grid maps for reservoir properties.
     * STRICT CONVENTION: Z-Axis is Negative Downwards (Elevation).
     * - Top Surface (e.g. -7000) > Base Surface (e.g. -7100).
     * - OWC (e.g. -7500) is deeper than crest (-7000).
     */
    static generateMaps(topSurface, inputs, mapTypes, unitSystem, polygons = [], activeAoiId = null, baseSurface = null, method = 'idw') {
        if (!topSurface || !topSurface.points || topSurface.points.length === 0) return [];

        console.time("MapGeneration");

        const { 
            thickness: scalarThick, owc, goc, ntg, porosity, sw, fvf, bg, fluidType 
        } = inputs;

        const validNum = (n, def = 0) => (n !== null && n !== undefined && !isNaN(n)) ? parseFloat(n) : def;
        
        // Unit Constants
        const isField = unitSystem === 'field';
        const oilConst = isField ? 7758 : 1000000; // STB/acre-ft or STB/m3 (approx)
        const gasConst = isField ? 43560 : 1000000;

        // Depth Inputs (Negative Downwards)
        const vOwc = validNum(owc, -999999); // Default very deep
        const vGoc = validNum(goc, -999999); // Default very deep if not present
        
        const vNtg = validNum(ntg, 1);
        const vPhi = validNum(porosity, 0);
        const vSw = validNum(sw, 1);
        const vBo = validNum(fvf, 1.2);
        const vBg = validNum(bg, 0.005);
        const constThick = validNum(scalarThick, 0); // Positive scalar

        // 1. Initialize Interpolators (kriging or IDW per user setting)
        const topInterp = makeInterpolator(topSurface.points, method);
        let baseInterp = null;
        if (baseSurface && baseSurface.points && baseSurface.points.length > 0) {
            baseInterp = makeInterpolator(baseSurface.points, method);
        }

        // 2. Generate Grid Geometry
        const bounds = topInterp.bounds;
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        const aspectRatio = width / height || 1;
        
        const nx = 100;
        const ny = Math.round(nx / aspectRatio);
        
        const grid = topInterp.generateGrid(nx, ny);
        const { x, y, z: topZMatrix } = grid;
        
        // 3. Prepare Result Containers
        const resultGrids = {};
        mapTypes.forEach(t => {
            resultGrids[t] = []; 
        });

        const aoiPolygon = activeAoiId ? polygons.find(p => p.id === activeAoiId) : null;

        // 4. Iterate Grid
        for (let i = 0; i < y.length; i++) {
            const cy = y[i];
            const rows = {};
            mapTypes.forEach(t => rows[t] = []);

            for (let j = 0; j < x.length; j++) {
                const cx = x[j];
                
                // A. Polygon Clipping
                if (aoiPolygon && !PolygonClippingEngine.isPointInPolygon({x: cx, y: cy}, aoiPolygon.vertices)) {
                    mapTypes.forEach(t => rows[t].push(null));
                    continue;
                }

                // B. Structure Calculation (Negative Z)
                const topZ = topZMatrix[i][j]; // e.g. -7000
                
                let baseZ;
                if (baseInterp) {
                    baseZ = baseInterp.predict(cx, cy);
                } else {
                    // Base is deeper, so subtact positive thickness
                    baseZ = topZ - constThick; // -7000 - 100 = -7100
                }

                // Gross Thickness (Positive value)
                // Top (-7000) - Base (-7100) = 100
                const grossThick = Math.max(0, topZ - baseZ);

                // C. Fluid Columns
                let oilThick = 0;
                let gasThick = 0;

                // --- GAS ZONE ---
                // Gas exists from TopZ down to GOC (or OWC if GOC missing, or Base)
                // But strictly: Gas is above Oil.
                // Gas Top: topZ
                // Gas Base: Shallower of (BaseZ, GOC, OWC)
                // Actually, if Oil+Gas: Gas is Top -> GOC. Oil is GOC -> OWC.
                
                if (fluidType === 'gas') {
                    // Gas from Top down to GWC (input as OWC or GOC)
                    // Lower limit of gas is the shallowest of (BaseZ, Contact)
                    // Contact is vOwc (or vGoc if provided)
                    const contact = validNum(goc, -999999) !== -999999 ? vGoc : vOwc;
                    const gasBaseZ = Math.max(baseZ, contact); // e.g. max(-7100, -7500) = -7100
                    gasThick = Math.max(0, topZ - gasBaseZ);
                } 
                else if (fluidType === 'oil') {
                    // Oil from Top down to OWC
                    const oilBaseZ = Math.max(baseZ, vOwc); // e.g. max(-7100, -7500) = -7100
                    oilThick = Math.max(0, topZ - oilBaseZ);
                }
                else if (fluidType === 'oil_gas') {
                    // Gas Zone: TopZ to GOC
                    // But strictly constrained by BaseZ too
                    const gasBaseZ = Math.max(baseZ, vGoc); // Gas cannot go below GOC or Base
                    gasThick = Math.max(0, topZ - gasBaseZ);

                    // Oil Zone: GOC to OWC
                    // Top of Oil is min(topZ, vGoc) ?? No. 
                    // If TopZ is -7000 and GOC is -7200. Gas is -7000 to -7200. Oil is -7200 to OWC.
                    // If TopZ is -7300 (below GOC). Gas is 0. Oil is -7300 to OWC.
                    
                    // Effective Oil Top: Deeper of (TopZ, GOC) => Math.min(topZ, vGoc) in neg domain?
                    // -7300 vs -7200. min is -7300. Correct.
                    const oilTopZ = Math.min(topZ, vGoc);
                    
                    // Effective Oil Base: Shallower of (BaseZ, OWC)
                    const oilBaseZ = Math.max(baseZ, vOwc); // max(-7500, -8000) = -7500
                    
                    oilThick = Math.max(0, oilTopZ - oilBaseZ);
                }

                // D. Volumetrics
                const netPay = (oilThick + gasThick) * vNtg;
                
                // HCPV = Net Pay * Porosity * (1-Sw)
                // Note: Sw applies to pore space
                const hcpvCol = netPay * vPhi * (1 - vSw); 

                // STOOIP / GIIP Intensity
                // STOOIP (bbl/acre or m3/m2) = (HCPV_ft * 7758) / Bo
                let stooipInt = 0;
                let giipInt = 0;

                // Split HCPV for accurate Bo/Bg application
                const hcpvOil = (oilThick * vNtg * vPhi * (1 - vSw));
                const hcpvGas = (gasThick * vNtg * vPhi * (1 - vSw));

                if (isField) {
                    // bbl/acre = ft * (bbl/acre-ft)
                    stooipInt = (hcpvOil * oilConst) / vBo;
                    giipInt = (hcpvGas * gasConst) / vBg;
                } else {
                    // m3/km2 ? Or m3/m2. 
                    // Standard metric map often m3/m2 (thickness) * porosity... result is m.
                    // Multiply by 1,000,000 to get m3/km2?
                    // Let's stick to simple: Result in Surface Volume per Area Unit.
                    stooipInt = (hcpvOil * oilConst) / vBo; // Adjusted constant for metric
                    giipInt = (hcpvGas * gasConst) / vBg;
                }

                // E. Push Values
                if (rows['structure']) rows['structure'].push(topZ);
                if (rows['thickness']) rows['thickness'].push(grossThick);
                if (rows['net_pay']) rows['net_pay'].push(netPay);
                if (rows['porosity']) rows['porosity'].push(vPhi);
                if (rows['sw']) rows['sw'].push(vSw);
                if (rows['hcpv']) rows['hcpv'].push(hcpvCol);
                if (rows['stooip']) rows['stooip'].push(stooipInt);
                if (rows['giip']) rows['giip'].push(giipInt);
            }

            mapTypes.forEach(t => resultGrids[t].push(rows[t]));
        }

        console.timeEnd("MapGeneration");

        // 5. Package Results
        const maps = [];
        mapTypes.forEach(type => {
            let name = type;
            let unit = '';
            let colorscale = 'Viridis';

            switch(type) {
                case 'structure': name = 'Structure (Depth)'; unit = isField ? 'ft' : 'm'; colorscale = 'Earth'; break;
                case 'thickness': name = 'Gross Thickness'; unit = isField ? 'ft' : 'm'; colorscale = 'Jet'; break;
                case 'net_pay': name = 'Net Pay Thickness'; unit = isField ? 'ft' : 'm'; colorscale = 'Jet'; break;
                case 'hcpv': name = 'HCPV Column'; unit = isField ? 'ft' : 'm'; colorscale = 'Hot'; break;
                case 'stooip': name = 'STOOIP Intensity'; unit = isField ? 'bbl/acre' : 'm³/km²'; colorscale = 'Portland'; break;
                case 'giip': name = 'GIIP Intensity'; unit = isField ? 'scf/acre' : 'm³/km²'; colorscale = 'Portland'; break;
                case 'porosity': name = 'Porosity'; unit = 'dec'; colorscale = 'YlGnBu'; break;
                case 'sw': name = 'Water Saturation'; unit = 'dec'; colorscale = 'Blues'; break;
            }

            maps.push({
                id: `map_${type}_${Date.now()}`,
                type: type,
                name: name,
                unit: unit,
                data: {
                    x: x,
                    y: y,
                    z: resultGrids[type]
                },
                colorscale: colorscale,
                createdAt: new Date().toISOString()
            });
        });

        return maps;
    }
}