import React from 'react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Map, Trash2 } from 'lucide-react';
import HeatmapCanvas from '../tools/HeatmapCanvas';

const MapGallery = ({ isOpen, onClose }) => {
    const { state, deleteMap } = useReservoirCalc();
    const maps = state.maps || [];

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[90vw] w-full h-[85vh] bg-slate-950 border-slate-800 p-0 flex flex-col">
                <DialogHeader className="px-6 py-4 border-b border-slate-800">
                    <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                        <Map className="w-5 h-5 text-blue-400" /> Generated Property Maps
                        <span className="text-sm font-normal text-slate-500">({maps.length})</span>
                    </DialogTitle>
                </DialogHeader>

                {maps.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                        <Map className="w-12 h-12 mb-3 opacity-30" />
                        <p className="text-sm">No maps generated yet.</p>
                        <p className="text-xs mt-1 opacity-70">Use the Maps tab to create property maps from your surface.</p>
                    </div>
                ) : (
                    <ScrollArea className="flex-1 p-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {maps.map((map) => (
                                <Card key={map.id} className="bg-slate-900 border-slate-800 overflow-hidden group">
                                    <div className="h-40 bg-slate-950 relative">
                                        <HeatmapCanvas gridData={map.data} colorscale={map.colorscale || 'Viridis'} />
                                        <Badge className="absolute top-2 right-2 bg-slate-900/80 backdrop-blur text-slate-300 border-slate-700 text-[10px]">
                                            {map.unit || '—'}
                                        </Badge>
                                    </div>
                                    <div className="p-3 flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-sm text-slate-200 truncate" title={map.name}>{map.name}</h4>
                                            <p className="text-[10px] text-slate-500 mt-1 capitalize">Type: {map.type}</p>
                                        </div>
                                        <Button
                                            size="icon" variant="ghost"
                                            className="h-7 w-7 text-slate-600 hover:text-red-400 shrink-0"
                                            onClick={() => deleteMap(map.id)}
                                            title="Delete map"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default MapGallery;
