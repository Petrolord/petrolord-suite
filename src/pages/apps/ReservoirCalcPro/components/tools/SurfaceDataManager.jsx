import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mapSurfaceHref, earthModelingSurfaceHref, appPath, MAPPING_ID, EARTH_MODELING_ID } from '@/components/wells/appLinks';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Layers, Trash2, UploadCloud, Check } from 'lucide-react';
import SurfaceImportDialog from './SurfaceImportDialog';
import { surfaceZRange } from '../../services/depthDisplay';
import { useToast } from '@/components/ui/use-toast';

const SurfaceDataManager = ({ preselectSurfaceId = null }) => {
    const { state, appPaths, addSurface, deleteSurface, updateInputs } = useReservoirCalc();
    const { toast } = useToast();
    const [importOpen, setImportOpen] = useState(false);
    // EM5: a linked registry surface opens the import dialog on arrival
    useEffect(() => { if (preselectSurfaceId) setImportOpen(true); }, [preselectSurfaceId]);

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
            <div className="flex justify-between items-center pb-2 border-b border-pl-border">
                <h3 className="text-sm font-bold text-pl-text uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Surfaces Library
                </h3>
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="h-7 text-xs gap-1" data-testid="rcp-import-open">
                    <UploadCloud className="w-3 h-3" /> Import
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {surfacesList.length === 0 && (
                    <div className="text-center py-8 text-pl-muted text-xs italic border border-dashed border-pl-border rounded">
                        No surfaces imported.<br/>Import CSV/XYZ to begin.
                    </div>
                )}

                {surfacesList.map(surface => {
                    const isTop = topSurfaceId === surface.id;
                    const isBase = baseSurfaceId === surface.id;

                    return (
                        <Card key={surface.id} className={`${isTop || isBase ? 'border-l-4 border-l-pl-primary' : ''}`}>
                            <CardContent className="p-3">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="font-medium text-sm text-pl-text">{surface.name}</div>
                                        <div className="text-[10px] text-pl-muted">
                                            {surface.pointCount?.toLocaleString() || 0} pts • {surface.format || 'Grid'}
                                            {surface.crs ? ` • ${surface.crs}` : ''}
                                        </div>
                                        {surface.registryId && (
                                            <div className="flex gap-2 mt-1">
                                                <Link to={mapSurfaceHref(surface.registryId, appPath(MAPPING_ID, appPaths))} data-testid={`rcp-open-mapping-${surface.name}`} title="Open this surface in Mapping & Surface Studio" className="text-[10px] text-pl-primary-text hover:text-pl-primary-text-hover hover:underline">Open in Mapping</Link>
                                                <Link to={earthModelingSurfaceHref(surface.registryId, appPath(EARTH_MODELING_ID, appPaths))} data-testid={`rcp-open-earth-${surface.name}`} title="Stack this surface in Earth Modeling" className="text-[10px] text-pl-primary-text hover:text-pl-primary-text-hover hover:underline">Open in Earth Modeling</Link>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-1">
                                        {isTop && <Badge variant="selected" className="text-[10px] px-1 h-4">TOP</Badge>}
                                        {isBase && <Badge variant="selected" className="text-[10px] px-1 h-4">BASE</Badge>}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 mt-3">
                                    <div className="text-[10px] text-pl-muted">
                                        {(() => {
                                            const zr = surfaceZRange(surface, state.unitSystem);
                                            const fmtZ = (v) => (v == null ? '-' : `${v.toFixed(1)} ${zr.unit}`);
                                            return (
                                                <>
                                                    <div>Min Z: <span className="text-pl-text" data-testid={`rcp-surface-minz-${surface.name}`}>{fmtZ(zr.min)}</span></div>
                                                    <div>Max Z: <span className="text-pl-text" data-testid={`rcp-surface-maxz-${surface.name}`}>{fmtZ(zr.max)}</span></div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                    <div className="flex justify-end items-end gap-1">
                                         <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            className="h-6 w-6 hover:bg-pl-danger-bg hover:text-pl-danger-text"
                                            onClick={() => deleteSurface(surface.id)}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="p-2 bg-pl-sunken flex gap-2">
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
                preselectId={preselectSurfaceId} 
                onImport={handleSurfaceImport}
            />
        </div>
    );
};

export default SurfaceDataManager;