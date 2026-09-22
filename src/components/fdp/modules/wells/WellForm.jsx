import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Hammer as Drill, Save, X } from 'lucide-react';
import { calculateDrillingTime, calculateDrillingCost } from '@/utils/fdp/wellCalculations';
import { useFullPrecision } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';

const WellForm = ({ initialData, onSave, onCancel, rigRate = 250000 }) => {
    const { full } = useFullPrecision();
    const [formData, setFormData] = useState({
        id: Date.now(),
        name: '',
        type: 'Producer',
        trajectory: 'Vertical',
        tvd: 0,
        md: 0,
        location: { lat: 0, lng: 0 },
        status: 'Planned',
        days: 0,
        cost: 0
    });

    // Auto-calc triggers
    useEffect(() => {
        if (formData.md > 0) {
            const days = calculateDrillingTime(formData.md, formData.trajectory);
            // EC6-0: the plan carries a rig rate (wells.rigRate) and this form
            // ignored it, pricing every well at a hardcoded $250,000 a day.
            const cost = calculateDrillingCost(days, rigRate);
            setFormData(prev => ({ ...prev, days, cost }));
        }
    }, [formData.md, formData.trajectory, rigRate]);

    useEffect(() => {
        if (initialData) {
            setFormData({ ...initialData });
        }
    }, [initialData]);

    const handleChange = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleLocationChange = (coord, value) => {
        setFormData(prev => ({ 
            ...prev, 
            location: { ...prev.location, [coord]: parseFloat(value) } 
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
                <CardTitle className="text-white flex items-center">
                    <Drill className="w-5 h-5 mr-2 text-blue-400" />
                    {initialData ? 'Edit Well' : 'New Well'}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Well Name</Label>
                            <Input 
                                value={formData.name} 
                                onChange={(e) => handleChange('name', e.target.value)} 
                                placeholder="e.g., A-01"
                                required
                                className="bg-slate-800 border-slate-700"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select 
                                value={formData.status} 
                                onValueChange={(v) => handleChange('status', v)}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-700">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Planned">Planned</SelectItem>
                                    <SelectItem value="Drilling">Drilling</SelectItem>
                                    <SelectItem value="Completed">Completed</SelectItem>
                                    <SelectItem value="Suspended">Suspended</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Function Type</Label>
                            <Select 
                                value={formData.type} 
                                onValueChange={(v) => handleChange('type', v)}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-700">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Producer">Oil Producer</SelectItem>
                                    <SelectItem value="GasProducer">Gas Producer</SelectItem>
                                    <SelectItem value="Injector">Water Injector</SelectItem>
                                    <SelectItem value="GasInjector">Gas Injector</SelectItem>
                                    <SelectItem value="Observation">Observation</SelectItem>
                                    <SelectItem value="Exploration">Exploration/Appraisal</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Trajectory</Label>
                            <Select 
                                value={formData.trajectory} 
                                onValueChange={(v) => handleChange('trajectory', v)}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-700">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Vertical">Vertical</SelectItem>
                                    <SelectItem value="Deviated">Deviated (J/S-shape)</SelectItem>
                                    <SelectItem value="Horizontal">Horizontal</SelectItem>
                                    <SelectItem value="Multilateral">Multilateral</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-800/50 p-4 rounded border border-slate-700">
                        <div className="space-y-2">
                            <Label className="text-xs">TVD (ft)</Label>
                            <Input 
                                type="number"
                                value={formData.tvd} 
                                onChange={(e) => handleChange('tvd', parseFloat(e.target.value))} 
                                className="bg-slate-900 border-slate-700 h-8"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">MD (ft)</Label>
                            <Input 
                                type="number"
                                value={formData.md} 
                                onChange={(e) => handleChange('md', parseFloat(e.target.value))} 
                                className="bg-slate-900 border-slate-700 h-8"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Latitude</Label>
                            <Input 
                                type="number"
                                value={formData.location?.lat} 
                                onChange={(e) => handleLocationChange('lat', e.target.value)} 
                                className="bg-slate-900 border-slate-700 h-8"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Longitude</Label>
                            <Input 
                                type="number"
                                value={formData.location?.lng} 
                                onChange={(e) => handleLocationChange('lng', e.target.value)} 
                                className="bg-slate-900 border-slate-700 h-8"
                            />
                        </div>
                    </div>

                    <div className="p-4 bg-slate-800/30 rounded border border-slate-800 flex justify-between items-center">
                        <div className="text-sm">
                            <span className="text-slate-400">Est. Duration: </span>
                            <span className="text-white font-mono ml-2">{formData.days} days</span>
                        </div>
                        <div className="text-sm">
                            <span className="text-slate-400">Est. Cost: </span>
                            <span className="text-green-400 font-mono ml-2">{full ? `$${formatFull(formData.cost, 0)}` : `$${(formData.cost / 1000000).toFixed(1)}M`}</span>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="ghost" onClick={onCancel} className="text-slate-400 hover:text-white">
                            <X className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                            <Save className="w-4 h-4 mr-2" /> Save Well
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};

export default WellForm;