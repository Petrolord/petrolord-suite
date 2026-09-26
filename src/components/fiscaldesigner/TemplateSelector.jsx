import React from 'react';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
    import { Button } from '@/components/ui/button';
    import { ScrollArea } from '@/components/ui/scroll-area';
    import { fiscalTemplates } from '@/utils/fiscalTemplates';

    const TERRAIN_WORDS = { onshore: 'onshore', shallow_water: 'shallow water', deep_offshore: 'deep offshore', frontier: 'frontier' };

    /**
     * One line per term of a template's regime, for every sandbox type
     * including the engines 3.12.0 PIA types (pia_2021 royalty,
     * pia_cumulative_production split, costRecoveryBase liquids_gross).
     */
    export const templateTermsSummary = (regime) => {
      if (!regime) return [];
      const r = regime.royalty || {};
      const royalty = r.type === 'flat' ? `Royalty ${r.rate}% flat`
        : r.type === 'sliding_price' ? `Royalty by price tiers ${(r.tiers || []).map((t) => `${t.rate}% from ${t.threshold} USD/bbl`).join(', ')}`
          : r.type === 'pia_2021' ? `Royalty PIA 2021, ${TERRAIN_WORDS[r.terrain] || r.terrain}: production tranches, royalty by price (${r.priceRoyaltyBase === 'act_2020' ? 'Act 2020 base' : 'Regulations 2021 base'}), gas 5%; year 1 is ${r.firstCalendarYear}`
            : `Royalty ${r.type}`;
      const base = regime.costRecoveryBase === 'liquids_gross' ? 'of gross crude oil and NGL value' : 'of revenue after royalty';
      const cost = `Cost recovery limit ${regime.costRecoveryLimit}% ${base}`;
      const p = regime.profitSplit || {};
      const split = p.type === 'flat' ? `Contractor profit share ${p.split}%`
        : p.type === 'tiered_r_factor' ? `Contractor share by R-factor ${(p.tiers || []).map((t) => `${t.split}% from ${t.threshold}`).join(', ')}`
          : p.type === 'pia_cumulative_production' ? `Government profit oil by cumulative production ${(p.tiers || []).map((t) => (t.upToMMbbl === null ? `${t.governmentPct}% above` : `${t.governmentPct}% to ${t.upToMMbbl} MMbbl`)).join(', ')}`
            : `Profit split ${p.type}`;
      const t = regime.tax || {};
      const tax = `CIT ${t.cit}%${t.rrt ? `, RRT ${t.rrt}%` : ''}${t.minTax ? `, minimum tax ${t.minTax}%` : ''}`;
      return [royalty, cost, split, tax];
    };

    const TemplateSelector = ({ isOpen, onOpenChange, onSelectTemplate }) => {
      return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-[625px] bg-gray-900 border-gray-700 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl text-lime-300">Fiscal Regime Templates</DialogTitle>
              <DialogDescription className="text-gray-400">
                Select a country template to quickly load a common fiscal regime. You can edit it afterward.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[400px] w-full pr-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fiscalTemplates.map((template, index) => (
                  <div key={index} className="bg-white/5 p-4 rounded-lg border border-white/10 flex flex-col justify-between">
                    <div>
                      <h3 className="font-semibold text-white text-lg">{template.name}</h3>
                      <p className="text-sm text-gray-400 mt-1">{template.description}</p>
                      <ul className="mt-2 space-y-0.5" data-testid="template-terms">
                        {templateTermsSummary(template.regime).map((line) => (
                          <li key={line} className="text-xs text-lime-200/80">{line}</li>
                        ))}
                      </ul>
                    </div>
                    <Button 
                      onClick={() => onSelectTemplate(template)} 
                      className="mt-4 w-full bg-purple-600 hover:bg-purple-700"
                    >
                      Apply Template
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      );
    };

    export default TemplateSelector;