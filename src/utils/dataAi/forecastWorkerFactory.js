/**
 * The only Forecasting ML Workbench file that references `import.meta` (the
 * Vite worker URL idiom), isolated so jest maps it to a null factory and
 * jobs run inline under test (src/__mocks__/forecastWorkerFactoryMock.js).
 */
export const createForecastWorker = () => {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./workers/forecast.worker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
};
