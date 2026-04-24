import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Printer, Filter } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { useToast } from '@/hooks/use-toast';

const rootCauseData = [
  { name: 'Procedural Omission', count: 45 },
  { name: 'Equipment Design', count: 32 },
  { name: 'Human Error', count: 28 },
  { name: 'Weather/Environment', count: 15 },
  { name: 'Communication Breakdown', count: 20 },
];

export default function Reports() {
  const { toast } = useToast();

  const handleAction = () => {
    toast({
      title: "Action triggered",
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
    });
  };

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500 pb-24">
      {/* Header Actions */}
      <div className="flex justify-between items-center bg-[hsl(var(--card))] p-4 rounded-xl border border-[hsl(var(--border))] shadow-sm">
        <div className="flex items-center gap-3">
           <Button variant="outline" className="bg-transparent border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]" onClick={handleAction}>
            <Filter className="w-4 h-4 mr-2" /> Global Filters
          </Button>
          <span className="text-sm text-[hsl(var(--muted-foreground))]">Date Range: Year to Date</span>
        </div>
        <div className="flex items-center gap-2">
           <Button variant="outline" className="bg-transparent border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]" onClick={handleAction}>
            <Printer className="w-4 h-4 mr-2" /> Print All
          </Button>
          <Button className="btn-primary" onClick={handleAction}>
            <Download className="w-4 h-4 mr-2" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Report 1 */}
        <Card className="panel-elevation">
          <CardHeader className="flex flex-row items-center justify-between border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Lessons by Root Cause</CardTitle>
            <Button variant="ghost" size="icon" onClick={handleAction} className="h-8 w-8"><Download className="w-4 h-4 text-[hsl(var(--muted-foreground))]"/></Button>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rootCauseData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'hsl(var(--secondary))' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
                    {rootCauseData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="hsl(var(--primary))" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Report Placeholder */}
        <Card className="panel-elevation">
          <CardHeader className="flex flex-row items-center justify-between border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Reusability Matrix</CardTitle>
            <Button variant="ghost" size="icon" onClick={handleAction} className="h-8 w-8"><Download className="w-4 h-4 text-[hsl(var(--muted-foreground))]"/></Button>
          </CardHeader>
          <CardContent className="p-6 flex items-center justify-center h-[300px]">
             <div className="text-center text-[hsl(var(--muted-foreground))] border border-dashed border-[hsl(var(--border))] rounded-lg p-8 w-full">
               Matrix visualization loading...
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}