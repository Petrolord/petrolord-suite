import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/customSupabaseClient';
import { exportToGeoJSON, exportToDXF, exportToCSV } from '@/utils/exportUtils';
import { generateGrid } from '@/utils/gridding';
import { useOpenCv } from '@/hooks/useOpenCv';
import { processImageWithOpenCv, dp } from '@/utils/digitizerOpenCv';
import { useIntegration } from '@/contexts/IntegrationContext';

const useContourDigitizer = (toast) => {
  const { dispatch } = useIntegration();
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
    gridCellSize: 50,
    griddingMethod: 'idw',
    results: null,
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
          gridding_method: state.griddingMethod,
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
      const flatData = layers.contours.flatMap(l => l.points.map(p => ({ x: p[0], y: p[1], depth: l.value })));
      exportToCSV(flatData, projectName || 'contours');
    }
  }, [state]);

  return {
    state, setState, imgCanvasRef, ovrCanvasRef,
    handleFileUpload, handleGeoref, handleAutoTrace,
    handleSaveProject, handleExport, isProcessing, status, isCvReady,
  };
};

export default useContourDigitizer;