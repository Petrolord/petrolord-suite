import React, { useState, useEffect } from 'react';
import { PeerReviewShell } from './components/PeerReviewShell';
import { PeerReviewService } from './services/PeerReviewService';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, Download, Plus, Eye, MoreVertical, SlidersHorizontal } from 'lucide-react';
import { StageBadge, PriorityBadge } from './components/StatusBadges';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

const ReviewRegister = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [reviews, setReviews] = useState([]);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('All');

  useEffect(() => {
    PeerReviewService.getReviews().then(setReviews);
  }, []);

  const handleExport = () => {
    toast({ title: "Export Started", description: "CSV file is being generated." });
  };

  const filtered = reviews.filter(r => {
    const matchesSearch = r.title?.toLowerCase().includes(search.toLowerCase()) || r.review_code?.toLowerCase().includes(search.toLowerCase());
    const matchesStage = stageFilter === 'All' || r.stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  return (
    <PeerReviewShell>
      <div className="space-y-4 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-1 gap-2 w-full">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input 
                placeholder="Search by code or title..." 
                className="pl-9 bg-[hsl(var(--input))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-40 bg-[hsl(var(--input))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
                <SelectValue placeholder="Filter by Stage" />
              </SelectTrigger>
              <SelectContent className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
                <SelectItem value="All">All Stages</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="In Review">In Review</SelectItem>
                <SelectItem value="Verification">Verification</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]">
              <SlidersHorizontal className="w-4 h-4 mr-2" /> Columns
            </Button>
            <Button variant="outline" className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
            <Button className="btn-primary" onClick={() => navigate('/dashboard/apps/assurance/peer-review-manager/new')}>
              <Plus className="w-4 h-4 mr-2" /> New Review
            </Button>
          </div>
        </div>

        <Card className="bg-panel overflow-hidden border-[hsl(var(--border))]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap report-table">
              <thead>
                <tr>
                  <th>Review Code</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Project/Asset</th>
                  <th>Discipline</th>
                  <th>Lead Reviewer</th>
                  <th>Stage</th>
                  <th>Priority</th>
                  <th>Due Date</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="10" className="text-center p-12 text-[hsl(var(--muted-foreground))]">No peer reviews found matching criteria.</td></tr>
                ) : (
                  filtered.map(r => (
                    <tr key={r.id} className="cursor-pointer hover:bg-[hsl(var(--secondary))] transition-colors" onClick={() => navigate(`/dashboard/apps/assurance/peer-review-manager/${r.id}`)}>
                      <td className="font-mono text-[hsl(var(--primary))] font-medium">{r.review_code}</td>
                      <td className="font-medium text-[hsl(var(--foreground))] max-w-[200px] truncate" title={r.title}>{r.title}</td>
                      <td>{r.review_type}</td>
                      <td>{r.project_asset}</td>
                      <td className="text-[hsl(var(--muted-foreground))]">{r.discipline}</td>
                      <td className="text-[hsl(var(--muted-foreground))]">{r.lead_reviewer}</td>
                      <td><StageBadge stage={r.stage} /></td>
                      <td><PriorityBadge priority={r.priority} /></td>
                      <td className="text-[hsl(var(--muted-foreground))]">{r.due_date || '-'}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--border))]" onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/apps/assurance/peer-review-manager/${r.id}`); }}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--border))]" onClick={(e) => { e.stopPropagation(); toast({ description: "More actions modal" }); }}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] flex justify-between items-center">
             <span>Showing {filtered.length} of {reviews.length} reviews</span>
             {/* Pagination stub */}
             <div className="flex gap-1">
               <Button variant="outline" size="sm" disabled className="bg-transparent border-[hsl(var(--border))]">Previous</Button>
               <Button variant="outline" size="sm" disabled className="bg-transparent border-[hsl(var(--border))]">Next</Button>
             </div>
          </div>
        </Card>
      </div>
    </PeerReviewShell>
  );
};

export default ReviewRegister;