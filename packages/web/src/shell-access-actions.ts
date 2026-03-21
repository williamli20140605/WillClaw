import { startTransition, type Dispatch, type SetStateAction } from 'react';

import type {
    ActiveRun,
    AuthSessionSummary,
    AuthStatusPayload,
    AuthTokenSummary,
    CreatedAuthToken,
    CreatedPairingInvite,
    PairingGrant,
    PairingInvite,
    RealtimeEvent,
    StoredMessage,
    ToolLogEntry,
} from './ui-types.js';
import { readJson } from './ui-helpers.js';

interface ShellAccessAuthState {
    managedTokenId: string;
    managedTokenScopes: string[];
    tokenInput: string;
}

interface ShellAccessLoaders {
    loadAuthAdminPanel(): Promise<void>;
    loadMessagesPanel(chatId?: string): Promise<void>;
    loadPairingPanel(): Promise<void>;
    loadShellPanels(): Promise<void>;
    loadToolLogsPanel(chatId?: string): Promise<void>;
}

interface ShellAccessPairingState {
    channel: 'telegram' | 'discord' | 'feishu';
    invite: CreatedPairingInvite | null;
    kind: 'web' | 'channel';
}

interface ShellAccessSelection {
    selectedChatId: string;
}

interface ShellAccessSetters {
    auth: {
        setAdminBusy: Dispatch<SetStateAction<boolean>>;
        setBusy: Dispatch<SetStateAction<boolean>>;
        setLatestManagedToken: Dispatch<SetStateAction<CreatedAuthToken | null>>;
        setManagedTokenId: Dispatch<SetStateAction<string>>;
        setStatus: Dispatch<SetStateAction<AuthStatusPayload | null>>;
        setTokenInput: Dispatch<SetStateAction<string>>;
    };
    chat: {
        setMessages: Dispatch<SetStateAction<StoredMessage[]>>;
        setToolLogs: Dispatch<SetStateAction<ToolLogEntry[]>>;
    };
    pairing: {
        setBusy: Dispatch<SetStateAction<boolean>>;
        setInvite: Dispatch<SetStateAction<CreatedPairingInvite | null>>;
    };
    runtime: {
        setActiveRuns: Dispatch<SetStateAction<ActiveRun[]>>;
        setRealtimeConnected: Dispatch<SetStateAction<boolean>>;
        setRecentEvents: Dispatch<SetStateAction<RealtimeEvent[]>>;
    };
    ui: {
        setActionError: Dispatch<SetStateAction<string>>;
        setDashboardError: Dispatch<SetStateAction<string>>;
    };
}

interface CreateShellAccessActionsOptions {
    auth: ShellAccessAuthState;
    loaders: ShellAccessLoaders;
    pairing: ShellAccessPairingState;
    selection: ShellAccessSelection;
    setters: ShellAccessSetters;
}

