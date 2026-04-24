import React from 'react';
import { QAPlanShell } from './components/QAPlanShell';
import { qaPlans } from '@/data/qa-plan/qaPlanSampleData';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

export default function Register() {
  const navigate = useNavigate();

  return (
    <QAPlanShell title="QA Plan Register" description="Complete registry of all Quality Assurance Plans">
      <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))] mb-6">
        <CardContent className="p-4 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <Input placeholder="Search QA Plans..." className="pl-9 bg-[hsl(var(--background))] border-[hsl(var(--border))]" />
          </div>
        </CardContent>
      </Card>

      <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden bg-[hsl(var(--card))]">
        <table className="w-full text-sm text-left">
          <thead className="bg-[hsl(var(--secondary))] border-b border-[hsl(var(--border))]">
            <tr>
              <th className="p-3 font-semibold">ID</th>
              <th className="p-3 font-semibold">Title</th>
              <th className="p-3 font-semibold">Department</th>
              <th className="p-3 font-semibold">Owner</th>
              <th className="p-3 font-semibold">Progress</th>
              <th className="p-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {qaPlans.map(plan => (
              <tr key={plan.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]/50 cursor-pointer" onClick={() => navigate(`/dashboard/apps/assurance/qa-plan/${plan.id}`)}>
                <td className="p-3 font-medium text-[hsl(var(--primary))]">{plan.id}</td>
                <td className="p-3">{plan.title}</td>
                <td className="p-3 text-[hsl(var(--muted-foreground))]">{plan.department}</td>
                <td className="p-3 text-[hsl(var(--muted-foreground))]">{plan.owner}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 bg-[hsl(var(--secondary))] rounded-full overflow-hidden">
                      <div className="h-full bg-[hsl(var(--primary))]" style={{ width: `${plan.progress}%` }}></div>
                    </div>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">{plan.progress}%</span>
                  </div>
                </td>
                <td className="p-3">
                   <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider ${plan.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500' : plan.status === 'Closed' ? 'bg-blue-500/10 text-blue-500' : 'bg-orange-500/10 text-orange-500'}`}>
                    {plan.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </QAPlanShell>
  );
}