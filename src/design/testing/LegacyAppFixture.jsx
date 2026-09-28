// TEST-ONLY. A stand-in for "an app that has not migrated" in the opt-in
// proofs (src/design/__tests__/optInScope.test.jsx and
// src/components/hubs/__tests__/hubScope.test.jsx). Until Wave 0A the proof
// mounted a real app (Voidage Replacement Monitor, then Waterflood Design
// Studio) and had to move each time that app migrated; this fixture never
// migrates, so no rollout batch has to touch the proof again.
//
// It is built the way the unmigrated apps are: the shared Studio kit frame
// and header, the shared ui pieces (including the ones adapted in Wave 0A:
// Avatar, RadioGroup, the FullPrecision toggle and note) and the app's own
// dark console classes. Nothing here may use a theme role; it is removed in
// the cleanup wave (7B) with the other legacy fixtures.
//
// Never import this file from application code.
import React from 'react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FullPrecisionProvider, FullPrecisionToggle, FullPrecisionNote } from '@/components/fullprecision/FullPrecision';

/** A dashboard path no batch registers; the fixture "lives" here in the proofs. */
export const LEGACY_FIXTURE_PATH = '/dashboard/apps/legacy/unmigrated-fixture';
export const LEGACY_FIXTURE_TITLE = 'Legacy Fixture Studio';

const TABS = [
  { value: 'inputs', label: 'Inputs' },
  { value: 'results', label: 'Results' },
];

function Inputs() {
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
        <h3 className="text-sm font-semibold text-slate-200">Reservoir</h3>
        <Label htmlFor="legacy-fixture-k">Permeability (md)</Label>
        <Input id="legacy-fixture-k" defaultValue="120" />
      </div>
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
        <p className="mb-2 text-xs text-slate-400">Drive mechanism</p>
        <RadioGroup defaultValue="water">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="water" id="legacy-fixture-water" />
            <Label htmlFor="legacy-fixture-water">Water drive</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="gas" id="legacy-fixture-gas" />
            <Label htmlFor="legacy-fixture-gas">Gas cap</Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}

function Results() {
  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-white">Forecast</CardTitle>
          <CardDescription>Base case</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center gap-3">
            <Avatar><AvatarFallback>AT</AvatarFallback></Avatar>
            <Badge>Draft</Badge>
            <Button variant="outline">Run</Button>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Year</TableHead><TableHead>Oil (bbl/d)</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow><TableCell className="text-slate-300">2027</TableCell><TableCell className="text-lime-400">1,250</TableCell></TableRow>
              <TableRow><TableCell className="text-slate-300">2028</TableCell><TableCell className="text-lime-400">1,040</TableCell></TableRow>
            </TableBody>
          </Table>
          <FullPrecisionNote className="mt-2" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-slate-800 p-3 text-slate-100">EUR 4.2 MMbbl</div>
        <div className="rounded-md bg-slate-800 p-3 text-slate-100">RF 31%</div>
      </div>
    </div>
  );
}

export default function LegacyAppFixture() {
  return (
    <FullPrecisionProvider initial>
      <StudioLayout
        header={(
          <StudioHeader
            title={LEGACY_FIXTURE_TITLE}
            tabs={TABS}
            activeTab="results"
            onTabChange={() => {}}
          />
        )}
        headerActions={<FullPrecisionToggle app="legacy-fixture" />}
        sidebarLeft={<Inputs />}
        main={<Results />}
      />
    </FullPrecisionProvider>
  );
}
