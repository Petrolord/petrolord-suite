import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PeerReviewShell } from './components/PeerReviewShell';
import { PeerReviewService } from './services/PeerReviewService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StageBadge, PriorityBadge, DecisionBadge } from './components/StatusBadges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FileText, MessageSquare, History, Edit, Plus, UploadCloud, CheckCircle, Clock, Target, Users, Download, ShieldCheck, FileSignature, ArrowRight } from 'lucide-react';

const ReviewDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [review, setReview] = useState(null);
  const [comments, setComments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);

  // New Comment Form State
  const [newComment, setNewComment] = useState({ text: '', severity: 'Minor', discipline: '' });

  useEffect(() => {
    async function load() {
      const [rData, cData, aData] = await Promise.all([
        PeerReviewService.getReviewById(id),
        PeerReviewService.getComments(id),
        PeerReviewService.getAuditTrail(id)
      ]);
      setReview(rData);
      setComments(cData);
      setAudit(aData);
      setLoading(false);
    }
    load();
  }, [id]);

  const handleAction = () => {
    toast({ description: "🚧 Action recorded. Backend process triggered." });
  };

  const submitComment = async () => {
    if(!newComment.text) {
        toast({ title: "Error", description: "Comment text is required.", variant: "destructive"});
        return;
    }
    const added = await PeerReviewService.addComment(id, {
        comment_text: newComment.text,
        severity: newComment.severity,
        discipline: newComment.discipline || review.discipline,
        author: 'Current User' // Stub
    });
    setComments([added, ...comments]);
    setIsCommentModalOpen(false);
    setNewComment({ text: '', severity: 'Minor', discipline: '' });
    toast({ title: "Comment Added", description: "Your comment has been successfully registered."});
    
    // Refresh Audit
    const aData = await PeerReviewService.getAuditTrail(id);
    setAudit(aData);
  };

  const renderTabTrigger = (value, icon, label, count = null) => (
      <TabsTrigger value={value} className="relative rounded-none px-2 py-3 text-sm font-medium text-[hsl(var(--muted-foreground))] data-[state=active]:text-[hsl(var(--primary))] data-[state=active]:bg-transparent data-[state=active]:shadow-none after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-transparent data-[state=active]:after:bg-[hsl(var(--primary))] whitespace-nowrap">
        {icon} <span className="ml-2">{label}</span>
        {count !== null && <span className="ml-1.5 bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] px-1.5 py-0.5 rounded-full text-xs">{count}</span>}
      </TabsTrigger>
  );

  if (loading) return <PeerReviewShell><div className="flex h-64 items-center justify-center text-[hsl(var(--muted-foreground))]">Loading review details...</div></PeerReviewShell>;
  if (!review) return <PeerReviewShell><div className="flex h-64 items-center justify-center text-[hsl(var(--destructive))]">Review not found</div></PeerReviewShell>;

  return (
    <PeerReviewShell>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-[1400px] mx-auto pb-12">
        {/* Sticky Action Bar & Header */}
        <div className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] pt-2 pb-4 mb-6">
          <div className="flex flex-col md:flex-row justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-mono text-xs font-bold text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 px-2 py-0.5 rounded border border-[hsl(var(--primary))]/20">{review.review_code}</span>
                <StageBadge stage={review.stage} />
                <PriorityBadge priority={review.priority} />
                <DecisionBadge decision={review.decision} />
              </div>
              <h2 className="text-2xl font-bold text-[hsl(var(--foreground))] tracking-tight">{review.title}</h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                 <span>{review.project_asset}</span> • <span>{review.department}</span> • <span>Due: {review.due_date}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <Button variant="outline" className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={handleAction}>
                <Edit className="w-4 h-4 mr-2"/> Edit
              </Button>
              <Button variant="outline" className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={handleAction}>
                <ShieldCheck className="w-4 h-4 mr-2"/> Sign-off
              </Button>
              <Button className="btn-primary" onClick={() => setIsCommentModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2"/> Add Comment
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <div className="overflow-x-auto no-scrollbar border-b border-[hsl(var(--border))] mb-6">
              <TabsList className="bg-transparent w-max justify-start p-0 h-auto gap-4 flex">
                {renderTabTrigger("overview", <FileText className="w-4 h-4"/>, "Overview")}
                {renderTabTrigger("scope", <Target className="w-4 h-4"/>, "Scope")}
                {renderTabTrigger("team", <Users className="w-4 h-4"/>, "Team", review.team?.length)}
                {renderTabTrigger("deliverables", <UploadCloud className="w-4 h-4"/>, "Deliverables", review.deliverables?.length)}
                {renderTabTrigger("comments", <MessageSquare className="w-4 h-4"/>, "Comment Register", comments.length)}
                {renderTabTrigger("notes", <FileSignature className="w-4 h-4"/>, "Meetings & Notes")}
                {renderTabTrigger("audit", <History className="w-4 h-4"/>, "Audit Trail")}
              </TabsList>
          </div>

          {/* Tab Contents */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                  <Card className="bg-panel">
                    <CardHeader><CardTitle className="text-[hsl(var(--foreground))]">Review Summary</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-4 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg">
                         <div>
                           <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Coordinator</p>
                           <p className="text-sm font-medium text-[hsl(var(--foreground))]">{review.coordinator || 'Unassigned'}</p>
                         </div>
                         <div>
                           <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Lead Reviewer</p>
                           <p className="text-sm font-medium text-[hsl(var(--foreground))]">{review.lead_reviewer || 'Unassigned'}</p>
                         </div>
                         <div>
                           <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Author</p>
                           <p className="text-sm font-medium text-[hsl(var(--foreground))]">{review.author || 'Unassigned'}</p>
                         </div>
                         <div>
                           <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Discipline</p>
                           <p className="text-sm font-medium text-[hsl(var(--foreground))]">{review.discipline || 'General'}</p>
                         </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-2">Scope Summary</h4>
                        <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{review.scope_description}</p>
                      </div>
                    </CardContent>
                  </Card>
              </div>
              <div className="space-y-6">
                 <Card className="bg-panel h-full">
                    <CardHeader><CardTitle className="text-[hsl(var(--foreground))]">Status Progression</CardTitle></CardHeader>
                    <CardContent>
                       <div className="relative pl-4 space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-[hsl(var(--border))] before:to-transparent">
                          {['Draft', 'In Review', 'Verification', 'Closed'].map((s, i) => {
                             const isActive = review.stage === s;
                             const isPast = ['Draft', 'In Review', 'Verification', 'Closed'].indexOf(review.stage) > i;
                             return (
                               <div key={s} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                 <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 bg-[hsl(var(--card))] z-10 ${isActive ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]' : isPast ? 'border-[hsl(var(--success))] text-[hsl(var(--success))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'}`}>
                                    {isPast ? <CheckCircle className="w-3 h-3"/> : <div className="w-2 h-2 rounded-full bg-current"/>}
                                 </div>
                                 <div className={`ml-4 text-sm font-medium ${isActive ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{s}</div>
                               </div>
                             );
                          })}
                       </div>
                    </CardContent>
                 </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scope">
             <Card className="bg-panel min-h-[400px]">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-[hsl(var(--foreground))]">Detailed Scope & Objectives</CardTitle>
                  <Button variant="outline" size="sm" onClick={handleAction} className="bg-[hsl(var(--secondary))] border-[hsl(var(--border))]"><Edit className="w-3 h-3 mr-2"/>Edit Scope</Button>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-invert max-w-none text-[hsl(var(--muted-foreground))]">
                    <p>{review.scope_description}</p>
                    <p className="mt-4 italic">No additional boundaries defined.</p>
                  </div>
                </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="team">
             <Card className="bg-panel">
               <CardHeader className="flex flex-row items-center justify-between">
                 <CardTitle className="text-[hsl(var(--foreground))]">Review Team Matrix</CardTitle>
                 <Button variant="outline" size="sm" onClick={handleAction} className="bg-[hsl(var(--secondary))] border-[hsl(var(--border))]"><Plus className="w-3 h-3 mr-2"/>Assign Member</Button>
               </CardHeader>
               <CardContent>
                  <table className="w-full text-left text-sm report-table">
                    <thead>
                      <tr><th>Role</th><th>Name</th><th>Department</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {review.team?.length > 0 ? review.team.map((t, i) => (
                        <tr key={i}>
                          <td className="font-medium text-[hsl(var(--foreground))]">{t.role}</td>
                          <td>{t.name}</td>
                          <td className="text-[hsl(var(--muted-foreground))]">Assurance</td>
                          <td><span className="text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border border-[hsl(var(--success))]/20">Active</span></td>
                        </tr>
                      )) : <tr><td colSpan="4" className="p-8 text-center text-[hsl(var(--muted-foreground))]">No team members assigned.</td></tr>}
                    </tbody>
                  </table>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="deliverables">
             <Card className="bg-panel">
               <CardHeader className="flex flex-row items-center justify-between">
                 <CardTitle className="text-[hsl(var(--foreground))]">Deliverables & Documents</CardTitle>
                 <Button variant="outline" size="sm" onClick={handleAction} className="bg-[hsl(var(--secondary))] border-[hsl(var(--border))]"><UploadCloud className="w-3 h-3 mr-2"/>Upload File</Button>
               </CardHeader>
               <CardContent>
                  <table className="w-full text-left text-sm report-table">
                    <thead>
                      <tr><th>File Name</th><th>Version</th><th>Date</th><th>Status</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {review.deliverables?.length > 0 ? review.deliverables.map(d => (
                        <tr key={d.id}>
                          <td className="font-medium text-[hsl(var(--primary))] flex items-center gap-2"><FileText className="w-4 h-4"/>{d.name}</td>
                          <td>Rev {d.version}</td>
                          <td className="text-[hsl(var(--muted-foreground))]">{d.date}</td>
                          <td><span className="text-xs px-2 py-0.5 rounded border bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">{d.status}</span></td>
                          <td><Button variant="ghost" size="sm" className="h-7 text-[hsl(var(--primary))] hover:text-[hsl(var(--primary-hover))] hover:bg-[hsl(var(--primary))]/10" onClick={handleAction}><Download className="w-3 h-3 mr-1"/>Download</Button></td>
                        </tr>
                      )) : <tr><td colSpan="5" className="p-8 text-center text-[hsl(var(--muted-foreground))]">No deliverables uploaded.</td></tr>}
                    </tbody>
                  </table>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="comments">
             <Card className="bg-panel border-[hsl(var(--border))]">
                <CardHeader className="border-b border-[hsl(var(--border))] pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-[hsl(var(--foreground))] text-base">Comment Register</CardTitle>
                  <div className="flex gap-2">
                     <Button variant="outline" size="sm" className="bg-[hsl(var(--card))] border-[hsl(var(--border))] h-8">Filter</Button>
                     <Button className="btn-primary h-8" onClick={() => setIsCommentModalOpen(true)}><Plus className="w-3 h-3 mr-1"/> New Comment</Button>
                  </div>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm report-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Severity</th>
                        <th>Status</th>
                        <th>Author</th>
                        <th>Comment Snippet</th>
                        <th>Discipline</th>
                        <th>Date</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comments.map(c => (
                        <tr key={c.id} className="hover:bg-[hsl(var(--secondary))] transition-colors group">
                          <td className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{c.id.split('-')[1]}</td>
                          <td><PriorityBadge priority={c.severity} /></td>
                          <td><StageBadge stage={c.status} /></td>
                          <td className="text-[hsl(var(--foreground))] font-medium">{c.author}</td>
                          <td className="max-w-[300px] truncate text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))] transition-colors" title={c.comment_text}>{c.comment_text}</td>
                          <td className="text-[hsl(var(--muted-foreground))]">{c.discipline}</td>
                          <td className="text-[hsl(var(--muted-foreground))]">{new Date(c.created_at).toLocaleDateString()}</td>
                          <td className="text-right">
                             <Button variant="outline" size="sm" className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--primary))]/10 hover:text-[hsl(var(--primary))] h-7" onClick={handleAction}>View/Respond</Button>
                          </td>
                        </tr>
                      ))}
                      {comments.length === 0 && <tr><td colSpan="8" className="p-12 text-center text-[hsl(var(--muted-foreground))]">No comments recorded yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
             </Card>
          </TabsContent>

          <TabsContent value="notes">
             <Card className="bg-panel min-h-[300px]">
               <CardHeader className="flex flex-row items-center justify-between">
                 <CardTitle className="text-[hsl(var(--foreground))]">Meeting Minutes & Notes</CardTitle>
                 <Button variant="outline" size="sm" onClick={handleAction} className="bg-[hsl(var(--secondary))] border-[hsl(var(--border))]"><Plus className="w-3 h-3 mr-2"/>Add Note</Button>
               </CardHeader>
               <CardContent>
                 {review.meeting_notes ? (
                    <div className="p-4 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--muted-foreground))]">
                      {review.meeting_notes}
                    </div>
                 ) : (
                    <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">No meeting notes recorded.</div>
                 )}
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="audit">
             <Card className="bg-panel">
               <CardHeader>
                 <CardTitle className="text-[hsl(var(--foreground))]">Comprehensive Audit Trail</CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="relative border-l border-[hsl(var(--border))] ml-3 space-y-6 pb-4">
                    {audit.map(a => (
                      <div key={a.id} className="relative pl-6">
                         <div className="absolute w-3 h-3 bg-[hsl(var(--card))] border-2 border-[hsl(var(--primary))] rounded-full -left-[6.5px] top-1.5"></div>
                         <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-1">
                            <span className="font-semibold text-sm text-[hsl(var(--foreground))]">{a.action}</span>
                            <span className="text-xs font-mono text-[hsl(var(--muted-foreground))]">{new Date(a.timestamp).toLocaleString()}</span>
                         </div>
                         <p className="text-sm text-[hsl(var(--muted-foreground))] mb-1">{a.details}</p>
                         <span className="text-xs font-medium px-2 py-0.5 bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] rounded border border-[hsl(var(--border))]">By {a.actor}</span>
                      </div>
                    ))}
                 </div>
               </CardContent>
             </Card>
          </TabsContent>
          
        </Tabs>
      </div>

      {/* New Comment Modal */}
      <Dialog open={isCommentModalOpen} onOpenChange={setIsCommentModalOpen}>
        <DialogContent className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] max-w-2xl">
          <DialogHeader>
            <DialogTitle>Register New Comment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select value={newComment.severity} onValueChange={v => setNewComment({...newComment, severity: v})}>
                    <SelectTrigger className="bg-[hsl(var(--input))] border-[hsl(var(--border))]"><SelectValue/></SelectTrigger>
                    <SelectContent className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
                       <SelectItem value="Minor">Minor / Editorial</SelectItem>
                       <SelectItem value="Major">Major</SelectItem>
                       <SelectItem value="Critical">Critical (Showstopper)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Discipline</Label>
                  <Input placeholder="e.g. Facilities" className="bg-[hsl(var(--input))] border-[hsl(var(--border))]" value={newComment.discipline} onChange={e => setNewComment({...newComment, discipline: e.target.value})}/>
                </div>
             </div>
             <div className="space-y-2">
                <Label>Comment Description <span className="text-[hsl(var(--destructive))]">*</span></Label>
                <Textarea placeholder="Detail the finding, reference document section, and suggest recommendation..." className="bg-[hsl(var(--input))] border-[hsl(var(--border))] min-h-[120px]" value={newComment.text} onChange={e => setNewComment({...newComment, text: e.target.value})}/>
             </div>
             <div className="p-4 border border-dashed border-[hsl(var(--border))] rounded bg-[hsl(var(--input))]/50 text-center cursor-pointer hover:bg-[hsl(var(--input))] transition-colors" onClick={handleAction}>
                <UploadCloud className="w-5 h-5 mx-auto mb-1 text-[hsl(var(--muted-foreground))]"/>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">Attach supporting snippet/image (optional)</span>
             </div>
          </div>
          <DialogFooter>
             <Button variant="outline" className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]" onClick={() => setIsCommentModalOpen(false)}>Cancel</Button>
             <Button className="btn-primary" onClick={submitComment}>Submit Comment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PeerReviewShell>
  );
};

export default ReviewDetail;