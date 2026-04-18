import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Printer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function Reports({ clauses = [], audits = [], findings = [] }) {
  const [selectedReport, setSelectedReport] = useState('compliance-by-standard');
  const { toast } = useToast();

  const handleExport = () => {
    toast({
      title: "Export Started",
      description: "Your report is being generated and will download shortly.",
    });
  };

  const reportData = clauses.reduce((acc, clause) => {
    if (!acc[clause.standard]) {
      acc[clause.standard] = { name: clause.standard, Compliant: 0, Partial: 0, 'Non-Compliant': 0 };
    }
    acc[clause.standard][clause.status]++;
    return acc;
  }, {});

  const chartData = Object.values(reportData);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">ISO Compliance Reports</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Generate and export compliance analytics</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleExport} className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
          <Button onClick={handleExport} className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
            <Download className="w-4 h-4 mr-2" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))] md:col-span-1 h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Available Reports</CardTitle>
          </CardHeader>
          <CardContent className="p-2 space-y-1">
            {['compliance-by-standard', 'audit-schedule', 'finding-severity', 'action-tracking'].map(report => (
              <button 
                key={report}
                onClick={() => setSelectedReport(report)}
                className={`w-full text-left px-4 py-3 rounded-md text-sm font-medium transition-colors ${selectedReport === report ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]'}`}
              >
                <div className="flex items-center">
                  <FileText className="w-4 h-4 mr-2 opacity-70" />
                  {report.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))] md:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg">Compliance by Standard</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip cursor={{ fill: 'hsl(var(--secondary))' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                  <Legend />
                  <Bar dataKey="Compliant" stackId="a" fill="hsl(160, 84%, 39%)" />
                  <Bar dataKey="Partial" stackId="a" fill="hsl(38, 92%, 50%)" />
                  <Bar dataKey="Non-Compliant" stackId="a" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}