import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap, ScaleControl, useMapEvents } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet-polylinedecorator';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/components/ui/use-toast';
import { renderToStaticMarkup } from 'react-dom/server';
import { latLngToUtm } from '@/utils/coordinateUtils';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MouseCoordinates = () => {
  const [position, setPosition] = useState({ lat: 0, lng: 0 });
  const [utmCoords, setUtmCoords] = useState({ x: 0, y: 0, zone: '' });

  useMapEvents({
    mousemove(e) {
      setPosition(e.latlng);
      const utm = latLngToUtm(e.latlng.lat, e.latlng.lng);
      setUtmCoords(utm);
    },
  });

  return (
    <div className="leaflet-bottom leaflet-left">
      <div className="leaflet-control leaflet-bar bg-slate-800/80 text-white p-2 text-sm backdrop-blur-sm border border-slate-700">
        <div>Lat: {position.lat.toFixed(6)}, Lng: {position.lng.toFixed(6)}</div>
        <div>X: {utmCoords.x.toFixed(2)}m, Y: {utmCoords.y.toFixed(2)}m (UTM Zone {utmCoords.zone})</div>
      </div>
    </div>
  );
};

const MapClickHandler = ({ activeTool, onMapClick }) => {
  const map = useMap();

  useEffect(() => {
    if (!activeTool || activeTool.type !== 'icon') {
      map.getContainer().style.cursor = '';
      return;
    }
    map.getContainer().style.cursor = 'crosshair';
    const handleClick = (e) => {
      onMapClick(e.latlng, activeTool);
    };
    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
      map.getContainer().style.cursor = '';
    };
  }, [map, activeTool, onMapClick]);

  return null;
};

