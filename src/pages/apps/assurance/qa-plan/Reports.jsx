import React from 'react';
import { QAPlanShell } from './components/QAPlanShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart2, PieChart, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function Reports() {
  const { toast } = useToast();

  return (
    <QAPlanShell title="QA Analytics & Reports" description="Quality metrics and performance tracking">
      <div className="flex justify-end mb-4">
         <Button variant="outline" className="border-[hsl(var(--border))]" onClick={() => toast({title: "Exporting Report", description: "Downloading PDF..."})}>
           <Download className="w-4 h-4 mr-2" /> Export Dashboard
         </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <CardHeader>
            <CardTitle className="flex items-center text-lg"><PieChart className="w-5 h-5 mr-2 text-[hsl(var(--primary))]" /> Plans by Status</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center border-t border-[hsl(var(--border))]">
            <div className="text-center text-[hsl(var(--muted-foreground))]">
               [Chart Visualization: Active 60%, Draft 20%, Closed 20%]
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <CardHeader>
            <CardTitle className="flex items-center text-lg"><BarChart2 className="w-5 h-5 mr-2 text-[hsl(var(--primary))]" /> NCRs by Department</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center border-t border-[hsl(var(--border))]">
             <div className="text-center text-[hsl(var(--muted-foreground))]">
               [Chart Visualization: Engineering 12, Drilling 5, Projects 8]
            </div>
          </CardContent>
        </Card>
      </div>
    </QAPlanShell>
  );
}