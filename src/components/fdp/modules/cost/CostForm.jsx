import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Save, X } from 'lucide-react';

const CostForm = ({ initialData, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        id: Date.now(),
        name: '',
        category: 'Drilling',
        type: 'CAPEX',
        amount: 0,
        unit: 'Lump Sum',
        phase: 'Execution',
        description: ''
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
                    <DollarSign className="w-5 h-5 mr-2 text-pl-muted" />
                    {initialData ? 'Edit Cost Item' : 'New Cost Item'}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Item Name</Label>
                            <Input 
                                value={formData.name} 
                                onChange={(e) => handleChange('name', e.target.value)} 
                                placeholder="e.g., FEED Study"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Category</Label>
                            <Select 
                                value={formData.category} 
                                onValueChange={(v) => handleChange('category', v)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Drilling">Drilling</SelectItem>
                                    <SelectItem value="Fabrication">Fabrication</SelectItem>
                                    <SelectItem value="Installation">Installation</SelectItem>
                                    <SelectItem value="Commissioning">Commissioning</SelectItem>
                                    <SelectItem value="Management">Management</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Type</Label>
                            <Select 
                                value={formData.type} 
                                onValueChange={(v) => handleChange('type', v)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="CAPEX">CAPEX</SelectItem>
                                    <SelectItem value="OPEX">OPEX</SelectItem>
                                    <SelectItem value="ABEX">ABEX</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Amount (MM$)</Label>
                            <Input 
                                type="number"
                                step="0.01"
                                value={formData.amount} 
                                onChange={(e) => handleChange('amount', parseFloat(e.target.value))} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Phase</Label>
                            <Select 
                                value={formData.phase} 
                                onValueChange={(v) => handleChange('phase', v)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Appraisal">Appraisal</SelectItem>
                                    <SelectItem value="Select">Select</SelectItem>
                                    <SelectItem value="Define">Define</SelectItem>
                                    <SelectItem value="Execution">Execution</SelectItem>
                                    <SelectItem value="Operate">Operate</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="ghost" onClick={onCancel} className="text-pl-muted hover:text-pl-text">
                            <X className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                        <Button type="submit">
                            <Save className="w-4 h-4 mr-2" /> Save Item
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};

export default CostForm;