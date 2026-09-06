import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/customSupabaseClient';
import { exportToGeoJSON, exportToDXF, exportToCSV } from '@/utils/exportUtils';
import { useOpenCv } from '@/hooks/useOpenCv';
import { processImageWithOpenCv, dp } from '@/utils/digitizerOpenCv';
import { planDigitizedSurface, digitizedSurfacePayload } from '@/lib/digitizer/contoursToSurface';
import { saveSurface } from '@/lib/surfacesRegistry';

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
    gridCellSize: 50,        // map units (the georeferenced frame)
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
            results: null,
          }));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleGeoref = useCallback(() => {
    const validPoints = state.controlPoints.filter(p => p.pixel[0] !== null && p.world[0] !== null && p.world[1] !== null);
    if (validPoints.length < 3) {
      toast({ title: 'Georeferencing Failed', description: 'At least 3 valid control points are required.', variant: 'destructive' });
      return;
    }
    const p1 = validPoints[0];
    const p2 = validPoints[1];
    const scaleX = (p2.world[0] - p1.world[0]) / (p2.pixel[0] - p1.pixel[0]);
    const scaleY = (p2.world[1] - p1.world[1]) / (p2.pixel[1] - p1.pixel[1]);
    const translateX = p1.world[0] - p1.pixel[0] * scaleX;
    const translateY = p1.world[1] - p1.pixel[1] * scaleY;
    const geoTransform = { a: scaleX, b: 0, c: translateX, d: 0, e: scaleY, f: translateY };
    const pixelToWorld = (px, py) => [geoTransform.a * px + geoTransform.c, geoTransform.e * py + geoTransform.f];
    setState(p => ({ ...p, geoTransform, pixelToWorld }));
    toast({ title: 'Georeferencing Set', description: 'Transformation has been calculated.' });
  }, [state.controlPoints, toast]);

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
        valuesAre: state.valuesAre, cellSize: state.gridCellSize,
      });
      setState(p => ({ ...p, results: plan, publishedSurface: null }));
      toast({
        title: 'Surface gridded',
        description: `${plan.spec.nx} x ${plan.spec.ny} nodes at ${plan.spec.dx} map units from ${plan.controlCount} contour points on ${plan.lines} lines.`,
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
  }, [state.results, state.surfaceName, state.projectName, state.zUnit, state.valuesAre, state.imageFile, state.map_image_url, toast]);

  const handleLoadProject = useCallback(async (projectId) => {
    if (!projectId || projectId === 'none') return;
    setIsProcessing(true);
    setStatus('Loading project...');
    try {
      const { data, error } = await supabase.from('contour_projects').select('*').eq('id', projectId).single();
      if (error) throw error;
      setState(p => ({
        ...p,
        id: data.id,
        projectName: data.project_name,
        imagePreview: data.map_image_url || null,
        map_image_url: data.map_image_url || null,
        imageFile: null,
        controlPoints: data.geo_points || [],
        geoTransform: null,
        pixelToWorld: null,
        layers: data.contours || { contours: [], faults: [] },
        gridCellSize: data.grid_cell_size || 50,
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
      toast({ title: 'Project loaded', description: `${data.project_name} is ready. Set the georeference again before gridding.` });
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
          contours: state.layers,
          grid_cell_size: state.gridCellSize,
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

  const handleExport = useCallback((format) => {
    const { layers, projectName } = state;
    if (format === 'geojson') {
      exportToGeoJSON(layers, projectName || 'contours');
    } else if (format === 'dxf') {
      exportToDXF(layers, projectName || 'contours');
    } else if (format === 'csv') {
      const p2w = state.pixelToWorld || ((x, y) => [x, y]);
      const flatData = layers.contours.flatMap(l => l.points.map(p => {
        const [x, y] = p2w(p[0], p[1]);
        return { x, y, value: l.value };
      }));
      exportToCSV(flatData, projectName || 'contours');
    }
  }, [state]);

  return {
    state, setState, imgCanvasRef, ovrCanvasRef,
    handleFileUpload, handleGeoref, handleAutoTrace,
    handleManualDraw, handleDeleteLine, handleSetLineValue, handleGrid, handlePublishSurface,
    handleSaveProject, handleLoadProject, handleExport, isProcessing, status, isCvReady,
  };
};

export default useContourDigitizer;