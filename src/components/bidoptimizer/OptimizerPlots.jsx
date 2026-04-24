
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const OptimizerPlots = ({ portfolioData }) => {
  return (
    <div className="bg-white/5 p-4 rounded-lg">
      <Tabs defaultValue="scatter" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-800">
          <TabsTrigger value="scatter">Portfolio Scatter Plot</TabsTrigger>
          <TabsTrigger value="tornado">Sensitivity Tornado</TabsTrigger>
        </TabsList>
        <TabsContent value="scatter">
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

export default OptimizerPlots;
