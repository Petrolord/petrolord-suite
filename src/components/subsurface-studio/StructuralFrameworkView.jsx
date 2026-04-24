import React, { useState, useEffect, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';

// Components
import StructuralFrameworkToolbar from './structural/StructuralFrameworkToolbar';
import StructuralLayerManager from './structural/StructuralLayerManager';
import FaultModelingPanel from './structural/FaultModelingPanel';
import HorizonModelingPanel from './structural/HorizonModelingPanel';
import GridGenerationPanel from './structural/GridGenerationPanel';
import PropertyModelingPanel from './structural/PropertyModelingPanel';
import StructuralAnalysisPanel from './structural/StructuralAnalysisPanel';
import StructuralFrameworkExportPanel from './structural/StructuralFrameworkExportPanel';

// Utils
import { generateStructuralGrid, distributeProperty } from '@/utils/structuralModelingUtils';

const StructuralCanvasViz = ({ faults, horizons, layers }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = w;
        canvas.height = h;

        ctx.clearRect(0, 0, w, h);
        const cx = w / 2;
        const cy = h / 2;

        // Draw Grid
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        for(let i=0; i<w; i+=50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
        for(let j=0; j<h; j+=50) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke(); }

        // Draw Faults
        if (layers.faults.visible) {
            faults.forEach((f, idx) => {
                ctx.strokeStyle = `rgba(239, 68, 68, ${layers.faults.opacity})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(cx - 100, cy - 100 + idx * 50);
                ctx.lineTo(cx + 100, cy + 100 + idx * 50);
                ctx.stroke();
            });
        }

        // Draw Horizons
        if (layers.horizons.visible) {
            horizons.forEach((hz, idx) => {
                ctx.strokeStyle = `rgba(234, 179, 8, ${layers.horizons.opacity})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let x = -200; x < 200; x += 10) {
                    const y = Math.sin(x / 50) * 20 + idx * 40;
                    if (x === -200) ctx.moveTo(cx + x, cy + y);
                    else ctx.lineTo(cx + x, cy + y);
                }
                ctx.stroke();
            });
        }
    }, [faults, horizons, layers]);

    return <canvas ref={canvasRef} className="w-full h-full absolute inset-0 touch-none" />;
};

const StructuralFrameworkView = () => {
    const { toast } = useToast();
    
    // State
    const [activeTool, setActiveTool] = useState('select');
    const [layers, setLayers] = useState({
        faults: { visible: true, opacity: 0.8 },
        horizons: { visible: true, opacity: 0.8 },
        grids: { visible: true, opacity: 1.0 },
        properties: { visible: true, opacity: 1.0 },
        wells: { visible: true, opacity: 1.0 }
    });
    const [showLayerManager, setShowLayerManager] = useState(false);

    // Model Data
    const [faults, setFaults] = useState([
        { id: 'f1', name: 'Main Boundary Fault', type: 'Normal', dip: 65, throw: 120 }
    ]);
    const [horizons, setHorizons] = useState([
        { id: 'h1', name: 'Top Reservoir', type: 'Seismic', depth: 2500 }
    ]);
    const [grid, setGrid] = useState(null);
    const [activeProperty, setActiveProperty] = useState(null);

    // Selections
    const [activeFault, setActiveFault] = useState(null);
    const [activeHorizon, setActiveHorizon] = useState(null);

    // Actions
    const handleGenerateGrid = (params) => {
        const newGrid = generateStructuralGrid(horizons, faults, params);
        setGrid(newGrid);
        toast({ title: "Grid Generated", description: `${newGrid.points.length} cells created.` });
    };

    const handleRunPropertyModel = (prop, method) => {
        setActiveProperty(prop);
        if(grid) {
            distributeProperty(grid, prop, method); 
            toast({ title: "Property Modeled", description: `${prop} distributed using ${method}.` });
        }
    };

    const handleSaveFault = () => {
        if(activeFault?.id) {
            setFaults(prev => prev.map(f => f.id === activeFault.id ? activeFault : f));
        } else if (activeFault) {
            const newF = { ...activeFault, id: crypto.randomUUID() };
            setFaults(prev => [...prev, newF]);
            setActiveFault(newF);
        }
        toast({ title: "Fault Saved" });
    };

    const handleSaveHorizon = () => {
         if(activeHorizon?.id) {
            setHorizons(prev => prev.map(h => h.id === activeHorizon.id ? activeHorizon : h));
        } else if (activeHorizon) {
            const newH = { ...activeHorizon, id: crypto.randomUUID() };
            setHorizons(prev => [...prev, newH]);
            setActiveHorizon(newH);
        }
        toast({ title: "Horizon Saved" });
    };

    return (
        <div className="flex h-full w-full bg-slate-950 text-white overflow-hidden font-sans flex-col">
            <StructuralFrameworkToolbar 
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
                {/* LEFT PANEL: Modeling Controls */}
                <Panel defaultSize={20} minSize={15} maxSize={30} className="bg-slate-900 border-r border-slate-800 flex flex-col">
                    <ScrollArea className="h-full p-4 space-y-4">
                        {activeTool === 'create_fault' && (
                            <FaultModelingPanel 
                                activeFault={activeFault} 
                                setActiveFault={setActiveFault} 
                                faultList={faults}
                                onSave={handleSaveFault}
                                onDelete={(id) => setFaults(prev => prev.filter(f => f.id !== id))}
                            />
                        )}
                        {activeTool === 'create_horizon' && (
                            <HorizonModelingPanel 
                                activeHorizon={activeHorizon}
                                setActiveHorizon={setActiveHorizon}
                                horizonList={horizons}
                                onSave={handleSaveHorizon}
                                onDelete={(id) => setHorizons(prev => prev.filter(h => h.id !== id))}
                            />
                        )}
                        {activeTool === 'generate_grid' && (
                            <GridGenerationPanel onGenerate={handleGenerateGrid} />
                        )}
                        
                        <PropertyModelingPanel onRunModel={handleRunPropertyModel} />
                        <StructuralAnalysisPanel />
                        <StructuralFrameworkExportPanel />
                    </ScrollArea>
                </Panel>

                <PanelResizeHandle className="w-1 bg-slate-800 hover:bg-cyan-500 transition-colors" />

                {/* CENTER PANEL: Canvas Visualization */}
                <Panel className="relative bg-slate-950">
                    <StructuralCanvasViz faults={faults} horizons={horizons} layers={layers} />

                    {/* Layer Manager Overlay */}
                    {showLayerManager && (
                        <div className="absolute top-4 right-4 w-64 z-10">
                            <StructuralLayerManager layers={layers} setLayers={setLayers} />
                        </div>
                    )}
                </Panel>
            </PanelGroup>
        </div>
    );
};

export default StructuralFrameworkView;