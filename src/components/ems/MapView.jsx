import React, { useState, useMemo, useCallback } from 'react';
import Map, { NavigationControl, Source, Layer, Marker } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Satellite, Sun, Moon, Layers, Grid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const MAP_STYLES = {
    'Light': 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    'Dark': 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    'Satellite': 'https://api.maptiler.com/maps/satellite/style.json?key=get_your_own_OpDv9BIe3yO2n5P0vB2L',
};

const graticuleLayer = {
    id: 'graticule',
    type: 'line',
    source: 'graticule',
    paint: {
        'line-color': 'rgba(255, 255, 255, 0.3)',
        'line-width': 1,
        'line-dasharray': [2, 2]
    }
};

const generateGraticule = (bounds) => {
    const features = [];
    if (!bounds) return { type: 'FeatureCollection', features };
    
    const [west, south, east, north] = bounds;
    const span = Math.max(east - west, north - south);
    let interval = 10;
    if (span < 1) interval = 0.1;
    else if (span < 5) interval = 1;
    else if (span < 20) interval = 5;

    for (let lon = Math.floor(west / interval) * interval; lon < east; lon += interval) {
        features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[lon, south], [lon, north]] },
            properties: { value: lon.toFixed(2) }
        });
    }
    for (let lat = Math.floor(south / interval) * interval; lat < north; lat += interval) {
        features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[west, lat], [east, lat]] },
            properties: { value: lat.toFixed(2) }
        });
    }
    return { type: 'FeatureCollection', features };
};

const MapView = ({ assets, interpretations, onWellClick }) => {
    const [viewState, setViewState] = useState({
        longitude: -100,
        latitude: 40,
        zoom: 3,
        pitch: 0,
        bearing: 0
    });
    const [hoverInfo, setHoverInfo] = useState(null);
    const [baseMap, setBaseMap] = useState('Dark');
    const [showBaseMap, setShowBaseMap] = useState(true);
    const [showGrid, setShowGrid] = useState(false);
    const [mapRef, setMapRef] = useState(null);

    const graticuleGeoJSON = useMemo(() => {
        if (!mapRef || !showGrid) return { type: 'FeatureCollection', features: [] };
        const bounds = mapRef.getBounds().toArray().flat();
        return generateGraticule(bounds);
    }, [viewState, mapRef, showGrid]);
    
    const wellPoints = useMemo(() => 
        assets.filter(a => a.type === 'well' && a.meta?.location).map(a => ({
            ...a,
            coordinates: [a.meta.location[1], a.meta.location[0]] // lon, lat
        })), 
    [assets]);

    const polygons = useMemo(() =>
        assets.filter(a => a.type === 'polygon' && a.meta?.geojson),
    [assets]);

    const polygonGeoJSON = useMemo(() => ({
        type: 'FeatureCollection',
        features: polygons.map(p => ({
            type: 'Feature',
            geometry: p.meta.geojson.geometry,
            properties: { name: p.name }
        }))
    }), [polygons]);

    const onMapLoad = useCallback((evt) => {
        setMapRef(evt.target);
    }, []);
    
    return (
        <div className="h-full w-full relative bg-slate-900">
            {showBaseMap && (
                <Map 
                    {...viewState}
                    onMove={evt => setViewState(evt.viewState)}
                    mapLib={maplibregl}
                    mapStyle={MAP_STYLES[baseMap]}
                    onLoad={onMapLoad}
                    interactiveLayerIds={['polygons-layer']}
                    onClick={(e) => {
                        const feature = e.features && e.features[0];
                        if (feature && feature.properties.name) {
                            // handle polygon click if needed
                        }
                    }}
                >
                    <NavigationControl position="top-left" />
                    
                    {showGrid && (
                        <Source id="graticule" type="geojson" data={graticuleGeoJSON}>
                            <Layer {...graticuleLayer} />
                        </Source>
                    )}

                    {/* Polygon Layer */}
                    {polygons.length > 0 && (
                        <Source id="polygons-source" type="geojson" data={polygonGeoJSON}>
                            <Layer 
                                id="polygons-fill"
                                type="fill"
                                paint={{
                                    'fill-color': 'rgba(160, 160, 180, 0.5)',
                                    'fill-outline-color': 'rgba(0, 255, 0, 1)'
                                }}
                            />
                            <Layer 
                                id="polygons-line"
                                type="line"
                                paint={{
                                    'line-color': 'rgba(0, 255, 0, 1)',
                                    'line-width': 2
                                }}
                            />
                        </Source>
                    )}

                    {/* Well Markers */}
                    {wellPoints.map((well, idx) => (
                        <Marker 
                            key={`well-${idx}`} 
                            longitude={well.coordinates[0]} 
                            latitude={well.coordinates[1]}
                            anchor="center"
                            onClick={e => {
                                e.originalEvent.stopPropagation();
                                onWellClick(well);
                            }}
                        >
                            <div 
                                className="w-4 h-4 bg-orange-500 rounded-full border-2 border-white cursor-pointer shadow-lg hover:scale-125 transition-transform"
                                onMouseEnter={() => setHoverInfo({ name: well.name })}
                                onMouseLeave={() => setHoverInfo(null)}
                            />
                        </Marker>
                    ))}
                </Map>
            )}

            {/* Custom Tooltip Overlay */}
            {hoverInfo && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-slate-800 text-white px-3 py-1 rounded shadow-lg text-sm pointer-events-none border border-slate-700">
                    {hoverInfo.name}
                </div>
            )}

             <div className="absolute top-4 right-4 z-10 flex flex-col space-y-2">
                <TooltipProvider>
                    {Object.entries(MAP_STYLES).map(([name]) => (
                        <Tooltip key={name}>
                            <TooltipTrigger asChild>
                                 <Button variant="outline" size="icon" onClick={() => setBaseMap(name)} className={`bg-slate-800 hover:bg-slate-700 text-white shadow-md ${baseMap === name && showBaseMap ? 'border-cyan-400 border-2' : 'border-slate-600'}`}>
                                    {name === 'Light' && <Sun className="h-5 w-5" />}
                                    {name === 'Dark' && <Moon className="h-5 w-5" />}
                                    {name === 'Satellite' && <Satellite className="h-5 w-5" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left"><p>{name}</p></TooltipContent>
                        </Tooltip>
                    ))}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={() => setShowBaseMap(s => !s)} className={`bg-slate-800 hover:bg-slate-700 text-white shadow-md ${!showBaseMap ? 'border-cyan-400 border-2' : 'border-slate-600'}`}>
                                <Layers className="h-5 w-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left"><p>{showBaseMap ? "Hide Basemap" : "Show Basemap"}</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={() => setShowGrid(s => !s)} className={`bg-slate-800 hover:bg-slate-700 text-white shadow-md ${showGrid ? 'border-cyan-400 border-2' : 'border-slate-600'}`}>
                                <Grid className="h-5 w-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left"><p>{showGrid ? "Hide Grid" : "Show Grid"}</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
        </div>
    );
};

export default MapView;