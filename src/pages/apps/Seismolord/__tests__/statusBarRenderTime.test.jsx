// The status bar's draw timer sat beside "IL 1027" reading "slice 191 ms",
// which an interpreter reads as a time-slice position. It must say what it is.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import StatusBar from '../components/workspace/StatusBar';

jest.mock('@/components/crs/ProjectCrsDialog', () => () => null);
jest.mock('@/lib/crs/settingsService', () => ({ getProjectCrs: () => new Promise(() => {}) }));
jest.mock('../components/workspace/ImportJobsIndicator', () => () => null);

const backend = { state: 'ok', detail: null, check: () => {} };

describe('StatusBar draw timer', () => {
  it('labels the section draw time so it cannot be read as a slice position', () => {
    render(<StatusBar volumeName="EKENE3D-full.sgy" lineLabel="IL 1027" sliceMs={191.4} backend={backend} />);
    expect(screen.getByText('drawn in 191 ms')).toBeInTheDocument();
    expect(screen.queryByText(/^slice \d+ ms$/)).not.toBeInTheDocument();
  });

  it('shows nothing before the first section is drawn', () => {
    render(<StatusBar volumeName="EKENE3D-full.sgy" lineLabel="IL 1027" sliceMs={null} backend={backend} />);
    expect(screen.queryByText(/drawn in/)).not.toBeInTheDocument();
  });
});
