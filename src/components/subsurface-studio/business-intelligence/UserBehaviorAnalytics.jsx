import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Clock, MapPin } from 'lucide-react';

const UserBehaviorAnalytics = () => {
    return (
        <div className="h-full p-1 space-y-4">
            <h3 className="text-lg font-bold text-slate-200 flex items-center">
                <Users className="w-5 h-5 mr-2 text-blue-400" /> User Behavior
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-slate-950 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-sm text-slate-300 flex items-center"><Clock className="w-4 h-4 mr-2"/> Session Duration Distribution</CardTitle>
                    </CardHeader>
                    <CardContent className="h-64 flex items-end justify-around pb-4 px-4 gap-2">
                        {[15, 35, 60, 40, 25, 10].map((h, i) => (
                            <div key={i} className="w-full bg-blue-900/40 hover:bg-blue-800/60 rounded-t transition-all relative group" style={{ height: `${h}%` }}>
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity">{h}%</div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card className="bg-slate-950 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-sm text-slate-300 flex items-center"><MapPin className="w-4 h-4 mr-2"/> User Journeys</CardTitle>
                    </CardHeader>
                    <CardContent className="h-64 p-4">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400">Login -&gt; Dashboard -&gt; 3D Window</span>
                                <span className="text-slate-200 font-mono">45%</span>
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden"><div className="bg-blue-500 h-full" style={{width: '45%'}}></div></div>

                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400">Login -&gt; Map View -&gt; Export</span>
                                <span className="text-slate-200 font-mono">22%</span>
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden"><div className="bg-blue-500 h-full" style={{width: '22%'}}></div></div>

                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400">Login -&gt; Admin -&gt; User Mgmt</span>
                                <span className="text-slate-200 font-mono">8%</span>
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden"><div className="bg-blue-500 h-full" style={{width: '8%'}}></div></div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default UserBehaviorAnalytics;