import {
    MessageBody,
    describeMessageLineage,
    extractAssistantRouteMetadata,
    formatDuration,
    formatTimestamp,
    messageLabel,
    routeReasonLabel,
} from '../ui-helpers.js';
import type { ActiveRun, StoredMessage } from '../ui-types.js';

interface ConversationStreamProps {
    currentActiveRun: ActiveRun | null;
    editedSuccessorById: Map<number, StoredMessage>;
    editingMessageId: number | null;
    editingText: string;
    messages: StoredMessage[];
    onEditCancel(): void;
    onEditSave(messageId: number): void;
    onEditStart(messageId: number, content: string): void;
    onEditTextChange(value: string): void;
    onResend(messageId: number): void;
    onRevoke(messageId: number): void;
}

export function ConversationStream({
    currentActiveRun,
    editedSuccessorById,
    editingMessageId,
    editingText,
    messages,
    onEditCancel,
    onEditSave,
    onEditStart,
    onEditTextChange,
    onResend,
    onRevoke,
}: ConversationStreamProps) {
    return (
        <div className="conversation-stream">
            {messages.length === 0 ? (
                <div className="empty empty--hero">
                    <strong>Nothing in this thread yet.</strong>
                    <p>
                        Pick an agent in the composer, type a prompt, or use
                        `/search release plan` to hit WillClaw memory without
                        invoking a coding agent.
                    </p>
                </div>
            ) : (
                messages.map((message, index) => {
                    const editedSuccessor =
                        editedSuccessorById.get(message.id) ?? null;
                    const lineage = describeMessageLineage(
                        message,
                        editedSuccessor,
                    );

                    return (
                        <div
                            className="message-row"
                            data-role={message.role}
                            key={message.id}
                            style={{
                                animationDelay: `${Math.min(index * 30, 240)}ms`,
                            }}
                        >
                            <article
                                className="message-bubble"
                                data-role={message.role}
                                data-revoked={message.status === 'revoked'}
                            >
                                <div className="message-top">
                                    <strong>{messageLabel(message)}</strong>
                                    <span>
                                        #{message.id} ·{' '}
                                        {formatTimestamp(message.timestamp)}
                                    </span>
                                </div>
                                <MessageBody message={message} />
                                <div className="message-footer">
                                    <div className="chip-row">
                                        {message.runId ? (
                                            <span className="chip">
                                                run {message.runId.slice(0, 8)}
                                            </span>
                                        ) : null}
                                        {message.durationMs ? (
                                            <span className="chip">
                                                {formatDuration(message.durationMs)}
                                            </span>
                                        ) : null}
                                        {message.status === 'revoked' ? (
                                            <span
                                                className="chip"
                                                data-tone="danger"
                                            >
                                                revoked
                                            </span>
                                        ) : null}
                                        {message.editOf != null ? (
                                            <span
                                                className="chip"
                                                data-tone="accent"
                                            >
                                                edited from #{message.editOf}
                                            </span>
                                        ) : null}
                                        {editedSuccessor ? (
                                            <span
                                                className="chip"
                                                data-tone="accent"
                                            >
                                                superseded by #
                                                {editedSuccessor.id}
                                            </span>
                                        ) : null}
                                        {(() => {
                                            const route =
                                                extractAssistantRouteMetadata(
                                                    message,
                                                );
                                            if (!route) {
                                                return null;
                                            }

                                            return (
                                                <>
                                                    {route.selectedAgent ? (
                                                        <span
                                                            className="chip"
                                                            data-tone="teal"
                                                        >
                                                            route{' '}
                                                            {route.selectedAgent}
                                                        </span>
                                                    ) : null}
                                                    {route.reason ? (
                                                        <span className="chip">
                                                            {routeReasonLabel(
                                                                route.reason,
                                                            )}
                                                        </span>
                                                    ) : null}
                                                    {route.attemptedAgents.length >
                                                    1 ? (
                                                        <span className="chip">
                                                            {
                                                                route
                                                                    .attemptedAgents
                                                                    .length
                                                            }{' '}
                                                            attempts
                                                        </span>
                                                    ) : null}
                                                </>
                                            );
                                        })()}
                                    </div>
                                    {lineage ? (
                                        <p className="message-lineage">
                                            {lineage}
                                        </p>
                                    ) : null}

                                    {message.role === 'user' &&
                                    message.status === 'active' ? (
                                        <div className="message-actions">
                                            <button
                                                className="quiet-btn"
                                                onClick={() =>
                                                    onEditStart(
                                                        message.id,
                                                        message.content,
                                                    )
                                                }
                                                type="button"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="ghost-btn"
                                                onClick={() =>
                                                    onResend(message.id)
                                                }
                                                type="button"
                                            >
                                                Resend
                                            </button>
                                            <button
                                                className="danger-btn"
                                                onClick={() =>
                                                    onRevoke(message.id)
                                                }
                                                type="button"
                                            >
                                                Revoke
                                            </button>
                                        </div>
                                    ) : null}
                                </div>

                                {editingMessageId === message.id ? (
                                    <div className="inline-editor">
                                        <textarea
                                            value={editingText}
                                            onChange={(event) =>
                                                onEditTextChange(
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <div className="inline-actions">
                                            <button
                                                className="btn"
                                                onClick={() =>
                                                    onEditSave(message.id)
                                                }
                                                type="button"
                                            >
                                                Save edit
                                            </button>
                                            <button
                                                className="ghost-btn"
                                                onClick={onEditCancel}
                                                type="button"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </article>
                        </div>
                    );
                })
            )}
            {currentActiveRun?.streamContent ? (
                <div className="message-row" data-role="assistant">
                    <article
                        className="message-bubble"
                        data-role="assistant"
                        data-streaming="true"
                    >
                        <div className="message-top">
                            <strong>
                                Assistant
                                {currentActiveRun.agent
                                    ? ` · ${currentActiveRun.agent}`
                                    : ''}
                            </strong>
                            <span>
                                live preview ·{' '}
                                {formatTimestamp(
                                    currentActiveRun.streamUpdatedAt ??
                                        currentActiveRun.startedAt,
                                )}
                            </span>
                        </div>
                        <MessageBody
                            message={{
                                id: -1,
                                timestamp:
                                    currentActiveRun.streamUpdatedAt ??
                                    currentActiveRun.startedAt,
                                channel: currentActiveRun.channel,
                                chatId: currentActiveRun.chatId,
                                userId: currentActiveRun.agent ?? 'assistant',
                                role: 'assistant',
                                content: currentActiveRun.streamContent,
                                ...(currentActiveRun.agent
                                    ? { agent: currentActiveRun.agent }
                                    : {}),
                                status: 'active',
                            }}
                        />
                        <div className="message-footer">
                            <div className="chip-row">
                                <span className="chip" data-tone="teal">
                                    streaming
                                </span>
                                <span className="chip">
                                    run {currentActiveRun.runId.slice(0, 8)}
                                </span>
                                {currentActiveRun.streamParser ? (
                                    <span className="chip">
                                        {currentActiveRun.streamParser}
                                    </span>
                                ) : null}
                            </div>
                            <div className="stream-cursor" aria-hidden="true" />
                        </div>
                    </article>
                </div>
            ) : null}
        </div>
    );
}
