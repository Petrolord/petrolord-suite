import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layers, Plus, Trash2 } from 'lucide-react';

const ReservoirProperties = ({ zones = [], onChange }) => {
    const addZone = () => {
        const newZone = { 
            id: Date.now(), 
            name: `Zone ${zones.length + 1}`, 
            porosity: 0.20, 
            permeability: 100, 
            ntg: 0.75, 
            sw: 0.25 
        };
        onChange([...zones, newZone]);
    };

    const updateZone = (id, field, value) => {
        const updated = zones.map(z => z.id === id ? { ...z, [field]: value } : z);
        onChange(updated);
    };

    const deleteZone = (id) => {
        onChange(zones.filter(z => z.id !== id));
    };

    return (
        <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-medium text-pl-text flex items-center">
                    <Layers className="w-5 h-5 mr-2 text-pl-muted" />
                    Zonal Properties
                </CardTitle>
                <Button size="sm" variant="outline" onClick={addZone}>
                    <Plus className="w-4 h-4 mr-2" /> Add Zone
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                {zones.map((zone) => (
                    <div key={zone.id} className="bg-pl-sunken p-3 rounded border border-pl-border grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div className="md:col-span-1">
                            <label className="text-xs text-pl-muted mb-1 block">Zone Name</label>
                            <Input 
                                value={zone.name} 
                                onChange={(e) => updateZone(zone.id, 'name', e.target.value)}
                                className="h-8"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-pl-muted mb-1 block">Porosity (frac)</label>
                            <Input 
                                type="number" step="0.01"
                                value={zone.porosity} 
                                onChange={(e) => updateZone(zone.id, 'porosity', parseFloat(e.target.value))}
                                className="h-8"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-pl-muted mb-1 block">Permeability (mD)</label>
                            <Input 
                                type="number"
                                value={zone.permeability} 
                                onChange={(e) => updateZone(zone.id, 'permeability', parseFloat(e.target.value))}
                                className="h-8"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-pl-muted mb-1 block">Net-to-Gross</label>
                            <Input 
                                type="number" step="0.01"
                                value={zone.ntg} 
                                onChange={(e) => updateZone(zone.id, 'ntg', parseFloat(e.target.value))}
                                className="h-8"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex-1">
                                <label className="text-xs text-pl-muted mb-1 block">Water Sat. (Sw)</label>
                                <Input 
                                    type="number" step="0.01"
                                    value={zone.sw} 
                                    onChange={(e) => updateZone(zone.id, 'sw', parseFloat(e.target.value))}
                                    className="h-8"
                                />
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => deleteZone(zone.id)} className="h-8 w-8 mb-0.5 text-pl-muted hover:text-pl-danger-text">
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                ))}
                {zones.length === 0 && <div className="text-center py-4 text-pl-muted text-sm">No zones defined.</div>}
            </CardContent>
        </Card>
    );
};

export default ReservoirProperties;