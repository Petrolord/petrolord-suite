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
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuLabel,
  ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
} from '@/components/ui/context-menu';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { NativeSelect, CompactInput } from '@/components/ui/native-select';
import { ChartPanel } from '@/components/ui/chart-panel';
import { NumericTable, NumTh, NumRow, RowLabel, NumCell } from '@/components/ui/numeric-table';
import { toast } from '@/components/ui/use-toast';
import { CHART_COLORS, CHART_TYPOGRAPHY } from '@/utils/chartTheme';

const RATES = Array.from({ length: 24 }, (_, i) => ({ month: i + 1, rate: Math.round(1200 * Math.exp(-0.06 * i)) }));

const CASH = [
  { label: 'Revenue', v: [0, 42.1, 55.3, 48.9] },
  { label: 'Capex', v: [-120.0, -35.5, 0, 0] },
  { label: 'Opex', v: [0, -8.2, -9.1, -9.4] },
];
const NET = [0, 1, 2, 3].map((i) => CASH.reduce((a, r) => a + r.v[i], 0));

function Controls() {
  const [view, setView] = useState('rate');
  const [on, setOn] = useState(true);
  return (
    <PageSection title="Controls" description="Adapted in the follow-up: every piece switches inside a scope and keeps its legacy classes outside one.">
      <Card>
        <CardContent className="grid gap-6 pt-6 md:grid-cols-2">
          <div className="space-y-4">
            <SegmentedControl label="Forecast view" value={view} onValueChange={setView} options={[{ value: 'rate', label: 'Rate' }, { value: 'cum', label: 'Cumulative' }, { value: 'ratio', label: 'Water cut' }]} />
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm"><Checkbox defaultChecked /> Include shut-ins</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox /> Clamp b</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={on} onCheckedChange={setOn} /> Auto-fit</label>
            </div>
            <Slider defaultValue={[40]} max={100} step={1} aria-label="Confidence" />
            <Progress value={62} aria-label="Fit progress" />
            <div className="flex flex-wrap gap-2">
              <Badge variant="neutral">Draft</Badge>
              <Badge variant="selected">Oil</Badge>
              <Badge variant="success">Approved</Badge>
              <Badge variant="warning">Stale</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <NativeSelect aria-label="Units" defaultValue="field"><option value="field">Field units</option><option value="si">SI</option></NativeSelect>
              <CompactInput aria-label="Cell" defaultValue="1,250" className="text-right" />
            </div>
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Sheet>
                <SheetTrigger asChild><Button variant="outline" size="sm">Open sheet</Button></SheetTrigger>
                <SheetContent><SheetHeader><SheetTitle>Well A-12</SheetTitle><SheetDescription>Side panel on the theme roles.</SheetDescription></SheetHeader></SheetContent>
              </Sheet>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="outline" size="sm">Delete case</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Delete this case?</AlertDialogTitle><AlertDialogDescription>Runs and results go with it.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel><AlertDialogAction>Delete</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="outline" size="sm" onClick={() => toast({ title: 'Forecast saved', description: 'Case A-12 now has 3 runs.' })}>Show toast</Button>
            </div>
            <ContextMenu>
              <ContextMenuTrigger className="flex h-16 items-center justify-center rounded-md border border-dashed border-pl-border-strong text-sm text-pl-muted">Right click here</ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuLabel>Horizon</ContextMenuLabel>
                <ContextMenuItem>Rename<ContextMenuShortcut>F2</ContextMenuShortcut></ContextMenuItem>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>Open in</ContextMenuSubTrigger>
                  <ContextMenuSubContent><ContextMenuItem>Mapping</ContextMenuItem></ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem>Delete</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
          <div className="space-y-4">
            <Alert variant="warning"><AlertTitle>Stale PVT</AlertTitle><AlertDescription>The PVT table is older than the latest test.</AlertDescription></Alert>
            <Alert><AlertTitle>Note</AlertTitle><AlertDescription>Default alerts sit on the surface.</AlertDescription></Alert>
            <Accordion type="single" collapsible defaultValue="a">
              <AccordionItem value="a"><AccordionTrigger>What is b?</AccordionTrigger><AccordionContent>The Arps decline exponent.</AccordionContent></AccordionItem>
              <AccordionItem value="b"><AccordionTrigger>When to clamp?</AccordionTrigger><AccordionContent>When the fit wanders above 1.</AccordionContent></AccordionItem>
            </Accordion>
            <div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
          </div>
        </CardContent>
      </Card>
      <NumericTable title="Year-by-year (USD MM)">
        <thead><tr><NumTh sticky>Metric</NumTh>{[2027, 2028, 2029, 2030].map((y) => <NumTh key={y} numeric>{y}</NumTh>)}</tr></thead>
        <tbody>
          {CASH.map((r) => (
            <NumRow key={r.label}><RowLabel>{r.label}</RowLabel>{r.v.map((v, i) => <NumCell key={i} value={v}>{v.toFixed(1)}</NumCell>)}</NumRow>
          ))}
          <NumRow><RowLabel total>Net cash flow</RowLabel>{NET.map((v, i) => <NumCell key={i} value={v} total>{v.toFixed(1)}</NumCell>)}</NumRow>
        </tbody>
      </NumericTable>
    </PageSection>
  );
}

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
        actions={(
          <>
            <Button variant="outline" size="sm">Export</Button>
            <Button variant="outline" size="sm">Share</Button>
            <Button size="sm">Run forecast</Button>
          </>
        )}
      />
      <PageContainer className="space-y-8">
        <DisplayHeading>Decline forecast, Well A-12</DisplayHeading>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        <Controls />

        <div className="grid gap-6 lg:grid-cols-2">
          <PageSection title="Chart standard" description="ChartPanel: a titled white chart card in both themes.">
            <ChartPanel title="Oil rate" subtitle="bbl/d, monthly">
              <ChartFrame height={220}>
                <LineChart data={RATES} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="month" tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }} />
                  <YAxis tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="rate" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartFrame>
            </ChartPanel>
          </PageSection>
          <PageSection title="Dark canvas" description="data-canvas=&quot;dark&quot; keeps a seismic or 3D view dark.">
            <div data-canvas="dark" className="rounded-pl-canvas border border-pl-border p-4">
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