export function createShellAccessActions({
    auth,
    loaders,
    pairing,
    selection,
    setters,
}: CreateShellAccessActionsOptions) {
    const {
        loadAuthAdminPanel,
        loadMessagesPanel,
        loadPairingPanel,
        loadShellPanels,
        loadToolLogsPanel,
    } = loaders;

    async function handleAuthLogin(): Promise<void> {
        const credential = auth.tokenInput.trim();
        if (!credential) {
            setters.ui.setDashboardError(
                'Enter a bearer token or pairing code to unlock the shell.',
            );
            return;
        }

        setters.auth.setBusy(true);
        setters.ui.setDashboardError('');

        try {
            let payload: AuthStatusPayload;

            try {
                payload = await readJson<AuthStatusPayload>('/api/auth/session', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({ token: credential }),
                });
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : 'Unlock failed.';
                if (!message.toLowerCase().includes('unauthorized')) {
                    throw error;
                }

                payload = await readJson<AuthStatusPayload>('/api/auth/pairing', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({ code: credential }),
                });
            }
            startTransition(() => {
                setters.auth.setStatus(payload);
                setters.auth.setTokenInput('');
                setters.runtime.setRealtimeConnected(false);
                setters.runtime.setRecentEvents([]);
                setters.runtime.setActiveRuns([]);
            });
            await Promise.all([
                loadShellPanels(),
                loadMessagesPanel(selection.selectedChatId),
                loadToolLogsPanel(selection.selectedChatId),
            ]);
        } catch (error) {
            setters.ui.setDashboardError(
                error instanceof Error
                    ? error.message
                    : 'Login failed with the provided token.',
            );
        } finally {
            setters.auth.setBusy(false);
        }
    }

    async function handleAuthLogout(): Promise<void> {
        setters.auth.setBusy(true);

        try {
            const payload = await readJson<AuthStatusPayload>('/api/auth/session', {
                method: 'DELETE',
            });
            startTransition(() => {
                setters.auth.setStatus(payload);
                setters.runtime.setRealtimeConnected(false);
                setters.runtime.setRecentEvents([]);
                setters.runtime.setActiveRuns([]);
                setters.chat.setMessages([]);
                setters.chat.setToolLogs([]);
            });
        } catch (error) {
            setters.ui.setDashboardError(
                error instanceof Error ? error.message : 'Logout failed.',
            );
        } finally {
            setters.auth.setBusy(false);
        }
    }

    async function handleRevokeAuthSession(sessionId: string): Promise<void> {
        setters.auth.setAdminBusy(true);
        setters.ui.setActionError('');

        try {
            await readJson<{ revoked: AuthSessionSummary }>(
                `/api/auth/sessions/${sessionId}`,
                {
                    method: 'DELETE',
                },
            );
            await loadAuthAdminPanel();
        } catch (error) {
            setters.ui.setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke session.',
            );
        } finally {
            setters.auth.setAdminBusy(false);
        }
    }

    async function handleCreateManagedToken(): Promise<void> {
        setters.auth.setAdminBusy(true);
        setters.ui.setActionError('');

        try {
            const payload = await readJson<CreatedAuthToken>('/api/auth/tokens', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    ...(auth.managedTokenId.trim()
                        ? { id: auth.managedTokenId.trim() }
                        : {}),
                    scopes: auth.managedTokenScopes,
                }),
            });
            startTransition(() => {
                setters.auth.setLatestManagedToken(payload);
                setters.auth.setManagedTokenId('');
            });
            await loadAuthAdminPanel();
        } catch (error) {
            setters.ui.setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to create managed auth token.',
            );
        } finally {
            setters.auth.setAdminBusy(false);
        }
    }

    async function handleRevokeAuthToken(tokenId: string): Promise<void> {
        setters.auth.setAdminBusy(true);
        setters.ui.setActionError('');

        try {
            await readJson<{ revoked: AuthTokenSummary }>(
                `/api/auth/tokens/${tokenId}`,
                {
                    method: 'DELETE',
                },
            );
            await loadAuthAdminPanel();
        } catch (error) {
            setters.ui.setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke managed auth token.',
            );
        } finally {
            setters.auth.setAdminBusy(false);
        }
    }

    async function handleCreatePairingInvite(): Promise<void> {
        setters.pairing.setBusy(true);
        setters.ui.setActionError('');

        try {
            const payload = await readJson<CreatedPairingInvite>(
                '/api/pairing/invites',
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        kind: pairing.kind,
                        ...(pairing.kind === 'channel'
                            ? { channels: [pairing.channel] }
                            : {}),
                    }),
                },
            );
            startTransition(() => {
                setters.pairing.setInvite(payload);
            });
            await loadPairingPanel();
        } catch (error) {
            setters.ui.setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to create pairing invite.',
            );
        } finally {
            setters.pairing.setBusy(false);
        }
    }

    async function handleRevokePairingInvite(inviteId: string): Promise<void> {
        setters.pairing.setBusy(true);
        setters.ui.setActionError('');

        try {
            await readJson<PairingInvite>(
                `/api/pairing/invites/${inviteId}/revoke`,
                {
                    method: 'POST',
                },
            );
            if (pairing.invite?.id === inviteId) {
                startTransition(() => {
                    setters.pairing.setInvite(null);
                });
            }
            await loadPairingPanel();
        } catch (error) {
            setters.ui.setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke pairing invite.',
            );
        } finally {
            setters.pairing.setBusy(false);
        }
    }

    async function handleRevokePairingGrant(grantId: string): Promise<void> {
        setters.pairing.setBusy(true);
        setters.ui.setActionError('');

        try {
            await readJson<PairingGrant>(`/api/pairing/grants/${grantId}/revoke`, {
                method: 'POST',
            });
            await loadPairingPanel();
        } catch (error) {
            setters.ui.setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke pairing grant.',
            );
        } finally {
            setters.pairing.setBusy(false);
        }
    }

    return {
        handleAuthLogin,
        handleAuthLogout,
        handleCreateManagedToken,
        handleCreatePairingInvite,
        handleRevokeAuthSession,
        handleRevokeAuthToken,
        handleRevokePairingGrant,
        handleRevokePairingInvite,
    };
}
