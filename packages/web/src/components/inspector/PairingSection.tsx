import { formatTimestamp } from '../../ui-helpers.js';
import type { PairingInspectorModel } from '../../inspector-types.js';

export function PairingSection({
  pairingBusy,
  pairingChannel,
  pairingInvite,
  pairingKind,
  pairingState,
  setPairingChannel,
  setPairingKind,
  onCreatePairingInvite,
  onRevokePairingGrant,
  onRevokePairingInvite,
}: PairingInspectorModel) {
  return (
    <section className="inspector-panel">
      <div className="section-header">
        <h3>Pairing</h3>
        <span>{pairingState?.enabled ? 'invite users' : 'disabled'}</span>
      </div>
      <div className="stack-list">
        <article className="host-action-card">
          <label className="field-label" htmlFor="pairing-kind">
            Invite type
          </label>
          <div className="toolbar">
            <select
              className="field-input"
              id="pairing-kind"
              onChange={(event) =>
                setPairingKind(event.target.value as 'web' | 'channel')
              }
              value={pairingKind}
            >
              <option value="web">web ui</option>
              <option value="channel">channel</option>
            </select>
            {pairingKind === 'channel' ? (
              <select
                className="field-input"
                onChange={(event) =>
                  setPairingChannel(
                    event.target.value as 'telegram' | 'discord' | 'feishu',
                  )
                }
                value={pairingChannel}
              >
                <option value="telegram">telegram</option>
                <option value="discord">discord</option>
                <option value="feishu">feishu</option>
              </select>
            ) : null}
            <button
              className="btn"
              disabled={pairingBusy || !pairingState?.enabled}
              onClick={onCreatePairingInvite}
              type="button"
            >
              {pairingBusy ? 'Creating…' : 'Create invite'}
            </button>
          </div>
          <p className="muted">
            One-time codes are safer than handing out long-lived bearer tokens.
          </p>
        </article>

        {pairingInvite ? (
          <article className="host-result-card">
            <div className="section-header">
              <h3>Latest Invite</h3>
              <span>{pairingInvite.kind}</span>
            </div>
            <pre className="host-result">
              {`code: ${pairingInvite.code}
expires: ${pairingInvite.expiresAt}
${pairingInvite.channels.length > 0 ? `channels: ${pairingInvite.channels.join(', ')}` : `scopes: ${pairingInvite.scopes.join(', ')}`}`}
            </pre>
          </article>
        ) : null}

        <article className="provider-card">
          <div className="status-line">
            <strong>Active invites</strong>
            <span className="chip">{pairingState?.invites.length ?? 0}</span>
          </div>
          <div className="stack-list">
            {(pairingState?.invites ?? []).slice(0, 4).map((invite) => (
              <div key={invite.id} className="provider-action-list">
                <strong>
                  {invite.kind} · {invite.codePreview}
                </strong>
                <span className="muted">
                  {invite.active ? 'active' : 'inactive'} · uses{' '}
                  {invite.usedCount}/{invite.maxUses}
                </span>
                {invite.revokedAt ? (
                  <span className="muted">
                    revoked {formatTimestamp(invite.revokedAt)}
                  </span>
                ) : null}
                <div className="toolbar">
                  <button
                    className="ghost-btn"
                    disabled={pairingBusy || !invite.active}
                    onClick={() => onRevokePairingInvite(invite.id)}
                    type="button"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
            {(pairingState?.invites.length ?? 0) === 0 ? (
              <div className="empty">No pairing invites yet.</div>
            ) : null}
          </div>
        </article>

        <article className="provider-card">
          <div className="status-line">
            <strong>Granted users</strong>
            <span className="chip">{pairingState?.grants.length ?? 0}</span>
          </div>
          <div className="stack-list">
            {(pairingState?.grants ?? []).slice(0, 4).map((grant) => (
              <div key={grant.id} className="provider-action-list">
                <strong>
                  {grant.channel} · {grant.userId}
                </strong>
                <span className="muted">
                  invite {grant.inviteId.slice(0, 8)}
                </span>
                <div className="toolbar">
                  <button
                    className="ghost-btn"
                    disabled={pairingBusy}
                    onClick={() => onRevokePairingGrant(grant.id)}
                    type="button"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
            {(pairingState?.grants.length ?? 0) === 0 ? (
              <div className="empty">No paired channel users yet.</div>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
