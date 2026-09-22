import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolUseBlockDto, ContentBlockType } from '@/dto';
import { LoadedMessageDto } from '@/types';
import { LoadedMessageType, toInstance } from '../../../../dto/common';

let hideToolCalls = false;

vi.mock('@/adapters', () => ({ getAdapter: () => ({ openFile: vi.fn() }) }));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ workingDirectory: '/repo' }),
}));
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: null }),
}));
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { hideToolCalls }, scopeSettings: { hideToolCalls } }),
  useSettingsOrNull: () => ({ settings: { hideToolCalls }, scopeSettings: { hideToolCalls } }),
}));

import { ToolRenderer } from '../ToolRenderer';
import { UserMessageRenderer } from '../UserMessageRenderer';

const SETTLED = { isStreaming: false } as unknown as LoadedMessageDto;

function toolUse(name: string, input: Record<string, unknown> = {}): ToolUseBlockDto {
  return Object.assign(new ToolUseBlockDto(), {
    type: ContentBlockType.ToolUse,
    id: 'tool_1',
    name,
    input,
  });
}

function unmergedToolResult(text: string): LoadedMessageDto {
  return toInstance(LoadedMessageDto, {
    type: LoadedMessageType.User,
    uuid: 'u-1',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'call_1', content: text }],
    },
  });
}

describe('hideToolCalls', () => {
  it('keeps the tool card when off', () => {
    hideToolCalls = false;
    const { container } = render(
      <ToolRenderer toolUse={toolUse('Bash', { command: 'ls -la' })} message={SETTLED} />,
    );
    expect(container).not.toBeEmptyDOMElement();
  });

  it('drops the tool card when on', () => {
    hideToolCalls = true;
    const { container } = render(
      <ToolRenderer toolUse={toolUse('Bash', { command: 'ls -la' })} message={SETTLED} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('drops a tool it has no renderer for, rather than falling through to the unknown header', () => {
    hideToolCalls = true;
    const { container } = render(
      <ToolRenderer toolUse={toolUse('SomeToolShippedAfterThisRelease')} message={SETTLED} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // What the turn produced, and what it is asking. Hiding either would hide the
  // point of the turn rather than the work behind it.
  it.each([
    'Edit',
    'Write',
    'NotebookEdit',
    'AskUserQuestion',
    'EnterPlanMode',
    'ExitPlanMode',
    'SendUserMessage',
    'Brief',
  ])('keeps %s visible when on', (name) => {
    hideToolCalls = true;
    const { container } = render(
      <ToolRenderer toolUse={toolUse(name, { file_path: '/repo/a.ts' })} message={SETTLED} />,
    );
    expect(container).not.toBeEmptyDOMElement();
  });

  // The result of a tool whose card sits on a page that is not loaded reaches
  // the chat as a user entry rendered as raw text. Left alone it would be the
  // loudest thing on screen, with no card left to say where it came from.
  it('drops an unmerged tool result when on', () => {
    hideToolCalls = true;
    const { container } = render(<UserMessageRenderer message={unmergedToolResult('REAL OUTPUT')} />);
    expect(screen.queryByText('REAL OUTPUT')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an unmerged tool result when off', () => {
    hideToolCalls = false;
    render(<UserMessageRenderer message={unmergedToolResult('REAL OUTPUT')} />);
    expect(screen.getByText('REAL OUTPUT')).toBeTruthy();
  });
});
