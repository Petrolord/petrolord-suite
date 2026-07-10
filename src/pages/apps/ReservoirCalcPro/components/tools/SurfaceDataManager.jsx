import React, { useState } from 'react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Layers, Trash2, UploadCloud, Check } from 'lucide-react';
import SurfaceImportDialog from './SurfaceImportDialog';
import { useToast } from '@/components/ui/use-toast';

const SurfaceDataManager = () => {
    const { state, addSurface, deleteSurface, updateInputs } = useReservoirCalc();
    const { toast } = useToast();
    const [importOpen, setImportOpen] = useState(false);

    // FIX: Safely convert surfaces object to array
    // Handles both array (legacy) and object (new) structures safely
    const surfacesList = Array.isArray(state.surfaces) 
        ? state.surfaces 
        : (state.surfaces ? Object.values(state.surfaces) : []);

    const handleSurfaceImport = (surface) => {
        addSurface(surface);
        
        // Auto-assign if no top surface selected
        if (!state.inputs.topSurfaceId) {
            updateInputs({ topSurfaceId: surface.id });
            toast({ 
                title: "Auto-Assigned", 
                description: `${surface.name} set as Top Structure Surface.` 
            });
        } else {
             toast({ 
                title: "Surface Imported", 
                description: `${surface.name} added to library.` 
            });
        }
    };

    const setAsTop = (id) => {
        updateInputs({ topSurfaceId: id });
        toast({ title: "Surface Set", description: "Set as Top Structure Surface" });
    };

    const setAsBase = (id) => {
        updateInputs({ baseSurfaceId: id });
        toast({ title: "Surface Set", description: "Set as Base Surface" });
    };

    const { topSurfaceId, baseSurfaceId } = state.inputs;

    return (
        <div className="space-y-4 h-full flex flex-col">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Surfaces Library
                </h3>
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="h-7 text-xs gap-1">
                    <UploadCloud className="w-3 h-3" /> Import
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {surfacesList.length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-xs italic border border-dashed border-slate-800 rounded">
                        No surfaces imported.<br/>Import CSV/XYZ to begin.
                    </div>
                )}

                {surfacesList.map(surface => {
                    const isTop = topSurfaceId === surface.id;
                    const isBase = baseSurfaceId === surface.id;

                    return (
                        <Card key={surface.id} className={`bg-slate-900 border-slate-800 ${isTop || isBase ? 'border-l-4 border-l-blue-500' : ''}`}>
                            <CardContent className="p-3">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="font-medium text-sm text-slate-200">{surface.name}</div>
                                        <div className="text-[10px] text-slate-500">
                                            {surface.pointCount?.toLocaleString() || 0} pts • {surface.format || 'Grid'}
                                            {surface.crs ? ` • ${surface.crs}` : ''}
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        {isTop && <Badge className="text-[10px] px-1 h-4 bg-blue-900 text-blue-200 hover:bg-blue-800">TOP</Badge>}
                                        {isBase && <Badge className="text-[10px] px-1 h-4 bg-emerald-900 text-emerald-200 hover:bg-emerald-800">BASE</Badge>}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 mt-3">
                                    <div className="text-[10px] text-slate-400">
                                        <div>Min Z: <span className="text-slate-200">{surface.minZ?.toFixed(1) || '-'}</span></div>
                                        <div>Max Z: <span className="text-slate-200">{surface.maxZ?.toFixed(1) || '-'}</span></div>
                                    </div>
                                    <div className="flex justify-end items-end gap-1">
                                         <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            className="h-6 w-6 hover:bg-red-900/20 hover:text-red-400"
                                            onClick={() => deleteSurface(surface.id)}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="p-2 bg-slate-950/30 flex gap-2">
                                <Button 
                                    size="sm" 
                                    variant={isTop ? "secondary" : "outline"} 
                                    className="flex-1 h-6 text-[10px]"
                                    onClick={() => setAsTop(surface.id)}
                                >
                                    {isTop && <Check className="w-3 h-3 mr-1" />} Set Top
                                </Button>
                                <Button 
                                    size="sm" 
                                    variant={isBase ? "secondary" : "outline"} 
                                    className="flex-1 h-6 text-[10px]"
                                    onClick={() => setAsBase(surface.id)}
                                >
                                    {isBase && <Check className="w-3 h-3 mr-1" />} Set Base
                                </Button>
                            </CardFooter>
                        </Card>
                    );
                })}
            </div>

            <SurfaceImportDialog 
                open={importOpen} 
                onOpenChange={setImportOpen} 
                onImport={handleSurfaceImport}
            />
        </div>
    );
};

export default SurfaceDataManager;