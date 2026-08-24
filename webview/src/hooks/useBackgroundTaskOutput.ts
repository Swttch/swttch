import { useEffect, useState } from 'react';
import { useBridge } from './useBridge';
import { MessageType } from '@/shared';

interface BackgroundTaskOutputState {
  text: string;
  truncated: boolean;
  loading: boolean;
}

const INITIAL_STATE: BackgroundTaskOutputState = { text: '', truncated: false, loading: true };

/**
 * Live-subscribe to a background Bash task's raw output log (issue #347
 * follow-up: task_type 'local_bash' has no agents to show a transcript for).
 *
 * Push, not poll: the CLI has no event for "a task's log grew a line", so
 * unlike a workflow agent's transcript (refetched off WORKFLOW_PROGRESS), a
 * client-side interval was the only way to approximate live for a plain Bash
 * task — this instead asks the backend to `fs.watch` the file and push
 * BACKGROUND_TASK_OUTPUT_CHANGED, so there is nothing to fetch and no timer
 * ticking while nothing has changed.
 */
export function useBackgroundTaskOutput(outputFile: string | undefined) {
  const { sendRaw, subscribe } = useBridge();
  const [state, setState] = useState<BackgroundTaskOutputState>(INITIAL_STATE);

  useEffect(() => {
    if (!outputFile) {
      setState(INITIAL_STATE);
      return;
    }
    setState(INITIAL_STATE);

    const unsubscribe = subscribe(MessageType.BACKGROUND_TASK_OUTPUT_CHANGED, (message) => {
      const payload = message.payload as { outputFile?: string; text?: string; truncated?: boolean } | undefined;
      if (payload?.outputFile !== outputFile) return; // another watched task's update
      setState({ text: payload.text ?? '', truncated: !!payload.truncated, loading: false });
    });

    sendRaw(MessageType.WATCH_BACKGROUND_TASK_OUTPUT, { outputFile });

    return () => {
      unsubscribe();
      sendRaw(MessageType.UNWATCH_BACKGROUND_TASK_OUTPUT, { outputFile });
    };
  }, [outputFile, sendRaw, subscribe]);

  return state;
}
