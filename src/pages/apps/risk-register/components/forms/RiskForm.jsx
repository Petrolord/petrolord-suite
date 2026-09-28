import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { RISK_CATEGORIES, LIKELIHOOD_LEVELS, IMPACT_LEVELS } from '../../constants';
import { calculateResidualScore, calculateRiskScore } from '@/lib/riskScoring';
import { RiskScoreBadge } from '../RiskBadges';
import { Save, X, Loader2, Tag, Link } from 'lucide-react';
import { AS2_SCHEMA_MESSAGE, appetitePreview } from '../../utils/riskPayload';

export const RiskForm = ({ initialData = {}, onSubmit, onCancel, isSubmitting, hasAs2Schema = true }) => {
  const [formData, setFormData] = useState({
    title: initialData.title || '',
    category: initialData.category || '',
    likelihood: initialData.likelihood || 1,
    impact: initialData.impact || 1,
    root_cause: initialData.root_cause || '',
    consequences: initialData.consequences || '',
    mitigation_summary: initialData.mitigation_summary || '',
    residual_likelihood: initialData.residual_likelihood || '',
    residual_impact: initialData.residual_impact || '',
    target_score: initialData.target_score || '',
    next_review_date: initialData.next_review_date || '',
    tags: initialData.tags || '',
    linked_risks: initialData.linked_risks || ''
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const currentScore = calculateRiskScore(formData.likelihood, formData.impact);
  const residualScore = calculateResidualScore(formData);
  // The same answer the detail page and the stored appetite_status give.
  const appetite = appetitePreview(formData);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <Label>Risk Title *</Label>
              <Input 
                required 
                value={formData.title}
                onChange={e => handleChange('title', e.target.value)}
                className="mt-1" 
                placeholder="e.g. Wellbore Instability in Section 3" 
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Category *</Label>
                <Select value={formData.category} onValueChange={v => handleChange('category', v)} required>
                  <SelectTrigger aria-label="Category" className="mt-1">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="flex items-center gap-1"><Tag className="w-3 h-3"/> Tags</Label>
                <Input 
                  value={formData.tags}
                  onChange={e => handleChange('tags', e.target.value)}
                  className="mt-1" 
                  placeholder="e.g. HSE, Q3, Drilling (comma separated)" 
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-pl-border">
            <div>
              <Label>Likelihood</Label>
              <Select value={formData.likelihood.toString()} onValueChange={v => handleChange('likelihood', Number(v))}>
                <SelectTrigger aria-label="Likelihood" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIKELIHOOD_LEVELS.map(l => <SelectItem key={l.value} value={l.value.toString()}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Impact</Label>
              <Select value={formData.impact.toString()} onValueChange={v => handleChange('impact', Number(v))}>
                <SelectTrigger aria-label="Impact" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMPACT_LEVELS.map(i => <SelectItem key={i.value} value={i.value.toString()}>{i.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-pl-sunken p-4 rounded-lg border border-pl-border">
                <div className="flex-1">
                  <span className="text-pl-muted text-sm font-medium block mb-1">Inherent risk score</span>
                  <span className="text-xs text-pl-muted block">Likelihood × impact, before any control</span>
                </div>
                <RiskScoreBadge score={currentScore} className="text-lg px-4 py-1" />
            </div>
          </div>

          {/* AS2: residual, appetite and review date. Every number in this
              register described inherent risk before this, which is the
              world before any control was applied. Without migration
              20260916110000 these fields cannot be saved, so they are not
              offered, and the form says why (AS13). */}
          {!hasAs2Schema ? (
            <div className="pt-4 border-t border-pl-border">
              <div className="p-3 rounded-lg border border-pl-warning/40 bg-pl-warning-bg text-sm text-pl-text">
                {AS2_SCHEMA_MESSAGE}
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-pl-border">
            <div className="md:col-span-2">
              <h3 className="text-sm font-semibold text-pl-text">After controls</h3>
              <p className="text-xs text-pl-muted mt-1">
                Leave these blank until the controls are in place. A risk with no
                residual assessment is carried at its inherent score, per axis, so
                mitigating likelihood alone does not quietly reduce the impact.
              </p>
            </div>
            <div>
              <Label>Residual likelihood</Label>
              <Select
                value={formData.residual_likelihood ? String(formData.residual_likelihood) : 'none'}
                onValueChange={v => handleChange('residual_likelihood', v === 'none' ? '' : Number(v))}
              >
                <SelectTrigger aria-label="Residual likelihood" className="mt-1">
                  <SelectValue placeholder="Not assessed" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not assessed</SelectItem>
                  {LIKELIHOOD_LEVELS.map(l => <SelectItem key={l.value} value={l.value.toString()}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Residual impact</Label>
              <Select
                value={formData.residual_impact ? String(formData.residual_impact) : 'none'}
                onValueChange={v => handleChange('residual_impact', v === 'none' ? '' : Number(v))}
              >
                <SelectTrigger aria-label="Residual impact" className="mt-1">
                  <SelectValue placeholder="Not assessed" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not assessed</SelectItem>
                  {IMPACT_LEVELS.map(i => <SelectItem key={i.value} value={i.value.toString()}>{i.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target score (risk appetite)</Label>
              <Input
                type="number" min="1" max="25"
                value={formData.target_score}
                onChange={e => handleChange('target_score', e.target.value === '' ? '' : Number(e.target.value))}
                className="mt-1"
                placeholder="e.g. 6"
              />
              <p className="text-xs text-pl-muted mt-1">The score this organisation is willing to carry.</p>
            </div>
            <div>
              <Label>Next review date</Label>
              <Input
                type="date"
                value={formData.next_review_date || ''}
                onChange={e => handleChange('next_review_date', e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2 flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-pl-sunken p-4 rounded-lg border border-pl-border">
                <div className="flex-1">
                  <span className="text-pl-muted text-sm font-medium block mb-1">Residual risk score</span>
                  <span className="text-xs text-pl-muted block">
                    {appetite}
                  </span>
                </div>
                <RiskScoreBadge score={residualScore} className="text-lg px-4 py-1" />
            </div>
          </div>
          )}

          <div className="space-y-4 pt-4 border-t border-pl-border">
            <div>
              <Label>Root Cause</Label>
              <Textarea 
                value={formData.root_cause}
                onChange={e => handleChange('root_cause', e.target.value)}
                className="mt-1 h-20" 
                placeholder="What is the underlying cause of this risk?" 
              />
            </div>
            <div>
              <Label>Consequences</Label>
              <Textarea 
                value={formData.consequences}
                onChange={e => handleChange('consequences', e.target.value)}
                className="mt-1 h-20" 
                placeholder="What are the potential impacts if realized?" 
              />
            </div>
            <div>
              <Label>Proposed Mitigation Summary</Label>
              <Textarea 
                value={formData.mitigation_summary}
                onChange={e => handleChange('mitigation_summary', e.target.value)}
                className="mt-1 h-20" 
                placeholder="How will this risk be controlled or reduced?" 
              />
            </div>
            <div>
              <Label className="flex items-center gap-1"><Link className="w-3 h-3"/> Linked Risks</Label>
              <Input 
                value={formData.linked_risks}
                onChange={e => handleChange('linked_risks', e.target.value)}
                className="mt-1" 
                placeholder="Search and attach risk IDs (e.g. RSK-1001)" 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          <X className="w-4 h-4 mr-2" /> Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {initialData.id ? 'Save Changes' : 'Create Risk'}
        </Button>
      </div>
    </form>
  );
};