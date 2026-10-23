"use client";

import { useEffect, useState } from "react";
import { dayKey } from "@/lib/daily";
import { useFocus } from "@/lib/focus";
import { focusLockSupported, syncFocusDevice } from "@/lib/native-focus";
import { studyProgress, useStudy } from "@/lib/study";

/**
 * Hands the lock to the device whenever it changes.
 *
 * The accessibility service is the only thing that can stand between the reader
 * and an app, and it runs from its own copy of the state — so this keeps that copy
 * exactly as the app's own stores have it: which packages are held, whether the
 * lock is set up, the day the goal was met, the day it was re-armed, and when a
 * bypass ends. Mounted once in the app chrome (components/app-chrome.tsx), so it
 * holds whichever screen the reader is on.
 *
 * Days rather than a single armed flag on purpose. The service can be running
 * when the app is not — that is the point of it — and an armed flag written at
 * bedtime would still say "earned" the next morning, leaving the gate down until
 * the reader happened to open Gospel Focus. With the day keys, yesterday stops
 * matching at midnight and the lock arms itself.
 *
 * Invisible and quiet: nothing here draws, nothing runs off Android, and a failed
 * write is not reported because the page's own state is still true — what the
 * reader is told about blocking is the permission row on /focus, which reads the
 * device rather than trusting this.
 *
 * The dependency on `done` rather than on the whole study state is deliberate:
 * minutes tick every second while a session runs, and none of those ticks change
 * what the lock needs to know. A boolean only writes when the day's goal is
 * crossed — which is exactly the moment the gate opens.
 */
export function FocusSync() {
  const focus = useFocus();
  const study = useStudy();
  const done = studyProgress(study).done;
  // A goal is what opens the lock, so with none chosen nothing is held: there
  // would be no way to earn the day, and the gate would be a trap rather than a
  // nudge. The page says the same thing where the picker is.
  const target = study.goalMinutes;

  // A phone can sit in a pocket across midnight with the day already turned over
  // in storage; looking at it again is when this should agree. (The study store
  // rolls the day on the same event, so `done` is usually enough on its own — this
  // also covers a reader who changed the lock on another screen before the app was
  // brought back.)
  const [look, setLook] = useState(0);
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) setLook((count) => count + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!focusLockSupported()) return;

    void syncFocusDevice({
      packages: focus.apps.filter((app) => app.package).map((app) => app.package),
      // With no goal there is no way to earn the day, so the native side is told
      // there is no lock at all rather than one that can never open.
      lockOn: focus.setUp && target > 0,
      earnedDay: done ? dayKey() : "",
      relockedDay: focus.relockedDay,
      bypassUntil: focus.overrideUntil ?? 0,
    });
  }, [focus, done, target, look]);

  return null;
}
