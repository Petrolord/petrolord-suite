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
        <div className="h-full flex flex-col bg-pl-sunken p-2">
            {/* Drawing Tools */}
            <Card className="p-3 mb-2">
                <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-pl-muted">Tools</Label>
                    {state.drawing.isActive ? (
                        <Badge variant="info" className="text-[10px]">Drawing Mode</Badge>
                    ) : (
                        <Badge variant="outline" className="text-[10px]">Idle</Badge>
                    )}
                </div>
                
                {!state.drawing.isActive ? (
                    <>
                        <Button
                            className="w-full h-8 text-xs"
                            onClick={handleStartDraw}
                            disabled={!hasSurface}
                        >
                            <PenTool className="w-3 h-3 mr-2" /> Draw New Polygon
                        </Button>
                        {!hasSurface && (
                            <p className="text-[10px] text-pl-warning-text mt-2 leading-tight">
                                Select a top surface in the Surfaces tab first — AOIs are drawn on the 2D structure map.
                            </p>
                        )}
                    </>
                ) : (
                    <div className="space-y-2">
                        <div className="text-xs text-pl-text text-center bg-pl-sunken p-2 rounded border border-pl-border">
                            <MousePointerClick className="w-3 h-3 inline mr-1" />
                            Click the 2D map to add points ({state.drawing.currentPoints.length})
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="outline" size="sm" className="h-8 text-xs border-pl-danger/40 text-pl-danger-text hover:bg-pl-danger-bg" onClick={cancelDrawing}>
                                <X className="w-3 h-3 mr-1" /> Cancel
                            </Button>
                            <Button size="sm" className="h-8 text-xs" onClick={handleCompleteDraw} disabled={state.drawing.currentPoints.length < 3}>
                                <Check className="w-3 h-3 mr-1" /> Finish
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            {/* AOI List */}
            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-2 bg-pl-surface border border-pl-border border-b-0 rounded-t">
                    <span className="text-xs font-bold text-pl-text">Defined Areas</span>
                    <span className="text-[10px] text-pl-muted">{state.aois.length} Areas</span>
                </div>
                <ScrollArea className="flex-1 bg-pl-surface border border-pl-border rounded-b p-2">
                    {state.aois.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-pl-muted">
                            <MapIcon className="w-8 h-8 mb-2 opacity-20" />
                            <p className="text-xs">No AOIs defined</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {state.aois.map(aoi => (
                                <div key={aoi.id} className={`p-2 rounded border transition-all ${state.activeAoiId === aoi.id ? 'bg-pl-surface border-pl-primary ring-1 ring-pl-primary' : 'bg-pl-surface border-pl-border'}`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: aoi.color }}></div>
                                            <span className="text-xs font-medium text-pl-text" data-testid={`rcp-aoi-row-${aoi.name}`}>{aoi.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button 
                                                size="icon" variant="ghost" className="h-5 w-5 text-pl-muted" 
                                                onClick={() => updateAOI(aoi.id, { visible: !aoi.visible })}
                                            >
                                                {aoi.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                            </Button>
                                            <Button 
                                                size="icon" variant="ghost" className="h-5 w-5 text-pl-muted hover:text-pl-danger-text"
                                                onClick={() => deleteAOI(aoi.id)}
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-pl-muted">
                                        <span>{aoi.vertices.length} points</span>
                                        <div className="flex gap-2">
                                            <button className="hover:text-pl-primary-text-hover underline" onClick={() => exportAOI(aoi)}>Export</button>
                                            <button 
                                                className={`font-medium ${state.activeAoiId === aoi.id ? 'text-pl-primary-text' : 'hover:text-pl-text'}`}
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
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Save Polygon</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Label className="text-xs mb-2 block">AOI Name</Label>
                        <Input 
                            value={newAOIName} 
                            onChange={e => setNewAOIName(e.target.value)} 
                           
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
                        <Button onClick={confirmSave}>Save Area</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AOIPanel;