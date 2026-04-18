import React from 'react';
import { QAPlanShell } from './components/QAPlanShell';
import { ncrs } from '@/data/qa-plan/ncrSampleData';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function NCRRegister() {
  const { toast } = useToast();

  return (
    <QAPlanShell title="Non-Conformance Register" description="Track and manage quality non-conformances">
      <div className="flex justify-end mb-4">
         <Button className="btn-primary" onClick={() => toast({description: "Raise NCR form..."})}>
           <Plus className="w-4 h-4 mr-2" /> Raise NCR
         </Button>
      </div>
      <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
        <CardContent className="p-0">
          <table className="w-full text-sm text-left">
            <thead className="bg-[hsl(var(--secondary))] border-b border-[hsl(var(--border))]">
              <tr>
                <th className="p-4 font-semibold">NCR Number</th>
                <th className="p-4 font-semibold">QA Plan Ref</th>
                <th className="p-4 font-semibold">Description</th>
                <th className="p-4 font-semibold">Severity</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {ncrs.map(ncr => (
                <tr key={ncr.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]/50">
                  <td className="p-4 font-medium text-[hsl(var(--primary))]">{ncr.id}</td>
                  <td className="p-4 text-[hsl(var(--muted-foreground))]">{ncr.qaPlanId}</td>
                  <td className="p-4 max-w-xs truncate">{ncr.title}</td>
                  <td className="p-4">
                     <span className={`px-2 py-1 rounded text-xs ${ncr.severity === 'High' ? 'bg-red-500/10 text-red-500' : 'bg-orange-500/10 text-orange-500'}`}>{ncr.severity}</span>
                  </td>
                  <td className="p-4">
                     <span className={`px-2 py-1 rounded text-xs ${ncr.status === 'Open' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{ncr.status}</span>
                  </td>
                  <td className="p-4">
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => toast({description: "Opening NCR..."})}>View</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </QAPlanShell>
  );
}