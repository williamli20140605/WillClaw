import {
  describeRealtimeEvent,
  formatDuration,
  formatRelativeTime,
  formatTimestamp,
  summarizeText,
} from '../../ui-helpers.js';
import type { ActivityInspectorModel } from '../../inspector-types.js';

interface ActivityInspectorTabProps {
  activity: ActivityInspectorModel;
}

export function ActivityInspectorTab({ activity }: ActivityInspectorTabProps) {
  const {
    currentActiveRun,
    currentRecentEvents,
    selectedChatId,
    toolLogs,
  } = activity;

  return (
    <div className="stack-list">
      <section className="inspector-panel">
        <div className="section-header">
          <h3>Run Status</h3>
          <span>{selectedChatId}</span>
        </div>
        {currentActiveRun ? (
          <article className="task-card">
            <strong>run {currentActiveRun.runId.slice(0, 8)}</strong>
            <div className="chip-row">
              <span className="chip" data-tone="accent">
                {currentActiveRun.status}
              </span>
              {currentActiveRun.executionMode ? (
                <span className="chip">{currentActiveRun.executionMode}</span>
              ) : null}
              {currentActiveRun.agent ? (
                <span className="chip">{currentActiveRun.agent}</span>
              ) : null}
            </div>
            <p className="muted">
              Started {formatRelativeTime(currentActiveRun.startedAt)}
            </p>
            <p className="muted">{currentActiveRun.phase}</p>
            {currentActiveRun.streamContent ? (
              <p className="muted">
                Preview: {summarizeText(currentActiveRun.streamContent, 160)}
              </p>
            ) : null}
          </article>
        ) : (
          <div className="empty">No active run for this conversation.</div>
        )}
      </section>

      <section className="inspector-panel">
        <div className="section-header">
          <h3>Recent Events</h3>
          <span>{currentRecentEvents.length}</span>
        </div>
        <div className="stack-list">
          {currentRecentEvents.length === 0 ? (
            <div className="empty">Waiting for chat events.</div>
          ) : (
            currentRecentEvents.map((event) => {
              const descriptor = describeRealtimeEvent(event);

              return (
                <article className="task-card" key={event.id}>
                  <strong>{descriptor.title}</strong>
                  <p className="muted">{descriptor.detail}</p>
                  <p className="muted">{formatTimestamp(event.timestamp)}</p>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="inspector-panel">
        <div className="section-header">
          <h3>Tool Logs</h3>
          <span>{toolLogs.length} latest</span>
        </div>
        <div className="stack-list">
          {toolLogs.length === 0 ? (
            <div className="empty">
              No tool activity recorded for this chat yet.
            </div>
          ) : (
            toolLogs.map((entry) => (
              <article className="log-card" key={entry.id}>
                <strong>
                  {entry.tool}.{entry.action}
                </strong>
                <div className="chip-row">
                  <span
                    className="chip"
                    data-tone={entry.success ? 'teal' : 'danger'}
                  >
                    {entry.success ? 'success' : 'failed'}
                  </span>
                  <span className="chip">
                    {formatDuration(entry.durationMs)}
                  </span>
                  <span className="chip">{entry.agent}</span>
                </div>
                <p className="log-snippet">{summarizeText(entry.input, 120)}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