const MapPanel = ({ activeTool, layers, setLayers, onPlaceItem, onSelectLayer, iconMap }) => {
  const featureGroupRef = useRef();
  const mapRef = useRef();
  const { toast } = useToast();
  
  const calculateDistance = (latlngs) => {
    let totalDistance = 0;
    for (let i = 0; i < latlngs.length - 1; i++) {
        totalDistance += mapRef.current.distance(latlngs[i], latlngs[i + 1]);
    }
    return totalDistance;
  };

  const onCreated = (e) => {
    const { layerType, layer } = e;
    if (layerType === 'polyline') {
        const latlngs = layer.getLatLngs();
        const distance = calculateDistance(latlngs);

        const newLayer = {
            id: uuidv4(),
            type: 'pipeline',
            latlngs: latlngs.map(l => ({ lat: l.lat, lng: l.lng })),
            length: distance,
            tag: `PL-${Math.floor(Math.random() * 1000)}`,
            lineSize: '6"',
        };
        setLayers(prevLayers => [...prevLayers, newLayer]);
        toast({ title: "Pipeline Routed", description: `New pipeline added with length ${distance.toFixed(2)}m.` });
        toast({
            title: "Reminder: Check Bend Radius",
            description: "Enforcing bend radius limits is not yet automated. Please review your design.",
            variant: "default",
            duration: 7000
        });
    }
  };
  
  const onEdited = (e) => {
    const editedLayers = e.layers;
    let changesMade = false;
    editedLayers.eachLayer(layer => {
        const layerId = layer.options.id;
        const foundLayer = layers.find(l => l.id === layerId);

        if (foundLayer) {
            changesMade = true;
            if (foundLayer.type === 'pipeline') {
                const newLatLngs = layer.getLatLngs().map(l => ({ lat: l.lat, lng: l.lng }));
                const newDistance = calculateDistance(layer.getLatLngs());
                const updatedLayer = { ...foundLayer, latlngs: newLatLngs, length: newDistance };
                setLayers(prev => prev.map(l => l.id === layerId ? updatedLayer : l));
            } else if (foundLayer.type === 'icon') {
                const newLatLng = layer.getLatLng();
                const updatedLayer = { ...foundLayer, latlng: { lat: newLatLng.lat, lng: newLatLng.lng } };
                setLayers(prev => prev.map(l => l.id === layerId ? updatedLayer : l));
            }
        }
    });
    if (changesMade) {
        toast({ title: "Layout Updated", description: "Changes have been applied to the layout." });
    }
  };

  const onDeleted = (e) => {
    const deletedLayers = e.layers;
    const deletedIds = [];
    deletedLayers.eachLayer(layer => {
        deletedIds.push(layer.options.id);
    });
    setLayers(prev => prev.filter(l => !deletedIds.includes(l.id)));
    toast({ title: "Items Removed", description: `${deletedIds.length} item(s) have been removed from the layout.` });
  };


  useEffect(() => {
    const fg = featureGroupRef.current;
    if (!fg || !mapRef.current) return;
  
    fg.clearLayers();
    
    layers.forEach(layerData => {
      let leafletLayer;

      if (layerData.type === 'icon') {
        let iconMarkup;
        // CORRECTED LOGIC: Properly handle custom vs. standard icons
        if (layerData.isCustom) {
            iconMarkup = `<img src="${layerData.iconUrl}" class="w-5 h-5" />`;
        } else {
            const IconComponent = iconMap[layerData.iconName];
            if (!IconComponent) return; // Skip if icon is not found
            const iconElement = React.createElement(IconComponent, { className: "w-5 h-5 text-teal-300" });
            iconMarkup = renderToStaticMarkup(iconElement);
        }
        
        const customIcon = new L.DivIcon({
          html: `<div class="p-1.5 bg-slate-800 rounded-full border-2 border-teal-400 shadow-lg">${iconMarkup}</div>`,
          className: 'bg-transparent',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        leafletLayer = L.marker(layerData.latlng, { icon: customIcon, id: layerData.id })
          .bindTooltip(layerData.tag, { permanent: true, direction: 'top', offset: [0, -16], className: 'map-label' });

      } else if (layerData.type === 'pipeline') {
        const labelText = `${layerData.tag} (${layerData.lineSize}, ${layerData.length.toFixed(1)}m)`;
        leafletLayer = L.polyline(layerData.latlngs, { color: '#0f766e', weight: 4, id: layerData.id })
          .bindTooltip(labelText, { permanent: true, direction: 'center', className: 'map-label-pipeline' });
        
        L.polylineDecorator(leafletLayer, {
          patterns: [
            { offset: '50%', repeat: 100, symbol: L.Symbol.arrowHead({ pixelSize: 12, pathOptions: { color: '#14b8a6', fillOpacity: 1, weight: 0 } }) }
          ]
        }).addTo(fg);
      }
      
      if (leafletLayer) {
        leafletLayer.on('click', () => onSelectLayer(layerData));
        fg.addLayer(leafletLayer);
      }
    });

  }, [layers, onSelectLayer, iconMap]);
  
  const drawOptions = {
      polyline: activeTool?.type === 'pipeline',
      polygon: false,
      rectangle: false,
      circle: false,
      marker: false,
      circlemarker: false,
  };

  return (
    <MapContainer whenCreated={mapInstance => { mapRef.current = mapInstance }} center={[29.7604, -95.3698]} zoom={13} className="w-full h-full" style={{backgroundColor: '#f0f0f0'}}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <FeatureGroup ref={featureGroupRef}>
        <EditControl
          position="topright"
          onCreated={onCreated}
          onEdited={onEdited}
          onDeleted={onDeleted}
          draw={drawOptions}
          edit={{
            featureGroup: featureGroupRef.current,
            remove: true,
          }}
        />
      </FeatureGroup>
      <ScaleControl position="bottomright" imperial={false} />
      <MouseCoordinates />
      <MapClickHandler activeTool={activeTool} onMapClick={onPlaceItem} />
    </MapContainer>
  );
};

export default MapPanel;