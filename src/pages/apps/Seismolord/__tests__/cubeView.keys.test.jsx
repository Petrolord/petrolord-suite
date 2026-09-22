/**
 * 3D window keyboard stepping (tester feedback 2026-09-22): the arrow
 * keys step a plane by the step size, the Section window's orientation
 * when the cursor is not over a plane.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  stubCanvas2d, GEOM, MANIFEST, DISPLAY, gatedBricks,
} from './cubeView.harness';
import CubeView from '@/pages/apps/Seismolord/components/CubeView';

jest.mock('@/pages/apps/Seismolord/viewer/CubeRenderer',
  () => require('./cubeView.harness').cubeRendererMock());

beforeAll(() => stubCanvas2d());
beforeEach(() => localStorage.clear());

const mount = (over = {}) => {
  const onChangeIndex = jest.fn();
  const { getBrick } = gatedBricks({ immediate: true });
  const props = {
    geom: GEOM,
    manifest: MANIFEST,
    getBrick,
    indices: { inline: 3, xline: 3, time: 8 },
    onChangeIndex,
    display: DISPLAY,
    vexag: 1,
    steps: { inline: 2, xline: 1, time: 5 },
    activeOrientation: 'time',
    ...over,
  };
  render(<CubeView {...props} />);
  return { onChangeIndex };
};

test('arrow keys step the active orientation by its step size', async () => {
  const { onChangeIndex } = mount();
  await act(async () => {});
  const vp = screen.getByTestId('cube-viewport');
  fireEvent.keyDown(vp, { key: 'ArrowRight' });
  expect(onChangeIndex).toHaveBeenLastCalledWith('time', 13);
  fireEvent.keyDown(vp, { key: 'ArrowDown' });
  expect(onChangeIndex).toHaveBeenLastCalledWith('time', 3);
});

test('stepping clamps at the survey edge and ignores other keys', async () => {
  const { onChangeIndex } = mount({
    indices: { inline: 7, xline: 3, time: 8 }, activeOrientation: 'inline',
  });
  await act(async () => {});
  const vp = screen.getByTestId('cube-viewport');
  fireEvent.keyDown(vp, { key: 'ArrowUp' });       // already at the last inline
  fireEvent.keyDown(vp, { key: 'a' });
  expect(onChangeIndex).not.toHaveBeenCalled();
  fireEvent.keyDown(vp, { key: 'ArrowLeft' });
  expect(onChangeIndex).toHaveBeenLastCalledWith('inline', 5);
});
