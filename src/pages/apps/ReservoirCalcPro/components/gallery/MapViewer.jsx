import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapStorageService } from '../../services/MapStorageService';
import ContourMapViewer from '../tools/ContourMapViewer';
import Surface3DViewer from '../tools/Surface3DViewer';
import { Loader2, ArrowLeft, Download } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const MapViewer = ({ mapData, onClose, isOpen }) => {
    const [fullData, setFullData] = useState(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const loadFullData = async () => {
            if (!mapData?.id) return;
            
            // If data is already loaded in the prop object, use it
            if (mapData.data) {
                setFullData(mapData);
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const result = await MapStorageService.getMapData(mapData.id);
                if (result) {
                    setFullData(result);
                } else {
                    throw new Error("Map data not found");
                }
            } catch (err) {
                console.error(err);
                toast({ variant: "destructive", title: "Load Failed", description: "Could not retrieve full map data." });
                onClose(); // Close if we can't load
            } finally {
                setLoading(false);
            }
        };

        if (isOpen) loadFullData();
    }, [mapData, isOpen, onClose, toast]);

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 max-w-6xl h-[90vh] flex flex-col p-0">
                <DialogHeader className="p-4 border-b border-slate-800 bg-slate-900 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 rounded-full">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <DialogTitle>{mapData?.name || "Map Viewer"}</DialogTitle>
                            <DialogDescription className="hidden md:block">
                                {mapData?.surfaceName ? `Based on: ${mapData.surfaceName}` : "Saved Visualization"}
                            </DialogDescription>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => MapStorageService.exportMap(fullData || mapData)}>
                            <Download className="w-4 h-4 mr-2" /> Export JSON
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 relative overflow-hidden bg-slate-950">
                    {loading ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                        </div>
                    ) : fullData ? (
                        fullData.type === '3d' ? (
                            <Surface3DViewer
                                gridData={fullData.data}
                                unitSystem={fullData.unitSystem || 'field'}
                                colorscale={fullData.colorscale || 'Earth'}
                                zConvention={fullData.inputs?.zConvention || 'elevation'}
                                contacts={{
                                    owc: fullData.inputs?.owc,
                                    goc: fullData.inputs?.goc,
                                    fluidType: fullData.inputs?.fluidType || 'oil',
                                }}
                                title={fullData.surfaceName || fullData.name}
                            />
                        ) : (
                            <ContourMapViewer 
                                gridData={fullData.data} 
                                inputs={fullData.inputs || {}} 
                                unitSystem={fullData.unitSystem || 'field'} 
                            />
                        )
                    ) : (
                         <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                            Failed to render map.
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default MapViewer;