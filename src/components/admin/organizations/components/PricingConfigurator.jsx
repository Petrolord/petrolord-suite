import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getModuleList, getAppsByModule } from '@/utils/adminHelpers';

const PricingConfigurator = ({ initialConfig, onChange }) => {
  const modules = getModuleList();

  const handleConfigChange = (key, value) => {
    const newConfig = { ...initialConfig, [key]: value };
    // Simple mock calculation
    const calculated = {
      monthlyTotal: (parseInt(newConfig.userCount || 0) * 10) + (parseInt(newConfig.storageGB || 0) * 0.5) + 500 // Base fee
    };
    onChange({ ...newConfig, calculated });
  };

  const toggleModule = (modId) => {
    const currentModules = initialConfig.modules || [];
    if (currentModules.includes(modId)) {
      handleConfigChange('modules', currentModules.filter(m => m !== modId));
    } else {
      handleConfigChange('modules', [...currentModules, modId]);
    }
  };

  return (
    <div className="space-y-6 p-1">
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Subscription Tier</Label>
          <Select 
            value={initialConfig.tierId} 
            onValueChange={(val) => handleConfigChange('tierId', val)}
          >
            <SelectTrigger className="bg-slate-950 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="growth">Growth</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>User Seats</Label>
          <Input 
            type="number" 
            value={initialConfig.userCount} 
            onChange={(e) => handleConfigChange('userCount', parseInt(e.target.value))}
            className="bg-slate-950 border-slate-700"
          />
        </div>
        <div className="space-y-2">
          <Label>Storage Limit (GB)</Label>
          <Input 
            type="number" 
            value={initialConfig.storageGB} 
            onChange={(e) => handleConfigChange('storageGB', parseInt(e.target.value))}
            className="bg-slate-950 border-slate-700"
          />
        </div>
        <div className="space-y-2">
          <Label>Custom Discount (%)</Label>
          <Input 
            type="number" 
            value={initialConfig.customDiscount} 
            onChange={(e) => handleConfigChange('customDiscount', parseInt(e.target.value))}
            className="bg-slate-950 border-slate-700"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Enabled Modules</Label>
        <ScrollArea className="h-[300px] border border-slate-800 rounded bg-slate-950 p-4">
          <div className="grid grid-cols-2 gap-4">
            {modules.map(mod => (
              <div key={mod.id} className="flex items-start space-x-2">
                <Checkbox 
                  id={mod.id} 
                  checked={(initialConfig.modules || []).includes(mod.id)}
                  onCheckedChange={() => toggleModule(mod.id)}
                />
                <div>
                  <label htmlFor={mod.id} className="text-sm font-medium leading-none text-slate-200 cursor-pointer">
                    {mod.name}
                  </label>
                  <p className="text-xs text-slate-500 mt-1">{mod.description}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default PricingConfigurator;