import { startTransition, type Dispatch, type SetStateAction } from 'react';

import { WEB_CHANNEL, WEB_USER, type ChatResult, type StoredMessage } from './ui-types.js';
import { createDraftChatId, readJson } from './ui-helpers.js';

interface CreateConversationActionsOptions {
    composerText: string;
    editingText: string;
    executionMode: 'foreground' | 'background';
    loadChatList(): Promise<void>;
    loadMessagesPanel(chatId?: string): Promise<void>;
    loadToolLogsPanel(chatId?: string): Promise<void>;
    selectedChatId: string;
    setActionError: Dispatch<SetStateAction<string>>;
    setComposerText: Dispatch<SetStateAction<string>>;
    setDraftChatId: Dispatch<SetStateAction<string | null>>;
    setEditingMessageId: Dispatch<SetStateAction<number | null>>;
    setEditingText: Dispatch<SetStateAction<string>>;
    setLastRun: Dispatch<SetStateAction<ChatResult | null>>;
    setMessages: Dispatch<SetStateAction<StoredMessage[]>>;
    setSelectedChatId: Dispatch<SetStateAction<string>>;
    setSubmitting: Dispatch<SetStateAction<boolean>>;
}

export function createConversationActions({
    composerText,
    editingText,
    executionMode,
    loadChatList,
    loadMessagesPanel,
    loadToolLogsPanel,
    selectedChatId,
    setActionError,
    setComposerText,
    setDraftChatId,
    setEditingMessageId,
    setEditingText,
    setLastRun,
    setMessages,
    setSelectedChatId,
    setSubmitting,
}: CreateConversationActionsOptions) {
    async function handleSend(): Promise<void> {
        const text = composerText.trim();
        if (!text) {
            return;
        }

        setSubmitting(true);
        setActionError('');

        try {
            const result = await readJson<ChatResult>('/api/chat', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    channel: WEB_CHANNEL,
                    chatId: selectedChatId,
                    userId: WEB_USER,
                    executionMode,
                }),
            });

            setLastRun(result);
            setComposerText('');
            await Promise.all([
                loadChatList(),
                loadMessagesPanel(result.chatId),
                loadToolLogsPanel(result.chatId),
            ]);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Chat failed.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleCancelRun(runId: string): Promise<void> {
        setActionError('');

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
            await Promise.all([loadMessagesPanel(selectedChatId), loadChatList()]);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Cancel request failed.',
            );
        }
    }

    async function handleRevoke(messageId: number): Promise<void> {
        setActionError('');

        try {
            await readJson(`/api/messages/${messageId}/revoke`, {
                method: 'POST',
            });
            await Promise.all([
                loadMessagesPanel(selectedChatId),
                loadChatList(),
                loadToolLogsPanel(selectedChatId),
            ]);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Revoke failed.',
            );
        }
    }

    async function handleResend(messageId: number): Promise<void> {
        setActionError('');

        try {
            const result = await readJson<ChatResult>(
                `/api/messages/${messageId}/resend`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        channel: WEB_CHANNEL,
                        chatId: selectedChatId,
                        userId: WEB_USER,
                    }),
                },
            );
            setLastRun(result);
            await Promise.all([
                loadChatList(),
                loadMessagesPanel(selectedChatId),
                loadToolLogsPanel(selectedChatId),
            ]);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Resend failed.',
            );
        }
    }

    async function handleEditSave(messageId: number): Promise<void> {
        const text = editingText.trim();
        if (!text) {
            return;
        }

        setActionError('');

        try {
            const result = await readJson<{ result: ChatResult }>(
                `/api/messages/${messageId}/edit`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        text,
                    }),
                },
            );
            setEditingMessageId(null);
            setEditingText('');
            setLastRun(result.result);
            await Promise.all([
                loadChatList(),
                loadMessagesPanel(selectedChatId),
                loadToolLogsPanel(selectedChatId),
            ]);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Edit failed.');
        }
    }

    function handleCreateChat(): void {
        const draftId = createDraftChatId();
        startTransition(() => {
            setDraftChatId(draftId);
            setSelectedChatId(draftId);
            setMessages([]);
            setLastRun(null);
            setEditingMessageId(null);
            setEditingText('');
            setActionError('');
        });
    }

    function handleSelectChat(chatId: string): void {
        setSelectedChatId(chatId);
        setEditingMessageId(null);
        setEditingText('');
        setActionError('');
    }

    function handleInjectIntoComposer(content: string): void {
        setComposerText((current) =>
            current.trim() ? `${current.trim()}\n\n${content}` : content,
        );
    }

    return {
        handleCancelRun,
        handleCreateChat,
        handleEditSave,
        handleInjectIntoComposer,
        handleResend,
        handleRevoke,
        handleSelectChat,
        handleSend,
    };
}
