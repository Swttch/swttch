import { createContext } from 'react';
import type { SendIndexEntry } from './sendList';

/** Every send of the session, in transcript order (see `buildEntries`): what the composer's history walks (#735). */
export const SendListContext = createContext<SendIndexEntry[]>([]);
