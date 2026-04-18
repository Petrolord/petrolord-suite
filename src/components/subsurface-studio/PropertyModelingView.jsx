import React, { useState, useEffect, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';

// Components
import PropertyModelingToolbar from './property-modeling/PropertyModelingToolbar';
import PropertyLayerManager from './property-modeling/PropertyLayerManager';
import VolumetricCalculationPanel from './property-modeling/VolumetricCalculationPanel';
import PropertyDistributionPanel from './property-modeling/PropertyDistributionPanel';
import UncertaintyAnalysisPanel from './property-modeling/UncertaintyAnalysisPanel';
import PropertyAnalysisPanel from './property-modeling/PropertyAnalysisPanel';
import PropertyExportPanel from './property-modeling/PropertyExportPanel';

// 2D Canvas Grid Viz
const PropertyGridVizCanvas = ({ property, opacity, isVisible }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !isVisible) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = w;
        canvas.height = h;

        ctx.clearRect(0, 0, w, h);
        ctx.globalAlpha = opacity;

        const cellSize = 20;
        const cols = Math.floor(w / cellSize);
        const rows = Math.floor(h / cellSize);

        for (let x = 0; x < cols; x++) {
            for (let y = 0; y < rows; y++) {
                const val = Math.sin(x/5) * Math.cos(y/5) * 0.5 + 0.5;
                let color = '#3b82f6'; // default blue
                if (property === 'porosity') {
                    color = val > 0.7 ? '#10b981' : val > 0.4 ? '#f59e0b' : '#3b82f6';
                } else if (property === 'permeability') {
                    color = val > 0.6 ? '#ef4444' : '#a855f7';
                }
                ctx.fillStyle = color;
                ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
            }
        }
        ctx.globalAlpha = 1.0;
    }, [property, opacity, isVisible]);

    return (
        <canvas ref={canvasRef} className="w-full h-full absolute inset-0 touch-none" />
    );
};

const PropertyModelingView = () => {
    const { toast } = useToast();
    
    // State
    const [activeTool, setActiveTool] = useState('select');
    const [activeProperty, setActiveProperty] = useState('porosity');
    const [layers, setLayers] = useState({
        grid: { visible: true, opacity: 1.0 },
        wells: { visible: true, opacity: 0.8 },
        contacts: { visible: false, opacity: 0.5 },
        uncertainty: { visible: false, opacity: 0.3 }
    });
    const [showLayerManager, setShowLayerManager] = useState(false);

    const handleRunModel = (prop, method) => {
        setActiveProperty(prop);
        toast({ title: "Model Updated", description: `Displaying ${prop} distribution.` });
    };

    return (
        <div className="flex h-full w-full bg-slate-950 text-white overflow-hidden font-sans flex-col">
            <PropertyModelingToolbar 
                activeTool={activeTool} 
                setActiveTool={setActiveTool}
                toggleLayerManager={() => setShowLayerManager(!showLayerManager)}
                onExport={() => toast({title: "Opening Export Dialog"})}
                onUndo={() => toast({title: "Undo"})}
                onRedo={() => toast({title: "Redo"})}
                onReset={() => toast({title: "View Reset"})}
                onZoomIn={() => {}}
                onZoomOut={() => {}}
            />

            <PanelGroup direction="horizontal" className="flex-grow">
                {/* LEFT PANEL: Controls */}
                <Panel defaultSize={25} minSize={20} maxSize={35} className="bg-slate-900 border-r border-slate-800 flex flex-col">
                    <ScrollArea className="h-full p-4 space-y-4">
                        <VolumetricCalculationPanel onCalculate={(val) => console.log("STOIP:", val)} />
                        <PropertyDistributionPanel onRunModel={handleRunModel} />
                        <UncertaintyAnalysisPanel />
                        <PropertyAnalysisPanel property={activeProperty} />
                        <PropertyExportPanel />
                    </ScrollArea>
                </Panel>

                <PanelResizeHandle className="w-1 bg-slate-800 hover:bg-cyan-500 transition-colors" />

                {/* CENTER PANEL: 2D Visualization */}
                <Panel className="relative bg-black">
                    <PropertyGridVizCanvas property={activeProperty} opacity={layers.grid.opacity} isVisible={layers.grid.visible} />

                    {/* Layer Manager Overlay */}
                    {showLayerManager && (
                        <div className="absolute top-4 right-4 w-64 z-10">
                            <PropertyLayerManager layers={layers} setLayers={setLayers} />
                        </div>
                    )}

                    {/* Legend Overlay */}
                    <div className="absolute bottom-4 right-4 bg-slate-900/80 backdrop-blur p-3 rounded border border-slate-800 text-xs shadow-lg">
                        <div className="font-bold mb-2 text-slate-200 capitalize">{activeProperty} Map</div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 rounded-sm"></div> <span>High</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-amber-500 rounded-sm"></div> <span>Medium</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div> <span>Low</span></div>
                        </div>
                    </div>
                </Panel>
            </PanelGroup>
        </div>
    );
};

export default PropertyModelingView;