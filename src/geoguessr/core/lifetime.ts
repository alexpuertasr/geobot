import { ClosedError } from "../errors";
import type { SdkLogger } from "../options";

export type Closeable = { close(): Promise<void> };

/**
 * Everything a client opened, so closing the client closes it all. Closes
 * never throw: one failing must not leave the others open in a frozen Lambda.
 */
export class Lifetime {
  readonly #logger: SdkLogger;
  readonly #handles = new Set<Closeable>();
  #closing: Promise<void> | null = null;

  constructor(logger: SdkLogger) {
    this.#logger = logger;
  }

  assertOpen() {
    if (this.#closing) throw new ClosedError("The GeoGuessr client is closed");
  }

  /** Returns the handle's deregistration. A handle opened while closing is closed at once. */
  track(handle: Closeable): () => void {
    if (this.#closing) {
      void this.#closeQuietly(handle);
      return () => {};
    }

    this.#handles.add(handle);
    return () => this.#handles.delete(handle);
  }

  /**
   * Closes every handle, then the socket they share — last, so their
   * unsubscribes still go out on it. Idempotent.
   */
  close(sharedSocket: Closeable): Promise<void> {
    this.#closing ??= this.#closeAll(sharedSocket);
    return this.#closing;
  }

  async #closeAll(sharedSocket: Closeable) {
    await Promise.all(
      [...this.#handles].map((handle) => this.#closeQuietly(handle)),
    );
    await this.#closeQuietly(sharedSocket);
  }

  async #closeQuietly(handle: Closeable) {
    try {
      await handle.close();
    } catch (error) {
      this.#logger.warn("📡 Could not close a GeoGuessr handle", { error });
    }
  }
}
