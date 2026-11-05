"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Dragging a row of a short list by a grip, on a phone or with a mouse.
 *
 * The rows are the list's own children, so the thing being dragged and the thing
 * being measured are the same elements — no second description of the order to
 * keep in step with the one on screen. A drag reorders as it goes, the way a
 * list of playlists does: the row the finger crossed is the row it swaps with,
 * so the list under the hand is the list that will be saved.
 *
 * Pointer events rather than HTML's drag-and-drop: a touch screen has no notion
 * of starting a drag, and the grip is small enough that a press on it must not
 * scroll the list underneath. The grip therefore carries `touch-none`, and the
 * browser's own selection is turned off for the same press.
 *
 * The list listens once rather than every row offering its own handlers: a press
 * is a drag only if it landed on the grip (`data-reorder-handle`), and that is a
 * question the list can answer from the event's target. One set of handlers also
 * keeps a drag alive while the row under it is being replaced mid-drag.
 *
 * The place the drag has reached lives on the list element itself, in
 * `data-drag-from`. A pointer event needs the *current* place, and the handler
 * that saw the last move belongs to the render before it; the element is the one
 * thing that is the same across all of them, and it is where the rows are read
 * from anyway.
 *
 * Keyboard is not left out: `moveTo` is the plain move the arrow keys use, so a
 * row can be put in its place without a pointer at all.
 */
export interface Reorder<T extends HTMLElement> {
  /** Spread on the list whose direct children are the rows, in the order shown. */
  containerProps: {
    onPointerDown: (event: ReactPointerEvent<T>) => void;
    onPointerMove: (event: ReactPointerEvent<T>) => void;
    onPointerUp: (event: ReactPointerEvent<T>) => void;
    onPointerCancel: (event: ReactPointerEvent<T>) => void;
  };
  /** The row being dragged, by the index it has on screen now. */
  dragging: number | null;
  /** Move a row to another place, for a keyboard or any other plain request. */
  moveTo: (from: number, to: number) => void;
}

/** The attribute that holds the place a drag has reached, while it is happening. */
const DRAG_FROM = "dragFrom";

export function useReorder<T extends HTMLElement>(
  onMove: (from: number, to: number) => void
): Reorder<T> {
  const [dragging, setDragging] = useState<number | null>(null);

  /** The rows, in the order painted. */
  const rowsOf = (list: HTMLElement): HTMLElement[] => [...list.children] as HTMLElement[];

  /**
   * Which row the pointer at this height is over.
   *
   * Read off the rows themselves rather than remembered, because the list is
   * being reordered as the drag goes: the element under the finger changes
   * place, and the stored order is always the one painted.
   */
  const targetAt = (list: HTMLElement, y: number): number => {
    const all = rowsOf(list);
    for (let index = 0; index < all.length; index += 1) {
      const box = all[index].getBoundingClientRect();
      if (y < box.top + box.height / 2) return index;
    }
    return Math.max(0, all.length - 1);
  };

  /** The place a drag is at, or null when the pointer is not dragging a row. */
  const dragged = (list: HTMLElement): number | null => {
    const raw = list.dataset[DRAG_FROM];
    return raw === undefined ? null : Number(raw);
  };

  const stop = (list: HTMLElement) => {
    delete list.dataset[DRAG_FROM];
    setDragging(null);
  };

  return {
    dragging,
    moveTo: (index, to) => onMove(index, to),
    containerProps: {
      onPointerDown: (event: ReactPointerEvent<T>) => {
        // Only the grip starts a drag; the rest of the row is a link or a menu.
        const grip = (event.target as HTMLElement).closest<HTMLElement>("[data-reorder-handle]");
        if (!grip) return;
        // The left button, or a finger; a right press belongs to the browser.
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const list = event.currentTarget;
        const index = rowsOf(list).findIndex((row) => row.contains(grip));
        if (index < 0) return;
        event.preventDefault();
        list.setPointerCapture(event.pointerId);
        list.dataset[DRAG_FROM] = String(index);
        setDragging(index);
      },
      onPointerMove: (event: ReactPointerEvent<T>) => {
        const list = event.currentTarget;
        const from = dragged(list);
        if (from === null) return;
        const to = targetAt(list, event.clientY);
        if (to === from) return;
        onMove(from, to);
        list.dataset[DRAG_FROM] = String(to);
        setDragging(to);
      },
      onPointerUp: (event: ReactPointerEvent<T>) => stop(event.currentTarget),
      onPointerCancel: (event: ReactPointerEvent<T>) => stop(event.currentTarget),
    },
  };
}
