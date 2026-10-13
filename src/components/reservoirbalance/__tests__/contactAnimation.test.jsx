import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ContactAnimation from '../ContactAnimation';
import { createMbalUnits, MBAL_OILFIELD_VIEW } from '@/pages/apps/reservoir-balance/lib/mbalUnits';

const units = createMbalUnits(MBAL_OILFIELD_VIEW);
const series = [
  { step: 0, date: '2017-01-01', pressure: 3200, owcFt: 5060, gocFt: 4950 },
  { step: 1, date: '2017-07-01', pressure: 3100, owcFt: 5050, gocFt: 4956 },
  { step: 2, date: '2018-01-01', pressure: 3020, owcFt: 5040, gocFt: 4962 },
];

test('it opens on the last timestep with the computed contacts, and the slider walks back in time', () => {
  render(<ContactAnimation series={series} initialOwcFt={5060} initialGocFt={4950} units={units} />);
  expect(screen.getByTestId('mbal-contacts-anim-owc')).toHaveTextContent('OWC 5,040.0 ft');
  expect(screen.getByTestId('mbal-contacts-anim-goc')).toHaveTextContent('GOC 4,962.0 ft');
  expect(screen.getByTestId('mbal-contacts-anim-rise')).toHaveTextContent('20.0 ft');
  expect(screen.getByTestId('mbal-contacts-anim-drop')).toHaveTextContent('12.0 ft');
  expect(screen.getByTestId('mbal-contacts-anim-column')).toHaveTextContent('78.0 ft');
  expect(screen.getByTestId('mbal-contacts-anim-date')).toHaveTextContent('2018-01');
  fireEvent.change(screen.getByTestId('mbal-contacts-anim-slider'), { target: { value: '0.5' } });
  expect(screen.getByTestId('mbal-contacts-anim-owc')).toHaveTextContent('OWC 5,055.0 ft');
  expect(screen.getByTestId('mbal-contacts-anim-date')).toHaveTextContent('(between surveys)');
  fireEvent.click(screen.getByTestId('mbal-contacts-anim-reset'));
  expect(screen.getByTestId('mbal-contacts-anim-rise')).toHaveTextContent('0.0 ft');
  expect(screen.queryByTestId('mbal-contacts-anim-swept-water')).toBeNull();
});

test('no gas cap: no GOC line, no gas legend, and a swept-by-water band once the OWC rises', () => {
  const s = series.map((x) => ({ ...x, gocFt: null }));
  render(<ContactAnimation series={s} initialOwcFt={5060} initialGocFt={null} units={units} />);
  expect(screen.queryByTestId('mbal-contacts-anim-goc')).toBeNull();
  expect(screen.queryByTestId('mbal-contacts-anim-drop')).toBeNull();
  expect(screen.queryByTestId('mbal-contacts-anim-column')).toBeNull();
  expect(screen.getByTestId('mbal-contacts-anim-swept-water')).toBeInTheDocument();
});
