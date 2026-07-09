import React, { useState } from 'react';
import { useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Eye, EyeOff, PenTool, Check, X, Map as MapIcon, MousePointerClick } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AOIManager } from '../services/AOIManager';

const AOIPanel = () => {
    const { 
        state, 
        addAOI, updateAOI, deleteAOI, setActiveAOI,
        startDrawing, cancelDrawing, finishDrawing 
    } = useReservoirCalc();
    
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [newAOIName, setNewAOIName] = useState('New AOI');

    const hasSurface = Object.keys(state.surfaces || {}).length > 0 && state.inputs?.topSurfaceId;

    const handleStartDraw = () => {
        startDrawing();
    };

    const handleCompleteDraw = () => {
        if (state.drawing.currentPoints.length < 3) return;
        setNewAOIName(`AOI ${state.aois.length + 1}`);
        setSaveDialogOpen(true);
    };

    const confirmSave = () => {
        finishDrawing(newAOIName);
        setSaveDialogOpen(false);
    };

    const exportAOI = (aoi) => {
        const geoJson = AOIManager.exportGeoJSON(aoi);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geoJson));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `${aoi.name}.geojson`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    return (
        <div className="h-full flex flex-col bg-slate-950 p-2">
            {/* Drawing Tools */}
            <Card className="p-3 bg-slate-900 border-slate-800 mb-2">
                <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-slate-400">Tools</Label>
                    {state.drawing.isActive ? (
                        <Badge variant="secondary" className="bg-emerald-900 text-emerald-400 text-[10px]">Drawing Mode</Badge>
                    ) : (
                        <Badge variant="outline" className="text-[10px]">Idle</Badge>
                    )}
                </div>
                
                {!state.drawing.isActive ? (
                    <>
                        <Button
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs disabled:opacity-50"
                            onClick={handleStartDraw}
                            disabled={!hasSurface}
                        >
                            <PenTool className="w-3 h-3 mr-2" /> Draw New Polygon
                        </Button>
                        {!hasSurface && (
                            <p className="text-[10px] text-amber-400/80 mt-2 leading-tight">
                                Select a top surface in the Surfaces tab first — AOIs are drawn on the 2D structure map.
                            </p>
                        )}
                    </>
                ) : (
                    <div className="space-y-2">
                        <div className="text-xs text-slate-300 text-center bg-slate-950 p-2 rounded border border-slate-800">
                            <MousePointerClick className="w-3 h-3 inline mr-1" />
                            Click the 2D map to add points ({state.drawing.currentPoints.length})
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="outline" size="sm" className="h-8 text-xs border-red-900/50 text-red-400 hover:bg-red-900/20" onClick={cancelDrawing}>
                                <X className="w-3 h-3 mr-1" /> Cancel
                            </Button>
                            <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={handleCompleteDraw} disabled={state.drawing.currentPoints.length < 3}>
                                <Check className="w-3 h-3 mr-1" /> Finish
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            {/* AOI List */}
            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-2 bg-slate-900 border border-slate-800 border-b-0 rounded-t">
                    <span className="text-xs font-bold text-slate-300">Defined Areas</span>
                    <span className="text-[10px] text-slate-500">{state.aois.length} Areas</span>
                </div>
                <ScrollArea className="flex-1 bg-slate-900 border border-slate-800 rounded-b p-2">
                    {state.aois.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-slate-600">
                            <MapIcon className="w-8 h-8 mb-2 opacity-20" />
                            <p className="text-xs">No AOIs defined</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {state.aois.map(aoi => (
                                <div key={aoi.id} className={`p-2 rounded border transition-all ${state.activeAoiId === aoi.id ? 'bg-blue-900/20 border-blue-500/50' : 'bg-slate-950 border-slate-800'}`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: aoi.color }}></div>
                                            <span className="text-xs font-medium text-slate-200">{aoi.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button 
                                                size="icon" variant="ghost" className="h-5 w-5 text-slate-500" 
                                                onClick={() => updateAOI(aoi.id, { visible: !aoi.visible })}
                                            >
                                                {aoi.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                            </Button>
                                            <Button 
                                                size="icon" variant="ghost" className="h-5 w-5 text-slate-500 hover:text-red-400"
                                                onClick={() => deleteAOI(aoi.id)}
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                                        <span>{aoi.vertices.length} points</span>
                                        <div className="flex gap-2">
                                            <button className="hover:text-blue-400 underline" onClick={() => exportAOI(aoi)}>Export</button>
                                            <button 
                                                className={`font-medium ${state.activeAoiId === aoi.id ? 'text-blue-400' : 'hover:text-slate-300'}`}
                                                onClick={() => setActiveAOI(state.activeAoiId === aoi.id ? null : aoi.id)}
                                            >
                                                {state.activeAoiId === aoi.id ? 'Active' : 'Select'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </div>

            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white">
                    <DialogHeader>
                        <DialogTitle>Save Polygon</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Label className="text-xs mb-2 block">AOI Name</Label>
                        <Input 
                            value={newAOIName} 
                            onChange={e => setNewAOIName(e.target.value)} 
                            className="bg-slate-950 border-slate-700"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
                        <Button onClick={confirmSave} className="bg-blue-600 hover:bg-blue-700">Save Area</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AOIPanel;