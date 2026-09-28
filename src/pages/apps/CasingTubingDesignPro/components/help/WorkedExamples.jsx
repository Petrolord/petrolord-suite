import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const WorkedExamples = () => {
    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-pl-text mb-2">Worked Examples</h3>
            
            <Tabs defaultValue="onshore" className="w-full">
                <TabsList className="w-full grid grid-cols-2 p-1 h-9">
                    <TabsTrigger value="onshore" className="text-xs">Onshore Well</TabsTrigger>
                    <TabsTrigger value="offshore" className="text-xs">Offshore Well</TabsTrigger>
                </TabsList>
                
                <TabsContent value="onshore" className="mt-4 space-y-4">
                    <div className="bg-pl-surface p-4 rounded border border-pl-border text-xs space-y-2">
                        <h4 className="font-bold text-pl-text mb-2">Scenario: 2000m Vertical Gas Well</h4>
                        <div className="grid grid-cols-2 gap-2 text-pl-muted">
                            <span>TD:</span> <span className="text-pl-text">2000m TVD</span>
                            <span>Pore Pressure:</span> <span className="text-pl-text">1.10 SG</span>
                            <span>Surface Casing:</span> <span className="text-pl-text">13-3/8" @ 500m</span>
                            <span>Intermediate:</span> <span className="text-pl-text">9-5/8" @ 1500m</span>
                            <span>Production:</span> <span className="text-pl-text">7" @ 2000m</span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-pl-border">
                            <p className="font-semibold text-pl-text">Design Logic:</p>
                            <p className="mt-1 text-pl-muted">
                                7" Production Casing must withstand full gas column burst pressure to surface in case of a tubing leak. 
                                N-80 grade was selected for the top section (0-1000m) for burst, while lower grade K-55 sufficed for the bottom.
                            </p>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="offshore" className="mt-4 space-y-4">
                    <div className="bg-pl-surface p-4 rounded border border-pl-border text-xs space-y-2">
                        <h4 className="font-bold text-pl-text mb-2">Scenario: 3500m Deviated Oil Well</h4>
                        <div className="grid grid-cols-2 gap-2 text-pl-muted">
                            <span>TD:</span> <span className="text-pl-text">3500m TVD</span>
                            <span>Water Depth:</span> <span className="text-pl-text">150m</span>
                            <span>Conductor:</span> <span className="text-pl-text">30" @ 250m</span>
                            <span>Surface:</span> <span className="text-pl-text">20" @ 800m</span>
                            <span>Production:</span> <span className="text-pl-text">9-5/8" @ 3500m</span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-pl-border">
                            <p className="font-semibold text-pl-text">Design Logic:</p>
                            <p className="mt-1 text-pl-muted">
                                High collapse load at bottom due to reservoir depletion scenario. P-110 grade required for bottom 500m. 
                                Tension checks critical due to 35 deg deviation and doglegs.
                            </p>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default WorkedExamples;