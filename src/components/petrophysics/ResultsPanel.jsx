
import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, BarChartHorizontal, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

const Section = ({ title, icon, children }) => (
  <div className="bg-gray-800 p-4 rounded-lg shadow-lg h-full flex flex-col">
    <h3 className="text-xl font-semibold text-teal-300 mb-4 flex items-center gap-2 border-b border-teal-800 pb-2">{icon}{title}</h3>
    <div className="space-y-4 flex-grow flex flex-col">{children}</div>
  </div>
);

const ResultsPanel = ({ plotData, zoneSummary, onDownload, sessionId }) => {
  const renderZones = () => {
    if (!zoneSummary || zoneSummary.length === 0) {
      return (
        <tr className="border-b border-gray-700"><td colSpan="14" className="p-4 text-center text-gray-500">Zonal results will appear here...</td></tr>
      );
    }
    return zoneSummary.map((z, index) => (
      <tr key={index} className="border-b border-gray-700 hover:bg-gray-700/50 text-xs">
        <td className="p-2 font-semibold">{z.zone_name}</td>
        <td className="p-2">{z.top_ft?.toFixed(2)}</td>
        <td className="p-2">{z.base_ft?.toFixed(2)}</td>
        <td className="p-2">{z.top_tvdss_ft?.toFixed(2)}</td>
        <td className="p-2">{z.base_tvdss_ft?.toFixed(2)}</td>
        <td className="p-2">{z.gross_reservoir_ft?.toFixed(2)}</td>
        <td className="p-2">{z.net_reservoir_ft?.toFixed(2)}</td>
        <td className="p-2">{z.reservoir_ntg?.toFixed(2)}</td>
        <td className="p-2">{z.net_pay_ft?.toFixed(2)}</td>
        <td className="p-2">{z.pay_ntg?.toFixed(2)}</td>
        <td className="p-2">{z.avg_vsh?.toFixed(2)}</td>
        <td className="p-2">{z.avg_phit?.toFixed(2)}</td>
        <td className="p-2">{z.avg_phie?.toFixed(2)}</td>
        <td className="p-2">{z.avg_sw?.toFixed(2)}</td>
      </tr>
    ));
  };
  
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="space-y-6 h-full flex flex-col">
      <Section title="Results" icon={<BarChartHorizontal size={20}/>}>
        <Tabs defaultValue="tracks" className="w-full flex-grow flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="tracks">Log Tracks</TabsTrigger>
            <TabsTrigger value="advanced">Advanced Plots</TabsTrigger>
          </TabsList>
          <TabsContent value="tracks" className="flex-grow">
            <div id="petro-tracks" className="h-full flex items-center justify-center text-slate-500 bg-[#1f2937]">
              Chart removed
            </div>
          </TabsContent>
          <TabsContent value="advanced" className="flex-grow">
            <Tabs defaultValue="pickett" className="w-full flex-grow flex flex-col">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pickett">Pickett Plot</TabsTrigger>
                <TabsTrigger value="buckles">Buckles Plot</TabsTrigger>
              </TabsList>
              <TabsContent value="pickett" className="flex-grow flex items-center justify-center text-slate-500 bg-[#1f2937]">
                 Chart removed
              </TabsContent>
              <TabsContent value="buckles" className="flex-grow flex items-center justify-center text-slate-500 bg-[#1f2937]">
                 Chart removed
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </Section>
      <Section title="Zonal Summary" icon={<FileText size={20}/>}>
        <ScrollArea className="flex-grow max-h-64">
          <table className="w-full text-sm">
            <thead className="text-left text-cyan-300 sticky top-0 bg-gray-800 z-10">
              <tr className="border-b border-cyan-800 text-xs">
                <th className="p-2">Zone</th>
                <th className="p-2">Top MD (ft)</th>
                <th className="p-2">Base MD (ft)</th>
                <th className="p-2">Top TVDSS (ft)</th>
                <th className="p-2">Base TVDSS (ft)</th>
                <th className="p-2">Gross (ft)</th>
                <th className="p-2">Net Res (ft)</th>
                <th className="p-2">Res NTG</th>
                <th className="p-2">Net Pay (ft)</th>
                <th className="p-2">Pay NTG</th>
                <th className="p-2">Vsh</th>
                <th className="p-2">PHIT</th>
                <th className="p-2">PHIE</th>
                <th className="p-2">Sw</th>
              </tr>
            </thead>
            <tbody id="zone-summary">
              {renderZones()}
            </tbody>
          </table>
        </ScrollArea>
        <div className="flex gap-4 mt-auto pt-4">
          <Button onClick={() => onDownload('tracks')} variant="outline" className="w-full border-cyan-500 text-cyan-300 hover:bg-cyan-900 disabled:opacity-50" disabled={!sessionId}>
            <Download className="mr-2"/>Tracks CSV
          </Button>
          <Button onClick={() => onDownload('zones')} variant="outline" className="w-full border-cyan-500 text-cyan-300 hover:bg-cyan-900 disabled:opacity-50" disabled={!sessionId}>
            <Download className="mr-2"/>Zonal CSV
          </Button>
        </div>
      </Section>
    </motion.div>
  );
};

export default ResultsPanel;
