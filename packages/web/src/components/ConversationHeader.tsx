import {
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
    lastRun: ChatResult | null;
    realtimeConnected: boolean;
    selectedChat: ChatSummary | null;
    selectedChatId: string;
    selectedChatQueue: QueueSummary | null;
    selectedQueueLeadRun: QueueRunSummary | null;
    onCancelRun(runId: string): void;
}

export function ConversationHeader({
    currentActiveRun,
    lastRun,
    realtimeConnected,
    selectedChat,
    selectedChatId,
    selectedChatQueue,
    selectedQueueLeadRun,
    onCancelRun,
}: ConversationHeaderProps) {
    return (
        <div className="conversation-header">
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
                <span className="chip">{selectedChatId}</span>
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
    );
}
