import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Play } from 'lucide-react';

const InputPanel = ({ onAnalyze, loading, initialInputs }) => {
  const [formData, setFormData] = useState(initialInputs || {
    projectName: "New Pipeline Project",
    fluid: "oil",
    flow_rate: 20000,
    inlet_pressure: 1500,
    length: 10
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: isNaN(value) ? value : Number(value)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onAnalyze(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-slate-200">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Pipeline Parameters</h3>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="projectName">Project Name</Label>
            <Input 
              id="projectName" 
              name="projectName" 
              value={formData.projectName} 
              onChange={(e) => setFormData({...formData, projectName: e.target.value})} 
              className="bg-slate-800 border-slate-700" 
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="flow_rate">Flow Rate (bbl/d)</Label>
            <Input 
              id="flow_rate" 
              name="flow_rate" 
              type="number" 
              value={formData.flow_rate} 
              onChange={handleChange} 
              className="bg-slate-800 border-slate-700" 
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="inlet_pressure">Inlet Pressure (psi)</Label>
            <Input 
              id="inlet_pressure" 
              name="inlet_pressure" 
              type="number" 
              value={formData.inlet_pressure} 
              onChange={handleChange} 
              className="bg-slate-800 border-slate-700" 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="length">Length (km)</Label>
            <Input 
              id="length" 
              name="length" 
              type="number" 
              value={formData.length} 
              onChange={handleChange} 
              className="bg-slate-800 border-slate-700" 
            />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={loading} className="w-full bg-lime-500 hover:bg-lime-600 text-slate-900 font-bold">
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
        Analyze Pipeline
      </Button>
    </form>
  );
};

export default InputPanel;