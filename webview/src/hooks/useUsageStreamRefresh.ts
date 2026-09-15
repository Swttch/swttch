import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

/**
 * Keep the usage panel current from the conversation itself.
 *
 * The CLI emits `rate_limit_event` while a turn runs, carrying the same windows the
 * usage endpoint serves. The backend absorbs it into its store, so all this has to do
 * is ask for the value again: the answer comes from that store rather than from another
 * `ccb` process. Bars that used to sit still until the next poll now move as the user
 * works, and they do it without spending a request that could be rate limited.
 */
export function useUsageStreamRefresh(): void {
    const bridge = useBridgeContext();
    const queryClient = useQueryClient();

    useEffect(() => {
        const unsubscribe = bridge.subscribe(MessageType.CLI_EVENT, (message) => {
            const event = (message.payload ?? {}) as { type?: string };
            if (event.type !== 'rate_limit_event') return;
            void queryClient.invalidateQueries({ queryKey: [MessageType.GET_USAGE] });
        });
        return unsubscribe;
    }, [bridge, queryClient]);
}
