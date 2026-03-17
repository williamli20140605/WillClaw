import { randomUUID } from 'node:crypto';

export interface WillClawEvent {
    id: string;
    type: string;
    timestamp: string;
    payload: Record<string, unknown>;
}

type EventListener = (event: WillClawEvent) => void;

export class WillClawEventHub {
    private readonly listeners = new Set<EventListener>();

    subscribe(listener: EventListener): () => void {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    publish(type: string, payload?: Record<string, unknown>): WillClawEvent {
        const event: WillClawEvent = {
            id: randomUUID(),
            type,
            timestamp: new Date().toISOString(),
            payload: payload ?? {},
        };

        for (const listener of this.listeners) {
            listener(event);
        }

        return event;
    }
}
