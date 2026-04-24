
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Maximize2, PenTool, Grid } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FaciesCrossplotMatrix = ({ data, faciesColors }) => {
    if (!data) return null;

    return (
        <Card className="bg-slate-900 border-slate-800 h-full flex flex-col">
            <CardHeader className="py-3 border-b border-slate-800 flex flex-row justify-between items-center space-y-0">
                <CardTitle className="text-sm font-medium text-slate-200 flex items-center gap-2">
                    <Grid className="w-4 h-4 text-indigo-400" /> Property Crossplot Matrix
                </CardTitle>
                <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7"><PenTool className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7"><Maximize2 className="w-4 h-4" /></Button>
                </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex items-center justify-center text-slate-500 min-h-[500px]">
                Chart removed
            </CardContent>
        </Card>
    );
};

export default FaciesCrossplotMatrix;
