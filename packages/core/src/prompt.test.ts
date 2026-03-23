import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { WillClawConfig } from './config.js';
import type { WillClawPaths } from './paths.js';
import { PromptAssembler } from './prompt.js';

async function createWorkspaceFixture(
    files: Record<string, string>,
): Promise<string> {
    const workspaceDir = await mkdtemp(
        path.join(os.tmpdir(), 'willclaw-prompt-test-'),
    );

    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(workspaceDir, relativePath);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, content, 'utf8');
    }

    return workspaceDir;
}

function createPromptAssembler(
    workspaceDir: string,
    includeFiles: string[] = [],
): PromptAssembler {
    return new PromptAssembler(
        {
            workspace: {
                bootstrapMaxChars: 20_000,
                bootstrapTotalMaxChars: 100_000,
                include_files: includeFiles,
            },
        } as WillClawConfig,
        {
            workspaceDir,
        } as WillClawPaths,
    );
}

test('assembleSystemPrompt includes configured workspace files after bootstrap files', async (t) => {
    const workspaceDir = await createWorkspaceFixture({
        'AGENTS.md': 'Agent rules',
        'docs/PROJECT.md': 'Project context',
        'skills/custom/SKILL.md': 'Custom skill',
    });
    t.after(async () => {
        await rm(workspaceDir, { recursive: true, force: true });
    });

    const assembler = createPromptAssembler(workspaceDir, [
        'docs/PROJECT.md',
        'AGENTS.md',
    ]);
    const result = await assembler.assembleSystemPrompt({
        extraFiles: ['skills/custom/SKILL.md', 'docs/PROJECT.md'],
    });

    assert.deepEqual(
        result.sections.map((section) => section.name),
        ['AGENTS.md', 'docs/PROJECT.md', 'skills/custom/SKILL.md', 'Runtime Context'],
    );
});

test('assembleSystemPrompt rejects configured include files outside the workspace', async (t) => {
    const workspaceDir = await createWorkspaceFixture({
        'AGENTS.md': 'Agent rules',
    });
    t.after(async () => {
        await rm(workspaceDir, { recursive: true, force: true });
    });

    const assembler = createPromptAssembler(workspaceDir, ['../outside.md']);

    await assert.rejects(() => assembler.assembleSystemPrompt(), {
        message:
            'Prompt include path must stay within the workspace directory: ../outside.md',
    });
});

test('assembleSystemPrompt rejects non-Markdown include files', async (t) => {
    const workspaceDir = await createWorkspaceFixture({
        'AGENTS.md': 'Agent rules',
    });
    t.after(async () => {
        await rm(workspaceDir, { recursive: true, force: true });
    });

    const assembler = createPromptAssembler(workspaceDir, ['docs/project.txt']);

    await assert.rejects(() => assembler.assembleSystemPrompt(), {
        message: 'Prompt include path must point to a Markdown file: docs/project.txt',
    });
});
