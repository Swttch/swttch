import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { getAdapter } from '@/adapters';
import { MessageType } from '@/shared';
import type { WorkflowTask } from '@/shared';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkflowState } from '@/contexts/WorkflowStateContext';
import { runToPath, sessionToPath, withWorkingDir } from '@/router';
import { SubagentRunView } from '@/components/AgentTranscriptModal/SubagentRunView';
import { WorkflowRunView } from '@/components/AgentTranscriptModal/WorkflowRunView';
import { BashRunView } from '@/components/AgentTranscriptModal/BashRunView';
import type { RunPlacement, RunVariant } from '@/components/AgentTranscriptModal/RunViewControls';

/** How long after the session was read a task that has not turned up is given up on. The tasks follow the session. */
const GIVE_UP_AFTER_MS = 2500;

/**
 * The run of one background task (a sub-agent, a workflow, a command) as a page of its own.
 *
 * It is the same view the side panel and the window draw, with the page's title row, so the run reads the same
 * wherever it is put. The page arrives knowing only the session and the task it is about (`/runs/<session>/<task>`),
 * and fetches the rest: the app attaches this tab to that session, which reads it and sends the tasks it started,
 * live from then on. That is also what lets the page message and stop the task the way the panel does.
 *
 * Nothing here closes the page on its own when the session ends: the record stays to be read. A run that can no
 * longer be messaged says so in the bar that covers its composer.
 */
export function RunPage() {
  const params = useParams<{ session_id: string; tool_use_id: string }>();
  const sessionId = params.session_id ?? '';
  const toolUseId = params.tool_use_id ?? '';
  const { t } = useTranslation('chat');
  const navigate = useNavigate();
  const location = useLocation();
  const { subscribe } = useBridgeContext();
  const { getByToolUseId, placeRun } = useWorkflowState();
  const task = getByToolUseId(toolUseId);

  // Where this page is: the current tab moved here (`page`), or a tab opened for it (`tab`).
  const placement: RunPlacement = location.state?.runPlacement === 'page' ? 'page' : 'tab';

  const [variant, setVariant] = useState<RunVariant>('simple');
  const [sessionRead, setSessionRead] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    return subscribe(MessageType.SESSION_LOADED, (message) => {
      if (message.payload?.sessionId === sessionId) setSessionRead(true);
    });
  }, [subscribe, sessionId]);

  useEffect(() => {
    if (!sessionRead || task) return;
    const timer = setTimeout(() => setGaveUp(true), GIVE_UP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [sessionRead, task]);

  // An IDE tab takes its label from the page's title.
  useEffect(() => {
    if (!task) return;
    const previous = document.title;
    document.title = task.name;
    return () => {
      document.title = previous;
    };
  }, [task]);

  const toSession = () => navigate(withWorkingDir(sessionToPath(sessionId)));

  // "Back" is the router's back. A page nothing led to (the first entry of a tab opened for the run) has no back, and
  // goes to the session instead: to the tab already showing it, or to a new one, rather than turning into a copy of it.
  const goBack = () => {
    if (location.key !== 'default') {
      navigate(-1);
      return;
    }
    if (placement === 'page') {
      toSession();
      return;
    }
    getAdapter()
      .openTab(sessionToPath(sessionId))
      .catch(() => toSession());
  };

  const onPlacementChange = (next: RunPlacement) => {
    if (next === placement) return;
    if (next === 'tab') {
      getAdapter()
        .openTab(runToPath(sessionId, toolUseId))
        .catch((error) => console.warn('[RunPage] opening the run in a tab failed:', error));
      return;
    }
    // Beside the chat or over it: the run goes back to the session it belongs to and is shown there.
    toSession();
    placeRun(toolUseId, next);
  };

  if (!task) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 text-text-primary/50 text-[0.9230rem]">
        {gaveUp ? (
          t('backgroundTasks.runPage.notFound')
        ) : (
          <>
            <ArrowPathIcon className="w-4 h-4 animate-spin" />
            {t('backgroundTasks.runPage.loading')}
          </>
        )}
      </div>
    );
  }

  const common = {
    surface: 'page' as const,
    onBack: goBack,
    backLabel: t('backgroundTasks.runPage.backToSession'),
    variant,
    onVariantChange: setVariant,
    placement,
    onPlacementChange,
    // The same three controls as the window and the side panel, wherever the page is.
    onOpenInNewTab: () => {
      getAdapter()
        .openTab(runToPath(sessionId, toolUseId))
        .catch((error) => console.warn('[RunPage] opening the run in a tab failed:', error));
    },
  };

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-bg-primary">
      <RunBody task={task} {...common} />
    </div>
  );
}

function RunBody(props: { task: WorkflowTask } & Parameters<typeof SubagentRunView>[0]) {
  const { task, ...common } = props;
  switch (task.taskType) {
    case 'local_agent':
      return <SubagentRunView {...common} task={task} />;
    case 'local_bash':
      return <BashRunView {...common} task={task} />;
    default:
      return <WorkflowRunView {...common} task={task} />;
  }
}
