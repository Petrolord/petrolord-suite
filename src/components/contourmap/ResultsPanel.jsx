
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Map, Grid as GridIcon } from 'lucide-react';

const ResultsPanel = ({ state, setState, imgCanvasRef, ovrCanvasRef, onManualDraw, onAutoTrace }) => {
  const { imagePreview, imageDimensions, controlPoints, layers, results, drawMode, currentLine } = state;
  const [isDrawing, setIsDrawing] = useState(false);
  const [aiBox, setAiBox] = useState(null);
  const containerRef = useRef(null);

  const getCanvasScale = useCallback(() => {
    const canvas = imgCanvasRef.current;
    if (!canvas || !imageDimensions.width) return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
    
    const container = containerRef.current;
    if (!container) return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

    const containerAR = container.clientWidth / container.clientHeight;
    const imageAR = imageDimensions.width / imageDimensions.height;

    let newWidth, newHeight, offsetX = 0, offsetY = 0;

    if (containerAR > imageAR) {
      newHeight = container.clientHeight;
      newWidth = newHeight * imageAR;
      offsetX = (container.clientWidth - newWidth) / 2;
    } else {
      newWidth = container.clientWidth;
      newHeight = newWidth / imageAR;
      offsetY = (container.clientHeight - newHeight) / 2;
    }

    return {
      scaleX: newWidth / imageDimensions.width,
      scaleY: newHeight / imageDimensions.height,
      offsetX,
      offsetY,
    };
  }, [imageDimensions]);

  const drawAll = useCallback(() => {
    const { scaleX, scaleY, offsetX, offsetY } = getCanvasScale();
    const canvas = ovrCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY);

    Object.entries(layers).forEach(([layerName, lines]) => {
      ctx.lineWidth = 2;
      ctx.strokeStyle = layerName === 'faults' ? 'yellow' : 'cyan';
      lines.forEach(line => {
        if (line.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(line.points[0][0] * scaleX, line.points[0][1] * scaleY);
          for (let i = 1; i < line.points.length; i++) {
            ctx.lineTo(line.points[i][0] * scaleX, line.points[i][1] * scaleY);
          }
          ctx.stroke();
        }
      });
    });

    ctx.font = '12px Arial';
    controlPoints.forEach((pt, i) => {
      if (pt.pixel[0] !== null) {
        ctx.beginPath();
        ctx.arc(pt.pixel[0] * scaleX, pt.pixel[1] * scaleY, 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillText(`GCP ${i + 1}`, pt.pixel[0] * scaleX + 8, pt.pixel[1] * scaleY + 4);
      }
    });
    
    if (isDrawing && currentLine.length > 1 && drawMode === 'manual') {
        ctx.strokeStyle = 'lime';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(currentLine[0][0] * scaleX, currentLine[0][1] * scaleY);
        currentLine.forEach(p => ctx.lineTo(p[0] * scaleX, p[1] * scaleY));
        ctx.stroke();
    }

    if (aiBox) {
        ctx.strokeStyle = 'magenta';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(aiBox.startX * scaleX, aiBox.startY * scaleY, aiBox.w * scaleX, aiBox.h * scaleY);
        ctx.setLineDash([]);
    }
    ctx.restore();
  }, [getCanvasScale, layers, controlPoints, isDrawing, currentLine, drawMode, aiBox]);

  const resizeCanvases = useCallback(() => {
    const imgC = imgCanvasRef.current;
    const ovrC = ovrCanvasRef.current;
    const container = containerRef.current;
    if (!imgC || !ovrC || !container) return;

    imgC.width = container.clientWidth;
    imgC.height = container.clientHeight;
    ovrC.width = container.clientWidth;
    ovrC.height = container.clientHeight;

    if (imagePreview) {
      const image = new Image();
      image.onload = () => {
        const { scaleX, scaleY, offsetX, offsetY } = getCanvasScale();
        const ctx = imgC.getContext('2d');
        ctx.clearRect(0, 0, imgC.width, imgC.height);
        ctx.drawImage(image, offsetX, offsetY, imageDimensions.width * scaleX, imageDimensions.height * scaleY);
        drawAll();
      };
      image.src = imagePreview;
    }
  }, [imagePreview, imageDimensions, getCanvasScale, drawAll]);

  useEffect(() => {
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);
    return () => window.removeEventListener('resize', resizeCanvases);
  }, [resizeCanvases]);

  useEffect(drawAll, [drawAll]);

  const getPointerPos = (e) => {
    const rect = ovrCanvasRef.current.getBoundingClientRect();
    const { scaleX, scaleY, offsetX, offsetY } = getCanvasScale();
    
    let clientX, clientY;
    
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    const x = (clientX - rect.left - offsetX) / scaleX;
    const y = (clientY - rect.top - offsetY) / scaleY;
    return { x, y };
  };

  const handleStart = (e) => {
    const { x, y } = getPointerPos(e);
    if (x < 0 || y < 0 || x > imageDimensions.width || y > imageDimensions.height) return;

    if (drawMode === 'none' && controlPoints.length < 4) {
      const newPoint = { pixel: [x, y], world: [null, null] };
      setState(prev => ({ ...prev, controlPoints: [...prev.controlPoints, newPoint] }));
    } else if (drawMode === 'manual') {
      setIsDrawing(true);
      setState(prev => ({ ...prev, currentLine: [[x, y]] }));
    } else if (drawMode === 'ai_box') {
        setIsDrawing(true);
        setAiBox({ startX: x, startY: y, w: 0, h: 0 });
    }
  };

  const handleMove = (e) => {
    if (!isDrawing) return;
    const { x, y } = getPointerPos(e);

    if (drawMode === 'manual') {
      setState(prev => ({ ...prev, currentLine: [...prev.currentLine, [x, y]] }));
    } else if (drawMode === 'ai_box' && aiBox) {
        setAiBox(prev => ({ ...prev, w: x - prev.startX, h: y - prev.startY }));
    }
  };

  const handleEnd = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (drawMode === 'manual') {
      onManualDraw(state.currentLine);
      setState(prev => ({ ...prev, currentLine: [] }));
    } else if (drawMode === 'ai_box' && aiBox) {
        const positiveBox = {
            startX: aiBox.w < 0 ? aiBox.startX + aiBox.w : aiBox.startX,
            startY: aiBox.h < 0 ? aiBox.startY + aiBox.h : aiBox.startY,
            w: Math.abs(aiBox.w),
            h: Math.abs(aiBox.h),
        };
        onAutoTrace(positiveBox);
        setAiBox(null);
    }
  };

  const renderGridPlot = () => {
    if (!results?.grid) return <div className="text-center p-8 text-gray-400">3D Grid will be displayed here after generation.</div>;
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400">
        Chart removed
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-800/30 rounded-xl border border-white/10">
      <Tabs defaultValue="map" className="w-full h-full flex flex-col">
        <TabsList className="grid w-full grid-cols-2 bg-slate-800 rounded-t-xl">
          <TabsTrigger value="map"><Map className="w-4 h-4 mr-2" />Map View</TabsTrigger>
          <TabsTrigger value="grid"><GridIcon className="w-4 h-4 mr-2" />3D Grid</TabsTrigger>
        </TabsList>
        <TabsContent value="map" className="flex-grow p-2 mt-0 relative" ref={containerRef}>
          <div className="w-full h-full bg-gray-900 rounded overflow-hidden relative flex items-center justify-center">
            <canvas ref={imgCanvasRef} className="absolute" />
            <canvas 
              ref={ovrCanvasRef} 
              className="absolute cursor-crosshair touch-none"
              onMouseDown={handleStart}
              onMouseMove={handleMove}
              onMouseUp={handleEnd}
              onMouseLeave={handleEnd}
              onTouchStart={handleStart}
              onTouchMove={handleMove}
              onTouchEnd={handleEnd}
              style={{ touchAction: 'none' }}
            />
          </div>
        </TabsContent>
        <TabsContent value="grid" className="flex-grow p-2 mt-0">
          {renderGridPlot()}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ResultsPanel;
