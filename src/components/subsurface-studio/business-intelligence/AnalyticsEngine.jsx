import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Users, TrendingUp, Activity, PieChart, Zap } from 'lucide-react';

const AnalyticsEngine = () => {
    return (
        <div className="h-full p-1 space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-slate-200 flex items-center">
                        <BarChart3 className="w-5 h-5 mr-2 text-indigo-400" /> Analytics Engine
                    </h3>
                    <p className="text-xs text-slate-400">Real-time aggregation of user, feature, and system metrics.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm"><Activity className="w-4 h-4 mr-2" /> Live View</Button>
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700"><Zap className="w-4 h-4 mr-2" /> Generate Insights</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-slate-950 border-slate-800">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 uppercase">Active Users (Real-time)</p>
                            <h4 className="text-2xl font-bold text-white">428</h4>
                            <p className="text-xs text-green-400 flex items-center mt-1"><TrendingUp className="w-3 h-3 mr-1" /> +12% this week</p>
                        </div>
                        <div className="p-3 rounded-full bg-indigo-500/10 text-indigo-400">
                            <Users className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-950 border-slate-800">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 uppercase">Total Events (24h)</p>
                            <h4 className="text-2xl font-bold text-white">1.2M</h4>
                            <p className="text-xs text-slate-400 mt-1">Processed via ClickHouse</p>
                        </div>
                        <div className="p-3 rounded-full bg-purple-500/10 text-purple-400">
                            <Activity className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-950 border-slate-800">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 uppercase">Feature Adoption</p>
                            <h4 className="text-2xl font-bold text-white">86%</h4>
                            <p className="text-xs text-green-400 mt-1">Core modules utilized</p>
                        </div>
                        <div className="p-3 rounded-full bg-pink-500/10 text-pink-400">
                            <PieChart className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-slate-950 border-slate-800 flex-grow">
                <CardHeader>
                    <CardTitle className="text-sm text-slate-300">Data Pipeline Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-64 flex items-center justify-center bg-slate-900 rounded border border-slate-800 text-slate-500 text-sm">
                        [Pipeline Visualization Graph Placeholder: Ingestion -&gt; Processing -&gt; Aggregation -&gt; Storage]
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default AnalyticsEngine;