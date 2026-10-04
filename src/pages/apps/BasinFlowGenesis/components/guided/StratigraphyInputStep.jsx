import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, GripVertical, Layers, AlertCircle } from 'lucide-react';
import { useGuidedMode } from '../../contexts/GuidedModeContext';
import { useBasinFlow } from '../../contexts/BasinFlowContext';
import { depthToDisplay, depthFromDisplay } from '../../services/units';
import UnitNumberInput from '../UnitNumberInput';
import { Droppable, Draggable } from 'react-beautiful-dnd';

const LayerCard = ({ layer, index, updateLayer, removeLayer }) => {
    const { units } = useBasinFlow();
    const depthUnit = units.depth;
    if (!layer) return null;

    return (
        <Draggable draggableId={layer.id} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className="mb-2"
                    style={{ ...provided.draggableProps.style }}
                >
                    <Card className={`hover:border-pl-border-strong transition-colors ${snapshot.isDragging ? 'border-pl-primary ring-1 ring-pl-primary/50' : ''}`}>
                        <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                                <div 
                                    className="mt-2 text-pl-muted cursor-grab active:cursor-grabbing outline-none"
                                    {...provided.dragHandleProps}
                                >
                                    <GripVertical className="w-4 h-4" />
                                </div>
                                
                                <div className="flex-1 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <Input 
                                            value={layer.name || ''} 
                                            onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
                                            className="h-8 w-1/2 bg-transparent border-none p-0 font-semibold"
                                            placeholder="Layer Name"
                                        />
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-6 w-6 text-pl-muted hover:text-pl-danger-text"
                                            onClick={() => removeLayer(layer.id)}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                        <div>
                                            <Label className="text-[10px] text-pl-muted">Start Age (Ma)</Label>
                                            <Input 
                                                type="number" 
                                                value={layer.ageStart || 0} 
                                                onChange={(e) => updateLayer(layer.id, { ageStart: parseFloat(e.target.value) })}
                                                className="h-7 text-xs"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-pl-muted">End Age (Ma)</Label>
                                            <Input 
                                                type="number" 
                                                value={layer.ageEnd || 0} 
                                                onChange={(e) => updateLayer(layer.id, { ageEnd: parseFloat(e.target.value) })}
                                                className="h-7 text-xs"
                                            />
                                        </div>
                                         <div>
                                            <Label className="text-[10px] text-pl-muted">Thick ({depthUnit})</Label>
                                            <UnitNumberInput
                                                data-testid={`bf-guided-layer-thickness-${index}`}
                                                name="Thickness"
                                                unit={depthUnit}
                                                value={layer.thickness || 0}
                                                toDisplay={(m) => depthToDisplay(m, depthUnit)}
                                                fromDisplay={(v) => depthFromDisplay(v, depthUnit)}
                                                onCommit={(thickness) => updateLayer(layer.id, { thickness })}
                                                className="h-7 text-xs"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-pl-muted">Lithology</span>
                                            <span className="text-pl-text capitalize">{layer.lithology}</span>
                                        </div>
                                        <Select 
                                            value={layer.lithology || 'shale'} 
                                            onValueChange={(val) => updateLayer(layer.id, { lithology: val })}
                                        >
                                            <SelectTrigger className="h-7 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="sandstone">Sandstone</SelectItem>
                                                <SelectItem value="shale">Shale</SelectItem>
                                                <SelectItem value="limestone">Limestone</SelectItem>
                                                <SelectItem value="salt">Salt</SelectItem>
                                                <SelectItem value="coal">Coal</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Source Rock Indicator - Using safe navigation */}
                                    {layer.sourceRock?.isSource && (
                                         <div className="flex items-center gap-2 p-2 bg-pl-success-bg rounded border border-pl-success/40">
                                            <div className="w-2 h-2 rounded-full bg-pl-success" />
                                            <span className="text-xs text-pl-success-text">Active Source Rock</span>
                                         </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </Draggable>
    );
};

const StratigraphyInputStep = () => {
    const { wizardData, addLayer, updateLayer, removeLayer } = useGuidedMode();
    const { layers } = wizardData;

    return (
        <div className="h-full flex flex-col space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-semibold text-pl-text">Stratigraphic Column</h2>
                    <p className="text-sm text-pl-muted">Define the geological layers from top (youngest) to bottom (oldest).</p>
                </div>
                <Button size="sm" onClick={addLayer} >
                    <Plus className="w-4 h-4 mr-2" /> Add Layer
                </Button>
            </div>
            
            <Card className="flex-1 overflow-hidden">
                <ScrollArea className="h-full p-4">
                    <Droppable droppableId="guided-stratigraphy-list">
                        {(provided, snapshot) => (
                            <div
                                {...provided.droppableProps}
                                ref={provided.innerRef}
                                className={`min-h-[100px] space-y-2 ${snapshot.isDraggingOver ? 'bg-pl-surface rounded-lg transition-colors' : ''}`}
                            >
                                {(!layers || layers.length === 0) ? (
                                    <div className="flex flex-col items-center justify-center h-40 text-pl-muted border-2 border-dashed border-pl-border rounded-lg">
                                        <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                                        <p className="text-sm">No layers defined</p>
                                    </div>
                                ) : (
                                    layers.map((layer, index) => (
                                        <LayerCard 
                                            key={layer.id || index} 
                                            layer={layer} 
                                            index={index} 
                                            updateLayer={updateLayer}
                                            removeLayer={removeLayer}
                                        />
                                    ))
                                )}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </ScrollArea>
            </Card>
        </div>
    );
};

export default StratigraphyInputStep;