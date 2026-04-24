import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

export default function NewISO() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          <ChevronLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div>
          <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">Add New ISO Clause</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Register a new compliance requirement</p>
        </div>
      </div>
      
      <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
        <CardHeader>
          <CardTitle className="text-lg">Clause Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-[hsl(var(--border))] rounded-lg">
            <p className="text-[hsl(var(--muted-foreground))] mb-4">
              Detailed form view placeholder. Use the "Add Clause" button in the header to quickly add a clause.
            </p>
            <Button variant="outline" onClick={() => navigate('/dashboard/apps/assurance/iso-compliance/register')} className="bg-[hsl(var(--background))] border-[hsl(var(--border))]">
              Return to Register
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}