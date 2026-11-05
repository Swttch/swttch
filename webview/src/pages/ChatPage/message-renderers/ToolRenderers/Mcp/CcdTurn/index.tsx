import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { useChatStreamContextOrNull } from '@/contexts/ChatStreamContext';
import { RendererProps } from '../../common';
import { planAfterCall, UPDATE_PLAN_TOOL, type PlanItem } from './planState';

/**
 * Claude Desktop's `ccd_turn` server has two tools, and Desktop draws neither as a tool call with a title: each
 * is a bare rounded box. `update_plan` keeps the turn's checklist, and `wrap_up` closes the turn with a recap, a
 * question and the answers to it. The plan is drawn where the call sits. The wrap-up is not drawn where its call
 * sits, which is ahead of the closing message: it is drawn after the turn's last message (see `TurnWrapUp`), so
 * its renderer here draws nothing.
 */
export const WRAP_UP_TOOL = 'mcp__ccd_turn__wrap_up';

// A little under a reply's own text (15.2px on 1.5), with the border drawn light the way Desktop's is.
const BOX_CLASS = 'rounded-lg border border-border-default/30 px-4 py-3 text-[0.95rem] leading-[1.5]';

/**
 * The slot every box of the `ccd_turn` tools sits in. The chat's scroll area already keeps 24px clear on its
 * right, so 24px on the start side makes the space equal on both sides and the box stands in the middle of the
 * chat rather than against its left edge.
 */
const TurnBoxSlot: FC<{ children: ReactNode; testId?: string }> = ({ children, testId }) => (
  <div className="py-2" style={{ paddingInlineStart: '24px' }} data-testid={testId}>
    {children}
  </div>
);

function PlanMark({ status }: { status: PlanItem['status'] }) {
  if (status === 'completed') return <CheckCircleIcon className="h-4 w-4 shrink-0 text-text-primary/60" aria-hidden="true" />;
  if (status === 'in_progress') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-text-primary/80" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-text-primary/80" />
      </span>
    );
  }
  return <span className="h-4 w-4 shrink-0 rounded-full border-2 border-dashed border-text-primary/40" aria-hidden="true" />;
}

export function UpdatePlanRenderer(props: RendererProps) {
  const { toolUse } = props;
  const messages = useChatStreamContextOrNull()?.messages;
  const plan = planAfterCall(messages, toolUse.id, toolUse.input as Record<string, unknown> | undefined);
  if (plan.length === 0) return null;

  return (
    <TurnBoxSlot>
      <ul className={`flex flex-col gap-2 ${BOX_CLASS}`} data-testid="update-plan-list">
        {plan.map((item, index) => (
          <li
            key={index}
            data-status={item.status}
            className={`flex items-start gap-2 ${item.status === 'completed' ? 'text-text-primary/50' : 'text-text-primary/80'}`}
          >
            <span className="mt-[3px]">
              <PlanMark status={item.status} />
            </span>
            <span className="min-w-0 break-words">{item.content}</span>
          </li>
        ))}
      </ul>
    </TurnBoxSlot>
  );
}

