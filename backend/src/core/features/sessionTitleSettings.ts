import { readMergedSettings } from './settings';

/**
 * The two switches that decide how a session is named, read as the settings screen
 * shows them: the project's own value where it set one, else the global one, else
 * the default. A settings file that lacks a key (or cannot be read) behaves as the
 * default does, which is on for both.
 */

/**
 * Whether a session with neither a name nor a generated title is listed under
 * its newest prompt.
 */
export async function includeLastPromptInTitles(projectDir?: string): Promise<boolean> {
  const { settings } = await readMergedSettings(projectDir);
  return settings.sessionTitleFromLastPrompt !== false;
}

/**
 * Whether the first send of a new session also asks the CLI for a session title.
 */
export async function generateSessionTitlesEnabled(projectDir?: string): Promise<boolean> {
  const { settings } = await readMergedSettings(projectDir);
  return settings.generateSessionTitles !== false;
}
