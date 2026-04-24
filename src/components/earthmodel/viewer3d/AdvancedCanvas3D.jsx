import React, { useRef, useEffect } from 'react';

const AdvancedCanvas3D = ({ layers = { grid: true, faults: true, seismic: true } }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.clearRect(0, 0, width, height);
    
    // Draw pseudo-3D perspective
    const centerX = width / 2;
    const centerY = height / 2;

    // 1. Draw Grid
    if (layers.grid) {
      ctx.strokeStyle = '#1e293b'; // slate-800
      ctx.lineWidth = 1;
      
      const gridSpacing = 40;
      const gridCols = Math.ceil(width / gridSpacing);
      const gridRows = Math.ceil(height / gridSpacing);

      // Draw perspective grid (simplified)
      for (let i = -gridCols; i <= gridCols; i++) {
        ctx.beginPath();
        ctx.moveTo(centerX + i * gridSpacing, 0);
        ctx.lineTo(centerX + i * gridSpacing, height);
        ctx.stroke();
      }
      for (let i = -gridRows; i <= gridRows; i++) {
        ctx.beginPath();
        ctx.moveTo(0, centerY + i * gridSpacing);
        ctx.lineTo(width, centerY + i * gridSpacing);
        ctx.stroke();
      }
    }

    // 2. Draw Seismic Layer (Pseudo Plane)
    if (layers.seismic) {
      // Horizontal slice
      ctx.fillStyle = 'rgba(74, 222, 128, 0.15)'; // Greenish tint
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      ctx.moveTo(width * 0.1, height * 0.3);
      ctx.lineTo(width * 0.8, height * 0.3);
      ctx.lineTo(width * 0.9, height * 0.7);
      ctx.lineTo(width * 0.2, height * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Vertical slice
      ctx.fillStyle = 'rgba(96, 165, 250, 0.15)'; // Blueish tint
      ctx.strokeStyle = '#60a5fa';
      
      ctx.beginPath();
      ctx.moveTo(width * 0.4, height * 0.1);
      ctx.lineTo(width * 0.6, height * 0.1);
      ctx.lineTo(width * 0.6, height * 0.9);
      ctx.lineTo(width * 0.4, height * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 3. Draw Faults (Scatter points / lines)
    if (layers.faults) {
      ctx.strokeStyle = '#ef4444'; // Red
      ctx.lineWidth = 3;
      
      // Main fault plane line
      ctx.beginPath();
      ctx.moveTo(width * 0.3, height * 0.2);
      ctx.bezierCurveTo(
        width * 0.4, height * 0.4, 
        width * 0.5, height * 0.6, 
        width * 0.7, height * 0.8
      );
      ctx.stroke();

      // Secondary fault
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(width * 0.6, height * 0.3);
      ctx.lineTo(width * 0.5, height * 0.7);
      ctx.stroke();
      
      // Fault throw indicators
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(width * 0.4, height * 0.4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(width * 0.6, height * 0.6, 4, 0, Math.PI * 2); ctx.fill();
    }

  }, [layers]);

  return (
    <div className="w-full h-full bg-[#0f172a] relative overflow-hidden">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full absolute inset-0 cursor-crosshair" 
        style={{ width: '100%', height: '100%' }}
      />
      
      <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur px-3 py-2 rounded border border-slate-800 shadow-lg">
        <p className="text-xs font-mono text-slate-400">
          <span className="text-purple-400 font-bold">Canvas 2D Engine</span> • 
          Grid: <span className={layers.grid ? "text-white" : "text-slate-600"}>{layers.grid ? 'ON' : 'OFF'}</span> • 
          Faults: <span className={layers.faults ? "text-white" : "text-slate-600"}>{layers.faults ? 'ON' : 'OFF'}</span> • 
          Seismic: <span className={layers.seismic ? "text-white" : "text-slate-600"}>{layers.seismic ? 'ON' : 'OFF'}</span>
        </p>
      </div>
    </div>
  );
};

export default AdvancedCanvas3D;