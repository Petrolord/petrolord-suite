import React, { useState, useEffect } from 'react';
import { DocControlShell } from './components/DocControlShell';
import { DocumentControlService } from '@/services/DocumentControlService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Search, Clock } from 'lucide-react';
import { StatusBadge } from './components/StatusBadge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const ApprovalQueue = () => {
  const { toast } = useToast();
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await DocumentControlService.getApprovals();
      setApprovals(data);
      setLoading(false);
    }
    load();
  }, []);

  const handleAction = (action, id) => {
    toast({ description: `Action '${action}' requested for task ${id}. 🚧 Not fully implemented.` });
  };

  return (
    <DocControlShell>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
        <div className="flex items-center justify-between border-b border-[#2D3748] pb-4">
           <div>
             <h2 className="text-2xl font-bold text-[#E2E8F0]">Approval Queue</h2>
             <p className="text-sm text-[#A0AEC0] mt-1">Review and approve documents assigned to you.</p>
           </div>
           <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0AEC0]" />
            <Input placeholder="Search tasks..." className="pl-9 bg-[#1A1F2E] border-[#2D3748] text-[#E2E8F0] placeholder-[#A0AEC0]"/>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-[#A0AEC0]">Loading tasks...</div>
        ) : approvals.length === 0 ? (
          <div className="text-center py-20 bg-[#232B3A] rounded-lg border border-[#2D3748]">
            <CheckCircle className="w-12 h-12 text-[#10B981]/50 mx-auto mb-4"/>
            <h3 className="text-lg font-medium text-[#E2E8F0] mb-1">All caught up!</h3>
            <p className="text-sm text-[#A0AEC0]">You have no pending documents to review or approve.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {approvals.map(app => (
              <Card key={app.id} className="bg-[#232B3A] border-[#2D3748] hover:border-[#3B82F6] transition-colors">
                <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                       <span className="bg-[#3B82F6]/10 text-[#3B82F6] px-2 py-0.5 rounded text-xs font-semibold uppercase">{app.type}</span>
                       <span className="text-sm font-mono text-[#A0AEC0]">{app.document_number}</span>
                    </div>
                    <h4 className="text-lg font-medium text-[#E2E8F0] mb-1">{app.title}</h4>
                    <div className="flex items-center gap-4 text-xs text-[#A0AEC0]">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> Due: {app.due_date}</span>
                      <span>Requester: {app.requester}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-[#2D3748]">
                    <Button variant="outline" className="w-full md:w-auto border-[#2D3748] bg-[#1A1F2E] text-[#E2E8F0] hover:bg-[#232B3A]" onClick={() => handleAction('View', app.id)}>
                      View File
                    </Button>
                    <Button className="w-full md:w-auto bg-[#10B981] hover:bg-[#059669] text-white border-none" onClick={() => handleAction('Approve', app.id)}>
                      <CheckCircle className="w-4 h-4 mr-2"/> Approve
                    </Button>
                    <Button className="w-full md:w-auto bg-[#EF4444] hover:bg-[#DC2626] text-white border-none" onClick={() => handleAction('Reject', app.id)}>
                      <XCircle className="w-4 h-4 mr-2"/> Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DocControlShell>
  );
};

export default ApprovalQueue;