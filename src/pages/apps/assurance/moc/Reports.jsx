import React, { useState } from 'react';
import { MOCPageShell } from './components/MOCPageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  Download, Printer, BarChart2, PieChart as PieChartIcon, 
  Activity, AlertTriangle, FileText, CheckCircle, Clock 
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, 
  CartesianGrid, PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { exportToCSV, exportToExcel, exportToPDF, printElement } from '@/utils/exportUtils';
import { useToast } from '@/hooks/use-toast';

export default function MOCReports() {
  const { toast } = useToast();
  const COLORS = ['hsl(var(--primary))', 'hsl(var(--info))', 'hsl(var(--warning))', 'hsl(var(--success))', 'hsl(var(--muted))'];
  
  const stageData = [
    { name: 'Draft', value: 8 }, { name: 'Review', value: 15 },
    { name: 'Approval', value: 10 }, { name: 'Implementation', value: 20 }, { name: 'Closed', value: 45 }
  ];

  const categoryData = [
    { name: 'Facility', value: 45 }, { name: 'Process', value: 30 },
    { name: 'Procedural', value: 20 }, { name: 'Organizational', value: 5 }
  ];

  const expiryData = [
    { id: 'MOC-012', daysLeft: 2 }, { id: 'MOC-044', daysLeft: 5 },
    { id: 'MOC-088', daysLeft: 12 }, { id: 'MOC-091', daysLeft: 15 }
  ];

  const handleExport = (type, title, data) => {
    const filename = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
    if (type === 'csv') exportToCSV(data, filename);
    else if (type === 'excel') exportToExcel(data, filename);
    else if (type === 'pdf') exportToPDF(title, data, filename);
  };

  const handlePrint = (elementId, title) => {
    printElement(elementId, title);
  };

  const ReportCard = ({ id, title, icon: Icon, children, data }) => (
    <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]" id={id}>
      <CardHeader className="border-b border-[hsl(var(--border))] pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center text-[hsl(var(--foreground))]">
          <Icon className="w-4 h-4 mr-2 text-[hsl(var(--primary))]" /> {title}
        </CardTitle>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePrint(id, title)}>
            <Printer className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Download className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
              <DropdownMenuItem onClick={() => handleExport('csv', title, data)} className="cursor-pointer">Export CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('excel', title, data)} className="cursor-pointer">Export Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('pdf', title, data)} className="cursor-pointer">Export PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="p-4 h-[300px]">
        {children}
      </CardContent>
    </Card>
  );

  return (
    <MOCPageShell title="Reporting & Analytics" description="MOC Performance and Compliance Metrics">
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          <ReportCard id="rpt-stage" title="Changes by Stage" icon={BarChart2} data={stageData}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} layout="vertical" margin={{left: 40}}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12}} />
                <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12}} />
                <Tooltip contentStyle={{backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))'}} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ReportCard>

          <ReportCard id="rpt-category" title="Changes by Category" icon={PieChartIcon} data={categoryData}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label>
                  {categoryData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ReportCard>

          <ReportCard id="rpt-expiry" title="MOCs Nearing Expiry" icon={Clock} data={expiryData}>
            <div className="space-y-2">
              {expiryData.map(item => (
                <div key={item.id} className="flex justify-between p-2 rounded bg-[hsl(var(--muted))]/30 border border-[hsl(var(--border))]">
                  <span className="font-medium">{item.id}</span>
                  <span className="text-orange-500 font-bold">{item.daysLeft} days left</span>
                </div>
              ))}
            </div>
          </ReportCard>
        </div>
      </div>
    </MOCPageShell>
  );
}