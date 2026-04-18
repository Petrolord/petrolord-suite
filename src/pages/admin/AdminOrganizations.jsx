import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Loader2, Search, Eye, CheckCircle, FileText, Trash2, Edit, Send } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function AdminOrganizations() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select(`
          *,
          subscriptions:subscriptions(*),
          quotes:quotes(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrganizations(data);
    } catch (error) {
      console.error('Error fetching organizations:', error);
      toast({ title: "Error", description: "Failed to load organizations", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPayment = async (orgId, subId) => {
    if (!confirm("Are you sure you want to verify this payment and activate the subscription?")) return;
    
    setVerifying(true);
    try {
        const { error } = await supabase.functions.invoke('activate-bank-transfer', {
            body: { subscription_id: subId }
        });
        if (error) throw error;
        toast({ title: "Success", description: "Organization activated successfully." });
        fetchOrganizations();
    } catch (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
        setVerifying(false);
    }
  };

  const handleDeleteOrg = async (orgId) => {
    setDeleting(orgId);
    try {
      const { error } = await supabase.rpc('delete_organization', { org_id_to_delete: orgId });
      if (error) throw error;
      toast({ title: "Success", description: "Organization deleted successfully.", className: "bg-green-600 text-white" });
      setOrganizations(organizations.filter(o => o.id !== orgId));
    } catch (error) {
        console.error('Delete error:', error);
        toast({ title: "Error", description: "Failed to delete organization. " + error.message, variant: "destructive" });
    } finally {
        setDeleting(null);
    }
  };

  const filteredOrgs = organizations.filter(org => 
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    org.contact_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingVerificationOrgs = filteredOrgs.filter(o => o.suite_status === 'PENDING_VERIFICATION');
  const activeOrgs = filteredOrgs.filter(o => o.suite_status === 'ACTIVE');
  const pendingPaymentOrgs = filteredOrgs.filter(o => o.suite_status === 'PENDING_PAYMENT');

  const OrgTable = ({ data }) => (
    <Table>
      <TableHeader>
        <TableRow className="border-slate-700 hover:bg-slate-800/50">
          <TableHead className="text-slate-300">Name</TableHead>
          <TableHead className="text-slate-300">HSE Status</TableHead>
          <TableHead className="text-slate-300">Suite Status</TableHead>
          <TableHead className="text-slate-300">Created</TableHead>
          <TableHead className="text-right text-slate-300">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((org) => {
            const activeQuote = org.quotes?.find(q => q.status === 'PENDING_VERIFICATION' || q.status === 'PENDING');
            const pendingSub = org.subscriptions?.find(s => s.payment_status === 'PENDING');

            return (
            <TableRow key={org.id} className="border-slate-700 hover:bg-slate-800/50">
                <TableCell className="font-medium">
                <div className="text-white font-semibold">{org.name}</div>
                <div className="text-xs text-slate-500">{org.contact_email}</div>
                </TableCell>
                <TableCell>
                <Badge variant="outline" className={org.hse_status === 'ACTIVE' ? 'border-green-500 text-green-500' : 'border-slate-500 text-slate-500'}>
                    {org.hse_status || 'NONE'}
                </Badge>
                </TableCell>
                <TableCell>
                <Badge className={
                    org.suite_status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                    org.suite_status === 'PENDING_VERIFICATION' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-yellow-500/20 text-yellow-400'
                }>
                    {org.suite_status || 'NONE'}
                </Badge>
                </TableCell>
                <TableCell className="text-slate-400">{format(new Date(org.created_at), 'MMM d, yyyy')}</TableCell>
                <TableCell className="text-right">
                <div className="flex justify-end gap-2 items-center">
                    {/* View Details */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                            onClick={() => navigate(`/admin/organizations/${org.id}`)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>View Details</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {/* Edit */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800"
                            onClick={() => navigate(`/admin/organizations/${org.id}/edit`)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Edit Organization</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {/* Send Quote */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-[#FCD34D] hover:text-yellow-300 hover:bg-yellow-900/20"
                            onClick={() => navigate(`/admin/organizations/${org.id}/send-quote`)}
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Send Quote</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {/* Verify Payment (Conditional) */}
                    {org.suite_status === 'PENDING_VERIFICATION' && pendingSub && (
                    <Dialog>
                        <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 border-[#84CC16] text-[#84CC16] hover:bg-[#84CC16]/10 px-2 text-xs">
                            <CheckCircle className="w-3 h-3 mr-1"/> Verify
                        </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl">
                        <DialogHeader><DialogTitle>Verify Payment Proof</DialogTitle></DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="bg-black p-2 rounded-lg border border-slate-800 flex justify-center">
                                {pendingSub.bank_transfer_proof_url ? (
                                    <img src={pendingSub.bank_transfer_proof_url} alt="Proof" className="max-h-[400px] object-contain"/>
                                ) : <span className="text-slate-500">No image URL found</span>}
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                                <Button variant="destructive" onClick={() => alert("Rejection flow to be implemented")}>Reject</Button>
                                <Button className="bg-[#84CC16] hover:bg-[#65a30d] text-slate-900 font-bold" 
                                    onClick={() => handleVerifyPayment(org.id, pendingSub.id)}
                                    disabled={verifying}>
                                    {verifying ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <CheckCircle className="w-4 h-4 mr-2"/>}
                                    Approve & Activate
                                </Button>
                            </div>
                        </div>
                        </DialogContent>
                    </Dialog>
                    )}

                    {/* Quote Link (Conditional) */}
                    {activeQuote && (
                       <TooltipProvider>
                       <Tooltip>
                         <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => window.open(`/dashboard/quote/${activeQuote.quote_id}`, '_blank')}>
                                <FileText className="w-4 h-4"/>
                            </Button>
                         </TooltipTrigger>
                         <TooltipContent><p>View Active Quote</p></TooltipContent>
                       </Tooltip>
                     </TooltipProvider>
                    )}

                    {/* Delete Action */}
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-900/20">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-slate-900 border-slate-700 text-white">
                        <DialogHeader>
                          <DialogTitle className="text-red-500 flex items-center gap-2"><Trash2 className="w-5 h-5"/> Delete Organization?</DialogTitle>
                          <DialogDescription className="text-slate-400">
                            This action cannot be undone. This will permanently delete <strong>{org.name}</strong> and remove all associated data including:
                            <ul className="list-disc pl-5 mt-2 space-y-1">
                              <li>All member accounts and profiles</li>
                              <li>All subscription and quote records</li>
                              <li>All project data and files</li>
                            </ul>
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="gap-2 sm:gap-0">
                          <DialogClose asChild>
                            <Button variant="ghost">Cancel</Button>
                          </DialogClose>
                          <Button 
                            variant="destructive" 
                            onClick={() => handleDeleteOrg(org.id)}
                            disabled={deleting === org.id}
                          >
                            {deleting === org.id ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null}
                            Delete Organization
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                </div>
                </TableCell>
            </TableRow>
            )
        })}
      </TableBody>
    </Table>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Organization Management</h1>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search organizations..."
              className="pl-8 bg-slate-900 border-slate-700 focus:ring-[#FCD34D]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="bg-slate-900 border-slate-800">
            <TabsTrigger value="all" className="data-[state=active]:bg-slate-800">All Orgs</TabsTrigger>
            <TabsTrigger value="pending_verif" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 relative">
                Pending Verification
                {pendingVerificationOrgs.length > 0 && <span className="ml-2 bg-blue-500 text-white text-[10px] px-1.5 rounded-full">{pendingVerificationOrgs.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="pending_pay" className="data-[state=active]:bg-slate-800">Pending Payment</TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-[#84CC16]/20 data-[state=active]:text-[#84CC16]">Active Suite</TabsTrigger>
          </TabsList>

          <Card className="bg-slate-900 border-slate-800 shadow-xl">
            <CardContent className="p-0">
              <TabsContent value="all" className="m-0"><OrgTable data={filteredOrgs} /></TabsContent>
              <TabsContent value="pending_verif" className="m-0"><OrgTable data={pendingVerificationOrgs} /></TabsContent>
              <TabsContent value="pending_pay" className="m-0"><OrgTable data={pendingPaymentOrgs} /></TabsContent>
              <TabsContent value="active" className="m-0"><OrgTable data={activeOrgs} /></TabsContent>
            </CardContent>
          </Card>
        </Tabs>
      </div>
    </div>
  );
}