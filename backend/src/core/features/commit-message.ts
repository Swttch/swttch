import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Command } from '../command';
import { Claude } from '../claude';
import { readMergedClaudeSettings } from './claude-settings';

const MAX_SELECTED_PATHS = 500;
const MAX_PATH_LENGTH = 4_096;
const MAX_DIFF_CHARS = 120_000;
const RECENT_COMMIT_COUNT = 20;
const CLAUDE_TIMEOUT_MS = 120_000;
const MAX_CLAUDE_OUTPUT_CHARS = 16_000;
const MAX_PATHS_PER_GIT_COMMAND = 64;
const MAX_PATHSPEC_CHARS_PER_GIT_COMMAND = 8_000;
const LITERAL_PATHSPEC_ENV: NodeJS.ProcessEnv = { GIT_LITERAL_PATHSPECS: '1' };
const OFFICIAL_ANTHROPIC_HOST = 'api.anthropic.com';

interface GitOutput {
  stdout: string;
  stderr: string;
}

interface CommitMessageContext {
  diff: string;
  recentCommitMessages: string[];
}

export interface GenerateCommitMessageOptions {
  workingDir: string;
  selectedPaths: string[];
  signal?: AbortSignal;
  runClaude?: (prompt: string, workingDir: string, signal?: AbortSignal) => Promise<string>;
}

