import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import CollapsibleSection from './CollapsibleSection';
import { Settings, GitMerge, HelpCircle, Play, Percent, DollarSign } from 'lucide-react';

// Economics E2: the inputs live on the page now, not in here, so a study can
// be saved and reopened. This panel edits what it is given.

// EC4-7 (owner decision 2026-09-15): each group of chances the engine requires
// to sum to 100 shows its running total, marked when it is off. Same
// tolerance as the engine (voi.js PCT_TOL: 1e-6 on the 0 to 1 scale).
const PCT_TOL = 1e-4;

export const percentTotal = (values) => values.reduce((sum, v) => sum + (Number(v) || 0), 0);

export const SumIndicator = ({ values, testId }) => {
  const total = percentTotal(values);
  const off = !(Math.abs(total - 100) <= PCT_TOL);
  const shown = Number(total.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return (
    <span
      data-testid={testId}
      data-off={off ? 'true' : 'false'}
      role={off ? 'alert' : undefined}
      className={`text-xs font-semibold px-2 py-0.5 rounded ${off ? 'bg-amber-500/20 text-amber-300 border border-amber-400/60' : 'bg-emerald-500/10 text-emerald-300'}`}
    >
      {off ? `Total ${shown}% (must be 100%)` : `Total ${shown}%`}
    </span>
  );
};
const InputPanel = ({ onAnalyze, loading, inputs, setInputs }) => {
  const { toast } = useToast();

  const handleInputChange = (field, value) => {
    setInputs(prev => ({ ...prev, [field]: value }));
  };

  const handleOutcomeChange = (id, field, value) => {
    setInputs(prev => ({
      ...prev,
      outcomes: prev.outcomes.map(o => o.id === id ? { ...o, [field]: value } : o)
    }));
  };

  const handleInfoChange = (field, value) => {
    setInputs(prev => ({
      ...prev,
      infoScenario: { ...prev.infoScenario, [field]: value }
    }));
  };

  const handleIndicatorChange = (id, field, value) => {
    setInputs(prev => ({
      ...prev,
      infoScenario: {
        ...prev.infoScenario,
        indicators: prev.infoScenario.indicators.map(i => i.id === id ? { ...i, [field]: value } : i)
      }
    }));
  };

  const handleConditionalProbChange = (indicatorId, outcomeId, value) => {
    setInputs(prev => ({
      ...prev,
      infoScenario: {
        ...prev.infoScenario,
        indicators: prev.infoScenario.indicators.map(indicator => {
          if (indicator.id === indicatorId) {
            return {
              ...indicator,
              conditionalProbabilities: indicator.conditionalProbabilities.map(cp => 
                cp.outcomeId === outcomeId ? { ...cp, probability: value } : cp
              )
            };
          }
          return indicator;
        })
      }
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onAnalyze(inputs);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 h-full flex flex-col">
      <div className="flex-grow space-y-4">
        <h2 className="text-2xl font-bold text-white mb-4">VOI Analyzer Setup</h2>

        <CollapsibleSection title="Project & Decision" icon={<Settings />} defaultOpen>
          <div className="space-y-4">
            <div><Label>Project Name</Label><Input value={inputs.projectName} onChange={(e) => handleInputChange('projectName', e.target.value)} className="bg-white/5 border-white/20" /></div>
            <div><Label>Decision Name</Label><Input value={inputs.decisionName} onChange={(e) => handleInputChange('decisionName', e.target.value)} className="bg-white/5 border-white/20" /></div>
            <div><Label>Decision Cost ($MM)</Label><Input type="number" value={inputs.decisionCost} onChange={(e) => handleInputChange('decisionCost', Number(e.target.value))} className="bg-white/5 border-white/20" /></div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Base Case Outcomes" icon={<GitMerge />} defaultOpen>
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-300 text-sm">Outcome probabilities</span>
            <SumIndicator testId="voi-sum-outcomes" values={inputs.outcomes.map(o => o.probability)} />
          </div>
          {inputs.outcomes.map(outcome => (
            <div key={outcome.id} className="space-y-3 p-3 bg-slate-800/50 rounded-lg mb-3">
              <p className="font-semibold text-lime-300">{outcome.name}</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Probability</Label><Input type="number" value={outcome.probability} onChange={(e) => handleOutcomeChange(outcome.id, 'probability', Number(e.target.value))} className="bg-white/5 border-white/20" icon={<Percent className="h-4 w-4 text-slate-400" />} /></div>
                <div><Label>Payoff ($MM)</Label><Input type="number" value={outcome.payoff} onChange={(e) => handleOutcomeChange(outcome.id, 'payoff', Number(e.target.value))} className="bg-white/5 border-white/20" icon={<DollarSign className="h-4 w-4 text-slate-400" />} /></div>
              </div>
            </div>
          ))}
        </CollapsibleSection>

        <CollapsibleSection title="Information Scenario" icon={<HelpCircle />} defaultOpen>
            <div className="space-y-4">
                <div><Label>Information Name</Label><Input value={inputs.infoScenario.name} onChange={(e) => handleInfoChange('name', e.target.value)} className="bg-white/5 border-white/20" /></div>
                <div><Label>Cost of Information ($MM)</Label><Input type="number" value={inputs.infoScenario.cost} onChange={(e) => handleInfoChange('cost', Number(e.target.value))} className="bg-white/5 border-white/20" /></div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 text-sm">Indicator probabilities</span>
                  <SumIndicator testId="voi-sum-indicators" values={inputs.infoScenario.indicators.map(i => i.probability)} />
                </div>
                {inputs.infoScenario.indicators.map(indicator => (
                  <div key={indicator.id} className="space-y-3 p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <p className="font-semibold text-lime-300">{indicator.name}</p>
                      <div><Label>P(Indicator)</Label><Input type="number" value={indicator.probability} onChange={(e) => handleIndicatorChange(indicator.id, 'probability', Number(e.target.value))} className="bg-white/5 border-white/20 w-24" icon={<Percent className="h-4 w-4 text-slate-400" />} /></div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm">Conditional Probabilities</Label>
                        <SumIndicator testId={`voi-sum-conditional-${indicator.id}`} values={indicator.conditionalProbabilities.map(cp => cp.probability)} />
                      </div>
                      {indicator.conditionalProbabilities.map(cp => {
                        const outcome = inputs.outcomes.find(o => o.id === cp.outcomeId);
                        return (
                          <div key={cp.outcomeId} className="flex justify-between items-center">
                            <span className="text-slate-300 text-sm">P({outcome.name} | {indicator.name})</span>
                            <Input type="number" value={cp.probability} onChange={(e) => handleConditionalProbChange(indicator.id, outcome.id, Number(e.target.value))} className="bg-white/5 border-white/20 w-24" icon={<Percent className="h-4 w-4 text-slate-400" />} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
        </CollapsibleSection>
      </div>

      <div className="pt-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-semibold py-3 text-lg">
            {loading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div> : <Play className="w-5 h-5 mr-2" />}
            Analyze & Simulate
          </Button>
        </motion.div>
      </div>
    </form>
  );
};

export default InputPanel;