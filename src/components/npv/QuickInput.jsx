import React, { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const QuickInput = ({ data, onChange }) => {
  
  // Initialize defaults if empty
  useEffect(() => {
      if(!data.initialRate) {
          onChange({
              initialRate: 5000,
              declineRate: 15,
              reserves: 20, // Derived implied
              oilPrice: 75,
              capex: 150,
              opexPerBbl: 12,
              fixedOpex: 2,
              royaltyRate: 10,
              taxRate: 30,
              discountRate: 10,
              startYear: new Date().getFullYear()
          });
      }
  }, []);

  const handleChange = (key, value) => {
      onChange({ ...data, [key]: parseFloat(value) });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
            {/* Production */}
            <Card className="p-4 space-y-4">
                <h3 className="text-sm font-bold text-pl-text flex items-center gap-2">
                    Production Parameters
                    <TooltipProvider><Tooltip><TooltipTrigger><Info className="w-3 h-3 text-pl-muted"/></TooltipTrigger><TooltipContent>Defines the exponential decline profile</TooltipContent></Tooltip></TooltipProvider>
                </h3>
                <div>
                    <Label>Initial Rate (bopd)</Label>
                    <Input type="number" value={data.initialRate ?? ''} onChange={e => handleChange('initialRate', e.target.value)} />
                </div>
                <div>
                    <div className="flex justify-between mb-1"><Label>Decline Rate (%/yr)</Label><span className="text-xs font-pl-mono tabular-nums text-pl-muted">{data.declineRate}%</span></div>
                    <Slider value={[data.declineRate || 15]} min={1} max={50} step={1} onValueChange={v => handleChange('declineRate', v[0])} />
                </div>
            </Card>

            {/* Economics */}
            <Card className="p-4 space-y-4">
                <h3 className="text-sm font-bold text-pl-text">Market Conditions</h3>
                <div>
                    <Label>Oil Price ($/bbl)</Label>
                    <Input type="number" value={data.oilPrice ?? ''} onChange={e => handleChange('oilPrice', e.target.value)} />
                </div>
                <div>
                    <Label>Discount Rate (%)</Label>
                    <Input type="number" value={data.discountRate ?? ''} onChange={e => handleChange('discountRate', e.target.value)} />
                </div>
            </Card>

            {/* Costs */}
            <Card className="p-4 space-y-4">
                <h3 className="text-sm font-bold text-pl-text">Costs (CAPEX / OPEX)</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>Total CAPEX ($MM)</Label>
                        <Input type="number" value={data.capex ?? ''} onChange={e => handleChange('capex', e.target.value)} />
                    </div>
                    <div>
                        <Label>Fixed OPEX ($MM/yr)</Label>
                        <Input type="number" value={data.fixedOpex ?? ''} onChange={e => handleChange('fixedOpex', e.target.value)} />
                    </div>
                </div>
                <div>
                    <Label>Variable OPEX ($/bbl)</Label>
                    <Input type="number" value={data.opexPerBbl ?? ''} onChange={e => handleChange('opexPerBbl', e.target.value)} />
                </div>
            </Card>

            {/* Fiscal */}
            <Card className="p-4 space-y-4">
                <h3 className="text-sm font-bold text-pl-text">Fiscal Terms</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>Royalty (%)</Label>
                        <Input type="number" value={data.royaltyRate ?? ''} onChange={e => handleChange('royaltyRate', e.target.value)} />
                    </div>
                    <div>
                        <Label>Corp. Tax (%)</Label>
                        <Input type="number" value={data.taxRate ?? ''} onChange={e => handleChange('taxRate', e.target.value)} />
                    </div>
                </div>
            </Card>
        </div>
    </div>
  );
};

export default QuickInput;