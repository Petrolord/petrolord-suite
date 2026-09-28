import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { Lightbulb, Save, X } from 'lucide-react';

const ConceptForm = ({ initialData, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        id: Date.now(),
        name: '',
        description: '',
        facilityType: 'FPSO',
        driveMechanism: 'Water Injection',
        peakProduction: 0,
        drillingCapex: 0,
        facilitiesCapex: 0,
        subseaCapex: 0,
        opex: 0,
        wellCount: 0,
        startDate: new Date().toISOString().split('T')[0],
    });

    useEffect(() => {
        if (initialData) {
            setFormData({ ...initialData });
        }
    }, [initialData]);

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
                    <Lightbulb className="w-5 h-5 mr-2 text-pl-muted" />
                    {initialData ? 'Edit Concept' : 'New Development Concept'}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Concept Name</Label>
                            <Input 
                                value={formData.name} 
                                onChange={(e) => handleChange('name', e.target.value)} 
                                placeholder="e.g., FPSO + Subsea Tie-back"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Facility Type</Label>
                            <Select 
                                value={formData.facilityType} 
                                onValueChange={(v) => handleChange('facilityType', v)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="FPSO">FPSO</SelectItem>
                                    <SelectItem value="Platform">Fixed Platform</SelectItem>
                                    <SelectItem value="TLP">Tension Leg Platform</SelectItem>
                                    <SelectItem value="Subsea">Subsea to Shore</SelectItem>
                                    <SelectItem value="Onshore">Onshore Facility</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Description & Rationale</Label>
                        <Textarea 
                            value={formData.description} 
                            onChange={(e) => handleChange('description', e.target.value)} 
                            placeholder="Describe the concept strategy..."
                            className="min-h-[100px]"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Drive Mechanism</Label>
                            <Select 
                                value={formData.driveMechanism} 
                                onValueChange={(v) => handleChange('driveMechanism', v)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Natural Depletion">Natural Depletion</SelectItem>
                                    <SelectItem value="Water Injection">Water Injection</SelectItem>
                                    <SelectItem value="Gas Injection">Gas Injection</SelectItem>
                                    <SelectItem value="ESP">Artificial Lift (ESP)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Well Count</Label>
                            <Input 
                                type="number"
                                value={formData.wellCount} 
                                onChange={(e) => handleChange('wellCount', parseInt(e.target.value))} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Peak Production (kbpd)</Label>
                            <Input 
                                type="number"
                                value={formData.peakProduction} 
                                onChange={(e) => handleChange('peakProduction', parseFloat(e.target.value))} 
                            />
                        </div>
                    </div>

                    <div className="p-4 bg-pl-sunken rounded border border-pl-border">
                        <h4 className="text-sm font-bold text-pl-text mb-3 uppercase">Cost Estimates (MM$)</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <Label className="text-xs">Drilling CAPEX</Label>
                                <Input type="number" value={formData.drillingCapex} onChange={(e) => handleChange('drillingCapex', parseFloat(e.target.value))} className="h-8" />
                            </div>
                            <div>
                                <Label className="text-xs">Facilities CAPEX</Label>
                                <Input type="number" value={formData.facilitiesCapex} onChange={(e) => handleChange('facilitiesCapex', parseFloat(e.target.value))} className="h-8" />
                            </div>
                            <div>
                                <Label className="text-xs">Subsea CAPEX</Label>
                                <Input type="number" value={formData.subseaCapex} onChange={(e) => handleChange('subseaCapex', parseFloat(e.target.value))} className="h-8" />
                            </div>
                            <div>
                                <Label className="text-xs">Annual OPEX</Label>
                                <Input type="number" value={formData.opex} onChange={(e) => handleChange('opex', parseFloat(e.target.value))} className="h-8" />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="ghost" onClick={onCancel} className="text-pl-muted hover:text-pl-text">
                            <X className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                        <Button type="submit">
                            <Save className="w-4 h-4 mr-2" /> Save Concept
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};

export default ConceptForm;