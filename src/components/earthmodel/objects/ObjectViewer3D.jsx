import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Layers, Box, Activity, Eye, Maximize } from 'lucide-react';

const ObjectViewer3D = ({ objects = [], onObjectSelect }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [layers, setLayers] = useState({ grid: true, bodies: true, wells: true });

  // Mock objects if none provided
  const displayObjects = objects.length > 0 ? objects : [
    { id: 1, type: 'channel', position: [0, 0, 0] },
    { id: 2, type: 'lobe', position: [20, 0, 20] },
    { id: 3, type: 'salt', position: [-20, 10, -20] },
  ];

  const handleSelect = (id) => {
    setSelectedId(id);
    if(onObjectSelect) onObjectSelect(displayObjects.find(o => o.id === id));
  };

  const getColor = (type) => {
    switch(type) {
      case 'channel': return '#3b82f6';
      case 'lobe': return '#22c55e';
      case 'salt': return '#ef4444';
      default: return '#eab308';
    }
  };

  return (
    <div className="w-full h-full relative bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
      
      {/* SVG Canvas replacing Three.js for 2D Isometric projection */}
      <svg viewBox="-50 -50 100 100" className="w-full h-full canvas-interactive">
        
        {/* Background Grid */}
        {layers.grid && (
          <g stroke="#1e293b" strokeWidth="0.5">
            {Array.from({length: 21}).map((_, i) => (
              <React.Fragment key={i}>
                {/* Horizontal-ish lines */}
                <line x1="-50" y1={i*5 - 50} x2="50" y2={i*5 - 50} />
                {/* Vertical-ish lines */}
                <line x1={i*5 - 50} y1="-50" x2={i*5 - 50} y2="50" />
              </React.Fragment>
            ))}
          </g>
        )}

        {/* Objects (Geobodies) */}
        {layers.bodies && displayObjects.map(obj => {
          const isSelected = selectedId === obj.id;
          return (
            <g 
              key={obj.id}
              onClick={(e) => { e.stopPropagation(); handleSelect(obj.id); }}
              className="cursor-pointer transition-all hover:opacity-90"
              style={{ transform: `translate(${obj.position[0]}px, ${obj.position[2]}px)` }}
            >
              {/* Simple isometric-like representation */}
              <rect
                x="-10"
                y="-10"
                width="20"
                height="20"
                fill={getColor(obj.type)}
                fillOpacity={isSelected ? 1 : 0.8}
                stroke={isSelected ? '#fff' : 'none'}
                strokeWidth={isSelected ? "1.5" : "0"}
                rx="2"
              />
              {isSelected && (
                <circle cx="0" cy="0" r="14" fill="none" stroke="#fff" strokeWidth="0.5" strokeDasharray="2,2" />
              )}
            </g>
          );
        })}

        {/* Wells */}
        {layers.wells && (
          <g stroke="white" strokeWidth="0.5">
             <line x1="0" y1="-30" x2="0" y2="30" strokeDasharray="1,1" />
             <circle cx="0" cy="0" r="1" fill="white" />
          </g>
        )}
      </svg>

      {/* HUD Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <Card className="p-2 bg-slate-900/90 backdrop-blur border-slate-800">
          <div className="flex flex-col gap-2">
            <Toggle pressed={layers.grid} onPressedChange={() => setLayers(prev => ({...prev, grid: !prev.grid}))} size="sm" className="justify-start data-[state=on]:bg-slate-800 data-[state=on]:text-white">
              <Box className="w-4 h-4 mr-2" /> Grid
            </Toggle>
            <Toggle pressed={layers.bodies} onPressedChange={() => setLayers(prev => ({...prev, bodies: !prev.bodies}))} size="sm" className="justify-start data-[state=on]:bg-slate-800 data-[state=on]:text-white">
              <Layers className="w-4 h-4 mr-2" /> Geobodies
            </Toggle>
            <Toggle pressed={layers.wells} onPressedChange={() => setLayers(prev => ({...prev, wells: !prev.wells}))} size="sm" className="justify-start data-[state=on]:bg-slate-800 data-[state=on]:text-white">
              <Activity className="w-4 h-4 mr-2" /> Wells
            </Toggle>
          </div>
        </Card>
        <div className="flex gap-2">
            <Button size="sm" variant="secondary" className="flex-1 bg-slate-800 hover:bg-slate-700 text-white border-slate-700" onClick={() => setSelectedId(null)}>
              <Eye className="w-4 h-4 mr-2"/> Reset
            </Button>
            <Button size="sm" variant="secondary" className="flex-1 bg-slate-800 hover:bg-slate-700 text-white border-slate-700">
              <Maximize className="w-4 h-4 mr-2"/> Full
            </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4">
        <Card className="p-3 bg-slate-900/90 backdrop-blur border-slate-800">
          <h4 className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">Geobody Types</h4>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs text-slate-300"><span className="w-3 h-3 rounded-sm bg-blue-500 shadow-inner border border-white/10"></span> Channel</div>
            <div className="flex items-center gap-2 text-xs text-slate-300"><span className="w-3 h-3 rounded-sm bg-green-500 shadow-inner border border-white/10"></span> Lobe</div>
            <div className="flex items-center gap-2 text-xs text-slate-300"><span className="w-3 h-3 rounded-sm bg-red-500 shadow-inner border border-white/10"></span> Salt Dome</div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ObjectViewer3D;