// ReservoirCalc Pro documentation hub.
//
// Rewritten 2026-08-27. The previous registry carried nineteen Horizons-era
// articles, five of which described things that do not exist (a JS API, video
// tutorials, sample projects, a changelog and a support form). Those are gone,
// along with the keyboard-shortcut and integration articles, which were also
// fiction. What remains is grouped into categories and each entry carries
// keywords so the search box can match on subject matter rather than on the
// article title alone.

import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search, Book, FileText, Play, Settings, HelpCircle, Layout, Calculator,
  Layers, Dices, Activity, Map, Shapes, Ruler, FolderOpen, Boxes, ShieldCheck,
  History, Share2, FileOutput,
} from 'lucide-react';

import GettingStartedGuide from './GettingStartedGuide';
import UIGuide from './UIGuide';
import InputMethodsGuide from './InputMethodsGuide';
import ProjectsGuide from './ProjectsGuide';
import MultiReservoirGuide from './MultiReservoirGuide';
import SurfaceImportGuide from './SurfaceImportGuide';
import FluidPropertiesGuide from './FluidPropertiesGuide';
import UnitsGuide from './UnitsGuide';
import SettingsGriddingGuide from './SettingsGriddingGuide';
import CalculationReference from './CalculationReference';
import ContactVolumetricsGuide from './ContactVolumetricsGuide';
import ProbabilisticGuide from './ProbabilisticGuide';
import SensitivityGuide from './SensitivityGuide';
import MapGenerationGuide from './MapGenerationGuide';
import SurfacePaintingGuide from './SurfacePaintingGuide';
import PolygonGuide from './PolygonGuide';
import ProspectRiskingGuide from './ProspectRiskingGuide';
import ReportsGuide from './ReportsGuide';
import AuditTrailGuide from './AuditTrailGuide';
import CollaborationGuide from './CollaborationGuide';
import TroubleshootingGuide from './TroubleshootingGuide';
import BestPracticesGuide from './BestPracticesGuide';
import Glossary from './Glossary';

const SECTIONS = [
  // Getting oriented
  { id: 'getting-started', label: 'Getting Started', category: 'Getting oriented', icon: Play, component: GettingStartedGuide, keywords: 'first run quick start intro overview recalculate auto-calculate' },
  { id: 'ui-guide', label: 'Interface Guide', category: 'Getting oriented', icon: Layout, component: UIGuide, keywords: 'layout panels tabs geo fluid surf aoi maps header toolbar workspace tools ctrl+b' },
  { id: 'input-methods', label: 'Input Methods', category: 'Getting oriented', icon: FileText, component: InputMethodsGuide, keywords: 'simple hybrid surfaces analytic structural which method' },

  // Projects and data
  { id: 'projects', label: 'Projects and Saving', category: 'Projects and data', icon: FolderOpen, component: ProjectsGuide, keywords: 'save load delete version autosave export import json modified badge' },
  { id: 'multi-reservoir', label: 'Multiple Reservoirs', category: 'Projects and data', icon: Boxes, component: MultiReservoirGuide, keywords: 'reservoir switcher multi tank cases snapshot fold' },
  { id: 'surface-import', label: 'Surface Import', category: 'Projects and data', icon: FileText, component: SurfaceImportGuide, keywords: 'xyz csv dat esri ascii zmap cps-3 geojson crs epsg zconvention xyunit seismolord mapping studio twt null sentinel' },
  { id: 'fluid-properties', label: 'Fluid Properties', category: 'Projects and data', icon: Settings, component: FluidPropertiesGuide, keywords: 'oil gas condensate bo bg standing presets gas cap fraction owc goc gwc contacts' },
  { id: 'units', label: 'Units and Conversion', category: 'Projects and data', icon: Ruler, component: UnitsGuide, keywords: 'field metric acres km2 feet metres psi bar celsius fahrenheit rcf scf rb mscf conversion canonical' },

  // The calculations
  { id: 'calculations', label: 'Calculation Reference', category: 'The calculations', icon: Calculator, component: CalculationReference, keywords: 'grv nrv hcpv stooip giip 7758 43560 ntg porosity sw formula quality score validation' },
  { id: 'contact-volumetrics', label: 'Contact Volumetrics', category: 'The calculations', icon: Layers, component: ContactVolumetricsGuide, keywords: 'structural grid integration cell overlap fluid zone window hull mask aoi clipping hypsometry' },
  { id: 'probabilistic', label: 'Probabilistic Mode', category: 'The calculations', icon: Dices, component: ProbabilisticGuide, keywords: 'monte carlo triangular normal lognormal uniform iterations correlation copula cholesky truncation p90 p50 p10 base case' },
  { id: 'sensitivity', label: 'Sensitivity and Tornado', category: 'The calculations', icon: Activity, component: SensitivityGuide, keywords: 'tornado swing decile variance share histogram expectation curve' },

  // Maps and views
  { id: 'map-generation', label: 'Property Maps', category: 'Maps and views', icon: Map, component: MapGenerationGuide, keywords: 'structure thickness net pay hcpv stooip giip porosity sw generate' },
  { id: 'surface-painting', label: 'Visualization', category: 'Maps and views', icon: Layout, component: SurfacePaintingGuide, keywords: '2d 3d split contour colormap viridis earth jet gallery save view layer selector' },
  { id: 'polygons', label: 'Areas of Interest', category: 'Maps and views', icon: Shapes, component: PolygonGuide, keywords: 'aoi polygon clip lko licence block compartment fractional coverage' },

  // Analysis and output
  { id: 'prospect-risking', label: 'Prospect Risking', category: 'Analysis and output', icon: ShieldCheck, component: ProspectRiskingGuide, keywords: 'pg chance of success trap reservoir charge seal risked mean portfolio rollup discoveries' },
  { id: 'reports', label: 'Reports and Slides', category: 'Analysis and output', icon: FileOutput, component: ReportsGuide, keywords: 'pdf executive technical audit slide png clipboard export csv xyz' },
  { id: 'audit-trail', label: 'Audit Trail', category: 'Analysis and output', icon: History, component: AuditTrailGuide, keywords: 'log events defensibility traceability csv who what when' },
  { id: 'collaboration', label: 'Sharing Work', category: 'Analysis and output', icon: Share2, component: CollaborationGuide, keywords: 'collaboration team export workspace file handoff sharing' },

  // Reference
  { id: 'troubleshooting', label: 'Troubleshooting', category: 'Reference', icon: HelpCircle, component: TroubleshootingGuide, keywords: 'zero results wrong volume bg unit grid gap aoi active rejection rate drift problem error' },
  { id: 'best-practices', label: 'Best Practices', category: 'Reference', icon: Book, component: BestPracticesGuide, keywords: 'qc workflow advice recommendations tips' },
  { id: 'glossary', label: 'Glossary', category: 'Reference', icon: Book, component: Glossary, keywords: 'definitions terms abbreviations meaning' },
];

