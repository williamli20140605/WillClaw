import {
  AUTH_SCOPE_OPTIONS,
  type AuthSessionSummary,
  type AuthTokenSummary,
  type CreatedAuthToken,
  type CreatedPairingInvite,
  type PairingPayload,
  type ProviderHealthEntry,
  type QueueSummary,
  type SchedulerTaskStatus,
  type StatusPayload,
} from '../../ui-types.js';
import { AuthSection } from './AuthSection.js';
import { HostLabSection } from './HostLabSection.js';
import { PairingSection } from './PairingSection.js';
import { RuntimeOperationsSection } from './RuntimeOperationsSection.js';
import { RuntimeStatusSection } from './RuntimeStatusSection.js';

interface BrowserFormFieldInput {
  clear?: boolean;
  selector: string;
  text?: string;
}

type AuthScopeOption = (typeof AUTH_SCOPE_OPTIONS)[number];

interface RuntimeInspectorTabProps {
  authAdminBusy: boolean;
  authSessions: AuthSessionSummary[];
  authTokenSummaries: AuthTokenSummary[];
  browserFormFieldsText: string;
  browserSubmitSelector: string;
  browserTarget: string;
  canManageAuth: boolean;
  handleCreateManagedToken(): void;
  handleCreatePairingInvite(): void;
  handleRevokeAuthSession(sessionId: string): void;
  handleRevokeAuthToken(tokenId: string): void;
  handleRevokePairingGrant(grantId: string): void;
  handleRevokePairingInvite(inviteId: string): void;
  handleTaskRun(endpoint: string): void;
  hostActionBusy: boolean;
  hostActionResult: string;
  latestManagedToken: CreatedAuthToken | null;
  managedTokenId: string;
  managedTokenScopes: string[];
  pairingBusy: boolean;
  pairingChannel: 'telegram' | 'discord' | 'feishu';
  pairingInvite: CreatedPairingInvite | null;
  pairingKind: 'web' | 'channel';
  pairingState: PairingPayload | null;
  parseBrowserFormFields(): BrowserFormFieldInput[];
  providerHealth: ProviderHealthEntry[];
  runHostAction(endpoint: string, payload: Record<string, unknown>): void;
  schedulerTasks: SchedulerTaskStatus[];
  screenApp: string;
  screenInputText: string;
  screenSendClear: boolean;
  screenSendInspectAfter: boolean;
  screenSendLaunchIfNeeded: boolean;
  screenSendPressReturn: boolean;
  screenSendRequireFrontmost: boolean;
  selectedChatId: string;
  selectedChatQueue: QueueSummary | null;
  setActionError(message: string): void;
  setBrowserFormFieldsText(value: string): void;
  setBrowserSubmitSelector(value: string): void;
  setBrowserTarget(value: string): void;
  setManagedTokenId(value: string): void;
  setPairingChannel(value: 'telegram' | 'discord' | 'feishu'): void;
  setPairingKind(value: 'web' | 'channel'): void;
  setScreenApp(value: string): void;
  setScreenInputText(value: string): void;
  setScreenSendClear(value: boolean): void;
  setScreenSendInspectAfter(value: boolean): void;
  setScreenSendLaunchIfNeeded(value: boolean): void;
  setScreenSendPressReturn(value: boolean): void;
  setScreenSendRequireFrontmost(value: boolean): void;
  status: StatusPayload | null;
  toggleManagedTokenScope(scope: AuthScopeOption): void;
}

