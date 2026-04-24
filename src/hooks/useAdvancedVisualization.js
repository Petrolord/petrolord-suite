import React, { useCallback } from 'react';
import { useTrackConfigurationContext } from '@/contexts/TrackConfigurationContext';
import { exportAsImage, exportAsPDF } from '@/utils/exportUtils';
import { createAnnotation } from '@/utils/annotationUtils';

export const useAdvancedVisualization = () => {
  const context = useTrackConfigurationContext();
  
  const {
    activeTool,
    setActiveTool,
    layers,
    toggleLayer,
    setLayerOpacity,
    annotations,
    addAnnotation,
    removeAnnotation,
    measurements,
    addMeasurement,
    clearMeasurements,
    undo,
    redo,
    canUndo,
    canRedo,
    viewSettings
  } = context;

  const handleExport = useCallback(async (type, elementId) => {
    if (type === 'png') {
      await exportAsImage(elementId, 'well-correlation-export');
    } else if (type === 'pdf') {
      await exportAsPDF(elementId, 'well-correlation-document');
    }
  }, []);

  const handleAddTextAnnotation = useCallback((position, text) => {
    const ann = createAnnotation('text', position, text);
    addAnnotation(ann);
  }, [addAnnotation]);

  const handleToolChange = useCallback((tool) => {
    setActiveTool(tool);
  }, [setActiveTool]);

  return {
    activeTool,
    setTool: handleToolChange,
    layers,
    toggleLayer,
    setLayerOpacity,
    annotations,
    addTextAnnotation: handleAddTextAnnotation,
    removeAnnotation,
    measurements,
    addMeasurement,
    clearMeasurements,
    undo,
    redo,
    canUndo,
    canRedo,
    handleExport,
    isGridVisible: layers?.grid?.visible ?? true,
    isAnnotationsVisible: layers?.annotations?.visible ?? true,
    verticalScale: viewSettings?.verticalScale || 1,
  };
};