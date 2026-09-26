import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tierTableRefusal } from '@/components/fiscaldesigner/fiscalResultText';

// Engines 3.12.0 (EC7 repair 12): the sandbox types the "Nigeria - PIA (2021)"
// template uses. Switching a type fills the fields the new type needs and
// keeps the ones already there.
const ROYALTY_DEFAULTS = {
  flat: { type: 'flat', rate: 10 },
  sliding_price: { type: 'sliding_price', tiers: [{ threshold: 0, rate: 7.5 }, { threshold: 50, rate: 10 }] },
  pia_2021: { type: 'pia_2021', terrain: 'deep_offshore', firstCalendarYear: 2027, gasInCountrySharePct: 0, priceRoyaltyBase: 'regulations_2021' },
};
const SPLIT_DEFAULTS = {
  flat: { type: 'flat', split: 50 },
  tiered_r_factor: { type: 'tiered_r_factor', tiers: [{ threshold: 1.0, split: 60 }, { threshold: 1.5, split: 50 }] },
  // PIA Seventh Schedule para 14(4): government minimum profit oil by cumulative production
  pia_cumulative_production: { type: 'pia_cumulative_production', tiers: [
    { upToMMbbl: 50, governmentPct: 5 }, { upToMMbbl: 100, governmentPct: 10 }, { upToMMbbl: 350, governmentPct: 15 },
    { upToMMbbl: 750, governmentPct: 25 }, { upToMMbbl: 1500, governmentPct: 35 }, { upToMMbbl: null, governmentPct: 45 },
  ] },
};
const switchType = (current, target, defaults) => {
  const d = defaults[target];
  if (!d) return { ...current, type: target };
  const out = JSON.parse(JSON.stringify(d));
  for (const k of Object.keys(d)) {
    if (k === 'type') continue;
    const keep = k === 'tiers'
      ? current?.type === target && Array.isArray(current?.tiers)
      : current?.[k] !== undefined && current?.[k] !== null;
    if (keep) out[k] = JSON.parse(JSON.stringify(current[k]));
  }
  return out;
};
export const __test__ = { switchType, ROYALTY_DEFAULTS, SPLIT_DEFAULTS };

