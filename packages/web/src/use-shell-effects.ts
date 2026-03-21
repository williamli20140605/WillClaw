import {
    useEffect,
    useEffectEvent,
    type Dispatch,
    type SetStateAction,
} from 'react';

import type { ActiveRun, RealtimeEvent } from './ui-types.js';
import { subscribeShellRealtime } from './shell-realtime.js';

interface UseShellEffectsOptions {
    authAllowsDashboard: boolean;
    deferredComposerText: string;
    deferredSearchQuery: string;
    draftChatId: string | null;
    loadAuthStatus(): Promise<{
        authRequired: boolean;
        authenticated: boolean;
    }>;
    loadChatList(): Promise<void>;
    loadMessagesPanel(chatId?: string): Promise<void>;
    loadQueuePanel(): Promise<void>;
    loadRoutePreview(text: string): Promise<void>;
    loadSchedulerPanel(): Promise<void>;
    loadSearch(query: string): Promise<void>;
    loadShellPanels(): Promise<void>;
    loadToolLogsPanel(chatId?: string): Promise<void>;
    searchScope: string;
    selectedChatId: string;
    setActiveRuns: Dispatch<SetStateAction<ActiveRun[]>>;
    setDashboardError: Dispatch<SetStateAction<string>>;
    setRealtimeConnected: Dispatch<SetStateAction<boolean>>;
    setRecentEvents: Dispatch<SetStateAction<RealtimeEvent[]>>;
}

export function useShellEffects({
    authAllowsDashboard,
    deferredComposerText,
    deferredSearchQuery,
    draftChatId,
    loadAuthStatus,
    loadChatList,
    loadMessagesPanel,
    loadQueuePanel,
    loadRoutePreview,
    loadSchedulerPanel,
    loadSearch,
    loadShellPanels,
    loadToolLogsPanel,
    searchScope,
    selectedChatId,
    setActiveRuns,
    setDashboardError,
    setRealtimeConnected,
    setRecentEvents,
}: UseShellEffectsOptions): void {
    const refreshShellStatus = useEffectEvent(async () => {
        try {
            const payload = await loadAuthStatus();
            if (!payload.authRequired || payload.authenticated) {
                await loadShellPanels();
            }
        } catch (error) {
            setDashboardError(
                error instanceof Error
                    ? error.message
                    : 'Failed to load shell data.',
            );
        }
    });

    useEffect(() => {
        let cancelled = false;

        const boot = async () => {
            try {
                const payload = await loadAuthStatus();
                if (cancelled || (payload.authRequired && !payload.authenticated)) {
                    return;
                }

                await loadShellPanels();
            } catch (error) {
                if (!cancelled) {
                    setDashboardError(
                        error instanceof Error
                            ? error.message
                            : 'Failed to load shell data.',
                    );
                }
            }
        };

        void boot();

        const interval = window.setInterval(() => {
            void refreshShellStatus();
        }, 30_000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, []);

    const refreshSelectedChatPanels = useEffectEvent(() => {
        void loadMessagesPanel(selectedChatId);
        void loadToolLogsPanel(selectedChatId);
    });

    useEffect(() => {
        if (!authAllowsDashboard) {
            return;
        }

        refreshSelectedChatPanels();

        const interval = window.setInterval(() => {
            refreshSelectedChatPanels();
        }, 30_000);

        return () => {
            window.clearInterval(interval);
        };
    }, [authAllowsDashboard, selectedChatId]);

    useEffect(() => {
        if (!authAllowsDashboard) {
            setRealtimeConnected(false);
            return;
        }

        return subscribeShellRealtime({
            loadChatList,
            loadMessagesPanel,
            loadQueuePanel,
            loadSchedulerPanel,
            loadShellPanels,
            loadToolLogsPanel,
            selectedChatId,
            setActiveRuns,
            setRealtimeConnected,
            setRecentEvents,
        });
    }, [authAllowsDashboard, selectedChatId, draftChatId]);

    useEffect(() => {
        if (!authAllowsDashboard) {
            return;
        }

        void loadSearch(deferredSearchQuery);
    }, [authAllowsDashboard, deferredSearchQuery, searchScope]);

    useEffect(() => {
        if (!authAllowsDashboard) {
            return;
        }

        void loadRoutePreview(deferredComposerText);
    }, [authAllowsDashboard, deferredComposerText]);
}
