import type { Dispatch, SetStateAction } from 'react';

import {
    WEB_CHANNEL,
    type ActiveRun,
    type RealtimeEvent,
} from './ui-types.js';
import {
    readPayloadString,
    readPayloadStringArray,
    shouldTrackRecentEvent,
    upsertActiveRun,
} from './ui-helpers.js';

const SHELL_EVENT_TYPES = [
    'ready',
    'chat.run.queued',
    'chat.run.started',
    'chat.run.stream.delta',
    'chat.run.completed',
    'chat.run.failed',
    'chat.run.cancelled',
    'chat.route.selected',
    'chat.agent.started',
    'chat.agent.failed',
    'chat.agent.skipped',
    'message.created',
    'message.revoked',
    'background.task.started',
    'background.task.completed',
    'background.task.failed',
    'scheduler.task.started',
    'scheduler.task.completed',
    'scheduler.task.failed',
] as const;

interface SubscribeShellRealtimeOptions {
    loadChatList(): Promise<void>;
    loadMessagesPanel(chatId?: string): Promise<void>;
    loadQueuePanel(): Promise<void>;
    loadSchedulerPanel(): Promise<void>;
    loadShellPanels(): Promise<void>;
    loadToolLogsPanel(chatId?: string): Promise<void>;
    selectedChatId: string;
    setActiveRuns: Dispatch<SetStateAction<ActiveRun[]>>;
    setRealtimeConnected: Dispatch<SetStateAction<boolean>>;
    setRecentEvents: Dispatch<SetStateAction<RealtimeEvent[]>>;
}

