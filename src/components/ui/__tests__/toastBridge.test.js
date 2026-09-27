// Senior test T1 (2026-09-27): since the Horizons re-import mounted only
// sonner's Toaster, toasts from useToast rendered nowhere. The hook now
// forwards every toast to sonner. These gates call the real toast() and
// check that App.jsx mounts the sonner Toaster it relies on.
import fs from 'fs';
import path from 'path';

jest.mock('sonner', () => {
  const fn = jest.fn();
  fn.error = jest.fn();
  fn.dismiss = jest.fn();
  return { toast: fn };
});

import { toast as sonner } from 'sonner';
import { toast } from '../use-toast';

beforeEach(() => { sonner.mockClear(); sonner.error.mockClear(); sonner.dismiss.mockClear(); });

test('a toast reaches sonner with its title and description', () => {
  toast({ title: 'Project Saved!', description: '"Harness" has been saved.' });
  expect(sonner).toHaveBeenCalledWith('Project Saved!', expect.objectContaining({ description: '"Harness" has been saved.' }));
  expect(sonner.error).not.toHaveBeenCalled();
});

test('a destructive toast shows as an error, and dismiss and update follow it', () => {
  const t = toast({ variant: 'destructive', title: 'Save Failed', description: 'no network' });
  expect(sonner.error).toHaveBeenCalledWith('Save Failed', expect.objectContaining({ description: 'no network', id: `ut-${t.id}` }));
  t.update({ description: 'retrying' });
  expect(sonner.error).toHaveBeenLastCalledWith('Save Failed', expect.objectContaining({ description: 'retrying', id: `ut-${t.id}` }));
  t.dismiss();
  expect(sonner.dismiss).toHaveBeenCalledWith(`ut-${t.id}`);
});

test('App.jsx mounts the sonner Toaster, and no page mounts a second toaster', () => {
  const root = path.resolve(__dirname, '../../../..');
  const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
  expect(app).toMatch(/import \{ Toaster \} from '@\/components\/ui\/sonner'/);
  expect(app).toMatch(/<Toaster\b/);
  const contour = fs.readFileSync(path.join(root, 'src/pages/apps/ContourMapDigitizer.jsx'), 'utf8');
  expect(contour).not.toMatch(/components\/ui\/toaster/);
});
