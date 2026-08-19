import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {ToolUseContext} from '../../../common';
import {ProjectPathChip} from '../_shared';
import {ExecuteTerminalCommandRenderer} from '../ExecuteTerminalCommandRenderer';
import {BreakpointRenderer} from '../BreakpointRenderer';
import {GitStatusRenderer} from '../GitStatusRenderer';
import {ProblemsRenderer} from '../ProblemsRenderer';
import {CreateNewFileRenderer} from '../CreateNewFileRenderer';
import {makeToolUse, makeToolResult, renderWithStatus} from './helpers';

const mockOpenFile = vi.fn();
vi.mock('@/adapters', () => ({getAdapter: () => ({openFile: mockOpenFile})}));

vi.mock('@/contexts/WorkingDirContext', () => ({useWorkingDirOrNull: vi.fn(() => null)}));
import {useWorkingDirOrNull} from '@/contexts/WorkingDirContext';
const mockWd = vi.mocked(useWorkingDirOrNull);

// rootDir defaults to workingDirectory: these cases browse the directory they
// are working in, which is when the anchor and the session's cwd coincide.
const setCwd = (workingDirectory: string | null, ideRoot: string | null = null) =>
    mockWd.mockReturnValue({
        workingDirectory,
        rootDir: workingDirectory,
        ideRoot,
        setWorkingDirectory: vi.fn(),
    });

function renderChip(input: Record<string, unknown>) {
    const toolUse = makeToolUse(input, 'mcp__idea__read_file');
    return render(
        <ToolUseContext.Provider value={toolUse}>
            <ProjectPathChip />
        </ToolUseContext.Provider>,
    );
}

beforeEach(() => {
    mockOpenFile.mockClear();
    mockWd.mockReturnValue(null);
});

describe('ProjectPathChip (#1 — confirm which project)', () => {
    it('matches the current session project → compact "current project" (full path in a tooltip)', () => {
        setCwd('/home/lukis/ccg-java-test/ccg-java-test');
        renderChip({projectPath: '/home/lukis/ccg-java-test/ccg-java-test'});
        // The full path is now in a JS tooltip (not a native title=), so we
        // assert the verdict rather than the tooltip content here.
        expect(screen.getByText('current project')).toBeInTheDocument();
        expect(screen.queryByText('different project')).not.toBeInTheDocument();
    });

    it('matches ignoring a trailing slash', () => {
        setCwd('/tmp/p');
        renderChip({projectPath: '/tmp/p/'});
        expect(screen.getByText('current project')).toBeInTheDocument();
    });

    it('matches the IDE project root even when the session cwd is a subdir', () => {
        setCwd('/tmp/p/sub', '/tmp/p');
        renderChip({projectPath: '/tmp/p'});
        expect(screen.getByText('current project')).toBeInTheDocument();
    });

    it('a different project → yellow "different project" + the full path', () => {
        setCwd('/tmp/p');
        renderChip({projectPath: '/etc/evil'});
        expect(screen.getByText('different project')).toBeInTheDocument();
        const path = screen.getByText('/etc/evil');
        expect(path.className).toContain('text-state-warning-fg');
    });

    it('absent / real-null / blank projectPath → renders nothing (no badge to flash while the input streams)', () => {
        setCwd('/tmp/p');
        const {container: c1} = renderChip({}); // absent
        expect(c1).toBeEmptyDOMElement();
        const {container: c2} = renderChip({projectPath: null as unknown as string}); // real null
        expect(c2).toBeEmptyDOMElement();
        const {container: c3} = renderChip({projectPath: '   '}); // blank
        expect(c3).toBeEmptyDOMElement();
        expect(screen.queryByText('project not specified')).not.toBeInTheDocument();
    });

    it('no working-dir context → shows the path without a current/different verdict', () => {
        mockWd.mockReturnValue(null);
        renderChip({projectPath: '/tmp/p'});
        expect(screen.getByText('/tmp/p')).toBeInTheDocument();
        expect(screen.queryByText('different project')).not.toBeInTheDocument();
        expect(screen.queryByText('current project')).not.toBeInTheDocument();
    });
});

