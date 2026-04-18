import React, { useState, useEffect } from 'react';
import { useAdminOrg } from '@/contexts/AdminOrganizationContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, ExternalLink, RotateCcw, Search, Filter } from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/adminHelpers';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/customSupabaseClient';

const OrgPayments = () => {
  const { selectedOrg } = useAdminOrg();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchPayments();
  }, [selectedOrg]);

  const fetchPayments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('organization_id', selectedOrg.id)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setPayments(data);
    }
    setLoading(false);
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'failed': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  const filteredPayments = payments.filter(p => 
    p.paystack_reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.status?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-lg border border-slate-800">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search payments..." 
            className="pl-9 bg-slate-950 border-slate-700"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-slate-700">
            <Filter className="h-4 w-4 mr-2" /> Filter
          </Button>
          <Button variant="outline" className="border-slate-700">
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-800 rounded-md bg-slate-900/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-slate-900">
              <TableHead>Date</TableHead>
              <TableHead>Invoice / Ref</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center h-32">Loading payments...</TableCell></TableRow>
            ) : filteredPayments.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center h-32 text-slate-500">No payment history.</TableCell></TableRow>
            ) : (
              filteredPayments.map((payment) => (
                <TableRow key={payment.id} className="border-slate-800 hover:bg-slate-800/50">
                  <TableCell className="text-slate-300">
                    {formatDate(payment.paid_at || payment.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs text-slate-400">{payment.paystack_reference}</div>
                  </TableCell>
                  <TableCell className="font-medium text-slate-200">
                    {formatCurrency(payment.amount, payment.currency)}
                  </TableCell>
                  <TableCell className="capitalize text-slate-400">{payment.payment_method || 'Card'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusColor(payment.status)}>
                      {payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">Actions</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800">
                        <DropdownMenuItem>
                          <Download className="h-4 w-4 mr-2" /> Download Invoice
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <ExternalLink className="h-4 w-4 mr-2" /> View Details
                        </DropdownMenuItem>
                        {payment.status === 'COMPLETED' && (
                          <DropdownMenuItem className="text-red-400">
                            <RotateCcw className="h-4 w-4 mr-2" /> Issue Refund
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default OrgPayments;