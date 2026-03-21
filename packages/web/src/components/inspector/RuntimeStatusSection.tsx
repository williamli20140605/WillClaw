import { toolPolicySummary } from '../../ui-helpers.js';
import type { RuntimeStatusModel } from '../../inspector-types.js';

export function RuntimeStatusSection({
  providerHealth,
  status,
}: RuntimeStatusModel) {
  return (
    <>
      <section className="inspector-panel">
        <div className="section-header">
          <h3>Providers</h3>
          <span>{providerHealth.length} checks</span>
        </div>
        <div className="stack-list">
          {providerHealth.map((entry) => (
            <article
              className="provider-card"
              key={`${entry.tool}-${entry.provider}`}
            >
              <div className="status-line">
                <strong>{entry.provider}</strong>
                <div className="chip-row">
                  <span className="chip">{entry.tool}</span>
                  <span
                    className="chip"
                    data-tone={
                      entry.healthy
                        ? 'teal'
                        : entry.available
                          ? 'accent'
                          : 'danger'
                    }
                  >
                    {entry.healthy
                      ? 'healthy'
                      : entry.available
                        ? 'degraded'
                        : 'missing'}
                  </span>
                </div>
              </div>
              <p className="muted">{entry.detail}</p>
              <div className="chip-row">
                {entry.actions.map((action) => (
                  <span
                    className="chip"
                    data-tone={
                      action.healthy
                        ? 'teal'
                        : action.available
                          ? 'accent'
                          : 'danger'
                    }
                    key={`${entry.provider}-${action.action}`}
                    title={action.detail}
                  >
                    {action.action}
                  </span>
                ))}
              </div>
              {entry.installHint ? (
                <p className="muted">Hint: {entry.installHint}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="inspector-panel">
        <div className="section-header">
          <h3>Agents</h3>
          <span>{status?.server.port ?? 8420}</span>
        </div>
        <div className="stack-list">
          {status?.agents.map((agent) => (
            <article className="agent-card" key={agent.name}>
              <div className="status-line">
                <strong>{agent.name}</strong>
                <span className="status-pill">
                  <span
                    className="status-dot"
                    data-tone={agent.available ? 'teal' : 'danger'}
                  />
                  {agent.type}
                </span>
              </div>
              <div className="chip-row">
                <span
                  className="chip"
                  data-tone={agent.available ? 'teal' : 'danger'}
                >
                  {agent.available ? 'available' : 'unavailable'}
                </span>
                <span className="chip">
                  {agent.enabled ? 'enabled' : 'disabled'}
                </span>
              </div>
              <p className="muted">{toolPolicySummary(agent)}</p>
            </article>
          )) ?? <div className="empty">Loading agent availability…</div>}
        </div>
      </section>

      <section className="inspector-panel">
        <div className="section-header">
          <h3>Host Tools</h3>
          <span>{status?.hostTools.length ?? 0} tools</span>
        </div>
        <div className="stack-list">
          {status?.hostTools.map((tool) => (
            <article className="tool-card" key={tool.name}>
              <div className="status-line">
                <strong>{tool.label}</strong>
                <span className="chip">
                  {tool.mode ?? (tool.globalEnabled ? 'enabled' : 'disabled')}
                </span>
              </div>
              <p className="muted">
                {tool.category}
                {tool.preferredProvider ? ` · ${tool.preferredProvider}` : ''}
                {tool.fallbackProvider ? ` → ${tool.fallbackProvider}` : ''}
              </p>
            </article>
          )) ?? <div className="empty">Loading hosted tool policy…</div>}
        </div>
      </section>
    </>
  );
}
