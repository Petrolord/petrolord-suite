import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Box, Layers, Map, RotateCcw } from 'lucide-react';
import { generateWellPath } from '@/utils/petrophysics3DUtils';

const Legend = ({ mode, range, curve }) => {
    if (mode !== 'curve') return null;
    return (
        <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 p-3 rounded-lg text-white w-48 shadow-lg">
            <div className="text-xs font-bold mb-2 flex justify-between">
                <span>{curve}</span>
                <span className="text-slate-400">Log Scale</span>
            </div>
            <div className="h-4 w-full rounded bg-gradient-to-r from-yellow-400 to-green-900 mb-1" 
                 style={{ 
                     background: curve === 'GR' ? 'linear-gradient(to right, #FCD34D, #064E3B)' : 
                                 curve === 'PHIE' ? 'linear-gradient(to right, #FFFFFF, #3B82F6)' : 
                                 'linear-gradient(to right, blue, red)' 
                 }}>
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>{range[0]}</span>
                <span>{range[1]}</span>
            </div>
        </div>
    );
};

// Canvas-based 2.5D renderer
const Canvas25D = ({ wells, wellPaths, vizSettings, hoveredWellId, setHoveredWellId }) => {
    const canvasRef = useRef(null);
    const [view, setView] = useState({ panX: 0, panY: 0, zoom: 0.5 });
    const isDragging = useRef(false);
    const lastMouse = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animationFrameId;

        const draw = () => {
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            canvas.width = width;
            canvas.height = height;

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = vizSettings.backgroundColor || '#020617';
            ctx.fillRect(0, 0, width, height);

            ctx.save();
            ctx.translate(width / 2 + view.panX, height / 2 + view.panY);
            ctx.scale(view.zoom, view.zoom);

            // Isometric projection transform
            // Map 3D (x, y, z) to 2D (isoX, isoY)
            const project = (x, y, z) => {
                const isoX = (x - z) * Math.cos(Math.PI / 6);
                const isoY = (x + z) * Math.sin(Math.PI / 6) - y;
                return { x: isoX, y: isoY };
            };

            // Draw Grid
            if (vizSettings.showGrid) {
                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 1 / view.zoom;
                ctx.beginPath();
                const gridSize = 2000;
                const steps = 10;
                for (let i = -gridSize; i <= gridSize; i += gridSize/steps) {
                    const p1 = project(i, 0, -gridSize);
                    const p2 = project(i, 0, gridSize);
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);

                    const p3 = project(-gridSize, 0, i);
                    const p4 = project(gridSize, 0, i);
                    ctx.moveTo(p3.x, p3.y);
                    ctx.lineTo(p4.x, p4.y);
                }
                ctx.stroke();
            }

            // Draw Wells
            wells.forEach(well => {
                const path = wellPaths[well.id];
                if (!path || path.length < 2) return;

                const isHovered = hoveredWellId === well.id;
                ctx.beginPath();
                const start = project(path[0].x, path[0].y * vizSettings.verticalExaggeration, path[0].z);
                ctx.moveTo(start.x, start.y);

                for (let i = 1; i < path.length; i++) {
                    const p = project(path[i].x, path[i].y * vizSettings.verticalExaggeration, path[i].z);
                    ctx.lineTo(p.x, p.y);
                }

                ctx.strokeStyle = isHovered ? '#3b82f6' : '#64748b';
                ctx.lineWidth = (isHovered ? 4 : 2) / view.zoom;
                ctx.stroke();

                // Draw Well Head
                ctx.fillStyle = isHovered ? '#3b82f6' : '#e2e8f0';
                ctx.beginPath();
                ctx.arc(start.x, start.y, 4 / view.zoom, 0, Math.PI * 2);
                ctx.fill();

                // Text
                if (vizSettings.showWellNames || isHovered) {
                    ctx.fillStyle = isHovered ? '#ffffff' : '#94a3b8';
                    ctx.font = `${12 / view.zoom}px sans-serif`;
                    ctx.fillText(well.name, start.x + 8 / view.zoom, start.y - 8 / view.zoom);
                }
            });

            ctx.restore();
            animationFrameId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animationFrameId);
    }, [wells, wellPaths, vizSettings, view, hoveredWellId]);

    // Interaction Handlers
    const handleWheel = (e) => {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        setView(prev => ({
            ...prev,
            zoom: Math.max(0.01, Math.min(prev.zoom * (1 + delta), 10))
        }));
    };

    const handleMouseDown = (e) => {
        isDragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e) => {
        if (isDragging.current) {
            const dx = e.clientX - lastMouse.current.x;
            const dy = e.clientY - lastMouse.current.y;
            setView(prev => ({
                ...prev,
                panX: prev.panX + dx,
                panY: prev.panY + dy
            }));
            lastMouse.current = { x: e.clientX, y: e.clientY };
        } else {
            // Very simple hit testing (distance from well head)
            const canvas = canvasRef.current;
            if(!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            const cx = width / 2 + view.panX;
            const cy = height / 2 + view.panY;

            let hit = null;
            for (const well of wells) {
                const path = wellPaths[well.id];
                if (!path || path.length < 1) continue;
                
                // Iso projection for hit test
                const isoX = (path[0].x - path[0].z) * Math.cos(Math.PI / 6);
                const isoY = (path[0].x + path[0].z) * Math.sin(Math.PI / 6) - (path[0].y * vizSettings.verticalExaggeration);
                
                const screenX = cx + isoX * view.zoom;
                const screenY = cy + isoY * view.zoom;

                if (Math.hypot(mouseX - screenX, mouseY - screenY) < 10) {
                    hit = well.id;
                    break;
                }
            }
            setHoveredWellId(hit);
        }
    };

    const handleMouseUp = () => isDragging.current = false;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.addEventListener('wheel', handleWheel, { passive: false });
            return () => canvas.removeEventListener('wheel', handleWheel);
        }
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="w-full h-full cursor-move touch-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        />
    );
};

