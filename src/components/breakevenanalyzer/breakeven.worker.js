// Runs the probabilistic breakeven off the main thread. A 5000 iteration run
// solves 5000 breakeven prices by bisection and used to block the page for
// four to seven seconds.
import { generateBreakevenData } from '@/utils/breakevenCalculations';

self.onmessage = (event) => {
  try {
    self.postMessage({ ok: true, result: generateBreakevenData(event.data) });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || 'The breakeven run failed.' });
  }
};
