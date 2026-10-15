import { build } from 'esbuild';
const repo = process.argv[4];
await build({ entryPoints: [process.argv[2]], outfile: process.argv[3], bundle: true, platform: 'browser', format: 'esm', target: 'chrome120',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"' },
  loader: { '.js': 'jsx' }, jsx: 'automatic',
  plugins: [{ name: 'at', setup(b) { b.onResolve({ filter: /^@\// }, (a) => b.resolve(`./${a.path.slice(2)}`, { resolveDir: `${repo}/src`, kind: a.kind })); } }],
  logLevel: 'warning' });
