import { spawn } from 'node:child_process';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(currentDir, '..');
const sourceDir = path.join(packageDir, 'src');
const testDistDir = path.join(packageDir, '.test-dist');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

async function collectTestFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
        entries.map(async (entry) => {
            const resolvedPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                return await collectTestFiles(resolvedPath);
            }

            return entry.name.endsWith('.test.ts') ? [resolvedPath] : [];
        }),
    );

    return files.flat();
}

const testFiles = await collectTestFiles(sourceDir);
if (testFiles.length === 0) {
    console.error('No test files found in packages/core/src.');
    process.exit(1);
}

const relativeTestFiles = testFiles.map((filePath) =>
    path.relative(packageDir, filePath),
);
const builtTestFiles = relativeTestFiles.map((filePath) =>
    path.join(
        testDistDir,
        path.relative('src', filePath).replace(/\.ts$/, '.js'),
    ),
);

let exitCode = 1;

try {
    await rm(testDistDir, { recursive: true, force: true });
    await mkdir(testDistDir, { recursive: true });

    await new Promise((resolve, reject) => {
        const child = spawn(
            pnpmCommand,
            [
                'exec',
                'tsc',
                '--module',
                'nodenext',
                '--moduleResolution',
                'nodenext',
                '--target',
                'es2023',
                '--outDir',
                '.test-dist',
                '--rootDir',
                'src',
                '--types',
                'node',
                ...relativeTestFiles,
            ],
            {
                cwd: packageDir,
                stdio: 'inherit',
            },
        );
        child.once('error', reject);
        child.once('exit', (code) => {
            if (code === 0) {
                resolve(undefined);
                return;
            }

            reject(new Error(`Test compilation failed with exit code ${code ?? 1}.`));
        });
    });

    exitCode = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--test', ...builtTestFiles], {
            cwd: packageDir,
            stdio: 'inherit',
        });
        child.once('error', reject);
        child.once('exit', (code) => resolve(code ?? 1));
    });
} finally {
    await rm(testDistDir, { recursive: true, force: true });
}

process.exit(exitCode);
