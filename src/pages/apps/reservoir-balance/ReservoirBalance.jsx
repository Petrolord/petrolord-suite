// src/pages/apps/reservoir-balance/ReservoirBalance.jsx
//
// Reservoir Balance — Case List Page
// ===================================
//
// Phase 2 deliverable. Entry point for the Reservoir Balance app.
// Lists the current user's MBAL cases, allows creating new cases,
// navigating to case detail, and archive/delete actions.
//
// Routes that hit this page (via App.jsx):
//   /dashboard/apps/reservoir/reservoir-balance
//   /dashboard/apps/reservoir/reservoir-balance-pro
//   /dashboard/apps/reservoir/reservoir-balance-surveillance
//   /dashboard/apps/reservoir/material-balance-studio
//
// Clicking a row navigates to: ./cases/:caseId  (RbCaseDetail.jsx, Artifact 4)
//
// Pattern: mirrors EpeCaseList.jsx structure in this Suite.

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Plus,
  Droplet,
  Wind,
  Layers,
  ChevronRight,
  Trash2,
  Loader2,
  AlertCircle,
  Database,
  Calendar,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  listCases,
  createCase,
  deleteCase,
} from './lib/api';

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

const FLUID_SYSTEM_OPTIONS = [
  { value: 'oil', label: 'Oil reservoir', icon: Droplet, color: 'text-green-500' },
  { value: 'gas', label: 'Gas reservoir', icon: Wind, color: 'text-blue-500' },
  { value: 'oil_with_gas_cap', label: 'Oil with gas cap', icon: Layers, color: 'text-purple-500' },
];

