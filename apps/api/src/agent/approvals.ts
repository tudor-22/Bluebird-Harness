import type { ToolDecision } from "@bluebird/shared";

/** Holds a tool call until the person answers it, or gives up after a while. */
export type ApprovalBroker = {
  /** Waits for a decision on a call. Resolves "reject" on timeout or when the reply is stopped. */
  request(id: string, userId: string, signal?: AbortSignal, timeoutMs?: number): Promise<ToolDecision>;
  /** Answers a waiting call. False when nothing is waiting under that id for this user. */
  decide(id: string, userId: string, decision: ToolDecision): boolean;
};

export function createApprovalBroker(): ApprovalBroker {
  const waiting = new Map<string, { userId: string; resolve: (decision: ToolDecision) => void }>();
  return {
    request(id, userId, signal, timeoutMs = 10 * 60_000) {
      return new Promise((resolve) => {
        const done = (decision: ToolDecision) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          waiting.delete(id);
          resolve(decision);
        };
        const onAbort = () => done("reject");
        const timer = setTimeout(() => done("reject"), timeoutMs);
        signal?.addEventListener("abort", onAbort, { once: true });
        waiting.set(id, { userId, resolve: done });
      });
    },
    decide(id, userId, decision) {
      const entry = waiting.get(id);
      if (!entry || entry.userId !== userId) return false;
      entry.resolve(decision);
      return true;
    },
  };
}
