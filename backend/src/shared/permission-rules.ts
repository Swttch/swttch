/**
 * Session-scoped permission rules, as the CLI's permission protocol expresses
 * them.
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
  /** `session` lasts for this CLI run and is written to no settings file. */
  destination: 'session';
}

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
 * The CLI proposes the narrow thing (for a command, its prefix), and the answer installs exactly that,
 * for this session only: whatever destination the suggestion named, it is written to no settings file.
 * What is NOT installed is a rule for the whole tool. That is the other answer
 * ({@link buildSessionPermissionUpdate}), and a suggestion that names no content is not this one's to
 * widen into it.
 *
 * Undefined when nothing suggested qualifies, which is also the answer for a request the CLI made no
 * suggestions for: the caller then has no "always" to offer.
 */
export function sessionRulesFromSuggestions(toolName: string, suggestions: unknown): PermissionUpdate[] | undefined {
  if (!Array.isArray(suggestions)) return undefined;

  const rules: PermissionRule[] = [];
  for (const suggestion of suggestions) {
    if (!isRecord(suggestion) || suggestion.type !== 'addRules' || suggestion.behavior !== 'allow') continue;
    if (!Array.isArray(suggestion.rules)) continue;
    for (const rule of suggestion.rules) {
      if (!isRecord(rule) || rule.toolName !== toolName) continue;
      const content = rule.ruleContent;
      if (typeof content !== 'string' || !SUGGESTED_RULE_CONTENT.test(content) || !/[a-z0-9]/i.test(content)) continue;
      if (rules.some((existing) => existing.ruleContent === content)) continue;
      rules.push({ toolName, ruleContent: content });
      if (rules.length >= MAX_SUGGESTED_RULES) break;
    }
    if (rules.length >= MAX_SUGGESTED_RULES) break;
  }

  return rules.length > 0 ? [{ type: 'addRules', rules, behavior: 'allow', destination: 'session' }] : undefined;
}
