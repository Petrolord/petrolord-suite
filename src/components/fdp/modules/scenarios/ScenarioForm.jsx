import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { Save, X, TrendingUp } from 'lucide-react';

const ScenarioForm = ({ initialData, concepts, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        id: Date.now(),
        name: '',
        conceptId: '',
        type: 'Base',
        oilPrice: 70,
        discountRate: 10,
        description: '',
    });

    useEffect(() => {
        if (initialData) {
            setFormData({ ...initialData });
        } else if (concepts.length > 0 && !formData.conceptId) {
            // EC6-0: keep the concept's own id. This used to store the default
            // as a STRING while a pick from the list stored a number, and the
            // card matched with ===, so a scenario saved without touching this
            // field never found its concept and rendered nothing at all.
            setFormData(prev => ({ ...prev, conceptId: concepts[0].id }));
        }
    }, [initialData, concepts]);

    const handleChange = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <Card className="bg-slate-900 border-slate-800 max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle className="text-white flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2 text-green-400" />
                    {initialData ? 'Edit Scenario' : 'New Economic Scenario'}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Scenario Name</Label>
                        <Input 
                            value={formData.name} 
                            onChange={(e) => handleChange('name', e.target.value)} 
                            placeholder="e.g., Base Case - $70 Oil"
                            required
                            className="bg-slate-800 border-slate-700"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Linked Concept</Label>
                            <Select 
                                value={formData.conceptId !== undefined && formData.conceptId !== null ? String(formData.conceptId) : ''}
                                onValueChange={(v) => handleChange('conceptId', concepts.find(c => String(c.id) === v)?.id ?? v)}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-700">
                                    <SelectValue placeholder="Select Concept" />
                                </SelectTrigger>
                                <SelectContent>
                                    {concepts.map(c => (
                                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Scenario Type</Label>
                            <Select 
                                value={formData.type} 
                                onValueChange={(v) => handleChange('type', v)}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-700">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Base">Base Case</SelectItem>
                                    <SelectItem value="High">High Case (Upside)</SelectItem>
                                    <SelectItem value="Low">Low Case (Downside)</SelectItem>
                                    <SelectItem value="Stress">Stress Test</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-800/50 p-4 rounded border border-slate-700">
                        <div className="space-y-2">
                            <Label>Oil Price Assumption ($/bbl)</Label>
                            <Input 
                                type="number"
                                value={formData.oilPrice} 
                                onChange={(e) => handleChange('oilPrice', parseFloat(e.target.value))} 
                                className="bg-slate-900 border-slate-700"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Discount Rate (%)</Label>
                            <Input 
                                type="number"
                                value={formData.discountRate} 
                                onChange={(e) => handleChange('discountRate', parseFloat(e.target.value))} 
                                className="bg-slate-900 border-slate-700"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea 
                            value={formData.description} 
                            onChange={(e) => handleChange('description', e.target.value)} 
                            placeholder="Details about assumptions..."
                            className="bg-slate-800 border-slate-700"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="ghost" onClick={onCancel} className="text-slate-400 hover:text-white">
                            <X className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                        <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white">
                            <Save className="w-4 h-4 mr-2" /> Save Scenario
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};

export default ScenarioForm;