import React from 'react';
import { MOCPageShell } from './components/MOCPageShell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, MessageSquare, ExternalLink, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

export default function MOCApprovals() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAction = (action, id) => {
    toast({ description: `${action} recorded for ${id}` });
  };

  const queue = [
    { id: 'MOC-2026-088', title: 'Update bypass procedure', category: 'Operations', type: 'Procedural', requestor: 'A. Davis', date: '2 days ago', role: 'Technical Authority' },
    { id: 'MOC-2026-070', title: 'Replace valve V-302', category: 'Facility', type: 'Permanent', requestor: 'K. Patel', date: '5 days ago', role: 'Management Approver', urgent: true },
  ];

  return (
    <MOCPageShell title="My Approval Queue" description="MOCs requiring your review or authorization">
      <div className="max-w-5xl mx-auto w-full space-y-6 pb-20 md:pb-0 animate-in fade-in duration-300">
        
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--card))]">
            <CheckCircle className="w-16 h-16 text-[hsl(var(--success))] mb-4 opacity-80" />
            <h3 className="text-xl font-bold text-[hsl(var(--foreground))]">You're all caught up!</h3>
            <p className="text-[hsl(var(--muted-foreground))]">No pending approvals in your queue.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Requires Action ({queue.length})</h2>
            </div>
            
            {queue.map((item) => (
              <Card key={item.id} className={`panel-elevation transition-all hover:border-[hsl(var(--primary))]/50 ${item.urgent ? 'border-[hsl(var(--warning))]/50' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[hsl(var(--primary))] cursor-pointer hover:underline" onClick={() => navigate(`../${item.id}`)}>{item.id}</span>
                        {item.urgent && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] uppercase tracking-wider flex items-center"><Clock className="w-3 h-3 mr-1"/> Overdue</span>}
                        <span className="px-2 py-0.5 rounded text-[10px] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">{item.type}</span>
                      </div>
                      <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">{item.title}</h3>
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">
                        Requested by <strong>{item.requestor}</strong> • Required Role: <strong>{item.role}</strong> • {item.date}
                      </p>
                    </div>
                    
                    <div className="flex flex-row md:flex-col gap-2 justify-center border-t md:border-t-0 md:border-l border-[hsl(var(--border))] pt-4 md:pt-0 md:pl-6">
                      <Button className="w-full bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/80 text-white" size="sm" onClick={() => handleAction('Approval', item.id)}>
                        <CheckCircle className="w-4 h-4 mr-2" /> Approve
                      </Button>
                      <Button variant="outline" className="w-full border-[hsl(var(--destructive))] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10" size="sm" onClick={() => handleAction('Rejection', item.id)}>
                        <XCircle className="w-4 h-4 mr-2" /> Reject
                      </Button>
                      <Button variant="ghost" className="w-full text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" size="sm" onClick={() => navigate(`../${item.id}`)}>
                        <ExternalLink className="w-4 h-4 mr-2" /> Review Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MOCPageShell>
  );
}