import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from "@/components/ui/progress";
import { PlusCircle, Edit, Trash2, Save, MoreHorizontal, Copy, Download } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import * as XLSX from 'xlsx';
import { AfeInputError, calculateMetrics, itemForecastCheck } from '@/utils/costControlCalculations';

/**
 * EC5-8 (engines #185). The engine refuses progress below 0 or above 100
 * percent. The form asks the engine rather than restating the rule, so the
 * message the user sees is the engine's own. Returns null when accepted.
 */
export const progressRefusal = (item) => {
  try {
    calculateMetrics({}, [item], [], '2026-01-01');
    return null;
  } catch (err) {
    if (err instanceof AfeInputError || err?.name === 'AfeInputError') return err.message;
    throw err;
  }
};

const formItem = (formData) => ({
  code: formData.code || formData.wbs_code || undefined,
  description: formData.description || undefined,
  budget: formData.budget,
  progress: formData.progress,
});

// EC5-0 (owner decision 2026-09-14). The edit form used to seed the forecast
// with the budget, so saving any edit froze the estimate at completion at the
// budget even on a line already overrunning. The forecast field now holds only
// a forecast someone entered; blank means the standard rule (itemForecast).
export const costItemFormValues = (item) => ({
  code: item.code,
  category: item.category || 'General',
  description: item.description,
  budget: item.budget,
  forecast: Number(item.forecast) > 0 ? item.forecast : '',
  wbs_code: item.wbs_code || '',
  vendor: item.vendor || '',
  progress: item.progress || 0
});

