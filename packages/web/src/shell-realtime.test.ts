import assert from 'node:assert/strict';
import test from 'node:test';

import { subscribeShellRealtime } from './shell-realtime.js';
import type { RealtimeEvent } from './ui-types.js';

class FakeEventSource {
    static instances: FakeEventSource[] = [];

    readonly listeners = new Map<string, Set<(event: Event) => void>>();
    closed = false;

    constructor(readonly url: string) {
        FakeEventSource.instances.push(this);
    }

    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
    ): void {
        const callback =
            typeof listener === 'function'
                ? listener
                : listener.handleEvent.bind(listener);
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(callback);
        this.listeners.set(type, listeners);
    }

    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
    ): void {
        const callback =
            typeof listener === 'function'
                ? listener
                : listener.handleEvent.bind(listener);
        this.listeners.get(type)?.delete(callback);
    }

    close(): void {
        this.closed = true;
    }

    emit(type: string, event: RealtimeEvent): void {
        const messageEvent = {
            data: JSON.stringify(event),
        } as MessageEvent<string>;

        for (const listener of this.listeners.get(type) ?? []) {
            listener(messageEvent as Event);
        }
    }
}

test('ready events reload queue-backed shell panels after connect or reconnect', () => {
    const originalEventSource = globalThis.EventSource;
    const loadCalls: string[] = [];
    const connectedStates: boolean[] = [];

    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;

    try {
        const unsubscribe = subscribeShellRealtime({
            async loadChatList() {
                loadCalls.push('chatList');
            },
            async loadMessagesPanel(chatId) {
                loadCalls.push(`messages:${chatId ?? ''}`);
            },
            async loadQueuePanel() {
                loadCalls.push('queue');
            },
            async loadSchedulerPanel() {
                loadCalls.push('scheduler');
            },
            async loadShellPanels() {
                loadCalls.push('shell');
            },
            async loadToolLogsPanel(chatId) {
                loadCalls.push(`toolLogs:${chatId ?? ''}`);
            },
            selectedChatId: 'chat-123',
            setActiveRuns() {},
            setRealtimeConnected(value) {
                connectedStates.push(value as boolean);
            },
            setRecentEvents() {},
        });

        const source = FakeEventSource.instances.at(-1);
        assert.ok(source);
        assert.equal(source.url, '/api/events');

        source.emit('ready', {
            id: 'evt-ready',
            type: 'ready',
            timestamp: '2026-03-22T00:00:00.000Z',
            payload: {},
        });

        assert.deepEqual(loadCalls, [
            'chatList',
            'queue',
            'scheduler',
            'messages:chat-123',
            'toolLogs:chat-123',
        ]);
        assert.deepEqual(connectedStates, [true]);

        unsubscribe();

        assert.equal(source.closed, true);
        assert.deepEqual(connectedStates, [true, false]);
    } finally {
        FakeEventSource.instances = [];
        globalThis.EventSource = originalEventSource;
    }
});
