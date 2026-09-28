import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from 'lucide-react';

const KeyDates = ({ dates, onChange }) => {
    const handleChange = (key, value) => {
        onChange({ ...dates, [key]: value });
    };

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium text-pl-text flex items-center">
                    <Calendar className="w-5 h-5 mr-2 text-pl-muted" />
                    Project Timeline
                </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Discovery Date</Label>
                    <Input 
                        type="date"
                        value={dates.discovery || ''} 
                        onChange={(e) => handleChange('discovery', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Appraisal Start</Label>
                    <Input 
                        type="date"
                        value={dates.appraisal || ''} 
                        onChange={(e) => handleChange('appraisal', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label>First Oil Target</Label>
                    <Input 
                        type="date"
                        value={dates.firstOil || ''} 
                        onChange={(e) => handleChange('firstOil', e.target.value)}
                        className="border-l-4 border-l-pl-primary"
                    />
                </div>
                <div className="space-y-2">
                    <Label>Plateau Start</Label>
                    <Input 
                        type="date"
                        value={dates.plateauStart || ''} 
                        onChange={(e) => handleChange('plateauStart', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Plateau End (Est.)</Label>
                    <Input 
                        type="date"
                        value={dates.plateauEnd || ''} 
                        onChange={(e) => handleChange('plateauEnd', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Abandonment (Est.)</Label>
                    <Input 
                        type="date"
                        value={dates.abandonment || ''} 
                        onChange={(e) => handleChange('abandonment', e.target.value)}
                    />
                </div>
            </CardContent>
        </Card>
    );
};

export default KeyDates;