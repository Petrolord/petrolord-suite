
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, BarChart2, ListChecks, Edit } from 'lucide-react';

const ResultsPanel = ({ results }) => {
  const { inputs, logPlot, qcSummary, stats, crossPlot } = results;

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">{inputs.wellName} - Log Analysis</h1>
        <Button variant="outline" className="border-lime-400 text-lime-400 hover:bg-lime-400/10">
          <Download className="w-4 h-4 mr-2"/>
          Export Report
        </Button>
      </div>
      
      <div className="flex-grow flex gap-4">
        <div className="w-full flex flex-col">
          <Tabs defaultValue="log-plot" className="w-full flex-grow flex flex-col">
            <TabsList className="grid w-full grid-cols-3 bg-slate-800">
              <TabsTrigger value="log-plot"><BarChart2 className="w-4 h-4 mr-2"/>Log Plot</TabsTrigger>
              <TabsTrigger value="qc-summary"><ListChecks className="w-4 h-4 mr-2"/>QC Summary</TabsTrigger>
              <TabsTrigger value="cross-plot"><BarChart2 className="w-4 h-4 mr-2"/>Cross Plot</TabsTrigger>
            </TabsList>
            <TabsContent value="log-plot" className="flex-grow bg-white rounded-b-lg p-2 mt-0 flex items-center justify-center text-slate-500">
               Chart removed
            </TabsContent>
            <TabsContent value="qc-summary" className="flex-grow bg-white rounded-b-lg p-4 mt-0 overflow-y-auto text-slate-800">
                <h3 className="text-lg font-bold text-slate-900 mb-2">QC Summary</h3>
                 <Table>
                    <TableHeader>
                      <TableRow className="border-b-slate-200 hover:bg-slate-50">
                        <TableHead className="text-slate-500">Curve</TableHead>
                        <TableHead className="text-slate-500">Spikes</TableHead>
                        <TableHead className="text-slate-500">Flat Lines</TableHead>
                        <TableHead className="text-slate-500">Missing Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {qcSummary.map((item, i) => (
                        <TableRow key={i} className="border-b-slate-100 hover:bg-slate-50">
                          <TableCell className="font-semibold text-slate-700">{item.curve}</TableCell>
                          <TableCell>{item.spikes}</TableCell>
                          <TableCell>{item.flatLines}</TableCell>
                          <TableCell>{item.missing}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <h3 className="text-lg font-bold text-slate-900 mt-4 mb-2">Data Statistics</h3>
                   <Table>
                    <TableHeader>
                      <TableRow className="border-b-slate-200 hover:bg-slate-50">
                        <TableHead className="text-slate-500">Curve</TableHead>
                        <TableHead className="text-slate-500">Min</TableHead>
                        <TableHead className="text-slate-500">Max</TableHead>
                        <TableHead className="text-slate-500">Mean</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.map((item, i) => (
                        <TableRow key={i} className="border-b-slate-100 hover:bg-slate-50">
                          <TableCell className="font-semibold text-slate-700">{item.curve}</TableCell>
                          <TableCell>{item.min}</TableCell>
                          <TableCell>{item.max}</TableCell>
                          <TableCell>{item.mean}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
            </TabsContent>
             <TabsContent value="cross-plot" className="flex-grow bg-white rounded-b-lg p-2 mt-0 flex items-center justify-center text-slate-500">
               Chart removed
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default ResultsPanel;
