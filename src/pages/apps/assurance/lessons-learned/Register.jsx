import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Filter, Download, Plus, MoreVertical } from 'lucide-react';
import { StatusBadge, ReusabilityBadge, ContributorAvatar } from '@/components/lessons-learned/SharedComponents';
import { MOCK_LESSONS } from '@/utils/lessons-learned/mockData';
import { useToast } from '@/hooks/use-toast';

export default function Register() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');

  const filteredLessons = MOCK_LESSONS.filter(l => 
    l.title.toLowerCase().includes(search.toLowerCase()) || 
    l.id.toLowerCase().includes(search.toLowerCase()) ||
    l.project.toLowerCase().includes(search.toLowerCase())
  );

  const handleAction = () => {
    toast({
      title: "Action triggered",
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
    });
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      {/* Toolbar */}
      <div className="p-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] flex flex-col sm:flex-row gap-4 justify-between items-center sticky top-0 z-10">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          <Input 
            placeholder="Search lessons, IDs, projects..." 
            className="pl-9 bg-[hsl(var(--background))] border-[hsl(var(--border))] focus-visible:ring-[hsl(var(--primary))]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" className="bg-[hsl(var(--background))] border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]" onClick={handleAction}>
            <Filter className="w-4 h-4 mr-2" /> Filters
          </Button>
          <Button variant="outline" className="bg-[hsl(var(--background))] border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]" onClick={handleAction}>
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
          <Button className="btn-primary" onClick={handleAction}>
            <Plus className="w-4 h-4 mr-2" /> Capture Lesson
          </Button>
        </div>
      </div>

      {/* Data Grid */}
      <div className="p-6 flex-1 overflow-auto bg-[hsl(var(--background))] pb-24">
        <div className="data-grid-container shadow-sm">
          <table className="data-grid-table">
            <thead>
              <tr>
                <th className="data-grid-th w-10 text-center"><input type="checkbox" className="rounded border-[hsl(var(--border))] bg-transparent" /></th>
                <th className="data-grid-th">Lesson ID</th>
                <th className="data-grid-th">Title & Description</th>
                <th className="data-grid-th">Project / Area</th>
                <th className="data-grid-th">Category</th>
                <th className="data-grid-th">Status</th>
                <th className="data-grid-th">Reusability</th>
                <th className="data-grid-th">Author</th>
                <th className="data-grid-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLessons.map((lesson) => (
                <tr key={lesson.id} className="data-grid-tr group border-b border-[hsl(var(--border))] last:border-0">
                  <td className="data-grid-td text-center">
                    <input type="checkbox" className="rounded border-[hsl(var(--border))] bg-transparent" />
                  </td>
                  <td className="data-grid-td font-medium text-[hsl(var(--primary))] cursor-pointer hover:underline">{lesson.id}</td>
                  <td className="data-grid-td max-w-md cursor-pointer">
                    <p className="font-semibold text-[hsl(var(--foreground))] truncate">{lesson.title}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">{lesson.description}</p>
                  </td>
                  <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{lesson.project}</td>
                  <td className="data-grid-td">
                    <span className="px-2 py-1 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] text-xs border border-[hsl(var(--border))]">
                      {lesson.category}
                    </span>
                  </td>
                  <td className="data-grid-td"><StatusBadge status={lesson.status} /></td>
                  <td className="data-grid-td"><ReusabilityBadge level={lesson.reusability} /></td>
                  <td className="data-grid-td"><ContributorAvatar name={lesson.author} /></td>
                  <td className="data-grid-td text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" onClick={handleAction}>
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredLessons.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-[hsl(var(--muted-foreground))] bg-[hsl(var(--card))]">
                    No lessons found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}