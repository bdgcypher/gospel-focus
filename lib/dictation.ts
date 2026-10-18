"use client";

import { isNative } from "./external";

/**
 * Dictation: the microphone, turned into words.
 *
 * Two recognizers do the work, and which one is available depends on where the
 * app is running. In the packaged Android/iOS app it is the native one
 * (`@capgo/capacitor-speech-recognition`, which drives Android's
 * `SpeechRecognizer` and iOS's speech framework); in a browser it is the Web
 * Speech API, which the packaged app's WebView does not have. Both are spoken to
 * through one small interface here, so the editor's microphone button does not
 * have to know which it got — and so the browser build keeps working without the
 * native plugin being present.
 *
 * What the caller sees is two kinds of event, and the split matters for a
 * document: `onPartial` is what the recognizer thinks it hears *right now* and
 * may be rewritten on the next event, so it is shown as a preview and never
 * written into the entry; `onFinal` is a finished phrase, and that is what gets
 * inserted. Anything else would put half-heard words into the text and leave the
 * reader to clean them out.
 */

/** Text kind: what has been heard for sure, and what is still being guessed. */
export interface DictationHandlers {
  /** Still changing. Show it; don't keep it. */
  onPartial: (text: string) => void;
  /** A settled phrase, ready to be written down. */
  onFinal: (text: string) => void;
  /** The session ended, for any reason. Always called once. */
  onEnd?: () => void;
  /** Something went wrong, in words the reader can act on. */
  onError?: (message: string) => void;
}

export interface DictationSession {
  /** Stop listening. Safe to call more than once. */
  stop: () => void;
}

/** The browser API, which TypeScript's DOM lib doesn't declare. */
interface BrowserRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: BrowserResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface BrowserResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

type BrowserRecognitionConstructor = new () => BrowserRecognition;

function browserRecognition(): BrowserRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: BrowserRecognitionConstructor;
    webkitSpeechRecognition?: BrowserRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** The native plugin, loaded only where it can exist. */
async function nativePlugin() {
  const speech = await import("@capgo/capacitor-speech-recognition");
  return speech.SpeechRecognition;
}

/**
 * Whether there is a microphone to talk to at all, so the button can be offered
 * only where it will work. The native answer is the plugin's own; the browser's
 * is the presence of the API.
 */
export async function dictationAvailable(): Promise<boolean> {
  if (isNative()) {
    try {
      const plugin = await nativePlugin();
      const { available } = await plugin.available();
      return available;
    } catch {
      return false;
    }
  }
  return browserRecognition() !== null;
}

/** What went wrong, said the way a reader would say it. */
const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "The microphone is blocked. Allow it in your browser, then try again.",
  "service-not-allowed": "Dictation isn't allowed on this device.",
  "audio-capture": "No microphone was found.",
  network: "Dictation needs a connection to the recognizer.",
  "no-speech": "Nothing was heard — try again, a little closer to the mic.",
};

function explain(code: string | undefined): string {
  if (!code) return "Dictation stopped unexpectedly.";
  return ERROR_TEXT[code] ?? `Dictation stopped: ${code}.`;
}

/**
 * Start listening. Throws when there is no recognizer at all, or when the
 * microphone is refused; everything after that arrives through the handlers.
 */
export async function startDictation(handlers: DictationHandlers): Promise<DictationSession> {
  if (isNative()) {
    const plugin = await nativePlugin();

    const { speechRecognition } = await plugin.checkPermissions();
    if (speechRecognition !== "granted") {
      const asked = await plugin.requestPermissions();
      if (asked.speechRecognition !== "granted") throw new Error("Dictation needs the microphone.");
    }

    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      void partial.then((handle) => handle.remove()).catch(() => undefined);
      void state.then((handle) => handle.remove()).catch(() => undefined);
      void errors.then((handle) => handle.remove()).catch(() => undefined);
      handlers.onEnd?.();
    };

    const partial = plugin.addListener("partialResults", (event) => {
      const text = event.matches?.[0] ?? event.accumulatedText;
      if (text) handlers.onPartial(text);
    });
    const state = plugin.addListener("listeningState", (event) => {
      if (event.status === "stopped") end();
    });
    const errors = plugin.addListener("error", (event) => {
      handlers.onError?.(explain(event.code));
      end();
    });

    // The native recognizer settles on its own when the speaker pauses, so the
    // promise resolving is what "a finished phrase" means.
    void plugin
      .start({ language: navigator.language || "en-US", partialResults: true, maxResults: 1 })
      .then((result) => {
        const text = result.matches?.[0];
        if (text) handlers.onFinal(text);
        end();
      })
      .catch((error: unknown) => {
        handlers.onError?.(error instanceof Error ? explain(error.message) : explain(undefined));
        end();
      });

    return {
      // A graceful stop first, and the forceful one as the backstop: some
      // Android recognizers keep the microphone open until the session is
      // torn down, and a button that says it stopped should have stopped.
      stop: () => {
        void plugin.stop().catch(() => undefined);
        void plugin.forceStop().catch(() => undefined);
      },
    };
  }

  const Recognition = browserRecognition();
  if (!Recognition) throw new Error("This device can't listen — typing still works.");

  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";

  let finished = false;
  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) handlers.onFinal(text.trim());
      else interim += text;
    }
    handlers.onPartial(interim.trim());
  };
  recognition.onerror = (event) => {
    // `no-speech` is what a quiet room sounds like; it is not worth a message
    // of its own, and the browser ends the session anyway.
    if (event.error && event.error !== "no-speech" && event.error !== "aborted") {
      handlers.onError?.(explain(event.error));
    }
  };
  recognition.onend = () => {
    if (finished) return;
    finished = true;
    handlers.onEnd?.();
  };

  try {
    recognition.start();
  } catch {
    throw new Error("The microphone is already in use.");
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // Stopping something that already ended is not a problem.
      }
    },
  };
}
