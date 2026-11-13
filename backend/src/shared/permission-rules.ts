/**
 * Permission rules (session-scoped ones, and the CLI's own suggested "always allow"), as the CLI's permission
 * protocol expresses them.
 *
 * "Yes, allow all edits this session" used to be kept on our side: the webview
 * remembered a tool name in a React ref and silently auto-answered later
 * prompts for it. Three things were wrong with holding it there. The CLI kept
 * asking (we were hiding the question, not answering it), the memory died with
 * the render, and it covered one tool name while Claude edits files through
 * several (#393).
 *
 * `updatedPermissions` on the allow branch is the documented way to say the
 * same thing to the CLI itself. Measured against CLI 2.1.170 with a control
 * group in the same run: the CLI asked for the first Write, took the rule, and
 * made the remaining three writes without asking.
 */

/**
 * The tools Claude writes files with.
 *
 * One list, used by everything that has to reason about "an edit": the IDE
 * refresh after a write, and the session rule below. Two copies drifted apart
 * once already, and a tool missing from one of them is invisible until a user
 * hits exactly that tool.
 */
export const FILE_EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] as const;

/** A single rule in a permission update. */
export interface PermissionRule {
  toolName: string;
  /**
   * What the rule narrows the tool to, in the CLI's own rule syntax (for Bash a command prefix such as
   * `mkdir:*`). Absent means the whole tool.
   */
  ruleContent?: string;
}

/** One entry of the `updatedPermissions` array on an allow response. */
export interface PermissionUpdate {
  type: 'addRules';
  rules: PermissionRule[];
  behavior: 'allow';
  /**
   * Where the rule lives. `session` lasts for this CLI run and is written to no settings file; the others are the
   * settings files the CLI itself writes "don't ask again" rules to.
   */
  destination: PermissionDestination;
}

/** Where a permission rule can be installed, in the CLI's own words. */
export type PermissionDestination = 'session' | 'localSettings' | 'projectSettings' | 'userSettings';

const PERMISSION_DESTINATIONS: readonly string[] = ['session', 'localSettings', 'projectSettings', 'userSettings'];

/**
 * The words the desktop app uses for where an "always allow" is kept (its own names for the destinations):
 * this session only, the project's settings, the project's local settings, the user's settings.
 */
export type PermissionScope = 'session' | 'project' | 'projectLocal' | 'user';

const SCOPE_OF_DESTINATION: Record<PermissionDestination, PermissionScope> = {
  session: 'session',
  projectSettings: 'project',
  localSettings: 'projectLocal',
  userSettings: 'user',
};

/**
 * The rules to send when the user answers "yes, and stop asking this session".
 *
 * An edit tool grants the whole edit family rather than just itself, because
 * the user answering the question is not choosing between `Edit` and `Write` —
 * they are saying they do not want to be asked about edits again, and Claude
 * picks among those tools on its own. Granting only the tool that happened to
 * ask means the next prompt arrives from a different one and the answer looks
 * ignored.
 *
 * Every other tool grants only itself. "Allow all commands this session" is a
 * far larger thing to hand over than "allow all edits", and widening it to
 * neighbours nobody named would give away more than the label promises.
 */
export function buildSessionPermissionUpdate(toolName: string): PermissionUpdate[] {
  const isEditTool = (FILE_EDIT_TOOLS as readonly string[]).includes(toolName);
  const rules: PermissionRule[] = isEditTool
    ? FILE_EDIT_TOOLS.map((name) => ({ toolName: name }))
    : [{ toolName }];

  return [{ type: 'addRules', rules, behavior: 'allow', destination: 'session' }];
}

/** How long, and of what, a suggested rule's content may be: printable ASCII, so nothing odd rides along. */
const SUGGESTED_RULE_CONTENT = /^[ -~]{1,200}$/;

/** The most suggested rules one answer installs. */
const MAX_SUGGESTED_RULES = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The rules to send when the user answers "allow, and don't ask again for this" on a request the CLI
 * made suggestions for (`permission_suggestions` on the `can_use_tool` request).
 *
 * The CLI proposes the narrow thing (for a command, its prefix) and where to keep it (for a command, the
 * project's local settings, which is where the terminal CLI writes its own "don't ask again"), and the answer
 * installs exactly that, there. The desktop app does the same: its "Always allow" button says "Saves to local
 * project settings" and the rule lands in `.claude/settings.local.json` (measured, 2026-11-14). A destination the
 * suggestion does not name, or one that is not a known one, falls back to this session only, which writes to no file.
 *
 * What is NOT installed is a rule for the whole tool. That is the other answer
 * ({@link buildSessionPermissionUpdate}), and a suggestion that names no content is not this one's to
 * widen into it.
 *
 * Undefined when nothing suggested qualifies, which is also the answer for a request the CLI made no
 * suggestions for: the caller then has no "always" to offer.
 */
export function alwaysAllowFromSuggestions(toolName: string, suggestions: unknown): PermissionUpdate[] | undefined {
  if (!Array.isArray(suggestions)) return undefined;

  const byDestination = new Map<PermissionDestination, PermissionRule[]>();
  let count = 0;
  for (const suggestion of suggestions) {
    if (!isRecord(suggestion) || suggestion.type !== 'addRules' || suggestion.behavior !== 'allow') continue;
    if (!Array.isArray(suggestion.rules)) continue;
    const destination: PermissionDestination =
      typeof suggestion.destination === 'string' && PERMISSION_DESTINATIONS.includes(suggestion.destination)
        ? (suggestion.destination as PermissionDestination)
        : 'session';
    for (const rule of suggestion.rules) {
      if (!isRecord(rule) || rule.toolName !== toolName) continue;
      const content = rule.ruleContent;
      if (typeof content !== 'string' || !SUGGESTED_RULE_CONTENT.test(content) || !/[a-z0-9]/i.test(content)) continue;
      const kept = byDestination.get(destination) ?? [];
      if ([...byDestination.values()].some((rules) => rules.some((existing) => existing.ruleContent === content))) continue;
      kept.push({ toolName, ruleContent: content });
      byDestination.set(destination, kept);
      count += 1;
      if (count >= MAX_SUGGESTED_RULES) break;
    }
    if (count >= MAX_SUGGESTED_RULES) break;
  }

  if (byDestination.size === 0) return undefined;
  return [...byDestination.entries()].map(([destination, rules]) => ({
    type: 'addRules' as const,
    rules,
    behavior: 'allow' as const,
    destination,
  }));
}

/**
 * Where the "always allow" of this request would be kept, in the desktop app's words, for the line it shows on
 * hover. Undefined when there is no "always allow" to offer.
 */
export function alwaysAllowScope(toolName: string, suggestions: unknown): PermissionScope | undefined {
  const updates = alwaysAllowFromSuggestions(toolName, suggestions);
  return updates ? SCOPE_OF_DESTINATION[updates[0].destination] : undefined;
}
