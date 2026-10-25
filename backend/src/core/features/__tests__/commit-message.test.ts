import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildClaudeCommitMessageArgs,
  buildCommitMessagePrompt,
  cleanCommitMessage,
  collectCommitMessageContext,
  generateCommitMessage,
} from '../commit-message';

function createGitRepository(): string {
  const root = createEmptyGitRepository();
  writeFileSync(join(root, 'tracked.txt'), 'First\n');
  execFileSync('git', ['add', 'tracked.txt'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'feat: initial tracked file'], { cwd: root });
  return root;
}

function createEmptyGitRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'ccg-commit-message-'));
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: root });
  return root;
}

describe('collectCommitMessageContext', () => {
  it('collects tracked and untracked content only for selected paths', async () => {
    const root = createGitRepository();
    try {
      writeFileSync(join(root, 'tracked.txt'), 'First\nUpdated\n');
      writeFileSync(join(root, 'new.ts'), 'export const value = 1;\n');
      writeFileSync(join(root, 'unselected.txt'), 'Ignore me\n');

      const context = await collectCommitMessageContext(root, ['tracked.txt', 'new.ts']);

      expect(context.diff).toContain('diff --git a/tracked.txt b/tracked.txt');
      expect(context.diff).toContain('+Updated');
      expect(context.diff).toContain('+++ b/new.ts');
      expect(context.diff).toContain('+export const value = 1;');
      expect(context.diff).not.toContain('unselected.txt');
      expect(context.recentCommitMessages).toContain('feat: initial tracked file');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats a selected filename containing a wildcard literally', async () => {
    const root = createGitRepository();
    try {
      writeFileSync(join(root, 'literal*.txt'), 'Selected literal filename\n');
      writeFileSync(join(root, 'literal-other.txt'), 'Unchecked sibling\n');

      const context = await collectCommitMessageContext(root, ['literal*.txt']);

      expect(context.diff).toContain('+++ b/literal*.txt');
      expect(context.diff).not.toContain('literal-other.txt');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats a tracked wildcard filename literally against HEAD', async () => {
    const root = createEmptyGitRepository();
    try {
      writeFileSync(join(root, 'literal*.txt'), 'Selected base\n');
      writeFileSync(join(root, 'literal-other.txt'), 'Unchecked base\n');
      execFileSync('git', ['add', '.'], { cwd: root });
      execFileSync('git', ['commit', '-m', 'feat: initial files'], { cwd: root });
      writeFileSync(join(root, 'literal*.txt'), 'Selected base\nUpdated\n');
      writeFileSync(join(root, 'literal-other.txt'), 'Unchecked base\nUpdated\n');

      const context = await collectCommitMessageContext(root, ['literal*.txt']);

      expect(context.diff).toContain('literal*.txt');
      expect(context.diff).not.toContain('literal-other.txt');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats a staged and unstaged tracked wildcard filename literally without HEAD', async () => {
    const root = createEmptyGitRepository();
    try {
      writeFileSync(join(root, 'literal*.txt'), 'Selected staged\n');
      writeFileSync(join(root, 'literal-other.txt'), 'Unchecked staged\n');
      execFileSync('git', ['add', '.'], { cwd: root });
      writeFileSync(join(root, 'literal*.txt'), 'Selected staged\nUpdated\n');
      writeFileSync(join(root, 'literal-other.txt'), 'Unchecked staged\nUpdated\n');

      const context = await collectCommitMessageContext(root, ['literal*.txt']);

      expect(context.diff).toContain('literal*.txt');
      expect(context.diff).not.toContain('literal-other.txt');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignores repository-configured external diff commands', async () => {
    const root = createGitRepository();
    try {
      writeFileSync(join(root, 'tracked.txt'), 'First\nExternal diff\n');
      execFileSync('git', ['config', 'diff.external', 'echo'], { cwd: root });

      const context = await collectCommitMessageContext(root, ['tracked.txt']);

      expect(context.diff).toContain('diff --git a/tracked.txt b/tracked.txt');
      expect(context.diff).toContain('+External diff');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a selected path outside the project root', async () => {
    const root = createGitRepository();
    try {
      await expect(collectCommitMessageContext(root, ['../outside.txt']))
        .rejects.toThrow(/outside the project root/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('collects untracked changes in a repository without commits', async () => {
    const root = createEmptyGitRepository();
    try {
      writeFileSync(join(root, 'initial.txt'), 'Initial content\n');

      const context = await collectCommitMessageContext(root, ['initial.txt']);

      expect(context.diff).toContain('+++ b/initial.txt');
      expect(context.diff).toContain('+Initial content');
      expect(context.recentCommitMessages).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('collects staged and unstaged content in a repository without commits', async () => {
    const root = createEmptyGitRepository();
    try {
      const path = join(root, 'initial.txt');
      writeFileSync(path, 'Staged content\n');
      execFileSync('git', ['add', 'initial.txt'], { cwd: root });
      writeFileSync(path, 'Staged content\nWorking content\n');

      const context = await collectCommitMessageContext(root, ['initial.txt']);

      expect(context.diff).toContain('+Staged content');
      expect(context.diff).toContain('+Working content');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts a filename beginning with two dots', async () => {
    const root = createGitRepository();
    try {
      writeFileSync(join(root, '..env'), 'NODE_ENV=test\n');

      const context = await collectCommitMessageContext(root, ['..env']);

      expect(context.diff).toContain('+++ b/..env');
      expect(context.diff).toContain('+NODE_ENV=test');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a pathspec that expands to more untracked files than allowed', async () => {
    const root = createEmptyGitRepository();
    try {
      mkdirSync(join(root, 'files'));
      for (let index = 1; index <= 501; index += 1) {
        writeFileSync(join(root, 'files', `file-${String(index).padStart(3, '0')}.txt`), 'content\n');
      }

      await expect(collectCommitMessageContext(root, ['files']))
        .rejects.toThrow(/at most 500 selected files/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('buildCommitMessagePrompt', () => {
  it('includes repository history and commit-message constraints', () => {
    const prompt = buildCommitMessagePrompt({
      diff: 'diff --git a/new.ts b/new.ts\n+export const value = 1;',
      recentCommitMessages: ['feat: initial tracked file'],
    });

    expect(prompt).toContain('recent commit messages');
    expect(prompt).toContain('feat: initial tracked file');
    expect(prompt).toContain('Conventional Commits');
    expect(prompt).toContain('first line under 72 characters');
    expect(prompt).toContain('Never split a sentence or bullet in the middle');
    expect(prompt).not.toContain('Wrap body lines at 72 characters');
    expect(prompt).toContain('Return only the commit message');
  });
});

describe('buildClaudeCommitMessageArgs', () => {
  it('starts Claude without tools, hooks, or session persistence and uses low effort', () => {
    expect(buildClaudeCommitMessageArgs()).toEqual([
      '-p',
      '--no-session-persistence',
      '--output-format',
      'text',
      '--model',
      'haiku',
      '--tools=',
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--effort',
      'low',
      '--restricted',
    ]);
  });
});

describe('cleanCommitMessage', () => {
  it('removes code fences and surrounding whitespace without altering the message', () => {
    const message = cleanCommitMessage(
      '```text\nfeat: add selected-change commit messages\n\n- Read selected diffs\n```\n',
    );

    expect(message).toBe('feat: add selected-change commit messages\n\n- Read selected diffs');
  });
});

describe('generateCommitMessage', () => {
  it('uses collected git context and cleans the model response', async () => {
    const root = createGitRepository();
    try {
      writeFileSync(join(root, 'tracked.txt'), 'First\nUpdated\n');
      let receivedPrompt = '';
      const commitMessage = await generateCommitMessage({
        selectedPaths: ['tracked.txt'],
        workingDir: root,
        runClaude: async (prompt) => {
          receivedPrompt = prompt;
          return '```text\nfeat: update tracked file\n```';
        },
      });

      expect(receivedPrompt).toContain('diff --git a/tracked.txt b/tracked.txt');
      expect(receivedPrompt).toContain('feat: initial tracked file');
      expect(commitMessage).toBe('feat: update tracked file');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an empty selected-path list before running Claude', async () => {
    const root = resolve('/unused');
    await expect(generateCommitMessage({
      selectedPaths: [],
      workingDir: root,
      runClaude: async () => 'should not run',
    })).rejects.toThrow(/select at least one file/i);
  });
});
