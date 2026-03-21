import { startTransition } from 'react';

import type {
    AuthSessionSummary,
    AuthStatusPayload,
    AuthTokenSummary,
    CreatedAuthToken,
    CreatedPairingInvite,
    PairingGrant,
    PairingInvite,
} from './ui-types.js';
import type {
    ShellAuthState,
    ShellPairingState,
    ShellSetters,
} from './shell-state-types.js';
import { readJson } from './ui-helpers.js';

interface ShellAccessLoaders {
    loadAuthAdminPanel(): Promise<void>;
    loadMessagesPanel(chatId?: string): Promise<void>;
    loadPairingPanel(): Promise<void>;
    loadShellPanels(): Promise<void>;
    loadToolLogsPanel(chatId?: string): Promise<void>;
}

interface ShellAccessSelection {
    selectedChatId: string;
}

interface CreateShellAccessActionsOptions {
    auth: Pick<
        ShellAuthState,
        'managedTokenId' | 'managedTokenScopes' | 'tokenInput'
    >;
    loaders: ShellAccessLoaders;
    pairing: Pick<ShellPairingState, 'channel' | 'invite' | 'kind'>;
    selection: ShellAccessSelection;
    setters: Pick<
        ShellSetters,
        'auth' | 'chat' | 'pairing' | 'runtime' | 'ui'
    >;
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
