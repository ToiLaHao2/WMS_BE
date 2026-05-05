import { EventEmitter } from 'events';
import type { IEventBus } from './base-event-bus';

/**
 * InMemoryEventBus — Giao tiep dong bo trong cung 1 process.
 * Singleton pattern — toan bo app dung chung 1 instance.
 */
class InMemoryEventBus implements IEventBus {
    private _emitter: EventEmitter;

    constructor() {
        this._emitter = new EventEmitter();
        this._emitter.setMaxListeners(100);
    }

    publish(eventName: string, payload: unknown): void {
        this._emitter.emit(eventName, payload);
    }

    subscribe(eventName: string, handler: (payload: unknown) => void): void {
        this._emitter.on(eventName, handler);
    }

    unsubscribe(eventName: string, handler: (payload: unknown) => void): void {
        this._emitter.off(eventName, handler);
    }
}

export const eventBus: IEventBus = new InMemoryEventBus();
