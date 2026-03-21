import {
    useEffect,
    useEffectEvent,
} from 'react';

import type {
    ShellAuthState,
    ShellChatState,
    ShellSearchState,
    ShellSetters,
    ShellUiState,
} from './shell-state-types.js';
import { subscribeShellRealtime } from './shell-realtime.js';

type ShellEffectAuthState = Pick<ShellAuthState, 'allowsDashboard'>;
type ShellEffectChatState = Pick<
    ShellChatState,
    'draftChatId' | 'selectedChatId'
>;

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

type ShellEffectSearchState = Pick<ShellSearchState, 'deferredQuery' | 'scope'>;
type ShellEffectSetters = Pick<ShellSetters, 'runtime' | 'ui'>;
type ShellEffectUiState = Pick<ShellUiState, 'deferredComposerText'>;

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
