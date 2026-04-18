import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function RegulatorsDirectory() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Regulators & Authorities Directory</h1>
      <Card className="panel-elevation">
        <CardHeader>
          <CardTitle>Contacts and Agencies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-20 text-[hsl(var(--muted-foreground))] border border-dashed border-[hsl(var(--border))] rounded-lg">
            Directory list and management will be implemented here.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}