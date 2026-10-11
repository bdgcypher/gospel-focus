import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

/**
 * Haptic feedback for the riffling book.
 *
 * Everything is a no-op outside the native shell: a phone's browser may or may
 * not expose the vibration API, and a page riffle is not something to rattle a
 * desktop with. Every call is also fire-and-forget — haptics are decoration,
 * so a device without a vibrator (or with haptics switched off) should never
 * be able to break the draw.
 */
const enabled = () => Capacitor.isNativePlatform();

/** One page turning over: the lightest tick the device offers. */
export async function tapPageTurn(): Promise<void> {
  if (!enabled()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // No vibrator, or haptics unavailable — nothing to do.
  }
}

/** The book coming to rest on the drawn passage. */
export async function tapBookLanded(): Promise<void> {
  if (!enabled()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    // Ignore.
  }
}
