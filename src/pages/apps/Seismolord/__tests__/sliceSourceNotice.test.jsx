/**
 * Stream L failure states: the viewer shows a clear message in place of
 * an endless spinner, names the memory budget when it runs out, says time
 * slices come after conversion with the conversion progress, and offers
 * Retry.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SliceSourceNotice from '../components/SliceSourceNotice';
import { SOURCE_ERRORS, sourceError } from '../sources/sliceSource';
import {
  publishConversionProgress, clearConversionProgress, useConversionProgress, describeConversion,
} from '../sources/conversionProgress';

const MB = 1024 * 1024;

describe('SliceSourceNotice', () => {
  test('time slices wait for conversion and show its progress', () => {
    render(
      <SliceSourceNotice
        kind="time-unavailable"
        conversion={{ phase: 'transcode', done: 1176, total: 4704 }}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain(
      'Time slices are available after conversion, because each one needs the whole file.',
    );
    expect(screen.getByTestId('conversion-progress').textContent).toContain('Converting to bricks: 25%');
  });

  test('before any conversion it says how to start one', () => {
    render(<SliceSourceNotice kind="time-unavailable" conversion={null} />);
    expect(screen.getByTestId('conversion-progress').textContent).toContain('Conversion has not started. Start the import to convert this survey.');
  });

  test('out of memory names the budget and offers Retry', () => {
    const onRetry = jest.fn();
    render(
      <SliceSourceNotice
        kind="error"
        error={sourceError(SOURCE_ERRORS.OUT_OF_MEMORY, 'Array buffer allocation failed')}
        budgetBytes={256 * MB}
        onRetry={onRetry}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Seismolord ran out of memory loading this slice.');
    expect(alert.textContent).toContain('It keeps at most 256 MB of survey data in memory on this machine.');
    expect(alert.textContent).not.toMatch(/\u2014/);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('a crashed worker reads as out of memory; a timeout says so', () => {
    const { rerender } = render(
      <SliceSourceNotice kind="error" error={sourceError(SOURCE_ERRORS.WORKER_CRASHED, 'x')} budgetBytes={512 * MB} />,
    );
    expect(screen.getByRole('alert').textContent).toContain('ran out of memory');
    expect(screen.getByRole('alert').textContent).toContain('512 MB');
    rerender(<SliceSourceNotice kind="error" error={sourceError(SOURCE_ERRORS.TIMEOUT, 'slow')} />);
    expect(screen.getByRole('alert').textContent).toContain('Loading this slice took too long. Check your connection, then press Retry.');
    rerender(<SliceSourceNotice kind="error" error={new Error('Brick fetch failed (500)')} what="the time slice" />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load the time slice: Brick fetch failed (500)');
  });

  test('header reading shows its progress', () => {
    render(<SliceSourceNotice kind="indexing" indexing={{ done: 1200, total: 2130 }} />);
    expect(screen.getByRole('status').textContent).toContain('Reading trace headers: 1,200 of 2,130');
  });
});

describe('conversion progress store', () => {
  function Probe() {
    const p = useConversionProgress();
    return <span data-testid="p">{describeConversion(p) || 'none'}</span>;
  }

  test('publishers reach every subscriber', () => {
    render(<Probe />);
    expect(screen.getByTestId('p').textContent).toContain('none');
    act(() => publishConversionProgress({ phase: 'upload', done: 12, total: null }));
    expect(screen.getByTestId('p').textContent).toContain('Uploading: 12 done');
    act(() => publishConversionProgress({ phase: 'scan', done: 1, total: 4 }));
    expect(screen.getByTestId('p').textContent).toContain('Reading trace headers: 25%');
    act(() => clearConversionProgress());
    expect(screen.getByTestId('p').textContent).toContain('none');
  });
});
