
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Sliders } from 'lucide-react';

const InteractiveFaciesDepthTrack = ({ data, faciesColors, selectedDepthRange }) => {
    if (!data || data.length === 0) return <div className="flex items-center justify-center h-[600px] text-slate-500 border border-dashed border-slate-800 rounded">No log data available</div>;

    return (
        <Card className="h-full bg-slate-900 border-slate-800 flex flex-col">
            <CardHeader className="py-3 border-b border-slate-800 flex flex-row justify-between items-center space-y-0">
                <CardTitle className="text-sm font-medium text-slate-200 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-400"/> Facies Depth Track
                </CardTitle>
                <Button variant="ghost" size="icon" className="h-6 w-6"><Settings className="w-4 h-4" /></Button>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden relative flex items-center justify-center text-slate-500 min-h-[600px]">
                Chart removed
            </CardContent>
        </Card>
    );
};

export default InteractiveFaciesDepthTrack;
