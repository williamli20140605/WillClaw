import { formatRelativeTime } from '../../ui-helpers.js';
import type {
  ActivityInspectorModel,
  RuntimeInspectorModel,
  SearchInspectorModel,
} from '../../inspector-types.js';

interface OverviewInspectorTabProps {
  activity: ActivityInspectorModel;
  runtime: RuntimeInspectorModel;
  search: SearchInspectorModel;
}

export function OverviewInspectorTab({
  activity,
  runtime,
  search,
}: OverviewInspectorTabProps) {
  const providerCount = runtime.status.providerHealth.length;
  const healthyProviders = runtime.status.providerHealth.filter(
    (entry) => entry.configured && entry.healthy,
  ).length;
  const availableAgents = runtime.status.status?.agents.filter(
    (agent) => agent.enabled && agent.available,
  ).length ?? 0;
  const totalAgents = runtime.status.status?.agents.filter(
    (agent) => agent.enabled,
  ).length ?? 0;
  const hostToolCount = runtime.status.status?.hostTools.filter(
    (tool) => tool.globalEnabled,
  ).length ?? 0;
  const searchResultCount =
    (search.searchResults?.messages.length ?? 0) +
    (search.searchResults?.files.length ?? 0);

  return (
    <div className="stack-list">
      <section className="inspector-panel">
        <div className="section-header">
          <h3>Control Overview</h3>
          <span>gateway snapshot</span>
        </div>
        <div className="overview-grid">
          <article className="overview-card">
            <span>agents</span>
            <strong>
              {availableAgents}/{totalAgents || availableAgents}
            </strong>
            <p>Enabled agents currently reachable from the shell.</p>
          </article>
          <article className="overview-card">
            <span>providers</span>
            <strong>
              {healthyProviders}/{providerCount || healthyProviders}
            </strong>
            <p>Configured browser and screen providers passing health checks.</p>
          </article>
          <article className="overview-card">
            <span>host tools</span>
            <strong>{hostToolCount}</strong>
            <p>Host integrations globally enabled in runtime status.</p>
          </article>
          <article className="overview-card">
            <span>search</span>
            <strong>{searchResultCount}</strong>
            <p>
              {search.searchQuery.trim()
                ? `Current memory hits for “${search.searchQuery.trim()}”.`
                : 'No active shell-side memory query.'}
            </p>
          </article>
        </div>
      </section>

      <section className="inspector-panel">
        <div className="section-header">
          <h3>Live Run</h3>
          <span>{activity.selectedChatId}</span>
        </div>
        {activity.currentActiveRun ? (
          <article className="task-card">
            <strong>
              {activity.currentActiveRun.agent ?? 'orchestrator'} ·{' '}
              {activity.currentActiveRun.status}
            </strong>
            <div className="chip-row">
              <span className="chip" data-tone="accent">
                {activity.currentActiveRun.phase}
              </span>
              {activity.currentActiveRun.executionMode ? (
                <span className="chip">
                  {activity.currentActiveRun.executionMode}
                </span>
              ) : null}
            </div>
            <p className="muted">
              Started {formatRelativeTime(activity.currentActiveRun.startedAt)}
            </p>
          </article>
        ) : (
          <div className="empty">No active run in the selected thread.</div>
        )}
      </section>

      <section className="inspector-panel">
        <div className="section-header">
          <h3>Recent Tool Activity</h3>
          <span>{activity.toolLogs.length}</span>
        </div>
        {activity.toolLogs.length === 0 ? (
          <div className="empty">No recent tool executions in this thread.</div>
        ) : (
          <div className="stack-list">
            {activity.toolLogs.slice(0, 3).map((entry) => (
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
                  <span className="chip">{entry.agent}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
