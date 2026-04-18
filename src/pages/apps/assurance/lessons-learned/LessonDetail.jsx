import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, Share2, Printer } from 'lucide-react';
import { StatusBadge, ReusabilityBadge, ContributorAvatar } from '@/components/lessons-learned/SharedComponents';
import { MOCK_LESSONS } from '@/utils/lessons-learned/mockData';
import { useToast } from '@/hooks/use-toast';

export default function LessonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const lesson = MOCK_LESSONS.find(l => l.id === id) || MOCK_LESSONS[0]; // fallback for demo

  const handleAction = () => {
    toast({
      description: "🚧 This feature isn't implemented yet!",
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500 pb-24">
      {/* Top Action Bar */}
      <div className="flex justify-between items-center bg-[hsl(var(--card))] p-4 rounded-xl border border-[hsl(var(--border))] shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/apps/assurance/lessons-learned/register')} className="hover:bg-[hsl(var(--secondary))]">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col">
            <span className="text-sm font-mono text-[hsl(var(--muted-foreground))]">{lesson.id}</span>
            <div className="flex items-center gap-2">
              <StatusBadge status={lesson.status} />
              <ReusabilityBadge level={lesson.reusability} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="bg-transparent border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]" onClick={handleAction}>
            <Share2 className="w-4 h-4 mr-2" /> Share
          </Button>
          <Button variant="outline" size="sm" className="bg-transparent border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]" onClick={handleAction}>
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
          <Button className="btn-primary" size="sm" onClick={handleAction}>
            <Edit className="w-4 h-4 mr-2" /> Edit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 bg-[hsl(var(--secondary))]/30">
              <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{lesson.title}</h1>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-[hsl(var(--primary))] uppercase tracking-wider mb-2">Description</h3>
                <p className="text-[hsl(var(--foreground))] leading-relaxed bg-[hsl(var(--background))] p-4 rounded-lg border border-[hsl(var(--border))]">
                  {lesson.description}
                </p>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-[hsl(var(--warning))] uppercase tracking-wider mb-2">Root Cause Analysis</h3>
                <p className="text-[hsl(var(--foreground))] leading-relaxed bg-[hsl(var(--background))] p-4 rounded-lg border border-[hsl(var(--border))]">
                  Investigation revealed that {lesson.rootCause.toLowerCase()} was the primary contributing factor.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[hsl(var(--success))] uppercase tracking-wider mb-2">Recommendation & Actions</h3>
                <ul className="list-disc list-inside text-[hsl(var(--foreground))] bg-[hsl(var(--background))] p-4 rounded-lg border border-[hsl(var(--border))] space-y-2 pl-8">
                  <li>Update standard operating procedures to include mandatory checks.</li>
                  <li>Schedule refresher training for the maintenance team.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Meta */}
        <div className="space-y-6">
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-3">
              <CardTitle className="text-base">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div>
                <span className="text-xs text-[hsl(var(--muted-foreground))] block mb-1">Project / Asset</span>
                <span className="text-sm font-medium text-[hsl(var(--foreground))]">{lesson.project}</span>
              </div>
              <div>
                <span className="text-xs text-[hsl(var(--muted-foreground))] block mb-1">Category</span>
                <span className="inline-block px-2 py-1 bg-[hsl(var(--secondary))] rounded text-[hsl(var(--foreground))] text-xs border border-[hsl(var(--border))]">
                  {lesson.category}
                </span>
              </div>
              <div>
                <span className="text-xs text-[hsl(var(--muted-foreground))] block mb-1">Discipline</span>
                <span className="text-sm text-[hsl(var(--foreground))]">{lesson.discipline}</span>
              </div>
              <div>
                <span className="text-xs text-[hsl(var(--muted-foreground))] block mb-1">Date Captured</span>
                <span className="text-sm text-[hsl(var(--foreground))]">{lesson.date}</span>
              </div>
              <div>
                <span className="text-xs text-[hsl(var(--muted-foreground))] block mb-2">Author</span>
                <ContributorAvatar name={lesson.author} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}