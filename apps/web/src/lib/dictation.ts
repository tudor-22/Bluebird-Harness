/**
 * Browser dictation: Safari runs Apple's own dictation, Chrome and Edge use
 * their speech services, and the result is text in the composer. The mic
 * button uses this instead of the parked voice-note recording.
 */

export type DictationResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }>;
};

export type DictationErrorEvent = { error?: string };

export type DictationRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: DictationResultEvent) => void) | null;
  onerror: ((event: DictationErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type DictationCtor = new () => DictationRecognition;

/** What the Mac app offers the page: dictation done on this computer, with no network. */
type DesktopBridge = {
  start(lang: string): void;
  stop(): void;
  onEvent(callback: (event: { type: string; text?: string; error?: string }) => void): () => void;
};

type DesktopResult = { isFinal: boolean; 0: { transcript: string } };

/** Makes the Mac app's dictation look like the browser's, so the composer needs no special case. */
export function desktopDictation(bridge: DesktopBridge): DictationCtor {
  return class DesktopDictation implements DictationRecognition {
    lang = "";
    continuous = true;
    interimResults = true;
    onresult: DictationRecognition["onresult"] = null;
    onerror: DictationRecognition["onerror"] = null;
    onend: DictationRecognition["onend"] = null;
    private results: DesktopResult[] = [];
    private stopListening: (() => void) | null = null;

    start() {
      this.results = [];
      this.stopListening?.();
      this.stopListening = bridge.onEvent((event) => {
        if (event.type === "partial" || event.type === "final") {
          const last = this.results[this.results.length - 1];
          const entry: DesktopResult = { isFinal: event.type === "final", 0: { transcript: event.text ?? "" } };
          if (last && !last.isFinal) this.results[this.results.length - 1] = entry;
          else this.results.push(entry);
          this.onresult?.({ resultIndex: this.results.length - 1, results: this.results });
        } else if (event.type === "error") {
          this.onerror?.({ error: event.error });
        } else if (event.type === "end") {
          this.stopListening?.();
          this.stopListening = null;
          this.onend?.();
        }
      });
      bridge.start(this.lang);
    }

    stop() {
      bridge.stop();
    }
  };
}

export function dictationCtor(): DictationCtor | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { bluebirdDesktop?: { dictation?: DesktopBridge } }).bluebirdDesktop?.dictation;
  // The Mac app has its own dictation: the browser's needs Google's servers, which an app like this cannot reach.
  if (bridge) return desktopDictation(bridge);
  const scope = window as unknown as {
    SpeechRecognition?: DictationCtor;
    webkitSpeechRecognition?: DictationCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Joins the existing draft, the committed words and the live interim tail. */
export function composeDictation(base: string, committed: string, interim: string): string {
  return [base.trimEnd(), committed.trim(), interim.trim()].filter(Boolean).join(" ");
}

export function dictationErrorMessage(error: string | undefined): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone or speech access was blocked. Allow it in your system or browser settings and try again.";
    case "language-not-supported":
      return "Dictation is not available for this language on this computer.";
    case "audio-capture":
      return "No microphone was found.";
    case "network":
      return "Dictation needs a network connection in this browser.";
    case "no-speech":
      return "I did not catch any speech. Try again.";
    default:
      return "Dictation stopped unexpectedly.";
  }
}
