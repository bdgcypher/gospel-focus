package app.gospelfocus.app;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * How the gate is drawn: the reader's light or dark, and their focused or
 * playful skin.
 *
 * Neither half of that choice exists on the native side. Light or dark is
 * next-themes' (`app/providers.tsx`), following the device until the reader picks
 * otherwise, and the style is a preference of the app's own
 * (`lib/preferences.ts`). Both live in the WebView's storage, which the service
 * cannot read — and the gate is drawn when the app is not in front, so it cannot
 * ask. So the page writes the answer here through FocusLockPlugin whenever it
 * changes, and the service reads it while building the gate.
 *
 * Written rather than defaulted because "no answer yet" is a real case: a build
 * from before this shipped, or a reader who has never opened the app since
 * updating. Until something is written the gate keeps its old behaviour, which is
 * to follow the device's own night mode in the focused skin (see
 * FocusAccessibilityService.palette).
 */
final class GateAppearance {

    /** The preferences file this half reads. */
    private static final String PREFS = "gate_appearance";

    private static final String DARK = "dark";
    private static final String PLAYFUL = "playful";
    private static final String FOLLOW = "follow";

    private GateAppearance() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Whether the page has said which theme it is in — false on a fresh install. */
    static boolean known(Context context) {
        return prefs(context).contains(DARK);
    }

    /** Whether the reader's theme is dark. Meaningless until `known` is true. */
    static boolean dark(Context context) {
        return prefs(context).getBoolean(DARK, false);
    }

    /**
     * Whether the reader's theme is "follow the device" rather than a choice.
     *
     * It matters because the device can change while the app is closed — that is
     * exactly what a system night mode does at sunset — and a gate drawn from the
     * last value the page wrote would be a light card on a dark screen. When this is
     * true the service reads the device's own night mode instead of `dark`.
     */
    static boolean followsDevice(Context context) {
        return prefs(context).getBoolean(FOLLOW, false);
    }

    /** Whether the reader wears the playful skin rather than the focused one. */
    static boolean playful(Context context) {
        return prefs(context).getBoolean(PLAYFUL, false);
    }

    static void write(Context context, boolean dark, boolean playful, boolean follow) {
        prefs(context)
            .edit()
            .putBoolean(DARK, dark)
            .putBoolean(PLAYFUL, playful)
            .putBoolean(FOLLOW, follow)
            .apply();
    }
}
