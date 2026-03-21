import type {
  AUTH_SCOPE_OPTIONS,
  ActiveRun,
  AuthSessionSummary,
  AuthTokenSummary,
  CreatedAuthToken,
  CreatedPairingInvite,
  InspectorTab,
  MemorySearchResult,
  PairingPayload,
  ProviderHealthEntry,
  QueueSummary,
  RealtimeEvent,
  SchedulerTaskStatus,
  SearchScope,
  StatusPayload,
  ToolLogEntry,
} from './ui-types.js';

export interface BrowserFormFieldInput {
  clear?: boolean;
  selector: string;
  text: string;
}

export type RunHostAction = (
  endpoint: string,
  payload: Record<string, unknown>,
) => void;

export type ManagedAuthScope = (typeof AUTH_SCOPE_OPTIONS)[number];
export type PairingChannel = 'telegram' | 'discord' | 'feishu';
export type PairingKind = 'web' | 'channel';

export interface SearchInspectorModel {
  deferredSearchQuery: string;
  searchLoading: boolean;
  searchQuery: string;
  searchResults: MemorySearchResult | null;
  searchScope: SearchScope;
  onInjectIntoComposer(content: string): void;
  onSearchQueryChange(value: string): void;
  onSearchScopeChange(value: SearchScope): void;
  onSelectChat(chatId: string): void;
  onSetInspectorTab(tab: InspectorTab): void;
}

export interface ActivityInspectorModel {
  currentActiveRun: ActiveRun | null;
  currentRecentEvents: RealtimeEvent[];
  selectedChatId: string;
  toolLogs: ToolLogEntry[];
}

export interface RuntimeOperationsModel {
  onTaskRun(endpoint: string): void;
  schedulerTasks: SchedulerTaskStatus[];
  selectedChatQueue: QueueSummary | null;
}

export interface HostLabModel {
  browserFormFieldsText: string;
  browserSubmitSelector: string;
  browserTarget: string;
  hostActionBusy: boolean;
  hostActionResult: string;
  parseBrowserFormFields(): BrowserFormFieldInput[];
  runHostAction: RunHostAction;
  screenApp: string;
  screenInputText: string;
  screenSendClear: boolean;
  screenSendInspectAfter: boolean;
  screenSendLaunchIfNeeded: boolean;
  screenSendPressReturn: boolean;
  screenSendRequireFrontmost: boolean;
  selectedChatId: string;
  setActionError(message: string): void;
  setBrowserFormFieldsText(value: string): void;
  setBrowserSubmitSelector(value: string): void;
  setBrowserTarget(value: string): void;
  setScreenApp(value: string): void;
  setScreenInputText(value: string): void;
  setScreenSendClear(value: boolean): void;
  setScreenSendInspectAfter(value: boolean): void;
  setScreenSendLaunchIfNeeded(value: boolean): void;
  setScreenSendPressReturn(value: boolean): void;
  setScreenSendRequireFrontmost(value: boolean): void;
}

export interface PairingInspectorModel {
  onCreatePairingInvite(): void;
  onRevokePairingGrant(grantId: string): void;
  onRevokePairingInvite(inviteId: string): void;
  pairingBusy: boolean;
  pairingChannel: PairingChannel;
  pairingInvite: CreatedPairingInvite | null;
  pairingKind: PairingKind;
  pairingState: PairingPayload | null;
  setPairingChannel(value: PairingChannel): void;
  setPairingKind(value: PairingKind): void;
}

export interface AuthInspectorModel {
  authAdminBusy: boolean;
  authSessions: AuthSessionSummary[];
  authTokenSummaries: AuthTokenSummary[];
  canManageAuth: boolean;
  latestManagedToken: CreatedAuthToken | null;
  managedTokenId: string;
  managedTokenScopes: string[];
  onCreateManagedToken(): void;
  onRevokeAuthSession(sessionId: string): void;
  onRevokeAuthToken(tokenId: string): void;
  setManagedTokenId(value: string): void;
  toggleManagedTokenScope(scope: ManagedAuthScope): void;
}

export interface RuntimeStatusModel {
  providerHealth: ProviderHealthEntry[];
  status: StatusPayload | null;
}

export interface RuntimeInspectorModel {
  auth: AuthInspectorModel;
  hostLab: HostLabModel;
  operations: RuntimeOperationsModel;
  pairing: PairingInspectorModel;
  status: RuntimeStatusModel;
}
