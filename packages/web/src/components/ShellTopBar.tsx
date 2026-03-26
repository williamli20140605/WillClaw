interface ShellTopBarProps {
    authBusy: boolean;
    authRequired: boolean;
    availableAgentCount: number;
    mobileNavOpen: boolean;
    realtimeConnected: boolean;
    serverAddress: string | undefined;
    taskCount: number;
    threadCount: number;
    tokenId: string | undefined;
    workspaceMode: 'chat' | 'control';
    onLogout(): void;
    onShellNavToggle(): void;
    onWorkspaceModeChange(mode: 'chat' | 'control'): void;
}

export function ShellTopBar({
    authBusy,
    authRequired,
    mobileNavOpen,
    realtimeConnected,
    serverAddress,
    tokenId,
    workspaceMode,
    onLogout,
    onShellNavToggle,
    onWorkspaceModeChange,
}: ShellTopBarProps) {
    const trailItems =
        workspaceMode === 'control'
            ? ['shell nav', 'ops deck', 'runtime']
            : ['thread lane', 'routing', 'runtime'];

    return (
        <header className="panel topbar">
            <div className="brand">
                <div className="brand-mark">WC</div>
                <div className="brand-copy">
                    <div className="eyebrow">WillClaw Control</div>
                    <h1>Gateway shell</h1>
                    <div className="brand-trail">
                        {trailItems.map((item) => (
                            <span key={item}>{item}</span>
                        ))}
                    </div>
                </div>
            </div>
            <button
                className="topbar-shell-toggle"
                data-open={mobileNavOpen ? 'true' : undefined}
                onClick={onShellNavToggle}
                type="button"
            >
                {mobileNavOpen ? 'Close shell' : 'Open shell'}
            </button>
            <div className="topbar-mode-switch">
                <button
                    className="topbar-mode-btn"
                    data-active={workspaceMode === 'chat' ? 'true' : undefined}
                    onClick={() => onWorkspaceModeChange('chat')}
                    type="button"
                >
                    Chat
                </button>
                <button
                    className="topbar-mode-btn"
                    data-active={workspaceMode === 'control' ? 'true' : undefined}
                    onClick={() => onWorkspaceModeChange('control')}
                    type="button"
                >
                    Control
                </button>
            </div>
            <div className="topbar-actions">
                <span
                    className="status-pill"
                    data-tone={realtimeConnected ? 'teal' : 'accent'}
                >
                    {realtimeConnected ? 'live stream' : 'reconnecting'}
                </span>
                <span className="status-pill">
                    {serverAddress ?? '127.0.0.1:8420'}
                </span>
                {authRequired ? (
                    <div className="topbar-auth">
                        <span className="status-pill">
                            {tokenId ?? 'session'}
                        </span>
                        <button
                            className="quiet-btn"
                            disabled={authBusy}
                            onClick={onLogout}
                            type="button"
                        >
                            {authBusy ? 'Working…' : 'Log out'}
                        </button>
                    </div>
                ) : (
                    <span className="status-pill">local access</span>
                )}
            </div>
        </header>
    );
}
