import { startTransition, type Dispatch, type SetStateAction } from 'react';

import type {
  ActivityInspectorModel,
  AuthInspectorModel,
  HostLabModel,
  ManagedAuthScope,
  PairingInspectorModel,
  RuntimeInspectorModel,
  RuntimeOperationsModel,
  RuntimeStatusModel,
  SearchInspectorModel,
} from './inspector-types.js';

interface CreateInspectorModelsOptions {
  activityState: ActivityInspectorModel;
  authState: Pick<
    AuthInspectorModel,
    | 'authAdminBusy'
    | 'authSessions'
    | 'authTokenSummaries'
    | 'canManageAuth'
    | 'latestManagedToken'
    | 'managedTokenId'
    | 'managedTokenScopes'
  >;
  hostLabState: Pick<
    HostLabModel,
    | 'browserFormFieldsText'
    | 'browserSubmitSelector'
    | 'browserTarget'
    | 'hostActionBusy'
    | 'hostActionResult'
    | 'screenApp'
    | 'screenInputText'
    | 'screenSendClear'
    | 'screenSendInspectAfter'
    | 'screenSendLaunchIfNeeded'
    | 'screenSendPressReturn'
    | 'screenSendRequireFrontmost'
    | 'selectedChatId'
  >;
  pairingState: Pick<
    PairingInspectorModel,
    | 'pairingBusy'
    | 'pairingChannel'
    | 'pairingInvite'
    | 'pairingKind'
    | 'pairingState'
  >;
  runtimeState: RuntimeStatusModel &
    Pick<RuntimeOperationsModel, 'schedulerTasks' | 'selectedChatQueue'>;
  searchState: Pick<
    SearchInspectorModel,
    | 'deferredSearchQuery'
    | 'searchLoading'
    | 'searchQuery'
    | 'searchResults'
    | 'searchScope'
  >;
  actions: {
    handleCreateManagedToken(): Promise<void>;
    handleCreatePairingInvite(): Promise<void>;
    handleInjectIntoComposer(content: string): void;
    handleRevokeAuthSession(sessionId: string): Promise<void>;
    handleRevokeAuthToken(tokenId: string): Promise<void>;
    handleRevokePairingGrant(grantId: string): Promise<void>;
    handleRevokePairingInvite(inviteId: string): Promise<void>;
    handleSelectChat(chatId: string): void;
    handleTaskRun(endpoint: string): Promise<void>;
    parseBrowserFormFields: HostLabModel['parseBrowserFormFields'];
    runHostAction: HostLabModel['runHostAction'];
    setActionError(message: string): void;
    setBrowserFormFieldsText(value: string): void;
    setBrowserSubmitSelector(value: string): void;
    setBrowserTarget(value: string): void;
    setInspectorTab: SearchInspectorModel['onSetInspectorTab'];
    setManagedTokenId(value: string): void;
    setManagedTokenScopes: Dispatch<SetStateAction<string[]>>;
    setPairingChannel(value: PairingInspectorModel['pairingChannel']): void;
    setPairingKind(value: PairingInspectorModel['pairingKind']): void;
    setScreenApp(value: string): void;
    setScreenInputText(value: string): void;
    setScreenSendClear(value: boolean): void;
    setScreenSendInspectAfter(value: boolean): void;
    setScreenSendLaunchIfNeeded(value: boolean): void;
    setScreenSendPressReturn(value: boolean): void;
    setScreenSendRequireFrontmost(value: boolean): void;
    setSearchQuery(value: string): void;
    setSearchScope(value: SearchInspectorModel['searchScope']): void;
  };
}

export function createInspectorModels({
  activityState,
  actions,
  authState,
  hostLabState,
  pairingState,
  runtimeState,
  searchState,
}: CreateInspectorModelsOptions): {
  activityInspector: ActivityInspectorModel;
  runtimeInspector: RuntimeInspectorModel;
  searchInspector: SearchInspectorModel;
} {
  const toggleManagedTokenScope = (scope: ManagedAuthScope): void => {
    startTransition(() => {
      actions.setManagedTokenScopes((current) =>
        current.includes(scope)
          ? current.filter((entry) => entry !== scope)
          : [...current, scope],
      );
    });
  };

  return {
    searchInspector: {
      ...searchState,
      onInjectIntoComposer: actions.handleInjectIntoComposer,
      onSearchQueryChange: actions.setSearchQuery,
      onSearchScopeChange: actions.setSearchScope,
      onSelectChat: actions.handleSelectChat,
      onSetInspectorTab: actions.setInspectorTab,
    },
    activityInspector: activityState,
    runtimeInspector: {
      operations: {
        onTaskRun: actions.handleTaskRun,
        schedulerTasks: runtimeState.schedulerTasks,
        selectedChatQueue: runtimeState.selectedChatQueue,
      },
      hostLab: {
        ...hostLabState,
        parseBrowserFormFields: actions.parseBrowserFormFields,
        runHostAction: actions.runHostAction,
        setActionError: actions.setActionError,
        setBrowserFormFieldsText: actions.setBrowserFormFieldsText,
        setBrowserSubmitSelector: actions.setBrowserSubmitSelector,
        setBrowserTarget: actions.setBrowserTarget,
        setScreenApp: actions.setScreenApp,
        setScreenInputText: actions.setScreenInputText,
        setScreenSendClear: actions.setScreenSendClear,
        setScreenSendInspectAfter: actions.setScreenSendInspectAfter,
        setScreenSendLaunchIfNeeded: actions.setScreenSendLaunchIfNeeded,
        setScreenSendPressReturn: actions.setScreenSendPressReturn,
        setScreenSendRequireFrontmost: actions.setScreenSendRequireFrontmost,
      },
      pairing: {
        ...pairingState,
        onCreatePairingInvite: actions.handleCreatePairingInvite,
        onRevokePairingGrant: actions.handleRevokePairingGrant,
        onRevokePairingInvite: actions.handleRevokePairingInvite,
        setPairingChannel: actions.setPairingChannel,
        setPairingKind: actions.setPairingKind,
      },
      auth: {
        ...authState,
        onCreateManagedToken: actions.handleCreateManagedToken,
        onRevokeAuthSession: actions.handleRevokeAuthSession,
        onRevokeAuthToken: actions.handleRevokeAuthToken,
        setManagedTokenId: actions.setManagedTokenId,
        toggleManagedTokenScope,
      },
      status: {
        providerHealth: runtimeState.providerHealth,
        status: runtimeState.status,
      },
    },
  };
}
