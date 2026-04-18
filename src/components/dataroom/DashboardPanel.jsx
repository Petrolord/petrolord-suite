
import React from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Eye, FileClock, ShieldCheck } from 'lucide-react';

const DashboardPanel = ({ dataRoom }) => {
  const { inputs, analytics } = dataRoom;
  const { kpis, engagementPlot, activityLog, auditLog } = analytics;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">{inputs.dataRoomName} - Dashboard</h1>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, index) => (
          <motion.div key={index} className="bg-white/5 p-4 rounded-lg">
            <p className="text-sm text-lime-300">{kpi.title}</p>
            <p className="text-2xl font-bold text-white">{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="bg-white/5 p-4 rounded-lg">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center"><BarChart className="w-5 h-5 mr-2 text-lime-300"/>Document Engagement</h2>
        <div className="w-full h-[300px] flex items-center justify-center text-slate-400 border border-white/10 rounded-md">
            Chart removed
        </div>
      </div>

      <Tabs defaultValue="activity" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-800">
          <TabsTrigger value="activity"><Eye className="w-4 h-4 mr-2"/>User Activity Log</TabsTrigger>
          <TabsTrigger value="audit"><FileClock className="w-4 h-4 mr-2"/>Audit Trail</TabsTrigger>
        </TabsList>
        <TabsContent value="activity" className="bg-white/5 rounded-lg p-2 mt-2 max-h-[300px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b-white/20 hover:bg-white/10">
                <TableHead className="text-lime-300">Timestamp</TableHead>
                <TableHead className="text-lime-300">User</TableHead>
                <TableHead className="text-lime-300">Action</TableHead>
                <TableHead className="text-lime-300">Document</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activityLog.map((log, i) => (
                <TableRow key={i} className="border-b-white/10 hover:bg-white/10">
                  <TableCell>{log.timestamp}</TableCell>
                  <TableCell>{log.user}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>{log.document}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="audit" className="bg-white/5 rounded-lg p-2 mt-2 max-h-[300px] overflow-y-auto">
           <Table>
            <TableHeader>
              <TableRow className="border-b-white/20 hover:bg-white/10">
                <TableHead className="text-lime-300">Timestamp</TableHead>
                <TableHead className="text-lime-300">User</TableHead>
                <TableHead className="text-lime-300">Action</TableHead>
                <TableHead className="text-lime-300">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLog.map((log, i) => (
                <TableRow key={i} className="border-b-white/10 hover:bg-white/10">
                  <TableCell>{log.timestamp}</TableCell>
                  <TableCell>{log.user}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>{log.details}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DashboardPanel;
