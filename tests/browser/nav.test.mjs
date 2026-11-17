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

  // --- the bar's two widths -------------------------------------------------
  // A phone's bar is the status lights and nothing else: the logo sat in the
  // corner taking the first of their places, so it is out of the way and the row
  // spreads the lights evenly across the bar. A wide screen brings the logo back
  // with the sections between it and the lights.
  await page.goto(`${base}/`, 2400);
  const narrowBar = await page.evaluate(`(() => {
    const row = document.querySelector(".app-header-row");
    const logo = document.querySelector(".app-home-link");
    const lights = [...row.querySelectorAll(".app-status-tray > a")].map((node) => node.getBoundingClientRect());
    return {
      logo: Math.round(logo.getBoundingClientRect().width),
      clipped: getComputedStyle(logo).clip !== "auto" && getComputedStyle(logo).overflow === "hidden",
      lights: lights.length,
      gaps: lights.slice(1).map((box, at) => Math.round(box.left - lights[at].right)),
      nav: getComputedStyle(document.querySelector(".app-nav-top")).display,
    };
  })()`);
  check(
    "a phone's bar is the status lights, with the logo out of the way",
    narrowBar.clipped && narrowBar.logo <= 1 && narrowBar.nav === "none",
    `${narrowBar.logo}px / clipped ${narrowBar.clipped} / nav ${narrowBar.nav}`
  );
  check(
    "spread evenly across it",
    narrowBar.lights >= 3 && Math.max(...narrowBar.gaps) - Math.min(...narrowBar.gaps) <= 2,
    `${narrowBar.lights} lights · gaps ${narrowBar.gaps.join(", ")}`
  );

  // The hub's two day cards — the goal and the verse — are one above the other
  // on a phone and a half each once there is width for both, which the laptop
  // check below reads.
  const dayCards = () =>
    page.evaluate(`(() => {
      const sections = [...document.querySelectorAll("main section")];
      const goal = sections.find((node) =>
        node.querySelector('[role="progressbar"]') || node.textContent.includes("Create daily study goal")
      );
      const verse = sections.find((node) => node.textContent.includes("Verse of the day"));
      if (!goal || !verse) return null;
      const a = goal.getBoundingClientRect();
      const b = verse.getBoundingClientRect();
      return {
        main: Math.round(document.querySelector("main").getBoundingClientRect().width),
        goal: { top: Math.round(a.top), left: Math.round(a.left), width: Math.round(a.width), bottom: Math.round(a.bottom) },
        verse: { top: Math.round(b.top), left: Math.round(b.left), width: Math.round(b.width) },
      };
    })()`);

  const phonesDayCards = await dayCards();
  check(
    "a phone stacks the goal and the verse, one above the other",
    Boolean(phonesDayCards) &&
      phonesDayCards.verse.top >= phonesDayCards.goal.bottom - 1 &&
      Math.abs(phonesDayCards.verse.left - phonesDayCards.goal.left) <= 1 &&
      phonesDayCards.verse.width === phonesDayCards.goal.width,
    phonesDayCards ? JSON.stringify(phonesDayCards).slice(0, 120) : "no cards"
  );

  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.sleep(400);
  const wideBar = await page.evaluate(`(() => {
    const logo = document.querySelector(".app-home-link");
    const wordmark = document.querySelector(".app-wordmark");
    return {
      logo: Math.round(logo.getBoundingClientRect().width),
      clipped: getComputedStyle(logo).clip !== "auto",
      wordmark: Math.round(wordmark.getBoundingClientRect().width),
      nav: getComputedStyle(document.querySelector(".app-nav-top")).display,
    };
  })()`);
  check(
    "a wide bar brings the logo back for the sections to sit between",
    !wideBar.clipped && wideBar.logo > 100 && wideBar.wordmark > 0 && wideBar.nav === "flex",
    `${wideBar.logo}px / wordmark ${wideBar.wordmark}px / nav ${wideBar.nav}`
  );

  // The page column is the window, bar and all, up to a 1080p screen; only a
  // display wider than that holds a max width, so the app does not stretch
  // across an ultrawide.
  const column = () =>
    page.evaluate(`(() => ({
      row: Math.round(document.querySelector(".app-header-row").getBoundingClientRect().width),
      main: Math.round(document.querySelector("main").getBoundingClientRect().width),
      viewport: window.innerWidth,
    }))()`);

  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1392,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.sleep(300);
  const laptop = await column();
  check(
    "a laptop's pages fill the window, bar included",
    laptop.viewport - laptop.main <= 2 && laptop.viewport - laptop.row <= 2,
    `${laptop.row} row / ${laptop.main} main of ${laptop.viewport}`
  );

  const laptopsDayCards = await dayCards();
  check(
    "and the goal and the verse take a half each",
    Boolean(laptopsDayCards) &&
      laptopsDayCards.verse.left >= laptopsDayCards.goal.left + laptopsDayCards.goal.width - 1 &&
      Math.abs(laptopsDayCards.verse.top - laptopsDayCards.goal.top) <= 2 &&
      Math.abs(laptopsDayCards.verse.width - laptopsDayCards.goal.width) <= 2 &&
      laptopsDayCards.goal.width < laptopsDayCards.main / 2,
    laptopsDayCards ? JSON.stringify(laptopsDayCards).slice(0, 120) : "no cards"
  );

  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 2560,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.sleep(300);
  const ultrawide = await column();
  check(
    "and an ultrawide holds a max width rather than running the whole screen",
    ultrawide.main === 1920 && ultrawide.row === 1920,
    `${ultrawide.row} row / ${ultrawide.main} main of ${ultrawide.viewport}`
  );
  await page.send("Emulation.clearDeviceMetricsOverride", {});
}
