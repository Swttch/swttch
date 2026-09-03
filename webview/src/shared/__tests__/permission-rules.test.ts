import { describe, it, expect } from 'vitest';
import { buildSessionPermissionUpdate, FILE_EDIT_TOOLS } from '../permission-rules';

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
