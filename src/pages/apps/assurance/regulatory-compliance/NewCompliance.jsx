import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function NewCompliance() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Add Compliance Obligation</h1>
      <Card className="panel-elevation">
        <CardHeader>
          <CardTitle>Obligation Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-20 text-[hsl(var(--muted-foreground))] border border-dashed border-[hsl(var(--border))] rounded-lg">
            New compliance creation form will be implemented here.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}