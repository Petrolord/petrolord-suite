import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from '@/components/ui/use-toast';
import { MapPin, Compass, MoveVertical } from 'lucide-react';
import { calculateDestinationPoint } from '@/utils/coordinateUtils';

const PlacementTools = ({ layers, onPlaceItem, activeTool, setActiveTool }) => {
  const { toast } = useToast();
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [referencePointId, setReferencePointId] = useState('');
  const [bearing, setBearing] = useState('');
  const [distance, setDistance] = useState('');

  const handlePlaceByCoords = () => {
    if (!activeTool) {
      toast({ variant: "destructive", title: "No Tool Selected", description: "Please select an equipment icon from the toolbar first." });
      return;
    }
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      toast({ variant: "destructive", title: "Invalid Coordinates", description: "Please enter valid numbers for latitude and longitude." });
      return;
    }
    onPlaceItem({ lat: latNum, lng: lngNum }, activeTool);
    setLat('');
    setLng('');
  };

  const handlePlaceByBearing = () => {
    if (!activeTool) {
      toast({ variant: "destructive", title: "No Tool Selected", description: "Please select an equipment icon from the toolbar first." });
      return;
    }
    if (!referencePointId) {
      toast({ variant: "destructive", title: "No Reference Point", description: "Please select a reference point from the map." });
      return;
    }
    const bearingNum = parseFloat(bearing);
    const distanceNum = parseFloat(distance);

    if (isNaN(bearingNum) || isNaN(distanceNum)) {
      toast({ variant: "destructive", title: "Invalid Input", description: "Please enter valid numbers for bearing and distance." });
      return;
    }

    const referenceLayer = layers.find(l => l.id === referencePointId);
    if (!referenceLayer) {
        toast({ variant: "destructive", title: "Reference Point Not Found", description: "The selected reference point could not be found." });
        return;
    }

    const startPoint = { lat: referenceLayer.latlng.lat, lon: referenceLayer.latlng.lng };
    const destination = calculateDestinationPoint(startPoint, bearingNum, distanceNum);

    onPlaceItem({ lat: destination.lat, lng: destination.lon }, activeTool);
    setReferencePointId('');
    setBearing('');
    setDistance('');
  };


  const iconLayers = layers.filter(l => l.type === 'icon');

  return (
    <div className="p-2 space-y-4">
      <Tabs defaultValue="coords" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="coords"><MapPin className="w-4 h-4 mr-1"/>Coords</TabsTrigger>
          <TabsTrigger value="bearing"><Compass className="w-4 h-4 mr-1"/>Bearing</TabsTrigger>
        </TabsList>
        <TabsContent value="coords">
            <div className="space-y-2 mt-2">
                <Label htmlFor="lat">Latitude</Label>
                <Input id="lat" type="number" placeholder="e.g., 29.7604" value={lat} onChange={e => setLat(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="lng">Longitude</Label>
                <Input id="lng" type="number" placeholder="e.g., -95.3698" value={lng} onChange={e => setLng(e.target.value)} />
            </div>
            <Button onClick={handlePlaceByCoords} className="w-full mt-4">Place Item</Button>
        </TabsContent>
        <TabsContent value="bearing">
            <div className="space-y-2 mt-2">
                <Label>Reference Point</Label>
                <Select value={referencePointId} onValueChange={setReferencePointId}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select an item on map..." />
                    </SelectTrigger>
                    <SelectContent>
                        {iconLayers.length > 0 ? (
                           iconLayers.map(layer => (
                            <SelectItem key={layer.id} value={layer.id}>{layer.tag}</SelectItem>
                           ))
                        ) : (
                            <div className="p-4 text-sm text-center text-pl-muted">No items on map to reference.</div>
                        )}
                    </SelectContent>
                </Select>
            </div>
             <div className="space-y-2">
                <Label htmlFor="bearing">Bearing (°)</Label>
                <Input id="bearing" type="number" placeholder="e.g., 45" value={bearing} onChange={e => setBearing(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="distance">Distance (m)</Label>
                <Input id="distance" type="number" placeholder="e.g., 1500" value={distance} onChange={e => setDistance(e.target.value)} />
            </div>
            <Button onClick={handlePlaceByBearing} className="w-full mt-4">Place Item</Button>
        </TabsContent>
      </Tabs>
      <div className="text-center text-xs text-pl-muted mt-2">Select an equipment from the toolbar above to place it.</div>
    </div>
  );
};

export default PlacementTools;