const RegimeCard = ({ regime, onChange }) => {
  const handleInputChange = (path, value) => {
    onChange(regime.id, path, value);
  };

  const handleTierChange = (path, index, field, value) => {
    const newTiers = [...path.reduce((acc, key) => acc[key], regime)];
    // an empty "up to" on a cumulative-production band is the open top band
    newTiers[index][field] = field === 'upToMMbbl' && value === '' ? null : Number(value);
    onChange(regime.id, path, newTiers);
  };
  const royaltyTiers = Array.isArray(regime.royalty.tiers) ? regime.royalty.tiers : [];
  const splitTiers = Array.isArray(regime.profitSplit.tiers) ? regime.profitSplit.tiers : [];

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
        <Select value={regime.royalty.type} onValueChange={(v) => handleInputChange(['royalty'], switchType(regime.royalty, v, ROYALTY_DEFAULTS))}>
          <SelectTrigger className="bg-white/10 border-white/20"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="flat">Flat Rate</SelectItem>
            <SelectItem value="sliding_price">Sliding Scale (Price)</SelectItem>
            <SelectItem value="pia_2021">PIA 2021 (terrain, daily rate and price)</SelectItem>
          </SelectContent>
        </Select>
        {regime.royalty.type === 'pia_2021' && (
          <div className="space-y-2 pt-2" data-testid="pia-2021-royalty">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-lime-300">Terrain</Label>
                <Select value={regime.royalty.terrain} onValueChange={(v) => handleInputChange(['royalty', 'terrain'], v)}>
                  <SelectTrigger className="bg-white/10 border-white/20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onshore">Onshore</SelectItem>
                    <SelectItem value="shallow_water">Shallow water</SelectItem>
                    <SelectItem value="deep_offshore">Deep offshore</SelectItem>
                    <SelectItem value="frontier">Frontier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-lime-300">Project year 1 is calendar year</Label>
                <Input type="number" value={regime.royalty.firstCalendarYear} onChange={(e) => handleInputChange(['royalty', 'firstCalendarYear'], Number(e.target.value))} className="bg-white/10 border-white/20"/>
              </div>
              <div>
                <Label className="text-xs text-lime-300">Gas utilised in Nigeria (%)</Label>
                <Input type="number" value={regime.royalty.gasInCountrySharePct ?? 0} onChange={(e) => handleInputChange(['royalty', 'gasInCountrySharePct'], Number(e.target.value))} className="bg-white/10 border-white/20"/>
              </div>
              <div>
                <Label className="text-xs text-lime-300">Royalty by price base</Label>
                <Select value={regime.royalty.priceRoyaltyBase ?? 'regulations_2021'} onValueChange={(v) => handleInputChange(['royalty', 'priceRoyaltyBase'], v)}>
                  <SelectTrigger className="bg-white/10 border-white/20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regulations_2021">Royalty Regulations 2022 (2021 base)</SelectItem>
                    <SelectItem value="act_2020">PIA Seventh Schedule (2020 base)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Production royalty on crude oil by terrain and daily rate (PIA Seventh Schedule para 10; Royalty Regulations 2022 r.13): deep offshore 5% to 50,000 bopd and 7.5% above; onshore and shallow water 5%, 7.5%, then 15% or 12.5% above 10,000 bopd; frontier 7.5%. Royalty by price on the Regulations benchmarks (para 11). Gas and NGL 5%, and 2.5% on gas used in Nigeria (para 10(6)). The daily rate is the year's oil over 365 days.
            </p>
          </div>
        )}
        {regime.royalty.type === 'flat' && (
          <Input type="number" placeholder="Rate %" value={regime.royalty.rate} onChange={(e) => handleInputChange(['royalty', 'rate'], Number(e.target.value))} className="bg-white/10 border-white/20"/>
        )}
        {regime.royalty.type === 'sliding_price' && (
          <div className="space-y-2 pt-2">
            <div className="grid grid-cols-2 gap-2 text-xs text-lime-300"><span>Price Threshold ($/bbl)</span><span>Royalty Rate (%)</span></div>
            {royaltyTiers.map((tier, index) => (
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
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-lime-300">Cost Recovery Limit (%)</Label>
            <Input type="number" value={regime.costRecoveryLimit} onChange={(e) => handleInputChange(['costRecoveryLimit'], Number(e.target.value))} className="bg-white/10 border-white/20"/>
          </div>
          <div>
            <Label className="text-xs text-lime-300">Cost limit applies to</Label>
            <Select value={regime.costRecoveryBase ?? 'revenue_after_royalty'} onValueChange={(v) => handleInputChange(['costRecoveryBase'], v === 'revenue_after_royalty' ? undefined : v)}>
              <SelectTrigger className="bg-white/10 border-white/20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue_after_royalty">Revenue after royalty</SelectItem>
                <SelectItem value="liquids_gross">Gross crude oil and NGL value (PIA para 14(4))</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="pt-2">
          <Label className="text-xs text-lime-300">Profit Split</Label>
          <Select value={regime.profitSplit.type} onValueChange={(v) => handleInputChange(['profitSplit'], switchType(regime.profitSplit, v, SPLIT_DEFAULTS))}>
            <SelectTrigger className="bg-white/10 border-white/20"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="flat">Flat Split</SelectItem>
              <SelectItem value="tiered_r_factor">Tiered (R-Factor)</SelectItem>
              <SelectItem value="pia_cumulative_production">PIA minimum by cumulative production</SelectItem>
            </SelectContent>
          </Select>
          {regime.profitSplit.type === 'pia_cumulative_production' && (
            <div className="space-y-2 pt-2" data-testid="pia-cumulative-split">
              <div className="grid grid-cols-2 gap-2 text-xs text-lime-300"><span>Cumulative oil up to (MMbbl)</span><span>Government profit oil (%)</span></div>
              {splitTiers.map((band, index) => (
                <div key={index} className="grid grid-cols-2 gap-2">
                  <Input type="number" placeholder="and above" value={band.upToMMbbl ?? ''} onChange={(e) => handleTierChange(['profitSplit', 'tiers'], index, 'upToMMbbl', e.target.value)} className="bg-white/10 border-white/20"/>
                  <Input type="number" value={band.governmentPct} onChange={(e) => handleTierChange(['profitSplit', 'tiers'], index, 'governmentPct', e.target.value)} className="bg-white/10 border-white/20"/>
                </div>
              ))}
              <p className="text-xs text-gray-400">
                The government's minimum profit oil share by the field's cumulative crude oil at the start of the year (PIA Seventh Schedule para 14(4)). Leave the last band's limit empty for the open top band.
              </p>
              {splitRefusal && <p role="alert" className="text-xs text-red-300">{splitRefusal}</p>}
            </div>
          )}
          {regime.profitSplit.type === 'flat' && (
            <Input type="number" placeholder="Contractor Split %" value={regime.profitSplit.split} onChange={(e) => handleInputChange(['profitSplit', 'split'], Number(e.target.value))} className="bg-white/10 border-white/20 mt-2"/>
          )}
          {regime.profitSplit.type === 'tiered_r_factor' && (
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-2 text-xs text-lime-300"><span>R-Factor Threshold</span><span>Contractor Split (%)</span></div>
              {splitTiers.map((tier, index) => (
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