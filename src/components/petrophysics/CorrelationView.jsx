
import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { AlignCenter, ArrowLeftRight, Lock, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';

const CorrelationView = ({ wells, selectedWellIds, markers, onToggleWell, flattenMarker, onSetFlattenMarker, onAddMarker }) => {
  const { toast } = useToast();
  const [displayCurve, setDisplayCurve] = useState('GR');
  const [pickMode, setPickMode] = useState(false);
  const [activePick, setActivePick] = useState(null);

  const activeWells = useMemo(() => {
    return selectedWellIds
        .map(id => wells.find(w => w.id === id))
        .filter(Boolean);
  }, [wells, selectedWellIds]);

  return (
    <div className="h-full flex gap-4">
       <Card className="w-72 bg-slate-900 border-slate-800 flex flex-col shrink-0">
           <div className="p-4 border-b border-slate-800 bg-slate-900/50 space-y-4">
               <div>
                   <Label className="text-xs mb-1.5 block text-slate-400">Display Curve</Label>
                   <Select value={displayCurve} onValueChange={setDisplayCurve}>
                       <SelectTrigger className="h-8 bg-slate-950 border-slate-800">
                           <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                           <SelectItem value="GR">Gamma Ray (GR)</SelectItem>
                           <SelectItem value="RES_DEEP">Resistivity (Deep)</SelectItem>
                           <SelectItem value="NPHI">Neutron (NPHI)</SelectItem>
                           <SelectItem value="RHOB">Density (RHOB)</SelectItem>
                       </SelectContent>
                   </Select>
               </div>

               <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
                   <h4 className="text-xs font-semibold text-blue-400 flex items-center gap-2">
                       <AlignCenter className="w-3 h-3" /> Flattening (Datum)
                   </h4>
                   <Select value={flattenMarker || "none"} onValueChange={(v) => onSetFlattenMarker(v === "none" ? null : v)}>
                       <SelectTrigger className="h-8 text-xs">
                           <SelectValue placeholder="Select Marker..." />
                       </SelectTrigger>
                       <SelectContent>
                           <SelectItem value="none">None (Measured Depth)</SelectItem>
                           {[...new Set(markers.map(m => m.name))].map(name => (
                               <SelectItem key={name} value={name}>{name}</SelectItem>
                           ))}
                       </SelectContent>
                   </Select>
                   {flattenMarker && (
                       <div className="text-[10px] text-slate-500 flex items-center gap-1">
                           <Lock className="w-3 h-3" /> Locked on {flattenMarker}
                       </div>
                   )}
               </div>

               <Button 
                    variant={pickMode ? "default" : "outline"} 
                    className={`w-full justify-start ${pickMode ? 'bg-blue-600 hover:bg-blue-500' : 'border-slate-700'}`}
                    onClick={() => { setPickMode(!pickMode); setActivePick(null); }}
               >
                   <Wand2 className="w-4 h-4 mr-2" />
                   {pickMode ? (activePick ? "Click Target Well..." : "Cancel Pick") : "Pick Boundaries"}
               </Button>
           </div>

           <ScrollArea className="flex-1 p-4">
               <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3 flex justify-between">
                   <span>Active Wells</span>
                   <span className="text-[10px]">{selectedWellIds.length}/4</span>
               </h4>
               <div className="space-y-2">
                   {wells.map(well => (
                       <div key={well.id} className="flex items-center space-x-2 p-2 rounded hover:bg-slate-800/50 transition-colors">
                           <Checkbox 
                                id={`chk-${well.id}`}
                                checked={selectedWellIds.includes(well.id)}
                                onCheckedChange={() => onToggleWell(well.id)}
                                disabled={!selectedWellIds.includes(well.id) && selectedWellIds.length >= 4}
                                className="border-slate-600 data-[state=checked]:bg-blue-600"
                           />
                           <label 
                                htmlFor={`chk-${well.id}`}
                                className="text-sm text-slate-300 cursor-pointer select-none truncate flex-1"
                           >
                               {well.name}
                           </label>
                           {selectedWellIds.includes(well.id) && (
                               <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-500 h-5">
                                   Track {selectedWellIds.indexOf(well.id) + 1}
                               </Badge>
                           )}
                       </div>
                   ))}
               </div>

               {activeWells.length > 1 && (
                   <div className="mt-6 pt-4 border-t border-slate-800">
                       <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Stats</h4>
                       <div className="space-y-2 text-xs text-slate-400">
                           <div className="flex justify-between">
                               <span>Range Span:</span>
                               <span className="text-slate-200">{(activeWells.length * 0.25 * 1000).toFixed(0)} ft (est)</span>
                           </div>
                           <div className="flex justify-between">
                               <span>Markers Visible:</span>
                               <span className="text-slate-200">{markers.filter(m => selectedWellIds.includes(m.well_id)).length}</span>
                           </div>
                       </div>
                   </div>
               )}
           </ScrollArea>
       </Card>

       <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden relative min-h-[600px]">
            {activeWells.length > 0 ? (
                <div className="flex items-center justify-center w-full h-full text-slate-500">
                    Chart removed
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                    <ArrowLeftRight className="w-16 h-16 mb-4 opacity-20" />
                    <p>Select at least one well to visualize.</p>
                    <p className="text-xs mt-2 opacity-50">Use the sidebar to add tracks.</p>
                </div>
            )}
       </div>
    </div>
  );
};

export default CorrelationView;
