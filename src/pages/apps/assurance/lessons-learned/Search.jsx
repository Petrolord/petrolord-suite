import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search as SearchIcon, SlidersHorizontal, BookOpen } from 'lucide-react';
import { EmptyState, StatusBadge, ReusabilityBadge } from '@/components/lessons-learned/SharedComponents';
import { MOCK_LESSONS } from '@/utils/lessons-learned/mockData';
import { useToast } from '@/hooks/use-toast';

export default function Search() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = (e) => {
    e.preventDefault();
    if(query.trim()) {
      setHasSearched(true);
    } else {
      setHasSearched(false);
    }
  };

  const results = MOCK_LESSONS.filter(l => 
    l.title.toLowerCase().includes(query.toLowerCase()) || 
    l.description.toLowerCase().includes(query.toLowerCase()) ||
    l.rootCause.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500 pb-24">
      
      <div className="text-center space-y-4 py-8">
        <div className="inline-flex p-3 rounded-2xl bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] mb-2">
          <BookOpen className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Search Knowledge Base</h1>
        <p className="text-[hsl(var(--muted-foreground))]">Find insights, root causes, and optimizations across all projects.</p>
        
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto mt-6 relative flex items-center">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[hsl(var(--muted-foreground))]" />
            <Input 
              placeholder="Search by keyword, tag, or ID..." 
              className="pl-12 pr-4 py-6 text-lg rounded-l-xl rounded-r-none bg-[hsl(var(--card))] border-[hsl(var(--border))] focus-visible:ring-[hsl(var(--primary))] shadow-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button type="submit" className="py-6 px-8 rounded-l-none rounded-r-xl btn-primary text-lg shadow-sm">
            Search
          </Button>
        </form>
        
        <div className="flex items-center justify-center gap-4 text-sm mt-4">
          <Button variant="ghost" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" onClick={() => toast({description: "Filters opened"})}>
            <SlidersHorizontal className="w-4 h-4 mr-2" /> Advanced Filters
          </Button>
          <div className="h-4 w-px bg-[hsl(var(--border))]"></div>
          <span className="text-[hsl(var(--muted-foreground))]">Popular: <span className="text-[hsl(var(--primary))] cursor-pointer hover:underline">pump failure</span>, <span className="text-[hsl(var(--primary))] cursor-pointer hover:underline">drilling optimization</span></span>
        </div>
      </div>

      {hasSearched && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-4">
            {results.length} Results Found
          </h3>
          
          {results.length > 0 ? (
            results.map(lesson => (
              <Card key={lesson.id} className="panel-elevation hover:border-[hsl(var(--primary))]/50 transition-colors cursor-pointer" onClick={() => toast({description: "Opening lesson details..."})}>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-xs font-mono text-[hsl(var(--muted-foreground))]">{lesson.id}</span>
                        <StatusBadge status={lesson.status} />
                        <ReusabilityBadge level={lesson.reusability} />
                      </div>
                      <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
                        {lesson.title}
                      </h3>
                    </div>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">{lesson.date}</span>
                  </div>
                  
                  <p className="text-sm text-[hsl(var(--muted-foreground))] line-clamp-2 mb-4">
                    {lesson.description}
                  </p>
                  
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="px-2 py-1 bg-[hsl(var(--secondary))] rounded text-[hsl(var(--foreground))] border border-[hsl(var(--border))]">
                      Project: {lesson.project}
                    </span>
                    <span className="px-2 py-1 bg-[hsl(var(--secondary))] rounded text-[hsl(var(--foreground))] border border-[hsl(var(--border))]">
                      Category: {lesson.category}
                    </span>
                    <span className="px-2 py-1 bg-[hsl(var(--secondary))] rounded text-[hsl(var(--foreground))] border border-[hsl(var(--border))]">
                      Root Cause: {lesson.rootCause}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
             <EmptyState 
                icon={<SearchIcon className="w-12 h-12" />}
                title="No lessons found"
                description="Try adjusting your search terms or filters to find what you're looking for."
             />
          )}
        </div>
      )}
    </div>
  );
}