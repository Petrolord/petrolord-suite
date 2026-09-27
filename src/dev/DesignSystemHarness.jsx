// Dev-only specimen page for the Petrolord design system (/dev/design-system).
// Shows every shared shell piece inside an opted-in <ThemedApp> scope, with
// the chart standard and a dark canvas, next to a legacy card for comparison.
// Absent from production builds (the route sits behind import.meta.env.DEV).
import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Gauge } from 'lucide-react';
import { ThemedApp } from '@/design/ThemeProvider';
import { AppHeader, PageContainer, PageSection, DisplayHeading } from '@/components/ui/app-shell';
import { StatTile } from '@/components/ui/stat-tile';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY } from '@/utils/chartTheme';

const RATES = Array.from({ length: 24 }, (_, i) => ({ month: i + 1, rate: Math.round(1200 * Math.exp(-0.06 * i)) }));

function Specimen() {
  const [model, setModel] = useState('hyperbolic');
  return (
    <>
      <AppHeader
        backTo="/dashboard/reservoir"
        icon={Gauge}
        eyebrow="Reservoir"
        title="Design system specimen"
        subtitle="Pilot shell pieces on the Petrolord tokens"
        actions={<Button variant="outline" size="sm">Export</Button>}
      />
      <PageContainer className="space-y-8">
        <DisplayHeading>Decline forecast, Well A-12</DisplayHeading>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Initial rate" value="1,200" unit="bbl/d" />
          <StatTile label="EUR" value="2.41" unit="MMbbl" hint="P50 of 1,000 runs" />
          <StatTile label="Fit quality" value="0.97" unit="R²" status="success" hint="Good fit" />
          <StatTile label="Data gaps" value="3" unit="months" status="warning" hint="Check shut-ins" />
        </div>

        <PageSection title="Inputs and results" description="Card, tabs, form fields and table on the theme roles.">
          <Card>
            <CardHeader>
              <CardTitle>Model</CardTitle>
              <CardDescription>Arps decline parameters</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="inputs">
                <TabsList>
                  <TabsTrigger value="inputs">Inputs</TabsTrigger>
                  <TabsTrigger value="table">Table</TabsTrigger>
                </TabsList>
                <TabsContent value="inputs" className="grid gap-4 pt-2 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="qi">Initial rate (bbl/d)</Label>
                    <Input id="qi" defaultValue="1200" />
                  </div>
                  <div>
                    <Label htmlFor="di">Decline (1/yr)</Label>
                    <Input id="di" defaultValue="0.72" />
                  </div>
                  <div>
                    <Label>Model</Label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exponential">Exponential</SelectItem>
                        <SelectItem value="hyperbolic">Hyperbolic</SelectItem>
                        <SelectItem value="harmonic">Harmonic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:col-span-3">
                    <Button>Run forecast</Button>
                    <Button variant="secondary">Reset</Button>
                    <Button variant="accent">Save case</Button>
                    <Button variant="ghost">Cancel</Button>
                    <Badge variant="success">Validated</Badge>
                    <Badge variant="warning">Draft</Badge>
                    <Badge variant="danger">Failed</Badge>
                    <Badge variant="info">Shared</Badge>
                  </div>
                </TabsContent>
                <TabsContent value="table">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Month</TableHead><TableHead className="text-right">Rate (bbl/d)</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {RATES.slice(0, 6).map((r) => (
                        <TableRow key={r.month}>
                          <TableCell>{r.month}</TableCell>
                          <TableCell className="text-right font-pl-mono tabular-nums">{r.rate.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </PageSection>

        <div className="grid gap-6 lg:grid-cols-2">
          <PageSection title="Chart standard" description="White chart surface in both themes.">
            <Card className="overflow-hidden">
              <ChartFrame height={220}>
                <LineChart data={RATES} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="month" tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }} />
                  <YAxis tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="rate" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartFrame>
            </Card>
          </PageSection>
          <PageSection title="Dark canvas" description="data-canvas=&quot;dark&quot; keeps a seismic or 3D view dark.">
            <div data-canvas="dark" className="rounded-lg border border-pl-border p-4">
              <p className="mb-2 text-xs text-pl-muted">Inline 1042, amplitude</p>
              <div
                className="h-[220px] rounded-md"
                style={{ background: 'repeating-linear-gradient(180deg, #111 0px, #555 3px, #eee 5px, #555 7px, #111 10px)' }}
                aria-label="Seismic section placeholder"
                role="img"
              />
            </div>
          </PageSection>
        </div>
      </PageContainer>
    </>
  );
}

export default function DesignSystemHarness() {
  return (
    <div className="min-h-screen">
      <ThemedApp className="min-h-screen">
        <Specimen />
      </ThemedApp>
      <div className="bg-slate-950 p-6">
        <p className="mb-3 text-sm text-slate-400">Legacy console, outside the scope, unchanged:</p>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Legacy card</CardTitle>
            <CardDescription>Still slate on the dark console</CardDescription>
          </CardHeader>
          <CardContent><Button>Legacy button</Button></CardContent>
        </Card>
      </div>
    </div>
  );
}
