// Bundles the worker for its image (run by deploy.sh on the studio VPS, from
// the exact commit being deployed). The worker imports the vendored engines
// and Seismolord's own import services, which use extensionless and '@/'
// imports that only Vite and jest resolve; esbuild resolves them the same
// way here, and TypeScript (the shared SigV4 presigner) is stripped.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, existsSync } from 'node:fs';

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
  // jobThread: each job's handler runs in a worker thread started from it (threadJobs.js)
  entryPoints: { main: path.join(here, 'src/main.js'), selfcheck: path.join(here, 'src/selfcheck.js'), jobThread: path.join(here, 'src/jobThread.js') },
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
  // the ZFP decoder for compressed ZGY (zgySource.js reads it beside the bundle)
  // (deploy.sh builds from `git archive`, whose tracked node_modules predates
  // wasm-zfp, so the deploying checkout's own node_modules is looked in too)
  const wasm = [repo, process.cwd()].map((d) => path.join(d, 'node_modules/wasm-zfp/dist/wasm-zfp.wasm')).find((f) => existsSync(f));
  if (!wasm) throw new Error('wasm-zfp.wasm not found: run npm install (wasm-zfp is a dependency).');
  copyFileSync(wasm, path.join(outdir, 'wasm-zfp.wasm'));
  const inputs = Object.keys(r.metafile.inputs);
  const count = (re) => inputs.filter((i) => re.test(i)).length;
  console.log(`bundled ${inputs.length} modules (engines ${count(/packages\/engines/)}, seismolord ${count(/apps\/Seismolord/)}, react ${count(/node_modules\/react\//)}) into ${outdir}`);
});
