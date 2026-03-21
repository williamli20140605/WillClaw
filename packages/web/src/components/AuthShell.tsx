import type { AuthStatusPayload } from '../ui-types.js';

export function AuthLoadingScreen() {
    return (
        <main className="auth-shell">
            <section className="panel auth-card">
                <div className="eyebrow">WillClaw Shell</div>
                <h1>Loading shell access…</h1>
                <p>
                    Checking whether this workspace requires an authenticated
                    session before the dashboard boots.
                </p>
            </section>
        </main>
    );
}

export interface AuthUnlockScreenProps {
    authBusy: boolean;
    authStatus: AuthStatusPayload;
    authTokenInput: string;
    dashboardError: string;
    onAuthTokenInputChange(value: string): void;
    onLogin(): void;
}

export function AuthUnlockScreen({
    authBusy,
    authStatus,
    authTokenInput,
    dashboardError,
    onAuthTokenInputChange,
    onLogin,
}: AuthUnlockScreenProps) {
    return (
        <main className="auth-shell">
            <section className="panel auth-card">
                <div className="eyebrow">WillClaw Shell</div>
                <h1>Unlock the shell</h1>
                <p>
                    This workspace is protected. Paste a bearer token with
                    `api:session` access
                    {authStatus.pairingEnabled ? ' or a valid pairing code' : ''}
                    {' '}to open the Web UI.
                </p>
                <label className="auth-field">
                    <span>
                        {authStatus.pairingEnabled
                            ? 'Bearer token or pairing code'
                            : 'Bearer token'}
                    </span>
                    <input
                        autoComplete="off"
                        onChange={(event) =>
                            onAuthTokenInputChange(event.target.value)
                        }
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                onLogin();
                            }
                        }}
                        placeholder={
                            authStatus.pairingEnabled
                                ? 'wc_xxx... or wc_pair_...'
                                : 'wc_xxx...'
                        }
                        type="password"
                        value={authTokenInput}
                    />
                </label>
                <div className="auth-actions">
                    <button
                        className="btn"
                        disabled={authBusy}
                        onClick={onLogin}
                        type="button"
                    >
                        {authBusy ? 'Unlocking…' : 'Unlock'}
                    </button>
                </div>
                {dashboardError ? <p className="error">{dashboardError}</p> : null}
            </section>
        </main>
    );
}
