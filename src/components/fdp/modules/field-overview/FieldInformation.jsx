import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';

const FieldInformation = ({ data, onChange }) => {
    const handleChange = (key, value) => {
        onChange({ ...data, [key]: value });
    };

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium text-pl-text flex items-center">
                    <Info className="w-5 h-5 mr-2 text-pl-muted" />
                    Field Information
                </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Field Name</Label>
                    <Input 
                        value={data.fieldName || ''} 
                        onChange={(e) => handleChange('fieldName', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Region/Country</Label>
                    <Input 
                        value={data.country || ''} 
                        onChange={(e) => handleChange('country', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Operator</Label>
                    <Input 
                        value={data.operator || ''} 
                        onChange={(e) => handleChange('operator', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Asset Type</Label>
                    <Select value={data.assetType} onValueChange={(v) => handleChange('assetType', v)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Onshore">Onshore</SelectItem>
                            <SelectItem value="Offshore">Offshore</SelectItem>
                            <SelectItem value="Subsea">Subsea</SelectItem>
                            <SelectItem value="Deepwater">Deepwater</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Water Depth (m)</Label>
                    <Input 
                        type="number"
                        value={data.waterDepth || ''} 
                        onChange={(e) => handleChange('waterDepth', parseFloat(e.target.value))}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Field Area (sq km)</Label>
                    <Input 
                        type="number"
                        value={data.fieldArea || ''} 
                        onChange={(e) => handleChange('fieldArea', parseFloat(e.target.value))}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Project Status</Label>
                    <Select value={data.status} onValueChange={(v) => handleChange('status', v)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Exploration">Exploration</SelectItem>
                            <SelectItem value="Appraisal">Appraisal</SelectItem>
                            <SelectItem value="Development">Development</SelectItem>
                            <SelectItem value="Production">Production</SelectItem>
                            <SelectItem value="Abandonment">Abandonment</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
};

export default FieldInformation;