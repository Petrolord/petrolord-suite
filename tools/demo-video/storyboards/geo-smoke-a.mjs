import home from './smoke-home.mjs';
export default { ...home, id: 'geo-smoke-a', steps: home.steps.slice(0, 2) };
