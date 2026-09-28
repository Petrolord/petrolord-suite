import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/utils/adminHelpers';
import { MODULE_PRICING, MODULE_META } from '@/data/pricingModels';

// Midstream & Downstream joined here at DS1, when its first application
// shipped. It was deliberately absent through DS0 because pricing a module
// whose every app was Coming Soon would have let a customer buy nothing.
// Its price sits at the bottom of each table's own range: one of ten apps is
// built, and the module is priced as what it is today, not as what it will be.
// The three module price tables in this repo (here, GetQuote.jsx and
// admin/organizations/quotes/QuoteEditor.jsx) disagree with each other on
// every module; reconciling them is an owner decision, flagged not taken.
// Built from the one shared table rather than a third hand-maintained copy.
// This screen used to carry its own prices (geoscience 500, assurance 200,
// midstream-downstream 150) which matched neither the public quote page nor
// the server that actually bills.
const MODULES = Object.entries(MODULE_PRICING).map(([id, price]) => ({
  id,
  price,
  name: MODULE_META[id]?.name || id,
  description: MODULE_META[id]?.description || ''
}));

const QuoteEditor = ({ initialQuote, onChange }) => {
  const quote = initialQuote || {};
  const [selectedModules, setSelectedModules] = useState(quote.modules || []);
  const [userCount, setUserCount] = useState(quote.userCount || 5);
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    if (!manualOverride) {
      calculateTotal();
    }
  }, [selectedModules, userCount]);

  const calculateTotal = () => {
    const modulesTotal = selectedModules.reduce((sum, modId) => {
      const mod = MODULES.find(m => m.id === modId);
      return sum + (mod ? mod.price : 0);
    }, 0);
    
    // Simple logic: Base platform fee + (Modules * Users * DiscountFactor)
    // Here we just do flat module price for simplicity + user fee
    const userFee = userCount * 50; 
    const total = modulesTotal + userFee;
    
    handleChange('amount', total);
    handleChange('modules', selectedModules);
    handleChange('userCount', userCount);
  };

  const handleChange = (field, value) => {
    onChange({ ...quote, [field]: value });
  };

  const toggleModule = (modId) => {
    setManualOverride(false);
    if (selectedModules.includes(modId)) {
      setSelectedModules(prev => prev.filter(id => id !== modId));
    } else {
      setSelectedModules(prev => [...prev, modId]);
    }
  };

  const handleAmountChange = (val) => {
    setManualOverride(true);
    handleChange('amount', val);
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 p-4 h-full overflow-hidden">
      {/* Configuration */}
      <div className="flex-1 space-y-6 overflow-y-auto pr-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="quote-name">Quote Name</Label>
            <Input 
              id="quote-name"
              value={quote.name || ''} 
              onChange={(e) => handleChange('name', e.target.value)} 
              placeholder="e.g. Enterprise Upgrade Q4"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-seats">Seats (Users)</Label>
            <Input 
              id="quote-seats"
              type="number"
              min="1"
              value={userCount} 
              onChange={(e) => { setManualOverride(false); setUserCount(parseInt(e.target.value) || 0); }} 
              className="font-pl-mono tabular-nums"
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <Label className="text-base font-semibold">Select Modules</Label>
          <div className="grid grid-cols-1 gap-3">
            {MODULES.map(mod => (
              <Card key={mod.id} className={`p-3 border transition-colors cursor-pointer flex items-center justify-between ${selectedModules.includes(mod.id) ? 'bg-pl-primary/10 border-pl-primary' : 'hover:border-pl-border-strong'}`} onClick={() => toggleModule(mod.id)}>
                <div className="flex items-center gap-3">
                  <Checkbox checked={selectedModules.includes(mod.id)} onCheckedChange={() => toggleModule(mod.id)} />
                  <div>
                    <div className="font-medium text-pl-text">{mod.name}</div>
                    <div className="text-xs text-pl-muted">{mod.description}</div>
                  </div>
                </div>
                <Badge variant="neutral" className="font-pl-mono tabular-nums whitespace-nowrap">
                  {formatCurrency(mod.price)}/mo
                </Badge>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quote-terms">Terms & Conditions</Label>
          <Textarea 
            id="quote-terms"
            value={quote.terms || ''} 
            onChange={(e) => handleChange('terms', e.target.value)} 
            className="min-h-[100px]"
            placeholder="Standard terms apply..."
          />
        </div>
      </div>

      {/* Summary */}
      <Card className="w-full md:w-80 bg-pl-sunken p-6 h-fit shrink-0">
        <h3 className="text-lg font-bold text-pl-text mb-4">Estimate Summary</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between text-pl-muted">
            <span>Modules Selected</span>
            <span className="text-pl-text font-pl-mono tabular-nums">{selectedModules.length}</span>
          </div>
          <div className="flex justify-between text-pl-muted">
            <span>User Seats</span>
            <span className="text-pl-text font-pl-mono tabular-nums">{userCount}</span>
          </div>
          <Separator className="my-2" />
          <div className="flex justify-between items-center">
            <span className="font-semibold text-pl-text">Estimated Total</span>
            <div className="text-right">
               <div className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">{formatCurrency(quote.amount || 0)}</div>
               <div className="text-xs text-pl-muted">per month</div>
            </div>
          </div>
          
          {manualOverride && (
             <div className="mt-2 text-xs text-pl-warning-text bg-pl-warning-bg border border-pl-warning/40 p-2 rounded" role="status">
               * Manual price override active
             </div>
          )}

          <div className="mt-4">
             <Label htmlFor="quote-override" className="text-xs text-pl-muted uppercase">Override Price</Label>
             <Input 
                id="quote-override"
                type="number"
                value={quote.amount || 0} 
                onChange={(e) => handleAmountChange(parseFloat(e.target.value))} 
                className="font-pl-mono tabular-nums mt-1"
              />
          </div>
        </div>
      </Card>
    </div>
  );
};

export default QuoteEditor;