// MB4: the case-data -> screening pressure-history seeding rule.
import { historyFromProductionData } from '../AquiferScreening.jsx';

describe('historyFromProductionData', () => {
  test('maps dated rows to days from the first observation', () => {
    const out = historyFromProductionData([
      { observation_date: '1980-01-01', pressure_psia: 2740 },
      { observation_date: '1981-01-01', pressure_psia: 2620 },
      { observation_date: '1982-01-01', pressure_psia: 2395 },
    ]);
    expect(out).toEqual([
      { t: 0, p: 2740 },
      { t: 366, p: 2620 }, // 1980 is a leap year
      { t: 731, p: 2395 },
    ]);
  });

  test('rows without dates or pressures are skipped', () => {
    const out = historyFromProductionData([
      { observation_date: '2020-01-01', pressure_psia: 3000 },
      { observation_date: null, pressure_psia: 2900 },
      { observation_date: '2021-01-01', pressure_psia: null },
      { observation_date: '2022-01-01', pressure_psia: 2700 },
    ]);
    expect(out).toEqual([
      { t: 0, p: 3000 },
      { t: 731, p: 2700 },
    ]);
  });

  test('fewer than two dated rows returns null', () => {
    expect(historyFromProductionData([])).toBeNull();
    expect(historyFromProductionData(null)).toBeNull();
    expect(historyFromProductionData([
      { observation_date: '2020-01-01', pressure_psia: 3000 },
    ])).toBeNull();
    expect(historyFromProductionData([
      { pressure_psia: 3000 }, { pressure_psia: 2900 },
    ])).toBeNull();
  });
});
