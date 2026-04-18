import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, FileCheck } from 'lucide-react';

export default function ISODetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            <ChevronLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">{id}</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Clause Details & Evidence</p>
          </div>
        </div>
        <Button className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
          Edit Record
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
            <CardHeader>
              <CardTitle className="text-lg">Requirements</CardTitle>
            </CardHeader>
            <CardContent>
               <div className="p-6 text-center border-2 border-dashed border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--secondary))]/20">
                <FileCheck className="w-8 h-8 text-[hsl(var(--muted-foreground))] mx-auto mb-2" />
                <p className="text-[hsl(var(--muted-foreground))]">Requirement details for {id} will appear here.</p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="space-y-6">
          <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
            <CardHeader>
              <CardTitle className="text-lg">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-[hsl(var(--border))]">
                <span className="text-[hsl(var(--muted-foreground))]">Compliance</span>
                <span className="px-2 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-500 font-medium">Compliant</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[hsl(var(--border))]">
                <span className="text-[hsl(var(--muted-foreground))]">Evidence</span>
                <span className="text-[hsl(var(--foreground))] font-medium">Current</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-[hsl(var(--muted-foreground))]">Last Audit</span>
                <span className="text-[hsl(var(--foreground))] font-medium">Oct 12, 2023</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}