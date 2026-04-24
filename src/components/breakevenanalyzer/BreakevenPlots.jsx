
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const BreakevenPlots = ({ cdfData, histogramData, tornadoData, kpis }) => {
  return (
    <div className="bg-white/5 p-4 rounded-lg">
      <Tabs defaultValue="cdf" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-slate-800">
          <TabsTrigger value="cdf">S-Curve (CDF)</TabsTrigger>
          <TabsTrigger value="histogram">Histogram</TabsTrigger>
          <TabsTrigger value="tornado">Tornado Chart</TabsTrigger>
        </TabsList>
        <TabsContent value="cdf">
          <div className="w-full h-[400px] flex items-center justify-center bg-slate-800/50 text-slate-400 rounded-md">
            Chart removed
          </div>
        </TabsContent>
        <TabsContent value="histogram">
          <div className="w-full h-[400px] flex items-center justify-center bg-slate-800/50 text-slate-400 rounded-md">
            Chart removed
          </div>
        </TabsContent>
        <TabsContent value="tornado">
          <div className="w-full h-[400px] flex items-center justify-center bg-slate-800/50 text-slate-400 rounded-md">
            Chart removed
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BreakevenPlots;
