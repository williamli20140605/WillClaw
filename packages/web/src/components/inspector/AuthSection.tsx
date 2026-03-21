import { formatTimestamp } from '../../ui-helpers.js';
import {
  AUTH_SCOPE_OPTIONS,
  type AuthSessionSummary,
  type AuthTokenSummary,
  type CreatedAuthToken,
} from '../../ui-types.js';

type AuthScopeOption = (typeof AUTH_SCOPE_OPTIONS)[number];

interface AuthSectionProps {
  authAdminBusy: boolean;
  authSessions: AuthSessionSummary[];
  authTokenSummaries: AuthTokenSummary[];
  canManageAuth: boolean;
  latestManagedToken: CreatedAuthToken | null;
  managedTokenId: string;
  managedTokenScopes: string[];
  setManagedTokenId(value: string): void;
  toggleManagedTokenScope(scope: AuthScopeOption): void;
  onCreateManagedToken(): void;
  onRevokeAuthSession(sessionId: string): void;
  onRevokeAuthToken(tokenId: string): void;
}

export function AuthSection({
  authAdminBusy,
  authSessions,
  authTokenSummaries,
  canManageAuth,
  latestManagedToken,
  managedTokenId,
  managedTokenScopes,
  setManagedTokenId,
  toggleManagedTokenScope,
  onCreateManagedToken,
  onRevokeAuthSession,
  onRevokeAuthToken,
}: AuthSectionProps) {
  return (
    <section className="inspector-panel">
      <div className="section-header">
        <h3>Auth</h3>
        <span>{canManageAuth ? 'session scope' : 'read-only'}</span>
      </div>
      <div className="stack-list">
        <article className="host-action-card">
          <label className="field-label" htmlFor="managed-token-id">
            Managed token id (optional)
          </label>
          <input
            className="field-input"
            disabled={!canManageAuth || authAdminBusy}
            id="managed-token-id"
            onChange={(event) => setManagedTokenId(event.target.value)}
            placeholder="ops-web"
            type="text"
            value={managedTokenId}
          />
          <div className="chip-row">
            {AUTH_SCOPE_OPTIONS.map((scope) => (
              <button
                className="ghost-btn"
                data-tone={
                  managedTokenScopes.includes(scope) ? 'teal' : undefined
                }
                disabled={!canManageAuth || authAdminBusy}
                key={scope}
                onClick={() => toggleManagedTokenScope(scope)}
                type="button"
              >
                {scope}
              </button>
            ))}
          </div>
          <div className="toolbar">
            <button
              className="btn"
              disabled={
                !canManageAuth ||
                authAdminBusy ||
                managedTokenScopes.length === 0
              }
              onClick={onCreateManagedToken}
              type="button"
            >
              {authAdminBusy ? 'Working…' : 'Create token'}
            </button>
          </div>
          <p className="muted">
            Managed tokens are stored as hashes on disk. The raw token is only
            shown once after creation.
          </p>
        </article>

        {latestManagedToken ? (
          <article className="host-result-card">
            <div className="section-header">
              <h3>Latest Managed Token</h3>
              <span>{latestManagedToken.id}</span>
            </div>
            <pre className="host-result">
              {`token: ${latestManagedToken.token}
created: ${latestManagedToken.createdAt}
scopes: ${latestManagedToken.scopes.join(', ')}`}
            </pre>
          </article>
        ) : null}

        <article className="provider-card">
          <div className="status-line">
            <strong>Auth Tokens</strong>
            <span className="chip">{authTokenSummaries.length}</span>
          </div>
          <div className="stack-list">
            {authTokenSummaries.slice(0, 4).map((token) => (
              <div
                key={[
                  token.source,
                  token.id,
                  token.createdAt ?? '',
                  token.tokenPreview ?? '',
                ].join(':')}
                className="provider-action-list"
              >
                <strong>{token.id}</strong>
                <span className="muted">
                  {token.source} ·{' '}
                  {token.legacy ? 'legacy owner' : token.scopes.join(', ')}
                </span>
                {token.tokenPreview ? (
                  <span className="muted">preview {token.tokenPreview}</span>
                ) : null}
                {token.createdAt ? (
                  <span className="muted">
                    created {formatTimestamp(token.createdAt)}
                  </span>
                ) : null}
                {token.revokedAt ? (
                  <span className="muted">
                    revoked {formatTimestamp(token.revokedAt)}
                  </span>
                ) : null}
                {token.source === 'managed' ? (
                  <div className="toolbar">
                    <button
                      className="ghost-btn"
                      disabled={
                        !canManageAuth || authAdminBusy || !token.active
                      }
                      onClick={() => onRevokeAuthToken(token.id)}
                      type="button"
                    >
                      Revoke
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {authTokenSummaries.length === 0 ? (
              <div className="empty">
                {canManageAuth
                  ? 'No auth tokens.'
                  : 'This session cannot inspect auth tokens.'}
              </div>
            ) : null}
          </div>
        </article>

        <article className="provider-card">
          <div className="status-line">
            <strong>Active Sessions</strong>
            <span className="chip">{authSessions.length}</span>
          </div>
          <div className="stack-list">
            {authSessions.slice(0, 6).map((session) => (
              <div key={session.id} className="provider-action-list">
                <strong>{session.tokenId}</strong>
                <span className="muted">
                  created {formatTimestamp(session.createdAt)}
                </span>
                <span className="muted">
                  expires {formatTimestamp(session.expiresAt)}
                </span>
                <div className="toolbar">
                  <button
                    className="ghost-btn"
                    disabled={!canManageAuth || authAdminBusy}
                    onClick={() => onRevokeAuthSession(session.id)}
                    type="button"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
            {authSessions.length === 0 ? (
              <div className="empty">
                {canManageAuth
                  ? 'No active sessions.'
                  : 'This session cannot inspect auth sessions.'}
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
