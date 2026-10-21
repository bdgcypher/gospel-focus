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
 * The *tick* is the other half of this, and it is deliberately a different
 * moment (lib/haptics.ts): one soft tick when the control is activated, not when
 * it is touched. A finger goes down on a button on its way to somewhere else all
 * the time — the first touch of a scroll, a page swipe started well inside the
 * bar — and a buzz there says "you pressed this" about a press the reader never
 * made and the browser never completed. A `click` only arrives when the gesture
 * really was a press on that control: sliding off it, scrolling with it, or
 * dragging the page by it all cancel it. So the look answers the finger straight
 * away (the attribute) and the tick answers the activation — and a control
 * activated from a keyboard ticks too, because that is a press that landed.
 *
 * It is here rather than in each control for the same reason the attribute is —
 * one listener knows every button and link there is, including the ones written
 * after this file. The exception is a control that plays its own rhythm, which
 * says so with `data-haptic="own"`: the bottom bar's links tick when their mark
 * comes away (components/nav-bar.tsx), and the word-search board ticks letter by
 * letter as the finger runs across it (components/word-search-page.tsx).
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
    };

    const onClick = (event: MouseEvent) => {
      const control = controlAt(event.target);
      if (!control) return;
      if (control.closest("[data-haptic='own']")) return;
      void tapControl();
    };

    // `pointerup` can arrive on another element when the finger has slid off,
    // which is why the listener is on the document rather than the control.
    // `pointercancel` is the browser taking the gesture for a scroll.
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerup", release, { passive: true });
    document.addEventListener("pointercancel", release, { passive: true });
    document.addEventListener("click", onClick);
    window.addEventListener("blur", release);

    return () => {
      release();
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", release);
      document.removeEventListener("click", onClick);
      window.removeEventListener("blur", release);
    };
  }, []);

  return null;
}
