import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Helper component for editing arrays
const ArrayEditor = ({ label, values, onChange, unit }) => {
    const handleChange = (idx, val) => {
        const newVals = [...values];
        newVals[idx] = parseFloat(val) || 0;
        onChange(newVals);
    };

    // Show first 10 years for brevity in UI
    const displayYears = 10; 

    return (
        <div className="space-y-2">
            <Label>{label} ({unit})</Label>
            <div className="grid grid-cols-5 gap-2">
                {Array.from({length: displayYears}).map((_, i) => (
                    <div key={i}>
                        <span className="text-[10px] text-pl-muted">Y{i+1}</span>
                        <Input 
                            type="number" 
                            value={values[i] || 0} 
                            onChange={e => handleChange(i, e.target.value)} 
                            className="h-8 text-xs font-pl-mono tabular-nums" 
                        />
                    </div>
                ))}
            </div>
            <p className="text-xs text-pl-muted italic text-right">Showing first {displayYears} years only</p>
        </div>
    );
};

const ExpertInput = ({ data, onChange }) => {
  
  // Initialize if empty
  React.useEffect(() => {
      if (!data.production) {
          const years = 20;
          onChange({
              startYear: new Date().getFullYear(),
              projectLife: years,
              discountRate: 10,
              fiscalType: 'TaxRoyalty',
              production: { oil: new Array(years).fill(0), gas: new Array(years).fill(0) },
              price: { oil: new Array(years).fill(75), gas: new Array(years).fill(3.5) },
              capex: new Array(years).fill(0),
              opexFixed: new Array(years).fill(5),
              opexVariable: new Array(years).fill(0),
              abandonment: new Array(years).fill(0),
              royaltyRate: 10,
              taxRate: 30,
              costRecoveryCap: 60,
              profitSplitContractor: 40
          });
      }
  }, []);

  const handleDeepChange = (path, val) => {
      // path: ['production', 'oil']
      if (path.length === 1) {
          onChange({ ...data, [path[0]]: val });
      } else if (path.length === 2) {
          onChange({ ...data, [path[0]]: { ...data[path[0]], [path[1]]: val } });
      }
  };

  if (!data.production) return <div>Loading expert mode...</div>;

  return (
    <Tabs defaultValue="production" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="production">Production</TabsTrigger>
            <TabsTrigger value="price">Prices</TabsTrigger>
            <TabsTrigger value="cost">Costs</TabsTrigger>
            <TabsTrigger value="fiscal">Fiscal Terms</TabsTrigger>
        </TabsList>

        <div className="mt-4 space-y-4 lg:h-[500px] lg:overflow-y-auto pr-2">
            <TabsContent value="production" className="space-y-6">
                <Card className="p-4">
                    <ArrayEditor 
                        label="Oil Production" 
                        unit="bbl/yr" 
                        values={data.production.oil} 
                        onChange={v => handleDeepChange(['production', 'oil'], v)} 
                    />
                </Card>
                <Card className="p-4">
                    <ArrayEditor 
                        label="Gas Production" 
                        unit="mscf/yr" 
                        values={data.production.gas} 
                        onChange={v => handleDeepChange(['production', 'gas'], v)} 
                    />
                </Card>
            </TabsContent>

            <TabsContent value="price" className="space-y-6">
                <Card className="p-4">
                    <ArrayEditor 
                        label="Oil Price Deck" 
                        unit="$/bbl" 
                        values={data.price.oil} 
                        onChange={v => handleDeepChange(['price', 'oil'], v)} 
                    />
                </Card>
                <Card className="p-4">
                    <ArrayEditor 
                        label="Gas Price Deck" 
                        unit="$/mscf" 
                        values={data.price.gas} 
                        onChange={v => handleDeepChange(['price', 'gas'], v)} 
                    />
                </Card>
            </TabsContent>

            <TabsContent value="cost" className="space-y-6">
                <Card className="p-4">
                    <ArrayEditor 
                        label="CAPEX Phasing" 
                        unit="$MM" 
                        values={data.capex} 
                        onChange={v => handleDeepChange(['capex'], v)} 
                    />
                </Card>
                <Card className="p-4">
                    <ArrayEditor 
                        label="Fixed OPEX" 
                        unit="$MM/yr" 
                        values={data.opexFixed} 
                        onChange={v => handleDeepChange(['opexFixed'], v)} 
                    />
                </Card>
                <Card className="p-4">
                    <ArrayEditor 
                        label="Variable OPEX" 
                        unit="$MM Total/yr" 
                        values={data.opexVariable} 
                        onChange={v => handleDeepChange(['opexVariable'], v)} 
                    />
                </Card>
            </TabsContent>

            <TabsContent value="fiscal" className="space-y-6">
                <div className="space-y-2">
                    <Label>Fiscal System</Label>
                    <Select value={data.fiscalType} onValueChange={v => handleDeepChange(['fiscalType'], v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="TaxRoyalty">Tax & Royalty (Concession)</SelectItem>
                            <SelectItem value="PSC">Production Sharing Contract (PSC)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {data.fiscalType === 'TaxRoyalty' && (
                    <Card className="p-4 grid grid-cols-2 gap-4">
                        <div><Label>Royalty Rate (%)</Label><Input type="number" value={data.royaltyRate} onChange={e => handleDeepChange(['royaltyRate'], parseFloat(e.target.value))} /></div>
                        <div><Label>Corporate Tax (%)</Label><Input type="number" value={data.taxRate} onChange={e => handleDeepChange(['taxRate'], parseFloat(e.target.value))} /></div>
                    </Card>
                )}

                {data.fiscalType === 'PSC' && (
                    <Card className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div><Label>Cost Recovery Cap (%)</Label><Input type="number" value={data.costRecoveryCap} onChange={e => handleDeepChange(['costRecoveryCap'], parseFloat(e.target.value))} /></div>
                            <div><Label>Contractor Profit Share (%)</Label><Input type="number" value={data.profitSplitContractor} onChange={e => handleDeepChange(['profitSplitContractor'], parseFloat(e.target.value))} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><Label>Royalty (%)</Label><Input type="number" value={data.royaltyRate} onChange={e => handleDeepChange(['royaltyRate'], parseFloat(e.target.value))} /></div>
                            <div><Label>Tax on Profit Oil (%)</Label><Input type="number" value={data.taxRate} onChange={e => handleDeepChange(['taxRate'], parseFloat(e.target.value))} /></div>
                        </div>
                    </Card>
                )}
            </TabsContent>
        </div>
    </Tabs>
  );
};

export default ExpertInput;