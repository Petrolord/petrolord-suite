
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRightCircle } from 'lucide-react';

const FaciesTransitionMatrixVisualizer = () => {
    return (
        <Card className="bg-slate-900 border-slate-800 h-full">
            <CardHeader className="py-3 border-b border-slate-800">
                <CardTitle className="text-sm font-medium text-slate-200 flex items-center gap-2">
                    <ArrowRightCircle className="w-4 h-4 text-pink-400" /> Markov Transition Probabilities
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-[350px] flex items-center justify-center text-slate-500">
                Chart removed
            </CardContent>
        </Card>
    );
};

export default FaciesTransitionMatrixVisualizer;
