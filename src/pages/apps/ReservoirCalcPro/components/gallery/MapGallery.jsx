import React from 'react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Map, Trash2 } from 'lucide-react';
import HeatmapCanvas from '../tools/HeatmapCanvas';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const MapGallery = ({ isOpen, onClose }) => {
    const { state, deleteMap } = useReservoirCalc();
    const maps = state.maps || [];

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[90vw] w-full h-[85vh] p-0 flex flex-col">
                <DialogHeader className="px-6 py-4 border-b border-pl-border">
                    <DialogTitle className="text-lg font-bold text-pl-text flex items-center gap-2">
                        <Map className="w-5 h-5 text-pl-muted" /> Generated Property Maps
                        <span className="text-sm font-normal text-pl-muted">({maps.length})</span>
                    </DialogTitle>
                </DialogHeader>

                {maps.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-pl-muted">
                        <Map className="w-12 h-12 mb-3 opacity-30" />
                        <p className="text-sm">No maps generated yet.</p>
                        <p className="text-xs mt-1 opacity-70">Use the Maps tab to create property maps from your surface.</p>
                    </div>
                ) : (
                    <ScrollArea className="flex-1 p-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {maps.map((map) => (
                                <Card key={map.id} className="overflow-hidden group">
                                    <div className="h-40 bg-pl-bg relative" data-canvas="dark">
                                        <HeatmapCanvas gridData={map.data} colorscale={map.colorscale || 'Viridis'} />
                                        <Badge variant="neutral" className="absolute top-2 right-2 text-[10px]">
                                            {map.unit || EMPTY_VALUE}
                                        </Badge>
                                    </div>
                                    <div className="p-3 flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-sm text-pl-text truncate" title={map.name}>{map.name}</h4>
                                            <p className="text-[10px] text-pl-muted mt-1 capitalize">Type: {map.type}</p>
                                        </div>
                                        <Button
                                            size="icon" variant="ghost"
                                            className="h-7 w-7 text-pl-muted hover:text-pl-danger-text shrink-0"
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
