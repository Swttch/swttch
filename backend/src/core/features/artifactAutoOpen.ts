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
 * - an update of an Artifact that already exists (it names the page in `url`),
 * - a failed call,
 * - `CLAUDE_CODE_ARTIFACT_AUTO_OPEN` set to an off value (`0`, `false`, `no`,
 *   `off`), the switch the official docs give for exactly this.
 *
 * It follows the tool call, not a sentence of the result. The result text is the
 * CLI's wording and differs per kind of publish, so the address is only searched
 * for in it, never matched against a fixed phrase.
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
 * Whether an `Artifact` call publishes a new page. An update carries the page's
 * address as `url`; `quickstart`, `list`, `read` and the other actions carry an
 * `action` of their own; a create has neither.
 */
function isFirstPublish(input: Record<string, unknown>): boolean {
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
      if (isFirstPublish(input)) this.pending.add(id);
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
      const url = ARTIFACT_URL.exec(toolResultText(block))?.[0];
      if (url !== undefined) urls.push(url);
    }
    return urls;
  }
}
