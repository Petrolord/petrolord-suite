import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, GitCompare, Search, CheckCircle } from 'lucide-react';
import { SimpleLineChart } from './VisualizationLibrary';

const DataQualityPanel = () => (
    <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
            <Card className="bg-slate-950 border-slate-800">
                <CardContent className="p-4 flex items-center justify-between">
                    <div>
                        <div className="text-xs text-slate-400">Data Completeness</div>
                        <div className="text-xl font-bold text-green-400">94%</div>
                    </div>
                    <CheckCircle className="text-green-500 w-8 h-8 opacity-20" />
                </CardContent>
            </Card>
            <Card className="bg-slate-950 border-slate-800">
                <CardContent className="p-4 flex items-center justify-between">
                    <div>
                        <div className="text-xs text-slate-400">Schema Compliance</div>
                        <div className="text-xl font-bold text-blue-400">100%</div>
                    </div>
                    <CheckCircle className="text-blue-500 w-8 h-8 opacity-20" />
                </CardContent>
            </Card>
        </div>
        
        <Alert className="bg-yellow-900/20 border-yellow-900/50 text-yellow-200">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Quality Alert</AlertTitle>
            <AlertDescription>Well 'Explore-03' is missing required curve mnemonics (DT, RHOB).</AlertDescription>
        </Alert>

        <Card className="bg-slate-950 border-slate-800">
            <CardHeader className="pb-2"><CardTitle className="text-xs text-slate-400 uppercase">Issues Log</CardTitle></CardHeader>
            <CardContent>
                <div className="space-y-2 text-xs">
                    <div className="flex justify-between border-b border-slate-800 pb-1">
                        <span>Null values in porosity track</span>
                        <Badge variant="outline" className="text-yellow-500 border-yellow-800">Warning</Badge>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1">
                        <span>Invalid depth index in Well-02</span>
                        <Badge variant="outline" className="text-red-500 border-red-800">Error</Badge>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
);

const TrendAnalysisPanel = () => {
    const data = [
        { year: '2020', prod: 1200 }, { year: '2021', prod: 1350 }, { year: '2022', prod: 1280 }, { year: '2023', prod: 1450 }, { year: '2024', prod: 1600 }
    ];
    return (
        <div className="space-y-4">
            <Card className="bg-slate-950 border-slate-800">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Production Forecast</CardTitle></CardHeader>
                <CardContent>
                    <SimpleLineChart data={data} xKey="year" yKeys={['prod']} colors={['#10b981']} />
                </CardContent>
            </Card>
            <p className="text-xs text-slate-400 italic">Trend indicates a 12% year-over-year increase in field output efficiency.</p>
        </div>
    );
};

const AnomalyDetectionPanel = () => (
    <div className="space-y-4">
         <Card className="bg-slate-950 border-slate-800">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-red-900/20 rounded text-red-400"><AlertTriangle className="w-5 h-5" /></div>
                    <div>
                        <h4 className="font-bold text-slate-200 text-sm">Spike Detected</h4>
                        <p className="text-xs text-slate-400 mt-1">Abnormal density reading found in Well A-14 at 2450m depth. Deviation {'>'} 3σ from mean.</p>
                        <div className="mt-2 h-24 bg-slate-900 rounded border border-slate-800 relative overflow-hidden">
                            <svg width="100%" height="100%" className="text-slate-600">
                                <path d="M0,50 L50,50 L60,10 L70,50 L100,50" fill="none" stroke="currentColor" strokeWidth="2" />
                            </svg>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
);

const AdvancedAnalysisTools = () => {
    return (
        <div className="h-full p-4 bg-slate-900 text-white overflow-y-auto rounded-lg border border-slate-800">
            <h2 className="text-lg font-bold mb-4 text-slate-100">Advanced Analytics Suite</h2>
            <Tabs defaultValue="quality" className="w-full">
                <TabsList className="bg-slate-950 border border-slate-800 w-full justify-start h-auto p-1">
                    <TabsTrigger value="quality" className="text-xs"><CheckCircle className="w-3 h-3 mr-2"/> Data Quality</TabsTrigger>
                    <TabsTrigger value="trends" className="text-xs"><TrendingUp className="w-3 h-3 mr-2"/> Trends</TabsTrigger>
                    <TabsTrigger value="anomaly" className="text-xs"><Search className="w-3 h-3 mr-2"/> Anomalies</TabsTrigger>
                    <TabsTrigger value="compare" className="text-xs"><GitCompare className="w-3 h-3 mr-2"/> Comparison</TabsTrigger>
                </TabsList>
                
                <div className="mt-4">
                    <TabsContent value="quality"><DataQualityPanel /></TabsContent>
                    <TabsContent value="trends"><TrendAnalysisPanel /></TabsContent>
                    <TabsContent value="anomaly"><AnomalyDetectionPanel /></TabsContent>
                    <TabsContent value="compare">
                        <div className="flex items-center justify-center h-40 text-slate-500 text-sm border border-dashed border-slate-700 rounded">
                            Select items from the Project Tree to compare.
                        </div>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
};

export default AdvancedAnalysisTools;