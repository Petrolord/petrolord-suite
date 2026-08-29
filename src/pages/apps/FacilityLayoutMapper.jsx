import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Map, Indent, Droplets, Flame, Wind, GitBranch, Share2, CircleDot, Waypoints, Circle, ChevronsRight, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import ControlPanel from '@/components/facilitylayoutmapper/ControlPanel';
import MapPanel from '@/components/facilitylayoutmapper/MapPanel';
import { v4 as uuidv4 } from 'uuid';

const iconMap = {
  'Wellhead': CircleDot,
  'Manifold': Share2,
  'Separator': Indent,
  'Heater-Treater': Flame,
  'Tank': Droplets,
  'Flare': Wind,
  'Pump': Circle,
  'Compressor': Waypoints,
  'Pipeline': GitBranch,
  'Valve': ChevronsRight,
  'PSV': ShieldCheck,
};


/** Next free sequence number for an equipment type already on the map. */
const nextTagNumber = (layers, typeName) => {
  const used = new Set();
  for (const l of layers || []) {
    const m = typeof l?.tag === 'string' && l.tag.startsWith(`${typeName}-`)
      ? parseInt(l.tag.slice(typeName.length + 1), 10)
      : NaN;
    if (Number.isFinite(m)) used.add(m);
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
};

const FacilityLayoutMapper = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTool, setActiveTool] = useState(null);
  const [layers, setLayers] = useState([]);
  const [selectedLayer, setSelectedLayer] = useState(null);
  const [customIcons, setCustomIcons] = useState([]);

  const handleAddCustomIcon = (newIcon) => {
    setCustomIcons(prev => [...prev, newIcon]);
    toast({ title: "Custom Icon Added", description: `"${newIcon.name}" is now available in the toolbar.` });
  };

  const prevLayersRef = React.useRef(layers);
  prevLayersRef.current = layers;

  const handlePlaceItem = (latlng, tool) => {
    if (!tool || !tool.name) {
      toast({
        variant: "destructive",
        title: "Placement Error",
        description: "Cannot place item without a selected tool.",
      });
      return;
    }
    const newLayer = {
      id: uuidv4(),
      type: 'icon',
      iconName: tool.name,
      latlng: { lat: latlng.lat, lng: latlng.lng },
      // Sequential per type, not random: an equipment tag is an identity a
      // drawing and a datasheet share, and a random suffix that changes on
      // every placement is not one (Facilities F8).
      tag: `${tool.name}-${String(nextTagNumber(prevLayersRef.current, tool.name)).padStart(3, '0')}`,
      isCustom: tool.isCustom || false,
      iconUrl: tool.iconUrl || null,
    };
    setLayers(prevLayers => [...prevLayers, newLayer]);
    setSelectedLayer(newLayer);
    toast({ title: "Equipment Placed", description: `${tool.name} added to the map at ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}.` });
    setActiveTool(null);
  };
  
  const handleUpdateLayer = (updatedLayer) => {
    setLayers(prevLayers => prevLayers.map(l => l.id === updatedLayer.id ? updatedLayer : l));
    setSelectedLayer(updatedLayer);
    toast({ title: "Properties Updated", description: `Updated properties for ${updatedLayer.tag}.`});
  };

  const handleSelectLayer = (layer) => {
    setSelectedLayer(layer);
  };

  const handleLoadLayout = (layoutData) => {
    setLayers(layoutData);
    setSelectedLayer(null);
    setActiveTool(null);
    toast({ title: 'Project Loaded', description: 'The layout has been loaded onto the map.' });
  };


  return (
    <>
      <Helmet>
        <title>Facility Layout Mapper - Petrolord</title>
        <meta name="description" content="Draw scaled field layouts and schematics with standard oil & gas icons." />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css" />
      </Helmet>
      <div className="flex h-screen bg-gradient-to-br from-slate-900 to-indigo-900/50 text-white overflow-hidden">
        <motion.aside
          initial={{ x: -320 }}
          animate={{ x: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="w-80 bg-slate-900/80 backdrop-blur-sm border-r border-slate-700/50 flex flex-col"
        >
          <div className="p-4 border-b border-slate-700/50">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-r from-teal-500 to-cyan-500 p-2 rounded-lg">
                <Map className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold">Layout Mapper</h1>
            </div>
          </div>
          <div className="flex-grow overflow-y-auto">
            <ControlPanel
              activeTool={activeTool}
              setActiveTool={setActiveTool}
              layers={layers}
              setLayers={setLayers}
              onPlaceItem={handlePlaceItem}
              selectedLayer={selectedLayer}
              onUpdateLayer={handleUpdateLayer}
              onLoadLayout={handleLoadLayout}
              customIcons={customIcons}
              onAddCustomIcon={handleAddCustomIcon}
            />
          </div>
           <div className="p-4 border-t border-slate-700/50">
             <Button onClick={() => navigate('/dashboard/facilities')} className="w-full bg-white/10 hover:bg-white/20 text-white">
               Back to Facilities
             </Button>
           </div>
        </motion.aside>

        <main className="flex-1 flex flex-col">
          <MapPanel
            activeTool={activeTool}
            layers={layers}
            setLayers={setLayers}
            onPlaceItem={handlePlaceItem}
            onSelectLayer={handleSelectLayer}
            iconMap={iconMap}
          />
        </main>
      </div>
    </>
  );
};

export default FacilityLayoutMapper;