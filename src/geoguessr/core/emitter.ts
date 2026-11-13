export type Unsubscribe = () => void;

export type Listener<Payload> = (payload: Payload) => unknown;

/**
 * A small typed event emitter. Unlike Node's, a listener may be async, and
 * whatever it throws or rejects with goes to `onListenerError` instead of
 * becoming an unhandled rejection: the owner decides what a failing listener
 * means (a game, for instance, fails its `done()` promise with it).
 */
export class Emitter<Events extends Record<string, unknown>> {
  readonly #listeners = new Map<keyof Events, Set<Listener<never>>>();
  readonly #onListenerError: (error: unknown, event: keyof Events) => void;

  constructor(onListenerError: (error: unknown, event: keyof Events) => void) {
    this.#onListenerError = onListenerError;
  }

  on<Event extends keyof Events>(
    event: Event,
    listener: Listener<Events[Event]>,
  ): Unsubscribe {
    let listeners = this.#listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.#listeners.set(event, listeners);
    }
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  once<Event extends keyof Events>(
    event: Event,
    listener: Listener<Events[Event]>,
  ): Unsubscribe {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      return listener(payload);
    });

    return unsubscribe;
  }

  emit<Event extends keyof Events>(event: Event, payload: Events[Event]) {
    for (const listener of [...(this.#listeners.get(event) ?? [])]) {
      try {
        const result = (listener as Listener<Events[Event]>)(payload);
        if (result instanceof Promise) {
          result.catch((error: unknown) => this.#onListenerError(error, event));
        }
      } catch (error) {
        this.#onListenerError(error, event);
      }
    }
  }
}
