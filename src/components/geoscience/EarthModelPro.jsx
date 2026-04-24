import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Layers, Sliders, Wrench, Database, Download, 
  Settings, HelpCircle, RefreshCcw, Eye, EyeOff, UploadCloud, 
  FileType2, Play, Save, Plus, Trash2, Maximize2, Share2, Map as MapIcon, BoxSelect
} from 'lucide-react';

import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';

// Initial Sample Data
const initialLayers = [
  { id: 1, name: 'Overburden', color: '#a0855b', thickness: 100, porosity: 10, permeability: 15, saturation: 100, visible: true },
  { id: 2, name: 'Cap Rock (Shale)', color: '#4b5563', thickness: 30, porosity: 2, permeability: 0.01, saturation: 100, visible: true },
  { id: 3, name: 'Reservoir (Sandstone)', color: '#d9b650', thickness: 150, porosity: 25, permeability: 500, saturation: 40, visible: true },
  { id: 4, name: 'Basement', color: '#2d3748', thickness: 200, porosity: 1, permeability: 0.001, saturation: 100, visible: true }
];

// Interactive HTML5 Canvas Viewer
const CanvasEarthViewer = ({ layers, selectedLayerId, onSelectLayer }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  // View state
  const [view, setView] = useState({ panY: 0, zoom: 1 });
  const isDragging = useRef(false);
  const lastMouseY = useRef(0);
  const animationFrameId = useRef(null);

  // Resize observer
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        const dpr = window.devicePixelRatio || 1;
        
        canvasRef.current.width = clientWidth * dpr;
        canvasRef.current.height = clientHeight * dpr;
        canvasRef.current.style.width = `${clientWidth}px`;
        canvasRef.current.style.height = `${clientHeight}px`;
        
        const ctx = canvasRef.current.getContext('2d');
        ctx.scale(dpr, dpr);
        draw(ctx, clientWidth, clientHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial size

    return () => window.removeEventListener('resize', handleResize);
  }, [layers, selectedLayerId, view]);

  // Main Drawing Function
  const draw = (ctx, width, height) => {
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const visibleLayers = layers.filter(l => l.visible);
    if (visibleLayers.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No visible layers to render.', width / 2, height / 2);
      return;
    }

    const { panY, zoom } = view;
    let currentY = panY + 40; // Top padding

    // Settings for layout
    const axisWidth = 60;
    const propsWidth = 100;
    const maxLayerWidth = width - axisWidth - propsWidth - 40; // 40 is padding
    const layerWidth = Math.min(maxLayerWidth, 400); 
    const startX = axisWidth + 20 + (maxLayerWidth - layerWidth) / 2;

    // Background Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<height; i+=50) {
      ctx.moveTo(axisWidth, i);
      ctx.lineTo(width - propsWidth, i);
    }
    ctx.stroke();

    let cumulativeDepth = 0;

    visibleLayers.forEach(layer => {
      const scaledHeight = layer.thickness * zoom * 2; // base scale
      const isSelected = layer.id === selectedLayerId;

      // Draw Depth Axis Tick
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${cumulativeDepth}m`, axisWidth - 10, currentY + 5);

      // Draw Layer Rectangle
      const x = isSelected ? startX - 10 : startX;
      const w = isSelected ? layerWidth + 20 : layerWidth;
      
      // Gradient for 3D effect
      const grad = ctx.createLinearGradient(x, currentY, x + w, currentY);
      grad.addColorStop(0, '#00000033');
      grad.addColorStop(0.2, layer.color);
      grad.addColorStop(0.8, layer.color);
      grad.addColorStop(1, '#00000044');

      ctx.fillStyle = grad;
      
      // Add subtle shadow for selected
      if (isSelected) {
        ctx.shadowColor = 'rgba(168, 85, 247, 0.5)'; // Purple shadow
        ctx.shadowBlur = 15;
        ctx.shadowOffsetY = 5;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }

      ctx.beginPath();
      ctx.roundRect(x, currentY, w, scaledHeight, 4);
      ctx.fill();

      // Outline
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = isSelected ? 3 : 1;
      ctx.strokeStyle = isSelected ? '#d8b4fe' : 'rgba(0,0,0,0.5)';
      ctx.stroke();

      // Top edge highlight for 3D bevel
      ctx.beginPath();
      ctx.moveTo(x + 4, currentY + 1);
      ctx.lineTo(x + w - 4, currentY + 1);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Text (Layer Name)
      ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.9)';
      ctx.font = `bold ${isSelected ? 16 : 14}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Only draw text if layer is tall enough
      if (scaledHeight > 20) {
        ctx.fillText(layer.name, x + w / 2, currentY + scaledHeight / 2);
      }

      // Draw Properties on the right
      const propsX = startX + w + 20;
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      if (scaledHeight > 40) {
        ctx.fillText(`φ: ${layer.porosity.toFixed(1)}%`, propsX, currentY + scaledHeight / 2 - 15);
        ctx.fillText(`k: ${layer.permeability}mD`, propsX, currentY + scaledHeight / 2);
        ctx.fillText(`Sw: ${layer.saturation}%`, propsX, currentY + scaledHeight / 2 + 15);
      }

      // Advance depth
      currentY += scaledHeight;
      cumulativeDepth += layer.thickness;

      // Draw bottom depth tick for the last layer
      if (layer === visibleLayers[visibleLayers.length - 1]) {
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${cumulativeDepth}m`, axisWidth - 10, currentY);
      }
    });
  };

  // Event Handlers for Interaction
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    setView(prev => ({
      ...prev,
      zoom: Math.max(0.1, Math.min(prev.zoom + delta, 5))
    }));
  };

  const handleMouseDown = (e) => {
    isDragging.current = true;
    lastMouseY.current = e.clientY;
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current) return;
    const deltaY = e.clientY - lastMouseY.current;
    lastMouseY.current = e.clientY;
    
    setView(prev => ({
      ...prev,
      panY: prev.panY + deltaY
    }));
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleClick = (e) => {
    // If we were dragging, ignore the click (could implement drag threshold, keeping it simple)
    const rect = canvasRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    
    let currentY = view.panY + 40;
    const visibleLayers = layers.filter(l => l.visible);
    
    for (let layer of visibleLayers) {
      const scaledHeight = layer.thickness * view.zoom * 2;
      if (clickY >= currentY && clickY <= currentY + scaledHeight) {
        onSelectLayer(layer.id);
        break;
      }
      currentY += scaledHeight;
    }
  };

  const resetView = () => {
    setView({ panY: 0, zoom: 1 });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 overflow-hidden cursor-grab active:cursor-grabbing perspective-1000">
      
      {/* 3D Transform Wrapper */}
      <div className="absolute inset-0 transition-transform duration-300 ease-out" 
           style={{ transform: 'rotateX(5deg) scale(0.98)' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
          className="absolute inset-0 outline-none touch-none"
        />
      </div>

      {/* Viewer Controls Overlay */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2">
         <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded-lg p-2 flex flex-col gap-2 shadow-xl">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => setView(v => ({...v, zoom: Math.min(v.zoom + 0.2, 5)}))}>
               <span className="text-lg">+</span>
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => setView(v => ({...v, zoom: Math.max(v.zoom - 0.2, 0.1)}))}>
               <span className="text-lg">-</span>
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-white" onClick={resetView} title="Reset View">
               <RefreshCcw className="w-4 h-4" />
            </Button>
         </div>
      </div>
    </div>
  );
};

export default function EarthModelPro() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [layers, setLayers] = useState(initialLayers);
  const [selectedLayerId, setSelectedLayerId] = useState(initialLayers[0].id);

  const selectedLayer = layers.find(l => l.id === selectedLayerId) || layers[0];

  const handleLayerUpdate = (id, field, value) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const toggleLayerVisibility = (id) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  };

  const handleAddLayer = () => {
    const newId = Date.now();
    const newLayer = {
      id: newId,
      name: 'New Horizon',
      color: '#8b5cf6',
      thickness: 10,
      porosity: 15,
      permeability: 50,
      saturation: 80,
      visible: true
    };
    setLayers([...layers, newLayer]);
    setSelectedLayerId(newId);
    toast({ title: "Layer Added", description: "New structural horizon appended." });
  };

  const handleDeleteLayer = (id) => {
    if (layers.length <= 1) {
      toast({ title: "Cannot Delete", description: "You must retain at least one layer.", variant: "destructive" });
      return;
    }
    const filtered = layers.filter(l => l.id !== id);
    setLayers(filtered);
    if (selectedLayerId === id) {
      setSelectedLayerId(filtered[0].id);
    }
    toast({ title: "Layer Deleted", description: "Horizon removed from model." });
  };

  const showNotImplemented = (feature) => {
    toast({
      title: "Feature Unavailable",
      description: `🚧 ${feature} isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀`,
    });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md z-20 shrink-0 shadow-sm">
        <div className="flex items-center gap-3 md:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/geoscience')} className="hover:bg-slate-800 text-slate-400 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 tracking-tight">
              <BoxSelect className="w-5 h-5 md:w-6 md:h-6 text-purple-500" />
              EarthModel Pro
            </h1>
            <p className="text-[10px] md:text-xs text-slate-400 hidden sm:block font-medium">Advanced Canvas-based Stratigraphic Modeling</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => showNotImplemented("Share Project")} className="border-slate-700 bg-slate-900 hover:bg-slate-800 hidden md:flex">
            <Share2 className="w-4 h-4 mr-2" /> Share
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setLayers([...initialLayers]); setSelectedLayerId(initialLayers[0].id); }} className="border-slate-700 bg-slate-900 hover:bg-slate-800 hidden lg:flex">
            <RefreshCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
          <Button variant="outline" size="sm" onClick={() => showNotImplemented("Export Options")} className="border-slate-700 bg-slate-900 hover:bg-slate-800">
            <Download className="w-4 h-4 md:mr-2" /> <span className="hidden md:inline">Export</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={() => showNotImplemented("Settings")} className="hidden sm:flex">
            <Settings className="w-5 h-5 text-slate-400" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => showNotImplemented("Help Documentation")}>
            <HelpCircle className="w-5 h-5 text-slate-400" />
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        
        {/* Left: 2D/3D Canvas Visualizer (65%) */}
        <div className="flex-1 relative bg-slate-950 border-b lg:border-b-0 lg:border-r border-slate-800 min-h-[40vh] lg:min-h-0">
          <div className="absolute top-4 left-4 z-10 bg-slate-900/80 p-3 rounded-lg border border-slate-800 backdrop-blur pointer-events-none shadow-lg hidden sm:block">
            <h3 className="text-sm font-semibold text-white mb-1 flex items-center"><Maximize2 className="w-3 h-3 mr-2 text-purple-400"/> Interactive Viewer</h3>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>Click & Drag to Pan</li>
              <li>Scroll to Zoom</li>
              <li>Click layer to select</li>
            </ul>
          </div>

          <div className="absolute bottom-4 right-4 z-10 flex gap-2">
             <Button size="sm" variant="secondary" className="bg-slate-800/80 hover:bg-slate-700 text-white backdrop-blur border border-slate-700 shadow-md" onClick={() => showNotImplemented("Map View")}>
                <MapIcon className="w-4 h-4 mr-2" /> Map
             </Button>
             <Button size="sm" variant="secondary" className="bg-slate-800/80 hover:bg-slate-700 text-white backdrop-blur border border-slate-700 shadow-md" onClick={() => showNotImplemented("Focus Layer")}>
                <Layers className="w-4 h-4 mr-2" /> Focus
             </Button>
          </div>
          
          <CanvasEarthViewer 
            layers={layers} 
            selectedLayerId={selectedLayerId} 
            onSelectLayer={setSelectedLayerId} 
          />
        </div>

        {/* Right: Control Panel (35%) */}
        <div className="w-full lg:w-[450px] bg-slate-950 flex flex-col shrink-0 h-[60vh] lg:h-auto shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-10">
          <Tabs defaultValue="layers" className="flex-1 flex flex-col h-full">
            <div className="px-4 pt-4 border-b border-slate-800 bg-slate-950 shrink-0">
              <TabsList className="w-full bg-slate-900 border border-slate-800 p-1 rounded-lg">
                <TabsTrigger value="layers" className="flex-1 rounded-md data-[state=active]:bg-purple-600 data-[state=active]:text-white transition-all"><Layers className="w-4 h-4 mr-2 hidden sm:block"/>Model</TabsTrigger>
                <TabsTrigger value="properties" className="flex-1 rounded-md data-[state=active]:bg-purple-600 data-[state=active]:text-white transition-all"><Sliders className="w-4 h-4 mr-2 hidden sm:block"/>Props</TabsTrigger>
                <TabsTrigger value="tools" className="flex-1 rounded-md data-[state=active]:bg-purple-600 data-[state=active]:text-white transition-all"><Wrench className="w-4 h-4 mr-2 hidden sm:block"/>Analysis</TabsTrigger>
                <TabsTrigger value="data" className="flex-1 rounded-md data-[state=active]:bg-purple-600 data-[state=active]:text-white transition-all"><Database className="w-4 h-4 mr-2 hidden sm:block"/>Data</TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1 bg-slate-950">
              
              {/* LAYERS TAB */}
              <TabsContent value="layers" className="p-4 space-y-4 m-0 outline-none">
                <Card className="bg-slate-900/50 border-slate-800 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold tracking-wide">Stratigraphic Sequence</CardTitle>
                    <CardDescription>Manage formation bodies and grouping</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {layers.map((layer) => (
                      <div 
                        key={layer.id} 
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all duration-200 shadow-sm ${selectedLayerId === layer.id ? 'border-purple-500 bg-purple-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700 hover:bg-slate-900'}`}
                        onClick={() => setSelectedLayerId(layer.id)}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-4 h-4 rounded-full shrink-0 shadow-inner border border-white/20" style={{ backgroundColor: layer.color }}></div>
                          <span className="text-sm font-medium text-slate-200 truncate">{layer.name}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <span className="text-xs text-slate-500 font-mono w-12 text-right mr-2">{layer.thickness}m</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full"
                            onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }}
                            aria-label={layer.visible ? "Hide layer" : "Show layer"}
                          >
                            {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 opacity-50" />}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-full"
                            onClick={(e) => { e.stopPropagation(); handleDeleteLayer(layer.id); }}
                            aria-label="Delete layer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button variant="outline" className="w-full mt-4 border-slate-700 hover:bg-slate-800 text-slate-300 rounded-xl border-dashed" onClick={handleAddLayer}>
                      <Plus className="w-4 h-4 mr-2" /> Add Horizon
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* PROPERTIES TAB */}
              <TabsContent value="properties" className="p-4 space-y-4 m-0 outline-none">
                {selectedLayer ? (
                  <Card className="bg-slate-900/50 border-slate-800 shadow-sm">
                    <CardHeader className="pb-3 border-b border-slate-800/50 mb-4">
                      <div className="flex items-center gap-3">
                         <div className="w-6 h-6 rounded-md shadow-inner" style={{ backgroundColor: selectedLayer.color }}></div>
                         <div>
                            <CardTitle className="text-sm font-semibold tracking-wide">Property Mapping</CardTitle>
                            <CardDescription>Editing: <span className="text-purple-400 font-semibold">{selectedLayer.name}</span></CardDescription>
                         </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-slate-300 font-medium text-xs uppercase tracking-wider">Formation Name</Label>
                        <Input 
                          value={selectedLayer.name} 
                          onChange={(e) => handleLayerUpdate(selectedLayer.id, 'name', e.target.value)}
                          className="bg-slate-950 border-slate-800 text-slate-100 focus-visible:ring-purple-500"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-slate-300 font-medium text-xs uppercase tracking-wider">Lithology Color</Label>
                          <div className="flex gap-2">
                            <Input 
                              type="color" 
                              value={selectedLayer.color} 
                              onChange={(e) => handleLayerUpdate(selectedLayer.id, 'color', e.target.value)}
                              className="p-1 h-10 w-16 bg-slate-950 border-slate-800 cursor-pointer rounded-md"
                            />
                            <Input 
                              value={selectedLayer.color} 
                              onChange={(e) => handleLayerUpdate(selectedLayer.id, 'color', e.target.value)}
                              className="bg-slate-950 border-slate-800 text-slate-100 uppercase font-mono text-sm"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-slate-300 font-medium text-xs uppercase tracking-wider">Thickness (m)</Label>
                          <Input 
                            type="number" 
                            min="1"
                            value={selectedLayer.thickness} 
                            onChange={(e) => handleLayerUpdate(selectedLayer.id, 'thickness', Math.max(1, parseFloat(e.target.value) || 1))}
                            className="bg-slate-950 border-slate-800 text-slate-100 focus-visible:ring-purple-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-6 pt-4 border-t border-slate-800/80">
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label className="text-slate-300 font-medium text-xs uppercase tracking-wider">Avg Porosity</Label>
                            <span className="text-xs font-mono bg-slate-950 px-2 py-1 rounded border border-slate-800 text-blue-400">{selectedLayer.porosity.toFixed(1)}%</span>
                          </div>
                          <Slider 
                            value={[selectedLayer.porosity]} 
                            max={40} 
                            step={0.1}
                            onValueChange={(val) => handleLayerUpdate(selectedLayer.id, 'porosity', val[0])}
                            className="cursor-pointer"
                            aria-label="Porosity Slider"
                          />
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label className="text-slate-300 font-medium text-xs uppercase tracking-wider">Avg Permeability</Label>
                            <span className="text-xs font-mono bg-slate-950 px-2 py-1 rounded border border-slate-800 text-emerald-400">{selectedLayer.permeability} mD</span>
                          </div>
                          <Slider 
                            value={[selectedLayer.permeability]} 
                            max={2000} 
                            step={1}
                            onValueChange={(val) => handleLayerUpdate(selectedLayer.id, 'permeability', val[0])}
                            className="cursor-pointer"
                            aria-label="Permeability Slider"
                          />
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label className="text-slate-300 font-medium text-xs uppercase tracking-wider">Water Saturation</Label>
                            <span className="text-xs font-mono bg-slate-950 px-2 py-1 rounded border border-slate-800 text-cyan-400">{selectedLayer.saturation}%</span>
                          </div>
                          <Slider 
                            value={[selectedLayer.saturation]} 
                            max={100} 
                            step={1}
                            onValueChange={(val) => handleLayerUpdate(selectedLayer.id, 'saturation', val[0])}
                            className="cursor-pointer"
                            aria-label="Saturation Slider"
                          />
                        </div>
                      </div>

                      <Button className="w-full bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/20 rounded-xl" onClick={() => toast({ title: "Properties Mapped", description: "Property distribution updated."})}>
                        <Save className="w-4 h-4 mr-2" /> Apply Properties
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="flex items-center justify-center h-48 text-slate-500 text-sm">Select a layer to edit its properties.</div>
                )}
              </TabsContent>

              {/* TOOLS TAB */}
              <TabsContent value="tools" className="p-4 space-y-4 m-0 outline-none">
                <Card className="bg-slate-900/50 border-slate-800 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold tracking-wide">Advanced Analysis Tools</CardTitle>
                    <CardDescription>Volumetrics and structural evaluation</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-950 hover:bg-slate-800 rounded-xl h-12" onClick={() => showNotImplemented("Fault Network Extraction")}>
                      <div className="w-8 flex justify-center"><Wrench className="w-4 h-4 text-red-400" /></div>
                      Extract Fault Networks
                    </Button>
                    <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-950 hover:bg-slate-800 rounded-xl h-12" onClick={() => showNotImplemented("Trap Analysis")}>
                      <div className="w-8 flex justify-center"><Layers className="w-4 h-4 text-orange-400" /></div>
                      Structural Trap Analysis
                    </Button>
                    <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-950 hover:bg-slate-800 rounded-xl h-12" onClick={() => showNotImplemented("Grid Generation")}>
                      <div className="w-8 flex justify-center"><BoxSelect className="w-4 h-4 text-blue-400" /></div>
                      Grid Generation
                    </Button>
                    <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-950 hover:bg-slate-800 rounded-xl h-12" onClick={() => showNotImplemented("Volumetrics (GIIP/STOIIP)")}>
                      <div className="w-8 flex justify-center"><Database className="w-4 h-4 text-emerald-400" /></div>
                      Pro Volumetrics Calculator
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800 shadow-sm mt-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold tracking-wide">Machine Learning</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-900/20 h-12" onClick={() => showNotImplemented("Auto-Pick Horizons via ML")}>
                      <Play className="w-5 h-5 mr-2" /> Auto-Pick Horizons
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* DATA TAB */}
              <TabsContent value="data" className="p-4 space-y-4 m-0 outline-none">
                <Card className="bg-slate-900/50 border-slate-800 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold tracking-wide">Data Exchange Hub</CardTitle>
                    <CardDescription>Import well logs, markers, and seismic volumes</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div 
                      className="border-2 border-dashed border-slate-700 bg-slate-950/50 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-purple-500 hover:bg-purple-500/5 transition-all group"
                      onClick={() => showNotImplemented("File Upload")}
                    >
                      <div className="p-3 bg-slate-900 rounded-full group-hover:scale-110 transition-transform duration-300 mb-3 shadow-sm border border-slate-800">
                        <UploadCloud className="w-8 h-8 text-purple-400" />
                      </div>
                      <p className="text-sm font-medium text-slate-200">Drag Files or Browse</p>
                      <p className="text-xs text-slate-500 mt-1">Supports SEGY, VDS, LAS, DEV, CSV</p>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800 pb-2">Integrated Datasets</h4>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer" onClick={() => showNotImplemented("View SEGY")}>
                        <div className="flex items-center gap-3">
                          <FileType2 className="w-5 h-5 text-indigo-400" />
                          <span className="text-sm font-medium text-slate-300">Field_3D_Seismic.segy</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-400/10 border border-indigo-400/20 px-2 py-1 rounded">Indexed</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer" onClick={() => showNotImplemented("View Deviations")}>
                        <div className="flex items-center gap-3">
                          <FileType2 className="w-5 h-5 text-pink-400" />
                          <span className="text-sm font-medium text-slate-300">Well_Trajectories.csv</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-pink-400 bg-pink-400/10 border border-pink-400/20 px-2 py-1 rounded">Mapped</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

            </ScrollArea>
          </Tabs>
        </div>

      </div>
    </div>
  );
}