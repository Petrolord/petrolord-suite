// Bundles the worker for its image (run by deploy.sh on the studio VPS, from
// the exact commit being deployed). The worker imports the vendored engines
// and Seismolord's own import services, which use extensionless and '@/'
// imports that only Vite and jest resolve; esbuild resolves them the same
// way here, and TypeScript (the shared SigV4 presigner) is stripped.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const outdir = process.argv[2] || path.join(here, 'dist');

const atAlias = {
  name: 'suite-at-alias',
  setup(b) {
    b.onResolve({ filter: /^@\// }, (args) => b.resolve(`./${args.path.slice(2)}`, { resolveDir: path.join(repo, 'src'), kind: args.kind }));
  },
};

await build({
  entryPoints: { main: path.join(here, 'src/main.js'), selfcheck: path.join(here, 'src/selfcheck.js') },
  outdir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  plugins: [atAlias],
  // CommonJS dependencies inside an ESM bundle still call require()
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
  metafile: true,
}).then((r) => {
  const inputs = Object.keys(r.metafile.inputs);
  const count = (re) => inputs.filter((i) => re.test(i)).length;
  console.log(`bundled ${inputs.length} modules (engines ${count(/packages\/engines/)}, seismolord ${count(/apps\/Seismolord/)}, react ${count(/node_modules\/react\//)}) into ${outdir}`);
});