function fluidSystemDisplay(value) {
  return FLUID_SYSTEM_OPTIONS.find((o) => o.value === value) ?? {
    value,
    label: value,
    icon: Droplet,
    color: 'text-gray-500',
  };
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// =============================================================================
// NEW CASE DIALOG
// =============================================================================

const NewCaseDialog = ({ open, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    field_name: '',
    reservoir_name: '',
    fluid_system: 'oil',
    initial_pressure_psia: '',
    reservoir_temperature_f: '',
    initial_water_saturation: '0.20',
    bubble_point_psia: '',
  });

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e?.target?.value ?? e }));
  };

  const isValid =
    form.name.trim().length > 0 &&
    form.initial_pressure_psia !== '' &&
    !isNaN(parseFloat(form.initial_pressure_psia)) &&
    form.reservoir_temperature_f !== '' &&
    !isNaN(parseFloat(form.reservoir_temperature_f)) &&
    form.initial_water_saturation !== '' &&
    !isNaN(parseFloat(form.initial_water_saturation));

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);

    const payload = {
      name: form.name.trim(),
      field_name: form.field_name.trim() || null,
      reservoir_name: form.reservoir_name.trim() || null,
      fluid_system: form.fluid_system,
      has_aquifer: false, // default; user toggles on detail page
      has_gas_cap: form.fluid_system === 'oil_with_gas_cap',
      initial_pressure_psia: parseFloat(form.initial_pressure_psia),
      reservoir_temperature_f: parseFloat(form.reservoir_temperature_f),
      initial_water_saturation: parseFloat(form.initial_water_saturation),
      bubble_point_psia: form.bubble_point_psia
        ? parseFloat(form.bubble_point_psia)
        : null,
    };

    const { data, error } = await createCase(payload);
    setSubmitting(false);

    if (error) {
      toast({
        title: 'Failed to create case',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Case created',
      description: `"${data.name}" is ready to receive production data.`,
    });
    onOpenChange(false);
    setForm({
      name: '',
      field_name: '',
      reservoir_name: '',
      fluid_system: 'oil',
      initial_pressure_psia: '',
      reservoir_temperature_f: '',
      initial_water_saturation: '0.20',
      bubble_point_psia: '',
    });
    onCreated?.(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Reservoir Balance Case</DialogTitle>
          <DialogDescription>
            Define a new material balance study. You can edit any of these fields later from the case detail page.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name">Case name *</Label>
              <Input
                id="name"
                placeholder="e.g. Egbema-12 C2.0 Sand"
                value={form.name}
                onChange={update('name')}
              />
            </div>

            <div>
              <Label htmlFor="field">Field</Label>
              <Input
                id="field"
                placeholder="e.g. Egbema West"
                value={form.field_name}
                onChange={update('field_name')}
              />
            </div>
            <div>
              <Label htmlFor="reservoir">Reservoir</Label>
              <Input
                id="reservoir"
                placeholder="e.g. C2.0 Sand"
                value={form.reservoir_name}
                onChange={update('reservoir_name')}
              />
            </div>

            <div className="col-span-2">
              <Label>Fluid system *</Label>
              <Select
                value={form.fluid_system}
                onValueChange={(v) => setForm((f) => ({ ...f, fluid_system: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLUID_SYSTEM_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="pi">Initial pressure (psia) *</Label>
              <Input
                id="pi"
                type="number"
                placeholder="e.g. 4500"
                value={form.initial_pressure_psia}
                onChange={update('initial_pressure_psia')}
              />
            </div>
            <div>
              <Label htmlFor="temp">Temperature (°F) *</Label>
              <Input
                id="temp"
                type="number"
                placeholder="e.g. 180"
                value={form.reservoir_temperature_f}
                onChange={update('reservoir_temperature_f')}
              />
            </div>

            <div>
              <Label htmlFor="swi">Initial water saturation *</Label>
              <Input
                id="swi"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.initial_water_saturation}
                onChange={update('initial_water_saturation')}
              />
            </div>
            <div>
              <Label htmlFor="pb">
                Bubble point (psia){' '}
                <span className="text-xs text-muted-foreground">
                  {form.fluid_system === 'gas' ? '(not applicable)' : '(optional)'}
                </span>
              </Label>
              <Input
                id="pb"
                type="number"
                placeholder="e.g. 3200"
                value={form.bubble_point_psia}
                onChange={update('bubble_point_psia')}
                disabled={form.fluid_system === 'gas'}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// =============================================================================
// MAIN PAGE
// =============================================================================

const ReservoirBalance = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await listCases();
    if (error) {
      setError(error.message);
      setCases([]);
    } else {
      setCases(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCaseCreated = (newCase) => {
    setCases((prev) => [newCase, ...prev]);
    navigate(`./cases/${newCase.id}`);
  };

  const handleOpen = (caseId) => {
    navigate(`./cases/${caseId}`);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await deleteCase(deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Case deleted',
      description: `"${deleteTarget.name}" and all associated runs were removed.`,
    });
    setCases((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="container mx-auto py-6 px-4 max-w-7xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reservoir Balance</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Material balance analysis. Estimate OOIP, drive mechanism, and aquifer support from production history.
          </p>
        </div>
        <Button onClick={() => setNewCaseOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New case
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load cases</AlertTitle>
          <AlertDescription>
            {error}{' '}
            <Button variant="link" size="sm" onClick={refresh} className="px-1">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your cases</CardTitle>
          <CardDescription>
            {loading
              ? 'Loading…'
              : `${cases.length} case${cases.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cases.length === 0 ? (
            <EmptyState onCreate={() => setNewCaseOpen(true)} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Field / Reservoir</TableHead>
                  <TableHead>Fluid</TableHead>
                  <TableHead>Initial P (psia)</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => {
                  const fluid = fluidSystemDisplay(c.fluid_system);
                  const FluidIcon = fluid.icon;
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleOpen(c.id)}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.field_name || '—'}
                        {c.reservoir_name && ` / ${c.reservoir_name}`}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <FluidIcon className={`h-4 w-4 ${fluid.color}`} />
                          <span className="text-sm">{fluid.label}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.initial_pressure_psia
                          ? c.initial_pressure_psia.toLocaleString()
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" />
                          {formatDate(c.updated_at)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpen(c.id)}
                          >
                            Open
                            <ChevronRight className="ml-1 h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(c)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NewCaseDialog
        open={newCaseOpen}
        onOpenChange={setNewCaseOpen}
        onCreated={handleCaseCreated}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete case?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{deleteTarget?.name}</strong> and all its production data, run configs, runs, and results. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

// =============================================================================
// EMPTY STATE
// =============================================================================

const EmptyState = ({ onCreate }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <Database className="h-12 w-12 text-muted-foreground/40 mb-4" />
    <h3 className="text-lg font-semibold mb-1">No cases yet</h3>
    <p className="text-sm text-muted-foreground max-w-md mb-6">
      Create your first MBAL case to estimate OOIP, drive mechanism, and aquifer support from production history.
    </p>
    <Button onClick={onCreate}>
      <Plus className="mr-2 h-4 w-4" />
      Create your first case
    </Button>
  </div>
);

export default ReservoirBalance;
