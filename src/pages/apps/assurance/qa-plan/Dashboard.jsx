import React from 'react';
import { QAPlanShell } from './components/QAPlanShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { qaPlans } from '@/data/qa-plan/qaPlanSampleData';
import { ncrs } from '@/data/qa-plan/ncrSampleData';
import { CheckCircle, AlertTriangle, FileWarning, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const navigate = useNavigate();
  // Safe fallbacks if data is missing during initial load
  const safeQaPlans = qaPlans || [];
  const safeNcrs = ncrs || [];
  
  const activePlans = safeQaPlans.filter(p => p.status === 'Active').length;
  const openNcrs = safeNcrs.filter(n => n.status === 'Open').length;

  return (
    <QAPlanShell title="QA Plan Dashboard">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 text-blue-500 rounded-lg"><Activity className="w-6 h-6" /></div>
            <div><p className="text-sm text-[hsl(var(--muted-foreground))]">Total Plans</p><p className="text-2xl font-bold">{safeQaPlans.length}</p></div>
          </CardContent>
        </Card>
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-lg"><CheckCircle className="w-6 h-6" /></div>
            <div><p className="text-sm text-[hsl(var(--muted-foreground))]">Active Plans</p><p className="text-2xl font-bold">{activePlans}</p></div>
          </CardContent>
        </Card>
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-orange-500/10 text-orange-500 rounded-lg"><AlertTriangle className="w-6 h-6" /></div>
            <div><p className="text-sm text-[hsl(var(--muted-foreground))]">Pending Checks</p><p className="text-2xl font-bold">12</p></div>
          </CardContent>
        </Card>
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-red-500/10 text-red-500 rounded-lg"><FileWarning className="w-6 h-6" /></div>
            <div><p className="text-sm text-[hsl(var(--muted-foreground))]">Open NCRs</p><p className="text-2xl font-bold">{openNcrs}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <CardHeader>
            <CardTitle>Recent QA Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {safeQaPlans.slice(0, 4).map(plan => (
                <div key={plan.id} className="flex justify-between items-center p-3 hover:bg-[hsl(var(--secondary))] rounded-lg cursor-pointer border border-transparent hover:border-[hsl(var(--border))] transition-all" onClick={() => navigate(`/dashboard/apps/assurance/qa-plan/${plan.id}`)}>
                  <div>
                    <p className="font-medium text-sm">{plan.title}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{plan.id} • {plan.department}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${plan.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'}`}>{plan.status}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <CardHeader>
            <CardTitle>Recent Non-Conformances</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="space-y-4">
              {safeNcrs.map(ncr => (
                <div key={ncr.id} className="flex justify-between items-center p-3 hover:bg-[hsl(var(--secondary))] rounded-lg cursor-pointer border border-transparent hover:border-[hsl(var(--border))] transition-all" onClick={() => navigate('/dashboard/apps/assurance/qa-plan/ncr-register')}>
                  <div>
                    <p className="font-medium text-sm">{ncr.title}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{ncr.id} • {ncr.identifiedDate}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${ncr.status === 'Open' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{ncr.status}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </QAPlanShell>
  );
}