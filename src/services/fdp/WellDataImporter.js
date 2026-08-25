/**
 * Well Data Importer
 * Simulation of data ingestion from Well Design Studio and Project Management apps.
 */

export class WellDataImporter {
    static async importFromWellPlanning() {
        // Simulate API latency
        await new Promise(resolve => setTimeout(resolve, 800));

        return [
            { 
                id: 'wp-101', 
                name: 'P-01', 
                type: 'Producer', 
                trajectory: 'Horizontal',
                tvd: 8500, 
                md: 12400, 
                location: { lat: 56.5, lng: 3.2 },
                status: 'Planned' 
            },
            { 
                id: 'wp-102', 
                name: 'P-02', 
                type: 'Producer', 
                trajectory: 'Horizontal',
                tvd: 8550, 
                md: 12600, 
                location: { lat: 56.52, lng: 3.21 },
                status: 'Planned' 
            },
            { 
                id: 'wp-103', 
                name: 'I-01', 
                type: 'Injector', 
                trajectory: 'Deviated',
                tvd: 8800, 
                md: 10200, 
                location: { lat: 56.48, lng: 3.18 },
                status: 'Planned' 
            }
        ];
    }

    static async importFromAFE() {
        // Simulate importing cost data
        return {
            rigRate: 250000, // USD/day
            spreadCost: 150000 // USD/day
        };
    }
}