const CATEGORY_ORDER = [
  'Getting oriented',
  'Projects and data',
  'The calculations',
  'Maps and views',
  'Analysis and output',
  'Reference',
];

const DocumentationHub = ({ open, onOpenChange }) => {
  const [activeSection, setActiveSection] = useState('getting-started');
  const [searchQuery, setSearchQuery] = useState('');

  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? SECTIONS.filter((s) => `${s.label} ${s.category} ${s.keywords}`.toLowerCase().includes(q))
    : SECTIONS;

  const active = SECTIONS.find((s) => s.id === activeSection) || SECTIONS[0];
  const ActiveComponent = active.component;

  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, items: filtered.filter((s) => s.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] bg-slate-950 border-slate-800 p-0 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-slate-800 flex flex-col bg-slate-900/50">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white mb-2">Documentation</h2>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search docs..."
                className="pl-8 h-9 bg-slate-900 border-slate-700 text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-3">
              {grouped.length === 0 ? (
                <p className="px-2 py-4 text-xs text-slate-500">
                  Nothing matches that search. Try a term like contacts, units, tornado or export.
                </p>
              ) : null}
              {grouped.map(({ cat, items }) => (
                <div key={cat}>
                  <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-slate-500">{cat}</div>
                  <div className="space-y-1">
                    {items.map((section) => (
                      <Button
                        key={section.id}
                        variant={activeSection === section.id ? 'secondary' : 'ghost'}
                        className={`w-full justify-start text-sm ${activeSection === section.id ? 'bg-blue-900/20 text-blue-400' : 'text-slate-400 hover:text-white'}`}
                        onClick={() => setActiveSection(section.id)}
                      >
                        <section.icon className="w-4 h-4 mr-2 shrink-0" />
                        <span className="truncate">{section.label}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
            <div className="flex items-center text-sm text-slate-400 min-w-0">
              <span className="hover:text-white cursor-pointer shrink-0" onClick={() => setActiveSection('getting-started')}>Docs</span>
              <span className="mx-2 shrink-0">/</span>
              <span className="text-slate-500 shrink-0">{active.category}</span>
              <span className="mx-2 shrink-0">/</span>
              <span className="text-white font-medium truncate">{active.label}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="hidden md:flex shrink-0">
              Print Guide
            </Button>
          </div>
          <ScrollArea className="flex-1 p-6">
            <div className="prose prose-invert max-w-none">
              <ActiveComponent />
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentationHub;