export function subscribeShellRealtime({
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
}: SubscribeShellRealtimeOptions): () => void {
    const source = new EventSource('/api/events');

    const handleEvent = (nativeEvent: Event) => {
        const messageEvent = nativeEvent as MessageEvent<string>;

        try {
            const event = JSON.parse(messageEvent.data) as RealtimeEvent;
            if (shouldTrackRecentEvent(event.type)) {
                setRecentEvents((current) => [event, ...current].slice(0, 12));
            }

            switch (event.type) {
                case 'ready':
                    setRealtimeConnected(true);
                    break;
                case 'chat.run.queued': {
                    const runId = readPayloadString(event.payload, 'runId');
                    const channel = readPayloadString(event.payload, 'channel');
                    const chatId = readPayloadString(event.payload, 'chatId');
                    const executionMode = readPayloadString(
                        event.payload,
                        'executionMode',
                    );
                    const ahead = event.payload.ahead;
                    if (!runId || !channel || !chatId) {
                        break;
                    }

                    setActiveRuns((current) =>
                        upsertActiveRun(current, {
                            runId,
                            channel,
                            chatId,
                            startedAt: event.timestamp,
                            status: 'queued',
                            phase:
                                typeof ahead === 'number' && Number.isFinite(ahead)
                                    ? `queued · ${ahead} ahead`
                                    : 'queued',
                            streamContent: '',
                            ...(executionMode ? { executionMode } : {}),
                        }),
                    );

                    if (channel === WEB_CHANNEL) {
                        void loadChatList();
                        void loadQueuePanel();
                        if (chatId === selectedChatId) {
                            void loadMessagesPanel(chatId);
                        }
                    }
                    break;
                }
                case 'chat.run.started': {
                    const runId = readPayloadString(event.payload, 'runId');
                    const channel = readPayloadString(event.payload, 'channel');
                    const chatId = readPayloadString(event.payload, 'chatId');
                    const executionMode = readPayloadString(
                        event.payload,
                        'executionMode',
                    );
                    if (!runId || !channel || !chatId) {
                        break;
                    }

                    setActiveRuns((current) =>
                        upsertActiveRun(current, {
                            runId,
                            channel,
                            chatId,
                            startedAt: event.timestamp,
                            status: 'running',
                            phase: 'running',
                            streamContent: '',
                            ...(executionMode ? { executionMode } : {}),
                        }),
                    );

                    if (channel === WEB_CHANNEL) {
                        void loadChatList();
                        void loadQueuePanel();
                        if (chatId === selectedChatId) {
                            void loadMessagesPanel(chatId);
                        }
                    }
                    break;
                }
                case 'chat.route.selected': {
                    const runId = readPayloadString(event.payload, 'runId');
                    const selectedAgent = readPayloadString(
                        event.payload,
                        'selectedAgent',
                    );
                    if (!runId) {
                        break;
                    }

                    setActiveRuns((current) => {
                        const existing = current.find((entry) => entry.runId === runId);
                        if (!existing) {
                            return current;
                        }

                        return upsertActiveRun(current, {
                            ...existing,
                            ...(selectedAgent ? { agent: selectedAgent } : {}),
                            ...(() => {
                                const reason = readPayloadString(
                                    event.payload,
                                    'reason',
                                );
                                return reason ? { reason } : {};
                            })(),
                            ...(() => {
                                const explicitAgent = readPayloadString(
                                    event.payload,
                                    'explicitAgent',
                                );
                                return explicitAgent ? { explicitAgent } : {};
                            })(),
                            ...(() => {
                                const fallbackChain = readPayloadStringArray(
                                    event.payload,
                                    'fallbackChain',
                                );
                                return fallbackChain ? { fallbackChain } : {};
                            })(),
                            phase: selectedAgent
                                ? `routing → ${selectedAgent}`
                                : 'routing',
                        });
                    });
                    break;
                }
                case 'chat.agent.started': {
                    const runId = readPayloadString(event.payload, 'runId');
                    const agent = readPayloadString(event.payload, 'agent');
                    if (!runId) {
                        break;
                    }

                    setActiveRuns((current) => {
                        const existing = current.find((entry) => entry.runId === runId);
                        if (!existing) {
                            return current;
                        }

                        return upsertActiveRun(current, {
                            ...existing,
                            ...(agent ? { agent } : {}),
                            phase: agent ? `running ${agent}` : 'running',
                            streamContent: '',
                        });
                    });
                    break;
                }
                case 'chat.run.stream.delta': {
                    const runId = readPayloadString(event.payload, 'runId');
                    const agent = readPayloadString(event.payload, 'agent');
                    const channel = readPayloadString(event.payload, 'channel');
                    const chatId = readPayloadString(event.payload, 'chatId');
                    const content = readPayloadString(event.payload, 'content');
                    const parser = readPayloadString(event.payload, 'parser');
                    if (!runId || !channel || !chatId || !content) {
                        break;
                    }

                    setActiveRuns((current) => {
                        const existing = current.find((entry) => entry.runId === runId);
                        if (!existing) {
                            return current;
                        }

                        return upsertActiveRun(current, {
                            ...existing,
                            ...(agent ? { agent } : {}),
                            streamContent: content,
                            ...(parser ? { streamParser: parser } : {}),
                            streamUpdatedAt: event.timestamp,
                            phase: agent ? `streaming ${agent}` : 'streaming',
                        });
                    });
                    break;
                }
                case 'chat.agent.failed':
                case 'chat.agent.skipped': {
                    const runId = readPayloadString(event.payload, 'runId');
                    const agent = readPayloadString(event.payload, 'agent');
                    const detail =
                        readPayloadString(event.payload, 'error') ??
                        readPayloadString(event.payload, 'reason');
                    if (!runId) {
                        break;
                    }

                    setActiveRuns((current) => {
                        const existing = current.find((entry) => entry.runId === runId);
                        if (!existing) {
                            return current;
                        }

                        return upsertActiveRun(current, {
                            ...existing,
                            ...(agent ? { agent } : {}),
                            ...(detail ? { latestError: detail } : {}),
                            phase:
                                event.type === 'chat.agent.failed'
                                    ? `retrying after ${agent ?? 'agent'}`
                                    : `skipping ${agent ?? 'agent'}`,
                        });
                    });
                    break;
                }
                case 'chat.run.completed':
                case 'chat.run.failed':
                case 'chat.run.cancelled': {
                    const runId = readPayloadString(event.payload, 'runId');
                    const channel = readPayloadString(event.payload, 'channel');
                    const chatId = readPayloadString(event.payload, 'chatId');

                    if (runId) {
                        setActiveRuns((current) =>
                            current.filter((entry) => entry.runId !== runId),
                        );
                    }

                    if (channel === WEB_CHANNEL) {
                        void loadChatList();
                        void loadQueuePanel();
                    }

                    if (channel === WEB_CHANNEL && chatId === selectedChatId) {
                        void loadMessagesPanel(chatId);
                        void loadToolLogsPanel(chatId);
                    }
                    break;
                }
                case 'message.created':
                case 'message.revoked': {
                    const channel = readPayloadString(event.payload, 'channel');
                    const chatId = readPayloadString(event.payload, 'chatId');

                    if (channel === WEB_CHANNEL) {
                        void loadChatList();
                        void loadQueuePanel();
                    }

                    if (channel === WEB_CHANNEL && chatId === selectedChatId) {
                        void loadMessagesPanel(chatId);
                        void loadToolLogsPanel(chatId);
                    }
                    break;
                }
                case 'background.task.started':
                case 'background.task.completed':
                case 'background.task.failed':
                case 'scheduler.task.started':
                case 'scheduler.task.completed':
                case 'scheduler.task.failed':
                    void loadSchedulerPanel();
                    void loadShellPanels();
                    break;
                default:
                    break;
            }
        } catch {
            setRealtimeConnected(false);
        }
    };

    source.addEventListener('open', () => {
        setRealtimeConnected(true);
    });
    source.addEventListener('error', () => {
        setRealtimeConnected(false);
    });

    for (const eventType of SHELL_EVENT_TYPES) {
        source.addEventListener(eventType, handleEvent);
    }

    return () => {
        for (const eventType of SHELL_EVENT_TYPES) {
            source.removeEventListener(eventType, handleEvent);
        }
        source.close();
        setRealtimeConnected(false);
    };
}
