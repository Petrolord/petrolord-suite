import React from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ComplianceDetail() {
  const { id } = useParams();
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Obligation Detail: {id}</h1>
      <Card className="panel-elevation">
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-20 text-[hsl(var(--muted-foreground))] border border-dashed border-[hsl(var(--border))] rounded-lg">
            Compliance detail view will be implemented here.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}