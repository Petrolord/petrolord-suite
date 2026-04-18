
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const DepthPlotInteractive = ({ data, faciesColors }) => {
    if (!data || data.length === 0) return null;

    return (
        <Card className="h-full bg-slate-900 border-slate-800">
            <CardHeader className="py-3 px-4 border-b border-slate-800">
                <CardTitle className="text-sm">Interactive Depth Tracks</CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-[600px] flex items-center justify-center text-slate-500">
                Chart removed
            </CardContent>
        </Card>
    );
};

export default DepthPlotInteractive;
