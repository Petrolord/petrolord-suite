import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const ScenarioCard = ({ scenario, onChange, baseValues, isExpert }) => {
  const handleInputChange = (field, value) => {
    onChange(scenario.id, field, value);
  };

  const getDelta = (val, baseVal) => {
      if (!baseVal) return null;
      const diff = ((val - baseVal) / baseVal) * 100;
      if (Math.abs(diff) < 0.1) return <Minus className="w-3 h-3 text-pl-muted" />;
      if (diff > 0) return <span className="flex items-center text-pl-success-text text-xs"><TrendingUp className="w-3 h-3 mr-1"/>+{diff.toFixed(0)}%</span>;
      return <span className="flex items-center text-pl-danger-text text-xs"><TrendingDown className="w-3 h-3 mr-1"/>{diff.toFixed(0)}%</span>;
  };

  return (
    <div className="bg-pl-surface p-4 rounded-lg space-y-4 border border-pl-border hover:border-pl-border-strong transition-colors">
      <div className="flex justify-between items-center">
          <div>
            <Label>Scenario Name</Label>
            <Input 
            value={scenario.name} 
            onChange={(e) => handleInputChange('name', e.target.value)} 
            className="h-8 w-40"
            />
          </div>
          <Badge variant="neutral">
              {scenario.id === 1 ? 'Base Case' : 'Alternative'}
          </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex justify-between">
            <Label className="text-xs text-pl-muted">CAPEX ($MM)</Label>
            {scenario.id !== 1 && getDelta(scenario.capex, baseValues.capex)}
          </div>
          <Input 
            type="number" 
            value={scenario.capex} 
            onChange={(e) => handleInputChange('capex', Number(e.target.value))} 
            className="h-8"
          />
        </div>
        <div>
          <div className="flex justify-between">
            <Label className="text-xs text-pl-muted">Oil Price ($/bbl)</Label>
            {scenario.id !== 1 && getDelta(scenario.oilPrice, baseValues.oilPrice)}
          </div>
          <Input 
            type="number" 
            value={scenario.oilPrice} 
            onChange={(e) => handleInputChange('oilPrice', Number(e.target.value))} 
            className="h-8"
          />
        </div>
      </div>

      {isExpert && (
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-pl-border">
            <div>
                <Label className="text-xs text-pl-muted">OPEX ($/bbl)</Label>
                <Input 
                    type="number" 
                    value={scenario.opexPerBbl} 
                    onChange={(e) => handleInputChange('opexPerBbl', Number(e.target.value))} 
                    className="h-8"
                />
            </div>
            <div>
                <Label className="text-xs text-pl-muted">Start Year</Label>
                <Input 
                    type="number" 
                    value={scenario.startYear || new Date().getFullYear()} 
                    onChange={(e) => handleInputChange('startYear', Number(e.target.value))} 
                    className="h-8"
                />
            </div>
          </div>
      )}
    </div>
  );
};

export default ScenarioCard;