import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(currentDir, '..');
const distDir = path.join(packageDir, 'dist');
const assetsDir = path.join(distDir, 'assets');
const staticDir = path.join(packageDir, 'static');

await rm(distDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });

await build({
    entryPoints: [path.join(packageDir, 'src/main.tsx')],
    bundle: true,
    outfile: path.join(assetsDir, 'app.js'),
    format: 'esm',
    sourcemap: true,
    target: ['es2022'],
    jsx: 'automatic',
    loader: {
        '.svg': 'dataurl',
    },
});

await cp(staticDir, distDir, { recursive: true });
