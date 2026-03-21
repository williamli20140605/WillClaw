import {
  AUTH_SCOPE_OPTIONS,
  type ActiveRun,
  type AuthSessionSummary,
  type AuthTokenSummary,
  type CreatedAuthToken,
  type CreatedPairingInvite,
  type InspectorTab,
  type MemorySearchResult,
  type PairingPayload,
  type ProviderHealthEntry,
  type QueueSummary,
  type RealtimeEvent,
  type SchedulerTaskStatus,
  type SearchScope,
  type StatusPayload,
  type ToolLogEntry,
} from '../ui-types.js';
import { ActivityInspectorTab } from './inspector/ActivityInspectorTab.js';
import { RuntimeInspectorTab } from './inspector/RuntimeInspectorTab.js';
import { SearchInspectorTab } from './inspector/SearchInspectorTab.js';

interface BrowserFormFieldInput {
  clear?: boolean;
  selector: string;
  text?: string;
}

interface InspectorPanelProps {
  authAdminBusy: boolean;
  authSessions: AuthSessionSummary[];
  authTokenSummaries: AuthTokenSummary[];
  browserFormFieldsText: string;
  browserSubmitSelector: string;
  browserTarget: string;
  canManageAuth: boolean;
  currentActiveRun: ActiveRun | null;
  currentRecentEvents: RealtimeEvent[];
  deferredSearchQuery: string;
  handleCreateManagedToken(): void;
  handleCreatePairingInvite(): void;
  handleInjectIntoComposer(content: string): void;
  handleRevokeAuthSession(sessionId: string): void;
  handleRevokeAuthToken(tokenId: string): void;
  handleRevokePairingGrant(grantId: string): void;
  handleRevokePairingInvite(inviteId: string): void;
  handleSelectChat(chatId: string): void;
  handleTaskRun(endpoint: string): void;
  hostActionBusy: boolean;
  hostActionResult: string;
  inspectorTab: InspectorTab;
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
  searchLoading: boolean;
  searchQuery: string;
  searchResults: MemorySearchResult | null;
  searchScope: SearchScope;
  selectedChatId: string;
  selectedChatQueue: QueueSummary | null;
  setActionError(message: string): void;
  setBrowserFormFieldsText(value: string): void;
  setBrowserSubmitSelector(value: string): void;
  setBrowserTarget(value: string): void;
  setInspectorTab(tab: InspectorTab): void;
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
  setSearchQuery(value: string): void;
  setSearchScope(value: SearchScope): void;
  status: StatusPayload | null;
  toggleManagedTokenScope(scope: (typeof AUTH_SCOPE_OPTIONS)[number]): void;
  toolLogs: ToolLogEntry[];
}

