/**
 * @jest-environment node
 */
// A file the worker makes keeps the project of the file it came from, else the job's (QI upgrade, 20261015160000).
import { projectFrom } from '../src/project.js';

test('the first row with a project gives it; rows from before the migration add nothing', () => {
  expect(projectFrom({ suite_project_id: 'A' }, { suite_project_id: 'B' })).toEqual({ suite_project_id: 'A' });
  expect(projectFrom({ suite_project_id: null }, { suite_project_id: 'B' })).toEqual({ suite_project_id: 'B' });
  expect(projectFrom({ id: 1 }, { user_id: 'u' })).toEqual({});
  expect(projectFrom(null, undefined)).toEqual({});
});
