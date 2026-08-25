/**
 * Integration Service for FDP Accelerator
 * Manages connections to other Petrolord applications and data synchronization.
 */

export class IntegrationService {
    static registry = [
        { id: 'geoscience', name: 'Geoscience Analytics', icon: 'Globe', status: 'connected' },
        { id: 'reservoir', name: 'Reservoir Management', icon: 'Layers', status: 'connected' },
        { id: 'wells', name: 'Well Design Studio', icon: 'Activity', status: 'disconnected' },
        { id: 'facilities', name: 'Facilities Engineering', icon: 'Factory', status: 'connected' },
        { id: 'economics', name: 'Economics & Risk', icon: 'DollarSign', status: 'active' }
    ];

    static async checkConnection(appId) {
        // Simulate API check
        return new Promise((resolve) => {
            setTimeout(() => {
                const app = this.registry.find(a => a.id === appId);
                resolve(app ? { status: 'ok', latency: 45 } : { status: 'error' });
            }, 500);
        });
    }

    static async syncData(sourceApp, dataType) {
        console.log(`Syncing ${dataType} from ${sourceApp}...`);
        // Simulate data fetch
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    syncedAt: new Date().toISOString(),
                    items: 145,
                    status: 'success'
                });
            }, 1200);
        });
    }

    static getRegistry() {
        return this.registry;
    }
}