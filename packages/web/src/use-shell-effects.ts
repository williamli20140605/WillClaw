import {
    useEffect,
    useEffectEvent,
    type Dispatch,
    type SetStateAction,
} from 'react';

import type { ActiveRun, RealtimeEvent, SearchScope } from './ui-types.js';
import { subscribeShellRealtime } from './shell-realtime.js';

interface ShellEffectAuthState {
    allowsDashboard: boolean;
}

interface ShellEffectChatState {
    draftChatId: string | null;
    selectedChatId: string;
}

interface ShellEffectLoaders {
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
}

interface ShellEffectSearchState {
    deferredQuery: string;
    scope: SearchScope;
}

interface ShellEffectSetters {
    runtime: {
        setActiveRuns: Dispatch<SetStateAction<ActiveRun[]>>;
        setRealtimeConnected: Dispatch<SetStateAction<boolean>>;
        setRecentEvents: Dispatch<SetStateAction<RealtimeEvent[]>>;
    };
    ui: {
        setDashboardError: Dispatch<SetStateAction<string>>;
    };
}

interface ShellEffectUiState {
    deferredComposerText: string;
}

interface UseShellEffectsOptions {
    auth: ShellEffectAuthState;
    chat: ShellEffectChatState;
    loaders: ShellEffectLoaders;
    search: ShellEffectSearchState;
    setters: ShellEffectSetters;
    ui: ShellEffectUiState;
}

export function useShellEffects({
    auth,
    chat,
    loaders,
    search,
    setters,
    ui,
}: UseShellEffectsOptions): void {
    const {
        loadAuthStatus,
        loadChatList,
        loadMessagesPanel,
        loadQueuePanel,
        loadRoutePreview,
        loadSchedulerPanel,
        loadSearch,
        loadShellPanels,
        loadToolLogsPanel,
    } = loaders;

    const refreshShellStatus = useEffectEvent(async () => {
        try {
            const payload = await loadAuthStatus();
            if (!payload.authRequired || payload.authenticated) {
                await loadShellPanels();
            }
        } catch (error) {
            setters.ui.setDashboardError(
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
                    setters.ui.setDashboardError(
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
        void loadMessagesPanel(chat.selectedChatId);
        void loadToolLogsPanel(chat.selectedChatId);
    });

    useEffect(() => {
        if (!auth.allowsDashboard) {
            return;
        }

        refreshSelectedChatPanels();

        const interval = window.setInterval(() => {
            refreshSelectedChatPanels();
        }, 30_000);

        return () => {
            window.clearInterval(interval);
        };
    }, [auth.allowsDashboard, chat.selectedChatId]);

    useEffect(() => {
        if (!auth.allowsDashboard) {
            setters.runtime.setRealtimeConnected(false);
            return;
        }

        return subscribeShellRealtime({
            loadChatList,
            loadMessagesPanel,
            loadQueuePanel,
            loadSchedulerPanel,
            loadShellPanels,
            loadToolLogsPanel,
            selectedChatId: chat.selectedChatId,
            setActiveRuns: setters.runtime.setActiveRuns,
            setRealtimeConnected: setters.runtime.setRealtimeConnected,
            setRecentEvents: setters.runtime.setRecentEvents,
        });
    }, [auth.allowsDashboard, chat.selectedChatId, chat.draftChatId]);

    useEffect(() => {
        if (!auth.allowsDashboard) {
            return;
        }

        void loadSearch(search.deferredQuery);
    }, [auth.allowsDashboard, search.deferredQuery, search.scope]);

    useEffect(() => {
        if (!auth.allowsDashboard) {
            return;
        }

        void loadRoutePreview(ui.deferredComposerText);
    }, [auth.allowsDashboard, ui.deferredComposerText]);
}
