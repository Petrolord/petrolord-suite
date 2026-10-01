import React, { useState } from 'react';
import { NumText } from '@/components/wells/LayoutPanel';
import LayerDetails from './expert/LayerDetails';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, GripVertical, Layers, AlertCircle } from 'lucide-react';
import { useBasinFlow } from '../contexts/BasinFlowContext';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import { depthToDisplay, depthFromDisplay, tidy, fmtDepth } from '../services/units';

const numCls = 'h-7 w-full rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pl-focus';

const LayerCard = ({ layer, index, dispatch, readOnly = false, depthUnit = 'm' }) => {
    const [open, setOpen] = useState(false);
    if (!layer) return null;

    return (
        <Draggable draggableId={layer.id} index={index} isDragDisabled={readOnly}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className="mb-2"
                    style={{ ...provided.draggableProps.style }}
                    data-testid="bf-layer-card"
                    data-layer-name={layer.name}
                >
                    <Card className={`hover:border-pl-border-strong transition-colors ${snapshot.isDragging ? 'border-pl-primary ring-1 ring-pl-primary/50' : ''}`}>
                        <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                                {!readOnly && (
                                    <div 
                                        className="mt-2 text-pl-muted cursor-grab active:cursor-grabbing outline-none"
                                        {...provided.dragHandleProps}
                                    >
                                        <GripVertical className="w-4 h-4" />
                                    </div>
                                )}
                                
                                <div className="flex-1 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <Input 
                                            value={layer.name || ''} 
                                            onChange={(e) => dispatch({ type: 'UPDATE_LAYER', id: layer.id, payload: { name: e.target.value } })}
                                            className="h-8 w-1/2 bg-transparent border-none p-0 font-semibold"
                                            readOnly={readOnly}
                                        />
                                        {!readOnly && (
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-6 w-6 text-pl-muted hover:text-pl-danger-text"
                                                onClick={() => dispatch({ type: 'DELETE_LAYER', id: layer.id })}
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                        <div>
                                            <Label className="text-[10px] text-pl-muted">Start Age (Ma)</Label>
                                            <NumText className={numCls} value={layer.ageStart} data-testid="bf-layer-age-start"
                                                onCommit={(v) => dispatch({ type: 'UPDATE_LAYER', id: layer.id, payload: { ageStart: v, agesGuessed: false } })}
                                                readOnly={readOnly} />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-pl-muted">End Age (Ma)</Label>
                                            <NumText className={numCls} value={layer.ageEnd} data-testid="bf-layer-age-end"
                                                onCommit={(v) => dispatch({ type: 'UPDATE_LAYER', id: layer.id, payload: { ageEnd: v, agesGuessed: false } })}
                                                readOnly={readOnly} />
                                        </div>
                                         <div>
                                            <Label className="text-[10px] text-pl-muted">Thick ({depthUnit})</Label>
                                            <NumText className={numCls} data-testid="bf-layer-thickness"
                                                value={tidy(depthToDisplay(Number(layer.thickness), depthUnit))}
                                                onCommit={(v) => dispatch({ type: 'UPDATE_LAYER', id: layer.id, payload: { thickness: depthFromDisplay(v, depthUnit) } })}
                                                readOnly={readOnly} />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-pl-muted">Lithology</span>
                                            <span className="text-pl-text capitalize">{layer.lithology || 'unknown'}</span>
                                        </div>
                                        <Select 
                                            value={layer.lithology || 'shale'} 
                                            onValueChange={(val) => dispatch({ type: 'UPDATE_LAYER', id: layer.id, payload: { lithology: val } })}
                                            disabled={readOnly}
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

                                    {layer.agesGuessed && (
                                        <div className="text-[11px] text-pl-warning-text" data-testid="bf-layer-ages-guessed">Ages are placeholders from the tops import. Type the deposition ages.</div>
                                    )}
                                    <button type="button" className="text-[11px] text-pl-primary-text hover:underline" data-testid="bf-layer-details-toggle"
                                        onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                                        {open ? 'Hide layer details' : 'Source rock and properties'}
                                    </button>
                                    {open && <LayerDetails layer={layer} dispatch={dispatch} readOnly={readOnly} />}
                                    {/* Safety Check for sourceRock object using optional chaining */}
                                    {layer.sourceRock?.isSource && (
                                         <div className="flex items-center gap-2 p-2 bg-pl-success-bg rounded border border-pl-success/40">
                                            <div className="w-2 h-2 rounded-full bg-pl-success" />
                                            <span className="text-xs text-pl-success-text" data-testid="bf-layer-source-badge">Source rock: TOC {layer.sourceRock.toc ?? 0} wt %, HI {layer.sourceRock.hi ?? 0}</span>
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

const StratigraphyPanel = () => {
    const { state, dispatch, units } = useBasinFlow();

    // Safety check for state
    if (!state || !state.stratigraphy) return <div className="p-4 text-pl-muted">Loading stratigraphy...</div>;

    return (
        <div className="h-full flex flex-col bg-pl-bg border-r border-pl-border w-full max-w-md">
            <div className="p-4 border-b border-pl-border flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-pl-muted" />
                    <h2 className="font-semibold text-pl-text">Stratigraphy</h2>
                </div>
                <Button size="sm" onClick={() => dispatch({ type: 'ADD_LAYER' })}>
                    <Plus className="w-4 h-4 mr-2" /> Add Layer
                </Button>
            </div>
            
            <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full p-4">
                    <Droppable droppableId="stratigraphy-list">
                        {(provided, snapshot) => (
                            <div
                                {...provided.droppableProps}
                                ref={provided.innerRef}
                                className={`min-h-[100px] ${snapshot.isDraggingOver ? 'bg-pl-surface rounded-lg transition-colors' : ''}`}
                            >
                                {state.stratigraphy.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 text-pl-muted border-2 border-dashed border-pl-border rounded-lg">
                                        <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                                        <p className="text-sm">No layers defined</p>
                                    </div>
                                ) : (
                                    state.stratigraphy.map((layer, index) => (
                                        <LayerCard key={layer.id || index} layer={layer} index={index} dispatch={dispatch} depthUnit={units.depth} />
                                    ))
                                )}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </ScrollArea>
            </div>

            <div className="p-4 border-t border-pl-border bg-pl-surface text-xs text-pl-muted">
                <div className="flex justify-between mb-1">
                    <span>Total Thickness:</span>
                    <span className="text-pl-text font-mono" data-testid="bf-total-thickness">
                        {fmtDepth(state.stratigraphy.reduce((acc, l) => acc + (l.thickness || 0), 0), units.depth)} {units.depth}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span>Basal Age:</span>
                    <span className="text-pl-text font-mono">
                        {Math.max(...state.stratigraphy.map(l => l.ageStart || 0), 0)} Ma
                    </span>
                </div>
            </div>
        </div>
    );
};

export default StratigraphyPanel;