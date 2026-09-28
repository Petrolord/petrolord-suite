import React, { useState, useEffect } from 'react';
    import { motion } from 'framer-motion';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { NativeSelect } from '@/components/ui/native-select';
    import CollapsibleSection from './CollapsibleSection';
    import RegimeCard from './RegimeCard';
    import TemplateSelector from './TemplateSelector';
    import { FileText, DollarSign, Plus, Copy, Trash2, GitCompare, Library } from 'lucide-react';

    const InputPanel = ({ onRunComparison, loading, initialProjectInputs, initialRegimes }) => {
      const [projectInputs, setProjectInputs] = useState(initialProjectInputs);
      const [regimes, setRegimes] = useState(initialRegimes);
      const [activeRegimeId, setActiveRegimeId] = useState(initialRegimes[0]?.id || 1);
      const [isTemplateSelectorOpen, setTemplateSelectorOpen] = useState(false);

      useEffect(() => {
        setProjectInputs(initialProjectInputs);
      }, [initialProjectInputs]);

      useEffect(() => {
        setRegimes(initialRegimes);
        if (!initialRegimes.find(r => r.id === activeRegimeId)) {
            setActiveRegimeId(initialRegimes[0]?.id || 1);
        }
      }, [initialRegimes]);

      const initialRegimeState = {
        royalty: { type: 'sliding_price', tiers: [{ threshold: 60, rate: 12.5 }, { threshold: 80, rate: 15 }] },
        tax: { cit: 30, rrt: 20, minTax: 2 },
        costRecoveryLimit: 70,
        profitSplit: { type: 'tiered_r_factor', tiers: [{ threshold: 1.0, split: 60 }, { threshold: 1.5, split: 50 }] },
      };

      const handleAddRegime = () => {
        const newId = Math.max(0, ...regimes.map(s => s.id)) + 1;
        const newRegime = { id: newId, name: `New Regime ${newId}`, ...JSON.parse(JSON.stringify(initialRegimeState)) };
        setRegimes([...regimes, newRegime]);
        setActiveRegimeId(newId);
      };

      const handleDuplicateRegime = () => {
        const regimeToDuplicate = regimes.find(s => s.id === activeRegimeId);
        if (!regimeToDuplicate) return;
        const newId = Math.max(0, ...regimes.map(s => s.id)) + 1;
        const duplicatedRegime = { ...JSON.parse(JSON.stringify(regimeToDuplicate)), id: newId, name: `${regimeToDuplicate.name} (Copy)` };
        setRegimes([...regimes, duplicatedRegime]);
        setActiveRegimeId(newId);
      };

      const handleDeleteRegime = () => {
        if (regimes.length <= 1) return;
        const newRegimes = regimes.filter(s => s.id !== activeRegimeId);
        setRegimes(newRegimes);
        setActiveRegimeId(newRegimes[0].id);
      };

      const handleRegimeChange = (id, path, value) => {
        setRegimes(regimes.map(regime => {
          if (regime.id === id) {
            const newRegime = JSON.parse(JSON.stringify(regime));
            let current = newRegime;
            for (let i = 0; i < path.length - 1; i++) {
              current = current[path[i]];
            }
            current[path[path.length - 1]] = value;
            return newRegime;
          }
          return regime;
        }));
      };
      
      const handleProjectInputChange = (path, value) => {
        setProjectInputs(p => {
          const newP = JSON.parse(JSON.stringify(p));
          let current = newP;
          for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
          }
          current[path[path.length - 1]] = value;
          return newP;
        });
      };

      const handlePriceDeckChange = (index, field, value) => {
        const newPrices = [...projectInputs.prices];
        newPrices[index][field] = Number(value);
        handleProjectInputChange(['prices'], newPrices);
      };

      const handleApplyTemplate = (template) => {
        setRegimes(regimes.map(regime => {
          if (regime.id === activeRegimeId) {
            // costRecoveryBase is optional (EC7): a template without it must not
            // inherit the previous template's base
            return { ...regime, costRecoveryBase: undefined, name: template.name, ...JSON.parse(JSON.stringify(template.regime)) };
          }
          return regime;
        }));
        setTemplateSelectorOpen(false);
      };

      const handleSubmit = (e) => {
        e.preventDefault();
        onRunComparison({ projectInputs, regimes });
      };

      const activeRegime = regimes.find(s => s.id === activeRegimeId);

      return (
        <>
          <TemplateSelector 
            isOpen={isTemplateSelectorOpen} 
            onOpenChange={setTemplateSelectorOpen}
            onSelectTemplate={handleApplyTemplate}
          />
          <form onSubmit={handleSubmit} className="space-y-4">
            <CollapsibleSection title="Project Basis" icon={<FileText />} defaultOpen={true}>
              <div><Label>Project Name</Label><Input value={projectInputs.name} onChange={(e) => handleProjectInputChange(['name'], e.target.value)}/></div>
              
              <div className="pt-2">
                <h4 className="text-base font-semibold text-pl-text mb-2">Production Profiles</h4>
                {/* headers with units (Fiscal T1-002): the placeholders vanished once a
                    value was typed, and the gas rate is Mcf/d in the engine */}
                <div className="grid grid-cols-3 gap-2 mb-1 text-[11px] text-pl-muted">
                  <span />
                  <span>Initial rate</span>
                  <span>Decline (%/yr)</span>
                </div>
                {['oil', 'gas', 'ngl'].map(type => (
                  <div key={type} className="grid grid-cols-3 gap-2 mb-2 items-center">
                    <Label data-testid={`fis-prod-label-${type}`}>{{ oil: 'Oil (bopd)', gas: 'Gas (Mcf/d)', ngl: 'NGL (bbl/d)' }[type]}</Label>
                    <Input placeholder="Initial Rate" type="number" value={projectInputs.production[type].initial} onChange={(e) => handleProjectInputChange(['production', type, 'initial'], Number(e.target.value))} className="font-pl-mono tabular-nums"/>
                    <Input placeholder="Decline %" type="number" value={projectInputs.production[type].decline} onChange={(e) => handleProjectInputChange(['production', type, 'decline'], Number(e.target.value))} className="font-pl-mono tabular-nums"/>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <h4 className="text-base font-semibold text-pl-text mb-2">Cost Breakdown ($MM)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>CAPEX - Drilling</Label>
                    <Input type="number" value={projectInputs.costs.capex.drilling} onChange={(e) => handleProjectInputChange(['costs', 'capex', 'drilling'], Number(e.target.value))} className="font-pl-mono tabular-nums"/>
                  </div>
                  <div>
                    <Label>CAPEX - Facilities</Label>
                    <Input type="number" value={projectInputs.costs.capex.facilities} onChange={(e) => handleProjectInputChange(['costs', 'capex', 'facilities'], Number(e.target.value))} className="font-pl-mono tabular-nums"/>
                  </div>
                  <div>
                    <Label>CAPEX - Subsea</Label>
                    <Input type="number" value={projectInputs.costs.capex.subsea} onChange={(e) => handleProjectInputChange(['costs', 'capex', 'subsea'], Number(e.target.value))} className="font-pl-mono tabular-nums"/>
                  </div>
                  <div>
                    <Label>OPEX - Fixed ($MM/yr)</Label>
                    <Input type="number" value={projectInputs.costs.opex.fixed} onChange={(e) => handleProjectInputChange(['costs', 'opex', 'fixed'], Number(e.target.value))} className="font-pl-mono tabular-nums"/>
                  </div>
                  <div>
                    <Label>OPEX - Variable ($/boe)</Label>
                    <Input type="number" value={projectInputs.costs.opex.variable} onChange={(e) => handleProjectInputChange(['costs', 'opex', 'variable'], Number(e.target.value))} className="font-pl-mono tabular-nums"/>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <h4 className="text-base font-semibold text-pl-text mb-2">Price Deck</h4>
                <div className="grid grid-cols-4 gap-2 mb-1 text-[11px] text-pl-muted" data-testid="fis-price-headers">
                  <span>From year</span><span>Oil ($/bbl)</span><span>Gas ($/Mcf)</span><span>NGL ($/bbl)</span>
                </div>
                <div className="space-y-2">
                  {projectInputs.prices.map((pricePoint, index) => (
                    <div key={index} className="grid grid-cols-4 gap-2 items-center">
                      <Input placeholder="Year" type="number" value={pricePoint.year} onChange={(e) => handlePriceDeckChange(index, 'year', e.target.value)} className="font-pl-mono tabular-nums"/>
                      <Input placeholder="Oil ($/bbl)" type="number" value={pricePoint.oil} onChange={(e) => handlePriceDeckChange(index, 'oil', e.target.value)} className="font-pl-mono tabular-nums"/>
                      <Input placeholder="Gas ($/mcf)" type="number" value={pricePoint.gas} onChange={(e) => handlePriceDeckChange(index, 'gas', e.target.value)} className="font-pl-mono tabular-nums"/>
                      <Input placeholder="NGL ($/bbl)" type="number" value={pricePoint.ngl} onChange={(e) => handlePriceDeckChange(index, 'ngl', e.target.value)} className="font-pl-mono tabular-nums"/>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="pt-2">
                  <Label>Discount Rate (%)</Label>
                  <Input type="number" value={projectInputs.discountRate} onChange={(e) => handleProjectInputChange(['discountRate'], Number(e.target.value))} className="font-pl-mono tabular-nums"/>
              </div>

            </CollapsibleSection>

            <CollapsibleSection title="Fiscal Regime Definition" icon={<DollarSign />} defaultOpen={true}>
              <div className="flex items-center gap-2 mb-4">
                  <NativeSelect aria-label="Fiscal regime" value={activeRegimeId} onChange={(e) => setActiveRegimeId(Number(e.target.value))} className="w-full min-w-0">
                      {regimes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </NativeSelect>
                  <Button type="button" size="icon" variant="outline" onClick={handleAddRegime} aria-label="Add regime" title="Add regime" className="shrink-0"><Plus className="w-4 h-4"/></Button>
                  <Button type="button" size="icon" variant="outline" onClick={handleDuplicateRegime} aria-label="Duplicate regime" title="Duplicate regime" className="shrink-0"><Copy className="w-4 h-4"/></Button>
                  <Button type="button" size="icon" variant="outline" onClick={handleDeleteRegime} disabled={regimes.length <= 1} aria-label="Delete regime" title="Delete regime" className="shrink-0 text-pl-danger-text hover:text-pl-danger-text"><Trash2 className="w-4 h-4"/></Button>
              </div>
              <Button type="button" variant="outline" onClick={() => setTemplateSelectorOpen(true)} className="w-full mb-4">
                <Library className="w-4 h-4 mr-2" />
                Load Template
              </Button>
              {activeRegime && <RegimeCard regime={activeRegime} onChange={handleRegimeChange} />}
            </CollapsibleSection>

            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <Button type="submit" disabled={loading} className="w-full font-semibold py-3 text-lg">
                {loading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current mr-2"></div> : <GitCompare className="w-5 h-5 mr-2" />}
                Run Comparison
              </Button>
            </motion.div>
          </form>
        </>
      );
    };

    export default InputPanel;