import {describe, it, expect} from 'vitest';
import {ToolRendererMap} from '../index';

/**
 * A tool name missing from ToolRendererMap renders as a bare header labelled
 * "unknown", which tells the reader nothing about what the agent did (#401).
 *
 * These lists are the contract: every name here must resolve to a renderer.
 */

/** Built-in tools shipped by the CLI. */
const BUILT_IN_TOOLS = [
    'Bash',
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'TodoWrite',
    'Agent',
    'Task',
    'TaskCreate',
    'TaskGet',
    'TaskList',
    'TaskUpdate',
    'TaskOutput',
    'TaskStop',
    'AskUserQuestion',
    'EnterPlanMode',
    'ExitPlanMode',
    'WebFetch',
    'WebSearch',
    'Skill',
    'ToolSearch',
    'NotebookEdit',
    'Workflow',
    'SendMessage',
    'ListAgents',
    'StructuredOutput',
    'ScheduleWakeup',
    'ReportFindings',
    'CronCreate',
    'CronDelete',
    'CronList',
    'RemoteTrigger',
    'EnterWorktree',
    'ExitWorktree',
    'ListMcpResourcesTool',
    'ReadMcpResourceTool',
    'ReadMcpResourceDirTool',
    'SendUserMessage',
];

/**
 * Legacy names the CLI normalizes onto a current tool, read out of the alias
 * table in the CLI binary (2.1.170). A session recorded under an older CLI
 * replays the legacy name verbatim, so the webview has to know both.
 */
const LEGACY_ALIASES: Record<string, string> = {
    Task: 'Agent',
    KillShell: 'TaskStop',
    KillBash: 'TaskStop',
    AgentOutputTool: 'TaskOutput',
    AgentOutput: 'TaskOutput',
    BashOutputTool: 'TaskOutput',
    BashOutput: 'TaskOutput',
    ListPeers: 'ListAgents',
    Brief: 'SendUserMessage',
    ListMcpResources: 'ListMcpResourcesTool',
    ReadMcpResource: 'ReadMcpResourceTool',
};

describe('ToolRendererMap covers every built-in tool', () => {
    it.each(BUILT_IN_TOOLS)('registers a renderer for %s', (name) => {
        expect(ToolRendererMap.get(name)).toBeDefined();
    });
});

describe('ToolRendererMap covers the CLI legacy alias table', () => {
    it.each(Object.keys(LEGACY_ALIASES))('registers a renderer for the legacy name %s', (legacy) => {
        expect(ToolRendererMap.get(legacy)).toBeDefined();
    });

    // An alias is the same tool under an older name, so it has to reach the same
    // renderer — registering it against a different one would render the call
    // with the wrong card rather than fixing anything.
    it.each(Object.entries(LEGACY_ALIASES))(
        'routes the legacy name %s to the same renderer as %s',
        (legacy, current) => {
            expect(ToolRendererMap.get(legacy)).toBe(ToolRendererMap.get(current));
        },
    );
});
