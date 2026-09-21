import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRiskRegister } from './hooks/useRiskRegister';
import { useRiskChildren } from './hooks/useRiskChildren';
import { calculateResidualScore, getAppetiteStatus, getRiskBand, isReviewOverdue } from '@/lib/riskScoring';
import { RISK_STATUSES } from './constants';
import { RiskRegisterShell } from './components/RiskRegisterShell';
import { RiskScoreBadge, RiskStatusBadge } from './components/RiskBadges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit2, Loader2, Trash2, Link as LinkIcon, History, Tag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const RiskDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { risks, loading, updateRisk, deleteRisk } = useRiskRegister();
  const { toast } = useToast();
  
  const [risk, setRisk] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { tags, linkedRisks, error: childError } = useRiskChildren(id, risks);

  useEffect(() => {
    if (!loading) {
      const found = risks.find(r => r.id === id);
      if (found) setRisk(found);
      else navigate('/dashboard/apps/assurance/risk-register');
    }
  }, [id, risks, loading, navigate]);

  const handleStatusChange = async (newStatus) => {
      const res = await updateRisk(id, { status: newStatus });
      if (res.success) {
          toast({ title: "Status updated", description: `Risk is now ${newStatus}.` });
      } else {
          // This used to do nothing at all on failure, so a status that
          // did not save looked exactly like one that did.
          toast({ variant: "destructive", title: "Status not saved", description: res.error });
      }
  };

  const handleDelete = async () => {
      if(!window.confirm("Are you sure you want to delete this risk?")) return;
      setIsDeleting(true);
      const res = await deleteRisk(id);
      if(res.success) {
          toast({ title: "Deleted", description: "Risk removed from register." });
          navigate('/dashboard/apps/assurance/risk-register');
      } else {
          toast({ variant: "destructive", title: "Error", description: res.error || "Failed to delete" });
          setIsDeleting(false);
      }
  };

  const handleBack = () => {
    navigate('/dashboard/apps/assurance/risk-register');
  };

  if (loading || !risk) {
      return (
          <RiskRegisterShell>
              <div className="flex items-center justify-center h-full min-h-[400px]">
                  <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
              </div>
          </RiskRegisterShell>
      );
  }

  return (
    <RiskRegisterShell>
      <div className="p-6 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={handleBack} className="text-slate-400 hover:text-white">
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm font-mono text-slate-500">{risk.risk_id}</span>
                        <RiskStatusBadge status={risk.status} />
                        <RiskScoreBadge score={risk.risk_score} />
                    </div>
                    <h2 className="text-2xl font-bold text-white">{risk.title}</h2>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {tags.length === 0 ? (
                        <span className="text-xs text-slate-500 italic">No tags</span>
                      ) : tags.map(t => (
                        <Badge key={t.id} variant="outline" className="bg-slate-800 text-cyan-400 border-slate-700 text-xs">
                          <Tag className="w-3 h-3 mr-1"/> {t.tag}
                        </Badge>
                      ))}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Select value={risk.status || 'Open'} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-[140px] bg-slate-900 border-slate-700 text-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                        {/* From the one status list. This menu was typed out by
                            hand and left out Realized, so a risk could not be
                            set to it and a Realized risk showed a value its
                            own menu did not have (AS13). */}
                        {RISK_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    variant="outline"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    title="Edit this risk"
                    onClick={() => navigate(`/dashboard/apps/assurance/risk-register/${id}/edit`)}
                >
                    <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="destructive" size="icon" onClick={handleDelete} disabled={isDeleting}>
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4" />}
                </Button>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="pb-3 border-b border-slate-800/50">
                        <CardTitle className="text-base text-slate-200">Context & Analysis</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <div>
                            <h4 className="text-sm font-medium text-slate-500 mb-1">Category</h4>
                            <p className="text-slate-200">{risk.category}</p>
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-slate-500 mb-1">Root Cause</h4>
                            <p className="text-slate-300 text-sm whitespace-pre-wrap">{risk.root_cause || 'Not specified'}</p>
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-slate-500 mb-1">Potential Consequences</h4>
                            <p className="text-slate-300 text-sm whitespace-pre-wrap">{risk.consequences || 'Not specified'}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="pb-3 border-b border-slate-800/50">
                        <CardTitle className="text-base text-slate-200">Mitigation Strategy</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <p className="text-slate-300 text-sm whitespace-pre-wrap">{risk.mitigation_summary || 'No mitigation plan recorded.'}</p>
                    </CardContent>
                </Card>
                
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="pb-3 border-b border-slate-800/50 flex flex-row items-center justify-between">
                        <CardTitle className="text-base text-slate-200 flex items-center gap-2"><LinkIcon className="w-4 h-4 text-slate-400"/> Linked Risks</CardTitle>
                        <Button
                          variant="link"
                          className="text-cyan-400 p-0 h-auto text-xs"
                          onClick={() => navigate(`/dashboard/apps/assurance/risk-register/${id}/edit`)}
                        >+ Add Link</Button>
                    </CardHeader>
                    <CardContent className="p-6 space-y-2">
                        {childError && <p className="text-sm text-red-400">{childError}</p>}
                        {!childError && linkedRisks.length === 0 && (
                          <p className="text-sm text-slate-500 italic">This risk is not linked to any other.</p>
                        )}
                        {linkedRisks.map(l => (
                          <div key={l.id} className="text-sm text-slate-400 border border-slate-800 rounded-md p-3 bg-slate-950 flex items-center justify-between gap-3">
                            <span className="truncate">
                              <span className="font-mono text-slate-300">{l.code}</span>
                              <span className="text-slate-500"> ({l.type})</span> {l.title}
                            </span>
                            <Button
                              variant="ghost" size="sm" className="h-6 text-xs text-cyan-400 p-0 shrink-0"
                              onClick={() => navigate(`/dashboard/apps/assurance/risk-register/${l.riskId}`)}
                            >View</Button>
                          </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-6">
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="pb-3 border-b border-slate-800/50">
                        <CardTitle className="text-base text-slate-200">Assessment</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-500">Likelihood</span>
                            <span className="text-lg font-bold text-slate-200">{risk.likelihood || 1}/5</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-500">Impact</span>
                            <span className="text-lg font-bold text-slate-200">{risk.impact || 1}/5</span>
                        </div>
                        <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-400">Inherent score</span>
                            <RiskScoreBadge score={risk.risk_score} className="text-base" />
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-400">Residual score</span>
                            {(risk.residual_likelihood || risk.residual_impact)
                              ? <RiskScoreBadge score={calculateResidualScore(risk)} className="text-base" />
                              : <span className="text-xs text-slate-500 italic">Not assessed</span>}
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-400">Appetite</span>
                            <span className={`text-sm font-medium ${
                              getAppetiteStatus(risk) === 'Above appetite' ? 'text-red-400'
                              : getAppetiteStatus(risk) === 'Within appetite' ? 'text-green-400'
                              : 'text-slate-500 italic'}`}>
                              {getAppetiteStatus(risk)}
                              {risk.target_score ? ` (target ${risk.target_score})` : ''}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-400">Next review</span>
                            {risk.next_review_date
                              ? <span className={`text-sm font-medium ${isReviewOverdue(risk) ? 'text-red-400' : 'text-slate-200'}`}>
                                  {risk.next_review_date}{isReviewOverdue(risk) ? ' · overdue' : ''}
                                </span>
                              : <span className="text-xs text-slate-500 italic">Not scheduled</span>}
                        </div>
                    </CardContent>
                </Card>
                
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="pb-3 border-b border-slate-800/50">
                        <CardTitle className="text-base text-slate-200 flex items-center gap-2"><History className="w-4 h-4 text-slate-400"/> Mitigation effect</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        {/* This card used to be a two-step "Scoring History" that
                            restated the current score as a creation event and
                            reported "Pending mitigation validation" on every
                            risk, mitigated or not. There is no scoring history
                            table to draw one from, so it shows what is actually
                            known: the distance between inherent and residual. */}
                        {(risk.residual_likelihood || risk.residual_impact) ? (
                          <>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">Inherent</span>
                              <span className="font-bold text-white">
                                {risk.risk_score} · {getRiskBand(risk.risk_score)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">Residual</span>
                              <span className="font-bold text-white">
                                {calculateResidualScore(risk)} · {getRiskBand(calculateResidualScore(risk))}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 pt-2 border-t border-slate-800">
                              Controls account for {Math.max(0, risk.risk_score - calculateResidualScore(risk))}
                              {' '}of the {risk.risk_score} points.
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-slate-400 italic">
                            No residual assessment has been recorded, so this risk is
                            carried at its inherent score of {risk.risk_score}.
                          </p>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="pb-3 border-b border-slate-800/50">
                        <CardTitle className="text-base text-slate-200">Metadata</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div>
                            <span className="block text-xs text-slate-500 mb-1">Created</span>
                            <span className="text-sm text-slate-300">{new Date(risk.created_at || Date.now()).toLocaleDateString()}</span>
                        </div>
                        <div>
                            <span className="block text-xs text-slate-500 mb-1">Last Updated</span>
                            <span className="text-sm text-slate-300">{new Date(risk.updated_at || Date.now()).toLocaleDateString()}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
      </div>
    </RiskRegisterShell>
  );
};

export default RiskDetailPage;