import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tierTableRefusal } from '@/components/fiscaldesigner/fiscalResultText';

const RegimeCard = ({ regime, onChange }) => {
  const handleInputChange = (path, value) => {
    onChange(regime.id, path, value);
  };

  const handleTierChange = (path, index, field, value) => {
    const newTiers = [...path.reduce((acc, key) => acc[key], regime)];
    newTiers[index][field] = Number(value);
    onChange(regime.id, path, newTiers);
  };

  // EC2-8: the engine refuses a tier table with a repeated threshold; show
  // its message under the table being edited.
  const royaltyRefusal = tierTableRefusal(regime, 'royalty');
  const splitRefusal = tierTableRefusal(regime, 'profitSplit');

  return (
    <div className="bg-white/5 p-4 rounded-lg space-y-6">
      <div>
        <Label className="text-lime-300">Regime Name</Label>
        <Input 
          value={regime.name} 
          onChange={(e) => handleInputChange(['name'], e.target.value)} 
          className="bg-white/10 border-white/20"
        />
      </div>

      {/* Royalty Section */}
      <div className="space-y-2">
        <Label className="text-white font-semibold">Royalty</Label>
        <Select value={regime.royalty.type} onValueChange={(v) => handleInputChange(['royalty', 'type'], v)}>
          <SelectTrigger className="bg-white/10 border-white/20"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="flat">Flat Rate</SelectItem><SelectItem value="sliding_price">Sliding Scale (Price)</SelectItem></SelectContent>
        </Select>
        {regime.royalty.type === 'flat' && (
          <Input type="number" placeholder="Rate %" value={regime.royalty.rate} onChange={(e) => handleInputChange(['royalty', 'rate'], Number(e.target.value))} className="bg-white/10 border-white/20"/>
        )}
        {regime.royalty.type === 'sliding_price' && (
          <div className="space-y-2 pt-2">
            <div className="grid grid-cols-2 gap-2 text-xs text-lime-300"><span>Price Threshold ($/bbl)</span><span>Royalty Rate (%)</span></div>
            {regime.royalty.tiers.map((tier, index) => (
              <div key={index} className="grid grid-cols-2 gap-2">
                <Input type="number" value={tier.threshold} onChange={(e) => handleTierChange(['royalty', 'tiers'], index, 'threshold', e.target.value)} className="bg-white/10 border-white/20"/>
                <Input type="number" value={tier.rate} onChange={(e) => handleTierChange(['royalty', 'tiers'], index, 'rate', e.target.value)} className="bg-white/10 border-white/20"/>
              </div>
            ))}
            {royaltyRefusal && <p role="alert" className="text-xs text-red-300">{royaltyRefusal}</p>}
          </div>
        )}
      </div>

      {/* Tax Section */}
      <div className="space-y-2">
        <Label className="text-white font-semibold">Taxation</Label>
        <div className="grid grid-cols-3 gap-2">
          <div><Label className="text-xs text-lime-300">CIT (%)</Label><Input type="number" value={regime.tax.cit} onChange={(e) => handleInputChange(['tax', 'cit'], Number(e.target.value))} className="bg-white/10 border-white/20"/></div>
          <div><Label className="text-xs text-lime-300">RRT (%)</Label><Input type="number" value={regime.tax.rrt} onChange={(e) => handleInputChange(['tax', 'rrt'], Number(e.target.value))} className="bg-white/10 border-white/20"/></div>
          <div><Label className="text-xs text-lime-300">Min Tax (%)</Label><Input type="number" value={regime.tax.minTax} onChange={(e) => handleInputChange(['tax', 'minTax'], Number(e.target.value))} className="bg-white/10 border-white/20"/></div>
        </div>
      </div>

      {/* PSC Terms Section */}
      <div className="space-y-2">
        <Label className="text-white font-semibold">PSC Terms</Label>
        <div>
          <Label className="text-xs text-lime-300">Cost Recovery Limit (%)</Label>
          <Input type="number" value={regime.costRecoveryLimit} onChange={(e) => handleInputChange(['costRecoveryLimit'], Number(e.target.value))} className="bg-white/10 border-white/20"/>
        </div>
        <div className="pt-2">
          <Label className="text-xs text-lime-300">Profit Split</Label>
          <Select value={regime.profitSplit.type} onValueChange={(v) => handleInputChange(['profitSplit', 'type'], v)}>
            <SelectTrigger className="bg-white/10 border-white/20"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="flat">Flat Split</SelectItem><SelectItem value="tiered_r_factor">Tiered (R-Factor)</SelectItem></SelectContent>
          </Select>
          {regime.profitSplit.type === 'flat' && (
            <Input type="number" placeholder="Contractor Split %" value={regime.profitSplit.split} onChange={(e) => handleInputChange(['profitSplit', 'split'], Number(e.target.value))} className="bg-white/10 border-white/20 mt-2"/>
          )}
          {regime.profitSplit.type === 'tiered_r_factor' && (
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-2 text-xs text-lime-300"><span>R-Factor Threshold</span><span>Contractor Split (%)</span></div>
              {regime.profitSplit.tiers.map((tier, index) => (
                <div key={index} className="grid grid-cols-2 gap-2">
                  <Input type="number" value={tier.threshold} onChange={(e) => handleTierChange(['profitSplit', 'tiers'], index, 'threshold', e.target.value)} className="bg-white/10 border-white/20"/>
                  <Input type="number" value={tier.split} onChange={(e) => handleTierChange(['profitSplit', 'tiers'], index, 'split', e.target.value)} className="bg-white/10 border-white/20"/>
                </div>
              ))}
              {splitRefusal && <p role="alert" className="text-xs text-red-300">{splitRefusal}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegimeCard;