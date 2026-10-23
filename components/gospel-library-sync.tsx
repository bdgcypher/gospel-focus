"use client";

import { useEffect } from "react";
import { dayKey } from "@/lib/daily";
import { gospelStudySupported, readGospelLibrarySeconds } from "@/lib/native-study";
import { addStudySeconds, readStudy } from "@/lib/study";

/**
 * Puts the reader's Gospel Library reading on the day's study goal.
 *
 * The minutes themselves are counted on the device by the accessibility service
 * (GospelStudy.java), because that is the only thing in the app that can see
 * another app at all. What is left is the decision the service cannot make: how
 * much of what it counted belongs in the goal. That is made here, and it is made
 * from the study store rather than from a second idea of the day, so the bar, the
 * streak, the gems and the Focus Lock's gate all see the same minutes.
 *
 * Three rules, which together are the reader's own description of it:
 *
 * - **Nothing without a goal.** No goal is nothing to count towards, so the
 *   total is left where it is — not thrown away, just unread (see below).
 * - **Only up to the goal.** Whatever the day still has room for is credited and
 *   no more, so studying in the Gospel Library cannot overshoot the bar. Once the
 *   goal is met this stops crediting, and a new day starts it again from zero.
 * - **A raised goal picks up where the old one stopped.** The marker below records
 *   how many seconds have been *consumed*, not how many were counted, so the rest
 *   of the Gospel Library time already spent is still there to credit if the
 *   reader adds five minutes to their goal that afternoon. Nothing is thrown away
 *   at the moment the goal is met; it simply stops being enough.
 *
 * The marker is per day, in storage rather than in memory, because the flush runs
 * on launch and on every return to the app: without it, time already credited
 * would be credited again each time the reader came back. It is its own key for
 * the same reason the study store's is — it is a fact about what has been handed
 * over, not about how long the reader studied.
 *
 * Only on Android, where the count exists; silent everywhere else. The service
 * has to be on for there to be anything to read, which is the same accessibility
 * grant Focus Lock asks for.
 */

const KEY = "gospel-focus:gospel-library:v1";

/** How much of the device's total has been handed to the study store. */
interface Credit {
  /** The local day the count belongs to. */
  day: string;
  /** Seconds of the device's total already credited — consumed, not counted. */
  consumed: number;
}

function readCredit(): Credit {
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Credit>;
    return {
      day: typeof stored.day === "string" ? stored.day : "",
      consumed:
        typeof stored.consumed === "number" && Number.isFinite(stored.consumed) && stored.consumed > 0
          ? Math.round(stored.consumed)
          : 0,
    };
  } catch {
    return { day: "", consumed: 0 };
  }
}

function writeCredit(credit: Credit): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(credit));
  } catch {
    // Storage can be unavailable (private mode, full quota). The minutes are
    // still counted by the device; the worst case is crediting them again.
  }
}

/**
 * Credit what has been counted since the last flush, as far as the goal reaches.
 *
 * Read the study state *after* asking the device, so a minute the reader spent in
 * the app while the call was in flight is already counted against the goal rather
 * than credited twice.
 */
async function flush(): Promise<void> {
  if (!gospelStudySupported()) return;

  const counted = await readGospelLibrarySeconds();
  if (counted <= 0) return;

  const study = readStudy();
  const goal = study.goalMinutes * 60;
  if (goal <= 0) return;

  const today = dayKey();
  const credit = readCredit();
  const consumed = credit.day === today ? credit.consumed : 0;
  const uncredited = counted - consumed;
  if (uncredited <= 0) return;

  const room = goal - study.seconds;
  if (room <= 0) return;

  const seconds = Math.min(uncredited, room);
  if (seconds <= 0) return;

  addStudySeconds(seconds);
  writeCredit({ day: today, consumed: consumed + seconds });
}

/**
 * Flushes on launch and whenever the app comes back to the front.
 *
 * The second is the one that matters: the reader leaves for the Gospel Library,
 * reads, and comes back — which is exactly when the app is visible again. The
 * service has banked that stretch as the other app took the front, so by the time
 * this runs the number is there to read.
 */
export function GospelLibrarySync() {
  useEffect(() => {
    if (!gospelStudySupported()) return;

    void flush();

    const onVisible = () => {
      if (!document.hidden) void flush();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
