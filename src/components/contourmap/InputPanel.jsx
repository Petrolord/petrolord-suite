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
import { describeGeoreference } from '@/lib/digitizer/georeference';
import CrsPicker from '@/components/crs/CrsPicker';
import useCrsContext from '@/components/crs/useCrsContext';
import { crsUnit } from '@/lib/crs';

const CollapsibleSection = ({ title, icon, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-pl-surface rounded-lg border border-pl-border">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-3 font-semibold text-pl-text hover:bg-pl-sunken transition-colors">
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
            <div className="p-4 border-t border-pl-border space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const InputPanel = ({ state, setState, onFileUpload, onGeoref, onRemoveControlPoint, onAutoTrace, onDeleteLine, onSetLineValue, onGrid, onPublishSurface, onSaveProject, onLoadProject, onExport, isProcessing, isCvReady, mappingPath = '/dashboard/apps/geoscience/mapping-surface-studio' }) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: onFileUpload, accept: { 'image/*': ['.jpeg', '.jpg', '.png'] }, multiple: false });
  const { projectName, projects, controlPoints, layers, activeLayer, drawMode, gridCellSize, valuesAre, zUnit, surfaceName, results, publishedSurface, pixelToWorld, georef, crs } = state;
  // MAP-U1-008: the world coordinates are in a CRS; the Project CRS by default
  const { crsContext } = useCrsContext();
  const projectTag = crsContext?.projectTag || null;
  React.useEffect(() => {
    if (!crs && projectTag) setState((p) => (p.crs ? p : { ...p, crs: projectTag }));
  }, [crs, projectTag, setState]);
  const xyUnitText = crs ? (crsUnit(crs) === 'm' ? 'm' : 'ft') : 'map units';
  const residualOf = (i) => georef?.residuals?.find((r) => r.index === i);

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex-grow space-y-4 overflow-y-auto pr-2 custom-scrollbar">
        <div {...getRootProps()} id="image-upload-dropzone" className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-pl-primary bg-pl-primary/10' : 'border-pl-border-strong hover:border-pl-primary'}`}>
          <input {...getInputProps()} />
          <UploadCloud className="mx-auto h-8 w-8 text-pl-muted" />
          <p className="mt-2 text-sm text-pl-text">{state.imageFile?.name || 'Drag & drop map image here'}</p>
        </div>

        <CollapsibleSection title="Project Management" icon={<FolderOpen />} defaultOpen>
          <div className="space-y-2">
            <Input placeholder="Project Name" value={projectName} onChange={e => setState(p => ({...p, projectName: e.target.value}))} />
            <Button onClick={onSaveProject} disabled={isProcessing || !projectName} className="w-full"><Save className="w-4 h-4 mr-2" />Save Project</Button>
          </div>
          <div className="flex gap-2">
             <Select onValueChange={onLoadProject} disabled={projects.length === 0}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Load a project..." /></SelectTrigger>
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
          <p className="text-xs text-pl-muted">With no drawing tool active, click the map to place control points (three or more; four or more gives a check), then type each point's map coordinates.</p>
          <div className="space-y-1">
            <Label className="text-pl-muted text-xs">Map coordinates are in</Label>
            <div data-testid="digitizer-crs"><CrsPicker value={crs} onChange={(tag) => setState((p) => ({ ...p, crs: tag, results: null }))} customDefs={crsContext?.customDefs || {}} /></div>
          </div>
          {controlPoints.map((pt, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-pl-text font-semibold">Control Point {i+1}</span>
                {residualOf(i) && !georef.exact && <span className="text-pl-muted" data-testid={`digitizer-gcp-residual-${i}`}>misfit {residualOf(i).error.toFixed(1)} {xyUnitText}</span>}
                <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" aria-label={`Remove control point ${i + 1}`} data-testid={`digitizer-gcp-remove-${i}`} onClick={() => onRemoveControlPoint?.(i)}><Trash2 className="w-3.5 h-3.5 text-pl-danger-text" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Pixel X" value={pt.pixel[0] ? pt.pixel[0].toFixed(2) : ''} readOnly className="bg-pl-sunken h-8" />
                <Input placeholder="Pixel Y" value={pt.pixel[1] ? pt.pixel[1].toFixed(2) : ''} readOnly className="bg-pl-sunken h-8" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor={`world-x-${i}`} className="text-pl-muted">World X</Label>
                  <Input id={`world-x-${i}`} placeholder="e.g., 500000" value={pt.world[0] ?? ''} onChange={e => { const newPoints = [...controlPoints]; newPoints[i].world[0] = e.target.value; setState(p => ({...p, controlPoints: newPoints})); }} type="number" className="h-8" />
                </div>
                <div>
                  <Label htmlFor={`world-y-${i}`} className="text-pl-muted">World Y</Label>
                  <Input id={`world-y-${i}`} placeholder="e.g., 6000000" value={pt.world[1] ?? ''} onChange={e => { const newPoints = [...controlPoints]; newPoints[i].world[1] = e.target.value; setState(p => ({...p, controlPoints: newPoints})); }} type="number" className="h-8" />
                </div>
              </div>
            </div>
          ))}
          <Button onClick={onGeoref} data-testid="digitizer-georef" disabled={isProcessing || controlPoints.length < 3} className="w-full">Set Georeference</Button>
          {georef && <p className="text-xs text-pl-text" data-testid="digitizer-georef-summary">{describeGeoreference(georef, xyUnitText)}</p>}
        </CollapsibleSection>

        <CollapsibleSection title="Digitizing Tools" icon={<Bot />} defaultOpen>
          <p className="text-xs text-pl-muted">Trace a line automatically by dragging a box around it, or draw by hand. Click the tool again to stop.</p>
          <div className="flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => setState(p => ({...p, drawMode: p.drawMode === 'ai_box' ? 'none' : 'ai_box'}))} variant={drawMode === 'ai_box' ? 'secondary' : 'outline'} className="flex-1 disabled:opacity-50" disabled={!isCvReady || isProcessing}><Bot className="w-4 h-4 mr-2" />Auto trace</Button>
                </TooltipTrigger>
                {!isCvReady && <TooltipContent><p>The tracing engine is loading.</p></TooltipContent>}
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
            {layers[activeLayer].length === 0 && <p className="text-center text-xs text-pl-muted py-4">No lines in this layer yet.</p>}
            {layers[activeLayer].map(line => (
              <div key={line.id} className="flex items-center gap-2 p-1 bg-pl-sunken rounded">
                <Input type="number" placeholder={activeLayer === 'faults' ? 'not used' : valuesAre === 'depth' ? 'Depth' : 'Elevation'} value={line.value ?? ''} onChange={e => onSetLineValue(line.id, e.target.value)} className="h-8 text-xs" />
                <span className="text-xs text-pl-muted flex-grow">{line.points.length} pts</span>
                <Button variant="ghost" size="icon" onClick={() => onDeleteLine(line.id)} className="h-8 w-8"><Trash2 className="w-4 h-4 text-pl-danger-text" /></Button>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Grid & Publish" icon={<Grid />} defaultOpen>
          {layers.faults.length > 0 && <p className="text-xs text-pl-warning-text" data-testid="digitizer-faults-note">Fault lines are exported but not used in gridding: the surface is smooth across them.</p>}
          <p className="text-xs text-pl-muted">The contours are gridded with the shared thin-plate spline in the georeferenced frame and can be published to the surface registry, where Mapping & Surface Studio, ReservoirCalc Pro and Earth Modeling read them.</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="values-are">Contour values are</Label>
              <Select value={valuesAre} onValueChange={v => setState(p => ({ ...p, valuesAre: v, results: null }))}>
                <SelectTrigger id="values-are" data-testid="digitizer-values-are" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VALUE_CONVENTIONS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="z-unit">Depth unit</Label>
              <Select value={zUnit} onValueChange={v => setState(p => ({ ...p, zUnit: v }))}>
                <SelectTrigger id="z-unit" data-testid="digitizer-z-unit" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Z_UNITS.map(u => <SelectItem key={u} value={u}>{u === 'm' ? 'metres' : 'feet'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="grid-cell-size">Cell size ({xyUnitText})</Label>
            <Input id="grid-cell-size" data-testid="digitizer-cell" inputMode="decimal" value={gridCellSize} onChange={e => setState(p => ({ ...p, gridCellSize: e.target.value, results: null }))} />
          </div>
          {!pixelToWorld && <p className="text-xs text-pl-warning-text">Set the georeference before gridding.</p>}
          <Button onClick={onGrid} data-testid="digitizer-grid" disabled={isProcessing || !pixelToWorld || layers.contours.filter(l => l.value !== null).length < 2} className="w-full">Grid the contours</Button>
          {results && (
            <div className="text-xs text-pl-text font-pl-mono tabular-nums space-y-1 p-2 rounded bg-pl-sunken" data-testid="digitizer-grid-summary">
              <div>{results.spec.nx} x {results.spec.ny} nodes, cell {results.spec.dx}, {results.stats.count} live</div>
              <div>Elevation {results.stats.min?.toFixed(1)} to {results.stats.max?.toFixed(1)} {zUnit} (negative below datum)</div>
              <div>{results.controlCount} control points from {results.lines} contour lines{results.skipped ? `, ${results.skipped} without a value skipped` : ''}</div>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="surface-name">Surface name</Label>
            <Input id="surface-name" data-testid="digitizer-surface-name" value={surfaceName} placeholder={projectName || 'Digitized surface'} onChange={e => setState(p => ({ ...p, surfaceName: e.target.value }))} />
          </div>
          <Button onClick={onPublishSurface} data-testid="digitizer-publish" disabled={isProcessing || !results} className="w-full" variant="secondary"><UploadCloud className="w-4 h-4 mr-2" />Publish to the surface registry</Button>
          {publishedSurface && (
            <Link to={`${mappingPath}?surface=${publishedSurface.id}`} data-testid="digitizer-open-mapping" className="block text-center text-xs text-pl-primary-text hover:text-pl-primary-text-hover underline">
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