import {
  buildEditedSuccessorMap,
  extractAssistantRouteMetadata,
  isSearchCommand,
  readPayloadString,
} from './ui-helpers.js';
import { WEB_CHANNEL, type AssistantRouteMetadata, type CronPayload, type ActiveRun, type ChatSummary, type QueueSummary, type RealtimeEvent, type StatusPayload, type StoredMessage } from './ui-types.js';

interface CreateDashboardDerivedStateOptions {
  activeRuns: ActiveRun[];
  chats: ChatSummary[];
  cronState: CronPayload | null;
  deferredComposerText: string;
  draftChatId: string | null;
  messages: StoredMessage[];
  queueSummaries: QueueSummary[];
  recentEvents: RealtimeEvent[];
  selectedChatId: string;
  status: StatusPayload | null;
}

export function createDashboardDerivedState({
  activeRuns,
  chats,
  cronState,
  deferredComposerText,
  draftChatId,
  messages,
  queueSummaries,
  recentEvents,
  selectedChatId,
  status,
}: CreateDashboardDerivedStateOptions) {
  const availableAgents = status?.agents.filter((agent) => agent.available) ?? [];
  const totalTasks =
    (cronState?.heartbeat ? 1 : 0) +
    (cronState?.cron.length ?? 0) +
    (cronState?.maintenance.length ?? 0);
  const chatList =
    draftChatId && !chats.some((chat) => chat.chatId === draftChatId)
      ? [
          {
            channel: WEB_CHANNEL,
            chatId: draftChatId,
            updatedAt: new Date().toISOString(),
            messageCount: 0,
            preview: 'Fresh conversation',
            role: 'user' as const,
          },
          ...chats,
        ]
      : chats;
  const selectedChat =
    chatList.find((chat) => chat.chatId === selectedChatId) ?? null;
  const queueSummaryByChatId = new Map(
    queueSummaries.map((summary) => [summary.chatId, summary] as const),
  );
  const editedSuccessorById = buildEditedSuccessorMap(messages);
  const selectedChatQueue = queueSummaryByChatId.get(selectedChatId) ?? null;
  const selectedQueueLeadRun = selectedChatQueue?.runs[0] ?? null;
  const currentActiveRun =
    activeRuns.find(
      (entry) =>
        entry.channel === WEB_CHANNEL && entry.chatId === selectedChatId,
    ) ?? null;
  const latestAssistantRoute: AssistantRouteMetadata | null =
    [...messages]
      .reverse()
      .map((message) => extractAssistantRouteMetadata(message))
      .find((route): route is AssistantRouteMetadata => Boolean(route)) ?? null;
  const currentRecentEvents = recentEvents.filter((event) => {
    const eventChannel = readPayloadString(event.payload, 'channel');
    const eventChatId = readPayloadString(event.payload, 'chatId');

    return (
      !eventChannel ||
      eventChannel !== WEB_CHANNEL ||
      eventChatId === selectedChatId
    );
  });
  const schedulerTasks = [
    ...(cronState?.heartbeat ? [cronState.heartbeat] : []),
    ...(cronState?.cron ?? []),
    ...(cronState?.maintenance ?? []),
  ];
  const composerShowsSearch = isSearchCommand(deferredComposerText);

  return {
    availableAgents,
    chatList,
    composerShowsSearch,
    currentActiveRun,
    currentRecentEvents,
    editedSuccessorById,
    latestAssistantRoute,
    queueSummaryByChatId,
    schedulerTasks,
    selectedChat,
    selectedChatQueue,
    selectedQueueLeadRun,
    totalTasks,
  };
}
