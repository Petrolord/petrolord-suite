import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/utils/adminHelpers';

const MODULES = [
  { id: 'geoscience', name: 'Geoscience', price: 500, description: 'Advanced geology & geophysics tools' },
  { id: 'reservoir', name: 'Reservoir', price: 400, description: 'Reservoir engineering & simulation' },
  { id: 'drilling', name: 'Drilling', price: 600, description: 'Well planning & drilling engineering' },
  { id: 'production', name: 'Production', price: 400, description: 'Production surveillance & optimization' },
  { id: 'economics', name: 'Economics', price: 300, description: 'Petroleum economics & asset valuation' },
  { id: 'facilities', name: 'Facilities', price: 300, description: 'Surface facility design & network analysis' },
  { id: 'assurance', name: 'Assurance', price: 200, description: 'Risk management & quality assurance' },
];

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
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Quote Name</Label>
            <Input 
              value={quote.name || ''} 
              onChange={(e) => handleChange('name', e.target.value)} 
              className="bg-slate-900 border-slate-700"
              placeholder="e.g. Enterprise Upgrade Q4"
            />
          </div>
          <div className="space-y-2">
            <Label>Seats (Users)</Label>
            <Input 
              type="number"
              min="1"
              value={userCount} 
              onChange={(e) => { setManualOverride(false); setUserCount(parseInt(e.target.value) || 0); }} 
              className="bg-slate-900 border-slate-700"
            />
          </div>
        </div>

        <Separator className="bg-slate-800" />

        <div className="space-y-3">
          <Label className="text-base font-semibold">Select Modules</Label>
          <div className="grid grid-cols-1 gap-3">
            {MODULES.map(mod => (
              <Card key={mod.id} className={`p-3 border transition-colors cursor-pointer flex items-center justify-between ${selectedModules.includes(mod.id) ? 'bg-blue-900/20 border-blue-500' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`} onClick={() => toggleModule(mod.id)}>
                <div className="flex items-center gap-3">
                  <Checkbox checked={selectedModules.includes(mod.id)} onCheckedChange={() => toggleModule(mod.id)} />
                  <div>
                    <div className="font-medium text-slate-200">{mod.name}</div>
                    <div className="text-xs text-slate-500">{mod.description}</div>
                  </div>
                </div>
                <Badge variant="outline" className="bg-slate-950 border-slate-700 text-slate-300">
                  {formatCurrency(mod.price)}/mo
                </Badge>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Terms & Conditions</Label>
          <Textarea 
            value={quote.terms || ''} 
            onChange={(e) => handleChange('terms', e.target.value)} 
            className="bg-slate-900 border-slate-700 min-h-[100px]"
            placeholder="Standard terms apply..."
          />
        </div>
      </div>

      {/* Summary */}
      <Card className="w-full md:w-80 bg-slate-900 border-slate-800 p-6 h-fit shrink-0">
        <h3 className="text-lg font-bold text-white mb-4">Estimate Summary</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between text-slate-400">
            <span>Modules Selected</span>
            <span className="text-white">{selectedModules.length}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>User Seats</span>
            <span className="text-white">{userCount}</span>
          </div>
          <Separator className="bg-slate-800 my-2" />
          <div className="flex justify-between items-center">
            <span className="font-semibold text-slate-200">Estimated Total</span>
            <div className="text-right">
               <div className="text-2xl font-bold text-[#D4AF37]">{formatCurrency(quote.amount || 0)}</div>
               <div className="text-xs text-slate-500">per month</div>
            </div>
          </div>
          
          {manualOverride && (
             <div className="mt-2 text-xs text-amber-500 bg-amber-900/20 p-2 rounded">
               * Manual price override active
             </div>
          )}

          <div className="mt-4">
             <Label className="text-xs text-slate-500 uppercase">Override Price</Label>
             <Input 
                type="number"
                value={quote.amount || 0} 
                onChange={(e) => handleAmountChange(parseFloat(e.target.value))} 
                className="bg-slate-950 border-slate-700 mt-1"
              />
          </div>
        </div>
      </Card>
    </div>
  );
};

export default QuoteEditor;