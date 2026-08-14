import React from 'react';
import { render } from '@testing-library/react';
import TornadoChart, { DOWN_COLOR, UP_COLOR } from '../TornadoChart';

const renderToStaticMarkup = (el) => render(el).container.innerHTML;

const ROWS = [
    { label: 'Porosity', low: 30, high: 70, contribution: 62 },
    { label: 'Water Sat.', low: 40, high: 58, contribution: 30 },
];

describe('TornadoChart (symmetric tornado)', () => {
    it('splits each bar at the P50 axis into a below-P50 and an above-P50 segment', () => {
        const html = renderToStaticMarkup(
            <TornadoChart rows={ROWS} base={50} unit="MMstb" width={600} height={200} />,
        );
        expect(html).toContain(`fill="${DOWN_COLOR}"`);
        expect(html).toContain(`fill="${UP_COLOR}"`);
        // Centre axis label and legend
        expect(html).toContain('P50 50 MMstb');
        expect(html).toContain('below P50');
        expect(html).toContain('above P50');
        // Parameter labels + end values
        expect(html).toContain('Porosity');
        expect(html).toContain('62% var');
        expect(html).toContain('>30<');
        expect(html).toContain('>70<');
    });

    it('clamps a row that sits entirely above the P50 to a single up-side segment', () => {
        const html = renderToStaticMarkup(
            <TornadoChart
                rows={[{ label: 'Weak', low: 55, high: 60, contribution: 2 }]}
                base={50}
                unit="MMstb"
                width={600}
                height={120}
            />,
        );
        // No down-segment rect for a bar with no volume below P50 (legend swatch
        // still carries DOWN_COLOR, so count bar-height rects instead).
        const downRects = (html.match(new RegExp(`fill="${DOWN_COLOR}"`, 'g')) || []).length;
        const upRects = (html.match(new RegExp(`fill="${UP_COLOR}"`, 'g')) || []).length;
        expect(downRects).toBe(1); // legend swatch only
        expect(upRects).toBe(2);   // legend swatch + the bar
    });

    it('renders nothing without rows or a finite base', () => {
        expect(renderToStaticMarkup(<TornadoChart rows={[]} base={50} />)).toBe('');
        expect(renderToStaticMarkup(<TornadoChart rows={ROWS} base={NaN} />)).toBe('');
    });
});