/** Drawn by `TurnWrapUp` at the end of the turn, never at the call. */
export function WrapUpRenderer(_props: RendererProps) {
  return null;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** What an answer that stands for an app action says when pressed: the action's name, in words. */
const ACTION_WORDS: Record<string, string> = {
  commit: 'Commit',
  create_pr: 'Create PR',
  merge: 'Merge',
  fix_ci: 'Fix CI',
  address_comments: 'Address comments',
  resolve_conflicts: 'Resolve conflicts',
  verify: 'Verify',
  archive: 'Archive',
  new_session: 'New session',
};

function answerText(label: unknown, action: unknown): string | undefined {
  const text = nonEmpty(label);
  if (text) return text;
  const name = nonEmpty(action);
  return name ? (ACTION_WORDS[name] ?? name.replace(/_/g, ' ')) : undefined;
}

/** The answers offered under the question: a reply's own words, or the name of the app action it stands for. */
export function wrapUpAnswers(actions: unknown): string[] {
  if (!Array.isArray(actions)) return [];
  const labels: string[] = [];
  for (const action of actions) {
    const { label, action: name } = (action ?? {}) as { label?: unknown; action?: unknown };
    const text = answerText(label, name);
    if (text) labels.push(text);
  }
  return labels;
}

const KEY_CHIP = 'flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-text-inverse/20 px-[3px] text-[0.75rem] leading-none text-text-inverse/70';

/**
 * The box that closes a turn: the recap in dim text, the question under it, then the answers offered as
 * buttons. Pressing one sends it as the user's reply; the box then shows only that reply, as it does once the
 * next send has answered it.
 *
 * `reply` is the text of the send that came next, or undefined while none has. `onAnswer` is given only while
 * the question is still open and can be answered from here. The first answer carries the Cmd/Ctrl+Enter chip,
 * and the keys press it while the composer is empty (`composerEmpty`).
 */
export const WrapUpBox: FC<{
  input: Record<string, unknown> | undefined;
  reply?: string;
  onAnswer?: (text: string) => void;
  composerEmpty?: boolean;
}> = ({ input, reply, onAnswer, composerEmpty = true }) => {
  const recap = nonEmpty(input?.recap);
  const ask = nonEmpty(input?.ask);
  const answers = wrapUpAnswers(input?.actions);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const open = reply === undefined && picked === undefined;
  const first = answers[0];

  // Held in a ref so the key listener below is attached once, not at every render.
  const pressFirst = useRef<() => void>(() => {});
  pressFirst.current = () => {
    if (!open || !onAnswer || first === undefined) return;
    setPicked(first);
    onAnswer(first);
  };
  const listening = open && onAnswer !== undefined && first !== undefined && composerEmpty;
  useEffect(() => {
    if (!listening) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      event.preventDefault();
      pressFirst.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [listening]);

  if (!recap && !ask && answers.length === 0) return null;

  const chosen = picked ?? (reply !== undefined ? answers.find((answer) => answer === reply.trim()) : undefined);
  return (
    <TurnBoxSlot testId="wrap-up-box">
      <div className={`flex flex-col gap-3 ${BOX_CLASS}`}>
        {recap && <div className="whitespace-pre-wrap break-words text-text-primary/50">{recap}</div>}
        {ask && <div className="whitespace-pre-wrap break-words text-text-primary/80">{ask}</div>}
        {open && answers.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {answers.map((answer, index) => {
              const primary = index === 0;
              return (
                <button
                  key={index}
                  type="button"
                  disabled={!onAnswer}
                  onClick={() => {
                    setPicked(answer);
                    onAnswer?.(answer);
                  }}
                  className={`flex items-center gap-2 rounded-lg py-1.5 text-[1rem] leading-none transition-colors active:scale-[0.98] ${
                    primary
                      ? 'bg-text-primary/[0.93] pe-1.5 ps-2.5 text-text-inverse hover:bg-text-primary'
                      : 'bg-text-primary/15 px-2.5 text-text-primary/80 hover:bg-text-primary/20'
                  } ${onAnswer ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span>{answer}</span>
                  {primary && onAnswer && composerEmpty && (
                    <span className="flex items-center gap-[2px]" aria-hidden="true">
                      <span className={KEY_CHIP}>{isMac ? '⌘' : 'Ctrl'}</span>
                      <span className={KEY_CHIP}>↵</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {chosen && <div className="text-text-primary/50">{chosen}</div>}
      </div>
    </TurnBoxSlot>
  );
};

/** The last `wrap_up` call among a turn's messages, as its input; undefined when the turn made none. */
export function findWrapUpInput(messages: ReadonlyArray<{ message?: { content?: unknown } }>): Record<string, unknown> | undefined {
  let found: Record<string, unknown> | undefined;
  for (const message of messages) {
    const content = message.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as Array<{ type?: string; name?: string; input?: Record<string, unknown> }>) {
      if (block?.type === 'tool_use' && block.name === WRAP_UP_TOOL) found = block.input ?? {};
    }
  }
  return found;
}

export const CcdTurnRenderers: Array<[string, FC<RendererProps>]> = [
  [UPDATE_PLAN_TOOL, UpdatePlanRenderer],
  [WRAP_UP_TOOL, WrapUpRenderer],
];
