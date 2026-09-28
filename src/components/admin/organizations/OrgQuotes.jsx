import React, { useState } from 'react';
import { useAdminOrg } from '@/contexts/AdminOrganizationContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  PlusCircle, Eye, FileDown, Edit2, Send, Trash2, AlertCircle 
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/utils/adminHelpers';
import { generateQuotePDF } from '@/utils/quotePdfGenerator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Components
import QuoteEditor from './quotes/QuoteEditor';
import QuotePreview from './quotes/QuotePreview';
import EmailQuoteModal from './quotes/EmailQuoteModal';

// Mock quotes data
const MOCK_QUOTES = [
  { 
    id: 'QT-2023-001', 
    date: '2023-10-15', 
    amount: 3450, 
    status: 'draft', 
    name: 'Q4 Expansion',
    expiryDate: '2023-11-15',
    terms: 'Standard Lordsway Energy Terms apply.'
  },
  { 
    id: 'QT-2023-002', 
    date: '2023-10-10', 
    amount: 1200, 
    status: 'sent', 
    name: 'Additional Storage',
    expiryDate: '2023-11-10',
    terms: 'Payment due on receipt.' 
  },
];

const OrgQuotes = () => {
  const { selectedOrg } = useAdminOrg();
  const { toast } = useToast();
  
  const [quotes, setQuotes] = useState(MOCK_QUOTES);
  const [editingQuote, setEditingQuote] = useState(null); // For Editor
  const [previewingQuote, setPreviewingQuote] = useState(null); // For Preview Modal
  const [emailingQuote, setEmailingQuote] = useState(null); // For Email Modal
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [quoteToDelete, setQuoteToDelete] = useState(null); // For Delete Confirmation
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false); // Loading state for PDF gen

  // --- Actions ---

  const handleNewQuote = () => {
    setEditingQuote({
      id: `QT-${new Date().getFullYear()}-${quotes.length + 1}`.toUpperCase(),
      name: 'New Proposal',
      date: new Date().toISOString(),
      status: 'draft',
      config: {
        modules: [],
        apps: [],
        userCount: selectedOrg?.subscription?.user_limit || 5,
        storageGB: 100,
        tierId: 'starter'
      }
    });
    setIsEditorOpen(true);
  };

  const handleEdit = (quote) => {
    setEditingQuote({ ...quote });
    setIsEditorOpen(true);
  };

  const handleSaveQuote = () => {
    if (!editingQuote) return;
    
    const amount = editingQuote.config?.calculated?.monthlyTotal || editingQuote.amount || 0;
    const updatedQuote = { ...editingQuote, amount };

    setQuotes(prev => {
      const exists = prev.find(q => q.id === updatedQuote.id);
      if (exists) {
        return prev.map(q => q.id === updatedQuote.id ? updatedQuote : q);
      }
      return [updatedQuote, ...prev];
    });

    setIsEditorOpen(false);
    toast({ title: 'Quote Saved', description: `${updatedQuote.id} updated successfully.` });
  };

  const handleDeleteClick = (id) => {
    setQuoteToDelete(id);
  };

  const confirmDelete = () => {
    if (quoteToDelete) {
      setQuotes(prev => prev.filter(q => q.id !== quoteToDelete));
      toast({ title: 'Quote Deleted' });
      setQuoteToDelete(null);
    }
  };

  const handleDownloadPDF = async (quote) => {
    setIsGeneratingPdf(true);
    try {
      toast({ title: 'Download Started', description: 'Generating Lordsway branded PDF...' });
      const doc = await generateQuotePDF(quote, selectedOrg);
      doc.save(`Lordsway_Quote_${quote.id}.pdf`);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to generate PDF', variant: 'destructive' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // --- Helpers ---

  const getStatusBadge = (status) => {
    // Status colour travels with the status word (Badge status variants).
    const variants = {
      draft: 'neutral',
      sent: 'info',
      accepted: 'success',
      rejected: 'danger',
      expired: 'warning'
    };
    return <Badge variant={variants[status] || 'neutral'} className="capitalize">{status}</Badge>;
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
        <div>
          <h3 className="text-lg font-semibold text-pl-text">Quote Management</h3>
          <p className="text-sm text-pl-muted">Create and track custom pricing proposals.</p>
        </div>
        <Button onClick={handleNewQuote}>
          <PlusCircle className="h-4 w-4 mr-2" /> New Quote
        </Button>
      </div>

      {/* Quote Table */}
      <div className="border border-pl-border rounded-md flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote ID</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Amount (Monthly)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-pl-muted">No quotes found.</TableCell>
              </TableRow>
            ) : (
              quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="font-pl-mono text-pl-text whitespace-nowrap">{quote.id}</TableCell>
                  <TableCell className="font-medium text-pl-text">{quote.name}</TableCell>
                  <TableCell className="text-pl-muted whitespace-nowrap">{formatDate(quote.date)}</TableCell>
                  <TableCell className="text-pl-muted whitespace-nowrap">{formatDate(quote.expiryDate)}</TableCell>
                  <TableCell className="font-pl-mono tabular-nums text-pl-text">{formatCurrency(quote.amount)}</TableCell>
                  <TableCell>{getStatusBadge(quote.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Preview" aria-label="Preview" onClick={() => setPreviewingQuote(quote)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      {quote.status === 'draft' && (
                        <Button variant="ghost" size="icon" title="Edit" aria-label="Edit" onClick={() => handleEdit(quote)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}

                      <Button variant="ghost" size="icon" title="Send Email" aria-label="Send Email" onClick={() => setEmailingQuote(quote)}>
                        <Send className="h-4 w-4" />
                      </Button>

                      <Button variant="ghost" size="icon" title="Download PDF" aria-label="Download PDF" onClick={() => handleDownloadPDF(quote)} disabled={isGeneratingPdf}>
                        <FileDown className="h-4 w-4" />
                      </Button>

                      {quote.status === 'draft' && (
                        <Button variant="ghost" size="icon" title="Delete" aria-label="Delete" className="text-pl-danger-text hover:text-pl-danger-text hover:bg-pl-danger-bg" onClick={() => handleDeleteClick(quote.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* --- Modals --- */}

      {/* Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-[95vw] w-[1200px] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingQuote?.id ? `Edit Quote: ${editingQuote.id}` : 'New Quote'}</DialogTitle>
            <DialogDescription>Configure pricing, details, and terms.</DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden py-2">
            <QuoteEditor 
              initialQuote={editingQuote} 
              onChange={setEditingQuote}
            />
          </div>

          <DialogFooter className="mt-auto pt-4 border-t border-pl-border">
            <Button variant="ghost" onClick={() => setIsEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveQuote}>
              Save Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog (Full Screen Overlay) */}
      {previewingQuote && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm p-4 md:p-10 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Quote preview">
          <div className="w-full max-w-5xl h-full bg-transparent">
            <QuotePreview 
              quote={previewingQuote} 
              organization={selectedOrg} 
              onClose={() => setPreviewingQuote(null)} 
            />
          </div>
        </div>
      )}

      {/* Email Dialog */}
      <EmailQuoteModal 
        isOpen={!!emailingQuote} 
        onClose={() => setEmailingQuote(null)} 
        quote={emailingQuote}
        organization={selectedOrg}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!quoteToDelete} onOpenChange={(open) => !open && setQuoteToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the quote.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-pl-danger text-pl-danger-fg hover:bg-pl-danger/90 border-none">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OrgQuotes;