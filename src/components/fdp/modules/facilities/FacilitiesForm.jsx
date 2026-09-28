import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { Factory, Save, X } from 'lucide-react';
import { calculateFacilityCost } from '@/utils/fdp/facilitiesCalculations';

const FacilitiesForm = ({ initialData, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        id: Date.now(),
        name: '',
        type: 'FPSO',
        location: { lat: 0, lng: 0, waterDepth: 0 },
        nameplateCapacity: 0, // Oil bbl/d
        gasCapacity: 0, // MMscf/d
        waterCapacity: 0, // bbl/d
        capex: 0,
        opex: 0,
        description: '',
        designLife: 20
    });

    useEffect(() => {
        if (initialData) {
            setFormData({ ...initialData });
        }
    }, [initialData]);

    // Auto-estimate cost if changed
    const handleEstimateCost = () => {
        const estimates = calculateFacilityCost(formData);
        setFormData(prev => ({
            ...prev,
            capex: parseFloat(estimates.capex.toFixed(1)),
            opex: parseFloat(estimates.opex.toFixed(1))
        }));
    };

    const handleChange = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-pl-text flex items-center">
                    <Factory className="w-5 h-5 mr-2 text-pl-muted" />
                    {initialData ? 'Edit Facility' : 'New Facility Concept'}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Facility Name</Label>
                            <Input 
                                value={formData.name} 
                                onChange={(e) => handleChange('name', e.target.value)} 
                                placeholder="e.g., Alpha Central FPSO"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Facility Type</Label>
                            <Select 
                                value={formData.type} 
                                onValueChange={(v) => handleChange('type', v)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="FPSO">FPSO</SelectItem>
                                    <SelectItem value="Platform">Fixed Platform</SelectItem>
                                    <SelectItem value="TLP">Tension Leg Platform</SelectItem>
                                    <SelectItem value="Semi-Sub">Semi-Submersible</SelectItem>
                                    <SelectItem value="Subsea Tie-back">Subsea Tie-back</SelectItem>
                                    <SelectItem value="Onshore">Onshore Plant</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea 
                            value={formData.description} 
                            onChange={(e) => handleChange('description', e.target.value)} 
                            placeholder="Processing capabilities, storage, etc..."
                        />
                    </div>

                    <div className="p-4 bg-pl-sunken rounded border border-pl-border">
                        <h4 className="text-sm font-bold text-pl-text mb-3 uppercase">Processing Capacities</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs">Oil Rate (bopd)</Label>
                                <Input 
                                    type="number"
                                    value={formData.nameplateCapacity} 
                                    onChange={(e) => handleChange('nameplateCapacity', parseFloat(e.target.value))} 
                                    className="h-8"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Gas Rate (MMscfd)</Label>
                                <Input 
                                    type="number"
                                    value={formData.gasCapacity} 
                                    onChange={(e) => handleChange('gasCapacity', parseFloat(e.target.value))} 
                                    className="h-8"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Water Rate (bwpd)</Label>
                                <Input 
                                    type="number"
                                    value={formData.waterCapacity} 
                                    onChange={(e) => handleChange('waterCapacity', parseFloat(e.target.value))} 
                                    className="h-8"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-pl-sunken rounded border border-pl-border relative">
                        <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            onClick={handleEstimateCost}
                            className="absolute top-2 right-2 text-xs h-7"
                        >
                            Auto-Estimate
                        </Button>
                        <h4 className="text-sm font-bold text-pl-text mb-3 uppercase">Cost Estimates (MM$)</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs">Total CAPEX</Label>
                                <Input 
                                    type="number"
                                    value={formData.capex} 
                                    onChange={(e) => handleChange('capex', parseFloat(e.target.value))} 
                                    className="h-8 font-pl-mono tabular-nums"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Annual OPEX</Label>
                                <Input 
                                    type="number"
                                    value={formData.opex} 
                                    onChange={(e) => handleChange('opex', parseFloat(e.target.value))} 
                                    className="h-8 font-pl-mono tabular-nums"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Design Life (Years)</Label>
                                <Input 
                                    type="number"
                                    value={formData.designLife} 
                                    onChange={(e) => handleChange('designLife', parseFloat(e.target.value))} 
                                    className="h-8"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="ghost" onClick={onCancel} className="text-pl-muted hover:text-pl-text">
                            <X className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                        <Button type="submit">
                            <Save className="w-4 h-4 mr-2" /> Save Facility
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};

export default FacilitiesForm;