export function RuntimeInspectorTab({
  authAdminBusy,
  authSessions,
  authTokenSummaries,
  browserFormFieldsText,
  browserSubmitSelector,
  browserTarget,
  canManageAuth,
  handleCreateManagedToken,
  handleCreatePairingInvite,
  handleRevokeAuthSession,
  handleRevokeAuthToken,
  handleRevokePairingGrant,
  handleRevokePairingInvite,
  handleTaskRun,
  hostActionBusy,
  hostActionResult,
  latestManagedToken,
  managedTokenId,
  managedTokenScopes,
  pairingBusy,
  pairingChannel,
  pairingInvite,
  pairingKind,
  pairingState,
  parseBrowserFormFields,
  providerHealth,
  runHostAction,
  schedulerTasks,
  screenApp,
  screenInputText,
  screenSendClear,
  screenSendInspectAfter,
  screenSendLaunchIfNeeded,
  screenSendPressReturn,
  screenSendRequireFrontmost,
  selectedChatId,
  selectedChatQueue,
  setActionError,
  setBrowserFormFieldsText,
  setBrowserSubmitSelector,
  setBrowserTarget,
  setManagedTokenId,
  setPairingChannel,
  setPairingKind,
  setScreenApp,
  setScreenInputText,
  setScreenSendClear,
  setScreenSendInspectAfter,
  setScreenSendLaunchIfNeeded,
  setScreenSendPressReturn,
  setScreenSendRequireFrontmost,
  status,
  toggleManagedTokenScope,
}: RuntimeInspectorTabProps) {
  return (
    <div className="stack-list">
      <RuntimeOperationsSection
        schedulerTasks={schedulerTasks}
        selectedChatQueue={selectedChatQueue}
        onTaskRun={handleTaskRun}
      />
      <HostLabSection
        browserFormFieldsText={browserFormFieldsText}
        browserSubmitSelector={browserSubmitSelector}
        browserTarget={browserTarget}
        hostActionBusy={hostActionBusy}
        hostActionResult={hostActionResult}
        parseBrowserFormFields={parseBrowserFormFields}
        runHostAction={runHostAction}
        screenApp={screenApp}
        screenInputText={screenInputText}
        screenSendClear={screenSendClear}
        screenSendInspectAfter={screenSendInspectAfter}
        screenSendLaunchIfNeeded={screenSendLaunchIfNeeded}
        screenSendPressReturn={screenSendPressReturn}
        screenSendRequireFrontmost={screenSendRequireFrontmost}
        selectedChatId={selectedChatId}
        setActionError={setActionError}
        setBrowserFormFieldsText={setBrowserFormFieldsText}
        setBrowserSubmitSelector={setBrowserSubmitSelector}
        setBrowserTarget={setBrowserTarget}
        setScreenApp={setScreenApp}
        setScreenInputText={setScreenInputText}
        setScreenSendClear={setScreenSendClear}
        setScreenSendInspectAfter={setScreenSendInspectAfter}
        setScreenSendLaunchIfNeeded={setScreenSendLaunchIfNeeded}
        setScreenSendPressReturn={setScreenSendPressReturn}
        setScreenSendRequireFrontmost={setScreenSendRequireFrontmost}
      />
      <PairingSection
        pairingBusy={pairingBusy}
        pairingChannel={pairingChannel}
        pairingInvite={pairingInvite}
        pairingKind={pairingKind}
        pairingState={pairingState}
        setPairingChannel={setPairingChannel}
        setPairingKind={setPairingKind}
        onCreatePairingInvite={handleCreatePairingInvite}
        onRevokePairingGrant={handleRevokePairingGrant}
        onRevokePairingInvite={handleRevokePairingInvite}
      />
      <AuthSection
        authAdminBusy={authAdminBusy}
        authSessions={authSessions}
        authTokenSummaries={authTokenSummaries}
        canManageAuth={canManageAuth}
        latestManagedToken={latestManagedToken}
        managedTokenId={managedTokenId}
        managedTokenScopes={managedTokenScopes}
        setManagedTokenId={setManagedTokenId}
        toggleManagedTokenScope={toggleManagedTokenScope}
        onCreateManagedToken={handleCreateManagedToken}
        onRevokeAuthSession={handleRevokeAuthSession}
        onRevokeAuthToken={handleRevokeAuthToken}
      />
      <RuntimeStatusSection providerHealth={providerHealth} status={status} />
    </div>
  );
}
