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

  // Status colour travels with the status word (Badge status variants).
  const getStatusVariant = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'success';
      case 'failed': return 'danger';
      case 'pending': return 'warning';
      default: return 'neutral';
    }
  };

  const filteredPayments = payments.filter(p => 
    p.paystack_reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.status?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center bg-pl-sunken p-4 rounded-lg border border-pl-border">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-pl-muted" aria-hidden="true" />
          <Input 
            placeholder="Search payments..." 
            className="pl-9"
            aria-label="Search payments"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" /> Filter
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-pl-border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
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
              <TableRow><TableCell colSpan={6} className="text-center h-32 text-pl-muted">No payment history.</TableCell></TableRow>
            ) : (
              filteredPayments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="text-pl-text whitespace-nowrap">
                    {formatDate(payment.paid_at || payment.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="font-pl-mono text-xs text-pl-muted">{payment.paystack_reference}</div>
                  </TableCell>
                  <TableCell className="font-medium font-pl-mono tabular-nums text-pl-text">
                    {formatCurrency(payment.amount, payment.currency)}
                  </TableCell>
                  <TableCell className="capitalize text-pl-muted">{payment.payment_method || 'Card'}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(payment.status)}>
                      {payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">Actions</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Download className="h-4 w-4 mr-2" /> Download Invoice
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <ExternalLink className="h-4 w-4 mr-2" /> View Details
                        </DropdownMenuItem>
                        {payment.status === 'COMPLETED' && (
                          <DropdownMenuItem className="text-pl-danger-text">
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