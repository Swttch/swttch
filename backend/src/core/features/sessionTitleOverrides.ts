import { mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { updateJsonFile } from './atomic-json';

const OVERRIDES_FILE = '.claude-code-gui-session-titles.json';

type TitleOverrides = Record<string, string>;

function getOverridesFile(sessionsPath: string): string {
  return join(sessionsPath, OVERRIDES_FILE);
}

export async function readSessionTitleOverrides(sessionsPath: string): Promise<TitleOverrides> {
  try {
    const raw = await readFile(getOverridesFile(sessionsPath), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    ) as TitleOverrides;
  } catch {
    return {};
  }
}

/**
 * Every title the user typed lives in this one file, so renaming one session must
 * not be able to take the others with it: the save is atomic, and a file that
 * exists but cannot be parsed aborts the save instead of being replaced by a
 * file holding only the title just entered (issue #386).
 */
export async function writeSessionTitleOverride(
  sessionsPath: string,
  sessionId: string,
  title: string,
): Promise<void> {
  await mkdir(sessionsPath, { recursive: true });
  await updateJsonFile(getOverridesFile(sessionsPath), (current) => {
    current[sessionId] = title;
    return current;
  });
}

export async function removeSessionTitleOverride(
  sessionsPath: string,
  sessionId: string,
): Promise<void> {
  await updateJsonFile(getOverridesFile(sessionsPath), (current) => {
    if (!(sessionId in current)) return null;
    delete current[sessionId];
    return current;
  });
}
