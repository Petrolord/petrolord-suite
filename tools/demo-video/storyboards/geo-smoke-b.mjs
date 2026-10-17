import home from './smoke-home.mjs';
export default { ...home, id: 'geo-smoke-b', steps: [{ ...home.steps[2], chapter: 'Second scene' }] };
