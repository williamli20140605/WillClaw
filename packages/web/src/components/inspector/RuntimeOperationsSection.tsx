import { formatTimestamp, taskTone } from '../../ui-helpers.js';
import type { QueueSummary, SchedulerTaskStatus } from '../../ui-types.js';

interface RuntimeOperationsSectionProps {
  schedulerTasks: SchedulerTaskStatus[];
  selectedChatQueue: QueueSummary | null;
  onTaskRun(endpoint: string): void;
}

export function RuntimeOperationsSection({
  schedulerTasks,
  selectedChatQueue,
  onTaskRun,
}: RuntimeOperationsSectionProps) {
  return (
    <>
      <section className="inspector-panel">
        <div className="section-header">
          <h3>Scheduler</h3>
          <span>{schedulerTasks.length} tasks</span>
        </div>
        <div className="toolbar">
          <button
            className="ghost-btn"
            onClick={() => onTaskRun('/api/heartbeat/run')}
            type="button"
          >
            Run heartbeat
          </button>
          <button
            className="ghost-btn"
            onClick={() => onTaskRun('/api/cron/daily_briefing/run')}
            type="button"
          >
            Run briefing
          </button>
          <button
            className="ghost-btn"
            onClick={() => onTaskRun('/api/maintenance/daily_note/run')}
            type="button"
          >
            Daily note
          </button>
          <button
            className="ghost-btn"
            onClick={() => onTaskRun('/api/maintenance/compact/run')}
            type="button"
          >
            Compact memory
          </button>
        </div>
        <div className="stack-list">
          {schedulerTasks.map((task) => (
            <article className="task-card" key={task.id}>
              <strong>{task.name}</strong>
              <div className="chip-row">
                <span className="chip" data-tone={taskTone(task.lastResult)}>
                  {task.lastResult ?? 'never run'}
                </span>
                <span className="chip">{task.kind}</span>
                <span className="chip">{task.schedule}</span>
              </div>
              <p className="muted">
                Last run: {formatTimestamp(task.lastRunAt)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="inspector-panel">
        <div className="section-header">
          <h3>Queue</h3>
          <span>
            {selectedChatQueue ? `${selectedChatQueue.total} pending` : 'idle'}
          </span>
        </div>
        {selectedChatQueue ? (
          <div className="stack-list">
            {selectedChatQueue.runs.map((run) => (
              <article className="task-card" key={run.runId}>
                <strong>
                  {run.status === 'running'
                    ? 'Running now'
                    : `Queued #${run.position}`}
                </strong>
                <div className="chip-row">
                  <span
                    className="chip"
                    data-tone={run.status === 'running' ? 'teal' : 'accent'}
                  >
                    {run.status}
                  </span>
                  <span className="chip">run {run.runId.slice(0, 8)}</span>
                  <span className="chip">msg #{run.userMessageId}</span>
                </div>
                <p className="muted">
                  {run.status === 'running'
                    ? 'This run is currently executing for the selected thread.'
                    : `${run.ahead} run(s) ahead in this thread.`}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">No queued work in this thread right now.</div>
        )}
      </section>
    </>
  );
}
