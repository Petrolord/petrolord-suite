// Scenes shared by uiLegacyDom.test.jsx (outside a scope, pinned to main)
// and scopeUiControls.test.jsx (inside a scope). Not a test file itself.
// The loader scenes use a path no batch registers (the test-only legacy
// fixture's path): on themed paths the loaders are themed on purpose
// (coldLoad.test.jsx).
import React from 'react';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuCheckboxItem,
  ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuLabel, ContextMenuSeparator,
  ContextMenuShortcut, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
} from '@/components/ui/context-menu';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle,
  AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import AccessDenied from '@/components/AccessDenied';
import ComingSoon from '@/components/ComingSoon';
import AuthGuard from '@/components/AuthGuard';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Toaster } from '@/components/ui/sonner';
import { toast as sonnerToast } from 'sonner';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FullPrecisionProvider, FullPrecisionToggle, FullPrecisionNote } from '@/components/fullprecision/FullPrecision';
import { LEGACY_FIXTURE_PATH } from '@/design/testing/LegacyAppFixture';

// Every scene renders outside any scope. The same scenes are reused by
// scopeUiControls.test.jsx inside a scope.
export const SCENES = {
  controls: () => (
    <div>
      <Checkbox />
      <Checkbox defaultChecked />
      <Checkbox disabled />
      <Switch />
      <Switch defaultChecked />
      <Slider defaultValue={[40]} max={100} step={1} />
      <Progress value={30} />
      <Progress />
      <Separator />
      <Separator orientation="vertical" />
      <Skeleton className="h-4 w-20" />
      <Toggle aria-label="bold">B</Toggle>
      <Toggle variant="outline" defaultPressed aria-label="italic">I</Toggle>
      <ToggleGroup type="single" defaultValue="a">
        <ToggleGroupItem value="a" aria-label="first">A</ToggleGroupItem>
        <ToggleGroupItem value="b" aria-label="second">B</ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup type="multiple" variant="outline" size="sm" defaultValue={['x']}>
        <ToggleGroupItem value="x">X</ToggleGroupItem>
        <ToggleGroupItem value="y">Y</ToggleGroupItem>
      </ToggleGroup>
      {['default', 'secondary', 'destructive', 'outline'].map((v) => <Badge key={v} variant={v}>{v}</Badge>)}
    </div>
  ),
  accordion: () => (
    <Accordion type="single" collapsible defaultValue="one">
      <AccordionItem value="one">
        <AccordionTrigger>One</AccordionTrigger>
        <AccordionContent>First body</AccordionContent>
      </AccordionItem>
      <AccordionItem value="two">
        <AccordionTrigger>Two</AccordionTrigger>
        <AccordionContent>Second body</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
  scrollArea: () => (
    <ScrollArea type="always" className="h-20"><div style={{ height: 400 }}>tall</div></ScrollArea>
  ),
  alert: () => (
    <div>
      <Alert><span>i</span><AlertTitle>Heads up</AlertTitle><AlertDescription>Body</AlertDescription></Alert>
      <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>Bad</AlertDescription></Alert>
    </div>
  ),
  sheetRight: () => (
    <Sheet open>
      <SheetContent>
        <SheetHeader><SheetTitle>Sheet</SheetTitle><SheetDescription>Desc</SheetDescription></SheetHeader>
        <SheetFooter><button type="button">ok</button></SheetFooter>
      </SheetContent>
    </Sheet>
  ),
  sheetLeft: () => (
    <Sheet open>
      <SheetContent side="left"><SheetTitle>Left</SheetTitle><SheetDescription>d</SheetDescription></SheetContent>
    </Sheet>
  ),
  alertDialog: () => (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  contextMenu: () => (
    <ContextMenu>
      <ContextMenuTrigger><div data-testid="cm-trigger">right click</div></ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>Label</ContextMenuLabel>
        <ContextMenuLabel inset>Inset label</ContextMenuLabel>
        <ContextMenuItem>Item<ContextMenuShortcut>Ctrl+K</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem inset>Inset item</ContextMenuItem>
        <ContextMenuItem disabled>Disabled</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem checked>Checked</ContextMenuCheckboxItem>
        <ContextMenuRadioGroup value="r1">
          <ContextMenuRadioItem value="r1">Radio 1</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
        <ContextMenuSub open>
          <ContextMenuSubTrigger>More</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>Sub item</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  ),
  accessDenied: () => (
    <MemoryRouter><AccessDenied moduleId="m" appName="some-app" debugInfo={{ checkedId: 'x', userModules: [], userApps: [] }} /></MemoryRouter>
  ),
  comingSoon: () => <MemoryRouter><ComingSoon appName="Thing" /></MemoryRouter>,
  authGuardLoadingOther: () => (
    <AuthContext.Provider value={{ loading: true, user: null }}>
      <MemoryRouter initialEntries={[LEGACY_FIXTURE_PATH]}><AuthGuard><p>app</p></AuthGuard></MemoryRouter>
    </AuthContext.Provider>
  ),
  protectedRouteLoading: () => (
    <AuthContext.Provider value={{ loading: true, user: null }}>
      <MemoryRouter initialEntries={[LEGACY_FIXTURE_PATH]}><ProtectedRoute><p>app</p></ProtectedRoute></MemoryRouter>
    </AuthContext.Provider>
  ),
  toaster: () => <Toaster richColors closeButton />,
  // Wave 0A: avatar, radio group and the FullPrecision toggle and note
  wave0a: () => (
    <div>
      <Avatar><AvatarImage src="" alt="" /><AvatarFallback>AT</AvatarFallback></Avatar>
      <Avatar className="h-6 w-6"><AvatarFallback className="text-xs">PM</AvatarFallback></Avatar>
      <RadioGroup defaultValue="a" aria-label="choice">
        <RadioGroupItem value="a" aria-label="first" />
        <RadioGroupItem value="b" aria-label="second" />
        <RadioGroupItem value="c" aria-label="third" disabled />
      </RadioGroup>
      <FullPrecisionProvider initial>
        <FullPrecisionToggle app="scene" />
        <FullPrecisionToggle app="scene-light" tone="light" />
        <FullPrecisionNote />
      </FullPrecisionProvider>
    </div>
  ),
  protectedRouteDenied: () => (
    <AuthContext.Provider value={{ loading: false, user: { id: 'u' }, isSuperAdmin: false }}>
      <MemoryRouter initialEntries={['/dashboard/x']}><ProtectedRoute requiredPermission="p"><p>app</p></ProtectedRoute></MemoryRouter>
    </AuthContext.Provider>
  ),
};

// Scenes that need an interaction after mount to open their portal.
export const AFTER = {
  contextMenu: (utils) => fireEvent.contextMenu(utils.getByTestId('cm-trigger')),
  toaster: async () => {
    sonnerToast('Saved', { description: 'All good', id: 'scene-toast' });
    sonnerToast.error('Failed', { id: 'scene-toast-err' });
    await new Promise((r) => setTimeout(r, 50));
  },
};

