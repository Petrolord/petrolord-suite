import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Save, X } from 'lucide-react';
import { RiskTypes, RiskCategories, RiskStatus, createRisk, calculateRiskScore, getRiskLevel } from '@/data/fdp/HSEModel';

const HSERiskForm = ({ initialData, onSave, onCancel }) => {
    const [formData, setFormData] = useState(createRisk());

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

    // EC6-1: one banding scale, and an unassessed hazard says so rather
    // than scoring as Low.
    const score = calculateRiskScore(formData);
    const level = getRiskLevel(score);
    const levelColor = level === 'Critical' ? 'text-pl-danger-text font-bold'
        : level === 'High' ? 'text-pl-danger-text'
            : level === 'Medium' ? 'text-pl-warning-text'
                : level === 'Unscored' ? 'text-pl-muted' : 'text-pl-success-text';

    return (
        <Card className="max-w-3xl mx-auto">
            <CardHeader>
                <CardTitle className="text-pl-text flex items-center justify-between">
                    <div className="flex items-center">
                        <AlertTriangle className="w-5 h-5 mr-2 text-pl-muted" />
                        {initialData ? 'Edit Risk' : 'New Risk Assessment'}
                    </div>
                    <div className={`text-sm font-pl-mono tabular-nums border px-2 py-1 rounded bg-pl-sunken ${levelColor} border-pl-border`}>
                        {score === null ? 'Not scored' : `Score: ${score} (${level})`}
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Risk Name / Hazard</Label>
                            <Input 
                                value={formData.name} 
                                onChange={(e) => handleChange('name', e.target.value)} 
                                placeholder="e.g., Gas Leak"
                                required
                            />
                        </div>
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
                                    {Object.values(RiskTypes).map(t => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                    {Object.values(RiskCategories).map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Probability (1-5)</Label>
                            <Input 
                                type="number" min="1" max="5"
                                value={formData.probability} 
                                onChange={(e) => handleChange('probability', parseInt(e.target.value))} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Impact (1-5)</Label>
                            <Input 
                                type="number" min="1" max="5"
                                value={formData.impact} 
                                onChange={(e) => handleChange('impact', parseInt(e.target.value))} 
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Description & Consequence</Label>
                        <Textarea 
                            value={formData.description} 
                            onChange={(e) => handleChange('description', e.target.value)}
                            className="min-h-[80px]"
                            placeholder="Describe the scenario..."
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Mitigation Strategy</Label>
                        <Textarea 
                            value={formData.mitigation} 
                            onChange={(e) => handleChange('mitigation', e.target.value)}
                            className="min-h-[80px]"
                            placeholder="Controls and barriers to be put in place..."
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Owner</Label>
                            <Input 
                                value={formData.owner} 
                                onChange={(e) => handleChange('owner', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select 
                                value={formData.status} 
                                onValueChange={(v) => handleChange('status', v)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.values(RiskStatus).map(s => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-pl-border">
                        <Button type="button" variant="ghost" onClick={onCancel} className="text-pl-muted hover:text-pl-text">
                            <X className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                        <Button type="submit">
                            <Save className="w-4 h-4 mr-2" /> Save Risk
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};

export default HSERiskForm;