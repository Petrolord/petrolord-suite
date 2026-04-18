import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Calculator, Trash2, Download, FileText, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const INITIAL_SURVEY = { md: 0, inc: 0, azi: 0, tvd: 0, north: 0, east: 0, displacement: 0 };

const DepthConversionEngine = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState([INITIAL_SURVEY]);
  const [inputMd, setInputMd] = useState('');
  const [inputInc, setInputInc] = useState('');
  const [inputAzi, setInputAzi] = useState('');

  const calculateMinimumCurvature = (prev, current) => {
    const dMD = current.md - prev.md;
    const I1 = (prev.inc * Math.PI) / 180;
    const I2 = (current.inc * Math.PI) / 180;
    const A1 = (prev.azi * Math.PI) / 180;
    const A2 = (current.azi * Math.PI) / 180;

    let dTVD, dNorth, dEast;

    if (I1 === I2 && A1 === A2) {
      dTVD = dMD * Math.cos(I2);
      dNorth = dMD * Math.sin(I2) * Math.cos(A2);
      dEast = dMD * Math.sin(I2) * Math.sin(A2);
    } else {
      const temp = Math.cos(I2 - I1) - Math.sin(I1) * Math.sin(I2) * (1 - Math.cos(A2 - A1));
      const cosBeta = Math.max(-1, Math.min(1, temp));
      const beta = Math.acos(cosBeta);
      const RF = beta === 0 ? 1 : (2 / beta) * Math.tan(beta / 2);

      dTVD = (dMD / 2) * (Math.cos(I1) + Math.cos(I2)) * RF;
      dNorth = (dMD / 2) * (Math.sin(I1) * Math.cos(A1) + Math.sin(I2) * Math.cos(A2)) * RF;
      dEast = (dMD / 2) * (Math.sin(I1) * Math.sin(A1) + Math.sin(I2) * Math.sin(A2)) * RF;
    }

    const north = prev.north + dNorth;
    const east = prev.east + dEast;

    return {
      ...current,
      tvd: prev.tvd + dTVD,
      north: north,
      east: east,
      displacement: Math.sqrt(Math.pow(north, 2) + Math.pow(east, 2))
    };
  };

  const handleCalculate = (e) => {
    e.preventDefault();
    const md = parseFloat(inputMd);
    const inc = parseFloat(inputInc);
    const azi = parseFloat(inputAzi);

    if (isNaN(md) || isNaN(inc) || isNaN(azi)) {
      toast({
        title: "Validation Error",
        description: "Please enter valid numbers for MD, Inclination, and Azimuth.",
        variant: "destructive"
      });
      return;
    }

    if (inc < 0 || inc > 180 || azi < 0 || azi >= 360) {
      toast({
        title: "Validation Error",
        description: "Inclination must be 0-180 and Azimuth 0-360.",
        variant: "destructive"
      });
      return;
    }

    const prevPoint = data[data.length - 1];
    if (md <= prevPoint.md) {
      toast({
        title: "Validation Error",
        description: "Measured Depth must be greater than the previous point.",
        variant: "destructive"
      });
      return;
    }

    const newPoint = calculateMinimumCurvature(prevPoint, { md, inc, azi });
    setData([...data, newPoint]);
    setInputMd('');
    setInputInc('');
    setInputAzi('');
    
    toast({
      title: "Calculation Success",
      description: `Added survey point at MD: ${md} ft`,
    });
  };

  const handleClear = () => {
    setData([INITIAL_SURVEY]);
    setInputMd('');
    setInputInc('');
    setInputAzi('');
    toast({
      title: "Data Cleared",
      description: "All survey points have been reset.",
    });
  };

  const exportCSV = () => {
    if (data.length <= 1) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const headers = "MD (ft),Inclination (deg),Azimuth (deg),TVD (ft),North (ft),East (ft),Displacement (ft)\n";
    const csvContent = data.map(r => 
      `${r.md.toFixed(2)},${r.inc.toFixed(2)},${r.azi.toFixed(2)},${r.tvd.toFixed(2)},${r.north.toFixed(2)},${r.east.toFixed(2)},${r.displacement.toFixed(2)}`
    ).join("\n");
    
    const blob = new Blob([headers + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "depth_conversion_results.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    if (data.length <= 1) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const doc = new jsPDF();
    doc.text("Depth Conversion Engine Results", 14, 15);
    doc.autoTable({
      startY: 25,
      head: [['MD (ft)', 'Inc (°)', 'Azi (°)', 'TVD (ft)', 'North (ft)', 'East (ft)', 'Disp (ft)']],
      body: data.map(r => [
        r.md.toFixed(2), 
        r.inc.toFixed(2), 
        r.azi.toFixed(2), 
        r.tvd.toFixed(2), 
        r.north.toFixed(2), 
        r.east.toFixed(2),
        r.displacement.toFixed(2)
      ]),
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] }
    });
    doc.save('depth_conversion_results.pdf');
  };

  // Prepare data for charts
  const trajectoryData = data.map(d => ({ x: d.east, y: d.north, z: d.tvd }));
  const tvdData = data.map(d => ({ md: d.md, tvd: d.tvd }));
  const incData = data.map(d => ({ md: d.md, inc: d.inc }));

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8 text-slate-100">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-slate-800 pb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/geoscience')} className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Activity className="w-8 h-8 text-blue-500" />
              Depth Conversion Engine
            </h1>
            <p className="text-slate-400 mt-1">Calculate True Vertical Depth, Vertical Section, and Coordinates using Minimum Curvature.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Input Form */}
          <Card className="lg:col-span-1 bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg">Add Survey Point</CardTitle>
              <CardDescription className="text-slate-400">Enter directional survey data to append to the well path.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCalculate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="md">Measured Depth (MD) [ft]</Label>
                  <Input 
                    id="md" 
                    type="number" 
                    step="0.01" 
                    required 
                    value={inputMd} 
                    onChange={e => setInputMd(e.target.value)}
                    className="bg-slate-950 border-slate-700 text-white"
                    placeholder="e.g. 5000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inc">Inclination [°]</Label>
                  <Input 
                    id="inc" 
                    type="number" 
                    step="0.01" 
                    required 
                    value={inputInc} 
                    onChange={e => setInputInc(e.target.value)}
                    className="bg-slate-950 border-slate-700 text-white"
                    placeholder="e.g. 45.5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="azi">Azimuth [°]</Label>
                  <Input 
                    id="azi" 
                    type="number" 
                    step="0.01" 
                    required 
                    value={inputAzi} 
                    onChange={e => setInputAzi(e.target.value)}
                    className="bg-slate-950 border-slate-700 text-white"
                    placeholder="e.g. 180.0"
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white">
                    <Calculator className="w-4 h-4 mr-2" />
                    Calculate
                  </Button>
                  <Button type="button" variant="outline" onClick={handleClear} className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Main Content Area */}
          <Card className="lg:col-span-2 bg-slate-900 border-slate-800 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800 pb-4">
              <CardTitle className="text-lg">Survey Results</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportCSV} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                  <Download className="w-4 h-4 mr-2" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={exportPDF} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                  <FileText className="w-4 h-4 mr-2" /> PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              <Tabs defaultValue="table" className="w-full h-full flex flex-col">
                <div className="px-6 pt-4">
                  <TabsList className="bg-slate-950 border border-slate-800">
                    <TabsTrigger value="table" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Data Table</TabsTrigger>
                    <TabsTrigger value="trajectory" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Plan View</TabsTrigger>
                    <TabsTrigger value="profile" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Section View</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="table" className="flex-1 p-6 overflow-auto">
                  <div className="rounded-md border border-slate-800">
                    <Table>
                      <TableHeader className="bg-slate-950">
                        <TableRow className="border-slate-800">
                          <TableHead className="text-slate-400">MD (ft)</TableHead>
                          <TableHead className="text-slate-400">Inc (°)</TableHead>
                          <TableHead className="text-slate-400">Azi (°)</TableHead>
                          <TableHead className="text-slate-400">TVD (ft)</TableHead>
                          <TableHead className="text-slate-400">North (ft)</TableHead>
                          <TableHead className="text-slate-400">East (ft)</TableHead>
                          <TableHead className="text-slate-400">Disp. (ft)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.map((row, idx) => (
                          <TableRow key={idx} className="border-slate-800 hover:bg-slate-800/50">
                            <TableCell className="font-medium">{row.md.toFixed(2)}</TableCell>
                            <TableCell>{row.inc.toFixed(2)}</TableCell>
                            <TableCell>{row.azi.toFixed(2)}</TableCell>
                            <TableCell className="text-blue-400">{row.tvd.toFixed(2)}</TableCell>
                            <TableCell>{row.north.toFixed(2)}</TableCell>
                            <TableCell>{row.east.toFixed(2)}</TableCell>
                            <TableCell className="text-emerald-400">{row.displacement.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="trajectory" className="flex-1 p-6 h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" dataKey="x" name="East (ft)" stroke="#94a3b8" />
                      <YAxis type="number" dataKey="y" name="North (ft)" stroke="#94a3b8" />
                      <ZAxis type="number" dataKey="z" range={[50, 50]} />
                      <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }} />
                      <Legend />
                      <Scatter name="Well Trajectory (Plan)" data={trajectoryData} fill="#3b82f6" line={{ stroke: '#3b82f6', strokeWidth: 2 }} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </TabsContent>

                <TabsContent value="profile" className="flex-1 p-6 h-[400px]">
                   <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="displacement" type="number" name="Displacement (ft)" stroke="#94a3b8" label={{ value: 'Displacement (ft)', position: 'insideBottom', offset: -10, fill: '#94a3b8' }} />
                      <YAxis dataKey="tvd" type="number" reversed={true} name="TVD (ft)" stroke="#94a3b8" label={{ value: 'TVD (ft)', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
                      <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }} />
                      <Legend verticalAlign="top" height={36}/>
                      <Line type="monotone" dataKey="tvd" name="TVD vs Displacement" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>

              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DepthConversionEngine;