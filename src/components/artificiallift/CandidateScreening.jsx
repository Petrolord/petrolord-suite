import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Zap, Wind, Wrench, ArrowRight, Check, X, Minus } from 'lucide-react';
import { screenLiftSystems } from '@/utils/liftSystemScreening';
import CollapsibleSection from '@/components/nodalanalysis/CollapsibleSection';

const CandidateScreening = ({ inputs, setInputs, onProceed }) => {
  const [results, setResults] = useState([]);

  useEffect(() => {
    const screeningResults = screenLiftSystems(inputs);
    setResults(screeningResults);
  }, [inputs]);

  const handleInputChange = (key, value) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const handleCheckboxChange = (key, checked) => {
    setInputs(prev => ({ ...prev, [key]: checked }));
  };

  const getScoreColor = (score) => {
    if (score > 75) return 'text-green-400';
    if (score > 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getIcon = (type) => {
    if (type === 'ESP') return <Zap className="w-8 h-8 text-blue-400" />;
    if (type === 'Gas Lift') return <Wind className="w-8 h-8 text-teal-400" />;
    if (type === 'Rod Pump') return <Wrench className="w-8 h-8 text-orange-400" />;
  };

  const getReasonIcon = (type) => {
    if (type === 'pro') return <Check className="w-4 h-4 text-green-400 flex-shrink-0" />;
    if (type === 'con') return <X className="w-4 h-4 text-red-400 flex-shrink-0" />;
    return <Minus className="w-4 h-4 text-yellow-400 flex-shrink-0" />;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="lg:col-span-1 bg-slate-800/50 p-6 rounded-lg"
      >
        <h2 className="text-2xl font-bold text-white mb-6">Screening Questionnaire</h2>
        <div className="space-y-4">
          <CollapsibleSection title="Production & Reservoir" defaultOpen>
            <div className="space-y-3 p-1">
              <div>
                <Label htmlFor="targetRate" className="text-slate-200">Target Liquid Rate (bbl/d)</Label>
                <Input id="targetRate" type="number" value={inputs.targetRate} onChange={(e) => handleInputChange('targetRate', parseFloat(e.target.value) || 0)} className="text-slate-900 bg-white" />
              </div>
              <div>
                <Label htmlFor="depth" className="text-slate-200">Well Depth (ft)</Label>
                <Input id="depth" type="number" value={inputs.depth} onChange={(e) => handleInputChange('depth', parseFloat(e.target.value) || 0)} className="text-slate-900 bg-white" />
              </div>
            </div>
          </CollapsibleSection>
          <CollapsibleSection title="Fluid Properties">
            <div className="space-y-3 p-1">
              <div>
                <Label htmlFor="gor" className="text-slate-200">Gas-Oil Ratio (scf/stb)</Label>
                <Input id="gor" type="number" value={inputs.gor} onChange={(e) => handleInputChange('gor', parseFloat(e.target.value) || 0)} className="text-slate-900 bg-white" />
              </div>
              <div>
                <Label htmlFor="waterCut" className="text-slate-200">Water Cut (%)</Label>
                <Input id="waterCut" type="number" value={inputs.waterCut} onChange={(e) => handleInputChange('waterCut', parseFloat(e.target.value) || 0)} className="text-slate-900 bg-white" />
              </div>
              <div>
                <Label htmlFor="apiGravity" className="text-slate-200">API Gravity</Label>
                <Input id="apiGravity" type="number" value={inputs.apiGravity} onChange={(e) => handleInputChange('apiGravity', parseFloat(e.target.value) || 0)} className="text-slate-900 bg-white" />
              </div>
            </div>
          </CollapsibleSection>
          <CollapsibleSection title="Operational Constraints">
            <div className="space-y-3 p-1">
              <div className="flex items-center space-x-2">
                <Checkbox id="isOffshore" checked={inputs.isOffshore} onCheckedChange={(c) => handleCheckboxChange('isOffshore', c)} />
                <Label htmlFor="isOffshore" className="mb-0 text-slate-200">Offshore Location</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="hasSand" checked={inputs.hasSand} onCheckedChange={(c) => handleCheckboxChange('hasSand', c)} />
                <Label htmlFor="hasSand" className="mb-0 text-slate-200">Sand/Solids Production</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="isDeviated" checked={inputs.isDeviated} onCheckedChange={(c) => handleCheckboxChange('isDeviated', c)} />
                <Label htmlFor="isDeviated" className="mb-0 text-slate-200">Deviated Wellbore</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="powerAvailable" checked={inputs.powerAvailable} onCheckedChange={(c) => handleCheckboxChange('powerAvailable', c)} />
                <Label htmlFor="powerAvailable" className="mb-0 text-slate-200">Electric Power Available</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="gasAvailable" checked={inputs.gasAvailable} onCheckedChange={(c) => handleCheckboxChange('gasAvailable', c)} />
                <Label htmlFor="gasAvailable" className="mb-0 text-slate-200">Lift Gas Source Available</Label>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="lg:col-span-2"
      >
        <h2 className="text-2xl font-bold text-white mb-6">Screening Matrix Results</h2>
        <div className="space-y-4">
          {results.map((result, index) => (
            <motion.div
              key={result.type}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`bg-slate-800/50 p-4 rounded-lg border-l-4 ${result.isRecommended ? 'border-green-400' : 'border-slate-600'}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  {getIcon(result.type)}
                  <div>
                    <h3 className="text-xl font-bold text-white">{result.type}</h3>
                    <p className={`text-3xl font-black ${getScoreColor(result.score)}`}>{result.score}<span className="text-lg text-slate-400">/100</span></p>
                  </div>
                </div>
                <div className="mt-4 sm:mt-0 flex flex-col items-start sm:items-end">
                  <p className={`font-semibold text-lg ${result.isRecommended ? 'text-green-300' : 'text-yellow-300'}`}>
                    {result.isRecommended ? 'Recommended' : 'Consider with Caution'}
                  </p>
                  <Button
                    size="sm"
                    className="mt-2 bg-blue-600 hover:bg-blue-500 text-white"
                    onClick={() => onProceed(result.type.toLowerCase().replace(' ', '_'))}
                    disabled={result.score < 50}
                  >
                    Proceed to Design <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700">
                <h4 className="font-semibold text-lime-300 mb-2">Rationale:</h4>
                <ul className="space-y-1 text-sm">
                  {result.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2">
                      {getReasonIcon(reason.type)}
                      <span className="text-slate-300">{reason.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default CandidateScreening;