async function runGit(
  args: string[],
  cwd: string,
  acceptedExitCodes: number[] = [0],
  env?: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<GitOutput> {
  if (signal?.aborted) throw new Error('Commit message generation cancelled');
  try {
    return await new Command('git', args, {
      cwd,
      timeout: 10_000,
      maxBuffer: 2 * 1_024 * 1_024,
      env,
      signal,
    }).exec();
  } catch (err) {
    const error = err as Error & { stdout?: string; stderr?: string; code?: number };
    if (error.code !== undefined && acceptedExitCodes.includes(error.code)) {
      return { stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
    }
    throw err;
  }
}

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n... [truncated ${text.length - limit} characters]`;
}

function normalizeSelectedPath(workingDir: string, selectedPath: string): string {
  if (selectedPath.length === 0 || selectedPath.length > MAX_PATH_LENGTH) {
    throw new Error('Each selected path must be a non-empty string of at most 4096 characters');
  }

  const absolutePath = resolve(workingDir, selectedPath);
  const relativePath = relative(resolve(workingDir), absolutePath);
  if (relativePath.length === 0 || relativePath.split(sep)[0] === '..' || isAbsolute(relativePath)) {
    throw new Error('A selected path is outside the project root');
  }
  return relativePath.split(sep).join('/');
}

function normalizeSelectedPaths(workingDir: string, selectedPaths: string[]): string[] {
  if (selectedPaths.length === 0) {
    throw new Error('Select at least one file before generating a commit message');
  }
  if (selectedPaths.length > MAX_SELECTED_PATHS) {
    throw new Error(`A commit message can use at most ${MAX_SELECTED_PATHS} selected files`);
  }

  const normalized = selectedPaths.map((selectedPath) => normalizeSelectedPath(workingDir, selectedPath));
  return [...new Set(normalized)];
}

export async function collectCommitMessageContext(
  workingDir: string,
  selectedPaths: string[],
  signal?: AbortSignal,
): Promise<CommitMessageContext> {
  const paths = normalizeSelectedPaths(workingDir, selectedPaths);
  const hasHead = (await runGit(
    ['rev-parse', '--verify', '--quiet', 'HEAD'],
    workingDir,
    [0, 1],
    undefined,
    signal,
  )).stdout.trim().length > 0;

  const pathspecChunks = chunkPathspecs(paths);
  const diffCommands = pathspecChunks.flatMap((chunk) => hasHead
    ? [['diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--', ...chunk]]
    : [
        ['diff', '--no-ext-diff', '--no-textconv', '--cached', '--', ...chunk],
        ['diff', '--no-ext-diff', '--no-textconv', '--', ...chunk],
      ]);
  const [trackedDiffs, untrackedOutput, log] = await Promise.all([
    Promise.all(diffCommands.map((args) => runGit(
      args,
      workingDir,
      [0],
      LITERAL_PATHSPEC_ENV,
      signal,
    ))).then((outputs) => outputs.map((output) => output.stdout)),
    Promise.all(pathspecChunks.map((chunk) => runGit(
      ['ls-files', '--others', '--exclude-standard', '--deduplicate', '-z', '--', ...chunk],
      workingDir,
      [0],
      LITERAL_PATHSPEC_ENV,
      signal,
    ))).then((outputs) => outputs.map((output) => output.stdout).join('')),
    runGit(
      ['log', `-n${RECENT_COMMIT_COUNT}`, '--pretty=oneline'],
      workingDir,
      hasHead ? [0] : [0, 128],
      undefined,
      signal,
    ),
  ]);

  const untrackedPaths = untrackedOutput
    .split('\0')
    .map((path) => path.trim())
    .filter(Boolean);
  if (untrackedPaths.length > paths.length) {
    throw new Error(`A commit message can use at most ${MAX_SELECTED_PATHS} selected files`);
  }

  const diffParts = trackedDiffs.map((diff) => diff.trim()).filter(Boolean);
  let diffLength = diffParts.join('\n').length;
  for (const path of untrackedPaths) {
    if (diffLength >= MAX_DIFF_CHARS) break;
    const diff = await runGit(
      ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--', '/dev/null', path],
      workingDir,
      [0, 1],
      LITERAL_PATHSPEC_ENV,
      signal,
    );
    const trimmedDiff = diff.stdout.trim();
    if (trimmedDiff) {
      diffParts.push(trimmedDiff);
      diffLength += trimmedDiff.length + 1;
    }
  }

  const diff = diffParts.filter(Boolean).join('\n');
  if (!diff) throw new Error('The selected files contain no changes');

  return {
    diff: truncateText(diff, MAX_DIFF_CHARS),
    // `--pretty=oneline` instead of `format:%s`: on Windows, Command refuses any argument
    // containing '%' because cmd.exe would expand it. The leading hash is dropped here.
    recentCommitMessages: log.stdout
      .split('\n')
      .map((line) => line.replace(/^[0-9a-f]{7,64}\s+/i, '').trim())
      .filter(Boolean),
  };
}

function chunkPathspecs(paths: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;
  for (const path of paths) {
    const shouldStartChunk = current.length === MAX_PATHS_PER_GIT_COMMAND
      || currentLength + path.length + 1 > MAX_PATHSPEC_CHARS_PER_GIT_COMMAND;
    if (shouldStartChunk && current.length > 0) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(path);
    currentLength += path.length + 1;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function buildCommitMessagePrompt(context: CommitMessageContext): string {
  return [
    'Generate a commit message for the selected code changes.',
    '',
    'Rules:',
    '- Follow the style, language, and scope conventions of the recent commit messages when they are consistent.',
    '- Otherwise use Conventional Commits with a lowercase imperative subject and an optional scope.',
    '- Keep the first line under 72 characters.',
    '- Include a body only when the selected changes contain multiple logical points.',
    '- Put each body line on one complete logical point or sentence.',
    '- Never split a sentence or bullet in the middle; a body line may exceed 72 characters.',
    '- If a point is too long, split it into separate bullets at logical boundaries.',
    '- Describe only changes present in the diff; do not invent implementation details.',
    '- Return only the commit message, with no explanation or code fence.',
    '',
    'Recent commit messages:',
    context.recentCommitMessages.length > 0
      ? context.recentCommitMessages.join('\n')
      : '(none)',
    '',
    'Selected changes:',
    context.diff,
  ].join('\n');
}

export function cleanCommitMessage(output: string): string {
  const trimmed = output.trim();
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(trimmed);
  const message = (fenced?.[1] ?? trimmed).trim();
  if (!message) throw new Error('Claude returned an empty commit message');
  return message;
}

export function buildClaudeCommitMessageArgs(restricted = true, lowEffort = true): string[] {
  return [
    '-p',
    '--no-session-persistence',
    '--output-format',
    'text',
    '--model',
    'haiku',
    // `--tools=` (one token): an empty argument would be dropped by the Windows shell spawn.
    '--tools=',
    '--strict-mcp-config',
    '--disable-slash-commands',
    ...(lowEffort ? ['--effort', 'low'] : []),
    ...(restricted ? ['--restricted'] : []),
  ];
}

function readStringEnvValue(settings: Record<string, unknown>, key: string): string | undefined {
  const env = settings.env;
  if (!env || typeof env !== 'object' || Array.isArray(env)) return undefined;
  const value = (env as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function supportsRestrictedMode(settings: Record<string, unknown>): boolean {
  const baseUrl = readStringEnvValue(settings, 'ANTHROPIC_BASE_URL')
    ?? process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl) return true;
  try {
    return new URL(baseUrl).hostname === OFFICIAL_ANTHROPIC_HOST;
  } catch {
    return false;
  }
}

async function runClaudeCommitMessageOnce(
  prompt: string,
  workingDir: string,
  restricted: boolean,
  lowEffort: boolean,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw new Error('Commit message generation cancelled');

  const proc = await Claude.spawnAuthed(
    buildClaudeCommitMessageArgs(restricted, lowEffort),
    workingDir,
    {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { TERM: 'dumb', CI: 'true', CLAUDECODE: undefined },
      detached: process.platform !== 'win32',
    },
  );

  if (signal?.aborted) {
    Claude.killTree(proc);
    return Promise.reject(new Error('Commit message generation cancelled'));
  }

  return new Promise((resolvePromise, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const abort = (): void => {
      settle(() => reject(new Error('Commit message generation cancelled')));
      Claude.killTree(proc);
    };
    const settle = (finish: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finish();
    };

    const timer = setTimeout(() => {
      settle(() => reject(new Error('Claude commit-message generation timed out')));
      Claude.killTree(proc);
    }, CLAUDE_TIMEOUT_MS);

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > MAX_CLAUDE_OUTPUT_CHARS) {
        settle(() => reject(new Error('Claude commit-message output is too large')));
        Claude.killTree(proc);
      }
    });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', (err) => settle(() => reject(err)));
    proc.on('close', (code) => settle(() => {
      if (code === 0 && stdout.trim()) {
        resolvePromise(stdout);
      } else {
        reject(new Error(stderr.trim() || `Claude exited with code ${code}`));
      }
    }));
    proc.stdin?.on('error', () => undefined);
    proc.stdin?.end(prompt, 'utf8');
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function runClaudeCommitMessage(
  prompt: string,
  workingDir: string,
  signal?: AbortSignal,
): Promise<string> {
  const { settings } = await readMergedClaudeSettings(workingDir);

  let supportsRestricted = supportsRestrictedMode(settings);
  let supportsLowEffort = true;
  while (true) {
    try {
      return await runClaudeCommitMessageOnce(
        prompt,
        workingDir,
        supportsRestricted,
        supportsLowEffort,
        signal,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (supportsLowEffort && message.includes("unknown option '--effort'")) {
        supportsLowEffort = false;
        continue;
      }
      if (supportsRestricted && message.includes("unknown option '--restricted'")) {
        supportsRestricted = false;
        continue;
      }
      throw err;
    }
  }
}

export async function generateCommitMessage(
  options: GenerateCommitMessageOptions,
): Promise<string> {
  if (options.signal?.aborted) throw new Error('Commit message generation cancelled');
  const paths = normalizeSelectedPaths(options.workingDir, options.selectedPaths);
  const context = await collectCommitMessageContext(options.workingDir, paths, options.signal);
  if (options.signal?.aborted) throw new Error('Commit message generation cancelled');
  const prompt = buildCommitMessagePrompt(context);
  const runClaude = options.runClaude ?? runClaudeCommitMessage;
  return cleanCommitMessage(await runClaude(prompt, options.workingDir, options.signal));
}
