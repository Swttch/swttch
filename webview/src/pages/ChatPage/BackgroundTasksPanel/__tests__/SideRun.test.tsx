import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WorkflowTask } from '@/shared';

// The three views are stubbed: what is asked of SideRun is which one it draws and what it hands them.
vi.mock('@/components/AgentTranscriptModal/SubagentRunView', () => ({
  SubagentRunView: (p: { surface: string; placement: string }) => <div data-testid="agent-view">{`${p.surface}/${p.placement}`}</div>,
}));
vi.mock('@/components/AgentTranscriptModal/WorkflowRunView', () => ({
  WorkflowRunView: (p: { surface: string; onPlacementChange: (placement: string) => void }) => (
    <button data-testid="workflow-view" onClick={() => p.onPlacementChange('center')}>{p.surface}</button>
  ),
}));
vi.mock('@/components/AgentTranscriptModal/BashRunView', () => ({
  BashRunView: (p: { surface: string; onBack: () => void }) => (
    <button data-testid="bash-view" onClick={p.onBack}>{p.surface}</button>
  ),
}));

import { SideRun } from '../SideRun';

const task = (taskType: string) => ({ taskType, toolUseId: 't', name: 'x' }) as unknown as WorkflowTask;
const props = { variant: 'simple' as const, onVariantChange: vi.fn(), onBack: vi.fn(), backLabel: 'Background tasks', onClose: vi.fn(), onPlacementChange: vi.fn(), onOpenInNewTab: vi.fn() };

describe('SideRun', () => {
  it('draws a single agent with the agent view, in the panel form of the title row', () => {
    render(<SideRun task={task('local_agent')} {...props} />);
    expect(screen.getByTestId('agent-view').textContent).toBe('panel/side');
  });

  it('draws a background command with the command view, and hands it the way back', () => {
    const onBack = vi.fn();
    render(<SideRun task={task('local_bash')} {...props} onBack={onBack} />);
    fireEvent.click(screen.getByTestId('bash-view'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('draws anything else, a workflow, with the workflow view, and hands it what a pick of another place does', () => {
    const onPlacementChange = vi.fn();
    render(<SideRun task={task('local_workflow')} {...props} onPlacementChange={onPlacementChange} />);
    fireEvent.click(screen.getByTestId('workflow-view'));
    expect(onPlacementChange).toHaveBeenCalledWith('center');
  });
});
