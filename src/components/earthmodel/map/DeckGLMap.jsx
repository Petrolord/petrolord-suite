import React, { useState, useMemo } from 'react';
import { Map, Marker } from 'react-map-gl';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const INITIAL_VIEW_STATE = {
  longitude: -100,
  latitude: 40,
  zoom: 3,
  pitch: 0,
  bearing: 0
};

const DeckGLMap = ({ wells = [], surfaces = [], polygons = [] }) => {
    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);

    return (
        <div className="w-full h-full relative">
            <Map
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                mapLib={maplibregl}
                mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
                reuseMaps
            >
                {/* Render Wells as Custom Markers */}
                {wells.map((well, idx) => (
                    (well.longitude && well.latitude) && (
                        <Marker 
                            key={`well-${idx}`} 
                            longitude={well.longitude} 
                            latitude={well.latitude}
                            anchor="center"
                        >
                            <div className="w-4 h-4 bg-orange-500 rounded-full border-2 border-white cursor-pointer hover:scale-125 transition-transform" title={well.name || 'Well'} />
                        </Marker>
                    )
                ))}
            </Map>
            
            {/* Map Controls Overlay */}
            <div className="absolute top-4 left-4 bg-slate-900/90 p-2 rounded border border-slate-700 backdrop-blur">
                <h4 className="text-xs font-bold text-slate-300 mb-2">Layers</h4>
                <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <div className="w-3 h-3 rounded-full bg-orange-500 border border-white"></div>
                    <span>Wells</span>
                </div>
            </div>
        </div>
    );
};

export default DeckGLMap;