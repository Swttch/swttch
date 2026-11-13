import { describe, it, expect } from 'vitest';
import { buildSessionPermissionUpdate, FILE_EDIT_TOOLS, sessionRulesFromSuggestions } from '../permission-rules';

/**
 * What "yes, and stop asking this session" installs (#393).
 *
 * The defect these guard against: the old implementation remembered the ONE
 * tool name that happened to ask, so answering on an `Edit` prompt left the
 * next `Write` asking again — which read as the answer being ignored.
 */
describe('buildSessionPermissionUpdate', () => {
  it('grants the whole edit family when an edit tool asked', () => {
    for (const tool of FILE_EDIT_TOOLS) {
      const [update] = buildSessionPermissionUpdate(tool);
      const granted = update.rules.map((rule) => rule.toolName).sort();
      expect(granted).toEqual([...FILE_EDIT_TOOLS].sort());
    }
  });

  it('grants only the tool that asked for everything else', () => {
    const [update] = buildSessionPermissionUpdate('Bash');
    expect(update.rules).toEqual([{ toolName: 'Bash' }]);
  });

  it('does not widen Bash into the edit family', () => {
    // "Allow all commands this session" is a far larger thing to hand over than
    // "allow all edits", so it must never pick up neighbours nobody named.
    const [update] = buildSessionPermissionUpdate('Bash');
    const granted = update.rules.map((rule) => rule.toolName);
    for (const editTool of FILE_EDIT_TOOLS) {
      expect(granted).not.toContain(editTool);
    }
  });

  it('scopes the rule to the session, not to any settings file', () => {
    // `session` is what the label promises. A settings destination would
    // outlive the session and change the user's project on their behalf.
    const [update] = buildSessionPermissionUpdate('Edit');
    expect(update.destination).toBe('session');
    expect(update.type).toBe('addRules');
    expect(update.behavior).toBe('allow');
  });

  it('carries MCP tool names through untouched', () => {
    const [update] = buildSessionPermissionUpdate('mcp__playwright__click');
    expect(update.rules).toEqual([{ toolName: 'mcp__playwright__click' }]);
  });
});

/**
 * "Always allow" (#673): the narrow rule the CLI itself suggested, for this session only.
 *
 * It is not "allow every command", which is the other answer. What these guard is that the two
 * never drift into each other: a suggestion that names no content must not widen into a whole-tool
 * rule, and a suggestion's own destination must never decide where the rule is written.
 */
describe('sessionRulesFromSuggestions', () => {
  const suggestion = (rules: Array<Record<string, unknown>>, destination = 'localSettings') => [
    { type: 'addRules', rules, behavior: 'allow', destination },
  ];

  it('installs the rule the CLI suggested, for the session, whatever destination it named', () => {
    const result = sessionRulesFromSuggestions(
      'Bash',
      suggestion([{ toolName: 'Bash', ruleContent: 'mkdir:*' }], 'localSettings'),
    );

    expect(result).toEqual([
      { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'mkdir:*' }], behavior: 'allow', destination: 'session' },
    ]);
  });

  it('does not turn a suggestion with no content into a rule for the whole tool', () => {
    expect(sessionRulesFromSuggestions('Bash', suggestion([{ toolName: 'Bash' }]))).toBeUndefined();
  });

  it('ignores rules for other tools and suggestions that are not allow-rules', () => {
    expect(sessionRulesFromSuggestions('Bash', suggestion([{ toolName: 'Read', ruleContent: '/tmp/*' }]))).toBeUndefined();
    expect(
      sessionRulesFromSuggestions('Bash', [
        { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'rm:*' }], behavior: 'deny', destination: 'session' },
        { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
      ]),
    ).toBeUndefined();
  });

  it('refuses content that is not plain printable text, or has nothing readable in it', () => {
    for (const ruleContent of ['', '  ', '**', 'cat\u0000x', 'café:*', 'x'.repeat(201)]) {
      expect(sessionRulesFromSuggestions('Bash', suggestion([{ toolName: 'Bash', ruleContent }]))).toBeUndefined();
    }
  });

  it('keeps several distinct rules, drops repeats, and stops at five', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ toolName: 'Bash', ruleContent: `cmd${i}:*` }));
    const result = sessionRulesFromSuggestions('Bash', suggestion([...many, many[0]]));
    expect(result?.[0].rules).toHaveLength(5);

    const repeated = sessionRulesFromSuggestions('Bash', suggestion([many[0], many[0], many[1]]));
    expect(repeated?.[0].rules.map((r) => r.ruleContent)).toEqual(['cmd0:*', 'cmd1:*']);
  });

  it('is undefined for no suggestions, or for something that is not a list', () => {
    for (const value of [undefined, null, [], 'x', 7, {}]) {
      expect(sessionRulesFromSuggestions('Bash', value)).toBeUndefined();
    }
  });
});
