import React, { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const MapClickHandler = ({ onLocationSelect }) => {
  useMapEvents({
    click: (e) => {
      const { lat, lng } = e.latlng;
      onLocationSelect(lat, lng);
    }
  });
  return null;
};

// Component to handle map resizing
const MapResizeHandler = () => {
    const map = useMap();
    useEffect(() => {
        const resizeObserver = new ResizeObserver(() => {
            map.invalidateSize();
        });
        resizeObserver.observe(map.getContainer());
        return () => resizeObserver.disconnect();
    }, [map]);
    return null;
}

// Recenter map when coords change
const MapRecenter = ({ lat, lng, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], zoom);
    }
  }, [lat, lng, zoom, map]);
  return null;
};

const DraggableMarker = ({ position, onPositionChange }) => {
  const markerRef = useRef(null);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const newPos = marker.getLatLng();
          onPositionChange(newPos.lat, newPos.lng);
        }
      },
    }),
    [onPositionChange],
  );

  return position ? (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
      icon={customIcon}
    />
  ) : null;
};

const InteractiveMap = ({ latitude, longitude, onLocationSelect }) => {
  const defaultCenter = [20, 0];
  // If coordinates are provided, use them. Otherwise default.
  const hasCoords = latitude && longitude;
  const center = hasCoords ? [parseFloat(latitude), parseFloat(longitude)] : defaultCenter;
  const zoom = hasCoords ? 10 : 2;

  const handleLocationSelect = (lat, lng) => {
    onLocationSelect(lat.toFixed(6), lng.toFixed(6));
  };

  const handleMarkerDrag = (lat, lng) => {
    onLocationSelect(lat.toFixed(6), lng.toFixed(6));
  };

  return (
    <div className="h-48 w-full bg-slate-900 relative z-0">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
        minZoom={2}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onLocationSelect={handleLocationSelect} />
        <MapResizeHandler />
        <MapRecenter lat={parseFloat(latitude)} lng={parseFloat(longitude)} zoom={zoom} />
        <DraggableMarker
          position={hasCoords ? [parseFloat(latitude), parseFloat(longitude)] : null}
          onPositionChange={handleMarkerDrag}
        />
      </MapContainer>
    </div>
  );
};

export default InteractiveMap;