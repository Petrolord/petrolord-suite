import React, { useState } from 'react';
import { useRiskReporting } from '../../contexts/RiskReportingContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ArrowRight, Save, Play, Settings2, Filter, LayoutGrid, BarChart2, CheckCircle2, Plus, X } from 'lucide-react';
import { DEFAULT_CHART_GROUP, GROUP_FIELDS, REPORT_COLUMNS, columnLabel } from '../../utils/reportConfig';

const STEPS = [
  { id: 'details', label: 'Details', icon: Settings2 },
  { id: 'columns', label: 'Columns', icon: LayoutGrid },
  { id: 'filters', label: 'Filters', icon: Filter },
  { id: 'grouping', label: 'Grouping', icon: BarChart2 },
  { id: 'review', label: 'Review', icon: CheckCircle2 }
];

const AVAILABLE_COLUMNS = REPORT_COLUMNS;
const NO_GROUPING = 'none';

export const ReportBuilder = () => {
  const { activeReport, closeReport, saveReport, openReportViewer } = useRiskReporting();
  const [currentStep, setCurrentStep] = useState(0);
  const [config, setConfig] = useState(() => {
    const base = activeReport || {
      name: 'Untitled Custom Report',
      description: '',
      columns: ['risk_id', 'title', 'risk_score', 'status'],
      filters: [],
    };
    return {
      ...base,
      description: base.description || '',
      columns: [...(base.columns || [])],
      filters: (base.filters || []).map((f) => ({ ...f })),
      grouping: base.grouping || null,
    };
  });

  const updateConfig = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  // saveReport returns the report with its row id, so Save & Generate
  // opens the report just saved, and a second save updates it rather
  // than inserting a copy (AS13).
  const handleSave = async (andGenerate = false) => {
    const saved = await saveReport(config);
    if (saved && andGenerate) {
      openReportViewer(saved);
    } else if (saved) {
      closeReport();
    }
  };

  const addFilter = () => {
    updateConfig('filters', [...config.filters, { field: 'status', operator: 'equals', value: 'Open' }]);
  };

  const removeFilter = (idx) => {
    updateConfig('filters', config.filters.filter((_, i) => i !== idx));
  };

  // A copy, never the object in place: the filters can belong to a
  // template, and editing one in place changed the template.
  const updateFilter = (idx, key, val) => {
    updateConfig('filters', config.filters.map((f, i) => (i === idx ? { ...f, [key]: val } : f)));
  };

  const toggleColumn = (key) => {
    const cols = config.columns.includes(key) 
      ? config.columns.filter(c => c !== key)
      : [...config.columns, key];
    updateConfig('columns', cols);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={closeReport} className="text-slate-400 hover:text-white px-2">
            <ArrowLeft className="w-4 h-4 mr-2" /> Exit Builder
          </Button>
          <div>
            <h2 className="text-lg font-bold text-white">Advanced Report Builder</h2>
            <p className="text-xs text-slate-400">Configure your custom view</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => handleSave(false)}>
            <Save className="w-4 h-4 mr-2" /> Save Draft
          </Button>
          <Button className="bg-cyan-600 hover:bg-cyan-700 text-white" onClick={() => handleSave(true)}>
            <Play className="w-4 h-4 mr-2" /> Save & Generate
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Stepper */}
        <div className="w-64 bg-slate-900 border-r border-slate-800 p-4 space-y-2">
          {STEPS.map((step, idx) => (
            <button
              key={step.id}
              onClick={() => setCurrentStep(idx)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg text-sm font-medium transition-colors ${
                idx === currentStep ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 
                idx < currentStep ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-800/50'
              }`}
            >
              <step.icon className="w-4 h-4" />
              {step.label}
              {idx < currentStep && <CheckCircle2 className="w-3 h-3 ml-auto text-green-500" />}
            </button>
          ))}
        </div>

        {/* Builder Area */}
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-6">
            
            {currentStep === 0 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <h3 className="text-xl font-semibold text-white mb-4">Report Details</h3>
                <Card className="bg-slate-900 border-slate-800 p-6 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Report Name</Label>
                    <Input value={config.name} onChange={e => updateConfig('name', e.target.value)} className="bg-slate-950 border-slate-700" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Description (Optional)</Label>
                    <Input value={config.description} onChange={e => updateConfig('description', e.target.value)} className="bg-slate-950 border-slate-700" />
                  </div>
                </Card>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <h3 className="text-xl font-semibold text-white mb-4">Select Columns</h3>
                <p className="text-sm text-slate-400 mb-4">Choose which data fields to include in your report table.</p>
                <div className="grid grid-cols-2 gap-3">
                  {AVAILABLE_COLUMNS.map(col => (
                    <div 
                      key={col.key}
                      onClick={() => toggleColumn(col.key)}
                      className={`p-3 rounded border cursor-pointer flex items-center justify-between transition-colors ${
                        config.columns.includes(col.key) 
                        ? 'bg-cyan-900/20 border-cyan-500/50 text-cyan-100' 
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-sm font-medium">{col.label}</span>
                      {config.columns.includes(col.key) && <CheckCircle2 className="w-4 h-4 text-cyan-500" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold text-white">Data Filters</h3>
                  <Button size="sm" variant="outline" onClick={addFilter} className="border-cyan-500/30 text-cyan-400">
                    <Plus className="w-4 h-4 mr-1"/> Add Filter
                  </Button>
                </div>
                
                {config.filters.length === 0 ? (
                  <div className="text-center p-8 border border-dashed border-slate-800 rounded-lg text-slate-500">
                    No filters applied. Report will include all risks.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {config.filters.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-lg">
                        <Select value={f.field} onValueChange={v => updateFilter(i, 'field', v)}>
                          <SelectTrigger className="w-[180px] bg-slate-950 border-slate-700"><SelectValue/></SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-700 text-white">
                            {AVAILABLE_COLUMNS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={f.operator} onValueChange={v => updateFilter(i, 'operator', v)}>
                          <SelectTrigger className="w-[150px] bg-slate-950 border-slate-700"><SelectValue/></SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-700 text-white">
                            <SelectItem value="equals">Equals</SelectItem>
                            <SelectItem value="contains">Contains</SelectItem>
                            <SelectItem value="greater_than">Greater Than</SelectItem>
                            <SelectItem value="less_than">Less Than</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input 
                          value={f.value} 
                          onChange={e => updateFilter(i, 'value', e.target.value)} 
                          className="flex-1 bg-slate-950 border-slate-700" 
                          placeholder="Value..."
                        />
                        <Button variant="ghost" size="icon" onClick={() => removeFilter(i)} className="text-slate-500 hover:text-red-400">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <h3 className="text-xl font-semibold text-white mb-4">Grouping</h3>
                <Card className="bg-slate-900 border-slate-800 p-6 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Group rows by</Label>
                    <Select
                      value={config.grouping || NO_GROUPING}
                      onValueChange={v => updateConfig('grouping', v === NO_GROUPING ? null : v)}
                    >
                      <SelectTrigger className="w-[240px] bg-slate-950 border-slate-700"><SelectValue/></SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 text-white">
                        <SelectItem value={NO_GROUPING}>No grouping</SelectItem>
                        {GROUP_FIELDS.map(g => <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-slate-400">
                    The table lists the rows under a heading for each group. The chart view counts the risks in
                    each group, or by {columnLabel(DEFAULT_CHART_GROUP).toLowerCase()} when no grouping is set.
                  </p>
                </Card>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <h3 className="text-xl font-semibold text-white mb-4">Review Configuration</h3>
                <Card className="bg-slate-900 border-slate-800 p-6 space-y-4">
                  <div><span className="text-slate-500 text-sm">Name:</span> <p className="text-white font-medium">{config.name}</p></div>
                  <div><span className="text-slate-500 text-sm">Columns:</span> <p className="text-white font-medium text-sm mt-1 flex flex-wrap gap-1">
                    {config.columns.map(c => <span key={c} className="px-2 py-1 bg-slate-800 rounded">{columnLabel(c)}</span>)}
                  </p></div>
                  <div><span className="text-slate-500 text-sm">Filters:</span> <p className="text-white font-medium text-sm mt-1">
                    {config.filters.length} active filters
                  </p></div>
                  <div><span className="text-slate-500 text-sm">Grouping:</span> <p className="text-white font-medium text-sm mt-1">
                    {config.grouping ? columnLabel(config.grouping) : 'None'}
                  </p></div>
                </Card>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-8 mt-8 border-t border-slate-800">
              <Button 
                variant="outline" 
                onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
                disabled={currentStep === 0}
                className="border-slate-700 text-slate-300"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Previous
              </Button>
              
              {currentStep < STEPS.length - 1 ? (
                <Button 
                  className="bg-slate-800 hover:bg-slate-700 text-white"
                  onClick={() => setCurrentStep(prev => Math.min(STEPS.length - 1, prev + 1))}
                >
                  Next Step <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button className="bg-cyan-600 hover:bg-cyan-700 text-white" onClick={() => handleSave(true)}>
                  <Play className="w-4 h-4 mr-2" /> Generate Report
                </Button>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};