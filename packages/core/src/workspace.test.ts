import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { syncWillClawWorkspaceBootstrap } from './workspace.js';

test('syncWillClawWorkspaceBootstrap seeds the default workspace prompt files', async (t) => {
    const workspaceDir = await mkdtemp(
        path.join(os.tmpdir(), 'willclaw-workspace-bootstrap-'),
    );
    t.after(async () => {
        await rm(workspaceDir, { recursive: true, force: true });
    });

    const result = await syncWillClawWorkspaceBootstrap({
        workspaceDir,
        overwrite: false,
    });

    assert.equal(result.filesWritten.length >= 7, true);
    await assert.doesNotReject(() =>
        Promise.all([
            readFile(path.join(workspaceDir, 'IDENTITY.md'), 'utf8'),
            readFile(path.join(workspaceDir, 'AGENTS.md'), 'utf8'),
            readFile(path.join(workspaceDir, 'RULES.md'), 'utf8'),
            readFile(path.join(workspaceDir, 'WORK_MODES.md'), 'utf8'),
            readFile(path.join(workspaceDir, 'MEMORY.md'), 'utf8'),
            readFile(path.join(workspaceDir, 'HEARTBEAT.md'), 'utf8'),
            readFile(path.join(workspaceDir, 'PROJECT_HEARTBEAT.md'), 'utf8'),
        ]),
    );
});
