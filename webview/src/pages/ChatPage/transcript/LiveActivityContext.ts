import { createContext } from 'react';
import type { StreamingActivity } from './streamingActivity';

/**
 * The call the running turn is waiting on, for the runs of calls above it to tell whether theirs is that one (#680).
 *
 * It is a context of its own, holding a value that only changes when the call does, because the runs used to read
 * the whole chat stream for it: every run of calls on the screen drew again for each word of a streaming reply, and
 * worked out the same answer once per run.
 */
export const LiveActivityContext = createContext<StreamingActivity | null>(null);
