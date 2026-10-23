/**
 * Opens an Artifact's page in the browser the moment Claude publishes it for the
 * first time, the way the terminal does (issue #593).
 *
 * A terminal user who runs `/slides` gets the finished deck opened for them
 * right after the first publish. The CLI decides that itself, but only when the
 * session has an interactive UI (its own `hasInteractiveUI`, true for the REPL,
 * the VS Code extension and the desktop app). We spawn it with
 * `-p --input-format stream-json`, which it classes as a print session, so it
 * never opens anything. Measured on a sandbox IDE: no browser window appeared
 * after a publish. That also means there is no second window to avoid: if we do
 * not open the page, nobody does.
 *
 * What the CLI skips, we skip:
 * - an update of an Artifact that already exists,
 * - a failed call,
 * - `CLAUDE_CODE_ARTIFACT_AUTO_OPEN` set to an off value (`0`, `false`, `no`,
 *   `off`), the switch the official docs give for exactly this.
 *
 * Telling a first publish from an update takes the result, not the call. An
 * update does not have to name the page: publishing the same `file_path` again,
 * with or without `edits`, updates the page the CLI bound that file to, and the
 * call carries no `url`. The two result shapes that mean "new" are described at
 * `CREATED_PAGE` and `FIRST_VERSION_PAGE`. Anything else is left alone: opening
 * a tab on every update would be worse than missing one first publish.
 *
 * Timing: like `EditedFileTracker`, the call is recorded from the `assistant`
 * event and acted on when the matching `tool_result` arrives, because the
 * address does not exist before the publish has happened.
 */

const ARTIFACT_TOOL = 'Artifact';

/** The same shape `ArtifactRenderer` links: a page address on claude.ai. */
const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/;

/** The CLI's own reading of the variable: only these four values turn it off. */
const OFF_VALUES = new Set(['0', 'false', 'no', 'off']);

export function isArtifactAutoOpenDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.CLAUDE_CODE_ARTIFACT_AUTO_OPEN;
  if (value === undefined) return false;
  return OFF_VALUES.has(value.toLowerCase().trim());
}

function getContentBlocks(event: Record<string, unknown>): Array<Record<string, unknown>> {
  const message = event['message'] as { content?: unknown } | undefined;
  const content = message?.content;
  return Array.isArray(content) ? (content as Array<Record<string, unknown>>) : [];
}

/** A tool_result's content is a string or a list of text blocks. */
function toolResultText(block: Record<string, unknown>): string {
  const content = block['content'];
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
      ? (part as { text: string }).text
      : ''))
    .join('\n');
}

/**
 * The two ways a result says the page is new, both measured on CLI 2.1.309:
 * - publishing a file: `Published <file> at <address> (Version 1, version id …)`,
 *   where the first publish is Version 1 and the next is Version 2;
 * - creating from an Artifact type (what `/slides` does): `Created a new
 *   Artifact at <address> (version 1792777235-07a8) from the Artifact type …`,
 *   whose parenthesis holds a version id, not a counter, so only the sentence
 *   itself says the page is new.
 */
const CREATED_PAGE = new RegExp(`Created a new Artifact at (${ARTIFACT_URL.source})`, 'i');
const FIRST_VERSION_PAGE = new RegExp(`(${ARTIFACT_URL.source})\\s*\\(version\\s+(\\d+)\\s*[,)]`, 'i');

/** The address of a page this result reports as new, or undefined. */
function newPageUrlFrom(text: string): string | undefined {
  const created = CREATED_PAGE.exec(text);
  if (created !== null) return created[1];
  const published = FIRST_VERSION_PAGE.exec(text);
  if (published !== null && Number(published[2]) === 1) return published[1];
  return undefined;
}

/**
 * Whether an `Artifact` call could publish a page at all. `quickstart`, `list`,
 * `read` and the other actions carry an `action` of their own, and an update
 * that names the page in `url` is one already. Whether the page is new is read
 * from the result, since publishing a file again names no `url`.
 */
function isPublishCall(input: Record<string, unknown>): boolean {
  if (typeof input['url'] === 'string' && input['url'].length > 0) return false;
  const action = input['action'];
  return action === undefined || action === 'publish';
}

export class ArtifactAutoOpener {
  /** toolUseId of `Artifact` calls that would create a page, still awaiting their result. */
  private readonly pending = new Set<string>();

  /** Record first-publish calls from an `assistant` event. No-op for other events. */
  recordPublishes(event: Record<string, unknown>): void {
    if (event['type'] !== 'assistant') return;
    for (const block of getContentBlocks(event)) {
      if (block['type'] !== 'tool_use' || block['name'] !== ARTIFACT_TOOL) continue;
      const id = block['id'];
      if (typeof id !== 'string' || id.length === 0) continue;
      const input = (block['input'] as Record<string, unknown> | undefined) ?? {};
      if (isPublishCall(input)) this.pending.add(id);
    }
  }

  /**
   * Given a `user` event, return the addresses of pages that were just created
   * and should be opened. A recorded call is consumed by its result whether or
   * not it succeeded, so an address is never returned twice.
   */
  collectUrlsToOpen(event: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env): string[] {
    if (event['type'] !== 'user') return [];
    const disabled = isArtifactAutoOpenDisabled(env);

    const urls: string[] = [];
    for (const block of getContentBlocks(event)) {
      if (block['type'] !== 'tool_result') continue;
      const id = block['tool_use_id'];
      if (typeof id !== 'string' || !this.pending.delete(id)) continue;
      if (disabled || block['is_error'] === true) continue;
      const url = newPageUrlFrom(toolResultText(block));
      if (url !== undefined) urls.push(url);
    }
    return urls;
  }
}
