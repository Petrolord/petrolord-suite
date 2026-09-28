import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Tooltip, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Maximize, Map as MapIcon, Ruler } from 'lucide-react';

// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Icons
const targetIcon = new L.DivIcon({
  className: 'custom-target-icon',
  html: `<div style="background-color: #FFC107; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px black;"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const wellIcon = new L.DivIcon({
  className: 'custom-well-icon',
  html: `<div style="background-color: #4CAF50; width: 16px; height: 16px; transform: rotate(45deg); border: 2px solid white; box-shadow: 0 0 4px black;"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const MeasurementTool = ({ active, onMeasure }) => {
  const [points, setPoints] = useState([]);
  
  useMapEvents({
    click(e) {
      if (!active) return;
      const newPoints = [...points, e.latlng];
      setPoints(newPoints);
      if (newPoints.length === 2) {
        const dist = newPoints[0].distanceTo(newPoints[1]); // In meters for CRS.Simple
        onMeasure(dist);
        setPoints([]); // Reset after measurement
      }
    },
  });

  if (points.length === 0) return null;
  return <Marker position={points[0]} icon={new L.DivIcon({ html: '<div class="w-2 h-2 bg-blue-500 rounded-full"></div>' })} />;
};

const TargetsMap = ({ targets, wellLocation, onTargetSelect }) => {
  const [measurementMode, setMeasurementMode] = useState(false);
  const [lastDistance, setLastDistance] = useState(null);

  // Determine bounds. If CRS.Simple, coords are meters. If standard, lat/lon.
  // We will use CRS.Simple for engineering precision.
  const bounds = useMemo(() => {
    let xs = [wellLocation.x || 0];
    let ys = [wellLocation.y || 0];
    targets.forEach(t => {
      if(t.x != null && t.y != null) {
        xs.push(t.x);
        ys.push(t.y);
      }
    });
    const padding = 100;
    const minX = Math.min(...xs) - padding;
    const maxX = Math.max(...xs) + padding;
    const minY = Math.min(...ys) - padding;
    const maxY = Math.max(...ys) + padding;
    return [[minY, minX], [maxY, maxX]]; // Leaflet uses [lat(y), lng(x)]
  }, [targets, wellLocation]);

  return (
    <div className="relative h-full w-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden" data-canvas="dark">
      {/* Map Controls Overlay */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 bg-slate-900/80 p-2 rounded backdrop-blur border border-slate-700">
        <Button 
          size="icon" 
          variant={measurementMode ? "default" : "ghost"} 
          className={measurementMode ? "bg-blue-600 hover:bg-blue-700" : "text-slate-300 hover:bg-slate-800"}
          onClick={() => { setMeasurementMode(!measurementMode); setLastDistance(null); }}
          title="Measure Distance"
        >
          <Ruler className="h-4 w-4" />
        </Button>
      </div>

      {lastDistance !== null && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 px-4 py-2 rounded border border-blue-500 text-white shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <span className="text-xs text-slate-400 uppercase mr-2">Measured Distance</span>
          <span className="font-mono text-lg text-blue-400">{lastDistance.toFixed(2)} m</span>
        </div>
      )}

      <MapContainer 
        crs={L.CRS.Simple} 
        bounds={bounds} 
        style={{ height: '100%', width: '100%' }} 
        minZoom={-2}
      >
        {/* Simple Grid Background (Custom component or CSS could improve this) */}
        
        {/* Well Surface Location */}
        <Marker position={[wellLocation.y || 0, wellLocation.x || 0]} icon={wellIcon}>
          <Tooltip direction="top" offset={[0, -10]} opacity={1} permanent>
            <span className="font-bold text-xs">{wellLocation.name || 'Well Center'}</span>
          </Tooltip>
        </Marker>

        {/* Targets */}
        {targets.map(target => {
           if(target.x == null || target.y == null) return null;
           const position = [target.y, target.x];
           const color = target.priority === 1 ? '#ef4444' : target.priority === 2 ? '#eab308' : '#22c55e';
           
           return (
             <React.Fragment key={target.id}>
               <Marker 
                 position={position} 
                 icon={targetIcon}
                 eventHandlers={{ click: () => onTargetSelect(target) }}
               >
                 <Tooltip direction="top" offset={[0, -5]} className="custom-tooltip">
                   <div className="text-xs font-semibold">{target.name}</div>
                   <div className="text-[10px] text-slate-500">TVD: {target.tvd_m}m</div>
                 </Tooltip>
               </Marker>
               {/* Tolerance Circle */}
               {(target.target_data?.tolerance_radius || 0) > 0 && (
                 <Circle 
                   center={position} 
                   radius={parseFloat(target.target_data.tolerance_radius)} 
                   pathOptions={{ color: color, fillColor: color, fillOpacity: 0.1, weight: 1, dashArray: '4' }} 
                 />
               )}
             </React.Fragment>
           );
        })}

        <MeasurementTool active={measurementMode} onMeasure={setLastDistance} />
      </MapContainer>
    </div>
  );
};

export default TargetsMap;