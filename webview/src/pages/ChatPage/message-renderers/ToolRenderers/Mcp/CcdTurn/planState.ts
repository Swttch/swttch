import type { LoadedMessageDto } from '@/types';

/**
 * The plan a turn keeps with the `update_plan` tool of Claude Desktop's `ccd_turn` server.
 *
 * A call either hands over the whole list (`items`) or changes the one the earlier calls built: `done` ticks
 * steps off by their 1-based number, `start` marks one in progress, and `advance` ticks the step in progress
 * and starts the next one. The rules below are Desktop's own, so a plan reads here as it does there.
 */

export const UPDATE_PLAN_TOOL = 'mcp__ccd_turn__update_plan';

export type PlanStatus = 'completed' | 'in_progress' | 'pending';

export interface PlanItem {
  content: string;
  status: PlanStatus;
}

/** Desktop draws no more than this many steps. */
const MAX_ITEMS = 12;

function parseItems(items: unknown[]): PlanItem[] {
  const plan: PlanItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const { content, status } = item as { content?: unknown; status?: unknown };
    const text = typeof content === 'number' && Number.isSafeInteger(content) ? String(content) : content;
    if (typeof text !== 'string' || text.trim() === '') continue;
    plan.push({ content: text, status: status === 'completed' || status === 'in_progress' ? status : 'pending' });
    if (plan.length >= MAX_ITEMS) break;
  }
  return plan;
}

function isStepNumber(value: unknown, count: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= count;
}

function changePlan(plan: PlanItem[], input: Record<string, unknown>): PlanItem[] {
  const statuses = plan.map((item) => item.status);
  if (Array.isArray(input.done)) {
    for (const step of input.done) if (isStepNumber(step, statuses.length)) statuses[step - 1] = 'completed';
  }
  if (isStepNumber(input.start, statuses.length)) statuses[input.start - 1] = 'in_progress';
  if (input.advance === true || input.advance === 'true') {
    const current = statuses.indexOf('in_progress');
    if (current >= 0) statuses[current] = 'completed';
    const after = statuses.indexOf('pending', current + 1);
    const next = after >= 0 ? after : statuses.indexOf('pending');
    if (next >= 0) statuses[next] = 'in_progress';
  }
  return plan.map((item, index) => ({ ...item, status: statuses[index] }));
}

/** The plan as one call leaves it, given the plan the calls before it left. */
export function applyPlanCall(plan: PlanItem[], input: Record<string, unknown> | undefined): PlanItem[] {
  if (!input) return plan;
  return Array.isArray(input.items) ? parseItems(input.items) : changePlan(plan, input);
}

/**
 * The plan as the call `toolUseId` leaves it: every `update_plan` call before it in the transcript applied in
 * order, then this one. Without the transcript, the call stands alone.
 */
export function planAfterCall(
  messages: LoadedMessageDto[] | undefined,
  toolUseId: string,
  input: Record<string, unknown> | undefined,
): PlanItem[] {
  let plan: PlanItem[] = [];
  for (const message of messages ?? []) {
    const content = message.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type !== 'tool_use') continue;
      const call = block as unknown as { id?: string; name?: string; input?: Record<string, unknown> };
      if (call.name !== UPDATE_PLAN_TOOL) continue;
      if (call.id === toolUseId) return applyPlanCall(plan, input ?? call.input);
      plan = applyPlanCall(plan, call.input);
    }
  }
  return applyPlanCall(plan, input);
}