const ThreeDVisualizationPanel = ({ petroState }) => {
    const { wells, markers } = petroState;
    const [hoveredWellId, setHoveredWellId] = useState(null);
    
    const [vizSettings, setVizSettings] = useState({
        verticalExaggeration: 1,
        colorMode: 'trace',
        activeCurve: 'GR',
        showSurfaces: true,
        surfaceOpacity: 0.5,
        showGrid: true,
        showWellNames: true,
        backgroundColor: '#020617'
    });

    const wellPaths = useMemo(() => {
        const paths = {};
        const radius = wells.length * 100; 
        
        wells.forEach((well, idx) => {
            let offset = { 
                x: Math.cos(idx / wells.length * Math.PI * 2) * radius, 
                y: Math.sin(idx / wells.length * Math.PI * 2) * radius 
            };
            const rawPath = generateWellPath(well, offset);
            if (rawPath) {
                paths[well.id] = rawPath;
            }
        });
        return paths;
    }, [wells]);

    const curveRange = useMemo(() => {
        if (vizSettings.colorMode !== 'curve') return [0, 1];
        let min = Infinity, max = -Infinity;
        wells.forEach(w => {
            w.data.forEach(row => {
                const val = row[vizSettings.activeCurve];
                if (val != null) {
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
            });
        });
        return [min === Infinity ? 0 : min, max === -Infinity ? 100 : max];
    }, [wells, vizSettings.colorMode, vizSettings.activeCurve]);

    return (
        <div className="h-full flex flex-col lg:flex-row bg-slate-950 overflow-hidden">
            {/* Controls Sidebar */}
            <div className="w-full lg:w-72 bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col shrink-0 z-10">
                <div className="p-4 border-b border-slate-800">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Box className="w-5 h-5 text-purple-500" /> Visualization
                    </h2>
                    <p className="text-xs text-slate-400">Interactive Canvas Explorer</p>
                </div>
                
                <div className="p-4 space-y-6 overflow-y-auto flex-1">
                    <div className="space-y-3">
                        <Label className="text-white">Display Mode</Label>
                        <Tabs value={vizSettings.colorMode} onValueChange={v => setVizSettings({...vizSettings, colorMode: v})}>
                            <TabsList className="w-full bg-slate-800">
                                <TabsTrigger value="trace" className="flex-1">Trace</TabsTrigger>
                                <TabsTrigger value="curve" className="flex-1">Property</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {vizSettings.colorMode === 'curve' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-left-2">
                            <Label className="text-white">Property Curve</Label>
                            <Select value={vizSettings.activeCurve} onValueChange={v => setVizSettings({...vizSettings, activeCurve: v})}>
                                <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="GR">Gamma Ray (GR)</SelectItem>
                                    <SelectItem value="PHIE">Porosity (PHIE)</SelectItem>
                                    <SelectItem value="SW">Saturation (SW)</SelectItem>
                                    <SelectItem value="RHOB">Density (RHOB)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-4 border-t border-slate-800 pt-4">
                        <Label className="text-white">Scene Layers</Label>
                        
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Map className="w-4 h-4 text-slate-400" />
                                <span className="text-sm text-slate-200">Reference Grid</span>
                            </div>
                            <Switch checked={vizSettings.showGrid} onCheckedChange={c => setVizSettings({...vizSettings, showGrid: c})} />
                        </div>
                    </div>

                    <div className="space-y-3 border-t border-slate-800 pt-4">
                        <Label className="text-white">Vertical Exaggeration (x{vizSettings.verticalExaggeration})</Label>
                        <Slider 
                            value={[vizSettings.verticalExaggeration]} 
                            min={1} max={10} step={0.5} 
                            onValueChange={([v]) => setVizSettings({...vizSettings, verticalExaggeration: v})} 
                        />
                    </div>
                </div>
            </div>

            {/* 2D Canvas Area */}
            <div className="flex-1 relative bg-black">
                <Canvas25D 
                    wells={wells} 
                    wellPaths={wellPaths} 
                    vizSettings={vizSettings} 
                    hoveredWellId={hoveredWellId}
                    setHoveredWellId={setHoveredWellId}
                />
                <Legend mode={vizSettings.colorMode} curve={vizSettings.activeCurve} range={curveRange.map(n => n.toFixed(2))} />
                
                {hoveredWellId && (
                    <div className="absolute top-4 right-4 bg-black/80 text-white p-2 rounded border border-blue-500 text-xs">
                        <div className="font-bold">Active Interaction</div>
                        <div>Well: {wells.find(w => w.id === hoveredWellId)?.name}</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ThreeDVisualizationPanel;