import { generateCommitMessage } from '../core/features/commit-message';
import { isAbsolute, relative, resolve } from 'node:path';

export interface CommitMessageRouteResult {
  status: number;
  body: Record<string, unknown>;
}

export interface CommitMessageRequest {
  workingDir: string;
  selectedPaths: string[];
}

export type GenerateCommitMessage = (
  request: CommitMessageRequest,
  signal?: AbortSignal,
) => Promise<string>;

export async function handleCommitMessageRequest(
  rawBody: string,
  generate: GenerateCommitMessage = generateCommitMessage,
  allowedWorkingDir?: string,
  signal?: AbortSignal,
): Promise<CommitMessageRouteResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { status: 400, body: { error: 'Body must be a JSON object' } };
  }

  const { workingDir, selectedPaths } = parsed as Record<string, unknown>;
  if (typeof workingDir !== 'string' || workingDir.length === 0 || !isAbsolute(workingDir)) {
    if (typeof workingDir !== 'string' || !Array.isArray(selectedPaths)) {
      return {
        status: 400,
        body: { error: 'workingDir and selectedPaths are required' },
      };
    }
    return {
      status: 400,
      body: { error: 'workingDir must be an absolute path' },
    };
  }
  if (!Array.isArray(selectedPaths)) {
    return {
      status: 400,
      body: { error: 'workingDir and selectedPaths are required' },
    };
  }
  if (!allowedWorkingDir) {
    return {
      status: 503,
      body: { error: 'Backend project root is not configured' },
    };
  }
  const root = resolve(allowedWorkingDir);
  const requestedRoot = resolve(workingDir);
  const relativeToRoot = relative(root, requestedRoot);
  if (relativeToRoot !== '' && (relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot))) {
    return {
      status: 403,
      body: { error: 'workingDir is outside the backend project root' },
    };
  }
  if (selectedPaths.length === 0) {
    return { status: 400, body: { error: 'Select at least one file' } };
  }
  if (selectedPaths.some((path) => typeof path !== 'string')) {
    return { status: 400, body: { error: 'selectedPaths must contain only strings' } };
  }

  try {
    const commitMessage = await generate({ workingDir, selectedPaths }, signal);
    return { status: 200, body: { commitMessage } };
  } catch (err) {
    console.error('[node-backend] Commit message generation failed:', err);
    return { status: 500, body: { error: 'Failed to generate commit message' } };
  }
}
