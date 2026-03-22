import { startTransition } from 'react';

import {
    WEB_CHANNEL,
    WEB_USER,
    type ChatResult,
} from './ui-types.js';
import type { ShellChatState, ShellSetters } from './shell-state-types.js';
import {
    applyChatAgentSelection,
    migrateChatAgentSelection,
} from './chat-agent-state.js';
import {
    createDraftChatId,
    readJson,
} from './ui-helpers.js';

type ConversationChatState = Pick<
    ShellChatState,
    | 'agentSelections'
    | 'chatUsesAutoRoute'
    | 'chatUsesDefaultAgent'
    | 'composerText'
    | 'defaultAgent'
    | 'editingText'
    | 'executionMode'
    | 'draftChatId'
    | 'selectedAgent'
    | 'selectedChatId'
>;

interface ConversationLoaders {
    loadChatList(): Promise<void>;
    loadMessagesPanel(chatId?: string): Promise<void>;
    loadToolLogsPanel(chatId?: string): Promise<void>;
}

interface CreateConversationActionsOptions {
    chat: ConversationChatState;
    loaders: ConversationLoaders;
    setters: Pick<ShellSetters, 'chat' | 'ui'>;
}

export function buildChatRequestPayload(chat: ConversationChatState, text: string) {
    return {
        ...(chat.selectedAgent ? { agent: chat.selectedAgent } : {}),
        text,
        channel: WEB_CHANNEL,
        chatId: chat.selectedChatId,
        userId: WEB_USER,
        executionMode: chat.executionMode,
    };
}

export function buildEditRequestPayload(chat: ConversationChatState, text: string) {
    return {
        ...(chat.selectedAgent ? { agent: chat.selectedAgent } : {}),
        text,
        executionMode: chat.executionMode,
    };
}

export function buildResendRequestPayload(chat: ConversationChatState) {
    return {
        ...(chat.selectedAgent ? { agent: chat.selectedAgent } : {}),
        channel: WEB_CHANNEL,
        chatId: chat.selectedChatId,
        userId: WEB_USER,
        executionMode: chat.executionMode,
    };
}

