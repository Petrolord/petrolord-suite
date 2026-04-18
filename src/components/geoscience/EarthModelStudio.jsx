import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Layers, Sliders, Wrench, Database, Download, 
  Settings, HelpCircle, RefreshCcw, Eye, EyeOff, UploadCloud, 
  FileType2, Play, Save, Plus, Trash2, Maximize2
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

// 2D Stratigraphic Column Viewer replacing the 3D Canvas
const CrossSectionViewer = ({ layers, selectedLayerId, onSelectLayer }) => {
  const visibleLayers = layers.filter(l => l.visible);
  const totalThickness = visibleLayers.reduce((sum, l) => sum + l.thickness, 0) || 1;

  let cumulativeDepth = 0;

  return (
    <div className="w-full h-full flex items-center justify-center p-4 md:p-8 bg-slate-900 overflow-y-auto">
      <div className="relative w-full max-w-md flex flex-col md:flex-row shadow-2xl rounded-xl overflow-hidden border border-slate-800 bg-slate-950 transition-all transform hover:scale-[1.01] duration-300">
        
        {/* Depth Track */}
        <div className="w-16 bg-slate-950 border-r border-slate-800 flex flex-col text-xs text-slate-400 relative z-10 hidden md:flex shrink-0">
          <div className="h-8 flex items-center justify-center border-b border-slate-800 bg-slate-900 font-semibold">MD(m)</div>
          <div className="flex-1 relative w-full flex flex-col">
             {visibleLayers.map((layer) => {
                const startDepth = cumulativeDepth;
                cumulativeDepth += layer.thickness;
                return (
                  <div 
                    key={`depth-${layer.id}`} 
                    className="w-full border-b border-slate-800 relative flex items-start justify-end pr-2 pt-1"
                    style={{ flex: layer.thickness, minHeight: '40px' }}
                  >
                    {Math.round(startDepth)}
                  </div>
                )
             })}
             <div className="absolute bottom-0 right-2 pb-1">{Math.round(cumulativeDepth)}</div>
          </div>
        </div>

        {/* Stratigraphic Layers Track */}
        <div className="flex-1 flex flex-col min-h-[500px]">
          <div className="h-8 flex items-center justify-center border-b border-slate-800 bg-slate-900 font-semibold text-xs text-slate-400">Stratigraphy</div>
          {visibleLayers.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">No visible layers</div>
          ) : (
            visibleLayers.map(layer => {
              const isSelected = selectedLayerId === layer.id;
              // Ensure minimum height for interaction
              const flexShare = Math.max(layer.thickness, totalThickness * 0.05); 
              
              return (
                <div 
                  key={layer.id} 
                  onClick={() => onSelectLayer(layer.id)}
                  className={`w-full group cursor-pointer transition-all duration-200 flex flex-col items-center justify-center relative 
                    ${isSelected ? 'z-20 ring-4 ring-inset ring-white shadow-lg scale-[1.02]' : 'border-b border-black/20 hover:opacity-90'}
                  `}
                  style={{ 
                    flex: flexShare, 
                    backgroundColor: layer.color,
                    backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(0,0,0,0.1))'
                  }}
                  aria-label={`Select layer ${layer.name}`}
                  role="button"
                  tabIndex={0}
                >
                  <span className="text-white font-bold drop-shadow-md pointer-events-none px-4 text-center break-words z-10 text-sm md:text-base">
                    {layer.name}
                  </span>
                  <span className="text-white/80 font-medium drop-shadow-sm pointer-events-none px-4 text-center text-xs mt-1 hidden md:block">
                    {layer.thickness}m
                  </span>
                  
                  {/* Tooltip on Hover */}
                  <div className="absolute hidden group-hover:block bg-slate-950/95 backdrop-blur text-slate-200 text-xs p-3 rounded-lg left-full ml-4 top-1/2 transform -translate-y-1/2 z-50 shadow-2xl border border-slate-700 w-48 pointer-events-none">
                    <p className="font-bold text-white mb-1 border-b border-slate-700 pb-1">{layer.name}</p>
                    <div className="grid grid-cols-2 gap-1 mt-2">
                      <span className="text-slate-400">Thickness:</span><span className="text-right">{layer.thickness}m</span>
                      <span className="text-slate-400">Porosity:</span><span className="text-right">{layer.porosity}%</span>
                      <span className="text-slate-400">Perm:</span><span className="text-right">{layer.permeability}mD</span>
                      <span className="text-slate-400">Sat (Sw):</span><span className="text-right">{layer.saturation}%</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default function EarthModelStudio() {
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
      name: 'New Formation',
      color: '#64748b',
      thickness: 50,
      porosity: 15,
      permeability: 50,
      saturation: 80,
      visible: true
    };
    setLayers([...layers, newLayer]);
    setSelectedLayerId(newId);
    toast({ title: "Layer Added", description: "New formation appended to the sequence." });
  };

  const handleDeleteLayer = (id) => {
    if (layers.length <= 1) {
      toast({ title: "Cannot Delete", description: "You must have at least one layer.", variant: "destructive" });
      return;
    }
    const filtered = layers.filter(l => l.id !== id);
    setLayers(filtered);
    if (selectedLayerId === id) {
      setSelectedLayerId(filtered[0].id);
    }
    toast({ title: "Layer Deleted", description: "Formation removed from the sequence." });
  };

  const showNotImplemented = (feature) => {
    toast({
      title: "Feature Unavailable",
      description: `🚧 ${feature} isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀`,
    });
  };

  const handleExport = () => {
    showNotImplemented("Model Export (PDF/CSV)");
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
              <Layers className="w-5 h-5 md:w-6 md:h-6 text-blue-500" />
              EarthModel Studio
            </h1>
            <p className="text-[10px] md:text-xs text-slate-400 hidden sm:block font-medium">2D Stratigraphic Visualization & Analysis</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setLayers([...initialLayers]); setSelectedLayerId(initialLayers[0].id); }} className="border-slate-700 bg-slate-900 hover:bg-slate-800 hidden md:flex">
            <RefreshCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="border-slate-700 bg-slate-900 hover:bg-slate-800">
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
        
        {/* Left: 2D Visualizer (60%) */}
        <div className="flex-1 relative bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800 min-h-[40vh] lg:min-h-0">
          <div className="absolute top-4 left-4 z-10 bg-slate-950/80 p-3 rounded-lg border border-slate-800 backdrop-blur pointer-events-none shadow-lg hidden sm:block">
            <h3 className="text-sm font-semibold text-white mb-1 flex items-center"><Maximize2 className="w-3 h-3 mr-2 text-blue-400"/> Interactive Viewer</h3>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>Click layers to select and edit</li>
              <li>Hover for detailed properties</li>
              <li>Heights scale proportionally</li>
            </ul>
          </div>
          
          <CrossSectionViewer 
            layers={layers} 
            selectedLayerId={selectedLayerId} 
            onSelectLayer={setSelectedLayerId} 
          />
        </div>

        {/* Right: Control Panel (40%) */}
        <div className="w-full lg:w-[450px] bg-slate-950 flex flex-col shrink-0 h-[60vh] lg:h-auto shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-10">
          <Tabs defaultValue="layers" className="flex-1 flex flex-col h-full">
            <div className="px-4 pt-4 border-b border-slate-800 bg-slate-950 shrink-0">
              <TabsList className="w-full bg-slate-900 border border-slate-800 p-1 rounded-lg">
                <TabsTrigger value="layers" className="flex-1 rounded-md data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all"><Layers className="w-4 h-4 mr-2 hidden sm:block"/>Layers</TabsTrigger>
                <TabsTrigger value="properties" className="flex-1 rounded-md data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all"><Sliders className="w-4 h-4 mr-2 hidden sm:block"/>Props</TabsTrigger>
                <TabsTrigger value="tools" className="flex-1 rounded-md data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all"><Wrench className="w-4 h-4 mr-2 hidden sm:block"/>Tools</TabsTrigger>
                <TabsTrigger value="data" className="flex-1 rounded-md data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all"><Database className="w-4 h-4 mr-2 hidden sm:block"/>Data</TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1 bg-slate-950">
              
              {/* LAYERS TAB */}
              <TabsContent value="layers" className="p-4 space-y-4 m-0 outline-none">
                <Card className="bg-slate-900/50 border-slate-800 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold tracking-wide">Stratigraphic Sequence</CardTitle>
                    <CardDescription>Manage formation visibility and ordering</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {layers.map((layer) => (
                      <div 
                        key={layer.id} 
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all duration-200 shadow-sm ${selectedLayerId === layer.id ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700 hover:bg-slate-900'}`}
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
                      <Plus className="w-4 h-4 mr-2" /> Add Formation
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
                            <CardTitle className="text-sm font-semibold tracking-wide">Formation Properties</CardTitle>
                            <CardDescription>Editing: <span className="text-blue-400 font-semibold">{selectedLayer.name}</span></CardDescription>
                         </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-slate-300 font-medium text-xs uppercase tracking-wider">Formation Name</Label>
                        <Input 
                          value={selectedLayer.name} 
                          onChange={(e) => handleLayerUpdate(selectedLayer.id, 'name', e.target.value)}
                          className="bg-slate-950 border-slate-800 text-slate-100 focus-visible:ring-blue-500"
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
                            className="bg-slate-950 border-slate-800 text-slate-100 focus-visible:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-6 pt-4 border-t border-slate-800/80">
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label className="text-slate-300 font-medium text-xs uppercase tracking-wider">Porosity</Label>
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
                            <Label className="text-slate-300 font-medium text-xs uppercase tracking-wider">Permeability</Label>
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

                      <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 rounded-xl" onClick={() => toast({ title: "Saved", description: "Formation properties updated."})}>
                        <Save className="w-4 h-4 mr-2" /> Apply Changes
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
                    <CardTitle className="text-sm font-semibold tracking-wide">Structural Tools</CardTitle>
                    <CardDescription>Analysis and modeling features</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-950 hover:bg-slate-800 rounded-xl h-12" onClick={() => showNotImplemented("Fault Definition")}>
                      <div className="w-8 flex justify-center"><Wrench className="w-4 h-4 text-red-400" /></div>
                      Define Faults
                    </Button>
                    <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-950 hover:bg-slate-800 rounded-xl h-12" onClick={() => showNotImplemented("Horizon Mapping")}>
                      <div className="w-8 flex justify-center"><Layers className="w-4 h-4 text-green-400" /></div>
                      Map Horizons
                    </Button>
                    <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-950 hover:bg-slate-800 rounded-xl h-12" onClick={() => showNotImplemented("Cross Section")}>
                      <div className="w-8 flex justify-center"><Sliders className="w-4 h-4 text-purple-400" /></div>
                      Generate Cross-Section
                    </Button>
                    <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-950 hover:bg-slate-800 rounded-xl h-12" onClick={() => showNotImplemented("Volumetrics")}>
                      <div className="w-8 flex justify-center"><Database className="w-4 h-4 text-yellow-400" /></div>
                      Volumetrics Calculator
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800 shadow-sm mt-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold tracking-wide">Simulation Engine</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20 h-12" onClick={() => showNotImplemented("Run Flow Simulation")}>
                      <Play className="w-5 h-5 mr-2" /> Run Flow Simulation
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* DATA TAB */}
              <TabsContent value="data" className="p-4 space-y-4 m-0 outline-none">
                <Card className="bg-slate-900/50 border-slate-800 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold tracking-wide">Data Import</CardTitle>
                    <CardDescription>Load external geoscience data to build columns</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div 
                      className="border-2 border-dashed border-slate-700 bg-slate-950/50 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-500 hover:bg-blue-500/5 transition-all group"
                      onClick={() => showNotImplemented("File Upload")}
                    >
                      <div className="p-3 bg-slate-900 rounded-full group-hover:scale-110 transition-transform duration-300 mb-3 shadow-sm border border-slate-800">
                        <UploadCloud className="w-8 h-8 text-blue-400" />
                      </div>
                      <p className="text-sm font-medium text-slate-200">Click or drag files to upload</p>
                      <p className="text-xs text-slate-500 mt-1">Supports LAS, SEGY, CSV, XYZ</p>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800 pb-2">Recent Files</h4>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer" onClick={() => showNotImplemented("Load File")}>
                        <div className="flex items-center gap-3">
                          <FileType2 className="w-5 h-5 text-emerald-400" />
                          <span className="text-sm font-medium text-slate-300">Well_A_Logs.las</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-1 rounded">Loaded</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer" onClick={() => showNotImplemented("Load File")}>
                        <div className="flex items-center gap-3">
                          <FileType2 className="w-5 h-5 text-purple-400" />
                          <span className="text-sm font-medium text-slate-300">Seismic_Inline_450.segy</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-1 rounded">Loaded</span>
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