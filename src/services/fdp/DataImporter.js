/**
 * Data Importer Service
 * Simulates data ingestion from other Petrolord applications.
 */
import { DataMapper } from './DataMapper';

export class DataImporter {
    static async importFromApp(appName, projectId) {
        console.log(`Connecting to ${appName} for project ${projectId}...`);
        
        // Simulate API latency
        await new Promise(resolve => setTimeout(resolve, 1500));

        switch(appName) {
            case 'geoscience':
                return this.mockGeoscienceData();
            case 'reservoir':
                return this.mockReservoirData();
            case 'wells':
                return this.mockWellPlanningData();
            case 'economics':
                return this.mockEconomicsData();
            default:
                throw new Error(`Unknown application: ${appName}`);
        }
    }

    static mockGeoscienceData() {
        return {
            source: 'Log Facies Analysis',
            timestamp: new Date().toISOString(),
            data: {
                porosity_avg: 0.22,
                permeability_avg_md: 450,
                ntg: 0.75,
                water_saturation: 0.15,
                facies_model: 'Turbidite Channel'
            }
        };
    }

    static mockReservoirData() {
        return {
            source: 'Material Balance',
            timestamp: new Date().toISOString(),
            data: {
                stooip: 450, // MMbbl
                recovery_factor: 0.35,
                drive_mechanism: 'Water Drive',
                pressure_initial: 4500, // psi
                temperature: 185 // F
            }
        };
    }

    static mockWellPlanningData() {
        return {
            source: 'Well Design Studio',
            timestamp: new Date().toISOString(),
            data: {
                wells: [
                    { id: 'W-01', name: 'PROD-01', type: 'Producer', td: 12500, cost: 12.5 },
                    { id: 'W-02', name: 'PROD-02', type: 'Producer', td: 12800, cost: 13.1 },
                    { id: 'W-03', name: 'INJ-01', type: 'Injector', td: 13100, cost: 14.2 }
                ]
            }
        };
    }

    static mockEconomicsData() {
        return {
            source: 'NPV Scenario Builder',
            timestamp: new Date().toISOString(),
            data: {
                npv_p50: 245, // MM$
                irr: 22.5, // %
                payback_period: 4.2, // years
                break_even_oil_price: 42 // $/bbl
            }
        };
    }
}