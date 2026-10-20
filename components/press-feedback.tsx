"use client";

import { useEffect } from "react";
import { tapControl } from "@/lib/haptics";

/**
 * The press, for fingers.
 *
 * The playful skin presses its raised controls in under `:active`, which a
 * mouse reports the moment its button goes down. A touchscreen is not so
 * prompt, and on some devices never reports it at all: the finger's contact
 * starts a gesture the browser is still deciding about, and by the time it is
 * called a tap the button has usually opened its sheet and gone. The control
 * therefore never looked pressed, and the only state a tap left behind was
 * `:hover` — which sticks to whatever was tapped last.
 *
 * This keeps a `data-pressed` attribute on the control under the finger for as
 * long as it is there. The stylesheet answers the attribute exactly as it
 * answers `:active` (see globals.css), so a finger gets the press a pointer
 * gets, and the press ends when the finger does.
 *
 * Only touch and pen begin a press here. A mouse already has `:active`, and
 * writing the attribute for it would double the state rather than add one.
 *
 * A press is also the moment the app's haptics fire (lib/haptics.ts): one light
 * tick under the finger, on whatever control took it. That is here rather than
 * in each control for the same reason the attribute is — one listener knows
 * every button and link there is, including the ones written after this file.
 * The exception is a control that plays its own rhythm, which says so with
 * `data-haptic="own"`: the word-search board ticks letter by letter as the
 * finger runs across it, and a tick from the press as well would double the
 * first letter (see components/word-search-page.tsx).
 */
const CONTROL = "button, a[href], [role='button']";

export function PressFeedback() {
  useEffect(() => {
    let held: HTMLElement | null = null;

    const release = () => {
      if (!held) return;
      delete held.dataset.pressed;
      held = null;
    };

    const controlAt = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null;
      const control = target.closest<HTMLElement>(CONTROL);
      if (!control) return null;
      // A disabled control is not offering anything to press.
      if (control.matches(":disabled, [aria-disabled='true']")) return null;
      return control;
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || !event.isPrimary) return;
      release();
      held = controlAt(event.target);
      if (!held) return;
      held.dataset.pressed = "true";
      if (!held.closest("[data-haptic='own']")) void tapControl();
    };

    // `pointerup` can arrive on another element when the finger has slid off,
    // which is why the listener is on the document rather than the control.
    // `pointercancel` is the browser taking the gesture for a scroll.
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerup", release, { passive: true });
    document.addEventListener("pointercancel", release, { passive: true });
    window.addEventListener("blur", release);

    return () => {
      release();
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, []);

  return null;
}
