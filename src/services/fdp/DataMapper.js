/**
 * Data Mapper Service
 * Standardizes data formats across different Petrolord applications for FDP integration.
 */

export class DataMapper {
    static unitConversions = {
        volume: {
            'bbl': 1,
            'm3': 6.2898,
            'MMbbl': 1000000,
            'MMm3': 6289800
        },
        pressure: {
            'psi': 1,
            'bar': 14.5038,
            'MPa': 145.038
        },
        depth: {
            'ft': 1,
            'm': 3.28084
        }
    };

    static mapReserves(data) {
        // Standardize reserves data structure
        return {
            p10: data.p10 || data.low_case || 0,
            p50: data.p50 || data.base_case || 0,
            p90: data.p90 || data.high_case || 0,
            unit: data.unit || 'MMbbl',
            rf: data.recovery_factor || 0,
            source: data.source || 'Manual Input'
        };
    }

    static mapWellData(data) {
        // Standardize well data structure from Well Design Studio
        return data.map(well => ({
            id: well.id,
            name: well.name || well.well_name,
            type: well.type || well.well_type || 'Producer',
            location: well.surface_location || { x: 0, y: 0 },
            targetDepth: well.td || well.measured_depth || 0,
            cost: well.estimated_cost || 0
        }));
    }

    static mapEconomics(data) {
        // Standardize economics data from NPV Builder
        return {
            npv: data.npv || data.net_present_value || 0,
            irr: data.irr || data.internal_rate_return || 0,
            capex: data.total_capex || 0,
            opex: data.avg_opex || 0,
            oilPrice: data.oil_price_assumption || 0
        };
    }

    static convertUnit(value, fromUnit, toUnit, category = 'volume') {
        if (!this.unitConversions[category]) return value;
        const fromFactor = this.unitConversions[category][fromUnit];
        const toFactor = this.unitConversions[category][toUnit];
        
        if (!fromFactor || !toFactor) return value;
        
        // Convert to base unit then to target unit
        const baseValue = value * fromFactor;
        return baseValue / toFactor;
    }
}