describe('hidden behavior fields are surfaced (#2)', () => {
    it('terminal: executeInShell → "shell" / "direct" badge', () => {
        renderWithStatus(
            <ExecuteTerminalCommandRenderer
                toolUse={makeToolUse({command: 'git init', executeInShell: true}, 'mcp__idea__execute_terminal_command')}
                toolResult={makeToolResult('{"command_exit_code":0,"command_output":"ok"}')}
            />,
        );
        expect(screen.getByText('shell')).toBeInTheDocument();
    });

    it('set_breakpoint: neutral logpoint + code block + flags below the header', () => {
        renderWithStatus(
            <BreakpointRenderer
                toolUse={makeToolUse(
                    {filePath: 'src/A.java', line: 5, logExpression: 'sum + i', suspendPolicy: 'NONE', breakpointsMuted: true, isLogMessage: true},
                    'mcp__idea__xdebug_set_breakpoint',
                )}
                toolResult={makeToolResult('{"id":"bp1"}')}
            />,
        );
        // file:line is in the header (the basename is shown)
        expect(screen.getByText('A.java')).toBeInTheDocument();
        // logpoint is an ordinary debugging param → neutral badge, not a warning
        const logpoint = screen.getByText('logpoint');
        expect(logpoint.className).not.toContain('text-state-warning-fg');
        // logExpression is evaluated code → shown as a block, not in the title
        expect(screen.getByText('sum + i')).toBeInTheDocument();
        expect(screen.getByText('suspend: NONE')).toBeInTheDocument();
        expect(screen.getByText('breakpoints muted')).toBeInTheDocument();
        expect(screen.getByText('log msg')).toBeInTheDocument();
    });

    it('set_breakpoint: breakpointsMuted=false is surfaced too (explicit un-mute)', () => {
        renderWithStatus(
            <BreakpointRenderer
                toolUse={makeToolUse({filePath: 'src/A.java', line: 5, breakpointsMuted: false}, 'mcp__idea__xdebug_set_breakpoint')}
                toolResult={makeToolResult('{"id":"bp1"}')}
            />,
        );
        expect(screen.getByText('breakpoints unmuted')).toBeInTheDocument();
    });

    it('remove_breakpoint: lists the target row and the owner', () => {
        renderWithStatus(
            <BreakpointRenderer
                toolUse={makeToolUse(
                    {projectPath: '/tmp/p', filePath: 'src/A.java', line: 5, owner: 'agent'},
                    'mcp__idea__xdebug_remove_breakpoint',
                )}
                toolResult={makeToolResult('{"removed":true,"message":"Removed 1 breakpoint(s)."}')}
            />,
        );
        expect(screen.getByText('Debugger: remove breakpoint')).toBeInTheDocument();
        expect(screen.getByText('src/A.java:5')).toBeInTheDocument(); // target listed like a search row
        expect(screen.getByText('owner: agent')).toBeInTheDocument();
        expect(screen.getByText('Removed 1 breakpoint(s).')).toBeInTheDocument(); // OUT
    });

    it('git_status: includeUntracked flag', () => {
        renderWithStatus(
            <GitStatusRenderer
                toolUse={makeToolUse({includeUntracked: true}, 'mcp__idea__git_status')}
                toolResult={makeToolResult('{"repositories":[]}')}
            />,
        );
        expect(screen.getByText('incl. untracked')).toBeInTheDocument();
    });

    it('get_file_problems: errorsOnly flag', () => {
        renderWithStatus(
            <ProblemsRenderer
                toolUse={makeToolUse({filePath: 'src/A.java', errorsOnly: true}, 'mcp__idea__get_file_problems')}
                toolResult={makeToolResult('{"filePath":"src/A.java","problems":[]}')}
            />,
        );
        expect(screen.getByText('errors only')).toBeInTheDocument();
    });
});

describe('create_new_file overwrite (#3)', () => {
    it('overwrite:true → link clickable before success + loud warning badge', () => {
        renderWithStatus(
            <CreateNewFileRenderer
                toolUse={makeToolUse({projectPath: '/tmp/p', pathInProject: 'src/Existing.java', text: 'x', overwrite: true}, 'mcp__idea__create_new_file')}
                toolResult={undefined}
            />,
            'progress',
        );
        expect(screen.getByText('overwrites existing file')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Existing.java'));
        expect(mockOpenFile).toHaveBeenCalledWith('/tmp/p/src/Existing.java');
    });
});
