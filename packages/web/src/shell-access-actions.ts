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

interface CreateShellAccessActionsOptions {
    authTokenInput: string;
    loadAuthAdminPanel(): Promise<void>;
    loadMessagesPanel(chatId?: string): Promise<void>;
    loadPairingPanel(): Promise<void>;
    loadShellPanels(): Promise<void>;
    loadToolLogsPanel(chatId?: string): Promise<void>;
    managedTokenId: string;
    managedTokenScopes: string[];
    pairingChannel: 'telegram' | 'discord' | 'feishu';
    pairingInvite: CreatedPairingInvite | null;
    pairingKind: 'web' | 'channel';
    selectedChatId: string;
    setActionError: Dispatch<SetStateAction<string>>;
    setActiveRuns: Dispatch<SetStateAction<ActiveRun[]>>;
    setAuthAdminBusy: Dispatch<SetStateAction<boolean>>;
    setAuthBusy: Dispatch<SetStateAction<boolean>>;
    setAuthStatus: Dispatch<SetStateAction<AuthStatusPayload | null>>;
    setAuthTokenInput: Dispatch<SetStateAction<string>>;
    setDashboardError: Dispatch<SetStateAction<string>>;
    setLatestManagedToken: Dispatch<SetStateAction<CreatedAuthToken | null>>;
    setMessages: Dispatch<SetStateAction<StoredMessage[]>>;
    setPairingBusy: Dispatch<SetStateAction<boolean>>;
    setPairingInvite: Dispatch<SetStateAction<CreatedPairingInvite | null>>;
    setRealtimeConnected: Dispatch<SetStateAction<boolean>>;
    setRecentEvents: Dispatch<SetStateAction<RealtimeEvent[]>>;
    setToolLogs: Dispatch<SetStateAction<ToolLogEntry[]>>;
    setManagedTokenId: Dispatch<SetStateAction<string>>;
}

export function createShellAccessActions({
    authTokenInput,
    loadAuthAdminPanel,
    loadMessagesPanel,
    loadPairingPanel,
    loadShellPanels,
    loadToolLogsPanel,
    managedTokenId,
    managedTokenScopes,
    pairingChannel,
    pairingInvite,
    pairingKind,
    selectedChatId,
    setActionError,
    setActiveRuns,
    setAuthAdminBusy,
    setAuthBusy,
    setAuthStatus,
    setAuthTokenInput,
    setDashboardError,
    setLatestManagedToken,
    setMessages,
    setManagedTokenId,
    setPairingBusy,
    setPairingInvite,
    setRealtimeConnected,
    setRecentEvents,
    setToolLogs,
}: CreateShellAccessActionsOptions) {
    async function handleAuthLogin(): Promise<void> {
        const credential = authTokenInput.trim();
        if (!credential) {
            setDashboardError(
                'Enter a bearer token or pairing code to unlock the shell.',
            );
            return;
        }

        setAuthBusy(true);
        setDashboardError('');

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
                setAuthStatus(payload);
                setAuthTokenInput('');
                setRealtimeConnected(false);
                setRecentEvents([]);
                setActiveRuns([]);
            });
            await Promise.all([
                loadShellPanels(),
                loadMessagesPanel(selectedChatId),
                loadToolLogsPanel(selectedChatId),
            ]);
        } catch (error) {
            setDashboardError(
                error instanceof Error
                    ? error.message
                    : 'Login failed with the provided token.',
            );
        } finally {
            setAuthBusy(false);
        }
    }

    async function handleAuthLogout(): Promise<void> {
        setAuthBusy(true);

        try {
            const payload = await readJson<AuthStatusPayload>('/api/auth/session', {
                method: 'DELETE',
            });
            startTransition(() => {
                setAuthStatus(payload);
                setRealtimeConnected(false);
                setRecentEvents([]);
                setActiveRuns([]);
                setMessages([]);
                setToolLogs([]);
            });
        } catch (error) {
            setDashboardError(
                error instanceof Error ? error.message : 'Logout failed.',
            );
        } finally {
            setAuthBusy(false);
        }
    }

    async function handleRevokeAuthSession(sessionId: string): Promise<void> {
        setAuthAdminBusy(true);
        setActionError('');

        try {
            await readJson<{ revoked: AuthSessionSummary }>(
                `/api/auth/sessions/${sessionId}`,
                {
                    method: 'DELETE',
                },
            );
            await loadAuthAdminPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke session.',
            );
        } finally {
            setAuthAdminBusy(false);
        }
    }

    async function handleCreateManagedToken(): Promise<void> {
        setAuthAdminBusy(true);
        setActionError('');

        try {
            const payload = await readJson<CreatedAuthToken>('/api/auth/tokens', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    ...(managedTokenId.trim() ? { id: managedTokenId.trim() } : {}),
                    scopes: managedTokenScopes,
                }),
            });
            startTransition(() => {
                setLatestManagedToken(payload);
                setManagedTokenId('');
            });
            await loadAuthAdminPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to create managed auth token.',
            );
        } finally {
            setAuthAdminBusy(false);
        }
    }

    async function handleRevokeAuthToken(tokenId: string): Promise<void> {
        setAuthAdminBusy(true);
        setActionError('');

        try {
            await readJson<{ revoked: AuthTokenSummary }>(
                `/api/auth/tokens/${tokenId}`,
                {
                    method: 'DELETE',
                },
            );
            await loadAuthAdminPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke managed auth token.',
            );
        } finally {
            setAuthAdminBusy(false);
        }
    }

    async function handleCreatePairingInvite(): Promise<void> {
        setPairingBusy(true);
        setActionError('');

        try {
            const payload = await readJson<CreatedPairingInvite>(
                '/api/pairing/invites',
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        kind: pairingKind,
                        ...(pairingKind === 'channel'
                            ? { channels: [pairingChannel] }
                            : {}),
                    }),
                },
            );
            startTransition(() => {
                setPairingInvite(payload);
            });
            await loadPairingPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to create pairing invite.',
            );
        } finally {
            setPairingBusy(false);
        }
    }

    async function handleRevokePairingInvite(inviteId: string): Promise<void> {
        setPairingBusy(true);
        setActionError('');

        try {
            await readJson<PairingInvite>(
                `/api/pairing/invites/${inviteId}/revoke`,
                {
                    method: 'POST',
                },
            );
            if (pairingInvite?.id === inviteId) {
                startTransition(() => {
                    setPairingInvite(null);
                });
            }
            await loadPairingPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke pairing invite.',
            );
        } finally {
            setPairingBusy(false);
        }
    }

    async function handleRevokePairingGrant(grantId: string): Promise<void> {
        setPairingBusy(true);
        setActionError('');

        try {
            await readJson<PairingGrant>(`/api/pairing/grants/${grantId}/revoke`, {
                method: 'POST',
            });
            await loadPairingPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke pairing grant.',
            );
        } finally {
            setPairingBusy(false);
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
