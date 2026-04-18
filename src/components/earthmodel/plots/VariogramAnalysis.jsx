
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const VariogramAnalysis = () => {
  return (
    <Card className="h-full bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-200">Experimental Variogram (Major Axis)</CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-3rem)] flex items-center justify-center text-slate-500">
        Chart removed
      </CardContent>
    </Card>
  );
};

export default VariogramAnalysis;
