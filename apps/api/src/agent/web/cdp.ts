/** A small Chrome DevTools Protocol client: numbered commands, answers, and event listeners. */

export type CdpEvent = { method: string; params: any; sessionId?: string };

type Waiting = { resolve: (value: any) => void; reject: (error: Error) => void; method: string };

export class CdpError extends Error {
  constructor(message: string, readonly method: string) {
    super(message);
  }
}

export class Cdp {
  private socket!: WebSocket;
  private next = 1;
  private waiting = new Map<number, Waiting>();
  private listeners = new Set<(event: CdpEvent) => void>();
  closed = false;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(url);
      this.socket.onopen = () => resolve();
      this.socket.onerror = () => reject(new Error("Could not connect to the browser."));
      this.socket.onmessage = (message) => {
        let data: any;
        try {
          data = JSON.parse(String(message.data));
        } catch {
          return;
        }
        if (typeof data.id === "number") {
          const entry = this.waiting.get(data.id);
          if (!entry) return;
          this.waiting.delete(data.id);
          if (data.error) entry.reject(new CdpError(data.error.message ?? "Browser error.", entry.method));
          else entry.resolve(data.result ?? {});
        } else if (data.method) {
          for (const listener of this.listeners) listener(data as CdpEvent);
        }
      };
      this.socket.onclose = () => {
        this.closed = true;
        for (const entry of this.waiting.values()) entry.reject(new Error("The browser closed."));
        this.waiting.clear();
      };
    });
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = 30_000): Promise<any> {
    if (this.closed) return Promise.reject(new Error("The browser closed."));
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new CdpError(`The browser did not answer ${method}.`, method));
      }, timeoutMs);
      this.waiting.set(id, {
        method,
        resolve: (value) => (clearTimeout(timer), resolve(value)),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(listener: (event: CdpEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // Already closed.
    }
  }
}