export function createConversationActions({
    chat,
    loaders,
    setters,
}: CreateConversationActionsOptions) {
    const { loadChatList, loadMessagesPanel, loadToolLogsPanel } = loaders;

    async function handleSend(): Promise<void> {
        const text = chat.composerText.trim();
        if (!text) {
            return;
        }

        setters.chat.setSubmitting(true);
        setters.ui.setActionError('');

        try {
            const result = await readJson<ChatResult>('/api/chat', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify(buildChatRequestPayload(chat, text)),
            });

            setters.chat.setLastRun(result);
            setters.chat.setComposerText('');
            if (result.chatId !== chat.selectedChatId) {
                setters.chat.setSelectedChatId(result.chatId);
                setters.chat.setDraftChatId((current) =>
                    current === chat.selectedChatId ? null : current,
                );
                setters.chat.setAgentSelections((current) =>
                    migrateChatAgentSelection({
                        agentSelections: current,
                        fromChatId: chat.selectedChatId,
                        toChatId: result.chatId,
                    }),
                );
            }
            await Promise.all([
                loadChatList(),
                loadMessagesPanel(result.chatId),
                loadToolLogsPanel(result.chatId),
            ]);
        } catch (error) {
            setters.ui.setActionError(
                error instanceof Error ? error.message : 'Chat failed.',
            );
        } finally {
            setters.chat.setSubmitting(false);
        }
    }

    async function handleCancelRun(runId: string): Promise<void> {
        setters.ui.setActionError('');

        try {
            await readJson(`/api/runs/${runId}/cancel`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    annotate: true,
                }),
            });
            await Promise.all([
                loadMessagesPanel(chat.selectedChatId),
                loadChatList(),
            ]);
        } catch (error) {
            setters.ui.setActionError(
                error instanceof Error ? error.message : 'Cancel request failed.',
            );
        }
    }

    async function handleRevoke(messageId: number): Promise<void> {
        setters.ui.setActionError('');

        try {
            await readJson(`/api/messages/${messageId}/revoke`, {
                method: 'POST',
            });
            await Promise.all([
                loadMessagesPanel(chat.selectedChatId),
                loadChatList(),
                loadToolLogsPanel(chat.selectedChatId),
            ]);
        } catch (error) {
            setters.ui.setActionError(
                error instanceof Error ? error.message : 'Revoke failed.',
            );
        }
    }

    async function handleResend(messageId: number): Promise<void> {
        setters.ui.setActionError('');

        try {
            const result = await readJson<ChatResult>(
                `/api/messages/${messageId}/resend`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify(buildResendRequestPayload(chat)),
                },
            );
            setters.chat.setLastRun(result);
            await Promise.all([
                loadChatList(),
                loadMessagesPanel(chat.selectedChatId),
                loadToolLogsPanel(chat.selectedChatId),
            ]);
        } catch (error) {
            setters.ui.setActionError(
                error instanceof Error ? error.message : 'Resend failed.',
            );
        }
    }

    async function handleEditSave(messageId: number): Promise<void> {
        const text = chat.editingText.trim();
        if (!text) {
            return;
        }

        setters.ui.setActionError('');

        try {
            const result = await readJson<{ result: ChatResult }>(
                `/api/messages/${messageId}/edit`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify(buildEditRequestPayload(chat, text)),
                },
            );
            setters.chat.setEditingMessageId(null);
            setters.chat.setEditingText('');
            setters.chat.setLastRun(result.result);
            await Promise.all([
                loadChatList(),
                loadMessagesPanel(chat.selectedChatId),
                loadToolLogsPanel(chat.selectedChatId),
            ]);
        } catch (error) {
            setters.ui.setActionError(
                error instanceof Error ? error.message : 'Edit failed.',
            );
        }
    }

    function handleCreateChat(): void {
        const draftId = createDraftChatId();
        startTransition(() => {
            setters.chat.setDraftChatId(draftId);
            setters.chat.setSelectedChatId(draftId);
            setters.chat.setMessages([]);
            setters.chat.setLastRun(null);
            setters.chat.setEditingMessageId(null);
            setters.chat.setEditingText('');
            setters.ui.setActionError('');
        });
    }

    function handleSelectChat(chatId: string): void {
        startTransition(() => {
            setters.chat.setSelectedChatId(chatId);
            setters.chat.setMessages([]);
            setters.chat.setToolLogs([]);
            setters.chat.setEditingMessageId(null);
            setters.chat.setEditingText('');
            setters.ui.setActionError('');
        });
    }

    function handleInjectIntoComposer(content: string): void {
        setters.chat.setComposerText((current) =>
            current.trim() ? `${current.trim()}\n\n${content}` : content,
        );
    }

    function handleSelectAgent(selection: string): void {
        setters.chat.setAgentSelections((current) =>
            applyChatAgentSelection({
                agentSelections: current,
                selectedChatId: chat.selectedChatId,
                selection,
            }),
        );
    }

    function handleDefaultAgentChange(agentName: string | null): void {
        setters.chat.setDefaultAgent(agentName);
    }

    function handleStartSearch(): void {
        setters.chat.setComposerText('/search ');
    }

    function handleEditCancel(): void {
        setters.chat.setEditingMessageId(null);
        setters.chat.setEditingText('');
    }

    function handleEditStart(messageId: number, content: string): void {
        setters.chat.setEditingMessageId(messageId);
        setters.chat.setEditingText(content);
    }

    return {
        handleCancelRun,
        handleCreateChat,
        handleEditCancel,
        handleEditSave,
        handleEditStart,
        handleInjectIntoComposer,
        handleDefaultAgentChange,
        handleSelectAgent,
        handleResend,
        handleRevoke,
        handleSelectChat,
        handleSend,
        handleStartSearch,
    };
}
