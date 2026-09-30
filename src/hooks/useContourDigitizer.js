import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/customSupabaseClient';
import { fitGeoreference, describeGeoreference } from '@/lib/digitizer/georeference';
import { contoursGeoJSON, contoursDXF, contoursCSV } from '@/lib/digitizer/contourExport';
import { crsUnit } from '@/lib/crs';
import { useOpenCv } from '@/hooks/useOpenCv';
import { processImageWithOpenCv, dp } from '@/utils/digitizerOpenCv';
import { planDigitizedSurface, digitizedSurfacePayload } from '@/lib/digitizer/contoursToSurface';
import { saveSurface } from '@/lib/surfacesRegistry';
import { layersFromSaved } from '@/lib/digitizer/savedProject';

const downloadText = (text, fileName, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};



// Mapping MS5 (2026-09-06): the manual-draw, value, delete, grid and
// load handlers had been dropped in an early import cleanup, so the
// page called undefined; they are back. The grid now runs on the shared
// thin-plate spline in the map's world frame and can be published to
// geo_surfaces under the registry convention (elevation, unit per row).

const useContourDigitizer = (toast) => {
  const [state, setState] = useState({
    id: null,
    imageFile: null,
    imagePreview: null,
    imageDimensions: { width: 0, height: 0 },
    projectName: '',
    projects: [],
    controlPoints: [],
    geoTransform: null,
    pixelToWorld: null,
    layers: { contours: [], faults: [] },
    activeLayer: 'contours',
    drawMode: 'none',
    currentLine: [],
    gridCellSize: '50',      // map units (the georeferenced frame), kept as typed (MAP-U1-010)
    georef: null,            // MAP-U1-005: the fitted transform, residuals and RMS
    crs: null,               // MAP-U1-008: the CRS the world coordinates are in
    valuesAre: 'depth',      // how the contour values were read off the map
    zUnit: 'm',
    surfaceName: '',
    results: null,           // { spec, grid, stats, ... } from planDigitizedSurface
    publishedSurface: null,  // geo_surfaces row after Publish
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const imgCanvasRef = useRef(null);
  const ovrCanvasRef = useRef(null);
  const jobRef = useRef({ cancelled: false });
  const { isCvReady } = useOpenCv();
  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchProjects = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('contour_projects')
      .select('id, project_name, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Error fetching projects', description: error.message, variant: 'destructive' });
    } else {
      setState(p => ({ ...p, projects: data || [] }));
    }
  }, [toast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleFileUpload = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // MAP-U1-006: a loaded project has its lines and control points but
          // no image (the table never stored one); the image goes under them
          const cur = stateRef.current;
          const hasWork = cur.id && !cur.imagePreview && (cur.layers.contours.length || cur.layers.faults.length || cur.controlPoints.length);
          if (hasWork) {
            const was = cur.savedImage;
            if (was?.width && (was.width !== img.width || was.height !== img.height)) {
              toast({ title: 'Different image size', description: `This image is ${img.width} x ${img.height} pixels; the project was digitized on ${was.width} x ${was.height}. The lines will not sit on it.`, variant: 'destructive' });
            } else {
              toast({ title: 'Image attached', description: `The map image is under ${cur.projectName}'s lines and control points. Check that the lines sit on the contours.` });
            }
            setState((p) => ({ ...p, imageFile: file, imagePreview: e.target.result, imageDimensions: { width: img.width, height: img.height } }));
            return;
          }
          setState(p => ({
            ...p,
            id: null,
            imageFile: file,
            imagePreview: e.target.result,
            imageDimensions: { width: img.width, height: img.height },
            projectName: file.name.split('.').slice(0, -1).join('.'),
            controlPoints: [],
            geoTransform: null,
            pixelToWorld: null,
            layers: { contours: [], faults: [] },
            georef: null,
            results: null,
          }));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }, [toast]);

  // MAP-U1-005: least-squares affine through every control point, with
  // the residuals and RMS said; the old fit used two points and no rotation
  const handleGeoref = useCallback(() => {
    try {
      const g = fitGeoreference(state.controlPoints);
      setState(p => ({ ...p, georef: g, geoTransform: g.transform, pixelToWorld: g.pixelToWorld, results: null }));
      const unit = state.crs ? (crsUnit(state.crs) === 'm' ? 'm' : 'ft') : 'map units';
      toast({ title: 'Georeference set', description: describeGeoreference(g, unit) });
    } catch (error) {
      toast({ title: 'Georeferencing failed', description: error.message, variant: 'destructive' });
    }
  }, [state.controlPoints, state.crs, toast]);

  const handleRemoveControlPoint = useCallback((index) => {
    setState(p => ({ ...p, controlPoints: p.controlPoints.filter((_, i) => i !== index), georef: null, geoTransform: null, pixelToWorld: null, results: null }));
  }, []);

  const handleAutoTrace = useCallback(async (box) => {
    if (!state.imagePreview || !isCvReady) {
      toast({ title: 'Error', description: 'Image or processing engine not ready.', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    jobRef.current.cancelled = false;
    try {
      const imageElement = new Image();
      imageElement.src = state.imagePreview;
      await new Promise(resolve => imageElement.onload = resolve);
      const roiRect = { x1: box.startX, y1: box.startY, x2: box.startX + box.w, y2: box.startY + box.h };
      const points = await processImageWithOpenCv(imageElement, roiRect, { TOL: 1.0 }, jobRef, () => {});
      if (points) {
        const newLine = { id: uuidv4(), points: dp(points, 2), value: null };
        setState(p => ({
          ...p,
          layers: { ...p.layers, [p.activeLayer]: [...p.layers[p.activeLayer], newLine] },
          drawMode: 'none',
        }));
        toast({ title: 'Trace Complete' });
      }
    } catch (error) {
      toast({ title: 'Trace Failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  }, [state.imagePreview, state.activeLayer, isCvReady, toast]);

  const handleManualDraw = useCallback((points) => {
    if (!points || points.length < 2) return;
    const newLine = { id: uuidv4(), points, value: null };
    setState(p => ({
      ...p,
      layers: { ...p.layers, [p.activeLayer]: [...p.layers[p.activeLayer], newLine] },
      results: null,
    }));
  }, []);

  const handleDeleteLine = useCallback((id) => {
    setState(p => ({
      ...p,
      layers: {
        contours: p.layers.contours.filter(l => l.id !== id),
        faults: p.layers.faults.filter(l => l.id !== id),
      },
      results: null,
    }));
  }, []);

  const handleSetLineValue = useCallback((id, value) => {
    const val = value === '' ? null : parseFloat(value);
    setState(p => ({
      ...p,
      layers: {
        contours: p.layers.contours.map(l => (l.id === id ? { ...l, value: val } : l)),
        faults: p.layers.faults.map(l => (l.id === id ? { ...l, value: val } : l)),
      },
      results: null,
    }));
  }, []);

  const handleGrid = useCallback(() => {
    try {
      const plan = planDigitizedSurface(state.layers, state.pixelToWorld, {
        valuesAre: state.valuesAre, cellSize: Number(state.gridCellSize),
      });
      setState(p => ({ ...p, results: plan, publishedSurface: null }));
      toast({
        title: 'Surface gridded',
        description: `${plan.spec.nx} x ${plan.spec.ny} nodes at ${plan.spec.dx} map units from ${plan.controlCount} contour points on ${plan.lines} lines.${state.layers.faults.length ? ` The ${state.layers.faults.length} fault line${state.layers.faults.length === 1 ? ' is' : 's are'} exported but not used in gridding.` : ''}`,
      });
    } catch (error) {
      toast({ title: 'Could not grid', description: error.message, variant: 'destructive' });
    }
  }, [state.layers, state.pixelToWorld, state.valuesAre, state.gridCellSize, toast]);

  const handlePublishSurface = useCallback(async () => {
    if (!state.results) {
      toast({ title: 'Grid first', description: 'Generate the grid, then publish it.', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    setStatus('Publishing the surface to the registry...');
    try {
      const payload = digitizedSurfacePayload(state.results, {
        name: state.surfaceName || state.projectName,
        zUnit: state.zUnit,
        valuesAre: state.valuesAre,
        imageName: state.imageFile?.name || state.map_image_url || null,
        crs: state.crs || null,
      });
      const row = await saveSurface(payload);
      setState(p => ({ ...p, publishedSurface: row }));
      toast({ title: 'Surface published', description: `${row.name} is in the registry. Open it in Mapping & Surface Studio to contour, edit and export it.` });
    } catch (error) {
      toast({ title: 'Publish failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      setStatus('');
    }
  }, [state.results, state.surfaceName, state.projectName, state.zUnit, state.valuesAre, state.imageFile, state.map_image_url, state.crs, toast]);

  const handleLoadProject = useCallback(async (projectId) => {
    if (!projectId || projectId === 'none') return;
    setIsProcessing(true);
    setStatus('Loading project...');
    try {
      const { data, error } = await supabase.from('contour_projects').select('*').eq('id', projectId).single();
      if (error) throw error;
      // MAP-U1-006: older rows, settings, and the georeference rebuilt
      const { layers, settings } = layersFromSaved(data.contours);
      const controlPoints = Array.isArray(data.geo_points) ? data.geo_points : [];
      let georef = null;
      try { georef = fitGeoreference(controlPoints); } catch { georef = null; }
      setState(p => ({
        ...p,
        id: data.id,
        projectName: data.project_name,
        imagePreview: data.map_image_url || null,
        map_image_url: data.map_image_url || null,
        imageFile: null,
        savedImage: settings.image || null,
        controlPoints,
        georef,
        geoTransform: georef ? georef.transform : null,
        pixelToWorld: georef ? georef.pixelToWorld : null,
        layers,
        valuesAre: settings.valuesAre === 'elevation' ? 'elevation' : 'depth',
        zUnit: settings.zUnit === 'ft' ? 'ft' : 'm',
        crs: settings.crs || null,
        surfaceName: settings.surfaceName || '',
        gridCellSize: String(data.grid_cell_size || 50),
        results: null,
        publishedSurface: null,
      }));
      if (data.map_image_url) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => setState(p => ({ ...p, imageDimensions: { width: img.width, height: img.height } }));
        img.onerror = () => toast({ title: 'Image not found', description: 'The map image could not be loaded. It may have been deleted.', variant: 'destructive' });
        img.src = data.map_image_url;
      }
      const img = settings.image;
      toast({
        title: 'Project loaded',
        description: `${data.project_name}: ${layers.contours.length} contour and ${layers.faults.length} fault lines, ${controlPoints.length} control points${georef ? ', georeferenced' : ''}.${data.map_image_url ? '' : ` Drop the map image${img?.name ? ` (${img.name})` : ''} to draw over it; the lines are kept.`}`,
      });
    } catch (error) {
      toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      setStatus('');
    }
  }, [toast]);

  const handleSaveProject = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !state.projectName) return;
    setIsProcessing(true);
    try {
      const { data: savedData, error } = await supabase
        .from('contour_projects')
        .upsert({
          user_id: user.id,
          project_name: state.projectName,
          geo_points: state.controlPoints,
          // MAP-U1-006: settings and the image's name and size ride in the
          // same jsonb (no schema change), so a reload can resume
          contours: {
            ...state.layers,
            settings: {
              valuesAre: state.valuesAre, zUnit: state.zUnit, crs: state.crs, surfaceName: state.surfaceName,
              image: { name: state.imageFile?.name || state.savedImage?.name || null, width: state.imageDimensions.width || state.savedImage?.width || null, height: state.imageDimensions.height || state.savedImage?.height || null },
            },
          },
          grid_cell_size: Number(state.gridCellSize) > 0 ? Number(state.gridCellSize) : 50,
          gridding_method: 'tps',
          id: state.id
        }, { onConflict: 'id' })
        .select().single();
      if (error) throw error;
      setState(p => ({ ...p, id: savedData.id }));
      toast({ title: 'Project Saved' });
      fetchProjects();
    } catch (error) {
      toast({ title: 'Save Failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  }, [state, toast, fetchProjects]);

  // MAP-U1-007: map coordinates, values and fault lines; refused without a georeference
  const handleExport = useCallback((format) => {
    const { layers, projectName, pixelToWorld, valuesAre, zUnit, crs } = state;
    const base = (projectName || 'contours').replace(/[^\w-]+/g, '_');
    try {
      const opts = { valuesAre, zUnit, crs, name: base };
      if (format === 'geojson') downloadText(contoursGeoJSON(layers, pixelToWorld, opts), `${base}.geojson`, 'application/geo+json');
      else if (format === 'dxf') downloadText(contoursDXF(layers, pixelToWorld, opts), `${base}.dxf`, 'application/dxf');
      else if (format === 'csv') downloadText(contoursCSV(layers, pixelToWorld, opts), `${base}-contour-points.csv`, 'text/csv');
    } catch (error) {
      toast({ title: 'Export refused', description: error.message, variant: 'destructive' });
    }
  }, [state, toast]);

  return {
    state, setState, imgCanvasRef, ovrCanvasRef,
    handleFileUpload, handleGeoref, handleRemoveControlPoint, handleAutoTrace,
    handleManualDraw, handleDeleteLine, handleSetLineValue, handleGrid, handlePublishSurface,
    handleSaveProject, handleLoadProject, handleExport, isProcessing, status, isCvReady,
  };
};

export default useContourDigitizer;