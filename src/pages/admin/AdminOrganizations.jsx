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
import { Loader2, Search, Eye, CheckCircle, FileText, Trash2, Edit, Send, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

// Renders a bank-transfer payment proof. Proof URLs are stored as
// proofs/<quote>-<ts>.<ext> (see verify-bank-transfer), so the extension tells
// us how to display it: PDFs in an inline viewer, everything else as an image.
function ProofViewer({ url }) {
  if (!url) return <span className="text-pl-muted">No proof uploaded</span>;

  const isPdf = url.split('?')[0].toLowerCase().endsWith('.pdf');

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {isPdf ? (
        <iframe src={url} title="Payment proof (PDF)" className="w-full h-[400px] rounded bg-pl-chart-surface" />
      ) : (
        <img src={url} alt="Payment proof" className="max-h-[400px] object-contain" />
      )}
      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-pl-primary-text hover:text-pl-primary-text-hover hover:underline">
        Open in new tab
      </a>
    </div>
  );
}

function AdminOrganizationsPage() {
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

  const handleRejectPayment = async (subId) => {
    if (!confirm("Reject this payment proof? The buyer will be returned to the payment step.")) return;

    setVerifying(true);
    try {
        const { error } = await supabase.functions.invoke('reject-bank-transfer', {
            body: { subscription_id: subId }
        });
        if (error) throw error;
        toast({ title: "Rejected", description: "Payment proof rejected. Buyer can retry." });
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

  const suiteTone = (status) => (
    status === 'ACTIVE' ? 'success' : status === 'PENDING_VERIFICATION' ? 'info' : 'warning'
  );

  const OrgTable = ({ data }) => (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>HSE Status</TableHead>
          <TableHead>Suite Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((org) => {
            const activeQuote = org.quotes?.find(q => q.status === 'PENDING_VERIFICATION' || q.status === 'PENDING');
            const pendingSub = org.subscriptions?.find(s => s.payment_status === 'PENDING');

            return (
            <TableRow key={org.id}>
                <TableCell className="font-medium">
                <div className="text-pl-text font-semibold">{org.name}</div>
                <div className="text-xs text-pl-muted">{org.contact_email}</div>
                </TableCell>
                <TableCell>
                <Badge variant={org.hse_status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {org.hse_status || 'NONE'}
                </Badge>
                </TableCell>
                <TableCell>
                <Badge variant={suiteTone(org.suite_status)}>
                    {org.suite_status || 'NONE'}
                </Badge>
                </TableCell>
                <TableCell className="text-pl-muted whitespace-nowrap">{format(new Date(org.created_at), 'MMM d, yyyy')}</TableCell>
                <TableCell className="text-right">
                <div className="flex justify-end gap-2 items-center">
                    {/* View Details */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8"
                            aria-label={`View details of ${org.name}`}
                            onClick={() => navigate(`/admin/organizations/${org.id}`)}
                          >
                            <Eye className="w-4 h-4" aria-hidden="true" />
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
                            className="h-8 w-8"
                            aria-label={`Edit ${org.name}`}
                            onClick={() => navigate(`/admin/organizations/${org.id}/edit`)}
                          >
                            <Edit className="w-4 h-4" aria-hidden="true" />
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
                            className="h-8 w-8"
                            aria-label={`Send quote to ${org.name}`}
                            onClick={() => navigate(`/admin/organizations/${org.id}/send-quote`)}
                          >
                            <Send className="w-4 h-4" aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Send Quote</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {/* Verify Payment (Conditional) */}
                    {org.suite_status === 'PENDING_VERIFICATION' && pendingSub && (
                    <Dialog>
                        <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 px-2 text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" aria-hidden="true"/> Verify
                        </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                        <DialogHeader><DialogTitle>Verify Payment Proof</DialogTitle></DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="bg-pl-sunken p-2 rounded-lg border border-pl-border flex justify-center">
                                <ProofViewer url={pendingSub.bank_transfer_proof_url} />
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                                <Button variant="destructive" onClick={() => handleRejectPayment(pendingSub.id)} disabled={verifying}>Reject</Button>
                                <Button className="font-bold" 
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
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="View active quote" onClick={() => window.open(`/dashboard/quote/${activeQuote.quote_id}`, '_blank')}>
                                <FileText className="w-4 h-4" aria-hidden="true"/>
                            </Button>
                         </TooltipTrigger>
                         <TooltipContent><p>View Active Quote</p></TooltipContent>
                       </Tooltip>
                     </TooltipProvider>
                    )}

                    {/* Delete Action */}
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-pl-danger-text hover:bg-pl-danger-bg hover:text-pl-danger-text" aria-label={`Delete ${org.name}`}>
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle className="text-pl-danger-text flex items-center gap-2"><Trash2 className="w-5 h-5" aria-hidden="true"/> Delete Organization?</DialogTitle>
                          <DialogDescription>
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
    </div>
  );

  return (
    <AccountPage width="max-w-7xl">
        <AccountHeader
          eyebrow="Platform admin"
          icon={Building2}
          title="Organization Management"
          actions={(
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-pl-muted" aria-hidden="true" />
              <Input
                placeholder="Search organizations..."
                aria-label="Search organizations"
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          )}
        />

        {loading ? (
          <div className="flex justify-center p-10" role="status" aria-label="Loading organizations">
            <Loader2 className="w-6 h-6 animate-spin text-pl-muted" aria-hidden="true" />
          </div>
        ) : (
        <Tabs defaultValue="all" className="space-y-4">
          <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="all">All Orgs</TabsTrigger>
            <TabsTrigger value="pending_verif">
                Pending Verification
                {pendingVerificationOrgs.length > 0 && <Badge variant="info" className="ml-2 px-1.5 py-0 text-[10px]">{pendingVerificationOrgs.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="pending_pay">Pending Payment</TabsTrigger>
            <TabsTrigger value="active">Active Suite</TabsTrigger>
          </TabsList>
          </div>

          <Card>
            <CardContent className="p-0">
              <TabsContent value="all" className="m-0"><OrgTable data={filteredOrgs} /></TabsContent>
              <TabsContent value="pending_verif" className="m-0"><OrgTable data={pendingVerificationOrgs} /></TabsContent>
              <TabsContent value="pending_pay" className="m-0"><OrgTable data={pendingPaymentOrgs} /></TabsContent>
              <TabsContent value="active" className="m-0"><OrgTable data={activeOrgs} /></TabsContent>
            </CardContent>
          </Card>
        </Tabs>
        )}
    </AccountPage>
  );
}

export default function AdminOrganizations() {
  return (
    <AccountScope testId="admin-organizations-theme-scope">
      <AdminOrganizationsPage />
    </AccountScope>
  );
}
