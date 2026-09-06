import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadCloud, MapPin, Bot, Pencil, Grid, Save, FolderOpen, Trash2, Download, Layers, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';
import { VALUE_CONVENTIONS, Z_UNITS } from '@/lib/digitizer/contoursToSurface';

const CollapsibleSection = ({ title, icon, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-gray-800/50 rounded-lg border border-white/10">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-3 font-semibold text-teal-300 hover:bg-white/5 transition-colors">
        <span className="flex items-center gap-2">{icon}{title}</span>
        <motion.span animate={{ rotate: isOpen ? 90 : 0 }}>+</motion.span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 border-t border-gray-700 space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const InputPanel = ({ state, setState, onFileUpload, onGeoref, onAutoTrace, onDeleteLine, onSetLineValue, onGrid, onPublishSurface, onSaveProject, onLoadProject, onExport, isProcessing, isCvReady, mappingPath = '/dashboard/apps/geoscience/mapping-surface-studio' }) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: onFileUpload, accept: { 'image/*': ['.jpeg', '.jpg', '.png'] }, multiple: false });
  const { projectName, projects, controlPoints, layers, activeLayer, drawMode, gridCellSize, valuesAre, zUnit, surfaceName, results, publishedSurface, pixelToWorld } = state;

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex-grow space-y-4 overflow-y-auto pr-2 custom-scrollbar">
        <div {...getRootProps()} id="image-upload-dropzone" className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-lime-400 bg-lime-500/10' : 'border-white/20 hover:border-lime-400/50'}`}>
          <input {...getInputProps()} />
          <UploadCloud className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm text-white">{state.imageFile?.name || 'Drag & drop map image here'}</p>
        </div>

        <CollapsibleSection title="Project Management" icon={<FolderOpen />} defaultOpen>
          <div className="space-y-2">
            <Input placeholder="Project Name" value={projectName} onChange={e => setState(p => ({...p, projectName: e.target.value}))} className="bg-white/5 border-white/20" />
            <Button onClick={onSaveProject} disabled={isProcessing || !projectName} className="w-full bg-blue-600 hover:bg-blue-700"><Save className="w-4 h-4 mr-2" />Save Project</Button>
          </div>
          <div className="flex gap-2">
             <Select onValueChange={onLoadProject} disabled={projects.length === 0}>
                <SelectTrigger className="w-full bg-white/5 border-white/20"><SelectValue placeholder="Load a project..." /></SelectTrigger>
                <SelectContent>
                {projects.length > 0 ? (
                    projects.map(p => <SelectItem key={p.id} value={p.id}>{p.project_name} ({new Date(p.created_at).toLocaleDateString()})</SelectItem>)
                ) : (
                    <SelectItem value="none" disabled>No saved projects</SelectItem>
                )}
                </SelectContent>
             </Select>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Geo-Referencing" icon={<MapPin />} defaultOpen>
          <p className="text-xs text-gray-400">Click on the map to set pixel coordinates for control points (min 3).</p>
          {controlPoints.map((pt, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 text-xs">
              <span className="text-lime-300 font-semibold">Control Point {i+1}</span>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Pixel X" value={pt.pixel[0] ? pt.pixel[0].toFixed(2) : ''} readOnly className="bg-gray-700 h-8" />
                <Input placeholder="Pixel Y" value={pt.pixel[1] ? pt.pixel[1].toFixed(2) : ''} readOnly className="bg-gray-700 h-8" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor={`world-x-${i}`} className="text-gray-400">World X</Label>
                  <Input id={`world-x-${i}`} placeholder="e.g., 500000" value={pt.world[0] ?? ''} onChange={e => { const newPoints = [...controlPoints]; newPoints[i].world[0] = e.target.value; setState(p => ({...p, controlPoints: newPoints})); }} type="number" className="bg-white/10 h-8" />
                </div>
                <div>
                  <Label htmlFor={`world-y-${i}`} className="text-gray-400">World Y</Label>
                  <Input id={`world-y-${i}`} placeholder="e.g., 6000000" value={pt.world[1] ?? ''} onChange={e => { const newPoints = [...controlPoints]; newPoints[i].world[1] = e.target.value; setState(p => ({...p, controlPoints: newPoints})); }} type="number" className="bg-white/10 h-8" />
                </div>
              </div>
            </div>
          ))}
          <Button onClick={onGeoref} disabled={isProcessing || controlPoints.length < 3} className="w-full">Set Georeference</Button>
        </CollapsibleSection>

        <CollapsibleSection title="Digitizing Tools" icon={<Bot />} defaultOpen>
          <p className="text-xs text-gray-400">Use AI to trace a region, or draw manually. Click again to deactivate.</p>
          <div className="flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => setState(p => ({...p, drawMode: p.drawMode === 'ai_box' ? 'none' : 'ai_box'}))} variant={drawMode === 'ai_box' ? 'secondary' : 'outline'} className="flex-1 disabled:opacity-50" disabled={!isCvReady || isProcessing}><Bot className="w-4 h-4 mr-2" />AI Trace</Button>
                </TooltipTrigger>
                {!isCvReady && <TooltipContent><p>AI Engine is loading...</p></TooltipContent>}
              </Tooltip>
            </TooltipProvider>
            <Button onClick={() => setState(p => ({...p, drawMode: p.drawMode === 'manual' ? 'none' : 'manual'}))} variant={drawMode === 'manual' ? 'secondary' : 'outline'} className="flex-1"><Pencil className="w-4 h-4 mr-2" />Manual Draw</Button>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Layers & Depths" icon={<Layers />} defaultOpen>
          <Tabs value={activeLayer} onValueChange={v => setState(p => ({...p, activeLayer: v}))}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="contours">Contours ({layers.contours.length})</TabsTrigger>
              <TabsTrigger value="faults">Faults ({layers.faults.length})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="max-h-40 overflow-y-auto space-y-2 p-1 custom-scrollbar">
            {layers[activeLayer].length === 0 && <p className="text-center text-xs text-gray-500 py-4">No lines in this layer yet.</p>}
            {layers[activeLayer].map(line => (
              <div key={line.id} className="flex items-center gap-2 p-1 bg-gray-700/50 rounded">
                <Input type="number" placeholder="Depth" value={line.value ?? ''} onChange={e => onSetLineValue(line.id, e.target.value)} className="h-8 text-xs bg-gray-600" />
                <span className="text-xs text-gray-400 flex-grow">{line.points.length} pts</span>
                <Button variant="ghost" size="icon" onClick={() => onDeleteLine(line.id)} className="h-8 w-8"><Trash2 className="w-4 h-4 text-red-400" /></Button>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Grid & Publish" icon={<Grid />} defaultOpen>
          <p className="text-xs text-gray-400">The contours are gridded with the shared thin-plate spline in the georeferenced frame and can be published to the surface registry, where Mapping & Surface Studio, ReservoirCalc Pro and Earth Modeling read them.</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="values-are">Contour values are</Label>
              <Select value={valuesAre} onValueChange={v => setState(p => ({ ...p, valuesAre: v, results: null }))}>
                <SelectTrigger id="values-are" data-testid="digitizer-values-are" className="w-full bg-white/5 border-white/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VALUE_CONVENTIONS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="z-unit">Depth unit</Label>
              <Select value={zUnit} onValueChange={v => setState(p => ({ ...p, zUnit: v }))}>
                <SelectTrigger id="z-unit" data-testid="digitizer-z-unit" className="w-full bg-white/5 border-white/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Z_UNITS.map(u => <SelectItem key={u} value={u}>{u === 'm' ? 'metres' : 'feet'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="grid-cell-size">Cell size (map units)</Label>
            <Input id="grid-cell-size" data-testid="digitizer-cell" type="number" value={gridCellSize} onChange={e => setState(p => ({ ...p, gridCellSize: parseFloat(e.target.value) || 50, results: null }))} className="bg-white/5 border-white/20" />
          </div>
          {!pixelToWorld && <p className="text-xs text-amber-300">Set the georeference before gridding.</p>}
          <Button onClick={onGrid} data-testid="digitizer-grid" disabled={isProcessing || !pixelToWorld || layers.contours.filter(l => l.value !== null).length < 2} className="w-full">Grid the contours</Button>
          {results && (
            <div className="text-xs text-gray-300 space-y-1 p-2 rounded bg-gray-700/40" data-testid="digitizer-grid-summary">
              <div>{results.spec.nx} x {results.spec.ny} nodes, cell {results.spec.dx}, {results.stats.count} live</div>
              <div>Elevation {results.stats.min?.toFixed(1)} to {results.stats.max?.toFixed(1)} {zUnit} (negative below datum)</div>
              <div>{results.controlCount} control points from {results.lines} contour lines{results.skipped ? `, ${results.skipped} without a value skipped` : ''}</div>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="surface-name">Surface name</Label>
            <Input id="surface-name" data-testid="digitizer-surface-name" value={surfaceName} placeholder={projectName || 'Digitized surface'} onChange={e => setState(p => ({ ...p, surfaceName: e.target.value }))} className="bg-white/5 border-white/20" />
          </div>
          <Button onClick={onPublishSurface} data-testid="digitizer-publish" disabled={isProcessing || !results} className="w-full" variant="secondary"><UploadCloud className="w-4 h-4 mr-2" />Publish to the surface registry</Button>
          {publishedSurface && (
            <Link to={`${mappingPath}?surface=${publishedSurface.id}`} data-testid="digitizer-open-mapping" className="block text-center text-xs text-lime-300 hover:text-lime-200 underline">
              Open {publishedSurface.name} in Mapping & Surface Studio
            </Link>
          )}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button onClick={() => onExport('geojson')} variant="outline" disabled={isProcessing || (layers.contours.length === 0 && layers.faults.length === 0)} className="w-full"><Download className="w-4 h-4 mr-2" />GeoJSON</Button>
            <Button onClick={() => onExport('dxf')} variant="outline" disabled={isProcessing || (layers.contours.length === 0 && layers.faults.length === 0)} className="w-full"><Download className="w-4 h-4 mr-2" />DXF</Button>
          </div>
          <Button onClick={() => onExport('csv')} variant="outline" disabled={isProcessing || layers.contours.length === 0} className="w-full mt-2"><Download className="w-4 h-4 mr-2" />Contour points CSV</Button>
        </CollapsibleSection>
      </div>
    </div>
  );
};

export default InputPanel;