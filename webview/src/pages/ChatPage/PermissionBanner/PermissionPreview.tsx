import type { ReactNode } from 'react';
import { FILE_EDIT_TOOLS } from '@/shared';
import { HighlightedCode } from '../message-renderers/ToolRenderers/Mcp/Generic/HighlightedCode';
import { McpInputFields } from '../message-renderers/ToolRenderers/Mcp/Generic/McpIoCard';
import { mcpInputEntries } from '../message-renderers/ToolRenderers/Mcp/Generic/formatMcpPayload';

/**
 * What the permission prompt is asking about, drawn inside the prompt (#673).
 *
 * A prompt that names the tool but not the thing it will run leaves the user
 * approving blind. The message above it can carry the call (the tool card), but
 * a request from a subagent has no such card in this chat, so the prompt has to
 * hold the subject itself.
 *
 * Scope is deliberately narrow: only tools whose prompt shows nothing today get
 * something here. The file tools already name their file (and open the review),
 * and Workflow already has its own description and notice, so they return
 * nothing and keep their prompt exactly as it was.
 */

const SHELL_TOOLS: Record<string, { prompt: string; language: string }> = {
  Bash: { prompt: '$', language: 'bash' },
  PowerShell: { prompt: '>', language: 'powershell' },
};

/** A tool whose prompt already says what it is about, so nothing is added. */
function hasOwnPrompt(toolName: string): boolean {
  return toolName === 'Workflow' || (FILE_EDIT_TOOLS as readonly string[]).includes(toolName)
    || toolName === 'Delete' || toolName === 'Read';
}

function isShellTool(toolName: string): boolean {
  return Object.prototype.hasOwnProperty.call(SHELL_TOOLS, toolName);
}

function asInput(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

/**
 * The one-line description a shell request carries, shown under the heading as
 * the desktop app does. Empty (nothing drawn) when the request has none.
 */
export function permissionSubtitle(toolName: string, rawInput: unknown): string | undefined {
  if (!isShellTool(toolName)) return undefined;
  const description = asInput(rawInput).description;
  return typeof description === 'string' && description.trim() !== '' ? description.trim() : undefined;
}

/**
 * The content between the heading and the options, or null when this tool's
 * prompt has nothing to add (or the request carries nothing to show).
 */
export function permissionPreview(toolName: string, rawInput: unknown): ReactNode | null {
  if (hasOwnPrompt(toolName)) return null;
  const input = asInput(rawInput);

  if (isShellTool(toolName)) {
    const command = input.command;
    if (typeof command !== 'string' || command.trim() === '') return null;
    const { prompt, language } = SHELL_TOOLS[toolName];
    return (
      // Never clamped: the point is to read the whole command before allowing
      // it, and the panel already scrolls when it does not fit.
      <div
        dir="ltr"
        data-testid="permission-command"
        className="rounded-md border border-border-subtle bg-[var(--md-code-block-bg)] p-2.5 font-mono text-[0.8461rem] whitespace-pre-wrap break-words text-text-primary/80"
      >
        <span className="select-none text-text-tertiary">{prompt} </span>
        <HighlightedCode text={command} language={language} />
      </div>
    );
  }

  // MCP tools and every other tool without a prompt of its own: the arguments,
  // one captioned field per key. `McpInputFields` takes values of any type, so
  // a non-string (`path: ["a","b"]`) is shown rather than crashing the chat.
  const entries = mcpInputEntries(input);
  if (!entries) return null;
  return (
    <div data-testid="permission-arguments" className="text-[0.9231rem] leading-normal px-0.5">
      <McpInputFields entries={entries} />
    </div>
  );
}
