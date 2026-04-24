import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { RISK_CATEGORIES, LIKELIHOOD_LEVELS, IMPACT_LEVELS } from '../../constants';
import { calculateRiskScore } from '../../utils/riskScoring';
import { RiskScoreBadge } from '../RiskBadges';
import { Save, X, Loader2, Tag, Link } from 'lucide-react';

export const RiskForm = ({ initialData = {}, onSubmit, onCancel, isSubmitting }) => {
  const [formData, setFormData] = useState({
    title: initialData.title || '',
    category: initialData.category || '',
    likelihood: initialData.likelihood || 1,
    impact: initialData.impact || 1,
    root_cause: initialData.root_cause || '',
    consequences: initialData.consequences || '',
    mitigation_summary: initialData.mitigation_summary || '',
    tags: initialData.tags || '',
    linked_risks: initialData.linked_risks || ''
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const currentScore = calculateRiskScore(formData.likelihood, formData.impact);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Risk Title *</Label>
              <Input 
                required 
                value={formData.title}
                onChange={e => handleChange('title', e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1" 
                placeholder="e.g. Wellbore Instability in Section 3" 
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Category *</Label>
                <Select value={formData.category} onValueChange={v => handleChange('category', v)} required>
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-white mt-1">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    {RISK_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300 flex items-center gap-1"><Tag className="w-3 h-3"/> Tags</Label>
                <Input 
                  value={formData.tags}
                  onChange={e => handleChange('tags', e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white mt-1" 
                  placeholder="e.g. HSE, Q3, Drilling (comma separated)" 
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800">
            <div>
              <Label className="text-slate-300">Likelihood</Label>
              <Select value={formData.likelihood.toString()} onValueChange={v => handleChange('likelihood', Number(v))}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  {LIKELIHOOD_LEVELS.map(l => <SelectItem key={l.value} value={l.value.toString()}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Impact</Label>
              <Select value={formData.impact.toString()} onValueChange={v => handleChange('impact', Number(v))}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  {IMPACT_LEVELS.map(i => <SelectItem key={i.value} value={i.value.toString()}>{i.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-950 p-4 rounded-lg border border-slate-800">
                <div className="flex-1">
                  <span className="text-slate-400 text-sm font-medium block mb-1">Calculated Inherent Risk Score:</span>
                  <span className="text-xs text-slate-500 block">Preview (Likelihood × Impact) - Read Only</span>
                </div>
                <RiskScoreBadge score={currentScore} className="text-lg px-4 py-1" />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800">
            <div>
              <Label className="text-slate-300">Root Cause</Label>
              <Textarea 
                value={formData.root_cause}
                onChange={e => handleChange('root_cause', e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1 h-20" 
                placeholder="What is the underlying cause of this risk?" 
              />
            </div>
            <div>
              <Label className="text-slate-300">Consequences</Label>
              <Textarea 
                value={formData.consequences}
                onChange={e => handleChange('consequences', e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1 h-20" 
                placeholder="What are the potential impacts if realized?" 
              />
            </div>
            <div>
              <Label className="text-slate-300">Proposed Mitigation Summary</Label>
              <Textarea 
                value={formData.mitigation_summary}
                onChange={e => handleChange('mitigation_summary', e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1 h-20" 
                placeholder="How will this risk be controlled or reduced?" 
              />
            </div>
            <div>
              <Label className="text-slate-300 flex items-center gap-1"><Link className="w-3 h-3"/> Linked Risks</Label>
              <Input 
                value={formData.linked_risks}
                onChange={e => handleChange('linked_risks', e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1" 
                placeholder="Search and attach risk IDs (e.g. RSK-1001)" 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} className="border-slate-700 text-slate-300 hover:bg-slate-800">
          <X className="w-4 h-4 mr-2" /> Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="bg-cyan-600 hover:bg-cyan-700 text-white">
          {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {initialData.id ? 'Save Changes' : 'Create Risk'}
        </Button>
      </div>
    </form>
  );
};