export function InspectorPanel({
  authAdminBusy,
  authSessions,
  authTokenSummaries,
  browserFormFieldsText,
  browserSubmitSelector,
  browserTarget,
  canManageAuth,
  currentActiveRun,
  currentRecentEvents,
  deferredSearchQuery,
  handleCreateManagedToken,
  handleCreatePairingInvite,
  handleInjectIntoComposer,
  handleRevokeAuthSession,
  handleRevokeAuthToken,
  handleRevokePairingGrant,
  handleRevokePairingInvite,
  handleSelectChat,
  handleTaskRun,
  hostActionBusy,
  hostActionResult,
  inspectorTab,
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
  searchLoading,
  searchQuery,
  searchResults,
  searchScope,
  selectedChatId,
  selectedChatQueue,
  setActionError,
  setBrowserFormFieldsText,
  setBrowserSubmitSelector,
  setBrowserTarget,
  setInspectorTab,
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
  setSearchQuery,
  setSearchScope,
  status,
  toggleManagedTokenScope,
  toolLogs,
}: InspectorPanelProps) {
  return (
    <aside className="panel inspector">
      <div className="inspector-header">
        <div>
          <h2>Inspector</h2>
          <p>
            Debug and shell metadata stay nearby, not in the main reading lane.
          </p>
        </div>
      </div>

      <div className="inspector-tabs">
        {(['search', 'activity', 'runtime'] as InspectorTab[]).map((tab) => (
          <button
            className="inspector-tab"
            data-active={inspectorTab === tab}
            key={tab}
            onClick={() => setInspectorTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="inspector-body">
        {inspectorTab === 'search' ? (
          <SearchInspectorTab
            deferredSearchQuery={deferredSearchQuery}
            searchLoading={searchLoading}
            searchQuery={searchQuery}
            searchResults={searchResults}
            searchScope={searchScope}
            onInjectIntoComposer={handleInjectIntoComposer}
            onSearchQueryChange={setSearchQuery}
            onSearchScopeChange={setSearchScope}
            onSelectChat={handleSelectChat}
            onSetInspectorTab={setInspectorTab}
          />
        ) : null}

        {inspectorTab === 'activity' ? (
          <ActivityInspectorTab
            currentActiveRun={currentActiveRun}
            currentRecentEvents={currentRecentEvents}
            selectedChatId={selectedChatId}
            toolLogs={toolLogs}
          />
        ) : null}

        {inspectorTab === 'runtime' ? (
          <RuntimeInspectorTab
            authAdminBusy={authAdminBusy}
            authSessions={authSessions}
            authTokenSummaries={authTokenSummaries}
            browserFormFieldsText={browserFormFieldsText}
            browserSubmitSelector={browserSubmitSelector}
            browserTarget={browserTarget}
            canManageAuth={canManageAuth}
            handleCreateManagedToken={handleCreateManagedToken}
            handleCreatePairingInvite={handleCreatePairingInvite}
            handleRevokeAuthSession={handleRevokeAuthSession}
            handleRevokeAuthToken={handleRevokeAuthToken}
            handleRevokePairingGrant={handleRevokePairingGrant}
            handleRevokePairingInvite={handleRevokePairingInvite}
            handleTaskRun={handleTaskRun}
            hostActionBusy={hostActionBusy}
            hostActionResult={hostActionResult}
            latestManagedToken={latestManagedToken}
            managedTokenId={managedTokenId}
            managedTokenScopes={managedTokenScopes}
            pairingBusy={pairingBusy}
            pairingChannel={pairingChannel}
            pairingInvite={pairingInvite}
            pairingKind={pairingKind}
            pairingState={pairingState}
            parseBrowserFormFields={parseBrowserFormFields}
            providerHealth={providerHealth}
            runHostAction={runHostAction}
            schedulerTasks={schedulerTasks}
            screenApp={screenApp}
            screenInputText={screenInputText}
            screenSendClear={screenSendClear}
            screenSendInspectAfter={screenSendInspectAfter}
            screenSendLaunchIfNeeded={screenSendLaunchIfNeeded}
            screenSendPressReturn={screenSendPressReturn}
            screenSendRequireFrontmost={screenSendRequireFrontmost}
            selectedChatId={selectedChatId}
            selectedChatQueue={selectedChatQueue}
            setActionError={setActionError}
            setBrowserFormFieldsText={setBrowserFormFieldsText}
            setBrowserSubmitSelector={setBrowserSubmitSelector}
            setBrowserTarget={setBrowserTarget}
            setManagedTokenId={setManagedTokenId}
            setPairingChannel={setPairingChannel}
            setPairingKind={setPairingKind}
            setScreenApp={setScreenApp}
            setScreenInputText={setScreenInputText}
            setScreenSendClear={setScreenSendClear}
            setScreenSendInspectAfter={setScreenSendInspectAfter}
            setScreenSendLaunchIfNeeded={setScreenSendLaunchIfNeeded}
            setScreenSendPressReturn={setScreenSendPressReturn}
            setScreenSendRequireFrontmost={setScreenSendRequireFrontmost}
            status={status}
            toggleManagedTokenScope={toggleManagedTokenScope}
          />
        ) : null}
      </div>
    </aside>
  );
}