const CostBreakdownTab = ({ afeId, costItems, onRefresh }) => {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  
  // Form State
  const [formData, setFormData] = useState({
    code: '',
    category: 'Drilling',
    description: '',
    budget: 0,
    forecast: '',
    wbs_code: '',
    vendor: '',
    progress: 0
  });

  const handleOpenDialog = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData(costItemFormValues(item));
    } else {
      setEditingItem(null);
      setFormData({
        code: '',
        category: 'Drilling',
        description: '',
        budget: 0,
        forecast: '',
        wbs_code: '',
        vendor: '',
        progress: 0
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const progress = Number(formData.progress) || 0;
    const refusal = progressRefusal({ ...formItem(formData), progress });
    if (refusal) {
      toast({
        variant: 'destructive',
        title: progress < 0 ? 'Progress cannot be negative' : 'Progress cannot exceed 100 percent',
        description: refusal,
      });
      return;
    }
    const forecast = Number(formData.forecast);
    const payload = {
      ...formData,
      progress,
      // Only an entered forecast above zero is stored; 0 means the standard rule.
      forecast: forecast > 0 ? forecast : 0,
      afe_id: afeId,
    };
    
    let error;
    if (editingItem) {
      const { error: updateError } = await supabase.from('afe_cost_items').update(payload).eq('id', editingItem.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('afe_cost_items').insert([payload]);
      error = insertError;
    }

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'Success', description: 'Cost item saved.' });
      setIsDialogOpen(false);
      onRefresh();
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this cost item?")) return;
    const { error } = await supabase.from('afe_cost_items').delete().eq('id', id);
    if (error) toast({ variant: 'destructive', title: 'Error', description: error.message });
    else {
      toast({ title: 'Deleted', description: 'Cost item removed.' });
      onRefresh();
    }
  };

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(costItems);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cost Breakdown");
    XLSX.writeFile(wb, `AFE_Cost_Breakdown_${afeId}.xlsx`);
  };

  const currencyFormatter = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);

  // The progress field is capped at 100 (and floored at 0): a value outside
  // that range shows the engine's refusal under the field and Save is off.
  const progressError = Number.isFinite(formData.progress) ? progressRefusal(formItem(formData)) : null;

  // Filter and Group
  const filteredItems = activeCategory === 'All' ? costItems : costItems.filter(i => i.category === activeCategory);
  const categories = ['All', ...new Set(costItems.map(i => i.category || 'Uncategorized'))];

  return (
    <div className="space-y-4 bg-pl-surface p-4 rounded border border-pl-border">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex gap-2">
            {categories.map(cat => (
                <Button 
                    key={cat} 
                    variant={activeCategory === cat ? "secondary" : "ghost"} 
                    size="sm"
                    onClick={() => setActiveCategory(cat)}
                    className="text-xs"
                >
                    {cat}
                </Button>
            ))}
        </div>
        <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" /> Excel
            </Button>
            <Button onClick={() => handleOpenDialog()} size="sm" className="bg-pl-info hover:bg-pl-info-bg">
                <PlusCircle className="w-4 h-4 mr-2" /> Add Item
            </Button>
        </div>
      </div>

      <div className="rounded-md border border-pl-border overflow-hidden">
        <Table>
          <TableHeader className="bg-pl-bg">
            <TableRow>
              <TableHead className="text-pl-text w-[80px]">WBS</TableHead>
              <TableHead className="text-pl-text">Description</TableHead>
              <TableHead className="text-pl-text">Vendor</TableHead>
              <TableHead className="text-right text-pl-text">Budget</TableHead>
              <TableHead className="text-right text-pl-text">Actuals</TableHead>
              <TableHead className="text-right text-pl-text">Forecast (EAC)</TableHead>
              <TableHead className="text-right text-pl-text">Variance</TableHead>
              <TableHead className="text-center text-pl-text w-[100px]">Progress</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.map(item => {
                // The one EAC rule (engine itemForecastCheck), and variance is
                // budget less it. EC5-1 (engines #194): the check also says
                // whether the entered forecast sits below the money already
                // spent and committed, and whether a negative one was ignored.
                const check = itemForecastCheck(item);
                const forecast = check.forecast;
                const variance = (Number(item.budget) || 0) - forecast;
                const progress = Number(item.progress) || 0;
                
                return (
                  <TableRow key={item.id} className="border-b border-pl-border hover:bg-pl-sunken">
                    <TableCell className="font-mono text-xs text-pl-muted">{item.wbs_code || item.code}</TableCell>
                    <TableCell>
                        <div className="font-medium text-pl-text">{item.description}</div>
                        <div className="text-[10px] text-pl-muted">{item.category}</div>
                    </TableCell>
                    <TableCell className="text-pl-muted text-sm">{item.vendor || '-'}</TableCell>
                    <TableCell className="text-right text-pl-info-text font-mono">{currencyFormatter(item.budget)}</TableCell>
                    <TableCell className="text-right text-pl-text font-mono">{currencyFormatter(item.actual)}</TableCell>
                    <TableCell className="text-right text-pl-warning-text font-mono">
                      {currencyFormatter(forecast)}
                      {check.forecastBelowCommitted && (
                        <span className="block text-[10px] font-sans text-pl-warning-text" data-testid={`below-committed-${item.id}`}>
                          {currencyFormatter(check.forecastBelowCommittedBy)} below spent and committed
                        </span>
                      )}
                      {check.forecastIgnored === 'negative' && (
                        <span className="block text-[10px] font-sans text-pl-danger-text" data-testid={`forecast-ignored-${item.id}`}>
                          negative forecast ignored, standard rule used
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-bold ${variance >= 0 ? 'text-pl-success-text' : 'text-pl-danger-text'}`}>
                      {currencyFormatter(variance)}
                    </TableCell>
                    <TableCell>
                        <div className="flex flex-col gap-1">
                            <Progress value={progress} className="h-1.5" />
                            <span className="text-[10px] text-pl-muted text-center">{progress}%</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-pl-surface border-pl-border text-pl-text">
                            <DropdownMenuItem onClick={() => handleOpenDialog(item)}><Edit className="w-3 h-3 mr-2" /> Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(item.id)} className="text-pl-danger-text"><Trash2 className="w-3 h-3 mr-2" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
            })}
            {filteredItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-pl-muted">No items found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Cost Item' : 'New Cost Item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <select 
                  className="w-full bg-pl-sunken border border-pl-border rounded p-2 text-sm"
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value})}
                >
                  {['Drilling','Completion','Facilities','Subsurface','Logistics','HSE','Contingency'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label>WBS Code</Label>
                <Input value={formData.wbs_code} onChange={e => setFormData({...formData, wbs_code: e.target.value})} />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Budget</Label>
                <Input type="number" value={formData.budget} onChange={e => setFormData({...formData, budget: parseFloat(e.target.value)})} required />
              </div>
              <div>
                <Label>Forecast (EAC)</Label>
                <Input type="number" min="0" value={formData.forecast} placeholder="Blank uses the standard rule" onChange={e => setFormData({...formData, forecast: e.target.value})} />
              </div>
              <div>
                <Label>% Progress</Label>
                <Input type="number" min="0" max="100" value={Number.isNaN(formData.progress) ? '' : formData.progress} onChange={e => setFormData({...formData, progress: parseFloat(e.target.value)})} />
                {progressError && <p role="alert" className="mt-1 text-xs text-pl-danger-text">{progressError}</p>}
              </div>
            </div>
            <div>
                <Label>Vendor (Optional)</Label>
                <Input value={formData.vendor} onChange={e => setFormData({...formData, vendor: e.target.value})} />
            </div>
            <DialogFooter>
              <Button type="submit" className="bg-pl-info" disabled={Boolean(progressError)}><Save className="w-4 h-4 mr-2" /> Save Item</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CostBreakdownTab;