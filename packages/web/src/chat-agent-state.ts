import {
    AUTO_ROUTE_AGENT_SELECTION,
    INHERIT_DEFAULT_AGENT_SELECTION,
} from './ui-helpers.js';

export interface ResolvedChatAgentState {
    chatUsesAutoRoute: boolean;
    chatUsesDefaultAgent: boolean;
    selectedAgent: string | null;
}

export function resolveChatAgentState(input: {
    agentSelections: Record<string, string>;
    defaultAgent: string | null;
    selectedChatId: string;
}): ResolvedChatAgentState {
    const chatSelection = input.agentSelections[input.selectedChatId];
    const chatUsesDefaultAgent = chatSelection == null;
    const chatUsesAutoRoute = chatSelection === AUTO_ROUTE_AGENT_SELECTION;
    const selectedAgent = chatUsesDefaultAgent
        ? input.defaultAgent
        : chatUsesAutoRoute
            ? null
            : chatSelection;

    return {
        chatUsesAutoRoute,
        chatUsesDefaultAgent,
        selectedAgent,
    };
}

export function applyChatAgentSelection(input: {
    agentSelections: Record<string, string>;
    selectedChatId: string;
    selection: string;
}): Record<string, string> {
    if (input.selection === INHERIT_DEFAULT_AGENT_SELECTION) {
        if (!(input.selectedChatId in input.agentSelections)) {
            return input.agentSelections;
        }

        const next = { ...input.agentSelections };
        delete next[input.selectedChatId];
        return next;
    }

    if (input.agentSelections[input.selectedChatId] === input.selection) {
        return input.agentSelections;
    }

    return {
        ...input.agentSelections,
        [input.selectedChatId]: input.selection,
    };
}

export function migrateChatAgentSelection(input: {
    agentSelections: Record<string, string>;
    fromChatId: string;
    toChatId: string;
}): Record<string, string> {
    if (input.fromChatId === input.toChatId) {
        return input.agentSelections;
    }

    const selection = input.agentSelections[input.fromChatId];
    if (!selection) {
        return input.agentSelections;
    }

    const next = {
        ...input.agentSelections,
        [input.toChatId]: selection,
    };
    delete next[input.fromChatId];
    return next;
}
