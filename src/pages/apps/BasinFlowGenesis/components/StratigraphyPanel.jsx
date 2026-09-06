import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, GripVertical, Layers, AlertCircle } from 'lucide-react';
import { useBasinFlow } from '../contexts/BasinFlowContext';
import { Droppable, Draggable } from 'react-beautiful-dnd';

const LayerCard = ({ layer, index, dispatch, readOnly = false }) => {
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
                    <Card className={`bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors ${snapshot.isDragging ? 'border-indigo-500 ring-1 ring-indigo-500/50' : ''}`}>
                        <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                                {!readOnly && (
                                    <div 
                                        className="mt-2 text-slate-500 cursor-grab active:cursor-grabbing outline-none"
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
                                            className="h-8 w-1/2 bg-transparent border-none focus:bg-slate-950 p-0 font-semibold text-white"
                                            readOnly={readOnly}
                                        />
                                        {!readOnly && (
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-6 w-6 text-slate-500 hover:text-red-400"
                                                onClick={() => dispatch({ type: 'DELETE_LAYER', id: layer.id })}
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                        <div>
                                            <Label className="text-[10px] text-slate-400">Start Age (Ma)</Label>
                                            <Input 
                                                type="number" 
                                                value={layer.ageStart || 0} 
                                                onChange={(e) => dispatch({ type: 'UPDATE_LAYER', id: layer.id, payload: { ageStart: parseFloat(e.target.value) } })}
                                                className="h-7 bg-slate-950 text-xs"
                                                readOnly={readOnly}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-slate-400">End Age (Ma)</Label>
                                            <Input 
                                                type="number" 
                                                value={layer.ageEnd || 0} 
                                                onChange={(e) => dispatch({ type: 'UPDATE_LAYER', id: layer.id, payload: { ageEnd: parseFloat(e.target.value) } })}
                                                className="h-7 bg-slate-950 text-xs"
                                                readOnly={readOnly}
                                            />
                                        </div>
                                         <div>
                                            <Label className="text-[10px] text-slate-400">Thick (m)</Label>
                                            <Input 
                                                type="number" 
                                                value={layer.thickness || 0} 
                                                onChange={(e) => dispatch({ type: 'UPDATE_LAYER', id: layer.id, payload: { thickness: parseFloat(e.target.value) } })}
                                                className="h-7 bg-slate-950 text-xs"
                                                readOnly={readOnly}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400">Lithology</span>
                                            <span className="text-slate-200 capitalize">{layer.lithology || 'unknown'}</span>
                                        </div>
                                        <Select 
                                            value={layer.lithology || 'shale'} 
                                            onValueChange={(val) => dispatch({ type: 'UPDATE_LAYER', id: layer.id, payload: { lithology: val } })}
                                            disabled={readOnly}
                                        >
                                            <SelectTrigger className="h-7 bg-slate-950 text-xs border-slate-800">
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

                                    {/* Safety Check for sourceRock object using optional chaining */}
                                    {layer.sourceRock?.isSource && (
                                         <div className="flex items-center gap-2 p-2 bg-green-900/20 rounded border border-green-900/50">
                                            <div className="w-2 h-2 rounded-full bg-green-500" />
                                            <span className="text-xs text-green-400">Active Source Rock (TOC: {layer.sourceRock.toc || 0}%)</span>
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
    const { state, dispatch } = useBasinFlow();

    // Safety check for state
    if (!state || !state.stratigraphy) return <div className="p-4 text-slate-500">Loading stratigraphy...</div>;

    return (
        <div className="h-full flex flex-col bg-slate-950 border-r border-slate-800 w-full max-w-md">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-blue-400" />
                    <h2 className="font-semibold text-white">Stratigraphy</h2>
                </div>
                <Button size="sm" onClick={() => dispatch({ type: 'ADD_LAYER' })} className="bg-blue-600 hover:bg-blue-700">
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
                                className={`min-h-[100px] ${snapshot.isDraggingOver ? 'bg-slate-900/50 rounded-lg transition-colors' : ''}`}
                            >
                                {state.stratigraphy.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 text-slate-500 border-2 border-dashed border-slate-800 rounded-lg">
                                        <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                                        <p className="text-sm">No layers defined</p>
                                    </div>
                                ) : (
                                    state.stratigraphy.map((layer, index) => (
                                        <LayerCard key={layer.id || index} layer={layer} index={index} dispatch={dispatch} />
                                    ))
                                )}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </ScrollArea>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900/50 text-xs text-slate-400">
                <div className="flex justify-between mb-1">
                    <span>Total Thickness:</span>
                    <span className="text-white font-mono">
                        {state.stratigraphy.reduce((acc, l) => acc + (l.thickness || 0), 0).toLocaleString()} m
                    </span>
                </div>
                <div className="flex justify-between">
                    <span>Basal Age:</span>
                    <span className="text-white font-mono">
                        {Math.max(...state.stratigraphy.map(l => l.ageStart || 0), 0)} Ma
                    </span>
                </div>
            </div>
        </div>
    );
};

export default StratigraphyPanel;