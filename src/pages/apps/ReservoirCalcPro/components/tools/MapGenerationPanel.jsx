import React, { useState } from 'react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Loader2, Map as MapIcon, Layers, Trash2, Eye } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { MapGenerationEngine } from '../../services/MapGenerationEngine';
import { useReservoirSettings } from '../../hooks/useReservoirSettings';

const MapGenerationPanel = () => {
    const { state, addMaps, deleteMap } = useReservoirCalc();
    const { toast } = useToast();
    const [settings] = useReservoirSettings();
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedMaps, setSelectedMaps] = useState({
        structure: true,
        thickness: true,
        net_pay: true,
        hcpv: true,
        stooip: true,
        giip: false,
        porosity: false,
        sw: false
    });

    const handleToggle = (key) => {
        setSelectedMaps(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // CRITICAL FIX: Check surfaces count safely using Object.keys
    // This handles the surfaces dictionary correctly
    const surfacesCount = state.surfaces ? Object.keys(state.surfaces).length : 0;

    const handleGenerate = async () => {
        if (!state.surfaces) return;

        const topSurface = state.surfaces[state.inputs.topSurfaceId];
        const baseSurface = state.inputs.baseSurfaceId ? state.surfaces[state.inputs.baseSurfaceId] : null;
        
        if (!topSurface) {
            toast({ variant: "destructive", title: "No Surface Selected", description: "Please select a top surface in the Reservoir tab first." });
            return;
        }

        setIsGenerating(true);
        
        setTimeout(() => {
            try {
                const typesToGen = Object.keys(selectedMaps).filter(k => selectedMaps[k]);
                const maps = MapGenerationEngine.generateMaps(
                    topSurface,
                    state.inputs,
                    typesToGen,
                    state.unitSystem,
                    state.aois || [],
                    state.activeAoiId,
                    baseSurface,
                    settings.interpolationMethod
                );

                addMaps(maps);
                const clip = state.activeAoiId ? ' (clipped to active AOI)' : '';
                toast({ title: "Maps Generated", description: `${maps.length} property maps created${clip}. View them via the layer selector in the Visualization panel or the Gallery.` });
            } catch (error) {
                console.error(error);
                toast({ variant: "destructive", title: "Generation Failed", description: error.message });
            } finally {
                setIsGenerating(false);
            }
        }, 100);
    };

    return (
        <div className="h-full flex flex-col p-4 space-y-6 bg-slate-950">
            <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <MapIcon className="w-5 h-5 text-blue-400" /> Map Generator
                </h3>
                <p className="text-sm text-slate-400">Select properties to map across the reservoir grid.</p>
            </div>

            <Card className="bg-slate-900 border-slate-800 p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Geometry</Label>
                        <div className="flex items-center space-x-2">
                            <Checkbox id="m-struct" checked={selectedMaps.structure} onCheckedChange={() => handleToggle('structure')} />
                            <Label htmlFor="m-struct">Structure (Depth)</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox id="m-thick" checked={selectedMaps.thickness} onCheckedChange={() => handleToggle('thickness')} />
                            <Label htmlFor="m-thick">Gross Thickness</Label>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Volumetrics</Label>
                        <div className="flex items-center space-x-2">
                            <Checkbox id="m-hcpv" checked={selectedMaps.hcpv} onCheckedChange={() => handleToggle('hcpv')} />
                            <Label htmlFor="m-hcpv">HCPV Column</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox id="m-stooip" checked={selectedMaps.stooip} onCheckedChange={() => handleToggle('stooip')} />
                            <Label htmlFor="m-stooip">STOOIP Intensity</Label>
                        </div>
                    </div>
                </div>
            </Card>

            <Button 
                className="w-full bg-blue-600 hover:bg-blue-700 h-12"
                onClick={handleGenerate}
                disabled={isGenerating || surfacesCount === 0}
            >
                {isGenerating ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating...</>
                ) : (
                    <><Layers className="w-4 h-4 mr-2" /> Generate Maps</>
                )}
            </Button>

            {surfacesCount === 0 && (
                <div className="p-3 bg-amber-900/20 border border-amber-800 rounded text-amber-200 text-xs">
                    Import a surface in the Surfaces tab to enable map generation.
                </div>
            )}

            {(state.maps?.length > 0) && (
                <div className="flex-1 min-h-0 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-bold text-slate-400 uppercase">Generated Maps ({state.maps.length})</Label>
                    </div>
                    <div className="space-y-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                        {state.maps.map(m => (
                            <div key={m.id} className="flex items-center justify-between p-2 rounded border border-slate-800 bg-slate-900">
                                <div className="min-w-0">
                                    <div className="text-xs font-medium text-slate-200 truncate">{m.name}</div>
                                    <div className="text-[10px] text-slate-500">{m.unit || '—'}</div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <Eye className="w-3.5 h-3.5 text-slate-600" />
                                    <Button
                                        size="icon" variant="ghost"
                                        className="h-6 w-6 text-slate-500 hover:text-red-400"
                                        onClick={() => deleteMap(m.id)}
                                        title="Delete map"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MapGenerationPanel;