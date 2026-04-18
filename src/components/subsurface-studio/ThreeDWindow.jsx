import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useStudio } from '@/contexts/StudioContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Layers, Ruler, Palette, Camera, Move3d, Focus, Box, Monitor, Maximize, Lightbulb, Download, Ghost, FileImage as ImageIcon, FileOutput, Settings, PanelLeftClose, PanelLeftOpen, MousePointer2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { useToast } from '@/components/ui/use-toast';

// Simplified 2D Canvas Fallback
const CanvasMapRenderer = ({ renderableAssets, sceneSettings, layers }) => {
    const canvasRef = useRef(null);
    const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
    const isDragging = useRef(false);
    const lastMouse = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let af;

        const draw = () => {
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            canvas.width = w;
            canvas.height = h;

            ctx.fillStyle = sceneSettings.backgroundColor || '#111827';
            ctx.fillRect(0, 0, w, h);

            ctx.save();
            ctx.translate(w / 2 + view.x, h / 2 + view.y);
            ctx.scale(view.zoom, view.zoom);

            if (sceneSettings.showGrid) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.lineWidth = 1 / view.zoom;
                ctx.beginPath();
                for (let i = -1000; i < 1000; i += 100) {
                    ctx.moveTo(i, -1000); ctx.lineTo(i, 1000);
                    ctx.moveTo(-1000, i); ctx.lineTo(1000, i);
                }
                ctx.stroke();
            }

            // Draw assets (Mocked top-down)
            renderableAssets.forEach(asset => {
                if (asset.type === 'well' && layers.wells) {
                    const loc = asset.meta?.location || [0, 0];
                    ctx.fillStyle = asset.meta?.well_color || '#fb923c';
                    ctx.beginPath();
                    ctx.arc(loc[1] * 10, loc[0] * -10, 5 / view.zoom, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = 'white';
                    ctx.font = `${10 / view.zoom}px sans-serif`;
                    ctx.fillText(asset.name, loc[1] * 10 + 8/view.zoom, loc[0] * -10);
                }
                // Polygon/Surface
                if (asset.type === 'surface' && layers.surfaces && asset.meta?.geojson) {
                    const coords = asset.meta.geojson.geometry?.coordinates?.[0];
                    if (coords) {
                        ctx.strokeStyle = sceneSettings.isGhostMode ? 'rgba(52, 211, 153, 0.2)' : '#34d399';
                        ctx.fillStyle = sceneSettings.isGhostMode ? 'transparent' : 'rgba(52, 211, 153, 0.1)';
                        ctx.lineWidth = 2 / view.zoom;
                        ctx.beginPath();
                        coords.forEach((c, i) => {
                            const x = c[0] * 10;
                            const y = c[1] * -10;
                            if (i === 0) ctx.moveTo(x, y);
                            else ctx.lineTo(x, y);
                        });
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                    }
                }
            });

            ctx.restore();
            af = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(af);
    }, [renderableAssets, sceneSettings, layers, view]);

    return (
        <canvas 
            ref={canvasRef} 
            className="w-full h-full cursor-move touch-none"
            onWheel={e => {
                e.preventDefault();
                setView(v => ({ ...v, zoom: Math.max(0.1, Math.min(v.zoom - e.deltaY * 0.001, 10))}));
            }}
            onMouseDown={e => { isDragging.current = true; lastMouse.current = { x: e.clientX, y: e.clientY }; }}
            onMouseMove={e => {
                if (isDragging.current) {
                    setView(v => ({ ...v, x: v.x + e.clientX - lastMouse.current.x, y: v.y + e.clientY - lastMouse.current.y }));
                    lastMouse.current = { x: e.clientX, y: e.clientY };
                }
            }}
            onMouseUp={() => isDragging.current = false}
            onMouseLeave={() => isDragging.current = false}
        />
    );
};


const LayerManager = ({ layers, setLayers }) => {
    return (
        <div className="space-y-3">
            {Object.entries(layers).map(([key, isVisible]) => (
                <div key={key} className="flex items-center justify-between">
                    <Label className="capitalize text-slate-300 cursor-pointer text-xs">{key}</Label>
                    <Switch checked={isVisible} onCheckedChange={() => setLayers(p => ({ ...p, [key]: !p[key] }))} className="scale-75" />
                </div>
            ))}
        </div>
    );
};


const ThreeDWindow = ({ renderableAssets, allAssets, selectedAsset }) => {
    const { toast } = useToast();
    const [isPanelOpen, setPanelOpen] = useState(true);
    const [activeAccordion, setActiveAccordion] = useState("layers");
    
    const [layers, setLayers] = useState({ wells: true, surfaces: true, pointsets: true, trajectories: true });
    
    const [sceneSettings, setSceneSettings] = useState({
        showGrid: true,
        backgroundColor: '#111827',
        isGhostMode: false
    });

    return (
        <div className="w-full h-full flex bg-slate-950 text-white overflow-hidden font-sans">
            {isPanelOpen && (
                <Card className="w-80 flex-shrink-0 bg-slate-900 border-r border-slate-800 rounded-none flex flex-col h-full z-10 shadow-2xl">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 backdrop-blur">
                        <h2 className="font-bold text-sm flex items-center gap-2 text-lime-400 tracking-wide">
                            <Settings className="w-4 h-4" /> MAP CONTROLS
                        </h2>
                    </div>
                    
                    <ScrollArea className="flex-grow">
                        <Accordion type="single" collapsible value={activeAccordion} onValueChange={setActiveAccordion} className="w-full">
                            <AccordionItem value="layers" className="border-b border-slate-800/50">
                                <AccordionTrigger className="px-4 py-3 hover:bg-slate-800/50 text-sm font-medium">
                                    <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-blue-400"/> Layers & Objects</div>
                                </AccordionTrigger>
                                <AccordionContent className="px-4 py-2 bg-slate-950/30">
                                    <LayerManager layers={layers} setLayers={setLayers} />
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="vis" className="border-b border-slate-800/50">
                                <AccordionTrigger className="px-4 py-3 hover:bg-slate-800/50 text-sm font-medium">
                                    <div className="flex items-center gap-2"><Palette className="w-4 h-4 text-purple-400"/> Map Coloring</div>
                                </AccordionTrigger>
                                <AccordionContent className="px-4 py-2 bg-slate-950/30">
                                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800">
                                        <Label className="flex items-center gap-2 text-xs text-slate-300"><Ghost className="w-3 h-3"/> Ghost Mode</Label>
                                        <Switch checked={sceneSettings.isGhostMode} onCheckedChange={(val) => setSceneSettings(p => ({...p, isGhostMode: val}))} className="scale-75" />
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </ScrollArea>
                </Card>
            )}
            
            <div className="flex-grow relative h-full">
                <Button 
                    variant="ghost" size="icon" 
                    className="absolute top-3 left-3 z-20 bg-slate-800/90 hover:bg-slate-700 text-white border border-slate-600 shadow-lg rounded-md" 
                    onClick={() => setPanelOpen(p => !p)}
                >
                    {isPanelOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
                </Button>

                <CanvasMapRenderer renderableAssets={renderableAssets} sceneSettings={sceneSettings} layers={layers} />
            </div>
        </div>
    );
};

export default React.memo(ThreeDWindow);