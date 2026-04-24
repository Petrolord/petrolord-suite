import React, { useRef, useEffect, useState } from 'react';
import { Layers, Maximize, Activity, Box } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';

// Extracted local controls since we removed ViewerControls which likely depended on Three.js
const LocalViewerControls = ({ layers, onLayerToggle, verticalExaggeration, onVeChange }) => {
  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
      <Card className="p-2 bg-slate-900/90 backdrop-blur border-slate-800 shadow-xl">
        <div className="flex flex-col gap-2">
          <Toggle pressed={layers.gridLines} onPressedChange={() => onLayerToggle('gridLines')} size="sm" className="justify-start data-[state=on]:bg-slate-800 data-[state=on]:text-white">
            <Box className="w-4 h-4 mr-2" /> Grid
          </Toggle>
          <Toggle pressed={layers.surfaces} onPressedChange={() => onLayerToggle('surfaces')} size="sm" className="justify-start data-[state=on]:bg-slate-800 data-[state=on]:text-white">
            <Layers className="w-4 h-4 mr-2" /> Surfaces
          </Toggle>
          <Toggle pressed={layers.wells} onPressedChange={() => onLayerToggle('wells')} size="sm" className="justify-start data-[state=on]:bg-slate-800 data-[state=on]:text-white">
            <Activity className="w-4 h-4 mr-2" /> Wells
          </Toggle>
        </div>
      </Card>
      
      <Card className="p-2 bg-slate-900/90 backdrop-blur border-slate-800 flex flex-col gap-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase text-center">Z-Scale</span>
        <div className="flex items-center justify-between gap-2">
           <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300" onClick={() => onVeChange(Math.max(1, verticalExaggeration - 1))}>-</Button>
           <span className="text-xs font-mono">{verticalExaggeration}x</span>
           <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300" onClick={() => onVeChange(Math.min(10, verticalExaggeration + 1))}>+</Button>
        </div>
      </Card>
    </div>
  );
};

const Canvas3D = ({ surfaces = [], wells = [], grids = [] }) => {
  const [ve, setVe] = useState(2);
  const [layers, setLayers] = useState({
      surfaces: true,
      wells: true,
      grids: true,
      gridLines: true
  });
  
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    // High DPI Support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    // Clear
    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;

    // Background Grid
    if (layers.gridLines) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      const step = 50;
      for (let x = 0; x <= width; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y <= height; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    }

    // Draw Main Surface 
    if (layers.surfaces) {
      // Base surface (orange)
      ctx.fillStyle = 'rgba(249, 115, 22, 0.2)'; // Orange tint
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1.5;
      
      // Calculate scaled heights based on VE
      const yOffset = ve * 10;
      
      ctx.beginPath();
      ctx.moveTo(width * 0.1, height * 0.4 + yOffset);
      ctx.lineTo(width * 0.5, height * 0.2 + yOffset);
      ctx.lineTo(width * 0.9, height * 0.4 + yOffset);
      ctx.lineTo(width * 0.5, height * 0.8 + yOffset);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Top surface (blue)
      ctx.fillStyle = 'rgba(59, 130, 246, 0.3)'; // Blue tint
      ctx.strokeStyle = '#3b82f6';
      
      ctx.beginPath();
      ctx.moveTo(width * 0.15, height * 0.3 - yOffset);
      ctx.lineTo(width * 0.5, height * 0.1 - yOffset);
      ctx.lineTo(width * 0.85, height * 0.3 - yOffset);
      ctx.lineTo(width * 0.5, height * 0.6 - yOffset);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Connect corners for 3D block effect
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath(); ctx.moveTo(width * 0.15, height * 0.3 - yOffset); ctx.lineTo(width * 0.1, height * 0.4 + yOffset); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(width * 0.5, height * 0.1 - yOffset); ctx.lineTo(width * 0.5, height * 0.2 + yOffset); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(width * 0.85, height * 0.3 - yOffset); ctx.lineTo(width * 0.9, height * 0.4 + yOffset); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(width * 0.5, height * 0.6 - yOffset); ctx.lineTo(width * 0.5, height * 0.8 + yOffset); ctx.stroke();
    }

    // Draw Wells
    if (layers.wells) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      
      // Well 1
      ctx.beginPath();
      ctx.moveTo(width * 0.4, height * 0.1);
      ctx.lineTo(width * 0.4, height * 0.7);
      ctx.stroke();
      // Well Head
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(width * 0.4 - 3, height * 0.1 - 3, 6, 6);

      // Well 2 (Deviated)
      ctx.beginPath();
      ctx.moveTo(width * 0.7, height * 0.15);
      ctx.lineTo(width * 0.7, height * 0.4);
      ctx.lineTo(width * 0.6, height * 0.8);
      ctx.stroke();
      // Well Head
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(width * 0.7 - 3, height * 0.15 - 3, 6, 6);
    }

  }, [layers, ve, surfaces, wells, grids]);

  return (
    <div className="h-full w-full bg-[#0f172a] relative overflow-hidden">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full absolute inset-0 cursor-move"
        style={{ width: '100%', height: '100%' }}
      />
      
      <LocalViewerControls 
        layers={layers}
        onLayerToggle={(key) => setLayers(p => ({...p, [key]: !p[key]}))}
        verticalExaggeration={ve}
        onVeChange={setVe}
      />
      
      <div className="absolute bottom-4 left-4 flex gap-2">
         <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded px-2 py-1 flex items-center shadow">
             <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
             <span className="text-[10px] text-slate-300 font-mono">Top Reservoir</span>
         </div>
         <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded px-2 py-1 flex items-center shadow">
             <div className="w-2 h-2 rounded-full bg-orange-500 mr-2"></div>
             <span className="text-[10px] text-slate-300 font-mono">Base Reservoir</span>
         </div>
      </div>
    </div>
  );
};

export default Canvas3D;