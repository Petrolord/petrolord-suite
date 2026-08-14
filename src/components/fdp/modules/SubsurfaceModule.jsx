import React from 'react';
import { useFDP } from '@/contexts/FDPContext';
import CollapsibleSection from '@/components/fdp/CollapsibleSection';
import ReservesTable from './subsurface/ReservesTable';
import ReservoirProperties from './subsurface/ReservoirProperties';
import PressureTemperature from './subsurface/PressureTemperature';
import GeomechLimits from './subsurface/GeomechLimits';
import { Button } from '@/components/ui/button';
import { RefreshCw, Upload, CheckCircle2 } from 'lucide-react';
import { SubsurfaceDataImporter } from '@/services/fdp/SubsurfaceDataImporter';
import { useToast } from '@/components/ui/use-toast';

const SubsurfaceModule = () => {
    const { state, actions } = useFDP();
    const { subsurface, dataManagement } = state;
    const { toast } = useToast();

    // Helper to update nested subsurface state
    const updateSubsurface = (section, data) => {
        actions.updateSubsurface({ [section]: data });
    };

    const handleImport = async () => {
        try {
            toast({ title: "Importing Subsurface Data", description: "Connecting to reservoir engines..." });
            
            // Mock import
            const ppfgData = await SubsurfaceDataImporter.importFromPPFG();
            const reservesData = await SubsurfaceDataImporter.importFromReservoirSim();
            const faciesData = await SubsurfaceDataImporter.importFromLogFacies();

            // Merge
            actions.updateSubsurface({
                reserves: { ...subsurface.reserves, breakdown: reservesData.reserves },
                properties: { ...subsurface.properties, zones: faciesData.zones },
                geomech: ppfgData.geomech,
                pressureTemp: ppfgData.pressure
            });

            actions.updateDataManagement({
                importStatus: {
                    ...dataManagement.importStatus,
                    ppfg: { status: 'synced', lastSync: new Date().toISOString() },
                    logFacies: { status: 'synced', lastSync: new Date().toISOString() }
                }
            });
            
            toast({ title: "Data Synced", description: "Subsurface model updated from external apps." });
        } catch (e) {
            console.error(e);
            toast({ title: "Sync Failed", description: "Could not retrieve data.", variant: "destructive" });
        }
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">Subsurface & Reserves</h2>
                    <p className="text-slate-400">Characterize the reservoir, estimate reserves, and define geomechanical constraints.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleImport} className="border-slate-700 text-slate-300">
                        <RefreshCw className="w-4 h-4 mr-2" /> Sync Apps
                    </Button>
                    <Button variant="outline" className="border-slate-700 text-slate-300">
                        <Upload className="w-4 h-4 mr-2" /> Import LAS/Excel
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <CollapsibleSection title="Reserves Estimation" defaultOpen>
                <ReservesTable 
                    reserves={subsurface.reserves?.breakdown || []}
                    onChange={(data) => updateSubsurface('reserves', { ...subsurface.reserves, breakdown: data })}
                />
            </CollapsibleSection>

            <CollapsibleSection title="Reservoir Properties">
                <ReservoirProperties 
                    zones={subsurface.properties?.zones || []}
                    onChange={(data) => updateSubsurface('properties', { ...subsurface.properties, zones: data })}
                />
            </CollapsibleSection>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <CollapsibleSection title="Pressure & Temperature">
                    <PressureTemperature 
                        data={subsurface.pressureTemp || {}}
                        onChange={(data) => updateSubsurface('pressureTemp', data)}
                    />
                </CollapsibleSection>

                <CollapsibleSection title="Geomechanics">
                    <GeomechLimits 
                        data={subsurface.geomech || {}}
                        onChange={(data) => updateSubsurface('geomech', data)}
                    />
                </CollapsibleSection>
            </div>
        </div>
    );
};

export default SubsurfaceModule;