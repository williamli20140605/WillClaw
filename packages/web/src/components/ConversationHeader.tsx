import {
    conversationScopeLabel,
    conversationSubtitle,
    conversationTitle,
} from '../ui-helpers.js';
import type {
    ActiveRun,
    ChatResult,
    ChatSummary,
    QueueRunSummary,
    QueueSummary,
} from '../ui-types.js';

interface ConversationHeaderProps {
    currentActiveRun: ActiveRun | null;
    chatList: ChatSummary[];
    lastRun: ChatResult | null;
    realtimeConnected: boolean;
    selectedChat: ChatSummary | null;
    selectedChatId: string;
    selectedChatQueue: QueueSummary | null;
    selectedQueueLeadRun: QueueRunSummary | null;
    onCancelRun(runId: string): void;
    onCreateChat(): void;
    onSelectChat(chatId: string): void;
}

export function ConversationHeader({
    currentActiveRun,
    chatList,
    lastRun,
    realtimeConnected,
    selectedChat,
    selectedChatId,
    selectedChatQueue,
    selectedQueueLeadRun,
    onCancelRun,
    onCreateChat,
    onSelectChat,
}: ConversationHeaderProps) {
    const selectedChatAvailable = chatList.some(
        (chat) => chat.chatId === selectedChatId,
    );

    return (
        <div className="conversation-header">
            <div className="conversation-header__top">
                <div className="conversation-copy">
                    <div className="eyebrow">Web channel</div>
                    <h2>{conversationTitle(selectedChat, selectedChatId)}</h2>
                    <p>{conversationSubtitle(selectedChat)}</p>
                </div>
                <div className="conversation-status">
                    <span
                        className="chip"
                        data-tone={realtimeConnected ? 'teal' : 'accent'}
                    >
                        {realtimeConnected ? 'live stream' : 'reconnecting'}
                    </span>
                    <span className="chip">
                        {conversationScopeLabel(selectedChat, selectedChatId)}
                    </span>
                    {selectedChatQueue ? (
                        <span className="chip" data-tone="accent">
                            queue {selectedChatQueue.total}
                        </span>
                    ) : null}
                    {lastRun?.chatId === selectedChatId ? (
                        <span className="chip" data-tone="teal">
                            last: {lastRun.agent}
                        </span>
                    ) : null}
                    {currentActiveRun ?? selectedQueueLeadRun ? (
                        <button
                            className="danger-btn"
                            onClick={() =>
                                onCancelRun(
                                    currentActiveRun?.runId ??
                                        selectedQueueLeadRun?.runId ??
                                        '',
                                )
                            }
                            type="button"
                        >
                            Cancel run
                        </button>
                    ) : null}
                </div>
            </div>
            <div className="conversation-mobile-actions">
                <button className="btn" onClick={onCreateChat} type="button">
                    New conversation
                </button>
                <select
                    aria-label="Thread picker"
                    onChange={(event) => onSelectChat(event.target.value)}
                    value={selectedChatId}
                >
                    {!selectedChatAvailable ? (
                        <option value={selectedChatId}>
                            {conversationTitle(selectedChat, selectedChatId)}
                        </option>
                    ) : null}
                    {chatList.map((chat) => (
                        <option key={chat.chatId} value={chat.chatId}>
                            {conversationTitle(chat, chat.chatId)}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
