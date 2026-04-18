import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertCircle, LineChart as ChartIcon } from 'lucide-react';
import { useMaterialBalance } from '@/hooks/useMaterialBalance';

const PVTPlots = () => {
  const { pvtData } = useMaterialBalance();

  const chartData = useMemo(() => {
    console.log("PVTPlots: Computing chart data from context. Length:", pvtData?.length);
    if (!pvtData || !Array.isArray(pvtData) || pvtData.length === 0) return [];
    
    // Sort by pressure ascending for standard PVT plot appearance
    return [...pvtData]
        .filter(d => d && typeof d.pressure === 'number' && !isNaN(d.pressure))
        .sort((a, b) => a.pressure - b.pressure);
  }, [pvtData]);

  if (chartData.length === 0) {
    return (
      <Card className="bg-slate-900 border-slate-800 h-full flex flex-col items-center justify-center text-slate-500 min-h-[400px]">
        <ChartIcon className="w-12 h-12 mb-4 text-slate-700" />
        <p className="text-sm font-medium text-slate-400">No PVT Data Available</p>
        <p className="text-xs mt-1">Configure parameters and generate the PVT table to view plots.</p>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-md shadow-xl text-xs z-50">
          <p className="font-bold text-slate-200 mb-2 border-b border-slate-700 pb-1">
            Pressure: {label} psia
          </p>
          {payload.map((entry, index) => (
            <div key={index} className="flex justify-between gap-4 py-0.5">
              <span style={{ color: entry.color }}>{entry.name}:</span>
              <span className="font-mono text-slate-300">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="bg-slate-900 border-slate-800 h-full flex flex-col shadow-lg min-h-[450px]">
      <CardHeader className="p-3 border-b border-slate-800 bg-slate-900/80">
        <CardTitle className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <ChartIcon className="w-4 h-4 text-blue-400" />
          PVT Property Curves
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 p-3 overflow-hidden bg-slate-950/50">
        <Tabs defaultValue="fvf" className="h-full flex flex-col">
          <TabsList className="h-8 mb-4 bg-slate-900 border border-slate-700 self-start">
            <TabsTrigger value="fvf" className="text-[11px] h-7 px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white">Formation Volume Factor</TabsTrigger>
            <TabsTrigger value="rs" className="text-[11px] h-7 px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white">Solution Gas (Rs)</TabsTrigger>
            <TabsTrigger value="visc" className="text-[11px] h-7 px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white">Viscosity</TabsTrigger>
          </TabsList>

          <TabsContent value="fvf" className="flex-1 min-h-0 w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis 
                    dataKey="pressure" 
                    type="number" 
                    domain={['dataMin', 'dataMax']} 
                    tick={{fill: '#94a3b8', fontSize: 11}} 
                    stroke="#475569" 
                    label={{ value: 'Pressure (psia)', position: 'bottom', fill: '#cbd5e1', fontSize: 12, offset: 0 }} 
                />
                <YAxis 
                    yAxisId="left" 
                    domain={['auto', 'auto']}
                    tick={{fill: '#22c55e', fontSize: 11}} 
                    stroke="#22c55e" 
                    label={{ value: 'Bo (RB/STB)', angle: -90, position: 'insideLeft', fill: '#22c55e', fontSize: 12 }} 
                />
                <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    domain={['auto', 'auto']}
                    tick={{fill: '#ef4444', fontSize: 11}} 
                    stroke="#ef4444" 
                    label={{ value: 'Bg (RB/SCF)', angle: 90, position: 'insideRight', fill: '#ef4444', fontSize: 12 }} 
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#cbd5e1' }} />
                <Line yAxisId="left" type="monotone" dataKey="Bo" name="Oil FVF (Bo)" stroke="#22c55e" dot={false} strokeWidth={2.5} activeDot={{ r: 6 }} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="Bg" name="Gas FVF (Bg)" stroke="#ef4444" dot={false} strokeWidth={2.5} activeDot={{ r: 6 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="rs" className="flex-1 min-h-0 w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis 
                    dataKey="pressure" 
                    type="number" 
                    domain={['dataMin', 'dataMax']} 
                    tick={{fill: '#94a3b8', fontSize: 11}} 
                    stroke="#475569" 
                    label={{ value: 'Pressure (psia)', position: 'bottom', fill: '#cbd5e1', fontSize: 12, offset: 0 }} 
                />
                <YAxis 
                    domain={['auto', 'auto']}
                    tick={{fill: '#3b82f6', fontSize: 11}} 
                    stroke="#3b82f6" 
                    label={{ value: 'Rs (scf/stb)', angle: -90, position: 'insideLeft', fill: '#3b82f6', fontSize: 12 }} 
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#cbd5e1' }} />
                <Line type="monotone" dataKey="Rs" name="Solution Gas (Rs)" stroke="#3b82f6" dot={false} strokeWidth={2.5} activeDot={{ r: 6 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="visc" className="flex-1 min-h-0 w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis 
                    dataKey="pressure" 
                    type="number" 
                    domain={['dataMin', 'dataMax']} 
                    tick={{fill: '#94a3b8', fontSize: 11}} 
                    stroke="#475569" 
                    label={{ value: 'Pressure (psia)', position: 'bottom', fill: '#cbd5e1', fontSize: 12, offset: 0 }} 
                />
                <YAxis 
                    domain={['auto', 'auto']}
                    tick={{fill: '#f59e0b', fontSize: 11}} 
                    stroke="#f59e0b" 
                    label={{ value: 'Viscosity (cp)', angle: -90, position: 'insideLeft', fill: '#f59e0b', fontSize: 12 }} 
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#cbd5e1' }} />
                <Line type="monotone" dataKey="mu_o" name="Oil Visc (μo)" stroke="#f59e0b" dot={false} strokeWidth={2.5} activeDot={{ r: 6 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="mu_g" name="Gas Visc (μg)" stroke="#8b5cf6" dot={false} strokeWidth={2.5} activeDot={{ r: 6 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default PVTPlots;