interface ShellTopBarProps {
    authBusy: boolean;
    authRequired: boolean;
    availableAgentCount: number;
    realtimeConnected: boolean;
    taskCount: number;
    threadCount: number;
    tokenId: string | undefined;
    onLogout(): void;
}

export function ShellTopBar({
    authBusy,
    authRequired,
    availableAgentCount,
    realtimeConnected,
    taskCount,
    threadCount,
    tokenId,
    onLogout,
}: ShellTopBarProps) {
    return (
        <header className="panel topbar">
            <div className="brand">
                <div className="brand-mark">WC</div>
                <div className="brand-copy">
                    <div className="eyebrow">WillClaw Shell</div>
                    <h1>One conversation. Many coding agents.</h1>
                    <p>
                        Route chats, memory, tools, and background work from
                        one shell-first interface instead of living inside a
                        single agent session.
                    </p>
                </div>
            </div>
            <div className="status-cluster">
                <div className="status-card">
                    <label>Realtime</label>
                    <strong>{realtimeConnected ? 'Live' : 'Retrying'}</strong>
                </div>
                <div className="status-card">
                    <label>Agents</label>
                    <strong>{availableAgentCount}</strong>
                </div>
                <div className="status-card">
                    <label>Threads</label>
                    <strong>{threadCount}</strong>
                </div>
                <div className="status-card">
                    <label>Tasks</label>
                    <strong>{taskCount}</strong>
                </div>
                {authRequired ? (
                    <div className="status-card status-card--auth">
                        <label>Auth</label>
                        <strong>{tokenId ?? 'session'}</strong>
                        <button
                            className="quiet-btn status-card__action"
                            disabled={authBusy}
                            onClick={onLogout}
                            type="button"
                        >
                            {authBusy ? 'Working…' : 'Log out'}
                        </button>
                    </div>
                ) : null}
            </div>
        </header>
    );
}
