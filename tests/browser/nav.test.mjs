import { reset } from "./helpers.mjs";

export const name = "sections";

/**
 * The row of sections, swept by a finger.
 *
 * The four tabs are neighbours in one row (components/nav-swipe.tsx), and a
 * finger across a section page turns to the one beside it. This drives that
 * with the browser's own pointer events: a slow drag that still turns the page,
 * a drag that changes its mind halfway and turns the way it ends up going, and
 * one that comes back to where it began and asks for nothing.
 */

/**
 * A finger on the page: one or more legs, each carrying it to a point.
 *
 * The moves are spaced like frames, so the page reads the gesture as a thumb
 * makes it — slowly when the leg is slow, and crossing back through the
 * starting point when a leg runs the other way.
 */
const drag = async (page, legs, { release = true, y = 480 } = {}) => {
  await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const fire = (type, x) => document.body.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: ${y},
    }));
    const legs = ${JSON.stringify(legs)};
    fire("pointerdown", legs[0].from);
    for (const leg of legs) {
      for (let step = 1; step <= leg.steps; step += 1) {
        fire("pointermove", leg.from + ((leg.to - leg.from) * step) / leg.steps);
        await sleep(leg.pause);
      }
    }
    ${release ? 'fire("pointerup", legs[legs.length - 1].to);' : ""}
    return true;
  })()`);
};

/** Lift the finger where the last leg ended. */
const letGo = async (page, x, y = 480) => {
  await page.evaluate(`(() => {
    document.body.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: ${x},
      clientY: ${y},
    }));
    return true;
  })()`);
};

/** What the page is showing, mid-gesture or after it. */
const state = (page) =>
  page.evaluate(`(() => {
    const root = document.documentElement;
    const preview = document.querySelector("[data-nav-preview]");
    return {
      path: location.pathname,
      dragging: root.hasAttribute("data-nav-dragging"),
      slide: root.style.getPropertyValue("--nav-slide"),
      peek: preview ? preview.getAttribute("data-nav-preview-for") : null,
    };
  })()`);

export async function run({ page, check, base }) {
  await reset(page, base);

  // --- a slow drag is still a swipe ---------------------------------------
  // Nothing about the turn is read from the finger's speed, so a deliberate,
  // unhurried drag carries the page just as a flick does.
  await page.goto(`${base}/study/`, 2400);
  await drag(page, [{ from: 330, to: 120, steps: 12, pause: 40 }], { release: false });
  const midSlow = await state(page);
  check(
    "a slow drag carries the page with the finger",
    midSlow.dragging && midSlow.slide.startsWith("-") && midSlow.peek === "/games",
    JSON.stringify(midSlow)
  );
  await letGo(page, 120);
  await page.sleep(1800);
  const slowLanded = await state(page);
  check(
    "and letting go opens the section beside it",
    slowLanded.path === "/games/" && !slowLanded.dragging && !slowLanded.peek,
    JSON.stringify(slowLanded)
  );

  // --- the finger decides the side ----------------------------------------
  // Started forward, then carried back through the point it began at: the
  // page peeking changes with it, and so does the page the release opens.
  await page.goto(`${base}/study/`, 2400);
  await drag(
    page,
    [
      { from: 330, to: 170, steps: 8, pause: 12 },
      { from: 170, to: 430, steps: 10, pause: 20 },
    ],
    { release: false }
  );
  const flipped = await state(page);
  check(
    "changing direction peeks the page the other way",
    flipped.dragging && flipped.peek === "/",
    JSON.stringify(flipped)
  );
  await letGo(page, 430);
  await page.sleep(1800);
  const reversed = await state(page);
  check(
    "and letting go goes that way",
    reversed.path === "/" && !reversed.peek,
    JSON.stringify(reversed)
  );

  // --- back to where it began ---------------------------------------------
  // A drag that returns to its starting point asked for nothing: the page
  // springs back and the section stays.
  await page.goto(`${base}/study/`, 2400);
  await drag(page, [
    { from: 330, to: 170, steps: 8, pause: 12 },
    { from: 170, to: 330, steps: 8, pause: 20 },
  ]);
  await page.sleep(1200);
  const restored = await state(page);
  check(
    "a swipe brought back to its start turns nothing",
    restored.path === "/study/" && !restored.dragging && restored.slide === "" && !restored.peek,
    JSON.stringify(restored)
  );
}
